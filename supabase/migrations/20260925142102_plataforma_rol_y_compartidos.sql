-- PeluDesk: administrador de la PLATAFORMA.
--
-- Separado del admin de un negocio: vive en plataforma_admins, NO tiene
-- membresía en ningún negocio (y no puede tenerla), así que no ve datos
-- de ningún negocio. Es el único que:
--   · da de alta negocios (crear_negocio, agregar_admin_negocio) y cambia
--     lo que el negocio no cambia solo (slug, dominio, dirección pública,
--     zona, activo, marca y landing: plataforma_actualizar_negocio);
--   · edita lo compartido entre todos los negocios (razas, tallas, tipos
--     de pelaje, unidades de medida): hasta hoy lo podía editar cualquier
--     admin de cualquier negocio, es decir, un negocio le cambiaba datos a
--     todos los demás;
--   · da soporte: busca a una persona en toda la plataforma y le
--     restablece la contraseña (la de alguien que está en varios negocios
--     no la puede cambiar ningún negocio). Todo queda en plataforma_eventos.
--
-- De paso: asignar_rol_staff ya no le reescribe el nombre a una persona que
-- ya tenía uno (es de la persona, en todos sus negocios).

-- ── Quién es de la plataforma ──
create table public.plataforma_admins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index plataforma_admins_uno on public.plataforma_admins (profile_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.plataforma_admins
  for each row execute function public.set_updated_at();
alter table public.plataforma_admins enable row level security;
-- Cada quien ve si es de la plataforma; nadie escribe por la API (el alta
-- es agregar_admin_plataforma, solo el servidor).
create policy plataforma_admins_select_propio on public.plataforma_admins for select to authenticated
  using (profile_id = auth.uid());
create policy plataforma_admins_sin_escritura on public.plataforma_admins for insert to authenticated
  with check (false);

create or replace function public.es_admin_plataforma()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    auth.uid() is not null and exists (
      select 1 from public.plataforma_admins a
      where a.profile_id = auth.uid() and a.deleted_at is null
    ), false);
$$;
revoke execute on function public.es_admin_plataforma() from public, anon;
grant execute on function public.es_admin_plataforma() to authenticated, service_role, peludesk_definer;

-- Alta de un administrador de plataforma: solo el servidor (script), y
-- solo a una persona sin membresía en ningún negocio.
create or replace function public.agregar_admin_plataforma(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'Solo el servidor da de alta administradores de la plataforma.';
  end if;
  if exists (select 1 from public.membresias where profile_id = p_profile_id and deleted_at is null) then
    raise exception 'Esa cuenta es de un negocio. El administrador de PeluDesk es una cuenta aparte, sin negocio.';
  end if;
  insert into public.plataforma_admins (profile_id) values (p_profile_id)
  on conflict do nothing;
end;
$$;
revoke execute on function public.agregar_admin_plataforma(uuid) from public, anon, authenticated;
grant execute on function public.agregar_admin_plataforma(uuid) to service_role;

-- Y al revés: a un administrador de la plataforma no se le da membresía.
create or replace function public.membresia_no_plataforma()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.plataforma_admins a where a.profile_id = new.profile_id and a.deleted_at is null) then
    raise exception 'Esa cuenta es de administración de PeluDesk; no entra a ningún negocio.';
  end if;
  return new;
end;
$$;
create trigger membresia_no_plataforma before insert on public.membresias
  for each row execute function public.membresia_no_plataforma();

-- ── Bitácora de lo que hace la plataforma ──
create table public.plataforma_eventos (
  id uuid primary key default gen_random_uuid(),
  accion text not null check (accion in ('crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo')),
  negocio_id uuid references public.negocios(id),
  persona_id uuid references public.profiles(id) on delete set null,
  motivo text,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.plataforma_eventos
  for each row execute function public.set_updated_at();
alter table public.plataforma_eventos enable row level security;
create policy plataforma_eventos_select on public.plataforma_eventos for select to authenticated
  using (public.es_admin_plataforma());
create policy plataforma_eventos_insert on public.plataforma_eventos for insert to authenticated
  with check (public.es_admin_plataforma() and created_by = auth.uid());

create or replace function public.plataforma_registrar_evento(
  p_accion text, p_negocio_id uuid, p_persona_id uuid, p_motivo text, p_detalle jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  insert into public.plataforma_eventos (accion, negocio_id, persona_id, motivo, detalle, created_by)
  values (p_accion, p_negocio_id, p_persona_id, nullif(btrim(coalesce(p_motivo, '')), ''), coalesce(p_detalle, '{}'::jsonb), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.plataforma_registrar_evento(text, uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.plataforma_registrar_evento(text, uuid, uuid, text, jsonb) to authenticated;

-- ── Negocios, vistos por la plataforma ──
create or replace function public.plataforma_negocios()
returns table (id uuid, slug text, nombre text, dominio text, url_publica text, zona_horaria text, ciudad text,
               activo boolean, marca jsonb, created_at timestamptz, admins text[], clientes bigint)
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
    select n.id, n.slug, n.nombre, n.dominio, n.url_publica, n.zona_horaria, n.ciudad, n.activo, n.marca, n.created_at,
      array(select u.email::text from public.membresias m join auth.users u on u.id = m.profile_id
            where m.negocio_id = n.id and m.rol = 'admin' and m.deleted_at is null order by m.created_at),
      (select count(*) from public.clientes c where c.negocio_id = n.id and c.deleted_at is null)
    from public.negocios n
    where n.deleted_at is null
    order by n.created_at;
end;
$$;
revoke execute on function public.plataforma_negocios() from public, anon;
grant execute on function public.plataforma_negocios() to authenticated;

create or replace function public.plataforma_actualizar_negocio(
  p_negocio_id uuid, p_nombre text, p_zona_horaria text, p_ciudad text, p_dominio text,
  p_url_publica text, p_activo boolean, p_marca jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  update public.negocios
  set nombre = btrim(p_nombre), zona_horaria = p_zona_horaria, ciudad = nullif(btrim(coalesce(p_ciudad, '')), ''),
      dominio = p_dominio, url_publica = p_url_publica, activo = p_activo,
      marca = coalesce(marca, '{}'::jsonb) || coalesce(p_marca, '{}'::jsonb)
  where id = p_negocio_id and deleted_at is null;
  if not found then
    raise exception 'Ese negocio no existe.';
  end if;
  perform public.plataforma_registrar_evento('actualizar_negocio', p_negocio_id, null, null,
    jsonb_build_object('nombre', p_nombre, 'zona_horaria', p_zona_horaria, 'dominio', p_dominio, 'activo', p_activo));
end;
$$;
revoke execute on function public.plataforma_actualizar_negocio(uuid, text, text, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.plataforma_actualizar_negocio(uuid, text, text, text, text, text, boolean, jsonb) to authenticated;

-- validar_negocio deja cambiar slug/dominio/estado a la plataforma (su
-- función corre como postgres, así que ya pasaba; se deja explícito).

-- ── Personas, para soporte ──
-- Por teléfono (el de cualquiera de sus expedientes) o por correo. Devuelve
-- en qué negocios está y con qué rol; nada de sus datos de negocio.
create or replace function public.plataforma_buscar_personas(p_busqueda text)
returns table (persona_id uuid, email text, nombre text, telefonos text[], negocios jsonb, ultimo_acceso timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := lower(btrim(coalesce(p_busqueda, '')));
  v_tel text := regexp_replace(coalesce(p_busqueda, ''), '[^0-9]', '', 'g');
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if length(v_q) < 3 then
    return;
  end if;
  return query
    with candidatos as (
      select u.id from auth.users u where lower(u.email) = v_q
      union
      select m.profile_id from public.membresias m join public.clientes c on c.id = m.cliente_id
      where length(v_tel) = 10 and c.telefono = v_tel and m.deleted_at is null
      union
      select u.id from auth.users u where length(v_tel) = 10 and lower(u.email) = 't' || v_tel || '@telefono.ludogteka.mx'
    )
    select u.id, u.email::text, p.nombre_completo,
      array(select distinct c.telefono from public.membresias m join public.clientes c on c.id = m.cliente_id
            where m.profile_id = u.id and m.deleted_at is null and c.telefono is not null),
      coalesce((select jsonb_agg(jsonb_build_object('negocio', n.nombre, 'slug', n.slug, 'rol', m.rol) order by n.nombre)
                from public.membresias m join public.negocios n on n.id = m.negocio_id
                where m.profile_id = u.id and m.deleted_at is null), '[]'::jsonb),
      u.last_sign_in_at
    from candidatos k
    join auth.users u on u.id = k.id
    left join public.profiles p on p.id = u.id
    limit 20;
end;
$$;
revoke execute on function public.plataforma_buscar_personas(text) from public, anon;
grant execute on function public.plataforma_buscar_personas(text) to authenticated;

-- ── Alta de negocio y su primer admin: también la plataforma ──
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
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not public.es_admin_plataforma() then
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
revoke execute on function public.crear_negocio(text, text, text, text, text, uuid) from public, anon;
grant execute on function public.crear_negocio(text, text, text, text, text, uuid) to authenticated, service_role;

create or replace function public.agregar_admin_negocio(p_negocio_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin')
     and not public.es_admin_plataforma() then
    raise exception 'Solo la plataforma agrega el primer admin de un negocio.';
  end if;
  perform set_config('app.asignacion_rol_interna', 'on', true);
  if exists (select 1 from public.membresias where negocio_id = p_negocio_id and profile_id = p_profile_id and deleted_at is null) then
    update public.membresias set rol = 'admin'
    where negocio_id = p_negocio_id and profile_id = p_profile_id and deleted_at is null;
  else
    insert into public.membresias (negocio_id, profile_id, rol)
    values (p_negocio_id, p_profile_id, 'admin');
  end if;
  if public.es_admin_plataforma() then
    perform public.plataforma_registrar_evento('agregar_admin_negocio', p_negocio_id, p_profile_id, null, '{}'::jsonb);
  end if;
end;
$$;
revoke execute on function public.agregar_admin_negocio(uuid, uuid) from public, anon;
grant execute on function public.agregar_admin_negocio(uuid, uuid) to authenticated, service_role;

-- ── Lo compartido: solo la plataforma lo escribe ──
drop policy if exists razas_insert_admin on public.razas;
drop policy if exists razas_update_admin on public.razas;
drop policy if exists tamanos_categoria_insert_admin on public.tamanos_categoria;
drop policy if exists tamanos_categoria_update_admin on public.tamanos_categoria;
drop policy if exists tipos_pelaje_insert_admin on public.tipos_pelaje;
drop policy if exists tipos_pelaje_update_admin on public.tipos_pelaje;
drop policy if exists unidades_medida_insert_admin on public.unidades_medida;
drop policy if exists unidades_medida_update_admin on public.unidades_medida;

create policy razas_insert_plataforma on public.razas for insert to authenticated with check (public.es_admin_plataforma());
create policy razas_update_plataforma on public.razas for update to authenticated using (public.es_admin_plataforma()) with check (public.es_admin_plataforma());
create policy tamanos_categoria_insert_plataforma on public.tamanos_categoria for insert to authenticated with check (public.es_admin_plataforma());
create policy tamanos_categoria_update_plataforma on public.tamanos_categoria for update to authenticated using (public.es_admin_plataforma()) with check (public.es_admin_plataforma());
create policy tipos_pelaje_insert_plataforma on public.tipos_pelaje for insert to authenticated with check (public.es_admin_plataforma());
create policy tipos_pelaje_update_plataforma on public.tipos_pelaje for update to authenticated using (public.es_admin_plataforma()) with check (public.es_admin_plataforma());
create policy unidades_medida_insert_plataforma on public.unidades_medida for insert to authenticated with check (public.es_admin_plataforma());
create policy unidades_medida_update_plataforma on public.unidades_medida for update to authenticated using (public.es_admin_plataforma()) with check (public.es_admin_plataforma());
-- La plataforma los lee también (unidades_medida era solo del personal).
create policy unidades_medida_select_plataforma on public.unidades_medida for select to authenticated using (public.es_admin_plataforma());

-- ── asignar_rol_staff: el nombre es de la persona ──
create or replace function public.asignar_rol_staff(p_user_id uuid, p_rol text, p_nombre_completo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.membresias%rowtype;
  v_hay boolean;
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
  v_hay := found;

  perform set_config('app.asignacion_rol_interna', 'on', true);
  if not v_hay then
    insert into public.membresias (negocio_id, profile_id, rol, created_by)
    values (public.negocio_actual(), p_user_id, p_rol, auth.uid());
  elsif v_m.rol <> 'cliente' or v_m.cliente_id is not null then
    raise exception 'Esa cuenta ya tiene rol % en este negocio; no se reasigna por invitación.', v_m.rol;
  else
    update public.membresias set rol = p_rol where id = v_m.id;
  end if;

  -- Solo si la persona no tiene nombre todavía: el nombre es suyo, en
  -- todos sus negocios, y un negocio no se lo reescribe a los demás.
  update public.profiles
  set nombre_completo = nullif(btrim(coalesce(p_nombre_completo, '')), '')
  where id = p_user_id and nullif(btrim(coalesce(nombre_completo, '')), '') is null;
end;
$$;


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
    ('auditoria_frontera'), ('proteger_columnas_sensibles_profile'), ('asignar_rol_staff'),
    ('usuario_por_email'), ('negocio_publico'), ('email_de_persona_por_telefono'),
    ('persona_en_otro_negocio'), ('es_admin_plataforma'), ('agregar_admin_plataforma'),
    ('plataforma_negocios'), ('plataforma_buscar_personas'), ('plataforma_registrar_evento'),
    ('plataforma_actualizar_negocio'), ('membresia_no_plataforma')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'), ('plataforma_admins'), ('plataforma_eventos'))
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
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))'
  union all
  -- Una función que llama a otra que ya no existe truena hasta que alguien
  -- la ejerce (así quedó handle_user_email_confirmed en el paso 2).
  select 'llamada_a_funcion_inexistente', r.proname::text, r.ref
  from (
    select distinct p.proname, (regexp_matches(pg_get_functiondef(p.oid), 'public[.]([a-z_0-9]+)[ ]*[(]', 'g'))[1] as ref
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  ) r
  where not exists (select 1 from pg_proc p2 where p2.proname = r.ref)
    and not exists (select 1 from pg_class c where c.relname = r.ref and c.relnamespace = 'public'::regnamespace);
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;
