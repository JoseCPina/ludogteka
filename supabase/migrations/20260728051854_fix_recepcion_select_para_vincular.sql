-- Bug real encontrado probando en el navegador: recepción no podía
-- vincular NINGUNA cuenta, con cualquier condición en la política de
-- UPDATE (incluso "using(true) with check(true)" fallaba). Aislado tras
-- una sesión larga de diagnóstico: no era la política de UPDATE.
--
-- Es una interacción documentada de Postgres entre RLS e índices únicos:
-- para verificar profiles_cliente_id_unico_idx (Migración 2) al escribir
-- cliente_id, Postgres necesita poder "ver" bajo RLS el espacio de filas
-- donde podría existir un conflicto. profiles_select_recepcion_pendientes
-- (Migración 3) excluía justo las filas con cliente_id no nulo — el
-- estado que un posible conflicto tendría — así que Postgres no podía
-- confirmar la ausencia de conflicto y lo reportaba como violación de RLS
-- ("new row violates row-level security policy"), no como constraint
-- único. Cambiar sólo columnas ajenas al índice (probado con
-- nombre_completo) funcionaba sin problema — el síntoma apuntaba
-- específicamente a cliente_id.
--
-- Fix: recepción ve TODOS los profiles con rol='cliente' (vinculados o
-- no), no solo los pendientes — de cualquier forma ya necesita ver ambos
-- estados para poder desvincular, así que es el alcance correcto, no solo
-- un parche técnico.
drop policy if exists profiles_select_recepcion_pendientes on public.profiles;

create policy profiles_select_recepcion_clientes
on public.profiles for select
to authenticated
using (public.current_rol() = 'recepcion' and rol = 'cliente');
