-- La ficha clínica (especie, microchip, folio de registro y notas clínicas) la edita también el médico veterinario
-- designado, aunque su rol sea estética (a quien no se le pueden dar permisos por persona). Antes solo admin o recepción
-- con el permiso «Editar ficha clínica»: un MVZ con rol de estética no podía capturar el microchip ni las notas de su paciente.
-- vet_puede = el permiso O ser médico designado, con el módulo prendido. Reversa: volver a tiene_permiso en las dos funciones.
do $$
declare
  f text;
  v_def text;
begin
  foreach f in array array['public.proteger_ficha_clinica()', 'public.perro_notas_clinicas_guardar(uuid,text)'] loop
    v_def := pg_get_functiondef(f::regprocedure);
    v_def := replace(v_def, E'\r', '');
    if position('vet_puede(''editar_ficha_clinica'')' in v_def) = 0 then
      v_def := replace(v_def, 'public.tiene_permiso(''editar_ficha_clinica'')', 'public.vet_puede(''editar_ficha_clinica'')');
      if position('vet_puede(''editar_ficha_clinica'')' in v_def) = 0 then
        raise exception 'No se pudo parchar %: cambió su texto.', f;
      end if;
      execute v_def;
    end if;
  end loop;
end $$;
