-- Bug real, encontrado releyendo el diseño antes de probarlo (mismo
-- espíritu que el fix de int4range en Fase 3): la migración anterior
-- nunca impidió que una estancia apuntara a un servicio de categoria
-- 'estetica' o 'cargo'. estancias es solo para guardería/hotel — un
-- cargo o una cita de estética no tienen fecha_entrada/fecha_salida con
-- sentido, y colarían por el trigger sin que nada se dé cuenta.
create or replace function public.validar_estancia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_depende_tamano boolean;
  v_categoria text;
  v_cantidad int;
  v_precio numeric;
  v_estado_precio text;
  v_tiene_bloqueo boolean;
  v_fecha date;
  v_cupo_diurno int;
  v_cupo_nocturno int;
  v_cupo_estado text;
  v_ocupado_diurno int;
  v_ocupado_nocturno int;
  v_fechas_cambiaron boolean;
  v_activa boolean;
begin
  -- 1. Transición de estado.
  if TG_OP = 'INSERT' then
    if new.estado not in ('reservada', 'confirmada', 'en_curso') then
      raise exception 'Una reserva nueva no puede empezar en estado "%"', new.estado;
    end if;
  elsif new.estado is distinct from old.estado then
    if not (
      (old.estado = 'reservada' and new.estado in ('confirmada', 'cancelada', 'no_llego', 'en_curso'))
      or (old.estado = 'confirmada' and new.estado in ('en_curso', 'cancelada', 'no_llego'))
      or (old.estado = 'en_curso' and new.estado = 'finalizada')
    ) then
      raise exception 'No se puede pasar de "%" a "%"', old.estado, new.estado;
    end if;
  end if;

  select depende_tamano, categoria into v_depende_tamano, v_categoria
  from public.servicios where id = new.servicio_id;

  if v_categoria not in ('guarderia', 'hotel') then
    raise exception 'Este servicio no es de guardería/hotel; no se puede usar en una estancia.';
  end if;

  v_fechas_cambiaron := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.fecha_entrada is distinct from old.fecha_entrada
    or new.fecha_salida is distinct from old.fecha_salida;

  v_activa := new.estado not in ('cancelada', 'no_llego');

  -- 2. Tamaño y precio, solo si algo de lo que dependen cambió.
  if v_fechas_cambiaron then
    if v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene tamaño registrado. Complétalo en su expediente antes de reservar.';
      end if;
    else
      new.tamano_id := null;
    end if;

    v_cantidad := new.fecha_salida - new.fecha_entrada;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(new.servicio_id, new.tamano_id, null, v_cantidad, new.fecha_entrada);

    if v_estado_precio = 'sin_tarifa' then
      raise exception 'No hay tarifa capturada para este servicio en esta fecha. Captúrala antes de reservar.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este servicio no aplica para el tamaño de este perro.';
    end if;

    new.precio_unitario := v_precio;
  end if;

  -- 3. Bloqueo sanitario.
  if v_fechas_cambiaron and v_activa then
    if new.bloqueo_sanitario_superado and not public.is_admin() then
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

  -- 4. Cupo, día por día del rango, protegido con advisory lock.
  if v_fechas_cambiaron and v_activa then
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

  return new;
end;
$$;
