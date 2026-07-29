-- Hueco real: el perro que viene SOLO a estética también llega y se va,
-- y "quién entrega y quién recoge" solo existía en estancias — justo la
-- validación más importante del negocio, ausente en las visitas más
-- cortas y de mayor rotación. Columnas propias (no una estancia corta
-- generada aparte): ver la migración para la justificación completa —
-- en resumen, una estancia sin servicio de guardería/hotel diluiría una
-- tabla que hoy tiene un significado limpio (ocupa cupo, se cobra como
-- guardería/hotel).
--
-- Solo aplican cuando la cita NO está ligada a una estancia (estancia_id
-- is null): si está ligada, el perro ya tiene su propio registro de
-- entrega/recogida en esa estancia, y pedirlo dos veces sería ruido, no
-- protección.
alter table public.citas_estetica
  add column entregado_por_nombre text,
  add column entregado_por_telefono text,
  add column recogido_por_nombre text,
  add column recogido_por_telefono text,
  add column recogido_por_es_dueno boolean;

create or replace function public.validar_cita_estetica()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
  v_duracion int;
  v_depende_tamano boolean;
  v_depende_pelaje boolean;
  v_precio numeric;
  v_estado_precio text;
  v_tiene_bloqueo boolean;
  v_hora_cierre time;
  v_cupo_estado text;
  v_fechas_cambiaron boolean;
  v_activa boolean;
  v_estancia record;
  v_fecha_local date;
  v_entra_en_curso boolean;
  v_entra_finalizada boolean;
begin
  if TG_OP = 'INSERT' then
    if not public.estado_inicial_reserva_valido(new.estado) then
      raise exception 'Una cita nueva no puede empezar en estado "%"', new.estado;
    end if;
  elsif new.estado is distinct from old.estado then
    if not public.transicion_estado_reserva_valida(old.estado, new.estado) then
      raise exception 'No se puede pasar de "%" a "%"', old.estado, new.estado;
    end if;
  end if;

  select categoria, duracion_minutos, depende_tamano, depende_pelaje
    into v_categoria, v_duracion, v_depende_tamano, v_depende_pelaje
  from public.servicios where id = new.servicio_id;

  if v_categoria <> 'estetica' then
    raise exception 'Este servicio no es de estética; no se puede usar en una cita de estética.';
  end if;

  if new.fin is null then
    new.fin := new.inicio + (v_duracion * interval '1 minute');
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
    or new.inicio is distinct from old.inicio;

  v_activa := new.estado not in ('cancelada', 'no_llego');

  if v_fechas_cambiaron then
    if v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene tamaño registrado. Complétalo en su expediente antes de reservar.';
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
    from public.resolver_precio(new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local);

    if v_estado_precio = 'sin_tarifa' then
      raise exception 'No hay tarifa capturada para este servicio en esta fecha. Captúrala antes de reservar.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este servicio no aplica para el tamaño/pelaje de este perro.';
    end if;

    new.precio := v_precio;
  end if;

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

  select hora_cierre, estado into v_hora_cierre, v_cupo_estado
  from public.resolver_cupo_configuracion(v_fecha_local);

  if v_cupo_estado = 'configurado' and public.hora_negocio(new.fin) > v_hora_cierre then
    new.fuera_de_horario := true;
  else
    new.fuera_de_horario := false;
  end if;

  -- Entrega/recogida: solo exigidas para una cita SUELTA (sin estancia
  -- ligada). Si ya está ligada a una estancia, esa estancia es la que
  -- lleva el registro real de cuándo entró y salió el perro.
  v_entra_en_curso := new.estado = 'en_curso' and (TG_OP = 'INSERT' or old.estado <> 'en_curso');
  if v_entra_en_curso and new.estancia_id is null then
    if new.entregado_por_nombre is null or btrim(new.entregado_por_nombre) = '' then
      raise exception 'Registra quién entrega al perro antes de iniciar la cita.';
    end if;
  end if;

  v_entra_finalizada := new.estado = 'finalizada' and (TG_OP = 'INSERT' or old.estado <> 'finalizada');
  if v_entra_finalizada and new.estancia_id is null then
    if new.recogido_por_nombre is null or btrim(new.recogido_por_nombre) = '' then
      raise exception 'Registra quién recoge al perro antes de cerrar la cita.';
    end if;
    if new.recogido_por_es_dueno is null then
      raise exception 'Indica si quien recoge es el dueño registrado o una persona autorizada distinta.';
    end if;
  end if;

  return new;
end;
$$;
