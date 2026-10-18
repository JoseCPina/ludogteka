-- IndexNow automático (18 de octubre de 2026): la tarea /api/cron/indexnow (cada hora) revisa el sitemap de
-- peludesk.mx, compara la huella del contenido de cada página con la última que avisó y manda a IndexNow SOLO las URL
-- nuevas o cambiadas. Antes dependía de correr scripts/seo/indexnow.mjs desde una computadora.
--   indexnow_urls    la última huella avisada de cada URL (si no hay fila, la URL es nueva)
--   indexnow_envios  un renglón por cada envío: cuántas URL, cuáles, el código y la respuesta de IndexNow
-- Son de la PLATAFORMA (sin negocio_id: van en `compartidas` de auditoria_frontera). Las lee la administración de
-- PeluDesk; las escribe solo el servidor (llave de servicio).
-- Reversa: drop table public.indexnow_envios, public.indexnow_urls;

create table public.indexnow_urls (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  huella text not null,
  primera_vez_at timestamptz not null default now(),
  enviada_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index indexnow_urls_url on public.indexnow_urls (url);
create trigger set_updated_at before insert or update on public.indexnow_urls for each row execute function public.set_updated_at();

create table public.indexnow_envios (
  id uuid primary key default gen_random_uuid(),
  origen text not null default 'cron' check (origen in ('cron', 'manual')),
  urls_total int not null default 0,
  urls_nuevas int not null default 0,
  urls_cambiadas int not null default 0,
  urls jsonb not null default '[]'::jsonb,
  estado_http int,
  respuesta text,
  ok boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index indexnow_envios_fecha on public.indexnow_envios (created_at desc);
create trigger set_updated_at before insert or update on public.indexnow_envios for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['indexnow_urls', 'indexnow_envios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_escritura', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Tablas compartidas: a la lista blanca de la auditoría.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('indexnow_urls')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_aprendido'), $a$, $b$('wa_aprendido'), ('indexnow_urls'), ('indexnow_envios'), $b$);
    if position($a$('indexnow_urls')$a$ in v_def) = 0 then raise exception 'auditoria_frontera cambió: no se pudo agregar IndexNow.'; end if;
    execute v_def;
  end if;
end $$;
