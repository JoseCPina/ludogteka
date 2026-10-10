-- Veterinaria, Fase 3 · parte 1: agenda clínica, expediente por consulta (SOAP), catálogo de
-- diagnósticos, adjuntos, resultados de laboratorio, registro de lecturas, línea de tiempo y
-- vista del dueño en el portal (carril A).
--
-- · AGENDA CLÍNICA con varios médicos. `vet_citas` es propia del módulo (duración por tipo de
--   cita, médico asignado, empalme validado POR MÉDICO con una restricción de exclusión en la
--   base). Reutiliza la forma de la agenda de estética (columnas por responsable) pero no
--   toca sus tablas. Tipos fijos: consulta, vacuna, cirugía, seguimiento y urgencia; cada
--   negocio fija la duración. Una urgencia puede empalmarse (avisa) porque no espera turno.
-- · EXPEDIENTE SOAP. `vet_consultas`: motivo, anamnesis, examen físico (signos vitales, peso,
--   condición corporal), hallazgos, diagnósticos (presuntivo y definitivo) y plan/tratamiento.
--   Nace como BORRADOR con la plantilla del tipo de consulta (editable por negocio), se guarda
--   solo y se FIRMA: firma = médico veterinario designado, con su cédula. Una consulta firmada
--   no se edita ni se borra: solo admite una ADENDA firmada o se ANULA con motivo. El peso de
--   la consulta alimenta el historial de pesos al firmar.
-- · DIAGNÓSTICOS. Catálogo propio de la plataforma (no SNOMED), con sinónimos y búsqueda sin
--   acentos, y ampliable por cada negocio. La plataforma lo edita (su evento queda registrado).
-- · ADJUNTOS y RESULTADOS DE LABORATORIO. Archivos en un bucket privado (sin políticas: los
--   sube y firma el servidor tras comprobar el permiso) y resultados capturados a mano
--   (estudio, parámetros, valor, rango, bandera). No se editan: se anulan con motivo.
-- · LECTURAS. Quién abrió el expediente de qué mascota y cuándo (`vet_lecturas`). Las tablas
--   clínicas NO se leen directo por la API (su política de lectura es falsa): todo pasa por
--   funciones que comprueban el permiso y dejan la lectura anotada.
-- · PORTAL. El dueño ve fechas, diagnóstico definitivo y plan de las consultas FIRMADAS solo si
--   el negocio lo permite (opción apagada por omisión). Nunca las notas internas.
--
-- Permisos nuevos (apagados salvo admin y médico veterinario designado): atender_consultas ·
-- firmar_expediente · crear_estimados (lo usa la parte 3).

-- ── 0. Ayudante de esta migración y las dos siguientes ───────────────
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
  ('atender_consultas', 'Atender consultas', '{veterinaria}', 27),
  ('firmar_expediente', 'Firmar expediente', '{veterinaria}', 28),
  ('crear_estimados', 'Crear estimados', '{veterinaria}', 29);

-- Leer el expediente clínico: atender consultas o firmarlo (el médico tiene los dos por serlo).
create or replace function public.vet_puede_leer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.vet_puede('atender_consultas'), false) or coalesce(public.vet_puede('firmar_expediente'), false);
$$;

-- Manejar la agenda: admin, recepción, quien atiende consultas y los médicos.
create or replace function public.vet_agenda_puede()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.modulo_activo('veterinaria'), false)
    and coalesce(public.is_staff(), false)
    and (coalesce(public.is_admin(), false) or public.current_rol() = 'recepcion'
         or coalesce(public.es_medico_veterinario(), false) or coalesce(public.tiene_permiso('atender_consultas'), false));
$$;

-- Texto en minúsculas y sin acentos (búsquedas).
create or replace function public.vet_norm(p_texto text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(translate(coalesce(p_texto, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun'));
$$;

-- ── 2. Opción del portal ─────────────────────────────────────────────
alter table public.veterinaria_ajustes
  add column portal_expediente boolean not null default false;

create or replace function public.veterinaria_ajustes_actuales()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not coalesce(public.is_staff(), false) then '{}'::jsonb else
    coalesce((
      select jsonb_build_object(
        'recordatorios_activos', a.recordatorios_activos, 'dias_anticipacion', a.dias_anticipacion,
        'certificado_vigencia_dias', a.certificado_vigencia_dias, 'carnet_reemplaza_comprobante', a.carnet_reemplaza_comprobante,
        'hospitalizacion_precio_dia', a.hospitalizacion_precio_dia, 'portal_expediente', a.portal_expediente)
      from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null
    ), jsonb_build_object('recordatorios_activos', false, 'dias_anticipacion', 7, 'certificado_vigencia_dias', 30,
                          'carnet_reemplaza_comprobante', false, 'hospitalizacion_precio_dia', null, 'portal_expediente', false))
  end;
$$;

create or replace function public.guardar_veterinaria_portal(p_expediente boolean)
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
    update public.veterinaria_ajustes set portal_expediente = coalesce(p_expediente, false)
     where negocio_id = public.negocio_actual() and deleted_at is null;
  else
    insert into public.veterinaria_ajustes (portal_expediente) values (coalesce(p_expediente, false));
  end if;
end;
$$;

-- ── 3. Tipos de cita ─────────────────────────────────────────────────
create table public.vet_tipos_cita (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  clave text not null check (clave in ('consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia')),
  nombre text not null check (btrim(nombre) <> ''),
  duracion_min int not null check (duracion_min between 5 and 480),
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index vet_tipos_cita_clave on public.vet_tipos_cita (negocio_id, clave) where deleted_at is null;
select public._vet_redes('vet_tipos_cita', '(select public.is_staff())');

create or replace function public.vet_sembrar_agenda()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.vet_tipos_cita (clave, nombre, duracion_min)
  select v.clave, v.nombre, v.dur
  from (values ('consulta', 'Consulta', 30), ('vacuna', 'Vacuna', 15), ('cirugia', 'Cirugía', 90),
               ('seguimiento', 'Seguimiento', 20), ('urgencia', 'Urgencia', 30)) as v(clave, nombre, dur)
  where not exists (select 1 from public.vet_tipos_cita t where t.negocio_id = public.negocio_actual() and t.clave = v.clave and t.deleted_at is null);
end;
$$;

create or replace function public.vet_tipos_cita_lista()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    return '[]'::jsonb;
  end if;
  if public.negocio_escribible() and not exists (select 1 from public.vet_tipos_cita t where t.negocio_id = public.negocio_actual() and t.deleted_at is null) then
    perform public.vet_sembrar_agenda();
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', t.id, 'clave', t.clave, 'nombre', t.nombre, 'duracion_min', t.duracion_min, 'activo', t.activo)
                     order by array_position(array['consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia'], t.clave))
    from public.vet_tipos_cita t where t.negocio_id = public.negocio_actual() and t.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

create or replace function public.guardar_tipo_cita(p_clave text, p_nombre text, p_duracion_min int, p_activo boolean)
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
    raise exception 'Cambiar los tipos de cita es de admin o de quien tenga «Configuración del negocio».' using errcode = '42501';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'Escribe el nombre del tipo de cita.';
  end if;
  if p_duracion_min is null or p_duracion_min not between 5 and 480 then
    raise exception 'La duración va de 5 a 480 minutos.';
  end if;
  perform public.vet_sembrar_agenda();
  update public.vet_tipos_cita set nombre = btrim(p_nombre), duracion_min = p_duracion_min, activo = coalesce(p_activo, true)
   where negocio_id = public.negocio_actual() and clave = p_clave and deleted_at is null;
  if not found then
    raise exception 'Ese tipo de cita no existe.';
  end if;
end;
$$;

-- ── 4. Citas clínicas ────────────────────────────────────────────────
create table public.vet_citas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  tipo_id uuid not null references public.vet_tipos_cita(id),
  tipo_clave text not null,
  es_urgencia boolean not null default false,
  medico_id uuid not null references public.medicos_veterinarios(id),
  inicia_at timestamptz not null,
  termina_at timestamptz not null,
  estado text not null default 'programada' check (estado in ('programada', 'confirmada', 'en_curso', 'finalizada', 'cancelada', 'no_llego')),
  motivo text,
  consulta_id uuid,
  cancelada_motivo text,
  cambiada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (termina_at > inicia_at),
  check (estado <> 'cancelada' or cancelada_motivo is not null)
);
create index vet_citas_agenda_idx on public.vet_citas (negocio_id, inicia_at);
create index vet_citas_perro_idx on public.vet_citas (perro_id, inicia_at desc);
-- El empalme se valida POR MÉDICO en la base: dos citas vivas del mismo médico no se cruzan
-- (salvo una urgencia, que avisa pero entra).
alter table public.vet_citas
  add constraint vet_citas_sin_empalme exclude using gist (
    negocio_id with =, medico_id with =, tstzrange(inicia_at, termina_at) with &&
  ) where (estado in ('programada', 'confirmada', 'en_curso') and es_urgencia = false and deleted_at is null);
select public._vet_redes('vet_citas', 'false');

-- El médico veterinario por nombre (recepción no lee `profiles`).
create or replace function public.vet_medicos_lista()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then '[]'::jsonb else
    coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'nombre', coalesce(p.nombre_completo, 'Sin nombre'), 'cedula', m.cedula_profesional,
                                          'cpa', m.cpa_sitpv, 'soy_yo', m.profile_id = auth.uid())
                       order by coalesce(p.nombre_completo, ''))
      from public.medicos_veterinarios m join public.profiles p on p.id = m.profile_id
      where m.negocio_id = public.negocio_actual() and m.deleted_at is null
    ), '[]'::jsonb)
  end;
$$;

create or replace function public.vet_agendar_cita(
  p_perro uuid, p_tipo text, p_medico uuid, p_inicia timestamptz, p_duracion_min int default null, p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro record;
  v_tipo record;
  v_medico uuid;
  v_fin timestamptz;
  v_id uuid;
  v_choque record;
  v_empalmada boolean := false;
begin
  if not public.vet_agenda_puede() then
    raise exception 'Agendar citas clínicas es de recepción, de admin, de quien tenga «Atender consultas» o de un médico veterinario.' using errcode = '42501';
  end if;
  select p.id, p.nombre, p.cliente_id, p.fallecido into v_perro from public.perros p
   where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_perro.id is null then
    raise exception 'Esa mascota no existe.';
  end if;
  if v_perro.fallecido then
    raise exception 'Esa mascota está marcada como fallecida.';
  end if;
  perform public.vet_sembrar_agenda();
  select t.id, t.clave, t.nombre, t.duracion_min, t.activo into v_tipo from public.vet_tipos_cita t
   where t.negocio_id = public.negocio_actual() and t.clave = p_tipo and t.deleted_at is null;
  if v_tipo.id is null or not v_tipo.activo then
    raise exception 'Ese tipo de cita no está disponible.';
  end if;
  v_medico := public.vet_medico_firma(p_medico, true);
  if p_inicia is null then
    raise exception 'Elige la fecha y la hora.';
  end if;
  if p_inicia < now() - interval '2 hours' then
    raise exception 'Esa hora ya pasó. Elige una a partir de ahora.';
  end if;
  v_fin := p_inicia + make_interval(mins => coalesce(p_duracion_min, v_tipo.duracion_min));
  if coalesce(p_duracion_min, v_tipo.duracion_min) not between 5 and 480 then
    raise exception 'La duración va de 5 a 480 minutos.';
  end if;

  select c.inicia_at, c.termina_at, p2.nombre as mascota into v_choque
    from public.vet_citas c join public.perros p2 on p2.id = c.perro_id
   where c.negocio_id = public.negocio_actual() and c.medico_id = v_medico and c.deleted_at is null
     and c.estado in ('programada', 'confirmada', 'en_curso') and c.es_urgencia = false
     and tstzrange(c.inicia_at, c.termina_at) && tstzrange(p_inicia, v_fin)
   order by c.inicia_at limit 1;
  if v_choque.inicia_at is not null then
    if v_tipo.clave <> 'urgencia' then
      raise exception 'Ese médico ya tiene una cita de % a % (%). Elige otra hora u otro médico.',
        to_char(v_choque.inicia_at at time zone public.zona_negocio(), 'HH24:MI'),
        to_char(v_choque.termina_at at time zone public.zona_negocio(), 'HH24:MI'), v_choque.mascota;
    end if;
    v_empalmada := true;
  end if;

  begin
    insert into public.vet_citas (perro_id, cliente_id, tipo_id, tipo_clave, es_urgencia, medico_id, inicia_at, termina_at, motivo)
    values (p_perro, v_perro.cliente_id, v_tipo.id, v_tipo.clave, v_tipo.clave = 'urgencia', v_medico, p_inicia, v_fin, nullif(btrim(coalesce(p_motivo, '')), ''))
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'Ese médico ya tiene una cita en ese horario. Elige otra hora u otro médico.';
  end;
  return jsonb_build_object('id', v_id, 'empalmada', v_empalmada);
end;
$$;

create or replace function public.vet_reprogramar_cita(p_id uuid, p_inicia timestamptz, p_medico uuid default null, p_duracion_min int default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_medico uuid;
  v_dur int;
  v_fin timestamptz;
  v_choque record;
begin
  if not public.vet_agenda_puede() then
    raise exception 'Mover citas clínicas es de recepción, de admin, de quien tenga «Atender consultas» o de un médico veterinario.' using errcode = '42501';
  end if;
  select c.id, c.estado, c.medico_id, c.es_urgencia, c.inicia_at, c.termina_at into v_c from public.vet_citas c
   where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa cita no existe.';
  end if;
  if v_c.estado not in ('programada', 'confirmada') then
    raise exception 'Solo se mueve una cita programada o confirmada.';
  end if;
  if p_inicia is null or p_inicia < now() - interval '2 hours' then
    raise exception 'Elige una hora a partir de ahora.';
  end if;
  v_medico := coalesce(public.vet_medico_firma(p_medico, false), v_c.medico_id);
  v_dur := coalesce(p_duracion_min, (extract(epoch from (v_c.termina_at - v_c.inicia_at)) / 60)::int);
  if v_dur not between 5 and 480 then
    raise exception 'La duración va de 5 a 480 minutos.';
  end if;
  v_fin := p_inicia + make_interval(mins => v_dur);
  select c.inicia_at, c.termina_at, p2.nombre as mascota into v_choque
    from public.vet_citas c join public.perros p2 on p2.id = c.perro_id
   where c.negocio_id = public.negocio_actual() and c.medico_id = v_medico and c.deleted_at is null and c.id <> p_id
     and c.estado in ('programada', 'confirmada', 'en_curso') and c.es_urgencia = false
     and tstzrange(c.inicia_at, c.termina_at) && tstzrange(p_inicia, v_fin)
   order by c.inicia_at limit 1;
  if v_choque.inicia_at is not null and not v_c.es_urgencia then
    raise exception 'Ese médico ya tiene una cita de % a % (%). Elige otra hora u otro médico.',
      to_char(v_choque.inicia_at at time zone public.zona_negocio(), 'HH24:MI'),
      to_char(v_choque.termina_at at time zone public.zona_negocio(), 'HH24:MI'), v_choque.mascota;
  end if;
  begin
    update public.vet_citas set inicia_at = p_inicia, termina_at = v_fin, medico_id = v_medico, cambiada_at = now() where id = p_id;
  exception when exclusion_violation then
    raise exception 'Ese médico ya tiene una cita en ese horario. Elige otra hora u otro médico.';
  end;
end;
$$;

create or replace function public.vet_cita_estado(p_id uuid, p_estado text, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
begin
  if not public.vet_agenda_puede() then
    raise exception 'Cambiar el estado de una cita clínica es de recepción, de admin, de quien tenga «Atender consultas» o de un médico veterinario.' using errcode = '42501';
  end if;
  select c.id, c.estado into v_c from public.vet_citas c
   where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa cita no existe.';
  end if;
  if p_estado not in ('confirmada', 'en_curso', 'finalizada', 'cancelada', 'no_llego') then
    raise exception 'Estado no válido.';
  end if;
  if not (
    (v_c.estado = 'programada' and p_estado in ('confirmada', 'en_curso', 'cancelada', 'no_llego')) or
    (v_c.estado = 'confirmada' and p_estado in ('en_curso', 'cancelada', 'no_llego')) or
    (v_c.estado = 'en_curso' and p_estado = 'finalizada')
  ) then
    raise exception 'Una cita % no puede pasar a %.', v_c.estado, p_estado;
  end if;
  if p_estado = 'cancelada' and length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué se cancela.';
  end if;
  update public.vet_citas
     set estado = p_estado, cancelada_motivo = case when p_estado = 'cancelada' then btrim(p_motivo) else cancelada_motivo end
   where id = p_id;
end;
$$;

-- La agenda de un rango de fechas del negocio, con nombres (recepción no lee `profiles`).
create or replace function public.vet_agenda(p_desde date, p_hasta date, p_medico uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz;
  v_hasta timestamptz;
begin
  if not public.vet_agenda_puede() then
    return '[]'::jsonb;
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde or p_hasta - p_desde > 45 then
    raise exception 'Elige un rango de hasta 45 días.';
  end if;
  v_desde := p_desde::timestamp at time zone public.zona_negocio();
  v_hasta := (p_hasta + 1)::timestamp at time zone public.zona_negocio();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', c.id, 'perro_id', c.perro_id, 'mascota', p.nombre, 'especie', p.especie, 'cliente_id', c.cliente_id, 'dueno', cl.nombre,
      'telefono', cl.telefono, 'tipo_clave', c.tipo_clave, 'tipo', t.nombre, 'medico_id', c.medico_id, 'medico', coalesce(pr.nombre_completo, 'Sin nombre'),
      'inicia_at', c.inicia_at, 'termina_at', c.termina_at, 'estado', c.estado, 'motivo', c.motivo, 'consulta_id', c.consulta_id,
      'urgencia', c.es_urgencia, 'cancelada_motivo', c.cancelada_motivo
    ) order by c.inicia_at)
    from public.vet_citas c
    join public.perros p on p.id = c.perro_id
    join public.clientes cl on cl.id = c.cliente_id
    join public.vet_tipos_cita t on t.id = c.tipo_id
    join public.medicos_veterinarios m on m.id = c.medico_id
    left join public.profiles pr on pr.id = m.profile_id
    where c.negocio_id = public.negocio_actual() and c.deleted_at is null
      and c.inicia_at >= v_desde and c.inicia_at < v_hasta
      and (p_medico is null or c.medico_id = p_medico)
  ), '[]'::jsonb);
end;
$$;

-- ── 5. Plantillas por tipo de consulta ───────────────────────────────
create table public.vet_consulta_plantillas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tipo_clave text not null check (tipo_clave in ('consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia')),
  version int not null,
  texto jsonb not null,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (negocio_id, tipo_clave, version)
);
select public._vet_redes('vet_consulta_plantillas', '(select public.is_staff())');

-- Textos base NEUTROS: solo guían qué anotar; el negocio los reescribe a su manera.
create or replace function public.vet_plantilla_base(p_tipo text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_tipo
    when 'consulta' then jsonb_build_object(
      'anamnesis', E'Tiempo de evolución:\nApetito y sed:\nVómito / diarrea:\nMicción y defecación:\nActividad:\nAlimentación:\nVacunas y desparasitación:\nOtras mascotas / contacto:',
      'examen_fisico', E'Estado general:\nMucosas:\nGanglios:\nPiel y pelo:\nOídos y ojos:\nBoca y dientes:\nAuscultación cardiopulmonar:\nPalpación abdominal:\nSistema locomotor:',
      'hallazgos', '', 'plan', E'Estudios solicitados:\nSeguimiento / próxima revisión:\nRecomendaciones al propietario:', 'tratamiento', E'Medicamento · dosis · vía · frecuencia · duración:')
    when 'vacuna' then jsonb_build_object(
      'anamnesis', E'Estado de salud reciente:\nReacciones previas a vacunas:\nÚltima desparasitación:',
      'examen_fisico', E'Estado general:\nMucosas:\nTemperatura:',
      'hallazgos', '', 'plan', E'Próxima dosis:\nIndicaciones tras la aplicación:', 'tratamiento', E'Biológico · lote · vía:')
    when 'cirugia' then jsonb_build_object(
      'anamnesis', E'Procedimiento programado:\nAyuno:\nAnestesias previas y reacciones:\nEnfermedades o medicación actual:',
      'examen_fisico', E'Estado general / riesgo anestésico:\nAuscultación cardiopulmonar:\nMucosas y TLLC:',
      'hallazgos', E'Técnica y hallazgos del procedimiento:', 'plan', E'Cuidados posoperatorios:\nRetiro de puntos / revisión:', 'tratamiento', E'Analgesia · antibiótico · otros:')
    when 'seguimiento' then jsonb_build_object(
      'anamnesis', E'Evolución desde la última visita:\nCumplimiento del tratamiento:\nSignos nuevos:',
      'examen_fisico', E'Estado general:\nPeso y condición corporal:\nHallazgos relevantes:',
      'hallazgos', '', 'plan', E'Continuar / ajustar tratamiento:\nPróxima revisión:', 'tratamiento', '')
    else jsonb_build_object(
      'anamnesis', E'Qué pasó y cuándo:\nSignos actuales:\nIngirió algo / exposición:',
      'examen_fisico', E'Estado general y de conciencia:\nMucosas y TLLC:\nFrecuencia cardiaca y respiratoria:\nTemperatura:\nDolor:',
      'hallazgos', '', 'plan', E'Estabilización:\nEstudios urgentes:\nHospitalización / referencia:', 'tratamiento', '')
  end;
$$;

create or replace function public.vet_sembrar_plantillas()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t text;
begin
  foreach v_t in array array['consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia'] loop
    if not exists (select 1 from public.vet_consulta_plantillas p where p.negocio_id = public.negocio_actual() and p.tipo_clave = v_t and p.deleted_at is null) then
      insert into public.vet_consulta_plantillas (tipo_clave, version, texto) values (v_t, 1, public.vet_plantilla_base(v_t));
    end if;
  end loop;
end;
$$;

create or replace function public.vet_plantillas_consulta()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    return '{}'::jsonb;
  end if;
  if public.negocio_escribible() then
    perform public.vet_sembrar_plantillas();
  end if;
  return coalesce((
    select jsonb_object_agg(p.tipo_clave, jsonb_build_object('version', p.version, 'texto', p.texto))
    from public.vet_consulta_plantillas p
    where p.negocio_id = public.negocio_actual() and p.activa and p.deleted_at is null
  ), '{}'::jsonb);
end;
$$;

create or replace function public.guardar_plantilla_consulta(p_tipo text, p_texto jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
  v_k text;
  v_limpio jsonb := '{}'::jsonb;
begin
  if not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'Veterinaria está apagada en este negocio.';
  end if;
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Editar las plantillas de consulta es de admin o de quien tenga «Configuración del negocio».' using errcode = '42501';
  end if;
  if p_tipo not in ('consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia') then
    raise exception 'Ese tipo de consulta no existe.';
  end if;
  foreach v_k in array array['anamnesis', 'examen_fisico', 'hallazgos', 'plan', 'tratamiento'] loop
    if length(coalesce(p_texto ->> v_k, '')) > 4000 then
      raise exception 'Cada sección admite hasta 4,000 caracteres.';
    end if;
    v_limpio := v_limpio || jsonb_build_object(v_k, coalesce(p_texto ->> v_k, ''));
  end loop;
  perform public.vet_sembrar_plantillas();
  select max(p.version) + 1 into v_version from public.vet_consulta_plantillas p where p.negocio_id = public.negocio_actual() and p.tipo_clave = p_tipo;
  update public.vet_consulta_plantillas set activa = false where negocio_id = public.negocio_actual() and tipo_clave = p_tipo and activa;
  insert into public.vet_consulta_plantillas (tipo_clave, version, texto) values (p_tipo, v_version, v_limpio);
  return v_version;
end;
$$;

-- ── 6. Catálogo de diagnósticos ──────────────────────────────────────
-- Compartido (sin negocio_id): lo edita SOLO la plataforma. Cada negocio puede ampliarlo con los suyos.
create table public.vet_diagnosticos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  categoria text not null,
  especies text[] not null default '{perro,gato}' check (especies <@ array['perro', 'gato'] and cardinality(especies) > 0),
  sinonimos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index vet_diagnosticos_nombre on public.vet_diagnosticos (lower(nombre)) where deleted_at is null;
create trigger set_updated_at before insert or update on public.vet_diagnosticos
  for each row execute function public.set_updated_at();
alter table public.vet_diagnosticos enable row level security;
create policy vet_diagnosticos_select on public.vet_diagnosticos
  for select to authenticated, peludesk_definer using (deleted_at is null);
grant select on public.vet_diagnosticos to authenticated, peludesk_definer, service_role;

create table public.vet_diagnosticos_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  nombre text not null check (btrim(nombre) <> ''),
  categoria text not null default 'Otros',
  especies text[] not null default '{perro,gato}' check (especies <@ array['perro', 'gato'] and cardinality(especies) > 0),
  sinonimos text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index vet_diagnosticos_negocio_nombre on public.vet_diagnosticos_negocio (negocio_id, lower(nombre)) where deleted_at is null;
select public._vet_redes('vet_diagnosticos_negocio', '(select public.is_staff())');

create or replace function public.vet_buscar_diagnosticos(p_q text, p_especie text default null, p_limite int default 15)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := regexp_replace(public.vet_norm(btrim(coalesce(p_q, ''))), '[%_\\]', '', 'g');
  v_res jsonb;
begin
  if not public.vet_puede_leer() or length(v_q) < 2 then
    return '[]'::jsonb;
  end if;
  with c as (
    select d.id, 'catalogo'::text as origen, d.nombre, d.categoria, d.sinonimos, d.especies
      from public.vet_diagnosticos d where d.deleted_at is null
    union all
    select d.id, 'negocio', d.nombre, d.categoria, d.sinonimos, d.especies
      from public.vet_diagnosticos_negocio d where d.negocio_id = public.negocio_actual() and d.deleted_at is null
  ), n as (
    select c.*, public.vet_norm(c.nombre) as nn, coalesce((select array_agg(public.vet_norm(s)) from unnest(c.sinonimos) s), '{}') as sn
      from c where p_especie is null or p_especie = any (c.especies)
  ), r as (
    select n.*,
      case
        when n.nn = v_q then 0
        when n.nn like v_q || '%' then 1
        when exists (select 1 from unnest(n.sn) s where s = v_q or s like v_q || '%') then 2
        when n.nn like '%' || v_q || '%' then 3
        when exists (select 1 from unnest(n.sn) s where s like '%' || v_q || '%') then 4
        when extensions.similarity(n.nn, v_q) >= 0.35 then 5
        else null
      end as rk
    from n
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'origen', x.origen, 'nombre', x.nombre, 'categoria', x.categoria, 'sinonimos', x.sinonimos, 'especies', x.especies)
                           order by x.rk, x.nombre), '[]'::jsonb)
    into v_res
    from (select * from r where rk is not null order by rk, nombre limit greatest(1, least(coalesce(p_limite, 15), 50))) x;
  return v_res;
end;
$$;

create or replace function public.vet_agregar_diagnostico_negocio(p_nombre text, p_categoria text, p_especies text[], p_sinonimos text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Agregar diagnósticos es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_nombre, ''))) < 3 then
    raise exception 'Escribe el nombre del diagnóstico.';
  end if;
  if exists (select 1 from public.vet_diagnosticos d where lower(d.nombre) = lower(btrim(p_nombre)) and d.deleted_at is null) then
    raise exception 'Ese diagnóstico ya está en el catálogo: búscalo por su nombre.';
  end if;
  insert into public.vet_diagnosticos_negocio (nombre, categoria, especies, sinonimos)
  values (btrim(p_nombre), coalesce(nullif(btrim(coalesce(p_categoria, '')), ''), 'Otros'),
          case when coalesce(cardinality(p_especies), 0) > 0 then p_especies else '{perro,gato}' end,
          coalesce((select array_agg(distinct btrim(s)) from unnest(p_sinonimos) s where btrim(s) <> ''), '{}'))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'Tu negocio ya tiene ese diagnóstico.';
end;
$$;

-- Alta y edición del catálogo compartido: solo la plataforma, con su evento.
create or replace function public.plataforma_guardar_diagnostico(p_id uuid, p_nombre text, p_categoria text, p_especies text[], p_sinonimos text[])
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_id uuid;
  v_sin text[] := coalesce((select array_agg(distinct btrim(s)) from unnest(p_sinonimos) s where btrim(s) <> ''), '{}');
  v_esp text[] := case when coalesce(cardinality(p_especies), 0) > 0 then p_especies else '{perro,gato}' end;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if btrim(coalesce(p_nombre, '')) = '' or btrim(coalesce(p_categoria, '')) = '' then
    raise exception 'Escribe el nombre y la categoría del diagnóstico.';
  end if;
  if p_id is null then
    insert into public.vet_diagnosticos (nombre, categoria, especies, sinonimos) values (btrim(p_nombre), btrim(p_categoria), v_esp, v_sin)
    returning id into v_id;
  else
    update public.vet_diagnosticos set nombre = btrim(p_nombre), categoria = btrim(p_categoria), especies = v_esp, sinonimos = v_sin
     where id = p_id and deleted_at is null returning id into v_id;
    if v_id is null then
      raise exception 'Ese diagnóstico no existe.';
    end if;
  end if;
  perform public.plataforma_registrar_evento('editar_diagnostico_vet', null, null, null,
    jsonb_build_object('diagnostico', btrim(p_nombre), 'categoria', btrim(p_categoria), 'alta', p_id is null));
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un diagnóstico con ese nombre.';
end;
$fn$;

create or replace function public.plataforma_baja_diagnostico(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_nombre text;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  update public.vet_diagnosticos set deleted_at = now() where id = p_id and deleted_at is null returning nombre into v_nombre;
  if v_nombre is null then
    raise exception 'Ese diagnóstico no existe.';
  end if;
  perform public.plataforma_registrar_evento('editar_diagnostico_vet', null, null, null, jsonb_build_object('diagnostico', v_nombre, 'baja', true));
end;
$fn$;

-- Los negocios pueden proponer sus diagnósticos al catálogo general: los ve la plataforma.
create or replace function public.plataforma_diagnosticos_de_negocios()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('nombre', d.nombre, 'categoria', d.categoria, 'especies', d.especies, 'sinonimos', d.sinonimos, 'negocio', n.nombre, 'desde', d.created_at)
                     order by d.created_at desc)
    from public.vet_diagnosticos_negocio d join public.negocios n on n.id = d.negocio_id where d.deleted_at is null
  ), '[]'::jsonb);
end;
$fn$;

-- ── 7. Consultas (expediente SOAP) ───────────────────────────────────
create table public.vet_consultas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  cita_id uuid references public.vet_citas(id),
  tipo_clave text not null check (tipo_clave in ('consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia')),
  medico_id uuid not null references public.medicos_veterinarios(id),
  estado text not null default 'borrador' check (estado in ('borrador', 'firmada', 'anulada')),
  atendida_at timestamptz not null default now(),
  plantilla_version int,
  -- S · subjetivo
  motivo text,
  anamnesis text,
  -- O · objetivo
  examen_fisico text,
  hallazgos text,
  peso_kg numeric(5,2) check (peso_kg is null or peso_kg > 0),
  temperatura_c numeric(4,1) check (temperatura_c is null or temperatura_c between 30 and 45),
  frecuencia_cardiaca int check (frecuencia_cardiaca is null or frecuencia_cardiaca between 10 and 400),
  frecuencia_respiratoria int check (frecuencia_respiratoria is null or frecuencia_respiratoria between 2 and 200),
  condicion_corporal int check (condicion_corporal is null or condicion_corporal between 1 and 9),
  mucosas text,
  tllc_seg numeric(3,1) check (tllc_seg is null or tllc_seg between 0 and 20),
  hidratacion text,
  -- A · diagnósticos: [{ref_id, origen, nombre, tipo: presuntivo|definitivo, nota}]
  diagnosticos jsonb not null default '[]'::jsonb check (jsonb_typeof(diagnosticos) = 'array'),
  -- P · plan
  plan text,
  tratamiento text,
  -- Solo para el equipo: nunca sale al portal.
  notas_internas text,
  borrador_guardado_at timestamptz,
  firmada_at timestamptz,
  firmada_por uuid references auth.users(id) on delete set null,
  firma_medico_id uuid references public.medicos_veterinarios(id),
  firma_nombre text,
  firma_cedula text,
  firma_cpa text,
  firma_hash text,
  anulada_at timestamptz,
  anulada_por uuid references auth.users(id) on delete set null,
  anulada_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (estado = 'borrador' or (firmada_at is not null and firma_medico_id is not null and firma_hash is not null)),
  check (estado <> 'anulada' or (anulada_at is not null and anulada_motivo is not null))
);
create unique index vet_consultas_una_por_cita on public.vet_consultas (cita_id) where cita_id is not null and deleted_at is null and estado <> 'anulada';
create index vet_consultas_perro_idx on public.vet_consultas (perro_id, atendida_at desc);
create index vet_consultas_borradores_idx on public.vet_consultas (negocio_id, created_at) where estado = 'borrador' and deleted_at is null;
select public._vet_redes('vet_consultas', 'false');
alter table public.vet_citas add constraint vet_citas_consulta_fk foreign key (consulta_id) references public.vet_consultas(id);

-- Una consulta firmada no se edita ni se borra: se agrega una adenda o se anula con motivo.
create or replace function public.vet_consulta_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_libres text[] := array['estado', 'anulada_at', 'anulada_por', 'anulada_motivo', 'updated_at'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Una consulta no se borra: un borrador se descarta y una firmada se anula con un motivo.' using errcode = '42501';
  end if;
  if old.estado = 'borrador' then
    return new;
  end if;
  if old.estado = 'firmada' and new.estado = 'anulada' and (to_jsonb(new) - v_libres) is not distinct from (to_jsonb(old) - v_libres) then
    return new;
  end if;
  raise exception 'Una consulta firmada no se edita ni se borra: agrega una adenda o anúlala con un motivo.' using errcode = '42501';
end;
$$;
revoke execute on function public.vet_consulta_inmutable() from public, anon, authenticated;
create trigger vet_consulta_inmutable before update or delete on public.vet_consultas
  for each row execute function public.vet_consulta_inmutable();

create table public.vet_consulta_adendas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  consulta_id uuid not null references public.vet_consultas(id),
  texto text not null check (btrim(texto) <> ''),
  medico_id uuid not null references public.medicos_veterinarios(id),
  firma_nombre text not null,
  firma_cedula text not null,
  firma_cpa text,
  firmada_at timestamptz not null default now(),
  firma_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index vet_consulta_adendas_idx on public.vet_consulta_adendas (consulta_id, firmada_at);
select public._vet_redes('vet_consulta_adendas', 'false');
create trigger vet_solo_agregar before update or delete on public.vet_consulta_adendas
  for each row execute function public.vet_solo_agregar();

-- Resultados de laboratorio capturados a mano.
create table public.vet_resultados_lab (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  consulta_id uuid references public.vet_consultas(id),
  estudio text not null check (btrim(estudio) <> ''),
  fecha_estudio date not null,
  laboratorio text,
  -- [{nombre, valor, unidad, rango, bandera: normal|alto|bajo|null}]
  parametros jsonb not null check (jsonb_typeof(parametros) = 'array' and jsonb_array_length(parametros) between 1 and 80),
  notas text,
  anulada_at timestamptz,
  anulada_por uuid references auth.users(id) on delete set null,
  anulada_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index vet_resultados_lab_perro_idx on public.vet_resultados_lab (perro_id, fecha_estudio desc);
select public._vet_redes('vet_resultados_lab', 'false');
create trigger vet_registro_inmutable before update or delete on public.vet_resultados_lab
  for each row execute function public.vet_registro_inmutable();

-- Adjuntos (fotos, PDF, estudios): el archivo vive en el bucket privado; aquí solo su registro.
create table public.vet_adjuntos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  consulta_id uuid references public.vet_consultas(id),
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text,
  mime text not null,
  bytes bigint not null check (bytes > 0 and bytes <= 15728640),
  ruta text not null,
  anulada_at timestamptz,
  anulada_por uuid references auth.users(id) on delete set null,
  anulada_motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (ruta)
);
create index vet_adjuntos_perro_idx on public.vet_adjuntos (perro_id, created_at desc);
select public._vet_redes('vet_adjuntos', 'false');
create trigger vet_registro_inmutable before update or delete on public.vet_adjuntos
  for each row execute function public.vet_registro_inmutable();

-- Bucket privado: sin políticas, lo sube y lo firma el servidor tras comprobar el permiso.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('veterinaria-archivos', 'veterinaria-archivos', false, 15728640,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types, public = false;

-- Registro de lecturas del expediente.
create table public.vet_lecturas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  perro_id uuid not null references public.perros(id),
  recurso text not null check (recurso in ('expediente', 'consulta', 'linea_tiempo', 'adjunto', 'resultado', 'estimado')),
  recurso_id uuid,
  profile_id uuid not null references auth.users(id) default auth.uid(),
  leido_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index vet_lecturas_perro_idx on public.vet_lecturas (perro_id, leido_at desc);
select public._vet_redes('vet_lecturas', 'false');
create trigger vet_solo_agregar before update or delete on public.vet_lecturas
  for each row execute function public.vet_solo_agregar();

-- Anota una lectura (a lo más una por persona y recurso cada 5 minutos). Nunca bloquea la lectura:
-- un negocio en solo lectura simplemente no la anota.
create or replace function public.vet_registrar_lectura(p_perro uuid, p_recurso text, p_recurso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.negocio_escribible() then
    return;
  end if;
  if exists (
    select 1 from public.vet_lecturas l
    where l.negocio_id = public.negocio_actual() and l.profile_id = auth.uid() and l.perro_id = p_perro and l.recurso = p_recurso
      and l.recurso_id is not distinct from p_recurso_id and l.leido_at > now() - interval '5 minutes'
  ) then
    return;
  end if;
  insert into public.vet_lecturas (perro_id, recurso, recurso_id) values (p_perro, p_recurso, p_recurso_id);
end;
$$;

create or replace function public.vet_lecturas_lista(p_perro uuid, p_limite int default 100)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    raise exception 'El registro de lecturas es de admin.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('recurso', x.recurso, 'recurso_id', x.recurso_id, 'persona', coalesce(p.nombre_completo, 'Sin nombre'), 'leido_at', x.leido_at)
                     order by x.leido_at desc)
    from (select * from public.vet_lecturas l where l.negocio_id = public.negocio_actual() and l.perro_id = p_perro
          order by l.leido_at desc limit greatest(1, least(coalesce(p_limite, 100), 500))) x
    left join public.profiles p on p.id = x.profile_id
  ), '[]'::jsonb);
end;
$$;

-- ── 8. Funciones de la consulta ──────────────────────────────────────
create or replace function public.vet_consulta_iniciar(p_perro uuid, p_cita uuid, p_tipo text, p_medico uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro record;
  v_cita record;
  v_tipo text := p_tipo;
  v_medico uuid;
  v_plantilla record;
  v_motivo text;
  v_id uuid := gen_random_uuid();
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Atender consultas es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  if p_cita is not null then
    select c.id, c.perro_id, c.medico_id, c.estado, c.tipo_clave, c.consulta_id, c.motivo into v_cita from public.vet_citas c
     where c.id = p_cita and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
    if v_cita.id is null then
      raise exception 'Esa cita no existe.';
    end if;
    if v_cita.estado not in ('programada', 'confirmada', 'en_curso') then
      raise exception 'Esa cita ya no está vigente.';
    end if;
    if v_cita.consulta_id is not null then
      raise exception 'Esa cita ya tiene una consulta.';
    end if;
    p_perro := v_cita.perro_id;
    v_motivo := v_cita.motivo;
    v_tipo := v_cita.tipo_clave;
    p_medico := coalesce(p_medico, v_cita.medico_id);
  end if;
  select p.id, p.cliente_id, p.fallecido into v_perro from public.perros p
   where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_perro.id is null then
    raise exception 'Esa mascota no existe.';
  end if;
  if v_tipo is null or v_tipo not in ('consulta', 'vacuna', 'cirugia', 'seguimiento', 'urgencia') then
    raise exception 'Elige el tipo de consulta.';
  end if;
  v_medico := public.vet_medico_firma(p_medico, true);
  perform public.vet_sembrar_plantillas();
  select pl.version, pl.texto into v_plantilla from public.vet_consulta_plantillas pl
   where pl.negocio_id = public.negocio_actual() and pl.tipo_clave = v_tipo and pl.activa and pl.deleted_at is null;
  insert into public.vet_consultas (id, perro_id, cliente_id, cita_id, tipo_clave, medico_id, plantilla_version, motivo, anamnesis, examen_fisico, hallazgos, plan, tratamiento)
  values (v_id, p_perro, v_perro.cliente_id, p_cita, v_tipo, v_medico, v_plantilla.version, nullif(v_motivo, ''),
          nullif(v_plantilla.texto ->> 'anamnesis', ''), nullif(v_plantilla.texto ->> 'examen_fisico', ''), nullif(v_plantilla.texto ->> 'hallazgos', ''),
          nullif(v_plantilla.texto ->> 'plan', ''), nullif(v_plantilla.texto ->> 'tratamiento', ''));
  if p_cita is not null then
    update public.vet_citas set consulta_id = v_id, estado = 'en_curso' where id = p_cita;
  end if;
  perform public.vet_registrar_lectura(p_perro, 'consulta', v_id);
  return v_id;
end;
$$;

-- Autoguardado del borrador: solo cambia las claves que vienen en `p_datos`.
create or replace function public.vet_consulta_guardar(p_id uuid, p_datos jsonb)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_d jsonb;
  v_x jsonb;
  v_n int := 0;
  v_ahora timestamptz := now();
  v_k text;
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Escribir en el expediente es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  select c.id, c.estado into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'borrador' then
    raise exception 'La consulta ya está firmada: solo admite una adenda.';
  end if;
  foreach v_k in array array['motivo', 'anamnesis', 'examen_fisico', 'hallazgos', 'plan', 'tratamiento', 'notas_internas', 'mucosas', 'hidratacion'] loop
    if length(coalesce(p_datos ->> v_k, '')) > 8000 then
      raise exception 'Cada sección admite hasta 8,000 caracteres.';
    end if;
  end loop;
  if p_datos ? 'diagnosticos' then
    v_d := p_datos -> 'diagnosticos';
    if jsonb_typeof(v_d) <> 'array' or jsonb_array_length(v_d) > 30 then
      raise exception 'Los diagnósticos son una lista de hasta 30.';
    end if;
    for v_x in select * from jsonb_array_elements(v_d) loop
      if coalesce(v_x ->> 'tipo', '') not in ('presuntivo', 'definitivo') or length(btrim(coalesce(v_x ->> 'nombre', ''))) = 0 or length(v_x ->> 'nombre') > 200
         or coalesce(v_x ->> 'origen', '') not in ('catalogo', 'negocio', 'libre') then
        raise exception 'Cada diagnóstico lleva nombre y tipo (presuntivo o definitivo).';
      end if;
    end loop;
  end if;
  update public.vet_consultas c set
    motivo = case when p_datos ? 'motivo' then nullif(btrim(p_datos ->> 'motivo'), '') else c.motivo end,
    anamnesis = case when p_datos ? 'anamnesis' then nullif(btrim(p_datos ->> 'anamnesis'), '') else c.anamnesis end,
    examen_fisico = case when p_datos ? 'examen_fisico' then nullif(btrim(p_datos ->> 'examen_fisico'), '') else c.examen_fisico end,
    hallazgos = case when p_datos ? 'hallazgos' then nullif(btrim(p_datos ->> 'hallazgos'), '') else c.hallazgos end,
    plan = case when p_datos ? 'plan' then nullif(btrim(p_datos ->> 'plan'), '') else c.plan end,
    tratamiento = case when p_datos ? 'tratamiento' then nullif(btrim(p_datos ->> 'tratamiento'), '') else c.tratamiento end,
    notas_internas = case when p_datos ? 'notas_internas' then nullif(btrim(p_datos ->> 'notas_internas'), '') else c.notas_internas end,
    mucosas = case when p_datos ? 'mucosas' then nullif(btrim(p_datos ->> 'mucosas'), '') else c.mucosas end,
    hidratacion = case when p_datos ? 'hidratacion' then nullif(btrim(p_datos ->> 'hidratacion'), '') else c.hidratacion end,
    peso_kg = case when p_datos ? 'peso_kg' then nullif(p_datos ->> 'peso_kg', '')::numeric else c.peso_kg end,
    temperatura_c = case when p_datos ? 'temperatura_c' then nullif(p_datos ->> 'temperatura_c', '')::numeric else c.temperatura_c end,
    frecuencia_cardiaca = case when p_datos ? 'frecuencia_cardiaca' then nullif(p_datos ->> 'frecuencia_cardiaca', '')::int else c.frecuencia_cardiaca end,
    frecuencia_respiratoria = case when p_datos ? 'frecuencia_respiratoria' then nullif(p_datos ->> 'frecuencia_respiratoria', '')::int else c.frecuencia_respiratoria end,
    condicion_corporal = case when p_datos ? 'condicion_corporal' then nullif(p_datos ->> 'condicion_corporal', '')::int else c.condicion_corporal end,
    tllc_seg = case when p_datos ? 'tllc_seg' then nullif(p_datos ->> 'tllc_seg', '')::numeric else c.tllc_seg end,
    diagnosticos = case when p_datos ? 'diagnosticos' then p_datos -> 'diagnosticos' else c.diagnosticos end,
    borrador_guardado_at = v_ahora
  where c.id = p_id;
  return v_ahora;
end;
$$;

create or replace function public.vet_consulta_descartar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Descartar un borrador es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  select c.id, c.estado, c.cita_id into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'borrador' then
    raise exception 'Solo se descarta un borrador: una consulta firmada se anula con un motivo.';
  end if;
  if v_c.cita_id is not null then
    update public.vet_citas set consulta_id = null, estado = 'confirmada' where id = v_c.cita_id and estado = 'en_curso';
  end if;
  update public.vet_consultas set deleted_at = now() where id = p_id;
end;
$$;

create or replace function public.vet_consulta_firmar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_m record;
  v_nombre text;
  v_hash text;
  v_hay_dx boolean;
begin
  if not public.vet_puede('firmar_expediente') then
    raise exception 'Firmar el expediente es de un médico veterinario designado.' using errcode = '42501';
  end if;
  select m.id, m.cedula_profesional, m.cpa_sitpv, m.profile_id into v_m from public.medicos_veterinarios m
   where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if v_m.id is null then
    raise exception 'Solo un médico veterinario designado firma el expediente (con su cédula).' using errcode = '42501';
  end if;
  select c.* into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'borrador' then
    raise exception 'Esa consulta ya está firmada.';
  end if;
  if v_c.medico_id <> v_m.id then
    raise exception 'Esta consulta está a cargo de otro médico: solo él la firma. Si cambió el médico, reasígnala antes.' using errcode = '42501';
  end if;
  if btrim(coalesce(v_c.motivo, '')) = '' then
    raise exception 'Escribe el motivo de la consulta antes de firmar.';
  end if;
  v_hay_dx := jsonb_array_length(v_c.diagnosticos) > 0;
  if not v_hay_dx and v_c.tipo_clave in ('consulta', 'cirugia', 'urgencia') then
    raise exception 'Agrega al menos un diagnóstico (presuntivo o definitivo) antes de firmar.';
  end if;
  select coalesce(p.nombre_completo, 'Médico veterinario') into v_nombre from public.profiles p where p.id = v_m.profile_id;
  v_hash := encode(sha256(convert_to(jsonb_build_object(
      'id', v_c.id, 'perro', v_c.perro_id, 'tipo', v_c.tipo_clave, 'atendida_at', v_c.atendida_at, 'motivo', v_c.motivo, 'anamnesis', v_c.anamnesis,
      'examen_fisico', v_c.examen_fisico, 'hallazgos', v_c.hallazgos, 'peso_kg', v_c.peso_kg, 'temperatura_c', v_c.temperatura_c,
      'fc', v_c.frecuencia_cardiaca, 'fr', v_c.frecuencia_respiratoria, 'cc', v_c.condicion_corporal, 'mucosas', v_c.mucosas, 'tllc', v_c.tllc_seg,
      'hidratacion', v_c.hidratacion, 'diagnosticos', v_c.diagnosticos, 'plan', v_c.plan, 'tratamiento', v_c.tratamiento,
      'notas_internas', v_c.notas_internas, 'medico', v_m.id, 'cedula', v_m.cedula_profesional)::text, 'UTF8')), 'hex');
  update public.vet_consultas set
    estado = 'firmada', firmada_at = now(), firmada_por = auth.uid(), firma_medico_id = v_m.id, firma_nombre = v_nombre,
    firma_cedula = v_m.cedula_profesional, firma_cpa = v_m.cpa_sitpv, firma_hash = v_hash
  where id = p_id;
  -- El peso de la consulta entra al historial de pesos de la mascota (una vez por día y valor).
  if v_c.peso_kg is not null and not exists (
    select 1 from public.pesos_registrados w
    where w.perro_id = v_c.perro_id and w.fecha = public.fecha_negocio() and w.peso_kg = v_c.peso_kg and w.deleted_at is null
  ) then
    insert into public.pesos_registrados (perro_id, peso_kg, fecha, notas)
    values (v_c.perro_id, v_c.peso_kg, public.fecha_negocio(), 'Consulta veterinaria');
  end if;
  if v_c.cita_id is not null then
    update public.vet_citas set estado = 'finalizada' where id = v_c.cita_id and estado in ('en_curso', 'confirmada', 'programada');
  end if;
  return jsonb_build_object('id', p_id, 'firma_hash', v_hash, 'medico', v_nombre, 'cedula', v_m.cedula_profesional);
end;
$$;

create or replace function public.vet_consulta_adenda(p_id uuid, p_texto text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_m record;
  v_nombre text;
  v_id uuid := gen_random_uuid();
begin
  if not public.vet_puede('firmar_expediente') then
    raise exception 'Agregar una adenda es de un médico veterinario designado.' using errcode = '42501';
  end if;
  select m.id, m.cedula_profesional, m.cpa_sitpv, m.profile_id into v_m from public.medicos_veterinarios m
   where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if v_m.id is null then
    raise exception 'Solo un médico veterinario designado firma una adenda (con su cédula).' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_texto, ''))) < 3 then
    raise exception 'Escribe la adenda.';
  end if;
  select c.id, c.estado into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'firmada' then
    raise exception 'Solo se agrega una adenda a una consulta firmada.';
  end if;
  select coalesce(p.nombre_completo, 'Médico veterinario') into v_nombre from public.profiles p where p.id = v_m.profile_id;
  insert into public.vet_consulta_adendas (id, consulta_id, texto, medico_id, firma_nombre, firma_cedula, firma_cpa, firma_hash)
  values (v_id, p_id, btrim(p_texto), v_m.id, v_nombre, v_m.cedula_profesional, v_m.cpa_sitpv,
          encode(sha256(convert_to(jsonb_build_object('consulta', p_id, 'adenda', v_id, 'texto', btrim(p_texto), 'medico', v_m.id)::text, 'UTF8')), 'hex'));
  return v_id;
end;
$$;

create or replace function public.vet_consulta_anular(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
begin
  if not public.vet_puede('firmar_expediente') then
    raise exception 'Anular una consulta es de un médico veterinario designado o de admin.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  select c.id, c.estado, c.firma_medico_id, c.cita_id into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  if v_c.estado <> 'firmada' then
    raise exception 'Solo se anula una consulta firmada (un borrador se descarta).';
  end if;
  if not coalesce(public.is_admin(), false) and v_c.firma_medico_id is distinct from public.vet_mi_medico() then
    raise exception 'Solo el médico que firmó (o admin) anula la consulta.' using errcode = '42501';
  end if;
  update public.vet_consultas set estado = 'anulada', anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo) where id = p_id;
end;
$$;

-- Una consulta completa, con sus adendas, resultados y adjuntos. Anota la lectura.
create or replace function public.vet_consulta_detalle(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_res jsonb;
begin
  if not public.vet_puede_leer() then
    raise exception 'Ver el expediente es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  select c.* into v_c from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then
    raise exception 'Esa consulta no existe.';
  end if;
  perform public.vet_registrar_lectura(v_c.perro_id, 'consulta', p_id);
  select jsonb_build_object(
    'consulta', to_jsonb(v_c) - 'negocio_id' - 'created_by' - 'deleted_at',
    'mascota', (select jsonb_build_object('id', p.id, 'nombre', p.nombre, 'especie', p.especie, 'raza', p.raza, 'fecha_nacimiento', p.fecha_nacimiento, 'sexo', p.sexo, 'esterilizado', p.esterilizado)
                from public.perros p where p.id = v_c.perro_id),
    'dueno', (select jsonb_build_object('id', cl.id, 'nombre', cl.nombre, 'telefono', cl.telefono) from public.clientes cl where cl.id = v_c.cliente_id),
    'medico', (select jsonb_build_object('id', m.id, 'nombre', coalesce(pr.nombre_completo, 'Sin nombre'), 'cedula', m.cedula_profesional, 'cpa', m.cpa_sitpv)
               from public.medicos_veterinarios m left join public.profiles pr on pr.id = m.profile_id where m.id = v_c.medico_id),
    'adendas', coalesce((select jsonb_agg(to_jsonb(a) - 'negocio_id' - 'created_by' - 'deleted_at' order by a.firmada_at)
                         from public.vet_consulta_adendas a where a.consulta_id = p_id and a.deleted_at is null), '[]'::jsonb),
    'resultados', coalesce((select jsonb_agg(to_jsonb(r) - 'negocio_id' - 'created_by' - 'deleted_at' order by r.fecha_estudio desc)
                            from public.vet_resultados_lab r where r.consulta_id = p_id and r.deleted_at is null), '[]'::jsonb),
    'adjuntos', coalesce((select jsonb_agg(jsonb_build_object('id', j.id, 'nombre', j.nombre, 'descripcion', j.descripcion, 'mime', j.mime, 'bytes', j.bytes,
                                                              'creado', j.created_at, 'anulada_at', j.anulada_at, 'anulada_motivo', j.anulada_motivo) order by j.created_at)
                          from public.vet_adjuntos j where j.consulta_id = p_id and j.deleted_at is null), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;

-- Resultados de laboratorio: la bandera sale sola cuando valor y rango son numéricos.
create or replace function public.vet_capturar_resultado(
  p_perro uuid, p_consulta uuid, p_estudio text, p_fecha date, p_laboratorio text, p_parametros jsonb, p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
  v_x jsonb;
  v_lista jsonb := '[]'::jsonb;
  v_valor numeric;
  v_m text[];
  v_bandera text;
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Capturar resultados es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perros p where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null) then
    raise exception 'Esa mascota no existe.';
  end if;
  if p_consulta is not null and not exists (select 1 from public.vet_consultas c where c.id = p_consulta and c.perro_id = p_perro and c.negocio_id = public.negocio_actual() and c.deleted_at is null) then
    raise exception 'Esa consulta no es de esa mascota.';
  end if;
  if btrim(coalesce(p_estudio, '')) = '' then
    raise exception 'Escribe el nombre del estudio.';
  end if;
  if p_fecha is null or p_fecha > public.fecha_negocio() then
    raise exception 'La fecha del estudio no puede ser futura.';
  end if;
  if p_parametros is null or jsonb_typeof(p_parametros) <> 'array' or jsonb_array_length(p_parametros) = 0 or jsonb_array_length(p_parametros) > 80 then
    raise exception 'Captura al menos un parámetro (hasta 80).';
  end if;
  for v_x in select * from jsonb_array_elements(p_parametros) loop
    if btrim(coalesce(v_x ->> 'nombre', '')) = '' or btrim(coalesce(v_x ->> 'valor', '')) = '' then
      raise exception 'Cada parámetro lleva nombre y valor.';
    end if;
    v_bandera := null;
    v_m := regexp_match(coalesce(v_x ->> 'rango', ''), '^\s*(-?[0-9]+(?:[.,][0-9]+)?)\s*(?:-|–|a|hasta)\s*(-?[0-9]+(?:[.,][0-9]+)?)\s*$');
    if v_m is not null and replace(v_x ->> 'valor', ',', '.') ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' then
      v_valor := replace(btrim(v_x ->> 'valor'), ',', '.')::numeric;
      v_bandera := case when v_valor < replace(v_m[1], ',', '.')::numeric then 'bajo'
                        when v_valor > replace(v_m[2], ',', '.')::numeric then 'alto' else 'normal' end;
    end if;
    v_lista := v_lista || jsonb_build_array(jsonb_build_object(
      'nombre', btrim(v_x ->> 'nombre'), 'valor', btrim(v_x ->> 'valor'), 'unidad', nullif(btrim(coalesce(v_x ->> 'unidad', '')), ''),
      'rango', nullif(btrim(coalesce(v_x ->> 'rango', '')), ''), 'bandera', v_bandera));
  end loop;
  insert into public.vet_resultados_lab (id, perro_id, consulta_id, estudio, fecha_estudio, laboratorio, parametros, notas)
  values (v_id, p_perro, p_consulta, btrim(p_estudio), p_fecha, nullif(btrim(coalesce(p_laboratorio, '')), ''), v_lista, nullif(btrim(coalesce(p_notas, '')), ''));
  return v_id;
end;
$$;

create or replace function public.vet_anular_resultado(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Anular un resultado es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  update public.vet_resultados_lab set anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo)
   where id = p_id and negocio_id = public.negocio_actual() and anulada_at is null and deleted_at is null;
  if not found then
    raise exception 'Ese resultado no existe o ya estaba anulado.';
  end if;
end;
$$;

-- Adjuntos: el servidor sube el archivo y llama esto con su ruta; la ruta tiene que ser de ESTE negocio y mascota.
create or replace function public.vet_registrar_adjunto(
  p_perro uuid, p_consulta uuid, p_ruta text, p_nombre text, p_mime text, p_bytes bigint, p_descripcion text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Adjuntar archivos es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perros p where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null) then
    raise exception 'Esa mascota no existe.';
  end if;
  if p_consulta is not null and not exists (select 1 from public.vet_consultas c where c.id = p_consulta and c.perro_id = p_perro and c.negocio_id = public.negocio_actual() and c.deleted_at is null) then
    raise exception 'Esa consulta no es de esa mascota.';
  end if;
  if p_ruta is null or p_ruta not like public.negocio_actual()::text || '/' || p_perro::text || '/%' then
    raise exception 'La ruta del archivo no es de esta mascota.';
  end if;
  if p_mime not in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf') then
    raise exception 'Solo fotos (JPG, PNG, WebP, HEIC) y PDF.';
  end if;
  insert into public.vet_adjuntos (id, perro_id, consulta_id, nombre, descripcion, mime, bytes, ruta)
  values (v_id, p_perro, p_consulta, left(btrim(p_nombre), 200), nullif(btrim(coalesce(p_descripcion, '')), ''), p_mime, p_bytes, p_ruta);
  return v_id;
end;
$$;

create or replace function public.vet_anular_adjunto(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Anular un adjunto es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo de la anulación.';
  end if;
  update public.vet_adjuntos set anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = btrim(p_motivo)
   where id = p_id and negocio_id = public.negocio_actual() and anulada_at is null and deleted_at is null;
  if not found then
    raise exception 'Ese adjunto no existe o ya estaba anulado.';
  end if;
end;
$$;

-- La ruta de un adjunto para firmarla (el servidor) y la lectura anotada.
create or replace function public.vet_adjunto_para_leer(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a record;
begin
  if not public.vet_puede_leer() then
    raise exception 'Ver adjuntos es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  select a.id, a.perro_id, a.ruta, a.mime, a.nombre into v_a from public.vet_adjuntos a
   where a.id = p_id and a.negocio_id = public.negocio_actual() and a.deleted_at is null;
  if v_a.id is null then
    raise exception 'Ese adjunto no existe.';
  end if;
  perform public.vet_registrar_lectura(v_a.perro_id, 'adjunto', p_id);
  return jsonb_build_object('ruta', v_a.ruta, 'mime', v_a.mime, 'nombre', v_a.nombre);
end;
$$;

-- ── 9. Línea de tiempo de la mascota ─────────────────────────────────
create or replace function public.vet_linea_tiempo(p_perro uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res jsonb;
  v_zona text := public.zona_negocio();
begin
  if not public.vet_puede_leer() then
    raise exception 'Ver el expediente es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  if not exists (select 1 from public.perros p where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null) then
    raise exception 'Esa mascota no existe.';
  end if;
  perform public.vet_registrar_lectura(p_perro, 'linea_tiempo', null);
  select coalesce(jsonb_agg(x.e order by x.cuando desc), '[]'::jsonb) into v_res from (
    select c.atendida_at as cuando, jsonb_build_object('tipo', 'consulta', 'cuando', c.atendida_at, 'ref_id', c.id, 'estado', c.estado,
        'titulo', initcap(c.tipo_clave), 'detalle', coalesce(c.motivo, ''),
        'extra', coalesce((select string_agg(d ->> 'nombre', ', ') from jsonb_array_elements(c.diagnosticos) d where d ->> 'tipo' = 'definitivo'), ''),
        'medico', c.firma_nombre) as e
      from public.vet_consultas c where c.perro_id = p_perro and c.negocio_id = public.negocio_actual() and c.deleted_at is null
    union all
    select v.fecha_aplicacion::timestamp at time zone v_zona, jsonb_build_object('tipo', 'vacuna', 'cuando', v.fecha_aplicacion, 'ref_id', v.id,
        'estado', case when v.anulada_at is not null then 'anulada' else 'vigente' end, 'titulo', v.biologico, 'detalle', coalesce(v.lote_texto, ''), 'extra', '')
      from public.carnet_vacunas v where v.perro_id = p_perro and v.negocio_id = public.negocio_actual() and v.deleted_at is null
    union all
    select d.fecha_aplicacion::timestamp at time zone v_zona, jsonb_build_object('tipo', 'desparasitacion', 'cuando', d.fecha_aplicacion, 'ref_id', d.id,
        'estado', case when d.anulada_at is not null then 'anulada' else 'vigente' end, 'titulo', d.producto, 'detalle', '', 'extra', '')
      from public.carnet_desparasitaciones d where d.perro_id = p_perro and d.negocio_id = public.negocio_actual() and d.deleted_at is null
    union all
    select h.ingreso_at, jsonb_build_object('tipo', 'hospitalizacion', 'cuando', h.ingreso_at, 'ref_id', h.id, 'estado', h.estado,
        'titulo', 'Hospitalización', 'detalle', h.motivo, 'extra', coalesce(h.resumen_alta, ''))
      from public.hospitalizaciones h where h.perro_id = p_perro and h.negocio_id = public.negocio_actual() and h.deleted_at is null
    union all
    select s.fecha_emision::timestamp at time zone v_zona, jsonb_build_object('tipo', 'certificado', 'cuando', s.fecha_emision, 'ref_id', s.id, 'estado', s.estado,
        'titulo', 'Certificado de salud ' || coalesce(s.numero::text, ''), 'detalle', coalesce(s.motivo, ''), 'extra', '')
      from public.certificados_salud s where s.perro_id = p_perro and s.negocio_id = public.negocio_actual() and s.deleted_at is null
    union all
    select a.created_at, jsonb_build_object('tipo', 'adjunto', 'cuando', a.created_at, 'ref_id', a.id, 'estado', case when a.anulada_at is not null then 'anulada' else 'vigente' end,
        'titulo', a.nombre, 'detalle', coalesce(a.descripcion, ''), 'extra', a.mime, 'consulta_id', a.consulta_id)
      from public.vet_adjuntos a where a.perro_id = p_perro and a.negocio_id = public.negocio_actual() and a.deleted_at is null
    union all
    select r.fecha_estudio::timestamp at time zone v_zona, jsonb_build_object('tipo', 'laboratorio', 'cuando', r.fecha_estudio, 'ref_id', r.id,
        'estado', case when r.anulada_at is not null then 'anulada' else 'vigente' end, 'titulo', r.estudio, 'detalle', coalesce(r.laboratorio, ''),
        'extra', (select count(*) filter (where q ->> 'bandera' in ('alto', 'bajo'))::text from jsonb_array_elements(r.parametros) q), 'consulta_id', r.consulta_id)
      from public.vet_resultados_lab r where r.perro_id = p_perro and r.negocio_id = public.negocio_actual() and r.deleted_at is null
    union all
    select w.fecha::timestamp at time zone v_zona, jsonb_build_object('tipo', 'peso', 'cuando', w.fecha, 'ref_id', w.id, 'estado', 'vigente',
        'titulo', w.peso_kg::text || ' kg', 'detalle', coalesce(w.notas, ''), 'extra', '')
      from public.pesos_registrados w where w.perro_id = p_perro and w.negocio_id = public.negocio_actual() and w.deleted_at is null
  ) x;
  return v_res;
end;
$$;

create or replace function public.vet_consultas_de_mascota(p_perro uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.vet_puede_leer() then
    return '[]'::jsonb;
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'estado', c.estado, 'tipo_clave', c.tipo_clave, 'atendida_at', c.atendida_at, 'motivo', c.motivo,
        'medico', c.firma_nombre) order by c.atendida_at desc)
    from public.vet_consultas c where c.perro_id = p_perro and c.negocio_id = public.negocio_actual() and c.deleted_at is null
  ), '[]'::jsonb);
end;
$$;

-- ── 10. Portal: lo que el dueño ve de las consultas firmadas ─────────
create or replace function public.mi_expediente(p_perro uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.mi_cliente_id();
  v_zona text := public.zona_negocio();
begin
  if v_cliente is null or not coalesce(public.modulo_activo('veterinaria'), false) then
    return null;
  end if;
  if not exists (
    select 1 from public.perros p
    where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null
      and (p.cliente_id = v_cliente or exists (
        select 1 from public.perro_accesos_compartidos pac
        where pac.perro_id = p.id and pac.cliente_id = v_cliente and pac.deleted_at is null))
  ) then
    return null;
  end if;
  if not coalesce((select a.portal_expediente from public.veterinaria_ajustes a where a.negocio_id = public.negocio_actual() and a.deleted_at is null), false) then
    return jsonb_build_object('habilitado', false, 'consultas', '[]'::jsonb);
  end if;
  return jsonb_build_object('habilitado', true, 'consultas', coalesce((
    select jsonb_agg(jsonb_build_object(
      'fecha', (c.atendida_at at time zone v_zona)::date, 'tipo', c.tipo_clave, 'medico', c.firma_nombre,
      'diagnostico', coalesce((select string_agg(d ->> 'nombre', ', ') from jsonb_array_elements(c.diagnosticos) d where d ->> 'tipo' = 'definitivo'), ''),
      'plan', coalesce(c.plan, '')) order by c.atendida_at desc)
    from public.vet_consultas c
    where c.perro_id = p_perro and c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado = 'firmada'
  ), '[]'::jsonb));
end;
$$;

-- ── 11. Aviso de «Necesita atención» y apagar el módulo ──────────────
create or replace function public.veterinaria_atencion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
begin
  if not coalesce(public.is_staff(), false) or not coalesce(public.modulo_activo('veterinaria'), false) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object(
    'recordatorios_pendientes', case when public.vet_puede('registrar_vacunas') then
        (select count(*) from public.carnet_recordatorios r where r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.estado in ('pendiente', 'fallido')
            and r.proxima_dosis <= v_hoy + 14) else 0 end,
    'recordatorio_mas_viejo', case when public.vet_puede('registrar_vacunas') then
        (select min(r.proxima_dosis) from public.carnet_recordatorios r where r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.estado in ('pendiente', 'fallido')
            and r.proxima_dosis <= v_hoy + 14) else null end,
    'dosis_atrasadas', case when public.vet_puede('hospitalizar') then
        (select count(*) from public.hospitalizacion_dosis d join public.hospitalizaciones h on h.id = d.hospitalizacion_id and h.estado = 'ingresado'
          where d.negocio_id = public.negocio_actual() and d.estado = 'pendiente' and d.programada_at < now() - interval '15 minutes') else 0 end,
    'dosis_mas_vieja', case when public.vet_puede('hospitalizar') then
        (select min(d.programada_at) from public.hospitalizacion_dosis d join public.hospitalizaciones h on h.id = d.hospitalizacion_id and h.estado = 'ingresado'
          where d.negocio_id = public.negocio_actual() and d.estado = 'pendiente' and d.programada_at < now() - interval '15 minutes') else null end,
    'consentimientos_pendientes', case when public.vet_puede('hospitalizar') then
        (select count(*) from public.consentimientos c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado = 'pendiente_firma') else 0 end,
    'consentimiento_mas_viejo', case when public.vet_puede('hospitalizar') then
        (select min(c.created_at) from public.consentimientos c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado = 'pendiente_firma') else null end,
    -- Fase 3: consultas que se quedaron en borrador más de un día (las ve quien las puede firmar).
    'consultas_sin_firmar', case when public.vet_puede('firmar_expediente') then
        (select count(*) from public.vet_consultas c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado = 'borrador'
            and c.created_at < now() - interval '24 hours') else 0 end,
    'consulta_mas_vieja', case when public.vet_puede('firmar_expediente') then
        (select min(c.created_at) from public.vet_consultas c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado = 'borrador'
            and c.created_at < now() - interval '24 hours') else null end
  );
end;
$$;

do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.impacto_apagar_modulo(text)'::regprocedure);
  if v_def not like '%cita(s) veterinaria(s)%' then
    v_def := replace(v_def,
      $a$    if to_regclass('public.hospitalizaciones') is not null then$a$,
      $b$    if to_regclass('public.vet_citas') is not null then
      declare
        v_c int;
        v_b int;
      begin
        select count(*) into v_c from public.vet_citas where estado in ('programada', 'confirmada') and inicia_at >= now() and deleted_at is null;
        select count(*) into v_b from public.vet_consultas where estado = 'borrador' and deleted_at is null;
        v_n := v_n + v_c + v_b;
        if v_c > 0 then
          v_que := v_que || ' y ' || v_c || ' cita(s) veterinaria(s) por venir';
        end if;
        if v_b > 0 then
          v_que := v_que || ' y ' || v_b || ' consulta(s) en borrador';
        end if;
      end;
    end if;
    if to_regclass('public.hospitalizaciones') is not null then$b$);
    if v_def not like '%cita(s) veterinaria(s)%' then
      raise exception 'No se pudo parchar impacto_apagar_modulo: cambió su texto.';
    end if;
    execute v_def;
  end if;
end;
$$;

-- ── 12. Eventos de la plataforma: el catálogo de diagnósticos ────────
do $$
declare
  v_def text;
  v_acciones text[];
  v_nuevas text[] := array['editar_diagnostico_vet'];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  -- La lista puede venir como ARRAY['a'::text, …] o como '{a,b,…}'::text[].
  if position('{' in v_def) > 0 then
    v_acciones := string_to_array(substring(v_def from '{([a-z_0-9,]+)}'), ',');
  else
    select coalesce(array_agg(distinct m[1]), '{}') into v_acciones
    from regexp_matches(v_def, '''([a-z_0-9]+)''', 'g') as m;
  end if;
  if cardinality(v_acciones) < 5 then
    raise exception 'No se pudo leer la lista de acciones de plataforma_eventos.';
  end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || v_nuevas) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

-- ── 13. Tabla compartida y funciones de postgres, a la auditoría ─────
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('vet_diagnosticos' in v_def) = 0 then
    v_def := replace(v_def, $a$compartidas(nombre) as (values $a$, $b$compartidas(nombre) as (values ('vet_diagnosticos'), $b$);
    v_def := replace(v_def, $a$('bot_cuenta_por_telefono')$a$,
      $b$('bot_cuenta_por_telefono'), ('plataforma_guardar_diagnostico'), ('plataforma_baja_diagnostico'), ('plataforma_diagnosticos_de_negocios')$b$);
    if position('vet_diagnosticos' in v_def) = 0 or position('plataforma_baja_diagnostico' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar el catálogo de diagnósticos.';
    end if;
    execute v_def;
  end if;
end $$;

-- ── 14. Dueños y grants ──────────────────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'vet_puede_leer()', 'vet_agenda_puede()', 'veterinaria_ajustes_actuales()', 'guardar_veterinaria_portal(boolean)',
    'vet_sembrar_agenda()', 'vet_tipos_cita_lista()', 'guardar_tipo_cita(text,text,int,boolean)', 'vet_medicos_lista()',
    'vet_agendar_cita(uuid,text,uuid,timestamptz,int,text)', 'vet_reprogramar_cita(uuid,timestamptz,uuid,int)',
    'vet_cita_estado(uuid,text,text)', 'vet_agenda(date,date,uuid)',
    'vet_sembrar_plantillas()', 'vet_plantillas_consulta()', 'guardar_plantilla_consulta(text,jsonb)',
    'vet_buscar_diagnosticos(text,text,int)', 'vet_agregar_diagnostico_negocio(text,text,text[],text[])',
    'vet_registrar_lectura(uuid,text,uuid)', 'vet_lecturas_lista(uuid,int)',
    'vet_consulta_iniciar(uuid,uuid,text,uuid)', 'vet_consulta_guardar(uuid,jsonb)', 'vet_consulta_descartar(uuid)',
    'vet_consulta_firmar(uuid)', 'vet_consulta_adenda(uuid,text)', 'vet_consulta_anular(uuid,text)', 'vet_consulta_detalle(uuid)',
    'vet_capturar_resultado(uuid,uuid,text,date,text,jsonb,text)', 'vet_anular_resultado(uuid,text)',
    'vet_registrar_adjunto(uuid,uuid,text,text,text,bigint,text)', 'vet_anular_adjunto(uuid,text)', 'vet_adjunto_para_leer(uuid)',
    'vet_linea_tiempo(uuid)', 'vet_consultas_de_mascota(uuid)', 'mi_expediente(uuid)', 'veterinaria_atencion()'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Internas: solo las llaman otras funciones, ya con sus permisos comprobados.
  foreach f in array array['vet_sembrar_agenda()', 'vet_sembrar_plantillas()'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
  -- De la plataforma (postgres, en la lista blanca): el permiso lo comprueba la función.
  foreach f in array array['plataforma_guardar_diagnostico(uuid,text,text,text[],text[])', 'plataforma_baja_diagnostico(uuid)', 'plataforma_diagnosticos_de_negocios()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;
-- vet_norm y vet_plantilla_base son funciones puras: nadie con la llave anónima.
revoke execute on function public.vet_norm(text) from public, anon;
grant execute on function public.vet_norm(text) to authenticated, service_role, peludesk_definer;
revoke execute on function public.vet_plantilla_base(text) from public, anon;
grant execute on function public.vet_plantilla_base(text) to authenticated, service_role, peludesk_definer;
alter function public.vet_consulta_inmutable() owner to peludesk_definer;
