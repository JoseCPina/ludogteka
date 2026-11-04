-- App nativa para dueños · Fase 5 «Alertas» (docs/app-duenos/FASE-5.md).
-- Cualquier persona de la app sube una alerta de un perro o gato que vio en la calle (perdido, herido, en peligro o
-- abandonado) con foto, descripción y ubicación precisa. Se ve en el mapa de alertas, se avisa a la gente a 3 km y a los
-- negocios PeluDesk cerca, y se compara con las mascotas reportadas perdidas en la zona («puede ser tu mascota»).
--
-- Reglas que no se rompen:
--   · Nunca se muestra quién la subió: nadie lee estas tablas directo salvo lo propio; todo lo de otros sale por
--     funciones que no devuelven ids de personas (solo «es_mia» y un alias por conversación).
--   · Anti abuso en la base: tope por persona (alertas, actualizaciones, mensajes), reporte de alerta falsa u ofensiva
--     (tres personas distintas la esconden sola), moderación desde /plataforma y caducidad sin actividad (72 h).
--   · Son tablas de la PERSONA (sin negocio_id), como mascotas y app_avisos: van a la lista de auditoria_frontera.

-- ── Fotos (privado; el servidor les quita los metadatos, las sube y las firma) ──
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('alertas-calle', 'alertas-calle', false, 8388608, array['image/jpeg'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ── Alertas ───────────────────────────────────────────────────────────
create table public.alertas_calle (
  id uuid primary key default gen_random_uuid(),
  autor_id uuid not null references public.duenos(id) on delete cascade,
  tipo text not null check (tipo in ('perdido', 'herido', 'peligro', 'abandonado')),
  especie text not null check (especie in ('perro', 'gato', 'otro')),
  descripcion text check (descripcion is null or char_length(descripcion) <= 500),
  color text check (color is null or char_length(color) <= 40),
  tamano text check (tamano is null or tamano in ('chico', 'mediano', 'grande')),
  foto_path text check (foto_path is null or char_length(foto_path) <= 200),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  precision_m int check (precision_m is null or precision_m between 0 and 100000),
  estado text not null default 'sigue_ahi' check (estado in ('sigue_ahi', 'ya_no_esta', 'rescatado', 'reunido', 'caducada')),
  ultima_actividad_at timestamptz not null default now(),
  resuelta_at timestamptz,
  oculta_at timestamptz,
  oculta_motivo text check (oculta_motivo is null or char_length(oculta_motivo) <= 200),
  reportes int not null default 0,
  avisados int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index alertas_calle_zona on public.alertas_calle (lat, lng) where deleted_at is null and oculta_at is null;
create index alertas_calle_autor on public.alertas_calle (autor_id, created_at desc) where deleted_at is null;
create index alertas_calle_activas on public.alertas_calle (ultima_actividad_at) where deleted_at is null and estado in ('sigue_ahi', 'ya_no_esta');
create trigger set_updated_at before insert or update on public.alertas_calle for each row execute function public.set_updated_at();
alter table public.alertas_calle enable row level security;
create policy alertas_calle_propias_select on public.alertas_calle for select to authenticated using (autor_id = (select auth.uid()));
create policy alertas_calle_definer on public.alertas_calle for all to peludesk_definer using (true) with check (true);
revoke all on public.alertas_calle from anon, authenticated;
grant select on public.alertas_calle to authenticated;
grant select, insert, update, delete on public.alertas_calle to peludesk_definer;

-- ── Actualizaciones de otros (con foto) ──────────────────────────────
create table public.alertas_calle_actualizaciones (
  id uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas_calle(id) on delete cascade,
  autor_id uuid not null references public.duenos(id) on delete cascade,
  texto text check (texto is null or char_length(texto) <= 300),
  foto_path text check (foto_path is null or char_length(foto_path) <= 200),
  estado text check (estado is null or estado in ('sigue_ahi', 'ya_no_esta', 'rescatado', 'reunido')),
  oculta_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (texto is not null or foto_path is not null or estado is not null)
);
create index alertas_calle_act_alerta on public.alertas_calle_actualizaciones (alerta_id, created_at) where deleted_at is null;
create index alertas_calle_act_autor on public.alertas_calle_actualizaciones (autor_id, created_at desc);
create trigger set_updated_at before insert or update on public.alertas_calle_actualizaciones for each row execute function public.set_updated_at();
alter table public.alertas_calle_actualizaciones enable row level security;
create policy alertas_calle_act_propias_select on public.alertas_calle_actualizaciones for select to authenticated using (autor_id = (select auth.uid()));
create policy alertas_calle_act_definer on public.alertas_calle_actualizaciones for all to peludesk_definer using (true) with check (true);
revoke all on public.alertas_calle_actualizaciones from anon, authenticated;
grant select on public.alertas_calle_actualizaciones to authenticated;
grant select, insert, update, delete on public.alertas_calle_actualizaciones to peludesk_definer;

-- ── Reportes (falsa, ofensiva…) ──────────────────────────────────────
create table public.alertas_calle_reportes (
  id uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas_calle(id) on delete cascade,
  autor_id uuid not null references public.duenos(id) on delete cascade,
  motivo text not null check (motivo in ('falsa', 'ofensiva', 'repetida', 'otro')),
  texto text check (texto is null or char_length(texto) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index alertas_calle_rep_uno on public.alertas_calle_reportes (alerta_id, autor_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.alertas_calle_reportes for each row execute function public.set_updated_at();
alter table public.alertas_calle_reportes enable row level security;
create policy alertas_calle_rep_propios_select on public.alertas_calle_reportes for select to authenticated using (autor_id = (select auth.uid()));
create policy alertas_calle_rep_definer on public.alertas_calle_reportes for all to peludesk_definer using (true) with check (true);
revoke all on public.alertas_calle_reportes from anon, authenticated;
grant select on public.alertas_calle_reportes to authenticated;
grant select, insert, update, delete on public.alertas_calle_reportes to peludesk_definer;

-- ── Mensajes con quien la subió (relevados: nadie ve teléfonos) ─────
create table public.alertas_calle_mensajes (
  id uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas_calle(id) on delete cascade,
  de_id uuid not null references public.duenos(id) on delete cascade,
  para_id uuid not null references public.duenos(id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 600),
  entregado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (de_id <> para_id)
);
create index alertas_calle_msj_alerta on public.alertas_calle_mensajes (alerta_id, created_at) where deleted_at is null;
create index alertas_calle_msj_de on public.alertas_calle_mensajes (de_id, created_at desc);
create trigger set_updated_at before insert or update on public.alertas_calle_mensajes for each row execute function public.set_updated_at();
alter table public.alertas_calle_mensajes enable row level security;
create policy alertas_calle_msj_propios_select on public.alertas_calle_mensajes for select to authenticated using (de_id = (select auth.uid()));
create policy alertas_calle_msj_definer on public.alertas_calle_mensajes for all to peludesk_definer using (true) with check (true);
revoke all on public.alertas_calle_mensajes from anon, authenticated;
grant select on public.alertas_calle_mensajes to authenticated;
grant select, insert, update, delete on public.alertas_calle_mensajes to peludesk_definer;

-- ── «Puede ser tu mascota»: a quién ya se le avisó (una vez por alerta y mascota) ──
create table public.alertas_calle_coincidencias (
  id uuid primary key default gen_random_uuid(),
  alerta_id uuid not null references public.alertas_calle(id) on delete cascade,
  mascota_id uuid not null references public.mascotas(id) on delete cascade,
  puntaje numeric(5, 2) not null,
  distancia_km numeric(6, 2) not null,
  avisado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index alertas_calle_coinc_uno on public.alertas_calle_coincidencias (alerta_id, mascota_id);
create trigger set_updated_at before insert or update on public.alertas_calle_coincidencias for each row execute function public.set_updated_at();
alter table public.alertas_calle_coincidencias enable row level security;
-- El dueño de la mascota ve las coincidencias de SUS mascotas (sin datos de quien subió la alerta).
create policy alertas_calle_coinc_propias_select on public.alertas_calle_coincidencias for select to authenticated
  using (exists (select 1 from public.mascotas m where m.id = mascota_id and m.dueno_id = (select auth.uid())));
create policy alertas_calle_coinc_definer on public.alertas_calle_coincidencias for all to peludesk_definer using (true) with check (true);
revoke all on public.alertas_calle_coincidencias from anon, authenticated;
grant select on public.alertas_calle_coincidencias to authenticated;
grant select, insert, update, delete on public.alertas_calle_coincidencias to peludesk_definer;

-- ── Funciones ─────────────────────────────────────────────────────────
create or replace function public._alerta_km(a_lat double precision, a_lng double precision, b_lat double precision, b_lng double precision)
returns double precision language sql immutable set search_path = '' as $$
  select 2 * 6371 * asin(sqrt(power(sin(radians(b_lat - a_lat) / 2), 2) + cos(radians(a_lat)) * cos(radians(b_lat)) * power(sin(radians(b_lng - a_lng) / 2), 2)));
$$;
revoke execute on function public._alerta_km(double precision, double precision, double precision, double precision) from public, anon;
grant execute on function public._alerta_km(double precision, double precision, double precision, double precision) to authenticated, service_role, peludesk_definer;

-- Las alertas visibles cerca de un punto: activas y las resueltas de los últimos 3 días. Sin autor (solo es_mia).
create or replace function public.alertas_calle_cerca(p_lat double precision, p_lng double precision, p_km double precision)
returns table (id uuid, tipo text, especie text, descripcion text, color text, tamano text, foto_path text, lat double precision, lng double precision,
               estado text, created_at timestamptz, ultima_actividad_at timestamptz, actualizaciones int, distancia_m int, es_mia boolean)
language sql stable security definer set search_path = '' as $$
  select a.id, a.tipo, a.especie, a.descripcion, a.color, a.tamano, a.foto_path, a.lat, a.lng, a.estado, a.created_at, a.ultima_actividad_at,
    (select count(*)::int from public.alertas_calle_actualizaciones u where u.alerta_id = a.id and u.deleted_at is null and u.oculta_at is null),
    (public._alerta_km(p_lat, p_lng, a.lat, a.lng) * 1000)::int,
    a.autor_id = (select auth.uid())
  from public.alertas_calle a
  where (select auth.uid()) is not null
    and a.deleted_at is null and a.oculta_at is null
    and (a.estado in ('sigue_ahi', 'ya_no_esta') or (a.estado in ('rescatado', 'reunido') and a.resuelta_at > now() - interval '3 days'))
    and abs(a.lat - p_lat) < least(p_km, 50) / 100 and abs(a.lng - p_lng) < least(p_km, 50) / 80
    and public._alerta_km(p_lat, p_lng, a.lat, a.lng) <= least(p_km, 50)
  order by (a.estado in ('sigue_ahi', 'ya_no_esta')) desc, public._alerta_km(p_lat, p_lng, a.lat, a.lng)
  limit 200;
$$;

-- El detalle: la alerta, sus actualizaciones y MIS conversaciones (si es mía, cada persona con un alias estable).
create or replace function public.alerta_calle_detalle(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
  v_a public.alertas_calle%rowtype;
  v_mia boolean;
begin
  if v_yo is null then raise exception 'Entra a la app para ver la alerta.' using errcode = '42501'; end if;
  select * into v_a from public.alertas_calle a where a.id = p_id and a.deleted_at is null;
  if not found or (v_a.oculta_at is not null and v_a.autor_id <> v_yo) then return null; end if;
  v_mia := v_a.autor_id = v_yo;
  return jsonb_build_object(
    'id', v_a.id, 'tipo', v_a.tipo, 'especie', v_a.especie, 'descripcion', v_a.descripcion, 'color', v_a.color, 'tamano', v_a.tamano,
    'foto_path', v_a.foto_path, 'lat', v_a.lat, 'lng', v_a.lng, 'estado', v_a.estado, 'created_at', v_a.created_at,
    'ultima_actividad_at', v_a.ultima_actividad_at, 'es_mia', v_mia, 'oculta', v_a.oculta_at is not null, 'avisados', case when v_mia then v_a.avisados end,
    'ya_reporte', exists (select 1 from public.alertas_calle_reportes r where r.alerta_id = p_id and r.autor_id = v_yo and r.deleted_at is null),
    'actualizaciones', coalesce((
      select jsonb_agg(jsonb_build_object('id', u.id, 'texto', u.texto, 'foto_path', u.foto_path, 'estado', u.estado, 'created_at', u.created_at, 'es_mia', u.autor_id = v_yo, 'de_quien_la_subio', u.autor_id = v_a.autor_id) order by u.created_at)
      from public.alertas_calle_actualizaciones u where u.alerta_id = p_id and u.deleted_at is null and u.oculta_at is null), '[]'::jsonb),
    'mensajes', coalesce((
      with conv as (
        select x.de_id, row_number() over (order by min(x.created_at)) as n
        from public.alertas_calle_mensajes x
        where x.alerta_id = p_id and x.de_id <> v_a.autor_id and x.deleted_at is null
        group by x.de_id
      )
      select jsonb_agg(jsonb_build_object('id', m.id, 'texto', m.texto, 'created_at', m.created_at, 'mio', m.de_id = v_yo,
        'conversacion', case when v_mia then coalesce(c.n, 0) else 0 end) order by m.created_at)
      from public.alertas_calle_mensajes m
      left join conv c on c.de_id = case when m.de_id = v_a.autor_id then m.para_id else m.de_id end
      where m.alerta_id = p_id and m.deleted_at is null and (m.de_id = v_yo or m.para_id = v_yo)), '[]'::jsonb)
  );
end;
$$;

create or replace function public.alerta_calle_crear(p_tipo text, p_especie text, p_descripcion text, p_color text, p_tamano text, p_foto_path text, p_lat double precision, p_lng double precision, p_precision int)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
  v_id uuid;
begin
  if v_yo is null or not exists (select 1 from public.duenos d where d.id = v_yo and d.deleted_at is null) then
    raise exception 'Entra a la app para subir una alerta.' using errcode = '42501';
  end if;
  if (select count(*) from public.alertas_calle a where a.autor_id = v_yo and a.created_at > now() - interval '24 hours') >= 5 then
    raise exception 'Ya subiste 5 alertas hoy. Si es urgente, actualiza una de las tuyas.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.alertas_calle a where a.autor_id = v_yo and a.created_at > now() - interval '2 minutes') then
    raise exception 'Espera un par de minutos antes de subir otra alerta.' using errcode = 'P0001';
  end if;
  if p_foto_path is not null and p_foto_path not like v_yo::text || '/%' then
    raise exception 'La foto no es tuya.' using errcode = '42501';
  end if;
  insert into public.alertas_calle (autor_id, tipo, especie, descripcion, color, tamano, foto_path, lat, lng, precision_m, updated_at)
  values (v_yo, p_tipo, p_especie, nullif(btrim(p_descripcion), ''), nullif(btrim(p_color), ''), nullif(p_tamano, ''), p_foto_path, p_lat, p_lng, p_precision, now())
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.alerta_calle_actualizar(p_id uuid, p_texto text, p_foto_path text, p_estado text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
  v_id uuid;
begin
  if v_yo is null or not exists (select 1 from public.duenos d where d.id = v_yo and d.deleted_at is null) then
    raise exception 'Entra a la app para actualizar la alerta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.alertas_calle a where a.id = p_id and a.deleted_at is null and a.oculta_at is null and a.estado <> 'caducada') then
    raise exception 'Esa alerta ya no está activa.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.alertas_calle_actualizaciones u where u.autor_id = v_yo and u.created_at > now() - interval '24 hours') >= 20 then
    raise exception 'Ya hiciste muchas actualizaciones hoy. Intenta mañana.' using errcode = 'P0001';
  end if;
  if p_foto_path is not null and p_foto_path not like v_yo::text || '/%' then
    raise exception 'La foto no es tuya.' using errcode = '42501';
  end if;
  insert into public.alertas_calle_actualizaciones (alerta_id, autor_id, texto, foto_path, estado, updated_at)
  values (p_id, v_yo, nullif(btrim(p_texto), ''), p_foto_path, nullif(p_estado, ''), now())
  returning id into v_id;
  update public.alertas_calle a
     set ultima_actividad_at = now(),
         estado = coalesce(nullif(p_estado, ''), a.estado),
         resuelta_at = case when nullif(p_estado, '') in ('rescatado', 'reunido') then now() when nullif(p_estado, '') in ('sigue_ahi', 'ya_no_esta') then null else a.resuelta_at end
   where a.id = p_id;
  return v_id;
end;
$$;

create or replace function public.alerta_calle_reportar(p_id uuid, p_motivo text, p_texto text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
  v_n int;
begin
  if v_yo is null then raise exception 'Entra a la app para reportar.' using errcode = '42501'; end if;
  if exists (select 1 from public.alertas_calle a where a.id = p_id and a.autor_id = v_yo) then
    raise exception 'Es tu alerta: si ya no aplica, márcala como resuelta.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.alertas_calle a where a.id = p_id and a.deleted_at is null) then
    raise exception 'No encontramos esa alerta.' using errcode = 'P0001';
  end if;
  insert into public.alertas_calle_reportes (alerta_id, autor_id, motivo, texto, updated_at)
  values (p_id, v_yo, p_motivo, nullif(btrim(p_texto), ''), now())
  on conflict (alerta_id, autor_id) where deleted_at is null do nothing;
  select count(*) into v_n from public.alertas_calle_reportes r where r.alerta_id = p_id and r.deleted_at is null;
  update public.alertas_calle a set reportes = v_n,
    oculta_at = case when v_n >= 3 and a.oculta_at is null then now() else a.oculta_at end,
    oculta_motivo = case when v_n >= 3 and a.oculta_at is null then 'Escondida sola: la reportaron 3 personas.' else a.oculta_motivo end
  where a.id = p_id;
  return jsonb_build_object('reportes', v_n);
end;
$$;

-- Un mensaje a quien la subió (o, si es mía, la respuesta a una conversación por su alias). Devuelve para quién es
-- SOLO al servidor (la llama con la sesión de la persona y luego avisa con la llave de servicio).
create or replace function public.alerta_calle_mensaje(p_id uuid, p_texto text, p_conversacion int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := auth.uid();
  v_autor uuid;
  v_para uuid;
  v_id uuid;
begin
  if v_yo is null or not exists (select 1 from public.duenos d where d.id = v_yo and d.deleted_at is null) then
    raise exception 'Entra a la app para escribir.' using errcode = '42501';
  end if;
  select a.autor_id into v_autor from public.alertas_calle a where a.id = p_id and a.deleted_at is null and a.oculta_at is null;
  if v_autor is null then raise exception 'Esa alerta ya no está disponible.' using errcode = 'P0001'; end if;
  if (select count(*) from public.alertas_calle_mensajes m where m.de_id = v_yo and m.created_at > now() - interval '24 hours') >= 40 then
    raise exception 'Mandaste muchos mensajes hoy. Intenta mañana.' using errcode = 'P0001';
  end if;
  if v_autor = v_yo then
    -- La conversación N es la N-ésima persona que escribió primero.
    select x.de_id into v_para from (
      select m.de_id, min(m.created_at) as primero from public.alertas_calle_mensajes m
      where m.alerta_id = p_id and m.de_id <> v_autor and m.deleted_at is null group by m.de_id
    ) x order by x.primero offset greatest(coalesce(p_conversacion, 1), 1) - 1 limit 1;
    if v_para is null then raise exception 'Todavía nadie te ha escrito por esta alerta.' using errcode = 'P0001'; end if;
  else
    v_para := v_autor;
  end if;
  insert into public.alertas_calle_mensajes (alerta_id, de_id, para_id, texto, updated_at) values (p_id, v_yo, v_para, btrim(p_texto), now()) returning id into v_id;
  update public.alertas_calle a set ultima_actividad_at = now() where a.id = p_id;
  return jsonb_build_object('id', v_id);
end;
$$;

-- Caducan solas: sin actividad en 72 horas (cron). Solo el servidor.
create or replace function public.alertas_calle_caducar()
returns int language sql security definer set search_path = '' as $$
  with c as (
    update public.alertas_calle a set estado = 'caducada'
    where a.deleted_at is null and a.estado in ('sigue_ahi', 'ya_no_esta') and a.ultima_actividad_at < now() - interval '72 hours'
    returning 1
  ) select count(*)::int from c;
$$;

-- Mascotas reportadas perdidas cerca que se parecen (especie igual, perdida en los últimos 60 días, a 5 km). El puntaje
-- junta distancia, días y si el color o la raza aparecen en la descripción. Solo el servidor.
create or replace function public.alerta_calle_coincidencias(p_alerta uuid)
returns table (mascota_id uuid, dueno_id uuid, nombre text, distancia_km double precision, puntaje double precision)
language sql stable security definer set search_path = '' as $$
  with a as (select * from public.alertas_calle where id = p_alerta and deleted_at is null and tipo in ('perdido', 'abandonado', 'herido', 'peligro'))
  select m.id, m.dueno_id, m.nombre, public._alerta_km(a.lat, a.lng, m.perdida_lat, m.perdida_lng) as km,
    (5 - least(public._alerta_km(a.lat, a.lng, m.perdida_lat, m.perdida_lng), 5)) * 10
      + greatest(0, 60 - extract(epoch from (a.created_at - m.perdida_at)) / 86400) / 2
      + case when a.color is not null and (coalesce(m.perdida_nota, '') || ' ' || coalesce(m.raza_texto, '')) ilike '%' || a.color || '%' then 15 else 0 end
      + case when m.raza_texto is not null and coalesce(a.descripcion, '') ilike '%' || m.raza_texto || '%' then 15 else 0 end
  from a
  join public.mascotas m on m.deleted_at is null and m.perdida_at is not null and m.encontrada_at is null and not m.fallecido
    and m.especie = a.especie and m.dueno_id <> a.autor_id
    and m.perdida_lat is not null and m.perdida_lng is not null
    and m.perdida_at > a.created_at - interval '60 days' and m.perdida_at <= a.created_at + interval '1 hour'
    and public._alerta_km(a.lat, a.lng, m.perdida_lat, m.perdida_lng) <= 5
  order by 5 desc
  limit 20;
$$;

-- Moderación (administración de la plataforma).
create or replace function public.plataforma_alertas_calle(p_filtro text)
returns table (id uuid, tipo text, especie text, descripcion text, foto_path text, estado text, created_at timestamptz, reportes int, motivos text[], oculta_at timestamptz, oculta_motivo text, lat double precision, lng double precision)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.es_admin_plataforma(), false) then raise exception 'Solo la administración de PeluDesk.' using errcode = '42501'; end if;
  return query
    select a.id, a.tipo, a.especie, a.descripcion, a.foto_path, a.estado, a.created_at, a.reportes,
      array(select distinct r.motivo from public.alertas_calle_reportes r where r.alerta_id = a.id and r.deleted_at is null),
      a.oculta_at, a.oculta_motivo, a.lat, a.lng
    from public.alertas_calle a
    where a.deleted_at is null
      and case coalesce(p_filtro, 'reportadas')
        when 'reportadas' then a.reportes > 0 and a.oculta_at is null
        when 'escondidas' then a.oculta_at is not null
        else true end
    order by a.reportes desc, a.created_at desc
    limit 200;
end;
$$;

create or replace function public.plataforma_alerta_calle_moderar(p_id uuid, p_accion text, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(public.es_admin_plataforma(), false) then raise exception 'Solo la administración de PeluDesk.' using errcode = '42501'; end if;
  if p_accion = 'ocultar' then
    update public.alertas_calle set oculta_at = now(), oculta_motivo = coalesce(nullif(btrim(p_motivo), ''), 'Escondida por PeluDesk.') where id = p_id;
  elsif p_accion = 'restaurar' then
    update public.alertas_calle set oculta_at = null, oculta_motivo = null where id = p_id;
    update public.alertas_calle_reportes set deleted_at = now() where alerta_id = p_id and deleted_at is null;
    update public.alertas_calle set reportes = 0 where id = p_id;
  elsif p_accion = 'borrar' then
    update public.alertas_calle set deleted_at = now(), oculta_at = coalesce(oculta_at, now()), oculta_motivo = coalesce(nullif(btrim(p_motivo), ''), 'Borrada por PeluDesk.') where id = p_id;
  else
    raise exception 'Acción desconocida.';
  end if;
end;
$$;

-- Métricas para /plataforma/app-duenos: alertas, rescatados y reunidos (lo cuenta la base).
create or replace function public.app_alertas_metricas()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not coalesce(public.es_admin_plataforma(), false) and (select auth.role()) <> 'service_role' then raise exception 'Solo la administración de PeluDesk.' using errcode = '42501'; end if;
  return (
    select jsonb_build_object(
      'total', count(*),
      'activas', count(*) filter (where estado in ('sigue_ahi', 'ya_no_esta') and oculta_at is null),
      'rescatados', count(*) filter (where estado = 'rescatado'),
      'reunidos', count(*) filter (where estado = 'reunido'),
      'caducadas', count(*) filter (where estado = 'caducada'),
      'escondidas', count(*) filter (where oculta_at is not null),
      'ultimos_30_dias', count(*) filter (where created_at > now() - interval '30 days'))
    from public.alertas_calle where deleted_at is null
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'alertas_calle_cerca(double precision, double precision, double precision)', 'alerta_calle_detalle(uuid)',
    'alerta_calle_crear(text, text, text, text, text, text, double precision, double precision, int)',
    'alerta_calle_actualizar(uuid, text, text, text)', 'alerta_calle_reportar(uuid, text, text)', 'alerta_calle_mensaje(uuid, text, int)',
    'alertas_calle_caducar()', 'alerta_calle_coincidencias(uuid)', 'plataforma_alertas_calle(text)', 'plataforma_alerta_calle_moderar(uuid, text, text)', 'app_alertas_metricas()'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
  end loop;
end $$;
-- Con la sesión de la persona (app) o de la administración de la plataforma:
grant execute on function public.alertas_calle_cerca(double precision, double precision, double precision) to authenticated, service_role;
grant execute on function public.alerta_calle_detalle(uuid) to authenticated, service_role;
grant execute on function public.alerta_calle_crear(text, text, text, text, text, text, double precision, double precision, int) to authenticated;
grant execute on function public.alerta_calle_actualizar(uuid, text, text, text) to authenticated;
grant execute on function public.alerta_calle_reportar(uuid, text, text) to authenticated;
grant execute on function public.alerta_calle_mensaje(uuid, text, int) to authenticated;
grant execute on function public.plataforma_alertas_calle(text) to authenticated;
grant execute on function public.plataforma_alerta_calle_moderar(uuid, text, text) to authenticated;
grant execute on function public.app_alertas_metricas() to authenticated, service_role;
-- Solo el servidor:
revoke execute on function public.alertas_calle_caducar() from authenticated;
revoke execute on function public.alerta_calle_coincidencias(uuid) from authenticated;
grant execute on function public.alertas_calle_caducar() to service_role;
grant execute on function public.alerta_calle_coincidencias(uuid) to service_role;

-- Los avisos de la app ganan el tipo «alerta» (alerta cerca, actualización, mensaje, «puede ser tu mascota»).
alter table public.app_avisos drop constraint if exists app_avisos_tipo_check;
alter table public.app_avisos add constraint app_avisos_tipo_check check (tipo in ('bienvenida', 'vinculo', 'prueba', 'recordatorio', 'perdida', 'encontrada', 'mensaje', 'sistema', 'registro', 'negocio', 'alerta'));

-- Frontera: tablas de la persona.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('alertas_calle')$a$ in v_def) = 0 then
    if position($a$('app_push_dispositivos')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no encuentro la lista de tablas de la persona.';
    end if;
    v_def := replace(v_def, $a$('app_push_dispositivos')$a$, $b$('app_push_dispositivos'), ('alertas_calle'), ('alertas_calle_actualizaciones'), ('alertas_calle_reportes'), ('alertas_calle_mensajes'), ('alertas_calle_coincidencias')$b$);
    execute v_def;
  end if;
end $$;

-- Reversa (no se corre sola): drop table public.alertas_calle_coincidencias, public.alertas_calle_mensajes, public.alertas_calle_reportes,
-- public.alertas_calle_actualizaciones, public.alertas_calle; y las funciones de arriba.
