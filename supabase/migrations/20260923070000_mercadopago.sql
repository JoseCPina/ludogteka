-- Mercado Pago (23 de septiembre de 2026): terminal Point integrada por
-- la API de Orders y links de pago (Checkout Pro), los dos alimentando
-- el MISMO ledger de cobros que el mostrador.
--
-- Una "orden" aquí es un intento de cobrar una cuenta por Mercado Pago:
-- con la terminal (recepción manda el monto y el cliente paga ahí) o con
-- un link (se le manda por WhatsApp y paga cuando quiera). Cuando
-- Mercado Pago confirma el pago, la app registra el cobro sola, con el
-- método que le toca ('terminal' para Point, 'transferencia' para link:
-- el dinero cae en la cuenta de Mercado Pago, no en el lote de la
-- terminal) y con origen mercadopago_*, para que el corte distinga lo
-- que pasó por la app de lo que se capturó a mano.
--
-- Idempotencia: el pago de Mercado Pago (mp_payment_id) es único, y la
-- orden solo puede tener UN cobro. registrar_pago_mercadopago se puede
-- llamar las veces que sea (webhook repetido, webhook + consulta desde la
-- pantalla, notificación tardía) y registra una sola vez.
create table public.mp_ordenes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('point', 'link')),
  reserva_id uuid not null references public.reservas(id),
  monto numeric(10, 2) not null check (monto > 0),
  descripcion text,
  estado text not null default 'creada'
    check (estado in ('creada', 'en_terminal', 'pagada', 'cancelada', 'expirada', 'fallida', 'reembolsada')),
  -- Identificadores del lado de Mercado Pago. external_reference es
  -- nuestro id: es lo que viene de vuelta en cada notificación.
  mp_order_id text unique,
  mp_preference_id text unique,
  mp_payment_id text unique,
  terminal_id text,
  url_pago text,
  -- Lo que Mercado Pago dijo del pago cuando se confirmó.
  installments int,
  mp_payment_type text,
  metodo_registrado text check (metodo_registrado in ('efectivo', 'terminal', 'transferencia')),
  cobro_id uuid unique references public.cobros(id),
  -- Sin llave de Mercado Pago la app corre en simulación: la orden se
  -- crea, "se paga" sola y NO mueve dinero real. Queda marcado para que
  -- nadie lo confunda con un pago de verdad.
  simulado boolean not null default false,
  expira_at timestamptz,
  pagada_at timestamptz,
  notificado_at timestamptz,
  ultimo_evento jsonb,
  detalle_error text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

comment on table public.mp_ordenes is
  'Intentos de cobro por Mercado Pago (terminal Point u link de pago) sobre una cuenta. El cobro real se registra en cobros cuando Mercado Pago confirma; cobro_id dice cuál.';

create trigger set_updated_at before insert or update on public.mp_ordenes
  for each row execute function public.set_updated_at();

create index mp_ordenes_reserva_id_idx on public.mp_ordenes (reserva_id);
create index mp_ordenes_estado_idx on public.mp_ordenes (estado) where deleted_at is null;

alter table public.mp_ordenes enable row level security;

-- Staff lee; el dueño ve las órdenes de su cuenta (para saber que su
-- link se pagó). Nadie escribe por REST: las órdenes se crean y cambian
-- desde el servidor de la app (secret key) después de hablar con Mercado
-- Pago, y el cobro se registra por la RPC de abajo.
create policy mp_ordenes_select_staff on public.mp_ordenes
  for select to authenticated
  using (public.is_staff());

create policy mp_ordenes_select_propio on public.mp_ordenes
  for select to authenticated
  using (
    reserva_id in (
      select r.id from public.reservas r
      where r.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Registrar el cobro cuando Mercado Pago confirmó el pago. Solo la
-- llama el servidor de la app con la secret key (desde el webhook o
-- desde la consulta que hace la pantalla mientras espera): por eso exige
-- el rol service_role del JWT y no current_rol(), que para la secret key
-- es 'anonimo'.
--
-- Si no hay turno abierto (un link pagado de noche), la orden queda
-- 'pagada' sin cobro_id: se registra sola en cuanto alguien abra turno
-- (trigger de abajo) y la caja lo muestra como pendiente mientras tanto.
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
    raise exception 'Solo el servidor de la aplicación puede registrar un pago de Mercado Pago.';
  end if;

  select * into v_orden from public.mp_ordenes where id = p_orden_id and deleted_at is null for update;
  if not found then
    raise exception 'Orden de Mercado Pago no encontrada.';
  end if;

  -- Ya registrada: mismo resultado, sin duplicar (webhook repetido).
  if v_orden.cobro_id is not null then
    return jsonb_build_object('registrado', true, 'repetido', true, 'cobro_id', v_orden.cobro_id, 'estado', v_orden.estado);
  end if;

  -- El mismo pago de Mercado Pago apuntando a otra orden nuestra sería un
  -- error de integración, no un caso de negocio: se detiene.
  if p_mp_payment_id is not null then
    select id into v_otra from public.mp_ordenes
    where mp_payment_id = p_mp_payment_id and id <> p_orden_id;
    if v_otra is not null then
      raise exception 'El pago % de Mercado Pago ya está registrado en otra orden (%).', p_mp_payment_id, v_otra;
    end if;
  end if;

  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto confirmado por Mercado Pago no es válido.';
  end if;

  v_metodo := case v_orden.tipo when 'point' then 'terminal' else 'transferencia' end;
  v_origen := case v_orden.tipo when 'point' then 'mercadopago_point' else 'mercadopago_link' end;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;

  if v_turno_id is not null then
    insert into public.cobros (reserva_id, turno_id, notas, origen, created_by)
    values (
      v_orden.reserva_id,
      v_turno_id,
      case v_orden.tipo when 'point' then 'Terminal Mercado Pago' else 'Link de pago Mercado Pago' end
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

revoke execute on function public.registrar_pago_mercadopago(uuid, text, numeric, int, text, jsonb) from public;
revoke execute on function public.registrar_pago_mercadopago(uuid, text, numeric, int, text, jsonb) from anon;
revoke execute on function public.registrar_pago_mercadopago(uuid, text, numeric, int, text, jsonb) from authenticated;
grant execute on function public.registrar_pago_mercadopago(uuid, text, numeric, int, text, jsonb) to service_role;

-- Pagos confirmados sin turno abierto: se registran en el turno nuevo en
-- cuanto se abre. Corre con los permisos de la función (SECURITY
-- DEFINER) porque quien abre el turno es recepción, que no tiene INSERT
-- en cobros; la puerta la abre el hecho de que la orden ya está pagada.
create or replace function public.registrar_pagos_mp_pendientes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_orden record;
  v_cobro_id uuid;
begin
  for v_orden in
    select * from public.mp_ordenes
    where estado = 'pagada' and cobro_id is null and deleted_at is null
    order by pagada_at
  loop
    insert into public.cobros (reserva_id, turno_id, notas, origen, created_by)
    values (
      v_orden.reserva_id,
      new.id,
      case v_orden.tipo when 'point' then 'Terminal Mercado Pago' else 'Link de pago Mercado Pago' end
        || case when v_orden.simulado then ' (SIMULADO)' else '' end
        || ' · pagado ' || to_char(v_orden.pagada_at at time zone 'America/Mexico_City', 'DD/MM HH24:MI')
        || ' sin turno abierto',
      case v_orden.tipo when 'point' then 'mercadopago_point' else 'mercadopago_link' end,
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

drop trigger if exists registrar_pagos_mp_pendientes on public.turnos_caja;
create trigger registrar_pagos_mp_pendientes
after insert on public.turnos_caja
for each row execute function public.registrar_pagos_mp_pendientes();

-- Lo que la caja necesita saber de las órdenes: las de una cuenta y las
-- pagadas sin registrar. Vista con security invoker: el RLS de la tabla
-- decide quién ve qué.
create view public.mp_ordenes_estado
with (security_invoker = true)
as
select
  o.id,
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
  (o.estado = 'pagada' and o.cobro_id is null) as pendiente_de_registrar
from public.mp_ordenes o
join public.reservas r on r.id = o.reserva_id
join public.clientes cl on cl.id = r.cliente_id
where o.deleted_at is null;
