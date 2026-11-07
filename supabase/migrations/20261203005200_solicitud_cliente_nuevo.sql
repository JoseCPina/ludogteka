-- Hacerse cliente de un negocio PeluDesk desde la app (docs/app-duenos/FASE-3.md, «Cliente nuevo»): el dueño, sin expediente
-- en ese negocio, pide una reserva o cita y comparte datos que él ve y confirma. Sin cobro ni cupo hasta que el negocio
-- acepte: entonces se crea el cliente y el expediente, se liga la mascota global (nunca se duplica) y nace la reserva.
-- Quien pide no es miembro del negocio: todo su camino va por el servidor (service_role) después de comprobar su sesión.

-- ── 1. El ajuste del negocio ────────────────────────────────────────────────────────────────────────────────────────
alter table public.negocios add column acepta_clientes_app boolean not null default true;
comment on column public.negocios.acepta_clientes_app is 'Si los dueños de la app pueden pedir hacerse clientes de este negocio. Apagado, la app los manda a WhatsApp.';

create or replace function public.negocio_fijar_acepta_clientes_app(p_acepta boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_updated timestamptz;
begin
  perform public.exigir_negocio_escribible();
  if coalesce(public.current_rol(), 'anonimo') <> 'admin' then
    raise exception 'Solo un admin cambia este ajuste.' using errcode = '42501';
  end if;
  update public.negocios n set acepta_clientes_app = coalesce(p_acepta, true) where n.id = public.negocio_actual()
  returning n.id, n.updated_at into v_id, v_updated;
  return jsonb_build_object('id', v_id, 'acepta_clientes_app', coalesce(p_acepta, true), 'updated_at', v_updated);
end;
$$;
alter function public.negocio_fijar_acepta_clientes_app(boolean) owner to peludesk_definer;
revoke execute on function public.negocio_fijar_acepta_clientes_app(boolean) from public, anon;
grant execute on function public.negocio_fijar_acepta_clientes_app(boolean) to authenticated;

-- ── 2. La solicitud y las cotizaciones de quien todavía no es cliente ───────────────────────────────────────────────
alter table public.solicitudes_reserva
  add column es_cliente_nuevo boolean not null default false,
  add column dueno_id uuid references public.duenos(id),
  add column mascota_id uuid references public.mascotas(id),
  add column datos_compartidos jsonb,
  add column consentido_at timestamptz,
  alter column cliente_id drop not null,
  alter column perro_id drop not null,
  add constraint solicitudes_reserva_quien_check check (
    case when es_cliente_nuevo
      then dueno_id is not null and mascota_id is not null and datos_compartidos is not null and consentido_at is not null
      else cliente_id is not null and perro_id is not null end
  );
create index solicitudes_reserva_dueno_idx on public.solicitudes_reserva (dueno_id, created_at desc) where dueno_id is not null;
comment on column public.solicitudes_reserva.datos_compartidos is 'Lo que el dueño vio y confirmó compartir: es todo lo que el negocio lee de él hasta aceptar.';

alter table public.recoleccion_cotizaciones
  add column dueno_id uuid references public.duenos(id),
  alter column cliente_id drop not null,
  add constraint recoleccion_cotizaciones_quien_check check (cliente_id is not null or dueno_id is not null);
create index recoleccion_cotizaciones_dueno_idx on public.recoleccion_cotizaciones (dueno_id, created_at desc) where dueno_id is not null;

-- ── 3. Lo que el servidor ya puede leer para quien no es miembro ────────────────────────────────────────────────────
do $$
declare
  v_nombre text;
  v_def text;
  v_ancla text := 'if public.mi_cliente_id() is null then';
begin
  foreach v_nombre in array array['public.portal_disponibilidad_estancia(uuid,date,date)', 'public.portal_horas_disponibles(uuid,date)'] loop
    select replace(pg_get_functiondef(v_nombre::regprocedure), E'\r', '') into v_def;
    if position(v_ancla in v_def) = 0 then
      raise exception '% cambió: no encuentro su revisión.', v_nombre;
    end if;
    execute replace(v_def, v_ancla, $b$if public.mi_cliente_id() is null and coalesce(auth.role(), '') <> 'service_role' then$b$);
  end loop;
  select replace(pg_get_functiondef('public.recoleccion_puntos_partida()'::regprocedure), E'\r', '') into v_def;
  v_ancla := 'where coalesce((select public.is_staff()), false) or (select public.mi_cliente_id()) is not null';
  if position(v_ancla in v_def) = 0 then
    raise exception 'recoleccion_puntos_partida cambió: no encuentro su revisión.';
  end if;
  execute replace(v_def, v_ancla, v_ancla || $b$ or coalesce(auth.role(), '') = 'service_role'$b$);
end $$;
grant execute on function public.portal_disponibilidad_estancia(uuid, date, date) to service_role;
grant execute on function public.portal_horas_disponibles(uuid, date) to service_role;

create or replace function public.recoleccion_precio_de_km(p_km numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serv uuid;
  v_cant int := greatest(1, ceil(p_km))::int;
  v_unit numeric;
  v_estado text;
begin
  select s.id into v_serv from public.servicios s where s.negocio_id = public.negocio_actual() and s.clave = 'recoleccion' and s.deleted_at is null limit 1;
  if v_serv is null then
    return jsonb_build_object('precio', null, 'cantidad', v_cant);
  end if;
  select r.precio, r.estado into v_unit, v_estado from public.resolver_precio(v_serv, null, null, v_cant, public.fecha_negocio()) r;
  return jsonb_build_object('cantidad', v_cant, 'precio', case when v_estado = 'disponible' then round(v_unit * v_cant, 2) end);
end;
$$;
alter function public.recoleccion_precio_de_km(numeric) owner to peludesk_definer;
revoke execute on function public.recoleccion_precio_de_km(numeric) from public, anon, authenticated;
grant execute on function public.recoleccion_precio_de_km(numeric) to service_role;

-- ── 4. El dueño pide (siempre por el servidor, que ya comprobó su sesión) ───────────────────────────────────────────
create or replace function public.app_pedir_cliente_nuevo(p_dueno uuid, p_mascota uuid, p_servicio uuid, p_entrada date, p_salida date, p_horas int, p_inicio timestamptz, p_recoleccion jsonb, p_consentido boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_d record;
  v_m record;
  v_cat text;
  v_unidad text;
  v_tipo text;
  v_disp jsonb;
  v_expira timestamptz := now() + interval '3 days';
  v_datos jsonb;
  v_fila public.solicitudes_reserva%rowtype;
begin
  perform public.exigir_negocio_escribible();
  if not coalesce(p_consentido, false) then
    raise exception 'Confirma qué datos se comparten con el negocio.';
  end if;
  if not coalesce((select n.acepta_clientes_app from public.negocios n where n.id = v_neg), false) then
    raise exception 'Este negocio recibe clientes nuevos por WhatsApp.';
  end if;
  select ma.id, ma.nombre, ma.especie, ma.especie_detalle, ma.raza_texto, ma.fecha_nacimiento, ma.foto_path into v_m
  from public.mascotas ma where ma.id = p_mascota and ma.dueno_id = p_dueno and ma.deleted_at is null and not ma.fallecido;
  if v_m.id is null then
    raise exception 'Esa mascota no es tuya.' using errcode = '42501';
  end if;
  if exists (select 1 from public.mascotas_vinculos v where v.mascota_id = p_mascota and v.negocio_id = v_neg and v.deleted_at is null) then
    raise exception 'Esta mascota ya es cliente de este negocio: reserva desde su ficha.';
  end if;
  if exists (select 1 from public.membresias m where m.negocio_id = v_neg and m.profile_id = p_dueno and m.deleted_at is null and m.rol <> 'cliente') then
    raise exception 'Eres parte del personal de este negocio: agéndala desde el panel.';
  end if;
  select d.nombre, d.telefono into v_d from public.duenos d where d.id = p_dueno and d.deleted_at is null;
  if char_length(btrim(coalesce(v_d.nombre, ''))) < 2 then
    raise exception 'Escribe tu nombre en Mi cuenta para que el negocio sepa quién eres.';
  end if;
  if v_d.telefono is null then
    raise exception 'Tu cuenta no tiene teléfono: entra con tu WhatsApp para pedir tu lugar.';
  end if;
  select s.categoria, s.unidad into v_cat, v_unidad from public.servicios s where s.id = p_servicio and s.negocio_id = v_neg and s.deleted_at is null;
  if v_cat is null or v_cat not in ('guarderia', 'hotel', 'estetica') then
    raise exception 'Ese servicio no existe en este negocio.';
  end if;
  v_tipo := case when v_cat = 'estetica' then 'cita' else 'estancia' end;
  if v_tipo = 'estancia' then
    v_disp := public.portal_disponibilidad_estancia(p_servicio, p_entrada, p_salida);
    if exists (select 1 from jsonb_array_elements(v_disp -> 'dias') d where not coalesce((d ->> 'abre')::boolean, true)) then
      raise exception 'Ese día el negocio no abre. Escoge otro.';
    end if;
    v_expira := least(v_expira, ((p_entrada + 1)::timestamp at time zone public.zona_negocio()));
  else
    if p_inicio is null or p_inicio < now() + interval '30 minutes' then
      raise exception 'Escoge una hora de aquí en adelante.';
    end if;
    v_expira := least(v_expira, p_inicio);
  end if;
  if exists (
    select 1 from public.solicitudes_reserva s
    where s.negocio_id = v_neg and s.mascota_id = p_mascota and s.es_cliente_nuevo and s.estado = 'pendiente' and s.deleted_at is null and s.expira_at > now()
  ) then
    raise exception 'Ya pediste ser cliente con esta mascota. El negocio te avisa en cuanto lo revise.';
  end if;
  -- Lo que se comparte, y nada más: el negocio solo leerá esto hasta aceptar.
  v_datos := jsonb_build_object(
    'nombre', btrim(v_d.nombre),
    'telefono', v_d.telefono,
    'mascota', jsonb_build_object('nombre', v_m.nombre, 'especie', v_m.especie, 'especie_detalle', v_m.especie_detalle, 'raza', v_m.raza_texto,
                                  'fecha_nacimiento', v_m.fecha_nacimiento, 'foto_path', v_m.foto_path),
    'cartilla', coalesce((
      select jsonb_agg(jsonb_build_object('tipo', c.tipo, 'nombre', c.nombre, 'fecha_aplicacion', c.fecha_aplicacion, 'proxima_dosis', c.proxima_dosis) order by c.fecha_aplicacion desc nulls last)
      from public.mascotas_cartilla c where c.mascota_id = p_mascota and c.deleted_at is null), '[]'::jsonb));
  insert into public.solicitudes_reserva (negocio_id, es_cliente_nuevo, dueno_id, mascota_id, servicio_id, tipo, fecha_entrada, fecha_salida, horas, inicio,
                                          recoleccion, motivos, datos_compartidos, consentido_at, expira_at, created_by)
  values (v_neg, true, p_dueno, p_mascota, p_servicio, v_tipo,
          case when v_tipo = 'estancia' then p_entrada end, case when v_tipo = 'estancia' then p_salida end,
          case when v_tipo = 'estancia' and v_unidad = 'hora' then p_horas end, case when v_tipo = 'cita' then p_inicio end,
          p_recoleccion, jsonb_build_array(jsonb_build_object('clave', 'cliente_nuevo')), v_datos, now(), v_expira, p_dueno)
  returning * into v_fila;
  return jsonb_build_object('id', v_fila.id, 'estado', v_fila.estado, 'expira_at', v_fila.expira_at, 'updated_at', v_fila.updated_at);
end;
$$;
alter function public.app_pedir_cliente_nuevo(uuid, uuid, uuid, date, date, int, timestamptz, jsonb, boolean) owner to peludesk_definer;
revoke execute on function public.app_pedir_cliente_nuevo(uuid, uuid, uuid, date, date, int, timestamptz, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.app_pedir_cliente_nuevo(uuid, uuid, uuid, date, date, int, timestamptz, jsonb, boolean) to service_role;

create or replace function public.app_cancelar_cliente_nuevo(p_id uuid, p_dueno uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_fila public.solicitudes_reserva%rowtype;
begin
  update public.solicitudes_reserva s set estado = 'cancelada', resuelta_at = now()
  where s.id = p_id and s.negocio_id = public.negocio_actual() and s.dueno_id = p_dueno and s.es_cliente_nuevo and s.estado = 'pendiente' and s.deleted_at is null
  returning * into v_fila;
  if not found then
    raise exception 'Esa solicitud ya no está pendiente.';
  end if;
  return jsonb_build_object('id', v_fila.id, 'estado', v_fila.estado, 'updated_at', v_fila.updated_at);
end;
$$;
alter function public.app_cancelar_cliente_nuevo(uuid, uuid) owner to peludesk_definer;
revoke execute on function public.app_cancelar_cliente_nuevo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.app_cancelar_cliente_nuevo(uuid, uuid) to service_role;

-- Las solicitudes de cliente nuevo se leen por dueño (en la app), no por cliente.
create or replace function public.mis_solicitudes()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'tipo', s.tipo, 'perro_id', s.perro_id, 'perro_nombre', p.nombre, 'servicio_nombre', sv.nombre,
    'fecha_entrada', s.fecha_entrada, 'fecha_salida', s.fecha_salida, 'inicio', s.inicio,
    'estado', s.estado, 'motivos', s.motivos, 'motivo_rechazo', s.motivo_rechazo, 'evaluacion_agendada_at', s.evaluacion_agendada_at,
    'expira_at', s.expira_at, 'created_at', s.created_at, 'updated_at', s.updated_at
  ) order by s.created_at desc), '[]'::jsonb)
  from public.solicitudes_reserva s
  join public.perros p on p.id = s.perro_id
  join public.servicios sv on sv.id = s.servicio_id
  where s.negocio_id = public.negocio_actual() and s.cliente_id = public.mi_cliente_id() and s.deleted_at is null and not s.es_cliente_nuevo
    and s.created_at > now() - interval '30 days';
$$;

-- ── 5. Avisar: a la persona de la solicitud, tenga o no expediente ──────────────────────────────────────────────────
create or replace function public.solicitud_avisar(p_id uuid, p_titulo text, p_cuerpo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_s record;
  v_dueno uuid;
  v_mascota uuid;
begin
  if (select n.plan from public.negocios n where n.id = v_neg) = 'demo' then
    return;
  end if;
  select s.perro_id, s.dueno_id, s.mascota_id into v_s from public.solicitudes_reserva s where s.id = p_id;
  v_dueno := v_s.dueno_id;
  v_mascota := v_s.mascota_id;
  if v_dueno is null then
    select m.dueno_id, m.id into v_dueno, v_mascota
    from public.mascotas_vinculos mv join public.mascotas m on m.id = mv.mascota_id
    where mv.perro_id = v_s.perro_id and mv.deleted_at is null and m.deleted_at is null limit 1;
  end if;
  if v_dueno is null then
    return;
  end if;
  insert into public.app_avisos (dueno_id, mascota_id, tipo, titulo, cuerpo, url, datos, created_by, updated_at)
  values (v_dueno, v_mascota, 'negocio', left(p_titulo, 120), left(p_cuerpo, 600), '/visitas',
          jsonb_build_object('push_pendiente', true, 'negocio_id', v_neg, 'origen', 'solicitud', 'origen_id', p_id), null, now());
end;
$$;
alter function public.solicitud_avisar(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.solicitud_avisar(uuid, text, text) from public, anon, authenticated;

-- ── 6. Crear el expediente sin duplicar la mascota global ───────────────────────────────────────────────────────────
-- Al insertar un perro con membresía, el disparador nacería otra mascota global. Dentro de la aceptación, el vínculo lo
-- pone la función con la mascota que ya existe; la bandera dura solo esa transacción.
do $$
declare
  v_def text;
  v_ancla text := 'select * into v_p from public.perros p where p.id = p_perro_id;';
begin
  select replace(pg_get_functiondef('public.app_vincular_perro(uuid)'::regprocedure), E'\r', '') into v_def;
  if position(v_ancla in v_def) = 0 then
    raise exception 'app_vincular_perro cambió: no encuentro su inicio.';
  end if;
  execute replace(v_def, v_ancla, $b$if coalesce(current_setting('app.sin_vincular', true), '') = '1' then return null; end if;
  $b$ || v_ancla);
end $$;

-- ── 7. Aceptar: reemplaza a la versión de 20261203004900 ────────────────────────────────────────────────────────────
drop function public.solicitud_aceptar(uuid, text);
create function public.solicitud_aceptar(p_id uuid, p_motivo text default null, p_tamano uuid default null, p_pelaje uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s public.solicitudes_reserva%rowtype;
  v_neg uuid := public.negocio_actual();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_reserva uuid;
  v_estancia uuid;
  v_cita uuid;
  v_eval boolean;
  v_san boolean;
  v_dur int;
  v_empleado uuid;
  v_zona text := public.zona_negocio();
  v_fecha date;
  v_cliente uuid;
  v_perro uuid;
  v_datos jsonb;
  v_membresia boolean;
  v_raza uuid;
begin
  v_s := public.solicitud_tomar(p_id);
  if v_motivo is not null and not public.tiene_permiso('excepciones_reserva') then
    raise exception 'Solo un admin, o quien tenga el permiso «Excepciones al reservar», puede aceptar con excepción.' using errcode = '42501';
  end if;
  if v_s.es_cliente_nuevo then
    -- Quien acepta a un cliente nuevo con permiso deja dicho por qué falta lo que falta; sin permiso, la base lo rechaza.
    if v_motivo is null and public.tiene_permiso('excepciones_reserva') then
      v_motivo := 'Cliente nuevo aceptado desde la app: revisar sus requisitos cuando llegue.';
    end if;
    v_datos := v_s.datos_compartidos;
    select m.cliente_id, true into v_cliente, v_membresia from public.membresias m
    where m.negocio_id = v_neg and m.profile_id = v_s.dueno_id and m.rol = 'cliente' and m.deleted_at is null limit 1;
    if v_cliente is null then
      select c.id into v_cliente from public.clientes c where c.negocio_id = v_neg and c.telefono = v_datos ->> 'telefono' and c.deleted_at is null limit 1;
    end if;
    if v_cliente is null then
      insert into public.clientes (negocio_id, nombre, telefono) values (v_neg, v_datos ->> 'nombre', v_datos ->> 'telefono') returning id into v_cliente;
    end if;
    select r.id into v_raza from public.razas r where lower(r.nombre) = lower(btrim(coalesce(v_datos #>> '{mascota,raza}', ''))) limit 1;
    perform set_config('app.sin_vincular', '1', true);
    insert into public.perros (negocio_id, cliente_id, nombre, especie, especie_detalle, fecha_nacimiento, raza, raza_id, tamano_id, pelaje_id)
    values (v_neg, v_cliente, v_datos #>> '{mascota,nombre}', coalesce(v_datos #>> '{mascota,especie}', 'perro'), v_datos #>> '{mascota,especie_detalle}',
            (v_datos #>> '{mascota,fecha_nacimiento}')::date, v_datos #>> '{mascota,raza}', v_raza, p_tamano, p_pelaje)
    returning id into v_perro;
    insert into public.mascotas_vinculos (mascota_id, negocio_id, perro_id, updated_at) values (v_s.mascota_id, v_neg, v_perro, now());
    perform set_config('app.sin_vincular', '0', true);
    if not coalesce(v_membresia, false) then
      insert into public.membresias (negocio_id, profile_id, rol, cliente_id) values (v_neg, v_s.dueno_id, 'cliente', v_cliente);
    end if;
    update public.solicitudes_reserva s set cliente_id = v_cliente, perro_id = v_perro where s.id = v_s.id returning * into v_s;
  end if;
  insert into public.reservas (negocio_id, cliente_id) values (v_neg, v_s.cliente_id) returning id into v_reserva;
  if v_s.tipo = 'estancia' then
    select (pr.evaluacion_comportamiento_fecha is null and public.evaluacion_exigida()) into v_eval from public.perros pr where pr.id = v_s.perro_id;
    select exists (select 1 from public.perro_requisitos_sanitarios_estado pre where pre.perro_id = v_s.perro_id and pre.estado in ('vencida', 'sin_registro')) into v_san;
    insert into public.estancias (negocio_id, reserva_id, perro_id, servicio_id, fecha_entrada, fecha_salida, horas,
                                  bloqueo_sanitario_superado, motivo_excepcion_sanitaria, bloqueo_comportamiento_superado, motivo_excepcion_comportamiento)
    values (v_neg, v_reserva, v_s.perro_id, v_s.servicio_id, v_s.fecha_entrada, v_s.fecha_salida, v_s.horas,
            v_san and v_motivo is not null, case when v_san then v_motivo end,
            v_eval and v_motivo is not null, case when v_eval then v_motivo end)
    returning id into v_estancia;
    begin
      perform public.aplicar_bono_a_estancia(v_estancia);
    exception when others then
      null;
    end;
    perform public.solicitud_preparar_contratos(v_s.perro_id, v_s.cliente_id);
  else
    select greatest(coalesce(sv.duracion_minutos, 60), 15) into v_dur from public.servicios sv where sv.id = v_s.servicio_id;
    v_fecha := (v_s.inicio at time zone v_zona)::date;
    select m.profile_id into v_empleado
    from public.membresias m
    where m.negocio_id = v_neg and m.deleted_at is null and m.rol in ('estetica', 'admin')
      and not exists (select 1 from public.citas_estetica c
                      where c.empleado_id = m.profile_id and c.negocio_id = v_neg and c.deleted_at is null and c.estado not in ('cancelada', 'no_llego')
                        and tstzrange(c.inicio, c.fin, '[)') && tstzrange(v_s.inicio, v_s.inicio + (v_dur * interval '1 minute'), '[)'))
      and not exists (select 1 from public.ausencias a join public.empleados em on em.id = a.empleado_id
                      where em.profile_id = m.profile_id and a.negocio_id = v_neg and a.deleted_at is null and a.estado = 'aprobada' and v_fecha between a.desde and a.hasta)
    order by (m.rol = 'estetica') desc
    limit 1;
    if v_empleado is null then
      raise exception 'Esa hora ya no tiene a nadie libre. Contacta al dueño para proponerle otra.';
    end if;
    insert into public.citas_estetica (negocio_id, reserva_id, perro_id, servicio_id, empleado_id, inicio)
    values (v_neg, v_reserva, v_s.perro_id, v_s.servicio_id, v_empleado, v_s.inicio)
    returning id into v_cita;
    if v_s.es_cliente_nuevo then
      perform public.solicitud_preparar_contratos(v_s.perro_id, v_s.cliente_id);
    end if;
  end if;
  if v_s.recoleccion is not null then
    perform public.recoleccion_guardar(v_reserva, v_estancia, v_cita, null, (v_s.recoleccion ->> 'hora')::time, v_s.recoleccion ->> 'direccion',
      (v_s.recoleccion ->> 'lat')::double precision, (v_s.recoleccion ->> 'lng')::double precision,
      coalesce(v_s.recoleccion ->> 'punto', 'negocio'), (v_s.recoleccion ->> 'km')::numeric, v_s.recoleccion ->> 'notas', false);
  end if;
  update public.solicitudes_reserva s set estado = 'aceptada', resuelta_por = auth.uid(), resuelta_at = now(), motivo_excepcion = v_motivo,
    reserva_id = v_reserva, estancia_id = v_estancia, cita_id = v_cita
  where s.id = v_s.id returning * into v_s;
  perform public.solicitud_avisar(v_s.id, 'Aceptaron tu solicitud', case when v_s.es_cliente_nuevo then 'Ya eres cliente de este negocio y tu lugar aparece en tus visitas.' else 'El negocio aceptó tu lugar. Ya aparece en tus visitas.' end);
  return to_jsonb(v_s);
end;
$$;
alter function public.solicitud_aceptar(uuid, text, uuid, uuid) owner to peludesk_definer;
revoke execute on function public.solicitud_aceptar(uuid, text, uuid, uuid) from public, anon;
grant execute on function public.solicitud_aceptar(uuid, text, uuid, uuid) to authenticated;

create or replace function public.solicitud_rechazar(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_s public.solicitudes_reserva%rowtype;
begin
  v_s := public.solicitud_tomar(p_id);
  if char_length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe el motivo: el dueño lo va a leer.';
  end if;
  update public.solicitudes_reserva s set estado = 'rechazada', motivo_rechazo = btrim(p_motivo), resuelta_por = auth.uid(), resuelta_at = now()
  where s.id = v_s.id returning * into v_s;
  perform public.solicitud_avisar(v_s.id, 'No pudieron darte ese lugar', 'Motivo: ' || btrim(p_motivo));
  return to_jsonb(v_s);
end;
$$;

create or replace function public.solicitud_agendar_evaluacion(p_id uuid, p_cuando timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_s public.solicitudes_reserva%rowtype;
begin
  v_s := public.solicitud_tomar(p_id);
  if p_cuando is null or p_cuando < now() then
    raise exception 'Escoge un día y una hora de aquí en adelante.';
  end if;
  update public.solicitudes_reserva s set evaluacion_agendada_at = p_cuando, expira_at = greatest(s.expira_at, p_cuando + interval '3 days')
  where s.id = v_s.id returning * into v_s;
  perform public.solicitud_avisar(v_s.id, 'Agendaron su evaluación',
    'El negocio la agendó para el ' || to_char(p_cuando at time zone public.zona_negocio(), 'DD/MM/YYYY') || ' a las ' || to_char(p_cuando at time zone public.zona_negocio(), 'HH24:MI') || '.');
  return to_jsonb(v_s);
end;
$$;

create or replace function public.solicitudes_caducar()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_s record;
  v_n int := 0;
begin
  for v_s in
    update public.solicitudes_reserva s set estado = 'caducada', resuelta_at = now()
    where s.negocio_id = public.negocio_actual() and s.estado = 'pendiente' and s.deleted_at is null and s.expira_at <= now()
    returning s.id
  loop
    perform public.solicitud_avisar(v_s.id, 'Tu solicitud caducó', 'El negocio no alcanzó a responderla a tiempo. Puedes volver a pedir lugar o escribirle por WhatsApp.');
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.solicitudes_del_negocio(p_solo_pendientes boolean default true)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo el personal de recepción o un admin ve las solicitudes.' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'tipo', s.tipo, 'estado', s.estado, 'perro_id', s.perro_id, 'perro_nombre', coalesce(p.nombre, s.datos_compartidos #>> '{mascota,nombre}'),
      'cliente_id', s.cliente_id, 'cliente_nombre', coalesce(c.nombre, s.datos_compartidos ->> 'nombre'), 'cliente_telefono', coalesce(c.telefono, s.datos_compartidos ->> 'telefono'),
      'servicio_nombre', sv.nombre, 'fecha_entrada', s.fecha_entrada, 'fecha_salida', s.fecha_salida, 'horas', s.horas, 'inicio', s.inicio,
      'recoleccion', s.recoleccion, 'motivos', s.motivos, 'evaluacion_agendada_at', s.evaluacion_agendada_at,
      'motivo_rechazo', s.motivo_rechazo, 'motivo_excepcion', s.motivo_excepcion, 'expira_at', s.expira_at,
      'resuelta_at', s.resuelta_at, 'reserva_id', s.reserva_id, 'created_at', s.created_at, 'updated_at', s.updated_at,
      'es_cliente_nuevo', s.es_cliente_nuevo, 'datos_compartidos', s.datos_compartidos
    ) order by s.created_at), '[]'::jsonb)
    from public.solicitudes_reserva s
    left join public.perros p on p.id = s.perro_id
    left join public.clientes c on c.id = s.cliente_id
    join public.servicios sv on sv.id = s.servicio_id
    where s.negocio_id = public.negocio_actual() and s.deleted_at is null
      and ((p_solo_pendientes and s.estado = 'pendiente' and s.expira_at > now())
           or (not p_solo_pendientes and s.created_at > now() - interval '30 days')));
end;
$$;

drop function if exists public.solicitud_avisar_dueno(uuid, text, text, uuid);
