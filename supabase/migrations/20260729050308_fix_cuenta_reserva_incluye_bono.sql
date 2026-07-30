-- Bloque B conecta con la cuenta de la reserva (Bloque A) en dos puntos:
--   1. cuenta_lineas_reserva ahora también expone servicio_id por línea
--      (para que la pantalla sepa contra qué bono puede casar cada
--      línea) y suma una línea más: la compra del bono mismo, cuando esa
--      compra quedó colgada de esta reserva (comprar_bono siempre crea
--      su propia reserva de un renglón, ver migración anterior).
--   2. cuenta_totales_reserva resta lo cubierto con bono (total_bono) del
--      saldo — un consumo de bono no es un cobro, pero sí reduce lo que
--      falta por pagar en efectivo/tarjeta/transferencia.
--
-- Postgres no permite CREATE OR REPLACE si cambia el shape de columnas
-- de retorno — hay que hacer DROP primero.
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
    (e.fecha_salida - e.fecha_entrada)::numeric,
    e.precio_unitario,
    e.precio_unitario * (e.fecha_salida - e.fecha_entrada)::numeric
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
    p.nombre || ' — ' || s.nombre,
    c.cantidad::numeric,
    c.precio,
    c.precio * c.cantidad
  from public.cargos_aplicados c
  join public.estancias e on e.id = c.estancia_id
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = c.servicio_id
  where e.reserva_id = p_reserva_id
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

drop function if exists public.cuenta_totales_reserva(uuid);

create function public.cuenta_totales_reserva(p_reserva_id uuid)
returns table (
  total_cuenta numeric,
  total_cobrado numeric,
  total_propinas numeric,
  total_devuelto numeric,
  total_bono numeric,
  saldo numeric
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select sum(l.total) from public.cuenta_lineas_reserva(p_reserva_id) l), 0) as total_cuenta,
    coalesce((
      select sum(cm.monto) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.reserva_id = p_reserva_id
    ), 0) as total_cobrado,
    coalesce((
      select sum(cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.reserva_id = p_reserva_id
    ), 0) as total_propinas,
    coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      join public.cobros c on c.id = d.cobro_id
      where c.reserva_id = p_reserva_id
    ), 0) as total_devuelto,
    coalesce((
      select sum(mb.monto) from public.movimientos_bono mb
      where mb.tipo = 'consumo'
        and (
          (mb.item_tipo = 'estancia' and exists (
            select 1 from public.estancias e where e.id = mb.item_id and e.reserva_id = p_reserva_id
          ))
          or (mb.item_tipo = 'cargo' and exists (
            select 1 from public.cargos_aplicados c
            join public.estancias e on e.id = c.estancia_id
            where c.id = mb.item_id and e.reserva_id = p_reserva_id
          ))
          or (mb.item_tipo = 'estetica' and exists (
            select 1 from public.citas_estetica ce
            left join public.estancias e on e.id = ce.estancia_id
            where ce.id = mb.item_id and (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
          ))
        )
    ), 0) as total_bono,
    coalesce((select sum(l.total) from public.cuenta_lineas_reserva(p_reserva_id) l), 0)
      - coalesce((
        select sum(cm.monto) from public.cobro_metodos cm
        join public.cobros c on c.id = cm.cobro_id
        where c.reserva_id = p_reserva_id
      ), 0)
      - coalesce((
        select sum(mb.monto) from public.movimientos_bono mb
        where mb.tipo = 'consumo'
          and (
            (mb.item_tipo = 'estancia' and exists (
              select 1 from public.estancias e where e.id = mb.item_id and e.reserva_id = p_reserva_id
            ))
            or (mb.item_tipo = 'cargo' and exists (
              select 1 from public.cargos_aplicados c
              join public.estancias e on e.id = c.estancia_id
              where c.id = mb.item_id and e.reserva_id = p_reserva_id
            ))
            or (mb.item_tipo = 'estetica' and exists (
              select 1 from public.citas_estetica ce
              left join public.estancias e on e.id = ce.estancia_id
              where ce.id = mb.item_id and (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
            ))
          )
      ), 0)
      + coalesce((
        select sum(dm.monto) from public.devolucion_metodos dm
        join public.devoluciones d on d.id = dm.devolucion_id
        join public.cobros c on c.id = d.cobro_id
        where c.reserva_id = p_reserva_id
      ), 0) as saldo;
$$;

grant execute on function public.cuenta_totales_reserva(uuid) to authenticated;
