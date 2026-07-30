-- Estado explícito de un bono — mismo principio que
-- perro_requisitos_sanitarios_estado y tarifas_vigentes: nunca un hueco
-- silencioso, siempre una palabra que diga qué está pasando.
create view public.bonos_clientes_estado
with (security_invoker = true)
as
select
  bc.id,
  bc.cliente_id,
  bc.servicio_id,
  s.nombre as servicio_nombre,
  s.servicio_incluido_id,
  si.nombre as servicio_incluido_nombre,
  bc.cantidad_total,
  bc.cantidad_disponible,
  bc.precio_pagado,
  bc.fecha_compra,
  bc.fecha_vencimiento,
  case
    when bc.deleted_at is not null then 'cancelado'
    when bc.cantidad_disponible = 0 then 'agotado'
    when bc.fecha_vencimiento is not null and bc.fecha_vencimiento < public.fecha_negocio() then 'vencido'
    else 'activo'
  end as estado
from public.bonos_clientes bc
join public.servicios s on s.id = bc.servicio_id
left join public.servicios si on si.id = s.servicio_incluido_id;

-- Vender un bono: crea la reserva de un solo renglón que lo va a cobrar
-- (mismo patrón que crearCita para citas sueltas), resuelve el precio con
-- resolver_precio() como cualquier otra cosa que se cobra, registra la
-- venta como ingreso DIFERIDO en movimientos_bono, y cobra de verdad
-- reusando registrar_cobro() — un solo camino de dinero entrando a la
-- caja, para que el arqueo (Bloque D) no tenga que sumar de dos fuentes.
--
-- p_cantidad de resolver_precio se fija en 1: un bono se vende como UNA
-- pieza (el paquete completo), no por las sesiones que incluye — vender
-- dos bonos son dos llamadas, dos bonos_clientes con su propio saldo.
create or replace function public.comprar_bono(
  p_cliente_id uuid,
  p_servicio_id uuid,
  p_notas text,
  p_metodos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_servicio public.servicios%rowtype;
  v_precio numeric;
  v_estado_precio text;
  v_turno_id uuid;
  v_reserva_id uuid;
  v_bono_id uuid;
  v_fecha_vencimiento date;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden vender un bono.';
  end if;

  select * into v_servicio from public.servicios
  where id = p_servicio_id and categoria = 'bono' and deleted_at is null;
  if not found then
    raise exception 'Bono no encontrado en el catálogo.';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and deleted_at is null) then
    raise exception 'Cliente no encontrado.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de vender un bono.';
  end if;

  select precio, estado into v_precio, v_estado_precio
  from public.resolver_precio(p_servicio_id, null, null, 1, public.fecha_negocio());

  if v_estado_precio = 'sin_tarifa' then
    raise exception 'No hay tarifa capturada para este bono. Captúrala antes de venderlo.';
  elsif v_estado_precio = 'no_aplica' then
    raise exception 'Este bono no aplica.';
  end if;

  insert into public.reservas (cliente_id, notas)
  values (p_cliente_id, 'Compra de bono: ' || v_servicio.nombre)
  returning id into v_reserva_id;

  v_fecha_vencimiento := case
    when v_servicio.vigencia_dias is not null then public.fecha_negocio() + v_servicio.vigencia_dias
    else null
  end;

  insert into public.bonos_clientes (
    cliente_id, servicio_id, reserva_id, cantidad_total, cantidad_disponible,
    precio_pagado, fecha_compra, fecha_vencimiento
  )
  values (
    p_cliente_id, p_servicio_id, v_reserva_id, v_servicio.cantidad_incluida, v_servicio.cantidad_incluida,
    v_precio, public.fecha_negocio(), v_fecha_vencimiento
  )
  returning id into v_bono_id;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, turno_id, created_by)
  values (v_bono_id, 'venta', v_servicio.cantidad_incluida, v_precio, v_turno_id, auth.uid());

  perform public.registrar_cobro(v_reserva_id, p_notas, p_metodos);

  return v_bono_id;
end;
$$;

revoke execute on function public.comprar_bono(uuid, uuid, text, jsonb) from public;
grant execute on function public.comprar_bono(uuid, uuid, text, jsonb) to authenticated;

-- Consumir una unidad (o varias, p. ej. 3 noches de hotel) de un bono
-- para cubrir una línea real ya existente (estancia, cargo o cita). No
-- mueve dinero nuevo — descuenta cantidad_disponible y registra el
-- ingreso reconocido correspondiente. Válido para cualquier turno o sin
-- turno abierto: a diferencia de un cobro, aquí no entra ni sale efectivo
-- de la caja, así que no depende del arqueo.
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
    select e.servicio_id, p.cliente_id, e.estado into v_item_servicio_id, v_item_cliente_id, v_item_estado
    from public.estancias e join public.perros p on p.id = e.perro_id
    where e.id = p_item_id;
  elsif p_item_tipo = 'cargo' then
    select c.servicio_id, p.cliente_id,
      case when c.cancelado then 'cancelada' else 'activa' end
      into v_item_servicio_id, v_item_cliente_id, v_item_estado
    from public.cargos_aplicados c
    join public.estancias e on e.id = c.estancia_id
    join public.perros p on p.id = e.perro_id
    where c.id = p_item_id;
  else
    select ce.servicio_id, p.cliente_id, ce.estado into v_item_servicio_id, v_item_cliente_id, v_item_estado
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
