-- Peso historizado (no un campo en perros): cada visita puede traer un
-- peso distinto y a futuro sirve para ver tendencia. tamaño sí vive en
-- perros porque es la categoría que fija tarifa (Fase 3), no un dato que
-- cambie visita a visita.
create table public.pesos_registrados (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  peso_kg numeric(5, 2) not null,
  fecha date not null default current_date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.pesos_registrados
  for each row execute function public.set_updated_at();

create index pesos_registrados_perro_id_fecha_idx on public.pesos_registrados (perro_id, fecha desc);

alter table public.pesos_registrados enable row level security;

create policy pesos_registrados_select_staff on public.pesos_registrados
  for select to authenticated
  using (public.is_staff());

create policy pesos_registrados_select_propio on public.pesos_registrados
  for select to authenticated
  using (
    exists (
      select 1 from public.perros p
      where p.id = pesos_registrados.perro_id
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

-- Acuerdo Q2: peso lo escriben los tres roles de staff (quien detecta el
-- cambio lo reporta), no solo admin/recepción.
create policy pesos_registrados_insert_staff on public.pesos_registrados
  for insert to authenticated
  with check (public.is_staff());

create policy pesos_registrados_update_staff on public.pesos_registrados
  for update to authenticated
  using (public.is_staff())
  with check (public.is_staff());

-- Último peso por perro. security_invoker = true para heredar el RLS de
-- quien consulta, igual que la vista de requisitos sanitarios.
create view public.perro_peso_actual
with (security_invoker = true)
as
select distinct on (perro_id)
  perro_id, peso_kg, fecha
from public.pesos_registrados
where deleted_at is null
order by perro_id, fecha desc, created_at desc;
