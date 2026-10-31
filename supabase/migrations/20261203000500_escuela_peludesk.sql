-- Escuela PeluDesk (peludesk.mx/escuela, 31 de octubre de 2026): la serie educativa. Las seis sesiones viven en la
-- base con su fecha (la pone la plataforma en /plataforma/escuela), la liga de la sesión en vivo y la grabación; el
-- texto de cada guía vive en el código (src/lib/escuela/sesiones.ts). Las inscripciones llegan por el bot («Quiero
-- inscribirme a la Escuela PeluDesk: <sesión>») y el recordatorio sale una hora antes (/api/cron/escuela).
create table public.escuela_sesiones (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z0-9-]{3,60}$'),
  orden int not null default 0,
  fecha_at timestamptz,
  duracion_min int not null default 60 check (duracion_min between 15 and 240),
  url_en_vivo text,
  youtube_id text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{6,20}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.escuela_sesiones for each row execute function public.set_updated_at();
alter table public.escuela_sesiones enable row level security;
create policy escuela_sesiones_plataforma_select on public.escuela_sesiones for select to authenticated using ((select public.es_admin_plataforma()));
create policy escuela_sesiones_plataforma_update on public.escuela_sesiones for update to authenticated using ((select public.es_admin_plataforma())) with check ((select public.es_admin_plataforma()));
insert into public.escuela_sesiones (clave, orden) values
  ('cuanto-cobrar', 1), ('plantones-y-agenda-vacia', 2), ('cuanto-cuesta-abrir', 3), ('caja-sin-sorpresas', 4), ('clientes-que-vuelven', 5), ('lo-que-te-van-a-pedir', 6);

create table public.escuela_inscripciones (
  id uuid primary key default gen_random_uuid(),
  telefono_norm text not null check (telefono_norm ~ '^[0-9]{10}$'),
  sesion_clave text not null references public.escuela_sesiones(clave),
  prospecto_id uuid references public.prospectos(id) on delete set null,
  nombre text,
  recordatorio_enviado_at timestamptz,
  recordatorio_wa_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index escuela_inscripciones_unica on public.escuela_inscripciones (telefono_norm, sesion_clave) where deleted_at is null;
create index escuela_inscripciones_sesion on public.escuela_inscripciones (sesion_clave) where deleted_at is null;
create trigger set_updated_at before insert or update on public.escuela_inscripciones for each row execute function public.set_updated_at();
alter table public.escuela_inscripciones enable row level security;
create policy escuela_inscripciones_plataforma on public.escuela_inscripciones for select to authenticated using ((select public.es_admin_plataforma()));

-- Las sesiones con su fecha y cuántos inscritos: lo lee la página pública (servidor) y la plataforma.
create or replace function public.escuela_sesiones_publicas()
returns table (clave text, orden int, fecha_at timestamptz, duracion_min int, url_en_vivo text, youtube_id text, inscritos bigint)
language sql stable set search_path = '' as $$
  select s.clave, s.orden, s.fecha_at, s.duracion_min, s.url_en_vivo, s.youtube_id,
    (select count(*) from public.escuela_inscripciones i where i.sesion_clave = s.clave and i.deleted_at is null) as inscritos
  from public.escuela_sesiones s
  where s.deleted_at is null and (select coalesce(public.es_admin_plataforma(), false) or auth.role() = 'service_role')
  order by s.orden;
$$;
revoke execute on function public.escuela_sesiones_publicas() from public, anon;
grant execute on function public.escuela_sesiones_publicas() to authenticated, service_role;

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('escuela_sesiones')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('precios_mercado_candidatos'), $a$, $b$('precios_mercado_candidatos'), ('escuela_sesiones'), ('escuela_inscripciones'), $b$);
    if position($a$('escuela_sesiones')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar escuela_sesiones y escuela_inscripciones.';
    end if;
    execute v_def;
  end if;
end $$;
