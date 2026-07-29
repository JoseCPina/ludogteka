-- Pausa temporal de una serie recurrente ("el cliente se va dos semanas
-- de vacaciones"): libera el cupo de ese rango sin cancelar la serie ni
-- tocar fecha_fin. Puede haber varias pausas en la vida de una serie
-- (dos vacaciones distintas), por eso es tabla aparte y no un par de
-- columnas en series_recurrentes.
create table public.series_pausas (
  id uuid primary key default gen_random_uuid(),
  serie_id uuid not null references public.series_recurrentes(id),
  desde date not null,
  hasta date not null,
  motivo text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (hasta >= desde)
);

create trigger set_updated_at before insert or update on public.series_pausas
  for each row execute function public.set_updated_at();

create index series_pausas_serie_id_idx on public.series_pausas (serie_id);

alter table public.series_pausas enable row level security;

create policy series_pausas_select_staff on public.series_pausas
  for select to authenticated
  using (public.is_staff());

create policy series_pausas_insert_staff on public.series_pausas
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy series_pausas_update_staff on public.series_pausas
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));
