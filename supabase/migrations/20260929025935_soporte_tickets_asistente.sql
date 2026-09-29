-- Soporte dentro de la app (29 de septiembre de 2026): el asistente y los
-- tickets.
--
--   soporte_conversaciones + soporte_mensajes_asistente: lo que una persona
--   platicó con el asistente de Ayuda. Solo la ve ESA persona (y la
--   plataforma, cuando la conversación se adjunta a un ticket). El
--   asistente no lee datos del negocio: contesta con la documentación.
--   soporte_tickets + soporte_ticket_mensajes: el hilo entre el negocio y
--   PeluDesk. Recepción ve los suyos; el admin, todos los de su negocio;
--   nadie los de otro negocio. PeluDesk los ve desde /plataforma/soporte
--   (funciones plataforma_*, de postgres, en la lista blanca) y los contesta
--   ahí o desde la bandeja de Telegram (el servidor, con service_role).
-- Capturas en el bucket privado soporte-capturas, {negocio}/{ticket}/…,
-- sin políticas: las sube y las firma el servidor.

-- ───────────────────────────── conversaciones con el asistente
create table public.soporte_conversaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  profile_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  rol text not null,
  pantalla text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
comment on table public.soporte_conversaciones is
  'Conversaciones de una persona con el asistente de Ayuda. Solo las ve esa persona (y PeluDesk si las adjunta a un ticket).';
create index soporte_conversaciones_negocio_idx on public.soporte_conversaciones (negocio_id);
create index soporte_conversaciones_profile_idx on public.soporte_conversaciones (negocio_id, profile_id);
create trigger set_updated_at before insert or update on public.soporte_conversaciones
  for each row execute function public.set_updated_at();

create table public.soporte_mensajes_asistente (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  conversacion_id uuid not null references public.soporte_conversaciones(id) on delete cascade,
  quien text not null check (quien in ('persona', 'asistente')),
  texto text not null,
  articulos text[] not null default '{}',
  sin_respuesta boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index soporte_mensajes_asistente_negocio_idx on public.soporte_mensajes_asistente (negocio_id);
create index soporte_mensajes_asistente_conv_idx on public.soporte_mensajes_asistente (conversacion_id, created_at);
create trigger set_updated_at before insert or update on public.soporte_mensajes_asistente
  for each row execute function public.set_updated_at();

-- ───────────────────────────── tickets
create table public.soporte_tickets (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  numero integer not null,
  profile_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  rol text not null check (rol in ('admin', 'recepcion')),
  asunto text not null check (btrim(asunto) <> ''),
  descripcion text not null check (btrim(descripcion) <> ''),
  estado text not null default 'abierto' check (estado in ('abierto', 'en_proceso', 'resuelto')),
  pantalla text,
  navegador text,
  conversacion_id uuid references public.soporte_conversaciones(id),
  captura_path text,
  -- El asistente no lo encontró en la documentación: al resolverlo, PeluDesk
  -- recibe la propuesta de un artículo nuevo.
  sin_documentar boolean not null default false,
  articulo_propuesto text,
  telegram_ids bigint[] not null default '{}',
  ultimo_de text not null default 'negocio' check (ultimo_de in ('negocio', 'plataforma')),
  ultimo_mensaje_at timestamptz not null default now(),
  visto_creador_at timestamptz,
  resuelto_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
comment on table public.soporte_tickets is
  'Tickets de soporte de un negocio a PeluDesk. Recepción ve los suyos; el admin, todos los de su negocio.';
create unique index soporte_tickets_numero on public.soporte_tickets (negocio_id, numero);
create index soporte_tickets_negocio_idx on public.soporte_tickets (negocio_id);
create index soporte_tickets_telegram_idx on public.soporte_tickets using gin (telegram_ids);
create trigger set_updated_at before insert or update on public.soporte_tickets
  for each row execute function public.set_updated_at();

create table public.soporte_ticket_mensajes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  ticket_id uuid not null references public.soporte_tickets(id) on delete cascade,
  autor text not null check (autor in ('negocio', 'plataforma')),
  profile_id uuid references auth.users(id) on delete set null,
  texto text not null check (btrim(texto) <> ''),
  origen text not null default 'app' check (origen in ('app', 'plataforma', 'telegram')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index soporte_ticket_mensajes_negocio_idx on public.soporte_ticket_mensajes (negocio_id);
create index soporte_ticket_mensajes_ticket_idx on public.soporte_ticket_mensajes (ticket_id, created_at);
create trigger set_updated_at before insert or update on public.soporte_ticket_mensajes
  for each row execute function public.set_updated_at();

-- ───────────────────────────── RLS: las dos redes + quién ve qué
-- Excepción deliberada a «toda tabla de negocio lleva las políticas de
-- solo lectura»: pedir ayuda tiene que funcionar justo cuando el negocio
-- está en solo lectura (prueba vencida, cobro fallido). Nadie escribe
-- estas tablas con su sesión (insert/update en false); solo las funciones.
do $$
declare
  t text;
begin
  foreach t in array array['soporte_conversaciones', 'soporte_mensajes_asistente', 'soporte_tickets', 'soporte_ticket_mensajes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format($p$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$p$, t || '_negocio', t);
    execute format($p$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$p$, t || '_negocio_definer', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_insert', t);
    execute format('create policy %I on public.%I for update to authenticated using (false)', t || '_sin_update', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update on public.%I to peludesk_definer', t);
  end loop;
end;
$$;

-- La conversación con el asistente: solo quien la tuvo.
create policy soporte_conversaciones_propias on public.soporte_conversaciones for select to authenticated
  using (profile_id = (select auth.uid()));
create policy soporte_mensajes_asistente_propios on public.soporte_mensajes_asistente for select to authenticated
  using (exists (select 1 from public.soporte_conversaciones c where c.id = conversacion_id and c.profile_id = (select auth.uid())));

-- ¿Puede quien llama ver este ticket? Recepción, los suyos; admin, todos.
create or replace function public.puede_ver_ticket(p_profile_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.current_rol() = 'admin' or (public.current_rol() = 'recepcion' and p_profile_id = auth.uid()), false);
$$;
revoke execute on function public.puede_ver_ticket(uuid) from public, anon;
grant execute on function public.puede_ver_ticket(uuid) to authenticated, peludesk_definer;

create policy soporte_tickets_visibles on public.soporte_tickets for select to authenticated
  using ((select public.current_rol()) = 'admin' or ((select public.current_rol()) = 'recepcion' and profile_id = (select auth.uid())));
create policy soporte_ticket_mensajes_visibles on public.soporte_ticket_mensajes for select to authenticated
  using (exists (
    select 1 from public.soporte_tickets t where t.id = ticket_id
      and ((select public.current_rol()) = 'admin' or ((select public.current_rol()) = 'recepcion' and t.profile_id = (select auth.uid())))
  ));

-- ───────────────────────────── el asistente (con la sesión de la persona)
-- Guarda la pregunta y la respuesta en la conversación de quien pregunta
-- (la crea si hace falta). Tope: 40 preguntas por persona al día.
create or replace function public.asistente_guardar(
  p_conversacion_id uuid,
  p_pantalla text,
  p_pregunta text,
  p_respuesta text,
  p_articulos text[],
  p_sin_respuesta boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'La ayuda es para admin y recepción.';
  end if;
  if p_conversacion_id is not null then
    select id into v_conv from public.soporte_conversaciones where id = p_conversacion_id and profile_id = auth.uid() and deleted_at is null;
    if v_conv is null then
      raise exception 'Conversación no encontrada.';
    end if;
  else
    insert into public.soporte_conversaciones (rol, pantalla) values (public.current_rol(), left(p_pantalla, 200))
    returning id into v_conv;
  end if;
  insert into public.soporte_mensajes_asistente (conversacion_id, quien, texto)
  values (v_conv, 'persona', left(coalesce(p_pregunta, ''), 2000));
  insert into public.soporte_mensajes_asistente (conversacion_id, quien, texto, articulos, sin_respuesta)
  values (v_conv, 'asistente', left(coalesce(p_respuesta, ''), 4000), coalesce(p_articulos, '{}'), coalesce(p_sin_respuesta, false));
  return v_conv;
end;
$$;
alter function public.asistente_guardar(uuid, text, text, text, text[], boolean) owner to peludesk_definer;
revoke execute on function public.asistente_guardar(uuid, text, text, text, text[], boolean) from public, anon;
grant execute on function public.asistente_guardar(uuid, text, text, text, text[], boolean) to authenticated;

-- ¿Le quedan preguntas hoy? (antes de gastar en la IA)
create or replace function public.asistente_preguntas_hoy()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int from public.soporte_mensajes_asistente m
  join public.soporte_conversaciones c on c.id = m.conversacion_id
  where c.profile_id = auth.uid() and m.quien = 'persona'
    and m.created_at >= (public.fecha_negocio()::timestamp at time zone public.zona_negocio());
$$;
alter function public.asistente_preguntas_hoy() owner to peludesk_definer;
revoke execute on function public.asistente_preguntas_hoy() from public, anon;
grant execute on function public.asistente_preguntas_hoy() to authenticated;

-- ───────────────────────────── tickets (lado del negocio)
create or replace function public.crear_ticket(
  p_asunto text,
  p_descripcion text,
  p_pantalla text,
  p_navegador text,
  p_conversacion_id uuid,
  p_sin_documentar boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_numero int;
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción crean tickets de soporte.';
  end if;
  if p_asunto is null or btrim(p_asunto) = '' then
    raise exception 'Escribe el asunto.';
  end if;
  if p_descripcion is null or btrim(p_descripcion) = '' then
    raise exception 'Cuéntanos qué pasó.';
  end if;
  if p_conversacion_id is not null and not exists (
    select 1 from public.soporte_conversaciones where id = p_conversacion_id and profile_id = auth.uid()
  ) then
    raise exception 'Esa conversación no es tuya.';
  end if;
  perform pg_advisory_xact_lock(hashtext('soporte_tickets:' || public.negocio_actual()::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.soporte_tickets;
  insert into public.soporte_tickets (numero, rol, asunto, descripcion, pantalla, navegador, conversacion_id, sin_documentar)
  values (v_numero, public.current_rol(), left(btrim(p_asunto), 150), left(btrim(p_descripcion), 5000),
    left(p_pantalla, 200), left(p_navegador, 300), p_conversacion_id, coalesce(p_sin_documentar, false))
  returning id into v_id;
  insert into public.soporte_ticket_mensajes (ticket_id, autor, profile_id, texto, origen)
  values (v_id, 'negocio', auth.uid(), left(btrim(p_descripcion), 5000), 'app');
  return jsonb_build_object('id', v_id, 'numero', v_numero);
end;
$$;
alter function public.crear_ticket(text, text, text, text, uuid, boolean) owner to peludesk_definer;
revoke execute on function public.crear_ticket(text, text, text, text, uuid, boolean) from public, anon;
grant execute on function public.crear_ticket(text, text, text, text, uuid, boolean) to authenticated;

create or replace function public.responder_ticket(p_ticket_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.soporte_tickets%rowtype;
begin
  select * into v from public.soporte_tickets where id = p_ticket_id and deleted_at is null for update;
  if not found or not public.puede_ver_ticket(v.profile_id) then
    raise exception 'Ticket no encontrado.';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Escribe tu mensaje.';
  end if;
  insert into public.soporte_ticket_mensajes (ticket_id, autor, profile_id, texto, origen)
  values (v.id, 'negocio', auth.uid(), left(btrim(p_texto), 5000), 'app');
  update public.soporte_tickets
  set ultimo_de = 'negocio', ultimo_mensaje_at = now(),
      estado = case when estado = 'resuelto' then 'abierto' else estado end,
      resuelto_at = case when estado = 'resuelto' then null else resuelto_at end,
      visto_creador_at = case when profile_id = auth.uid() then now() else visto_creador_at end
  where id = v.id;
end;
$$;
alter function public.responder_ticket(uuid, text) owner to peludesk_definer;
revoke execute on function public.responder_ticket(uuid, text) from public, anon;
grant execute on function public.responder_ticket(uuid, text) to authenticated;

create or replace function public.adjuntar_captura_ticket(p_ticket_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.soporte_tickets%rowtype;
begin
  select * into v from public.soporte_tickets where id = p_ticket_id and deleted_at is null for update;
  if not found or v.profile_id <> auth.uid() then
    raise exception 'Ticket no encontrado.';
  end if;
  if p_path is null or p_path not like public.negocio_actual()::text || '/' || v.id::text || '/%' then
    raise exception 'Ruta de captura no válida.';
  end if;
  update public.soporte_tickets set captura_path = p_path where id = v.id;
end;
$$;
alter function public.adjuntar_captura_ticket(uuid, text) owner to peludesk_definer;
revoke execute on function public.adjuntar_captura_ticket(uuid, text) from public, anon;
grant execute on function public.adjuntar_captura_ticket(uuid, text) to authenticated;

-- Quien creó el ticket lo abrió: se apaga su aviso.
create or replace function public.marcar_ticket_visto(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.soporte_tickets set visto_creador_at = now()
  where id = p_ticket_id and profile_id = auth.uid() and deleted_at is null;
end;
$$;
alter function public.marcar_ticket_visto(uuid) owner to peludesk_definer;
revoke execute on function public.marcar_ticket_visto(uuid) from public, anon;
grant execute on function public.marcar_ticket_visto(uuid) to authenticated;

-- El aviso de arriba: mis tickets con respuesta de PeluDesk que no he visto.
create or replace function public.mis_tickets_con_respuesta()
returns table(id uuid, numero integer, asunto text, respondido_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.numero, t.asunto, t.ultimo_mensaje_at
  from public.soporte_tickets t
  where t.profile_id = auth.uid() and t.deleted_at is null and t.ultimo_de = 'plataforma'
    and (t.visto_creador_at is null or t.visto_creador_at < t.ultimo_mensaje_at)
  order by t.ultimo_mensaje_at;
$$;
alter function public.mis_tickets_con_respuesta() owner to peludesk_definer;
revoke execute on function public.mis_tickets_con_respuesta() from public, anon;
grant execute on function public.mis_tickets_con_respuesta() to authenticated;

-- ───────────────────────────── tickets (lado de PeluDesk)
-- De postgres (ven todos los negocios): solo la administración de la
-- plataforma, o el servidor (service_role) para la bandeja de Telegram.
create or replace function public.soporte_es_plataforma()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), '') = 'service_role' or coalesce(public.es_admin_plataforma(), false);
$$;
revoke execute on function public.soporte_es_plataforma() from public, anon;
grant execute on function public.soporte_es_plataforma() to authenticated, service_role;

create or replace function public.plataforma_tickets(p_estado text)
returns table(id uuid, negocio_id uuid, negocio text, slug text, numero integer, asunto text, estado text, rol text,
  persona text, ultimo_de text, ultimo_mensaje_at timestamptz, created_at timestamptz, sin_documentar boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
  select t.id, t.negocio_id, n.nombre, n.slug, t.numero, t.asunto, t.estado, t.rol,
    coalesce(p.nombre_completo, 'Sin nombre'), t.ultimo_de, t.ultimo_mensaje_at, t.created_at, t.sin_documentar
  from public.soporte_tickets t
  join public.negocios n on n.id = t.negocio_id
  left join public.profiles p on p.id = t.profile_id
  where t.deleted_at is null and (p_estado is null or t.estado = p_estado)
  order by (t.estado = 'resuelto'), (t.ultimo_de = 'plataforma'), t.ultimo_mensaje_at;
end;
$$;
revoke execute on function public.plataforma_tickets(text) from public, anon;
grant execute on function public.plataforma_tickets(text) to authenticated, service_role;

create or replace function public.plataforma_ticket(p_ticket_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v jsonb;
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  select jsonb_build_object(
    'ticket', to_jsonb(t) - 'telegram_ids',
    'negocio', jsonb_build_object('id', n.id, 'nombre', n.nombre, 'slug', n.slug),
    'persona', coalesce(p.nombre_completo, 'Sin nombre'),
    'mensajes', coalesce((
      select jsonb_agg(jsonb_build_object('autor', m.autor, 'texto', m.texto, 'origen', m.origen, 'created_at', m.created_at) order by m.created_at)
      from public.soporte_ticket_mensajes m where m.ticket_id = t.id and m.deleted_at is null), '[]'::jsonb),
    'conversacion', coalesce((
      select jsonb_agg(jsonb_build_object('quien', m.quien, 'texto', m.texto, 'articulos', m.articulos, 'sin_respuesta', m.sin_respuesta) order by m.created_at)
      from public.soporte_mensajes_asistente m where t.conversacion_id is not null and m.conversacion_id = t.conversacion_id), '[]'::jsonb)
  ) into v
  from public.soporte_tickets t
  join public.negocios n on n.id = t.negocio_id
  left join public.profiles p on p.id = t.profile_id
  where t.id = p_ticket_id and t.deleted_at is null;
  return v;
end;
$$;
revoke execute on function public.plataforma_ticket(uuid) from public, anon;
grant execute on function public.plataforma_ticket(uuid) to authenticated, service_role;

create or replace function public.plataforma_responder_ticket(p_ticket_id uuid, p_texto text, p_origen text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.soporte_tickets%rowtype;
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if p_texto is null or btrim(p_texto) = '' then
    raise exception 'Escribe la respuesta.';
  end if;
  if p_origen not in ('plataforma', 'telegram') then
    raise exception 'Origen no válido.';
  end if;
  select * into v from public.soporte_tickets where id = p_ticket_id and deleted_at is null for update;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;
  insert into public.soporte_ticket_mensajes (negocio_id, ticket_id, autor, profile_id, texto, origen)
  values (v.negocio_id, v.id, 'plataforma', auth.uid(), left(btrim(p_texto), 5000), p_origen);
  update public.soporte_tickets
  set ultimo_de = 'plataforma', ultimo_mensaje_at = now(),
      estado = case when estado = 'abierto' then 'en_proceso' else estado end
  where id = v.id;
  return jsonb_build_object('negocio_id', v.negocio_id, 'profile_id', v.profile_id, 'rol', v.rol, 'numero', v.numero, 'asunto', v.asunto);
end;
$$;
revoke execute on function public.plataforma_responder_ticket(uuid, text, text) from public, anon;
grant execute on function public.plataforma_responder_ticket(uuid, text, text) to authenticated, service_role;

create or replace function public.plataforma_estado_ticket(p_ticket_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.soporte_tickets%rowtype;
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if p_estado not in ('abierto', 'en_proceso', 'resuelto') then
    raise exception 'Estado no válido.';
  end if;
  update public.soporte_tickets
  set estado = p_estado,
      resuelto_at = case when p_estado = 'resuelto' then now() else null end,
      ultimo_de = case when p_estado = 'resuelto' then 'plataforma' else ultimo_de end,
      ultimo_mensaje_at = case when p_estado = 'resuelto' then now() else ultimo_mensaje_at end
  where id = p_ticket_id and deleted_at is null
  returning * into v;
  if not found then
    raise exception 'Ticket no encontrado.';
  end if;
  return jsonb_build_object('negocio_id', v.negocio_id, 'profile_id', v.profile_id, 'rol', v.rol, 'numero', v.numero,
    'asunto', v.asunto, 'sin_documentar', v.sin_documentar);
end;
$$;
revoke execute on function public.plataforma_estado_ticket(uuid, text) from public, anon;
grant execute on function public.plataforma_estado_ticket(uuid, text) to authenticated, service_role;

create or replace function public.plataforma_articulo_propuesto(p_ticket_id uuid, p_texto text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  update public.soporte_tickets set articulo_propuesto = nullif(btrim(coalesce(p_texto, '')), '')
  where id = p_ticket_id and deleted_at is null;
end;
$$;
revoke execute on function public.plataforma_articulo_propuesto(uuid, text) from public, anon;
grant execute on function public.plataforma_articulo_propuesto(uuid, text) to authenticated, service_role;

-- La bandeja de Telegram: qué ticket es el mensaje al que se respondió, y
-- anotar el aviso que se mandó. Solo el servidor.
create or replace function public.plataforma_ticket_de_telegram(p_message_id bigint)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  return (select id from public.soporte_tickets where telegram_ids @> array[p_message_id] and deleted_at is null
    order by updated_at desc limit 1);
end;
$$;
revoke execute on function public.plataforma_ticket_de_telegram(bigint) from public, anon, authenticated;
grant execute on function public.plataforma_ticket_de_telegram(bigint) to service_role;

create or replace function public.plataforma_anotar_telegram(p_ticket_id uuid, p_message_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.';
  end if;
  update public.soporte_tickets set telegram_ids = array_append(telegram_ids, p_message_id) where id = p_ticket_id;
end;
$$;
revoke execute on function public.plataforma_anotar_telegram(uuid, bigint) from public, anon, authenticated;
grant execute on function public.plataforma_anotar_telegram(uuid, bigint) to service_role;

-- ───────────────────────────── capturas
insert into storage.buckets (id, name, public)
values ('soporte-capturas', 'soporte-capturas', false)
on conflict (id) do nothing;

-- ───────────────────────────── demo y auditoría
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure) into v_def;
  if position('soporte_tickets' in v_def) = 0 then
    v_def := replace(v_def, $a$'ventas_mostrador', 'reembolsos_cobro'$a$,
      $b$'ventas_mostrador', 'reembolsos_cobro', 'soporte_ticket_mensajes', 'soporte_tickets', 'soporte_mensajes_asistente', 'soporte_conversaciones'$b$);
    if position('soporte_tickets' in v_def) = 0 then
      raise exception 'demo_vaciar cambió: no se pudo agregar soporte.';
    end if;
    execute v_def;
  end if;

  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('plataforma_tickets' in v_def) = 0 then
    v_def := replace(v_def, $a$('bot_cuenta_por_telefono')$a$,
      $b$('bot_cuenta_por_telefono'),
    -- Soporte: PeluDesk ve y contesta los tickets de todos los negocios
    -- (solo es_admin_plataforma o el servidor por la bandeja de Telegram).
    ('plataforma_tickets'), ('plataforma_ticket'), ('plataforma_responder_ticket'), ('plataforma_estado_ticket'),
    ('plataforma_articulo_propuesto'), ('plataforma_ticket_de_telegram'), ('plataforma_anotar_telegram')$b$);
    if position('plataforma_tickets' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar soporte.';
    end if;
    execute v_def;
  end if;
end;
$$;
