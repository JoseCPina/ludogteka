-- PeluDesk, paso 1 de la conversión a multi-negocio (25 de septiembre de 2026).
--
-- Una sola base para todos los negocios caninos; Ludogteka es el negocio
-- #1 (10000000-0000-4000-8000-000000000001) y se queda con TODOS los datos existentes.
--
-- EL NEGOCIO DE UNA PETICIÓN: el servidor lo resuelve por el dominio y lo
-- manda en el encabezado `x-negocio-id`; `negocio_actual()` lo lee. Quien
-- llama puede poner otro encabezado a mano, y no le sirve de nada: lo que
-- ve se decide por su MEMBRESÍA en ese negocio (rol, cliente), no por el
-- encabezado. Sin encabezado, negocio_actual() es NULL y no se ve nada.
--
-- LAS DOS REDES:
--  1. Cada tabla de negocio tiene `negocio_id` y una política RESTRICTIVA
--     para `authenticated`: solo filas de negocio_actual() y solo si quien
--     llama es miembro de ese negocio. Se suma (AND) a las que ya había.
--  2. Las funciones SECURITY DEFINER dejan de correr como `postgres` (que
--     salta la RLS) y pasan a ser del rol `peludesk_definer`, SIN ese
--     privilegio, con una política que le deja ver y escribir SOLO filas de
--     negocio_actual(). Así una función que se olvide de filtrar por
--     negocio no puede alcanzar otro: la base lo filtra por ella. Solo un
--     puñado de funciones de identidad y contexto se quedan como `postgres`
--     (auditadas una por una en el paso 2).

-- ── 0. El rol dueño de las funciones definer ────────────────────────

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'peludesk_definer') then
    create role peludesk_definer nologin nobypassrls;
  end if;
end
$$;
grant peludesk_definer to postgres;
-- Para poder llamar auth.uid()/auth.role() (uso del esquema auth). anon no
-- tiene políticas permisivas en tablas de negocio: no le abre nada.
grant anon to peludesk_definer;
grant usage, create on schema public to peludesk_definer;

-- ── 1. Contexto: el negocio de la petición ──────────────────────────

create or replace function public.negocio_actual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid
  end
  from (
    select coalesce(
      nullif(current_setting('app.negocio_id', true), ''),
      nullif(current_setting('request.headers', true), '')::json ->> 'x-negocio-id'
    ) as x
  ) s;
$$;
comment on function public.negocio_actual() is
  'El negocio de la petición (encabezado x-negocio-id que pone el servidor, o app.negocio_id). NULL = ninguno: no se ve nada.';

-- ── 2. Negocios ─────────────────────────────────────────────────────

create table public.negocios (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$'),
  nombre text not null check (btrim(nombre) <> ''),
  -- Dominio propio, sin www y en minúsculas (ludogteka.mx). Sin dominio
  -- propio, el negocio vive en <slug>.peludesk.com.
  dominio text unique check (dominio is null or dominio ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  zona_horaria text not null default 'America/Mexico_City',
  ciudad text,
  -- Marca: nombre corto, logo, colores, eslogan. Lo usan la app y la landing.
  marca jsonb not null default '{}'::jsonb,
  -- Contenido de la página pública (servicios, precios de escaparate,
  -- horarios, zonas, fotos, mensajes de WhatsApp). NULL = landing genérica.
  landing jsonb,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.negocios
  for each row execute function public.set_updated_at();

-- La zona horaria tiene que existir (un nombre mal escrito rompería toda
-- fecha del negocio en silencio).
create or replace function public.validar_negocio()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.zona_horaria;
  new.dominio := nullif(lower(btrim(coalesce(new.dominio, ''))), '');
  new.slug := lower(btrim(new.slug));
  if tg_op = 'UPDATE'
     and (new.slug is distinct from old.slug or new.dominio is distinct from old.dominio or new.activo is distinct from old.activo)
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'El slug, el dominio y el estado de un negocio solo los cambia la plataforma.';
  end if;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'La zona horaria «%» no existe.', new.zona_horaria;
end;
$$;
create trigger validar_negocio before insert or update on public.negocios
  for each row execute function public.validar_negocio();

insert into public.negocios (id, slug, nombre, dominio, zona_horaria, ciudad, marca)
values ('10000000-0000-4000-8000-000000000001', 'ludogteka', 'Ludogteka', 'ludogteka.mx', 'America/Mexico_City', 'San Luis Potosí',
  jsonb_build_object('nombre_corto', 'Ludogteka'));

-- ── 3. Membresías: la persona y su papel en cada negocio ────────────
-- profiles es la PERSONA (una por cuenta de Auth). Su rol y su expediente
-- de cliente viven en la membresía de cada negocio: el mismo dueño puede
-- ser cliente de dos guarderías y la misma estilista trabajar en dos.

create table public.membresias (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  rol text not null check (rol in ('admin', 'recepcion', 'estetica', 'cliente')),
  cliente_id uuid references public.clientes(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (rol = 'cliente' or cliente_id is null)
);
create trigger set_updated_at before insert or update on public.membresias
  for each row execute function public.set_updated_at();
create unique index membresias_una_por_negocio on public.membresias (negocio_id, profile_id) where deleted_at is null;
create unique index membresias_cliente_una_cuenta on public.membresias (cliente_id) where cliente_id is not null and deleted_at is null;
create index membresias_profile_idx on public.membresias (profile_id);

-- Todo lo de hoy es de Ludogteka.
insert into public.membresias (negocio_id, profile_id, rol, cliente_id, created_at, deleted_at, created_by)
select '10000000-0000-4000-8000-000000000001', p.id, p.rol, case when p.rol = 'cliente' then p.cliente_id end, p.created_at, p.deleted_at, p.created_by
from public.profiles p;

comment on column public.profiles.rol is 'LEGADO (antes de PeluDesk). El rol vive en membresias, por negocio. No se lee.';
comment on column public.profiles.cliente_id is 'LEGADO (antes de PeluDesk). El expediente vive en membresias.cliente_id, por negocio. No se lee.';

-- ── 4. Identidad en el negocio actual (dueño postgres, filtro explícito) ──

create or replace function public.current_rol()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select m.rol from public.membresias m
      where m.profile_id = auth.uid()
        and m.negocio_id = public.negocio_actual()
        and m.deleted_at is null),
    'anonimo'
  );
$$;

create or replace function public.es_miembro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_rol() <> 'anonimo';
$$;

-- El expediente de cliente de quien llama EN ESTE negocio (NULL si no es
-- cliente aquí).
create or replace function public.mi_cliente_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.cliente_id from public.membresias m
  where m.profile_id = auth.uid()
    and m.negocio_id = public.negocio_actual()
    and m.rol = 'cliente'
    and m.deleted_at is null;
$$;

-- El rol de quien llama en un negocio dado (para Storage, que deriva el
-- negocio de la ruta del archivo y no del encabezado).
create or replace function public.rol_en_negocio(p_negocio_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.rol from public.membresias m
  where m.profile_id = auth.uid() and m.negocio_id = p_negocio_id and m.deleted_at is null;
$$;

-- ¿Esta persona es miembro del negocio actual? (para ver su perfil)
create or replace function public.persona_en_negocio(p_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.membresias m
    where m.profile_id = p_profile_id and m.negocio_id = public.negocio_actual() and m.deleted_at is null
  );
$$;

-- ── 5. Zona horaria por negocio ─────────────────────────────────────
-- Toda fecha y hora "del negocio" sale de aquí. Sin negocio en la
-- petición, la de Ludogteka (la única que existía antes).

create or replace function public.zona_negocio()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select n.zona_horaria from public.negocios n where n.id = public.negocio_actual()),
    'America/Mexico_City'
  );
$$;

create or replace function public.fecha_negocio(p_ts timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select (p_ts at time zone public.zona_negocio())::date;
$$;

create or replace function public.hora_negocio(p_ts timestamptz default now())
returns time
language sql
stable
set search_path = ''
as $$
  select (p_ts at time zone public.zona_negocio())::time;
$$;

-- ── 6. Resolver el negocio por el dominio (público) ─────────────────

create or replace function public.negocio_por_host(p_slug text, p_dominio text)
returns table (id uuid, slug text, nombre text, dominio text, zona_horaria text, marca jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, n.zona_horaria, n.marca
  from public.negocios n
  where n.activo and n.deleted_at is null
    and (
      (p_slug is not null and n.slug = lower(btrim(p_slug)))
      or (p_dominio is not null and n.dominio = lower(btrim(p_dominio)))
    )
  limit 1;
$$;
grant execute on function public.negocio_por_host(text, text) to anon, authenticated, service_role;

-- Los negocios donde quien llama tiene membresía (para "entrar a otro").
create or replace function public.mis_negocios()
returns table (id uuid, slug text, nombre text, dominio text, rol text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, m.rol
  from public.membresias m
  join public.negocios n on n.id = m.negocio_id and n.activo and n.deleted_at is null
  where m.profile_id = auth.uid() and m.deleted_at is null
  order by n.nombre;
$$;
revoke execute on function public.mis_negocios() from public, anon;
grant execute on function public.mis_negocios() to authenticated;

-- ── 7. negocio_id en cada tabla del negocio ─────────────────────────
-- Se agrega con DEFAULT Ludogteka (no reescribe filas ni dispara
-- triggers) y luego el default pasa a ser el negocio de la petición.

alter table public.adelantos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.adelantos alter column negocio_id set default public.negocio_actual();
create index adelantos_negocio_idx on public.adelantos (negocio_id);
alter table public.areas_inventario add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.areas_inventario alter column negocio_id set default public.negocio_actual();
create index areas_inventario_negocio_idx on public.areas_inventario (negocio_id);
alter table public.asistencia_correcciones add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.asistencia_correcciones alter column negocio_id set default public.negocio_actual();
create index asistencia_correcciones_negocio_idx on public.asistencia_correcciones (negocio_id);
alter table public.asistencias add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.asistencias alter column negocio_id set default public.negocio_actual();
create index asistencias_negocio_idx on public.asistencias (negocio_id);
alter table public.ausencias add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.ausencias alter column negocio_id set default public.negocio_actual();
create index ausencias_negocio_idx on public.ausencias (negocio_id);
alter table public.bitacora_entradas add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.bitacora_entradas alter column negocio_id set default public.negocio_actual();
create index bitacora_entradas_negocio_idx on public.bitacora_entradas (negocio_id);
alter table public.bonos_clientes add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.bonos_clientes alter column negocio_id set default public.negocio_actual();
create index bonos_clientes_negocio_idx on public.bonos_clientes (negocio_id);
alter table public.cargos_aplicados add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.cargos_aplicados alter column negocio_id set default public.negocio_actual();
create index cargos_aplicados_negocio_idx on public.cargos_aplicados (negocio_id);
alter table public.catalogo_alertas add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.catalogo_alertas alter column negocio_id set default public.negocio_actual();
create index catalogo_alertas_negocio_idx on public.catalogo_alertas (negocio_id);
alter table public.catalogo_descuentos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.catalogo_descuentos alter column negocio_id set default public.negocio_actual();
create index catalogo_descuentos_negocio_idx on public.catalogo_descuentos (negocio_id);
alter table public.categorias_gasto add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.categorias_gasto alter column negocio_id set default public.negocio_actual();
create index categorias_gasto_negocio_idx on public.categorias_gasto (negocio_id);
alter table public.categorias_insumo add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.categorias_insumo alter column negocio_id set default public.negocio_actual();
create index categorias_insumo_negocio_idx on public.categorias_insumo (negocio_id);
alter table public.citas_estetica add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.citas_estetica alter column negocio_id set default public.negocio_actual();
create index citas_estetica_negocio_idx on public.citas_estetica (negocio_id);
alter table public.clientes add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.clientes alter column negocio_id set default public.negocio_actual();
create index clientes_negocio_idx on public.clientes (negocio_id);
alter table public.cobro_metodos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.cobro_metodos alter column negocio_id set default public.negocio_actual();
create index cobro_metodos_negocio_idx on public.cobro_metodos (negocio_id);
alter table public.cobros add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.cobros alter column negocio_id set default public.negocio_actual();
create index cobros_negocio_idx on public.cobros (negocio_id);
alter table public.comisiones_servicio add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.comisiones_servicio alter column negocio_id set default public.negocio_actual();
create index comisiones_servicio_negocio_idx on public.comisiones_servicio (negocio_id);
alter table public.compras_insumos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.compras_insumos alter column negocio_id set default public.negocio_actual();
create index compras_insumos_negocio_idx on public.compras_insumos (negocio_id);
alter table public.configuracion_descuentos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.configuracion_descuentos alter column negocio_id set default public.negocio_actual();
create index configuracion_descuentos_negocio_idx on public.configuracion_descuentos (negocio_id);
alter table public.contratos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.contratos alter column negocio_id set default public.negocio_actual();
create index contratos_negocio_idx on public.contratos (negocio_id);
alter table public.corte_metodos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.corte_metodos alter column negocio_id set default public.negocio_actual();
create index corte_metodos_negocio_idx on public.corte_metodos (negocio_id);
alter table public.cortes_caja add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.cortes_caja alter column negocio_id set default public.negocio_actual();
create index cortes_caja_negocio_idx on public.cortes_caja (negocio_id);
alter table public.cupo_configuracion add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.cupo_configuracion alter column negocio_id set default public.negocio_actual();
create index cupo_configuracion_negocio_idx on public.cupo_configuracion (negocio_id);
alter table public.descuentos_aplicados add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.descuentos_aplicados alter column negocio_id set default public.negocio_actual();
create index descuentos_aplicados_negocio_idx on public.descuentos_aplicados (negocio_id);
alter table public.devolucion_metodos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.devolucion_metodos alter column negocio_id set default public.negocio_actual();
create index devolucion_metodos_negocio_idx on public.devolucion_metodos (negocio_id);
alter table public.devoluciones add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.devoluciones alter column negocio_id set default public.negocio_actual();
create index devoluciones_negocio_idx on public.devoluciones (negocio_id);
alter table public.empleados add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.empleados alter column negocio_id set default public.negocio_actual();
create index empleados_negocio_idx on public.empleados (negocio_id);
alter table public.empleados_horario add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.empleados_horario alter column negocio_id set default public.negocio_actual();
create index empleados_horario_negocio_idx on public.empleados_horario (negocio_id);
alter table public.equipo_eventos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.equipo_eventos alter column negocio_id set default public.negocio_actual();
create index equipo_eventos_negocio_idx on public.equipo_eventos (negocio_id);
alter table public.equipos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.equipos alter column negocio_id set default public.negocio_actual();
create index equipos_negocio_idx on public.equipos (negocio_id);
alter table public.esquemas_pago add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.esquemas_pago alter column negocio_id set default public.negocio_actual();
create index esquemas_pago_negocio_idx on public.esquemas_pago (negocio_id);
alter table public.estancia_pertenencias add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.estancia_pertenencias alter column negocio_id set default public.negocio_actual();
create index estancia_pertenencias_negocio_idx on public.estancia_pertenencias (negocio_id);
alter table public.estancias add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.estancias alter column negocio_id set default public.negocio_actual();
create index estancias_negocio_idx on public.estancias (negocio_id);
alter table public.gastos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.gastos alter column negocio_id set default public.negocio_actual();
create index gastos_negocio_idx on public.gastos (negocio_id);
alter table public.gastos_recurrentes add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.gastos_recurrentes alter column negocio_id set default public.negocio_actual();
create index gastos_recurrentes_negocio_idx on public.gastos_recurrentes (negocio_id);
alter table public.grupos_raza add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.grupos_raza alter column negocio_id set default public.negocio_actual();
create index grupos_raza_negocio_idx on public.grupos_raza (negocio_id);
alter table public.horario_semana add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.horario_semana alter column negocio_id set default public.negocio_actual();
create index horario_semana_negocio_idx on public.horario_semana (negocio_id);
alter table public.insumos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.insumos alter column negocio_id set default public.negocio_actual();
create index insumos_negocio_idx on public.insumos (negocio_id);
alter table public.insumos_costos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.insumos_costos alter column negocio_id set default public.negocio_actual();
create index insumos_costos_negocio_idx on public.insumos_costos (negocio_id);
alter table public.invitaciones_cliente add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.invitaciones_cliente alter column negocio_id set default public.negocio_actual();
create index invitaciones_cliente_negocio_idx on public.invitaciones_cliente (negocio_id);
alter table public.medicamentos_administrados add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.medicamentos_administrados alter column negocio_id set default public.negocio_actual();
create index medicamentos_administrados_negocio_idx on public.medicamentos_administrados (negocio_id);
alter table public.movimientos_bono add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.movimientos_bono alter column negocio_id set default public.negocio_actual();
create index movimientos_bono_negocio_idx on public.movimientos_bono (negocio_id);
alter table public.movimientos_caja add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.movimientos_caja alter column negocio_id set default public.negocio_actual();
create index movimientos_caja_negocio_idx on public.movimientos_caja (negocio_id);
alter table public.movimientos_inventario add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.movimientos_inventario alter column negocio_id set default public.negocio_actual();
create index movimientos_inventario_negocio_idx on public.movimientos_inventario (negocio_id);
alter table public.mp_ordenes add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.mp_ordenes alter column negocio_id set default public.negocio_actual();
create index mp_ordenes_negocio_idx on public.mp_ordenes (negocio_id);
alter table public.nomina_pagos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.nomina_pagos alter column negocio_id set default public.negocio_actual();
create index nomina_pagos_negocio_idx on public.nomina_pagos (negocio_id);
alter table public.permisos_staff add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.permisos_staff alter column negocio_id set default public.negocio_actual();
create index permisos_staff_negocio_idx on public.permisos_staff (negocio_id);
alter table public.perro_accesos_compartidos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.perro_accesos_compartidos alter column negocio_id set default public.negocio_actual();
create index perro_accesos_compartidos_negocio_idx on public.perro_accesos_compartidos (negocio_id);
alter table public.perro_alergias add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.perro_alergias alter column negocio_id set default public.negocio_actual();
create index perro_alergias_negocio_idx on public.perro_alergias (negocio_id);
alter table public.perro_alertas add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.perro_alertas alter column negocio_id set default public.negocio_actual();
create index perro_alertas_negocio_idx on public.perro_alertas (negocio_id);
alter table public.perro_historial_dueno add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.perro_historial_dueno alter column negocio_id set default public.negocio_actual();
create index perro_historial_dueno_negocio_idx on public.perro_historial_dueno (negocio_id);
alter table public.perro_medicamentos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.perro_medicamentos alter column negocio_id set default public.negocio_actual();
create index perro_medicamentos_negocio_idx on public.perro_medicamentos (negocio_id);
alter table public.perros add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.perros alter column negocio_id set default public.negocio_actual();
create index perros_negocio_idx on public.perros (negocio_id);
alter table public.pesos_registrados add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.pesos_registrados alter column negocio_id set default public.negocio_actual();
create index pesos_registrados_negocio_idx on public.pesos_registrados (negocio_id);
alter table public.plantillas_contrato add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.plantillas_contrato alter column negocio_id set default public.negocio_actual();
create index plantillas_contrato_negocio_idx on public.plantillas_contrato (negocio_id);
alter table public.proveedores add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.proveedores alter column negocio_id set default public.negocio_actual();
create index proveedores_negocio_idx on public.proveedores (negocio_id);
alter table public.recetas_consumo add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.recetas_consumo alter column negocio_id set default public.negocio_actual();
create index recetas_consumo_negocio_idx on public.recetas_consumo (negocio_id);
alter table public.requisitos_sanitarios_aplicados add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.requisitos_sanitarios_aplicados alter column negocio_id set default public.negocio_actual();
create index requisitos_sanitarios_aplicados_negocio_idx on public.requisitos_sanitarios_aplicados (negocio_id);
alter table public.requisitos_sanitarios_propuestos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.requisitos_sanitarios_propuestos alter column negocio_id set default public.negocio_actual();
create index requisitos_sanitarios_propuestos_negocio_idx on public.requisitos_sanitarios_propuestos (negocio_id);
alter table public.reservas add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.reservas alter column negocio_id set default public.negocio_actual();
create index reservas_negocio_idx on public.reservas (negocio_id);
alter table public.series_pausas add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.series_pausas alter column negocio_id set default public.negocio_actual();
create index series_pausas_negocio_idx on public.series_pausas (negocio_id);
alter table public.series_recurrentes add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.series_recurrentes alter column negocio_id set default public.negocio_actual();
create index series_recurrentes_negocio_idx on public.series_recurrentes (negocio_id);
alter table public.servicios add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.servicios alter column negocio_id set default public.negocio_actual();
create index servicios_negocio_idx on public.servicios (negocio_id);
alter table public.sucursales add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.sucursales alter column negocio_id set default public.negocio_actual();
create index sucursales_negocio_idx on public.sucursales (negocio_id);
alter table public.tarifas add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.tarifas alter column negocio_id set default public.negocio_actual();
create index tarifas_negocio_idx on public.tarifas (negocio_id);
alter table public.tarifas_dia_semana add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.tarifas_dia_semana alter column negocio_id set default public.negocio_actual();
create index tarifas_dia_semana_negocio_idx on public.tarifas_dia_semana (negocio_id);
alter table public.tipos_contrato add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.tipos_contrato alter column negocio_id set default public.negocio_actual();
create index tipos_contrato_negocio_idx on public.tipos_contrato (negocio_id);
alter table public.tipos_requisito_sanitario add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.tipos_requisito_sanitario alter column negocio_id set default public.negocio_actual();
create index tipos_requisito_sanitario_negocio_idx on public.tipos_requisito_sanitario (negocio_id);
alter table public.turnos_caja add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.turnos_caja alter column negocio_id set default public.negocio_actual();
create index turnos_caja_negocio_idx on public.turnos_caja (negocio_id);
alter table public.vacaciones_movimientos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.vacaciones_movimientos alter column negocio_id set default public.negocio_actual();
create index vacaciones_movimientos_negocio_idx on public.vacaciones_movimientos (negocio_id);
alter table public.vinculacion_eventos add column negocio_id uuid not null default '10000000-0000-4000-8000-000000000001' references public.negocios(id);
alter table public.vinculacion_eventos alter column negocio_id set default public.negocio_actual();
create index vinculacion_eventos_negocio_idx on public.vinculacion_eventos (negocio_id);

-- Permisos por persona EN ESTE negocio (van después de las columnas).
create or replace function public.tiene_permiso(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Nunca NULL: un anónimo o alguien sin membresía da false, no NULL.
  select coalesce(public.is_admin(), false)
    or (
      public.current_rol() = 'recepcion'
      and exists (
        select 1 from public.permisos_staff ps
        where ps.profile_id = auth.uid()
          and ps.negocio_id = public.negocio_actual()
          and ps.permiso = p_permiso
          and ps.revocado_at is null
          and ps.deleted_at is null
      )
    );
$$;

create or replace function public.mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select unnest(array[
    'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
    'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
    'plantillas_contrato', 'nomina', 'gastos'
  ]) as permiso
  where coalesce(public.is_admin(), false)
  union
  select ps.permiso
  from public.permisos_staff ps
  where ps.profile_id = auth.uid()
    and ps.negocio_id = public.negocio_actual()
    and ps.revocado_at is null
    and ps.deleted_at is null
    and public.current_rol() = 'recepcion';
$$;



-- ── 8. Lo único que era global y pasa a ser por negocio ─────────────

alter table public.areas_inventario drop constraint areas_inventario_clave_key;
create unique index areas_inventario_clave_key on public.areas_inventario (negocio_id, clave) ;
alter table public.catalogo_alertas drop constraint catalogo_alertas_clave_key;
create unique index catalogo_alertas_clave_key on public.catalogo_alertas (negocio_id, clave) ;
alter table public.catalogo_descuentos drop constraint catalogo_descuentos_clave_key;
create unique index catalogo_descuentos_clave_key on public.catalogo_descuentos (negocio_id, clave) ;
alter table public.categorias_gasto drop constraint categorias_gasto_clave_key;
create unique index categorias_gasto_clave_key on public.categorias_gasto (negocio_id, clave) ;
drop index public.categorias_gasto_nombre_vivo;
create unique index categorias_gasto_nombre_vivo on public.categorias_gasto (negocio_id, lower(nombre)) where deleted_at is null;
alter table public.categorias_insumo drop constraint categorias_insumo_clave_key;
create unique index categorias_insumo_clave_key on public.categorias_insumo (negocio_id, clave) ;
drop index public.clientes_email_activo_idx;
create unique index clientes_email_activo_idx on public.clientes (negocio_id, lower(email)) where email is not null and deleted_at is null;
drop index public.clientes_telefono_unico_idx;
create unique index clientes_telefono_unico_idx on public.clientes (negocio_id, telefono) where deleted_at is null;
drop index public.empleados_profile_unico;
create unique index empleados_profile_unico on public.empleados (negocio_id, profile_id) where profile_id is not null and deleted_at is null;
alter table public.grupos_raza drop constraint grupos_raza_clave_key;
create unique index grupos_raza_clave_key on public.grupos_raza (negocio_id, clave) ;
drop index public.grupos_raza_un_predeterminado_idx;
create unique index grupos_raza_un_predeterminado_idx on public.grupos_raza (negocio_id) where es_predeterminado;
drop index public.permisos_staff_vigente_unico;
create unique index permisos_staff_vigente_unico on public.permisos_staff (negocio_id, profile_id, permiso) where revocado_at is null and deleted_at is null;
alter table public.servicios drop constraint servicios_clave_key;
create unique index servicios_clave_key on public.servicios (negocio_id, clave) ;
drop index public.tipos_contrato_nombre_idx;
create unique index tipos_contrato_nombre_idx on public.tipos_contrato (negocio_id, lower(nombre)) where deleted_at is null;
alter table public.tipos_requisito_sanitario drop constraint tipos_requisito_sanitario_clave_key;
create unique index tipos_requisito_sanitario_clave_key on public.tipos_requisito_sanitario (negocio_id, clave) ;
drop index public.turnos_caja_un_abierto_idx;
create unique index turnos_caja_un_abierto_idx on public.turnos_caja (negocio_id) where estado = 'abierto';
-- El expediente de cliente de una cuenta ya no vive en profiles.
drop index if exists public.profiles_cliente_id_unico_idx;


-- ── 9. Las dos redes: política restrictiva de negocio y la del rol definer ──

create policy adelantos_negocio on public.adelantos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy adelantos_negocio_definer on public.adelantos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.adelantos to peludesk_definer;
create policy areas_inventario_negocio on public.areas_inventario as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy areas_inventario_negocio_definer on public.areas_inventario for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.areas_inventario to peludesk_definer;
create policy asistencia_correcciones_negocio on public.asistencia_correcciones as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy asistencia_correcciones_negocio_definer on public.asistencia_correcciones for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.asistencia_correcciones to peludesk_definer;
create policy asistencias_negocio on public.asistencias as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy asistencias_negocio_definer on public.asistencias for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.asistencias to peludesk_definer;
create policy ausencias_negocio on public.ausencias as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy ausencias_negocio_definer on public.ausencias for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.ausencias to peludesk_definer;
create policy bitacora_entradas_negocio on public.bitacora_entradas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy bitacora_entradas_negocio_definer on public.bitacora_entradas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.bitacora_entradas to peludesk_definer;
create policy bonos_clientes_negocio on public.bonos_clientes as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy bonos_clientes_negocio_definer on public.bonos_clientes for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.bonos_clientes to peludesk_definer;
create policy cargos_aplicados_negocio on public.cargos_aplicados as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy cargos_aplicados_negocio_definer on public.cargos_aplicados for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.cargos_aplicados to peludesk_definer;
create policy catalogo_alertas_negocio on public.catalogo_alertas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy catalogo_alertas_negocio_definer on public.catalogo_alertas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.catalogo_alertas to peludesk_definer;
create policy catalogo_descuentos_negocio on public.catalogo_descuentos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy catalogo_descuentos_negocio_definer on public.catalogo_descuentos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.catalogo_descuentos to peludesk_definer;
create policy categorias_gasto_negocio on public.categorias_gasto as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy categorias_gasto_negocio_definer on public.categorias_gasto for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.categorias_gasto to peludesk_definer;
create policy categorias_insumo_negocio on public.categorias_insumo as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy categorias_insumo_negocio_definer on public.categorias_insumo for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.categorias_insumo to peludesk_definer;
create policy citas_estetica_negocio on public.citas_estetica as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy citas_estetica_negocio_definer on public.citas_estetica for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.citas_estetica to peludesk_definer;
create policy clientes_negocio on public.clientes as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy clientes_negocio_definer on public.clientes for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.clientes to peludesk_definer;
create policy cobro_metodos_negocio on public.cobro_metodos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy cobro_metodos_negocio_definer on public.cobro_metodos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.cobro_metodos to peludesk_definer;
create policy cobros_negocio on public.cobros as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy cobros_negocio_definer on public.cobros for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.cobros to peludesk_definer;
create policy comisiones_servicio_negocio on public.comisiones_servicio as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy comisiones_servicio_negocio_definer on public.comisiones_servicio for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.comisiones_servicio to peludesk_definer;
create policy compras_insumos_negocio on public.compras_insumos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy compras_insumos_negocio_definer on public.compras_insumos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.compras_insumos to peludesk_definer;
create policy configuracion_descuentos_negocio on public.configuracion_descuentos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy configuracion_descuentos_negocio_definer on public.configuracion_descuentos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.configuracion_descuentos to peludesk_definer;
create policy contratos_negocio on public.contratos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy contratos_negocio_definer on public.contratos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.contratos to peludesk_definer;
create policy corte_metodos_negocio on public.corte_metodos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy corte_metodos_negocio_definer on public.corte_metodos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.corte_metodos to peludesk_definer;
create policy cortes_caja_negocio on public.cortes_caja as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy cortes_caja_negocio_definer on public.cortes_caja for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.cortes_caja to peludesk_definer;
create policy cupo_configuracion_negocio on public.cupo_configuracion as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy cupo_configuracion_negocio_definer on public.cupo_configuracion for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.cupo_configuracion to peludesk_definer;
create policy descuentos_aplicados_negocio on public.descuentos_aplicados as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy descuentos_aplicados_negocio_definer on public.descuentos_aplicados for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.descuentos_aplicados to peludesk_definer;
create policy devolucion_metodos_negocio on public.devolucion_metodos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy devolucion_metodos_negocio_definer on public.devolucion_metodos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.devolucion_metodos to peludesk_definer;
create policy devoluciones_negocio on public.devoluciones as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy devoluciones_negocio_definer on public.devoluciones for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.devoluciones to peludesk_definer;
create policy empleados_negocio on public.empleados as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy empleados_negocio_definer on public.empleados for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.empleados to peludesk_definer;
create policy empleados_horario_negocio on public.empleados_horario as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy empleados_horario_negocio_definer on public.empleados_horario for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.empleados_horario to peludesk_definer;
create policy equipo_eventos_negocio on public.equipo_eventos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy equipo_eventos_negocio_definer on public.equipo_eventos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.equipo_eventos to peludesk_definer;
create policy equipos_negocio on public.equipos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy equipos_negocio_definer on public.equipos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.equipos to peludesk_definer;
create policy esquemas_pago_negocio on public.esquemas_pago as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy esquemas_pago_negocio_definer on public.esquemas_pago for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.esquemas_pago to peludesk_definer;
create policy estancia_pertenencias_negocio on public.estancia_pertenencias as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy estancia_pertenencias_negocio_definer on public.estancia_pertenencias for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.estancia_pertenencias to peludesk_definer;
create policy estancias_negocio on public.estancias as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy estancias_negocio_definer on public.estancias for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.estancias to peludesk_definer;
create policy gastos_negocio on public.gastos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy gastos_negocio_definer on public.gastos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.gastos to peludesk_definer;
create policy gastos_recurrentes_negocio on public.gastos_recurrentes as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy gastos_recurrentes_negocio_definer on public.gastos_recurrentes for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.gastos_recurrentes to peludesk_definer;
create policy grupos_raza_negocio on public.grupos_raza as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy grupos_raza_negocio_definer on public.grupos_raza for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.grupos_raza to peludesk_definer;
create policy horario_semana_negocio on public.horario_semana as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy horario_semana_negocio_definer on public.horario_semana for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.horario_semana to peludesk_definer;
create policy insumos_negocio on public.insumos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy insumos_negocio_definer on public.insumos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.insumos to peludesk_definer;
create policy insumos_costos_negocio on public.insumos_costos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy insumos_costos_negocio_definer on public.insumos_costos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.insumos_costos to peludesk_definer;
create policy invitaciones_cliente_negocio on public.invitaciones_cliente as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy invitaciones_cliente_negocio_definer on public.invitaciones_cliente for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.invitaciones_cliente to peludesk_definer;
create policy medicamentos_administrados_negocio on public.medicamentos_administrados as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy medicamentos_administrados_negocio_definer on public.medicamentos_administrados for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.medicamentos_administrados to peludesk_definer;
create policy movimientos_bono_negocio on public.movimientos_bono as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy movimientos_bono_negocio_definer on public.movimientos_bono for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.movimientos_bono to peludesk_definer;
create policy movimientos_caja_negocio on public.movimientos_caja as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy movimientos_caja_negocio_definer on public.movimientos_caja for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.movimientos_caja to peludesk_definer;
create policy movimientos_inventario_negocio on public.movimientos_inventario as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy movimientos_inventario_negocio_definer on public.movimientos_inventario for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.movimientos_inventario to peludesk_definer;
create policy mp_ordenes_negocio on public.mp_ordenes as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy mp_ordenes_negocio_definer on public.mp_ordenes for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.mp_ordenes to peludesk_definer;
create policy nomina_pagos_negocio on public.nomina_pagos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy nomina_pagos_negocio_definer on public.nomina_pagos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.nomina_pagos to peludesk_definer;
create policy permisos_staff_negocio on public.permisos_staff as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy permisos_staff_negocio_definer on public.permisos_staff for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.permisos_staff to peludesk_definer;
create policy perro_accesos_compartidos_negocio on public.perro_accesos_compartidos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy perro_accesos_compartidos_negocio_definer on public.perro_accesos_compartidos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.perro_accesos_compartidos to peludesk_definer;
create policy perro_alergias_negocio on public.perro_alergias as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy perro_alergias_negocio_definer on public.perro_alergias for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.perro_alergias to peludesk_definer;
create policy perro_alertas_negocio on public.perro_alertas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy perro_alertas_negocio_definer on public.perro_alertas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.perro_alertas to peludesk_definer;
create policy perro_historial_dueno_negocio on public.perro_historial_dueno as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy perro_historial_dueno_negocio_definer on public.perro_historial_dueno for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.perro_historial_dueno to peludesk_definer;
create policy perro_medicamentos_negocio on public.perro_medicamentos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy perro_medicamentos_negocio_definer on public.perro_medicamentos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.perro_medicamentos to peludesk_definer;
create policy perros_negocio on public.perros as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy perros_negocio_definer on public.perros for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.perros to peludesk_definer;
create policy pesos_registrados_negocio on public.pesos_registrados as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy pesos_registrados_negocio_definer on public.pesos_registrados for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.pesos_registrados to peludesk_definer;
create policy plantillas_contrato_negocio on public.plantillas_contrato as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy plantillas_contrato_negocio_definer on public.plantillas_contrato for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.plantillas_contrato to peludesk_definer;
create policy proveedores_negocio on public.proveedores as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy proveedores_negocio_definer on public.proveedores for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.proveedores to peludesk_definer;
create policy recetas_consumo_negocio on public.recetas_consumo as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy recetas_consumo_negocio_definer on public.recetas_consumo for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.recetas_consumo to peludesk_definer;
create policy requisitos_sanitarios_aplicados_negocio on public.requisitos_sanitarios_aplicados as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy requisitos_sanitarios_aplicados_negocio_definer on public.requisitos_sanitarios_aplicados for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.requisitos_sanitarios_aplicados to peludesk_definer;
create policy requisitos_sanitarios_propuestos_negocio on public.requisitos_sanitarios_propuestos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy requisitos_sanitarios_propuestos_negocio_definer on public.requisitos_sanitarios_propuestos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.requisitos_sanitarios_propuestos to peludesk_definer;
create policy reservas_negocio on public.reservas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy reservas_negocio_definer on public.reservas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.reservas to peludesk_definer;
create policy series_pausas_negocio on public.series_pausas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy series_pausas_negocio_definer on public.series_pausas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.series_pausas to peludesk_definer;
create policy series_recurrentes_negocio on public.series_recurrentes as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy series_recurrentes_negocio_definer on public.series_recurrentes for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.series_recurrentes to peludesk_definer;
create policy servicios_negocio on public.servicios as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy servicios_negocio_definer on public.servicios for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.servicios to peludesk_definer;
create policy sucursales_negocio on public.sucursales as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy sucursales_negocio_definer on public.sucursales for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.sucursales to peludesk_definer;
create policy tarifas_negocio on public.tarifas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy tarifas_negocio_definer on public.tarifas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.tarifas to peludesk_definer;
create policy tarifas_dia_semana_negocio on public.tarifas_dia_semana as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy tarifas_dia_semana_negocio_definer on public.tarifas_dia_semana for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.tarifas_dia_semana to peludesk_definer;
create policy tipos_contrato_negocio on public.tipos_contrato as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy tipos_contrato_negocio_definer on public.tipos_contrato for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.tipos_contrato to peludesk_definer;
create policy tipos_requisito_sanitario_negocio on public.tipos_requisito_sanitario as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy tipos_requisito_sanitario_negocio_definer on public.tipos_requisito_sanitario for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.tipos_requisito_sanitario to peludesk_definer;
create policy turnos_caja_negocio on public.turnos_caja as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy turnos_caja_negocio_definer on public.turnos_caja for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.turnos_caja to peludesk_definer;
create policy vacaciones_movimientos_negocio on public.vacaciones_movimientos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy vacaciones_movimientos_negocio_definer on public.vacaciones_movimientos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.vacaciones_movimientos to peludesk_definer;
create policy vinculacion_eventos_negocio on public.vinculacion_eventos as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy vinculacion_eventos_negocio_definer on public.vinculacion_eventos for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.vinculacion_eventos to peludesk_definer;

-- Catálogos compartidos entre negocios (razas, tallas, pelajes, unidades):
-- el rol definer solo los lee.
create policy razas_lectura_definer on public.razas for select to peludesk_definer using (true);
grant select on public.razas to peludesk_definer;
create policy tamanos_categoria_lectura_definer on public.tamanos_categoria for select to peludesk_definer using (true);
grant select on public.tamanos_categoria to peludesk_definer;
create policy tipos_pelaje_lectura_definer on public.tipos_pelaje for select to peludesk_definer using (true);
grant select on public.tipos_pelaje to peludesk_definer;
create policy unidades_medida_lectura_definer on public.unidades_medida for select to peludesk_definer using (true);
grant select on public.unidades_medida to peludesk_definer;

-- profiles: la persona. El rol definer ve y actualiza la de quien llama y
-- las de miembros del negocio actual.
create policy profiles_definer on public.profiles for all to peludesk_definer
  using (id = auth.uid() or (select public.negocio_actual()) is not null and public.persona_en_negocio(id))
  with check (id = auth.uid() or (select public.negocio_actual()) is not null and public.persona_en_negocio(id));
grant select, update on public.profiles to peludesk_definer;

-- negocios: el rol definer solo ve y actualiza el negocio actual.
alter table public.negocios enable row level security;
create policy negocios_definer on public.negocios for select to peludesk_definer
  using (id = (select public.negocio_actual()));
create policy negocios_update_definer on public.negocios for update to peludesk_definer
  using (id = (select public.negocio_actual())) with check (id = (select public.negocio_actual()));
grant select, update on public.negocios to peludesk_definer;
create policy negocios_select_miembro on public.negocios for select to authenticated
  using (id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy negocios_update_admin on public.negocios for update to authenticated
  using (id = (select public.negocio_actual()) and coalesce(public.is_admin(), false))
  with check (id = (select public.negocio_actual()) and coalesce(public.is_admin(), false));

-- membresias (tabla de negocio: ya tiene sus dos redes arriba).
alter table public.membresias enable row level security;
create policy membresias_negocio on public.membresias as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy membresias_negocio_definer on public.membresias for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
grant select, insert, update, delete on public.membresias to peludesk_definer;
-- Cada quien ve la suya; el personal ve las de su negocio (vinculación,
-- personal, permisos). Solo admin crea o cambia membresías directo;
-- recepción liga o desliga el expediente de una cuenta de CLIENTE.
create policy membresias_select on public.membresias for select to authenticated
  using (profile_id = auth.uid() or coalesce(public.is_staff(), false));
create policy membresias_insert_admin on public.membresias for insert to authenticated
  with check (coalesce(public.is_admin(), false));
create policy membresias_update on public.membresias for update to authenticated
  using (coalesce(public.is_admin(), false) or (public.current_rol() = 'recepcion' and rol = 'cliente'))
  with check (coalesce(public.is_admin(), false) or (public.current_rol() = 'recepcion' and rol = 'cliente'));

-- Solo un admin cambia el rol de una membresía, y nadie se da admin solo.
create or replace function public.proteger_membresia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.asignacion_rol_interna', true), '') = 'on' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.rol is distinct from old.rol and not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede cambiar el rol.';
  end if;
  if tg_op = 'UPDATE' and new.profile_id = auth.uid() and new.rol is distinct from old.rol then
    raise exception 'Nadie se cambia el rol a sí mismo.';
  end if;
  if tg_op = 'UPDATE' and new.cliente_id is distinct from old.cliente_id
     and not (public.current_rol() in ('admin', 'recepcion'))
     and coalesce(current_setting('app.vinculacion_interna', true), '') <> 'on' then
    raise exception 'Solo admin o recepción pueden vincular o desvincular un cliente.';
  end if;
  if tg_op = 'UPDATE' and (new.profile_id is distinct from old.profile_id or new.negocio_id is distinct from old.negocio_id) then
    raise exception 'Una membresía no cambia de persona ni de negocio.';
  end if;
  return new;
end;
$$;
create trigger proteger_membresia before update on public.membresias
  for each row execute function public.proteger_membresia();

-- profiles: la persona se ve a sí misma; el personal ve a los miembros de
-- su negocio. Ya no se cambia el rol ni el expediente aquí (membresias).
drop policy if exists profiles_select_admin on public.profiles;
drop policy if exists profiles_select_recepcion_clientes on public.profiles;
drop policy if exists profiles_update_admin on public.profiles;
drop policy if exists profiles_update_recepcion_vincular on public.profiles;
create policy profiles_select_negocio on public.profiles for select to authenticated
  using (coalesce(public.is_staff(), false) and public.persona_en_negocio(id));

-- Lo que postgres cree de aquí en adelante también le sirve al rol definer
-- (las políticas deciden qué filas).
grant execute on all functions in schema public to peludesk_definer;
alter default privileges in schema public grant select, insert, update, delete on tables to peludesk_definer;
alter default privileges in schema public grant execute on functions to peludesk_definer;

