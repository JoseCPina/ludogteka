-- demo_vaciar_veterinaria no conocía las tablas que el cobro de la consulta (vet_consulta_cargos) y el estimado aceptado
-- después de firmar (vet_estimado_compensaciones) colgaron de vet_consultas: `sembrar-demo.mjs --rehacer` fallaba con
-- «dependencias entre {vet_consultas}». Se parcha la definición viva (no se reescribe) para que las vacíe antes.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.demo_vaciar_veterinaria(uuid, boolean)'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'No encontré demo_vaciar_veterinaria.';
  end if;
  if position('vet_consulta_cargos' in v_def) = 0 then
    v_def := replace(v_def, '''vet_consulta_adendas'',', '''vet_consulta_adendas'', ''vet_consulta_cargos'', ''vet_estimado_compensaciones'',');
    if position('vet_consulta_cargos' in v_def) = 0 then
      raise exception 'No pude parchar demo_vaciar_veterinaria: cambió su lista.';
    end if;
    execute v_def;
  end if;
end;
$$;
