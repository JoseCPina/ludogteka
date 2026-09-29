-- Devoluciones integradas con el proveedor de cobro (29 de septiembre de 2026).
--
-- Un cobro que entró por la terminal o por un link (mercadopago_point,
-- mercadopago_link) se devuelve DESDE LA APP: el servidor le pide el
-- reembolso a Mercado Pago con la cuenta del negocio y, solo si Mercado Pago
-- lo acepta, la devolución queda en la caja en el mismo paso. Si Mercado
-- Pago lo rechaza, en la caja no queda nada.
--
-- Pieza central: reembolsos_cobro, un renglón por reembolso del proveedor.
--   - origen 'app': lo pidió un admin desde la cuenta (preparar_reembolso,
--     con su sesión: la base decide si puede y cuánto). Nace 'solicitado'
--     ANTES de llamar al proveedor (su id es la llave de idempotencia): si
--     la llamada se corta, se sabe que quedó en el aire.
--   - origen 'proveedor': se hizo en el panel de Mercado Pago y llegó por el
--     webhook. Se registra igual en la caja y sale en «Necesita atención»
--     hasta que alguien lo marca como visto.
-- registrar_reembolso_proveedor (solo service_role) es el único que lo da
-- por hecho: registra la devolución en el turno abierto con el método y el
-- origen del cobro, suma lo reembolsado en la orden (que sigue 'pagada':
-- se pagó y además se reembolsó) y, si el proveedor regresa la comisión,
-- cancela el gasto de la comisión (reembolso total) o le hace un ajuste
-- proporcional (parcial). Sin turno abierto, la devolución se registra al
-- abrir el siguiente (igual que un pago que llegó sin turno).
--
-- Clip: su API de Punto de Venta no documenta reembolsos; la devolución se
-- hace en Clip y aquí se registra a mano (la pantalla lo dice).

-- ───────────────────────────── devoluciones: de qué origen
alter table public.devoluciones
  add column origen text not null default 'manual'
    check (origen in ('manual', 'mercadopago_point', 'mercadopago_link', 'clip_terminal'));
comment on column public.devoluciones.origen is
  'Por dónde salió el dinero: manual (efectivo, transferencia o terminal no integrada), o reembolsado por el proveedor.';

-- ───────────────────────────── mp_ordenes: lo reembolsado
alter table public.mp_ordenes
  add column monto_reembolsado numeric(12,2) not null default 0 check (monto_reembolsado >= 0),
  add column reembolsada_at timestamptz,
  -- Terminal de Mercado Pago: el id numérico del pago en /v1/payments (el
  -- que trae los reembolsos hechos desde el panel). En la API de Orders el
  -- pago es "PAY01…" y este id viene en reference_id.
  add column mp_payment_ref text;
comment on column public.mp_ordenes.monto_reembolsado is
  'Cuánto se ha reembolsado de esta orden con el proveedor. La orden sigue pagada: se pagó y después se reembolsó (total o parcial).';
create index mp_ordenes_payment_ref_idx on public.mp_ordenes (mp_payment_ref) where mp_payment_ref is not null;

-- ───────────────────────────── reembolsos_cobro
create table public.reembolsos_cobro (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  orden_id uuid not null references public.mp_ordenes(id),
  cobro_id uuid references public.cobros(id),
  proveedor text not null check (proveedor in ('mercadopago', 'clip')),
  origen text not null check (origen in ('app', 'proveedor')),
  estado text not null default 'solicitado' check (estado in ('solicitado', 'hecho', 'rechazado')),
  monto numeric(12,2) not null check (monto > 0),
  motivo text not null check (btrim(motivo) <> ''),
  -- El id del reembolso en el proveedor (único por negocio).
  id_remoto text,
  devolucion_id uuid references public.devoluciones(id),
  comision_devuelta numeric(12,2) not null default 0,
  gasto_ajuste_id uuid references public.gastos(id),
  simulado boolean not null default false,
  solicitado_por uuid references auth.users(id) on delete set null,
  hecho_at timestamptz,
  detalle_error text,
  -- Los que llegan del panel del proveedor se revisan (Necesita atención).
  revisado_at timestamptz,
  revisado_por uuid references auth.users(id) on delete set null,
  ultimo_evento jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
comment on table public.reembolsos_cobro is
  'Reembolsos hechos con el proveedor de cobro (Mercado Pago) a un cobro integrado: pedidos desde la app o hechos en el panel del proveedor. Solo el servidor los da por hechos.';
create unique index reembolsos_cobro_remoto on public.reembolsos_cobro (negocio_id, orden_id, id_remoto) where id_remoto is not null;
create unique index reembolsos_cobro_devolucion on public.reembolsos_cobro (devolucion_id) where devolucion_id is not null;
create index reembolsos_cobro_negocio_idx on public.reembolsos_cobro (negocio_id);
create index reembolsos_cobro_orden_idx on public.reembolsos_cobro (orden_id);
create index reembolsos_cobro_atencion_idx on public.reembolsos_cobro (negocio_id)
  where deleted_at is null and (estado = 'solicitado' or (estado = 'hecho' and (devolucion_id is null or (origen = 'proveedor' and revisado_at is null))));
create trigger set_updated_at before insert or update on public.reembolsos_cobro
  for each row execute function public.set_updated_at();
alter table public.reembolsos_cobro enable row level security;
create policy reembolsos_cobro_negocio on public.reembolsos_cobro as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy reembolsos_cobro_negocio_definer on public.reembolsos_cobro for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
-- Dinero: solo el personal lo lee (el cliente nunca). Nadie escribe con su
-- sesión: pedir va por preparar_reembolso y darlo por hecho, por el servidor.
create policy reembolsos_cobro_select_staff on public.reembolsos_cobro for select to authenticated
  using ((select public.is_staff()));
create policy reembolsos_cobro_sin_insert on public.reembolsos_cobro for insert to authenticated with check (false);
create policy reembolsos_cobro_sin_update on public.reembolsos_cobro for update to authenticated using (false);
create policy reembolsos_cobro_escritura_ins on public.reembolsos_cobro as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy reembolsos_cobro_escritura_upd on public.reembolsos_cobro as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy reembolsos_cobro_escritura_del on public.reembolsos_cobro as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
revoke all on public.reembolsos_cobro from anon, authenticated;
grant select on public.reembolsos_cobro to authenticated;
grant select, insert, update on public.reembolsos_cobro to peludesk_definer;

-- La vista de órdenes de la cuenta trae lo reembolsado.
create or replace view public.mp_ordenes_estado with (security_invoker = true) as
 select o.id,
    o.tipo,
    o.reserva_id,
    r.cliente_id,
    cl.nombre as cliente_nombre,
    cl.telefono as cliente_telefono,
    o.monto,
    o.descripcion,
    o.estado,
    o.mp_order_id,
    o.mp_payment_id,
    o.url_pago,
    o.installments,
    o.mp_payment_type,
    o.metodo_registrado,
    o.cobro_id,
    o.simulado,
    o.expira_at,
    o.pagada_at,
    o.detalle_error,
    o.created_at,
    ((o.estado = 'pagada'::text) and (o.cobro_id is null)) as pendiente_de_registrar,
    o.monto_reembolsado,
    o.reembolsada_at,
    o.proveedor
   from public.mp_ordenes o
     join public.reservas r on r.id = o.reserva_id
     join public.clientes cl on cl.id = r.cliente_id
  where o.deleted_at is null;

-- ───────────────────────────── cuánto se puede devolver de un cobro
-- Cobrado − devuelto − reembolsos pedidos que siguen en el aire.
create or replace function public.cobro_disponible_para_devolver(p_cobro_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce((select sum(cm.monto) from public.cobro_metodos cm where cm.cobro_id = p_cobro_id), 0)
    - coalesce((
        select sum(dm.monto) from public.devolucion_metodos dm
        join public.devoluciones d on d.id = dm.devolucion_id
        where d.cobro_id = p_cobro_id and d.deleted_at is null
      ), 0)
    - coalesce((
        select sum(rc.monto) from public.reembolsos_cobro rc
        where rc.cobro_id = p_cobro_id and rc.deleted_at is null
          and (rc.estado = 'solicitado' or (rc.estado = 'hecho' and rc.devolucion_id is null))
      ), 0);
$$;
revoke execute on function public.cobro_disponible_para_devolver(uuid) from public, anon;
grant execute on function public.cobro_disponible_para_devolver(uuid) to authenticated, service_role, peludesk_definer;

-- La devolución a mano ya no puede pasar por encima de un reembolso en el
-- aire, ni devolver a mano un cobro de Mercado Pago (ese va por el
-- proveedor). Clip sí se registra a mano: la devolución se hace en Clip.
create or replace function public.registrar_devolucion(p_cobro_id uuid, p_motivo text, p_metodos jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id uuid;
  v_devolucion_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_nombre_metodo text;
  v_origen text;
  v_total_nuevo numeric;
  v_disponible numeric;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede registrar una devolución.';
  end if;

  select coalesce(origen, 'manual') into v_origen from public.cobros where id = p_cobro_id and deleted_at is null;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  if v_origen in ('mercadopago_point', 'mercadopago_link') then
    raise exception 'Este cobro entró por Mercado Pago: devuélvelo con «Devolver con Mercado Pago», que hace el reembolso y lo registra en caja.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la devolución.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método a devolver.';
  end if;

  v_total_nuevo := (
    select coalesce(sum((m ->> 'monto')::numeric), 0)
    from jsonb_array_elements(p_metodos) m
  );
  v_disponible := public.cobro_disponible_para_devolver(p_cobro_id);
  if v_total_nuevo > v_disponible then
    raise exception 'No se puede devolver más de lo que sigue cobrado en este cobro (queda por devolver: %).', v_disponible;
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de registrar la devolución.';
  end if;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
  values (p_cobro_id, v_turno_id, btrim(p_motivo), auth.uid(), auth.uid(), 'manual')
  returning id into v_devolucion_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;

    if v_nombre_metodo is null or v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;

    insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
    values (v_devolucion_id, v_nombre_metodo, v_monto, auth.uid());
  end loop;

  return v_devolucion_id;
end;
$$;
alter function public.registrar_devolucion(uuid, text, jsonb) owner to peludesk_definer;

-- ───────────────────────────── pedir un reembolso (admin, con su sesión)
-- Deja el renglón 'solicitado' y le dice al servidor qué pedirle al
-- proveedor. El servidor NO decide si se puede: lo decide esto.
create or replace function public.preparar_reembolso(p_cobro_id uuid, p_monto numeric, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobro record;
  v_orden public.mp_ordenes%rowtype;
  v_disponible numeric;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede registrar una devolución.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la devolución.';
  end if;
  if p_monto is null or p_monto <= 0 or round(p_monto, 2) <> p_monto then
    raise exception 'El monto a devolver tiene que ser mayor a cero (con centavos, a lo más dos decimales).';
  end if;

  select c.id, coalesce(c.origen, 'manual') as origen into v_cobro
  from public.cobros c where c.id = p_cobro_id and c.deleted_at is null;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  if v_cobro.origen not in ('mercadopago_point', 'mercadopago_link') then
    raise exception 'Este cobro no entró por Mercado Pago: regístralo como devolución a mano.';
  end if;

  select * into v_orden from public.mp_ordenes
  where cobro_id = p_cobro_id and deleted_at is null for update;
  if not found then
    raise exception 'No encontramos la orden de Mercado Pago de este cobro.';
  end if;
  if v_orden.simulado and not public.negocio_puede_simular() then
    raise exception 'Un cobro simulado no se reembolsa en un negocio real.';
  end if;

  if exists (select 1 from public.reembolsos_cobro where orden_id = v_orden.id and estado = 'solicitado' and deleted_at is null) then
    raise exception 'Ya hay un reembolso de este cobro esperando respuesta de Mercado Pago. Consúltalo en Caja → Reembolsos antes de pedir otro.';
  end if;

  if not exists (select 1 from public.turnos_caja where estado = 'abierto') then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de registrar la devolución.';
  end if;

  v_disponible := least(public.cobro_disponible_para_devolver(p_cobro_id), v_orden.monto - v_orden.monto_reembolsado);
  if p_monto > v_disponible then
    raise exception 'No se puede devolver más de lo que sigue cobrado en este cobro (queda por devolver: %).', v_disponible;
  end if;

  insert into public.reembolsos_cobro (orden_id, cobro_id, proveedor, origen, estado, monto, motivo, simulado, solicitado_por)
  values (v_orden.id, p_cobro_id, v_orden.proveedor, 'app', 'solicitado', p_monto, btrim(p_motivo), v_orden.simulado, auth.uid())
  returning id into v_id;

  return jsonb_build_object(
    'reembolso_id', v_id,
    'orden_id', v_orden.id,
    'proveedor', v_orden.proveedor,
    'tipo', v_orden.tipo,
    'total', p_monto >= v_orden.monto - v_orden.monto_reembolsado
  );
end;
$$;
alter function public.preparar_reembolso(uuid, numeric, text) owner to peludesk_definer;
revoke execute on function public.preparar_reembolso(uuid, numeric, text) from public, anon;
grant execute on function public.preparar_reembolso(uuid, numeric, text) to authenticated;

-- El proveedor rechazó el reembolso (o no se pudo pedir): en la caja no
-- queda nada. Solo el servidor.
create or replace function public.rechazar_reembolso(p_reembolso_id uuid, p_detalle text, p_evento jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor de la aplicación registra la respuesta del proveedor.';
  end if;
  update public.reembolsos_cobro
  set estado = 'rechazado', detalle_error = nullif(btrim(coalesce(p_detalle, '')), ''), ultimo_evento = coalesce(p_evento, ultimo_evento)
  where id = p_reembolso_id and estado = 'solicitado' and deleted_at is null;
end;
$$;
alter function public.rechazar_reembolso(uuid, text, jsonb) owner to peludesk_definer;
revoke execute on function public.rechazar_reembolso(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.rechazar_reembolso(uuid, text, jsonb) to service_role;

-- La devolución en caja de un reembolso ya hecho (interna: la llaman
-- registrar_reembolso_proveedor y el trigger de apertura de turno).
create or replace function public.devolucion_de_reembolso(p_reembolso_id uuid, p_turno_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.reembolsos_cobro%rowtype;
  v_cobro_id uuid;
  v_origen text;
  v_metodo text;
  v_dev uuid;
begin
  select * into v from public.reembolsos_cobro where id = p_reembolso_id and deleted_at is null for update;
  if not found or v.estado <> 'hecho' or v.devolucion_id is not null then
    return v.devolucion_id;
  end if;
  v_cobro_id := coalesce(v.cobro_id, (select cobro_id from public.mp_ordenes where id = v.orden_id));
  if v_cobro_id is null or p_turno_id is null then
    return null;
  end if;
  select coalesce(c.origen, 'manual'), (select cm.metodo from public.cobro_metodos cm where cm.cobro_id = c.id order by cm.monto desc limit 1)
    into v_origen, v_metodo
  from public.cobros c where c.id = v_cobro_id;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
  values (
    v_cobro_id, p_turno_id,
    case when v.origen = 'proveedor'
      then 'Reembolso hecho en el panel de Mercado Pago' || coalesce(' (' || v.id_remoto || ')', '')
      else v.motivo || coalesce(' · reembolso ' || v.id_remoto, '') end
      || case when v.simulado then ' (SIMULADO)' else '' end,
    v.solicitado_por, v.solicitado_por, v_origen
  )
  returning id into v_dev;
  insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
  values (v_dev, coalesce(v_metodo, 'terminal'), v.monto, v.solicitado_por);
  update public.reembolsos_cobro set devolucion_id = v_dev, cobro_id = v_cobro_id where id = v.id;
  return v_dev;
end;
$$;
alter function public.devolucion_de_reembolso(uuid, uuid) owner to peludesk_definer;
revoke execute on function public.devolucion_de_reembolso(uuid, uuid) from public, anon, authenticated;

-- ───────────────────────────── el proveedor hizo el reembolso
-- Idempotente por (orden, id del reembolso en el proveedor). Con
-- p_reembolso_id, es la respuesta a uno pedido desde la app; sin él, uno
-- hecho en el panel del proveedor (o uno pedido desde la app cuya respuesta
-- se perdió: si hay uno 'solicitado' del mismo monto, se toma ese).
create or replace function public.registrar_reembolso_proveedor(
  p_orden_id uuid,
  p_id_remoto text,
  p_monto numeric,
  p_reembolso_id uuid,
  p_regresa_comision boolean,
  p_evento jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden public.mp_ordenes%rowtype;
  v_r public.reembolsos_cobro%rowtype;
  v_turno uuid;
  v_dev uuid;
  v_gasto public.gastos%rowtype;
  v_comision numeric;
  v_devuelta numeric := 0;
  v_ajuste uuid;
  v_total boolean;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor de la aplicación registra un reembolso del proveedor.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto reembolsado no es válido.';
  end if;

  select * into v_orden from public.mp_ordenes where id = p_orden_id and deleted_at is null for update;
  if not found then
    raise exception 'Orden de cobro no encontrada.';
  end if;
  if v_orden.estado <> 'pagada' then
    raise exception 'Esa orden no está pagada: no hay nada que reembolsar.';
  end if;
  if v_orden.simulado and not public.negocio_puede_simular() then
    raise exception 'Un cobro simulado no se reembolsa en un negocio real.';
  end if;

  -- ¿Ya lo conocíamos?
  if p_id_remoto is not null then
    select * into v_r from public.reembolsos_cobro
    where orden_id = p_orden_id and id_remoto = p_id_remoto and deleted_at is null;
    if found and v_r.estado = 'hecho' then
      return jsonb_build_object('registrado', v_r.devolucion_id is not null, 'repetido', true, 'reembolso_id', v_r.id, 'devolucion_id', v_r.devolucion_id);
    end if;
  end if;
  if v_r.id is null and p_reembolso_id is not null then
    select * into v_r from public.reembolsos_cobro where id = p_reembolso_id and orden_id = p_orden_id and deleted_at is null for update;
    if not found then
      raise exception 'Reembolso no encontrado.';
    end if;
    if v_r.estado = 'hecho' then
      return jsonb_build_object('registrado', v_r.devolucion_id is not null, 'repetido', true, 'reembolso_id', v_r.id, 'devolucion_id', v_r.devolucion_id);
    end if;
  end if;
  if v_r.id is null then
    select * into v_r from public.reembolsos_cobro
    where orden_id = p_orden_id and estado = 'solicitado' and monto = p_monto and deleted_at is null
    order by created_at limit 1 for update;
  end if;

  if round(p_monto, 2) > v_orden.monto - v_orden.monto_reembolsado then
    raise exception 'El proveedor reporta un reembolso mayor a lo que queda de la orden.';
  end if;

  if v_r.id is null then
    insert into public.reembolsos_cobro (orden_id, cobro_id, proveedor, origen, estado, monto, motivo, id_remoto, simulado, hecho_at, ultimo_evento)
    values (p_orden_id, v_orden.cobro_id, v_orden.proveedor, 'proveedor', 'hecho', round(p_monto, 2),
      'Reembolso hecho en el panel de ' || case v_orden.proveedor when 'clip' then 'Clip' else 'Mercado Pago' end,
      p_id_remoto, v_orden.simulado, now(), p_evento)
    returning * into v_r;
  else
    update public.reembolsos_cobro
    set estado = 'hecho', id_remoto = coalesce(p_id_remoto, id_remoto), monto = round(p_monto, 2),
        hecho_at = now(), detalle_error = null, ultimo_evento = coalesce(p_evento, ultimo_evento)
    where id = v_r.id
    returning * into v_r;
  end if;

  update public.mp_ordenes
  set monto_reembolsado = monto_reembolsado + v_r.monto,
      reembolsada_at = now(),
      notificado_at = now()
  where id = p_orden_id
  returning * into v_orden;
  v_total := v_orden.monto_reembolsado >= v_orden.monto;

  -- La comisión: si el proveedor la regresa, deja de ser gasto del negocio.
  if coalesce(p_regresa_comision, false) then
    select * into v_gasto from public.gastos
    where mp_orden_id = p_orden_id and tipo = 'gasto' and estado = 'pagado' and deleted_at is null for update;
    if found then
      select v_gasto.monto + coalesce(sum(g.monto), 0) into v_comision
      from public.gastos g where g.ajuste_de = v_gasto.id and g.estado = 'pagado' and g.deleted_at is null;
      if v_total then
        v_devuelta := v_comision;
        update public.gastos
        set estado = 'cancelado',
            motivo_cancelacion = 'Mercado Pago regresó la comisión: el cobro se reembolsó completo.',
            cancelado_por = v_r.solicitado_por, cancelado_at = now()
        where id = v_gasto.id or (ajuste_de = v_gasto.id and estado <> 'cancelado');
      else
        v_devuelta := least(v_comision, round(v_gasto.monto * v_r.monto / v_orden.monto, 2));
        if v_devuelta > 0 then
          insert into public.gastos (tipo, ajuste_de, estado, concepto, categoria_id, proveedor_id, monto, fecha_pago, metodo, periodo_desde, periodo_hasta, notas)
          values ('ajuste', v_gasto.id, 'pagado', 'Corrección: ' || v_gasto.concepto, v_gasto.categoria_id, v_gasto.proveedor_id,
            -v_devuelta, public.fecha_negocio(), v_gasto.metodo, v_gasto.periodo_desde, v_gasto.periodo_hasta,
            'Mercado Pago regresó la parte de la comisión del reembolso parcial de $' || to_char(v_r.monto, 'FM999999990.00') || '.')
          returning id into v_ajuste;
        end if;
      end if;
      update public.reembolsos_cobro set comision_devuelta = v_devuelta, gasto_ajuste_id = v_ajuste where id = v_r.id;
    end if;
  end if;

  select id into v_turno from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno is not null then
    v_dev := public.devolucion_de_reembolso(v_r.id, v_turno);
  end if;

  return jsonb_build_object(
    'registrado', v_dev is not null,
    'repetido', false,
    'reembolso_id', v_r.id,
    'devolucion_id', v_dev,
    'sin_turno', v_dev is null,
    'total', v_total,
    'comision_devuelta', v_devuelta
  );
end;
$$;
alter function public.registrar_reembolso_proveedor(uuid, text, numeric, uuid, boolean, jsonb) owner to peludesk_definer;
revoke execute on function public.registrar_reembolso_proveedor(uuid, text, numeric, uuid, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.registrar_reembolso_proveedor(uuid, text, numeric, uuid, boolean, jsonb) to service_role;

-- Al abrir turno, los reembolsos hechos sin turno entran a la caja (después
-- de los pagos pendientes: los triggers corren por orden alfabético).
create or replace function public.registrar_reembolsos_pendientes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
begin
  for v in
    select rc.id from public.reembolsos_cobro rc
    where rc.estado = 'hecho' and rc.devolucion_id is null and rc.deleted_at is null
      and (not rc.simulado or public.negocio_puede_simular())
    order by rc.hecho_at
  loop
    perform public.devolucion_de_reembolso(v, new.id);
  end loop;
  return new;
end;
$$;
alter function public.registrar_reembolsos_pendientes() owner to peludesk_definer;
create trigger registrar_reembolsos_pendientes after insert on public.turnos_caja
  for each row execute function public.registrar_reembolsos_pendientes();

-- ───────────────────────────── Necesita atención
-- Reembolsos que alguien tiene que ver: hechos en el panel del proveedor
-- (sin revisar), hechos pero sin registrar en caja (no había turno) y
-- pedidos cuya respuesta no llegó.
create or replace function public.reembolsos_por_atender()
returns table(id uuid, orden_id uuid, reserva_id uuid, cliente_nombre text, monto numeric, motivo text, estado text,
  origen text, registrado boolean, desde timestamptz, id_remoto text, detalle_error text)
language sql
stable
set search_path = ''
as $$
  select rc.id, rc.orden_id, o.reserva_id, cl.nombre, rc.monto, rc.motivo, rc.estado, rc.origen,
    rc.devolucion_id is not null, coalesce(rc.hecho_at, rc.created_at), rc.id_remoto, rc.detalle_error
  from public.reembolsos_cobro rc
  join public.mp_ordenes o on o.id = rc.orden_id
  join public.reservas r on r.id = o.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  where (select public.is_staff()) and public.current_rol() in ('admin', 'recepcion')
    and rc.deleted_at is null
    and (rc.estado = 'solicitado'
      or (rc.estado = 'hecho' and (rc.devolucion_id is null or (rc.origen = 'proveedor' and rc.revisado_at is null))))
  order by coalesce(rc.hecho_at, rc.created_at);
$$;
revoke execute on function public.reembolsos_por_atender() from public, anon;
grant execute on function public.reembolsos_por_atender() to authenticated;

create or replace function public.marcar_reembolso_revisado(p_reembolso_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción.';
  end if;
  update public.reembolsos_cobro
  set revisado_at = now(), revisado_por = auth.uid()
  where id = p_reembolso_id and estado = 'hecho' and origen = 'proveedor' and deleted_at is null;
  if not found then
    raise exception 'Reembolso no encontrado.';
  end if;
end;
$$;
alter function public.marcar_reembolso_revisado(uuid) owner to peludesk_definer;
revoke execute on function public.marcar_reembolso_revisado(uuid) from public, anon;
grant execute on function public.marcar_reembolso_revisado(uuid) to authenticated;

-- ───────────────────────────── el corte por origen
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
    select dm.metodo, d.origen, sum(dm.monto) as devuelto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    where d.turno_id = p_turno_id
    group by dm.metodo, d.origen
  )
  select
    m.metodo,
    m.origen,
    coalesce(ct.cobrado, 0),
    coalesce(ct.propinas, 0),
    coalesce(dv.devuelto, 0)
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
  left join devol_t dv on dv.metodo = m.metodo and dv.origen = m.origen
  order by 1, 2;
$$;

create or replace function public.movimientos_turno(p_turno_id uuid)
returns table(id uuid, tipo text, fecha timestamptz, reserva_id uuid, cliente_nombre text, descripcion text, metodo text, monto numeric, propina numeric, origen text, hecho_por uuid)
language sql
stable
set search_path = ''
as $$
  select
    cm.id,
    case when exists (select 1 from public.bonos_clientes bc where bc.reserva_id = c.reserva_id) then 'venta_bono' else 'cobro' end,
    c.created_at,
    c.reserva_id,
    cl.nombre,
    coalesce(c.notas, ''),
    cm.metodo,
    cm.monto,
    cm.propina,
    coalesce(c.origen, 'manual'),
    c.created_by
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
    d.autorizado_por
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
    mc.created_by
  from public.movimientos_caja mc
  where mc.turno_id = p_turno_id and mc.deleted_at is null

  order by 3 desc;
$$;
