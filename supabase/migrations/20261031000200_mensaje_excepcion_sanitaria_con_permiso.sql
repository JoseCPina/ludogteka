-- QA externa (15 de octubre de 2026): el bloqueo por vacunas decía «un admin puede autorizar una excepción» pero
-- también puede quien tenga el permiso «Excepciones al reservar». El mensaje lo dice. Parche con
-- pg_get_functiondef + replace.
do $$
declare
  v_def text;
  v_viejo constant text := $q$raise exception '% Un admin puede autorizar una excepción con motivo.', public.mensaje_requisitos_faltantes(new.perro_id);$q$;
  v_nuevo constant text := $q$raise exception '% Un admin, o quien tenga el permiso «Excepciones al reservar», puede autorizar una excepción con motivo.', public.mensaje_requisitos_faltantes(new.perro_id);$q$;
begin
  select pg_get_functiondef('public.validar_estancia()'::regprocedure) into v_def;
  if position(v_viejo in v_def) = 0 then
    raise exception 'validar_estancia ya no trae el mensaje esperado; revisar a mano.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
