-- QA S49 (Vet): «Emitir receta» también desde una consulta ABIERTA (borrador), no solo desde una firmada, prellenada
-- con el tratamiento capturado hasta ese momento. La receta sigue siendo del médico designado (vet_receta_emitir no
-- cambia en eso); lo único que cambia es qué consulta se puede ligar:
--   · firmada o borrador: sí;  · anulada: no (la receta se emite desde la ficha o desde otra consulta).
-- Y un borrador con una receta vigente ya no se descarta: hay que firmarlo o anular la receta primero (si no, la
-- receta quedaría ligada a una consulta borrada).

-- ── 1. vet_receta_emitir: borrador o firmada ─────────────────────────
do $$
declare
  v_def text := replace(pg_get_functiondef('public.vet_receta_emitir(uuid, uuid, jsonb, text, text)'::regprocedure), chr(13), '');
  v_viejo text := E'    if v_cons.estado <> ''firmada'' then\n      raise exception ''La receta se emite desde una consulta firmada. Firma primero la consulta.'';\n    end if;\n';
begin
  if position('Esa consulta está anulada' in v_def) > 0 then return; end if;
  if position(v_viejo in v_def) = 0 then raise exception 'vet_receta_emitir cambió: revisa este parche.'; end if;
  v_def := replace(v_def, v_viejo,
    E'    if v_cons.estado not in (''firmada'', ''borrador'') then\n' ||
    E'      raise exception ''Esa consulta está anulada: emite la receta desde la ficha de la mascota o desde otra consulta.'';\n' ||
    E'    end if;\n');
  execute v_def;
end $$;

-- ── 2. vet_consulta_descartar: no con una receta vigente ─────────────
do $$
declare
  v_def text := replace(pg_get_functiondef('public.vet_consulta_descartar(uuid)'::regprocedure), chr(13), '');
  v_ancla text := E'    raise exception ''Solo se descarta un borrador: una consulta firmada se anula con un motivo.'';\n  end if;\n';
begin
  if position('ya tiene una receta emitida' in v_def) > 0 then return; end if;
  if position(v_ancla in v_def) = 0 then raise exception 'vet_consulta_descartar cambió: revisa este parche.'; end if;
  v_def := replace(v_def, v_ancla, v_ancla ||
    E'  if exists (select 1 from public.vet_recetas r where r.consulta_id = p_id and r.estado = ''emitida'' and r.deleted_at is null) then\n' ||
    E'    raise exception ''Esta consulta ya tiene una receta emitida: fírmala, o anula la receta antes de descartar el borrador.'';\n' ||
    E'  end if;\n');
  execute v_def;
end $$;
