-- Publicación automática de los videos de PeluDesk en Facebook, Instagram y
-- TikTok (29 de septiembre de 2026).
--
-- Instagram no programa por su API, así que el programador es nuestro:
--
--   redes_publicaciones  una fila por video y red (con su formato, fecha y
--                        pie). La tarea de Vercel /api/cron/redes la toma
--                        cuando le toca, la publica y deja el resultado.
--   redes_ajustes        perillas de la plataforma (hoy: pausar todo).
--
-- Son de la PLATAFORMA, no de un negocio: sin negocio_id (van en la lista
-- de compartidas de auditoria_frontera), las lee la administración de
-- PeluDesk y las escribe el servidor (secret key) o las funciones
-- plataforma_redes_* (que comprueban es_admin_plataforma).
--
-- Idempotencia: la fila guarda cada id intermedio (contenedor de
-- Instagram, video de Facebook, publish_id de TikTok) ANTES del paso que
-- publica, y `paso` dice en qué iba. Si una corrida se muere a la mitad,
-- la siguiente retoma desde ahí o, si el paso que se cortó pudo haber
-- publicado sin dejar id, la marca 'revisar' y NO la vuelve a mandar.
-- Las credenciales de TikTok (rotan cada 24 h) viven en Vault, nunca en
-- una columna: redes_secreto_guardar / redes_secreto_leer, solo el servidor.

create table public.redes_publicaciones (
  id uuid primary key default gen_random_uuid(),
  video text not null,
  red text not null check (red in ('facebook', 'instagram', 'tiktok')),
  -- reel: Reels de Facebook/Instagram · muro: video normal de la página de
  -- Facebook (16:9) · borrador: al buzón de TikTok (lo publica una persona).
  formato text not null check (formato in ('reel', 'muro', 'borrador')),
  archivo text not null,
  programada_at timestamptz not null,
  pie text not null default '',
  estado text not null default 'programada'
    check (estado in ('programada', 'publicando', 'reintentar', 'publicada', 'fallida', 'revisar', 'cancelada')),
  paso text,
  intentos int not null default 0,
  proximo_intento_at timestamptz,
  bloqueo_hasta timestamptz,
  contenedor_id text,
  publicacion_id text,
  url text,
  error text,
  publicada_at timestamptz,
  prueba boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint redes_formato_de_red check (
    (red = 'instagram' and formato = 'reel') or
    (red = 'facebook' and formato in ('reel', 'muro')) or
    (red = 'tiktok' and formato = 'borrador'))
);
-- Un video sale una sola vez por red (las pruebas no cuentan).
create unique index redes_publicaciones_unica on public.redes_publicaciones (video, red)
  where deleted_at is null and not prueba and estado <> 'cancelada';
create index redes_publicaciones_pendientes on public.redes_publicaciones (programada_at)
  where deleted_at is null and estado in ('programada', 'reintentar', 'publicando');
create trigger set_updated_at before insert or update on public.redes_publicaciones for each row execute function public.set_updated_at();

create table public.redes_ajustes (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  valor text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index redes_ajustes_clave on public.redes_ajustes (clave) where deleted_at is null;
create trigger set_updated_at before insert or update on public.redes_ajustes for each row execute function public.set_updated_at();

-- Lo lee la administración de la plataforma; nadie con sesión escribe
-- directo (las funciones de abajo y el servidor sí).
do $$
declare t text;
begin
  foreach t in array array['redes_publicaciones', 'redes_ajustes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_escritura', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── Para la pantalla /plataforma/redes (con la sesión de la plataforma) ──

create or replace function public.plataforma_redes_reprogramar(p_id uuid, p_fecha timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if p_fecha is null then
    raise exception 'Falta la fecha.';
  end if;
  update public.redes_publicaciones
  set programada_at = p_fecha, estado = 'programada', proximo_intento_at = null, error = null,
      intentos = case when estado = 'fallida' then 0 else intentos end
  where id = p_id and deleted_at is null and estado in ('programada', 'reintentar', 'fallida');
  if not found then
    raise exception 'Esa publicación ya salió, se está publicando o hay que revisarla: no se reprograma.';
  end if;
end;
$$;

-- Publicar ahora = que la tome la siguiente corrida (o la que lanza la pantalla).
create or replace function public.plataforma_redes_publicar_ahora(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.plataforma_redes_reprogramar(p_id, now());
end;
$$;

-- 'revisar' solo lo resuelve una persona: ya salió (y se anota) o no salió (y se reprograma).
create or replace function public.plataforma_redes_resolver(p_id uuid, p_salio boolean, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if p_salio then
    update public.redes_publicaciones
    set estado = 'publicada', publicada_at = coalesce(publicada_at, now()), url = nullif(trim(coalesce(p_url, '')), ''),
        error = null, paso = null, bloqueo_hasta = null
    where id = p_id and deleted_at is null and estado in ('revisar', 'fallida');
  else
    update public.redes_publicaciones
    set estado = 'programada', paso = null, contenedor_id = null, error = null, intentos = 0,
        proximo_intento_at = null, bloqueo_hasta = null, programada_at = greatest(programada_at, now())
    where id = p_id and deleted_at is null and estado in ('revisar', 'fallida');
  end if;
  if not found then
    raise exception 'Solo se resuelve una publicación que quedó por revisar o fallida.';
  end if;
end;
$$;

create or replace function public.plataforma_redes_cancelar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  update public.redes_publicaciones set estado = 'cancelada', bloqueo_hasta = null
  where id = p_id and deleted_at is null and estado in ('programada', 'reintentar', 'fallida', 'revisar');
  if not found then
    raise exception 'Esa publicación ya salió o se está publicando.';
  end if;
end;
$$;

create or replace function public.plataforma_redes_pausar(p_pausa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  update public.redes_ajustes set valor = case when p_pausa then 'si' else 'no' end
  where clave = 'pausa' and deleted_at is null;
  if not found then
    insert into public.redes_ajustes (clave, valor, created_by) values ('pausa', case when p_pausa then 'si' else 'no' end, null);
  end if;
end;
$$;

-- Carga el calendario (src/lib/redes/serie.ts): agrega lo que falta y no
-- toca lo que ya existe (ni la fecha que se reprogramó ni lo publicado).
-- p_filas: [{video, red, formato, archivo, programada_at, pie}]
create or replace function public.plataforma_redes_programar(p_filas jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  insert into public.redes_publicaciones (video, red, formato, archivo, programada_at, pie, created_by)
  select f->>'video', f->>'red', f->>'formato', f->>'archivo', (f->>'programada_at')::timestamptz, coalesce(f->>'pie', ''), auth.uid()
  from jsonb_array_elements(p_filas) f
  where not exists (
    select 1 from public.redes_publicaciones r
    where r.video = f->>'video' and r.red = f->>'red' and r.deleted_at is null and not r.prueba and r.estado <> 'cancelada')
  on conflict do nothing;
  get diagnostics v_n = row_count;
  -- El pie sí se actualiza mientras no haya salido (se corrigió en el código).
  update public.redes_publicaciones r set pie = coalesce(f->>'pie', r.pie)
  from jsonb_array_elements(p_filas) f
  where r.video = f->>'video' and r.red = f->>'red' and r.deleted_at is null and not r.prueba
    and r.estado in ('programada', 'reintentar', 'fallida') and r.pie is distinct from f->>'pie';
  return v_n;
end;
$$;

-- Una prueba: sale ya, en privado o como borrador (Facebook: video sin
-- publicar que luego se borra; Instagram: contenedor que nunca se publica;
-- TikTok: borrador en el buzón). No cuenta para el calendario.
create or replace function public.plataforma_redes_probar(p_red text, p_archivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  insert into public.redes_publicaciones (video, red, formato, archivo, programada_at, pie, prueba, created_by)
  values ('prueba', p_red, case p_red when 'tiktok' then 'borrador' else 'reel' end, p_archivo, now(),
    'Prueba de conexión de PeluDesk (privada, se borra sola).', true, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Para el publicador (solo el servidor) ──

-- Toma lo que ya toca, de forma atómica: dos corridas a la vez nunca toman
-- la misma fila (skip locked + bloqueo con vencimiento). Una fila que se
-- quedó 'publicando' con el bloqueo vencido (la corrida murió) se vuelve a
-- tomar: el publicador decide con `paso` si retoma o la manda a revisar.
create or replace function public.redes_tomar(p_limite int, p_bloqueo_min int)
returns setof public.redes_publicaciones
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor publica.';
  end if;
  if exists (select 1 from public.redes_ajustes where clave = 'pausa' and valor = 'si' and deleted_at is null) then
    return;
  end if;
  return query
  update public.redes_publicaciones r
  set estado = 'publicando', bloqueo_hasta = now() + make_interval(mins => p_bloqueo_min)
  where r.id in (
    select x.id from public.redes_publicaciones x
    where x.deleted_at is null
      and x.programada_at <= now()
      and (
        (x.estado = 'programada')
        or (x.estado = 'reintentar' and coalesce(x.proximo_intento_at, now()) <= now())
        or (x.estado = 'publicando' and x.bloqueo_hasta < now())
      )
    order by x.programada_at
    limit p_limite
    for update skip locked
  )
  returning r.*;
end;
$$;

-- Credenciales de la plataforma en Vault (hoy: los tokens de TikTok).
create or replace function public.redes_secreto_guardar(p_nombre text, p_valor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := 'peludesk_redes:' || p_nombre;
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor guarda credenciales.';
  end if;
  if p_nombre not in ('tiktok') then
    raise exception 'Credencial desconocida.';
  end if;
  select s.id into v_id from vault.secrets s where s.name = v_nombre;
  if v_id is null then
    perform vault.create_secret(p_valor, v_nombre, 'Credencial de publicación en redes de PeluDesk');
  else
    perform vault.update_secret(v_id, p_valor);
  end if;
end;
$$;

create or replace function public.redes_secreto_leer(p_nombre text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor lee credenciales.';
  end if;
  select d.decrypted_secret into v from vault.decrypted_secrets d where d.name = 'peludesk_redes:' || p_nombre;
  return v;
end;
$$;

revoke execute on function public.plataforma_redes_reprogramar(uuid, timestamptz) from public, anon;
revoke execute on function public.plataforma_redes_publicar_ahora(uuid) from public, anon;
revoke execute on function public.plataforma_redes_resolver(uuid, boolean, text) from public, anon;
revoke execute on function public.plataforma_redes_cancelar(uuid) from public, anon;
revoke execute on function public.plataforma_redes_pausar(boolean) from public, anon;
revoke execute on function public.plataforma_redes_programar(jsonb) from public, anon;
revoke execute on function public.plataforma_redes_probar(text, text) from public, anon;
grant execute on function public.plataforma_redes_reprogramar(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.plataforma_redes_publicar_ahora(uuid) to authenticated, service_role;
grant execute on function public.plataforma_redes_resolver(uuid, boolean, text) to authenticated, service_role;
grant execute on function public.plataforma_redes_cancelar(uuid) to authenticated, service_role;
grant execute on function public.plataforma_redes_pausar(boolean) to authenticated, service_role;
grant execute on function public.plataforma_redes_programar(jsonb) to authenticated, service_role;
grant execute on function public.plataforma_redes_probar(text, text) to authenticated, service_role;
revoke execute on function public.redes_tomar(int, int) from public, anon, authenticated;
revoke execute on function public.redes_secreto_guardar(text, text) from public, anon, authenticated;
revoke execute on function public.redes_secreto_leer(text) from public, anon, authenticated;
grant execute on function public.redes_tomar(int, int) to service_role;
grant execute on function public.redes_secreto_guardar(text, text) to service_role;
grant execute on function public.redes_secreto_leer(text) to service_role;

-- Las dos tablas son compartidas y las funciones son de postgres (leen
-- tablas de la plataforma y Vault): a la lista blanca de la auditoría.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('redes_publicaciones' in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_aprendido'))$a$, $b$('wa_aprendido'), ('redes_publicaciones'), ('redes_ajustes'))$b$);
    v_def := replace(v_def, $a$('bot_cuenta_por_telefono')$a$,
      $b$('bot_cuenta_por_telefono'),
    -- Publicación en redes de PeluDesk (tablas de la plataforma y Vault).
    ('plataforma_redes_reprogramar'), ('plataforma_redes_publicar_ahora'), ('plataforma_redes_resolver'),
    ('plataforma_redes_cancelar'), ('plataforma_redes_pausar'), ('plataforma_redes_programar'), ('plataforma_redes_probar'), ('redes_tomar'), ('redes_secreto_guardar'), ('redes_secreto_leer')$b$);
    if position('redes_publicaciones' in v_def) = 0 or position('redes_secreto_leer' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar la publicación en redes.';
    end if;
    execute v_def;
  end if;
end $$;
