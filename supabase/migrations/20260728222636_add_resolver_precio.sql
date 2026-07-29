-- Resolución de precio: LA única implementación. Fase 4 (reservas) y
-- Fase 5 (POS) deben llamar esta función para cualquier cosa que se vaya
-- a cobrar — nunca reconstruir el "vigencia_desde más reciente <= fecha"
-- a mano en una pantalla, que es exactamente donde un precio equivocado
-- entraría en silencio.
--
-- Devuelve SIEMPRE una fila (nunca vacío) con un `estado` explícito, tres
-- valores posibles — mismo principio que perro_requisitos_sanitarios_estado
-- en Fase 2 (un hueco silencioso es peor que un estado feo):
--   - 'disponible': hay precio, se puede cobrar.
--   - 'no_aplica': existe la fila pero está marcada no_aplica (p. ej.
--     deslanado en pelo corto) — es una decisión de negocio, no un hueco.
--   - 'sin_tarifa': nadie ha capturado un precio para esta combinación en
--     esta fecha — un hueco real de captura, y debe tratarse como error
--     bloqueante, no como "gratis" ni como "no aplica".
create or replace function public.resolver_precio(
  p_servicio_id uuid,
  p_tamano_id uuid,
  p_pelaje_id uuid,
  p_cantidad int,
  p_fecha date default current_date
)
returns table (precio numeric, no_aplica boolean, estado text, vigencia_desde date)
language sql
stable
set search_path = ''
as $$
  select
    t.precio,
    t.no_aplica,
    case
      when t.id is null then 'sin_tarifa'
      when t.no_aplica then 'no_aplica'
      else 'disponible'
    end as estado,
    t.vigencia_desde
  from (select 1) as _dummy
  left join lateral (
    select tr.id, tr.precio, tr.no_aplica, tr.vigencia_desde
    from public.tarifas tr
    where tr.servicio_id = p_servicio_id
      and tr.tamano_id is not distinct from p_tamano_id
      and tr.pelaje_id is not distinct from p_pelaje_id
      and p_cantidad >= tr.cantidad_desde
      and (tr.cantidad_hasta is null or p_cantidad <= tr.cantidad_hasta)
      and tr.vigencia_desde <= p_fecha
      and tr.deleted_at is null
    order by tr.vigencia_desde desc
    limit 1
  ) t on true;
$$;

grant execute on function public.resolver_precio(uuid, uuid, uuid, int, date) to authenticated;

-- Lista de precios vigentes HOY, para pantallas de solo consulta (portal
-- del cliente, catálogo de staff) — no para calcular un cobro real, eso
-- es trabajo de resolver_precio(). DISTINCT ON sobre el mismo criterio de
-- "más reciente primero", mismo patrón que perro_peso_actual en Fase 2.
create view public.tarifas_vigentes
with (security_invoker = true)
as
select distinct on (t.servicio_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta)
  t.servicio_id,
  s.nombre as servicio_nombre,
  s.categoria,
  s.unidad,
  t.tamano_id,
  t.pelaje_id,
  t.cantidad_desde,
  t.cantidad_hasta,
  t.precio,
  t.no_aplica,
  t.vigencia_desde
from public.tarifas t
join public.servicios s on s.id = t.servicio_id
where t.vigencia_desde <= current_date
  and t.deleted_at is null
  and s.deleted_at is null
order by
  t.servicio_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta,
  t.vigencia_desde desc;
