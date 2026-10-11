-- Veterinaria, Fase 4 · parte 12: la dirección del registro en el SITPV también es una regla de texto
-- (https) editable por la plataforma.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.plataforma_vet_regla_guardar(text,jsonb)'::regprocedure);
  v_def := replace(v_def, 'if p_clave = ''sitpv_url'' then', 'if p_clave in (''sitpv_url'', ''sitpv_url_registro'') then');
  if v_def not like '%sitpv_url_registro%' then
    raise exception 'No se pudo parchar plataforma_vet_regla_guardar: cambió su texto.';
  end if;
  execute v_def;
end $$;
