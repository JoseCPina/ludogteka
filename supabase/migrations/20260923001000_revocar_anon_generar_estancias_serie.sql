-- Al probar la migración anterior con la llave anónima pelada:
-- generar_estancias_serie respondía "Serie recurrente no encontrada" en
-- vez de "permission denied". No filtra nada (no es security definer y
-- RLS no le deja ver ni escribir), pero la regla del proyecto es que
-- anon no pueda ni tocar una función de staff: se le revoca por nombre,
-- que es lo único que `from public` no hace.
revoke execute on function public.generar_estancias_serie(uuid, int) from public;
revoke execute on function public.generar_estancias_serie(uuid, int) from anon;
grant execute on function public.generar_estancias_serie(uuid, int) to authenticated;
