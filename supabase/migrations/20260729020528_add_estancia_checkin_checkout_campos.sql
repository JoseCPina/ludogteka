-- Punto 2 de Fase 4 (check-in/check-out): quién entrega y quién recoge al
-- perro. recogido_por_es_dueno queda explícito — no se infiere de nada —
-- porque "entregarle un perro a quien no debía" es el peor error posible
-- de este negocio, y una bandera visible en la pantalla de check-out vale
-- más que confiar en que alguien se acuerde de preguntar.
alter table public.estancias
  add column entregado_por_nombre text,
  add column entregado_por_telefono text,
  add column recogido_por_nombre text,
  add column recogido_por_telefono text,
  add column recogido_por_es_dueno boolean;

-- validar_estancia() se extiende con dos guardas nuevas: entrar a
-- en_curso exige saber quién entregó al perro; entrar a finalizada exige
-- saber quién lo recogió y si es o no el dueño registrado. hora_entrada_
-- real / hora_salida_real se llenan solas con now() si no vienen dadas
-- (el trigger es la fuente de verdad), pero respetan un valor explícito
-- si la pantalla lo manda (corrección de un check-in capturado tarde).
-- Aplica igual en INSERT (walk-in que nace directo en en_curso) que en
-- UPDATE (check-in de una reserva ya existente).
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
  v_entra_en_curso boolean;
  v_entra_finalizada boolean;
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

  -- Check-in: quién entrega es obligatorio, la hora se autocompleta.
  v_entra_en_curso := new.estado = 'en_curso' and (TG_OP = 'INSERT' or old.estado <> 'en_curso');
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
  v_entra_finalizada := new.estado = 'finalizada' and (TG_OP = 'INSERT' or old.estado <> 'finalizada');
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
