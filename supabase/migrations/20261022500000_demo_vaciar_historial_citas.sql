-- demo_vaciar no podía vaciar un demo con citas que se reprogramaron o cancelaron: el historial
-- (citas_estetica_cambios) es inmutable y su disparador rechaza el borrado. Además su lista fija no
-- conocía portal_invitaciones ni conciliacion_terminal.
-- Solo para el negocio demo (la función ya se niega a otro plan): dentro de la transacción de la función
-- se apaga el disparador de usuario de esa tabla y se vuelve a encender al terminar; si algo falla,
-- todo se deshace. Se parcha la definición viva (no se reescribe) por si el otro carril la tocó.
-- Reversa: restaurar la definición anterior de demo_vaciar (migración 20260925180903 y siguientes).
do $$
declare v_def text;
begin
  v_def := replace(pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure), E'\r', '');
  if position('disable trigger user' in v_def) = 0 then
    v_def := replace(v_def, E'  while cardinality(v_pendientes) > 0 loop',
      E'  alter table public.citas_estetica_cambios disable trigger user;\n  while cardinality(v_pendientes) > 0 loop');
    v_def := replace(v_def, E'  -- Lo que sembró el script en el catálogo copiado',
      E'  alter table public.citas_estetica_cambios enable trigger user;\n  -- Lo que sembró el script en el catálogo copiado');
    if position('portal_invitaciones' in v_def) = 0 then
      v_def := replace(v_def, $a$'adelantos', 'asistencia_correcciones'$a$,
        $b$'conciliacion_terminal', 'portal_invitaciones', 'adelantos', 'asistencia_correcciones'$b$);
    end if;
    if position('enable trigger user' in v_def) = 0 or position('portal_invitaciones' in v_def) = 0 then
      raise exception 'demo_vaciar cambió: no se pudo parchar.';
    end if;
    execute v_def;
  end if;
end $$;
