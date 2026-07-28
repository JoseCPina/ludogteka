-- Catálogo de tamaños de perro. Vive en su propia tabla (no un enum nativo)
-- porque los catálogos se ajustan con INSERT, no con una migración de tipo.
create table public.tamanos_categoria (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  etiqueta text not null,
  orden int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.tamanos_categoria
  for each row execute function public.set_updated_at();

alter table public.tamanos_categoria enable row level security;

-- Catálogo de lectura abierta a cualquier usuario autenticado (staff y clientes
-- lo necesitan para mostrar/filtrar); escritura solo admin.
create policy tamanos_categoria_select_autenticados on public.tamanos_categoria
  for select to authenticated
  using (true);

create policy tamanos_categoria_insert_admin on public.tamanos_categoria
  for insert to authenticated
  with check (public.is_admin());

create policy tamanos_categoria_update_admin on public.tamanos_categoria
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.tamanos_categoria (clave, etiqueta, orden, updated_at) values
  ('chico', 'Chico', 1, now()),
  ('mediano', 'Mediano', 2, now()),
  ('grande', 'Grande', 3, now()),
  ('gigante', 'Gigante', 4, now());
