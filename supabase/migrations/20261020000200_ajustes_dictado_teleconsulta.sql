-- Fase 5: veterinaria_ajustes_actuales() entrega también las opciones del dictado y de la teleconsulta
-- (conservar audio 30 días, cobro anticipado y precio) para la pantalla de Ajustes.
-- Reversa: volver a parchar la función sin esas tres claves.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.veterinaria_ajustes_actuales()'::regprocedure);
  v_def := replace(v_def, E'\r', '');
  if v_def not like '%dictado_conservar_audio%' then
    v_def := replace(v_def, '''espejo_antimicrobianos'', a.espejo_antimicrobianos)',
      '''espejo_antimicrobianos'', a.espejo_antimicrobianos, ''dictado_conservar_audio'', a.dictado_conservar_audio, ''teleconsulta_cobro_anticipado'', a.teleconsulta_cobro_anticipado, ''teleconsulta_precio'', a.teleconsulta_precio)');
    v_def := replace(v_def, '''espejo_antimicrobianos'', false)',
      '''espejo_antimicrobianos'', false, ''dictado_conservar_audio'', false, ''teleconsulta_cobro_anticipado'', false, ''teleconsulta_precio'', null)');
    if v_def not like '%a.dictado_conservar_audio%' or v_def not like '%''dictado_conservar_audio'', false%' then
      raise exception 'No se pudo parchar veterinaria_ajustes_actuales: cambió su texto.';
    end if;
    execute v_def;
  end if;
end $$;
