-- Detalle financiero de una entrada por compra: proveedor y costo. Tabla
-- aparte de movimientos_inventario (1 a 1 vía movimiento_id) a propósito
-- — es la mitad "admin ve costos y captura compras" de la regla de
-- Bloque B; recepción/estética nunca la consultan (ni falta que hace,
-- ya ven la cantidad en movimientos_inventario).
create table public.compras_insumos (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null unique references public.movimientos_inventario(id),
  proveedor_id uuid not null references public.proveedores(id),
  cantidad_compra numeric(12, 2) not null check (cantidad_compra > 0),
  costo_unitario numeric(10, 2) not null check (costo_unitario >= 0),
  costo_total numeric(12, 2) generated always as (cantidad_compra * costo_unitario) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.compras_insumos
  for each row execute function public.set_updated_at();

alter table public.compras_insumos enable row level security;

-- Solo admin ve costos y captura compras (regla explícita de Bloque B).
-- Sin política de INSERT/UPDATE para authenticated: la única puerta de
-- entrada es registrar_entrada_compra() (migración siguiente).
create policy compras_insumos_select_admin on public.compras_insumos
  for select to authenticated
  using (public.is_admin());
