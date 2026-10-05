-- Serie de videos tutoriales de PeluDesk (5 de octubre de 2026).
--
--   tutoriales            catálogo de la plataforma (UNO por video): título,
--                         descripción de YouTube, módulos y permisos a los
--                         que aplica, dónde está el archivo y, si ya se
--                         subió, el id de YouTube. Lo leen el personal de
--                         cualquier negocio (solo lo publicado) y la
--                         plataforma; lo escribe el servidor o las
--                         funciones de abajo.
--   tutoriales_progreso   el estado de la cola de producción (corredor
--                         `npm run tutoriales`): fase, intentos, error.
--   avisos_operador       cola de avisos para la bandeja de Telegram de
--                         PeluDesk. Telegram no se alcanza desde las
--                         sesiones de la nube: el aviso se encola y la tarea
--                         /api/cron/avisos lo manda desde Vercel.
--
-- Son de la PLATAFORMA (sin negocio_id; van en `compartidas` de
-- auditoria_frontera). Dos buckets: `tutoriales` (público: el MP4 de 720p, el
-- póster y los subtítulos) y `tutoriales-masters` (privado: el MP4 de 1080p y
-- el paquete de YouTube).

create table public.tutoriales (
  id uuid primary key default gen_random_uuid(),
  numero text not null check (numero ~ '^[0-9]{2}$'),
  slug text not null check (slug ~ '^[a-z0-9-]{3,80}$'),
  area text not null,
  orden int not null,
  titulo text not null check (char_length(titulo) <= 70),
  resumen text not null default '',
  descripcion text not null default '',
  etiquetas text[] not null default '{}',
  modulos text[] not null default '{}',
  permisos text[] not null default '{}',
  articulos text[] not null default '{}',
  rutas text[] not null default '{}',
  siguiente text,
  duracion_s int,
  video_path text,
  poster_path text,
  vtt_path text,
  master_path text,
  master_donde text check (master_donde in ('prod', 'dev')),
  con_voz boolean not null default false,
  youtube_id text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  commit_app text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'listo', 'listo_sin_voz', 'error')),
  publicado boolean not null default false,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index tutoriales_numero on public.tutoriales (numero) where deleted_at is null;
create unique index tutoriales_slug on public.tutoriales (slug) where deleted_at is null;
create trigger set_updated_at before insert or update on public.tutoriales for each row execute function public.set_updated_at();

create table public.tutoriales_progreso (
  id uuid primary key default gen_random_uuid(),
  numero text not null check (numero ~ '^[0-9]{2}$'),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'guion', 'grabado', 'voz', 'render', 'qc', 'listo', 'listo_sin_voz', 'error')),
  intentos int not null default 0,
  fase_error text,
  error text,
  caracteres_voz int not null default 0,
  duracion_s numeric,
  tamano_bytes bigint,
  hash_guion text,
  qc jsonb,
  iniciado_at timestamptz,
  terminado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index tutoriales_progreso_numero on public.tutoriales_progreso (numero) where deleted_at is null;
create trigger set_updated_at before insert or update on public.tutoriales_progreso for each row execute function public.set_updated_at();

create table public.avisos_operador (
  id uuid primary key default gen_random_uuid(),
  texto text not null check (char_length(texto) between 1 and 3500),
  intentos int not null default 0,
  bloqueo_hasta timestamptz,
  enviado_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index avisos_operador_pendientes on public.avisos_operador (created_at) where enviado_at is null and deleted_at is null;
create trigger set_updated_at before insert or update on public.avisos_operador for each row execute function public.set_updated_at();

alter table public.tutoriales enable row level security;
alter table public.tutoriales_progreso enable row level security;
alter table public.avisos_operador enable row level security;

-- El personal de cualquier negocio ve lo publicado; la plataforma ve todo.
create policy tutoriales_select on public.tutoriales for select to authenticated
  using ((publicado and deleted_at is null and (select public.is_staff())) or (select public.es_admin_plataforma()));
create policy tutoriales_sin_escritura on public.tutoriales for insert to authenticated with check (false);
create policy tutoriales_progreso_select on public.tutoriales_progreso for select to authenticated using ((select public.es_admin_plataforma()));
create policy tutoriales_progreso_sin_escritura on public.tutoriales_progreso for insert to authenticated with check (false);
create policy avisos_operador_select on public.avisos_operador for select to authenticated using ((select public.es_admin_plataforma()));
create policy avisos_operador_sin_escritura on public.avisos_operador for insert to authenticated with check (false);
revoke all on public.tutoriales, public.tutoriales_progreso, public.avisos_operador from anon;
revoke all on public.tutoriales, public.tutoriales_progreso, public.avisos_operador from authenticated;
grant select on public.tutoriales, public.tutoriales_progreso, public.avisos_operador to authenticated;

-- Buckets: el público lleva el video chico; el privado, el master y el paquete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('tutoriales', 'tutoriales', true, 20971520, array['video/mp4', 'text/vtt', 'image/jpeg']),
  ('tutoriales-masters', 'tutoriales-masters', false, 52428800, array['video/mp4', 'text/plain', 'text/csv', 'application/x-subrip', 'image/jpeg', 'application/json'])
on conflict (id) do nothing;

-- ── Acciones de la plataforma ──
alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check
  check (accion in ('crear_negocio', 'actualizar_negocio', 'agregar_admin_negocio', 'restablecer_password', 'editar_catalogo',
                    'cambiar_plan', 'asignar_plan', 'editar_plan', 'resolver_propuesta_raza', 'agregar_raza', 'eliminar_negocio', 'seguimiento_pausa',
                    'cargar_tarifas_estetica', 'sincronizar_tutoriales', 'tutorial_youtube'));

-- El catálogo de los videos (del repo) a la tabla. No toca lo que ya se
-- produjo (archivos, estado, publicación).
create or replace function public.plataforma_tutoriales_sincronizar(p_filas jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  f jsonb;
  n int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'Las filas van en una lista.';
  end if;
  for f in select * from jsonb_array_elements(p_filas) loop
    insert into public.tutoriales (numero, slug, area, orden, titulo, resumen, descripcion, etiquetas, modulos, permisos, articulos, rutas, siguiente, duracion_s)
    values (f->>'numero', f->>'slug', f->>'area', (f->>'orden')::int, f->>'titulo', coalesce(f->>'resumen', ''), coalesce(f->>'descripcion', ''),
            coalesce(array(select jsonb_array_elements_text(f->'etiquetas')), '{}'), coalesce(array(select jsonb_array_elements_text(f->'modulos')), '{}'),
            coalesce(array(select jsonb_array_elements_text(f->'permisos')), '{}'), coalesce(array(select jsonb_array_elements_text(f->'articulos')), '{}'),
            coalesce(array(select jsonb_array_elements_text(f->'rutas')), '{}'), nullif(f->>'siguiente', ''), nullif(f->>'duracion_s', '')::int)
    on conflict (numero) where deleted_at is null do update set
      slug = excluded.slug, area = excluded.area, orden = excluded.orden, titulo = excluded.titulo, resumen = excluded.resumen,
      etiquetas = excluded.etiquetas, modulos = excluded.modulos, permisos = excluded.permisos, articulos = excluded.articulos,
      rutas = excluded.rutas, siguiente = excluded.siguiente,
      descripcion = case when public.tutoriales.video_path is null then excluded.descripcion else public.tutoriales.descripcion end;
    n := n + 1;
  end loop;
  insert into public.plataforma_eventos (accion, detalle, created_by)
  values ('sincronizar_tutoriales', jsonb_build_object('filas', n, 'via', case when auth.role() = 'service_role' then 'servicio' else 'sesion' end), auth.uid());
  return n;
end;
$$;

-- Lo que produjo el corredor: archivos, duración, estado y publicación.
create or replace function public.plataforma_tutorial_publicar(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el corredor de tutoriales.' using errcode = '42501';
  end if;
  update public.tutoriales set
    descripcion = coalesce(p->>'descripcion', descripcion),
    duracion_s = coalesce(nullif(p->>'duracion_s', '')::int, duracion_s),
    video_path = coalesce(p->>'video_path', video_path),
    poster_path = coalesce(p->>'poster_path', poster_path),
    vtt_path = coalesce(p->>'vtt_path', vtt_path),
    master_path = coalesce(p->>'master_path', master_path),
    master_donde = coalesce(p->>'master_donde', master_donde),
    con_voz = coalesce((p->>'con_voz')::boolean, con_voz),
    commit_app = coalesce(p->>'commit_app', commit_app),
    estado = coalesce(p->>'estado', estado),
    publicado = coalesce((p->>'publicado')::boolean, publicado),
    version = case when p ? 'video_path' then version + 1 else version end
  where numero = p->>'numero' and deleted_at is null;
  if not found then
    raise exception 'No existe el tutorial %.', p->>'numero';
  end if;
end;
$$;

-- El id de YouTube lo pone una persona de la plataforma cuando sube el video.
create or replace function public.plataforma_tutorial_youtube(p_numero text, p_youtube_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := nullif(btrim(coalesce(p_youtube_id, '')), '');
begin
  if not coalesce((select public.es_admin_plataforma()), false) and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  if v_id is not null and v_id !~ '^[A-Za-z0-9_-]{11}$' then
    raise exception 'Ese no es un id de YouTube (son 11 caracteres, como dQw4w9WgXcQ).';
  end if;
  update public.tutoriales set youtube_id = v_id where numero = p_numero and deleted_at is null;
  if not found then
    raise exception 'No existe el tutorial %.', p_numero;
  end if;
  insert into public.plataforma_eventos (accion, detalle, created_by)
  values ('tutorial_youtube', jsonb_build_object('numero', p_numero, 'youtube_id', v_id), auth.uid());
end;
$$;

create or replace function public.tutoriales_progreso_guardar(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el corredor de tutoriales.' using errcode = '42501';
  end if;
  insert into public.tutoriales_progreso (numero, estado, intentos, fase_error, error, caracteres_voz, duracion_s, tamano_bytes, hash_guion, qc, iniciado_at, terminado_at)
  values (p->>'numero', coalesce(p->>'estado', 'pendiente'), coalesce((p->>'intentos')::int, 0), p->>'fase_error', p->>'error',
          coalesce((p->>'caracteres_voz')::int, 0), nullif(p->>'duracion_s', '')::numeric, nullif(p->>'tamano_bytes', '')::bigint, p->>'hash_guion', p->'qc',
          nullif(p->>'iniciado_at', '')::timestamptz, nullif(p->>'terminado_at', '')::timestamptz)
  on conflict (numero) where deleted_at is null do update set
    estado = excluded.estado, intentos = excluded.intentos, fase_error = excluded.fase_error, error = excluded.error,
    caracteres_voz = excluded.caracteres_voz, duracion_s = coalesce(excluded.duracion_s, public.tutoriales_progreso.duracion_s),
    tamano_bytes = coalesce(excluded.tamano_bytes, public.tutoriales_progreso.tamano_bytes),
    hash_guion = coalesce(excluded.hash_guion, public.tutoriales_progreso.hash_guion), qc = coalesce(excluded.qc, public.tutoriales_progreso.qc),
    iniciado_at = coalesce(excluded.iniciado_at, public.tutoriales_progreso.iniciado_at), terminado_at = excluded.terminado_at;
end;
$$;

-- Avisos para la bandeja de Telegram.
create or replace function public.plataforma_aviso_encolar(p_texto text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor encola avisos.' using errcode = '42501';
  end if;
  insert into public.avisos_operador (texto) values (left(p_texto, 3500)) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.avisos_tomar(p_limite int)
returns setof public.avisos_operador
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor manda avisos.' using errcode = '42501';
  end if;
  return query
  update public.avisos_operador a
  set bloqueo_hasta = now() + interval '5 minutes', intentos = a.intentos + 1
  where a.id in (
    select x.id from public.avisos_operador x
    where x.enviado_at is null and x.deleted_at is null and x.intentos < 6 and coalesce(x.bloqueo_hasta, now() - interval '1 second') <= now()
    order by x.created_at
    limit p_limite
    for update skip locked
  )
  returning a.*;
end;
$$;

create or replace function public.avisos_marcar(p_id uuid, p_ok boolean, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor manda avisos.' using errcode = '42501';
  end if;
  update public.avisos_operador
  set enviado_at = case when p_ok then now() else null end, error = case when p_ok then null else left(p_error, 500) end,
      bloqueo_hasta = case when p_ok then null else now() + interval '2 minutes' end
  where id = p_id;
end;
$$;

revoke execute on function public.plataforma_tutoriales_sincronizar(jsonb) from public, anon;
revoke execute on function public.plataforma_tutorial_publicar(jsonb) from public, anon, authenticated;
revoke execute on function public.plataforma_tutorial_youtube(text, text) from public, anon;
revoke execute on function public.tutoriales_progreso_guardar(jsonb) from public, anon, authenticated;
revoke execute on function public.plataforma_aviso_encolar(text) from public, anon, authenticated;
revoke execute on function public.avisos_tomar(int) from public, anon, authenticated;
revoke execute on function public.avisos_marcar(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.plataforma_tutoriales_sincronizar(jsonb) to authenticated, service_role;
grant execute on function public.plataforma_tutorial_publicar(jsonb) to service_role;
grant execute on function public.plataforma_tutorial_youtube(text, text) to authenticated, service_role;
grant execute on function public.tutoriales_progreso_guardar(jsonb) to service_role;
grant execute on function public.plataforma_aviso_encolar(text) to service_role;
grant execute on function public.avisos_tomar(int) to service_role;
grant execute on function public.avisos_marcar(uuid, boolean, text) to service_role;

-- Tablas compartidas y funciones de postgres: a la lista blanca de la auditoría.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('tutoriales_progreso' in v_def) = 0 then
    v_def := replace(v_def, $a$('redes_publicaciones'), ('redes_ajustes')$a$, $b$('redes_publicaciones'), ('redes_ajustes'), ('tutoriales'), ('tutoriales_progreso'), ('avisos_operador')$b$);
    v_def := replace(v_def, $a$('plataforma_agregar_raza')$a$, $b$('plataforma_agregar_raza'), ('plataforma_tutoriales_sincronizar'), ('plataforma_tutorial_publicar'),
    ('plataforma_tutorial_youtube'), ('tutoriales_progreso_guardar'), ('plataforma_aviso_encolar'), ('avisos_tomar'), ('avisos_marcar')$b$);
    if position('tutoriales_progreso' in v_def) = 0 or position('avisos_marcar' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudieron agregar los tutoriales.';
    end if;
    execute v_def;
  end if;
end $$;
