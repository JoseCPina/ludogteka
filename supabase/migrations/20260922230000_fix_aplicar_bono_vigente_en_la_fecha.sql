-- Encontrado probando la migración anterior: aplicar_bono_a_estancia
-- exigía que el bono estuviera vigente HOY, no el día de la estancia. Una
-- mensualidad que vence el viernes cubría una reserva de dentro de dos
-- meses. La vigencia se compara contra fecha_entrada: un pase cubre los
-- días que caen dentro de su vigencia, y nada más.
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

  -- Vigente el día de la estancia (y hoy, que es cuando se consume): el
  -- que vence primero de los que alcanzan.
  select bc.id, bc.cantidad_total, bc.cantidad_disponible, bc.fecha_vencimiento, bc.ilimitado, s.nombre
    into v_bono
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.cliente_id = v_cliente_id
    and bc.deleted_at is null
    and s.servicio_incluido_id = v_estancia.servicio_id
    and (bc.fecha_vencimiento is null or bc.fecha_vencimiento >= greatest(v_estancia.fecha_entrada, public.fecha_negocio()))
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
