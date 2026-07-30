-- Existencia actual + alerta de stock mínimo, explícita y visible desde
-- el catálogo mismo (no enterrada en un reporte aparte). Por ahora
-- existencia_actual = existencia_inicial: todavía no hay movimientos
-- (Bloque B). Cuando exista movimientos_inventario, esta vista se
-- recrea (DROP + CREATE, cambia el cálculo) para sumar el ledger sobre
-- esta misma base — mismo patrón que cuenta_totales_reserva
-- extendiéndose en cada bloque de Fase 5.
create view public.insumos_existencia_actual
with (security_invoker = true)
as
select
  i.id as insumo_id,
  i.nombre,
  i.categoria_id,
  i.unidad_consumo_id,
  i.stock_minimo,
  i.existencia_inicial as existencia_actual,
  (i.existencia_inicial < i.stock_minimo) as bajo_minimo
from public.insumos i
where i.deleted_at is null;
