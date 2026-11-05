-- Revertir operaciones (5 de noviembre de 2026; rama fix/revertir-operaciones; docs/revertir-operaciones.md).
--
-- Regla: toda operación del panel que cambia estado o dinero tiene «Deshacer» o su acción inversa, con motivo
-- obligatorio, permiso («Deshacer operaciones», admin siempre), bitácora de quién y cuándo (operaciones_revertidas,
-- inmutable) y efectos encadenados. Lo que ya movió dinero no se borra: un cobro se anula (anular_cobro), una devolución
-- se anula aquí con su rastro, una factura va por nota de crédito.
--
-- Lo nuevo:
--   · transicion_estado_reserva_valida acepta, con la puerta app.revertir, en_curso→reservada/cancelada,
--     finalizada→en_curso y no_llego/cancelada→reservada. Solo las funciones de aquí la prenden.
--   · revertir_checkin_estancia, revertir_checkout_estancia, reabrir_estancia (no llegó o cancelada → reservada),
--     reabrir_cita (cancelada, no llegó o eliminada → reservada), revertir_finalizacion_cita, reactivar_cargo,
--     reactivar_venta_mostrador, reabrir_cuenta y anular_devolucion.
--   · «No llegó» también deja quién y cuándo (cancelada_por/cancelada_at), como cancelar.
--   · Una cuenta cancelada que se reabre (cuentas_canceladas.deleted_at + reabierta_*) deja de contar como cancelada en
--     todas las funciones que lo preguntan; una devolución anulada (devoluciones.deleted_at + anulada_*) deja de sumar en
--     caja, reportes y cuentas (se parchan todas las funciones que la suman).

-- ── 0. Permiso ──────────────────────────────────────────────────────────────────────────────────────────────
insert into public.permisos_catalogo (clave, etiqueta, modulos, orden, updated_at)
values ('revertir_operaciones', 'Deshacer operaciones (check-in, salida, no llegó, cancelaciones, cargos, devoluciones)', '{}',
        coalesce((select max(orden) from public.permisos_catalogo), 0) + 1, now())
on conflict (clave) do nothing;

-- ── 1. Bitácora ─────────────────────────────────────────────────────────────────────────────────────────────
create table public.operaciones_revertidas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tipo text not null check (tipo in ('checkin_estancia', 'checkout_estancia', 'no_llego_estancia', 'cancelacion_estancia',
    'cancelacion_cita', 'no_llego_cita', 'eliminacion_cita', 'finalizacion_cita', 'cargo_cancelado', 'venta_cancelada',
    'cuenta_cancelada', 'devolucion')),
  tabla text not null,
  registro_id uuid not null,
  reserva_id uuid references public.reservas(id) on delete set null,
  motivo text not null check (char_length(btrim(motivo)) >= 5),
  antes jsonb not null default '{}'::jsonb,
  despues jsonb not null default '{}'::jsonb,
  efectos jsonb not null default '[]'::jsonb,
  hecha_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index operaciones_revertidas_negocio_idx on public.operaciones_revertidas (negocio_id, created_at desc);
create index operaciones_revertidas_registro_idx on public.operaciones_revertidas (registro_id);
create index operaciones_revertidas_reserva_idx on public.operaciones_revertidas (reserva_id) where reserva_id is not null;
create trigger set_updated_at before insert or update on public.operaciones_revertidas
  for each row execute function public.set_updated_at();
alter table public.operaciones_revertidas enable row level security;
create policy operaciones_revertidas_select on public.operaciones_revertidas
  for select to authenticated using ((select coalesce(public.current_rol() in ('admin', 'recepcion'), false)));
create policy operaciones_revertidas_negocio on public.operaciones_revertidas
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy operaciones_revertidas_negocio_definer on public.operaciones_revertidas
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select on public.operaciones_revertidas to authenticated;
grant select, insert on public.operaciones_revertidas to peludesk_definer;

create or replace function public.operaciones_revertidas_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'La bitácora de operaciones deshechas no se edita ni se borra.';
end;
$$;
create trigger operaciones_revertidas_inmutable before update or delete on public.operaciones_revertidas
  for each row execute function public.operaciones_revertidas_inmutable();
revoke execute on function public.operaciones_revertidas_inmutable() from public, anon;

-- ── 2. Columnas de rastro ───────────────────────────────────────────────────────────────────────────────────
alter table public.cuentas_canceladas
  add column if not exists reabierta_at timestamptz,
  add column if not exists reabierta_por uuid references auth.users(id) on delete set null,
  add column if not exists reabierta_motivo text;
alter table public.devoluciones
  add column if not exists anulada_por uuid references auth.users(id) on delete set null,
  add column if not exists anulada_motivo text;

-- ── 3. Puertas: transiciones de regreso y disparadores que estorban al regresar ─────────────────────────────
create or replace function public.transicion_estado_reserva_valida(p_anterior text, p_nuevo text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (p_anterior = 'reservada' and p_nuevo in ('confirmada', 'cancelada', 'no_llego', 'en_curso'))
    or (p_anterior = 'confirmada' and p_nuevo in ('en_curso', 'cancelada', 'no_llego'))
    or (p_anterior = 'en_curso' and p_nuevo = 'finalizada')
    -- Solo deshacer_checkin_estancia prende esta puerta, y solo para estancias.
    or (p_anterior = 'en_curso' and p_nuevo = 'reservada'
        and coalesce(current_setting('app.deshacer_checkin', true), '') = 'on')
    -- Solo deshacer_inicio_cita prende esta, y solo para citas de estética sin cobros ni consumo.
    or (p_anterior = 'en_curso' and p_nuevo in ('reservada', 'cancelada')
        and coalesce(current_setting('app.deshacer_inicio_cita', true), '') = 'on')
    -- Solo las funciones revertir_*/reabrir_* (migración 20261203004300) prenden esta: deshacer un check-in, una salida,
    -- un «no llegó» o una cancelación, con motivo y bitácora.
    or (coalesce(current_setting('app.revertir', true), '') = 'on' and (
         (p_anterior = 'en_curso' and p_nuevo in ('reservada', 'cancelada'))
      or (p_anterior = 'finalizada' and p_nuevo = 'en_curso')
      or (p_anterior in ('no_llego', 'cancelada') and p_nuevo = 'reservada')));
$$;

-- «No llegó» deja quién y cuándo, igual que cancelar (la fila de la reserva lo enseña).
create or replace function public.estancias_marcar_cancelacion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado in ('cancelada', 'no_llego') and old.estado is distinct from new.estado and old.estado not in ('cancelada', 'no_llego') then
    new.cancelada_at := now();
    new.cancelada_por := coalesce(auth.uid(), new.cancelada_por);
    new.motivo_cancelacion := nullif(btrim(coalesce(new.motivo_cancelacion, '')), '');
  else
    new.motivo_cancelacion := old.motivo_cancelacion;
    new.cancelada_at := old.cancelada_at;
    new.cancelada_por := old.cancelada_por;
  end if;
  return new;
end;
$$;

-- Al regresar a «en curso» o a «reservada» no se vuelve a preguntar por horario ni cupo del check-in original: la
-- revisión ya se hizo cuando entró, y queda tal cual en la bitácora.
create or replace function public.estancias_horario_checkin_checkout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_entra boolean := coalesce(new.estado = 'en_curso' and old.estado is distinct from 'en_curso', false);
  v_sale boolean := coalesce(new.estado = 'finalizada' and old.estado = 'en_curso', false);
  v_momento timestamptz;
  v_fuera text;
begin
  if coalesce(current_setting('app.revertir', true), '') = 'on' then
    new.checkin_fuera_horario := old.checkin_fuera_horario;
    new.checkout_fuera_horario := case when new.estado = 'finalizada' then old.checkout_fuera_horario else null end;
    return new;
  end if;
  if not v_entra then new.checkin_fuera_horario := old.checkin_fuera_horario; end if;
  if not v_sale then new.checkout_fuera_horario := old.checkout_fuera_horario; end if;
  if not (v_entra or v_sale) then
    return new;
  end if;
  v_momento := coalesce(case when v_entra then new.hora_entrada_real else new.hora_salida_real end, now());
  if auth.uid() is null or (v_momento at time zone public.zona_negocio())::date <> public.fecha_negocio() then
    if v_entra then new.checkin_fuera_horario := null; else new.checkout_fuera_horario := null; end if;
    return new;
  end if;
  v_fuera := public.fuera_de_horario(v_momento);
  if v_fuera is null then
    if v_entra then new.checkin_fuera_horario := null; else new.checkout_fuera_horario := null; end if;
    return new;
  end if;
  if (case when v_entra then new.checkin_fuera_horario else new.checkout_fuera_horario end) is distinct from 'confirmado' then
    raise exception '%', public.pregunta_fuera_de_horario(v_momento) using hint = 'fuera_horario';
  end if;
  if v_entra then new.checkin_fuera_horario := v_fuera; else new.checkout_fuera_horario := v_fuera; end if;
  return new;
end;
$$;

create or replace function public.estancias_sobrecupo_checkin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_cupo_d int;
  v_cupo_n int;
  v_hotel boolean;
  v_d int;
  v_n int;
  v_txt text;
  v_queda text;
begin
  if coalesce(current_setting('app.revertir', true), '') = 'on' then
    new.checkin_sobrecupo := old.checkin_sobrecupo;
    return new;
  end if;
  if not (new.estado = 'en_curso' and old.estado is distinct from 'en_curso') then
    new.checkin_sobrecupo := old.checkin_sobrecupo;
    return new;
  end if;
  if new.hora_entrada_real is not null and (new.hora_entrada_real at time zone public.zona_negocio())::date <> v_hoy then
    new.checkin_sobrecupo := null;
    return new;
  end if;
  select c.cupo_diurno, c.cupo_nocturno into v_cupo_d, v_cupo_n from public.resolver_cupo_configuracion(v_hoy) c;
  select s.categoria = 'hotel' into v_hotel from public.servicios s where s.id = new.servicio_id;
  v_d := public.ocupacion_del_dia(v_hoy, false, new.id) + 1;
  if coalesce(v_hotel, false) then
    v_n := public.ocupacion_del_dia(v_hoy, true, new.id) + 1;
  end if;
  if v_cupo_d is not null and v_d > v_cupo_d then
    v_txt := format('La casa está llena (%s/%s); al registrar la entrada quedas en %s/%s.', v_d - 1, v_cupo_d, v_d, v_cupo_d);
    v_queda := format('%s/%s de día', v_d, v_cupo_d);
  elsif v_n is not null and v_cupo_n is not null and v_n > v_cupo_n then
    v_txt := format('El cupo de noche está lleno (%s/%s); al registrar la entrada quedas en %s/%s.', v_n - 1, v_cupo_n, v_n, v_cupo_n);
    v_queda := format('%s/%s de noche', v_n, v_cupo_n);
  end if;
  if v_txt is null then
    new.checkin_sobrecupo := null;
    return new;
  end if;
  if new.checkin_sobrecupo is distinct from 'confirmado' then
    raise exception '%', v_txt using hint = 'sobrecupo';
  end if;
  new.checkin_sobrecupo := v_queda;
  return new;
end;
$$;

-- Un cargo cancelado se reactiva solo por reactivar_cargo (con la puerta).
create or replace function public.marcar_cargo_cancelado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cancelado and not old.cancelado then
    if new.motivo_cancelacion is null or btrim(new.motivo_cancelacion) = '' then
      raise exception 'Escribe el motivo para cancelar este cargo.';
    end if;
    new.cancelado_at := now();
    new.cancelado_por := auth.uid();
  elsif not new.cancelado and old.cancelado then
    if coalesce(current_setting('app.revertir', true), '') <> 'on' then
      raise exception 'Un cargo cancelado se reactiva con «Deshacer» en la cuenta (queda en la bitácora), o aplica un cargo nuevo.';
    end if;
    new.cancelado_at := null;
    new.cancelado_por := null;
    new.motivo_cancelacion := null;
  end if;
  return new;
end;
$$;

-- ── 4. Una cuenta reabierta ya no es «cancelada»; una devolución anulada ya no suma ─────────────────────────
do $$
declare
  f record;
  v_def text;
  v_nuevo text;
  v_n int := 0;
begin
  for f in
    select p.oid, p.proname, replace(pg_get_functiondef(p.oid), E'\r', '') as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (pg_get_functiondef(p.oid) like '%join public.devoluciones d on d.id = dm.devolucion_id%'
           or pg_get_functiondef(p.oid) like '%from public.cuentas_canceladas cc where cc.reserva_id%')
  loop
    v_def := f.def;
    v_nuevo := replace(v_def, 'join public.devoluciones d on d.id = dm.devolucion_id and d.deleted_at is null', '§JOINDEV§');
    v_nuevo := replace(v_nuevo, 'join public.devoluciones d on d.id = dm.devolucion_id', 'join public.devoluciones d on d.id = dm.devolucion_id and d.deleted_at is null');
    v_nuevo := replace(v_nuevo, '§JOINDEV§', 'join public.devoluciones d on d.id = dm.devolucion_id and d.deleted_at is null');
    v_nuevo := replace(v_nuevo, 'from public.cuentas_canceladas cc where cc.deleted_at is null and cc.reserva_id', '§CC§');
    v_nuevo := replace(v_nuevo, 'from public.cuentas_canceladas cc where cc.reserva_id', 'from public.cuentas_canceladas cc where cc.deleted_at is null and cc.reserva_id');
    v_nuevo := replace(v_nuevo, '§CC§', 'from public.cuentas_canceladas cc where cc.deleted_at is null and cc.reserva_id');
    if v_nuevo <> v_def then
      execute v_nuevo;
      v_n := v_n + 1;
    end if;
  end loop;
  raise notice 'Funciones parchadas (devoluciones anuladas / cuentas reabiertas): %', v_n;
end $$;
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.cuenta_para_cancelar(uuid)'::regprocedure), E'\r', '') into v_def;
  if position('where cc.reserva_id = p_reserva_id;' in v_def) > 0 and position('cc.deleted_at is null' in v_def) = 0 then
    execute replace(v_def, 'where cc.reserva_id = p_reserva_id;', 'where cc.reserva_id = p_reserva_id and cc.deleted_at is null;');
  end if;
end $$;

-- ── 5. Lo común: permiso, bitácora y cupo ───────────────────────────────────────────────────────────────────
create or replace function public.revertir_exigir(p_motivo text)
returns text
language plpgsql
stable
set search_path = ''
as $$
begin
  if not coalesce(public.tiene_permiso('revertir_operaciones'), false) then
    raise exception 'No tienes el permiso «Deshacer operaciones». Pídeselo a un admin (Administración → Permisos).' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'Escribe el motivo (qué pasó), al menos 5 letras.';
  end if;
  return btrim(p_motivo);
end;
$$;
revoke execute on function public.revertir_exigir(text) from public, anon;
grant execute on function public.revertir_exigir(text) to authenticated, service_role, peludesk_definer;

create or replace function public.revertir_bitacora(p_tipo text, p_tabla text, p_registro uuid, p_reserva uuid, p_motivo text, p_antes jsonb, p_despues jsonb, p_efectos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.operaciones_revertidas (tipo, tabla, registro_id, reserva_id, motivo, antes, despues, efectos)
  values (p_tipo, p_tabla, p_registro, p_reserva, p_motivo, coalesce(p_antes, '{}'::jsonb), coalesce(p_despues, '{}'::jsonb), coalesce(p_efectos, '[]'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
alter function public.revertir_bitacora(text, text, uuid, uuid, text, jsonb, jsonb, jsonb) owner to peludesk_definer;
revoke execute on function public.revertir_bitacora(text, text, uuid, uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.revertir_bitacora(text, text, uuid, uuid, text, jsonb, jsonb, jsonb) to peludesk_definer, service_role;

-- Para volver a ocupar un lugar en una fecha que no ha pasado: el cupo de hoy o de adelante se vuelve a revisar.
create or replace function public.revertir_cupo_libre(p_estancia uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  e record;
  v_hoy date := public.fecha_negocio();
  v_hotel boolean;
  v_fecha date;
  v_cupo_d int;
  v_cupo_n int;
  v_estado text;
begin
  select es.id, es.servicio_id, es.fecha_entrada, es.fecha_salida into e from public.estancias es where es.id = p_estancia;
  if e.fecha_salida <= v_hoy then return; end if;
  select s.categoria = 'hotel' into v_hotel from public.servicios s where s.id = e.servicio_id;
  perform pg_advisory_xact_lock(hashtext('estancias_cupo'));
  for v_fecha in select generate_series(greatest(e.fecha_entrada, v_hoy), e.fecha_salida - 1, interval '1 day')::date loop
    select c.cupo_diurno, c.cupo_nocturno, c.estado into v_cupo_d, v_cupo_n, v_estado from public.resolver_cupo_configuracion(v_fecha) c;
    if v_estado = 'sin_configurar' then
      raise exception 'No hay cupo configurado para el %: captúralo antes de regresar esta estancia.', v_fecha;
    end if;
    if public.ocupacion_del_dia(v_fecha, false, e.id) + 1 > v_cupo_d then
      raise exception 'Ya no hay cupo (diurno) para el %: el lugar se ocupó. No se puede regresar esta estancia.', v_fecha;
    end if;
    if coalesce(v_hotel, false) and public.ocupacion_del_dia(v_fecha, true, e.id) + 1 > v_cupo_n then
      raise exception 'Ya no hay cupo (nocturno) para el %: el lugar se ocupó. No se puede regresar esta estancia.', v_fecha;
    end if;
  end loop;
end;
$$;
revoke execute on function public.revertir_cupo_libre(uuid) from public, anon;
grant execute on function public.revertir_cupo_libre(uuid) to authenticated, service_role, peludesk_definer;

-- La corrección de precio que el disparador anuló en automático al cancelar la línea regresa con la línea.
create or replace function public.revertir_correcciones_de_linea(p_tipo text, p_linea uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare v_n int;
begin
  update public.cuenta_ajustes_precio a
  set deleted_at = null, anulada_por = null, anulada_motivo = null
  where a.linea_tipo = p_tipo and a.linea_id = p_linea and a.deleted_at is not null
    and a.anulada_motivo like '%anulada en automático%'
    and not exists (select 1 from public.cuenta_ajustes_precio v where v.linea_tipo = a.linea_tipo and v.linea_id = a.linea_id and v.deleted_at is null);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke execute on function public.revertir_correcciones_de_linea(text, uuid) from public, anon;
grant execute on function public.revertir_correcciones_de_linea(text, uuid) to authenticated, service_role, peludesk_definer;

-- Si la línea tenía pase y el día se devolvió al cancelar/«no llegó», al regresarla se vuelve a aplicar.
create or replace function public.revertir_pase_de_estancia(p_estancia uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare v_devuelto int; v_neto int; v_r jsonb;
begin
  select coalesce(sum(case mb.tipo when 'devolucion' then mb.cantidad else 0 end), 0)::int,
         coalesce(sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end), 0)::int
    into v_devuelto, v_neto
  from public.movimientos_bono mb where mb.item_tipo = 'estancia' and mb.item_id = p_estancia and mb.tipo in ('consumo', 'devolucion');
  -- Solo si hubo una devolución y la línea quedó sin cobertura (si nunca se devolvió, el día sigue descontado y no se toca).
  if v_devuelto <= 0 or v_neto > 0 then return null; end if;
  v_r := public.aplicar_bono_a_estancia(p_estancia);
  return v_r;
end;
$$;
revoke execute on function public.revertir_pase_de_estancia(uuid) from public, anon;
grant execute on function public.revertir_pase_de_estancia(uuid) to authenticated, service_role, peludesk_definer;

-- ── 6. Estancias ────────────────────────────────────────────────────────────────────────────────────────────
-- Deshacer un check-in: el perro vuelve a «reservada» (la reserva sigue, con su lugar y su pase: el día lo descontó la
-- reserva, no el check-in) o, si fue un walk-in por error, se cancela (y entonces libera el lugar y el disparador de
-- cancelar devuelve el día del pase). El check-in capturado queda en la bitácora.
create or replace function public.revertir_checkin_estancia(p_estancia uuid, p_motivo text, p_destino text default 'reservada')
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  e record;
  v_antes jsonb;
  v_efectos jsonb := '[]'::jsonb;
  v_id uuid;
  v_saldo numeric;
  v_pase_antes int;
  v_pase_despues int;
begin
  if p_destino not in ('reservada', 'cancelada') then
    raise exception 'El check-in se deshace regresando la estancia a «reservada» o cancelándola.';
  end if;
  select * into e from public.estancias x where x.id = p_estancia and x.negocio_id = public.negocio_actual() and x.deleted_at is null for update;
  if not found then raise exception 'Estancia no encontrada.'; end if;
  if e.estado <> 'en_curso' then
    raise exception 'Solo se deshace el check-in de un perro que está adentro (en curso). Esta estancia está %.', replace(e.estado, '_', ' ');
  end if;
  v_antes := jsonb_build_object('estado', e.estado, 'hora_entrada_real', e.hora_entrada_real, 'entregado_por_nombre', e.entregado_por_nombre,
    'entregado_por_telefono', e.entregado_por_telefono, 'estado_llegada', e.estado_llegada, 'foto_llegada_path', e.foto_llegada_path,
    'checkin_sobrecupo', e.checkin_sobrecupo, 'checkin_fuera_horario', e.checkin_fuera_horario, 'fecha_entrada', e.fecha_entrada);
  select coalesce(sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end), 0)::int into v_pase_antes
  from public.movimientos_bono mb where mb.item_tipo = 'estancia' and mb.item_id = p_estancia and mb.tipo in ('consumo', 'devolucion');
  perform set_config('app.revertir', 'on', true);
  update public.estancias
  set estado = p_destino, hora_entrada_real = null, checkin_sobrecupo = null, checkin_fuera_horario = null,
      motivo_cancelacion = case when p_destino = 'cancelada' then 'Check-in deshecho: ' || v_motivo else motivo_cancelacion end
  where id = p_estancia;
  perform set_config('app.revertir', 'off', true);
  select coalesce(sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end), 0)::int into v_pase_despues
  from public.movimientos_bono mb where mb.item_tipo = 'estancia' and mb.item_id = p_estancia and mb.tipo in ('consumo', 'devolucion');
  if v_pase_despues < v_pase_antes then
    v_efectos := v_efectos || jsonb_build_object('tipo', 'pase_devuelto', 'dias', v_pase_antes - v_pase_despues);
  end if;
  select t.saldo into v_saldo from public.cuenta_totales_reserva(e.reserva_id) t;
  v_efectos := v_efectos || jsonb_build_object('tipo', 'estado', 'de', 'en_curso', 'a', p_destino) || jsonb_build_object('tipo', 'cuenta', 'saldo', v_saldo);
  v_id := public.revertir_bitacora('checkin_estancia', 'estancias', p_estancia, e.reserva_id, v_motivo, v_antes,
    jsonb_build_object('estado', p_destino, 'hora_entrada_real', null), v_efectos);
  return jsonb_build_object('bitacora_id', v_id, 'estancia_id', p_estancia, 'reserva_id', e.reserva_id, 'estado', p_destino, 'efectos', v_efectos, 'saldo', v_saldo);
end;
$$;
alter function public.revertir_checkin_estancia(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.revertir_checkin_estancia(uuid, text, text) from public, anon;
grant execute on function public.revertir_checkin_estancia(uuid, text, text) to authenticated, service_role;

-- Deshacer una salida: la estancia vuelve a «en curso», la cuenta se reabre (vuelve a sumar lo que suma una estancia
-- en curso) y la corrección «Salida anticipada», si la hubo, se anula. Los cobros no se tocan.
create or replace function public.revertir_checkout_estancia(p_estancia uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  e record;
  v_antes jsonb;
  v_efectos jsonb := '[]'::jsonb;
  v_n int;
  v_id uuid;
  v_saldo numeric;
begin
  select * into e from public.estancias x where x.id = p_estancia and x.negocio_id = public.negocio_actual() and x.deleted_at is null for update;
  if not found then raise exception 'Estancia no encontrada.'; end if;
  if e.estado <> 'finalizada' then
    raise exception 'Solo se deshace la salida de una estancia finalizada. Esta está %.', replace(e.estado, '_', ' ');
  end if;
  if e.hora_entrada_real is null then
    raise exception 'Esta estancia se cerró sin check-in: no hay una salida que deshacer.';
  end if;
  v_antes := jsonb_build_object('estado', e.estado, 'hora_salida_real', e.hora_salida_real, 'recogido_por_nombre', e.recogido_por_nombre,
    'recogido_por_telefono', e.recogido_por_telefono, 'recogido_por_es_dueno', e.recogido_por_es_dueno, 'checkout_fuera_horario', e.checkout_fuera_horario,
    'pertenencias_sin_entrega_motivo', e.pertenencias_sin_entrega_motivo, 'horas', e.horas);
  update public.cuenta_ajustes_precio a
  set deleted_at = now(), anulada_por = auth.uid(), anulada_motivo = 'Salida deshecha: ' || v_motivo
  where a.linea_tipo = 'estancia' and a.linea_id = p_estancia and a.deleted_at is null and a.motivo = 'Salida anticipada';
  get diagnostics v_n = row_count;
  if v_n > 0 then v_efectos := v_efectos || jsonb_build_object('tipo', 'correccion_salida_anticipada_anulada', 'n', v_n); end if;
  perform set_config('app.revertir', 'on', true);
  update public.estancias
  set estado = 'en_curso', hora_salida_real = null, recogido_por_nombre = null, recogido_por_telefono = null, recogido_por_es_dueno = null,
      checkout_fuera_horario = null, pertenencias_sin_entrega_motivo = null, pertenencias_sin_entrega_por = null
  where id = p_estancia;
  perform set_config('app.revertir', 'off', true);
  select t.saldo into v_saldo from public.cuenta_totales_reserva(e.reserva_id) t;
  v_efectos := v_efectos || jsonb_build_object('tipo', 'estado', 'de', 'finalizada', 'a', 'en_curso') || jsonb_build_object('tipo', 'cuenta', 'saldo', v_saldo);
  v_id := public.revertir_bitacora('checkout_estancia', 'estancias', p_estancia, e.reserva_id, v_motivo, v_antes, jsonb_build_object('estado', 'en_curso'), v_efectos);
  return jsonb_build_object('bitacora_id', v_id, 'estancia_id', p_estancia, 'reserva_id', e.reserva_id, 'estado', 'en_curso', 'efectos', v_efectos, 'saldo', v_saldo);
end;
$$;
alter function public.revertir_checkout_estancia(uuid, text) owner to peludesk_definer;
revoke execute on function public.revertir_checkout_estancia(uuid, text) from public, anon;
grant execute on function public.revertir_checkout_estancia(uuid, text) to authenticated, service_role;

-- Deshacer un «no llegó» o una cancelación: la estancia vuelve a «reservada» (ocupa su lugar otra vez; si la fecha no ha
-- pasado se revisa el cupo), el pase que se devolvió se vuelve a aplicar, las correcciones de precio que se anularon en
-- automático regresan, y el saldo a favor que había generado desaparece porque la línea vuelve a sumar.
create or replace function public.reabrir_estancia(p_estancia uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  e record;
  v_antes jsonb;
  v_efectos jsonb := '[]'::jsonb;
  v_pase jsonb;
  v_n int;
  v_id uuid;
  v_saldo numeric;
  v_tipo text;
begin
  select * into e from public.estancias x where x.id = p_estancia and x.negocio_id = public.negocio_actual() and x.deleted_at is null for update;
  if not found then raise exception 'Estancia no encontrada.'; end if;
  if e.estado not in ('no_llego', 'cancelada') then
    raise exception 'Solo se reabre una estancia marcada «no llegó» o cancelada. Esta está %.', replace(e.estado, '_', ' ');
  end if;
  if exists (select 1 from public.perros p where p.id = e.perro_id and p.deleted_at is not null) then
    raise exception 'La mascota está dada de baja: reactívala en su ficha antes de reabrir su estancia.';
  end if;
  v_tipo := case when e.estado = 'no_llego' then 'no_llego_estancia' else 'cancelacion_estancia' end;
  v_antes := jsonb_build_object('estado', e.estado, 'cancelada_at', e.cancelada_at, 'cancelada_por', e.cancelada_por, 'motivo_cancelacion', e.motivo_cancelacion,
    'fecha_entrada', e.fecha_entrada, 'fecha_salida', e.fecha_salida);
  perform public.revertir_cupo_libre(p_estancia);
  perform set_config('app.revertir', 'on', true);
  update public.estancias set estado = 'reservada', dia_cerrado_confirmado = 'confirmado' where id = p_estancia;
  perform set_config('app.revertir', 'off', true);
  v_pase := public.revertir_pase_de_estancia(p_estancia);
  if v_pase is not null then v_efectos := v_efectos || jsonb_build_object('tipo', 'pase', 'detalle', v_pase); end if;
  v_n := public.revertir_correcciones_de_linea('estancia', p_estancia);
  if v_n > 0 then v_efectos := v_efectos || jsonb_build_object('tipo', 'correcciones_restauradas', 'n', v_n); end if;
  select t.saldo into v_saldo from public.cuenta_totales_reserva(e.reserva_id) t;
  v_efectos := v_efectos || jsonb_build_object('tipo', 'estado', 'de', e.estado, 'a', 'reservada') || jsonb_build_object('tipo', 'cuenta', 'saldo', v_saldo);
  v_id := public.revertir_bitacora(v_tipo, 'estancias', p_estancia, e.reserva_id, v_motivo, v_antes, jsonb_build_object('estado', 'reservada'), v_efectos);
  return jsonb_build_object('bitacora_id', v_id, 'estancia_id', p_estancia, 'reserva_id', e.reserva_id, 'estado', 'reservada', 'efectos', v_efectos, 'saldo', v_saldo);
end;
$$;
alter function public.reabrir_estancia(uuid, text) owner to peludesk_definer;
revoke execute on function public.reabrir_estancia(uuid, text) from public, anon;
grant execute on function public.reabrir_estancia(uuid, text) to authenticated, service_role;

-- ── 7. Citas de estética ────────────────────────────────────────────────────────────────────────────────────
do $$
declare v_con text;
begin
  select c.conname into v_con from pg_constraint c
  where c.conrelid = 'public.citas_estetica_cambios'::regclass and c.contype = 'c' and pg_get_constraintdef(c.oid) like '%reprogramacion%';
  if v_con is not null then
    execute format('alter table public.citas_estetica_cambios drop constraint %I', v_con);
  end if;
  alter table public.citas_estetica_cambios add constraint citas_estetica_cambios_tipo_check
    check (tipo in ('reprogramacion', 'cancelacion', 'no_llego', 'eliminacion', 'tarifa_guarderia', 'regreso_a_reservada', 'reversion'));
end $$;

-- Reabrir una cita cancelada, «no llegó» o eliminada: vuelve a «reservada» en su misma hora (si la hora ya la tomó otra
-- cita, la base lo dice y no se reabre), con sus correcciones de precio de regreso.
create or replace function public.reabrir_cita(p_cita uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  c record;
  v_antes jsonb;
  v_efectos jsonb := '[]'::jsonb;
  v_tipo text;
  v_n int;
  v_id uuid;
  v_saldo numeric;
begin
  select * into c from public.citas_estetica x where x.id = p_cita and x.negocio_id = public.negocio_actual() for update;
  if not found then raise exception 'Cita no encontrada.'; end if;
  if c.deleted_at is null and c.estado not in ('cancelada', 'no_llego') then
    raise exception 'Solo se reabre una cita cancelada, «no llegó» o eliminada. Esta está %.', replace(c.estado, '_', ' ');
  end if;
  if exists (select 1 from public.perros p where p.id = c.perro_id and p.deleted_at is not null) then
    raise exception 'La mascota está dada de baja: reactívala en su ficha antes de reabrir su cita.';
  end if;
  v_tipo := case when c.deleted_at is not null then 'eliminacion_cita' when c.estado = 'no_llego' then 'no_llego_cita' else 'cancelacion_cita' end;
  v_antes := jsonb_build_object('estado', c.estado, 'deleted_at', c.deleted_at, 'inicio', c.inicio, 'fin', c.fin);
  perform set_config('app.cambio_agenda', 'on', true);
  perform set_config('app.revertir', 'on', true);
  update public.citas_estetica set estado = case when deleted_at is not null and estado not in ('cancelada', 'no_llego') then estado else 'reservada' end,
                                   deleted_at = null
  where id = p_cita;
  perform set_config('app.revertir', 'off', true);
  perform set_config('app.cambio_agenda', 'off', true);
  insert into public.citas_estetica_cambios (cita_id, tipo, motivo, estado_antes, estado_despues, inicio_antes, inicio_despues, fin_antes, fin_despues, detalle)
  values (p_cita, 'reversion', v_motivo, c.estado, (select estado from public.citas_estetica where id = p_cita), c.inicio, c.inicio, c.fin, c.fin,
          jsonb_build_object('que', v_tipo));
  v_n := public.revertir_correcciones_de_linea('estetica', p_cita);
  if v_n > 0 then v_efectos := v_efectos || jsonb_build_object('tipo', 'correcciones_restauradas', 'n', v_n); end if;
  select t.saldo into v_saldo from public.cuenta_totales_reserva(c.reserva_id) t;
  v_efectos := v_efectos || jsonb_build_object('tipo', 'estado', 'de', c.estado, 'a', (select estado from public.citas_estetica where id = p_cita)) || jsonb_build_object('tipo', 'cuenta', 'saldo', v_saldo);
  v_id := public.revertir_bitacora(v_tipo, 'citas_estetica', p_cita, c.reserva_id, v_motivo, v_antes, jsonb_build_object('estado', 'reservada', 'deleted_at', null), v_efectos);
  return jsonb_build_object('bitacora_id', v_id, 'cita_id', p_cita, 'reserva_id', c.reserva_id, 'efectos', v_efectos, 'saldo', v_saldo);
end;
$$;
alter function public.reabrir_cita(uuid, text) owner to peludesk_definer;
revoke execute on function public.reabrir_cita(uuid, text) from public, anon;
grant execute on function public.reabrir_cita(uuid, text) to authenticated, service_role;

-- Deshacer la finalización de una cita: vuelve a «en curso», lo que consumió del inventario regresa (ajuste positivo
-- con motivo) y la cuenta no cambia (lo cobrado sigue cobrado).
create or replace function public.revertir_finalizacion_cita(p_cita uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  c record;
  m record;
  v_antes jsonb;
  v_efectos jsonb := '[]'::jsonb;
  v_n int := 0;
  v_id uuid;
begin
  select * into c from public.citas_estetica x where x.id = p_cita and x.negocio_id = public.negocio_actual() and x.deleted_at is null for update;
  if not found then raise exception 'Cita no encontrada.'; end if;
  if c.estado <> 'finalizada' then
    raise exception 'Solo se deshace la finalización de una cita finalizada. Esta está %.', replace(c.estado, '_', ' ');
  end if;
  v_antes := jsonb_build_object('estado', c.estado, 'recogido_por_nombre', c.recogido_por_nombre, 'recogido_por_telefono', c.recogido_por_telefono, 'recogido_por_es_dueno', c.recogido_por_es_dueno);
  for m in
    select mi.insumo_id, mi.cantidad_base from public.movimientos_inventario mi
    where mi.cita_estetica_id = p_cita and mi.tipo = 'salida_consumo' and mi.deleted_at is null
  loop
    insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, cita_estetica_id)
    values (m.insumo_id, 'ajuste_positivo', m.cantidad_base, 'Finalización deshecha: ' || v_motivo, p_cita);
    v_n := v_n + 1;
  end loop;
  if v_n > 0 then v_efectos := v_efectos || jsonb_build_object('tipo', 'inventario_regresado', 'n', v_n); end if;
  perform set_config('app.cambio_agenda', 'on', true);
  perform set_config('app.revertir', 'on', true);
  update public.citas_estetica set estado = 'en_curso', recogido_por_nombre = null, recogido_por_telefono = null, recogido_por_es_dueno = null where id = p_cita;
  perform set_config('app.revertir', 'off', true);
  perform set_config('app.cambio_agenda', 'off', true);
  insert into public.citas_estetica_cambios (cita_id, tipo, motivo, estado_antes, estado_despues, inicio_antes, inicio_despues, fin_antes, fin_despues, detalle)
  values (p_cita, 'reversion', v_motivo, 'finalizada', 'en_curso', c.inicio, c.inicio, c.fin, c.fin, jsonb_build_object('que', 'finalizacion_cita'));
  v_efectos := v_efectos || jsonb_build_object('tipo', 'estado', 'de', 'finalizada', 'a', 'en_curso');
  v_id := public.revertir_bitacora('finalizacion_cita', 'citas_estetica', p_cita, c.reserva_id, v_motivo, v_antes, jsonb_build_object('estado', 'en_curso'), v_efectos);
  return jsonb_build_object('bitacora_id', v_id, 'cita_id', p_cita, 'reserva_id', c.reserva_id, 'estado', 'en_curso', 'efectos', v_efectos);
end;
$$;
alter function public.revertir_finalizacion_cita(uuid, text) owner to peludesk_definer;
revoke execute on function public.revertir_finalizacion_cita(uuid, text) from public, anon;
grant execute on function public.revertir_finalizacion_cita(uuid, text) to authenticated, service_role;

-- ── 8. Cargos, ventas, cuentas y devoluciones ───────────────────────────────────────────────────────────────
create or replace function public.reactivar_cargo(p_cargo uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  g record;
  v_id uuid;
  v_saldo numeric;
begin
  select * into g from public.cargos_aplicados x where x.id = p_cargo and x.negocio_id = public.negocio_actual() and x.deleted_at is null for update;
  if not found then raise exception 'Cargo no encontrado.'; end if;
  if not g.cancelado then raise exception 'Este cargo no está cancelado.'; end if;
  if exists (select 1 from public.servicios_extra_aplicados x where x.cargo_id = p_cargo) then
    raise exception 'Este cargo es de un servicio extra cancelado: vuelve a agregar el extra desde Servicios extra (su cargo entra solo).';
  end if;
  if exists (select 1 from public.cuentas_canceladas cc where cc.deleted_at is null and cc.reserva_id = g.reserva_id) then
    raise exception 'La cuenta de este cargo está cancelada: reábrela primero («Reabrir cuenta»).';
  end if;
  perform set_config('app.revertir', 'on', true);
  update public.cargos_aplicados set cancelado = false where id = p_cargo;
  perform set_config('app.revertir', 'off', true);
  select t.saldo into v_saldo from public.cuenta_totales_reserva(g.reserva_id) t;
  v_id := public.revertir_bitacora('cargo_cancelado', 'cargos_aplicados', p_cargo, g.reserva_id, v_motivo,
    jsonb_build_object('cancelado', true, 'motivo_cancelacion', g.motivo_cancelacion, 'cancelado_por', g.cancelado_por, 'cancelado_at', g.cancelado_at),
    jsonb_build_object('cancelado', false), jsonb_build_array(jsonb_build_object('tipo', 'cuenta', 'saldo', v_saldo)));
  return jsonb_build_object('bitacora_id', v_id, 'cargo_id', p_cargo, 'reserva_id', g.reserva_id, 'saldo', v_saldo);
end;
$$;
alter function public.reactivar_cargo(uuid, text) owner to peludesk_definer;
revoke execute on function public.reactivar_cargo(uuid, text) from public, anon;
grant execute on function public.reactivar_cargo(uuid, text) to authenticated, service_role;

create or replace function public.reactivar_venta_mostrador(p_venta uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  v record;
  v_base numeric;
  v_id uuid;
  v_saldo numeric;
  v_efectos jsonb := '[]'::jsonb;
begin
  select * into v from public.ventas_mostrador x where x.id = p_venta and x.negocio_id = public.negocio_actual() and x.deleted_at is null for update;
  if not found then raise exception 'Venta no encontrada.'; end if;
  if not v.cancelado then raise exception 'Este renglón no está cancelado.'; end if;
  if exists (select 1 from public.cuentas_canceladas cc where cc.deleted_at is null and cc.reserva_id = v.reserva_id) then
    raise exception 'La cuenta de esta venta está cancelada: reábrela primero («Reabrir cuenta»).';
  end if;
  update public.ventas_mostrador set cancelado = false, motivo_cancelacion = null, cancelado_por = null, cancelado_at = null where id = p_venta;
  if v.movimiento_id is not null then
    select cantidad_base into v_base from public.movimientos_inventario where id = v.movimiento_id;
    insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, venta_id)
    values (v.insumo_id, 'salida_venta', v_base, 'Venta reactivada: ' || v_motivo, v.id);
    v_efectos := v_efectos || jsonb_build_object('tipo', 'inventario_descontado', 'cantidad_base', v_base);
  end if;
  select t.saldo into v_saldo from public.cuenta_totales_reserva(v.reserva_id) t;
  v_efectos := v_efectos || jsonb_build_object('tipo', 'cuenta', 'saldo', v_saldo);
  v_id := public.revertir_bitacora('venta_cancelada', 'ventas_mostrador', p_venta, v.reserva_id, v_motivo,
    jsonb_build_object('cancelado', true, 'motivo_cancelacion', v.motivo_cancelacion, 'cancelado_por', v.cancelado_por, 'cancelado_at', v.cancelado_at),
    jsonb_build_object('cancelado', false), v_efectos);
  return jsonb_build_object('bitacora_id', v_id, 'venta_id', p_venta, 'reserva_id', v.reserva_id, 'saldo', v_saldo, 'efectos', v_efectos);
end;
$$;
alter function public.reactivar_venta_mostrador(uuid, text) owner to peludesk_definer;
revoke execute on function public.reactivar_venta_mostrador(uuid, text) from public, anon;
grant execute on function public.reactivar_venta_mostrador(uuid, text) to authenticated, service_role;

-- La cancelación de una cuenta sigue siendo inmutable, salvo la marca de «reabierta» que pone reabrir_cuenta.
create or replace function public.cuentas_canceladas_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if TG_OP = 'UPDATE' and coalesce(current_setting('app.revertir', true), '') = 'on' then
    return new;
  end if;
  raise exception 'Una cuenta cancelada no se edita ni se borra: queda en el historial.';
end;
$$;

-- Reabrir una cuenta cancelada: vuelve a «por cobrar» con su saldo. Si al cancelarla se cancelaron citas o estancias,
-- esas se regresan una por una con su propio «Deshacer» (se devuelven en la respuesta).
create or replace function public.reabrir_cuenta(p_reserva uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  cc record;
  v_id uuid;
  v_saldo numeric;
begin
  perform 1 from public.reservas r where r.id = p_reserva and r.negocio_id = public.negocio_actual() and r.deleted_at is null for update;
  if not found then raise exception 'Cuenta no encontrada.'; end if;
  select * into cc from public.cuentas_canceladas x where x.reserva_id = p_reserva and x.deleted_at is null for update;
  if not found then raise exception 'Esta cuenta no está cancelada.'; end if;
  perform set_config('app.revertir', 'on', true);
  update public.cuentas_canceladas set deleted_at = now(), reabierta_at = now(), reabierta_por = auth.uid(), reabierta_motivo = v_motivo where id = cc.id;
  perform set_config('app.revertir', 'off', true);
  select t.saldo into v_saldo from public.cuenta_totales_reserva(p_reserva) t;
  v_id := public.revertir_bitacora('cuenta_cancelada', 'cuentas_canceladas', cc.id, p_reserva, v_motivo,
    jsonb_build_object('motivo', cc.motivo, 'motivo_texto', cc.motivo_texto, 'saldo_cancelado', cc.saldo_cancelado, 'cancelada_por', cc.cancelada_por, 'created_at', cc.created_at,
      'citas_canceladas', to_jsonb(cc.citas_canceladas), 'estancias_canceladas', to_jsonb(cc.estancias_canceladas)),
    jsonb_build_object('reabierta', true), jsonb_build_array(jsonb_build_object('tipo', 'cuenta', 'saldo', v_saldo)));
  return jsonb_build_object('bitacora_id', v_id, 'reserva_id', p_reserva, 'saldo', v_saldo,
    'citas_canceladas', to_jsonb(coalesce(cc.citas_canceladas, '{}'::uuid[])), 'estancias_canceladas', to_jsonb(coalesce(cc.estancias_canceladas, '{}'::uuid[])));
end;
$$;
alter function public.reabrir_cuenta(uuid, text) owner to peludesk_definer;
revoke execute on function public.reabrir_cuenta(uuid, text) from public, anon;
grant execute on function public.reabrir_cuenta(uuid, text) to authenticated, service_role;

-- Anular una devolución registrada por error: deja de sumar en caja, cuentas y reportes (su turno tiene que seguir
-- abierto: con el corte hecho ya se contó, y entonces se corrige con un cobro nuevo).
create or replace function public.anular_devolucion(p_devolucion uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := public.revertir_exigir(p_motivo);
  d record;
  v_estado text;
  v_reserva uuid;
  v_monto numeric;
  v_id uuid;
  v_saldo numeric;
begin
  select * into d from public.devoluciones x where x.id = p_devolucion and x.negocio_id = public.negocio_actual() for update;
  if not found then raise exception 'Devolución no encontrada.'; end if;
  if d.deleted_at is not null then raise exception 'Esta devolución ya está anulada.'; end if;
  if d.origen is distinct from 'manual' then
    raise exception 'Esta devolución la hizo el proveedor de pago (Mercado Pago): no se anula desde aquí.';
  end if;
  select t.estado into v_estado from public.turnos_caja t where t.id = d.turno_id;
  if v_estado is distinct from 'abierto' then
    raise exception 'El turno de esta devolución ya se cerró: el corte ya la tomó en cuenta. Si el dinero no salió, regístralo como un cobro nuevo en la cuenta.';
  end if;
  select c.reserva_id into v_reserva from public.cobros c where c.id = d.cobro_id;
  select coalesce(sum(dm.monto), 0) into v_monto from public.devolucion_metodos dm where dm.devolucion_id = d.id;
  update public.devoluciones set deleted_at = now(), anulada_por = auth.uid(), anulada_motivo = v_motivo where id = d.id;
  select t.saldo into v_saldo from public.cuenta_totales_reserva(v_reserva) t;
  v_id := public.revertir_bitacora('devolucion', 'devoluciones', d.id, v_reserva, v_motivo,
    jsonb_build_object('cobro_id', d.cobro_id, 'turno_id', d.turno_id, 'motivo', d.motivo, 'monto', v_monto, 'created_at', d.created_at),
    jsonb_build_object('anulada', true), jsonb_build_array(jsonb_build_object('tipo', 'cuenta', 'saldo', v_saldo), jsonb_build_object('tipo', 'caja', 'monto', v_monto)));
  return jsonb_build_object('bitacora_id', v_id, 'devolucion_id', d.id, 'cobro_id', d.cobro_id, 'reserva_id', v_reserva, 'monto', v_monto, 'saldo', v_saldo);
end;
$$;
alter function public.anular_devolucion(uuid, text) owner to peludesk_definer;
revoke execute on function public.anular_devolucion(uuid, text) from public, anon;
grant execute on function public.anular_devolucion(uuid, text) to authenticated, service_role;

-- ── 9. Lo que la cuenta enseña: la bitácora de una reserva ─────────────────────────────────────────────────
create or replace function public.operaciones_revertidas_de_reserva(p_reserva uuid)
returns table(id uuid, tipo text, tabla text, registro_id uuid, motivo text, efectos jsonb, hecha_por uuid, hecha_por_nombre text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.tipo, o.tabla, o.registro_id, o.motivo, o.efectos, o.hecha_por,
         coalesce(nullif(btrim(pr.nombre_completo), ''), 'Alguien del equipo'),
         o.created_at
  from public.operaciones_revertidas o
  left join public.profiles pr on pr.id = o.hecha_por
  where o.reserva_id = p_reserva and o.negocio_id = public.negocio_actual() and o.deleted_at is null
    and coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion')
  order by o.created_at desc;
$$;
alter function public.operaciones_revertidas_de_reserva(uuid) owner to peludesk_definer;
revoke execute on function public.operaciones_revertidas_de_reserva(uuid) from public, anon;
grant execute on function public.operaciones_revertidas_de_reserva(uuid) to authenticated, service_role;
