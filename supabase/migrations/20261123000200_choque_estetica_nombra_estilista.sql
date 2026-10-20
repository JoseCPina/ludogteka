-- QA S18 (N95): el aviso de choque al agendar estética nombra SIEMPRE a la estilista («La estilista Ana López ya
-- tiene a Firulais a las 09:00»), también cuando quien agenda es ella misma: «Ya tienes a …» no decía de quién era
-- la agenda cuando la dueña agenda en la suya y en la de su equipo.
--
-- REVERSA: volver a «Ya tienes a » cuando p_empleado = auth.uid().
do $$
declare
  v_def text := replace(pg_get_functiondef('public.cita_estetica_choques_texto(uuid, timestamptz, timestamptz, uuid)'::regprocedure), chr(13), '');
  v_viejo text := $v$case when v_tu then 'Ya tienes a ' else v_nombre || ' ya tiene a ' end$v$;
  v_nuevo text := $v$case when v_nombre = 'La estilista' then 'La estilista ya tiene a ' else 'La estilista ' || v_nombre || ' ya tiene a ' end$v$;
begin
  if position(v_nuevo in v_def) > 0 then return; end if;
  if position(v_viejo in v_def) = 0 then raise exception 'cita_estetica_choques_texto cambió: revisa este parche.'; end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
