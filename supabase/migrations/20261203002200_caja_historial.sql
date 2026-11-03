-- Caja · historial de movimientos (ux/caja-historial, 3 de noviembre de 2026; solo funciones, nada de datos).
-- docs/caja-y-cuentas.md. Los movimientos de VARIOS turnos con filtros, y el detalle de uno, sobre la MISMA unión que
-- ya usa /caja/turno (movimientos_turno): cobros y abonos, ventas, devoluciones, anulaciones y correcciones, retiros
-- (también los de un gasto pagado de caja) y efectivo agregado.
-- Reglas que aplica la BASE (no solo la pantalla):
--   · Solo admin y recepción. Recepción ve el turno abierto y los turnos que abrió ella; el admin, todos.
--   · Corte ciego: con el turno abierto, quien no es admin no recibe montos de ese turno ni totales que lo incluyan.
--   · La factura de un cobro solo con permiso de facturación; el gasto y su comprobante, solo con el de gastos.

create or replace function public.caja_movimientos(
  p_desde date, p_hasta date, p_turno uuid default null, p_tipo text default null, p_metodo text default null,
  p_limite int default 50, p_desplazamiento int default 0)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_rol text := public.current_rol();
  v_admin boolean := coalesce(public.is_admin(), false);
  v_uid uuid := auth.uid();
  v_zona text := public.zona_negocio();
  v_lim int := least(greatest(coalesce(p_limite, 50), 1), 200);
  v_salida jsonb;
begin
  if v_rol not in ('admin', 'recepcion') then
    raise exception 'Solo admin y recepción ven el historial de caja.' using errcode = '42501';
  end if;
  with turnos as (
    select t.id, t.estado, t.abierto_at, t.cerrado_at
    from public.turnos_caja t
    where t.negocio_id = v_neg and t.deleted_at is null
      and (p_turno is null or t.id = p_turno)
      and (v_admin or t.abierto_por = v_uid or t.estado = 'abierto')
      and (t.abierto_at at time zone v_zona)::date <= p_hasta
      and coalesce((t.cerrado_at at time zone v_zona)::date, public.fecha_negocio()) >= p_desde
  ),
  movs as (
    select m.*, t.id as turno_id, (t.estado = 'abierto') as abierto, (t.abierto_at at time zone v_zona)::date as turno_dia
    from turnos t
    cross join lateral public.movimientos_turno(t.id) m
    where (m.fecha at time zone v_zona)::date between p_desde and p_hasta
      and (p_tipo is null
           or (p_tipo = 'anulacion' and m.ajuste_tipo is not null)
           or (p_tipo = 'gasto' and m.tipo = 'retiro' and m.descripcion like 'Gasto:%')
           or (p_tipo = 'cobro' and m.tipo in ('cobro', 'venta_mostrador', 'venta_bono') and m.ajuste_tipo is null)
           or (p_tipo not in ('anulacion', 'gasto', 'cobro') and m.tipo = p_tipo))
      and (p_metodo is null or m.metodo = p_metodo)
  ),
  ciego as (select (not v_admin) and exists (select 1 from movs where abierto) as hay)
  select jsonb_build_object(
    'total', (select count(*) from movs),
    'ciego', (select hay from ciego),
    'totales_por_metodo', case when (select hay from ciego) then null else (
      select coalesce(jsonb_object_agg(x.metodo, x.suma), '{}'::jsonb)
      from (select coalesce(metodo, 'efectivo') as metodo, sum(monto) as suma from movs group by 1) x) end,
    'movimientos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'tipo', m.tipo, 'fecha', m.fecha, 'turno_id', m.turno_id, 'turno_dia', m.turno_dia, 'turno_abierto', m.abierto,
               'reserva_id', m.reserva_id, 'cliente_id', r.cliente_id, 'cliente_nombre', m.cliente_nombre, 'descripcion', m.descripcion,
               'metodo', m.metodo, 'origen', m.origen, 'ajuste_tipo', m.ajuste_tipo, 'grupo_id', m.grupo_id,
               'hecho_por', public.nombre_de_persona(m.hecho_por, null),
               'monto', case when m.abierto and not v_admin then null else m.monto end,
               'propina', case when m.abierto and not v_admin then null else m.propina end)
             order by m.fecha desc, m.id)
      from (select * from movs order by fecha desc, id limit v_lim offset greatest(coalesce(p_desplazamiento, 0), 0)) m
      left join public.reservas r on r.id = m.reserva_id
    ), '[]'::jsonb)
  ) into v_salida;
  return v_salida;
end;
$$;
alter function public.caja_movimientos(date, date, uuid, text, text, int, int) owner to peludesk_definer;
revoke execute on function public.caja_movimientos(date, date, uuid, text, text, int, int) from public, anon;
grant execute on function public.caja_movimientos(date, date, uuid, text, text, int, int) to authenticated, service_role;

create or replace function public.caja_movimiento_detalle(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_rol text := public.current_rol();
  v_admin boolean := coalesce(public.is_admin(), false);
  v_uid uuid := auth.uid();
  v_cobro uuid;
  v_turno uuid;
  v_reserva uuid;
  v_mov jsonb;
  v_extra jsonb := '{}'::jsonb;
  v_abierto boolean;
  v_ciego boolean;
  v_hay boolean;
begin
  if v_rol not in ('admin', 'recepcion') then
    raise exception 'Solo admin y recepción ven el historial de caja.' using errcode = '42501';
  end if;
  if p_tipo in ('cobro', 'venta_mostrador', 'venta_bono') then
    select c.id, coalesce(cm.turno_efecto_id, c.turno_id), c.reserva_id into v_cobro, v_turno, v_reserva
    from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
    where cm.id = p_id and c.negocio_id = v_neg;
  elsif p_tipo = 'devolucion' then
    select c.id, d.turno_id, c.reserva_id into v_cobro, v_turno, v_reserva
    from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id join public.cobros c on c.id = d.cobro_id
    where dm.id = p_id and d.negocio_id = v_neg;
  elsif p_tipo in ('retiro', 'ingreso_efectivo') then
    select mc.turno_id into v_turno from public.movimientos_caja mc where mc.id = p_id and mc.negocio_id = v_neg;
  else
    raise exception 'Tipo de movimiento desconocido.';
  end if;
  v_hay := v_turno is not null;
  if not v_hay then
    raise exception 'No encontramos ese movimiento.';
  end if;
  select t.estado = 'abierto' into v_abierto from public.turnos_caja t
  where t.id = v_turno and (v_admin or t.abierto_por = v_uid or t.estado = 'abierto');
  v_hay := found;
  if not v_hay then
    raise exception 'Ese movimiento es de un turno que no te toca ver.' using errcode = '42501';
  end if;
  v_ciego := v_abierto and not v_admin;

  select to_jsonb(m) - 'hecho_por' || jsonb_build_object('hecho_por', public.nombre_de_persona(m.hecho_por, null))
         || case when v_ciego then jsonb_build_object('monto', null, 'propina', null) else '{}'::jsonb end
    into v_mov
  from public.movimientos_turno(v_turno) m where m.id = p_id;

  if v_cobro is not null then
    v_extra := jsonb_build_object(
      'cobro', (select jsonb_build_object('id', c.id, 'fecha', c.created_at, 'origen', c.origen, 'notas', c.notas,
                  'cobro_por', public.nombre_de_persona(c.created_by, null), 'anulado', c.anulado_at is not null, 'anulacion_motivo', c.anulacion_motivo,
                  'metodos', (select jsonb_agg(jsonb_build_object('metodo', cm.metodo, 'monto', case when v_ciego then null else cm.monto end,
                                   'propina', case when v_ciego then null else cm.propina end, 'ajuste', cm.ajuste_id is not null) order by cm.created_at)
                              from public.cobro_metodos cm where cm.cobro_id = c.id))
                from public.cobros c where c.id = v_cobro),
      'tarjeta_manual', (select jsonb_build_object('folio', tm.folio, 'banco', tm.banco, 'ultimos4', tm.ultimos4) from public.tarjetas_manuales tm where tm.cobro_id = v_cobro limit 1),
      'factura', case when public.tiene_permiso('facturar') or public.tiene_permiso('cancelar_facturas') then (
                   select jsonb_build_object('id', f.id, 'serie', f.serie, 'folio', f.folio, 'estado', f.estado)
                   from public.cfdi_factura_cobros fc join public.cfdi_facturas f on f.id = fc.factura_id
                   where fc.cobro_id = v_cobro and fc.vigente limit 1) end,
      'devoluciones', (select jsonb_agg(jsonb_build_object('fecha', d.created_at, 'motivo', d.motivo,
                         'autorizo', public.nombre_de_persona(d.autorizado_por, null),
                         'monto', case when v_ciego then null else (select sum(dm.monto) from public.devolucion_metodos dm where dm.devolucion_id = d.id) end) order by d.created_at)
                       from public.devoluciones d where d.cobro_id = v_cobro and d.deleted_at is null));
  end if;
  if v_reserva is not null then
    v_extra := v_extra || jsonb_build_object(
      'reserva_id', v_reserva,
      'cliente', (select jsonb_build_object('id', cl.id, 'nombre', cl.nombre) from public.reservas r join public.clientes cl on cl.id = r.cliente_id where r.id = v_reserva),
      'lineas', (select jsonb_agg(jsonb_build_object('tipo', l.tipo, 'descripcion', l.descripcion, 'cantidad', l.cantidad, 'precio_unitario', l.precio_unitario,
                    'total', l.total, 'estancia_id', l.estancia_id))
                 from public.cuenta_lineas_estancia(v_reserva) l),
      'citas', (select jsonb_agg(jsonb_build_object('id', ce.id, 'inicio', ce.inicio, 'servicio', ce.servicio_nombre, 'estado', ce.estado))
                from public.citas_estetica ce where ce.reserva_id = v_reserva and ce.deleted_at is null));
  end if;
  if p_tipo in ('retiro', 'ingreso_efectivo') then
    v_extra := v_extra || jsonb_build_object(
      'caja', (select jsonb_build_object('motivo', mc.motivo, 'nota', mc.nota, 'cancelado', mc.cancelado_at is not null, 'motivo_cancelacion', mc.motivo_cancelacion)
               from public.movimientos_caja mc where mc.id = p_id),
      'gasto', case when public.tiene_permiso('gastos') then (
                 select jsonb_build_object('id', g.id, 'concepto', g.concepto, 'comprobante_path', g.comprobante_path)
                 from public.gastos g where g.movimiento_caja_id = p_id and g.deleted_at is null limit 1) end);
  end if;
  return jsonb_build_object('movimiento', v_mov, 'turno_id', v_turno, 'turno_abierto', v_abierto, 'ciego', v_ciego) || v_extra;
end;
$$;
alter function public.caja_movimiento_detalle(text, uuid) owner to peludesk_definer;
revoke execute on function public.caja_movimiento_detalle(text, uuid) from public, anon;
grant execute on function public.caja_movimiento_detalle(text, uuid) to authenticated, service_role;
grant execute on function public.movimientos_turno(uuid) to peludesk_definer;
grant execute on function public.cuenta_lineas_estancia(uuid) to peludesk_definer;
