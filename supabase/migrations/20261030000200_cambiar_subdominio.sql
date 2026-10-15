-- QA externa B2 (15 de octubre de 2026): el subdominio de un negocio solo se podía fijar al darlo de alta, y los
-- negocios creados antes del arreglo de acentos quedaron con letras perdidas («prueba-hotel-guarder-a»).
-- La plataforma ahora puede cambiar el subdominio de un negocio existente. El anterior NO se pierde: queda en
-- `negocios_slugs_anteriores` y su dirección responde con una redirección permanente (308) a la nueva, con la
-- misma ruta y parámetros, así que los links, QR y la página pública ya impresos o enviados siguen sirviendo.
--
-- REVERSA: volver a cambiar el subdominio al anterior (la fila vieja se da de baja y el negocio vuelve a su
-- dirección). La tabla puede quedarse (es historial).

-- ── 1. Subdominios anteriores ────────────────────────────────────────
-- Tabla de la PLATAFORMA (sin `negocio_id`: no es de un negocio; el destino va en `negocio_destino`).
create table public.negocios_slugs_anteriores (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug ~ '^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$'),
  negocio_destino uuid not null references public.negocios(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
-- Un subdominio viejo apunta a un solo negocio (mientras no se dé de baja).
create unique index negocios_slugs_anteriores_slug_uq on public.negocios_slugs_anteriores (slug) where deleted_at is null;
create index negocios_slugs_anteriores_destino_idx on public.negocios_slugs_anteriores (negocio_destino);
create trigger set_updated_at before insert or update on public.negocios_slugs_anteriores
  for each row execute function public.set_updated_at();

alter table public.negocios_slugs_anteriores enable row level security;
create policy negocios_slugs_anteriores_select on public.negocios_slugs_anteriores for select to authenticated
  using ((select public.es_admin_plataforma()));
create policy negocios_slugs_anteriores_insert on public.negocios_slugs_anteriores for insert to authenticated
  with check ((select public.es_admin_plataforma()));
create policy negocios_slugs_anteriores_update on public.negocios_slugs_anteriores for update to authenticated
  using ((select public.es_admin_plataforma())) with check ((select public.es_admin_plataforma()));
revoke all on public.negocios_slugs_anteriores from anon, authenticated;
grant select on public.negocios_slugs_anteriores to authenticated;

-- ── 2. La bitácora de la plataforma conoce la acción nueva ────────────
do $$
declare
  v_def text;
  v_acciones text[];
  v_nuevas text[] := array['cambiar_subdominio'];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  -- La restricción se guarda como '{a,b,c}'::text[]: se leen las acciones de las llaves.
  v_acciones := string_to_array((regexp_match(v_def, '\{([^}]*)\}'))[1], ',');
  if coalesce(array_length(v_acciones, 1), 0) < 10 then raise exception 'plataforma_eventos_accion_check cambió de forma: no se pudo leer la lista de acciones.'; end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || v_nuevas) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

-- ── 3. Nadie toma un subdominio que fue de otro negocio ──────────────
create or replace function public.validar_slug_no_anterior()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.negocios_slugs_anteriores a
    where a.slug = new.slug and a.deleted_at is null and a.negocio_destino is distinct from new.id
  ) then
    raise exception 'Ese subdominio fue de otro negocio y sigue redirigiendo allá. Escoge otro.';
  end if;
  return new;
end;
$$;
revoke execute on function public.validar_slug_no_anterior() from public, anon;
grant execute on function public.validar_slug_no_anterior() to authenticated, service_role;
create trigger validar_slug_no_anterior before insert or update of slug on public.negocios
  for each row execute function public.validar_slug_no_anterior();

-- slug_libre tampoco ofrece uno que fue de otro negocio.
do $$
declare
  v_def text := replace(pg_get_functiondef('public.slug_libre(text)'::regprocedure), chr(13), '');
  v_nuevo text;
begin
  if position('negocios_slugs_anteriores' in v_def) > 0 then return; end if;
  v_nuevo := replace(v_def, $a$and not exists (select 1 from public.negocios n where n.slug = v);$a$,
    $b$and not exists (select 1 from public.negocios n where n.slug = v)
          and not exists (select 1 from public.negocios_slugs_anteriores a where a.slug = v and a.deleted_at is null);$b$);
  if v_nuevo = v_def then raise exception 'slug_libre cambió: no se pudo excluir los subdominios anteriores.'; end if;
  execute v_nuevo;
end $$;

-- ── 4. Cambiar el subdominio (solo la plataforma) ────────────────────
create or replace function public.plataforma_cambiar_subdominio(p_negocio_id uuid, p_slug_nuevo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug_nuevo, '')));
  v_viejo text;
begin
  if not coalesce(public.es_admin_plataforma(), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  select n.slug into v_viejo from public.negocios n where n.id = p_negocio_id and n.deleted_at is null for update;
  if not found then
    raise exception 'Ese negocio no existe.';
  end if;
  if v_slug = v_viejo then
    raise exception 'Ese ya es su subdominio.';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$' or length(v_slug) < 3 then
    raise exception 'El subdominio va en minúsculas, números y guiones (de 3 a 42 caracteres), sin acentos ni ñ y sin empezar ni terminar en guion.';
  end if;
  if v_slug in ('www', 'app', 'api', 'admin', 'mail', 'static', 'plataforma', 'soporte', 'demo', 'registro', 'ayuda', 'blog', 'precios') then
    raise exception 'Ese subdominio está reservado para PeluDesk.';
  end if;
  if exists (select 1 from public.negocios n where n.slug = v_slug) then
    raise exception 'Ese subdominio ya lo usa otro negocio.';
  end if;
  if exists (select 1 from public.negocios_slugs_anteriores a where a.slug = v_slug and a.deleted_at is null and a.negocio_destino <> p_negocio_id) then
    raise exception 'Ese subdominio fue de otro negocio y sigue redirigiendo allá. Escoge otro.';
  end if;

  -- Si vuelve a uno de sus propios subdominios anteriores, esa redirección deja de hacer falta.
  update public.negocios_slugs_anteriores set deleted_at = now()
   where slug = v_slug and negocio_destino = p_negocio_id and deleted_at is null;
  insert into public.negocios_slugs_anteriores (slug, negocio_destino) values (v_viejo, p_negocio_id);

  update public.negocios
     set slug = v_slug,
         -- Una dirección pública armada con el subdominio viejo se suelta: la dirección vuelve a salir del slug nuevo.
         url_publica = case when url_publica ilike 'https://' || v_viejo || '.%' then null else url_publica end
   where id = p_negocio_id;

  perform public.plataforma_registrar_evento('cambiar_subdominio', p_negocio_id, null, null,
    jsonb_build_object('de', v_viejo, 'a', v_slug));
  return v_slug;
end;
$$;
revoke execute on function public.plataforma_cambiar_subdominio(uuid, text) from public, anon;
grant execute on function public.plataforma_cambiar_subdominio(uuid, text) to authenticated, service_role;

-- ── 5. Para el middleware: ¿a qué subdominio se mudó este? ────────────
-- Solo contesta el subdominio actual de un negocio ACTIVO; no da ningún otro dato.
create or replace function public.negocio_slug_actual(p_slug text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select n.slug
  from public.negocios_slugs_anteriores a
  join public.negocios n on n.id = a.negocio_destino
  where a.slug = lower(btrim(coalesce(p_slug, ''))) and a.deleted_at is null
    and n.activo and n.deleted_at is null
  limit 1;
$$;
revoke execute on function public.negocio_slug_actual(text) from public;
grant execute on function public.negocio_slug_actual(text) to anon, authenticated, service_role;

-- ── 6. auditoria_frontera: lo nuevo, a las listas blancas ─────────────
do $$
declare
  v_def text := replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '');
  v_nuevo text;
begin
  if position('negocio_slug_actual' in v_def) > 0 then return; end if;
  -- (a) funciones de postgres permitidas
  v_nuevo := replace(v_def, $a$('negocio_por_host'), $a$, $b$('negocio_por_host'), ('negocio_slug_actual'), ('plataforma_cambiar_subdominio'), ('validar_slug_no_anterior'), $b$);
  if v_nuevo = v_def then raise exception 'auditoria_frontera cambió: lista de funciones de postgres.'; end if;
  v_def := v_nuevo;
  -- (b) funciones que anon puede ejecutar a propósito
  v_nuevo := replace(v_def, $a$p.proname not in ('negocio_por_host', $a$, $b$p.proname not in ('negocio_por_host', 'negocio_slug_actual', $b$);
  if v_nuevo = v_def then raise exception 'auditoria_frontera cambió: lista de funciones de anon.'; end if;
  v_def := v_nuevo;
  -- (c) tablas de la plataforma (sin negocio_id)
  v_nuevo := replace(v_def, $a$('wa_hilos'), $a$, $b$('negocios_slugs_anteriores'), ('wa_hilos'), $b$);
  if v_nuevo = v_def then raise exception 'auditoria_frontera cambió: lista de tablas compartidas.'; end if;
  execute v_nuevo;
end $$;
