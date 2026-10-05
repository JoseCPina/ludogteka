-- Cobros con terminal: solo un pago aprobado verificado los marca como cobrados — 5 de octubre de 2026.
--
-- Qué pasó en Ludogteka (producción, 5 de octubre): un cobro de $350 con
-- método «terminal» quedó registrado como cobrado sin que nadie pasara
-- tarjeta. No venía de una orden de Mercado Pago (origen «manual», sin fila en
-- mp_ordenes): lo tecleó una persona en «Registrar cobro» eligiendo
-- «Terminal», y la base lo aceptó sin verificar nada.
--
-- Esta migración:
--  · Cierra esa puerta: con un proveedor de terminal elegido (Mercado Pago o
--    Clip) el método «terminal» ya no se captura a mano (terminal_manual_bloqueada).
--  · registrar_pago_mercadopago exige monto igual al de la orden y la
--    verificación del servidor contra el proveedor.
--  · mp_ordenes.estado «por_confirmar»: lo ambiguo nunca es pagado.
--  · «Marcar como no recibido» (cobro_marcar_no_recibido): corrige un cobro
--    con terminal mal marcado como pagado, con motivo, historial y estado
--    anterior; el efecto cae en el turno abierto (como una devolución, sin
--    tocar el turno cerrado) y la cuenta vuelve a quedar con saldo.
--  · Conciliación con el proveedor (conciliacion_terminal): discrepancias
--    entre los cobros con terminal y los pagos aprobados, con antigüedad.
--  · integraciones_cobro.terminal_previa_id: reconectar recupera la terminal.

-- ── 1. mp_ordenes: por_confirmar y verificación ─────────────────────
alter table public.mp_ordenes drop constraint mp_ordenes_estado_check;
alter table public.mp_ordenes add constraint mp_ordenes_estado_check
  check (estado in ('creada', 'en_terminal', 'pagada', 'cancelada', 'expirada', 'fallida', 'reembolsada', 'por_confirmar'));
alter table public.mp_ordenes
  add column verificado_at timestamptz,
  add column verificacion jsonb,
  add column conexion_desde timestamptz;

alter table public.integraciones_cobro add column terminal_previa_id text;

-- ── 2. ¿Se puede teclear «terminal» a mano en este negocio? ─────────
create or replace function public.terminal_manual_bloqueada()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.integraciones_cobro ic
    join public.negocios n on n.id = ic.negocio_id
    where ic.negocio_id = public.negocio_actual()
      and ic.elegida and ic.deleted_at is null
      and ic.proveedor in ('mercadopago', 'clip')
      and coalesce(n.plan, '') not in ('demo', 'prueba')
  );
$$;
alter function public.terminal_manual_bloqueada() owner to peludesk_definer;
revoke execute on function public.terminal_manual_bloqueada() from public, anon;
grant execute on function public.terminal_manual_bloqueada() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_cobro(p_reserva_id uuid, p_notas text, p_metodos jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_turno_id uuid;
  v_cobro_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_propina numeric;
  v_nombre_metodo text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden registrar cobros.';
  end if;

  if not exists (select 1 from public.reservas where id = p_reserva_id) then
    raise exception 'Reserva no encontrada.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método de pago.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de cobrar.';
  end if;

  insert into public.cobros (reserva_id, turno_id, notas, created_by)
  values (p_reserva_id, v_turno_id, nullif(btrim(p_notas), ''), auth.uid())
  returning id into v_cobro_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;
    v_propina := coalesce((v_metodo ->> 'propina')::numeric, 0);

    if v_nombre_metodo is null or v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;
    -- Un cobro con terminal solo entra cuando el proveedor confirma un pago
    -- aprobado (por la terminal conectada), nunca tecleado a mano.
    if v_nombre_metodo = 'terminal' and public.terminal_manual_bloqueada() then
      raise exception 'Este negocio cobra con la terminal conectada: usa «Cobrar con terminal» en la cuenta. A mano solo se registra efectivo o transferencia (si cobras con otra terminal, el admin puede cambiar el proveedor a «Solo manual» en Administración → Cobro con terminal).';
    end if;
    if v_propina < 0 then
      raise exception 'La propina no puede ser negativa.';
    end if;

    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, created_by)
    values (v_cobro_id, v_nombre_metodo, v_monto, v_propina, auth.uid());
  end loop;

  return v_cobro_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.registrar_pago_mercadopago(p_orden_id uuid, p_mp_payment_id text, p_monto numeric, p_installments integer, p_mp_payment_type text, p_evento jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_orden public.mp_ordenes%rowtype;
  v_turno_id uuid;
  v_cobro_id uuid;
  v_metodo text;
  v_origen text;
  v_otra uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor de la aplicación puede registrar un pago integrado.';
  end if;

  select * into v_orden from public.mp_ordenes where id = p_orden_id and deleted_at is null for update;
  if not found then
    raise exception 'Orden de cobro no encontrada.';
  end if;

  if v_orden.cobro_id is not null then
    return jsonb_build_object('registrado', true, 'repetido', true, 'cobro_id', v_orden.cobro_id, 'estado', v_orden.estado);
  end if;

  -- Un cobro simulado solo se da por pagado en el demo o en un negocio en
  -- prueba. En uno real, nunca.
  if v_orden.simulado and not public.negocio_puede_simular() then
    raise exception 'Un cobro simulado no se puede dar por pagado en un negocio real.';
  end if;

  if p_mp_payment_id is not null then
    select id into v_otra from public.mp_ordenes
    where mp_payment_id = p_mp_payment_id and id <> p_orden_id;
    if v_otra is not null then
      raise exception 'El pago % ya está registrado en otra orden (%).', p_mp_payment_id, v_otra;
    end if;
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto confirmado no es válido.';
  end if;

  -- Lo que se cobró tiene que ser lo que se pidió, y un pago real solo se
  -- registra con la verificación del servidor contra la API del proveedor
  -- (consulta directa del pago: aprobado, mismo monto, misma cuenta).
  if not v_orden.simulado then
    if abs(p_monto - v_orden.monto) > 0.005 then
      raise exception 'El monto confirmado ($%) no coincide con el de la orden ($%).', p_monto, v_orden.monto;
    end if;
    if v_orden.estado <> 'pagada' and coalesce(p_evento ->> 'verificacion', '') <> 'aprobado' then
      raise exception 'El pago no viene verificado contra el proveedor: no se registra.';
    end if;
  end if;

  v_metodo := case v_orden.tipo when 'point' then 'terminal' else 'transferencia' end;
  v_origen := case
    when v_orden.proveedor = 'clip' then 'clip_terminal'
    when v_orden.tipo = 'point' then 'mercadopago_point'
    else 'mercadopago_link' end;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;

  if v_turno_id is not null then
    insert into public.cobros (reserva_id, turno_id, notas, origen, created_by)
    values (
      v_orden.reserva_id,
      v_turno_id,
      case
        when v_orden.proveedor = 'clip' then 'Terminal Clip'
        when v_orden.tipo = 'point' then 'Terminal Mercado Pago'
        else 'Link de pago Mercado Pago' end
        || case when v_orden.simulado then ' (SIMULADO)' else '' end
        || case when coalesce(p_installments, 1) > 1 then ' · ' || p_installments || ' meses' else '' end
        || case when p_mp_payment_id is not null then ' · pago ' || p_mp_payment_id else '' end,
      v_origen,
      v_orden.created_by
    )
    returning id into v_cobro_id;

    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, created_by)
    values (v_cobro_id, v_metodo, p_monto, 0, v_orden.created_by);
  end if;

  update public.mp_ordenes
  set estado = 'pagada',
      mp_payment_id = coalesce(p_mp_payment_id, mp_payment_id),
      monto = p_monto,
      installments = p_installments,
      mp_payment_type = p_mp_payment_type,
      metodo_registrado = v_metodo,
      cobro_id = v_cobro_id,
      pagada_at = coalesce(pagada_at, now()),
      notificado_at = now(),
      ultimo_evento = coalesce(p_evento, ultimo_evento),
      verificado_at = coalesce(verificado_at, now()),
      verificacion = coalesce(p_evento -> 'verificacion_detalle', verificacion)
  where id = p_orden_id;

  return jsonb_build_object(
    'registrado', v_cobro_id is not null,
    'repetido', false,
    'cobro_id', v_cobro_id,
    'estado', 'pagada',
    'sin_turno', v_cobro_id is null
  );
end;
$function$;

-- ── 3. «No recibido» y conciliación: tablas ─────────────────────────
alter table public.devoluciones drop constraint devoluciones_origen_check;
alter table public.devoluciones add constraint devoluciones_origen_check
  check (origen in ('manual', 'mercadopago_point', 'mercadopago_link', 'clip_terminal', 'no_recibido'));

create table public.cobro_correcciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cobro_id uuid not null references public.cobros(id),
  devolucion_id uuid references public.devoluciones(id),
  tipo text not null check (tipo in ('no_recibido')),
  motivo text not null check (btrim(motivo) <> ''),
  -- El cobro como estaba antes (reserva, turno, métodos, origen, notas).
  estado_anterior jsonb not null,
  -- Lo que dijo el proveedor al revisar (sin credenciales).
  evidencia jsonb,
  turno_cobro_id uuid references public.turnos_caja(id),
  turno_efecto_id uuid references public.turnos_caja(id),
  hecha_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table public.conciliacion_terminal (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  proveedor text not null default 'mercadopago',
  -- cobro_sin_pago: la app dice cobrado y el proveedor no tiene un pago aprobado.
  -- pago_sin_cobro: el proveedor tiene un pago aprobado que la caja no registró.
  tipo text not null check (tipo in ('cobro_sin_pago', 'pago_sin_cobro')),
  clave text not null,
  cobro_id uuid references public.cobros(id),
  orden_id uuid references public.mp_ordenes(id),
  mp_pago_id text,
  monto numeric not null,
  ocurrio_at timestamptz not null,
  detalle jsonb,
  detectada_at timestamptz not null default now(),
  ultima_vista_at timestamptz not null default now(),
  resuelta_at timestamptz,
  resuelta_motivo text,
  resuelta_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index conciliacion_terminal_abierta_uq on public.conciliacion_terminal (negocio_id, tipo, clave) where resuelta_at is null;

do $$
declare
  t text;
begin
  foreach t in array array['cobro_correcciones', 'conciliacion_terminal'] loop
    execute format('create index %I on public.%I (negocio_id)', t || '_negocio_idx', t);
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$f$, t || '_negocio', t);
    execute format($f$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$f$, t || '_negocio_definer', t);
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_ins', t);
    execute format($f$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_upd', t);
    execute format($f$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_del', t);
    -- Leer: admin y recepción (el dinero no lo ve estética ni el cliente). Escribir: solo por funciones.
    execute format($f$create policy %I on public.%I for select to authenticated
      using ((select coalesce(public.current_rol() in ('admin', 'recepcion'), false)))$f$, t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
  end loop;
end $$;

-- ── 4. Marcar como no recibido ──────────────────────────────────────
-- Solo el servidor (que ya consultó al proveedor) la llama, con el admin que
-- lo pidió. La base vuelve a comprobar todo lo que le toca.
create or replace function public.cobro_marcar_no_recibido(p_cobro_id uuid, p_motivo text, p_actor uuid, p_evidencia jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobro record;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_turno_abierto uuid;
  v_monto numeric;
  v_propina numeric;
  v_disponible numeric;
  v_dev uuid;
  v_metodos jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor de la aplicación marca un cobro como no recibido.' using errcode = '42501';
  end if;
  if p_actor is null or not exists (
    select 1 from public.membresias m
    where m.profile_id = p_actor and m.negocio_id = public.negocio_actual() and m.rol = 'admin' and m.deleted_at is null
  ) then
    raise exception 'Solo un admin del negocio marca un cobro como no recibido.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo (qué pasó) para marcar el cobro como no recibido.';
  end if;
  if coalesce(p_evidencia ->> 'mp_sin_pago_aprobado', '') <> 'true' then
    raise exception 'Solo se marca como no recibido cuando el proveedor confirma que NO hay un pago aprobado para este cobro.';
  end if;

  select c.id, c.reserva_id, c.turno_id, c.origen, c.notas, c.created_at, c.created_by, t.estado as turno_estado
  into v_cobro
  from public.cobros c
  join public.turnos_caja t on t.id = c.turno_id
  where c.id = p_cobro_id and c.deleted_at is null
  for update of c;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  if coalesce(v_cobro.origen, 'manual') <> 'manual' then
    raise exception 'Este cobro entró con un pago que el proveedor confirmó: si hay que devolverlo, usa la devolución con el proveedor.';
  end if;

  select coalesce(sum(cm.monto), 0), coalesce(sum(cm.propina), 0),
         coalesce(jsonb_agg(jsonb_build_object('metodo', cm.metodo, 'monto', cm.monto, 'propina', cm.propina)), '[]'::jsonb)
  into v_monto, v_propina, v_metodos
  from public.cobro_metodos cm where cm.cobro_id = p_cobro_id and cm.metodo = 'terminal';
  if v_monto <= 0 then
    raise exception 'Este cobro no tiene un método de terminal: solo se corrigen así los cobros con terminal.';
  end if;
  if v_propina > 0 then
    raise exception 'Este cobro de terminal trae propina: avisa a quien lleva la nómina antes de corregirlo.';
  end if;
  v_disponible := public.cobro_disponible_para_devolver(p_cobro_id);
  if v_disponible < v_monto - 0.005 then
    raise exception 'Este cobro ya tiene devoluciones: no se puede marcar como no recibido.';
  end if;
  select id into v_turno_abierto from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_abierto is null then
    raise exception 'No hay turno de caja abierto. Ábrelo: la corrección se anota en el turno abierto (un turno cerrado nunca cambia).';
  end if;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
  values (p_cobro_id, v_turno_abierto, 'No recibido: ' || v_motivo, p_actor, p_actor, 'no_recibido')
  returning id into v_dev;
  insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
  select v_dev, 'terminal', cm.monto, p_actor from public.cobro_metodos cm where cm.cobro_id = p_cobro_id and cm.metodo = 'terminal';

  insert into public.cobro_correcciones (cobro_id, devolucion_id, tipo, motivo, estado_anterior, evidencia, turno_cobro_id, turno_efecto_id, hecha_por, created_by)
  values (p_cobro_id, v_dev, 'no_recibido', v_motivo,
    jsonb_build_object('reserva_id', v_cobro.reserva_id, 'turno_id', v_cobro.turno_id, 'origen', coalesce(v_cobro.origen, 'manual'),
      'notas', v_cobro.notas, 'cobrado_at', v_cobro.created_at, 'cobrado_por', v_cobro.created_by, 'metodos', v_metodos),
    p_evidencia, v_cobro.turno_id, v_turno_abierto, p_actor, p_actor);

  -- Si lo había marcado la conciliación, queda resuelto.
  update public.conciliacion_terminal
  set resuelta_at = now(), resuelta_motivo = 'Marcado como no recibido: ' || v_motivo, resuelta_por = p_actor
  where cobro_id = p_cobro_id and resuelta_at is null;

  return jsonb_build_object('devolucion_id', v_dev, 'monto', v_monto, 'reserva_id', v_cobro.reserva_id,
    'turno_cobro_id', v_cobro.turno_id, 'turno_efecto_id', v_turno_abierto, 'turno_del_cobro_cerrado', v_cobro.turno_estado <> 'abierto');
end;
$$;
alter function public.cobro_marcar_no_recibido(uuid, text, uuid, jsonb) owner to peludesk_definer;
revoke execute on function public.cobro_marcar_no_recibido(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.cobro_marcar_no_recibido(uuid, text, uuid, jsonb) to service_role;

-- ── 5. Conciliación: el servidor manda lo que encontró ──────────────
create or replace function public.conciliacion_sincronizar(p_hallazgos jsonb, p_desde timestamptz, p_hasta timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  h jsonb;
  v_nuevos int := 0;
  v_vistos int := 0;
  v_resueltos int := 0;
  v_claves text[] := '{}';
  v_antes int;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor de la aplicación sincroniza la conciliación.' using errcode = '42501';
  end if;
  for h in select * from jsonb_array_elements(coalesce(p_hallazgos, '[]'::jsonb)) loop
    v_claves := array_append(v_claves, (h ->> 'tipo') || '|' || (h ->> 'clave'));
    select count(*) into v_antes from public.conciliacion_terminal
      where tipo = h ->> 'tipo' and clave = h ->> 'clave' and resuelta_at is null;
    insert into public.conciliacion_terminal (proveedor, tipo, clave, cobro_id, orden_id, mp_pago_id, monto, ocurrio_at, detalle)
    values ('mercadopago', h ->> 'tipo', h ->> 'clave', nullif(h ->> 'cobro_id', '')::uuid, nullif(h ->> 'orden_id', '')::uuid,
      nullif(h ->> 'mp_pago_id', ''), (h ->> 'monto')::numeric, (h ->> 'ocurrio_at')::timestamptz, h -> 'detalle')
    on conflict (negocio_id, tipo, clave) where resuelta_at is null
    do update set ultima_vista_at = now(), monto = excluded.monto, detalle = excluded.detalle;
    if v_antes = 0 then v_nuevos := v_nuevos + 1; else v_vistos := v_vistos + 1; end if;
  end loop;
  -- Lo abierto dentro de la ventana que ya no aparece, se resuelve solo.
  update public.conciliacion_terminal ct
  set resuelta_at = now(), resuelta_motivo = 'Ya no aparece al conciliar con el proveedor.'
  where ct.resuelta_at is null and ct.ocurrio_at >= p_desde and ct.ocurrio_at <= p_hasta
    and not ((ct.tipo || '|' || ct.clave) = any (v_claves));
  get diagnostics v_resueltos = row_count;
  return jsonb_build_object('nuevos', v_nuevos, 'vistos', v_vistos, 'resueltos', v_resueltos);
end;
$$;
alter function public.conciliacion_sincronizar(jsonb, timestamptz, timestamptz) owner to peludesk_definer;
revoke execute on function public.conciliacion_sincronizar(jsonb, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.conciliacion_sincronizar(jsonb, timestamptz, timestamptz) to service_role;

-- Un admin da por revisada una discrepancia (la verificó por su lado).
create or replace function public.conciliacion_dar_por_revisada(p_id uuid, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin da por revisada una discrepancia.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_nota, ''))) < 5 then
    raise exception 'Escribe qué revisaste.';
  end if;
  update public.conciliacion_terminal
  set resuelta_at = now(), resuelta_motivo = 'Revisada por un admin: ' || btrim(p_nota), resuelta_por = auth.uid()
  where id = p_id and resuelta_at is null and negocio_id = public.negocio_actual();
  if not found then
    raise exception 'No encontramos esa discrepancia abierta.';
  end if;
end;
$$;
alter function public.conciliacion_dar_por_revisada(uuid, text) owner to peludesk_definer;
revoke execute on function public.conciliacion_dar_por_revisada(uuid, text) from public, anon;
grant execute on function public.conciliacion_dar_por_revisada(uuid, text) to authenticated, service_role;
