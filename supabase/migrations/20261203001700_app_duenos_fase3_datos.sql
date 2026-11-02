-- App para dueños · Fase 3 · Negocios que ya usan PeluDesk — capa de datos (1 de noviembre de 2026; docs/app-duenos/FASE-3.md).
--
-- La app del dueño entra a cada negocio donde su mascota tiene expediente CON LA MISMA MEMBRESÍA de cliente que usa el
-- portal (mascotas_vinculos ⇔ membresía de cliente, Fase 0): el servidor manda el encabezado del negocio y la base
-- decide con mi_cliente_id(), igual que en el portal. Por eso casi todo se reutiliza tal cual (mis_visitas, mi_carnet,
-- mi_expediente, mis_recetas, contratos, bitácora, firma) y aquí solo entra lo que el portal no tenía:
--   1. confirmar una cita o una reserva en un toque;
--   2. los reportes del día que el negocio ya mandó;
--   3. los pagos pendientes del dueño, con el link de pago vigente (decisión: el dueño sí ve SU saldo y el precio de lo
--      que él mismo reserva; sigue sin leer ninguna tabla con dinero);
--   4. pases y saldo (sin lo que pagó por ellos);
--   5. disponibilidad real: horas libres para una cita y cupo por noche para una estancia;
--   6. pedir cita y reservar guardería u hotel, con el contrato de alta en el mismo flujo;
--   7. reseñas verificadas: solo quien tuvo una cita o estancia FINALIZADA.
-- Todo es de peludesk_definer (ve solo el negocio de la petición) y exige al dueño (mi_cliente_id()); nada corre con
-- la llave anónima. Solo se agrega; nada de lo que existe cambia.

-- Las funciones de abajo (de peludesk_definer) nombran a quien atiende con nombre_de_persona: que ese rol la pueda llamar.
grant execute on function public.nombre_de_persona(uuid, text) to peludesk_definer;

-- ── 0. Quién soy aquí: el expediente del dueño y si un perro es suyo (o compartido con él) ────────────────────────
create or replace function public.portal_perro_es_mio(p_perro uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.perros p
    where p.id = p_perro and p.deleted_at is null and p.negocio_id = public.negocio_actual()
      and public.mi_cliente_id() is not null
      and (p.cliente_id = public.mi_cliente_id()
           or exists (select 1 from public.perro_accesos_compartidos pac
                      where pac.perro_id = p.id and pac.cliente_id = public.mi_cliente_id() and pac.deleted_at is null))
  );
$$;
alter function public.portal_perro_es_mio(uuid) owner to peludesk_definer;
revoke execute on function public.portal_perro_es_mio(uuid) from public, anon;
grant execute on function public.portal_perro_es_mio(uuid) to authenticated, service_role;

-- ── 1. Confirmar en un toque ─────────────────────────────────────────────────────────────────────────────────────
-- Una cita o una estancia «reservada» de un perro del dueño, que todavía no empieza, pasa a «confirmada». Nada más:
-- cancelar y mover siguen siendo con el negocio (los candados de la agenda lo exigen).
create or replace function public.portal_confirmar_visita(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_perro uuid;
  v_estado text;
  v_empieza timestamptz;
  v_entrada date;
  v_updated timestamptz;
begin
  perform public.exigir_negocio_escribible();
  if p_tipo = 'estetica' then
    select c.perro_id, c.estado, c.inicio into v_perro, v_estado, v_empieza
    from public.citas_estetica c where c.id = p_id and c.deleted_at is null and c.negocio_id = public.negocio_actual();
  elsif p_tipo = 'estancia' then
    select e.perro_id, e.estado, null, e.fecha_entrada into v_perro, v_estado, v_empieza, v_entrada
    from public.estancias e where e.id = p_id and e.deleted_at is null and e.negocio_id = public.negocio_actual();
  else
    raise exception 'Tipo de visita desconocido.';
  end if;
  if v_perro is null or not public.portal_perro_es_mio(v_perro) then
    raise exception 'Esa visita no es de una mascota tuya.' using errcode = '42501';
  end if;
  if v_estado = 'confirmada' then
    raise exception 'Esta visita ya estaba confirmada.';
  end if;
  if v_estado <> 'reservada' then
    raise exception 'Esta visita ya no se puede confirmar (está %).', v_estado;
  end if;
  if (p_tipo = 'estetica' and v_empieza <= now()) or (p_tipo = 'estancia' and v_entrada < public.fecha_negocio()) then
    raise exception 'Esta visita ya empezó o ya pasó: habla con el negocio.';
  end if;
  if p_tipo = 'estetica' then
    update public.citas_estetica set estado = 'confirmada' where id = p_id returning updated_at into v_updated;
  else
    update public.estancias set estado = 'confirmada' where id = p_id returning updated_at into v_updated;
  end if;
  return jsonb_build_object('tipo', p_tipo, 'id', p_id, 'estado', 'confirmada', 'updated_at', v_updated);
end;
$$;
alter function public.portal_confirmar_visita(text, uuid) owner to peludesk_definer;
revoke execute on function public.portal_confirmar_visita(text, uuid) from public, anon;
grant execute on function public.portal_confirmar_visita(text, uuid) to authenticated, service_role;

-- ── 2. Los reportes del día que el negocio ya mandó (nunca borradores ni quién los llenó) ────────────────────────
create or replace function public.mis_reportes_enviados(p_perro uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', r.id, 'fecha', r.fecha, 'contenido', r.contenido, 'tarjeta_path', case when r.tarjeta_vencida_at is null then r.tarjeta_path end,
        'enviado_at', r.enviado_at, 'estancia_id', r.estancia_id
      ) order by r.fecha desc)
    from public.reportes_guarderia r
    where r.perro_id = p_perro and r.negocio_id = public.negocio_actual() and r.deleted_at is null
      and r.estado = 'enviado' and r.enviado_at is not null
      and public.portal_perro_es_mio(p_perro)
  ), '[]'::jsonb);
$$;
alter function public.mis_reportes_enviados(uuid) owner to peludesk_definer;
revoke execute on function public.mis_reportes_enviados(uuid) from public, anon;
grant execute on function public.mis_reportes_enviados(uuid) to authenticated, service_role;

-- ── 3. Pagos pendientes del dueño, con su link vigente ───────────────────────────────────────────────────────────
-- La misma cuenta y el mismo saldo que Caja (cuentas_abiertas), solo las del cliente que llama y con saldo. El link es
-- el último de Mercado Pago (tipo link) que sigue vivo; si no hay, la pantalla ofrece pedirlo (acción del servidor).
create or replace function public.mis_pagos_pendientes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
        'reserva_id', c.reserva_id, 'descripcion', c.descripcion, 'perros', c.perros, 'fecha_actividad', c.fecha_actividad,
        'saldo', c.saldo,
        'link', (select jsonb_build_object('url', o.url_pago, 'monto', o.monto, 'expira_at', o.expira_at)
                   from public.mp_ordenes o
                  where o.reserva_id = c.reserva_id and o.negocio_id = public.negocio_actual() and o.deleted_at is null
                    and o.tipo = 'link' and o.estado in ('creada', 'pendiente') and o.url_pago is not null
                    and (o.expira_at is null or o.expira_at > now())
                  order by o.created_at desc limit 1)
      ) order by c.fecha_actividad desc)
    from public.cuentas_abiertas(365) c
    where public.mi_cliente_id() is not null and c.cliente_id = public.mi_cliente_id() and c.saldo > 0
  ), '[]'::jsonb);
$$;
alter function public.mis_pagos_pendientes() owner to peludesk_definer;
revoke execute on function public.mis_pagos_pendientes() from public, anon;
grant execute on function public.mis_pagos_pendientes() to authenticated, service_role;

-- ── 4. Pases y saldo (sin lo que pagó por ellos) ─────────────────────────────────────────────────────────────────
create or replace function public.mis_pases()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_agg(jsonb_build_object(
        'id', b.id, 'servicio_nombre', b.servicio_nombre, 'servicio_incluido_nombre', b.servicio_incluido_nombre,
        'perro_id', b.perro_id, 'perro_nombre', b.perro_nombre,
        'cantidad_total', b.cantidad_total, 'cantidad_disponible', b.cantidad_disponible, 'ilimitado', b.ilimitado,
        'fecha_compra', b.fecha_compra, 'fecha_vencimiento', b.fecha_vencimiento, 'estado', b.estado
      ) order by (b.estado = 'activo') desc, b.fecha_vencimiento nulls last, b.fecha_compra desc)
    from public.bonos_clientes_estado b
    where public.mi_cliente_id() is not null and b.cliente_id = public.mi_cliente_id()
  ), '[]'::jsonb);
$$;
alter function public.mis_pases() owner to peludesk_definer;
revoke execute on function public.mis_pases() from public, anon;
grant execute on function public.mis_pases() to authenticated, service_role;

-- ── 5a. Horas libres para una cita de estética en un día ──────────────────────────────────────────────────────────
-- Bloques de 30 minutos entre la apertura y el cierre de ese día (resolver_cupo_configuracion), que quepan completos
-- antes del cierre y empiecen al menos 30 minutos después de ahora. Un bloque está libre si alguien del personal de
-- estética (o admin) no tiene otra cita encimada ni una ausencia aprobada que lo cubra. Devuelve también la duración.
create or replace function public.portal_horas_disponibles(p_servicio uuid, p_fecha date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_zona text := public.zona_negocio();
  v_dur int;
  v_cat text;
  v_abre time;
  v_cierra time;
  v_horas jsonb;
begin
  if public.mi_cliente_id() is null then
    raise exception 'Solo el dueño, desde su cuenta.' using errcode = '42501';
  end if;
  select s.duracion_minutos, s.categoria into v_dur, v_cat
  from public.servicios s where s.id = p_servicio and s.negocio_id = v_neg and s.deleted_at is null;
  if v_dur is null or v_cat <> 'estetica' then
    raise exception 'Ese servicio no es de estética en este negocio.';
  end if;
  v_dur := greatest(coalesce(v_dur, 60), 15);
  select cc.hora_apertura, cc.hora_cierre into v_abre, v_cierra from public.resolver_cupo_configuracion(p_fecha) cc;
  if v_abre is null or v_cierra is null then
    return jsonb_build_object('fecha', p_fecha, 'abre', false, 'duracion_minutos', v_dur, 'horas', '[]'::jsonb);
  end if;
  with personal as (
    select m.profile_id as id
    from public.membresias m
    where m.negocio_id = v_neg and m.deleted_at is null and m.rol in ('estetica', 'admin')
      and not exists (select 1 from public.empleados e where e.profile_id = m.profile_id and e.negocio_id = v_neg and e.deleted_at is null
                      and e.fecha_baja is not null and e.fecha_baja <= public.fecha_negocio())
  ),
  bloques as (
    select ((p_fecha::text || ' ' || v_abre::text)::timestamp + (n * interval '30 minutes')) at time zone v_zona as inicio
    from generate_series(0, 48) n
    where (v_abre + (n * interval '30 minutes') + (v_dur * interval '1 minute'))::time <= v_cierra
      and (v_abre + (n * interval '30 minutes'))::time < v_cierra
  ),
  libres as (
    select b.inicio
    from bloques b
    where b.inicio >= now() + interval '30 minutes'
      and exists (
        select 1 from personal pe
        where not exists (
          select 1 from public.citas_estetica c
          where c.empleado_id = pe.id and c.negocio_id = v_neg and c.deleted_at is null
            and c.estado not in ('cancelada', 'no_llego')
            and tstzrange(c.inicio, c.fin, '[)') && tstzrange(b.inicio, b.inicio + (v_dur * interval '1 minute'), '[)')
        )
        and not exists (
          select 1 from public.ausencias a
          join public.empleados em on em.id = a.empleado_id
          where em.profile_id = pe.id and a.negocio_id = v_neg and a.deleted_at is null and a.estado = 'aprobada'
            and p_fecha between a.desde and a.hasta
            and (a.hora_desde is null or a.hora_hasta is null
                 or (b.inicio at time zone v_zona)::time < a.hora_hasta and (b.inicio at time zone v_zona)::time + (v_dur * interval '1 minute') > a.hora_desde)
        )
      )
  )
  select coalesce(jsonb_agg(jsonb_build_object('inicio', l.inicio, 'hora', to_char(l.inicio at time zone v_zona, 'HH24:MI')) order by l.inicio), '[]'::jsonb)
    into v_horas from libres l;
  return jsonb_build_object('fecha', p_fecha, 'abre', true, 'duracion_minutos', v_dur, 'horas', v_horas);
end;
$$;
alter function public.portal_horas_disponibles(uuid, date) owner to peludesk_definer;
revoke execute on function public.portal_horas_disponibles(uuid, date) from public, anon;
grant execute on function public.portal_horas_disponibles(uuid, date) to authenticated, service_role;

-- ── 5b. Cupo por día para una estancia (guardería: diurno; hotel: nocturno), con la misma cuenta que valida la reserva ──
create or replace function public.portal_disponibilidad_estancia(p_servicio uuid, p_entrada date, p_salida date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cat text;
  v_dias jsonb;
  v_hay boolean;
begin
  if public.mi_cliente_id() is null then
    raise exception 'Solo el dueño, desde su cuenta.' using errcode = '42501';
  end if;
  select s.categoria into v_cat from public.servicios s where s.id = p_servicio and s.negocio_id = public.negocio_actual() and s.deleted_at is null;
  if v_cat not in ('guarderia', 'hotel') then
    raise exception 'Ese servicio no es de guardería ni de hotel en este negocio.';
  end if;
  if p_salida <= p_entrada or p_entrada < public.fecha_negocio() or p_salida > p_entrada + 60 then
    raise exception 'Revisa las fechas: la salida va después de la entrada, desde hoy y hasta 60 días.';
  end if;
  with dias as (
    select d::date as fecha from generate_series(p_entrada, p_salida - 1, interval '1 day') d
  ),
  cuenta as (
    select d.fecha,
           cc.hora_apertura is not null as abre,
           case when v_cat = 'hotel' then cc.cupo_nocturno else cc.cupo_diurno end as cupo,
           public.ocupacion_del_dia(d.fecha, v_cat = 'hotel') as ocupado
    from dias d
    cross join lateral public.resolver_cupo_configuracion(d.fecha) cc
  )
  select jsonb_agg(jsonb_build_object('fecha', c.fecha, 'abre', c.abre, 'cupo', c.cupo, 'ocupado', c.ocupado,
                                      'disponible', greatest(coalesce(c.cupo, 0) - c.ocupado, 0)) order by c.fecha),
         bool_and(coalesce(c.cupo, 0) - c.ocupado > 0 and (v_cat = 'hotel' or c.abre))
    into v_dias, v_hay
  from cuenta c;
  return jsonb_build_object('categoria', v_cat, 'dias', coalesce(v_dias, '[]'::jsonb), 'hay_cupo', coalesce(v_hay, false));
end;
$$;
alter function public.portal_disponibilidad_estancia(uuid, date, date) owner to peludesk_definer;
revoke execute on function public.portal_disponibilidad_estancia(uuid, date, date) from public, anon;
grant execute on function public.portal_disponibilidad_estancia(uuid, date, date) to authenticated, service_role;

-- ── 6a. Pedir cita de estética ───────────────────────────────────────────────────────────────────────────────────
-- La misma cita que agenda recepción (reserva + cita; el precio y el fin los pone la base al insertar), con quien esté
-- libre a esa hora. Una mascota no lleva dos citas el mismo día desde la app (N30: eso lo decide el negocio).
create or replace function public.portal_pedir_cita(p_perro uuid, p_servicio uuid, p_inicio timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_zona text := public.zona_negocio();
  v_cliente uuid := public.mi_cliente_id();
  v_dur int;
  v_cat text;
  v_fecha date;
  v_abre time;
  v_cierra time;
  v_empleado uuid;
  v_reserva uuid;
  v_cita record;
begin
  perform public.exigir_negocio_escribible();
  if v_cliente is null or not public.portal_perro_es_mio(p_perro) then
    raise exception 'Esa mascota no es tuya en este negocio.' using errcode = '42501';
  end if;
  select s.duracion_minutos, s.categoria into v_dur, v_cat
  from public.servicios s where s.id = p_servicio and s.negocio_id = v_neg and s.deleted_at is null;
  if v_cat is distinct from 'estetica' then
    raise exception 'Ese servicio no es de estética en este negocio.';
  end if;
  v_dur := greatest(coalesce(v_dur, 60), 15);
  if p_inicio < now() + interval '30 minutes' then
    raise exception 'Escoge una hora de aquí en adelante.';
  end if;
  v_fecha := (p_inicio at time zone v_zona)::date;
  select cc.hora_apertura, cc.hora_cierre into v_abre, v_cierra from public.resolver_cupo_configuracion(v_fecha) cc;
  if v_abre is null or v_cierra is null then
    raise exception 'Ese día el negocio no abre. Escoge otro.';
  end if;
  if (p_inicio at time zone v_zona)::time < v_abre or ((p_inicio at time zone v_zona)::time + (v_dur * interval '1 minute')) > v_cierra then
    raise exception 'Esa hora queda fuera del horario de atención (% a %).', to_char(v_abre, 'HH24:MI'), to_char(v_cierra, 'HH24:MI');
  end if;
  if exists (
    select 1 from public.citas_estetica c
    where c.perro_id = p_perro and c.negocio_id = v_neg and c.deleted_at is null and c.estado not in ('cancelada', 'no_llego')
      and (c.inicio at time zone v_zona)::date = v_fecha
  ) then
    raise exception 'Tu mascota ya tiene una cita ese día en este negocio. Para otra el mismo día, habla con el negocio.';
  end if;
  -- Quién la atiende: alguien del personal de estética (o admin) sin otra cita encimada ni ausencia aprobada.
  select pe.id into v_empleado
  from (
    select m.profile_id as id, (m.rol = 'estetica') as es_estilista
    from public.membresias m
    where m.negocio_id = v_neg and m.deleted_at is null and m.rol in ('estetica', 'admin')
      and not exists (select 1 from public.empleados e where e.profile_id = m.profile_id and e.negocio_id = v_neg and e.deleted_at is null
                      and e.fecha_baja is not null and e.fecha_baja <= public.fecha_negocio())
  ) pe
  where not exists (
      select 1 from public.citas_estetica c
      where c.empleado_id = pe.id and c.negocio_id = v_neg and c.deleted_at is null and c.estado not in ('cancelada', 'no_llego')
        and tstzrange(c.inicio, c.fin, '[)') && tstzrange(p_inicio, p_inicio + (v_dur * interval '1 minute'), '[)'))
    and not exists (
      select 1 from public.ausencias a join public.empleados em on em.id = a.empleado_id
      where em.profile_id = pe.id and a.negocio_id = v_neg and a.deleted_at is null and a.estado = 'aprobada'
        and v_fecha between a.desde and a.hasta
        and (a.hora_desde is null or a.hora_hasta is null
             or (p_inicio at time zone v_zona)::time < a.hora_hasta and (p_inicio at time zone v_zona)::time + (v_dur * interval '1 minute') > a.hora_desde))
  order by pe.es_estilista desc, (select count(*) from public.citas_estetica c2 where c2.empleado_id = pe.id and c2.negocio_id = v_neg and c2.deleted_at is null
                                   and c2.estado not in ('cancelada', 'no_llego') and (c2.inicio at time zone v_zona)::date = v_fecha)
  limit 1;
  if v_empleado is null then
    raise exception 'Esa hora ya se ocupó. Escoge otra de las que siguen libres.';
  end if;
  insert into public.reservas (negocio_id, cliente_id) values (v_neg, v_cliente) returning id into v_reserva;
  insert into public.citas_estetica (negocio_id, reserva_id, perro_id, servicio_id, empleado_id, inicio)
  values (v_neg, v_reserva, p_perro, p_servicio, v_empleado, p_inicio)
  returning id, inicio, fin, precio, servicio_nombre, estado, updated_at into v_cita;
  return jsonb_build_object('cita_id', v_cita.id, 'reserva_id', v_reserva, 'inicio', v_cita.inicio, 'fin', v_cita.fin,
    'precio', v_cita.precio, 'servicio_nombre', v_cita.servicio_nombre, 'estado', v_cita.estado, 'updated_at', v_cita.updated_at,
    'atiende', public.nombre_de_persona(v_empleado, null));
end;
$$;
alter function public.portal_pedir_cita(uuid, uuid, timestamptz) owner to peludesk_definer;
revoke execute on function public.portal_pedir_cita(uuid, uuid, timestamptz) from public, anon;
grant execute on function public.portal_pedir_cita(uuid, uuid, timestamptz) to authenticated, service_role;

-- ── 6b. Reservar guardería u hotel, con el contrato de alta en el mismo flujo ────────────────────────────────────
-- La misma estancia que crea recepción: la base valida cupo (diurno o nocturno), requisitos sanitarios, evaluación de
-- comportamiento, celo/gestación, alertas y traslapes (validar_estancia). Después, si el negocio tiene tipos de
-- contrato de alta para guardería u hotel y el perro no tiene uno firmado ni pendiente, se genera pendiente de firma
-- (igual que generar_contrato, que es del personal) y se devuelve para firmarlo ahí mismo. Si hay un pase vigente, se
-- aplica (aplicar_bono_a_estancia); si eso no se puede, la estancia queda igual, pagada suelta.
create or replace function public.portal_reservar(p_perro uuid, p_servicio uuid, p_entrada date, p_salida date, p_horas int default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_cliente uuid := public.mi_cliente_id();
  v_cat text;
  v_unidad text;
  v_reserva uuid;
  v_est record;
  v_bono jsonb := null;
  v_contratos jsonb := '[]'::jsonb;
  v_t record;
  v_contrato uuid;
begin
  perform public.exigir_negocio_escribible();
  if v_cliente is null or not public.portal_perro_es_mio(p_perro) then
    raise exception 'Esa mascota no es tuya en este negocio.' using errcode = '42501';
  end if;
  select s.categoria, s.unidad into v_cat, v_unidad from public.servicios s where s.id = p_servicio and s.negocio_id = v_neg and s.deleted_at is null;
  if v_cat not in ('guarderia', 'hotel') then
    raise exception 'Ese servicio no es de guardería ni de hotel en este negocio.';
  end if;
  if p_entrada is null or p_salida is null or p_salida <= p_entrada or p_entrada < public.fecha_negocio() or p_salida > p_entrada + 60 then
    raise exception 'Revisa las fechas: la salida va después de la entrada, desde hoy y hasta 60 días.';
  end if;
  insert into public.reservas (negocio_id, cliente_id) values (v_neg, v_cliente) returning id into v_reserva;
  insert into public.estancias (negocio_id, reserva_id, perro_id, servicio_id, fecha_entrada, fecha_salida, horas)
  values (v_neg, v_reserva, p_perro, p_servicio, p_entrada, p_salida, case when v_unidad = 'hora' then p_horas end)
  returning id, fecha_entrada, fecha_salida, precio_unitario, estado, horas, updated_at into v_est;
  -- El pase, si lo hay (día de guardería); si la función del personal lo rechaza, la estancia queda pagada suelta.
  begin
    v_bono := public.aplicar_bono_a_estancia(v_est.id);
  exception when others then
    v_bono := null;
  end;
  -- Contratos de alta de guardería/hotel que al perro le faltan.
  for v_t in select * from public.tipos_contrato_de_alta('guarderia_hotel') loop
    if not exists (
      select 1 from public.contratos c join public.plantillas_contrato pl on pl.id = c.plantilla_id
      where c.perro_id = p_perro and c.deleted_at is null and pl.tipo_contrato_id = v_t.tipo_contrato_id
        and c.estado in ('pendiente_firma', 'firmado_digital', 'firmado_papel')
    ) then
      insert into public.contratos (negocio_id, perro_id, cliente_id, plantilla_id, estado)
      values (v_neg, p_perro, v_cliente, v_t.plantilla_id, 'pendiente_firma') returning id into v_contrato;
      v_contratos := v_contratos || jsonb_build_object('id', v_contrato, 'tipo_nombre', v_t.tipo_nombre);
    else
      select c.id into v_contrato from public.contratos c join public.plantillas_contrato pl on pl.id = c.plantilla_id
      where c.perro_id = p_perro and c.deleted_at is null and pl.tipo_contrato_id = v_t.tipo_contrato_id and c.estado = 'pendiente_firma'
      order by c.created_at desc limit 1;
      if v_contrato is not null then
        v_contratos := v_contratos || jsonb_build_object('id', v_contrato, 'tipo_nombre', v_t.tipo_nombre);
      end if;
    end if;
  end loop;
  return jsonb_build_object('reserva_id', v_reserva, 'estancia_id', v_est.id, 'fecha_entrada', v_est.fecha_entrada, 'fecha_salida', v_est.fecha_salida,
    'estado', v_est.estado, 'updated_at', v_est.updated_at, 'categoria', v_cat,
    'precio_total', case when v_unidad = 'hora' then v_est.precio_unitario * coalesce(v_est.horas, 1) else v_est.precio_unitario * (v_est.fecha_salida - v_est.fecha_entrada) end,
    'bono', v_bono, 'contratos_por_firmar', v_contratos);
end;
$$;
alter function public.portal_reservar(uuid, uuid, date, date, int) owner to peludesk_definer;
revoke execute on function public.portal_reservar(uuid, uuid, date, date, int) from public, anon;
grant execute on function public.portal_reservar(uuid, uuid, date, date, int) to authenticated, service_role;

-- ── 7. Reseñas verificadas ───────────────────────────────────────────────────────────────────────────────────────
create table public.resenas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cliente_id uuid not null references public.clientes(id),
  perro_id uuid references public.perros(id) on delete set null,
  origen_tipo text not null check (origen_tipo in ('estetica', 'estancia')),
  origen_id uuid not null,
  estrellas int not null check (estrellas between 1 and 5),
  texto text check (texto is null or char_length(texto) <= 500),
  -- El negocio puede contestar (pantalla del personal, pendiente) y esconder una reseña de la vista pública.
  respuesta text check (respuesta is null or char_length(respuesta) <= 500),
  respondida_at timestamptz,
  publicada boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (negocio_id, origen_tipo, origen_id)
);
create index resenas_negocio_idx on public.resenas (negocio_id, created_at desc) where deleted_at is null;
create index resenas_cliente_idx on public.resenas (cliente_id);
create trigger set_updated_at before insert or update on public.resenas for each row execute function public.set_updated_at();
alter table public.resenas enable row level security;
create policy resenas_select_propio on public.resenas for select to authenticated using (cliente_id = (select public.mi_cliente_id()));
create policy resenas_select_staff on public.resenas for select to authenticated using ((select public.is_staff()));
create policy resenas_update_staff on public.resenas for update to authenticated
  using ((select public.current_rol()) in ('admin', 'recepcion')) with check ((select public.current_rol()) in ('admin', 'recepcion'));
create policy resenas_negocio on public.resenas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy resenas_negocio_definer on public.resenas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.resenas to peludesk_definer;

-- El personal no cambia las estrellas ni el texto del dueño: solo contesta o esconde.
create or replace function public.resenas_solo_respuesta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') and (
       new.estrellas is distinct from old.estrellas or new.texto is distinct from old.texto
    or new.cliente_id is distinct from old.cliente_id or new.origen_id is distinct from old.origen_id
    or new.origen_tipo is distinct from old.origen_tipo or new.perro_id is distinct from old.perro_id
  ) then
    raise exception 'Una reseña es del dueño: el negocio solo puede contestarla o esconderla.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.resenas_solo_respuesta() from public, anon, authenticated;
alter function public.resenas_solo_respuesta() owner to peludesk_definer;
create trigger resenas_solo_respuesta before update on public.resenas for each row execute function public.resenas_solo_respuesta();

-- Solo quien tuvo esa cita o estancia, y ya terminó (finalizada), opina; una vez por visita.
create or replace function public.portal_resenar(p_tipo text, p_id uuid, p_estrellas int, p_texto text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.mi_cliente_id();
  v_perro uuid;
  v_estado text;
  v_fila public.resenas%rowtype;
begin
  perform public.exigir_negocio_escribible();
  if v_cliente is null then
    raise exception 'Solo el dueño, desde su cuenta.' using errcode = '42501';
  end if;
  if p_estrellas is null or p_estrellas < 1 or p_estrellas > 5 then
    raise exception 'Califica de 1 a 5 estrellas.';
  end if;
  if p_tipo = 'estetica' then
    select c.perro_id, c.estado into v_perro, v_estado from public.citas_estetica c
    where c.id = p_id and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  elsif p_tipo = 'estancia' then
    select e.perro_id, e.estado into v_perro, v_estado from public.estancias e
    where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  else
    raise exception 'Tipo de visita desconocido.';
  end if;
  if v_perro is null or not public.portal_perro_es_mio(v_perro) then
    raise exception 'Solo puedes opinar de una visita de tu mascota.' using errcode = '42501';
  end if;
  if v_estado <> 'finalizada' then
    raise exception 'Podrás opinar cuando la visita termine.';
  end if;
  if exists (select 1 from public.resenas r where r.negocio_id = public.negocio_actual() and r.origen_tipo = p_tipo and r.origen_id = p_id) then
    raise exception 'Ya opinaste de esta visita.';
  end if;
  insert into public.resenas (negocio_id, cliente_id, perro_id, origen_tipo, origen_id, estrellas, texto)
  values (public.negocio_actual(), v_cliente, v_perro, p_tipo, p_id, p_estrellas, nullif(btrim(coalesce(p_texto, '')), ''))
  returning * into v_fila;
  return jsonb_build_object('id', v_fila.id, 'origen_tipo', v_fila.origen_tipo, 'origen_id', v_fila.origen_id, 'estrellas', v_fila.estrellas,
    'texto', v_fila.texto, 'created_at', v_fila.created_at, 'updated_at', v_fila.updated_at);
end;
$$;
alter function public.portal_resenar(text, uuid, int, text) owner to peludesk_definer;
revoke execute on function public.portal_resenar(text, uuid, int, text) from public, anon;
grant execute on function public.portal_resenar(text, uuid, int, text) to authenticated, service_role;

-- Lo que el público verá de un negocio (pantalla pendiente): promedio, cuántas y las últimas publicadas, con el primer
-- nombre del dueño. Solo con sesión (la página pública la pedirá el servidor).
create or replace function public.resenas_de_negocio(p_negocio uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'total', (select count(*) from public.resenas r where r.negocio_id = p_negocio and r.deleted_at is null and r.publicada),
    'promedio', (select round(avg(r.estrellas)::numeric, 1) from public.resenas r where r.negocio_id = p_negocio and r.deleted_at is null and r.publicada),
    'ultimas', coalesce((
      select jsonb_agg(jsonb_build_object('estrellas', r.estrellas, 'texto', r.texto, 'respuesta', r.respuesta, 'created_at', r.created_at,
                                          'quien', split_part(coalesce(cl.nombre, ''), ' ', 1), 'origen_tipo', r.origen_tipo) order by r.created_at desc)
      from (select * from public.resenas r0 where r0.negocio_id = p_negocio and r0.deleted_at is null and r0.publicada order by r0.created_at desc limit 20) r
      join public.clientes cl on cl.id = r.cliente_id
    ), '[]'::jsonb)
  );
$$;
alter function public.resenas_de_negocio(uuid) owner to peludesk_definer;
revoke execute on function public.resenas_de_negocio(uuid) from public, anon;
grant execute on function public.resenas_de_negocio(uuid) to authenticated, service_role;
