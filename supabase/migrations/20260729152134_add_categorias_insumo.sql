-- Distingue insumos de estética (shampoo, acondicionador, hojas) de los
-- generales (limpieza, alimento) — catálogo editable, no un enum fijo,
-- mismo criterio que tamanos_categoria/tipos_pelaje.
create table public.categorias_insumo (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  etiqueta text not null,
  orden int not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.categorias_insumo
  for each row execute function public.set_updated_at();

alter table public.categorias_insumo enable row level security;

create policy categorias_insumo_select_autenticados on public.categorias_insumo
  for select to authenticated
  using (true);

create policy categorias_insumo_insert_admin on public.categorias_insumo
  for insert to authenticated
  with check (public.is_admin());

create policy categorias_insumo_update_admin on public.categorias_insumo
  for update to authenticated
  using (public.is_admin());

insert into public.categorias_insumo (clave, etiqueta, orden) values
  ('estetica', 'Estética', 1),
  ('limpieza', 'Limpieza', 2),
  ('alimento', 'Alimento', 3),
  ('general', 'General', 4);
