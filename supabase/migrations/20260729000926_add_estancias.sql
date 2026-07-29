-- Guardería y hotel comparten esta tabla: ambos son "el perro ocupa
-- espacio en la casa durante un rango de fechas", compiten por el MISMO
-- cupo físico (adición 1) y la MISMA lógica de traslape/capacidad —
-- separarlos hubiera duplicado esa lógica dos veces. Estética es un
-- recurso distinto (tiempo de un empleado, no espacio físico) y vive
-- aparte en citas_estetica (migración posterior).
--
-- Guardería es un caso especial de hotel: un rango de exactamente un día
-- (fecha_salida = fecha_entrada + 1). daterange() con sus límites por
-- default (inicio incluido, fin excluido) ya representa la convención
-- hotelera real sin lógica especial: entrada lunes, salida miércoles =
-- ocupa lunes y martes, miércoles libre para el siguiente huésped.
--
-- tamano_id y precio_unitario son SNAPSHOTS, llenados por un trigger
-- (validar_estancia, migración siguiente) a partir del tamaño actual del
-- perro y de resolver_precio() — nunca una referencia viva a perros ni a
-- tarifas.
create table public.estancias (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas(id),
  perro_id uuid not null references public.perros(id),
  servicio_id uuid not null references public.servicios(id),

  fecha_entrada date not null,
  fecha_salida date not null,
  rango daterange generated always as (daterange(fecha_entrada, fecha_salida)) stored,

  tamano_id uuid references public.tamanos_categoria(id),
  precio_unitario numeric(10, 2) not null,

  estado text not null default 'reservada'
    check (estado in ('reservada', 'confirmada', 'en_curso', 'finalizada', 'cancelada', 'no_llego')),

  -- Check-in / check-out (punto 7 del plan).
  hora_entrada_real timestamptz,
  hora_salida_real timestamptz,
  pertenencias text,
  estado_llegada text,
  foto_llegada_path text,

  -- Excepción al bloqueo sanitario (punto 4): solo admin puede
  -- autorizarla, y solo con motivo. El trigger valida ambas cosas y llena
  -- autorizado_por — no confía en lo que mande el cliente.
  bloqueo_sanitario_superado boolean not null default false,
  motivo_excepcion_sanitaria text,
  autorizado_por uuid references auth.users(id) on delete set null,

  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,

  check (fecha_salida > fecha_entrada),
  check (not bloqueo_sanitario_superado or motivo_excepcion_sanitaria is not null)
);

create trigger set_updated_at before insert or update on public.estancias
  for each row execute function public.set_updated_at();

create index estancias_perro_id_idx on public.estancias (perro_id);
create index estancias_reserva_id_idx on public.estancias (reserva_id);
create index estancias_rango_idx on public.estancias using gist (rango);

-- Adición 2: un mismo perro no puede tener dos estancias activas con
-- fechas traslapadas, sin importar si ambas son guardería, ambas hotel, o
-- una de cada una. btree_gist ya está habilitado desde Fase 3. Acotado a
-- estados que de verdad ocupan espacio: una estancia cancelada o
-- no-llegó no debe seguir bloqueando ese rango para siempre.
alter table public.estancias
  add constraint estancias_perro_sin_traslape
  exclude using gist (
    perro_id with =,
    rango with &&
  )
  where (deleted_at is null and estado not in ('cancelada', 'no_llego'));

alter table public.estancias enable row level security;

create policy estancias_select_staff on public.estancias
  for select to authenticated
  using (public.is_staff());

create policy estancias_select_propio on public.estancias
  for select to authenticated
  using (
    perro_id in (
      select id from public.perros
      where cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Alta y edición (incluye check-in/check-out y cambios de estado) es
-- trabajo de recepción, igual que perros/clientes. Estética no reserva
-- guardería/hotel.
create policy estancias_insert_staff on public.estancias
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy estancias_update_staff on public.estancias
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));
