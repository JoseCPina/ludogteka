-- Bloque C conecta con la cuenta igual que Bloque B: un descuento
-- aplicado no es un cobro, pero sí reduce el saldo pendiente. total_bono
-- ya usaba cantidad × precio real de cada línea (no el monto con
-- descuento del bono) para no inflar el saldo — total_descuento es más
-- simple, ya viene resuelto en pesos (descuentos_aplicados.monto_aplicado
-- es un snapshot, ver esa migración).
--
-- Postgres no permite CREATE OR REPLACE si cambia el shape de columnas
-- de retorno — hay que hacer DROP primero.
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
    coalesce((
      select sum(da.monto_aplicado) from public.descuentos_aplicados da
      where da.reserva_id = p_reserva_id and da.cancelado = false
    ), 0) as total_descuento,
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
      - coalesce((
        select sum(da.monto_aplicado) from public.descuentos_aplicados da
        where da.reserva_id = p_reserva_id and da.cancelado = false
      ), 0)
      + coalesce((
        select sum(dm.monto) from public.devolucion_metodos dm
        join public.devoluciones d on d.id = dm.devolucion_id
        join public.cobros c on c.id = d.cobro_id
        where c.reserva_id = p_reserva_id
      ), 0) as saldo;
$$;

grant execute on function public.cuenta_totales_reserva(uuid) to authenticated;
