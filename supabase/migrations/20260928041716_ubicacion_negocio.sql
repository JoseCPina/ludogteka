-- La ubicación de cada negocio para cotizar recolección (28 de septiembre
-- de 2026): la dirección del negocio (sucursal) y la de la base de la
-- camioneta, con sus coordenadas. Hasta hoy solo Ludogteka las tenía (se
-- capturaron a mano); un negocio nuevo no tenía ni sucursal ni forma de
-- darla de alta. Las coordenadas las pone el servidor después de
-- geocodificar con Google (contando contra el tope de Maps del negocio).
create or replace function public.guardar_ubicacion_negocio(
  p_direccion text,
  p_lat double precision,
  p_lng double precision,
  p_base_direccion text,
  p_base_lat double precision,
  p_base_lng double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_sucursal uuid;
  v_cupo uuid;
begin
  if not public.tiene_permiso('configuracion_negocio') then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», cambia la ubicación del negocio.';
  end if;
  if (p_lat is null) <> (p_lng is null) or (p_base_lat is null) <> (p_base_lng is null) then
    raise exception 'Una coordenada necesita latitud y longitud.';
  end if;
  if p_lat is not null and (abs(p_lat) > 90 or abs(p_lng) > 180) then
    raise exception 'Coordenada fuera de rango.';
  end if;
  if p_base_lat is not null and (abs(p_base_lat) > 90 or abs(p_base_lng) > 180) then
    raise exception 'Coordenada fuera de rango.';
  end if;

  if nullif(btrim(coalesce(p_direccion, '')), '') is not null then
    select id into v_sucursal from public.sucursales
    where negocio_id = v_neg and deleted_at is null
    order by activo desc, created_at
    limit 1;
    if v_sucursal is null then
      insert into public.sucursales (negocio_id, nombre, activo, direccion, lat, lng)
      select v_neg, n.nombre, true, btrim(p_direccion), p_lat, p_lng from public.negocios n where n.id = v_neg;
    else
      update public.sucursales set direccion = btrim(p_direccion), lat = p_lat, lng = p_lng where id = v_sucursal;
    end if;
  end if;

  if nullif(btrim(coalesce(p_base_direccion, '')), '') is not null then
    select id into v_cupo from public.cupo_configuracion
    where negocio_id = v_neg and deleted_at is null and vigencia_desde <= public.fecha_negocio()
    order by vigencia_desde desc, created_at desc
    limit 1;
    if v_cupo is null then
      raise exception 'Primero guarda la configuración del negocio (cupo y teléfono de recepción) en Administración.';
    end if;
    update public.cupo_configuracion
    set base_direccion = btrim(p_base_direccion), base_lat = p_base_lat, base_lng = p_base_lng
    where id = v_cupo;
  end if;
end;
$$;
alter function public.guardar_ubicacion_negocio(text, double precision, double precision, text, double precision, double precision) owner to peludesk_definer;
revoke execute on function public.guardar_ubicacion_negocio(text, double precision, double precision, text, double precision, double precision) from public, anon;
grant execute on function public.guardar_ubicacion_negocio(text, double precision, double precision, text, double precision, double precision) to authenticated;
