-- Citas de estética: recurso distinto al de estancias (tiempo de un
-- empleado, no espacio físico de la casa), por eso vive en su propia
-- tabla en vez de forzarla dentro de estancias.
--
-- fin es nullable a nivel de columna pero el trigger (migración
-- siguiente) SIEMPRE lo llena — a partir de servicios.duracion_minutos si
-- no viene dado, o respeta el valor si se manda explícito (una cita real
-- puede durar más o menos que el catálogo). check (fin > inicio) por eso
-- solo tiene sentido después del trigger, nunca antes.
--
-- estancia_id (adición 3, Fase 4): cuando una cita ocurre DURANTE una
-- estancia ya en curso (el ejemplo típico: perro de 5 días de hotel que
-- se baña antes de irse), se liga aquí para que Fase 5 cobre todo junto.
-- A propósito esta tabla NO tiene hora_entrada_real/hora_salida_real como
-- estancias: el "quién está adentro" (calendario de ocupación, Fase 4
-- más adelante) se calcula ÚNICAMENTE de estancias.estado. Una cita
-- ligada a una estancia nunca debe interpretarse como una entrada o
-- salida — el perro ya estaba adentro antes de la cita y sigue adentro
-- después. Si algún día se construye una consulta de ocupación que una
-- citas_estetica a esa cuenta, ese es el bug que esta nota previene.
create table public.citas_estetica (
  id uuid primary key default gen_random_uuid(),
  reserva_id uuid not null references public.reservas(id),
  perro_id uuid not null references public.perros(id),
  servicio_id uuid not null references public.servicios(id),
  empleado_id uuid not null references auth.users(id),
  estancia_id uuid references public.estancias(id),

  inicio timestamptz not null,
  fin timestamptz not null,
  rango tstzrange generated always as (tstzrange(inicio, fin)) stored,

  tamano_id uuid references public.tamanos_categoria(id),
  pelaje_id uuid references public.tipos_pelaje(id),
  precio numeric(10, 2) not null,

  estado text not null default 'reservada'
    check (estado in ('reservada', 'confirmada', 'en_curso', 'finalizada', 'cancelada', 'no_llego')),

  -- Punto 3 (horario de operación): fuera de horario AVISA, no bloquea —
  -- a veces se atiende a alguien fuera de horario a propósito. El trigger
  -- calcula esta columna; la pantalla la lee para mostrar el aviso, sin
  -- tener que repetir la comparación contra hora_cierre.
  fuera_de_horario boolean not null default false,

  bloqueo_sanitario_superado boolean not null default false,
  motivo_excepcion_sanitaria text,
  autorizado_por uuid references auth.users(id) on delete set null,

  notas text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (fin > inicio),
  check (not bloqueo_sanitario_superado or motivo_excepcion_sanitaria is not null)
);

create trigger set_updated_at before insert or update on public.citas_estetica
  for each row execute function public.set_updated_at();

create index citas_estetica_perro_id_idx on public.citas_estetica (perro_id);
create index citas_estetica_empleado_id_idx on public.citas_estetica (empleado_id);
create index citas_estetica_estancia_id_idx on public.citas_estetica (estancia_id);
create index citas_estetica_rango_idx on public.citas_estetica using gist (rango);

-- Un mismo empleado no puede tener dos citas encimadas. Acotado a
-- estados activos: una cita cancelada o no-llegó no debe seguir
-- bloqueando ese horario para siempre.
alter table public.citas_estetica
  add constraint citas_estetica_empleado_sin_traslape
  exclude using gist (
    empleado_id with =,
    rango with &&
  )
  where (deleted_at is null and estado not in ('cancelada', 'no_llego'));

alter table public.citas_estetica enable row level security;

create policy citas_estetica_select_staff on public.citas_estetica
  for select to authenticated
  using (public.is_staff());

create policy citas_estetica_select_propio on public.citas_estetica
  for select to authenticated
  using (
    perro_id in (
      select id from public.perros
      where cliente_id = (select cliente_id from public.profiles where id = auth.uid())
    )
  );

-- Agendan admin/recepción para cualquier empleado; estética solo agenda
-- y mueve SU propia agenda (with check obliga a que empleado_id siga
-- siendo ella misma después del update también, no solo antes).
create policy citas_estetica_insert_staff on public.citas_estetica
  for insert to authenticated
  with check (
    public.current_rol() in ('admin', 'recepcion')
    or (public.current_rol() = 'estetica' and empleado_id = auth.uid())
  );

create policy citas_estetica_update_staff on public.citas_estetica
  for update to authenticated
  using (
    public.current_rol() in ('admin', 'recepcion')
    or (public.current_rol() = 'estetica' and empleado_id = auth.uid())
  )
  with check (
    public.current_rol() in ('admin', 'recepcion')
    or (public.current_rol() = 'estetica' and empleado_id = auth.uid())
  );
