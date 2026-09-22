-- Fase 17, parte 1: guardería por hora y los requisitos de estancia que
-- el cartel del negocio exige y la app no sabía pedir.
--
-- Todo lo de aquí es estructura y reglas. Los precios y el catálogo
-- (qué servicios existen, cuánto cuestan) van en la migración de datos
-- de esta misma fase, aparte, para que se lea qué es regla y qué es
-- captura.

-- ── 1. Guardería ocasional se cobra por hora ─────────────────────────
-- La modalidad por hora usa la dimensión de cantidad que ya existe:
-- cantidad = horas, con su tramo 1+ en la matriz, igual que las noches
-- de hotel o los kilómetros de recolección. No es un sistema aparte.
alter table public.servicios
  drop constraint if exists servicios_unidad_check;
alter table public.servicios
  add constraint servicios_unidad_check
  check (unidad in ('dia', 'noche', 'sesion', 'evento', 'km', 'hora'));

-- Una estancia por horas sigue siendo una estancia (mismo cupo diurno,
-- mismo check-in, misma cuenta): ocupa un día del calendario y además
-- sabe cuántas horas se cobran. Se reserva con un estimado y al
-- check-out se ajusta a lo real, nunca hacia abajo.
alter table public.estancias
  add column if not exists horas int
    check (horas is null or horas >= 1);

comment on column public.estancias.horas is
  'Solo para servicios con unidad = hora: cuántas horas se cobran. Se estima al reservar y al check-out sube a las horas reales si fueron más.';

-- ── 2. Requisitos de estancia en el expediente del perro ─────────────
-- Evaluación previa de comportamiento: la marca recepción una vez por
-- perro, con fecha y quién. Quién la hizo lo pone la base desde la
-- sesión, no lo manda la pantalla.
alter table public.perros
  add column if not exists evaluacion_comportamiento_fecha date,
  add column if not exists evaluacion_comportamiento_por uuid references auth.users(id) on delete set null,
  add column if not exists evaluacion_comportamiento_notas text;

-- Perras en celo o gestantes: no se quedan en guardería ni hotel
-- mientras dure. Es una marca que recepción prende y apaga; no tiene
-- fecha de fin porque nadie la sabe con exactitud.
alter table public.perros
  add column if not exists en_celo boolean not null default false,
  add column if not exists gestante boolean not null default false;

alter table public.perros
  drop constraint if exists perros_estado_reproductivo_solo_hembras;
alter table public.perros
  add constraint perros_estado_reproductivo_solo_hembras
  check (sexo is distinct from 'macho' or (not en_celo and not gestante));

comment on column public.perros.evaluacion_comportamiento_fecha is
  'Evaluación previa de comportamiento, requisito de guardería y hotel. Null = no se ha hecho; la reserva avisa y solo admin puede pasar por encima con motivo.';
comment on column public.perros.en_celo is
  'Bloquea guardería y hotel mientras esté prendida. Solo hembras.';
comment on column public.perros.gestante is
  'Bloquea guardería y hotel mientras esté prendida. Solo hembras.';

-- Agresividad: ya existía como alerta de manejo. Lo que faltaba era que
-- una alerta pudiera BLOQUEAR, y eso es un atributo del catálogo, no un
-- nombre codificado en el trigger: el negocio decide cuál bloquea.
alter table public.catalogo_alertas
  add column if not exists bloquea_estancia boolean not null default false;

comment on column public.catalogo_alertas.bloquea_estancia is
  'Una alerta activa de este tipo impide reservar guardería u hotel. No afecta estética.';

update public.catalogo_alertas
set bloquea_estancia = true
where clave = 'muerde';

insert into public.catalogo_alertas (clave, etiqueta, orden, bloquea_estancia, updated_at)
select 'agresivo', 'Agresivo', 0, true, now()
where not exists (select 1 from public.catalogo_alertas where clave = 'agresivo');

-- La excepción de admin para la evaluación de comportamiento, con el
-- mismo contrato que la sanitaria: solo admin, siempre con motivo, y
-- quién autorizó lo pone el trigger.
alter table public.estancias
  add column if not exists bloqueo_comportamiento_superado boolean not null default false,
  add column if not exists motivo_excepcion_comportamiento text;

alter table public.estancias
  drop constraint if exists estancias_excepcion_comportamiento_con_motivo;
alter table public.estancias
  add constraint estancias_excepcion_comportamiento_con_motivo
  check (not bloqueo_comportamiento_superado or motivo_excepcion_comportamiento is not null);

-- ── 3. Marcar la evaluación: quién la hizo sale de la sesión ─────────
create or replace function public.marcar_evaluacion_comportamiento(
  p_perro_id uuid,
  p_fecha date,
  p_notas text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden marcar la evaluación de comportamiento.';
  end if;
  if p_fecha is null then
    raise exception 'Indica la fecha en que se hizo la evaluación.';
  end if;
  if p_fecha > public.fecha_negocio() then
    raise exception 'La fecha de la evaluación no puede ser futura.';
  end if;

  update public.perros
  set evaluacion_comportamiento_fecha = p_fecha,
      evaluacion_comportamiento_por = auth.uid(),
      evaluacion_comportamiento_notas = nullif(btrim(coalesce(p_notas, '')), '')
  where id = p_perro_id and deleted_at is null;

  if not found then
    raise exception 'Perro no encontrado.';
  end if;
end;
$$;

revoke execute on function public.marcar_evaluacion_comportamiento(uuid, date, text) from public;
revoke execute on function public.marcar_evaluacion_comportamiento(uuid, date, text) from anon;
grant execute on function public.marcar_evaluacion_comportamiento(uuid, date, text) to authenticated;

-- Quitarla es decisión de admin (una evaluación que se marcó por error).
create or replace function public.quitar_evaluacion_comportamiento(p_perro_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede quitar una evaluación ya marcada.';
  end if;
  update public.perros
  set evaluacion_comportamiento_fecha = null,
      evaluacion_comportamiento_por = null,
      evaluacion_comportamiento_notas = null
  where id = p_perro_id;
end;
$$;

revoke execute on function public.quitar_evaluacion_comportamiento(uuid) from public;
revoke execute on function public.quitar_evaluacion_comportamiento(uuid) from anon;
grant execute on function public.quitar_evaluacion_comportamiento(uuid) to authenticated;

-- ── 4. El trigger de estancias, con todo lo anterior ─────────────────
-- Cuerpo tomado de 20260729020528_add_estancia_checkin_checkout_campos.sql
-- (la última versión) y extendido. Dos banderas en vez de una:
--
--   v_recotizar  → cambió algo que mueve el precio (servicio, perro,
--                  fechas, HORAS). Solo resuelve el precio.
--   v_revalidar  → cambió algo que mueve los requisitos (servicio,
--                  perro, fechas). Corre sanitario, comportamiento, celo,
--                  agresividad y cupo.
--
-- Antes eran la misma bandera. Con las horas ya no pueden serlo: al
-- check-out las horas suben a las reales y hay que recotizar, pero NO
-- volver a exigirle vacunas a un perro que ya va de salida.
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
        raise exception 'Este perro no tiene tamaño registrado. Complétalo en su expediente antes de reservar.';
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
      raise exception 'No hay tarifa capturada para este servicio en esta fecha. Captúrala antes de reservar.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este servicio no aplica para el tamaño de este perro.';
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

-- ── 5. La cuenta cobra horas cuando el servicio es por hora ──────────
-- Cuerpo tomado de 20260729050308_fix_cuenta_reserva_incluye_bono.sql,
-- parcheado solo en la cantidad de la línea de estancia.
drop function if exists public.cuenta_lineas_reserva(uuid);

create function public.cuenta_lineas_reserva(p_reserva_id uuid)
returns table (
  tipo text,
  origen_id uuid,
  servicio_id uuid,
  descripcion text,
  cantidad numeric,
  precio_unitario numeric,
  total numeric
)
language sql
stable
set search_path = ''
as $$
  select
    'estancia'::text,
    e.id,
    e.servicio_id,
    p.nombre || ' — ' || s.nombre,
    (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric,
    e.precio_unitario,
    e.precio_unitario * (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric
  from public.estancias e
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = e.servicio_id
  where e.reserva_id = p_reserva_id
    and e.deleted_at is null
    and e.estado not in ('cancelada', 'no_llego')

  union all

  select
    'cargo'::text,
    c.id,
    c.servicio_id,
    p.nombre || ' — ' || s.nombre,
    c.cantidad::numeric,
    c.precio,
    c.precio * c.cantidad
  from public.cargos_aplicados c
  join public.estancias e on e.id = c.estancia_id
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = c.servicio_id
  where e.reserva_id = p_reserva_id
    and c.deleted_at is null
    and c.cancelado = false

  union all

  select
    'estetica'::text,
    ce.id,
    ce.servicio_id,
    p.nombre || ' — ' || s.nombre,
    1::numeric,
    ce.precio,
    ce.precio
  from public.citas_estetica ce
  join public.perros p on p.id = ce.perro_id
  join public.servicios s on s.id = ce.servicio_id
  left join public.estancias e on e.id = ce.estancia_id
  where (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
    and ce.deleted_at is null
    and ce.estado not in ('cancelada', 'no_llego')

  union all

  select
    'bono'::text,
    bc.id,
    bc.servicio_id,
    s.nombre,
    1::numeric,
    bc.precio_pagado,
    bc.precio_pagado
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.reserva_id = p_reserva_id
    and bc.deleted_at is null;
$$;

grant execute on function public.cuenta_lineas_reserva(uuid) to authenticated;

-- ── 6. Guardería que no recogen a tiempo se vuelve noche de hotel ────
-- No hay "recogida tardía": si el perro sigue después del cierre, se
-- queda a dormir y se cobra como noche de hotel a su tarifa. Es la MISMA
-- estancia cambiando de servicio: el trigger recotiza por talla, revisa
-- cupo nocturno y los requisitos, exactamente como si se hubiera
-- reservado hotel desde el principio.
create or replace function public.convertir_estancia_a_hotel(p_estancia_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estancia record;
  v_hotel_id uuid;
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

  -- El servicio de hotel que se puede cobrar hoy. Si hay varios, el
  -- primero por orden del catálogo.
  select c.id into v_hotel_id
  from public.servicios_cotizables c
  where c.categoria = 'hotel'
  order by c.orden, c.nombre
  limit 1;

  if v_hotel_id is null then
    raise exception 'No hay ningún servicio de hotel con tarifa capturada. Captúrala antes de convertir la estancia.';
  end if;

  update public.estancias
  set servicio_id = v_hotel_id,
      fecha_salida = v_estancia.fecha_entrada + 1,
      horas = null
  where id = p_estancia_id;
end;
$$;

revoke execute on function public.convertir_estancia_a_hotel(uuid) from public;
revoke execute on function public.convertir_estancia_a_hotel(uuid) from anon;
grant execute on function public.convertir_estancia_a_hotel(uuid) to authenticated;
