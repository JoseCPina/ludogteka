-- Bug real, encontrado probando con dos lotes de fechas distintas: la
-- vista ordenaba por `fecha_caducidad desc`, o sea que con un lote
-- lejano (60 días) y uno próximo a vencer (5 días) registrado después,
-- ganaba el lote LEJANO (fecha más grande) y el aviso real del lote
-- próximo a vencer quedaba escondido — el comentario original decía
-- "la compra más reciente" pero el ORDER BY no hacía eso. Corregido a
-- `created_at desc`: la última compra registrada es la que manda.
drop view public.insumos_proxima_caducidad;

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
  order by m.created_at desc
  limit 1
) ult on true
where i.deleted_at is null and i.requiere_caducidad = true;
