-- Veterinaria, Fase 5 · parte 1: dictado por voz en la consulta (carril A).
--
-- El médico graba su dictado en el navegador; el servidor lo transcribe (ElevenLabs
-- Scribe) y arma un BORRADOR del SOAP con Claude. Nada se firma solo: el médico
-- revisa, corrige y firma como siempre.
--
--  · El audio NO se guarda por omisión: se borra al terminar la transcripción. Opción
--    por negocio (veterinaria_ajustes.dictado_conservar_audio) para conservarlo 30 días
--    ligado a la consulta, con aviso visible.
--  · Antes de grabar, el médico confirma que le avisó al dueño (queda en el registro).
--  · Tope mensual de minutos por negocio, que cambia SOLO la plataforma (negocios.
--    dictado_minutos_mes; por omisión el del plan o 300) con contador y aviso al 80 %.
--  · Registro de uso por consulta (vet_dictados): quién, cuándo, cuántos minutos. NO guarda
--    ni el audio ni la transcripción ni el borrador.
--  · Permisos nuevos: «Usar dictado» y «Atender teleconsultas» (apagados salvo admin y
--    médico designado).
--
-- Reversa: borrar vet_dictados, las columnas nuevas, las funciones vet_dictado_* y el
-- bucket dictados-audio (vacío).

-- ── 0. Ayuda para las redes de las tablas nuevas (se borra al final) ──
create or replace function public._vet_redes(p_tabla text, p_lectura text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  execute format('create index %I on public.%I (negocio_id)', p_tabla || '_negocio_idx', p_tabla);
  execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', p_tabla);
  execute format('alter table public.%I enable row level security', p_tabla);
  execute format('create policy %I on public.%I as restrictive for all to authenticated using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro())) with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))', p_tabla || '_negocio', p_tabla);
  execute format('create policy %I on public.%I for all to peludesk_definer using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()))', p_tabla || '_negocio_definer', p_tabla);
  execute format('create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer with check ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_ins', p_tabla);
  execute format('create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_upd', p_tabla);
  execute format('create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible()))', p_tabla || '_escritura_del', p_tabla);
  execute format('create policy %I on public.%I for select to authenticated using (%s)', p_tabla || '_select', p_tabla, p_lectura);
  execute format('revoke all on public.%I from anon, authenticated', p_tabla);
  execute format('grant select on public.%I to authenticated', p_tabla);
  execute format('grant select, insert, update, delete on public.%I to peludesk_definer', p_tabla);
  execute format('create trigger exigir_modulo before insert or update on public.%I for each row execute function public.exigir_modulo_tabla(%L)', p_tabla, 'veterinaria');
end;
$$;
revoke execute on function public._vet_redes(text, text) from public, anon, authenticated;

-- ── 1. Permisos ──────────────────────────────────────────────────────
insert into public.permisos_catalogo (clave, etiqueta, modulos, orden) values
  ('usar_dictado', 'Usar dictado', '{veterinaria}', 40),
  ('atender_teleconsultas', 'Atender teleconsultas', '{veterinaria}', 41);

-- ── 2. Columnas ──────────────────────────────────────────────────────
-- Tope de minutos de dictado al mes: el del negocio (solo la plataforma lo cambia) o el de su plan.
alter table public.negocios add column dictado_minutos_mes integer check (dictado_minutos_mes is null or dictado_minutos_mes >= 0);
alter table public.planes add column dictado_minutos_mes integer not null default 300 check (dictado_minutos_mes >= 0);
-- Opción del negocio: conservar el audio 30 días (apagada por omisión).
alter table public.veterinaria_ajustes add column dictado_conservar_audio boolean not null default false;
-- La consulta dice si fue presencial o por telemedicina.
alter table public.vet_consultas add column modalidad text not null default 'presencial' check (modalidad in ('presencial', 'telemedicina'));

do $$
declare
  v_def text;
  v_nuevo text;
begin
  -- validar_negocio: el tope de dictado es de la plataforma, igual que el de Maps.
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'validar_negocio';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def, 'or new.maps_consultas_mes is distinct from old.maps_consultas_mes)',
                     E'or new.maps_consultas_mes is distinct from old.maps_consultas_mes\n          or new.dictado_minutos_mes is distinct from old.dictado_minutos_mes)');
  if v_nuevo = v_def then
    raise exception 'validar_negocio: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;
end $$;

-- ── 3. Bucket privado del audio (sin políticas: lo sube y lo firma el servidor) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dictados-audio', 'dictados-audio', false, 26214400,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/aac', 'video/webm', 'video/mp4'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

-- ── 4. Registro de uso del dictado ───────────────────────────────────
create table public.vet_dictados (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  consulta_id uuid not null references public.vet_consultas(id),
  profile_id uuid references auth.users(id) on delete set null default auth.uid(),
  estado text not null default 'subiendo' check (estado in ('subiendo', 'transcribiendo', 'listo', 'error')),
  mes date not null default date_trunc('month', public.fecha_negocio())::date,
  segundos_declarados integer not null check (segundos_declarados between 1 and 1200),
  segundos integer check (segundos is null or segundos between 0 and 1200),
  minutos_cobrados integer check (minutos_cobrados is null or minutos_cobrados >= 0),
  aviso_dueno_at timestamptz not null default now(),
  stt_proveedor text,
  stt_modelo text,
  ia_modelo text,
  caracteres integer,
  audio_path text,
  audio_vence_at timestamptz,
  audio_borrado_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index vet_dictados_consulta_idx on public.vet_dictados (consulta_id, created_at desc);
create index vet_dictados_mes_idx on public.vet_dictados (negocio_id, mes);
create index vet_dictados_audio_idx on public.vet_dictados (audio_vence_at) where audio_path is not null;
select public._vet_redes('vet_dictados', '(select public.vet_puede(''usar_dictado''))');

-- ── 5. Funciones ─────────────────────────────────────────────────────

-- Minutos al mes que le tocan a ESTE negocio.
create or replace function public.vet_dictado_tope()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    n.dictado_minutos_mes,
    (select p.dictado_minutos_mes from public.planes p where p.id = n.plan_id),
    (select p.dictado_minutos_mes from public.planes p where p.clave = 'completo' and p.deleted_at is null limit 1),
    300)
  from public.negocios n
  where n.id = public.negocio_actual();
$$;

-- Lo gastado este mes: los dictados terminados, más los que están en curso (30 min de gracia).
create or replace function public.vet_dictado_usados()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(case when d.estado = 'listo' then coalesce(d.minutos_cobrados, 0)
                           when d.estado in ('subiendo', 'transcribiendo') and d.created_at > now() - interval '30 minutes' then ceil(d.segundos_declarados / 60.0)
                           else 0 end), 0)::integer
  from public.vet_dictados d
  where d.negocio_id = public.negocio_actual() and d.mes = date_trunc('month', public.fecha_negocio())::date and d.deleted_at is null;
$$;

-- El panel del dictado: contador, aviso y opción de conservar el audio.
create or replace function public.vet_dictado_estado()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tope integer := public.vet_dictado_tope();
  v_usados integer := public.vet_dictado_usados();
begin
  if not public.vet_puede('usar_dictado') then
    return jsonb_build_object('permitido', false);
  end if;
  return jsonb_build_object(
    'permitido', true, 'tope', v_tope, 'usados', v_usados, 'restantes', greatest(v_tope - v_usados, 0),
    'cerca', v_tope > 0 and v_usados >= v_tope * 0.8, 'agotado', v_usados >= v_tope,
    'conservar_audio', coalesce((select a.dictado_conservar_audio from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null), false));
end;
$$;

-- Empieza un dictado: comprueba permiso, consulta en borrador, aviso al dueño y que quepa en el mes.
create or replace function public.vet_dictado_iniciar(p_consulta uuid, p_segundos integer, p_aviso boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_tope integer := public.vet_dictado_tope();
  v_usados integer := public.vet_dictado_usados();
  v_id uuid;
begin
  if not public.vet_puede('usar_dictado') then
    raise exception 'Dictar es de un médico veterinario, de admin o de quien tenga «Usar dictado».' using errcode = '42501';
  end if;
  if not public.vet_puede('atender_consultas') then
    raise exception 'Para dictar en una consulta hace falta poder atenderla: «Atender consultas».' using errcode = '42501';
  end if;
  if not coalesce(p_aviso, false) then
    raise exception 'Confirma que le avisaste al dueño que se va a grabar audio de la consulta.';
  end if;
  if p_segundos is null or p_segundos < 1 or p_segundos > 1200 then
    raise exception 'Un dictado dura de 1 segundo a 20 minutos.';
  end if;
  select c.id, c.estado into v_c from public.vet_consultas c
   where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'borrador' then
    raise exception 'Solo se dicta en una consulta en borrador: la firmada ya no se edita.';
  end if;
  if v_usados + ceil(p_segundos / 60.0) > v_tope then
    raise exception 'Ya no alcanzan los minutos de dictado de este mes (llevas % de %). Escribe a mano o pídele a PeluDesk más minutos.', v_usados, v_tope
      using errcode = '53400';
  end if;
  insert into public.vet_dictados (consulta_id, segundos_declarados) values (p_consulta, p_segundos) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.vet_dictado_marcar_transcribiendo(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('usar_dictado') then
    raise exception 'Dictar es de un médico veterinario, de admin o de quien tenga «Usar dictado».' using errcode = '42501';
  end if;
  update public.vet_dictados set estado = 'transcribiendo'
   where id = p_id and negocio_id = public.negocio_actual() and estado = 'subiendo' and (profile_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'Ese dictado ya no está disponible.';
  end if;
end;
$$;

-- Cierra el dictado: cobra los minutos REALES (los que midió el transcriptor, con un mínimo de 1)
-- y conserva el audio solo si el negocio lo pidió.
create or replace function public.vet_dictado_listo(p_id uuid, p_segundos integer, p_caracteres integer, p_stt text, p_stt_modelo text, p_ia text, p_audio_path text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d record;
  v_conservar boolean;
  v_seg integer;
  v_min integer;
begin
  if not public.vet_puede('usar_dictado') then
    raise exception 'Dictar es de un médico veterinario, de admin o de quien tenga «Usar dictado».' using errcode = '42501';
  end if;
  select d.* into v_d from public.vet_dictados d
   where d.id = p_id and d.negocio_id = public.negocio_actual() and d.estado in ('subiendo', 'transcribiendo') and (d.profile_id = auth.uid() or public.is_admin());
  if v_d.id is null then
    raise exception 'Ese dictado ya no está disponible.';
  end if;
  v_conservar := coalesce((select a.dictado_conservar_audio from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null), false);
  v_seg := least(greatest(coalesce(p_segundos, v_d.segundos_declarados), 0), 1200);
  v_min := greatest(ceil(v_seg / 60.0)::integer, 1);
  update public.vet_dictados
     set estado = 'listo', segundos = v_seg, minutos_cobrados = v_min, caracteres = p_caracteres,
         stt_proveedor = p_stt, stt_modelo = p_stt_modelo, ia_modelo = p_ia,
         audio_path = case when v_conservar then p_audio_path end,
         audio_vence_at = case when v_conservar and p_audio_path is not null then now() + interval '30 days' end,
         audio_borrado_at = case when not v_conservar then now() end
   where id = p_id;
  return v_min;
end;
$$;

create or replace function public.vet_dictado_error(p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('usar_dictado') then
    raise exception 'Dictar es de un médico veterinario, de admin o de quien tenga «Usar dictado».' using errcode = '42501';
  end if;
  update public.vet_dictados
     set estado = 'error', error = left(coalesce(p_error, 'Error'), 300), audio_path = null, audio_borrado_at = now()
   where id = p_id and negocio_id = public.negocio_actual() and estado in ('subiendo', 'transcribiendo') and (profile_id = auth.uid() or public.is_admin());
end;
$$;

-- Registro de uso de UNA consulta.
create or replace function public.vet_dictado_uso_consulta(p_consulta uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('usar_dictado') then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', d.id, 'cuando', d.created_at, 'estado', d.estado, 'minutos', d.minutos_cobrados, 'segundos', d.segundos,
      'quien', coalesce(p.nombre_completo, 'Sin nombre'), 'audio', d.audio_path is not null, 'audio_vence_at', d.audio_vence_at) order by d.created_at)
    from public.vet_dictados d left join public.profiles p on p.id = d.profile_id
    where d.consulta_id = p_consulta and d.negocio_id = public.negocio_actual() and d.deleted_at is null), '[]'::jsonb);
end;
$$;

-- La ruta del audio conservado (solo quien puede leer el expediente y dictar).
create or replace function public.vet_dictado_audio_ruta(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_d record;
begin
  if not (public.vet_puede('usar_dictado') and public.vet_puede_leer()) then
    raise exception 'Escuchar un dictado guardado es de quien puede dictar y ver el expediente.' using errcode = '42501';
  end if;
  select d.audio_path, d.audio_vence_at, c.perro_id into v_d from public.vet_dictados d join public.vet_consultas c on c.id = d.consulta_id
   where d.id = p_id and d.negocio_id = public.negocio_actual() and d.deleted_at is null;
  if v_d.audio_path is null or v_d.audio_vence_at < now() then
    raise exception 'Ese audio ya no se conserva.';
  end if;
  perform public.vet_registrar_lectura(v_d.perro_id, 'consulta', p_id);
  return v_d.audio_path;
end;
$$;

-- Los nombres del catálogo (propio del negocio y compartido) para sugerir diagnósticos.
create or replace function public.vet_diagnosticos_nombres(p_especie text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('usar_dictado') then
    raise exception 'Dictar es de un médico veterinario, de admin o de quien tenga «Usar dictado».' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', x.id, 'origen', x.origen, 'nombre', x.nombre) order by x.nombre)
    from (
      select d.id, 'catalogo'::text as origen, d.nombre from public.vet_diagnosticos d
       where d.deleted_at is null and (p_especie is null or p_especie = any (d.especies))
      union all
      select n.id, 'negocio', n.nombre from public.vet_diagnosticos_negocio n
       where n.negocio_id = public.negocio_actual() and n.deleted_at is null
    ) x), '[]'::jsonb);
end;
$$;

-- Opción del negocio: conservar el audio 30 días.
create or replace function public.guardar_veterinaria_dictado(p_conservar boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Veterinaria está apagada en este negocio.';
  end if;
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Cambiar esta opción es de admin o de quien tenga «Configuración del negocio».' using errcode = '42501';
  end if;
  if exists (select 1 from public.veterinaria_ajustes where negocio_id = public.negocio_actual() and deleted_at is null) then
    update public.veterinaria_ajustes set dictado_conservar_audio = coalesce(p_conservar, false)
     where negocio_id = public.negocio_actual() and deleted_at is null;
  else
    insert into public.veterinaria_ajustes (dictado_conservar_audio) values (coalesce(p_conservar, false));
  end if;
end;
$$;

-- ── 6. Cron: audios vencidos (cruza negocios: de postgres y en la lista blanca) ──
create or replace function public.vet_dictado_audios_vencidos()
returns table (id uuid, negocio_id uuid, audio_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  return query select d.id, d.negocio_id, d.audio_path from public.vet_dictados d
   where d.audio_path is not null and d.audio_vence_at < now() order by d.audio_vence_at limit 200;
end;
$$;

create or replace function public.vet_dictado_audios_marcar(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  update public.vet_dictados set audio_path = null, audio_borrado_at = now() where id = any (p_ids) and audio_path is not null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- ── 7. Plataforma: consumo y tope por negocio ────────────────────────
create or replace function public.plataforma_dictado_resumen(p_mes date)
returns table (negocio_id uuid, nombre text, slug text, plan text, dictados bigint, minutos bigint, tope integer, propio boolean, conserva_audio boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
  select n.id, n.nombre, n.slug, n.plan,
    count(d.id) filter (where d.estado = 'listo'),
    coalesce(sum(d.minutos_cobrados) filter (where d.estado = 'listo'), 0)::bigint,
    coalesce(n.dictado_minutos_mes,
      (select p.dictado_minutos_mes from public.planes p where p.id = n.plan_id),
      (select p.dictado_minutos_mes from public.planes p where p.clave = 'completo' and p.deleted_at is null limit 1),
      300),
    n.dictado_minutos_mes is not null,
    coalesce((select a.dictado_conservar_audio from public.veterinaria_ajustes a where a.negocio_id = n.id and a.deleted_at is null), false)
  from public.negocios n
  left join public.vet_dictados d on d.negocio_id = n.id and d.mes = date_trunc('month', p_mes)::date and d.deleted_at is null
  where n.deleted_at is null and n.plan <> 'demo'
  group by n.id
  order by coalesce(sum(d.minutos_cobrados) filter (where d.estado = 'listo'), 0) desc, n.nombre;
end;
$$;

create or replace function public.plataforma_dictado_tope_negocio(p_negocio_id uuid, p_tope integer, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.';
  end if;
  if p_tope is not null and p_tope < 0 then
    raise exception 'El tope no puede ser negativo.';
  end if;
  update public.negocios set dictado_minutos_mes = p_tope where id = p_negocio_id and deleted_at is null;
  if not found then
    raise exception 'Ese negocio no existe.';
  end if;
  perform public.plataforma_registrar_evento('dictado_tope', p_negocio_id, null, btrim(p_motivo), jsonb_build_object('tope', p_tope));
end;
$$;

-- ── 8. Eventos de plataforma: se le suma la acción nueva a la lista ──
do $$
declare
  v_def text;
  v_acciones text[];
  v_nuevas text[] := array['dictado_tope', 'maps_tope', 'maps_tope_plan'];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  -- El texto de la restricción trae la lista como '{a,b,c}'::text[] (o como ARRAY['a'::text, ...]).
  if v_def ~ '''\{[a-z_0-9,]+\}''' then
    v_acciones := string_to_array((regexp_match(v_def, '''\{([a-z_0-9,]+)\}'''))[1], ',');
  else
    select coalesce(array_agg(distinct m[1]), '{}') into v_acciones from regexp_matches(v_def, '''([a-z_0-9]+)''', 'g') as m;
  end if;
  if cardinality(v_acciones) < 10 then
    raise exception 'plataforma_eventos: no se pudo leer la lista de acciones (%).', v_def;
  end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || v_nuevas) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

-- ── 9. Dueños, grants y la frontera ──────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'vet_dictado_tope()', 'vet_dictado_usados()', 'vet_dictado_estado()', 'vet_dictado_iniciar(uuid,integer,boolean)',
    'vet_dictado_marcar_transcribiendo(uuid)', 'vet_dictado_listo(uuid,integer,integer,text,text,text,text)', 'vet_dictado_error(uuid,text)',
    'vet_dictado_uso_consulta(uuid)', 'vet_dictado_audio_ruta(uuid)', 'vet_diagnosticos_nombres(text)', 'guardar_veterinaria_dictado(boolean)'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- De postgres (cruzan negocios o son de la plataforma) y en la lista blanca de auditoria_frontera.
  foreach f in array array['vet_dictado_audios_vencidos()', 'vet_dictado_audios_marcar(uuid[])', 'plataforma_dictado_resumen(date)', 'plataforma_dictado_tope_negocio(uuid,integer,text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  execute 'revoke execute on function public.vet_dictado_audios_vencidos() from authenticated';
  execute 'revoke execute on function public.vet_dictado_audios_marcar(uuid[]) from authenticated';
end $$;

do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  v_def := replace(v_def, E'\r', '');
  if position('vet_dictado_audios_vencidos' in v_def) = 0 then
    v_def := replace(v_def, $a$('bot_cuenta_por_telefono')$a$,
      $b$('bot_cuenta_por_telefono'), ('vet_dictado_audios_vencidos'), ('vet_dictado_audios_marcar'), ('plataforma_dictado_resumen'), ('plataforma_dictado_tope_negocio')$b$);
    if position('plataforma_dictado_resumen' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar el dictado.';
    end if;
    execute v_def;
  end if;
end $$;

drop function public._vet_redes(text, text);
