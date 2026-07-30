-- Bloque B ya existe: la existencia real es existencia_inicial más el
-- ledger completo, no solo el punto de partida de Bloque A. Se recrea
-- (DROP + CREATE, cambia el cálculo) — mismo patrón que
-- cuenta_totales_reserva extendiéndose en cada bloque de Fase 5.
--
-- movimientos_inventario tiene SELECT abierto a los tres roles de staff
-- (sin columnas de dinero), así que esta suma da el mismo resultado sin
-- importar qué rol la consulte — security_invoker = true sigue siendo
-- correcto aquí, a diferencia de compras_insumos (admin-only) que nunca
-- se toca desde esta vista.
drop view public.insumos_existencia_actual;

create view public.insumos_existencia_actual
with (security_invoker = true)
as
select
  i.id as insumo_id,
  i.nombre,
  i.categoria_id,
  i.unidad_consumo_id,
  i.stock_minimo,
  public.existencia_actual_insumo(i.id) as existencia_actual,
  (public.existencia_actual_insumo(i.id) < i.stock_minimo) as bajo_minimo
from public.insumos i
where i.deleted_at is null;
