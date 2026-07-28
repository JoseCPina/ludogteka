-- Caso incómodo #3 (pareja separada, dos cuentas, un perro): en vez de
-- complicar el modelo clientes/profiles de una cuenta por cliente, se
-- resuelve con un acceso de lectura adicional. El dueño principal sigue
-- siendo perros.cliente_id (el que puede editar vía actualizar_mi_perro);
-- un acceso compartido solo da SELECT, nunca edición. Solo staff da de
-- alta un acceso compartido (evita que cualquiera se auto-conceda acceso a
-- un perro ajeno).
create table public.perro_accesos_compartidos (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  unique (perro_id, cliente_id)
);

create trigger set_updated_at before insert or update on public.perro_accesos_compartidos
  for each row execute function public.set_updated_at();

create index perro_accesos_compartidos_cliente_id_idx on public.perro_accesos_compartidos (cliente_id);

alter table public.perro_accesos_compartidos enable row level security;

create policy perro_accesos_compartidos_select_staff on public.perro_accesos_compartidos
  for select to authenticated
  using (public.is_staff());

-- El cliente con acceso compartido puede ver que existe su propio acceso
-- (para que el portal, por ejemplo, le explique por qué ve ese perro).
create policy perro_accesos_compartidos_select_propio on public.perro_accesos_compartidos
  for select to authenticated
  using (
    cliente_id = (select cliente_id from public.profiles where id = auth.uid())
  );

create policy perro_accesos_compartidos_insert_staff on public.perro_accesos_compartidos
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy perro_accesos_compartidos_update_staff on public.perro_accesos_compartidos
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));

-- Amplía la visibilidad de perros: dueño principal (ya cubierto) OR
-- alguien con acceso compartido activo. Postgres no tiene CREATE OR
-- REPLACE POLICY, así que se recrea.
drop policy perros_select_propio on public.perros;

create policy perros_select_propio on public.perros
  for select to authenticated
  using (
    cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    or exists (
      select 1
      from public.perro_accesos_compartidos pac
      where pac.perro_id = perros.id
        and pac.deleted_at is null
        and pac.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );
