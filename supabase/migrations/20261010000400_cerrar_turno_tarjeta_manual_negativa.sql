-- Un turno donde solo se corrigió una tarjeta manual de un turno anterior
-- («no recibida» o una devolución) tiene un esperado de tarjeta manual NEGATIVO
-- (más devuelto que cobrado en ese turno): la línea del corte guardaba
-- conteo = esperado y la base lo rechazaba (conteo >= 0), así que ese turno no
-- se podía cerrar. El conteo de tarjeta manual no es un conteo físico: se anota
-- en cero como mínimo y el esperado (con su signo) queda tal cual; la diferencia
-- de esa línea sigue en cero.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select replace(pg_get_functiondef('public.cerrar_turno(uuid,numeric,numeric,numeric,text,text)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def,
    $a$(v_corte_id, 'tarjeta_manual', v_esperado_tarjeta_manual, v_esperado_tarjeta_manual, 0, auth.uid())$a$,
    $b$(v_corte_id, 'tarjeta_manual', greatest(v_esperado_tarjeta_manual, 0), v_esperado_tarjeta_manual, 0, auth.uid())$b$);
  if v_nuevo = v_def then raise exception 'cerrar_turno cambió: no se pudo ajustar la línea de tarjeta manual.'; end if;
  execute v_nuevo;
end $$;
