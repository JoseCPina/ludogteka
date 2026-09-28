-- Integraciones por negocio (28 de septiembre de 2026): cada negocio de
-- PeluDesk cobra con SU terminal y SU cuenta (Mercado Pago por OAuth o
-- Clip), y cotiza recolección con la llave de Google de PeluDesk con un
-- tope de consultas al mes. Hasta hoy las llaves del entorno eran de
-- Ludogteka y cualquier otro negocio tenía todo apagado.
--
--   integraciones_cobro   qué proveedor eligió cada negocio y el estado de
--                         su conexión. Las credenciales NO viven aquí: van
--                         cifradas en Vault (secreto_id) y solo el servidor
--                         las lee, siempre para el negocio de la petición.
--   integraciones_oauth   los intentos de "Conectar Mercado Pago": un nonce
--                         de un solo uso y el verificador PKCE.
--   maps_consultas        cada consulta real a Google (geocodificar o ruta)
--                         de cada negocio, para el tope mensual.
--   mp_ordenes            ahora es la orden de cobro integrado de cualquier
--                         proveedor (el nombre se queda por historia):
--                         `proveedor` y la cuenta que la cobró.

-- ───────────────────────────── integraciones_cobro
create table public.integraciones_cobro (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  -- 'manual' solo existe como elección ("no uso terminal integrada"); no
  -- tiene conexión ni credenciales.
  proveedor text not null check (proveedor in ('manual', 'mercadopago', 'clip')),
  elegida boolean not null default false,
  estado text not null default 'desconectada' check (estado in ('conectada', 'desconectada', 'error')),
  modo text check (modo in ('oauth', 'credenciales')),
  -- La cuenta del proveedor (user_id de Mercado Pago): con ella el webhook
  -- sabe de qué negocio es una notificación y rechaza lo cruzado.
  cuenta_id text,
  cuenta_nombre text,
  live_mode boolean,
  terminal_id text,
  terminal_nombre text,
  terminal_compatible boolean,
  token_expira_at timestamptz,
  renovado_at timestamptz,
  -- vault.secrets.id: el secreto nunca sale de la base más que hacia el
  -- servidor (integracion_leer_secreto) y nunca hacia el navegador.
  secreto_id uuid,
  -- Clip: sha256 del token de la URL de webhook de ESTE negocio.
  webhook_token_hash text,
  conectada_at timestamptz,
  conectada_por uuid references auth.users(id) on delete set null,
  desconectada_at timestamptz,
  ultimo_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
comment on table public.integraciones_cobro is
  'Con qué cobra cada negocio (manual, Mercado Pago, Clip) y el estado de su conexión. Las credenciales van cifradas en Vault (secreto_id); nunca en una columna.';
create unique index integraciones_cobro_proveedor on public.integraciones_cobro (negocio_id, proveedor) where deleted_at is null;
create unique index integraciones_cobro_elegida on public.integraciones_cobro (negocio_id) where elegida and deleted_at is null;
create unique index integraciones_cobro_webhook on public.integraciones_cobro (webhook_token_hash) where webhook_token_hash is not null;
create index integraciones_cobro_negocio_idx on public.integraciones_cobro (negocio_id);
create index integraciones_cobro_cuenta_idx on public.integraciones_cobro (proveedor, cuenta_id) where cuenta_id is not null;
create trigger set_updated_at before insert or update on public.integraciones_cobro
  for each row execute function public.set_updated_at();
alter table public.integraciones_cobro enable row level security;
create policy integraciones_cobro_negocio on public.integraciones_cobro as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy integraciones_cobro_negocio_definer on public.integraciones_cobro for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
-- El personal ve con qué se cobra (la caja lo necesita); nadie escribe con
-- su sesión: elegir va por elegir_proveedor_cobro y conectar, por el servidor.
create policy integraciones_cobro_select_staff on public.integraciones_cobro for select to authenticated
  using ((select public.is_staff()));
create policy integraciones_cobro_sin_insert on public.integraciones_cobro for insert to authenticated with check (false);
create policy integraciones_cobro_sin_update on public.integraciones_cobro for update to authenticated using (false);
create policy integraciones_cobro_escritura_ins on public.integraciones_cobro as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy integraciones_cobro_escritura_upd on public.integraciones_cobro as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy integraciones_cobro_escritura_del on public.integraciones_cobro as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
-- Ni el id del secreto ni el hash del webhook se leen por la API.
revoke all on public.integraciones_cobro from anon, authenticated;
grant select (id, negocio_id, proveedor, elegida, estado, modo, cuenta_nombre, live_mode, terminal_id, terminal_nombre,
  terminal_compatible, token_expira_at, conectada_at, desconectada_at, ultimo_error, created_at, updated_at, deleted_at)
  on public.integraciones_cobro to authenticated;
grant select, insert, update on public.integraciones_cobro to peludesk_definer;

-- ───────────────────────────── integraciones_oauth
create table public.integraciones_oauth (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  proveedor text not null check (proveedor in ('mercadopago')),
  -- sha256 del nonce que va firmado en el `state`: el nonce en claro solo
  -- viaja en la URL de ida y vuelta.
  nonce_hash text not null,
  verificador text not null,
  expira_at timestamptz not null,
  usado_at timestamptz,
  resultado text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
comment on table public.integraciones_oauth is
  'Intentos de conectar una cuenta por OAuth: nonce de un solo uso y verificador PKCE. Solo el servidor los lee.';
create unique index integraciones_oauth_nonce on public.integraciones_oauth (nonce_hash);
create index integraciones_oauth_negocio_idx on public.integraciones_oauth (negocio_id);
create trigger set_updated_at before insert or update on public.integraciones_oauth
  for each row execute function public.set_updated_at();
alter table public.integraciones_oauth enable row level security;
create policy integraciones_oauth_negocio on public.integraciones_oauth as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy integraciones_oauth_negocio_definer on public.integraciones_oauth for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy integraciones_oauth_sin_lectura on public.integraciones_oauth for select to authenticated using (false);
create policy integraciones_oauth_sin_insert on public.integraciones_oauth for insert to authenticated with check (false);
create policy integraciones_oauth_escritura_ins on public.integraciones_oauth as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy integraciones_oauth_escritura_upd on public.integraciones_oauth as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy integraciones_oauth_escritura_del on public.integraciones_oauth as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
revoke all on public.integraciones_oauth from anon, authenticated;

-- ───────────────────────────── mp_ordenes: de cualquier proveedor
alter table public.mp_ordenes
  add column proveedor text not null default 'mercadopago' check (proveedor in ('mercadopago', 'clip')),
  add column cuenta_id text;
comment on column public.mp_ordenes.proveedor is
  'Con quién se cobró. mp_order_id guarda el id de la orden del proveedor (en Clip, el pinpad_request_id).';
comment on column public.mp_ordenes.cuenta_id is
  'La cuenta del proveedor con la que se creó (user_id de Mercado Pago). Un pago de otra cuenta no se aplica a esta orden.';

alter table public.cobros drop constraint cobros_origen_check;
alter table public.cobros add constraint cobros_origen_check
  check (origen in ('manual', 'mercadopago_point', 'mercadopago_link', 'clip_terminal'));

-- ───────────────────────────── simulación
-- La simulación nunca da por pagado un cobro de un negocio real: solo el
-- demo y los negocios en prueba cobran en simulación.
create or replace function public.negocio_puede_simular()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select n.plan in ('demo', 'prueba') from public.negocios n where n.id = public.negocio_actual()), false);
$$;
revoke execute on function public.negocio_puede_simular() from public, anon;
grant execute on function public.negocio_puede_simular() to authenticated, service_role, peludesk_definer;

-- ───────────────────────────── credenciales en Vault
-- Dueñas de postgres porque solo ese rol llega a vault (lista blanca de
-- auditoria_frontera). Solo el servidor (service_role) las llama, y SIEMPRE
-- sobre el negocio de la petición (negocio_actual): no reciben negocio.
create or replace function public.integracion_guardar_secreto(p_proveedor text, p_secreto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_fila public.integraciones_cobro%rowtype;
  v_hay boolean;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor guarda credenciales.';
  end if;
  if v_neg is null then
    raise exception 'Falta el negocio.';
  end if;
  if p_proveedor not in ('mercadopago', 'clip') then
    raise exception 'Proveedor desconocido.';
  end if;
  if coalesce(p_secreto, '') = '' then
    raise exception 'La credencial está vacía.';
  end if;
  select * into v_fila from public.integraciones_cobro
  where negocio_id = v_neg and proveedor = p_proveedor and deleted_at is null
  for update;
  v_hay := found;
  if not v_hay then
    insert into public.integraciones_cobro (negocio_id, proveedor, created_by)
    values (v_neg, p_proveedor, null)
    returning * into v_fila;
  end if;
  if v_fila.secreto_id is not null and exists (select 1 from vault.secrets s where s.id = v_fila.secreto_id) then
    perform vault.update_secret(v_fila.secreto_id, p_secreto);
  else
    v_id := vault.create_secret(p_secreto, 'peludesk:' || v_neg || ':' || p_proveedor || ':' || gen_random_uuid(),
      'Credenciales de cobro de un negocio de PeluDesk');
    update public.integraciones_cobro set secreto_id = v_id where id = v_fila.id;
  end if;
end;
$$;

create or replace function public.integracion_leer_secreto(p_proveedor text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_secreto text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor lee credenciales.';
  end if;
  if v_neg is null then
    return null;
  end if;
  select d.decrypted_secret into v_secreto
  from public.integraciones_cobro i
  join vault.decrypted_secrets d on d.id = i.secreto_id
  where i.negocio_id = v_neg and i.proveedor = p_proveedor and i.deleted_at is null;
  return v_secreto;
end;
$$;

create or replace function public.integracion_borrar_secreto(p_proveedor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor borra credenciales.';
  end if;
  select secreto_id into v_id from public.integraciones_cobro
  where negocio_id = v_neg and proveedor = p_proveedor and deleted_at is null
  for update;
  if v_id is not null then
    delete from vault.secrets where id = v_id;
  end if;
  update public.integraciones_cobro set secreto_id = null
  where negocio_id = v_neg and proveedor = p_proveedor and deleted_at is null;
end;
$$;

revoke execute on function public.integracion_guardar_secreto(text, text) from public, anon, authenticated;
revoke execute on function public.integracion_leer_secreto(text) from public, anon, authenticated;
revoke execute on function public.integracion_borrar_secreto(text) from public, anon, authenticated;
grant execute on function public.integracion_guardar_secreto(text, text) to service_role;
grant execute on function public.integracion_leer_secreto(text) to service_role;
grant execute on function public.integracion_borrar_secreto(text) to service_role;

-- ───────────────────────────── elegir con qué se cobra
create or replace function public.elegir_proveedor_cobro(p_proveedor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
begin
  if not public.is_admin() then
    raise exception 'Solo un admin elige con qué cobra el negocio.';
  end if;
  if p_proveedor not in ('manual', 'mercadopago', 'clip') then
    raise exception 'Proveedor desconocido.';
  end if;
  update public.integraciones_cobro set elegida = false
  where negocio_id = v_neg and elegida and proveedor <> p_proveedor and deleted_at is null;
  insert into public.integraciones_cobro (negocio_id, proveedor, elegida)
  values (v_neg, p_proveedor, true)
  on conflict (negocio_id, proveedor) where deleted_at is null do update set elegida = true;
end;
$$;
alter function public.elegir_proveedor_cobro(text) owner to peludesk_definer;
revoke execute on function public.elegir_proveedor_cobro(text) from public, anon;
grant execute on function public.elegir_proveedor_cobro(text) to authenticated;

-- ───────────────────────────── registrar el cobro (cualquier proveedor)
create or replace function public.registrar_pago_mercadopago(
  p_orden_id uuid,
  p_mp_payment_id text,
  p_monto numeric,
  p_installments int,
  p_mp_payment_type text,
  p_evento jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
      ultimo_evento = coalesce(p_evento, ultimo_evento)
  where id = p_orden_id;

  return jsonb_build_object(
    'registrado', v_cobro_id is not null,
    'repetido', false,
    'cobro_id', v_cobro_id,
    'estado', 'pagada',
    'sin_turno', v_cobro_id is null
  );
end;
$$;
alter function public.registrar_pago_mercadopago(uuid, text, numeric, int, text, jsonb) owner to peludesk_definer;

-- Al abrir turno se registran los pagos que llegaron sin turno.
create or replace function public.registrar_pagos_mp_pendientes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden record;
  v_cobro_id uuid;
  v_simula boolean := public.negocio_puede_simular();
begin
  for v_orden in
    select * from public.mp_ordenes
    where estado = 'pagada' and cobro_id is null and deleted_at is null
      and (not simulado or v_simula)
    order by pagada_at
  loop
    insert into public.cobros (reserva_id, turno_id, notas, origen, created_by)
    values (
      v_orden.reserva_id,
      new.id,
      case
        when v_orden.proveedor = 'clip' then 'Terminal Clip'
        when v_orden.tipo = 'point' then 'Terminal Mercado Pago'
        else 'Link de pago Mercado Pago' end
        || case when v_orden.simulado then ' (SIMULADO)' else '' end
        || ' · pagado ' || to_char(v_orden.pagada_at at time zone public.zona_negocio(), 'DD/MM HH24:MI')
        || ' sin turno abierto',
      case
        when v_orden.proveedor = 'clip' then 'clip_terminal'
        when v_orden.tipo = 'point' then 'mercadopago_point'
        else 'mercadopago_link' end,
      v_orden.created_by
    )
    returning id into v_cobro_id;

    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, created_by)
    values (v_cobro_id, coalesce(v_orden.metodo_registrado, case v_orden.tipo when 'point' then 'terminal' else 'transferencia' end), v_orden.monto, 0, v_orden.created_by);

    update public.mp_ordenes set cobro_id = v_cobro_id where id = v_orden.id;
  end loop;
  return new;
end;
$$;
alter function public.registrar_pagos_mp_pendientes() owner to peludesk_definer;

-- La comisión de un cobro integrado, como gasto del negocio que cobró.
create or replace function public.registrar_comision_mercadopago(p_orden_id uuid, p_monto numeric, p_detalle text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria uuid;
  v_hoy date := public.fecha_negocio();
  v_proveedor text;
  v_simulado boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor registra comisiones de cobro.';
  end if;
  if p_monto is null or p_monto <= 0 then
    return false;
  end if;
  select o.proveedor, o.simulado into v_proveedor, v_simulado
  from public.mp_ordenes o where o.id = p_orden_id and o.deleted_at is null;
  if not found or v_simulado then
    return false;
  end if;
  select id into v_categoria from public.categorias_gasto where clave = 'comisiones' and deleted_at is null;
  if v_categoria is null then
    select id into v_categoria from public.categorias_gasto where clave = 'otros' and deleted_at is null;
  end if;
  insert into public.gastos (estado, concepto, categoria_id, monto, fecha_pago, metodo, periodo_desde, periodo_hasta, mp_orden_id, notas)
  values (
    'pagado',
    case v_proveedor when 'clip' then 'Comisión de Clip' else 'Comisión de Mercado Pago' end,
    v_categoria, round(p_monto, 2), v_hoy, 'retenido',
    date_trunc('month', v_hoy)::date, (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date,
    p_orden_id, nullif(p_detalle, '')
  )
  on conflict do nothing;
  return found;
end;
$$;
alter function public.registrar_comision_mercadopago(uuid, numeric, text) owner to peludesk_definer;

-- El corte por origen conoce la terminal de Clip.
create or replace function public.resumen_turno(p_turno_id uuid)
returns table(metodo text, origen text, cobrado numeric, propinas numeric, devuelto numeric)
language sql
stable
set search_path = ''
as $$
  with cobros_t as (
    select cm.metodo, coalesce(c.origen, 'manual') as origen, sum(cm.monto) as cobrado, sum(cm.propina) as propinas
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where c.turno_id = p_turno_id
    group by cm.metodo, coalesce(c.origen, 'manual')
  ),
  devol_t as (
    select dm.metodo, sum(dm.monto) as devuelto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    where d.turno_id = p_turno_id
    group by dm.metodo
  )
  select
    m.metodo,
    m.origen,
    coalesce(ct.cobrado, 0),
    coalesce(ct.propinas, 0),
    case when m.origen = 'manual' then coalesce(dv.devuelto, 0) else 0 end
  from (
    select unnest(array['efectivo', 'terminal', 'transferencia']) as metodo,
           unnest(array['manual', 'manual', 'manual']) as origen
    union
    select 'terminal', 'mercadopago_point'
    union
    select 'transferencia', 'mercadopago_link'
    union
    select 'terminal', 'clip_terminal'
  ) m
  left join cobros_t ct on ct.metodo = m.metodo and ct.origen = m.origen
  left join devol_t dv on dv.metodo = m.metodo
  order by 1, 2;
$$;

-- ───────────────────────────── Google Maps: tope por negocio
alter table public.planes add column maps_consultas_mes int not null default 300 check (maps_consultas_mes >= 0);
alter table public.negocios add column maps_consultas_mes int check (maps_consultas_mes >= 0);
comment on column public.planes.maps_consultas_mes is 'Consultas a Google Maps (geocodificar o ruta) al mes que trae el plan.';
comment on column public.negocios.maps_consultas_mes is 'Tope propio de consultas a Google Maps al mes; null = el de su plan. Solo lo cambia la plataforma.';

-- El tope de Maps es de la plataforma, igual que el plan.
create or replace function public.validar_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.zona_horaria;
  new.dominio := nullif(lower(btrim(coalesce(new.dominio, ''))), '');
  new.url_publica := nullif(lower(btrim(coalesce(new.url_publica, ''))), '');
  new.slug := lower(btrim(new.slug));
  if new.slug in ('www', 'app', 'api', 'admin', 'mail', 'static', 'plataforma', 'soporte', 'demo', 'registro', 'ayuda', 'blog', 'precios') then
    raise exception 'La dirección «%» está reservada para PeluDesk.', new.slug;
  end if;
  if tg_op = 'UPDATE'
     and (new.slug is distinct from old.slug or new.dominio is distinct from old.dominio
          or new.url_publica is distinct from old.url_publica or new.activo is distinct from old.activo
          or new.plan is distinct from old.plan or new.prueba_termina_at is distinct from old.prueba_termina_at
          or new.plan_id is distinct from old.plan_id or new.complementos is distinct from old.complementos
          or new.modulos_cortesia is distinct from old.modulos_cortesia or new.web_gratis_at is distinct from old.web_gratis_at
          or new.cobro_exento is distinct from old.cobro_exento
          or new.maps_consultas_mes is distinct from old.maps_consultas_mes)
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'El plan, los módulos, el dominio y el estado de un negocio solo los cambia la plataforma.';
  end if;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'La zona horaria «%» no existe.', new.zona_horaria;
end;
$$;

create table public.maps_consultas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tipo text not null check (tipo in ('geocodificar', 'ruta')),
  -- Mes del negocio (primer día), para contar sin depender de la zona.
  mes date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
comment on table public.maps_consultas is 'Cada consulta real a Google Maps de cada negocio. La llave es de PeluDesk; el tope es por negocio y por mes.';
create index maps_consultas_negocio_mes on public.maps_consultas (negocio_id, mes);
create trigger set_updated_at before insert or update on public.maps_consultas
  for each row execute function public.set_updated_at();
alter table public.maps_consultas enable row level security;
create policy maps_consultas_negocio on public.maps_consultas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy maps_consultas_negocio_definer on public.maps_consultas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy maps_consultas_select_admin on public.maps_consultas for select to authenticated
  using ((select public.is_admin()));
create policy maps_consultas_sin_insert on public.maps_consultas for insert to authenticated with check (false);
create policy maps_consultas_escritura_ins on public.maps_consultas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy maps_consultas_escritura_upd on public.maps_consultas as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy maps_consultas_escritura_del on public.maps_consultas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
revoke all on public.maps_consultas from anon, authenticated;
grant select on public.maps_consultas to authenticated;
grant select, insert on public.maps_consultas to peludesk_definer;

-- El tope del negocio de la petición: el suyo, si no el de su plan, si no
-- (en prueba, sin plan) el del plan Completo, si no 300.
create or replace function public.maps_tope_mes()
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(
    n.maps_consultas_mes,
    (select p.maps_consultas_mes from public.planes p where p.id = n.plan_id),
    (select p.maps_consultas_mes from public.planes p where p.clave = 'completo' and p.deleted_at is null limit 1),
    300)
  from public.negocios n
  where n.id = public.negocio_actual();
$$;
revoke execute on function public.maps_tope_mes() from public, anon;
grant execute on function public.maps_tope_mes() to authenticated, service_role, peludesk_definer;

-- Apartar una consulta antes de llamar a Google. Si ya se llegó al tope,
-- no se aparta y la pantalla pide los kilómetros a mano. Personal del
-- negocio o el servidor (el alta por link no tiene sesión).
create or replace function public.maps_reservar_consulta(p_tipo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_mes date := date_trunc('month', public.fecha_negocio())::date;
  v_tope int;
  v_usadas int;
begin
  if v_neg is null then
    raise exception 'Falta el negocio.';
  end if;
  if not (public.is_staff() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Sin permiso para consultar Google Maps.';
  end if;
  if p_tipo not in ('geocodificar', 'ruta') then
    raise exception 'Tipo de consulta desconocido.';
  end if;
  -- Dos pantallas al mismo tiempo no se pasan del tope.
  perform pg_advisory_xact_lock(hashtext('maps:' || v_neg::text));
  v_tope := public.maps_tope_mes();
  select count(*) into v_usadas from public.maps_consultas
  where negocio_id = v_neg and mes = v_mes and deleted_at is null;
  if v_usadas >= v_tope then
    return jsonb_build_object('permitida', false, 'usadas', v_usadas, 'tope', v_tope);
  end if;
  insert into public.maps_consultas (negocio_id, tipo, mes) values (v_neg, p_tipo, v_mes);
  return jsonb_build_object('permitida', true, 'usadas', v_usadas + 1, 'tope', v_tope);
end;
$$;
alter function public.maps_reservar_consulta(text) owner to peludesk_definer;
revoke execute on function public.maps_reservar_consulta(text) from public, anon;
grant execute on function public.maps_reservar_consulta(text) to authenticated, service_role;

-- Cuánto lleva el negocio este mes (para su admin).
create or replace function public.maps_consumo_mes()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', public.fecha_negocio())::date;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin ve el consumo de Google Maps.';
  end if;
  return jsonb_build_object(
    'usadas', (select count(*) from public.maps_consultas where negocio_id = public.negocio_actual() and mes = v_mes and deleted_at is null),
    'tope', public.maps_tope_mes(),
    'mes', v_mes);
end;
$$;
alter function public.maps_consumo_mes() owner to peludesk_definer;
revoke execute on function public.maps_consumo_mes() from public, anon;
grant execute on function public.maps_consumo_mes() to authenticated;

-- ── Plataforma: consumo de todos y topes ──
create or replace function public.plataforma_maps_consumo(p_mes date)
returns table (negocio_id uuid, nombre text, slug text, plan text, usadas bigint, geocodificar bigint, rutas bigint, tope int, propio boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
  select n.id, n.nombre, n.slug, n.plan,
    count(m.id), count(m.id) filter (where m.tipo = 'geocodificar'), count(m.id) filter (where m.tipo = 'ruta'),
    coalesce(n.maps_consultas_mes,
      (select p.maps_consultas_mes from public.planes p where p.id = n.plan_id),
      (select p.maps_consultas_mes from public.planes p where p.clave = 'completo' and p.deleted_at is null limit 1),
      300),
    n.maps_consultas_mes is not null
  from public.negocios n
  left join public.maps_consultas m on m.negocio_id = n.id and m.mes = date_trunc('month', p_mes)::date and m.deleted_at is null
  where n.deleted_at is null
  group by n.id
  order by count(m.id) desc, n.nombre;
end;
$$;
revoke execute on function public.plataforma_maps_consumo(date) from public, anon;
grant execute on function public.plataforma_maps_consumo(date) to authenticated;

create or replace function public.plataforma_maps_tope_negocio(p_negocio_id uuid, p_tope int, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then
    raise exception 'Escribe el motivo.';
  end if;
  if p_tope is not null and p_tope < 0 then
    raise exception 'El tope no puede ser negativo.';
  end if;
  update public.negocios set maps_consultas_mes = p_tope where id = p_negocio_id and deleted_at is null;
  if not found then
    raise exception 'Ese negocio no existe.';
  end if;
  perform public.plataforma_registrar_evento('maps_tope', p_negocio_id, null, btrim(p_motivo), jsonb_build_object('tope', p_tope));
end;
$$;
revoke execute on function public.plataforma_maps_tope_negocio(uuid, int, text) from public, anon;
grant execute on function public.plataforma_maps_tope_negocio(uuid, int, text) to authenticated;

create or replace function public.plataforma_maps_tope_plan(p_plan_id uuid, p_tope int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if p_tope is null or p_tope < 0 then
    raise exception 'El tope no puede ser negativo.';
  end if;
  update public.planes set maps_consultas_mes = p_tope where id = p_plan_id and deleted_at is null;
  if not found then
    raise exception 'Ese plan no existe.';
  end if;
  perform public.plataforma_registrar_evento('maps_tope_plan', null, null, 'Tope de Google Maps del plan', jsonb_build_object('plan', p_plan_id, 'tope', p_tope));
end;
$$;
revoke execute on function public.plataforma_maps_tope_plan(uuid, int) from public, anon;
grant execute on function public.plataforma_maps_tope_plan(uuid, int) to authenticated;

-- ───────────────────────────── auditoria_frontera: la lista blanca
create or replace function public.auditoria_frontera()
returns table (tipo text, nombre text, detalle text)
language sql
stable
security definer
set search_path = ''
as $$
  with lista_blanca(nombre) as (values
    ('current_rol'), ('es_miembro'), ('mi_cliente_id'), ('rol_en_negocio'), ('tiene_permiso'), ('mis_permisos'),
    ('persona_en_negocio'), ('zona_negocio'), ('negocio_por_host'), ('mis_negocios'), ('is_admin'), ('is_staff'),
    ('mi_empleado_id'), ('puede_ver_empleado'), ('cuentas_para_empleado'), ('email_de_login_por_telefono'),
    ('existe_usuario_por_email'), ('listar_cuentas'), ('listar_cuentas_sin_vincular'), ('listar_cuentas_vinculadas'),
    ('listar_personal'), ('listar_personal_estetica'), ('handle_new_user'), ('negocio_de_archivo_perro'),
    ('es_dueno_de_archivo_perro'), ('proteger_membresia'), ('crear_negocio'), ('agregar_admin_negocio'),
    ('auditoria_frontera'), ('proteger_columnas_sensibles_profile'), ('asignar_rol_staff'),
    ('usuario_por_email'), ('negocio_publico'), ('email_de_persona_por_telefono'),
    ('persona_en_otro_negocio'), ('es_admin_plataforma'), ('agregar_admin_plataforma'),
    ('plataforma_negocios'), ('plataforma_buscar_personas'), ('plataforma_registrar_evento'),
    ('plataforma_actualizar_negocio'), ('membresia_no_plataforma'), ('plataforma_buscar_personas_por_id'), ('negocio_escribible'), ('negocio_escribible_en'),
    ('slug_libre'), ('registrar_negocio_prueba'), ('puede_registrar_prueba'), ('demo_vaciar'), ('plataforma_cambiar_plan'), ('plataforma_guardar_plan'), ('plataforma_asignar_plan'), ('evaluar_web_gratis'),
    ('plataforma_cobros'), ('plataforma_pagos_negocio'),
    -- Vault solo lo alcanza postgres; las tres atan todo a negocio_actual().
    ('integracion_guardar_secreto'), ('integracion_leer_secreto'), ('integracion_borrar_secreto'),
    ('plataforma_maps_consumo'), ('plataforma_maps_tope_negocio'), ('plataforma_maps_tope_plan')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'), ('plataforma_admins'), ('plataforma_eventos'), ('registros_prueba'), ('modulos'), ('planes'),
    ('planes_precios_stripe'), ('eventos_stripe'))
  select 'funcion_definer_postgres', p.proname::text, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proname not in (select nombre from lista_blanca)
  union all
  select 'tabla_sin_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in (select nombre from compartidas)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
  union all
  select 'tabla_sin_politica_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    and c.relname not in (select nombre from compartidas)
    and (
      not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                  and pp.permissive = 'RESTRICTIVE' and pp.qual like '%negocio_actual()%' and pp.qual like '%es_miembro()%')
      or not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                     and 'peludesk_definer' = any(pp.roles) and pp.qual like '%negocio_actual()%')
      or not c.relrowsecurity
    )
  union all
  select 'vista_sin_security_invoker', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
  union all
  select 'politica_storage_sin_negocio', pp.policyname::text, coalesce(pp.qual, pp.with_check)
  from pg_policies pp
  where pp.schemaname = 'storage' and pp.tablename = 'objects'
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))'
  union all
  select 'llamada_a_funcion_inexistente', r.proname::text, r.ref
  from (
    select distinct p.proname, (regexp_matches(pg_get_functiondef(p.oid), 'public[.]([a-z_0-9]+)[ ]*[(]', 'g'))[1] as ref
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  ) r
  where not exists (select 1 from pg_proc p2 where p2.proname = r.ref)
    and not exists (select 1 from pg_class c where c.relname = r.ref and c.relnamespace = 'public'::regnamespace);
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;
