-- PeluDesk, paso 2: funciones, políticas de cliente, Storage y grupos de
-- raza por negocio (25 de septiembre de 2026).
--
-- Cada función que leía profiles.rol / profiles.cliente_id pasa a leer la
-- membresía en el negocio actual. Las que leen auth.users se quedan como
-- `postgres` (el rol definer no puede leer auth.users) y filtran el negocio
-- a mano, una por una. Todas las demás funciones SECURITY DEFINER pasan al
-- rol `peludesk_definer` al final de este archivo.

-- ── 1. Identidad y empleado del negocio actual ──────────────────────

create or replace function public.mi_empleado_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.empleados
  where profile_id = auth.uid()
    and negocio_id = public.negocio_actual()
    and deleted_at is null
  limit 1;
$$;

-- Liga una cuenta con su expediente de cliente EN EL NEGOCIO ACTUAL:
-- crea la membresía de cliente, o completa la que ya tenía sin expediente.
-- Interna (la llaman el alta y el complemento, que ya validaron el link).
create or replace function public.vincular_membresia_cliente(p_user_id uuid, p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.membresias%rowtype;
begin
  if public.negocio_actual() is null then
    raise exception 'Falta el negocio de la petición.';
  end if;
  select * into v_m from public.membresias
  where profile_id = p_user_id and negocio_id = public.negocio_actual() and deleted_at is null
  for update;

  perform set_config('app.vinculacion_interna', 'on', true);
  if not found then
    insert into public.membresias (negocio_id, profile_id, rol, cliente_id, created_by)
    values (public.negocio_actual(), p_user_id, 'cliente', p_cliente_id, p_user_id);
  elsif v_m.rol <> 'cliente' then
    raise exception 'Esa cuenta es del personal de este negocio; para ser cliente aquí usa otro teléfono.';
  elsif v_m.cliente_id is not null and v_m.cliente_id <> p_cliente_id then
    raise exception 'Esa cuenta ya está ligada a un expediente.';
  elsif v_m.cliente_id is null then
    update public.membresias set cliente_id = p_cliente_id where id = v_m.id;
  end if;

  insert into public.vinculacion_eventos (profile_id, cliente_id, accion, actor_id, automatico)
  values (p_user_id, p_cliente_id, 'vincular', p_user_id, true);
end;
$$;
revoke execute on function public.vincular_membresia_cliente(uuid, uuid) from public, anon, authenticated;

-- ── 2. Funciones del cliente (su expediente en este negocio) ────────

create or replace function public.cuenta_de_cliente_para_restablecer(p_cliente_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden restablecer una contraseña.';
  end if;

  select m.profile_id into v_id
  from public.membresias m
  where m.cliente_id = p_cliente_id
    and m.negocio_id = public.negocio_actual()
    and m.rol = 'cliente'
    and m.deleted_at is null
  limit 1;

  if v_id is null then
    raise exception 'Ese cliente todavía no tiene cuenta. Mándale un link de alta para que la cree.';
  end if;
  return v_id;
end;
$$;

-- ¿Ese teléfono ya es cliente de ESTE negocio, y tiene cuenta aquí?
create or replace function public.estado_telefono_alta(p_telefono text)
returns table (existe_cliente boolean, tiene_cuenta boolean, nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id is not null,
    coalesce(m.profile_id is not null, false),
    c.nombre
  from (select 1) as _dummy
  left join lateral (
    select cl.id, cl.nombre
    from public.clientes cl
    where cl.telefono = p_telefono and cl.deleted_at is null
      and cl.negocio_id = public.negocio_actual()
    limit 1
  ) c on true
  left join lateral (
    select mm.profile_id from public.membresias mm
    where mm.cliente_id = c.id and mm.deleted_at is null
    limit 1
  ) m on true;
$$;

-- ── 3. Personal y cuentas (leen auth.users: dueño postgres, filtro a mano) ──

create or replace function public.asignar_rol_staff(p_user_id uuid, p_rol text, p_nombre_completo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.membresias%rowtype;
begin
  if p_rol not in ('recepcion', 'estetica') then
    raise exception 'Rol no invitable: %', p_rol;
  end if;
  if public.negocio_actual() is null then
    raise exception 'Falta el negocio de la petición.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'La cuenta no existe todavía.';
  end if;

  select * into v_m from public.membresias
  where profile_id = p_user_id and negocio_id = public.negocio_actual() and deleted_at is null;

  perform set_config('app.asignacion_rol_interna', 'on', true);
  if not found then
    insert into public.membresias (negocio_id, profile_id, rol, created_by)
    values (public.negocio_actual(), p_user_id, p_rol, auth.uid());
  elsif v_m.rol <> 'cliente' or v_m.cliente_id is not null then
    raise exception 'Esa cuenta ya tiene rol % en este negocio; no se reasigna por invitación.', v_m.rol;
  else
    update public.membresias set rol = p_rol where id = v_m.id;
  end if;

  update public.profiles
  set nombre_completo = coalesce(nullif(btrim(coalesce(p_nombre_completo, '')), ''), nombre_completo)
  where id = p_user_id;
end;
$$;
revoke execute on function public.asignar_rol_staff(uuid, text, text) from public, anon, authenticated;
grant execute on function public.asignar_rol_staff(uuid, text, text) to service_role;

create or replace function public.otorgar_permiso(p_profile_id uuid, p_permiso text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_id uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede dar permisos.';
  end if;

  select m.rol into v_rol from public.membresias m
  where m.profile_id = p_profile_id and m.negocio_id = public.negocio_actual() and m.deleted_at is null;
  if v_rol is null then
    raise exception 'No encontramos esa cuenta en este negocio.';
  end if;
  if v_rol <> 'recepcion' then
    raise exception 'Los permisos extra solo se le dan a alguien de recepción.';
  end if;

  select id into v_id from public.permisos_staff
  where profile_id = p_profile_id and permiso = p_permiso
    and negocio_id = public.negocio_actual()
    and revocado_at is null and deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.permisos_staff (negocio_id, profile_id, permiso, created_by)
  values (public.negocio_actual(), p_profile_id, p_permiso, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.validar_cuenta_de_empleado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null and not exists (
    select 1 from public.membresias m
    where m.profile_id = new.profile_id
      and m.negocio_id = new.negocio_id
      and m.rol in ('admin', 'recepcion', 'estetica')
      and m.deleted_at is null
  ) then
    raise exception 'Solo se puede ligar una cuenta del personal de este negocio (admin, recepción o estética).';
  end if;
  return new;
end;
$$;

create or replace function public.cuentas_para_empleado()
returns table (id uuid, nombre_completo text, rol text, email text, empleado_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», puede ligar cuentas a empleados.';
  end if;
  return query
  select p.id, p.nombre_completo, m.rol, u.email::text,
    (select e.id from public.empleados e
      where e.profile_id = p.id and e.negocio_id = m.negocio_id and e.deleted_at is null limit 1)
  from public.membresias m
  join public.profiles p on p.id = m.profile_id
  join auth.users u on u.id = p.id
  where m.negocio_id = public.negocio_actual()
    and m.rol in ('admin', 'recepcion', 'estetica')
    and m.deleted_at is null
  order by p.nombre_completo nulls last, u.email;
end;
$$;

-- Login por teléfono: la cuenta del cliente con ese teléfono EN ESTE
-- negocio (cuentas viejas conservan su correo real; las nuevas usan el
-- correo sintético del número, que el login calcula si esto da NULL).
create or replace function public.email_de_login_por_telefono(p_telefono text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.clientes c
  join public.membresias m on m.cliente_id = c.id and m.deleted_at is null
  join auth.users u on u.id = m.profile_id
  where c.telefono = p_telefono
    and c.deleted_at is null
    and c.negocio_id = public.negocio_actual()
  limit 1;
$$;

create or replace function public.listar_cuentas()
returns table (id uuid, email text, rol text, cliente_id uuid, creado_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver esto.';
  end if;
  return query
    select p.id, u.email::text, m.rol, m.cliente_id, m.created_at
    from public.membresias m
    join public.profiles p on p.id = m.profile_id
    join auth.users u on u.id = p.id
    where m.negocio_id = public.negocio_actual() and m.deleted_at is null and p.deleted_at is null
    order by m.created_at desc;
end;
$$;

create or replace function public.listar_cuentas_sin_vincular()
returns table (id uuid, email text, creado_en timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.current_rol() in ('admin', 'recepcion')) then
    raise exception 'No tienes permiso para ver esto.';
  end if;
  return query
    select p.id, u.email::text, m.created_at
    from public.membresias m
    join public.profiles p on p.id = m.profile_id
    join auth.users u on u.id = p.id
    where m.negocio_id = public.negocio_actual()
      and m.rol = 'cliente'
      and m.cliente_id is null
      and m.deleted_at is null
      and p.deleted_at is null
    order by m.created_at asc;
end;
$$;

create or replace function public.listar_cuentas_vinculadas()
returns table (profile_id uuid, email text, cliente_id uuid, cliente_nombre text, cliente_telefono text, vinculado_en timestamptz, vinculado_por text, automatico boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.current_rol() in ('admin', 'recepcion')) then
    raise exception 'No tienes permiso para ver esto.';
  end if;
  return query
    select p.id, u.email::text, c.id, c.nombre, c.telefono, ev.created_at, actor.email::text, ev.automatico
    from public.membresias m
    join public.profiles p on p.id = m.profile_id
    join auth.users u on u.id = p.id
    join public.clientes c on c.id = m.cliente_id and c.negocio_id = m.negocio_id
    left join lateral (
      select e.created_at, e.actor_id, e.automatico
      from public.vinculacion_eventos e
      where e.profile_id = p.id and e.accion = 'vincular' and e.negocio_id = m.negocio_id
      order by e.created_at desc
      limit 1
    ) ev on true
    left join auth.users actor on actor.id = ev.actor_id
    where m.negocio_id = public.negocio_actual()
      and m.rol = 'cliente'
      and m.cliente_id is not null
      and m.deleted_at is null
      and p.deleted_at is null
    order by ev.created_at desc nulls last;
end;
$$;

create or replace function public.listar_personal()
returns table (id uuid, nombre_completo text, rol text, email text, creado_at timestamptz, ultimo_acceso timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('personal') then
    raise exception 'Solo un admin, o quien tenga el permiso «Personal», puede ver la lista del personal.';
  end if;
  return query
  select p.id, p.nombre_completo, m.rol, u.email::text, m.created_at, u.last_sign_in_at
  from public.membresias m
  join public.profiles p on p.id = m.profile_id
  join auth.users u on u.id = p.id
  where m.negocio_id = public.negocio_actual()
    and m.rol in ('recepcion', 'estetica')
    and m.deleted_at is null and p.deleted_at is null
  order by m.rol, p.nombre_completo;
end;
$$;

create or replace function public.listar_personal_estetica()
returns table (id uuid, nombre text, rol text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    coalesce(nullif(btrim(p.nombre_completo), ''), split_part(u.email::text, '@', 1)) as nombre,
    m.rol
  from public.membresias m
  join public.profiles p on p.id = m.profile_id
  join auth.users u on u.id = p.id
  where m.negocio_id = public.negocio_actual()
    and m.deleted_at is null and p.deleted_at is null
    and m.rol in ('estetica', 'admin')
    and public.is_staff()
  order by (m.rol = 'estetica') desc, 2;
$$;

-- Una cuenta nueva de Auth es una PERSONA: se crea su perfil y nada más.
-- La membresía la crea el flujo que la dio de alta (link de alta,
-- invitación de personal), que sabe en qué negocio.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, rol, created_by)
  values (new.id, 'cliente', new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

-- La vinculación automática por correo al crear la cuenta no sabía de
-- negocios (buscaba el correo en TODOS los expedientes). Ya no se usa:
-- cada flujo liga la cuenta explícitamente en su negocio.
drop function if exists public.vincular_cliente_por_email(uuid);

-- ── 4. Fechas con la zona del negocio (antes CURRENT_DATE, que es UTC) ──

create or replace function public.telefono_recepcion_publico()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select cc.telefono_recepcion
  from public.cupo_configuracion cc
  where cc.vigencia_desde <= public.fecha_negocio()
    and cc.deleted_at is null
  order by cc.vigencia_desde desc, cc.created_at desc
  limit 1;
$$;

-- ── 5. Grupos de raza por negocio (las razas se comparten) ──────────
-- El catálogo de razas (nombre, alias) es común a todos los negocios; el
-- GRUPO de precio en que cada negocio mete cada raza es suyo.

create table public.razas_grupo (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  raza_id uuid not null references public.razas(id),
  grupo_raza_id uuid not null references public.grupos_raza(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.razas_grupo
  for each row execute function public.set_updated_at();
create unique index razas_grupo_una_por_negocio on public.razas_grupo (negocio_id, raza_id) where deleted_at is null;
create index razas_grupo_negocio_idx on public.razas_grupo (negocio_id);
alter table public.razas_grupo enable row level security;
create policy razas_grupo_negocio on public.razas_grupo as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy razas_grupo_negocio_definer on public.razas_grupo for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.razas_grupo to peludesk_definer;
create policy razas_grupo_select_staff on public.razas_grupo for select to authenticated
  using (coalesce(public.is_staff(), false));
create policy razas_grupo_insert_admin on public.razas_grupo for insert to authenticated
  with check (coalesce(public.is_admin(), false));
create policy razas_grupo_update_admin on public.razas_grupo for update to authenticated
  using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false));

insert into public.razas_grupo (negocio_id, raza_id, grupo_raza_id, created_at)
select '10000000-0000-4000-8000-000000000001', r.id, r.grupo_raza_id, r.created_at
from public.razas r
where r.grupo_raza_id is not null;

comment on column public.razas.grupo_raza_id is 'LEGADO (antes de PeluDesk). El grupo de cada raza es por negocio: razas_grupo.';

create or replace view public.perro_grupo_raza with (security_invoker = true) as
select p.id as perro_id,
  coalesce(g.id, gp.id) as grupo_raza_id,
  coalesce(g.clave, gp.clave) as grupo_clave,
  coalesce(g.nombre, gp.nombre) as grupo_nombre,
  coalesce(g.depende_tamano, gp.depende_tamano) as depende_tamano,
  (p.raza_id is null) as por_defecto
from public.perros p
left join public.razas r on r.id = p.raza_id and r.deleted_at is null
left join public.razas_grupo rg on rg.raza_id = r.id and rg.negocio_id = p.negocio_id and rg.deleted_at is null
left join public.grupos_raza g on g.id = rg.grupo_raza_id and g.deleted_at is null
left join public.grupos_raza gp on gp.es_predeterminado and gp.deleted_at is null and gp.negocio_id = p.negocio_id
where p.deleted_at is null;

-- Tarifas vigentes: "hoy" del negocio, no la fecha UTC del servidor.
create or replace view public.tarifas_vigentes with (security_invoker = true) as
select distinct on (t.servicio_id, t.grupo_raza_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta)
  t.servicio_id, s.nombre as servicio_nombre, s.categoria, s.unidad, t.grupo_raza_id,
  gr.nombre as grupo_raza_nombre, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta,
  t.precio, t.precio_pelo_maltratado, t.no_aplica, t.vigencia_desde
from public.tarifas t
join public.servicios s on s.id = t.servicio_id
left join public.grupos_raza gr on gr.id = t.grupo_raza_id
where t.vigencia_desde <= public.fecha_negocio() and t.deleted_at is null and s.deleted_at is null
order by t.servicio_id, t.grupo_raza_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta, t.vigencia_desde desc;

-- ── 6. Storage: el negocio sale de la RUTA del archivo ──────────────
-- perros-archivos guarda `{cliente_id}/{perro_id}/...`: el cliente dice el
-- negocio. Las políticas ya no preguntan "¿es staff?" a secas (eso abría
-- los archivos de todos los negocios a cualquier staff): preguntan "¿es
-- staff del negocio de ESTE archivo?". No dependen del encabezado.

create or replace function public.negocio_de_archivo_perro(p_nombre text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.negocio_id from public.clientes c
  where c.id::text = (storage.foldername(p_nombre))[1];
$$;

-- ¿Quien llama es dueño (principal o con acceso compartido) del perro de
-- este archivo, en el negocio de ese perro?
create or replace function public.es_dueno_de_archivo_perro(p_nombre text, p_solo_principal boolean default false)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.perros p
    join public.membresias m
      on m.profile_id = auth.uid() and m.negocio_id = p.negocio_id
     and m.rol = 'cliente' and m.cliente_id is not null and m.deleted_at is null
    where p.id::text = (storage.foldername(p_nombre))[2]
      and p.cliente_id::text = (storage.foldername(p_nombre))[1]
      and (
        p.cliente_id = m.cliente_id
        or (not p_solo_principal and exists (
          select 1 from public.perro_accesos_compartidos pac
          where pac.perro_id = p.id and pac.deleted_at is null and pac.cliente_id = m.cliente_id
        ))
      )
  );
$$;
grant execute on function public.negocio_de_archivo_perro(text) to authenticated;
grant execute on function public.es_dueno_de_archivo_perro(text, boolean) to authenticated;

drop policy if exists perros_archivos_delete_staff on storage.objects;
drop policy if exists perros_archivos_insert_bitacora on storage.objects;
drop policy if exists perros_archivos_insert_propio_contrato on storage.objects;
drop policy if exists perros_archivos_insert_staff on storage.objects;
drop policy if exists perros_archivos_select_propio on storage.objects;
drop policy if exists perros_archivos_select_staff on storage.objects;
drop policy if exists perros_archivos_update_staff on storage.objects;

create policy perros_archivos_select_staff on storage.objects for select to authenticated
  using (bucket_id = 'perros-archivos'
    and public.rol_en_negocio(public.negocio_de_archivo_perro(name)) in ('admin', 'recepcion', 'estetica'));
create policy perros_archivos_insert_staff on storage.objects for insert to authenticated
  with check (bucket_id = 'perros-archivos'
    and public.rol_en_negocio(public.negocio_de_archivo_perro(name)) in ('admin', 'recepcion'));
create policy perros_archivos_update_staff on storage.objects for update to authenticated
  using (bucket_id = 'perros-archivos'
    and public.rol_en_negocio(public.negocio_de_archivo_perro(name)) in ('admin', 'recepcion'))
  with check (bucket_id = 'perros-archivos'
    and public.rol_en_negocio(public.negocio_de_archivo_perro(name)) in ('admin', 'recepcion'));
create policy perros_archivos_delete_staff on storage.objects for delete to authenticated
  using (bucket_id = 'perros-archivos'
    and public.rol_en_negocio(public.negocio_de_archivo_perro(name)) in ('admin', 'recepcion'));
create policy perros_archivos_insert_bitacora on storage.objects for insert to authenticated
  with check (bucket_id = 'perros-archivos'
    and (storage.foldername(name))[3] = 'bitacora'
    and public.rol_en_negocio(public.negocio_de_archivo_perro(name)) in ('admin', 'recepcion', 'estetica'));
create policy perros_archivos_select_propio on storage.objects for select to authenticated
  using (bucket_id = 'perros-archivos' and public.es_dueno_de_archivo_perro(name));
create policy perros_archivos_insert_propio_contrato on storage.objects for insert to authenticated
  with check (bucket_id = 'perros-archivos'
    and (storage.foldername(name))[3] = 'contrato'
    and public.es_dueno_de_archivo_perro(name, true));

-- Comprobantes de gastos: `{negocio_id}/gastos/...` (sin políticas: los
-- sube y firma el servidor tras comprobar el permiso).
create or replace function public.adjuntar_comprobante_gasto(p_gasto_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('gastos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Gastos», adjunta comprobantes.';
  end if;
  if p_path is null or p_path not like public.negocio_actual()::text || '/gastos/%' then
    raise exception 'Ruta de comprobante no válida.';
  end if;
  update public.gastos set comprobante_path = p_path where id = p_gasto_id and deleted_at is null;
  if not found then
    raise exception 'Gasto no encontrado.';
  end if;
end;
$$;

-- ── 7. Alta de un negocio nuevo (solo la plataforma) ────────────────
-- Crea el negocio con sus catálogos básicos copiados de uno modelo
-- (grupos de raza y su asignación, requisitos sanitarios, alertas, motivos
-- de descuento, áreas de inventario, categorías de gasto, tipos de
-- contrato SIN plantilla y servicios SIN precios). Precios, contratos y
-- horario los captura el negocio por la app.
create or replace function public.crear_negocio(
  p_slug text,
  p_nombre text,
  p_zona_horaria text default 'America/Mexico_City',
  p_ciudad text default null,
  p_dominio text default null,
  p_modelo uuid default '10000000-0000-4000-8000-000000000001'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_mapa jsonb := '{}'::jsonb;
  r record;
  v_nuevo uuid;
  v_cupo uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Solo la plataforma da de alta negocios.';
  end if;

  insert into public.negocios (slug, nombre, zona_horaria, ciudad, dominio, marca)
  values (p_slug, p_nombre, p_zona_horaria, p_ciudad, p_dominio, jsonb_build_object('nombre_corto', p_nombre))
  returning id into v_id;
  -- Los triggers (del rol definer) trabajan en el negocio nuevo.
  perform set_config('app.negocio_id', v_id::text, true);

  -- Grupos de raza (con su mapa viejo→nuevo para la asignación de razas).
  for r in select * from public.grupos_raza where negocio_id = p_modelo and deleted_at is null loop
    insert into public.grupos_raza (negocio_id, clave, nombre, depende_tamano, es_predeterminado, orden)
    values (v_id, r.clave, r.nombre, r.depende_tamano, r.es_predeterminado, r.orden)
    returning id into v_nuevo;
    v_mapa := v_mapa || jsonb_build_object(r.id::text, v_nuevo);
  end loop;
  insert into public.razas_grupo (negocio_id, raza_id, grupo_raza_id)
  select v_id, rg.raza_id, (v_mapa ->> rg.grupo_raza_id::text)::uuid
  from public.razas_grupo rg
  where rg.negocio_id = p_modelo and rg.deleted_at is null and v_mapa ? rg.grupo_raza_id::text;

  insert into public.tipos_requisito_sanitario (negocio_id, clave, etiqueta, categoria, es_critica, vigencia_meses, orden, obligatoria, dias_aviso_vencimiento)
  select v_id, clave, etiqueta, categoria, es_critica, vigencia_meses, orden, obligatoria, dias_aviso_vencimiento
  from public.tipos_requisito_sanitario where negocio_id = p_modelo and deleted_at is null;

  insert into public.catalogo_alertas (negocio_id, clave, etiqueta, orden, bloquea_estancia)
  select v_id, clave, etiqueta, orden, bloquea_estancia
  from public.catalogo_alertas where negocio_id = p_modelo and deleted_at is null;

  insert into public.catalogo_descuentos (negocio_id, clave, etiqueta, orden)
  select v_id, clave, etiqueta, orden
  from public.catalogo_descuentos where negocio_id = p_modelo and deleted_at is null;

  insert into public.areas_inventario (negocio_id, clave, nombre, orden)
  select v_id, clave, nombre, orden
  from public.areas_inventario where negocio_id = p_modelo and deleted_at is null;

  insert into public.categorias_gasto (negocio_id, clave, nombre, descripcion, orden)
  select v_id, clave, nombre, descripcion, orden
  from public.categorias_gasto where negocio_id = p_modelo and deleted_at is null;

  insert into public.tipos_contrato (negocio_id, nombre, categorias_servicio, orden, se_genera_al)
  select v_id, nombre, categorias_servicio, orden, se_genera_al
  from public.tipos_contrato where negocio_id = p_modelo and deleted_at is null;

  insert into public.servicios (
    negocio_id, clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad,
    cantidad_incluida, vigencia_dias, orden, duracion_minutos, depende_grupo_raza, incluye,
    acepta_pelo_maltratado, ilimitado, monto_libre, no_incluye
  )
  select v_id, clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad,
    cantidad_incluida, vigencia_dias, orden, duracion_minutos, depende_grupo_raza, incluye,
    acepta_pelo_maltratado, ilimitado, monto_libre, no_incluye
  from public.servicios where negocio_id = p_modelo and deleted_at is null and servicio_incluido_id is null;

  -- Configuración base: cupo, hora de cierre y horario del modelo como
  -- punto de partida (el negocio los ajusta en Administración). Sin
  -- teléfono ni dirección base: esos son suyos.
  insert into public.cupo_configuracion (negocio_id, vigencia_desde, cupo_diurno, cupo_nocturno, hora_cierre)
  select v_id, (now() at time zone p_zona_horaria)::date, cc.cupo_diurno, cc.cupo_nocturno, cc.hora_cierre
  from public.cupo_configuracion cc
  where cc.negocio_id = p_modelo and cc.deleted_at is null
  order by cc.vigencia_desde desc, cc.created_at desc
  limit 1
  returning id into v_cupo;
  insert into public.horario_semana (negocio_id, cupo_configuracion_id, dia_semana, hora_apertura, hora_cierre)
  select v_id, v_cupo, hs.dia_semana, hs.hora_apertura, hs.hora_cierre
  from public.horario_semana hs
  join public.cupo_configuracion cc on cc.id = hs.cupo_configuracion_id
  where cc.negocio_id = p_modelo and hs.deleted_at is null
    and cc.id = (select id from public.cupo_configuracion where negocio_id = p_modelo and deleted_at is null order by vigencia_desde desc, created_at desc limit 1);

  insert into public.configuracion_descuentos (negocio_id, vigencia_desde, tope_recepcion)
  select v_id, (now() at time zone p_zona_horaria)::date, tope_recepcion
  from public.configuracion_descuentos where negocio_id = p_modelo and deleted_at is null
  order by vigencia_desde desc limit 1;

  return v_id;
end;
$$;
revoke execute on function public.crear_negocio(text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.crear_negocio(text, text, text, text, text, uuid) to service_role;

-- Primer admin de un negocio (solo la plataforma).
create or replace function public.agregar_admin_negocio(p_negocio_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Solo la plataforma agrega el primer admin de un negocio.';
  end if;
  perform set_config('app.asignacion_rol_interna', 'on', true);
  insert into public.membresias (negocio_id, profile_id, rol)
  values (p_negocio_id, p_profile_id, 'admin');
end;
$$;
revoke execute on function public.agregar_admin_negocio(uuid, uuid) from public, anon, authenticated;
grant execute on function public.agregar_admin_negocio(uuid, uuid) to service_role;

-- ── 8. Auditoría de la frontera entre negocios (solo service_role) ──
-- Lo que el script de auditoría revisa en el catálogo: toda función
-- definer tiene que ser del rol peludesk_definer salvo la lista blanca;
-- toda tabla con datos de un negocio tiene negocio_id y sus dos redes; toda
-- vista es security_invoker.
create or replace function public.auditoria_frontera()
returns table (tipo text, nombre text, detalle text)
language sql
stable
security definer
set search_path = ''
as $$
  with lista_blanca(nombre) as (values
    ('current_rol'), ('es_miembro'), ('mi_cliente_id'), ('rol_en_negocio'), ('tiene_permiso'), ('mis_permisos'),
    ('persona_en_negocio'), ('zona_negocio'), ('negocio_por_host'), ('mis_negocios'), ('is_admin'), ('is_staff'),
    ('mi_empleado_id'), ('puede_ver_empleado'), ('cuentas_para_empleado'), ('email_de_login_por_telefono'),
    ('existe_usuario_por_email'), ('listar_cuentas'), ('listar_cuentas_sin_vincular'), ('listar_cuentas_vinculadas'),
    ('listar_personal'), ('listar_personal_estetica'), ('handle_new_user'), ('negocio_de_archivo_perro'),
    ('es_dueno_de_archivo_perro'), ('proteger_membresia'), ('crear_negocio'), ('agregar_admin_negocio'),
    ('auditoria_frontera'), ('proteger_columnas_sensibles_profile')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'))
  select 'funcion_definer_postgres', p.proname::text, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proname not in (select nombre from lista_blanca)
  union all
  select 'tabla_sin_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in (select nombre from compartidas)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
  union all
  select 'tabla_sin_politica_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    and c.relname <> 'negocios'
    and (
      not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                  and pp.permissive = 'RESTRICTIVE' and pp.qual like '%negocio_actual()%' and pp.qual like '%es_miembro()%')
      or not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                     and 'peludesk_definer' = any(pp.roles) and pp.qual like '%negocio_actual()%')
      or not c.relrowsecurity
    )
  union all
  select 'vista_sin_security_invoker', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
  union all
  select 'politica_storage_sin_negocio', pp.policyname::text, coalesce(pp.qual, pp.with_check)
  from pg_policies pp
  where pp.schemaname = 'storage' and pp.tablename = 'objects'
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))';
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;


-- ── 9. Funciones del cliente: su expediente EN ESTE negocio ─────────

CREATE OR REPLACE FUNCTION public.actualizar_foto_mi_perro(p_perro_id uuid, p_foto_path text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente_id uuid;
begin
  v_cliente_id := public.mi_cliente_id();

  if v_cliente_id is null then
    raise exception 'Tu cuenta no está vinculada a un expediente.';
  end if;

  if p_foto_path is null
     or p_foto_path not like v_cliente_id::text || '/' || p_perro_id::text || '/perfil/%' then
    raise exception 'La ruta de la foto no corresponde a este perro.';
  end if;

  update public.perros
  set foto_path = p_foto_path
  where id = p_perro_id
    and cliente_id = v_cliente_id
    and deleted_at is null
    and fallecido = false;

  if not found then
    raise exception 'Solo el dueño principal puede cambiar la foto, y no la de un perro que falleció.';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.actualizar_mi_cliente(p_telefono text, p_email text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente_id uuid;
begin
  v_cliente_id := public.mi_cliente_id();

  if v_cliente_id is null then
    raise exception 'Tu cuenta no está vinculada a un expediente.';
  end if;

  update public.clientes
  set telefono = p_telefono, email = p_email
  where id = v_cliente_id
    and deleted_at is null;

  if not found then
    raise exception 'No pudimos encontrar tu expediente.';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.actualizar_mi_perro(p_perro_id uuid, p_contacto_emergencia_nombre text, p_contacto_emergencia_telefono text, p_veterinario_nombre text, p_veterinario_telefono text, p_veterinario_clinica text, p_autorizacion_medica_notas text, p_tope_gasto_autorizado numeric, p_alimentacion_notas text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_cliente_id uuid;
begin
  v_cliente_id := public.mi_cliente_id();

  if v_cliente_id is null then
    raise exception 'Tu cuenta no está vinculada a un expediente.';
  end if;

  update public.perros
  set
    contacto_emergencia_nombre = p_contacto_emergencia_nombre,
    contacto_emergencia_telefono = p_contacto_emergencia_telefono,
    veterinario_nombre = p_veterinario_nombre,
    veterinario_telefono = p_veterinario_telefono,
    veterinario_clinica = p_veterinario_clinica,
    autorizacion_medica_notas = p_autorizacion_medica_notas,
    tope_gasto_autorizado = p_tope_gasto_autorizado,
    alimentacion_notas = p_alimentacion_notas
  where id = p_perro_id
    and cliente_id = v_cliente_id
    and deleted_at is null;

  if not found then
    raise exception 'No pudimos encontrar ese perro en tu expediente.';
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.finalizar_firma_contrato(p_contrato_id uuid, p_storage_path text, p_hash_pdf text, p_ip text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_contrato public.contratos%rowtype;
  v_cliente_id uuid;
begin
  select * into v_contrato from public.contratos where id = p_contrato_id;
  if not found then
    raise exception 'Contrato no encontrado.';
  end if;
  if v_contrato.estado <> 'pendiente_firma' then
    raise exception 'Este contrato ya no está pendiente de firma.';
  end if;

  v_cliente_id := public.mi_cliente_id();
  if v_cliente_id is null or v_cliente_id <> v_contrato.cliente_id then
    raise exception 'Solo el dueño de este perro puede firmar su contrato.';
  end if;

  if p_storage_path is null or btrim(p_storage_path) = '' then
    raise exception 'Falta la ruta del PDF firmado.';
  end if;
  if p_hash_pdf is null or btrim(p_hash_pdf) = '' then
    raise exception 'Falta el hash del PDF firmado.';
  end if;
  if p_ip is null or btrim(p_ip) = '' then
    raise exception 'No se pudo determinar la IP de la firma.';
  end if;

  update public.contratos
  set estado = 'firmado_digital',
      storage_path = p_storage_path,
      hash_pdf = p_hash_pdf,
      ip_firma = p_ip,
      fecha_firma = now(),
      firmado_por = auth.uid()
  where id = p_contrato_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.nombre_paquete_de_bono(p_bono_cliente_id uuid)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select s.nombre
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.id = p_bono_cliente_id
    and (
      coalesce(public.is_staff(), false)
      or bc.cliente_id = public.mi_cliente_id()
    );
$function$
;

CREATE OR REPLACE FUNCTION public.perro_categorias_servicio_visibles()
 RETURNS TABLE(perro_id uuid, categoria text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with yo as (
    select public.mi_cliente_id() as cliente_id
  )
  select distinct e.perro_id, s.categoria
  from public.estancias e
  join public.servicios s on s.id = e.servicio_id
  where e.estado <> 'cancelada'
    and s.categoria in ('guarderia', 'hotel')
    and (
      coalesce(public.is_staff(), false)
      or exists (
        -- La misma regla que perros_select_propio: sus perros y los de
        -- acceso compartido.
        select 1
        from public.perros p, yo
        where p.id = e.perro_id
          and yo.cliente_id is not null
          and (
            p.cliente_id = yo.cliente_id
            or exists (
              select 1 from public.perro_accesos_compartidos pac
              where pac.perro_id = p.id
                and pac.deleted_at is null
                and pac.cliente_id = yo.cliente_id
            )
          )
      )
    );
$function$
;

CREATE OR REPLACE FUNCTION public.mis_visitas()
 RETURNS TABLE(tipo text, id uuid, perro_id uuid, perro_nombre text, servicio_nombre text, categoria text, unidad text, inicio timestamp with time zone, fecha_entrada date, fecha_salida date, horas integer, estado text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with yo as (
    select public.mi_cliente_id() as cliente_id
    where public.mi_cliente_id() is not null
  ),
  mis_perros as (
    select p.id, p.nombre
    from public.perros p, yo
    where p.deleted_at is null
      and (
        p.cliente_id = yo.cliente_id
        or exists (
          select 1 from public.perro_accesos_compartidos pac
          where pac.perro_id = p.id
            and pac.deleted_at is null
            and pac.cliente_id = yo.cliente_id
        )
      )
  )
  select 'estetica', c.id, mp.id, mp.nombre, s.nombre, s.categoria, s.unidad,
    c.inicio, null::date, null::date, null::int, c.estado
  from public.citas_estetica c
  join mis_perros mp on mp.id = c.perro_id
  join public.servicios s on s.id = c.servicio_id
  where c.deleted_at is null

  union all

  select 'estancia', e.id, mp.id, mp.nombre, s.nombre, s.categoria, s.unidad,
    null::timestamptz, e.fecha_entrada, e.fecha_salida, e.horas, e.estado
  from public.estancias e
  join mis_perros mp on mp.id = e.perro_id
  join public.servicios s on s.id = e.servicio_id
  where e.deleted_at is null;
$function$
;

CREATE OR REPLACE FUNCTION public.resolver_campos_de_contrato(p_contrato_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_contrato record;
  v_bono record;
  v_hay_bono boolean := false;
  v_campos jsonb;
begin
  select c.id, c.perro_id, c.cliente_id, c.bono_cliente_id into v_contrato
  from public.contratos c where c.id = p_contrato_id;
  if not found then
    raise exception 'Contrato no encontrado.';
  end if;

  if not (
    coalesce(public.is_staff(), false)
    or public.mi_cliente_id() = v_contrato.cliente_id
  ) then
    raise exception 'No tienes acceso a este contrato.';
  end if;

  v_campos := public.resolver_campos_contrato(v_contrato.perro_id);

  if v_contrato.bono_cliente_id is not null then
    select s.nombre, bc.ilimitado, bc.cantidad_total, bc.fecha_compra, bc.fecha_vencimiento
      into v_bono
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    where bc.id = v_contrato.bono_cliente_id;
    v_hay_bono := found;
  end if;

  -- Sin paquete, v_bono nunca se asignó y leer v_bono.nombre truena con
  -- 'record "v_bono" is not assigned yet'. Por eso se pregunta a la
  -- bandera, no al record.
  if not v_hay_bono then
    return v_campos || jsonb_build_object(
      'paquete_guarderia', 'Sin paquete (pago por día)',
      'numero_day_pass', 'No aplica',
      'vigencia_inicio', 'No aplica',
      'vigencia_fin', 'No aplica'
    );
  end if;

  return v_campos || jsonb_build_object(
    'paquete_guarderia', v_bono.nombre,
    'numero_day_pass', case when v_bono.ilimitado
      then 'Ilimitado (mensualidad)'
      else v_bono.cantidad_total::text end,
    'vigencia_inicio', to_char(v_bono.fecha_compra, 'DD/MM/YYYY'),
    'vigencia_fin', coalesce(to_char(v_bono.fecha_vencimiento, 'DD/MM/YYYY'), 'Sin vencimiento')
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.completar_alta_cliente(p_token text, p_user_id uuid, p_cliente jsonb, p_perros jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invitacion public.invitaciones_cliente%rowtype;
  v_cliente_id uuid;
  v_perro jsonb;
  v_perro_id uuid;
  v_perros_creados jsonb := '[]'::jsonb;
  v_contratos jsonb := '[]'::jsonb;
  v_contrato record;
  v_contrato_id uuid;
  v_nombre text;
  v_telefono text;
  v_existente public.clientes%rowtype;
  v_tiene_cuenta boolean;
begin
  select * into v_invitacion
  from public.invitaciones_cliente
  where token = p_token and deleted_at is null
  for update;

  if not found then
    raise exception 'Este link de alta no existe.' using errcode = 'P0001';
  end if;
  if v_invitacion.cancelada_at is not null then
    raise exception 'Este link de alta fue cancelado. Pídele uno nuevo a recepción.';
  end if;
  -- Ya se registró por este link: lo que sigue (firmar, completar
  -- huecos) se hace volviendo a abrirlo, no capturando de nuevo.
  if v_invitacion.usada_at is not null then
    raise exception 'Este link ya cumplió: ya quedó todo. Entra a tu portal con tu teléfono y contraseña.';
  end if;
  if v_invitacion.cliente_id is not null then
    raise exception 'Tu registro ya quedó guardado. Vuelve a abrir el link para continuar donde te quedaste.';
  end if;
  if v_invitacion.expira_at <= now() then
    raise exception 'Este link de alta ya venció. Pídele uno nuevo a recepción.';
  end if;

  v_nombre := btrim(coalesce(p_cliente->>'nombre', ''));
  v_telefono := btrim(coalesce(p_cliente->>'telefono', ''));
  if v_nombre = '' then
    raise exception 'Escribe tu nombre.';
  end if;
  if v_telefono !~ '^[0-9]{10}$' then
    raise exception 'El teléfono debe tener diez dígitos.';
  end if;

  select * into v_existente
  from public.clientes
  where telefono = v_telefono and deleted_at is null;

  if found then
    select exists (select 1 from public.membresias where cliente_id = v_existente.id and deleted_at is null)
      into v_tiene_cuenta;

    if v_tiene_cuenta then
      raise exception 'Ya hay una cuenta registrada con ese teléfono. Si es tuya, inicia sesión; si no la recuerdas, pídele a recepción que te la restablezca.'
        using errcode = 'P0001';
    end if;
  end if;
  if p_perros is null or jsonb_array_length(p_perros) = 0 then
    raise exception 'Agrega al menos un perro.';
  end if;

  if v_existente.id is not null then
    v_cliente_id := v_existente.id;

    update public.clientes
    set
      email = coalesce(
        nullif(btrim(coalesce(email, '')), ''),
        nullif(btrim(coalesce(p_cliente->>'email', '')), '')
      ),
      direccion = coalesce(
        nullif(btrim(coalesce(direccion, '')), ''),
        nullif(btrim(coalesce(p_cliente->>'direccion', '')), '')
      ),
      alta_por_cliente = true
    where id = v_cliente_id;
  else
    insert into public.clientes (
      nombre, telefono, email, direccion, alta_por_cliente, created_by
    )
    values (
      v_nombre,
      v_telefono,
      nullif(btrim(coalesce(p_cliente->>'email', '')), ''),
      nullif(btrim(coalesce(p_cliente->>'direccion', '')), ''),
      true,
      p_user_id
    )
    returning id into v_cliente_id;
  end if;

  for v_perro in select * from jsonb_array_elements(p_perros)
  loop
    if btrim(coalesce(v_perro->>'nombre', '')) = '' then
      raise exception 'Cada perro necesita un nombre.';
    end if;

    insert into public.perros (
      cliente_id, nombre, raza, raza_id, sexo, fecha_nacimiento, tamano_id, pelaje_id,
      alimentacion_notas,
      contacto_emergencia_nombre, contacto_emergencia_telefono,
      veterinario_nombre, veterinario_telefono, veterinario_clinica,
      created_by
    )
    values (
      v_cliente_id,
      btrim(v_perro->>'nombre'),
      nullif(btrim(coalesce(v_perro->>'raza', '')), ''),
      nullif(btrim(coalesce(v_perro->>'raza_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_perro->>'sexo', '')), ''),
      nullif(btrim(coalesce(v_perro->>'fecha_nacimiento', '')), '')::date,
      nullif(btrim(coalesce(v_perro->>'tamano_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_perro->>'pelaje_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_perro->>'alimentacion_notas', '')), ''),
      nullif(btrim(coalesce(v_perro->>'contacto_emergencia_nombre', '')), ''),
      nullif(btrim(coalesce(v_perro->>'contacto_emergencia_telefono', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_nombre', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_telefono', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_clinica', '')), ''),
      p_user_id
    )
    returning id into v_perro_id;

    v_perros_creados := v_perros_creados || jsonb_build_object(
      'id', v_perro_id,
      'nombre', btrim(v_perro->>'nombre')
    );

    for v_contrato in
      select * from public.tipos_contrato_de_alta(v_invitacion.tipo)
    loop
      insert into public.contratos (perro_id, cliente_id, plantilla_id, created_by)
      values (v_perro_id, v_cliente_id, v_contrato.plantilla_id, p_user_id)
      returning id into v_contrato_id;

      v_contratos := v_contratos || jsonb_build_object(
        'id', v_contrato_id,
        'perro_id', v_perro_id,
        'perro_nombre', btrim(v_perro->>'nombre'),
        'tipo_nombre', v_contrato.tipo_nombre
      );
    end loop;
  end loop;

  if p_user_id is not null then
    perform public.vincular_membresia_cliente(p_user_id, v_cliente_id);
  end if;

  -- Los datos ya quedaron: el link entra en curso. Solo si no hay nada
  -- que firmar (estética) queda usado de una vez; si hay contratos, se
  -- usa cuando el último quede firmado (cerrar_invitacion_si_completa).
  update public.invitaciones_cliente
  set cliente_id = v_cliente_id,
      alta_completada_at = now(),
      usada_at = case when jsonb_array_length(v_contratos) = 0 then now() end
  where id = v_invitacion.id;

  return jsonb_build_object(
    'cliente_id', v_cliente_id,
    'perros', v_perros_creados,
    'contratos', v_contratos
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.completar_expediente_cliente(p_token text, p_user_id uuid, p_cliente jsonb, p_perros jsonb, p_perros_nuevos jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_invitacion public.invitaciones_cliente%rowtype;
  v_cliente_id uuid;
  v_profile_actual uuid;
  v_perro jsonb;
  v_perro_id uuid;
  v_perros_tocados jsonb := '[]'::jsonb;
  v_contratos jsonb := '[]'::jsonb;
  v_contrato record;
  v_fila record;
begin
  select * into v_invitacion
  from public.invitaciones_cliente
  where token = p_token and deleted_at is null
  for update;

  if not found then
    raise exception 'Este link no existe.' using errcode = 'P0001';
  end if;
  if v_invitacion.cancelada_at is not null then
    raise exception 'Este link fue cancelado. Pídele uno nuevo a recepción.';
  end if;
  if v_invitacion.usada_at is not null then
    raise exception 'Este link ya cumplió: ya quedó todo. Entra a tu portal con tu teléfono y contraseña.';
  end if;
  -- Un link en curso no vence para terminar lo que empezó: el dueño ya
  -- se registró y lo que falta es suyo. Solo el que nunca se usó vence.
  if v_invitacion.expira_at <= now() and v_invitacion.alta_completada_at is null then
    raise exception 'Este link ya venció. Pídele uno nuevo a recepción.';
  end if;
  if v_invitacion.cliente_id is null then
    raise exception 'Este link es para un alta nueva, no para completar un expediente.';
  end if;

  v_cliente_id := v_invitacion.cliente_id;

  select profile_id into v_profile_actual
  from public.membresias
  where cliente_id = v_cliente_id and deleted_at is null
  limit 1;

  if p_user_id is not null then
    if v_profile_actual is not null and v_profile_actual <> p_user_id then
      raise exception 'Este expediente ya está ligado a otra cuenta. Inicia sesión con ella.';
    end if;
  elsif v_profile_actual is null then
    raise exception 'Este expediente todavía no tiene cuenta. Crea una para continuar.';
  end if;

  update public.clientes
  set
    direccion = coalesce(
      nullif(btrim(coalesce(direccion, '')), ''),
      nullif(btrim(coalesce(p_cliente->>'direccion', '')), '')
    ),
    email = coalesce(
      nullif(btrim(coalesce(email, '')), ''),
      nullif(btrim(coalesce(p_cliente->>'email', '')), '')
    )
  where id = v_cliente_id and deleted_at is null;

  for v_perro in select * from jsonb_array_elements(coalesce(p_perros, '[]'::jsonb))
  loop
    v_perro_id := nullif(btrim(coalesce(v_perro->>'id', '')), '')::uuid;
    if v_perro_id is null then
      raise exception 'Falta el identificador de uno de los perros.';
    end if;

    if not exists (
      select 1 from public.perros
      where id = v_perro_id and cliente_id = v_cliente_id and deleted_at is null
    ) then
      raise exception 'Ese perro no es de este expediente.';
    end if;

    update public.perros
    set
      raza = case
        when raza_id is null
             and nullif(btrim(coalesce(v_perro->>'raza_id', '')), '') is not null
          then nullif(btrim(coalesce(v_perro->>'raza', '')), '')
        else coalesce(
          nullif(btrim(coalesce(raza, '')), ''),
          nullif(btrim(coalesce(v_perro->>'raza', '')), '')
        )
      end,
      raza_id = coalesce(
        raza_id,
        nullif(btrim(coalesce(v_perro->>'raza_id', '')), '')::uuid
      ),
      sexo = coalesce(sexo, nullif(btrim(coalesce(v_perro->>'sexo', '')), '')),
      fecha_nacimiento = coalesce(
        fecha_nacimiento,
        nullif(btrim(coalesce(v_perro->>'fecha_nacimiento', '')), '')::date
      ),
      tamano_id = coalesce(
        tamano_id,
        nullif(btrim(coalesce(v_perro->>'tamano_id', '')), '')::uuid
      ),
      pelaje_id = coalesce(
        pelaje_id,
        nullif(btrim(coalesce(v_perro->>'pelaje_id', '')), '')::uuid
      ),
      alimentacion_notas = coalesce(
        nullif(btrim(coalesce(alimentacion_notas, '')), ''),
        nullif(btrim(coalesce(v_perro->>'alimentacion_notas', '')), '')
      ),
      contacto_emergencia_nombre = coalesce(
        nullif(btrim(coalesce(contacto_emergencia_nombre, '')), ''),
        nullif(btrim(coalesce(v_perro->>'contacto_emergencia_nombre', '')), '')
      ),
      contacto_emergencia_telefono = coalesce(
        nullif(btrim(coalesce(contacto_emergencia_telefono, '')), ''),
        nullif(btrim(coalesce(v_perro->>'contacto_emergencia_telefono', '')), '')
      ),
      veterinario_nombre = coalesce(
        nullif(btrim(coalesce(veterinario_nombre, '')), ''),
        nullif(btrim(coalesce(v_perro->>'veterinario_nombre', '')), '')
      ),
      veterinario_telefono = coalesce(
        nullif(btrim(coalesce(veterinario_telefono, '')), ''),
        nullif(btrim(coalesce(v_perro->>'veterinario_telefono', '')), '')
      ),
      veterinario_clinica = coalesce(
        nullif(btrim(coalesce(veterinario_clinica, '')), ''),
        nullif(btrim(coalesce(v_perro->>'veterinario_clinica', '')), '')
      )
    where id = v_perro_id;

    v_perros_tocados := v_perros_tocados || jsonb_build_object(
      'id', v_perro_id,
      'nombre', (select nombre from public.perros where id = v_perro_id)
    );
  end loop;

  for v_perro in select * from jsonb_array_elements(coalesce(p_perros_nuevos, '[]'::jsonb))
  loop
    if btrim(coalesce(v_perro->>'nombre', '')) = '' then
      raise exception 'Cada perro necesita un nombre.';
    end if;

    insert into public.perros (
      cliente_id, nombre, raza, raza_id, sexo, fecha_nacimiento, tamano_id, pelaje_id,
      alimentacion_notas,
      contacto_emergencia_nombre, contacto_emergencia_telefono,
      veterinario_nombre, veterinario_telefono, veterinario_clinica,
      created_by
    )
    values (
      v_cliente_id,
      btrim(v_perro->>'nombre'),
      nullif(btrim(coalesce(v_perro->>'raza', '')), ''),
      nullif(btrim(coalesce(v_perro->>'raza_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_perro->>'sexo', '')), ''),
      nullif(btrim(coalesce(v_perro->>'fecha_nacimiento', '')), '')::date,
      nullif(btrim(coalesce(v_perro->>'tamano_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_perro->>'pelaje_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_perro->>'alimentacion_notas', '')), ''),
      nullif(btrim(coalesce(v_perro->>'contacto_emergencia_nombre', '')), ''),
      nullif(btrim(coalesce(v_perro->>'contacto_emergencia_telefono', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_nombre', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_telefono', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_clinica', '')), ''),
      coalesce(p_user_id, v_profile_actual)
    )
    returning id into v_perro_id;

    v_perros_tocados := v_perros_tocados || jsonb_build_object(
      'id', v_perro_id,
      'nombre', btrim(v_perro->>'nombre')
    );
  end loop;

  -- Contratos del flujo para todos los perros del expediente. Se salta el
  -- perro que ya tenga ese contrato firmado o pendiente: generar otro
  -- dejaría dos pendientes del mismo tipo.
  for v_fila in
    select id, nombre from public.perros
    where cliente_id = v_cliente_id and deleted_at is null
  loop
    for v_contrato in select * from public.tipos_contrato_de_alta(v_invitacion.tipo)
    loop
      if exists (
        select 1
        from public.contratos c
        join public.plantillas_contrato pl on pl.id = c.plantilla_id
        where c.perro_id = v_fila.id
          and pl.tipo_contrato_id = v_contrato.tipo_contrato_id
          and c.estado in ('pendiente_firma', 'firmado_digital', 'firmado_papel')
      ) then
        continue;
      end if;

      insert into public.contratos (perro_id, cliente_id, plantilla_id, created_by)
      values (v_fila.id, v_cliente_id, v_contrato.plantilla_id, coalesce(p_user_id, v_profile_actual));
    end loop;
  end loop;

  if p_user_id is not null and v_profile_actual is null then
    perform public.vincular_membresia_cliente(p_user_id, v_cliente_id);
  end if;

  -- Lo que le falta firmar, sea de esta vez o de la anterior: es lo que
  -- la pantalla le pone enfrente. Si no hay nada, el link ya cumplió.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', cp.id,
      'perro_id', cp.perro_id,
      'perro_nombre', cp.perro_nombre,
      'tipo_nombre', cp.tipo_nombre
    )), '[]'::jsonb)
    into v_contratos
  from public.contratos_pendientes_de_alta(v_cliente_id, v_invitacion.tipo) cp;

  update public.invitaciones_cliente
  set alta_completada_at = coalesce(alta_completada_at, now()),
      usada_at = case when jsonb_array_length(v_contratos) = 0 then now() end
  where id = v_invitacion.id;

  return jsonb_build_object(
    'cliente_id', v_cliente_id,
    'perros', v_perros_tocados,
    'contratos', v_contratos
  );
end;
$function$
;


-- ── 10. Zona horaria del negocio (antes fija en America/Mexico_City) ──

CREATE OR REPLACE FUNCTION public.corregir_asistencia(p_empleado_id uuid, p_fecha date, p_entrada time without time zone, p_salida time without time zone, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_actual record;
  v_hay boolean;
  v_entrada timestamptz;
  v_salida timestamptz;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede corregir la asistencia.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado.';
  end if;
  if p_fecha > public.fecha_negocio() then
    raise exception 'No se puede registrar asistencia de un día que no ha pasado.';
  end if;

  v_entrada := case when p_entrada is null then null else (p_fecha + p_entrada) at time zone public.zona_negocio() end;
  v_salida := case when p_salida is null then null else (p_fecha + p_salida) at time zone public.zona_negocio() end;
  if v_salida is not null and v_entrada is null then
    raise exception 'Una salida necesita su entrada.';
  end if;
  if v_salida is not null and v_salida <= v_entrada then
    raise exception 'La salida tiene que ser después de la entrada.';
  end if;

  select * into v_actual from public.asistencias
  where empleado_id = p_empleado_id and fecha = p_fecha and deleted_at is null;
  v_hay := found;

  if not v_hay then
    if v_entrada is null then
      raise exception 'Ese día no tiene registro que anular.';
    end if;
    insert into public.asistencias (
      empleado_id, fecha, entrada_at, salida_at, entrada_capturada_por, entrada_origen,
      salida_capturada_por, salida_origen, corregida
    )
    values (
      p_empleado_id, p_fecha, v_entrada, v_salida, auth.uid(), 'admin',
      case when v_salida is null then null else auth.uid() end,
      case when v_salida is null then null else 'admin' end, true
    )
    returning * into v_actual;
    insert into public.asistencia_correcciones (asistencia_id, entrada_anterior, salida_anterior, entrada_nueva, salida_nueva, motivo)
    values (v_actual.id, null, null, v_entrada, v_salida, btrim(p_motivo));
    return;
  end if;

  insert into public.asistencia_correcciones (asistencia_id, entrada_anterior, salida_anterior, entrada_nueva, salida_nueva, motivo)
  values (v_actual.id, v_actual.entrada_at, v_actual.salida_at, v_entrada, v_salida, btrim(p_motivo));

  if v_entrada is null then
    -- Anular: el registro queda (dado de baja) con su corrección.
    update public.asistencias set deleted_at = now(), corregida = true where id = v_actual.id;
  else
    update public.asistencias
    set entrada_at = v_entrada,
        salida_at = v_salida,
        salida_capturada_por = case when v_salida is distinct from v_actual.salida_at then auth.uid() else salida_capturada_por end,
        salida_origen = case when v_salida is null then null when v_salida is distinct from v_actual.salida_at then 'admin' else salida_origen end,
        corregida = true
    where id = v_actual.id;
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.cuentas_abiertas(p_dias integer DEFAULT 30)
 RETURNS TABLE(reserva_id uuid, cliente_id uuid, cliente_nombre text, cliente_telefono text, perros text, descripcion text, fecha_actividad date, total_cuenta numeric, saldo numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with con_fecha as (
    -- La fecha de actividad manda: la estancia o cita más cercana a hoy,
    -- y solo si no hay ninguna, el día en que se creó la cuenta (un cargo
    -- suelto). Una cuenta creada hoy para dentro de dos años NO es de hoy.
    select
      r.id,
      r.cliente_id,
      r.notas,
      coalesce((
        select fecha from (
          select e.fecha_entrada as fecha from public.estancias e
          where e.reserva_id = r.id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
          union all
          select (ce.inicio at time zone public.zona_negocio())::date from public.citas_estetica ce
          where ce.reserva_id = r.id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        ) f
        order by abs(f.fecha - public.fecha_negocio())
        limit 1
      ), (r.created_at at time zone public.zona_negocio())::date) as fecha_actividad
    from public.reservas r
    where r.deleted_at is null
  ),
  candidatas as (
    select * from con_fecha
    where fecha_actividad between public.fecha_negocio() - p_dias and public.fecha_negocio() + p_dias
  ),
  con_totales as (
    select c.*, t.total_cuenta, t.saldo
    from candidatas c
    cross join lateral public.cuenta_totales_reserva(c.id) t
    where t.saldo > 0
  )
  select
    c.id,
    c.cliente_id,
    cl.nombre,
    cl.telefono,
    coalesce((
      select string_agg(distinct p.nombre, ', ' order by p.nombre)
      from (
        select p1.nombre from public.estancias e join public.perros p1 on p1.id = e.perro_id
        where e.reserva_id = c.id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
        union
        select p2.nombre from public.citas_estetica ce join public.perros p2 on p2.id = ce.perro_id
        where ce.reserva_id = c.id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        union
        select p3.nombre from public.cargos_aplicados ca join public.perros p3 on p3.id = ca.perro_id
        where ca.reserva_id = c.id and ca.deleted_at is null and not ca.cancelado
      ) p
    ), ''),
    coalesce((
      select string_agg(l.descripcion, ' · ' order by l.descripcion)
      from public.cuenta_lineas_reserva(c.id) l
    ), coalesce(c.notas, 'Cuenta')),
    c.fecha_actividad,
    c.total_cuenta,
    c.saldo
  from con_totales c
  join public.clientes cl on cl.id = c.cliente_id
  order by 7 desc, 9 desc;
$function$
;

CREATE OR REPLACE FUNCTION public.registrar_pagos_mp_pendientes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_orden record;
  v_cobro_id uuid;
begin
  for v_orden in
    select * from public.mp_ordenes
    where estado = 'pagada' and cobro_id is null and deleted_at is null
    order by pagada_at
  loop
    insert into public.cobros (reserva_id, turno_id, notas, origen, created_by)
    values (
      v_orden.reserva_id,
      new.id,
      case v_orden.tipo when 'point' then 'Terminal Mercado Pago' else 'Link de pago Mercado Pago' end
        || case when v_orden.simulado then ' (SIMULADO)' else '' end
        || ' · pagado ' || to_char(v_orden.pagada_at at time zone public.zona_negocio(), 'DD/MM HH24:MI')
        || ' sin turno abierto',
      case v_orden.tipo when 'point' then 'mercadopago_point' else 'mercadopago_link' end,
      v_orden.created_by
    )
    returning id into v_cobro_id;

    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, created_by)
    values (v_cobro_id, coalesce(v_orden.metodo_registrado, case v_orden.tipo when 'point' then 'terminal' else 'transferencia' end), v_orden.monto, 0, v_orden.created_by);

    update public.mp_ordenes set cobro_id = v_cobro_id where id = v_orden.id;
  end loop;
  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.revisar_requisito_propuesto(p_id uuid, p_confirmar boolean, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_prop public.requisitos_sanitarios_propuestos%rowtype;
  v_aplicado_id uuid;
  v_vencimiento date;
  v_revisor text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden revisar comprobantes.';
  end if;

  select * into v_prop
  from public.requisitos_sanitarios_propuestos
  where id = p_id and deleted_at is null
  for update;

  if not found then
    raise exception 'Ese comprobante no existe.';
  end if;
  if v_prop.estado <> 'pendiente' then
    raise exception 'Ese comprobante ya se revisó.';
  end if;

  select coalesce(nombre_completo, 'recepción') into v_revisor
  from public.profiles where id = auth.uid();

  if p_confirmar then
    insert into public.requisitos_sanitarios_aplicados (
      perro_id, tipo_requisito_id, fecha_aplicacion, detalle, comprobante_path, notas, created_by
    )
    values (
      v_prop.perro_id,
      v_prop.tipo_requisito_id,
      v_prop.fecha_aplicacion,
      v_prop.detalle,
      v_prop.comprobante_path,
      'Comprobante enviado por el dueño desde el portal el '
        || to_char(v_prop.created_at at time zone public.zona_negocio(), 'DD/MM/YYYY')
        || '; confirmado contra el documento por ' || v_revisor || '.',
      auth.uid()
    )
    returning id, fecha_vencimiento into v_aplicado_id, v_vencimiento;

    update public.requisitos_sanitarios_propuestos
    set estado = 'confirmado',
        requisito_aplicado_id = v_aplicado_id,
        revisado_por = auth.uid(),
        revisado_at = now()
    where id = p_id;

    return jsonb_build_object(
      'estado', 'confirmado',
      'requisito_aplicado_id', v_aplicado_id,
      'fecha_vencimiento', v_vencimiento
    );
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Para rechazar un comprobante hay que decir por qué: el dueño lo va a leer.';
  end if;

  update public.requisitos_sanitarios_propuestos
  set estado = 'rechazado',
      motivo_rechazo = btrim(p_motivo),
      revisado_por = auth.uid(),
      revisado_at = now()
  where id = p_id;

  return jsonb_build_object('estado', 'rechazado');
end;
$function$
;

CREATE OR REPLACE FUNCTION public.resolver_cupo_configuracion(p_fecha date DEFAULT public.fecha_negocio())
 RETURNS TABLE(cupo_diurno integer, cupo_nocturno integer, hora_apertura time without time zone, hora_cierre time without time zone, vigencia_desde date, estado text, base_direccion text, base_lat double precision, base_lng double precision, telefono_recepcion text)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    c.cupo_diurno,
    c.cupo_nocturno,
    h.hora_apertura,
    h.hora_cierre,
    c.vigencia_desde,
    case when c.id is null then 'sin_configurar' else 'configurado' end as estado,
    c.base_direccion,
    c.base_lat,
    c.base_lng,
    c.telefono_recepcion
  from (select 1) as _dummy
  left join lateral (
    select cc.id, cc.cupo_diurno, cc.cupo_nocturno, cc.vigencia_desde,
      cc.base_direccion, cc.base_lat, cc.base_lng, cc.telefono_recepcion
    from public.cupo_configuracion cc
    where cc.vigencia_desde <= p_fecha
      and cc.deleted_at is null
    order by cc.vigencia_desde desc, cc.created_at desc
    limit 1
  ) c on true
  left join lateral (
    select hs.hora_apertura, hs.hora_cierre
    from public.horario_semana hs
    where hs.cupo_configuracion_id = c.id
      and hs.dia_semana = extract(dow from p_fecha)
      and hs.deleted_at is null
  ) h on true;
$function$
;

CREATE OR REPLACE FUNCTION public.resolver_precio(p_servicio_id uuid, p_tamano_id uuid, p_pelaje_id uuid, p_cantidad integer, p_fecha date DEFAULT public.fecha_negocio(), p_grupo_raza_id uuid DEFAULT NULL::uuid, p_pelo_maltratado boolean DEFAULT false)
 RETURNS TABLE(precio numeric, precio_pelo_maltratado numeric, no_aplica boolean, estado text, vigencia_desde date)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    case
      when p_pelo_maltratado and t.precio_pelo_maltratado is not null
        then t.precio_pelo_maltratado
      when t.id is not null and not t.no_aplica and d.precio is not null
        then d.precio
      else t.precio
    end,
    t.precio_pelo_maltratado,
    t.no_aplica,
    case
      when t.id is null then 'sin_tarifa'
      when t.no_aplica then 'no_aplica'
      else 'disponible'
    end as estado,
    t.vigencia_desde
  from (select 1) as _dummy
  left join lateral (
    select tr.id, tr.precio, tr.precio_pelo_maltratado, tr.no_aplica, tr.vigencia_desde
    from public.tarifas tr
    where tr.servicio_id = p_servicio_id
      and tr.grupo_raza_id is not distinct from p_grupo_raza_id
      and tr.tamano_id is not distinct from p_tamano_id
      and tr.pelaje_id is not distinct from p_pelaje_id
      and p_cantidad >= tr.cantidad_desde
      and (tr.cantidad_hasta is null or p_cantidad <= tr.cantidad_hasta)
      and tr.vigencia_desde <= p_fecha
      and tr.deleted_at is null
    order by tr.vigencia_desde desc
    limit 1
  ) t on true
  left join lateral (
    select td.precio
    from public.tarifas_dia_semana td
    where td.servicio_id = p_servicio_id
      and td.dia_semana = extract(isodow from p_fecha)::int
      and td.vigencia_desde <= p_fecha
      and td.deleted_at is null
    order by td.vigencia_desde desc, td.created_at desc
    limit 1
  ) d on true;
$function$
;


-- ── 11. Políticas del cliente: su expediente en ESTE negocio ────────

drop policy bitacora_entradas_select_propio on public.bitacora_entradas;
create policy bitacora_entradas_select_propio on public.bitacora_entradas for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM perros p
  WHERE ((p.id = bitacora_entradas.perro_id) AND ((p.cliente_id = public.mi_cliente_id()) OR (EXISTS ( SELECT 1
           FROM perro_accesos_compartidos pac
          WHERE ((pac.perro_id = p.id) AND (pac.deleted_at IS NULL) AND (pac.cliente_id = public.mi_cliente_id())))))))));

drop policy clientes_select_propio on public.clientes;
create policy clientes_select_propio on public.clientes for select to authenticated
  using ((id = public.mi_cliente_id()));

drop policy contratos_select_propio on public.contratos;
create policy contratos_select_propio on public.contratos for select to authenticated
  using ((cliente_id = public.mi_cliente_id()));

drop policy estancia_pertenencias_select_propio on public.estancia_pertenencias;
create policy estancia_pertenencias_select_propio on public.estancia_pertenencias for select to authenticated
  using ((estancia_id IN ( SELECT e.id
   FROM (estancias e
     JOIN perros p ON ((p.id = e.perro_id)))
  WHERE (p.cliente_id = public.mi_cliente_id()))));

drop policy medicamentos_administrados_select_propio on public.medicamentos_administrados;
create policy medicamentos_administrados_select_propio on public.medicamentos_administrados for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM (perro_medicamentos pm
     JOIN perros p ON ((p.id = pm.perro_id)))
  WHERE ((pm.id = medicamentos_administrados.perro_medicamento_id) AND ((p.cliente_id = public.mi_cliente_id()) OR (EXISTS ( SELECT 1
           FROM perro_accesos_compartidos pac
          WHERE ((pac.perro_id = p.id) AND (pac.deleted_at IS NULL) AND (pac.cliente_id = public.mi_cliente_id())))))))));

drop policy perro_accesos_compartidos_select_propio on public.perro_accesos_compartidos;
create policy perro_accesos_compartidos_select_propio on public.perro_accesos_compartidos for select to authenticated
  using ((cliente_id = public.mi_cliente_id()));

drop policy perro_alergias_select_propio on public.perro_alergias;
create policy perro_alergias_select_propio on public.perro_alergias for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM perros p
  WHERE ((p.id = perro_alergias.perro_id) AND ((p.cliente_id = public.mi_cliente_id()) OR (EXISTS ( SELECT 1
           FROM perro_accesos_compartidos pac
          WHERE ((pac.perro_id = p.id) AND (pac.deleted_at IS NULL) AND (pac.cliente_id = public.mi_cliente_id())))))))));

drop policy perro_medicamentos_select_propio on public.perro_medicamentos;
create policy perro_medicamentos_select_propio on public.perro_medicamentos for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM perros p
  WHERE ((p.id = perro_medicamentos.perro_id) AND ((p.cliente_id = public.mi_cliente_id()) OR (EXISTS ( SELECT 1
           FROM perro_accesos_compartidos pac
          WHERE ((pac.perro_id = p.id) AND (pac.deleted_at IS NULL) AND (pac.cliente_id = public.mi_cliente_id())))))))));

drop policy perros_select_propio on public.perros;
create policy perros_select_propio on public.perros for select to authenticated
  using (((cliente_id = public.mi_cliente_id()) OR (EXISTS ( SELECT 1
   FROM perro_accesos_compartidos pac
  WHERE ((pac.perro_id = perros.id) AND (pac.deleted_at IS NULL) AND (pac.cliente_id = public.mi_cliente_id()))))));

drop policy pesos_registrados_select_propio on public.pesos_registrados;
create policy pesos_registrados_select_propio on public.pesos_registrados for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM perros p
  WHERE ((p.id = pesos_registrados.perro_id) AND ((p.cliente_id = public.mi_cliente_id()) OR (EXISTS ( SELECT 1
           FROM perro_accesos_compartidos pac
          WHERE ((pac.perro_id = p.id) AND (pac.deleted_at IS NULL) AND (pac.cliente_id = public.mi_cliente_id())))))))));

drop policy requisitos_sanitarios_aplicados_select_propio on public.requisitos_sanitarios_aplicados;
create policy requisitos_sanitarios_aplicados_select_propio on public.requisitos_sanitarios_aplicados for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM perros p
  WHERE ((p.id = requisitos_sanitarios_aplicados.perro_id) AND ((p.cliente_id = public.mi_cliente_id()) OR (EXISTS ( SELECT 1
           FROM perro_accesos_compartidos pac
          WHERE ((pac.perro_id = p.id) AND (pac.deleted_at IS NULL) AND (pac.cliente_id = public.mi_cliente_id())))))))));

drop policy requisitos_sanitarios_propuestos_insert_propio on public.requisitos_sanitarios_propuestos;
create policy requisitos_sanitarios_propuestos_insert_propio on public.requisitos_sanitarios_propuestos for insert to authenticated
  with check (((estado = 'pendiente'::text) AND (created_by = auth.uid()) AND (EXISTS ( SELECT 1
   FROM perros p
  WHERE ((p.id = requisitos_sanitarios_propuestos.perro_id) AND (p.deleted_at IS NULL) AND (p.cliente_id = public.mi_cliente_id()))))));

drop policy requisitos_sanitarios_propuestos_select_propio on public.requisitos_sanitarios_propuestos;
create policy requisitos_sanitarios_propuestos_select_propio on public.requisitos_sanitarios_propuestos for select to authenticated
  using ((EXISTS ( SELECT 1
   FROM perros p
  WHERE ((p.id = requisitos_sanitarios_propuestos.perro_id) AND ((p.cliente_id = public.mi_cliente_id()) OR (EXISTS ( SELECT 1
           FROM perro_accesos_compartidos pac
          WHERE ((pac.perro_id = p.id) AND (pac.deleted_at IS NULL) AND (pac.cliente_id = public.mi_cliente_id())))))))));


-- ── 12. Todas las demás funciones definer pasan al rol sin BYPASSRLS ──
-- Desde aquí, una función SECURITY DEFINER que lea o escriba una tabla de
-- negocio solo alcanza filas de negocio_actual(), aunque su código no lo
-- diga. Se quedan como postgres solo las de la lista blanca de
-- auditoria_frontera() (identidad, contexto y las que leen auth.users,
-- que filtran el negocio a mano).
do $$
declare
  f record;
  v_blanca text[] := array[
    'current_rol', 'es_miembro', 'mi_cliente_id', 'rol_en_negocio', 'tiene_permiso', 'mis_permisos',
    'persona_en_negocio', 'zona_negocio', 'negocio_por_host', 'mis_negocios', 'is_admin', 'is_staff',
    'mi_empleado_id', 'puede_ver_empleado', 'cuentas_para_empleado', 'email_de_login_por_telefono',
    'existe_usuario_por_email', 'listar_cuentas', 'listar_cuentas_sin_vincular', 'listar_cuentas_vinculadas',
    'listar_personal', 'listar_personal_estetica', 'handle_new_user', 'negocio_de_archivo_perro',
    'es_dueno_de_archivo_perro', 'proteger_membresia', 'crear_negocio', 'agregar_admin_negocio',
    'auditoria_frontera', 'proteger_columnas_sensibles_profile'
  ];
begin
  for f in
    select p.oid::regprocedure as firma
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
      and not (p.proname = any (v_blanca))
  loop
    execute format('alter function %s owner to peludesk_definer', f.firma);
  end loop;
end
$$;

