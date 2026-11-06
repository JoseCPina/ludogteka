-- Un requisito nunca es una pared para el dueño (docs/app-duenos/FASE-3.md, «Pedir lugar»): si falta algo para reservar o
-- pedir cita, puede dejar una SOLICITUD con la fecha, el servicio y la recolección, sin cobrar ni ocupar cupo. El negocio
-- la acepta (con excepción si hace falta), agenda la evaluación, contacta o rechaza; a los 3 días sin respuesta caduca.
-- Además: un cliente dado de baja ya no cuenta como «expediente» en la app (de ahí salía «Cliente no encontrado»).

-- ── 1. El vínculo de la app exige un cliente vivo ──────────────────────────────────────────────────────────────────
create or replace function public.app_mis_vinculos()
returns table(mascota_id uuid, negocio_id uuid, negocio_nombre text, negocio_slug text, negocio_dominio text, negocio_url_publica text, perro_id uuid, perro_foto_path text, perro_raza text)
language sql
stable
security definer
set search_path = ''
as $$
  select v.mascota_id, n.id, n.nombre, n.slug, n.dominio, n.url_publica, v.perro_id, p.foto_path, p.raza
  from public.mascotas_vinculos v
  join public.mascotas ma on ma.id = v.mascota_id and ma.dueno_id = auth.uid()
  join public.negocios n on n.id = v.negocio_id and n.deleted_at is null
  join public.perros p on p.id = v.perro_id
  join public.clientes cl on cl.id = p.cliente_id and cl.deleted_at is null
  where v.deleted_at is null and auth.uid() is not null
  order by n.nombre;
$$;

-- ── 2. La tabla ─────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.solicitudes_reserva (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cliente_id uuid not null references public.clientes(id),
  perro_id uuid not null references public.perros(id),
  servicio_id uuid not null references public.servicios(id),
  tipo text not null check (tipo in ('estancia', 'cita')),
  fecha_entrada date,
  fecha_salida date,
  horas int,
  inicio timestamptz,
  recoleccion jsonb,
  motivos jsonb not null default '[]'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada', 'caducada', 'cancelada')),
  evaluacion_agendada_at timestamptz,
  motivo_excepcion text check (motivo_excepcion is null or char_length(motivo_excepcion) <= 500),
  motivo_rechazo text check (motivo_rechazo is null or char_length(motivo_rechazo) <= 500),
  resuelta_por uuid references auth.users(id) on delete set null,
  resuelta_at timestamptz,
  reserva_id uuid references public.reservas(id),
  estancia_id uuid references public.estancias(id),
  cita_id uuid references public.citas_estetica(id),
  expira_at timestamptz not null default now() + interval '3 days',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check ((tipo = 'estancia' and fecha_entrada is not null and fecha_salida is not null) or (tipo = 'cita' and inicio is not null)),
  check (estado <> 'rechazada' or motivo_rechazo is not null)
);
create index solicitudes_reserva_negocio_idx on public.solicitudes_reserva (negocio_id);
create index solicitudes_reserva_pendientes_idx on public.solicitudes_reserva (negocio_id, expira_at) where estado = 'pendiente' and deleted_at is null;
create index solicitudes_reserva_cliente_idx on public.solicitudes_reserva (negocio_id, cliente_id, created_at desc);
create trigger set_updated_at before insert or update on public.solicitudes_reserva for each row execute function public.set_updated_at();
alter table public.solicitudes_reserva enable row level security;
create policy solicitudes_reserva_negocio on public.solicitudes_reserva as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy solicitudes_reserva_negocio_definer on public.solicitudes_reserva for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()));
-- El personal la lee; nadie la escribe directo. El dueño la ve por mis_solicitudes().
create policy solicitudes_reserva_select_staff on public.solicitudes_reserva for select to authenticated using (coalesce((select public.is_staff()), false));
revoke all on public.solicitudes_reserva from anon, authenticated;
grant select on public.solicitudes_reserva to authenticated;
grant select, insert, update on public.solicitudes_reserva to peludesk_definer;
comment on table public.solicitudes_reserva is 'Lo que el dueño pide cuando le falta un requisito para reservar: sin cobro ni cupo hasta que el negocio la acepte.';

-- ── 3. Qué falta: una sola respuesta para app, portal y API ─────────────────────────────────────────────────────────
-- Traduce el rechazo de la base a una clave; los textos para cada quien viven en src/lib/app/requisitos.ts.
create or replace function public.clave_de_rechazo_reserva(p_mensaje text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_mensaje ~* 'evaluaci[oó]n previa' then 'evaluacion'
    when p_mensaje ~* 'requisito sanitario|vigentes? de ' then 'sanitario'
    when p_mensaje ~* 'no hay cupo' then 'cupo'
    when p_mensaje ~* 'en celo' then 'celo'
    when p_mensaje ~* 'gestante' then 'gestante'
    when p_mensaje ~* 'tiene activa la alerta' then 'alerta'
    when p_mensaje ~* 'talla registrada' then 'talla'
    when p_mensaje ~* 'pelaje' then 'pelaje'
    when p_mensaje ~* 'grupo' then 'grupo_precio'
    when p_mensaje ~* 'tarifa|precio' then 'precio'
    when p_mensaje ~* 'no abre|cerrado|fuera del horario|ya se ocup[oó]|de aqu[ií] en adelante|ya tiene una cita|revisa las fechas|no recibe|no entrega' then 'fecha'
    else 'otro'
  end;
$$;
revoke execute on function public.clave_de_rechazo_reserva(text) from public, anon;
grant execute on function public.clave_de_rechazo_reserva(text) to authenticated, service_role, peludesk_definer;

-- 'fecha' se resuelve escogiendo otra fecha u hora: no es un requisito ni deja solicitud.
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
  v_t record;
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
  for v_t in select * from public.tipos_contrato_de_alta('guarderia_hotel') loop
    if not exists (
      select 1 from public.contratos c join public.plantillas_contrato pl on pl.id = c.plantilla_id
      where c.perro_id = p_perro and c.deleted_at is null and pl.tipo_contrato_id = v_t.tipo_contrato_id
        and c.estado in ('firmado_digital', 'firmado_papel')
    ) then
      v_m := v_m || jsonb_build_object('clave', 'contrato', 'dato', v_t.tipo_nombre);
    end if;
  end loop;
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

-- ── 4. Contratos: se preparan para firmarlos antes, y reservar directo los exige ────────────────────────────────────
create or replace function public.solicitud_preparar_contratos(p_perro uuid, p_cliente uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t record;
  v_id uuid;
  v_r jsonb := '[]'::jsonb;
begin
  for v_t in select * from public.tipos_contrato_de_alta('guarderia_hotel') loop
    if exists (select 1 from public.contratos c join public.plantillas_contrato pl on pl.id = c.plantilla_id
               where c.perro_id = p_perro and c.deleted_at is null and pl.tipo_contrato_id = v_t.tipo_contrato_id and c.estado in ('firmado_digital', 'firmado_papel')) then
      continue;
    end if;
    select c.id into v_id from public.contratos c join public.plantillas_contrato pl on pl.id = c.plantilla_id
    where c.perro_id = p_perro and c.deleted_at is null and pl.tipo_contrato_id = v_t.tipo_contrato_id and c.estado = 'pendiente_firma'
    order by c.created_at desc limit 1;
    if v_id is null then
      insert into public.contratos (negocio_id, perro_id, cliente_id, plantilla_id, estado)
      values (public.negocio_actual(), p_perro, p_cliente, v_t.plantilla_id, 'pendiente_firma') returning id into v_id;
    end if;
    v_r := v_r || jsonb_build_object('id', v_id, 'tipo_nombre', v_t.tipo_nombre);
    v_id := null;
  end loop;
  return v_r;
end;
$$;
alter function public.solicitud_preparar_contratos(uuid, uuid) owner to peludesk_definer;
revoke execute on function public.solicitud_preparar_contratos(uuid, uuid) from public, anon, authenticated;

create or replace function public.portal_preparar_contratos(p_perro uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cliente uuid := public.mi_cliente_id();
begin
  perform public.exigir_negocio_escribible();
  if v_cliente is null or not public.portal_perro_es_mio(p_perro) then
    raise exception 'Esa mascota no es tuya en este negocio.' using errcode = '42501';
  end if;
  return public.solicitud_preparar_contratos(p_perro, v_cliente);
end;
$$;
alter function public.portal_preparar_contratos(uuid) owner to peludesk_definer;
revoke execute on function public.portal_preparar_contratos(uuid) from public, anon;
grant execute on function public.portal_preparar_contratos(uuid) to authenticated, service_role;

do $$
declare
  v_def text;
  v_ancla text := $a$  insert into public.reservas (negocio_id, cliente_id) values (v_neg, v_cliente) returning id into v_reserva;
  insert into public.estancias (negocio_id, reserva_id, perro_id, servicio_id, fecha_entrada, fecha_salida, horas)$a$;
begin
  -- Sin retornos de carro: el archivo puede llegar con CRLF (Windows) y la definición guardada no los trae.
  v_ancla := replace(v_ancla, E'\r', '');
  select replace(pg_get_functiondef('public.portal_reservar(uuid, uuid, date, date, int)'::regprocedure), E'\r', '') into v_def;
  if position(v_ancla in v_def) = 0 then
    raise exception 'portal_reservar cambió: no encuentro dónde exigir el contrato.';
  end if;
  v_def := replace(v_def, v_ancla, replace($b$  select t.tipo_nombre into v_t from public.tipos_contrato_de_alta('guarderia_hotel') t
  where not exists (select 1 from public.contratos c join public.plantillas_contrato pl on pl.id = c.plantilla_id
                    where c.perro_id = p_perro and c.deleted_at is null and pl.tipo_contrato_id = t.tipo_contrato_id and c.estado in ('firmado_digital', 'firmado_papel'))
  limit 1;
  if found then
    raise exception 'Falta firmar el contrato «%» antes de reservar.', v_t.tipo_nombre;
  end if;
$b$, E'\r', '') || v_ancla);
  execute v_def;
end $$;

-- ── 5. Lo que hace el dueño ─────────────────────────────────────────────────────────────────────────────────────────
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
  -- La recolección: los km de su cotización, y se usa una sola vez.
  if p_recoleccion is not null and (p_recoleccion ->> 'direccion') is not null then
    v_punto := coalesce(p_recoleccion ->> 'punto', 'negocio');
    v_km := public.recoleccion_km_del_portal(p_perro, p_recoleccion);
    perform public.recoleccion_km_cotizados((select p.cliente_id from public.perros p where p.id = p_perro), p_recoleccion ->> 'direccion', v_punto, v_km);
    select q.lat, q.lng into v_q from public.recoleccion_cotizaciones q
    where q.negocio_id = v_neg and q.direccion_norm = public.recoleccion_direccion_norm(p_recoleccion ->> 'direccion') and q.usada_at is not null and q.deleted_at is null
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
  where s.negocio_id = public.negocio_actual() and s.cliente_id = public.mi_cliente_id() and s.deleted_at is null
    and s.created_at > now() - interval '30 days';
$$;
alter function public.mis_solicitudes() owner to peludesk_definer;
revoke execute on function public.mis_solicitudes() from public, anon;
grant execute on function public.mis_solicitudes() to authenticated, service_role;

create or replace function public.portal_cancelar_solicitud(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_fila public.solicitudes_reserva%rowtype;
begin
  update public.solicitudes_reserva s set estado = 'cancelada', resuelta_at = now()
  where s.id = p_id and s.negocio_id = public.negocio_actual() and s.cliente_id = public.mi_cliente_id() and s.estado = 'pendiente' and s.deleted_at is null
  returning * into v_fila;
  if not found then
    raise exception 'Esa solicitud ya no está pendiente.';
  end if;
  return jsonb_build_object('id', v_fila.id, 'estado', v_fila.estado, 'updated_at', v_fila.updated_at);
end;
$$;
alter function public.portal_cancelar_solicitud(uuid) owner to peludesk_definer;
revoke execute on function public.portal_cancelar_solicitud(uuid) from public, anon;
grant execute on function public.portal_cancelar_solicitud(uuid) to authenticated, service_role;

-- ── 6. Lo que hace el negocio ───────────────────────────────────────────────────────────────────────────────────────
-- Avisa al dueño en la app (también desde la tarea de caducidad, por eso no pasa por aviso_del_negocio_al_dueno).
create or replace function public.solicitud_avisar_dueno(p_perro uuid, p_titulo text, p_cuerpo text, p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_dueno uuid;
  v_mascota uuid;
begin
  if (select n.plan from public.negocios n where n.id = v_neg) = 'demo' then
    return;
  end if;
  select m.dueno_id, m.id into v_dueno, v_mascota
  from public.mascotas_vinculos mv join public.mascotas m on m.id = mv.mascota_id
  where mv.perro_id = p_perro and mv.deleted_at is null and m.deleted_at is null limit 1;
  if v_dueno is null then
    return;
  end if;
  insert into public.app_avisos (dueno_id, mascota_id, tipo, titulo, cuerpo, url, datos, created_by, updated_at)
  values (v_dueno, v_mascota, 'negocio', left(p_titulo, 120), left(p_cuerpo, 600), '/visitas',
          jsonb_build_object('push_pendiente', true, 'negocio_id', v_neg, 'origen', 'solicitud', 'origen_id', p_id), null, now());
end;
$$;
alter function public.solicitud_avisar_dueno(uuid, text, text, uuid) owner to peludesk_definer;
revoke execute on function public.solicitud_avisar_dueno(uuid, text, text, uuid) from public, anon, authenticated;

create or replace function public.solicitud_tomar(p_id uuid)
returns public.solicitudes_reserva
language plpgsql
security definer
set search_path = ''
as $$
declare v_fila public.solicitudes_reserva%rowtype;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo el personal de recepción o un admin resuelve una solicitud.' using errcode = '42501';
  end if;
  select * into v_fila from public.solicitudes_reserva s where s.id = p_id and s.negocio_id = public.negocio_actual() and s.deleted_at is null for update;
  if not found then
    raise exception 'Solicitud no encontrada.';
  end if;
  if v_fila.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya se resolvió.';
  end if;
  if v_fila.expira_at <= now() then
    raise exception 'Esta solicitud ya caducó.';
  end if;
  return v_fila;
end;
$$;
alter function public.solicitud_tomar(uuid) owner to peludesk_definer;
revoke execute on function public.solicitud_tomar(uuid) from public, anon, authenticated;

-- Convierte la solicitud en reserva normal. Con un motivo, autoriza la excepción de lo que siga faltando (la base exige el
-- permiso «Excepciones al reservar»); celo, gestación, alertas y cupo no tienen excepción y la base los rechaza con su texto.
create or replace function public.solicitud_aceptar(p_id uuid, p_motivo text default null)
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
begin
  v_s := public.solicitud_tomar(p_id);
  if v_motivo is not null and not public.tiene_permiso('excepciones_reserva') then
    raise exception 'Solo un admin, o quien tenga el permiso «Excepciones al reservar», puede aceptar con excepción.' using errcode = '42501';
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
  end if;
  if v_s.recoleccion is not null then
    perform public.recoleccion_guardar(v_reserva, v_estancia, v_cita, null, (v_s.recoleccion ->> 'hora')::time, v_s.recoleccion ->> 'direccion',
      (v_s.recoleccion ->> 'lat')::double precision, (v_s.recoleccion ->> 'lng')::double precision,
      coalesce(v_s.recoleccion ->> 'punto', 'negocio'), (v_s.recoleccion ->> 'km')::numeric, v_s.recoleccion ->> 'notas', false);
  end if;
  update public.solicitudes_reserva s set estado = 'aceptada', resuelta_por = auth.uid(), resuelta_at = now(), motivo_excepcion = v_motivo,
    reserva_id = v_reserva, estancia_id = v_estancia, cita_id = v_cita
  where s.id = v_s.id returning * into v_s;
  perform public.solicitud_avisar_dueno(v_s.perro_id, 'Aceptaron tu solicitud', 'El negocio aceptó tu lugar. Ya aparece en tus visitas.', v_s.id);
  return to_jsonb(v_s);
end;
$$;
alter function public.solicitud_aceptar(uuid, text) owner to peludesk_definer;
revoke execute on function public.solicitud_aceptar(uuid, text) from public, anon;
grant execute on function public.solicitud_aceptar(uuid, text) to authenticated;

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
  perform public.solicitud_avisar_dueno(v_s.perro_id, 'No pudieron darte ese lugar', 'Motivo: ' || btrim(p_motivo), v_s.id);
  return to_jsonb(v_s);
end;
$$;
alter function public.solicitud_rechazar(uuid, text) owner to peludesk_definer;
revoke execute on function public.solicitud_rechazar(uuid, text) from public, anon;
grant execute on function public.solicitud_rechazar(uuid, text) to authenticated;

-- La evaluación se anota en la solicitud (no hay una agenda de evaluaciones): el dueño se entera y la solicitud sigue viva.
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
  perform public.solicitud_avisar_dueno(v_s.perro_id, 'Agendaron su evaluación',
    'El negocio la agendó para el ' || to_char(p_cuando at time zone public.zona_negocio(), 'DD/MM/YYYY') || ' a las ' || to_char(p_cuando at time zone public.zona_negocio(), 'HH24:MI') || '.', v_s.id);
  return to_jsonb(v_s);
end;
$$;
alter function public.solicitud_agendar_evaluacion(uuid, timestamptz) owner to peludesk_definer;
revoke execute on function public.solicitud_agendar_evaluacion(uuid, timestamptz) from public, anon;
grant execute on function public.solicitud_agendar_evaluacion(uuid, timestamptz) to authenticated;

-- Lo que enseña el panel, de una vez.
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
      'id', s.id, 'tipo', s.tipo, 'estado', s.estado, 'perro_id', s.perro_id, 'perro_nombre', p.nombre,
      'cliente_id', s.cliente_id, 'cliente_nombre', c.nombre, 'cliente_telefono', c.telefono, 'servicio_nombre', sv.nombre,
      'fecha_entrada', s.fecha_entrada, 'fecha_salida', s.fecha_salida, 'horas', s.horas, 'inicio', s.inicio,
      'recoleccion', s.recoleccion, 'motivos', s.motivos, 'evaluacion_agendada_at', s.evaluacion_agendada_at,
      'motivo_rechazo', s.motivo_rechazo, 'motivo_excepcion', s.motivo_excepcion, 'expira_at', s.expira_at,
      'resuelta_at', s.resuelta_at, 'reserva_id', s.reserva_id, 'created_at', s.created_at, 'updated_at', s.updated_at
    ) order by s.created_at), '[]'::jsonb)
    from public.solicitudes_reserva s
    join public.perros p on p.id = s.perro_id
    join public.clientes c on c.id = s.cliente_id
    join public.servicios sv on sv.id = s.servicio_id
    where s.negocio_id = public.negocio_actual() and s.deleted_at is null
      and ((p_solo_pendientes and s.estado = 'pendiente' and s.expira_at > now())
           or (not p_solo_pendientes and s.created_at > now() - interval '30 days')));
end;
$$;
alter function public.solicitudes_del_negocio(boolean) owner to peludesk_definer;
revoke execute on function public.solicitudes_del_negocio(boolean) from public, anon;
grant execute on function public.solicitudes_del_negocio(boolean) to authenticated;

-- Tarea de cada hora, negocio por negocio (con la secret key atada al negocio).
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
    returning s.id, s.perro_id
  loop
    perform public.solicitud_avisar_dueno(v_s.perro_id, 'Tu solicitud caducó', 'El negocio no alcanzó a responderla a tiempo. Puedes volver a pedir lugar o escribirle por WhatsApp.', v_s.id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
alter function public.solicitudes_caducar() owner to peludesk_definer;
revoke execute on function public.solicitudes_caducar() from public, anon, authenticated;
grant execute on function public.solicitudes_caducar() to service_role;

-- ── 7. «Necesita atención» ──────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_def text;
  v_ancla text := $a$  begin
    r := r || jsonb_build_object('evaluacion_exigida', public.evaluacion_exigida());$a$;
begin
  select replace(pg_get_functiondef('public.tablero_atencion(text)'::regprocedure), E'\r', '') into v_def;
  if position(v_ancla in v_def) = 0 then
    raise exception 'tablero_atencion cambió: no encuentro dónde agregar las solicitudes.';
  end if;
  v_def := replace(v_def, v_ancla, $b$  if v_personal then
    begin
      r := r || jsonb_build_object('solicitudes', public.solicitudes_del_negocio(true));
    exception when others then v_fallos := array_append(v_fallos, 'solicitudes');
    end;
  end if;
$b$ || v_ancla);
  execute v_def;
end $$;
