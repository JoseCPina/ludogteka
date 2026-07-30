-- Fase 8 Bloque B: costos y margen. Usa exactamente los datos que Fase 7
-- dejó listos a propósito para este momento — compras_insumos (costo
-- real de cada entrada) y movimientos_inventario.cita_estetica_id (qué
-- consumo vino de qué cita) — sin ellos, esto sería puro reporte, no un
-- cruce real de datos.
--
-- costo_promedio_base_insumo(): costo PROMEDIO PONDERADO por unidad
-- base, calculado con TODAS las compras registradas hasta la fecha
-- "hasta" del reporte (no solo las del rango, y no por lote/FEFO) —
-- misma simplificación consciente que insumos_proxima_caducidad en
-- Fase 7: para un negocio de un solo local, un promedio ponderado es
-- suficientemente preciso; costeo por lote real es una extensión
-- futura si hace falta. Si un insumo nunca se ha comprado (regalado,
-- inventario inicial sin registrar compra), el costo es null y se
-- trata como 0 — no puede inventarse un costo que no existe.
create or replace function public.costo_promedio_base_insumo(
  p_insumo_id uuid,
  p_hasta date default public.fecha_negocio()
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select
    case when coalesce(sum(mi.cantidad_base), 0) > 0
      then sum(ci.costo_total) / sum(mi.cantidad_base)
      else null
    end
  from public.movimientos_inventario mi
  join public.compras_insumos ci on ci.movimiento_id = mi.id
  where mi.insumo_id = p_insumo_id
    and mi.tipo = 'entrada_compra'
    and public.fecha_negocio(mi.created_at) <= p_hasta;
$$;

grant execute on function public.costo_promedio_base_insumo(uuid, date) to authenticated;

-- Resumen del periodo: cuánto se compró, cuánto se consumió/mermó
-- (valorizado al costo promedio), y el margen bruto de estética
-- (ingreso de las citas finalizadas del periodo menos el costo real de
-- su consumo ligado). admin-only con chequeo explícito, mismo motivo
-- que reporte_financiero_periodo: no es security definer, y
-- citas_estetica/movimientos_inventario tienen SELECT abierto a
-- is_staff() para el día a día — un reporte agregado es otra cosa.
create or replace function public.reporte_costos_periodo(p_desde date, p_hasta date)
returns table (
  compras_total numeric,
  consumo_valorizado_total numeric,
  merma_valorizada numeric,
  consumo_estetica_valorizado numeric,
  ingreso_estetica numeric,
  margen_estetica numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver reportes.';
  end if;

  return query
  with compras as (
    select coalesce(sum(ci.costo_total), 0) as total
    from public.compras_insumos ci
    join public.movimientos_inventario mi on mi.id = ci.movimiento_id
    where public.fecha_negocio(mi.created_at) between p_desde and p_hasta
  ),
  -- Salidas SIN cita ligada (consumo manual, merma, ajuste negativo):
  -- se valorizan y agrupan por la fecha del propio movimiento.
  salidas_sueltas as (
    select
      mi.tipo,
      mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0) as valor
    from public.movimientos_inventario mi
    where mi.cita_estetica_id is null
      and mi.tipo in ('salida_consumo', 'salida_merma', 'ajuste_negativo')
      and public.fecha_negocio(mi.created_at) between p_desde and p_hasta
  ),
  -- Citas de estética finalizadas en el periodo, por la fecha de la
  -- CITA (no del movimiento) — así ingreso y costo del mismo servicio
  -- siempre caen en el mismo periodo aunque el cierre real haya
  -- cruzado medianoche.
  citas_periodo as (
    select ce.id, ce.precio
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  consumo_estetica as (
    select
      mi.cita_estetica_id as cita_id,
      sum(mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0)) as costo
    from public.movimientos_inventario mi
    where mi.cita_estetica_id in (select id from citas_periodo)
    group by mi.cita_estetica_id
  )
  select
    (select total from compras),
    (select coalesce(sum(valor), 0) from salidas_sueltas) + (select coalesce(sum(costo), 0) from consumo_estetica),
    (select coalesce(sum(valor), 0) from salidas_sueltas where tipo in ('salida_merma', 'ajuste_negativo')),
    (select coalesce(sum(costo), 0) from consumo_estetica),
    (select coalesce(sum(precio), 0) from citas_periodo),
    (select coalesce(sum(precio), 0) from citas_periodo) - (select coalesce(sum(costo), 0) from consumo_estetica);
end;
$$;

grant execute on function public.reporte_costos_periodo(date, date) to authenticated;

-- Mismo cálculo de margen, desglosado por servicio — "de ahí sale el
-- costo real por servicio" tal cual se pidió. Una cita finalizada sin
-- ningún movimiento de consumo ligado (ej. un servicio sin receta
-- configurada) sigue apareciendo con su ingreso completo y costo 0, no
-- desaparece del reporte.
create or replace function public.reporte_margen_por_servicio_periodo(p_desde date, p_hasta date)
returns table (
  servicio_id uuid,
  servicio_nombre text,
  citas_finalizadas int,
  ingreso numeric,
  costo_consumo numeric,
  margen numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver reportes.';
  end if;

  return query
  with citas_periodo as (
    select ce.id, ce.servicio_id, ce.precio
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  costo_por_cita as (
    select
      mi.cita_estetica_id as cita_id,
      sum(mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0)) as costo
    from public.movimientos_inventario mi
    where mi.cita_estetica_id in (select id from citas_periodo)
    group by mi.cita_estetica_id
  )
  select
    s.id,
    s.nombre,
    count(cp.id)::int,
    coalesce(sum(cp.precio), 0),
    coalesce(sum(cpc.costo), 0),
    coalesce(sum(cp.precio), 0) - coalesce(sum(cpc.costo), 0)
  from citas_periodo cp
  join public.servicios s on s.id = cp.servicio_id
  left join costo_por_cita cpc on cpc.cita_id = cp.id
  group by s.id, s.nombre
  order by s.nombre;
end;
$$;

grant execute on function public.reporte_margen_por_servicio_periodo(date, date) to authenticated;
