-- Las citas de estética ya no se bloquean por requisitos sanitarios.
--
-- Los requisitos (vacunas, desparasitación) se exigen en guardería y
-- hotel, donde el perro convive con otros; en estética viene, se baña y
-- se va. El trigger de citas seguía bloqueando ("requisitos sanitarios
-- críticos vencidos o sin registro"), y eso contradecía lo que acaba de
-- quedar en el portal y el expediente: a un perro que solo viene a
-- estética no se le piden vacunas, así que tampoco pueden negarle la
-- cita. Un perro que SÍ usa guardería u hotel y trae requisitos vencidos
-- ve un aviso en la cita (pantalla), no un bloqueo: el riesgo real está
-- en la estancia, y ese bloqueo sigue intacto en validar_estancia.
--
-- Cuerpo de 20260910190120 con el bloque sanitario quitado. La columna
-- bloqueo_sanitario_superado se conserva (historial de citas que la
-- usaron) pero ya no significa nada para una cita nueva.
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
          raise exception 'Este perro no tiene tamaño registrado y su grupo de raza cobra por talla. Complétalo en su expediente antes de reservar.';
        end if;
      else
        new.tamano_id := null;
      end if;
    elsif v_depende_tamano then
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
    from public.resolver_precio(
      new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local,
      case when v_depende_grupo then v_grupo.grupo_raza_id else null end,
      new.pelo_maltratado
    );

    if v_estado_precio = 'sin_tarifa' then
      raise exception 'No hay tarifa capturada para este servicio en esta fecha. Captúrala antes de reservar.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este servicio no aplica para este perro.';
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

comment on column public.citas_estetica.bloqueo_sanitario_superado is
  'Histórico. Desde el 23 de septiembre de 2026 las citas de estética no se bloquean por requisitos sanitarios (son de guardería y hotel); la marca ya no tiene efecto.';
