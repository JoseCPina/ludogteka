-- PeluDesk, plataforma (3): la guardia de las funciones de la plataforma.
--
-- crear_negocio, agregar_admin_negocio y agregar_admin_plataforma se
-- protegían con `current_user not in ('postgres', 'supabase_admin')`. En
-- una función SECURITY DEFINER de postgres, current_user ES postgres
-- siempre, así que esa condición nunca detenía a nadie. Mientras solo el
-- servidor podía llamarlas no importó; el paso 11 se las abrió a
-- `authenticated` para la plataforma y, con eso, cualquier sesión podía dar
-- de alta negocios y hacerse admin de cualquiera. Lo encontró la auditoría
-- entre negocios en desarrollo; producción no tuvo el paso 11.
--
-- La llamada "interna" se reconoce por lo que trae la petición, no por el
-- rol de la función: la secret key (auth.role() = 'service_role') o una
-- sesión directa a la base sin petición de la API (una migración: no hay
-- request.jwt.claims). Cualquier llamada de la API trae claims (anon,
-- authenticated o service_role).

create or replace function public.llamada_interna()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role'
      or nullif(current_setting('request.jwt.claims', true), '') is null;
$$;

create or replace function public.llamada_de_la_plataforma()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.llamada_interna() or public.es_admin_plataforma();
$$;

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
  if not public.llamada_de_la_plataforma() then
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

create or replace function public.agregar_admin_negocio(p_negocio_id uuid, p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.llamada_de_la_plataforma() then
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

create or replace function public.agregar_admin_plataforma(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.llamada_interna() then
    raise exception 'Solo el servidor da de alta administradores de la plataforma.';
  end if;
  if exists (select 1 from public.membresias where profile_id = p_profile_id and deleted_at is null) then
    raise exception 'Esa cuenta es de un negocio. El administrador de PeluDesk es una cuenta aparte, sin negocio.';
  end if;
  insert into public.plataforma_admins (profile_id) values (p_profile_id)
  on conflict do nothing;
end;
$$;
