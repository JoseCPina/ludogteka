-- QA N43 (18 de octubre de 2026, GRAVE): dos personas con el mismo registro abierto. El admin movió una reserva de
-- hotel a 19→21 oct ($900); recepción, con «Mover fechas» abierto desde antes, guardó 19→20 y la regresó a $450 sin
-- ningún aviso. Control de concurrencia OPTIMISTA, en la base para que ningún camino se lo salte (UPDATE directo por
-- la API o dentro de un RPC):
--
--   * La pantalla manda en el encabezado `x-peludesk-version` la versión (updated_at) que LEYÓ de cada registro que
--     edita: [{"t":"estancias","i":"<id>","v":"<updated_at>"}]. Si en la base cambió desde entonces, el disparador
--     `concurrencia_antes` NO guarda: lanza PT409 (PostgREST lo devuelve como HTTP 409) con quién lo cambió, cuándo
--     y qué cambió (de la bitácora). Guardar encima exige `x-peludesk-forzar: 1` y queda marcado en la bitácora.
--   * `concurrencia_despues` anota cada edición de una persona en `registro_ediciones` (quién, cuándo, qué columnas,
--     antes y después). Ediciones seguidas de la misma persona en 2 minutos se juntan en una fila.
--   * Un registro que la misma transacción ya modificó (updated_at = now()) no se vuelve a revisar: un RPC que toca
--     la fila dos veces, o un disparador en cascada, no choca consigo mismo.

-- ── 1. Bitácora de ediciones ──────────────────────────────────────────
create table public.registro_ediciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tabla text not null,
  registro_id uuid not null,
  profile_id uuid references auth.users(id) on delete set null,
  cambios jsonb not null default '{}'::jsonb,
  ultimo_at timestamptz not null default now(),
  sobrescribio boolean not null default false,
  version_leida timestamptz,
  version_encontrada timestamptz,
  sobrescrito_de uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index registro_ediciones_negocio_idx on public.registro_ediciones (negocio_id);
create index registro_ediciones_registro_idx on public.registro_ediciones (tabla, registro_id, ultimo_at desc);
create trigger set_updated_at before insert or update on public.registro_ediciones
  for each row execute function public.set_updated_at();
alter table public.registro_ediciones enable row level security;
create policy registro_ediciones_select on public.registro_ediciones
  for select to authenticated using ((select coalesce(public.is_staff(), false)));
create policy registro_ediciones_negocio on public.registro_ediciones
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy registro_ediciones_negocio_definer on public.registro_ediciones
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy registro_ediciones_escritura_ins on public.registro_ediciones
  as restrictive for insert to authenticated, peludesk_definer with check ((select public.exigir_negocio_escribible()));
create policy registro_ediciones_escritura_upd on public.registro_ediciones
  as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy registro_ediciones_escritura_del on public.registro_ediciones
  as restrictive for delete to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible()));
grant select on public.registro_ediciones to authenticated;
grant select, insert, update on public.registro_ediciones to peludesk_definer;

-- ── 2. Lo que la pantalla dice haber leído ─────────────────────────────
-- Del encabezado de la petición (PostgREST) o, en pruebas y RPC internos, de `app.peludesk_version` (mismo JSON).
create or replace function public.concurrencia_versiones()
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_txt text;
  v jsonb;
begin
  v_txt := nullif(current_setting('app.peludesk_version', true), '');
  if v_txt is null then
    begin
      v_txt := nullif(current_setting('request.headers', true), '')::json ->> 'x-peludesk-version';
    exception when others then
      v_txt := null;
    end;
  end if;
  if v_txt is null then
    return null;
  end if;
  begin
    v := v_txt::jsonb;
  exception when others then
    return null;
  end;
  return case when jsonb_typeof(v) = 'array' then v else null end;
end;
$$;
revoke execute on function public.concurrencia_versiones() from public, anon;
grant execute on function public.concurrencia_versiones() to authenticated, service_role, peludesk_definer;

create or replace function public.concurrencia_forzar()
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  v_txt text;
begin
  v_txt := nullif(current_setting('app.peludesk_forzar', true), '');
  if v_txt is null then
    begin
      v_txt := nullif(current_setting('request.headers', true), '')::json ->> 'x-peludesk-forzar';
    exception when others then
      v_txt := null;
    end;
  end if;
  return coalesce(v_txt, '') in ('1', 'true', 'si');
end;
$$;
revoke execute on function public.concurrencia_forzar() from public, anon;
grant execute on function public.concurrencia_forzar() to authenticated, service_role, peludesk_definer;

create or replace function public.concurrencia_version_leida(p_tabla text, p_id uuid)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  v jsonb := public.concurrencia_versiones();
  e jsonb;
begin
  if v is null or p_id is null then
    return null;
  end if;
  for e in select * from jsonb_array_elements(v) loop
    if e ->> 't' = p_tabla and e ->> 'i' = p_id::text and nullif(e ->> 'v', '') is not null then
      begin
        return (e ->> 'v')::timestamptz;
      exception when others then
        return null;
      end;
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function public.concurrencia_version_leida(text, uuid) from public, anon;
grant execute on function public.concurrencia_version_leida(text, uuid) to authenticated, service_role, peludesk_definer;

-- Quién y qué cambió un registro desde una versión (lo que enseña el aviso de conflicto).
create or replace function public.concurrencia_detalle(p_tabla text, p_id uuid, p_desde timestamptz)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  r record;
  v_cambios jsonb := '{}'::jsonb;
  v_quien uuid;
  v_cuando timestamptz;
  k text;
  par jsonb;
begin
  for r in
    select e.profile_id, e.ultimo_at, e.cambios
      from public.registro_ediciones e
     where e.tabla = p_tabla and e.registro_id = p_id and e.ultimo_at > coalesce(p_desde, '-infinity'::timestamptz)
       and e.negocio_id = public.negocio_actual()
     order by e.ultimo_at asc
  loop
    v_quien := coalesce(r.profile_id, v_quien);
    v_cuando := r.ultimo_at;
    for k, par in select * from jsonb_each(r.cambios) loop
      if v_cambios ? k then
        v_cambios := jsonb_set(v_cambios, array[k], jsonb_build_array(v_cambios -> k -> 0, par -> 1));
      else
        v_cambios := v_cambios || jsonb_build_object(k, par);
      end if;
    end loop;
  end loop;
  return jsonb_build_object(
    'tabla', p_tabla,
    'id', p_id,
    'quien', case when v_quien is null then null else public.nombre_de_persona(v_quien, null) end,
    'quien_id', v_quien,
    'cuando', v_cuando,
    'cambios', v_cambios
  );
end;
$$;
alter function public.concurrencia_detalle(text, uuid, timestamptz) owner to peludesk_definer;
revoke execute on function public.concurrencia_detalle(text, uuid, timestamptz) from public, anon;
grant execute on function public.concurrencia_detalle(text, uuid, timestamptz) to authenticated, service_role;

-- ── 3. Los disparadores comunes ───────────────────────────────────────
-- Argumento: la columna que identifica el registro (por omisión `id`).
create or replace function public.concurrencia_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_col text := coalesce(tg_argv[0], 'id');
  v_id uuid := (to_jsonb(old) ->> v_col)::uuid;
  v_leida timestamptz;
  v_actual timestamptz := (to_jsonb(old) ->> 'updated_at')::timestamptz;
  v_det jsonb;
begin
  v_leida := public.concurrencia_version_leida(tg_table_name, v_id);
  if v_leida is null or v_actual is null then
    return new;
  end if;
  -- Ya lo cambió esta misma transacción (un RPC que toca la fila dos veces o un disparador en cascada).
  if v_actual = now() then
    return new;
  end if;
  if date_trunc('milliseconds', v_actual) = date_trunc('milliseconds', v_leida) then
    return new;
  end if;
  if public.concurrencia_forzar() then
    return new;
  end if;
  v_det := public.concurrencia_detalle(tg_table_name, v_id, v_leida)
    || jsonb_build_object('version_actual', v_actual, 'version_leida', v_leida);
  raise exception 'Alguien más cambió este registro mientras lo tenías abierto.'
    using errcode = 'PT409', detail = v_det::text, hint = 'conflicto_version';
end;
$$;
revoke execute on function public.concurrencia_antes() from public, anon;
grant execute on function public.concurrencia_antes() to authenticated, service_role;

create or replace function public.concurrencia_despues()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_col text := coalesce(tg_argv[0], 'id');
  v_id uuid := (to_jsonb(new) ->> v_col)::uuid;
  v_quien uuid := auth.uid();
  v_cambios jsonb;
  v_leida timestamptz;
  v_antes timestamptz := (to_jsonb(old) ->> 'updated_at')::timestamptz;
  v_forzado boolean := false;
  v_previa record;
  v_negocio uuid := (to_jsonb(new) ->> 'negocio_id')::uuid;
  k text;
  par jsonb;
begin
  if v_quien is null or v_negocio is null then
    return null;
  end if;
  select coalesce(jsonb_object_agg(o.key, jsonb_build_array(o.value, n.value)), '{}'::jsonb)
    into v_cambios
    from jsonb_each(to_jsonb(old)) o
    join jsonb_each(to_jsonb(new)) n using (key)
   where o.value is distinct from n.value
     and o.key not in ('updated_at', 'rango');
  if v_cambios = '{}'::jsonb then
    return null;
  end if;
  v_leida := public.concurrencia_version_leida(tg_table_name, v_id);
  v_forzado := v_leida is not null and v_antes is not null and v_antes <> now()
    and date_trunc('milliseconds', v_antes) <> date_trunc('milliseconds', v_leida)
    and public.concurrencia_forzar();
  begin
    if not v_forzado then
      select e.id, e.cambios into v_previa
        from public.registro_ediciones e
       where e.tabla = tg_table_name and e.registro_id = v_id and e.profile_id = v_quien
         and e.negocio_id = v_negocio and not e.sobrescribio and e.ultimo_at > now() - interval '2 minutes'
       order by e.ultimo_at desc
       limit 1;
      if found then
        for k, par in select * from jsonb_each(v_cambios) loop
          if v_previa.cambios ? k then
            v_previa.cambios := jsonb_set(v_previa.cambios, array[k], jsonb_build_array(v_previa.cambios -> k -> 0, par -> 1));
          else
            v_previa.cambios := v_previa.cambios || jsonb_build_object(k, par);
          end if;
        end loop;
        update public.registro_ediciones set cambios = v_previa.cambios, ultimo_at = now() where id = v_previa.id;
        return null;
      end if;
    end if;
    insert into public.registro_ediciones
      (negocio_id, tabla, registro_id, profile_id, cambios, ultimo_at, sobrescribio, version_leida, version_encontrada, sobrescrito_de)
    values
      (v_negocio, tg_table_name, v_id, v_quien, v_cambios, now(), v_forzado,
       case when v_forzado then v_leida end, case when v_forzado then v_antes end,
       case when v_forzado then (public.concurrencia_detalle(tg_table_name, v_id, v_leida) ->> 'quien_id')::uuid end);
  exception when others then
    -- La bitácora nunca impide guardar.
    null;
  end;
  return null;
end;
$$;
alter function public.concurrencia_despues() owner to peludesk_definer;
revoke execute on function public.concurrencia_despues() from public, anon;
grant execute on function public.concurrencia_despues() to authenticated, service_role;

-- ── 4. Las tablas que dos personas pueden tener abiertas ───────────────
do $$
declare
  t record;
begin
  for t in
    select * from (values
      ('estancias', 'id'), ('reservas', 'id'), ('citas_estetica', 'id'), ('vet_citas', 'id'), ('vet_consultas', 'id'),
      ('cargos_aplicados', 'id'), ('clientes', 'id'), ('perros', 'id'), ('clientes_notas_internas', 'cliente_id'),
      ('perros_notas_clinicas', 'perro_id'), ('carnet_vacunas', 'id'), ('carnet_desparasitaciones', 'id'),
      ('tarifas', 'id'), ('tarifas_dia_semana', 'id'), ('servicios', 'id'), ('insumos', 'id'), ('grupos_raza', 'id'),
      ('empleados', 'id'), ('empleados_horario', 'id'), ('esquemas_pago', 'id'), ('permisos_staff', 'id'),
      ('membresias', 'id'), ('negocio_perfil', 'id'), ('cupo_configuracion', 'id'), ('horario_semana', 'id'),
      ('negocio_politicas', 'id'), ('veterinaria_ajustes', 'id'), ('tipos_requisito_sanitario', 'id')
    ) as x(tabla, col)
  loop
    if to_regclass('public.' || t.tabla) is null then
      raise notice 'concurrencia: no existe %', t.tabla;
      continue;
    end if;
    execute format('drop trigger if exists concurrencia_antes on public.%I', t.tabla);
    execute format('drop trigger if exists concurrencia_despues on public.%I', t.tabla);
    execute format('create trigger concurrencia_antes before update on public.%I for each row execute function public.concurrencia_antes(%L)', t.tabla, t.col);
    execute format('create trigger concurrencia_despues after update on public.%I for each row execute function public.concurrencia_despues(%L)', t.tabla, t.col);
  end loop;
end $$;

-- ── 5. Mover fechas: el precio y el saldo que resultan se ven ANTES de guardar ──
-- Vista previa: hace el cambio, lee el total y el saldo, y lo deshace (sub-bloque). Con la RLS de quien llama.
create or replace function public.estancia_cotizar_fechas(p_estancia_id uuid, p_entrada date, p_salida date)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_reserva uuid;
  v_antes record;
  v_despues record;
  v_precio numeric;
  v_error text;
begin
  select reserva_id into v_reserva from public.estancias where id = p_estancia_id and deleted_at is null;
  if v_reserva is null then
    raise exception 'No encontramos esa reserva.';
  end if;
  select total_cuenta, saldo into v_antes from public.cuenta_totales_reserva(v_reserva);
  begin
    update public.estancias set fecha_entrada = p_entrada, fecha_salida = p_salida where id = p_estancia_id;
    select precio_unitario into v_precio from public.estancias where id = p_estancia_id;
    select total_cuenta, saldo into v_despues from public.cuenta_totales_reserva(v_reserva);
    raise exception using errcode = 'P0001', message = '__vista_previa__';
  exception when others then
    if sqlerrm <> '__vista_previa__' then
      v_error := sqlerrm;
    end if;
  end;
  return jsonb_build_object(
    'error', v_error,
    'total_antes', v_antes.total_cuenta, 'saldo_antes', v_antes.saldo,
    'total_despues', case when v_error is null then v_despues.total_cuenta end,
    'saldo_despues', case when v_error is null then v_despues.saldo end,
    'precio_unitario', v_precio
  );
end;
$$;
revoke execute on function public.estancia_cotizar_fechas(uuid, date, date) from public, anon;
grant execute on function public.estancia_cotizar_fechas(uuid, date, date) to authenticated, service_role;

-- Guardar: el mismo cambio, y si el total que resulta no es el que la persona vio, no se guarda.
create or replace function public.estancia_mover_fechas(p_estancia_id uuid, p_entrada date, p_salida date, p_total_visto numeric)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_reserva uuid;
  v_total numeric;
  v_saldo numeric;
begin
  select reserva_id into v_reserva from public.estancias where id = p_estancia_id and deleted_at is null;
  if v_reserva is null then
    raise exception 'No encontramos esa reserva.';
  end if;
  update public.estancias set fecha_entrada = p_entrada, fecha_salida = p_salida where id = p_estancia_id;
  select total_cuenta, saldo into v_total, v_saldo from public.cuenta_totales_reserva(v_reserva);
  if p_total_visto is null or abs(coalesce(v_total, 0) - p_total_visto) > 0.005 then
    raise exception 'Con esas fechas el total de la cuenta queda en $%. Revisa la vista previa antes de guardar.',
      to_char(coalesce(v_total, 0), 'FM999,999,990.00')
      using errcode = 'P0001', hint = 'total_distinto';
  end if;
  return jsonb_build_object('total', v_total, 'saldo', v_saldo,
    'version', (select updated_at from public.estancias where id = p_estancia_id));
end;
$$;
revoke execute on function public.estancia_mover_fechas(uuid, date, date, numeric) from public, anon;
grant execute on function public.estancia_mover_fechas(uuid, date, date, numeric) to authenticated, service_role;
