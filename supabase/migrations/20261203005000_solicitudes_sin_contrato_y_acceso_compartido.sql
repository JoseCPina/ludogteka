-- «Pedir lugar», ajustes del 6 de noviembre de 2026 (docs/app-duenos/FASE-3.md), sobre la migración 20261203004900:
--
--  1. El contrato de alta sin firmar NO bloquea reservar ni pedir cita: se reserva y se firma después o ahí mismo (el flujo
--     de siempre, con `contratos_por_firmar` en la respuesta de portal_reservar). Solo la evaluación, las vacunas o
--     desparasitaciones vencidas o sin registro, el celo, la gestación, una alerta, la talla o el precio y el cupo dejan
--     solicitud. `portal_reservar` vuelve a como estaba antes de 20261203004900 y `portal_requisitos_reserva` ya no
--     lista el contrato.
--  2. Acceso compartido: quien tiene acceso compartido a la mascota (perro_accesos_compartidos) cotiza la recolección y
--     pide lugar igual que el titular. `recoleccion_km_del_portal` acepta `portal_perro_es_mio` (titular o compartido) y
--     busca la cotización de quien pide (mi_cliente_id()), que es también el cliente de la reserva que crea
--     `portal_reservar`; `portal_pedir_lugar` consume esa misma cotización.

-- ── 1a. portal_reservar: se quita el bloque que exigía el contrato ──────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_bloque text := $b$  select t.tipo_nombre into v_t from public.tipos_contrato_de_alta('guarderia_hotel') t
  where not exists (select 1 from public.contratos c join public.plantillas_contrato pl on pl.id = c.plantilla_id
                    where c.perro_id = p_perro and c.deleted_at is null and pl.tipo_contrato_id = t.tipo_contrato_id and c.estado in ('firmado_digital', 'firmado_papel'))
  limit 1;
  if found then
    raise exception 'Falta firmar el contrato «%» antes de reservar.', v_t.tipo_nombre;
  end if;
$b$;
begin
  select replace(pg_get_functiondef('public.portal_reservar(uuid, uuid, date, date, int)'::regprocedure), E'\r', '') into v_def;
  if position(v_bloque in v_def) = 0 then
    raise exception 'portal_reservar no trae el bloque del contrato que se quería quitar (20261203004900).';
  end if;
  execute replace(v_def, v_bloque, '');
end $$;

-- ── 1b. portal_requisitos_reserva sin el contrato ──────────────────────────────────────────────────────────────────
create or replace function public.portal_requisitos_reserva(p_perro uuid, p_servicio uuid, p_entrada date, p_salida date, p_horas int, p_inicio timestamptz)
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
  v_perro record;
  v_m jsonb := '[]'::jsonb;
  v_disp jsonb;
  v_reserva uuid;
begin
  if v_cliente is null or not public.portal_perro_es_mio(p_perro) then
    raise exception 'Esa mascota no es tuya en este negocio.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clientes c where c.id = v_cliente and c.negocio_id = v_neg and c.deleted_at is null) then
    raise exception 'Cliente no encontrado.' using errcode = '42501';
  end if;
  select s.categoria, s.unidad into v_cat, v_unidad from public.servicios s where s.id = p_servicio and s.negocio_id = v_neg and s.deleted_at is null;
  if v_cat is null then
    raise exception 'Ese servicio no existe en este negocio.';
  end if;

  if v_cat = 'estetica' then
    if p_inicio is null then
      raise exception 'Escoge el día y la hora.';
    end if;
    -- Simulacro: la misma función que agenda; nada queda guardado.
    begin
      perform public.portal_pedir_cita(p_perro, p_servicio, p_inicio);
      raise exception 'SIMULACRO_OK';
    exception when others then
      if sqlstate = '42501' then raise; end if;
      if sqlerrm <> 'SIMULACRO_OK' then
        v_m := v_m || jsonb_build_object('clave', public.clave_de_rechazo_reserva(sqlerrm), 'detalle', sqlerrm);
      end if;
    end;
    return v_m;
  end if;

  if v_cat not in ('guarderia', 'hotel') then
    raise exception 'Ese servicio no es de guardería ni de hotel en este negocio.';
  end if;
  if p_entrada is null or p_salida is null or p_salida <= p_entrada or p_entrada < public.fecha_negocio() or p_salida > p_entrada + 60 then
    raise exception 'Revisa las fechas: la salida va después de la entrada, desde hoy y hasta 60 días.';
  end if;

  select pr.en_celo, pr.gestante, pr.evaluacion_comportamiento_fecha into v_perro from public.perros pr where pr.id = p_perro;
  if v_perro.en_celo then v_m := v_m || jsonb_build_object('clave', 'celo'); end if;
  if v_perro.gestante then v_m := v_m || jsonb_build_object('clave', 'gestante'); end if;
  if exists (select 1 from public.perro_alertas pa join public.catalogo_alertas ca on ca.id = pa.alerta_id
             where pa.perro_id = p_perro and pa.activa and ca.bloquea_estancia and ca.deleted_at is null) then
    v_m := v_m || jsonb_build_object('clave', 'alerta');
  end if;
  if v_perro.evaluacion_comportamiento_fecha is null and public.evaluacion_exigida() then
    v_m := v_m || jsonb_build_object('clave', 'evaluacion');
  end if;
  v_m := v_m || coalesce((
    select jsonb_agg(jsonb_build_object('clave', 'sanitario', 'dato', pre.etiqueta, 'estado', pre.estado) order by pre.etiqueta)
    from public.perro_requisitos_sanitarios_estado pre
    where pre.perro_id = p_perro and pre.estado in ('vencida', 'sin_registro')), '[]'::jsonb);
  -- El contrato de alta no es requisito: se firma después de reservar (o ahí mismo), como siempre.
  v_disp := public.portal_disponibilidad_estancia(p_servicio, p_entrada, p_salida);
  if exists (select 1 from jsonb_array_elements(v_disp -> 'dias') d where not coalesce((d ->> 'abre')::boolean, true)) then
    v_m := v_m || jsonb_build_object('clave', 'fecha', 'detalle', 'Ese día el negocio no abre. Escoge otro.');
  elsif not coalesce((v_disp ->> 'hay_cupo')::boolean, false) then
    v_m := v_m || jsonb_build_object('clave', 'cupo');
  end if;

  -- Con todo lo anterior al corriente, el simulacro atrapa lo que falte (talla, precio, otro validar_*).
  if jsonb_array_length(v_m) = 0 then
    begin
      insert into public.reservas (negocio_id, cliente_id) values (v_neg, v_cliente) returning id into v_reserva;
      insert into public.estancias (negocio_id, reserva_id, perro_id, servicio_id, fecha_entrada, fecha_salida, horas)
      values (v_neg, v_reserva, p_perro, p_servicio, p_entrada, p_salida, case when v_unidad = 'hora' then p_horas end);
      raise exception 'SIMULACRO_OK';
    exception when others then
      if sqlstate = '42501' then raise; end if;
      if sqlerrm <> 'SIMULACRO_OK' then
        v_m := v_m || jsonb_build_object('clave', public.clave_de_rechazo_reserva(sqlerrm), 'detalle', sqlerrm);
      end if;
    end;
  end if;
  return v_m;
end;
$$;
alter function public.portal_requisitos_reserva(uuid, uuid, date, date, int, timestamptz) owner to peludesk_definer;
revoke execute on function public.portal_requisitos_reserva(uuid, uuid, date, date, int, timestamptz) from public, anon;
grant execute on function public.portal_requisitos_reserva(uuid, uuid, date, date, int, timestamptz) to authenticated, service_role;

-- ── 2a. recoleccion_km_del_portal: titular o acceso compartido; la cotización es de quien pide ─────────────────────
create or replace function public.recoleccion_km_del_portal(p_perro uuid, p_recoleccion jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.mi_cliente_id();
  v_km numeric;
begin
  if v_cliente is null or not public.portal_perro_es_mio(p_perro) then
    raise exception 'Esa mascota no es tuya en este negocio.' using errcode = '42501';
  end if;
  select q.km into v_km from public.recoleccion_cotizaciones q
  where q.negocio_id = public.negocio_actual() and q.cliente_id = v_cliente and q.direccion_norm = public.recoleccion_direccion_norm(p_recoleccion ->> 'direccion')
    and q.punto = coalesce(p_recoleccion ->> 'punto', 'negocio') and q.usada_at is null and q.deleted_at is null and q.expira_at > now()
  order by q.created_at desc limit 1;
  if v_km is null then
    raise exception 'Esa dirección no está cotizada. Vuelve a ver cuánto cuesta.' using errcode = '42501';
  end if;
  if v_km > 60 then
    raise exception 'Esa dirección queda a más de 60 km del negocio. Pregúntale al negocio si puede pasar por tu mascota.';
  end if;
  return v_km;
end;
$$;
alter function public.recoleccion_km_del_portal(uuid, jsonb) owner to peludesk_definer;
revoke execute on function public.recoleccion_km_del_portal(uuid, jsonb) from public, anon;
grant execute on function public.recoleccion_km_del_portal(uuid, jsonb) to authenticated, service_role;

-- ── 2b. portal_pedir_lugar: consume la cotización de quien pide ────────────────────────────────────────────────────
create or replace function public.portal_pedir_lugar(p_perro uuid, p_servicio uuid, p_entrada date, p_salida date, p_horas int, p_inicio timestamptz, p_recoleccion jsonb default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_cliente uuid := public.mi_cliente_id();
  v_m jsonb;
  v_cat text;
  v_tipo text;
  v_rec jsonb := null;
  v_km numeric;
  v_punto text;
  v_q record;
  v_expira timestamptz := now() + interval '3 days';
  v_fila public.solicitudes_reserva%rowtype;
  v_detalle text;
begin
  perform public.exigir_negocio_escribible();
  v_m := public.portal_requisitos_reserva(p_perro, p_servicio, p_entrada, p_salida, p_horas, p_inicio);
  if jsonb_array_length(v_m) = 0 then
    raise exception 'Ya no falta nada: puedes reservar directo.';
  end if;
  select x ->> 'detalle' into v_detalle from jsonb_array_elements(v_m) x where x ->> 'clave' = 'fecha' limit 1;
  if found then
    raise exception '%', v_detalle;
  end if;
  select s.categoria into v_cat from public.servicios s where s.id = p_servicio;
  v_tipo := case when v_cat = 'estetica' then 'cita' else 'estancia' end;
  if exists (
    select 1 from public.solicitudes_reserva s
    where s.perro_id = p_perro and s.servicio_id = p_servicio and s.estado = 'pendiente' and s.deleted_at is null and s.expira_at > now()
      and s.fecha_entrada is not distinct from case when v_tipo = 'estancia' then p_entrada end
      and s.inicio is not distinct from case when v_tipo = 'cita' then p_inicio end
  ) then
    raise exception 'Ya pediste ese lugar. El negocio te avisa en cuanto lo revise.';
  end if;
  if (select count(*) from public.solicitudes_reserva s where s.cliente_id = v_cliente and s.estado = 'pendiente' and s.deleted_at is null and s.expira_at > now()) >= 5 then
    raise exception 'Ya tienes 5 solicitudes esperando respuesta de este negocio. Espera su respuesta o escríbele.';
  end if;
  -- La recolección: los km de la cotización de quien pide (titular o acceso compartido), y se usa una sola vez.
  if p_recoleccion is not null and (p_recoleccion ->> 'direccion') is not null then
    v_punto := coalesce(p_recoleccion ->> 'punto', 'negocio');
    v_km := public.recoleccion_km_del_portal(p_perro, p_recoleccion);
    perform public.recoleccion_km_cotizados(v_cliente, p_recoleccion ->> 'direccion', v_punto, v_km);
    select q.lat, q.lng into v_q from public.recoleccion_cotizaciones q
    where q.negocio_id = v_neg and q.cliente_id = v_cliente and q.direccion_norm = public.recoleccion_direccion_norm(p_recoleccion ->> 'direccion')
      and q.usada_at is not null and q.deleted_at is null
    order by q.usada_at desc limit 1;
    v_rec := jsonb_build_object('direccion', btrim(p_recoleccion ->> 'direccion'), 'lat', v_q.lat, 'lng', v_q.lng, 'punto', v_punto, 'km', v_km,
                                'hora', p_recoleccion ->> 'hora', 'notas', p_recoleccion ->> 'notas');
  end if;
  -- Una solicitud no sobrevive a su propia fecha.
  if v_tipo = 'estancia' then
    v_expira := least(v_expira, ((p_entrada + 1)::timestamp at time zone public.zona_negocio()));
  else
    v_expira := least(v_expira, p_inicio);
  end if;
  insert into public.solicitudes_reserva (negocio_id, cliente_id, perro_id, servicio_id, tipo, fecha_entrada, fecha_salida, horas, inicio, recoleccion, motivos, expira_at)
  values (v_neg, v_cliente, p_perro, p_servicio, v_tipo,
          case when v_tipo = 'estancia' then p_entrada end, case when v_tipo = 'estancia' then p_salida end,
          case when v_tipo = 'estancia' then p_horas end, case when v_tipo = 'cita' then p_inicio end, v_rec, v_m, v_expira)
  returning * into v_fila;
  return jsonb_build_object('id', v_fila.id, 'estado', v_fila.estado, 'expira_at', v_fila.expira_at, 'motivos', v_fila.motivos, 'updated_at', v_fila.updated_at);
end;
$$;
alter function public.portal_pedir_lugar(uuid, uuid, date, date, int, timestamptz, jsonb) owner to peludesk_definer;
revoke execute on function public.portal_pedir_lugar(uuid, uuid, date, date, int, timestamptz, jsonb) from public, anon;
grant execute on function public.portal_pedir_lugar(uuid, uuid, date, date, int, timestamptz, jsonb) to authenticated, service_role;
