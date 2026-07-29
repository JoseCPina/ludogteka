-- Catálogo unificado: guardería, hotel, estética, cargos adicionales
-- (recogida tardía, día extra, medicamento, comida especial) y bonos
-- prepagados viven en la MISMA tabla, distinguidos por `categoria`. Todos
-- comparten el mismo problema real (un precio que cambia en el tiempo, que
-- puede o no depender de tamaño/pelaje/cantidad) — separarlos en tablas
-- distintas duplicaría esa lógica tres veces con el riesgo de que las
-- copias diverjan. Mismo criterio que ya usamos al generalizar vacuna +
-- desparasitación en tipos_requisito_sanitario (Fase 2).
--
-- depende_tamano / depende_pelaje / depende_cantidad son los que deciden
-- la FORMA de la matriz de precios de cada servicio (cuántas filas de
-- `tarifas` necesita), no la categoría — así un futuro servicio de
-- estética que no dependa de pelaje, o un cargo que si dependa de tamaño,
-- no piden ni migración ni excepción especial.
create table public.servicios (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  categoria text not null check (categoria in ('guarderia', 'hotel', 'estetica', 'cargo', 'bono')),
  unidad text not null check (unidad in ('dia', 'noche', 'sesion', 'evento')),
  depende_tamano boolean not null default false,
  depende_pelaje boolean not null default false,
  depende_cantidad boolean not null default false,

  -- Solo tienen sentido cuando categoria = 'bono': a qué servicio da acceso
  -- prepagado, cuántas unidades incluye, y cuántos días dura la vigencia
  -- desde la compra (null = sin vencimiento). El check de abajo obliga a
  -- que vengan juntos con 'bono' y vacíos en cualquier otra categoría.
  servicio_incluido_id uuid references public.servicios(id),
  cantidad_incluida int,
  vigencia_dias int,

  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,

  check (
    (categoria = 'bono' and servicio_incluido_id is not null and cantidad_incluida is not null)
    or
    (categoria <> 'bono' and servicio_incluido_id is null and cantidad_incluida is null and vigencia_dias is null)
  )
);

create trigger set_updated_at before insert or update on public.servicios
  for each row execute function public.set_updated_at();

alter table public.servicios enable row level security;

-- El cliente sí ve precios (no es información financiera del negocio, es
-- lo que se le cobra) — select abierto a cualquier autenticado, igual que
-- los demás catálogos. Solo admin escribe.
create policy servicios_select_autenticados on public.servicios
  for select to authenticated
  using (true);

create policy servicios_insert_admin on public.servicios
  for insert to authenticated
  with check (public.is_admin());

create policy servicios_update_admin on public.servicios
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Baja lógica: un servicio que se deja de ofrecer (p. ej. deslanado) se
-- desactiva con deleted_at, nunca se borra — reservas y tickets viejos lo
-- referencian. Las pantallas de cobro/reserva (Fase 4/5) deben filtrar
-- `deleted_at is null` al armar el selector de servicios disponibles; el
-- histórico y la resolución de precio no lo filtran.
