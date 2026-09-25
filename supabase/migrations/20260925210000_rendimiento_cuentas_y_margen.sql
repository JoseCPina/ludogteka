-- Rendimiento con meses de operación (25 de septiembre de 2026). Con dos
-- meses de datos del negocio de demostración (~1,000 cuentas), dos
-- funciones pasaban del límite de 8 segundos y su pantalla no cargaba:
--
-- · cuentas_abiertas() (la Caja y los saldos del tablero) armaba la cuenta
--   de CADA reserva con cuenta_totales_reserva(), una por una. Ahora suma
--   todas en una pasada, con exactamente las mismas reglas que
--   cuenta_lineas_reserva() y cuenta_totales_reserva() (que siguen siendo
--   las de una sola cuenta): líneas vivas, lo cubierto con pases como
--   consumos − devoluciones al precio de la línea, cobrado, devuelto y
--   descuentos no cancelados. La descripción y los perros solo se arman
--   para las cuentas que sí tienen saldo.
-- · reporte_margen_por_servicio_periodo() calculaba el costo promedio de un
--   insumo por cada movimiento de cada cita; ahora una vez por insumo.
--
-- Si cambia una regla de la cuenta, cambia en las tres funciones.

create or replace function public.cuentas_abiertas(p_dias integer default 30)
returns table (reserva_id uuid, cliente_id uuid, cliente_nombre text, cliente_telefono text, perros text,
               descripcion text, fecha_actividad date, total_cuenta numeric, saldo numeric)
language sql
stable
set search_path = ''
as $$
  with hoy as (
    select public.fecha_negocio() as d, public.zona_negocio() as z
  ),
  actividad as (
    select e.reserva_id, e.fecha_entrada as fecha
    from public.estancias e
    where e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
    union all
    select ce.reserva_id, (ce.inicio at time zone (select z from hoy))::date
    from public.citas_estetica ce
    where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
  ),
  -- La fecha de actividad manda: la estancia o cita más cercana a hoy, y
  -- solo si no hay ninguna, el día en que se creó la cuenta (un cargo suelto).
  mas_cercana as (
    select distinct on (a.reserva_id) a.reserva_id, a.fecha
    from actividad a
    order by a.reserva_id, abs(a.fecha - (select d from hoy))
  ),
  candidatas as (
    select r.id, r.cliente_id, r.notas,
      coalesce(mc.fecha, (r.created_at at time zone (select z from hoy))::date) as fecha_actividad
    from public.reservas r
    left join mas_cercana mc on mc.reserva_id = r.id
    where r.deleted_at is null
      and coalesce(mc.fecha, (r.created_at at time zone (select z from hoy))::date)
          between (select d from hoy) - p_dias and (select d from hoy) + p_dias
  ),
  -- Las líneas de la cuenta (cuenta_lineas_reserva). Una cita cuenta en su
  -- reserva y, si va ligada a una estancia de otra reserva, también en esa.
  lineas as (
    select e.reserva_id,
      e.precio_unitario * (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric as total
    from public.estancias e
    join public.perros p on p.id = e.perro_id
    join public.servicios s on s.id = e.servicio_id
    where e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
      and e.reserva_id in (select id from candidatas)
    union all
    select c.reserva_id, c.precio * c.cantidad
    from public.cargos_aplicados c
    join public.servicios s on s.id = c.servicio_id
    where c.deleted_at is null and c.cancelado = false
      and c.reserva_id in (select id from candidatas)
    union all
    select x.reserva_id, x.precio
    from (
      select ce.reserva_id, ce.precio
      from public.citas_estetica ce
      join public.perros p on p.id = ce.perro_id
      join public.servicios s on s.id = ce.servicio_id
      where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
      union all
      select e.reserva_id, ce.precio
      from public.citas_estetica ce
      join public.perros p on p.id = ce.perro_id
      join public.servicios s on s.id = ce.servicio_id
      join public.estancias e on e.id = ce.estancia_id
      where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        and e.reserva_id is distinct from ce.reserva_id
    ) x
    where x.reserva_id in (select id from candidatas)
    union all
    select bc.reserva_id, bc.precio_pagado
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    where bc.deleted_at is null
      and bc.reserva_id in (select id from candidatas)
  ),
  -- Lo cubierto con pases (cuenta_totales_reserva): consumos − devoluciones,
  -- al precio unitario de la línea, en la reserva de la línea.
  cobertura as (
    select x.reserva_id, sum(x.signo * x.cantidad * x.precio) as total
    from (
      select e.reserva_id, mb.cantidad, e.precio_unitario as precio,
        case mb.tipo when 'consumo' then 1 else -1 end as signo
      from public.movimientos_bono mb
      join public.estancias e on e.id = mb.item_id
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'estancia'
      union all
      select c.reserva_id, mb.cantidad, c.precio, case mb.tipo when 'consumo' then 1 else -1 end
      from public.movimientos_bono mb
      join public.cargos_aplicados c on c.id = mb.item_id
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'cargo'
      union all
      select r.reserva_id, mb.cantidad, ce.precio, case mb.tipo when 'consumo' then 1 else -1 end
      from public.movimientos_bono mb
      join public.citas_estetica ce on ce.id = mb.item_id
      left join public.estancias e on e.id = ce.estancia_id
      cross join lateral (
        select ce.reserva_id
        union
        select e.reserva_id where e.reserva_id is not null
      ) r
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'estetica'
    ) x
    where x.reserva_id in (select id from candidatas)
    group by x.reserva_id
  ),
  cobrado as (
    select c.reserva_id, sum(cm.monto) as monto
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where c.reserva_id in (select id from candidatas)
    group by c.reserva_id
  ),
  devuelto as (
    select c.reserva_id, sum(dm.monto) as monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    join public.cobros c on c.id = d.cobro_id
    where c.reserva_id in (select id from candidatas)
    group by c.reserva_id
  ),
  descuento as (
    select da.reserva_id, sum(da.monto_aplicado) as monto
    from public.descuentos_aplicados da
    where da.cancelado = false and da.reserva_id in (select id from candidatas)
    group by da.reserva_id
  ),
  totales as (
    select l.reserva_id, sum(l.total) as total
    from lineas l
    group by l.reserva_id
  ),
  con_totales as (
    select c.*,
      coalesce(t.total, 0) as total_cuenta,
      coalesce(t.total, 0) - coalesce(co.monto, 0) - coalesce(cb.total, 0) - coalesce(de.monto, 0) + coalesce(dv.monto, 0) as saldo
    from candidatas c
    left join totales t on t.reserva_id = c.id
    left join cobrado co on co.reserva_id = c.id
    left join cobertura cb on cb.reserva_id = c.id
    left join descuento de on de.reserva_id = c.id
    left join devuelto dv on dv.reserva_id = c.id
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
  where c.saldo > 0
  order by 7 desc, 9 desc;
$$;

create or replace function public.reporte_margen_por_servicio_periodo(p_desde date, p_hasta date)
returns table (servicio_id uuid, servicio_nombre text, citas_finalizadas integer, ingreso numeric, costo_consumo numeric,
               margen numeric, comision numeric, margen_con_comision numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;

  return query
  with citas_periodo as materialized (
    select ce.id, ce.servicio_id, ce.precio, public.comision_de_cita(ce.id) as comision
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and ce.deleted_at is null
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  movimientos as materialized (
    select mi.cita_estetica_id, mi.insumo_id, mi.cantidad_base
    from public.movimientos_inventario mi
    where mi.cita_estetica_id in (select id from citas_periodo)
  ),
  -- Una vez por insumo, no una vez por movimiento.
  costo_insumo as materialized (
    select i.insumo_id, coalesce(public.costo_promedio_base_insumo(i.insumo_id, p_hasta), 0) as costo
    from (select distinct m.insumo_id from movimientos m) i
  ),
  costo_por_cita as (
    select m.cita_estetica_id as cita_id, sum(m.cantidad_base * ci.costo) as costo
    from movimientos m
    join costo_insumo ci on ci.insumo_id = m.insumo_id
    group by m.cita_estetica_id
  )
  select
    s.id,
    s.nombre,
    count(cp.id)::int,
    coalesce(sum(cp.precio), 0),
    coalesce(sum(cpc.costo), 0),
    coalesce(sum(cp.precio), 0) - coalesce(sum(cpc.costo), 0),
    coalesce(sum(cp.comision), 0),
    coalesce(sum(cp.precio), 0) - coalesce(sum(cpc.costo), 0) - coalesce(sum(cp.comision), 0)
  from citas_periodo cp
  join public.servicios s on s.id = cp.servicio_id
  left join costo_por_cita cpc on cpc.cita_id = cp.id
  group by s.id, s.nombre
  order by s.nombre;
end;
$$;
