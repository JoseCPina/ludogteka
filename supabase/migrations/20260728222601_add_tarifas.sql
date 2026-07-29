-- Precio en el tiempo. Tabla de solo-inserción: subir una tarifa es un
-- INSERT con una nueva vigencia_desde, nunca un UPDATE al precio
-- existente. "El precio vigente" (hoy, o en cualquier fecha pasada o
-- futura) siempre se resuelve igual: la fila con vigencia_desde más
-- reciente que sea <= la fecha que importa, para ese
-- (servicio, tamano, pelaje, cantidad). Esa resolución vive en UNA sola
-- función (resolver_precio, migración siguiente) — Fase 4 y Fase 5 la
-- consumen, no la reinventan.
--
-- cantidad_desde/cantidad_hasta es el tramo de volumen (p. ej. noches de
-- hotel): "de 4 a 7 noches, tal precio por noche". El total de una
-- estancia de N noches es N × precio-del-tramo-donde-cae-N — el tramo
-- aplica a TODA la estancia, no de forma progresiva/escalonada. Servicios
-- que no manejan volumen (depende_cantidad = false) simplemente viven en
-- un solo tramo (1, sin tope).
--
-- Temporada alta (diciembre, Semana Santa) no necesita ninguna columna
-- nueva: es una fila con vigencia_desde al inicio de la temporada y
-- precio más alto, más OTRA fila con vigencia_desde al día siguiente de
-- que termina, de vuelta al precio normal. El riesgo real es operativo,
-- no de modelo: olvidar esa segunda fila deja cobrando precio de
-- diciembre todo el año — la futura pantalla de captura de temporada alta
-- debe pedir/sugerir esa fecha de regreso, no solo el aumento.
create table public.tarifas (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id),
  tamano_id uuid references public.tamanos_categoria(id),
  pelaje_id uuid references public.tipos_pelaje(id),
  cantidad_desde int not null default 1,
  cantidad_hasta int,
  vigencia_desde date not null,

  -- Nullable: null solo cuando no_aplica = true. >= 0 para permitir
  -- cortesías a precio cero sin necesitar un caso especial en el cobro.
  precio numeric(10, 2),
  no_aplica boolean not null default false,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,

  check (cantidad_desde >= 1),
  check (cantidad_hasta is null or cantidad_hasta >= cantidad_desde),
  check (
    (no_aplica and precio is null)
    or
    (not no_aplica and precio is not null and precio >= 0)
  )
);

create trigger set_updated_at before insert or update on public.tarifas
  for each row execute function public.set_updated_at();

create index tarifas_busqueda_idx
  on public.tarifas (servicio_id, tamano_id, pelaje_id, vigencia_desde desc);

-- Sin traslape de rangos de cantidad para la MISMA generación de precio
-- (mismo servicio/tamano/pelaje/vigencia_desde) — dos filas que ambas
-- cubran "5 noches" para la misma fecha de vigencia son una ambigüedad
-- real ("¿cuál de las dos aplica?"), no un dato raro que se pueda
-- ignorar. btree_gist deja combinar igualdad (servicio/tamano/pelaje/
-- vigencia) con traslape de rango (&&) en una sola restricción EXCLUDE.
--
-- coalesce(...) a un UUID centinela: por default, "=" nunca considera
-- iguales dos NULL (ni entre sí), así que sin este truco dos filas de un
-- servicio sin pelaje (tamano/pelaje null, p. ej. hotel) jamás
-- colisionarían entre sí para efectos de este constraint, aunque sus
-- rangos de cantidad se traslaparan — justo el caso que más nos importa
-- (hotel es el servicio con tramos de noches).
create extension if not exists btree_gist;

alter table public.tarifas
  add constraint tarifas_sin_traslape
  exclude using gist (
    servicio_id with =,
    coalesce(tamano_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(pelaje_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    vigencia_desde with =,
    int4range(cantidad_desde, coalesce(cantidad_hasta, 2147483647), '[]') with &&
  )
  where (deleted_at is null);

alter table public.tarifas enable row level security;

-- Mismo criterio que servicios: el cliente ve precios, solo admin escribe.
create policy tarifas_select_autenticados on public.tarifas
  for select to authenticated
  using (true);

create policy tarifas_insert_admin on public.tarifas
  for insert to authenticated
  with check (public.is_admin());

-- UPDATE existe solo como vía de corrección de un error de captura obvio
-- (typo del mismo día) — el camino normal para "cambiar un precio" es un
-- INSERT nuevo, nunca tocar una fila ya vigente.
create policy tarifas_update_admin on public.tarifas
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());
