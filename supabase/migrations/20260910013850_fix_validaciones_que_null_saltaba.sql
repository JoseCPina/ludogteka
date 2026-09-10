-- Endurecimiento salido del barrido de la misma clase de error que el
-- bypass de los guardias de rol: comparaciones que evalúan a NULL y dejan
-- pasar la validación.
--
-- Estas seis validan un parámetro contra una lista cerrada con `not in`.
-- Si el valor llega NULL —y llega, porque son parámetros de la función o
-- vienen de un jsonb del cliente— `null not in (...)` es NULL, el `if`
-- no entra y la validación se salta. Comprobado en desarrollo con sesión
-- de admin: aplicar_descuento con p_tipo null pasó de largo su validación
-- y llegó hasta "Motivo de descuento no encontrado"; consumir_bono con
-- p_item_tipo null llegó hasta "Bono no encontrado"; registrar_cobro con
-- {"metodo": null} llegó hasta la revisión del turno de caja.
--
-- Cuánto importa cada una, que no es lo mismo en todas:
--
--   * consumir_bono es la única que puede ESCRIBIR basura.
--     movimientos_bono.item_tipo es nullable a propósito (un movimiento de
--     'venta' no tiene item), así que su CHECK no atrapa el NULL: se
--     habría guardado un consumo de bono sin decir contra qué se consumió.
--   * Las otras cinco terminan chocando con el NOT NULL + CHECK de su
--     columna (cobro_metodos.metodo, devolucion_metodos.metodo,
--     descuentos_aplicados.tipo, movimientos_inventario.tipo). El dato
--     nunca llegó a guardarse mal; lo que se rompía era el mensaje: en vez
--     de "El método debe ser efectivo, terminal o transferencia" salía un
--     error crudo de constraint, o peor, uno que apunta a otra cosa.
--
-- Ninguna es alcanzable sin sesión de staff (los guardias de rol ya se
-- arreglaron y se verificaron con la anon key pelada). Es integridad y
-- claridad de mensajes, no una puerta abierta.
--
-- El cuerpo de cada función es EL MISMO que ya corría: solo se le agregó
-- el `is null or` a la condición. Se generaron a partir del texto vigente
-- en las migraciones, no se volvieron a escribir a mano.

-- registrar_cobro: viene de 20260729043830_add_cobros.sql
create or replace function public.registrar_cobro(
  p_reserva_id uuid,
  p_notas text,
  p_metodos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id uuid;
  v_cobro_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_propina numeric;
  v_nombre_metodo text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden registrar cobros.';
  end if;

  if not exists (select 1 from public.reservas where id = p_reserva_id) then
    raise exception 'Reserva no encontrada.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método de pago.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de cobrar.';
  end if;

  insert into public.cobros (reserva_id, turno_id, notas, created_by)
  values (p_reserva_id, v_turno_id, nullif(btrim(p_notas), ''), auth.uid())
  returning id into v_cobro_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;
    v_propina := coalesce((v_metodo ->> 'propina')::numeric, 0);

    if v_nombre_metodo is null or v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;
    if v_propina < 0 then
      raise exception 'La propina no puede ser negativa.';
    end if;

    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, created_by)
    values (v_cobro_id, v_nombre_metodo, v_monto, v_propina, auth.uid());
  end loop;

  return v_cobro_id;
end;
$$;

-- registrar_devolucion: viene de 20260729043904_add_devoluciones.sql
create or replace function public.registrar_devolucion(
  p_cobro_id uuid,
  p_motivo text,
  p_metodos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno_id uuid;
  v_devolucion_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_nombre_metodo text;
  v_cobrado numeric;
  v_ya_devuelto numeric;
  v_total_nuevo numeric;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede registrar una devolución.';
  end if;

  if not exists (select 1 from public.cobros where id = p_cobro_id) then
    raise exception 'Cobro no encontrado.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la devolución.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método a devolver.';
  end if;

  select coalesce(sum(monto), 0) into v_cobrado
  from public.cobro_metodos where cobro_id = p_cobro_id;

  select coalesce(sum(dm.monto), 0) into v_ya_devuelto
  from public.devolucion_metodos dm
  join public.devoluciones d on d.id = dm.devolucion_id
  where d.cobro_id = p_cobro_id;

  v_total_nuevo := (
    select coalesce(sum((m ->> 'monto')::numeric), 0)
    from jsonb_array_elements(p_metodos) m
  );

  if v_ya_devuelto + v_total_nuevo > v_cobrado then
    raise exception 'No se puede devolver más de lo que sigue cobrado en este cobro (cobrado: %, ya devuelto: %).',
      v_cobrado, v_ya_devuelto;
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de registrar la devolución.';
  end if;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by)
  values (p_cobro_id, v_turno_id, btrim(p_motivo), auth.uid(), auth.uid())
  returning id into v_devolucion_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;

    if v_nombre_metodo is null or v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;

    insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
    values (v_devolucion_id, v_nombre_metodo, v_monto, auth.uid());
  end loop;

  return v_devolucion_id;
end;
$$;

-- consumir_bono: viene de 20260729051255_fix_consumir_bono_evitar_doble_cobertura.sql
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

  if p_item_tipo is null or p_item_tipo not in ('estancia', 'cargo', 'estetica') then
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

-- aplicar_descuento: viene de 20260729052922_add_aplicar_descuento.sql
create or replace function public.aplicar_descuento(
  p_reserva_id uuid,
  p_catalogo_descuento_id uuid,
  p_tipo text,
  p_valor numeric,
  p_motivo_adicional text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_cuenta numeric;
  v_ya_descontado numeric;
  v_monto_aplicado numeric;
  v_tope numeric;
  v_autorizado_por uuid;
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un descuento.';
  end if;

  if not exists (select 1 from public.reservas where id = p_reserva_id) then
    raise exception 'Reserva no encontrada.';
  end if;

  if p_tipo is null or p_tipo not in ('porcentaje', 'monto_fijo') then
    raise exception 'Tipo de descuento inválido: %', p_tipo;
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'El valor del descuento debe ser mayor a cero.';
  end if;
  if p_tipo = 'porcentaje' and p_valor > 100 then
    raise exception 'Un descuento por porcentaje no puede pasar de 100.';
  end if;

  if not exists (
    select 1 from public.catalogo_descuentos where id = p_catalogo_descuento_id and deleted_at is null
  ) then
    raise exception 'Motivo de descuento no encontrado.';
  end if;

  select total_cuenta into v_total_cuenta from public.cuenta_totales_reserva(p_reserva_id);

  select coalesce(sum(monto_aplicado), 0) into v_ya_descontado
  from public.descuentos_aplicados
  where reserva_id = p_reserva_id and cancelado = false;

  v_monto_aplicado := case
    when p_tipo = 'porcentaje' then round(v_total_cuenta * p_valor / 100, 2)
    else p_valor
  end;

  if v_monto_aplicado <= 0 then
    raise exception 'El descuento calculado debe ser mayor a cero.';
  end if;

  if v_ya_descontado + v_monto_aplicado > v_total_cuenta then
    raise exception 'Ese descuento deja la cuenta en negativo (total de la cuenta: %, ya descontado: %).',
      v_total_cuenta, v_ya_descontado;
  end if;

  select tope_recepcion into v_tope from public.resolver_tope_descuento_recepcion(public.fecha_negocio());
  v_tope := coalesce(v_tope, 0);

  v_autorizado_por := null;
  if v_monto_aplicado > v_tope then
    if not public.is_admin() then
      raise exception 'Este descuento ($%) pasa el tope de recepción ($%). Solo un admin puede aplicarlo.',
        v_monto_aplicado, v_tope;
    end if;
    if p_motivo_adicional is null or btrim(p_motivo_adicional) = '' then
      raise exception 'Un descuento arriba del tope necesita un motivo por escrito.';
    end if;
    v_autorizado_por := auth.uid();
  end if;

  insert into public.descuentos_aplicados (
    reserva_id, catalogo_descuento_id, tipo, valor, monto_aplicado, motivo_adicional, autorizado_por, created_by
  ) values (
    p_reserva_id, p_catalogo_descuento_id, p_tipo, p_valor, v_monto_aplicado,
    nullif(btrim(p_motivo_adicional), ''), v_autorizado_por, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- registrar_salida: viene de 20260729154747_add_inventario_funciones.sql
create or replace function public.registrar_salida(
  p_insumo_id uuid,
  p_cantidad_consumo numeric,
  p_tipo text,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equivalencia numeric;
  v_cantidad_base numeric;
  v_existencia numeric;
  v_tipo_real text;
  v_movimiento_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Solo personal del negocio puede registrar salidas de inventario.';
  end if;

  if p_tipo is null or p_tipo not in ('consumo', 'merma') then
    raise exception 'Tipo de salida inválido.';
  end if;
  v_tipo_real := case p_tipo when 'consumo' then 'salida_consumo' else 'salida_merma' end;

  if p_tipo = 'merma' and (p_motivo is null or btrim(p_motivo) = '') then
    raise exception 'Escribe el motivo de la merma.';
  end if;

  if p_cantidad_consumo is null or p_cantidad_consumo <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select um.equivalencia_en_base into v_equivalencia
  from public.insumos i
  join public.unidades_medida um on um.id = i.unidad_consumo_id
  where i.id = p_insumo_id and i.deleted_at is null;

  if v_equivalencia is null then
    raise exception 'Insumo no encontrado.';
  end if;

  v_cantidad_base := p_cantidad_consumo * v_equivalencia;
  v_existencia := public.existencia_actual_insumo(p_insumo_id);

  if v_cantidad_base > v_existencia then
    raise exception 'No hay suficiente existencia de este insumo (queda menos de lo que intentas sacar).';
  end if;

  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo)
  values (p_insumo_id, v_tipo_real, v_cantidad_base, nullif(btrim(coalesce(p_motivo, '')), ''))
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

-- registrar_ajuste: viene de 20260729154747_add_inventario_funciones.sql
create or replace function public.registrar_ajuste(
  p_insumo_id uuid,
  p_cantidad_consumo numeric,
  p_sentido text,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equivalencia numeric;
  v_cantidad_base numeric;
  v_existencia numeric;
  v_tipo_real text;
  v_movimiento_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Solo personal del negocio puede registrar ajustes de inventario.';
  end if;

  if p_sentido is null or p_sentido not in ('positivo', 'negativo') then
    raise exception 'Sentido de ajuste inválido.';
  end if;
  v_tipo_real := case p_sentido when 'positivo' then 'ajuste_positivo' else 'ajuste_negativo' end;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo del ajuste.';
  end if;

  if p_cantidad_consumo is null or p_cantidad_consumo <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select um.equivalencia_en_base into v_equivalencia
  from public.insumos i
  join public.unidades_medida um on um.id = i.unidad_consumo_id
  where i.id = p_insumo_id and i.deleted_at is null;

  if v_equivalencia is null then
    raise exception 'Insumo no encontrado.';
  end if;

  v_cantidad_base := p_cantidad_consumo * v_equivalencia;

  if p_sentido = 'negativo' then
    v_existencia := public.existencia_actual_insumo(p_insumo_id);
    if v_cantidad_base > v_existencia then
      raise exception 'El ajuste negativo no puede dejar la existencia en negativo.';
    end if;
  end if;

  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo)
  values (p_insumo_id, v_tipo_real, v_cantidad_base, btrim(p_motivo))
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

