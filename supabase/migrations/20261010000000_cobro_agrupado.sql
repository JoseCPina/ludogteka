-- Cobro agrupado: varias cuentas abiertas de la MISMA clienta se cobran en un
-- solo movimiento (un pago, un folio, un total) y el monto se reparte entre
-- las cuentas. Y el residuo de centavos de Blacky.
--
-- Diseño (nada de lo que ya cuenta el dinero cambia de forma):
--  · cobros_grupo = el pago agrupado (cliente, turno, total, propina, origen).
--    Cada cuenta conserva SU cobro (cobros.grupo_id) con SU parte en
--    cobro_metodos: el turno, el corte y los reportes por servicio suman cada
--    peso una sola vez, y devoluciones, comisiones, nómina e inventario siguen
--    por cuenta sin tocar.
--  · Orden de Mercado Pago / Clip de grupo = UNA fila en mp_ordenes con las
--    cuentas congeladas (grupo_cuentas). Al verificarse el pago se reparte.
--  · Tarjeta manual de grupo = UNA fila en tarjetas_manuales (un folio) con
--    sus partes; revisarla o marcarla «no recibida» opera sobre todo el grupo.
--  · Cada cobro agrupado deja su evento en cobros_grupo_eventos (registrado /
--    no_recibido): cuándo, quién, qué cuentas y cuánto.
--
-- Residuo de centavos (Blacky, 5 oct 2026, $0.30 de $490): aplicar_descuento
-- redondeaba el descuento POR PORCENTAJE a centavos (53 % de 490 = $259.70) y
-- dejaba la cuenta en $230.30 mientras en caja se cobra en pesos ($230): $0.30
-- eternos. Ahora el descuento por porcentaje se calcula para que lo que queda
-- por pagar sea un peso entero, y ningún cobro puede dejar una cuenta debiendo
-- menos de un peso. Lo que ya quedó así en producción lo corrige un script de
-- plataforma (plataforma_corregir_saldos_centavos) con su reversa.

-- ── 1. Tablas ────────────────────────────────────────────────────────
create table public.cobros_grupo (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cliente_id uuid not null references public.clientes(id),
  turno_id uuid not null references public.turnos_caja(id),
  monto_total numeric not null check (monto_total > 0),
  propina_total numeric not null default 0 check (propina_total >= 0),
  origen text not null default 'manual' check (origen in ('manual', 'mercadopago_point', 'mercadopago_link', 'clip_terminal')),
  orden_id uuid references public.mp_ordenes(id),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index cobros_grupo_cliente_idx on public.cobros_grupo (cliente_id);
create index cobros_grupo_turno_idx on public.cobros_grupo (turno_id);

create table public.cobros_grupo_eventos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  grupo_id uuid not null references public.cobros_grupo(id),
  tipo text not null check (tipo in ('registrado', 'no_recibido')),
  actor uuid references auth.users(id) on delete set null,
  detalle jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index cobros_grupo_eventos_grupo_idx on public.cobros_grupo_eventos (grupo_id);

do $$
declare
  t text;
begin
  foreach t in array array['cobros_grupo', 'cobros_grupo_eventos'] loop
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

alter table public.cobros add column grupo_id uuid references public.cobros_grupo(id);
create index cobros_grupo_id_idx on public.cobros (grupo_id) where grupo_id is not null;

alter table public.mp_ordenes
  add column grupo_cuentas jsonb,
  add column grupo_cliente_id uuid references public.clientes(id),
  add column grupo_id uuid references public.cobros_grupo(id);
alter table public.mp_ordenes add constraint mp_ordenes_grupo_cuentas_check
  check (grupo_cuentas is null or (jsonb_typeof(grupo_cuentas) = 'array' and jsonb_array_length(grupo_cuentas) >= 2 and grupo_cliente_id is not null));
create index mp_ordenes_grupo_idx on public.mp_ordenes (grupo_id) where grupo_id is not null;

alter table public.tarjetas_manuales
  add column grupo_id uuid references public.cobros_grupo(id),
  add column partes jsonb;
create index tarjetas_manuales_grupo_idx on public.tarjetas_manuales (grupo_id) where grupo_id is not null;

alter table public.cobros_grupo add constraint cobros_grupo_orden_unica unique (orden_id);

-- ── 2. El reparto (interno) ──────────────────────────────────────────
-- Parte el pago entre las cuentas: el monto de cada método se asigna a las
-- cuentas EN EL ORDEN que vienen (la más antigua primero), todo en centavos;
-- la propina de cada método se reparte en proporción a lo que cayó en cada
-- cuenta y el centavo que sobre va a la última. Cada cuenta recibe un cobro
-- propio con sus porciones; una tarjeta manual deja UNA fila con su folio.
create or replace function public.cobro_grupo_aplicar(
  p_cliente_id uuid, p_turno_id uuid, p_partes jsonb, p_metodos jsonb, p_notas text,
  p_origen text, p_actor uuid, p_manual boolean, p_orden_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item jsonb;
  v_n int;
  v_m int;
  v_i int;
  v_j int;
  v_k int;
  v_res uuid[] := '{}';
  v_cap bigint[] := '{}';
  v_cobros uuid[] := '{}';
  v_met text[] := '{}';
  v_mc bigint[] := '{}';
  v_pc bigint[] := '{}';
  v_ex jsonb[] := '{}';
  v_pp int[] := '{}';
  v_pm int[] := '{}';
  v_pt bigint[] := '{}';
  v_pr bigint[] := '{}';
  v_cm uuid[] := '{}';
  v_rem bigint;
  v_take bigint;
  v_total_c bigint := 0;
  v_total_m bigint := 0;
  v_propina_c bigint := 0;
  v_cliente uuid;
  v_publico boolean;
  v_saldo numeric;
  v_grupo uuid;
  v_nombre text;
  v_monto numeric;
  v_folio text;
  v_norm text;
  v_motivo text;
  v_motivo_texto text;
  v_ult4 text;
  v_banco text;
  v_tope numeric;
  v_total_manual numeric := 0;
  v_tarjeta uuid;
  v_asignado bigint;
  v_last int;
  v_partes_t jsonb;
  v_cobros_json jsonb := '[]'::jsonb;
  v_primer_cm uuid;
  v_primer_cobro uuid;
  v_idc uuid;
begin
  if p_partes is null or jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) < 2 then
    raise exception 'Para cobrar juntas se necesitan al menos dos cuentas.';
  end if;
  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método de pago.';
  end if;

  -- Cuentas: del negocio, vivas, de la MISMA persona, sin repetir.
  for v_item in select * from jsonb_array_elements(p_partes) loop
    if (v_item ->> 'reserva_id') is null or (v_item ->> 'monto') is null then
      raise exception 'Cada cuenta lleva su monto.';
    end if;
    v_monto := (v_item ->> 'monto')::numeric;
    if v_monto <= 0 or round(v_monto, 2) <> v_monto then
      raise exception 'El monto de cada cuenta tiene que ser mayor a cero (a lo más dos decimales).';
    end if;
    if (v_item ->> 'reserva_id')::uuid = any (v_res) then
      raise exception 'Una cuenta aparece dos veces en el cobro.';
    end if;
    select r.cliente_id, c.publico_general into v_cliente, v_publico
    from public.reservas r join public.clientes c on c.id = r.cliente_id
    where r.id = (v_item ->> 'reserva_id')::uuid and r.deleted_at is null;
    if not found then
      raise exception 'Una de las cuentas no existe en este negocio.';
    end if;
    if v_cliente is distinct from p_cliente_id then
      raise exception 'Solo se cobran juntas las cuentas de la misma persona: nunca se mezclan clientas.';
    end if;
    if v_publico then
      raise exception 'Las ventas de «Público en general» no se agrupan: cada una se cobra aparte.';
    end if;
    if p_manual then
      select t.saldo into v_saldo from public.cuenta_totales_reserva((v_item ->> 'reserva_id')::uuid) t;
      if v_monto > v_saldo + 0.005 then
        raise exception 'Una cuenta recibiría $% pero solo debe $%: baja el monto de esa cuenta.', v_monto, v_saldo;
      end if;
    end if;
    v_res := array_append(v_res, (v_item ->> 'reserva_id')::uuid);
    v_cap := array_append(v_cap, round(v_monto * 100)::bigint);
    v_total_c := v_total_c + round(v_monto * 100)::bigint;
  end loop;
  v_n := cardinality(v_res);

  -- Métodos.
  select coalesce(sum(coalesce((m ->> 'monto')::numeric, 0) + coalesce((m ->> 'propina')::numeric, 0)), 0)
  into v_total_manual
  from jsonb_array_elements(p_metodos) m
  where m ->> 'metodo' = 'tarjeta_manual';
  v_tope := public.tarjeta_manual_tope();

  for v_item in select * from jsonb_array_elements(p_metodos) loop
    v_nombre := v_item ->> 'metodo';
    v_monto := (v_item ->> 'monto')::numeric;
    if v_nombre is null or v_nombre not in ('efectivo', 'terminal', 'transferencia', 'tarjeta_manual') then
      raise exception 'Método de pago inválido: %', v_nombre;
    end if;
    if v_monto is null or v_monto <= 0 or round(v_monto, 2) <> v_monto then
      raise exception 'Cada método debe tener un monto mayor a cero (a lo más dos decimales).';
    end if;
    if coalesce((v_item ->> 'propina')::numeric, 0) < 0 or round(coalesce((v_item ->> 'propina')::numeric, 0), 2) <> coalesce((v_item ->> 'propina')::numeric, 0) then
      raise exception 'La propina no es válida.';
    end if;
    if p_manual and v_nombre = 'terminal' and public.terminal_manual_bloqueada() then
      raise exception 'Este negocio cobra con la terminal conectada: usa «Cobrar con terminal» en el cobro junto. Si no se puede cobrar por ahí (terminal caída, sin señal, otra terminal), usa «Tarjeta (registro manual)» con el folio del voucher. A mano también: efectivo y transferencia.';
    end if;
    if p_manual and v_nombre = 'tarjeta_manual' and not public.tiene_permiso('tarjeta_manual') then
      raise exception 'No tienes el permiso «Registrar tarjeta manual». Pídeselo al admin (Administración → Permisos).' using errcode = '42501';
    end if;
    v_met := array_append(v_met, v_nombre);
    v_mc := array_append(v_mc, round(v_monto * 100)::bigint);
    v_pc := array_append(v_pc, round(coalesce((v_item ->> 'propina')::numeric, 0) * 100)::bigint);
    v_ex := array_append(v_ex, v_item);
    v_total_m := v_total_m + round(v_monto * 100)::bigint;
    v_propina_c := v_propina_c + round(coalesce((v_item ->> 'propina')::numeric, 0) * 100)::bigint;
  end loop;
  v_m := cardinality(v_met);
  if v_total_m <> v_total_c then
    raise exception 'Lo que se paga ($%) no coincide con lo que se reparte entre las cuentas ($%).', v_total_m / 100.0, v_total_c / 100.0;
  end if;

  -- Reparto: cada método llena las cuentas en orden.
  for v_j in 1..v_m loop
    v_rem := v_mc[v_j];
    for v_i in 1..v_n loop
      exit when v_rem = 0;
      v_take := least(v_rem, v_cap[v_i]);
      if v_take > 0 then
        v_pp := array_append(v_pp, v_i);
        v_pm := array_append(v_pm, v_j);
        v_pt := array_append(v_pt, v_take);
        v_pr := array_append(v_pr, 0::bigint);
        v_cap[v_i] := v_cap[v_i] - v_take;
        v_rem := v_rem - v_take;
      end if;
    end loop;
  end loop;
  -- Propina: proporcional, y el centavo que sobre, a la última porción del método.
  for v_j in 1..v_m loop
    if v_pc[v_j] > 0 then
      v_last := null;
      for v_k in 1..cardinality(v_pm) loop
        if v_pm[v_k] = v_j then v_last := v_k; end if;
      end loop;
      v_asignado := 0;
      for v_k in 1..cardinality(v_pm) loop
        if v_pm[v_k] = v_j and v_k <> v_last then
          v_pr[v_k] := floor(v_pc[v_j]::numeric * v_pt[v_k] / v_mc[v_j])::bigint;
          v_asignado := v_asignado + v_pr[v_k];
        end if;
      end loop;
      v_pr[v_last] := v_pc[v_j] - v_asignado;
    end if;
  end loop;

  -- Folios de tarjeta manual: validar antes de escribir nada.
  for v_j in 1..v_m loop
    if v_met[v_j] = 'tarjeta_manual' then
      v_folio := btrim(coalesce(v_ex[v_j] ->> 'folio', ''));
      v_norm := lower(regexp_replace(v_folio, '[^A-Za-z0-9]', '', 'g'));
      v_motivo := btrim(coalesce(v_ex[v_j] ->> 'motivo', ''));
      v_motivo_texto := nullif(btrim(coalesce(v_ex[v_j] ->> 'motivo_texto', '')), '');
      v_ult4 := nullif(btrim(coalesce(v_ex[v_j] ->> 'ultimos4', '')), '');
      if char_length(v_folio) < 4 or char_length(v_norm) < 4 then
        raise exception 'Escribe el folio o número de autorización del voucher (mínimo 4 caracteres).';
      end if;
      if v_motivo not in ('terminal_no_responde', 'sin_senal', 'otra_terminal', 'otro') then
        raise exception 'Elige por qué no se cobró con la terminal vinculada.';
      end if;
      if v_motivo = 'otro' and char_length(coalesce(v_motivo_texto, '')) < 3 then
        raise exception 'Cuéntanos el motivo (escríbelo en «Otro»).';
      end if;
      if v_ult4 is not null and v_ult4 !~ '^[0-9]{4}$' then
        raise exception 'Los últimos dígitos son 4 números. Nunca captures la tarjeta completa.';
      end if;
      if exists (
        select 1 from public.tarjetas_manuales
        where negocio_id = public.negocio_actual() and folio_norm = v_norm and deleted_at is null and estado <> 'no_recibida'
      ) then
        raise exception 'El folio «%» ya está registrado en otro cobro de este negocio. Revisa el voucher: un mismo folio no se registra dos veces.', v_folio;
      end if;
    end if;
  end loop;

  -- Escribir.
  insert into public.cobros_grupo (cliente_id, turno_id, monto_total, propina_total, origen, orden_id, notas, created_by)
  values (p_cliente_id, p_turno_id, v_total_c / 100.0, v_propina_c / 100.0, p_origen, p_orden_id, nullif(btrim(p_notas), ''), p_actor)
  returning id into v_grupo;

  for v_i in 1..v_n loop
    insert into public.cobros (reserva_id, turno_id, notas, origen, grupo_id, created_by)
    values (v_res[v_i], p_turno_id,
      'Cobro junto · ' || v_n || ' cuentas' || coalesce(' · ' || nullif(btrim(p_notas), ''), ''),
      p_origen, v_grupo, p_actor)
    returning id into v_idc;
    v_cobros := array_append(v_cobros, v_idc);
  end loop;

  for v_k in 1..cardinality(v_pm) loop
    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, created_by)
    values (v_cobros[v_pp[v_k]], v_met[v_pm[v_k]], v_pt[v_k] / 100.0, v_pr[v_k] / 100.0, p_actor)
    returning id into v_idc;
    v_cm := array_append(v_cm, v_idc);
  end loop;

  for v_j in 1..v_m loop
    if v_met[v_j] = 'tarjeta_manual' then
      v_partes_t := '[]'::jsonb;
      v_primer_cm := null;
      v_primer_cobro := null;
      for v_k in 1..cardinality(v_pm) loop
        if v_pm[v_k] = v_j then
          if v_primer_cm is null then v_primer_cm := v_cm[v_k]; v_primer_cobro := v_cobros[v_pp[v_k]]; end if;
          v_partes_t := v_partes_t || jsonb_build_object('cobro_id', v_cobros[v_pp[v_k]], 'cobro_metodo_id', v_cm[v_k],
            'reserva_id', v_res[v_pp[v_k]], 'monto', v_pt[v_k] / 100.0, 'propina', v_pr[v_k] / 100.0);
        end if;
      end loop;
      v_folio := btrim(v_ex[v_j] ->> 'folio');
      v_norm := lower(regexp_replace(v_folio, '[^A-Za-z0-9]', '', 'g'));
      v_motivo := btrim(v_ex[v_j] ->> 'motivo');
      v_motivo_texto := nullif(btrim(coalesce(v_ex[v_j] ->> 'motivo_texto', '')), '');
      v_ult4 := nullif(btrim(coalesce(v_ex[v_j] ->> 'ultimos4', '')), '');
      v_banco := nullif(btrim(coalesce(v_ex[v_j] ->> 'banco', '')), '');
      insert into public.tarjetas_manuales (
        cobro_id, cobro_metodo_id, turno_id, monto, propina, folio, folio_norm,
        motivo, motivo_texto, ultimos4, banco, sobre_tope, tope_aplicado, grupo_id, partes, created_by
      ) values (
        v_primer_cobro, v_primer_cm, p_turno_id, v_mc[v_j] / 100.0, v_pc[v_j] / 100.0, v_folio, v_norm,
        v_motivo, case when v_motivo = 'otro' then v_motivo_texto else null end, v_ult4, v_banco,
        v_total_manual > v_tope, v_tope, v_grupo, v_partes_t, p_actor
      ) returning id into v_tarjeta;
      insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
      values (public.negocio_actual(), v_tarjeta, 'registrada', p_actor,
        jsonb_build_object('cobro_id', v_primer_cobro, 'grupo_id', v_grupo, 'turno_id', p_turno_id, 'monto', v_mc[v_j] / 100.0,
          'folio', v_folio, 'motivo', v_motivo, 'cuentas', v_n));
      if v_total_manual > v_tope then
        insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
        values (public.negocio_actual(), v_tarjeta, 'sobre_tope', p_actor,
          jsonb_build_object('total_manual_del_cobro', v_total_manual, 'tope', v_tope));
      end if;
    end if;
  end loop;

  -- Estricto (a mano): ninguna cuenta se queda debiendo menos de un peso.
  if p_manual then
    for v_i in 1..v_n loop
      select t.saldo into v_saldo from public.cuenta_totales_reserva(v_res[v_i]) t;
      if v_saldo > 0 and v_saldo < 1 then
        raise exception 'Con este cobro una cuenta se quedaría debiendo $% (menos de un peso). Ajusta el monto de esa cuenta para saldarla o dejar al menos $1.', v_saldo;
      end if;
    end loop;
  end if;

  for v_i in 1..v_n loop
    v_cobros_json := v_cobros_json || jsonb_build_object('reserva_id', v_res[v_i], 'cobro_id', v_cobros[v_i],
      'monto', (select sum(v_pt[k]) from generate_subscripts(v_pp, 1) k where v_pp[k] = v_i) / 100.0);
  end loop;

  insert into public.cobros_grupo_eventos (negocio_id, grupo_id, tipo, actor, detalle)
  values (public.negocio_actual(), v_grupo, 'registrado', p_actor,
    jsonb_build_object('cliente_id', p_cliente_id, 'turno_id', p_turno_id, 'origen', p_origen, 'total', v_total_c / 100.0,
      'propina', v_propina_c / 100.0, 'cuentas', v_cobros_json, 'orden_id', p_orden_id,
      'metodos', (select jsonb_agg(jsonb_build_object('metodo', v_met[g], 'monto', v_mc[g] / 100.0, 'propina', v_pc[g] / 100.0)) from generate_series(1, v_m) g)));

  return jsonb_build_object('grupo_id', v_grupo, 'cobro_id', v_cobros[1], 'cobros', v_cobros_json);
end;
$$;
alter function public.cobro_grupo_aplicar(uuid, uuid, jsonb, jsonb, text, text, uuid, boolean, uuid) owner to peludesk_definer;
revoke execute on function public.cobro_grupo_aplicar(uuid, uuid, jsonb, jsonb, text, text, uuid, boolean, uuid) from public, anon, authenticated;

-- ── 3. Cobrar juntas (lo llama la recepción) ─────────────────────────
create or replace function public.registrar_cobro_grupo(p_partes jsonb, p_notas text, p_metodos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno uuid;
  v_cliente uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden registrar cobros.';
  end if;
  if p_partes is null or jsonb_typeof(p_partes) <> 'array' or jsonb_array_length(p_partes) < 2 then
    raise exception 'Para cobrar juntas se necesitan al menos dos cuentas.';
  end if;
  select r.cliente_id into v_cliente from public.reservas r
  where r.id = (p_partes -> 0 ->> 'reserva_id')::uuid and r.deleted_at is null;
  if v_cliente is null then
    raise exception 'Una de las cuentas no existe en este negocio.';
  end if;
  select id into v_turno from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de cobrar.';
  end if;
  return public.cobro_grupo_aplicar(v_cliente, v_turno, p_partes, p_metodos, p_notas, 'manual', auth.uid(), true, null);
end;
$$;
alter function public.registrar_cobro_grupo(jsonb, text, jsonb) owner to peludesk_definer;
revoke execute on function public.registrar_cobro_grupo(jsonb, text, jsonb) from public, anon;
grant execute on function public.registrar_cobro_grupo(jsonb, text, jsonb) to authenticated, service_role;

-- ── 4. Detalle de un grupo y de qué grupos es una cuenta ─────────────
create or replace function public.cobro_grupo_detalle(p_grupo_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'grupo_id', g.id,
    'recibo', upper(left(g.id::text, 8)),
    'fecha', g.created_at,
    'turno_id', g.turno_id,
    'cliente_id', g.cliente_id,
    'cliente_nombre', cl.nombre,
    'origen', g.origen,
    'total', g.monto_total,
    'propina', g.propina_total,
    'notas', g.notas,
    'tarjeta', (select jsonb_build_object('id', t.id, 'folio', t.folio, 'estado', t.estado, 'monto', t.monto)
                from public.tarjetas_manuales t where t.grupo_id = g.id and t.deleted_at is null order by t.created_at limit 1),
    'metodos', coalesce((
      select jsonb_agg(jsonb_build_object('metodo', x.metodo, 'monto', x.monto, 'propina', x.propina) order by x.metodo)
      from (
        select cm.metodo, sum(cm.monto) as monto, sum(cm.propina) as propina
        from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
        where c.grupo_id = g.id group by cm.metodo
      ) x), '[]'::jsonb),
    'cuentas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'reserva_id', c.reserva_id,
        'cobro_id', c.id,
        'monto', coalesce((select sum(cm.monto) from public.cobro_metodos cm where cm.cobro_id = c.id), 0),
        'propina', coalesce((select sum(cm.propina) from public.cobro_metodos cm where cm.cobro_id = c.id), 0),
        'devuelto', coalesce((select sum(dm.monto) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
                              where d.cobro_id = c.id and d.deleted_at is null), 0),
        'descripcion', coalesce((select string_agg(l.descripcion, ' · ' order by l.descripcion) from public.cuenta_lineas_reserva(c.reserva_id) l), coalesce(r.notas, 'Cuenta')),
        'perros', coalesce((
          select string_agg(distinct p.nombre, ', ' order by p.nombre) from (
            select p1.nombre from public.estancias e join public.perros p1 on p1.id = e.perro_id
              where e.reserva_id = c.reserva_id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
            union
            select p2.nombre from public.citas_estetica ce join public.perros p2 on p2.id = ce.perro_id
              where ce.reserva_id = c.reserva_id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
            union
            select p3.nombre from public.cargos_aplicados ca join public.perros p3 on p3.id = ca.perro_id
              where ca.reserva_id = c.reserva_id and ca.deleted_at is null and not ca.cancelado
          ) p), '')
      ) order by c.created_at, c.id)
      from public.cobros c join public.reservas r on r.id = c.reserva_id
      where c.grupo_id = g.id and c.deleted_at is null), '[]'::jsonb)
  )
  from public.cobros_grupo g
  join public.clientes cl on cl.id = g.cliente_id
  where g.id = p_grupo_id and g.negocio_id = public.negocio_actual() and g.deleted_at is null
    and coalesce(public.current_rol() in ('admin', 'recepcion'), false);
$$;
alter function public.cobro_grupo_detalle(uuid) owner to peludesk_definer;
revoke execute on function public.cobro_grupo_detalle(uuid) from public, anon;
grant execute on function public.cobro_grupo_detalle(uuid) to authenticated, service_role;

create or replace function public.cobro_grupos_de_reserva(p_reserva_id uuid)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct c.grupo_id), '{}')
  from public.cobros c
  where c.reserva_id = p_reserva_id and c.grupo_id is not null and c.deleted_at is null
    and c.negocio_id = public.negocio_actual()
    and coalesce(public.current_rol() in ('admin', 'recepcion'), false);
$$;
alter function public.cobro_grupos_de_reserva(uuid) owner to peludesk_definer;
revoke execute on function public.cobro_grupos_de_reserva(uuid) from public, anon;
grant execute on function public.cobro_grupos_de_reserva(uuid) to authenticated, service_role;

-- El cobro de una orden de grupo al que le toca un reembolso hecho en el panel
-- del proveedor (sin saber de qué cuenta): el primero al que le alcanza.
create or replace function public.cobro_de_orden_para_monto(p_orden_id uuid, p_cobro_id uuid, p_monto numeric)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.id from public.mp_ordenes o
    join public.cobros c on c.grupo_id = o.grupo_id and c.deleted_at is null
    where o.id = p_orden_id and o.grupo_id is not null
      and public.cobro_disponible_para_devolver(c.id) >= p_monto
    order by c.created_at, c.id limit 1
  ), p_cobro_id);
$$;
alter function public.cobro_de_orden_para_monto(uuid, uuid, numeric) owner to peludesk_definer;
revoke execute on function public.cobro_de_orden_para_monto(uuid, uuid, numeric) from public, anon, authenticated;

-- ── 5. Marcar «no recibida» ──────────────────────────────────────────
create or replace function public.tarjeta_manual_no_recibida(p_tarjeta_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tarjetas_manuales%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_cobro record;
  v_turno_abierto uuid;
  v_dev uuid;
  v_corr uuid;
  v_primera_corr uuid;
  v_primera_dev uuid;
  v_ya_devuelto numeric;
  v_parte jsonb;
  v_partes jsonb;
  v_devs jsonb := '[]'::jsonb;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin marca una tarjeta manual como no recibida.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo (qué pasó) para marcarla como no recibida.';
  end if;
  select * into v_t from public.tarjetas_manuales
  where id = p_tarjeta_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Registro de tarjeta manual no encontrado.';
  end if;
  if v_t.estado <> 'por_revisar' then
    raise exception 'Esta tarjeta ya se revisó: solo se marca como no recibida una que sigue por revisar.';
  end if;
  if v_t.propina > 0 then
    raise exception 'Este cobro de tarjeta trae propina: avisa a quien lleva la nómina antes de corregirlo.';
  end if;
  -- Un registro de grupo trae sus partes; uno de una sola cuenta, la suya.
  v_partes := coalesce(v_t.partes, jsonb_build_array(jsonb_build_object('cobro_id', v_t.cobro_id, 'monto', v_t.monto)));
  for v_parte in select * from jsonb_array_elements(v_partes) loop
    select coalesce(sum(dm.monto), 0) into v_ya_devuelto
    from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
    where d.cobro_id = (v_parte ->> 'cobro_id')::uuid and d.deleted_at is null and dm.metodo = 'tarjeta_manual';
    if v_ya_devuelto > 0 or public.cobro_disponible_para_devolver((v_parte ->> 'cobro_id')::uuid) < (v_parte ->> 'monto')::numeric - 0.005 then
      raise exception 'Este cobro ya tiene devoluciones: no se puede marcar como no recibida.';
    end if;
  end loop;
  select id into v_turno_abierto from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_abierto is null then
    raise exception 'No hay turno de caja abierto. Ábrelo: la corrección se anota en el turno abierto (un turno cerrado nunca cambia).';
  end if;

  for v_parte in select * from jsonb_array_elements(v_partes) loop
    select c.reserva_id, c.turno_id, c.origen, c.notas, c.created_at, c.created_by, tc.estado as turno_estado
    into v_cobro
    from public.cobros c join public.turnos_caja tc on tc.id = c.turno_id
    where c.id = (v_parte ->> 'cobro_id')::uuid;

    insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
    values ((v_parte ->> 'cobro_id')::uuid, v_turno_abierto, 'Tarjeta manual no recibida (folio ' || v_t.folio || '): ' || v_motivo, auth.uid(), auth.uid(), 'manual')
    returning id into v_dev;
    insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
    values (v_dev, 'tarjeta_manual', (v_parte ->> 'monto')::numeric, auth.uid());

    insert into public.cobro_correcciones (cobro_id, devolucion_id, tipo, motivo, estado_anterior, evidencia, turno_cobro_id, turno_efecto_id, hecha_por, created_by)
    values ((v_parte ->> 'cobro_id')::uuid, v_dev, 'tarjeta_manual_no_recibida', v_motivo,
      jsonb_build_object('reserva_id', v_cobro.reserva_id, 'turno_id', v_cobro.turno_id, 'origen', coalesce(v_cobro.origen, 'manual'),
        'notas', v_cobro.notas, 'cobrado_at', v_cobro.created_at, 'cobrado_por', v_cobro.created_by, 'grupo_id', v_t.grupo_id,
        'tarjeta', jsonb_build_object('folio', v_t.folio, 'monto', (v_parte ->> 'monto')::numeric, 'monto_total', v_t.monto, 'motivo', v_t.motivo, 'ultimos4', v_t.ultimos4, 'banco', v_t.banco)),
      jsonb_build_object('verificado_con', 'revision_del_admin'), v_cobro.turno_id, v_turno_abierto, auth.uid(), auth.uid())
    returning id into v_corr;
    v_primera_corr := coalesce(v_primera_corr, v_corr);
    v_primera_dev := coalesce(v_primera_dev, v_dev);
    v_devs := v_devs || jsonb_build_object('cobro_id', (v_parte ->> 'cobro_id')::uuid, 'reserva_id', v_cobro.reserva_id, 'devolucion_id', v_dev, 'monto', (v_parte ->> 'monto')::numeric);
  end loop;

  update public.tarjetas_manuales
  set estado = 'no_recibida', revisada_por = auth.uid(), revisada_at = now(), nota_revision = v_motivo, correccion_id = v_primera_corr
  where id = p_tarjeta_id;
  insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
  values (public.negocio_actual(), p_tarjeta_id, 'no_recibida', auth.uid(),
    jsonb_build_object('motivo', v_motivo, 'devolucion_id', v_primera_dev, 'devoluciones', v_devs, 'grupo_id', v_t.grupo_id,
      'turno_cobro_id', v_cobro.turno_id, 'turno_efecto_id', v_turno_abierto));
  if v_t.grupo_id is not null then
    insert into public.cobros_grupo_eventos (negocio_id, grupo_id, tipo, actor, detalle)
    values (public.negocio_actual(), v_t.grupo_id, 'no_recibido', auth.uid(),
      jsonb_build_object('motivo', v_motivo, 'via', 'tarjeta_manual', 'folio', v_t.folio, 'devoluciones', v_devs, 'turno_efecto_id', v_turno_abierto));
  end if;

  return jsonb_build_object('devolucion_id', v_primera_dev, 'devoluciones', v_devs, 'monto', v_t.monto,
    'reserva_id', (select c.reserva_id from public.cobros c where c.id = v_t.cobro_id),
    'turno_cobro_id', v_cobro.turno_id, 'turno_efecto_id', v_turno_abierto, 'turno_del_cobro_cerrado', v_cobro.turno_estado <> 'abierto');
end;
$$;
alter function public.tarjeta_manual_no_recibida(uuid, text) owner to peludesk_definer;

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
  v_grupo uuid;
  v_id uuid;
  v_ids uuid[];
  v_primera_dev uuid;
  v_total numeric := 0;
  v_devs jsonb := '[]'::jsonb;
  v_primer record;
  v_hay_primer boolean := false;
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

  select c.grupo_id into v_grupo from public.cobros c where c.id = p_cobro_id and c.deleted_at is null;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  -- Un cobro de un pago agrupado se deshace completo: todas las cuentas del grupo.
  select coalesce(array_agg(c.id order by c.created_at, c.id), '{}') into v_ids
  from public.cobros c
  where c.deleted_at is null and (c.id = p_cobro_id or (v_grupo is not null and c.grupo_id = v_grupo));

  select id into v_turno_abierto from public.turnos_caja where estado = 'abierto' limit 1;

  foreach v_id in array v_ids loop
    select c.id, c.reserva_id, c.turno_id, c.origen, c.notas, c.created_at, c.created_by, t.estado as turno_estado
    into v_cobro
    from public.cobros c
    join public.turnos_caja t on t.id = c.turno_id
    where c.id = v_id and c.deleted_at is null
    for update of c;
    if not found then
      raise exception 'Cobro no encontrado.';
    end if;
    if not v_hay_primer then v_primer := v_cobro; v_hay_primer := true; end if;
    if coalesce(v_cobro.origen, 'manual') <> 'manual' then
      raise exception 'Este cobro entró con un pago que el proveedor confirmó: si hay que devolverlo, usa la devolución con el proveedor.';
    end if;

    select coalesce(sum(cm.monto), 0), coalesce(sum(cm.propina), 0),
           coalesce(jsonb_agg(jsonb_build_object('metodo', cm.metodo, 'monto', cm.monto, 'propina', cm.propina)), '[]'::jsonb)
    into v_monto, v_propina, v_metodos
    from public.cobro_metodos cm where cm.cobro_id = v_id and cm.metodo = 'terminal';
    if v_monto <= 0 then
      raise exception 'Este cobro no tiene un método de terminal: solo se corrigen así los cobros con terminal.';
    end if;
    if v_propina > 0 then
      raise exception 'Este cobro de terminal trae propina: avisa a quien lleva la nómina antes de corregirlo.';
    end if;
    v_disponible := public.cobro_disponible_para_devolver(v_id);
    if v_disponible < v_monto - 0.005 then
      raise exception 'Este cobro ya tiene devoluciones: no se puede marcar como no recibido.';
    end if;
    if v_turno_abierto is null then
      raise exception 'No hay turno de caja abierto. Ábrelo: la corrección se anota en el turno abierto (un turno cerrado nunca cambia).';
    end if;

    insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
    values (v_id, v_turno_abierto, 'No recibido: ' || v_motivo, p_actor, p_actor, 'manual')
    returning id into v_dev;
    insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
    select v_dev, 'terminal', cm.monto, p_actor from public.cobro_metodos cm where cm.cobro_id = v_id and cm.metodo = 'terminal';

    insert into public.cobro_correcciones (cobro_id, devolucion_id, tipo, motivo, estado_anterior, evidencia, turno_cobro_id, turno_efecto_id, hecha_por, created_by)
    values (v_id, v_dev, 'no_recibido', v_motivo,
      jsonb_build_object('reserva_id', v_cobro.reserva_id, 'turno_id', v_cobro.turno_id, 'origen', coalesce(v_cobro.origen, 'manual'),
        'notas', v_cobro.notas, 'cobrado_at', v_cobro.created_at, 'cobrado_por', v_cobro.created_by, 'grupo_id', v_grupo, 'metodos', v_metodos),
      p_evidencia, v_cobro.turno_id, v_turno_abierto, p_actor, p_actor);

    update public.conciliacion_terminal
    set resuelta_at = now(), resuelta_motivo = 'Marcado como no recibido: ' || v_motivo, resuelta_por = p_actor
    where cobro_id = v_id and resuelta_at is null;

    v_total := v_total + v_monto;
    v_primera_dev := coalesce(v_primera_dev, v_dev);
    v_devs := v_devs || jsonb_build_object('cobro_id', v_id, 'reserva_id', v_cobro.reserva_id, 'devolucion_id', v_dev, 'monto', v_monto);
  end loop;

  if v_grupo is not null then
    insert into public.cobros_grupo_eventos (negocio_id, grupo_id, tipo, actor, detalle)
    values (public.negocio_actual(), v_grupo, 'no_recibido', p_actor,
      jsonb_build_object('motivo', v_motivo, 'via', 'terminal_a_mano', 'devoluciones', v_devs, 'turno_efecto_id', v_turno_abierto));
  end if;

  return jsonb_build_object('devolucion_id', v_primera_dev, 'devoluciones', v_devs, 'monto', v_total, 'reserva_id', v_primer.reserva_id,
    'turno_cobro_id', v_primer.turno_id, 'turno_efecto_id', v_turno_abierto, 'turno_del_cobro_cerrado', v_primer.turno_estado <> 'abierto');
end;
$$;
alter function public.cobro_marcar_no_recibido(uuid, text, uuid, jsonb) owner to peludesk_definer;

-- ── 6. Lectura: por revisar, movimientos del turno, órdenes abiertas ──
drop function public.tarjetas_manuales_por_revisar(boolean);
create function public.tarjetas_manuales_por_revisar(p_historial boolean default false)
returns table(id uuid, cobro_id uuid, reserva_id uuid, turno_id uuid, turno_cerrado boolean, monto numeric, propina numeric, folio text, motivo text, motivo_texto text, ultimos4 text, banco text, sobre_tope boolean, estado text, registrada_at timestamptz, registrada_por_nombre text, cliente_nombre text, devuelto numeric, revisada_at timestamptz, revisada_por_nombre text, nota_revision text, grupo_id uuid, cuentas int)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.cobro_id, c.reserva_id, t.turno_id, (tc.estado <> 'abierto'),
    t.monto, t.propina, t.folio, t.motivo, t.motivo_texto, t.ultimos4, t.banco,
    t.sobre_tope, t.estado, t.created_at,
    coalesce(nullif(btrim(pr.nombre_completo), ''), 'Alguien del equipo'),
    cl.nombre,
    coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.deleted_at is null and dm.metodo = 'tarjeta_manual'
        and (d.cobro_id = t.cobro_id or (t.grupo_id is not null and d.cobro_id in (select c2.id from public.cobros c2 where c2.grupo_id = t.grupo_id)))
    ), 0),
    t.revisada_at,
    coalesce(nullif(btrim(rv.nombre_completo), ''), case when t.revisada_por is null then null else 'Alguien del equipo' end),
    t.nota_revision,
    t.grupo_id,
    case when t.partes is null then 1 else jsonb_array_length(t.partes) end
  from public.tarjetas_manuales t
  join public.cobros c on c.id = t.cobro_id
  join public.turnos_caja tc on tc.id = t.turno_id
  join public.reservas r on r.id = c.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  left join public.profiles pr on pr.id = t.created_by
  left join public.profiles rv on rv.id = t.revisada_por
  where t.negocio_id = public.negocio_actual()
    and t.deleted_at is null
    and coalesce(public.is_admin(), false)
    and (t.estado = 'por_revisar' or (p_historial and t.created_at > now() - interval '60 days'))
  order by (t.estado = 'por_revisar') desc, t.created_at asc;
$$;
alter function public.tarjetas_manuales_por_revisar(boolean) owner to peludesk_definer;
revoke execute on function public.tarjetas_manuales_por_revisar(boolean) from public, anon;
grant execute on function public.tarjetas_manuales_por_revisar(boolean) to authenticated, service_role;

drop function public.movimientos_turno(uuid);
create function public.movimientos_turno(p_turno_id uuid)
returns table(id uuid, tipo text, fecha timestamptz, reserva_id uuid, cliente_nombre text, descripcion text, metodo text, monto numeric, propina numeric, origen text, hecho_por uuid, grupo_id uuid)
language sql
stable
set search_path = ''
as $$
  select
    cm.id,
    case
      when exists (select 1 from public.ventas_mostrador v where v.reserva_id = c.reserva_id) then 'venta_mostrador'
      when exists (select 1 from public.bonos_clientes bc where bc.reserva_id = c.reserva_id) then 'venta_bono'
      else 'cobro' end,
    c.created_at,
    c.reserva_id,
    cl.nombre,
    coalesce(c.notas, ''),
    cm.metodo,
    cm.monto,
    cm.propina,
    coalesce(c.origen, 'manual'),
    c.created_by,
    c.grupo_id
  from public.cobro_metodos cm
  join public.cobros c on c.id = cm.cobro_id
  join public.reservas r on r.id = c.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  where c.turno_id = p_turno_id

  union all

  select
    dm.id,
    'devolucion',
    d.created_at,
    c.reserva_id,
    cl.nombre,
    d.motivo,
    dm.metodo,
    -dm.monto,
    0,
    d.origen,
    d.autorizado_por,
    c.grupo_id
  from public.devolucion_metodos dm
  join public.devoluciones d on d.id = dm.devolucion_id
  join public.cobros c on c.id = d.cobro_id
  join public.reservas r on r.id = c.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  where d.turno_id = p_turno_id

  union all

  select
    mc.id,
    'retiro',
    mc.created_at,
    null,
    null,
    mc.motivo,
    'efectivo',
    -mc.monto,
    0,
    'manual',
    mc.created_by,
    null::uuid
  from public.movimientos_caja mc
  where mc.turno_id = p_turno_id and mc.deleted_at is null

  order by 3 desc;
$$;
revoke execute on function public.movimientos_turno(uuid) from public, anon;
grant execute on function public.movimientos_turno(uuid) to authenticated, service_role;

create or replace function public.ordenes_abiertas_de_reservas(p_reservas uuid[])
returns table(id uuid, reserva_id uuid, tipo text, estado text, monto numeric, proveedor text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, x.reserva_id, o.tipo, o.estado, o.monto, o.proveedor
  from public.mp_ordenes o
  cross join lateral (
    select o.reserva_id as reserva_id where o.grupo_cuentas is null
    union all
    select (g ->> 'reserva_id')::uuid from jsonb_array_elements(coalesce(o.grupo_cuentas, '[]'::jsonb)) g
  ) x
  where o.negocio_id = public.negocio_actual()
    and coalesce(public.is_staff(), false)
    and o.deleted_at is null
    and x.reserva_id = any (p_reservas)
    and (
      o.estado in ('en_terminal', 'por_confirmar')
      or (o.estado = 'creada' and (o.tipo <> 'link' or o.expira_at is null or o.expira_at > now()))
    );
$$;
alter function public.ordenes_abiertas_de_reservas(uuid[]) owner to peludesk_definer;

-- ── 7. Parches a funciones que ya existen ────────────────────────────
do $$
declare
  v_def text;
  v_nuevo text;
  r record;
begin
  -- aplicar_descuento: el descuento por porcentaje deja un total en pesos enteros.
  select replace(pg_get_functiondef('public.aplicar_descuento(uuid,uuid,text,numeric,text)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def,
    $a$    when p_tipo = 'porcentaje' then round(v_total_cuenta * p_valor / 100, 2)$a$,
    $b$    when p_tipo = 'porcentaje' then (v_total_cuenta - v_ya_descontado) - round((v_total_cuenta - v_ya_descontado) - (v_total_cuenta * p_valor / 100), 0)$b$);
  if v_nuevo = v_def then raise exception 'aplicar_descuento cambió: no se pudo redondear el descuento.'; end if;
  execute v_nuevo;

  -- registrar_cobro: ninguna cuenta se queda debiendo menos de un peso.
  select replace(pg_get_functiondef('public.registrar_cobro(uuid,text,jsonb)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def, E'  v_tarjeta_id uuid;\nbegin', E'  v_tarjeta_id uuid;\n  v_saldo numeric;\nbegin');
  if v_nuevo = v_def then raise exception 'registrar_cobro cambió (declaraciones).'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, E'  end loop;\n\n  return v_cobro_id;',
    E'  end loop;\n\n  -- Ningún cobro deja la cuenta debiendo menos de un peso: son restos de redondeo\n  -- que nadie puede cobrar y la dejan abierta para siempre.\n  select t.saldo into v_saldo from public.cuenta_totales_reserva(p_reserva_id) t;\n  if v_saldo > 0 and v_saldo < 1 then\n    raise exception ''Con este cobro la cuenta se quedaría debiendo $% (menos de un peso). Cobra la cuenta completa, o aplica un descuento de redondeo por esa diferencia.'', v_saldo;\n  end if;\n\n  return v_cobro_id;');
  if v_nuevo = v_def then raise exception 'registrar_cobro cambió (cierre).'; end if;
  execute v_nuevo;

  -- registrar_pago_mercadopago: una orden de grupo se reparte entre sus cuentas.
  select replace(pg_get_functiondef('public.registrar_pago_mercadopago(uuid,text,numeric,integer,text,jsonb)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def, E'  v_otra uuid;\nbegin', E'  v_otra uuid;\n  v_grupo jsonb;\nbegin');
  if v_nuevo = v_def then raise exception 'registrar_pago_mercadopago cambió (declaraciones).'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, E'  if v_turno_id is not null then\n    insert into public.cobros',
    E'  if v_orden.grupo_cuentas is not null then\n    if abs(p_monto - (select sum((g ->> ''monto'')::numeric) from jsonb_array_elements(v_orden.grupo_cuentas) g)) > 0.005 then\n      raise exception ''El monto confirmado ($%) no coincide con el total de las cuentas del grupo.'', p_monto;\n    end if;\n  end if;\n  if v_turno_id is not null and v_orden.grupo_cuentas is not null then\n    v_grupo := public.cobro_grupo_aplicar(\n      v_orden.grupo_cliente_id, v_turno_id, v_orden.grupo_cuentas,\n      jsonb_build_array(jsonb_build_object(''metodo'', v_metodo, ''monto'', p_monto, ''propina'', 0)),\n      case\n        when v_orden.proveedor = ''clip'' then ''Terminal Clip''\n        when v_orden.tipo = ''point'' then ''Terminal Mercado Pago''\n        else ''Link de pago Mercado Pago'' end\n        || case when v_orden.simulado then '' (SIMULADO)'' else '''' end\n        || case when coalesce(p_installments, 1) > 1 then '' · '' || p_installments || '' meses'' else '''' end\n        || case when p_mp_payment_id is not null then '' · pago '' || p_mp_payment_id else '''' end,\n      v_origen, v_orden.created_by, false, p_orden_id);\n    v_cobro_id := (v_grupo ->> ''cobro_id'')::uuid;\n  elsif v_turno_id is not null then\n    insert into public.cobros');
  if v_nuevo = v_def then raise exception 'registrar_pago_mercadopago cambió (cobro).'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, E'      cobro_id = v_cobro_id,\n      pagada_at', E'      cobro_id = v_cobro_id,\n      grupo_id = coalesce((v_grupo ->> ''grupo_id'')::uuid, grupo_id),\n      pagada_at');
  if v_nuevo = v_def then raise exception 'registrar_pago_mercadopago cambió (orden).'; end if;
  execute v_nuevo;

  -- registrar_pagos_mp_pendientes (al abrir turno): lo mismo para los grupos.
  select replace(pg_get_functiondef('public.registrar_pagos_mp_pendientes()'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def, E'  v_simula boolean := public.negocio_puede_simular();\nbegin', E'  v_simula boolean := public.negocio_puede_simular();\n  v_grupo jsonb;\nbegin');
  if v_nuevo = v_def then raise exception 'registrar_pagos_mp_pendientes cambió (declaraciones).'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, E'  loop\n    insert into public.cobros (reserva_id, turno_id, notas, origen, created_by)',
    E'  loop\n    if v_orden.grupo_cuentas is not null then\n      v_grupo := public.cobro_grupo_aplicar(\n        v_orden.grupo_cliente_id, new.id, v_orden.grupo_cuentas,\n        jsonb_build_array(jsonb_build_object(''metodo'', coalesce(v_orden.metodo_registrado, case v_orden.tipo when ''point'' then ''terminal'' else ''transferencia'' end), ''monto'', v_orden.monto, ''propina'', 0)),\n        case\n          when v_orden.proveedor = ''clip'' then ''Terminal Clip''\n          when v_orden.tipo = ''point'' then ''Terminal Mercado Pago''\n          else ''Link de pago Mercado Pago'' end\n          || case when v_orden.simulado then '' (SIMULADO)'' else '''' end\n          || '' · pagado '' || to_char(v_orden.pagada_at at time zone public.zona_negocio(), ''DD/MM HH24:MI'')\n          || '' sin turno abierto'',\n        case\n          when v_orden.proveedor = ''clip'' then ''clip_terminal''\n          when v_orden.tipo = ''point'' then ''mercadopago_point''\n          else ''mercadopago_link'' end,\n        v_orden.created_by, false, v_orden.id);\n      update public.mp_ordenes set cobro_id = (v_grupo ->> ''cobro_id'')::uuid, grupo_id = (v_grupo ->> ''grupo_id'')::uuid where id = v_orden.id;\n      continue;\n    end if;\n    insert into public.cobros (reserva_id, turno_id, notas, origen, created_by)');
  if v_nuevo = v_def then raise exception 'registrar_pagos_mp_pendientes cambió (cobro).'; end if;
  execute v_nuevo;

  -- preparar_reembolso: el cobro puede ser de una cuenta de un pago agrupado.
  select replace(pg_get_functiondef('public.preparar_reembolso(uuid,numeric,text)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def, E'  where cobro_id = p_cobro_id and deleted_at is null for update;',
    E'  where (cobro_id = p_cobro_id or (grupo_id is not null and grupo_id = (select c2.grupo_id from public.cobros c2 where c2.id = p_cobro_id)))\n    and deleted_at is null for update;');
  if v_nuevo = v_def then raise exception 'preparar_reembolso cambió.'; end if;
  execute v_nuevo;

  -- registrar_reembolso_proveedor: un reembolso del panel cae en la cuenta a la que le alcanza.
  select replace(pg_get_functiondef('public.registrar_reembolso_proveedor(uuid,text,numeric,uuid,boolean,jsonb)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def, E'values (p_orden_id, v_orden.cobro_id, v_orden.proveedor, ''proveedor'',',
    E'values (p_orden_id, public.cobro_de_orden_para_monto(p_orden_id, v_orden.cobro_id, round(p_monto, 2)), v_orden.proveedor, ''proveedor'',');
  if v_nuevo = v_def then raise exception 'registrar_reembolso_proveedor cambió.'; end if;
  execute v_nuevo;

  -- demo_vaciar: las tablas nuevas también se vacían.
  select replace(pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def, $a$'reembolsos_cobro', $a$, $b$'reembolsos_cobro', 'cobros_grupo_eventos', 'cobros_grupo', 'tarjetas_manuales_eventos', 'tarjetas_manuales', $b$);
  if v_nuevo = v_def then raise exception 'demo_vaciar cambió.'; end if;
  execute v_nuevo;
end $$;

-- ── 8. Residuo de centavos: revisión y corrección por la plataforma ──
alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (array[
  'crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo', 'cambiar_plan',
  'asignar_plan', 'editar_plan', 'resolver_propuesta_raza', 'agregar_raza', 'eliminar_negocio', 'seguimiento_pausa',
  'cargar_tarifas_estetica', 'sincronizar_tutoriales', 'tutorial_youtube', 'marcar_tutoriales', 'migracion_matriz_mestizo',
  'revertir_tarifas_estetica', 'corregir_saldos_centavos', 'revertir_saldos_centavos']));

-- Cuentas con un saldo de menos de un peso (restos de redondeo). Solo lee.
create or replace function public.plataforma_saldos_centavos(p_negocio_id uuid)
returns table(reserva_id uuid, cliente_nombre text, descripcion text, total_cuenta numeric, saldo numeric, ya_corregida boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  return query
  select r.id, cl.nombre,
    coalesce((select string_agg(l.descripcion, ' · ' order by l.descripcion) from public.cuenta_lineas_reserva(r.id) l), coalesce(r.notas, 'Cuenta')),
    t.total_cuenta, t.saldo,
    exists (select 1 from public.descuentos_aplicados d where d.reserva_id = r.id and not d.cancelado and d.motivo_adicional like 'Ajuste por redondeo%')
  from public.reservas r
  join public.clientes cl on cl.id = r.cliente_id
  cross join lateral public.cuenta_totales_reserva(r.id) t
  where r.negocio_id = p_negocio_id and r.deleted_at is null
    and exists (select 1 from public.cobros c where c.reserva_id = r.id and c.deleted_at is null)
    and t.saldo > 0 and t.saldo < 1
  order by t.saldo desc, cl.nombre;
end;
$$;
revoke execute on function public.plataforma_saldos_centavos(uuid) from public, anon;
grant execute on function public.plataforma_saldos_centavos(uuid) to authenticated, service_role;

-- Corrige esas cuentas con un descuento «Ajuste por redondeo» por el saldo
-- exacto (la cuenta queda en cero; el cobro y el corte ya hechos no cambian).
-- Deja el evento con lo que hizo para poder revertirlo.
create or replace function public.plataforma_corregir_saldos_centavos(p_negocio_id uuid, p_reservas uuid[], p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat uuid;
  v_r record;
  v_id uuid;
  v_hechos jsonb := '[]'::jsonb;
  v_evento uuid;
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  select id into v_cat from public.catalogo_descuentos where negocio_id = p_negocio_id and clave = 'ajuste_redondeo' and deleted_at is null;
  for v_r in select * from public.plataforma_saldos_centavos(p_negocio_id) s where s.reserva_id = any (p_reservas) loop
    if v_cat is null then
      insert into public.catalogo_descuentos (negocio_id, clave, etiqueta, orden)
      values (p_negocio_id, 'ajuste_redondeo', 'Ajuste por redondeo',
        coalesce((select max(orden) from public.catalogo_descuentos where negocio_id = p_negocio_id), 0) + 1)
      returning id into v_cat;
    end if;
    insert into public.descuentos_aplicados (negocio_id, reserva_id, catalogo_descuento_id, tipo, valor, monto_aplicado, motivo_adicional, created_by)
    values (p_negocio_id, v_r.reserva_id, v_cat, 'monto_fijo', v_r.saldo, v_r.saldo,
      'Ajuste por redondeo: ' || v_motivo, auth.uid())
    returning id into v_id;
    v_hechos := v_hechos || jsonb_build_object('reserva_id', v_r.reserva_id, 'descuento_id', v_id, 'monto', v_r.saldo, 'cliente', v_r.cliente_nombre, 'cuenta', v_r.descripcion);
  end loop;
  insert into public.plataforma_eventos (accion, motivo, detalle, created_by)
  values ('corregir_saldos_centavos', v_motivo,
    jsonb_build_object('negocio_id', p_negocio_id, 'cuentas', v_hechos, 'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end),
    auth.uid())
  returning id into v_evento;
  return jsonb_build_object('evento_id', v_evento, 'cuentas', v_hechos);
end;
$$;
revoke execute on function public.plataforma_corregir_saldos_centavos(uuid, uuid[], text) from public, anon;
grant execute on function public.plataforma_corregir_saldos_centavos(uuid, uuid[], text) to authenticated, service_role;

create or replace function public.plataforma_revertir_saldos_centavos(p_evento_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ev record;
  v_c jsonb;
  v_n int := 0;
  v_evento uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  select * into v_ev from public.plataforma_eventos where id = p_evento_id and accion = 'corregir_saldos_centavos';
  if not found then
    raise exception 'No hay una corrección de saldos con ese evento.';
  end if;
  if exists (select 1 from public.plataforma_eventos e where e.accion = 'revertir_saldos_centavos' and (e.detalle ->> 'evento_revertido')::uuid = p_evento_id) then
    raise exception 'Esa corrección ya se revirtió.';
  end if;
  for v_c in select * from jsonb_array_elements(v_ev.detalle -> 'cuentas') loop
    update public.descuentos_aplicados
    set cancelado = true, motivo_cancelacion = 'Se revirtió la corrección de centavos (evento ' || p_evento_id || ')'
    where id = (v_c ->> 'descuento_id')::uuid and not cancelado;
    if found then v_n := v_n + 1; end if;
  end loop;
  insert into public.plataforma_eventos (accion, motivo, detalle, created_by)
  values ('revertir_saldos_centavos', 'Reversa de la corrección ' || p_evento_id,
    jsonb_build_object('negocio_id', v_ev.detalle -> 'negocio_id', 'evento_revertido', p_evento_id, 'descuentos_cancelados', v_n), auth.uid())
  returning id into v_evento;
  return jsonb_build_object('evento_id', v_evento, 'descuentos_cancelados', v_n);
end;
$$;
revoke execute on function public.plataforma_revertir_saldos_centavos(uuid) from public, anon;
grant execute on function public.plataforma_revertir_saldos_centavos(uuid) to authenticated, service_role;

-- Lista blanca de la frontera: las tres son de postgres (ven todos los negocios).
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('plataforma_saldos_centavos' in v_def) = 0 then
    v_def := replace(v_def, $a$('plataforma_cargar_tarifas_estetica')$a$,
      $b$('plataforma_cargar_tarifas_estetica'), ('plataforma_saldos_centavos'), ('plataforma_corregir_saldos_centavos'), ('plataforma_revertir_saldos_centavos')$b$);
    if position('plataforma_saldos_centavos' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar las funciones de saldos de centavos.';
    end if;
    execute v_def;
  end if;
end $$;

-- Permisos de ejecución de lo que se volvió a crear con otro dueño.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.tarjeta_manual_no_recibida(uuid, text)', 'public.ordenes_abiertas_de_reservas(uuid[])',
    'public.aplicar_descuento(uuid, uuid, text, numeric, text)', 'public.registrar_cobro(uuid, text, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
