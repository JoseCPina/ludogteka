-- N114 (QA S25, 22 de octubre de 2026): las recetas emitidas no salían en la línea de tiempo del expediente
-- (sí en Recetas y en la bitácora). vet_linea_tiempo() las lee de la TABLA vet_recetas, así que entran también
-- las que ya existen. Cada receta es un evento con fecha de emisión, número, médico (de la foto de la receta) y
-- el resumen de sus medicamentos; una anulada sale como anulada. Se parcha la función viva (pg_get_functiondef +
-- replace), sin reescribirla.
do $$
declare
  v_def text := pg_get_functiondef('public.vet_linea_tiempo(uuid)'::regprocedure);
  v_ancla text := 'select w.fecha::timestamp at time zone v_zona';
begin
  if position('''tipo'', ''receta''' in v_def) > 0 then
    return;
  end if;
  if position(v_ancla in v_def) = 0 then
    raise exception 'vet_linea_tiempo: no se encontró el ancla del peso';
  end if;
  v_def := replace(v_def, v_ancla,
    $r$select r.fecha_emision::timestamp at time zone v_zona, jsonb_build_object('tipo', 'receta', 'cuando', r.fecha_emision, 'ref_id', r.id,
        'estado', case when r.anulada_at is not null or r.estado = 'anulada' then 'anulada' else 'vigente' end,
        'titulo', 'Receta N.º ' || r.numero::text,
        'detalle', coalesce((select string_agg(l.producto, ', ' order by l.orden) from public.vet_receta_lineas l where l.receta_id = r.id and l.deleted_at is null), ''),
        'extra', '', 'medico', r.snapshot -> 'medico' ->> 'nombre', 'consulta_id', r.consulta_id)
      from public.vet_recetas r where r.perro_id = p_perro and r.negocio_id = public.negocio_actual() and r.deleted_at is null
    union all
    $r$ || v_ancla);
  execute v_def;
end;
$$;
