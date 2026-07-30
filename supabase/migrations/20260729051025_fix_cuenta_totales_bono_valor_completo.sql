-- Bug real, encontrado probando el consumo de un bono: total_bono restaba
-- movimientos_bono.monto (el ingreso RECONOCIDO, prorrateado al precio
-- con descuento del bono — ej. $135 por día de un bono de $1350/10 días)
-- en vez del valor de LISTA de la línea cubierta (ej. $150/día). Eso
-- dejaba un saldo falso de $15 en una estancia ya pagada por completo con
-- el bono — el cliente no debe nada más por ese día, ya pagó el paquete
-- completo cuando compró el bono.
--
-- Son dos números distintos a propósito, y no deben mezclarse:
--   - movimientos_bono.monto: ingreso reconocido para Fase 8 (con el
--     descuento del bono ya aplicado). No se toca, sigue siendo correcto
--     para reportes financieros.
--   - total_bono en cuenta_totales_reserva: cuánto de la CUENTA (a valor
--     de lista, lo que el cliente vería si pagara suelto) quedó cubierto
--     — eso es lo que debe reducir el saldo pendiente a cobrar, y es
--     cantidad × precio_unitario/precio real de cada línea cubierta, no
--     el monto con descuento del bono.
create or replace function public.cuenta_totales_reserva(p_reserva_id uuid)
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
      select sum(
        mb.cantidad * (
          case mb.item_tipo
            when 'estancia' then (select e.precio_unitario from public.estancias e where e.id = mb.item_id)
            when 'cargo' then (select c.precio from public.cargos_aplicados c where c.id = mb.item_id)
            when 'estetica' then (select ce.precio from public.citas_estetica ce where ce.id = mb.item_id)
          end
        )
      )
      from public.movimientos_bono mb
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
        select sum(
          mb.cantidad * (
            case mb.item_tipo
              when 'estancia' then (select e.precio_unitario from public.estancias e where e.id = mb.item_id)
              when 'cargo' then (select c.precio from public.cargos_aplicados c where c.id = mb.item_id)
              when 'estetica' then (select ce.precio from public.citas_estetica ce where ce.id = mb.item_id)
            end
          )
        )
        from public.movimientos_bono mb
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
