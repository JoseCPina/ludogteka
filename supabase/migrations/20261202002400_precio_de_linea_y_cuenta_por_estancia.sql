-- QA R50 (N133 y N136).
--
-- N133 · «Nueva reserva» de Hotel con un perro sin talla no avisaba nada: la pantalla leía pendientes_para_estancia y
-- solo enseñaba las claves «sanitario:» y «campo:»; la fila «talla» (que sí bloquea) se perdía, y el precio no se
-- calculaba hasta que el disparador validar_estancia rechazaba «Crear reserva». Ahora toda pantalla que da de alta un
-- servicio con precio pregunta ANTES, por la misma regla con la que la base cobra: cotizar_linea_servicio(perro,
-- servicio, entrada, salida, horas) dice el precio de esa línea o lo único que falta para saberlo (talla, pelaje), sin
-- una lista de pantallas: lo decide el servicio (depende_tamano/depende_pelaje, o su grupo de raza en Estética) y lo
-- resuelve resolver_precio.
--   · Guardería y hotel: la regla de validar_estancia (talla si el servicio depende de ella; cantidad = noches, o las
--     horas en un servicio por hora; precio del día de entrada).
--   · Estética: cotizar_cita_estetica (grupo de raza, talla, pelaje y tarifa de cliente de guardería).
--
-- N136 · El bloque de la estancia en /reservas/<id> calculaba «precio por noche × noches reservadas» en el navegador y
-- no veía la corrección «Salida anticipada» que la base sí cuenta (encabezado, Caja y calendario decían $450; el bloque,
-- $900). cuenta_lineas_estancia(reserva) son las MISMAS líneas de cuenta_lineas_reserva (la fuente del total de la
-- cuenta) con la estancia a la que pertenece cada una (su línea, sus cargos y extras, sus citas de estética y las
-- correcciones de precio de cualquiera de ellas), el motivo de cada corrección y las noches o días que de verdad usó.

create or replace function public.cotizar_linea_servicio(
  p_perro_id uuid,
  p_servicio_id uuid,
  p_entrada date default null,
  p_salida date default null,
  p_horas int default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_serv record;
  v_perro record;
  v_entrada date := coalesce(p_entrada, public.fecha_negocio());
  v_cantidad int;
  v_tamano uuid;
  v_res record;
  v_cot jsonb;
  v_faltan text[] := '{}';
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal cotiza un servicio.' using errcode = '42501';
  end if;
  select s.id, s.nombre, s.categoria, s.unidad, s.depende_tamano into v_serv
  from public.servicios s where s.id = p_servicio_id and s.deleted_at is null;
  if not found then
    raise exception 'Ese servicio no existe.';
  end if;
  select p.id, p.nombre, p.tamano_id, p.pelaje_id into v_perro
  from public.perros p where p.id = p_perro_id and p.deleted_at is null;
  if not found then
    raise exception 'Ese perro no existe.';
  end if;

  if v_serv.categoria = 'estetica' then
    v_cot := public.cotizar_cita_estetica(p_perro_id, p_servicio_id);
    return v_cot || jsonb_build_object('perro', v_perro.nombre, 'cantidad', 1, 'unidad', v_serv.unidad,
      'total', case when v_cot ->> 'estado' = 'ok' then (v_cot ->> 'precio')::numeric end,
      'mensaje', case when v_cot ->> 'estado' in ('sin_precio', 'no_aplica')
        then public.describir_precio_faltante(p_servicio_id, v_perro.tamano_id, v_perro.pelaje_id, 1, public.fecha_negocio(), null,
          case when v_cot ->> 'estado' = 'no_aplica' then 'no_aplica' else 'sin_tarifa' end) end);
  end if;

  if v_serv.categoria not in ('guarderia', 'hotel') then
    raise exception 'Este servicio no se cotiza aquí.';
  end if;

  -- La misma regla de validar_estancia.
  v_cantidad := case when v_serv.unidad = 'hora' then greatest(1, coalesce(p_horas, 1))
                     else coalesce(p_salida, v_entrada + 1) - v_entrada end;
  if v_serv.depende_tamano then
    if v_perro.tamano_id is null then
      v_faltan := array_append(v_faltan, 'tamano');
    end if;
    v_tamano := v_perro.tamano_id;
  end if;
  if cardinality(v_faltan) > 0 then
    return jsonb_build_object('estado', 'faltan_datos', 'faltan', to_jsonb(v_faltan), 'perro', v_perro.nombre,
      'servicio_id', p_servicio_id, 'unidad', v_serv.unidad, 'cantidad', v_cantidad);
  end if;
  if v_serv.unidad = 'noche' and v_cantidad < 1 then
    return jsonb_build_object('estado', 'sin_precio', 'perro', v_perro.nombre, 'unidad', v_serv.unidad, 'cantidad', v_cantidad,
      'mensaje', public.describir_precio_faltante(p_servicio_id, v_tamano, null, v_cantidad, v_entrada));
  end if;
  select * into v_res from public.resolver_precio(p_servicio_id, v_tamano, null, v_cantidad, v_entrada);
  if v_res.estado = 'disponible' and v_res.precio is not null then
    return jsonb_build_object('estado', 'ok', 'perro', v_perro.nombre, 'unidad', v_serv.unidad, 'cantidad', v_cantidad,
      'precio', v_res.precio, 'total', round(v_res.precio * v_cantidad, 2), 'tamano_id', v_tamano);
  end if;
  return jsonb_build_object('estado', case when v_res.estado = 'no_aplica' then 'no_aplica' else 'sin_precio' end,
    'perro', v_perro.nombre, 'unidad', v_serv.unidad, 'cantidad', v_cantidad,
    'mensaje', public.describir_precio_faltante(p_servicio_id, v_tamano, null, v_cantidad, v_entrada, null,
      case when v_res.estado = 'no_aplica' then 'no_aplica' else 'sin_tarifa' end));
end;
$$;
comment on function public.cotizar_linea_servicio(uuid, uuid, date, date, int) is
  'Precio de una línea (perro + servicio + fechas) o lo que falta para saberlo (faltan: tamano/pelaje), con la regla con la que la base cobra: validar_estancia en guardería y hotel, cotizar_cita_estetica en Estética. Corre con el RLS de quien llama.';
revoke execute on function public.cotizar_linea_servicio(uuid, uuid, date, date, int) from public, anon;
grant execute on function public.cotizar_linea_servicio(uuid, uuid, date, date, int) to authenticated, service_role;


create or replace function public.cuenta_lineas_estancia(p_reserva_id uuid)
returns table (
  estancia_id uuid,
  tipo text,
  origen_id uuid,
  descripcion text,
  cantidad numeric,
  precio_unitario numeric,
  total numeric,
  motivo text,
  concepto text,
  unidad text,
  reservadas int,
  usadas int
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(e.id, c.estancia_id, ce.estancia_id, ae.id, ac.estancia_id, ace.estancia_id),
    l.tipo, l.origen_id, l.descripcion, l.cantidad, l.precio_unitario, l.total,
    a.motivo,
    a.concepto,
    s.unidad,
    case when e.id is not null and s.unidad in ('noche', 'dia') then e.fecha_salida - e.fecha_entrada end,
    -- Lo que de verdad usó una estancia que ya salió (la cuenta de salida_anticipada_cotizar): desde que entró (si entró
    -- antes de su fecha, desde ese día) hasta su salida real.
    case when e.id is not null and e.estado = 'finalizada' and e.hora_salida_real is not null and s.unidad in ('noche', 'dia') then
      greatest(1,
        (e.hora_salida_real at time zone public.zona_negocio())::date
          - least(e.fecha_entrada, coalesce((e.hora_entrada_real at time zone public.zona_negocio())::date, e.fecha_entrada))
          + case when s.unidad = 'dia' then 1 else 0 end)
    end
  from public.cuenta_lineas_reserva(p_reserva_id) l
  left join public.estancias e on l.tipo = 'estancia' and e.id = l.origen_id
  left join public.servicios s on s.id = e.servicio_id
  left join public.cargos_aplicados c on l.tipo = 'cargo' and c.id = l.origen_id
  left join public.citas_estetica ce on l.tipo = 'estetica' and ce.id = l.origen_id
  left join public.cuenta_ajustes_precio a on l.tipo = 'ajuste' and a.id = l.origen_id
  left join public.estancias ae on a.linea_tipo = 'estancia' and ae.id = a.linea_id
  left join public.cargos_aplicados ac on a.linea_tipo = 'cargo' and ac.id = a.linea_id
  left join public.citas_estetica ace on a.linea_tipo = 'estetica' and ace.id = a.linea_id;
$$;
comment on function public.cuenta_lineas_estancia(uuid) is
  'Las líneas de cuenta_lineas_reserva (la fuente del total de la cuenta) con la estancia a la que pertenece cada una, el motivo de cada corrección y las noches o días reservados y usados. El total de una estancia es la suma de sus líneas. Corre con el RLS de quien llama.';
revoke execute on function public.cuenta_lineas_estancia(uuid) from public, anon;
grant execute on function public.cuenta_lineas_estancia(uuid) to authenticated, service_role;
