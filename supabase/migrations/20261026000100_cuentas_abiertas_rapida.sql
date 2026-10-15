-- cuentas_abiertas con miles de cuentas en la ventana: de 33 s a ~0.2 s con RLS (la Caja no cargaba: statement_timeout de 8 s).
--
-- Causa: por cada cuenta con saldo la función llamaba cuenta_lineas_reserva(c.id) (descripción) y armaba los perros con
-- tres consultas correlacionadas. Esas consultas se ejecutan con la RLS de quien llama y cada ejecución evalúa
-- sus (select is_staff()), (select es_miembro())… (consultas a membresías): ~9 ms por cuenta, 3,644 cuentas → 33 s.
-- Ahora la descripción y los perros salen en la misma pasada que los totales (mismas reglas, mismos textos), las
-- agregaciones van materializadas (con estimaciones de 1 fila el planificador elegía bucles anidados cuadráticos) y la
-- ventana se recorre por índice (negocio, fecha) en vez de leer todo el historial de reservas, estancias y citas.
-- Mismas columnas, mismo orden y mismas filas que la versión anterior (comparadas con EXCEPT en ambos sentidos para
-- 3, 30 y 400 días). Invoker, igual que antes: la RLS de quien llama decide qué cuentas ve.
-- Reversa: restaurar la función de 20261024500000_cancelar_cuenta.sql.

create index if not exists reservas_negocio_creada_idx on public.reservas (negocio_id, created_at) where deleted_at is null;
create index if not exists estancias_negocio_entrada_idx on public.estancias (negocio_id, fecha_entrada) where deleted_at is null;
create index if not exists citas_estetica_negocio_inicio_idx on public.citas_estetica (negocio_id, inicio) where deleted_at is null;

create or replace function public.cuentas_abiertas(p_dias integer default 30)
returns table (reserva_id uuid, cliente_id uuid, cliente_nombre text, cliente_telefono text, perros text,
               descripcion text, fecha_actividad date, total_cuenta numeric, saldo numeric)
language sql
stable
set search_path = ''
as $$
  with hoy as materialized (
    select public.fecha_negocio() as d, public.zona_negocio() as z
  ),
  -- La ventana, en instantes: lo que cae entre hoy − p_dias y hoy + p_dias en la zona del negocio. Así los índices
  -- por (negocio, fecha) recorren solo la ventana y no todo el historial de la cuenta.
  ventana as materialized (
    select ((h.d - p_dias)::timestamp at time zone h.z) as desde,
           ((h.d + p_dias + 1)::timestamp at time zone h.z) as hasta
    from hoy h
  ),
  actividad as materialized (
    select e.reserva_id, e.fecha_entrada as fecha
    from public.estancias e, hoy h
    where e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
      and e.fecha_entrada between h.d - p_dias and h.d + p_dias
    union all
    select ce.reserva_id, (ce.inicio at time zone h.z)::date
    from public.citas_estetica ce, hoy h, ventana v
    where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
      and ce.inicio >= v.desde and ce.inicio < v.hasta
  ),
  -- La fecha de actividad manda: la estancia o cita más cercana a hoy (si alguna cae en la ventana, la más cercana
  -- también cae), y solo si la cuenta no tiene ninguna, el día en que se creó (un cargo suelto).
  mas_cercana as (
    select distinct on (a.reserva_id) a.reserva_id, a.fecha
    from actividad a, hoy h
    order by a.reserva_id, abs(a.fecha - h.d)
  ),
  candidatas as materialized (
    select r.id, r.cliente_id, r.notas, mc.fecha as fecha_actividad
    from mas_cercana mc
    join public.reservas r on r.id = mc.reserva_id
    where r.deleted_at is null
      and not exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = r.id)
    union all
    select r.id, r.cliente_id, r.notas, (r.created_at at time zone h.z)::date
    from public.reservas r, hoy h, ventana v
    where r.deleted_at is null
      and r.created_at >= v.desde and r.created_at < v.hasta
      and not exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = r.id)
      and not exists (select 1 from public.estancias e where e.reserva_id = r.id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego'))
      and not exists (select 1 from public.citas_estetica ce where ce.reserva_id = r.id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego'))
  ),
  -- Las líneas de la cuenta (cuenta_lineas_reserva), con su total y su descripción en la misma pasada. Una cita
  -- cuenta en su reserva y, si va ligada a una estancia de otra reserva, también en esa.
  lineas as materialized (
    select e.reserva_id,
      e.precio_unitario * (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric as total,
      p.nombre || ' — ' || s.nombre as descripcion
    from public.estancias e
    join public.perros p on p.id = e.perro_id
    join public.servicios s on s.id = e.servicio_id
    where e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
      and e.reserva_id in (select id from candidatas)
    union all
    select c.reserva_id, c.precio * c.cantidad,
      coalesce(p.nombre || ' — ', '') || s.nombre
        || case when c.descripcion is not null and btrim(c.descripcion) <> '' then ' (' || c.descripcion || ')' else '' end
    from public.cargos_aplicados c
    join public.servicios s on s.id = c.servicio_id
    left join public.perros p on p.id = c.perro_id
    where c.deleted_at is null and c.cancelado = false
      and c.reserva_id in (select id from candidatas)
    union all
    select x.reserva_id, x.precio, x.descripcion
    from (
      select ce.reserva_id, ce.precio,
        p.nombre || ' — ' || s.nombre || case when ce.tarifa_guarderia then ' (tarifa cliente de guardería)' else '' end as descripcion
      from public.citas_estetica ce
      join public.perros p on p.id = ce.perro_id
      join public.servicios s on s.id = ce.servicio_id
      where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        and ce.reserva_id in (select id from candidatas)
      union all
      select e.reserva_id, ce.precio,
        p.nombre || ' — ' || s.nombre || case when ce.tarifa_guarderia then ' (tarifa cliente de guardería)' else '' end
      from public.citas_estetica ce
      join public.perros p on p.id = ce.perro_id
      join public.servicios s on s.id = ce.servicio_id
      join public.estancias e on e.id = ce.estancia_id
      where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
        and e.reserva_id is distinct from ce.reserva_id
        and e.reserva_id in (select id from candidatas)
    ) x
    union all
    select bc.reserva_id, bc.precio_pagado, s.nombre
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    where bc.deleted_at is null
      and bc.reserva_id in (select id from candidatas)
    union all
    select v.reserva_id, round(v.precio_unitario * v.cantidad, 2), v.concepto
    from public.ventas_mostrador v
    where v.deleted_at is null and not v.cancelado
      and v.reserva_id in (select id from candidatas)
    union all
    select a.reserva_id, a.monto, 'Corrección de precio: ' || a.concepto
    from public.cuenta_ajustes_precio a
    where a.deleted_at is null
      and a.reserva_id in (select id from candidatas)
  ),
  -- Lo cubierto con pases (cuenta_totales_reserva): consumos − devoluciones,
  -- al precio unitario de la línea, en la reserva de la línea.
  cobertura as materialized (
    select x.reserva_id, sum(x.signo * x.cantidad * x.precio) as total
    from (
      select e.reserva_id, mb.cantidad, e.precio_unitario as precio,
        case mb.tipo when 'consumo' then 1 else -1 end as signo
      from public.movimientos_bono mb
      join public.estancias e on e.id = mb.item_id
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'estancia'
        and e.reserva_id in (select id from candidatas)
      union all
      select c.reserva_id, mb.cantidad, c.precio, case mb.tipo when 'consumo' then 1 else -1 end
      from public.movimientos_bono mb
      join public.cargos_aplicados c on c.id = mb.item_id
      where mb.tipo in ('consumo', 'devolucion') and mb.item_tipo = 'cargo'
        and c.reserva_id in (select id from candidatas)
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
        and r.reserva_id in (select id from candidatas)
    ) x
    group by x.reserva_id
  ),
  cobrado as materialized (
    select c.reserva_id, sum(cm.monto) as monto
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where c.reserva_id in (select id from candidatas)
    group by c.reserva_id
  ),
  devuelto as materialized (
    select c.reserva_id, sum(dm.monto) as monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    join public.cobros c on c.id = d.cobro_id
    where c.reserva_id in (select id from candidatas)
    group by c.reserva_id
  ),
  descuento as materialized (
    select da.reserva_id, sum(da.monto_aplicado) as monto
    from public.descuentos_aplicados da
    where da.cancelado = false and da.reserva_id in (select id from candidatas)
    group by da.reserva_id
  ),
  totales as materialized (
    select l.reserva_id, sum(l.total) as total, string_agg(l.descripcion, ' · ' order by l.descripcion) as descripcion
    from lineas l
    group by l.reserva_id
  ),
  -- Los perros de cada cuenta, todos juntos (no una consulta por cuenta).
  perros_cuenta as materialized (
    select q.reserva_id, string_agg(distinct q.nombre, ', ' order by q.nombre) as perros
    from (
      select e.reserva_id, p1.nombre
      from public.estancias e join public.perros p1 on p1.id = e.perro_id
      where e.reserva_id in (select id from candidatas) and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
      union
      select ce.reserva_id, p2.nombre
      from public.citas_estetica ce join public.perros p2 on p2.id = ce.perro_id
      where ce.reserva_id in (select id from candidatas) and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
      union
      select ca.reserva_id, p3.nombre
      from public.cargos_aplicados ca join public.perros p3 on p3.id = ca.perro_id
      where ca.reserva_id in (select id from candidatas) and ca.deleted_at is null and not ca.cancelado
    ) q
    group by q.reserva_id
  ),
  con_saldo as materialized (
    select c.id, c.cliente_id, c.notas, c.fecha_actividad, t.descripcion, pc.perros,
      coalesce(t.total, 0) as total_cuenta,
      coalesce(t.total, 0) - coalesce(co.monto, 0) - coalesce(cb.total, 0) - coalesce(de.monto, 0) + coalesce(dv.monto, 0) as saldo
    from candidatas c
    left join totales t on t.reserva_id = c.id
    left join cobrado co on co.reserva_id = c.id
    left join cobertura cb on cb.reserva_id = c.id
    left join descuento de on de.reserva_id = c.id
    left join devuelto dv on dv.reserva_id = c.id
    left join perros_cuenta pc on pc.reserva_id = c.id
    where coalesce(t.total, 0) - coalesce(co.monto, 0) - coalesce(cb.total, 0) - coalesce(de.monto, 0) + coalesce(dv.monto, 0) > 0
  )
  select
    c.id,
    c.cliente_id,
    cl.nombre,
    cl.telefono,
    coalesce(c.perros, ''),
    coalesce(c.descripcion, coalesce(c.notas, 'Cuenta')),
    c.fecha_actividad,
    c.total_cuenta,
    c.saldo
  from con_saldo c
  join public.clientes cl on cl.id = c.cliente_id
  order by 7 desc, 9 desc;
$$;
