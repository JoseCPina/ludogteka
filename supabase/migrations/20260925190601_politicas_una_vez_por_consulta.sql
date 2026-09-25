-- Las políticas de RLS que preguntan por el rol o el permiso de quien llama
-- (is_staff(), is_admin(), current_rol(), es_admin_plataforma(),
-- tiene_permiso('x')) los evaluaban FILA POR FILA: sin argumentos de la
-- fila, Postgres no sabe que el resultado es el mismo para toda la
-- consulta, y cada llamada consulta membresías. Con pocas filas no se nota;
-- con un mes de operación, cuentas_abiertas() —que suma la cuenta de cada
-- reserva— pasaba de 8 segundos y la Caja no cargaba («canceling statement
-- due to statement timeout», encontrado con el negocio de demostración el
-- 25 de septiembre de 2026).
--
-- Envueltas en (SELECT …) Postgres las calcula una vez por consulta
-- (initPlan). Mismo resultado, misma regla: solo cambia cuántas veces se
-- calcula. Se reescriben todas las políticas del esquema public que las
-- usan sin envolver; las que ya venían envueltas (negocio_actual(),
-- es_miembro(), negocio_escribible()) se quedan igual.
--
-- Una política nueva se escribe ya envuelta: `using ((select public.is_staff()))`.
do $$
declare
  r record;
  v_qual text;
  v_check text;
  v_patron constant text := '(?<!SELECT )\m(public\.)?(is_staff|is_admin|current_rol|es_admin_plataforma)\(\)';
  v_permiso constant text := '(?<!SELECT )\m(public\.)?tiene_permiso\((''[a-z_]+''::text)\)';
begin
  for r in select tablename, policyname, qual, with_check from pg_policies where schemaname = 'public' loop
    v_qual := regexp_replace(regexp_replace(r.qual, v_patron, '(SELECT \1\2())', 'g'), v_permiso, '(SELECT \1tiene_permiso(\2))', 'g');
    v_check := regexp_replace(regexp_replace(r.with_check, v_patron, '(SELECT \1\2())', 'g'), v_permiso, '(SELECT \1tiene_permiso(\2))', 'g');
    if v_qual is distinct from r.qual then
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, v_qual);
    end if;
    if v_check is distinct from r.with_check then
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, v_check);
    end if;
  end loop;
end;
$$;

-- Las cuentas se arman por reserva: estas dos no tenían índice.
create index if not exists citas_estetica_reserva_id_idx on public.citas_estetica (reserva_id);
create index if not exists bonos_clientes_reserva_id_idx on public.bonos_clientes (reserva_id);
