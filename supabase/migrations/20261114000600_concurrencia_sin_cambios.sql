-- QA N43: una actualización que no cambia nada (solo el sello `updated_at`, como el «toque» que hace
-- `cliente_notas_guardar` sobre el cliente para el deshacer del importador) no pisa a nadie: nunca es conflicto.
do $$
declare
  d text := pg_get_functiondef('public.concurrencia_antes()'::regprocedure);
begin
  d := replace(d,
    E'begin\n  v_leida := public.concurrencia_version_leida(tg_table_name, v_id);',
    E'begin\n  if (to_jsonb(new) - ''updated_at'') = (to_jsonb(old) - ''updated_at'') then\n    return new;\n  end if;\n  v_leida := public.concurrencia_version_leida(tg_table_name, v_id);');
  if position('to_jsonb(new) - ''updated_at''' in d) = 0 then
    raise exception 'concurrencia_antes no tiene la forma esperada';
  end if;
  execute d;
end $$;
