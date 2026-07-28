-- Vocabulario controlado para alertas de manejo, en vez de un campo de
-- texto libre en temperamento_notas: así una alerta como "muerde" se puede
-- destacar en la UI de recepción de forma imposible de pasar por alto
-- (badge/banner), no quedar enterrada en un párrafo.
create table public.catalogo_alertas (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  etiqueta text not null,
  orden int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.catalogo_alertas
  for each row execute function public.set_updated_at();

alter table public.catalogo_alertas enable row level security;

create policy catalogo_alertas_select_autenticados on public.catalogo_alertas
  for select to authenticated
  using (true);

create policy catalogo_alertas_insert_admin on public.catalogo_alertas
  for insert to authenticated
  with check (public.is_admin());

create policy catalogo_alertas_update_admin on public.catalogo_alertas
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.catalogo_alertas (clave, etiqueta, orden, updated_at) values
  ('muerde', 'Muerde', 1, now()),
  ('se_escapa', 'Se escapa', 2, now()),
  ('no_socializa', 'No socializa', 3, now()),
  ('agresivo_comida', 'Agresivo con la comida', 4, now()),
  ('alergia_grave', 'Alergia grave', 5, now()),
  ('ansiedad_separacion', 'Ansiedad de separación', 6, now());

-- Alertas de un perro. `activa` reemplaza a deleted_at aquí a propósito:
-- una alerta resuelta (perro que ya no muerde tras entrenamiento) sigue
-- siendo parte del historial que recepción puede revisar, no se borra.
-- Solo staff la ve — es información de manejo de riesgo, no algo que se
-- le muestre al dueño en el portal.
create table public.perro_alertas (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  alerta_id uuid not null references public.catalogo_alertas(id),
  notas text,
  activa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.perro_alertas
  for each row execute function public.set_updated_at();

create index perro_alertas_perro_id_idx on public.perro_alertas (perro_id);

alter table public.perro_alertas enable row level security;

create policy perro_alertas_select_staff on public.perro_alertas
  for select to authenticated
  using (public.is_staff());

-- Acuerdo Q2: alertas las escriben los tres roles de staff.
create policy perro_alertas_insert_staff on public.perro_alertas
  for insert to authenticated
  with check (public.is_staff());

create policy perro_alertas_update_staff on public.perro_alertas
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());
