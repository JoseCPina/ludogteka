-- Caja como mostrador de cobro (23 de septiembre de 2026).
--
-- Hasta hoy Caja solo tenía turno, retiros y arqueo; el cobro vivía
-- escondido dentro de cada reserva. Esta migración pone en la base lo que
-- el mostrador necesita y que no existía:
--
--   1. Un cargo SUELTO, sin estancia de por medio (un collar, un baño de
--      última hora sin cita, comida especial que se llevan): cuelga
--      directo de una reserva (la "cuenta") y se cobra igual que todo.
--   2. Las cuentas abiertas: qué reservas tienen saldo pendiente y de
--      quién son, para cobrarle de un clic al que está enfrente.
--   3. Los movimientos del turno en curso, con el acumulado por método:
--      cobros, devoluciones, ventas de bono y retiros, en una sola lista.

-- ── 1. Cargo suelto ──────────────────────────────────────────────────
-- cargos_aplicados nació colgando de una estancia (era el único caso).
-- Ahora puede colgar de la reserva directamente; reserva_id se llena
-- siempre (de la estancia cuando la hay), así la cuenta se arma con una
-- sola condición y no con "estancia o reserva" en cada consulta.
alter table public.cargos_aplicados
  alter column estancia_id drop not null,
  add column if not exists reserva_id uuid references public.reservas(id),
  add column if not exists perro_id uuid references public.perros(id);

alter table public.cargos_aplicados
  drop constraint if exists cargos_aplicados_cuelga_de_algo;
alter table public.cargos_aplicados
  add constraint cargos_aplicados_cuelga_de_algo
  check (estancia_id is not null or reserva_id is not null);

comment on column public.cargos_aplicados.reserva_id is
  'La cuenta a la que pertenece el cargo. Se copia de la estancia cuando la hay; un cargo suelto (sin estancia) la trae directo.';
comment on column public.cargos_aplicados.perro_id is
  'Solo informativo en un cargo suelto (de qué perro es, si aplica). En un cargo de estancia el perro es el de la estancia.';

-- Filas viejas: reserva_id desde su estancia.
update public.cargos_aplicados c
set reserva_id = e.reserva_id
from public.estancias e
where e.id = c.estancia_id and c.reserva_id is null;

create index if not exists cargos_aplicados_reserva_id_idx on public.cargos_aplicados (reserva_id);

-- El dueño ve también sus cargos sueltos.
drop policy if exists cargos_aplicados_select_propio on public.cargos_aplicados;
create policy cargos_aplicados_select_propio on public.cargos_aplicados
  for select to authenticated
  using (
    reserva_id in (
      select r.id from public.reservas r
      where r.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Trigger: cuerpo de 20260922064415 más la rama sin estancia. Un cargo
-- suelto no tiene perro del que sacar la talla, así que solo admite
-- cargos que no dependan del tamaño o de monto libre; y reserva_id se
-- rellena desde la estancia cuando la hay, para que nadie pueda apuntar
-- un cargo de estancia a otra cuenta.
create or replace function public.validar_cargo_aplicado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
  v_depende_tamano boolean;
  v_monto_libre boolean;
  v_perro_id uuid;
  v_estado_estancia text;
  v_reserva_estancia uuid;
  v_precio numeric;
  v_estado_precio text;
  v_debe_resolver boolean;
begin
  select categoria, depende_tamano, monto_libre
    into v_categoria, v_depende_tamano, v_monto_libre
  from public.servicios where id = new.servicio_id;

  if v_categoria is null or v_categoria <> 'cargo' then
    raise exception 'Este servicio no es un cargo; no se puede usar en un cargo aplicado.';
  end if;

  if new.estancia_id is not null then
    select perro_id, estado, reserva_id into v_perro_id, v_estado_estancia, v_reserva_estancia
    from public.estancias where id = new.estancia_id;

    if v_estado_estancia in ('cancelada', 'no_llego') then
      raise exception 'No se pueden aplicar cargos a una estancia cancelada o que no llegó.';
    end if;
    new.reserva_id := v_reserva_estancia;
    new.perro_id := v_perro_id;
  else
    if new.reserva_id is null then
      raise exception 'Un cargo suelto necesita la cuenta (reserva) a la que pertenece.';
    end if;
    if not exists (select 1 from public.reservas r where r.id = new.reserva_id and r.deleted_at is null) then
      raise exception 'La cuenta de este cargo no existe.';
    end if;
    if new.perro_id is not null and not exists (
      select 1 from public.perros p
      join public.reservas r on r.cliente_id = p.cliente_id
      where p.id = new.perro_id and r.id = new.reserva_id
    ) then
      raise exception 'Ese perro no es del dueño de esta cuenta.';
    end if;
    if v_depende_tamano and not v_monto_libre then
      raise exception 'Este cargo depende del tamaño del perro: aplícalo desde su estancia.';
    end if;
    v_perro_id := new.perro_id;
  end if;

  if v_monto_libre then
    if new.precio is null or new.precio <= 0 then
      raise exception 'Captura el importe de este cargo: se cobra según lo que se le dio.';
    end if;
    if new.descripcion is null or btrim(new.descripcion) = '' then
      raise exception 'Describe qué se le dio para poder aplicar este cargo.';
    end if;
    if TG_OP = 'UPDATE' and new.precio is distinct from old.precio then
      raise exception 'El importe de un cargo aplicado no se cambia. Cancélalo con motivo y aplica otro.';
    end if;
    new.tamano_id := null;
    return new;
  end if;

  v_debe_resolver := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.estancia_id is distinct from old.estancia_id
    or new.cantidad is distinct from old.cantidad;

  if v_debe_resolver then
    if v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = v_perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene tamaño registrado. Complétalo en su expediente antes de aplicar el cargo.';
      end if;
    else
      new.tamano_id := null;
    end if;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(new.servicio_id, new.tamano_id, null, new.cantidad, public.fecha_negocio());

    if v_estado_precio = 'sin_tarifa' then
      raise exception 'No hay tarifa capturada para este cargo. Captúrala antes de aplicarlo.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este cargo no aplica para el tamaño de este perro.';
    end if;

    new.precio := v_precio;
  end if;

  return new;
end;
$$;

-- La cuenta: los cargos entran por reserva_id (sueltos o de estancia).
-- Cuerpo de 20260922060141 con esa rama cambiada.
drop function if exists public.cuenta_lineas_reserva(uuid);
create function public.cuenta_lineas_reserva(p_reserva_id uuid)
returns table (
  tipo text,
  origen_id uuid,
  servicio_id uuid,
  descripcion text,
  cantidad numeric,
  precio_unitario numeric,
  total numeric
)
language sql
stable
set search_path = ''
as $$
  select
    'estancia'::text,
    e.id,
    e.servicio_id,
    p.nombre || ' — ' || s.nombre,
    (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric,
    e.precio_unitario,
    e.precio_unitario * (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric
  from public.estancias e
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = e.servicio_id
  where e.reserva_id = p_reserva_id
    and e.deleted_at is null
    and e.estado not in ('cancelada', 'no_llego')

  union all

  select
    'cargo'::text,
    c.id,
    c.servicio_id,
    coalesce(p.nombre || ' — ', '') || s.nombre
      || case when c.descripcion is not null and btrim(c.descripcion) <> '' then ' (' || c.descripcion || ')' else '' end,
    c.cantidad::numeric,
    c.precio,
    c.precio * c.cantidad
  from public.cargos_aplicados c
  join public.servicios s on s.id = c.servicio_id
  left join public.perros p on p.id = c.perro_id
  where c.reserva_id = p_reserva_id
    and c.deleted_at is null
    and c.cancelado = false

  union all

  select
    'estetica'::text,
    ce.id,
    ce.servicio_id,
    p.nombre || ' — ' || s.nombre,
    1::numeric,
    ce.precio,
    ce.precio
  from public.citas_estetica ce
  join public.perros p on p.id = ce.perro_id
  join public.servicios s on s.id = ce.servicio_id
  left join public.estancias e on e.id = ce.estancia_id
  where (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
    and ce.deleted_at is null
    and ce.estado not in ('cancelada', 'no_llego')

  union all

  select
    'bono'::text,
    bc.id,
    bc.servicio_id,
    s.nombre,
    1::numeric,
    bc.precio_pagado,
    bc.precio_pagado
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.reserva_id = p_reserva_id
    and bc.deleted_at is null;
$$;

grant execute on function public.cuenta_lineas_reserva(uuid) to authenticated;

-- cuenta_totales_reserva: cuerpo de 20260923000000, con la cobertura de
-- bono sobre cargos resuelta por reserva_id.
drop function if exists public.cuenta_totales_reserva(uuid);
create function public.cuenta_totales_reserva(p_reserva_id uuid)
returns table (
  total_cuenta numeric,
  total_cobrado numeric,
  total_propinas numeric,
  total_devuelto numeric,
  total_bono numeric,
  total_descuento numeric,
  saldo numeric
)
language sql
stable
set search_path = ''
as $$
  with cobertura as (
    select sum(
      (case mb.tipo when 'consumo' then mb.cantidad when 'devolucion' then -mb.cantidad else 0 end) * (
        case mb.item_tipo
          when 'estancia' then (select e.precio_unitario from public.estancias e where e.id = mb.item_id)
          when 'cargo' then (select c.precio from public.cargos_aplicados c where c.id = mb.item_id)
          when 'estetica' then (select ce.precio from public.citas_estetica ce where ce.id = mb.item_id)
        end
      )
    ) as total
    from public.movimientos_bono mb
    where mb.tipo in ('consumo', 'devolucion')
      and (
        (mb.item_tipo = 'estancia' and exists (
          select 1 from public.estancias e where e.id = mb.item_id and e.reserva_id = p_reserva_id
        ))
        or (mb.item_tipo = 'cargo' and exists (
          select 1 from public.cargos_aplicados c
          where c.id = mb.item_id and c.reserva_id = p_reserva_id
        ))
        or (mb.item_tipo = 'estetica' and exists (
          select 1 from public.citas_estetica ce
          left join public.estancias e on e.id = ce.estancia_id
          where ce.id = mb.item_id and (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
        ))
      )
  ),
  cobrado as (
    select coalesce(sum(cm.monto), 0) as monto, coalesce(sum(cm.propina), 0) as propina
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where c.reserva_id = p_reserva_id
  ),
  devuelto as (
    select coalesce(sum(dm.monto), 0) as monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    join public.cobros c on c.id = d.cobro_id
    where c.reserva_id = p_reserva_id
  ),
  descuento as (
    select coalesce(sum(da.monto_aplicado), 0) as monto
    from public.descuentos_aplicados da
    where da.reserva_id = p_reserva_id and da.cancelado = false
  ),
  cuenta as (
    select coalesce(sum(l.total), 0) as total from public.cuenta_lineas_reserva(p_reserva_id) l
  )
  select
    cuenta.total,
    cobrado.monto,
    cobrado.propina,
    devuelto.monto,
    coalesce(cobertura.total, 0),
    descuento.monto,
    cuenta.total - cobrado.monto - coalesce(cobertura.total, 0) - descuento.monto + devuelto.monto
  from cuenta, cobrado, devuelto, descuento, cobertura;
$$;

grant execute on function public.cuenta_totales_reserva(uuid) to authenticated;

-- Crear la cuenta y el cargo en una sola transacción. Devuelve la
-- reserva (la cuenta) para ir directo a cobrarla. Mismo camino de dinero
-- que todo lo demás: el cobro sigue siendo registrar_cobro sobre esa
-- reserva.
create or replace function public.crear_cargo_suelto(
  p_cliente_id uuid,
  p_servicio_id uuid,
  p_cantidad int,
  p_importe numeric,
  p_descripcion text,
  p_perro_id uuid,
  p_notas text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reserva_id uuid;
  v_cargo_id uuid;
  v_precio numeric;
  v_servicio public.servicios%rowtype;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un cargo.';
  end if;
  if not exists (select 1 from public.clientes where id = p_cliente_id and deleted_at is null) then
    raise exception 'Cliente no encontrado.';
  end if;
  select * into v_servicio from public.servicios
  where id = p_servicio_id and categoria = 'cargo' and deleted_at is null;
  if not found then
    raise exception 'Ese cargo no existe en el catálogo.';
  end if;
  if coalesce(p_cantidad, 0) < 1 then
    raise exception 'La cantidad debe ser al menos 1.';
  end if;

  insert into public.reservas (cliente_id, notas)
  values (p_cliente_id, 'Cargo suelto: ' || v_servicio.nombre
    || case when p_descripcion is not null and btrim(p_descripcion) <> '' then ' — ' || btrim(p_descripcion) else '' end)
  returning id into v_reserva_id;

  insert into public.cargos_aplicados (reserva_id, perro_id, servicio_id, cantidad, precio, descripcion, notas)
  values (
    v_reserva_id,
    p_perro_id,
    p_servicio_id,
    p_cantidad,
    case when v_servicio.monto_libre then p_importe else null end,
    nullif(btrim(coalesce(p_descripcion, '')), ''),
    nullif(btrim(coalesce(p_notas, '')), '')
  )
  returning id, precio into v_cargo_id, v_precio;

  return jsonb_build_object('reserva_id', v_reserva_id, 'cargo_id', v_cargo_id, 'precio', v_precio);
end;
$$;

revoke execute on function public.crear_cargo_suelto(uuid, uuid, int, numeric, text, uuid, text) from public;
revoke execute on function public.crear_cargo_suelto(uuid, uuid, int, numeric, text, uuid, text) from anon;
grant execute on function public.crear_cargo_suelto(uuid, uuid, int, numeric, text, uuid, text) to authenticated;

-- ── 2. Cuentas abiertas ──────────────────────────────────────────────
-- Reservas con saldo pendiente y actividad cerca de hoy. La fecha de
-- actividad es la de la estancia o cita más cercana a hoy (o la de
-- creación de la cuenta si no tiene ninguna, p. ej. un cargo suelto).
-- Se calcula con cuenta_totales_reserva por fila: son decenas de cuentas
-- vivas, no miles, y así hay UNA definición de saldo en toda la app.
create or replace function public.cuentas_abiertas(p_dias int default 30)
returns table (
  reserva_id uuid,
  cliente_id uuid,
  cliente_nombre text,
  cliente_telefono text,
  perros text,
  descripcion text,
  fecha_actividad date,
  total_cuenta numeric,
  saldo numeric
)
language sql
stable
set search_path = ''
as $$
  with con_fecha as (
    -- La fecha de actividad manda: la estancia o cita más cercana a hoy,
    -- y solo si no hay ninguna, el día en que se creó la cuenta (un cargo
    -- suelto). Una cuenta creada hoy para dentro de dos años NO es de hoy.
    select
      r.id,
      r.cliente_id,
      r.notas,
      coalesce((
        select fecha from (
          select e.fecha_entrada as fecha from public.estancias e
          where e.reserva_id = r.id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
          union all
          select (ce.inicio at time zone 'America/Mexico_City')::date from public.citas_estetica ce
          where ce.reserva_id = r.id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        ) f
        order by abs(f.fecha - public.fecha_negocio())
        limit 1
      ), (r.created_at at time zone 'America/Mexico_City')::date) as fecha_actividad
    from public.reservas r
    where r.deleted_at is null
  ),
  candidatas as (
    select * from con_fecha
    where fecha_actividad between public.fecha_negocio() - p_dias and public.fecha_negocio() + p_dias
  ),
  con_totales as (
    select c.*, t.total_cuenta, t.saldo
    from candidatas c
    cross join lateral public.cuenta_totales_reserva(c.id) t
    where t.saldo > 0
  )
  select
    c.id,
    c.cliente_id,
    cl.nombre,
    cl.telefono,
    coalesce((
      select string_agg(distinct p.nombre, ', ' order by p.nombre)
      from (
        select p1.nombre from public.estancias e join public.perros p1 on p1.id = e.perro_id
        where e.reserva_id = c.id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
        union
        select p2.nombre from public.citas_estetica ce join public.perros p2 on p2.id = ce.perro_id
        where ce.reserva_id = c.id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        union
        select p3.nombre from public.cargos_aplicados ca join public.perros p3 on p3.id = ca.perro_id
        where ca.reserva_id = c.id and ca.deleted_at is null and not ca.cancelado
      ) p
    ), ''),
    coalesce((
      select string_agg(l.descripcion, ' · ' order by l.descripcion)
      from public.cuenta_lineas_reserva(c.id) l
    ), coalesce(c.notas, 'Cuenta')),
    c.fecha_actividad,
    c.total_cuenta,
    c.saldo
  from con_totales c
  join public.clientes cl on cl.id = c.cliente_id
  order by 7 desc, 9 desc;
$$;

revoke execute on function public.cuentas_abiertas(int) from public;
revoke execute on function public.cuentas_abiertas(int) from anon;
grant execute on function public.cuentas_abiertas(int) to authenticated;

-- El origen de un cobro: capturado a mano, o registrado solo por
-- Mercado Pago (terminal integrada o link de pago). La conciliación del
-- corte necesita distinguirlos: lo que pasó por la app se puede cotejar
-- contra Mercado Pago; lo capturado a mano contra el reporte de la
-- terminal por fuera. Se crea aquí porque movimientos_turno ya lo lee.
alter table public.cobros
  add column if not exists origen text not null default 'manual'
  check (origen in ('manual', 'mercadopago_point', 'mercadopago_link'));

comment on column public.cobros.origen is
  'manual = capturado por recepción; mercadopago_point = la terminal integrada lo confirmó; mercadopago_link = un link de pago se pagó.';

-- ── 3. Movimientos del turno ─────────────────────────────────────────
-- Todo lo que movió dinero en un turno, en una sola lista: cobros (con
-- sus métodos), devoluciones, ventas de bono (son cobros contra la
-- cuenta "Compra de bono", se marcan aparte para que se vean como lo que
-- son) y retiros. Respeta el RLS del que consulta (security invoker):
-- recepción solo ve turnos suyos o el abierto, igual que la tabla.
create or replace function public.movimientos_turno(p_turno_id uuid)
returns table (
  id uuid,
  tipo text,
  fecha timestamptz,
  reserva_id uuid,
  cliente_nombre text,
  descripcion text,
  metodo text,
  monto numeric,
  propina numeric,
  origen text,
  hecho_por uuid
)
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
    'manual',
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
  where mc.turno_id = p_turno_id

  order by 3 desc;
$$;

revoke execute on function public.movimientos_turno(uuid) from public;
revoke execute on function public.movimientos_turno(uuid) from anon;
grant execute on function public.movimientos_turno(uuid) to authenticated;

-- Acumulado por método y origen del turno (el arqueo del corte sigue
-- siendo cerrar_turno; esto es lo que se ve DURANTE el turno).
create or replace function public.resumen_turno(p_turno_id uuid)
returns table (
  metodo text,
  origen text,
  cobrado numeric,
  propinas numeric,
  devuelto numeric
)
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
  ) m
  left join cobros_t ct on ct.metodo = m.metodo and ct.origen = m.origen
  left join devol_t dv on dv.metodo = m.metodo
  order by 1, 2;
$$;

revoke execute on function public.resumen_turno(uuid) from public;
revoke execute on function public.resumen_turno(uuid) from anon;
grant execute on function public.resumen_turno(uuid) to authenticated;
