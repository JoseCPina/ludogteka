-- Ajustes a 20261203004700:
--   1. Los índices de caché no llevan WHERE: el upsert de la API no puede apuntar a un índice parcial y la caché no se guardaba.
--   2. Cada intento de un dueño que puede gastar en Google queda contado (origen 'intento', ya vencido), también si la
--      dirección no existe: sin eso, direcciones inválidas en cadena gastan sin límite.
--   3. Para un dueño, las coordenadas que se guardan son las de la cotización, no las que mande.
drop index public.maps_geocodificaciones_uq;
create unique index maps_geocodificaciones_uq on public.maps_geocodificaciones (negocio_id, direccion_norm);
drop index public.maps_rutas_uq;
create unique index maps_rutas_uq on public.maps_rutas (negocio_id, origen, destino);

alter table public.recoleccion_cotizaciones drop constraint recoleccion_cotizaciones_origen_check;
alter table public.recoleccion_cotizaciones add constraint recoleccion_cotizaciones_origen_check check (origen in ('guardada', 'ruta', 'estimada', 'intento'));

do $$
declare
  v_def text;
  v_ancla text := $a$    perform public.recoleccion_km_cotizados(v_res.cliente_id, p_direccion, p_punto, p_km);
$a$;
begin
  select replace(pg_get_functiondef('public.recoleccion_guardar(uuid, uuid, uuid, date, time, text, double precision, double precision, text, numeric, text, boolean)'::regprocedure), E'\r', '') into v_def;
  if position(v_ancla in v_def) = 0 then
    raise exception 'recoleccion_guardar cambió: no encuentro la revisión de la cotización.';
  end if;
  v_def := replace(v_def, v_ancla, v_ancla || $b$    select q.lat, q.lng into p_lat, p_lng from public.recoleccion_cotizaciones q
    where q.negocio_id = public.negocio_actual() and q.cliente_id = v_res.cliente_id and q.direccion_norm = public.recoleccion_direccion_norm(p_direccion)
      and q.usada_at is not null and q.deleted_at is null
    order by q.usada_at desc limit 1;
$b$);
  execute v_def;
end $$;
