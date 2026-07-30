-- Aviso antes de vencer, mismo criterio de 3 estados que
-- perro_requisitos_sanitarios_estado. Simplificación consciente: toma
-- la fecha de caducidad de la compra MÁS RECIENTE de ese insumo (no
-- rastrea lotes por separado con su propia existencia restante) — para
-- un negocio de un solo local esto ya avisa a tiempo; si el negocio
-- necesita FEFO real por lote, es una extensión futura, no esta.
create view public.insumos_proxima_caducidad
with (security_invoker = true)
as
select
  i.id as insumo_id,
  i.nombre,
  ult.fecha_caducidad,
  case
    when ult.fecha_caducidad is null then null
    when ult.fecha_caducidad < public.fecha_negocio() then 'vencida'
    when ult.fecha_caducidad <= public.fecha_negocio() + (coalesce(i.dias_aviso_caducidad, 30) * interval '1 day') then 'por_vencer'
    else 'vigente'
  end as estado
from public.insumos i
left join lateral (
  select m.fecha_caducidad
  from public.movimientos_inventario m
  where m.insumo_id = i.id and m.tipo = 'entrada_compra' and m.fecha_caducidad is not null
  order by m.fecha_caducidad desc
  limit 1
) ult on true
where i.deleted_at is null and i.requiere_caducidad = true;
