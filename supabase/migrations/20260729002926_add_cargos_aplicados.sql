-- Cargos ad-hoc (recogida tardía, día extra, medicamento, comida
-- especial) sobre una estancia ya existente. Una estancia puede acumular
-- varios: recogida tardía y medicamento administrado no son excluyentes
-- entre sí, por eso es una tabla propia y no una columna más de
-- estancias.
--
-- precio se resuelve con resolver_precio() igual que el precio base de la
-- estancia, anclado a la fecha en que el cargo se aplica de verdad
-- (current_date), no a la fecha de entrada de la estancia — "recogida
-- tardía" ocurre el día que el dueño de verdad recoge al perro, que para
-- hotel puede ser distinto al día que se reservó.
create table public.cargos_aplicados (
  id uuid primary key default gen_random_uuid(),
  estancia_id uuid not null references public.estancias(id),
  servicio_id uuid not null references public.servicios(id),
  cantidad int not null default 1,
  tamano_id uuid references public.tamanos_categoria(id),
  precio numeric(10, 2) not null,
  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (cantidad >= 1)
);

create trigger set_updated_at before insert or update on public.cargos_aplicados
  for each row execute function public.set_updated_at();

create index cargos_aplicados_estancia_id_idx on public.cargos_aplicados (estancia_id);

alter table public.cargos_aplicados enable row level security;

create policy cargos_aplicados_select_staff on public.cargos_aplicados
  for select to authenticated
  using (public.is_staff());

create policy cargos_aplicados_select_propio on public.cargos_aplicados
  for select to authenticated
  using (
    estancia_id in (
      select e.id from public.estancias e
      join public.perros p on p.id = e.perro_id
      where p.cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

create policy cargos_aplicados_insert_staff on public.cargos_aplicados
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy cargos_aplicados_update_staff on public.cargos_aplicados
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));

-- Misma lección que el fix de estancias: nada impedía usar aquí un
-- servicio que no fuera de categoría 'cargo'. Se aplica de una vez, en
-- vez de esperar a encontrarlo probando.
create or replace function public.validar_cargo_aplicado()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_categoria text;
  v_depende_tamano boolean;
  v_perro_id uuid;
  v_precio numeric;
  v_estado_precio text;
  v_debe_resolver boolean;
begin
  select categoria, depende_tamano into v_categoria, v_depende_tamano
  from public.servicios where id = new.servicio_id;

  if v_categoria <> 'cargo' then
    raise exception 'Este servicio no es un cargo; no se puede usar en un cargo aplicado.';
  end if;

  v_debe_resolver := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.estancia_id is distinct from old.estancia_id
    or new.cantidad is distinct from old.cantidad;

  if v_debe_resolver then
    select perro_id into v_perro_id from public.estancias where id = new.estancia_id;

    if v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = v_perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene tamaño registrado. Complétalo en su expediente antes de aplicar el cargo.';
      end if;
    else
      new.tamano_id := null;
    end if;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(new.servicio_id, new.tamano_id, null, new.cantidad, current_date);

    if v_estado_precio = 'sin_tarifa' then
      raise exception 'No hay tarifa capturada para este cargo. Captúrala antes de aplicarlo.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este cargo no aplica para el tamaño de este perro.';
    end if;

    new.precio := v_precio;
  end if;

  return new;
end;
$$;

create trigger validar_cargo_aplicado
before insert or update on public.cargos_aplicados
for each row execute function public.validar_cargo_aplicado();
