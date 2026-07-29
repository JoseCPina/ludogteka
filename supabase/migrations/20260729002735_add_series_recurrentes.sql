-- La REGLA de una recurrencia ("este perro viene todos los martes y
-- jueves"), no las fechas concretas. generar_estancias_serie() (migración
-- siguiente) materializa estancias reales dentro de un horizonte acotado
-- — nunca se generan filas para años a futuro de una sola vez.
--
-- dias_semana usa el mismo criterio que extract(isodow from fecha):
-- 1 = lunes … 7 = domingo.
create table public.series_recurrentes (
  id uuid primary key default gen_random_uuid(),
  perro_id uuid not null references public.perros(id),
  servicio_id uuid not null references public.servicios(id),
  dias_semana int[] not null,
  fecha_inicio date not null,
  fecha_fin date,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (array_length(dias_semana, 1) > 0),
  check (dias_semana <@ array[1, 2, 3, 4, 5, 6, 7]),
  check (fecha_fin is null or fecha_fin >= fecha_inicio)
);

create trigger set_updated_at before insert or update on public.series_recurrentes
  for each row execute function public.set_updated_at();

create index series_recurrentes_perro_id_idx on public.series_recurrentes (perro_id);

alter table public.series_recurrentes enable row level security;

create policy series_recurrentes_select_staff on public.series_recurrentes
  for select to authenticated
  using (public.is_staff());

create policy series_recurrentes_insert_staff on public.series_recurrentes
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy series_recurrentes_update_staff on public.series_recurrentes
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));

-- Cada estancia generada por una serie queda ligada a ella (trazabilidad,
-- útil para "renovar serie" más adelante), pero es una fila completamente
-- independiente: cancelar un martes suelto no toca la serie ni las demás
-- fechas ya generadas.
alter table public.estancias
  add column serie_id uuid references public.series_recurrentes(id);

create index estancias_serie_id_idx on public.estancias (serie_id);
