-- Bug real, encontrado al probar (no solo leyendo el código): la
-- restricción original armaba int4range(cantidad_desde,
-- coalesce(cantidad_hasta, 2147483647), '[]'). Un rango con límite
-- superior INCLUSIVO se normaliza internamente sumando 1 al límite para
-- guardarlo en forma canónica exclusiva — con 2147483647 (el máximo de
-- int4) esa suma desborda: "ERROR 22003: integer out of range", y
-- tronaba CUALQUIER insert a tarifas con cantidad_hasta null (el caso más
-- común: "sin tope superior").
--
-- Fix: en vez de fingir infinito con un número finito enorme, se usa
-- infinito de verdad. int4range(desde, null) dado con bounds por default
-- ('[)') ya representa "sin límite superior" sin necesitar normalizar
-- nada. Para el caso con tope, cantidad_hasta + 1 como límite EXCLUSIVO
-- reproduce el mismo "hasta inclusive" que antes, sin arriesgar overflow
-- (cantidad_hasta es un número de noches/días real, nunca cerca de
-- INT_MAX).
alter table public.tarifas drop constraint tarifas_sin_traslape;

alter table public.tarifas
  add constraint tarifas_sin_traslape
  exclude using gist (
    servicio_id with =,
    coalesce(tamano_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(pelaje_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    vigencia_desde with =,
    int4range(
      cantidad_desde,
      case when cantidad_hasta is null then null else cantidad_hasta + 1 end
    ) with &&
  )
  where (deleted_at is null);
