-- Encabezado de una visita: agrupa una o más estancias/citas reservadas
-- juntas para el mismo cliente (adición 9 del plan — varios perros de la
-- misma familia). No lleva fechas ni estado propio: el ciclo de vida real
-- (reservada/confirmada/en_curso/...) vive en cada estancia/cita por
-- separado, porque cancelar un perro de la familia no debe tocar al otro.
-- Fase 5 va a colgar el cobro conjunto de toda la visita de este id.
create table public.reservas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.reservas
  for each row execute function public.set_updated_at();

create index reservas_cliente_id_idx on public.reservas (cliente_id);

alter table public.reservas enable row level security;

create policy reservas_select_staff on public.reservas
  for select to authenticated
  using (public.is_staff());

create policy reservas_select_propio on public.reservas
  for select to authenticated
  using (
    cliente_id = (select cliente_id from public.profiles where id = auth.uid())
  );

create policy reservas_insert_staff on public.reservas
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy reservas_update_staff on public.reservas
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));
