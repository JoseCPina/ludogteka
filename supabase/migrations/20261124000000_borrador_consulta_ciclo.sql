-- QA S19 (N93, N94, N96, N98): el ciclo completo del borrador de una consulta veterinaria.
--
--   a) Lo aplicado DESDE la consulta (vacuna o desparasitación) lleva la marca registrada_en_consulta y se quita
--      desde la consulta mientras es borrador (vet_consulta_quitar_aplicacion): se anula en el carnet y su cargo se
--      va en el mismo paso. Quitar solo el cargo de una vacuna ya no se deja: la vacuna seguiría en el carnet sin cobro.
--   b) Descartar el borrador anula en el carnet lo que nació en él (no lo registrado desde el carnet), da de baja sus
--      cargos, borra el borrador y regresa la cita al estado que tenía ANTES de «Iniciar consulta»
--      (vet_consultas.cita_estado_previo; antes se dejaba siempre «confirmada»).
--   c) Reparación: los borradores ya descartados que dejaron vacunas vigentes y citas en «confirmada».
--
-- REVERSA: las columnas nuevas se pueden quitar; las anulaciones y las citas reparadas quedan en el historial de
-- ediciones (registro_ediciones) con su estado anterior.

-- ── 1. Columnas ──────────────────────────────────────────────────────
alter table public.carnet_vacunas add column if not exists registrada_en_consulta boolean not null default false;
alter table public.carnet_desparasitaciones add column if not exists registrada_en_consulta boolean not null default false;
alter table public.vet_consultas add column if not exists cita_estado_previo text
  check (cita_estado_previo is null or cita_estado_previo in ('programada', 'confirmada'));

-- Lo registrado con la puerta de la consulta nace ligado Y marcado como nacido ahí.
create or replace function public.vet_carnet_consulta_al_insertar()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_puerta uuid := nullif(coalesce(current_setting('app.vet_consulta_carnet', true), ''), '')::uuid;
begin
  if new.consulta_id is null and v_puerta is not null then
    new.consulta_id := v_puerta;
    new.registrada_en_consulta := true;
  end if;
  return new;
end;
$$;
revoke execute on function public.vet_carnet_consulta_al_insertar() from public, anon, authenticated;

-- ── 2. Iniciar guarda el estado de la cita ───────────────────────────
do $$
declare
  v_def text := replace(pg_get_functiondef('public.vet_consulta_iniciar(uuid, uuid, text, uuid)'::regprocedure), chr(13), '');
begin
  if position('v_previo' in v_def) > 0 then return; end if;
  if position(E'  v_atendida timestamptz := now();\n' in v_def) = 0
     or position(E'    p_perro := v_cita.perro_id;\n' in v_def) = 0
     or position('insert into public.vet_consultas (id, atendida_at,' in v_def) = 0
     or position('values (v_id, v_atendida,' in v_def) = 0 then
    raise exception 'vet_consulta_iniciar cambió: revisa este parche.';
  end if;
  v_def := replace(v_def, E'  v_atendida timestamptz := now();\n', E'  v_atendida timestamptz := now();\n  v_previo text;\n');
  v_def := replace(v_def, E'    p_perro := v_cita.perro_id;\n',
                   E'    p_perro := v_cita.perro_id;\n    v_previo := case when v_cita.estado = ''confirmada'' then ''confirmada'' else ''programada'' end;\n');
  v_def := replace(v_def, 'insert into public.vet_consultas (id, atendida_at,', 'insert into public.vet_consultas (id, cita_estado_previo, atendida_at,');
  v_def := replace(v_def, 'values (v_id, v_atendida,', 'values (v_id, v_previo, v_atendida,');
  execute v_def;
end $$;

-- ── 3. Anular un registro del carnet (interna, sin permiso propio) ───
create or replace function public._vet_carnet_anular(p_tipo text, p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req uuid;
begin
  if p_tipo = 'vacuna' then
    update public.carnet_vacunas set anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = p_motivo
     where id = p_id and negocio_id = public.negocio_actual() and anulada_at is null and deleted_at is null
     returning requisito_aplicado_id into v_req;
    if v_req is not null then
      update public.requisitos_sanitarios_aplicados set deleted_at = now() where id = v_req and deleted_at is null;
    end if;
  else
    update public.carnet_desparasitaciones set anulada_at = now(), anulada_por = auth.uid(), anulada_motivo = p_motivo
     where id = p_id and negocio_id = public.negocio_actual() and anulada_at is null and deleted_at is null;
  end if;
  update public.carnet_recordatorios set estado = 'omitido', nota = 'El registro se anuló', resuelto_por = auth.uid()
   where origen_id = p_id and estado in ('pendiente', 'fallido') and negocio_id = public.negocio_actual();
end;
$$;
alter function public._vet_carnet_anular(text, uuid, text) owner to peludesk_definer;
revoke execute on function public._vet_carnet_anular(text, uuid, text) from public, anon, authenticated;

-- ── 4. Quitar desde la consulta lo que se aplicó en ella ─────────────
create or replace function public.vet_consulta_quitar_aplicacion(p_consulta uuid, p_tipo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro uuid := public._vet_consulta_borrador_de(p_consulta);
  v_ok boolean;
begin
  if p_tipo not in ('vacuna', 'desparasitacion') then raise exception 'Tipo de registro inválido.'; end if;
  if p_tipo = 'vacuna' then
    select (cv.consulta_id = p_consulta and cv.registrada_en_consulta and cv.anulada_at is null) into v_ok
      from public.carnet_vacunas cv where cv.id = p_id and cv.negocio_id = public.negocio_actual() and cv.deleted_at is null;
  else
    select (cd.consulta_id = p_consulta and cd.registrada_en_consulta and cd.anulada_at is null) into v_ok
      from public.carnet_desparasitaciones cd where cd.id = p_id and cd.negocio_id = public.negocio_actual() and cd.deleted_at is null;
  end if;
  if v_ok is null then raise exception 'Ese registro no existe.'; end if;
  if not v_ok then
    raise exception 'Solo se quita desde la consulta lo que se aplicó en ella. Lo registrado en el carnet se anula desde el carnet.';
  end if;
  perform public._vet_carnet_anular(p_tipo, p_id, 'Se quitó de la consulta en borrador');
  perform public._vet_cargos_sincronizar(p_consulta);
  perform v_perro;
end;
$$;
alter function public.vet_consulta_quitar_aplicacion(uuid, text, uuid) owner to peludesk_definer;
revoke execute on function public.vet_consulta_quitar_aplicacion(uuid, text, uuid) from public, anon;
grant execute on function public.vet_consulta_quitar_aplicacion(uuid, text, uuid) to authenticated, service_role;

-- ── 5. Quitar solo el cargo de una vacuna ya no se deja ──────────────
do $$
declare
  v_def text := replace(pg_get_functiondef('public.vet_consulta_cargo_quitar(uuid, text)'::regprocedure), chr(13), '');
  v_ancla text := E'  v := public._vet_cargo_borrador(p_id);\n';
begin
  if position('sigue registrada en el carnet' in v_def) > 0 then return; end if;
  if position(v_ancla in v_def) = 0 then raise exception 'vet_consulta_cargo_quitar cambió: revisa este parche.'; end if;
  v_def := replace(v_def, v_ancla, v_ancla ||
    E'  -- QA S19: una vacuna del carnet no se queda sin su cargo («Sin cobro» con motivo sí: es una cortesía).\n' ||
    E'  if v.tipo = ''vacuna'' and v.vacuna_id is not null and btrim(coalesce(p_motivo, '''')) not ilike ''Sin cobro:%'' then\n' ||
    E'    raise exception ''Esta vacuna sigue registrada en el carnet; para quitarla usa «Quitar» en la consulta.'';\n' ||
    E'  end if;\n');
  execute v_def;
end $$;

-- ── 6. Descartar el borrador, completo ───────────────────────────────
drop function if exists public.vet_consulta_descartar(uuid);
create function public.vet_consulta_descartar(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
  v_r record;
  v_vac int := 0;
  v_desp int := 0;
  v_estado_cita text;
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Descartar un borrador es de un médico veterinario, de admin o de quien tenga «Atender consultas».' using errcode = '42501';
  end if;
  select c.id, c.estado, c.cita_id, c.cita_estado_previo, c.atendida_at into v_c from public.vet_consultas c
   where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_c.estado <> 'borrador' then
    raise exception 'Solo se descarta un borrador: una consulta firmada se anula con un motivo.';
  end if;
  -- Lo que nació en este borrador se anula en el carnet (lo registrado desde el carnet se queda).
  for v_r in select cv.id from public.carnet_vacunas cv
              where cv.consulta_id = p_id and cv.registrada_en_consulta and cv.anulada_at is null and cv.deleted_at is null loop
    perform public._vet_carnet_anular('vacuna', v_r.id, 'Se descartó el borrador de la consulta');
    v_vac := v_vac + 1;
  end loop;
  for v_r in select cd.id from public.carnet_desparasitaciones cd
              where cd.consulta_id = p_id and cd.registrada_en_consulta and cd.anulada_at is null and cd.deleted_at is null loop
    perform public._vet_carnet_anular('desparasitacion', v_r.id, 'Se descartó el borrador de la consulta');
    v_desp := v_desp + 1;
  end loop;
  update public.vet_consulta_cargos set deleted_at = now(), updated_at = now()
   where consulta_id = p_id and estado <> 'cobrado' and deleted_at is null;
  if v_c.cita_id is not null then
    v_estado_cita := coalesce(v_c.cita_estado_previo, 'programada');
    update public.vet_citas set consulta_id = null, estado = v_estado_cita where id = v_c.cita_id and estado = 'en_curso';
    update public.vet_citas set consulta_id = null where id = v_c.cita_id and consulta_id = p_id;
  end if;
  update public.vet_consultas set deleted_at = now() where id = p_id;
  return jsonb_build_object('vacunas_anuladas', v_vac, 'desparasitaciones_anuladas', v_desp, 'cita_id', v_c.cita_id, 'cita_estado', v_estado_cita, 'atendida_at', v_c.atendida_at);
end;
$$;
alter function public.vet_consulta_descartar(uuid) owner to peludesk_definer;
revoke execute on function public.vet_consulta_descartar(uuid) from public, anon;
grant execute on function public.vet_consulta_descartar(uuid) to authenticated, service_role;

-- ── 7. Marca de origen y reparación ──────────────────────────────────
do $$
declare
  r record;
  v_vac int := 0;
  v_citas int := 0;
  v_cargos int := 0;
begin
  -- Nació en la consulta lo ligado a ella y creado mientras el borrador estaba abierto.
  alter table public.carnet_vacunas disable trigger vet_registro_inmutable;
  alter table public.carnet_desparasitaciones disable trigger vet_registro_inmutable;
  for r in select cv.id, cv.negocio_id from public.carnet_vacunas cv join public.vet_consultas c on c.id = cv.consulta_id
            where not cv.registrada_en_consulta and cv.created_at >= c.created_at loop
    perform set_config('app.negocio_id', r.negocio_id::text, true);
    update public.carnet_vacunas set registrada_en_consulta = true where id = r.id;
  end loop;
  for r in select cd.id, cd.negocio_id from public.carnet_desparasitaciones cd join public.vet_consultas c on c.id = cd.consulta_id
            where not cd.registrada_en_consulta and cd.created_at >= c.created_at loop
    perform set_config('app.negocio_id', r.negocio_id::text, true);
    update public.carnet_desparasitaciones set registrada_en_consulta = true where id = r.id;
  end loop;
  alter table public.carnet_vacunas enable trigger vet_registro_inmutable;
  alter table public.carnet_desparasitaciones enable trigger vet_registro_inmutable;

  -- Borradores ya descartados: lo que nació en ellos se anula.
  for r in select cv.id, cv.negocio_id, 'vacuna' as tipo from public.carnet_vacunas cv
             join public.vet_consultas c on c.id = cv.consulta_id
            where c.deleted_at is not null and c.estado = 'borrador' and cv.registrada_en_consulta and cv.anulada_at is null and cv.deleted_at is null
           union all
           select cd.id, cd.negocio_id, 'desparasitacion' from public.carnet_desparasitaciones cd
             join public.vet_consultas c on c.id = cd.consulta_id
            where c.deleted_at is not null and c.estado = 'borrador' and cd.registrada_en_consulta and cd.anulada_at is null and cd.deleted_at is null loop
    begin
      perform set_config('app.negocio_id', r.negocio_id::text, true);
      perform public._vet_carnet_anular(r.tipo, r.id, 'Se descartó el borrador de la consulta (reparación QA S19)');
      v_vac := v_vac + 1;
    exception when others then
      raise notice 'No se pudo anular % %: %', r.tipo, r.id, sqlerrm;
    end;
  end loop;

  -- Sus cargos propuestos se dan de baja.
  for r in select x.id, x.negocio_id from public.vet_consulta_cargos x join public.vet_consultas c on c.id = x.consulta_id
            where c.deleted_at is not null and c.estado = 'borrador' and x.estado <> 'cobrado' and x.deleted_at is null loop
    perform set_config('app.negocio_id', r.negocio_id::text, true);
    update public.vet_consulta_cargos set deleted_at = now(), updated_at = now() where id = r.id;
    v_cargos := v_cargos + 1;
  end loop;

  -- Citas que el descarte dejó en «confirmada» (el descarte las tocó en la misma transacción: misma marca de tiempo).
  for r in select ci.id, ci.negocio_id from public.vet_citas ci
             join public.vet_consultas c on c.cita_id = ci.id
            where c.deleted_at is not null and c.estado = 'borrador' and ci.estado = 'confirmada'
              and ci.consulta_id is null and ci.updated_at = c.deleted_at loop
    begin
      perform set_config('app.negocio_id', r.negocio_id::text, true);
      update public.vet_citas set estado = 'programada' where id = r.id;
      v_citas := v_citas + 1;
    exception when others then
      raise notice 'No se pudo regresar la cita %: %', r.id, sqlerrm;
    end;
  end loop;
  perform set_config('app.negocio_id', '', true);
  raise notice 'Reparación QA S19: % registros del carnet anulados, % cargos dados de baja, % citas regresadas a programada', v_vac, v_cargos, v_citas;
end $$;
