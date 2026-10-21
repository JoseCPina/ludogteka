-- QA S22 (N111): una consulta firmada guarda SOLO lo capturado. Las etiquetas de la plantilla que quedaron sin
-- contenido («Tiempo de evolución:», «Mucosas:», «Estudios solicitados:»…) no se guardan al firmar ni se muestran;
-- una etiqueta con texto («Mucosas: rosadas») o seguida de renglones que la desarrollan se conserva.
-- La misma regla que `sinTitulosVacios` (src/lib/veterinaria/portal-texto.ts): si cambia una, cambia la otra.

-- ── 1. La regla ─────────────────────────────────────────────────────
create or replace function public.vet_sin_titulos_vacios(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_lineas text[];
  v_salida text[] := '{}';
  v_linea text;
  v_sig text;
  i int;
  j int;
begin
  if p_texto is null then return null; end if;
  v_lineas := string_to_array(replace(p_texto, chr(13), ''), E'\n');
  for i in 1 .. coalesce(array_length(v_lineas, 1), 0) loop
    v_linea := regexp_replace(v_lineas[i], '\s+$', '');
    if btrim(v_linea) ~ '^([^\n:]{1,80}:\s*)+$' then
      v_sig := null;
      for j in i + 1 .. array_length(v_lineas, 1) loop
        if btrim(v_lineas[j]) <> '' then v_sig := btrim(v_lineas[j]); exit; end if;
      end loop;
      -- Un título solo se queda si lo que sigue es texto suyo (no otro título ni el final).
      if v_sig is null or v_sig ~ '^[^\n:]{1,80}:' then continue; end if;
    end if;
    v_salida := array_append(v_salida, v_linea);
  end loop;
  return btrim(regexp_replace(array_to_string(v_salida, E'\n'), E'\n{3,}', E'\n\n', 'g'), E' \n\t');
end;
$$;
revoke execute on function public.vet_sin_titulos_vacios(text) from public, anon;
grant execute on function public.vet_sin_titulos_vacios(text) to authenticated, service_role, peludesk_definer;

-- ── 2. Al firmar se limpia ANTES de revisar el motivo y de calcular la huella ──
do $$
declare
  v_def text := replace(pg_get_functiondef('public.vet_consulta_firmar(uuid)'::regprocedure), chr(13), '');
  v_ancla text := E'  if btrim(coalesce(v_c.motivo, \'\')) = \'\' then\n';
begin
  if position('vet_sin_titulos_vacios' in v_def) > 0 then return; end if;
  if position(v_ancla in v_def) = 0 then raise exception 'vet_consulta_firmar cambió: revisa este parche.'; end if;
  v_def := replace(v_def, v_ancla,
    E'  -- QA S22 (N111): se guarda solo lo capturado; las etiquetas de la plantilla sin contenido se van.\n' ||
    E'  update public.vet_consultas set\n' ||
    E'    motivo = public.vet_sin_titulos_vacios(motivo), anamnesis = public.vet_sin_titulos_vacios(anamnesis),\n' ||
    E'    examen_fisico = public.vet_sin_titulos_vacios(examen_fisico), hallazgos = public.vet_sin_titulos_vacios(hallazgos),\n' ||
    E'    plan = public.vet_sin_titulos_vacios(plan), tratamiento = public.vet_sin_titulos_vacios(tratamiento)\n' ||
    E'  where id = p_id;\n' ||
    E'  select c.* into v_c from public.vet_consultas c where c.id = p_id;\n' || v_ancla);
  execute v_def;
end $$;

-- ── 3. Reparación de lo ya firmado (también lo anulado) ─────────────
-- Solo se quitan etiquetas vacías; el texto capturado no se toca. La huella se recalcula con la misma fórmula
-- de la firma, y el texto y la huella de antes quedan en plataforma_eventos (`limpiar_etiquetas_consulta`).
do $$
declare
  v_def text;
  v_acciones text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  v_acciones := string_to_array((regexp_match(v_def, '\{([^}]*)\}'))[1], ',');
  if coalesce(array_length(v_acciones, 1), 0) < 10 then raise exception 'plataforma_eventos_accion_check cambió de forma: no se pudo leer la lista de acciones.'; end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || array['limpiar_etiquetas_consulta']) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

do $$
declare
  r record;
  v_n int := 0;
  v_hash text;
  v_campos jsonb;
begin
  alter table public.vet_consultas disable trigger user;
  for r in
    select c.*,
           public.vet_sin_titulos_vacios(c.motivo) as n_motivo, public.vet_sin_titulos_vacios(c.anamnesis) as n_anamnesis,
           public.vet_sin_titulos_vacios(c.examen_fisico) as n_examen, public.vet_sin_titulos_vacios(c.hallazgos) as n_hallazgos,
           public.vet_sin_titulos_vacios(c.plan) as n_plan, public.vet_sin_titulos_vacios(c.tratamiento) as n_tratamiento
      from public.vet_consultas c
     where c.estado in ('firmada', 'anulada') and c.deleted_at is null
  loop
    if r.n_motivo is not distinct from r.motivo and r.n_anamnesis is not distinct from r.anamnesis
       and r.n_examen is not distinct from r.examen_fisico and r.n_hallazgos is not distinct from r.hallazgos
       and r.n_plan is not distinct from r.plan and r.n_tratamiento is not distinct from r.tratamiento then
      continue;
    end if;
    v_hash := encode(sha256(convert_to(jsonb_build_object(
        'id', r.id, 'perro', r.perro_id, 'tipo', r.tipo_clave, 'atendida_at', r.atendida_at, 'motivo', r.n_motivo, 'anamnesis', r.n_anamnesis,
        'examen_fisico', r.n_examen, 'hallazgos', r.n_hallazgos, 'peso_kg', r.peso_kg, 'temperatura_c', r.temperatura_c,
        'fc', r.frecuencia_cardiaca, 'fr', r.frecuencia_respiratoria, 'cc', r.condicion_corporal, 'mucosas', r.mucosas, 'tllc', r.tllc_seg,
        'hidratacion', r.hidratacion, 'diagnosticos', r.diagnosticos, 'plan', r.n_plan, 'tratamiento', r.n_tratamiento,
        'notas_internas', r.notas_internas, 'medico', r.firma_medico_id, 'cedula', r.firma_cedula)::text, 'UTF8')), 'hex');
    v_campos := jsonb_build_object('motivo', r.motivo, 'anamnesis', r.anamnesis, 'examen_fisico', r.examen_fisico,
      'hallazgos', r.hallazgos, 'plan', r.plan, 'tratamiento', r.tratamiento, 'firma_hash', r.firma_hash);
    insert into public.plataforma_eventos (accion, negocio_id, motivo, detalle)
    values ('limpiar_etiquetas_consulta', r.negocio_id, 'QA S22 (N111): etiquetas vacías de la plantilla',
            jsonb_build_object('consulta_id', r.id, 'antes', v_campos, 'firma_hash_nueva', v_hash));
    update public.vet_consultas set
      motivo = r.n_motivo, anamnesis = r.n_anamnesis, examen_fisico = r.n_examen, hallazgos = r.n_hallazgos,
      plan = r.n_plan, tratamiento = r.n_tratamiento, firma_hash = v_hash
    where id = r.id;
    v_n := v_n + 1;
  end loop;
  alter table public.vet_consultas enable trigger user;
  raise notice 'Consultas firmadas limpiadas: %', v_n;
end $$;
