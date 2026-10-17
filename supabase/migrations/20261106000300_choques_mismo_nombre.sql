-- El aviso nombra a la estilista igual en las dos frases (la de la cita y la de la ausencia): por su perfil.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.cita_estetica_choques_texto(uuid, timestamptz, timestamptz, uuid)'::regprocedure) into v_def;
  if position('public.ausencia_texto(v_aus.nombre,' in v_def) = 0 then raise exception 'cita_estetica_choques_texto: llamada no encontrada'; end if;
  execute replace(v_def, 'public.ausencia_texto(v_aus.nombre,', 'public.ausencia_texto(v_nombre,');
end $$;
