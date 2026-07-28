-- Catálogo de tipos de pelaje. Fase 3 (estética) tarifica tanto por tamaño
-- como por pelaje, así que necesita vivir como catálogo propio desde ahora.
create table public.tipos_pelaje (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  etiqueta text not null,
  orden int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.tipos_pelaje
  for each row execute function public.set_updated_at();

alter table public.tipos_pelaje enable row level security;

create policy tipos_pelaje_select_autenticados on public.tipos_pelaje
  for select to authenticated
  using (true);

create policy tipos_pelaje_insert_admin on public.tipos_pelaje
  for insert to authenticated
  with check (public.is_admin());

create policy tipos_pelaje_update_admin on public.tipos_pelaje
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.tipos_pelaje (clave, etiqueta, orden, updated_at) values
  ('corto', 'Corto', 1, now()),
  ('medio', 'Medio', 2, now()),
  ('largo', 'Largo', 3, now()),
  ('rizado', 'Rizado', 4, now());
