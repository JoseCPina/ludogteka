-- Alergias: hoy solo las escribe staff (acuerdo Q1: el dueño NO edita
-- alergias). `confirmada` y `reportado_por` se agregan ahora aunque la
-- función de "el dueño reporta una alergia para que recepción la
-- confirme" no se construye todavía — dejarlas previstas evita una
-- migración futura solo para agregar dos columnas. Fila de staff: confirmada
-- = true, reportado_por = null (default). Una fila reportada por el dueño
-- (a futuro) usaría confirmada = false y reportado_por = auth.uid().
create table public.perro_alergias (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  alergeno text not null,
  gravedad text check (gravedad in ('leve', 'moderada', 'grave')),
  notas text,
  confirmada boolean not null default true,
  reportado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.perro_alergias
  for each row execute function public.set_updated_at();

create index perro_alergias_perro_id_idx on public.perro_alergias (perro_id);

alter table public.perro_alergias enable row level security;

create policy perro_alergias_select_staff on public.perro_alergias
  for select to authenticated
  using (public.is_staff());

create policy perro_alergias_select_propio on public.perro_alergias
  for select to authenticated
  using (
    exists (
      select 1 from public.perros p
      where p.id = perro_alergias.perro_id
        and (
          p.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
          or exists (
            select 1 from public.perro_accesos_compartidos pac
            where pac.perro_id = p.id
              and pac.deleted_at is null
              and pac.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
          )
        )
    )
  );

-- Acuerdo Q2: alergias las escriben los tres roles de staff.
create policy perro_alergias_insert_staff on public.perro_alergias
  for insert to authenticated
  with check (public.is_staff());

create policy perro_alergias_update_staff on public.perro_alergias
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());
