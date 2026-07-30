-- Bloque C: vocabulario controlado de motivos de descuento, mismo
-- criterio que catalogo_alertas (Fase 2) — un selector, no texto libre,
-- para que reportes futuros (Fase 8) puedan agrupar "cuánto se descontó
-- por temporada" sin depender de que todos escribieran la misma frase.
create table public.catalogo_descuentos (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  etiqueta text not null,
  orden int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.catalogo_descuentos
  for each row execute function public.set_updated_at();

alter table public.catalogo_descuentos enable row level security;

create policy catalogo_descuentos_select_autenticados on public.catalogo_descuentos
  for select to authenticated
  using (true);

create policy catalogo_descuentos_insert_admin on public.catalogo_descuentos
  for insert to authenticated
  with check (public.is_admin());

create policy catalogo_descuentos_update_admin on public.catalogo_descuentos
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.catalogo_descuentos (clave, etiqueta, orden, updated_at) values
  ('segundo_perro', 'Segundo perro de la misma familia', 1, now()),
  ('cliente_frecuente', 'Cliente frecuente', 2, now()),
  ('temporada', 'Promoción de temporada', 3, now()),
  ('referido', 'Referido por otro cliente', 4, now()),
  ('cortesia_incidente', 'Cortesía por incidente', 5, now());
