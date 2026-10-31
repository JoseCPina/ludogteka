-- Índice PeluDesk de precios: una ciudad tiene rango propio y página propia solo con 8 precios o más Y 3 negocios
-- distintos o más (31 de octubre de 2026). Con el umbral de solo 8 precios, un negocio con una lista de precios larga
-- (20 precios de un hotel en «Rancho Vistahermosa») abría él solo la página de su «ciudad» y su rango era el de un
-- solo negocio. El mismo mínimo vale para el estado y el país: si un nivel no lo junta, se cae al siguiente y el
-- resultado lo dice (`nivel`). Un «negocio» es el prospecto del que salió el precio (sitios y reseñas), el negocio de
-- PeluDesk que lo compartió (negocio_origen_id) o, si no hay ninguno de los dos (lo que captura una herramienta), la
-- fila misma.

-- 1. Rangos: cuenta negocios distintos y exige los dos mínimos en cada nivel; devuelve `negocios`.
create or replace function public.precios_mercado_rangos(p_giro text, p_servicio text, p_ciudad text, p_estado text, p_talla text default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_ciudad text := public.prospecto_texto_norm(p_ciudad);
  v_estado text := nullif(btrim(coalesce(p_estado, '')), '');
  r record;
  v_nivel text;
begin
  for v_nivel in select unnest(array['ciudad', 'estado', 'pais']) loop
    if v_nivel = 'ciudad' and (v_ciudad is null or v_ciudad = '') then continue; end if;
    if v_nivel = 'estado' and v_estado is null then continue; end if;
    select count(*) as n,
      count(distinct coalesce(m.prospecto_id::text, m.negocio_origen_id::text, m.id::text)) as negocios,
      percentile_cont(0.25) within group (order by precio) as p25,
      percentile_cont(0.5) within group (order by precio) as mediana,
      percentile_cont(0.75) within group (order by precio) as p75,
      min(precio) as minimo, max(precio) as maximo, max(fecha) as fecha
    into r
    from public.precios_mercado m
    where m.deleted_at is null and m.valido and m.giro = p_giro and m.servicio = p_servicio
      and (p_talla is null or m.talla is null or m.talla = p_talla)
      and m.fecha > (now() at time zone 'America/Mexico_City')::date - 400
      and (v_nivel <> 'ciudad' or m.ciudad_norm = v_ciudad)
      and (v_nivel <> 'estado' or m.estado = v_estado);
    if r.n >= 8 and r.negocios >= 3 then
      return jsonb_build_object('nivel', v_nivel, 'lugar', case v_nivel when 'ciudad' then p_ciudad when 'estado' then v_estado else 'México' end,
        'p25', round(r.p25::numeric), 'mediana', round(r.mediana::numeric), 'p75', round(r.p75::numeric), 'minimo', r.minimo, 'maximo', r.maximo,
        'muestras', r.n, 'negocios', r.negocios, 'fecha', r.fecha);
    end if;
  end loop;
  return jsonb_build_object('nivel', 'sin_datos', 'muestras', coalesce(r.n, 0), 'negocios', coalesce(r.negocios, 0));
end;
$$;
revoke execute on function public.precios_mercado_rangos(text, text, text, text, text) from public, anon;
grant execute on function public.precios_mercado_rangos(text, text, text, text, text) to authenticated, service_role;

-- 2. Ciudades con página propia: 8 precios o más Y 3 negocios o más del giro; devuelve también `negocios`.
--    (Cambia la tabla que devuelve: hay que soltarla y volverla a crear.)
drop function if exists public.precios_mercado_ciudades(text, int);
create function public.precios_mercado_ciudades(p_giro text, p_minimo int default 8, p_minimo_negocios int default 3)
returns table (ciudad text, estado text, muestras bigint, negocios bigint, servicios bigint, fecha date)
language sql stable set search_path = '' as $$
  select min(m.ciudad) as ciudad, min(m.estado) as estado, count(*) as muestras,
    count(distinct coalesce(m.prospecto_id::text, m.negocio_origen_id::text, m.id::text)) as negocios,
    count(distinct m.servicio) as servicios, max(m.fecha) as fecha
  from public.precios_mercado m
  where m.deleted_at is null and m.valido and m.giro = p_giro and m.ciudad_norm is not null
    and m.fecha > (now() at time zone 'America/Mexico_City')::date - 400
  group by m.ciudad_norm
  having count(*) >= p_minimo and count(distinct coalesce(m.prospecto_id::text, m.negocio_origen_id::text, m.id::text)) >= p_minimo_negocios
  order by count(*) desc, min(m.ciudad);
$$;
revoke execute on function public.precios_mercado_ciudades(text, int, int) from public, anon;
grant execute on function public.precios_mercado_ciudades(text, int, int) to authenticated, service_role;

-- 3. El resumen de /plataforma/mercado cuenta las ciudades con página con la misma regla.
create or replace function public.precios_mercado_resumen()
returns jsonb language sql stable set search_path = '' as $$
  with m as (
    select * from public.precios_mercado
    where deleted_at is null and (select coalesce(public.es_admin_plataforma(), false) or auth.role() = 'service_role')
  )
  select jsonb_build_object(
    'total', (select count(*) from m where valido),
    'invalidos', (select count(*) from m where not valido),
    'ultima_fecha', (select max(fecha) from m),
    'por_fuente', (select coalesce(jsonb_agg(jsonb_build_object('fuente', fuente, 'n', n, 'validos', v) order by n desc), '[]'::jsonb)
      from (select fuente, count(*) n, count(*) filter (where valido) v from m group by fuente) x),
    'por_giro', (select coalesce(jsonb_agg(jsonb_build_object('giro', giro, 'n', n) order by n desc), '[]'::jsonb)
      from (select giro, count(*) n from m where valido group by giro) x),
    'por_servicio', (select coalesce(jsonb_agg(jsonb_build_object('giro', giro, 'servicio', servicio, 'n', n) order by giro, n desc), '[]'::jsonb)
      from (select giro, servicio, count(*) n from m where valido group by giro, servicio) x),
    'por_ciudad', (select coalesce(jsonb_agg(jsonb_build_object('ciudad', ciudad, 'estado', estado, 'n', n, 'negocios', negocios) order by n desc), '[]'::jsonb)
      from (select min(ciudad) ciudad, min(estado) estado, count(*) n, count(distinct coalesce(prospecto_id::text, negocio_origen_id::text, id::text)) negocios
            from m where valido and ciudad_norm is not null group by ciudad_norm order by count(*) desc limit 40) x),
    'prospectos_con_web', (select coalesce(jsonb_agg(jsonb_build_object('giro', giro, 'n', n) order by giro), '[]'::jsonb)
      from (select giro, count(*) n from public.prospectos where deleted_at is null and web_dominio is not null and etapa <> 'descartado' group by giro) x),
    'ciudades_con_pagina', (select count(*) from (
      select giro, ciudad_norm from m where valido and ciudad_norm is not null and fecha > (now() at time zone 'America/Mexico_City')::date - 400
      group by giro, ciudad_norm having count(*) >= 8 and count(distinct coalesce(prospecto_id::text, negocio_origen_id::text, id::text)) >= 3) x)
  );
$$;
revoke execute on function public.precios_mercado_resumen() from public, anon;
grant execute on function public.precios_mercado_resumen() to authenticated, service_role;
