-- Bug real de Fase 3, encontrado al probar Fase 4 con un JWT real (no
-- solo leyendo el código): la migración de Fase 2 que puso
-- `created_by default auth.uid()` en cada tabla existente hasta entonces
-- (20260728155904_add_created_by_default_auth_uid.sql) nunca se repitió
-- para servicios ni tarifas, creadas después en Fase 3. Resultado: cada
-- tarifa capturada por la UI de Fase 3 tiene created_by en null, y la
-- columna "Capturado por" del historial de precios ha estado mostrando
-- "—" para todo desde que se construyó, en vez del admin real. No hay
-- forma de recuperar ese dato retroactivo (el JWT de quien capturó cada
-- fila ya no existe); esto solo corrige el default hacia adelante.
--
-- Se aprovecha para cubrir también las tablas nuevas de Fase 4
-- (cupo_configuracion, reservas, estancias) y dejar establecido que toda
-- migración de tabla nueva de aquí en adelante debe declarar el default
-- en el propio CREATE TABLE, no depender de un ALTER aparte que es fácil
-- de olvidar — como ya pasó dos veces.
alter table public.servicios alter column created_by set default auth.uid();
alter table public.tarifas alter column created_by set default auth.uid();
alter table public.cupo_configuracion alter column created_by set default auth.uid();
alter table public.reservas alter column created_by set default auth.uid();
alter table public.estancias alter column created_by set default auth.uid();
