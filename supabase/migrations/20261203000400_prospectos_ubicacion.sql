-- Mapa de competencia (peludesk.mx/mapa-competencia, 31 de octubre de 2026): los prospectos llevan su ubicación de
-- Google (lat/lng, parte del place; se llena con scripts/prospectos/geocodificar.mjs y, para los nuevos, con el campo
-- `location` de la búsqueda) y una función cuenta los negocios de un giro alrededor de un punto con su distancia.
alter table public.prospectos add column if not exists lat double precision check (lat is null or (lat between -90 and 90));
alter table public.prospectos add column if not exists lng double precision check (lng is null or (lng between -180 and 180));
alter table public.prospectos add column if not exists ubicado_at timestamptz;
create index if not exists prospectos_ubicacion on public.prospectos (lat, lng) where lat is not null and deleted_at is null;

-- Los negocios vivos de un giro a menos de p_radio_m metros de un punto, con su distancia (haversine), los más cercanos
-- primero (hasta 300). Solo el servidor.
create or replace function public.prospectos_cerca(p_lat double precision, p_lng double precision, p_radio_m int, p_giro text)
returns table (id uuid, slug text, nombre text, giro text, ciudad text, direccion text, calificacion numeric, resenas int, lat double precision, lng double precision, distancia_m int, servicios jsonb)
language sql stable set search_path = '' as $$
  with base as (
    select p.*,
      2 * 6371000 * asin(sqrt(power(sin(radians(p.lat - p_lat) / 2), 2) + cos(radians(p_lat)) * cos(radians(p.lat)) * power(sin(radians(p.lng - p_lng) / 2), 2))) as d,
      coalesce(p.clasificacion -> 'servicios', case when p.giro = 'mixto' then '["guarderia","hotel"]'::jsonb else to_jsonb(array[p.giro]) end) as servs
    from public.prospectos p
    where p.deleted_at is null and p.principal_id is null and p.etapa <> 'descartado' and p.lat is not null
      and p.lat between p_lat - 0.1 and p_lat + 0.1 and p.lng between p_lng - 0.1 and p_lng + 0.1
      and (select auth.role() = 'service_role')
  )
  select b.id, b.slug, b.nombre, b.giro, b.ciudad, b.direccion, b.calificacion, b.resenas, b.lat, b.lng, b.d::int as distancia_m, b.servs as servicios
  from base b
  where b.d <= p_radio_m and (p_giro is null or b.servs ? p_giro)
  order by b.d
  limit 300;
$$;
revoke execute on function public.prospectos_cerca(double precision, double precision, int, text) from public, anon, authenticated;
grant execute on function public.prospectos_cerca(double precision, double precision, int, text) to service_role;
