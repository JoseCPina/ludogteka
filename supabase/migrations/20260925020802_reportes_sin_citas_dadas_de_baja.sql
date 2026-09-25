-- Los reportes de costos, margen por servicio y operativo contaban citas de
-- estética FINALIZADAS aunque estuvieran dadas de baja (deleted_at): una
-- cita dada de baja inflaba ingreso, citas y margen, y no tenía comisión
-- (comision_de_cita sí las excluye). Mismas funciones, con el filtro.

create or replace function public.reporte_costos_periodo(p_desde date, p_hasta date)
returns table (
  compras_total numeric,
  consumo_valorizado_total numeric,
  merma_valorizada numeric,
  consumo_estetica_valorizado numeric,
  ingreso_estetica numeric,
  margen_estetica numeric
)
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
  with compras as (
    select coalesce(sum(ci.costo_total), 0) as total
    from public.compras_insumos ci
    join public.movimientos_inventario mi on mi.id = ci.movimiento_id
    where public.fecha_negocio(mi.created_at) between p_desde and p_hasta
  ),
  -- Salidas SIN cita ligada (consumo manual, merma, ajuste negativo):
  -- se valorizan y agrupan por la fecha del propio movimiento.
  salidas_sueltas as (
    select
      mi.tipo,
      mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0) as valor
    from public.movimientos_inventario mi
    where mi.cita_estetica_id is null
      and mi.tipo in ('salida_consumo', 'salida_merma', 'ajuste_negativo')
      and public.fecha_negocio(mi.created_at) between p_desde and p_hasta
  ),
  -- Citas de estética finalizadas en el periodo, por la fecha de la
  -- CITA (no del movimiento) — así ingreso y costo del mismo servicio
  -- siempre caen en el mismo periodo aunque el cierre real haya
  -- cruzado medianoche.
  citas_periodo as (
    select ce.id, ce.precio
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and ce.deleted_at is null
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  consumo_estetica as (
    select
      mi.cita_estetica_id as cita_id,
      sum(mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0)) as costo
    from public.movimientos_inventario mi
    where mi.cita_estetica_id in (select id from citas_periodo)
    group by mi.cita_estetica_id
  )
  select
    (select total from compras),
    (select coalesce(sum(valor), 0) from salidas_sueltas) + (select coalesce(sum(costo), 0) from consumo_estetica),
    (select coalesce(sum(valor), 0) from salidas_sueltas where tipo in ('salida_merma', 'ajuste_negativo')),
    (select coalesce(sum(costo), 0) from consumo_estetica),
    (select coalesce(sum(precio), 0) from citas_periodo),
    (select coalesce(sum(precio), 0) from citas_periodo) - (select coalesce(sum(costo), 0) from consumo_estetica);
end;
$$;

create or replace function public.reporte_margen_por_servicio_periodo(p_desde date, p_hasta date)
returns table (
  servicio_id uuid,
  servicio_nombre text,
  citas_finalizadas int,
  ingreso numeric,
  costo_consumo numeric,
  margen numeric,
  comision numeric,
  margen_con_comision numeric
)
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
  with citas_periodo as (
    select ce.id, ce.servicio_id, ce.precio, public.comision_de_cita(ce.id) as comision
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and ce.deleted_at is null
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  costo_por_cita as (
    select
      mi.cita_estetica_id as cita_id,
      sum(mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0)) as costo
    from public.movimientos_inventario mi
    where mi.cita_estetica_id in (select id from citas_periodo)
    group by mi.cita_estetica_id
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

create or replace function public.reporte_operativo_periodo(p_desde date, p_hasta date)
returns table (
  dias_guarderia int,
  noches_hotel int,
  citas_estetica_finalizadas int,
  estancias_canceladas int,
  citas_no_llego int
)
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
  with guarderia as (
    select count(*) as dias
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    where s.categoria = 'guarderia'
      and e.deleted_at is null
      and e.estado <> 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  hotel as (
    select coalesce(sum(e.fecha_salida - e.fecha_entrada), 0) as noches
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    where s.categoria = 'hotel'
      and e.deleted_at is null
      and e.estado <> 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  citas as (
    select count(*) as total
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and ce.deleted_at is null
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  canceladas as (
    select count(*) as total
    from public.estancias e
    where e.deleted_at is null
      and e.estado = 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  no_llego as (
    select count(*) as total
    from public.citas_estetica ce
    where ce.estado = 'no_llego'
      and ce.deleted_at is null
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  )
  select
    (select dias from guarderia)::int,
    (select noches from hotel)::int,
    (select total from citas)::int,
    (select total from canceladas)::int,
    (select total from no_llego)::int;
end;
$$;
