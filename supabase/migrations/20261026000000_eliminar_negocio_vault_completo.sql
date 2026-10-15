-- plataforma_eliminar_negocio solo borraba de Vault la credencial de cobro (integraciones_cobro.secreto_id): la llave
-- del PAC de la facturación (cfdi_config_negocio.llave_secreto_id) y cualquier otro secreto 'peludesk:<negocio>:…'
-- se quedaban sin dueño. Ahora se borran todos los secretos del negocio: los que sus tablas apuntan y los que llevan
-- su id en el nombre. Reversa: restaurar la función de 20261021000300.
do $$
declare
  v_def text;
  v_ancla text := E'  -- La bitácora de la plataforma se conserva';
begin
  v_def := replace(pg_get_functiondef('public.plataforma_eliminar_negocio(uuid,text)'::regprocedure), E'\r', '');
  if position('cfdi_config_negocio' in v_def) = 0 then
    if position(v_ancla in v_def) = 0 then raise exception 'No se pudo parchar plataforma_eliminar_negocio: cambió su texto.'; end if;
    v_def := replace(v_def, v_ancla,
      E'  -- Llave del PAC de facturación y cualquier otro secreto del negocio (su id va en el nombre).\n'
      || E'  delete from vault.secrets where id in (select c.llave_secreto_id from public.cfdi_config_negocio c where c.negocio_id = p_negocio_id and c.llave_secreto_id is not null)\n'
      || E'     or name like ''peludesk:'' || p_negocio_id::text || '':%'';\n'
      || E'  get diagnostics v_vault_extra = row_count;\n'
      || E'  v_vault := v_vault + v_vault_extra;\n\n' || v_ancla);
    v_def := replace(v_def, E'  v_vault int := 0;', E'  v_vault int := 0;\n  v_vault_extra int := 0;');
    if position('v_vault_extra int' in v_def) = 0 then raise exception 'No se pudo declarar v_vault_extra.'; end if;
    execute v_def;
  end if;
end $$;
