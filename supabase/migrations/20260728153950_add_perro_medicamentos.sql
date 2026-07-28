-- Régimen/prescripción del medicamento (dosis, horario, vigencia). El
-- registro de cada administración real (¿ya le tocó su pastilla de las 2pm
-- hoy?) queda para Fase 9 a propósito — por eso el id de esta tabla se
-- mantiene estable desde ahora, para que esa fase solo agregue una tabla
-- nueva que referencie perro_medicamentos.id, sin tener que tocar esta.
--
-- Quién escribe: el acuerdo (Q2) cubrió peso/alergias/alertas (los tres
-- roles) y contacto/veterinario/vacunas (solo admin/recepción), pero no
-- medicamentos explícitamente. Se trata como un dato clínico/prescrito, no
-- una observación ad-hoc, así que se agrupa con vacunas: solo admin y
-- recepción. Confirmar con el negocio si estética también debería poder
-- registrar uno.
create table public.perro_medicamentos (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  medicamento text not null,
  dosis text not null,
  horario text,
  fecha_inicio date not null,
  fecha_fin date,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.perro_medicamentos
  for each row execute function public.set_updated_at();

create index perro_medicamentos_perro_id_idx on public.perro_medicamentos (perro_id);

alter table public.perro_medicamentos enable row level security;

create policy perro_medicamentos_select_staff on public.perro_medicamentos
  for select to authenticated
  using (public.is_staff());

create policy perro_medicamentos_select_propio on public.perro_medicamentos
  for select to authenticated
  using (
    exists (
      select 1 from public.perros p
      where p.id = perro_medicamentos.perro_id
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

create policy perro_medicamentos_insert_staff on public.perro_medicamentos
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy perro_medicamentos_update_staff on public.perro_medicamentos
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));
