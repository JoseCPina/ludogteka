-- Pases y saldos a favor fantasma (5 de noviembre de 2026; caso Raya / Myriam, Alejandra Perez y Rocio Aguilar en
-- Ludogteka, docs/OPERACIONES-PRODUCCION.md).
--
-- 1. Marcar una estancia «no llegó» devolvía el cupo pero NO el día del pase (solo «cancelada» lo devolvía, decisión de la
--    migración 20260923000000): el día quedaba consumido en una estancia que la cuenta ya no suma, y como
--    cuenta_totales_reserva seguía contando esa cobertura, la cuenta salía con «saldo a favor» (−$350 por día) sin que
--    nadie hubiera pagado nada. Ahora «no llegó» devuelve el día igual que cancelar, y la cobertura de una cuenta solo
--    cuenta los consumos de líneas que siguen vivas (estancia/cita no cancelada ni «no llegó», cargo no cancelado).
-- 2. Una corrección de precio sobrevivía a la cancelación de su línea: la cita se cancelaba (o se eliminaba) y la cuenta
--    quedaba solo con «Corrección de precio: −$60» → saldo a favor de −$60. Ahora, al cancelar/«no llegó»/eliminar una
--    estancia o cita, o cancelar un cargo o una venta, sus correcciones vigentes se anulan con motivo; y la cuenta solo
--    suma correcciones cuya línea sigue viva. Las huérfanas que ya existían se anulan aquí (todos los negocios).

-- ── 1a. «No llegó» devuelve el pase como cancelar ──────────────────────────────────────────────────────────────
create or replace function public.devolver_bono_al_cancelar_estancia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado in ('cancelada', 'no_llego') and coalesce(old.estado, '') not in ('cancelada', 'no_llego') then
    perform public.devolver_bono_de_item('estancia', new.id,
      case when new.estado = 'cancelada' then 'Estancia cancelada' else 'Estancia marcada «no llegó»' end);
  end if;
  return new;
end;
$$;

-- ── 1b. La cobertura de la cuenta solo cuenta líneas vivas ─────────────────────────────────────────────────────
create or replace function public.cuenta_totales_reserva(p_reserva_id uuid)
returns table(total_cuenta numeric, total_cobrado numeric, total_propinas numeric, total_devuelto numeric, total_bono numeric, total_descuento numeric, saldo numeric)
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
          select 1 from public.estancias e
          where e.id = mb.item_id and e.reserva_id = p_reserva_id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
        ))
        or (mb.item_tipo = 'cargo' and exists (
          select 1 from public.cargos_aplicados c
          where c.id = mb.item_id and c.reserva_id = p_reserva_id and c.deleted_at is null and c.cancelado = false
        ))
        or (mb.item_tipo = 'estetica' and exists (
          select 1 from public.citas_estetica ce
          left join public.estancias e on e.id = ce.estancia_id
          where ce.id = mb.item_id and (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
            and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
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

-- ── 2a. Una corrección de precio vale solo mientras su línea viva ──────────────────────────────────────────────
create or replace function public.cuenta_linea_viva(p_linea_tipo text, p_linea_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select case p_linea_tipo
    when 'estancia' then exists (select 1 from public.estancias e where e.id = p_linea_id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego'))
    when 'estetica' then exists (select 1 from public.citas_estetica ce where ce.id = p_linea_id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego'))
    when 'cargo' then exists (select 1 from public.cargos_aplicados c where c.id = p_linea_id and c.deleted_at is null and c.cancelado = false)
    when 'venta' then exists (select 1 from public.ventas_mostrador v where v.id = p_linea_id and v.deleted_at is null and not v.cancelado)
    when 'bono' then exists (select 1 from public.bonos_clientes b where b.id = p_linea_id and b.deleted_at is null)
    else true end;
$$;
revoke execute on function public.cuenta_linea_viva(text, uuid) from public, anon;
grant execute on function public.cuenta_linea_viva(text, uuid) to authenticated, service_role, peludesk_definer;

create or replace function public.cuenta_lineas_reserva(p_reserva_id uuid)
returns table(tipo text, origen_id uuid, servicio_id uuid, descripcion text, cantidad numeric, precio_unitario numeric, total numeric)
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
    p.nombre || ' — ' || s.nombre || case when ce.tarifa_guarderia then ' (tarifa cliente de guardería)' else '' end,
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
    and bc.deleted_at is null

  union all

  select
    'venta'::text,
    v.id,
    null::uuid,
    v.concepto,
    v.cantidad,
    v.precio_unitario,
    round(v.precio_unitario * v.cantidad, 2)
  from public.ventas_mostrador v
  where v.reserva_id = p_reserva_id
    and v.deleted_at is null
    and not v.cancelado

  union all

  -- Corrección de precio de la cuenta (no es un descuento). Solo mientras la línea que corrige siga viva.
  select
    'ajuste'::text,
    a.id,
    null::uuid,
    'Corrección de precio: ' || a.concepto,
    1::numeric,
    a.monto,
    a.monto
  from public.cuenta_ajustes_precio a
  where a.reserva_id = p_reserva_id
    and a.deleted_at is null
    and public.cuenta_linea_viva(a.linea_tipo, a.linea_id);
$$;

-- ── 2b. Al cancelar la línea se anulan sus correcciones, con motivo ────────────────────────────────────────────
create or replace function public.cuenta_ajustes_seguir_linea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_antes boolean;
  v_ahora boolean;
  v_motivo text;
begin
  v_tipo := case TG_TABLE_NAME when 'estancias' then 'estancia' when 'citas_estetica' then 'estetica'
                               when 'cargos_aplicados' then 'cargo' when 'ventas_mostrador' then 'venta' end;
  if v_tipo in ('estancia', 'estetica') then
    v_antes := old.deleted_at is null and old.estado not in ('cancelada', 'no_llego');
    v_ahora := new.deleted_at is null and new.estado not in ('cancelada', 'no_llego');
    v_motivo := case when new.deleted_at is not null then 'La línea se eliminó'
                     when new.estado = 'no_llego' then 'La línea quedó «no llegó»'
                     else 'La línea se canceló' end;
  else
    v_antes := old.deleted_at is null and not old.cancelado;
    v_ahora := new.deleted_at is null and not new.cancelado;
    v_motivo := 'La línea se canceló';
  end if;
  if v_antes and not v_ahora then
    update public.cuenta_ajustes_precio a
    set deleted_at = now(), anulada_por = auth.uid(),
        anulada_motivo = v_motivo || ': la corrección de precio ya no aplica (anulada en automático).'
    where a.linea_tipo = v_tipo and a.linea_id = new.id and a.deleted_at is null;
  end if;
  return new;
end;
$$;
alter function public.cuenta_ajustes_seguir_linea() owner to peludesk_definer;
revoke execute on function public.cuenta_ajustes_seguir_linea() from public, anon;

drop trigger if exists cuenta_ajustes_seguir_linea on public.estancias;
create trigger cuenta_ajustes_seguir_linea after update of estado, deleted_at on public.estancias
  for each row execute function public.cuenta_ajustes_seguir_linea();
drop trigger if exists cuenta_ajustes_seguir_linea on public.citas_estetica;
create trigger cuenta_ajustes_seguir_linea after update of estado, deleted_at on public.citas_estetica
  for each row execute function public.cuenta_ajustes_seguir_linea();
drop trigger if exists cuenta_ajustes_seguir_linea on public.cargos_aplicados;
create trigger cuenta_ajustes_seguir_linea after update of cancelado, deleted_at on public.cargos_aplicados
  for each row execute function public.cuenta_ajustes_seguir_linea();
drop trigger if exists cuenta_ajustes_seguir_linea on public.ventas_mostrador;
create trigger cuenta_ajustes_seguir_linea after update of cancelado, deleted_at on public.ventas_mostrador
  for each row execute function public.cuenta_ajustes_seguir_linea();

-- ── 2c. Las correcciones huérfanas que ya existían (todos los negocios) ────────────────────────────────────────
do $$
declare v_n int;
begin
  update public.cuenta_ajustes_precio a
  set deleted_at = now(),
      anulada_motivo = 'La línea a la que corregía el precio ya estaba cancelada, «no llegó» o eliminada: anulada por la migración 20261203004200.'
  where a.deleted_at is null and not public.cuenta_linea_viva(a.linea_tipo, a.linea_id);
  get diagnostics v_n = row_count;
  raise notice 'Correcciones de precio huérfanas anuladas: %', v_n;
end $$;
