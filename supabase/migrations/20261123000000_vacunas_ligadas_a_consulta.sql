-- QA S18 (N93): una vacuna aplicada en una consulta queda LIGADA a esa consulta, no al día.
--
-- Causa: la consulta reconocía «sus» vacunas por fecha (vacunas del carnet del mismo día que la consulta). La
-- migración 20261121000100 (R23, N85) movió la fecha de los borradores abiertos a la de su cita; un borrador que
-- ya tenía una vacuna registrada el día anterior se quedó con el CARGO de esa vacuna (ligado por vacuna_id) pero
-- la sección «Vacunas y desparasitación» ya no la encontraba por fecha, y al firmar el cargo pasó a Caja.
--
-- Ahora:
--   · carnet_vacunas.consulta_id y carnet_desparasitaciones.consulta_id dicen en qué consulta se aplicó.
--   · Lo registrado desde la consulta (vet_consulta_registrar_vacuna / _desparasitacion y un producto-vacuna
--     agregado a los cargos) nace ligado. Lo registrado en el carnet ese mismo día sin consulta lo adopta el
--     primer borrador de esa mascota de ese día que se abra, y desde ahí ya no depende de la fecha.
--   · La sincronía quita (baja lógica) el cargo de una vacuna anulada o que ya no es de esa consulta, así que al
--     firmar no puede quedar un cargo de vacuna sin vacuna aplicada en esa consulta.
--   · Reparación: cada vacuna con un cargo de consulta queda ligada a la consulta de su cargo.
--
-- REVERSA: alter table … drop column consulta_id (las funciones vuelven a su versión anterior con la migración
-- 20261029000000); los datos clínicos no cambian.

-- ── 1. Columnas ──────────────────────────────────────────────────────
alter table public.carnet_vacunas add column if not exists consulta_id uuid references public.vet_consultas(id);
alter table public.carnet_desparasitaciones add column if not exists consulta_id uuid references public.vet_consultas(id);
create index if not exists carnet_vacunas_consulta_idx on public.carnet_vacunas (consulta_id) where consulta_id is not null;
create index if not exists carnet_desparasitaciones_consulta_idx on public.carnet_desparasitaciones (consulta_id) where consulta_id is not null;

-- ── 2. Un registro clínico sigue sin editarse; ligar a la consulta (de vacío a una) solo con la puerta ──
create or replace function public.vet_registro_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_libres text[] := array['anulada_at', 'anulada_por', 'anulada_motivo', 'requisito_aplicado_id', 'updated_at', 'estado', 'anulado_at', 'anulado_por', 'anulado_motivo'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Un registro clínico no se borra: se anula con un motivo.' using errcode = '42501';
  end if;
  -- Ligar a su consulta: solo de vacío a una consulta, y solo por la puerta que prende la sincronía.
  if (to_jsonb(old)->>'consulta_id') is null and (to_jsonb(new)->>'consulta_id') is not null
     and coalesce(current_setting('app.vet_ligar_consulta', true), '') = 'on' then
    v_libres := array_append(v_libres, 'consulta_id');
  end if;
  if (to_jsonb(new) - v_libres) is distinct from (to_jsonb(old) - v_libres) then
    raise exception 'Un registro clínico no se edita: se anula con un motivo y se captura de nuevo.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.vet_registro_inmutable() from public, anon, authenticated;

-- Lo que se registra mientras la puerta de la consulta está prendida nace ligado a ella.
create or replace function public.vet_carnet_consulta_al_insertar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.consulta_id is null then
    new.consulta_id := nullif(coalesce(current_setting('app.vet_consulta_carnet', true), ''), '')::uuid;
  end if;
  return new;
end;
$$;
revoke execute on function public.vet_carnet_consulta_al_insertar() from public, anon, authenticated;
drop trigger if exists vet_carnet_consulta_al_insertar on public.carnet_vacunas;
create trigger vet_carnet_consulta_al_insertar before insert on public.carnet_vacunas
  for each row execute function public.vet_carnet_consulta_al_insertar();
drop trigger if exists vet_carnet_consulta_al_insertar on public.carnet_desparasitaciones;
create trigger vet_carnet_consulta_al_insertar before insert on public.carnet_desparasitaciones
  for each row execute function public.vet_carnet_consulta_al_insertar();

-- ── 3. Registrar desde la consulta ───────────────────────────────────
create or replace function public._vet_consulta_borrador_de(p_consulta uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c record;
begin
  if not public.vet_puede('atender_consultas') then
    raise exception 'Registrar algo en una consulta es de quien atiende consultas.' using errcode = '42501';
  end if;
  select c.id, c.estado, c.perro_id into v_c from public.vet_consultas c
   where c.id = p_consulta and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if v_c.id is null then raise exception 'Esa consulta no existe.'; end if;
  if v_c.estado <> 'borrador' then raise exception 'Esta consulta ya no es un borrador: regístralo en el carnet.'; end if;
  return v_c.perro_id;
end;
$$;
alter function public._vet_consulta_borrador_de(uuid) owner to peludesk_definer;
revoke execute on function public._vet_consulta_borrador_de(uuid) from public, anon, authenticated;

create or replace function public.vet_consulta_registrar_vacuna(
  p_consulta uuid, p_biologico text, p_tipo_requisito_id uuid, p_insumo_id uuid, p_lote_id uuid, p_lote_texto text,
  p_laboratorio text, p_fecha date, p_proxima date, p_medico_id uuid, p_dosis text, p_notas text, p_descontar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro uuid := public._vet_consulta_borrador_de(p_consulta);
  v_r jsonb;
begin
  perform set_config('app.vet_consulta_carnet', p_consulta::text, true);
  v_r := public.registrar_vacuna(v_perro, p_biologico, p_tipo_requisito_id, p_insumo_id, p_lote_id, p_lote_texto,
                                 p_laboratorio, p_fecha, p_proxima, p_medico_id, p_dosis, p_notas, p_descontar);
  perform set_config('app.vet_consulta_carnet', '', true);
  perform public._vet_cargos_sincronizar(p_consulta);
  return v_r;
end;
$$;
alter function public.vet_consulta_registrar_vacuna(uuid, text, uuid, uuid, uuid, text, text, date, date, uuid, text, text, boolean) owner to peludesk_definer;
revoke execute on function public.vet_consulta_registrar_vacuna(uuid, text, uuid, uuid, uuid, text, text, date, date, uuid, text, text, boolean) from public, anon;
grant execute on function public.vet_consulta_registrar_vacuna(uuid, text, uuid, uuid, uuid, text, text, date, date, uuid, text, text, boolean) to authenticated, service_role;

create or replace function public.vet_consulta_registrar_desparasitacion(
  p_consulta uuid, p_tipo text, p_producto text, p_insumo_id uuid, p_lote_id uuid, p_lote_texto text, p_dosis text,
  p_fecha date, p_proxima date, p_medico_id uuid, p_notas text, p_descontar boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro uuid := public._vet_consulta_borrador_de(p_consulta);
  v_r jsonb;
begin
  perform set_config('app.vet_consulta_carnet', p_consulta::text, true);
  v_r := public.registrar_desparasitacion(v_perro, p_tipo, p_producto, p_insumo_id, p_lote_id, p_lote_texto, p_dosis,
                                          p_fecha, p_proxima, p_medico_id, p_notas, p_descontar);
  perform set_config('app.vet_consulta_carnet', '', true);
  return v_r;
end;
$$;
alter function public.vet_consulta_registrar_desparasitacion(uuid, text, text, uuid, uuid, text, text, date, date, uuid, text, boolean) owner to peludesk_definer;
revoke execute on function public.vet_consulta_registrar_desparasitacion(uuid, text, text, uuid, uuid, text, text, date, date, uuid, text, boolean) from public, anon;
grant execute on function public.vet_consulta_registrar_desparasitacion(uuid, text, text, uuid, uuid, text, text, date, date, uuid, text, boolean) to authenticated, service_role;

-- ── 4. Un producto-vacuna agregado a los cargos también nace ligado ──
do $$
declare
  v_def text := pg_get_functiondef('public.vet_consulta_cargo_agregar(uuid, text, text, numeric, numeric, uuid, uuid)'::regprocedure);
  v_viejo text := '      v_reg := public.registrar_vacuna(';
begin
  if position(v_viejo in v_def) = 0 then
    raise exception 'vet_consulta_cargo_agregar cambió: revisa este parche.';
  end if;
  if position('app.vet_consulta_carnet' in v_def) = 0 then
    v_def := replace(v_def, v_viejo, '      perform set_config(''app.vet_consulta_carnet'', p_consulta::text, true);' || chr(10) || v_viejo);
    v_def := replace(v_def, '      perform public._vet_cargos_sincronizar(p_consulta);' || chr(10) || '      select x.id into v_id',
                     '      perform set_config(''app.vet_consulta_carnet'', '''', true);' || chr(10) ||
                     '      perform public._vet_cargos_sincronizar(p_consulta);' || chr(10) || '      select x.id into v_id');
    execute v_def;
  end if;
end $$;

-- ── 5. Sincronía: adoptar lo del día sin consulta, proponer lo ligado, quitar lo que ya no es ──
do $$
declare
  v_def text := pg_get_functiondef('public._vet_cargos_sincronizar(uuid)'::regprocedure);
  v_viejo text := '  -- Vacunas aplicadas a la mascota ese día que ninguna consulta ha cobrado.';
  v_filtro_viejo text := 'where cv.perro_id = v_c.perro_id and cv.fecha_aplicacion = v_fecha and cv.anulada_at is null and cv.deleted_at is null';
  v_nuevo text;
begin
  if position(v_viejo in v_def) = 0 or position(v_filtro_viejo in v_def) = 0 then
    raise exception '_vet_cargos_sincronizar cambió: revisa este parche.';
  end if;
  if position('app.vet_ligar_consulta' in v_def) > 0 then return; end if;
  v_nuevo := $n$  -- QA S18 (N93): lo aplicado ese día en el carnet sin consulta queda ligado a este borrador (y desde
  -- ahí no depende de la fecha). Lo que ya está en otra consulta, o ya tiene cargo en otra, no se toca.
  perform set_config('app.vet_ligar_consulta', 'on', true);
  update public.carnet_vacunas cv set consulta_id = p_consulta, updated_at = now()
   where cv.perro_id = v_c.perro_id and cv.consulta_id is null and cv.fecha_aplicacion = v_fecha
     and cv.anulada_at is null and cv.deleted_at is null
     and not exists (select 1 from public.vet_consulta_cargos x where x.vacuna_id = cv.id and x.consulta_id <> p_consulta and x.deleted_at is null);
  update public.carnet_desparasitaciones cd set consulta_id = p_consulta, updated_at = now()
   where cd.perro_id = v_c.perro_id and cd.consulta_id is null and cd.fecha_aplicacion = v_fecha
     and cd.anulada_at is null and cd.deleted_at is null;
  perform set_config('app.vet_ligar_consulta', '', true);
  -- El cargo de una vacuna anulada, o que ya no es de esta consulta, se va (nunca uno ya cobrado).
  update public.vet_consulta_cargos x set deleted_at = now(), updated_at = now()
   where x.consulta_id = p_consulta and x.tipo = 'vacuna' and x.vacuna_id is not null and x.estado <> 'cobrado' and x.deleted_at is null
     and not exists (select 1 from public.carnet_vacunas cv where cv.id = x.vacuna_id and cv.consulta_id = p_consulta
                                                          and cv.anulada_at is null and cv.deleted_at is null);

$n$ || v_viejo;
  v_def := replace(v_def, v_viejo, v_nuevo);
  v_def := replace(v_def, v_filtro_viejo, 'where cv.perro_id = v_c.perro_id and cv.consulta_id = p_consulta and cv.anulada_at is null and cv.deleted_at is null');
  execute v_def;
end $$;

-- ── 6. Reparación: cada vacuna con cargo de consulta queda ligada a esa consulta ──
do $$
declare
  r record;
  v_n int := 0;
begin
  perform set_config('app.vet_ligar_consulta', 'on', true);
  for r in
    select distinct on (cv.id) cv.id, cv.negocio_id, x.consulta_id
      from public.carnet_vacunas cv
      join public.vet_consulta_cargos x on x.vacuna_id = cv.id and x.deleted_at is null
     where cv.consulta_id is null
     order by cv.id, x.created_at
  loop
    begin
      perform set_config('app.negocio_id', r.negocio_id::text, true);
      update public.carnet_vacunas set consulta_id = r.consulta_id, updated_at = now() where id = r.id;
      v_n := v_n + 1;
    exception when others then
      raise notice 'No se pudo ligar la vacuna %: %', r.id, sqlerrm;
    end;
  end loop;
  perform set_config('app.negocio_id', '', true);
  perform set_config('app.vet_ligar_consulta', '', true);
  raise notice 'Vacunas ligadas a su consulta: %', v_n;
end $$;
