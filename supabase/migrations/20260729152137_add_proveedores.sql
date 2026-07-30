create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  contacto_nombre text,
  telefono text,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.proveedores
  for each row execute function public.set_updated_at();

alter table public.proveedores enable row level security;

-- No es dato financiero (a diferencia de costos/compras, Bloque B) —
-- cualquier staff lo lee para saber a quién contactar; solo admin lo
-- edita, mismo criterio que unidades_medida/categorias_insumo.
create policy proveedores_select_staff on public.proveedores
  for select to authenticated
  using (public.is_staff());

create policy proveedores_insert_admin on public.proveedores
  for insert to authenticated
  with check (public.is_admin());

create policy proveedores_update_admin on public.proveedores
  for update to authenticated
  using (public.is_admin());
