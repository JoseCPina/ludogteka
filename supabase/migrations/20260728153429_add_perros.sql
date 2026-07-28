-- Perros: expediente base. Los campos clínicos/de seguridad (vacunas, peso,
-- alergias, medicamentos, alertas) viven en tablas aparte (siguen esta
-- migración); aquí solo van los datos "de identidad" del perro más los
-- pocos campos que el propio dueño puede editar.
--
-- El dueño edita contacto de emergencia, veterinario, autorización médica y
-- notas de alimentación, pero esas columnas conviven en la misma fila que
-- nombre/tamaño/pelaje/fallecido, que son de solo-staff. Igual que con
-- profiles.rol, no se puede resolver eso con una sola política RLS de
-- UPDATE sin exponer una columna sensible a través de otra permitida. En
-- vez de una política de UPDATE para el dueño + un trigger de protección de
-- columnas, se usa el mismo patrón que actualizar_mi_cliente: una función
-- SECURITY DEFINER (actualizar_mi_perro, migración aparte) que solo toca
-- las columnas acordadas. El dueño no tiene política de UPDATE directa
-- sobre esta tabla.
create table public.perros (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes(id),
  nombre text not null,
  raza text,
  fecha_nacimiento date,
  sexo text check (sexo in ('macho', 'hembra')),
  esterilizado boolean,
  tamano_id uuid references public.tamanos_categoria(id),
  pelaje_id uuid references public.tipos_pelaje(id),
  foto_path text,

  temperamento_notas text,
  alimentacion_notas text,

  contacto_emergencia_nombre text,
  contacto_emergencia_telefono text,
  veterinario_nombre text,
  veterinario_telefono text,
  veterinario_clinica text,
  autorizacion_medica_notas text,
  tope_gasto_autorizado numeric(10, 2),

  -- Caso incómodo #1 (perro que fallece): no reutilizamos deleted_at, que
  -- significa "sacado del sistema" (p. ej. error de captura). fallecido es
  -- el estado de vida del perro: sigue siendo parte del historial del
  -- cliente, la UI solo lo debe mostrar con tacto (badge, no ocultarlo).
  fallecido boolean not null default false,
  fecha_fallecimiento date,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null
);

create trigger set_updated_at before insert or update on public.perros
  for each row execute function public.set_updated_at();

create index perros_cliente_id_idx on public.perros (cliente_id);

alter table public.perros enable row level security;

-- Staff (admin/recepción/estética) lee todo, sin excepción: todos necesitan
-- ver alertas y datos médicos en el mostrador.
create policy perros_select_staff on public.perros
  for select to authenticated
  using (public.is_staff());

-- El dueño ve sus propios perros. (Se amplía en una migración posterior
-- para cubrir acceso compartido — caso incómodo #3.)
create policy perros_select_propio on public.perros
  for select to authenticated
  using (
    cliente_id = (select cliente_id from public.profiles where id = auth.uid())
  );

-- Alta y edición completa del expediente (nombre, raza, tamaño, pelaje,
-- fallecido, etc.) es tarea de recepción al dar de alta/actualizar al
-- perro, igual que con clientes.
create policy perros_insert_staff on public.perros
  for insert to authenticated
  with check (public.current_rol() in ('admin', 'recepcion'));

create policy perros_update_staff on public.perros
  for update to authenticated
  using (public.current_rol() in ('admin', 'recepcion'))
  with check (public.current_rol() in ('admin', 'recepcion'));
