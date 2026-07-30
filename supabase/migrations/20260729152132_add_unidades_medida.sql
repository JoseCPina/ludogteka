-- Fase 7 Bloque A: si esto no se modela bien desde el inicio, las
-- existencias van a mentir siempre (se compra un galón, se consume en
-- mililitros). equivalencia_en_base es cuántas unidades BASE de su
-- magnitud equivale una unidad de esta fila — todo movimiento de
-- inventario (Bloque B) se guarda internamente en la unidad base de su
-- magnitud, y las unidades de compra/consumo de cada insumo son solo
-- para captura y despliegue. Base fija por convención: mililitro para
-- volumen, gramo para peso, pieza para pieza.
create table public.unidades_medida (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  etiqueta text not null,
  magnitud text not null check (magnitud in ('volumen', 'peso', 'pieza')),
  equivalencia_en_base numeric(12, 4) not null check (equivalencia_en_base > 0),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.unidades_medida
  for each row execute function public.set_updated_at();

alter table public.unidades_medida enable row level security;

-- Catálogo de referencia: lectura abierta a cualquier autenticado
-- (staff necesita mostrar/convertir unidades), escritura solo admin.
create policy unidades_medida_select_autenticados on public.unidades_medida
  for select to authenticated
  using (true);

create policy unidades_medida_insert_admin on public.unidades_medida
  for insert to authenticated
  with check (public.is_admin());

create policy unidades_medida_update_admin on public.unidades_medida
  for update to authenticated
  using (public.is_admin());

-- Galón asumido como galón líquido estadounidense (3785.41 ml) — es el
-- uso común en insumos de limpieza/estética en México, pero no
-- confirmado con el negocio; ajustar aquí si se refieren a otra medida.
insert into public.unidades_medida (clave, etiqueta, magnitud, equivalencia_en_base) values
  ('ml', 'Mililitro', 'volumen', 1),
  ('l', 'Litro', 'volumen', 1000),
  ('galon', 'Galón', 'volumen', 3785.41),
  ('g', 'Gramo', 'peso', 1),
  ('kg', 'Kilogramo', 'peso', 1000),
  ('pieza', 'Pieza', 'pieza', 1);
