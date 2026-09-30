-- Aceptación de términos y aviso de privacidad al registrarse en peludesk.mx,
-- y de qué campaña llegó cada registro (30 de septiembre de 2026).
--
--   aceptaciones_legales  evidencia de que una persona aceptó una versión
--                         concreta de un documento (fecha, IP, navegador).
--                         Es de la PLATAFORMA (sin negocio_id: va en la
--                         lista de compartidas de auditoria_frontera). Solo
--                         la escribe el servidor (secret key) y solo la lee
--                         la administración de PeluDesk. Nunca se edita ni
--                         se borra.
--   registros_prueba      + el origen del registro (etiquetas utm, fbclid,
--                         de dónde venía) y las versiones aceptadas.

create table public.aceptaciones_legales (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid references auth.users(id) on delete set null,
  telefono text,
  documento text not null check (documento in ('terminos', 'aviso_privacidad')),
  version text not null check (length(version) between 1 and 40),
  aceptada_at timestamptz not null default now(),
  ip text,
  user_agent text,
  origen text not null default 'registro' check (origen in ('registro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.aceptaciones_legales
  for each row execute function public.set_updated_at();
create index aceptaciones_legales_persona on public.aceptaciones_legales (persona_id, documento, aceptada_at desc);

alter table public.aceptaciones_legales enable row level security;
create policy aceptaciones_legales_select_plataforma on public.aceptaciones_legales
  for select to authenticated using ((select public.es_admin_plataforma()));
create policy aceptaciones_legales_sin_escritura on public.aceptaciones_legales
  for insert to authenticated with check (false);
revoke all on public.aceptaciones_legales from anon;
grant select on public.aceptaciones_legales to authenticated;

alter table public.registros_prueba
  add column utm_source text,
  add column utm_medium text,
  add column utm_campaign text,
  add column utm_content text,
  add column fbclid text,
  add column referente text,
  add column terminos_version text,
  add column aviso_version text;

-- Los textos de origen los escribe el servidor recortados; el tope es para
-- que nadie meta un texto enorme por la puerta de atrás.
alter table public.registros_prueba
  add constraint registros_prueba_origen_corto check (
    coalesce(length(utm_source), 0) <= 100 and coalesce(length(utm_medium), 0) <= 100 and
    coalesce(length(utm_campaign), 0) <= 150 and coalesce(length(utm_content), 0) <= 150 and
    coalesce(length(fbclid), 0) <= 300 and coalesce(length(referente), 0) <= 200);

-- La tabla nueva es compartida: a la lista de la auditoría.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('aceptaciones_legales' in v_def) = 0 then
    v_def := replace(v_def, $a$('redes_ajustes'))$a$, $b$('redes_ajustes'), ('aceptaciones_legales'))$b$);
    if position('aceptaciones_legales' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar aceptaciones_legales.';
    end if;
    execute v_def;
  end if;
end $$;
