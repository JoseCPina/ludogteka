-- Caso incómodo #2 (perro que cambia de dueño): auditoría append-only, mismo
-- patrón que vinculacion_eventos. No hay política de UPDATE/DELETE — solo
-- INSERT (vía el trigger, que corre como su dueño y no pasa por RLS) y
-- SELECT para staff.
create table public.perro_historial_dueno (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  cliente_anterior_id uuid references public.clientes(id),
  cliente_nuevo_id uuid not null references public.clientes(id),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index perro_historial_dueno_perro_id_idx on public.perro_historial_dueno (perro_id);

alter table public.perro_historial_dueno enable row level security;

create policy perro_historial_dueno_select_staff on public.perro_historial_dueno
  for select to authenticated
  using (public.is_staff());

create or replace function public.registrar_cambio_dueno_perro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.cliente_id is distinct from new.cliente_id then
    insert into public.perro_historial_dueno (perro_id, cliente_anterior_id, cliente_nuevo_id, created_by)
    values (new.id, old.cliente_id, new.cliente_id, auth.uid());
  end if;
  return new;
end;
$$;

create trigger registrar_cambio_dueno
after update on public.perros
for each row execute function public.registrar_cambio_dueno_perro();
