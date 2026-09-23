-- Los mensajes de "no hay tarifa" dicen QUÉ falta (23 de septiembre de 2026).
--
-- Caso que lo destapó: el hotel walk-in de Galleta (talla Mediano) en
-- producción tronaba con "No hay tarifa capturada para este servicio en
-- esta fecha" aunque la celda Mediano de hotel sí estaba ($270). No faltaba
-- ninguna tarifa: la salida era el mismo día que la entrada, la estancia
-- pedía el precio de 0 noches y la matriz empieza en 1. El mensaje mandaba
-- a capturar un precio que ya existía.
--
-- describir_precio_faltante() redacta el caso concreto con los mismos
-- parámetros que se le pasaron a resolver_precio:
--   · 0 noches (salida = entrada),
--   · la cantidad no entra en ningún tramo capturado,
--   · el precio existe pero empieza a valer después de la fecha,
--   · la celda de verdad está vacía (y dice cuál: servicio, talla, grupo,
--     pelaje), o está marcada "no aplica".
-- Termina con la ruta de la pantalla donde se resuelve
-- (/servicios/<id>/tarifas o /perros/<id>): la app la vuelve enlace, y si
-- alguna pantalla muestra el texto crudo, la ruta se sigue entendiendo.
--
-- Las funciones de abajo son copia exacta de su última definición; solo
-- cambian los RAISE de precio y de talla faltante.

create or replace function public.describir_precio_faltante(
  p_servicio_id uuid,
  p_tamano_id uuid,
  p_pelaje_id uuid,
  p_cantidad numeric,
  p_fecha date,
  p_grupo_raza_id uuid default null,
  p_estado text default 'sin_tarifa'
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_nombre text;
  v_unidad text;
  v_ruta text := '/servicios/' || p_servicio_id || '/tarifas';
  v_celda text;
  v_min numeric;
  v_hay_vigente boolean;
  v_futura date;
  v_singular text;
  v_plural text;
begin
  select s.nombre, s.unidad into v_nombre, v_unidad from public.servicios s where s.id = p_servicio_id;

  v_celda := concat_ws(', ',
    (select 'talla ' || lower(t.etiqueta) from public.tamanos_categoria t where t.id = p_tamano_id),
    (select 'grupo ' || g.nombre from public.grupos_raza g where g.id = p_grupo_raza_id),
    (select 'pelaje ' || lower(pl.etiqueta) from public.tipos_pelaje pl where pl.id = p_pelaje_id)
  );
  v_celda := case when v_celda = '' then '' else ' para ' || v_celda end;

  if p_estado = 'no_aplica' then
    return format('«%s»%s está marcado como «no aplica». Si sí se ofrece, ponle precio en %s',
      v_nombre, v_celda, v_ruta);
  end if;

  v_singular := case v_unidad when 'noche' then 'noche' when 'dia' then 'día' when 'hora' then 'hora'
    when 'sesion' then 'sesión' when 'km' then 'km' else 'vez' end;
  v_plural := case v_unidad when 'noche' then 'noches' when 'dia' then 'días' when 'hora' then 'horas'
    when 'sesion' then 'sesiones' when 'km' then 'km' else 'veces' end;

  -- 0 noches: la causa más común y la que más confunde.
  if v_unidad = 'noche' and coalesce(p_cantidad, 0) < 1 then
    return format('La salida no es después de la entrada: son 0 noches y «%s» se cobra por noche. '
      || 'Pon la salida al menos un día después de la entrada.', v_nombre);
  end if;

  select min(tr.cantidad_desde), bool_or(tr.vigencia_desde <= p_fecha)
  into v_min, v_hay_vigente
  from public.tarifas tr
  where tr.servicio_id = p_servicio_id
    and tr.grupo_raza_id is not distinct from p_grupo_raza_id
    and tr.tamano_id is not distinct from p_tamano_id
    and tr.pelaje_id is not distinct from p_pelaje_id
    and tr.deleted_at is null;

  if v_min is not null and p_cantidad < v_min then
    return format('«%s»%s tiene precio a partir de %s %s y aquí son %s. Revisa la cantidad, o captura ese tramo en %s',
      v_nombre, v_celda, v_min, case when v_min = 1 then v_singular else v_plural end, p_cantidad, v_ruta);
  end if;

  select min(tr.vigencia_desde) into v_futura
  from public.tarifas tr
  where tr.servicio_id = p_servicio_id
    and tr.grupo_raza_id is not distinct from p_grupo_raza_id
    and tr.tamano_id is not distinct from p_tamano_id
    and tr.pelaje_id is not distinct from p_pelaje_id
    and p_cantidad >= tr.cantidad_desde
    and (tr.cantidad_hasta is null or p_cantidad <= tr.cantidad_hasta)
    and tr.vigencia_desde > p_fecha
    and tr.deleted_at is null;

  if v_futura is not null then
    return format('El precio de «%s»%s empieza a valer el %s y esta fecha es el %s. '
      || 'Revisa la fecha, o captura un precio que valga desde antes en %s',
      v_nombre, v_celda, to_char(v_futura, 'DD/MM/YYYY'), to_char(p_fecha, 'DD/MM/YYYY'), v_ruta);
  end if;

  if v_min is not null then
    return format('«%s»%s no tiene precio para %s %s: ningún tramo capturado cubre esa cantidad. Captúralo en %s',
      v_nombre, v_celda, p_cantidad, case when p_cantidad = 1 then v_singular else v_plural end, v_ruta);
  end if;

  return format('Falta el precio de «%s»%s. Captúralo en %s', v_nombre, v_celda, v_ruta);
end;
$$;

revoke execute on function public.describir_precio_faltante(uuid, uuid, uuid, numeric, date, uuid, text) from public, anon;
grant execute on function public.describir_precio_faltante(uuid, uuid, uuid, numeric, date, uuid, text) to authenticated;


create or replace function public.validar_estancia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_depende_tamano boolean;
  v_categoria text;
  v_unidad text;
  v_cantidad int;
  v_precio numeric;
  v_estado_precio text;
  v_tiene_bloqueo boolean;
  v_perro record;
  v_alerta text;
  v_fecha date;
  v_cupo_diurno int;
  v_cupo_nocturno int;
  v_cupo_estado text;
  v_ocupado_diurno int;
  v_ocupado_nocturno int;
  v_recotizar boolean;
  v_revalidar boolean;
  v_activa boolean;
  v_entra_en_curso boolean;
  v_entra_finalizada boolean;
  v_horas_reales int;
begin
  if TG_OP = 'INSERT' then
    if not public.estado_inicial_reserva_valido(new.estado) then
      raise exception 'Una reserva nueva no puede empezar en estado "%"', new.estado;
    end if;
  elsif new.estado is distinct from old.estado then
    if not public.transicion_estado_reserva_valida(old.estado, new.estado) then
      raise exception 'No se puede pasar de "%" a "%"', old.estado, new.estado;
    end if;
  end if;

  select depende_tamano, categoria, unidad
    into v_depende_tamano, v_categoria, v_unidad
  from public.servicios where id = new.servicio_id;

  if v_categoria is null or v_categoria not in ('guarderia', 'hotel') then
    raise exception 'Este servicio no es de guardería/hotel; no se puede usar en una estancia.';
  end if;

  v_entra_en_curso := new.estado = 'en_curso' and (TG_OP = 'INSERT' or old.estado <> 'en_curso');
  v_entra_finalizada := new.estado = 'finalizada' and (TG_OP = 'INSERT' or old.estado <> 'finalizada');

  -- Horas: obligatorias para un servicio por hora, prohibidas para el
  -- resto. Y al check-out, las reales mandan si fueron más que las
  -- estimadas — hacia abajo no, lo reservado se respeta.
  if v_unidad = 'hora' then
    if new.horas is null then
      raise exception 'Indica cuántas horas se queda el perro: este servicio se cobra por hora.';
    end if;
    if v_entra_finalizada and new.hora_entrada_real is not null then
      if new.hora_salida_real is null then
        new.hora_salida_real := now();
      end if;
      v_horas_reales := greatest(1, ceil(extract(epoch from (new.hora_salida_real - new.hora_entrada_real)) / 3600)::int);
      if v_horas_reales > new.horas then
        new.horas := v_horas_reales;
      end if;
    end if;
  else
    new.horas := null;
  end if;

  v_recotizar := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.fecha_entrada is distinct from old.fecha_entrada
    or new.fecha_salida is distinct from old.fecha_salida
    or new.horas is distinct from old.horas;

  v_revalidar := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.fecha_entrada is distinct from old.fecha_entrada
    or new.fecha_salida is distinct from old.fecha_salida;

  v_activa := new.estado not in ('cancelada', 'no_llego');

  if v_recotizar then
    if v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene talla registrada y el precio depende de ella. Captúrala en /perros/%', new.perro_id;
      end if;
    else
      new.tamano_id := null;
    end if;

    v_cantidad := case
      when v_unidad = 'hora' then new.horas
      else new.fecha_salida - new.fecha_entrada
    end;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(new.servicio_id, new.tamano_id, null, v_cantidad, new.fecha_entrada);

    if v_estado_precio = 'sin_tarifa' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, null, v_cantidad, new.fecha_entrada);
    elsif v_estado_precio = 'no_aplica' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, null, v_cantidad, new.fecha_entrada, null, 'no_aplica');
    end if;

    new.precio_unitario := v_precio;
  end if;

  if v_revalidar and v_activa then
    select sexo, en_celo, gestante, evaluacion_comportamiento_fecha
      into v_perro
    from public.perros where id = new.perro_id;

    -- Celo y gestación: bloqueo sin excepción. No es un trámite que
    -- falte, es una condición del perro mientras dure.
    if v_perro.en_celo then
      raise exception 'Esta perra está marcada en celo: no puede quedarse en guardería ni hotel mientras dure. Quita la marca en su expediente cuando pase.';
    end if;
    if v_perro.gestante then
      raise exception 'Esta perra está marcada como gestante: no puede quedarse en guardería ni hotel. Quita la marca en su expediente cuando ya no aplique.';
    end if;

    -- Agresividad: cualquier alerta activa del catálogo marcada como
    -- bloqueante. Tampoco tiene excepción.
    select ca.etiqueta into v_alerta
    from public.perro_alertas pa
    join public.catalogo_alertas ca on ca.id = pa.alerta_id
    where pa.perro_id = new.perro_id
      and pa.activa
      and ca.bloquea_estancia
      and ca.deleted_at is null
    limit 1;

    if v_alerta is not null then
      raise exception 'Este perro tiene activa la alerta "%": no se recibe en guardería ni hotel. Si ya no aplica, desactívala en su expediente.', v_alerta;
    end if;

    -- Evaluación de comportamiento: aviso con excepción de admin, con el
    -- mismo contrato que la sanitaria.
    if new.bloqueo_comportamiento_superado and not coalesce(public.is_admin(), false) then
      raise exception 'Solo un admin puede autorizar reservar sin evaluación de comportamiento.';
    end if;

    if new.bloqueo_comportamiento_superado then
      new.autorizado_por := auth.uid();
    elsif v_perro.evaluacion_comportamiento_fecha is null then
      raise exception 'Este perro no tiene evaluación previa de comportamiento. Márcala en su expediente, o un admin puede autorizar una excepción con motivo.';
    end if;

    -- Sanitario, tal cual estaba.
    if new.bloqueo_sanitario_superado and not coalesce(public.is_admin(), false) then
      raise exception 'Solo un admin puede autorizar una excepción al bloqueo sanitario.';
    end if;

    if new.bloqueo_sanitario_superado then
      new.autorizado_por := auth.uid();
    else
      select exists (
        select 1
        from public.perro_requisitos_sanitarios_estado pre
        where pre.perro_id = new.perro_id
          and pre.estado in ('vencida', 'sin_registro')
      ) into v_tiene_bloqueo;

      if v_tiene_bloqueo then
        raise exception 'Este perro tiene un requisito sanitario obligatorio vencido o sin registro. Un admin puede autorizar una excepción con motivo.';
      end if;
    end if;
  end if;

  if v_revalidar and v_activa then
    perform pg_advisory_xact_lock(hashtext('estancias_cupo'));

    for v_fecha in select generate_series(new.fecha_entrada, new.fecha_salida - 1, interval '1 day')::date loop
      select cupo_diurno, cupo_nocturno, estado into v_cupo_diurno, v_cupo_nocturno, v_cupo_estado
      from public.resolver_cupo_configuracion(v_fecha);

      if v_cupo_estado = 'sin_configurar' then
        raise exception 'No hay cupo configurado para el %. Captúralo antes de reservar.', v_fecha;
      end if;

      select count(*) into v_ocupado_diurno
      from public.estancias e
      where e.deleted_at is null
        and e.estado not in ('cancelada', 'no_llego')
        and e.id is distinct from new.id
        and daterange(e.fecha_entrada, e.fecha_salida) @> v_fecha;

      if (v_ocupado_diurno + 1) > v_cupo_diurno then
        raise exception 'No hay cupo disponible (diurno) para el %.', v_fecha;
      end if;

      if v_categoria = 'hotel' then
        select count(*) into v_ocupado_nocturno
        from public.estancias e
        join public.servicios s on s.id = e.servicio_id
        where e.deleted_at is null
          and e.estado not in ('cancelada', 'no_llego')
          and e.id is distinct from new.id
          and s.categoria = 'hotel'
          and daterange(e.fecha_entrada, e.fecha_salida) @> v_fecha;

        if (v_ocupado_nocturno + 1) > v_cupo_nocturno then
          raise exception 'No hay cupo disponible (nocturno) para el %.', v_fecha;
        end if;
      end if;
    end loop;
  end if;

  -- Check-in: quién entrega es obligatorio, la hora se autocompleta.
  if v_entra_en_curso then
    if new.entregado_por_nombre is null or btrim(new.entregado_por_nombre) = '' then
      raise exception 'Registra quién entrega al perro antes de hacer el check-in.';
    end if;
    if new.hora_entrada_real is null then
      new.hora_entrada_real := now();
    end if;
  end if;

  -- Check-out: quién recoge y si es el dueño registrado son obligatorios
  -- — nunca opcional, es la validación más importante de esta tabla.
  if v_entra_finalizada then
    if new.recogido_por_nombre is null or btrim(new.recogido_por_nombre) = '' then
      raise exception 'Registra quién recoge al perro antes de cerrar el check-out.';
    end if;
    if new.recogido_por_es_dueno is null then
      raise exception 'Indica si quien recoge es el dueño registrado o una persona autorizada distinta.';
    end if;
    if new.hora_salida_real is null then
      new.hora_salida_real := now();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.validar_cita_estetica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_duracion int;
  v_depende_tamano boolean;
  v_depende_pelaje boolean;
  v_depende_grupo boolean;
  v_precio numeric;
  v_estado_precio text;
  v_fecha_local date;
  v_estancia record;
  v_fechas_cambiaron boolean;
  v_hora_cierre time;
  v_grupo record;
begin
  select categoria, duracion_minutos, depende_tamano, depende_pelaje, depende_grupo_raza
    into v_categoria, v_duracion, v_depende_tamano, v_depende_pelaje, v_depende_grupo
  from public.servicios
  where id = new.servicio_id and deleted_at is null;

  if v_categoria is null then
    raise exception 'El servicio de esta cita no existe.';
  end if;
  if v_categoria <> 'estetica' then
    raise exception 'Una cita de estética solo puede usar un servicio de categoría estetica.';
  end if;

  if new.fin is null then
    new.fin := new.inicio + (coalesce(v_duracion, 60) * interval '1 minute');
  end if;

  v_fecha_local := public.fecha_negocio(new.inicio);

  if new.estancia_id is not null then
    select perro_id, fecha_entrada, fecha_salida into v_estancia
    from public.estancias
    where id = new.estancia_id and deleted_at is null;

    if not found then
      raise exception 'La estancia ligada a esta cita no existe.';
    end if;

    if v_estancia.perro_id is distinct from new.perro_id then
      raise exception 'Esta cita es de un perro distinto al de la estancia que se está ligando.';
    end if;

    if v_fecha_local < v_estancia.fecha_entrada or v_fecha_local >= v_estancia.fecha_salida then
      raise exception 'La fecha de esta cita no cae dentro del rango de la estancia ligada.';
    end if;
  end if;

  v_fechas_cambiaron := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.inicio is distinct from old.inicio
    or new.pelo_maltratado is distinct from old.pelo_maltratado;

  if v_fechas_cambiaron then
    if v_depende_grupo then
      select * into v_grupo from public.perro_grupo_raza where perro_id = new.perro_id;
      if v_grupo.grupo_raza_id is null then
        raise exception 'No se pudo determinar el grupo de raza de este perro. Revisa el catálogo de razas.';
      end if;

      if v_grupo.depende_tamano then
        select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
        if new.tamano_id is null then
          raise exception 'Este perro no tiene talla registrada y su grupo de raza cobra por talla. Captúrala en /perros/%', new.perro_id;
        end if;
      else
        new.tamano_id := null;
      end if;
    elsif v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene talla registrada y el precio depende de ella. Captúrala en /perros/%', new.perro_id;
      end if;
    else
      new.tamano_id := null;
    end if;

    if v_depende_pelaje then
      select pelaje_id into new.pelaje_id from public.perros where id = new.perro_id;
      if new.pelaje_id is null then
        raise exception 'Este perro no tiene pelaje registrado. Complétalo en su expediente antes de reservar.';
      end if;
    else
      new.pelaje_id := null;
    end if;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(
      new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local,
      case when v_depende_grupo then v_grupo.grupo_raza_id else null end,
      new.pelo_maltratado
    );

    if v_estado_precio = 'sin_tarifa' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local, case when v_depende_grupo then v_grupo.grupo_raza_id else null end);
    elsif v_estado_precio = 'no_aplica' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local, case when v_depende_grupo then v_grupo.grupo_raza_id else null end, 'no_aplica');
    end if;

    new.precio := v_precio;
  end if;

  -- Sin bloqueo sanitario aquí (ver encabezado). La marca de excepción
  -- ya no hace nada; si alguien la manda, no cambia el resultado.

  select hora_cierre into v_hora_cierre
  from public.resolver_cupo_configuracion(v_fecha_local);

  new.fuera_de_horario := v_hora_cierre is not null
    and public.hora_negocio(new.fin) > v_hora_cierre;

  return new;
end;
$$;

create or replace function public.validar_cargo_aplicado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
  v_depende_tamano boolean;
  v_monto_libre boolean;
  v_perro_id uuid;
  v_estado_estancia text;
  v_reserva_estancia uuid;
  v_precio numeric;
  v_estado_precio text;
  v_debe_resolver boolean;
begin
  select categoria, depende_tamano, monto_libre
    into v_categoria, v_depende_tamano, v_monto_libre
  from public.servicios where id = new.servicio_id;

  if v_categoria is null or v_categoria <> 'cargo' then
    raise exception 'Este servicio no es un cargo; no se puede usar en un cargo aplicado.';
  end if;

  if new.estancia_id is not null then
    select perro_id, estado, reserva_id into v_perro_id, v_estado_estancia, v_reserva_estancia
    from public.estancias where id = new.estancia_id;

    if v_estado_estancia in ('cancelada', 'no_llego') then
      raise exception 'No se pueden aplicar cargos a una estancia cancelada o que no llegó.';
    end if;
    new.reserva_id := v_reserva_estancia;
    new.perro_id := v_perro_id;
  else
    if new.reserva_id is null then
      raise exception 'Un cargo suelto necesita la cuenta (reserva) a la que pertenece.';
    end if;
    if not exists (select 1 from public.reservas r where r.id = new.reserva_id and r.deleted_at is null) then
      raise exception 'La cuenta de este cargo no existe.';
    end if;
    if new.perro_id is not null and not exists (
      select 1 from public.perros p
      join public.reservas r on r.cliente_id = p.cliente_id
      where p.id = new.perro_id and r.id = new.reserva_id
    ) then
      raise exception 'Ese perro no es del dueño de esta cuenta.';
    end if;
    if v_depende_tamano and not v_monto_libre then
      raise exception 'Este cargo depende del tamaño del perro: aplícalo desde su estancia.';
    end if;
    v_perro_id := new.perro_id;
  end if;

  if v_monto_libre then
    if new.precio is null or new.precio <= 0 then
      raise exception 'Captura el importe de este cargo: se cobra según lo que se le dio.';
    end if;
    if new.descripcion is null or btrim(new.descripcion) = '' then
      raise exception 'Describe qué se le dio para poder aplicar este cargo.';
    end if;
    if TG_OP = 'UPDATE' and new.precio is distinct from old.precio then
      raise exception 'El importe de un cargo aplicado no se cambia. Cancélalo con motivo y aplica otro.';
    end if;
    new.tamano_id := null;
    return new;
  end if;

  v_debe_resolver := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.estancia_id is distinct from old.estancia_id
    or new.cantidad is distinct from old.cantidad;

  if v_debe_resolver then
    if v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = v_perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene talla registrada y el precio de este cargo depende de ella. Captúrala en /perros/%', v_perro_id;
      end if;
    else
      new.tamano_id := null;
    end if;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(new.servicio_id, new.tamano_id, null, new.cantidad, public.fecha_negocio());

    if v_estado_precio = 'sin_tarifa' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, null, new.cantidad, public.fecha_negocio());
    elsif v_estado_precio = 'no_aplica' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, null, new.cantidad, public.fecha_negocio(), null, 'no_aplica');
    end if;

    new.precio := v_precio;
  end if;

  return new;
end;
$$;

create or replace function public.comprar_bono(
  p_perro_id uuid,
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
  v_perro record;
  v_precio numeric;
  v_estado_precio text;
  v_turno_id uuid;
  v_reserva_id uuid;
  v_bono_id uuid;
  v_fecha_compra date;
  v_fecha_vencimiento date;
  v_cantidad int;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden vender un bono.';
  end if;

  select * into v_servicio from public.servicios
  where id = p_servicio_id and categoria = 'bono' and deleted_at is null;
  if not found then
    raise exception 'Bono no encontrado en el catálogo.';
  end if;

  select p.id, p.nombre, p.cliente_id, coalesce(p.fallecido, false) as fallecido
    into v_perro
  from public.perros p
  join public.clientes c on c.id = p.cliente_id and c.deleted_at is null
  where p.id = p_perro_id and p.deleted_at is null;
  if not found then
    raise exception 'Elige el perro para el que es el paquete.';
  end if;
  if v_perro.fallecido then
    raise exception 'Este perro está marcado como fallecido: no se le puede vender un paquete.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de vender un bono.';
  end if;

  v_fecha_compra := public.fecha_negocio();

  select precio, estado into v_precio, v_estado_precio
  from public.resolver_precio(p_servicio_id, null, null, 1, v_fecha_compra);

  if v_estado_precio = 'sin_tarifa' then
    raise exception '%', public.describir_precio_faltante(p_servicio_id, null, null, 1, v_fecha_compra);
  elsif v_estado_precio = 'no_aplica' then
    raise exception '%', public.describir_precio_faltante(p_servicio_id, null, null, 1, v_fecha_compra, null, 'no_aplica');
  end if;

  insert into public.reservas (cliente_id, notas)
  values (v_perro.cliente_id, 'Compra de bono: ' || v_servicio.nombre || ' para ' || v_perro.nombre)
  returning id into v_reserva_id;

  v_fecha_vencimiento := case
    when v_servicio.vigencia_dias is not null then v_fecha_compra + v_servicio.vigencia_dias
    else null
  end;

  if v_servicio.ilimitado then
    -- Días que abre guardería en la vigencia (horario_semana): el máximo
    -- de veces que físicamente se puede consumir.
    v_cantidad := greatest(1, public.dias_que_abre_guarderia(v_fecha_compra, v_fecha_vencimiento));
  else
    v_cantidad := v_servicio.cantidad_incluida;
  end if;

  insert into public.bonos_clientes (
    cliente_id, perro_id, servicio_id, reserva_id, cantidad_total, cantidad_disponible,
    precio_pagado, fecha_compra, fecha_vencimiento, ilimitado
  )
  values (
    v_perro.cliente_id, v_perro.id, p_servicio_id, v_reserva_id, v_cantidad, v_cantidad,
    v_precio, v_fecha_compra, v_fecha_vencimiento, v_servicio.ilimitado
  )
  returning id into v_bono_id;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, turno_id, created_by)
  values (v_bono_id, 'venta', v_cantidad, v_precio, v_turno_id, auth.uid());

  perform public.registrar_cobro(v_reserva_id, p_notas, p_metodos);

  return v_bono_id;
end;
$$;

create or replace function public.convertir_estancia_a_hotel(p_estancia_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estancia record;
  v_hotel_id uuid;
  v_salida date;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden convertir una estancia en noche de hotel.';
  end if;

  select e.id, e.estado, e.fecha_entrada, s.categoria
    into v_estancia
  from public.estancias e
  join public.servicios s on s.id = e.servicio_id
  where e.id = p_estancia_id and e.deleted_at is null;

  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if v_estancia.categoria <> 'guarderia' then
    raise exception 'Solo una estancia de guardería se convierte en noche de hotel.';
  end if;
  if v_estancia.estado <> 'en_curso' then
    raise exception 'Solo se convierte una estancia con el perro adentro (en curso).';
  end if;

  select c.id into v_hotel_id
  from public.servicios_cotizables c
  where c.categoria = 'hotel'
  order by c.orden, c.nombre
  limit 1;

  if v_hotel_id is null then
    select s.id into v_hotel_id from public.servicios s
    where s.categoria = 'hotel' and s.deleted_at is null order by s.orden, s.nombre limit 1;
    raise exception 'Ningún servicio de hotel tiene precio capturado. Captúralo en %',
      coalesce('/servicios/' || v_hotel_id || '/tarifas', '/servicios');
  end if;

  v_salida := v_estancia.fecha_entrada + 1;
  while not public.negocio_abre(v_salida) and v_salida < v_estancia.fecha_entrada + 8 loop
    v_salida := v_salida + 1;
  end loop;

  update public.estancias
  set servicio_id = v_hotel_id,
      fecha_salida = v_salida,
      horas = null
  where id = p_estancia_id;
end;
$$;
