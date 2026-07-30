-- Bug real, encontrado probando la pantalla: nada impedía aplicar un
-- bono dos veces contra la MISMA línea (la pantalla no ocultaba el botón
-- "Pagar con bono" en una línea ya cubierta, y el RPC tampoco lo
-- validaba) — cada clic de más gastaba otra unidad del bono sin motivo y
-- hundía el saldo por debajo de cero. Se agrega el tope: la cantidad ya
-- cubierta más la nueva no puede pasar de la cantidad propia de la línea
-- (noches de la estancia, cantidad del cargo, o 1 para una cita).
create or replace function public.consumir_bono(
  p_bono_cliente_id uuid,
  p_item_tipo text,
  p_item_id uuid,
  p_cantidad int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bono record;
  v_item_servicio_id uuid;
  v_item_cliente_id uuid;
  v_item_estado text;
  v_item_cantidad int;
  v_ya_cubierta int;
  v_monto numeric;
  v_turno_id uuid;
  v_movimiento_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un bono.';
  end if;

  if p_item_tipo not in ('estancia', 'cargo', 'estetica') then
    raise exception 'Tipo de línea inválido: %', p_item_tipo;
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad a cubrir con el bono debe ser al menos 1.';
  end if;

  select bc.id, bc.cliente_id, bc.cantidad_disponible, bc.cantidad_total, bc.precio_pagado,
    bc.fecha_vencimiento, s.servicio_incluido_id
  into v_bono
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.id = p_bono_cliente_id and bc.deleted_at is null;

  if not found then
    raise exception 'Bono no encontrado.';
  end if;

  if v_bono.fecha_vencimiento is not null and v_bono.fecha_vencimiento < public.fecha_negocio() then
    raise exception 'Este bono ya venció.';
  end if;

  if v_bono.cantidad_disponible < p_cantidad then
    raise exception 'El bono no tiene suficientes unidades disponibles (quedan %).', v_bono.cantidad_disponible;
  end if;

  if p_item_tipo = 'estancia' then
    select e.servicio_id, p.cliente_id, e.estado, (e.fecha_salida - e.fecha_entrada)
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad
    from public.estancias e join public.perros p on p.id = e.perro_id
    where e.id = p_item_id;
  elsif p_item_tipo = 'cargo' then
    select c.servicio_id, p.cliente_id,
      case when c.cancelado then 'cancelada' else 'activa' end,
      c.cantidad
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad
    from public.cargos_aplicados c
    join public.estancias e on e.id = c.estancia_id
    join public.perros p on p.id = e.perro_id
    where c.id = p_item_id;
  else
    select ce.servicio_id, p.cliente_id, ce.estado, 1
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad
    from public.citas_estetica ce join public.perros p on p.id = ce.perro_id
    where ce.id = p_item_id;
  end if;

  if v_item_servicio_id is null then
    raise exception 'No se encontró esa línea.';
  end if;

  if v_item_estado in ('cancelada', 'no_llego') then
    raise exception 'Esa línea está cancelada; no se le puede aplicar un bono.';
  end if;

  if v_item_cliente_id is distinct from v_bono.cliente_id then
    raise exception 'Este bono no pertenece al cliente de esa línea.';
  end if;

  if v_item_servicio_id is distinct from v_bono.servicio_incluido_id then
    raise exception 'Este bono no aplica al servicio de esa línea.';
  end if;

  select coalesce(sum(mb.cantidad), 0) into v_ya_cubierta
  from public.movimientos_bono mb
  where mb.tipo = 'consumo' and mb.item_tipo = p_item_tipo and mb.item_id = p_item_id;

  if v_ya_cubierta + p_cantidad > v_item_cantidad then
    raise exception 'Esa línea ya tiene % de % unidades cubiertas con bono; no se puede cubrir más de lo que vale.',
      v_ya_cubierta, v_item_cantidad;
  end if;

  update public.bonos_clientes
  set cantidad_disponible = cantidad_disponible - p_cantidad
  where id = p_bono_cliente_id;

  v_monto := round((v_bono.precio_pagado / v_bono.cantidad_total) * p_cantidad, 2);

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, item_tipo, item_id, turno_id, created_by)
  values (p_bono_cliente_id, 'consumo', p_cantidad, v_monto, p_item_tipo, p_item_id, v_turno_id, auth.uid())
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

revoke execute on function public.consumir_bono(uuid, text, uuid, int) from public;
grant execute on function public.consumir_bono(uuid, text, uuid, int) to authenticated;
