-- Fase 8 Bloque A: reporte financiero por periodo. Admin-only (recepción
-- no ve reportes ni costos, regla ya establecida desde Fase 1).
--
-- Distingue a propósito dos números que ya se separaron desde Fase 5
-- para exactamente este momento ("Los movimientos deben quedar
-- registrados de modo que Fase 8 pueda distinguir venta de bono,
-- consumo de bono e ingreso reconocido, sin inferirlo" — comentario
-- literal en movimientos_bono):
--
--   - ingreso_caja_neto: lo que de verdad entró/salió del cajón
--     (cobros − devoluciones − retiros). Reconcilia con los cortes de
--     caja del periodo, cash-basis puro.
--   - ingreso_reconocido: lo que el negocio realmente GANÓ en el
--     periodo — el mismo total de cobros, pero cambiando "vendí un
--     bono" (dinero que entró pero es diferido) por "se consumió una
--     unidad de un bono" (el ingreso ya prestado el servicio). Es el
--     número correcto para comparar contra costos y sacar margen
--     (Bloque B) — usar ingreso_caja_neto ahí inflaría el margen justo
--     el mes que se vende un bono grande y lo desinflaría el mes que se
--     consume.
--
-- Todo se filtra por fecha_negocio(created_at), nunca por el created_at
-- crudo en UTC — misma disciplina de huso horario de toda la app.
create or replace function public.reporte_financiero_periodo(p_desde date, p_hasta date)
returns table (
  cobros_efectivo numeric,
  cobros_terminal numeric,
  cobros_transferencia numeric,
  propinas_efectivo numeric,
  propinas_terminal numeric,
  propinas_transferencia numeric,
  devoluciones_efectivo numeric,
  devoluciones_terminal numeric,
  devoluciones_transferencia numeric,
  retiros_efectivo numeric,
  bonos_vendidos numeric,
  bonos_consumidos numeric,
  descuentos_otorgados numeric,
  ingreso_caja_neto numeric,
  ingreso_reconocido numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  -- cobros/cobro_metodos etc. tienen SELECT abierto a is_staff() (lo
  -- necesita el día a día de recepción) — un reporte AGREGADO es otra
  -- cosa (regla desde Fase 1: recepción no ve reportes). Esta función no
  -- es security definer, así que sin este chequeo explícito recepción
  -- podría llamarla igual y el RLS de las tablas de abajo no la
  -- detendría.
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver reportes.';
  end if;

  return query
  with cobros_periodo as (
    select cm.metodo, cm.monto, cm.propina
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where public.fecha_negocio(c.created_at) between p_desde and p_hasta
  ),
  devoluciones_periodo as (
    select dm.metodo, dm.monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    where public.fecha_negocio(d.created_at) between p_desde and p_hasta
  ),
  retiros_periodo as (
    select coalesce(sum(monto), 0) as total
    from public.movimientos_caja
    where public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  bonos_periodo as (
    select
      coalesce(sum(monto) filter (where tipo = 'venta'), 0) as vendidos,
      coalesce(sum(monto) filter (where tipo = 'consumo'), 0) as consumidos
    from public.movimientos_bono
    where public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  descuentos_periodo as (
    select coalesce(sum(monto_aplicado), 0) as total
    from public.descuentos_aplicados
    where not cancelado
      and public.fecha_negocio(created_at) between p_desde and p_hasta
  )
  select
    coalesce(sum(monto) filter (where metodo = 'efectivo'), 0),
    coalesce(sum(monto) filter (where metodo = 'terminal'), 0),
    coalesce(sum(monto) filter (where metodo = 'transferencia'), 0),
    coalesce(sum(propina) filter (where metodo = 'efectivo'), 0),
    coalesce(sum(propina) filter (where metodo = 'terminal'), 0),
    coalesce(sum(propina) filter (where metodo = 'transferencia'), 0),
    (select coalesce(sum(monto) filter (where metodo = 'efectivo'), 0) from devoluciones_periodo),
    (select coalesce(sum(monto) filter (where metodo = 'terminal'), 0) from devoluciones_periodo),
    (select coalesce(sum(monto) filter (where metodo = 'transferencia'), 0) from devoluciones_periodo),
    (select total from retiros_periodo),
    (select vendidos from bonos_periodo),
    (select consumidos from bonos_periodo),
    (select total from descuentos_periodo),
    -- ingreso_caja_neto: cobros (monto + propina) − devoluciones − retiros
    (coalesce(sum(monto), 0) + coalesce(sum(propina), 0))
      - (select coalesce(sum(monto), 0) from devoluciones_periodo)
      - (select total from retiros_periodo),
    -- ingreso_reconocido: cobros brutos − devoluciones − ventas de bono
    -- (diferido) + consumos de bono (reconocido). Las propinas no son
    -- ingreso del negocio, así que no entran aquí.
    coalesce(sum(monto), 0)
      - (select coalesce(sum(monto), 0) from devoluciones_periodo)
      - (select vendidos from bonos_periodo)
      + (select consumidos from bonos_periodo)
  from cobros_periodo;
end;
$$;

grant execute on function public.reporte_financiero_periodo(date, date) to authenticated;
