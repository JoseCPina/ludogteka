-- Veterinaria, Fase 0 · parte 3: médico veterinario y datos del establecimiento.
--
-- MÉDICO VETERINARIO. No es una cuenta distinta: es una DESIGNACIÓN sobre una
-- persona del personal (admin, recepción o estética) que el admin captura con
-- su cédula profesional y su CPA del SITPV. Así el médico entra con la misma
-- cuenta y los permisos que ya tiene, y «quién firma» sale de una sola tabla
-- (`medicos_veterinarios`, `es_medico_veterinario()`). Solo esa designación
-- firmará expediente y recetas en las fases siguientes: esta fase deja la
-- identidad y los folios, no la firma.
-- FOLIOS. Cada médico tiene bloques de folios asignados (`medico_folios`: un
-- rango, con lo que ya llevaba usado al capturarlo) y cada folio usado queda
-- en `medico_folios_usados` (inmutable, un folio no se usa dos veces). El
-- contador de usados se DERIVA (`medico_folios_resumen`); nadie lo escribe.
-- ESTABLECIMIENTO. Aviso de Inicio de Funcionamiento ante SENASICA, MVRA
-- responsable y la lista de permisos con vencimiento y recordatorio.
--
-- Todo es del módulo Veterinaria (triggers `exigir_modulo`) y se escribe solo
-- por funciones.

-- Ayudante de esta migración y de la siguiente: las dos redes del negocio,
-- las tres políticas de solo lectura, el trigger de módulo y los permisos de
-- una tabla nueva. Se borra al final de la migración del inventario.
create or replace function public._veterinaria_redes(p_tabla text, p_lectura text, p_modulo text default 'veterinaria')
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
  execute format('create trigger exigir_modulo before insert or update on public.%I for each row execute function public.exigir_modulo_tabla(%L)', p_tabla, p_modulo);
end;
$$;
revoke execute on function public._veterinaria_redes(text, text, text) from public, anon, authenticated;

-- ── 1. Médicos veterinarios ──────────────────────────────────────────

create table public.medicos_veterinarios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  profile_id uuid not null references public.profiles(id),
  cedula_profesional text not null check (btrim(cedula_profesional) <> ''),
  cpa_sitpv text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index medicos_veterinarios_persona on public.medicos_veterinarios (negocio_id, profile_id) where deleted_at is null;
create unique index medicos_veterinarios_cedula on public.medicos_veterinarios (negocio_id, lower(cedula_profesional)) where deleted_at is null;
select public._veterinaria_redes('medicos_veterinarios', '(select public.is_staff())');

create table public.medico_folios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  medico_id uuid not null references public.medicos_veterinarios(id),
  prefijo text not null default '',
  folio_desde bigint not null check (folio_desde >= 0),
  folio_hasta bigint not null,
  -- Cuántos de este bloque ya se habían usado cuando se capturó (los folios
  -- que se usen desde la app se cuentan aparte, en medico_folios_usados).
  usados_previos int not null default 0 check (usados_previos >= 0),
  asignado_el date not null default public.fecha_negocio(),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (folio_hasta >= folio_desde),
  check (usados_previos <= folio_hasta - folio_desde + 1)
);
create index medico_folios_medico_idx on public.medico_folios (medico_id);
select public._veterinaria_redes('medico_folios', '(select public.is_admin()) or medico_id in (select m.id from public.medicos_veterinarios m where m.profile_id = (select auth.uid()))');

create table public.medico_folios_usados (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  bloque_id uuid not null references public.medico_folios(id),
  medico_id uuid not null references public.medicos_veterinarios(id),
  folio bigint not null,
  folio_texto text not null,
  -- Para qué se usó (receta, certificado…); lo llenan las fases siguientes.
  referencia_tipo text not null default 'sin_referencia',
  referencia_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (bloque_id, folio)
);
create index medico_folios_usados_medico_idx on public.medico_folios_usados (medico_id);
select public._veterinaria_redes('medico_folios_usados', '(select public.is_admin()) or medico_id in (select m.id from public.medicos_veterinarios m where m.profile_id = (select auth.uid()))');

create or replace function public.medico_folios_usados_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Un folio usado no se edita ni se borra.' using errcode = '42501';
end;
$$;
revoke execute on function public.medico_folios_usados_inmutable() from public, anon;
create trigger medico_folios_usados_inmutable before update or delete on public.medico_folios_usados
  for each row execute function public.medico_folios_usados_inmutable();

-- Asignados, usados y disponibles por bloque (el contador de usados).
create view public.medico_folios_resumen with (security_invoker = true) as
select f.id as bloque_id, f.negocio_id, f.medico_id, f.prefijo, f.folio_desde, f.folio_hasta, f.asignado_el, f.nota,
       (f.folio_hasta - f.folio_desde + 1)::int as asignados,
       (f.usados_previos + coalesce(u.n, 0))::int as usados,
       ((f.folio_hasta - f.folio_desde + 1) - f.usados_previos - coalesce(u.n, 0))::int as disponibles
from public.medico_folios f
left join lateral (select count(*) as n from public.medico_folios_usados x where x.bloque_id = f.id and x.deleted_at is null) u on true
where f.deleted_at is null;
revoke all on public.medico_folios_resumen from anon, authenticated;
grant select on public.medico_folios_resumen to authenticated;

-- ¿Quien llama es médico veterinario designado de este negocio?
create or replace function public.es_medico_veterinario()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.modulo_activo('veterinaria'), false) and exists (
    select 1 from public.medicos_veterinarios m
    where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null
  );
$$;
alter function public.es_medico_veterinario() owner to peludesk_definer;
revoke execute on function public.es_medico_veterinario() from public, anon;
grant execute on function public.es_medico_veterinario() to authenticated, service_role, peludesk_definer;

create or replace function public.guardar_medico_veterinario(p_profile_id uuid, p_cedula text, p_cpa text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin designa a los médicos veterinarios.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_cedula, '')) = '' then
    raise exception 'Escribe la cédula profesional del médico.';
  end if;
  if not exists (select 1 from public.membresias m
                 where m.profile_id = p_profile_id and m.negocio_id = public.negocio_actual() and m.deleted_at is null
                   and m.rol in ('admin', 'recepcion', 'estetica')) then
    raise exception 'Esa persona no es del personal de este negocio. Invítala primero en Administración → Personal.';
  end if;
  select id into v_id from public.medicos_veterinarios
  where profile_id = p_profile_id and negocio_id = public.negocio_actual() and deleted_at is null;
  if v_id is null then
    insert into public.medicos_veterinarios (profile_id, cedula_profesional, cpa_sitpv)
    values (p_profile_id, btrim(p_cedula), nullif(btrim(coalesce(p_cpa, '')), ''))
    returning id into v_id;
  else
    update public.medicos_veterinarios set cedula_profesional = btrim(p_cedula), cpa_sitpv = nullif(btrim(coalesce(p_cpa, '')), '')
    where id = v_id;
  end if;
  return v_id;
exception
  when unique_violation then
    raise exception 'Esa cédula profesional ya está registrada en este negocio.';
end;
$$;
alter function public.guardar_medico_veterinario(uuid, text, text) owner to peludesk_definer;

create or replace function public.quitar_medico_veterinario(p_medico_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin quita la designación de médico veterinario.' using errcode = '42501';
  end if;
  -- Sus folios y los ya usados se conservan; solo deja de ser médico.
  update public.medicos_veterinarios set deleted_at = now()
  where id = p_medico_id and negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    raise exception 'Ese médico no existe.';
  end if;
end;
$$;
alter function public.quitar_medico_veterinario(uuid) owner to peludesk_definer;

create or replace function public.asignar_folios_medico(
  p_medico_id uuid, p_prefijo text, p_desde bigint, p_hasta bigint, p_usados_previos int default 0, p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_prefijo text := btrim(coalesce(p_prefijo, ''));
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin asigna folios a un médico.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.medicos_veterinarios m where m.id = p_medico_id and m.negocio_id = public.negocio_actual() and m.deleted_at is null) then
    raise exception 'Ese médico no existe.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de folios no es válido: el último tiene que ser mayor o igual al primero.';
  end if;
  if exists (select 1 from public.medico_folios f
             where f.negocio_id = public.negocio_actual() and f.deleted_at is null and f.prefijo = v_prefijo
               and f.folio_desde <= p_hasta and f.folio_hasta >= p_desde) then
    raise exception 'Ese rango se empalma con folios que ya están asignados (a este médico o a otro).';
  end if;
  insert into public.medico_folios (medico_id, prefijo, folio_desde, folio_hasta, usados_previos, nota)
  values (p_medico_id, v_prefijo, p_desde, p_hasta, coalesce(p_usados_previos, 0), nullif(btrim(coalesce(p_nota, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
alter function public.asignar_folios_medico(uuid, text, bigint, bigint, int, text) owner to peludesk_definer;

-- Toma el siguiente folio libre del médico. SOLO lo puede pedir el propio
-- médico (quien firma): un admin que no es médico no gasta folios ajenos.
-- Lo usarán las recetas de las fases siguientes.
create or replace function public.usar_folio_medico(p_tipo text default 'sin_referencia', p_referencia uuid default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_medico uuid;
  v_bloque record;
  v_usados int;
  v_folio bigint;
  v_texto text;
begin
  if not public.es_medico_veterinario() then
    raise exception 'Solo un médico veterinario designado usa sus folios.' using errcode = '42501';
  end if;
  select m.id into v_medico from public.medicos_veterinarios m
  where m.profile_id = auth.uid() and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  for v_bloque in
    select f.* from public.medico_folios f
    where f.medico_id = v_medico and f.deleted_at is null
    order by f.folio_desde
    for update
  loop
    select count(*) into v_usados from public.medico_folios_usados u where u.bloque_id = v_bloque.id and u.deleted_at is null;
    if v_bloque.usados_previos + v_usados < v_bloque.folio_hasta - v_bloque.folio_desde + 1 then
      v_folio := v_bloque.folio_desde + v_bloque.usados_previos + v_usados;
      v_texto := v_bloque.prefijo || v_folio::text;
      insert into public.medico_folios_usados (bloque_id, medico_id, folio, folio_texto, referencia_tipo, referencia_id)
      values (v_bloque.id, v_medico, v_folio, v_texto, coalesce(nullif(btrim(coalesce(p_tipo, '')), ''), 'sin_referencia'), p_referencia);
      return v_texto;
    end if;
  end loop;
  raise exception 'No te quedan folios disponibles. Pide a un admin que te asigne más.';
end;
$$;
alter function public.usar_folio_medico(text, uuid) owner to peludesk_definer;

-- ── 2. Establecimiento ───────────────────────────────────────────────

create table public.negocio_establecimiento (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  -- Número del Aviso de Inicio de Funcionamiento ante SENASICA.
  aviso_funcionamiento_senasica text,
  aviso_funcionamiento_fecha date,
  -- Médico Veterinario Responsable Autorizado. Puede ser alguien del
  -- personal ya designado (mvra_medico_id) o solo su nombre y cédula.
  mvra_medico_id uuid references public.medicos_veterinarios(id),
  mvra_nombre text,
  mvra_cedula text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index negocio_establecimiento_uno on public.negocio_establecimiento (negocio_id) where deleted_at is null;
select public._veterinaria_redes('negocio_establecimiento', '(select public.is_staff())');

create table public.establecimiento_permisos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tipo text not null check (btrim(tipo) <> ''),
  numero text,
  autoridad text,
  nivel text not null check (nivel in ('federal', 'estatal', 'municipal')),
  emision date,
  -- Sin vencimiento = el permiso no vence.
  vencimiento date,
  -- Con cuántos días de anticipación empieza a avisar.
  aviso_dias int not null default 60 check (aviso_dias between 0 and 730),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (vencimiento is null or emision is null or vencimiento >= emision)
);
create index establecimiento_permisos_venc_idx on public.establecimiento_permisos (negocio_id, vencimiento) where deleted_at is null;
select public._veterinaria_redes('establecimiento_permisos', '(select public.is_staff())');

create or replace function public.guardar_establecimiento(
  p_aviso text, p_aviso_fecha date, p_mvra_medico_id uuid, p_mvra_nombre text, p_mvra_cedula text, p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Los datos del establecimiento los edita un admin o quien tenga «Configuración del negocio».' using errcode = '42501';
  end if;
  if p_mvra_medico_id is not null and not exists (
       select 1 from public.medicos_veterinarios m where m.id = p_mvra_medico_id and m.negocio_id = public.negocio_actual() and m.deleted_at is null) then
    raise exception 'Ese médico no está designado en este negocio.';
  end if;
  select id into v_id from public.negocio_establecimiento where negocio_id = public.negocio_actual() and deleted_at is null;
  if v_id is null then
    insert into public.negocio_establecimiento (aviso_funcionamiento_senasica, aviso_funcionamiento_fecha, mvra_medico_id, mvra_nombre, mvra_cedula, notas)
    values (nullif(btrim(coalesce(p_aviso, '')), ''), p_aviso_fecha, p_mvra_medico_id,
            nullif(btrim(coalesce(p_mvra_nombre, '')), ''), nullif(btrim(coalesce(p_mvra_cedula, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''))
    returning id into v_id;
  else
    update public.negocio_establecimiento
    set aviso_funcionamiento_senasica = nullif(btrim(coalesce(p_aviso, '')), ''), aviso_funcionamiento_fecha = p_aviso_fecha,
        mvra_medico_id = p_mvra_medico_id, mvra_nombre = nullif(btrim(coalesce(p_mvra_nombre, '')), ''),
        mvra_cedula = nullif(btrim(coalesce(p_mvra_cedula, '')), ''), notas = nullif(btrim(coalesce(p_notas, '')), '')
    where id = v_id;
  end if;
  return v_id;
end;
$$;
alter function public.guardar_establecimiento(text, date, uuid, text, text, text) owner to peludesk_definer;

create or replace function public.guardar_permiso_establecimiento(
  p_id uuid, p_tipo text, p_numero text, p_autoridad text, p_nivel text, p_emision date, p_vencimiento date,
  p_aviso_dias int default 60, p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Los permisos del establecimiento los edita un admin o quien tenga «Configuración del negocio».' using errcode = '42501';
  end if;
  if btrim(coalesce(p_tipo, '')) = '' then
    raise exception 'Escribe de qué es el permiso (licencia de funcionamiento, aviso, etc.).';
  end if;
  if p_nivel not in ('federal', 'estatal', 'municipal') then
    raise exception 'El nivel es federal, estatal o municipal.';
  end if;
  if p_id is null then
    insert into public.establecimiento_permisos (tipo, numero, autoridad, nivel, emision, vencimiento, aviso_dias, notas)
    values (btrim(p_tipo), nullif(btrim(coalesce(p_numero, '')), ''), nullif(btrim(coalesce(p_autoridad, '')), ''), p_nivel,
            p_emision, p_vencimiento, coalesce(p_aviso_dias, 60), nullif(btrim(coalesce(p_notas, '')), ''))
    returning id into v_id;
  else
    update public.establecimiento_permisos
    set tipo = btrim(p_tipo), numero = nullif(btrim(coalesce(p_numero, '')), ''), autoridad = nullif(btrim(coalesce(p_autoridad, '')), ''),
        nivel = p_nivel, emision = p_emision, vencimiento = p_vencimiento, aviso_dias = coalesce(p_aviso_dias, 60),
        notas = nullif(btrim(coalesce(p_notas, '')), '')
    where id = p_id and negocio_id = public.negocio_actual() and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese permiso no existe.';
    end if;
  end if;
  return v_id;
end;
$$;
alter function public.guardar_permiso_establecimiento(uuid, text, text, text, text, date, date, int, text) owner to peludesk_definer;

create or replace function public.quitar_permiso_establecimiento(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Los permisos del establecimiento los edita un admin o quien tenga «Configuración del negocio».' using errcode = '42501';
  end if;
  update public.establecimiento_permisos set deleted_at = now()
  where id = p_id and negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    raise exception 'Ese permiso no existe.';
  end if;
end;
$$;
alter function public.quitar_permiso_establecimiento(uuid) owner to peludesk_definer;

-- Recordatorio de vencimiento: los permisos vencidos y los que vencen dentro
-- de su ventana de aviso. Solo para quien edita la configuración, y vacío con
-- Veterinaria apagada. `dias` es negativo si ya venció (cuántos días lleva
-- vencido = -dias); la pantalla lo muestra con su antigüedad.
create or replace function public.permisos_establecimiento_por_vencer()
returns table (id uuid, tipo text, numero text, autoridad text, nivel text, vencimiento date, dias int, estado text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.tipo, p.numero, p.autoridad, p.nivel, p.vencimiento,
         (p.vencimiento - public.fecha_negocio())::int,
         case when p.vencimiento < public.fecha_negocio() then 'vencido' else 'por_vencer' end
  from public.establecimiento_permisos p
  where coalesce(public.tiene_permiso('configuracion_negocio'), false)
    and public.modulo_activo('veterinaria')
    and p.negocio_id = public.negocio_actual() and p.deleted_at is null
    and p.vencimiento is not null
    and p.vencimiento - public.fecha_negocio() <= p.aviso_dias
  order by p.vencimiento;
$$;
alter function public.permisos_establecimiento_por_vencer() owner to peludesk_definer;

do $$
declare
  f text;
begin
  foreach f in array array[
    'es_medico_veterinario()', 'guardar_medico_veterinario(uuid, text, text)', 'quitar_medico_veterinario(uuid)',
    'asignar_folios_medico(uuid, text, bigint, bigint, int, text)', 'usar_folio_medico(text, uuid)',
    'guardar_establecimiento(text, date, uuid, text, text, text)',
    'guardar_permiso_establecimiento(uuid, text, text, text, text, date, date, int, text)',
    'quitar_permiso_establecimiento(uuid)', 'permisos_establecimiento_por_vencer()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
