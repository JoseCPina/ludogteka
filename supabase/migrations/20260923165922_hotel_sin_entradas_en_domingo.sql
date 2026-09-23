-- El hotel tampoco RECIBE perros en día cerrado (domingo), igual que no
-- los entrega. El contrato general ya lo dice ("no recibe ni entrega
-- perros para hotel los domingos"); ahora la base lo hace cumplir.
--
-- Se revisan solo el día de llegada y el de entrega. Las noches de en
-- medio no: un perro que entra el viernes y sale el lunes pasa el domingo
-- adentro, y eso se permite.
--
-- La conversión de guardería a noche de hotel (convertir_estancia_a_hotel)
-- no cambia: conserva la fecha de entrada de la guardería, que por
-- definición es un día que abre (guardería en día cerrado ya se
-- rechazaba), y desde 20260923155312 pasa la salida al siguiente día que
-- abre. Una guardería de sábado se vuelve hotel de sábado a lunes.
--
-- Solo revalida al crear, al cambiar fechas o servicio, o al reactivar
-- (misma guarda de antes): una reserva vieja que ya entra en domingo se
-- puede seguir cerrando o cancelando sin tocarla.

-- validar_estancia_dia_abierto: cuerpo de 20260923155312, con la llegada.
create or replace function public.validar_estancia_dia_abierto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_dia date;
  v_nombres text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
begin
  if new.deleted_at is not null or new.estado in ('cancelada', 'no_llego') then
    return new;
  end if;

  if TG_OP = 'UPDATE'
    and new.servicio_id is not distinct from old.servicio_id
    and new.fecha_entrada is not distinct from old.fecha_entrada
    and new.fecha_salida is not distinct from old.fecha_salida
    and old.estado not in ('cancelada', 'no_llego')
  then
    return new;
  end if;

  select categoria into v_categoria from public.servicios where id = new.servicio_id;

  if v_categoria = 'guarderia' then
    for v_dia in select generate_series(new.fecha_entrada, new.fecha_salida - 1, interval '1 day')::date loop
      if not public.negocio_abre(v_dia) then
        raise exception 'Guardería no abre en % (%). Elige un día con horario de atención.',
          v_nombres[extract(isodow from v_dia)::int], to_char(v_dia, 'DD/MM/YYYY');
      end if;
    end loop;
  elsif v_categoria = 'hotel' then
    -- Solo el día de llegada y el de entrega: las noches de en medio no
    -- se revisan. Un perro que entra el viernes y sale el lunes pasa el
    -- domingo adentro, y eso está bien.
    if not public.negocio_abre(new.fecha_entrada) then
      raise exception 'El hotel no recibe perros en % (%). Cambia la llegada a un día con horario de atención.',
        v_nombres[extract(isodow from new.fecha_entrada)::int], to_char(new.fecha_entrada, 'DD/MM/YYYY');
    end if;
    if not public.negocio_abre(new.fecha_salida) then
      raise exception 'El hotel no entrega perros en % (%). Cambia la salida a un día con horario de atención.',
        v_nombres[extract(isodow from new.fecha_salida)::int], to_char(new.fecha_salida, 'DD/MM/YYYY');
    end if;
  end if;

  return new;
end;
$$;

-- guardar_horario_semana: cuerpo de 20260923155312; el aviso de reservas
-- en días que ya no abren cuenta también las llegadas de hotel (las que
-- no han llegado: una en curso ya entró).
create or replace function public.guardar_horario_semana(p_dias jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vigente public.cupo_configuracion%rowtype;
  v_hoy date := public.fecha_negocio();
  v_id uuid;
  v_dia jsonb;
  v_num int;
  v_ap time;
  v_ci time;
  v_vistos int[] := array[]::int[];
  v_afectadas int;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede cambiar el horario del negocio.';
  end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) <> 7 then
    raise exception 'Manda el horario de los siete días.';
  end if;

  select * into v_vigente
  from public.cupo_configuracion
  where vigencia_desde <= v_hoy and deleted_at is null
  order by vigencia_desde desc, created_at desc
  limit 1;
  if not found then
    raise exception 'Primero guarda la configuración del negocio (cupo) y luego el horario.';
  end if;

  -- Validar todo antes de escribir nada.
  for v_dia in select * from jsonb_array_elements(p_dias) loop
    v_num := (v_dia->>'dia_semana')::int;
    if v_num is null or v_num < 0 or v_num > 6 or v_num = any(v_vistos) then
      raise exception 'El horario trae un día de la semana inválido o repetido.';
    end if;
    v_vistos := v_vistos || v_num;
    v_ap := nullif(v_dia->>'hora_apertura', '')::time;
    v_ci := nullif(v_dia->>'hora_cierre', '')::time;
    if (v_ap is null) <> (v_ci is null) then
      raise exception 'Cada día abierto necesita hora de apertura y de cierre.';
    end if;
    if v_ap is not null and v_ci <= v_ap then
      raise exception 'La hora de cierre tiene que ser después de la de apertura.';
    end if;
  end loop;

  if v_vigente.vigencia_desde = v_hoy then
    v_id := v_vigente.id;
    update public.horario_semana set deleted_at = now()
    where cupo_configuracion_id = v_id and deleted_at is null;
  else
    insert into public.cupo_configuracion
      (vigencia_desde, cupo_diurno, cupo_nocturno, hora_cierre,
       base_direccion, base_lat, base_lng, telefono_recepcion, created_by)
    values
      (v_hoy, v_vigente.cupo_diurno, v_vigente.cupo_nocturno, v_vigente.hora_cierre,
       v_vigente.base_direccion, v_vigente.base_lat, v_vigente.base_lng,
       v_vigente.telefono_recepcion, auth.uid())
    returning id into v_id;
  end if;

  insert into public.horario_semana (cupo_configuracion_id, dia_semana, hora_apertura, hora_cierre, created_by)
  select v_id,
    (d->>'dia_semana')::int,
    nullif(d->>'hora_apertura', '')::time,
    nullif(d->>'hora_cierre', '')::time,
    auth.uid()
  from jsonb_array_elements(p_dias) d;

  -- Reservas activas de hoy en adelante que caen en un día que ya no abre:
  -- guardería ese día, o llegada o salida de hotel ese día.
  select count(*) into v_afectadas
  from public.estancias e
  join public.servicios s on s.id = e.servicio_id
  where e.deleted_at is null
    and e.estado in ('reservada', 'confirmada', 'en_curso')
    and (
      (s.categoria = 'guarderia' and e.fecha_entrada >= v_hoy and not public.negocio_abre(e.fecha_entrada))
      or (s.categoria = 'hotel' and e.fecha_salida >= v_hoy and not public.negocio_abre(e.fecha_salida))
      or (s.categoria = 'hotel' and e.estado <> 'en_curso' and e.fecha_entrada >= v_hoy and not public.negocio_abre(e.fecha_entrada))
    );

  return jsonb_build_object('configuracion_id', v_id, 'reservas_en_dias_cerrados', v_afectadas);
end;
$$;
