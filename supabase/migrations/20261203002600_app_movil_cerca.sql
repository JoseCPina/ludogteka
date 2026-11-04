-- App nativa para dueños · Fase 4 «Cerca de mí» (docs/app-duenos/FASE-4.md).
-- «Hoteles con cupo esta noche»: el cupo nocturno de HOY de un negocio PeluDesk, con la misma cuenta que valida una
-- reserva (resolver_cupo_configuracion + ocupacion_del_dia), sin precios ni nombres. La llama SOLO el servidor, con la
-- llave de servicio acotada al negocio (x-negocio-id), para los negocios PeluDesk que salen en el mapa.

create or replace function public.cerca_cupo_hotel_esta_noche()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_cupo int;
  v_ocupado int;
  v_hotel boolean;
begin
  if public.negocio_actual() is null then
    return null;
  end if;
  select exists (
    select 1 from public.servicios s
    where s.negocio_id = public.negocio_actual() and s.categoria = 'hotel' and s.deleted_at is null
  ) into v_hotel;
  if not v_hotel then
    return jsonb_build_object('hotel', false);
  end if;
  select cc.cupo_nocturno into v_cupo from public.resolver_cupo_configuracion(v_hoy) cc;
  v_ocupado := public.ocupacion_del_dia(v_hoy, true);
  return jsonb_build_object('hotel', true, 'fecha', v_hoy, 'disponible', greatest(coalesce(v_cupo, 0) - coalesce(v_ocupado, 0), 0), 'hay_cupo', coalesce(v_cupo, 0) - coalesce(v_ocupado, 0) > 0);
end;
$$;
alter function public.cerca_cupo_hotel_esta_noche() owner to peludesk_definer;
revoke execute on function public.cerca_cupo_hotel_esta_noche() from public, anon, authenticated;
grant execute on function public.cerca_cupo_hotel_esta_noche() to service_role;

-- Los negocios PeluDesk cerca de un punto, con la ubicación de su sucursal más cercana y qué ofrecen (estética,
-- guardería, hotel). Para el mapa: los negocios PeluDesk salen aunque no estén en el directorio. Sin precios.
-- Solo el servidor (llave de servicio); el demo no sale. Lee sucursales y servicios de TODOS los negocios (lo público de
-- cada uno: nombre, ubicación de su sucursal, su WhatsApp de la página y qué ofrece), así que es de postgres, como
-- app_negocios_cerca, y va a la lista blanca de auditoria_frontera.
create or replace function public.cerca_negocios_peludesk(p_lat double precision, p_lng double precision, p_km double precision)
returns table (negocio_id uuid, nombre text, slug text, dominio text, url_publica text, sucursal text, lat double precision, lng double precision, distancia_m int, whatsapp text, categorias text[])
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (n.id) n.id, n.nombre, n.slug, n.dominio, n.url_publica, s.nombre, s.lat, s.lng,
    (2 * 6371000 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2))))::int as m,
    nullif(regexp_replace(coalesce(n.landing ->> 'telefono_wa', ''), '\D', '', 'g'), ''),
    array(select distinct sv.categoria from public.servicios sv where sv.negocio_id = n.id and sv.deleted_at is null and sv.categoria in ('estetica', 'guarderia', 'hotel'))
  from public.sucursales s
  join public.negocios n on n.id = s.negocio_id and n.activo and n.deleted_at is null and coalesce(n.plan, '') <> 'demo'
  where s.deleted_at is null and s.lat is not null and s.lng is not null
    and abs(s.lat - p_lat) < p_km / 100 and abs(s.lng - p_lng) < p_km / 80
    and 2 * 6371 * asin(sqrt(power(sin(radians(s.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(s.lat)) * power(sin(radians(s.lng - p_lng) / 2), 2))) <= p_km
  order by n.id, m
  limit 100;
$$;
revoke execute on function public.cerca_negocios_peludesk(double precision, double precision, double precision) from public, anon, authenticated;
grant execute on function public.cerca_negocios_peludesk(double precision, double precision, double precision) to service_role;

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('cerca_negocios_peludesk')$a$ in v_def) = 0 then
    if position($a$('app_negocios_cerca')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro la lista blanca de funciones de postgres.';
    end if;
    v_def := replace(v_def, $a$('app_negocios_cerca')$a$, $b$('app_negocios_cerca'), ('cerca_negocios_peludesk')$b$);
    execute v_def;
  end if;
end $$;

-- Reversa (no se corre sola): drop function public.cerca_cupo_hotel_esta_noche(); drop function public.cerca_negocios_peludesk(double precision, double precision, double precision);
