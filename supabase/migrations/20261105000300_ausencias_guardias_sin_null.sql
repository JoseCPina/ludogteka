-- 1. El aviso de ausencia aprobada en una cita no usa el código de «empalme» (23P01): reprogramar_cita_estetica
--    atrapa ese código y lo confundía con otra cita a la misma hora.
-- 2. Dos guardias de ausencias se escribían contra un valor que puede ser NULL (mi_empleado_id() es NULL para
--    quien no es empleado): `not (NULL or false)` es NULL, el `if` no se dispara y el guardia deja pasar. Así un
--    cliente, o recepción sin ficha de empleado, podía pedir una ausencia por cualquier empleado con cuenta, y
--    cancelar la solicitada de otro. Ahora cada comparación va con coalesce(…, false).
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.validar_cita_estetica()'::regprocedure) into v_def;
  if position(E'          using errcode = ''23P01'';\n' in v_def) = 0 then raise exception 'validar_cita_estetica: no encuentro el errcode'; end if;
  v_def := replace(v_def, E'\n          using errcode = ''23P01'';\n', E';\n');
  execute v_def;

  select pg_get_functiondef('public.solicitar_ausencia(uuid, text, date, date, text, time, time)'::regprocedure) into v_def;
  if position('    v_empleado = public.mi_empleado_id()' in v_def) = 0 then raise exception 'solicitar_ausencia: guardia no encontrado'; end if;
  v_def := replace(v_def, '    v_empleado = public.mi_empleado_id()', '    coalesce(v_empleado = public.mi_empleado_id(), false)');
  v_def := replace(v_def, E'    or (public.current_rol() = ''recepcion'' and v_profile is null)', E'    or (coalesce(public.current_rol() = ''recepcion'', false) and v_profile is null)');
  execute v_def;

  select pg_get_functiondef('public.cancelar_ausencia(uuid, text)'::regprocedure) into v_def;
  if position('    or v_aus.solicitada_por = auth.uid()' in v_def) = 0 then raise exception 'cancelar_ausencia: guardia no encontrado'; end if;
  v_def := replace(v_def, '    or v_aus.solicitada_por = auth.uid()', '    or coalesce(v_aus.solicitada_por = auth.uid(), false)');
  v_def := replace(v_def, '    or v_aus.empleado_id = public.mi_empleado_id()', '    or coalesce(v_aus.empleado_id = public.mi_empleado_id(), false)');
  execute v_def;
end $$;
