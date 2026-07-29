-- Punto 1 de Fase 4 (check-in/check-out): correas, platos y cobijas
-- perdidas son de las quejas más comunes del giro. Una lista solo sirve
-- si se revisa a la salida, no solo se anota a la entrada — por eso cada
-- pertenencia es su propia fila con un booleano `devuelto`, no un texto
-- suelto en la estancia: así el check-out puede confirmar una por una y
-- queda quién la entregó y cuándo.
create table public.estancia_pertenencias (
  id uuid primary key default gen_random_uuid(),
  estancia_id uuid not null references public.estancias(id),
  descripcion text not null,
  devuelto boolean not null default false,
  devuelto_at timestamptz,
  devuelto_por uuid references auth.users(id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (btrim(descripcion) <> '')
);

create trigger set_updated_at before insert or update on public.estancia_pertenencias
  for each row execute function public.set_updated_at();

create index estancia_pertenencias_estancia_id_idx on public.estancia_pertenencias (estancia_id);

alter table public.estancia_pertenencias enable row level security;

create policy estancia_pertenencias_select_staff on public.estancia_pertenencias
  for select to authenticated
  using (public.is_staff());

create policy estancia_pertenencias_select_propio on public.estancia_pertenencias
  for select to authenticated
  using (
    estancia_id in (
      select e.id from public.estancias e
      join public.perros p on p.id = e.perro_id
      where p.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

create policy estancia_pertenencias_insert_staff on public.estancia_pertenencias
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy estancia_pertenencias_update_staff on public.estancia_pertenencias
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));

-- devuelto_at/devuelto_por nunca los manda el cliente: se llenan solos al
-- marcar devuelto=true, se limpian si se desmarca por error.
create or replace function public.marcar_pertenencia_devuelta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.devuelto and not old.devuelto then
    new.devuelto_at := now();
    new.devuelto_por := auth.uid();
  elsif not new.devuelto and old.devuelto then
    new.devuelto_at := null;
    new.devuelto_por := null;
  end if;
  return new;
end;
$$;

create trigger marcar_pertenencia_devuelta
before update on public.estancia_pertenencias
for each row execute function public.marcar_pertenencia_devuelta();
