-- Reportes: desglose de las operaciones que forman cada cifra (1 de noviembre de 2026).
-- Cada tarjeta de /reportes abre la lista de operaciones del mismo periodo, con los MISMOS criterios que la
-- función que calcula la cifra (reporte_financiero_periodo, reporte_ventas_mostrador_periodo, reporte_costos_periodo,
-- reporte_margen_por_servicio_periodo, reporte_operativo_periodo), para que el total del pie cuadre exacto.
--   * reporte_cuentas_info: descripción, mascotas, métodos y descuento de un conjunto de cuentas, en una pasada.
--   * reporte_desglose: una sola función; devuelve un jsonb (sin el tope de 1,000 filas de la API), ordenado,
--     buscado y paginado en la base. Solo con «Reportes financieros».

create or replace function public.reporte_cuentas_info(p_ids uuid[])
returns table (reserva_id uuid, cliente_id uuid, cliente text, perros text, descripcion text, metodos text, descuento numeric)
language sql
stable
set search_path = ''
as $$
  with ids as materialized (select distinct unnest(p_ids) as id),
  lineas as materialized (
    select e.reserva_id, e.perro_id, p.nombre || ' — ' || s.nombre as descripcion
    from public.estancias e
    join public.perros p on p.id = e.perro_id
    join public.servicios s on s.id = e.servicio_id
    where e.deleted_at is null and e.estado not in ('cancelada', 'no_llego') and e.reserva_id in (select id from ids)
    union all
    select c.reserva_id, c.perro_id,
      coalesce(p.nombre || ' — ', '') || s.nombre
        || case when c.descripcion is not null and btrim(c.descripcion) <> '' then ' (' || c.descripcion || ')' else '' end
    from public.cargos_aplicados c
    join public.servicios s on s.id = c.servicio_id
    left join public.perros p on p.id = c.perro_id
    where c.deleted_at is null and c.cancelado = false and c.reserva_id in (select id from ids)
    union all
    select ce.reserva_id, ce.perro_id, p.nombre || ' — ' || coalesce(s.nombre, ce.servicio_nombre)
    from public.citas_estetica ce
    join public.perros p on p.id = ce.perro_id
    left join public.servicios s on s.id = ce.servicio_id
    where ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego') and ce.reserva_id in (select id from ids)
    union all
    select bc.reserva_id, bc.perro_id, coalesce(p.nombre || ' — ', '') || s.nombre
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    left join public.perros p on p.id = bc.perro_id
    where bc.deleted_at is null and bc.reserva_id in (select id from ids)
    union all
    select v.reserva_id, null::uuid, v.concepto
    from public.ventas_mostrador v
    where v.deleted_at is null and not v.cancelado and v.reserva_id in (select id from ids)
  ),
  resumen as (
    select l.reserva_id,
      string_agg(distinct pe.nombre, ', ') as perros,
      string_agg(distinct l.descripcion, ' · ') as descripcion
    from lineas l
    left join public.perros pe on pe.id = l.perro_id
    group by l.reserva_id
  ),
  metodos as (
    select c.reserva_id, string_agg(distinct cm.metodo, ', ') as metodos
    from public.cobros c
    join public.cobro_metodos cm on cm.cobro_id = c.id
    where c.reserva_id in (select id from ids) and cm.monto > 0
    group by c.reserva_id
  ),
  descuentos as (
    select d.reserva_id, sum(d.monto_aplicado) as total
    from public.descuentos_aplicados d
    where not d.cancelado and d.reserva_id in (select id from ids)
    group by d.reserva_id
  )
  select r.id, r.cliente_id, cl.nombre, rs.perros, rs.descripcion, m.metodos, coalesce(d.total, 0)
  from ids
  join public.reservas r on r.id = ids.id
  left join public.clientes cl on cl.id = r.cliente_id
  left join resumen rs on rs.reserva_id = r.id
  left join metodos m on m.reserva_id = r.id
  left join descuentos d on d.reserva_id = r.id;
$$;
alter function public.reporte_cuentas_info(uuid[]) owner to peludesk_definer;
revoke execute on function public.reporte_cuentas_info(uuid[]) from public, anon, authenticated;
grant execute on function public.reporte_cuentas_info(uuid[]) to peludesk_definer, service_role;

create or replace function public.reporte_desglose(
  p_tarjeta text, p_desde date, p_hasta date,
  p_buscar text default null, p_orden text default 'fecha', p_dir text default 'desc',
  p_limite int default 25, p_desplazamiento int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clase text := split_part(p_tarjeta, ':', 1);
  v_arg text := nullif(split_part(p_tarjeta, ':', 2), '');
  v_orden text := case when p_orden in ('fecha', 'cliente', 'mascota', 'concepto', 'usuario', 'metodo', 'monto', 'descuento') then p_orden else 'fecha' end;
  v_asc boolean := lower(coalesce(p_dir, 'desc')) = 'asc';
  v_buscar text := nullif(btrim(coalesce(p_buscar, '')), '');
  v_patron text;
  v_tipo text := 'dinero';
  v_titulo text;
  v_signo int := 1;
  v_res jsonb;
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;
  if p_desde is null or p_hasta is null then
    raise exception 'Falta el periodo.';
  end if;
  v_patron := case when v_buscar is null then null
    else '%' || replace(replace(replace(lower(v_buscar), '\', '\\'), '%', '\%'), '_', '\_') || '%' end;

  if v_clase in ('cobros', 'propinas', 'devoluciones') and v_arg not in ('efectivo', 'terminal', 'transferencia', 'tarjeta_manual') then
    raise exception 'Tarjeta desconocida.';
  end if;
  if v_clase not in ('cobros', 'propinas', 'devoluciones', 'retiros', 'efectivo_agregado', 'bonos_vendidos', 'bonos_consumidos',
      'descuentos', 'ventas_vendido', 'ventas_productos', 'ventas_conceptos', 'ventas_cobrado', 'estetica_ingreso', 'estetica_servicio',
      'op_guarderia', 'op_hotel', 'op_estetica', 'op_canceladas', 'op_no_llego') then
    raise exception 'Tarjeta desconocida.';
  end if;
  if v_clase = 'estetica_servicio' and v_arg is null then
    raise exception 'Falta el servicio.';
  end if;
  v_titulo := case v_clase
    when 'cobros' then 'Cobros en ' || replace(v_arg, '_', ' ')
    when 'propinas' then 'Propinas en ' || replace(v_arg, '_', ' ')
    when 'devoluciones' then 'Devoluciones en ' || replace(v_arg, '_', ' ')
    when 'retiros' then 'Retiros de caja'
    when 'efectivo_agregado' then 'Efectivo agregado a la caja'
    when 'bonos_vendidos' then 'Bonos vendidos'
    when 'bonos_consumidos' then 'Bonos consumidos'
    when 'descuentos' then 'Descuentos otorgados'
    when 'ventas_vendido' then 'Ventas de mostrador: vendido'
    when 'ventas_productos' then 'Ventas de mostrador: productos'
    when 'ventas_conceptos' then 'Ventas de mostrador: conceptos libres'
    when 'ventas_cobrado' then 'Ventas de mostrador: cobrado (neto)'
    when 'estetica_ingreso' then 'Ingreso de estética'
    when 'estetica_servicio' then 'Ingreso de estética por servicio'
    when 'op_guarderia' then 'Días de guardería'
    when 'op_hotel' then 'Noches de hotel'
    when 'op_estetica' then 'Citas de estética finalizadas'
    when 'op_canceladas' then 'Estancias canceladas'
    else 'Citas en las que el cliente no llegó' end;
  if v_clase in ('op_guarderia', 'op_hotel', 'op_estetica', 'op_canceladas', 'op_no_llego') then v_tipo := 'cantidad'; end if;
  if v_clase = 'devoluciones' or v_clase = 'retiros' then v_signo := -1; end if;

  with base as (
    -- Cobros: lo recibido en cada método (con la fecha en que surte efecto, igual que el reporte financiero).
    select cm.id::text as rid, coalesce(cm.fecha_efecto, c.created_at) as fecha, c.reserva_id, null::uuid as perro_id,
      null::text as concepto, c.created_by as usuario, cm.metodo, cm.monto as monto, c.notas as detalle,
      '/caja/cobrar/' || c.reserva_id as href, null::numeric as descuento, null::uuid as cliente_id
    from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
    where v_clase = 'cobros' and cm.metodo = v_arg
      and public.fecha_negocio(coalesce(cm.fecha_efecto, c.created_at)) between p_desde and p_hasta
    union all
    select cm.id::text, coalesce(cm.fecha_efecto, c.created_at), c.reserva_id, null, null, c.created_by, cm.metodo, cm.propina, c.notas,
      '/caja/cobrar/' || c.reserva_id, null, null
    from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
    where v_clase = 'propinas' and cm.metodo = v_arg and cm.propina <> 0
      and public.fecha_negocio(coalesce(cm.fecha_efecto, c.created_at)) between p_desde and p_hasta
    union all
    select dm.id::text, d.created_at, c.reserva_id, null, null, d.created_by, dm.metodo, dm.monto, d.motivo,
      '/caja/cobrar/' || c.reserva_id, null, null
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    join public.cobros c on c.id = d.cobro_id
    where v_clase = 'devoluciones' and dm.metodo = v_arg
      and public.fecha_negocio(d.created_at) between p_desde and p_hasta
    union all
    select m.id::text, m.created_at, null, null, m.motivo, m.created_by, 'efectivo', m.monto, m.nota, '/caja/turno', null, null
    from public.movimientos_caja m
    where v_clase = 'retiros' and m.deleted_at is null and m.tipo = 'retiro'
      and public.fecha_negocio(m.created_at) between p_desde and p_hasta
    union all
    select m.id::text, m.created_at, null, null, m.motivo, m.created_by, 'efectivo', m.monto, m.nota, '/caja/turno', null, null
    from public.movimientos_caja m
    where v_clase = 'efectivo_agregado' and m.deleted_at is null and m.tipo = 'ingreso'
      and public.fecha_negocio(m.created_at) between p_desde and p_hasta
    union all
    select mb.id::text, mb.created_at, bc.reserva_id, bc.perro_id, s.nombre, mb.created_by, null,
      case when mb.tipo = 'devolucion' then -mb.monto else mb.monto end,
      case mb.tipo when 'venta' then 'Venta del bono' when 'consumo' then 'Día o sesión consumido' else 'Devolución de un día' end,
      '/clientes/' || bc.cliente_id, null, bc.cliente_id
    from public.movimientos_bono mb
    join public.bonos_clientes bc on bc.id = mb.bono_cliente_id
    join public.servicios s on s.id = bc.servicio_id
    where ((v_clase = 'bonos_vendidos' and mb.tipo = 'venta') or (v_clase = 'bonos_consumidos' and mb.tipo in ('consumo', 'devolucion')))
      and public.fecha_negocio(mb.created_at) between p_desde and p_hasta
    union all
    select da.id::text, da.created_at, da.reserva_id, null,
      cd.etiqueta || case da.tipo when 'porcentaje' then ' (' || trim(trailing '.' from trim(trailing '0' from da.valor::text)) || ' %)' else '' end,
      da.created_by, null, da.monto_aplicado, da.motivo_adicional, '/caja/cobrar/' || da.reserva_id, da.monto_aplicado, null
    from public.descuentos_aplicados da
    join public.catalogo_descuentos cd on cd.id = da.catalogo_descuento_id
    where v_clase = 'descuentos' and not da.cancelado
      and public.fecha_negocio(da.created_at) between p_desde and p_hasta
    union all
    select v.id::text, v.created_at, v.reserva_id, null,
      v.concepto || case when v.cantidad <> 1 then ' × ' || trim(trailing '.' from trim(trailing '0' from v.cantidad::text)) else '' end,
      v.created_by, null, round(v.precio_unitario * v.cantidad, 2),
      case when v.insumo_id is null then 'Concepto libre' else 'Producto' end,
      '/caja/cobrar/' || v.reserva_id, null, null
    from public.ventas_mostrador v
    where v_clase in ('ventas_vendido', 'ventas_productos', 'ventas_conceptos') and v.deleted_at is null and not v.cancelado
      and public.fecha_negocio(v.created_at) between p_desde and p_hasta
      and (v_clase = 'ventas_vendido' or (v_clase = 'ventas_productos' and v.insumo_id is not null) or (v_clase = 'ventas_conceptos' and v.insumo_id is null))
    union all
    -- Cobrado (neto) de las cuentas con venta de mostrador del periodo: todo lo cobrado menos todo lo devuelto.
    select cm.id::text, coalesce(cm.fecha_efecto, c.created_at), c.reserva_id, null, null, c.created_by, cm.metodo, cm.monto, 'Cobro',
      '/caja/cobrar/' || c.reserva_id, null, null
    from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
    where v_clase = 'ventas_cobrado' and c.reserva_id in (
      select v.reserva_id from public.ventas_mostrador v
      where v.deleted_at is null and not v.cancelado and public.fecha_negocio(v.created_at) between p_desde and p_hasta)
    union all
    select dm.id::text, d.created_at, c.reserva_id, null, null, d.created_by, dm.metodo, -dm.monto, 'Devolución: ' || d.motivo,
      '/caja/cobrar/' || c.reserva_id, null, null
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    join public.cobros c on c.id = d.cobro_id
    where v_clase = 'ventas_cobrado' and c.reserva_id in (
      select v.reserva_id from public.ventas_mostrador v
      where v.deleted_at is null and not v.cancelado and public.fecha_negocio(v.created_at) between p_desde and p_hasta)
    union all
    -- Estética: citas finalizadas del periodo (por la fecha de la cita).
    select ce.id::text, ce.inicio, ce.reserva_id, ce.perro_id, coalesce(s.nombre, ce.servicio_nombre), ce.created_by, null, ce.precio,
      'Atendió: ' || coalesce(pr.nombre_completo, 'sin asignar'), '/estetica/' || ce.id, null, null
    from public.citas_estetica ce
    left join public.servicios s on s.id = ce.servicio_id
    left join public.profiles pr on pr.id = ce.empleado_id
    where v_clase in ('estetica_ingreso', 'estetica_servicio', 'op_estetica') and ce.estado = 'finalizada' and ce.deleted_at is null
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
      and (v_clase <> 'estetica_servicio' or ce.servicio_id::text = v_arg)
    union all
    select ce.id::text, ce.inicio, ce.reserva_id, ce.perro_id, coalesce(s.nombre, ce.servicio_nombre), ce.created_by, null, 1,
      'Cita en la que no llegó', '/estetica/' || ce.id, null, null
    from public.citas_estetica ce
    left join public.servicios s on s.id = ce.servicio_id
    where v_clase = 'op_no_llego' and ce.estado = 'no_llego' and ce.deleted_at is null
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
    union all
    -- Guardería y hotel: estancias que empiezan en el periodo.
    select e.id::text, e.fecha_entrada::timestamp at time zone public.zona_negocio(), e.reserva_id, e.perro_id, s.nombre, e.created_by, null,
      case v_clase when 'op_hotel' then (e.fecha_salida - e.fecha_entrada)::numeric else 1 end,
      e.estado || case when v_clase = 'op_hotel' then ' · ' || (e.fecha_salida - e.fecha_entrada) || ' noches' else '' end,
      '/reservas/' || e.reserva_id, null, null
    from public.estancias e join public.servicios s on s.id = e.servicio_id
    where e.deleted_at is null and e.fecha_entrada between p_desde and p_hasta
      and ((v_clase = 'op_guarderia' and s.categoria = 'guarderia' and e.estado <> 'cancelada')
        or (v_clase = 'op_hotel' and s.categoria = 'hotel' and e.estado <> 'cancelada')
        or (v_clase = 'op_canceladas' and e.estado = 'cancelada'))
  ),
  info as materialized (
    select * from public.reporte_cuentas_info(array(select distinct b.reserva_id from base b where b.reserva_id is not null))
  ),
  completo as (
    select b.rid, b.fecha,
      coalesce(cb.nombre, i.cliente, '') as cliente,
      coalesce(pb.nombre, i.perros, '') as mascota,
      coalesce(b.concepto, i.descripcion, '') as concepto,
      coalesce(u.nombre_completo, '') as usuario,
      coalesce(b.metodo, i.metodos, '') as metodo,
      b.monto, coalesce(b.descuento, i.descuento, 0) as descuento,
      coalesce(b.detalle, '') as detalle, b.href, b.reserva_id
    from base b
    left join info i on i.reserva_id = b.reserva_id
    left join public.clientes cb on cb.id = b.cliente_id
    left join public.perros pb on pb.id = b.perro_id
    left join public.profiles u on u.id = b.usuario
  ),
  filtrado as (
    select * from completo c
    where v_patron is null or lower(c.cliente || ' ' || c.mascota || ' ' || c.concepto || ' ' || c.usuario || ' ' || c.metodo || ' ' || c.detalle) like v_patron
  ),
  pagina as (
    select f.*, row_number() over (order by
      case when v_orden = 'fecha' and v_asc then f.fecha end asc, case when v_orden = 'fecha' and not v_asc then f.fecha end desc,
      case when v_orden = 'cliente' and v_asc then lower(f.cliente) end asc, case when v_orden = 'cliente' and not v_asc then lower(f.cliente) end desc,
      case when v_orden = 'mascota' and v_asc then lower(f.mascota) end asc, case when v_orden = 'mascota' and not v_asc then lower(f.mascota) end desc,
      case when v_orden = 'concepto' and v_asc then lower(f.concepto) end asc, case when v_orden = 'concepto' and not v_asc then lower(f.concepto) end desc,
      case when v_orden = 'usuario' and v_asc then lower(f.usuario) end asc, case when v_orden = 'usuario' and not v_asc then lower(f.usuario) end desc,
      case when v_orden = 'metodo' and v_asc then f.metodo end asc, case when v_orden = 'metodo' and not v_asc then f.metodo end desc,
      case when v_orden = 'monto' and v_asc then f.monto end asc, case when v_orden = 'monto' and not v_asc then f.monto end desc,
      case when v_orden = 'descuento' and v_asc then f.descuento end asc, case when v_orden = 'descuento' and not v_asc then f.descuento end desc,
      f.fecha desc, f.rid) as rn
    from filtrado f
    order by rn
    limit p_limite offset greatest(coalesce(p_desplazamiento, 0), 0)
  )
  select jsonb_build_object(
    'tarjeta', p_tarjeta,
    'titulo', v_titulo,
    'tipo_total', v_tipo,
    'signo', v_signo,
    'total', (select coalesce(sum(monto), 0) from completo),
    'total_filas_tarjeta', (select count(*) from completo),
    'total_filtrado', (select coalesce(sum(monto), 0) from filtrado),
    'total_filas', (select count(*) from filtrado),
    'filas', coalesce((select jsonb_agg(jsonb_build_object(
        'id', p.rid, 'fecha', p.fecha, 'cliente', p.cliente, 'mascota', p.mascota, 'concepto', p.concepto,
        'usuario', p.usuario, 'metodo', p.metodo, 'monto', p.monto, 'descuento', p.descuento, 'detalle', p.detalle, 'href', p.href)
        order by p.rn) from pagina p), '[]'::jsonb)
  ) into v_res;
  return v_res;
end;
$$;
alter function public.reporte_desglose(text, date, date, text, text, text, int, int) owner to peludesk_definer;
revoke execute on function public.reporte_desglose(text, date, date, text, text, text, int, int) from public, anon;
grant execute on function public.reporte_desglose(text, date, date, text, text, text, int, int) to authenticated, service_role;
