-- plataforma_eliminar_negocio no podía borrar un negocio con consultas veterinarias: vet_citas.consulta_id y
-- vet_consultas.cita_id se apuntan entre sí y ninguna tabla quedaba libre. Antes de las pasadas se suelta el
-- vínculo de las citas del negocio (los disparadores de usuario se apagan solo para ese UPDATE y se vuelven a prender).
-- Reversa: restaurar la función de 20261005120100.
do $$
declare
  v_def text;
  v_ancla text := E'  while cardinality(v_pendientes) > 0 loop';
begin
  v_def := replace(pg_get_functiondef('public.plataforma_eliminar_negocio(uuid,text)'::regprocedure), E'\r', '');
  if position('vet_citas_ciclo' in v_def) = 0 then
    if position(v_ancla in v_def) = 0 then raise exception 'No se pudo parchar plataforma_eliminar_negocio: cambió su texto.'; end if;
    v_def := replace(v_def, v_ancla, E'  -- vet_citas_ciclo: la cita apunta a su consulta y la consulta a su cita.\n  alter table public.vet_citas disable trigger user;\n  update public.vet_citas set consulta_id = null where negocio_id = p_negocio_id and consulta_id is not null;\n  alter table public.vet_citas enable trigger user;\n\n' || v_ancla);
    execute v_def;
  end if;
end $$;
