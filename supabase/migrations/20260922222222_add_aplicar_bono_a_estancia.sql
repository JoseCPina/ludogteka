-- Day pass desde Guardería: que la app use sola los pases del cliente al
-- reservar, en vez de cobrar el día suelto.
--
-- Los bonos son DEL CLIENTE, no del perro: bonos_clientes.cliente_id, y
-- consumir_bono (Fase 5) exige que la línea sea de un perro de ese
-- cliente — cualquiera de sus perros consume del mismo paquete. Este RPC
-- no cambia eso; solo decide cuál bono usar y lo consume.
--
-- Regla cuando hay más de uno vigente (pase + mensualidad, o dos
-- paquetes): se consume el que VENCE PRIMERO. Es la regla que nunca
-- pierde nada: si la mensualidad vence antes, los pases se guardan para
-- después; si los pases vencen antes, se usan ellos y la mensualidad
-- sigue cubriendo. Un pase vencido con días sin usar se pierde — eso lo
-- enseña la pantalla, no lo evita el RPC.
create or replace function public.aplicar_bono_a_estancia(p_estancia_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estancia record;
  v_cliente_id uuid;
  v_unidad text;
  v_categoria text;
  v_dias int;
  v_cubierta int;
  v_faltante int;
  v_bono record;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un bono.';
  end if;

  select e.id, e.perro_id, e.servicio_id, e.estado, e.fecha_entrada, e.fecha_salida
    into v_estancia
  from public.estancias e
  where e.id = p_estancia_id and e.deleted_at is null;

  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if v_estancia.estado in ('cancelada', 'no_llego') then
    return jsonb_build_object('aplicado', false, 'motivo', 'estancia_inactiva');
  end if;

  select s.unidad, s.categoria into v_unidad, v_categoria
  from public.servicios s where s.id = v_estancia.servicio_id;

  -- Solo el día completo de guardería se cubre con pases. Por hora y
  -- hotel no tienen bono que los incluya; se cobran como siempre.
  if v_categoria <> 'guarderia' or v_unidad <> 'dia' then
    return jsonb_build_object('aplicado', false, 'motivo', 'no_aplica');
  end if;

  select p.cliente_id into v_cliente_id from public.perros p where p.id = v_estancia.perro_id;

  v_dias := v_estancia.fecha_salida - v_estancia.fecha_entrada;

  select coalesce(sum(mb.cantidad), 0) into v_cubierta
  from public.movimientos_bono mb
  where mb.tipo = 'consumo' and mb.item_tipo = 'estancia' and mb.item_id = p_estancia_id;

  v_faltante := v_dias - v_cubierta;
  if v_faltante <= 0 then
    return jsonb_build_object('aplicado', false, 'motivo', 'ya_cubierta');
  end if;

  select bc.id, bc.cantidad_total, bc.cantidad_disponible, bc.fecha_vencimiento, bc.ilimitado, s.nombre
    into v_bono
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.cliente_id = v_cliente_id
    and bc.deleted_at is null
    and s.servicio_incluido_id = v_estancia.servicio_id
    and (bc.fecha_vencimiento is null or bc.fecha_vencimiento >= public.fecha_negocio())
    and bc.cantidad_disponible >= v_faltante
  order by bc.fecha_vencimiento asc nulls last, bc.fecha_compra asc
  limit 1;

  if not found then
    return jsonb_build_object('aplicado', false, 'motivo', 'sin_bono');
  end if;

  perform public.consumir_bono(v_bono.id, 'estancia', p_estancia_id, v_faltante);

  return jsonb_build_object(
    'aplicado', true,
    'bono_id', v_bono.id,
    'nombre', v_bono.nombre,
    'ilimitado', v_bono.ilimitado,
    'usados', v_faltante,
    'total', v_bono.cantidad_total,
    'restantes', v_bono.cantidad_disponible - v_faltante,
    'vence', v_bono.fecha_vencimiento
  );
end;
$$;

revoke execute on function public.aplicar_bono_a_estancia(uuid) from public;
revoke execute on function public.aplicar_bono_a_estancia(uuid) from anon;
grant execute on function public.aplicar_bono_a_estancia(uuid) to authenticated;

-- El nombre del cliente al final de la vista, para que el tablero de
-- guardería pueda decir de quién son los pases por vencer sin una
-- segunda consulta.
create or replace view public.bonos_clientes_estado
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
  end as estado,
  bc.ilimitado,
  c.nombre as cliente_nombre
from public.bonos_clientes bc
join public.servicios s on s.id = bc.servicio_id
left join public.servicios si on si.id = s.servicio_incluido_id
join public.clientes c on c.id = bc.cliente_id;
