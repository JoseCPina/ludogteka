-- El negocio maneja más de un contrato a la vez (uno de guardería, otro
-- de hotel, y va a haber más). Hasta hoy plantillas_contrato asumía UNO
-- solo: version única global, un único índice de "activa", y
-- generar_contrato() tomaba "la" plantilla activa sin preguntar cuál.
--
-- Se separa en dos piezas con vidas distintas, en vez de meterle un
-- "nombre" a cada versión:
--
--   * tipos_contrato — la IDENTIDAD del contrato ("Contrato de hotel"),
--     mutable: cambiarle el nombre o a qué servicios aplica no debe
--     obligar a redactar el texto de nuevo ni a pedir refirma.
--   * plantillas_contrato — el TEXTO, insert-only y versionado, ahora
--     por tipo. Sigue sin admitir UPDATE: un contrato firmado apunta a
--     la versión exacta con la que se firmó, para siempre.
--
-- Meter ambas cosas en la misma tabla habría obligado a publicar una
-- versión nueva (y por tanto a desalinear el versionado) solo para
-- corregir una errata en el nombre del tipo.
create table public.tipos_contrato (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,

  -- A qué categorías de servicio aplica este contrato. Vacío = aplica a
  -- todos los perros siempre (es el caso del contrato "general" que ya
  -- existía antes de esta migración: no se puede adivinar a qué
  -- servicios se refería, así que se conserva exigible a todos, tal cual
  -- se comportaba). Con categorías, el aviso de "falta contrato" solo
  -- sale para los perros que de verdad usan ese servicio — a un perro
  -- que solo viene a bañarse no le falta el contrato de hotel.
  categorias_servicio text[] not null default '{}',

  orden int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  check (categorias_servicio <@ array['guarderia', 'hotel', 'estetica'])
);

create trigger set_updated_at before insert or update on public.tipos_contrato
  for each row execute function public.set_updated_at();

-- Baja lógica, nunca DELETE: archivar un tipo (deleted_at) deja de
-- pedirlo y de generarlo, pero los contratos ya firmados con él siguen
-- siendo historial consultable — igual que una tarifa vieja.
create unique index tipos_contrato_nombre_idx
  on public.tipos_contrato (lower(nombre)) where deleted_at is null;

alter table public.tipos_contrato enable row level security;

-- Mismo criterio que plantillas_contrato tras el fix de Fase 6: el dueño
-- necesita saber CUÁL contrato está firmando, así que el nombre del tipo
-- no es información reservada del negocio.
create policy tipos_contrato_select_autenticados on public.tipos_contrato
  for select to authenticated
  using (true);

-- Sin INSERT/UPDATE directo: todo pasa por las funciones de abajo, igual
-- que plantillas_contrato — así crear un tipo y publicar su primera
-- versión nunca puede quedar a medias.

-- Backfill: lo que ya existía era un solo contrato sin nombre propio.
-- Se le da uno ("Contrato general") y se le cuelgan TODAS las versiones
-- ya publicadas, conservando sus números de versión y cuál estaba
-- activa. Ningún contrato firmado cambia de plantilla_id.
insert into public.tipos_contrato (nombre, categorias_servicio, orden)
select 'Contrato general', '{}', 0
where exists (select 1 from public.plantillas_contrato);

alter table public.plantillas_contrato
  add column tipo_contrato_id uuid references public.tipos_contrato(id);

update public.plantillas_contrato
set tipo_contrato_id = (select id from public.tipos_contrato where nombre = 'Contrato general')
where tipo_contrato_id is null;

alter table public.plantillas_contrato
  alter column tipo_contrato_id set not null;

-- El versionado deja de ser global y pasa a ser POR TIPO: el contrato de
-- hotel puede ir en la versión 3 mientras el de guardería sigue en la 1.
alter table public.plantillas_contrato
  drop constraint plantillas_contrato_version_key;

alter table public.plantillas_contrato
  add constraint plantillas_contrato_tipo_version_key unique (tipo_contrato_id, version);

drop index plantillas_contrato_una_activa_idx;

create unique index plantillas_contrato_una_activa_por_tipo_idx
  on public.plantillas_contrato (tipo_contrato_id) where activa;

create index plantillas_contrato_tipo_idx on public.plantillas_contrato (tipo_contrato_id);

-- Crear un tipo publica su primera versión en la misma transacción: un
-- tipo sin texto no serviría para nada (no se le puede generar un
-- contrato a nadie) pero sí aparecería como "falta este contrato" en
-- todos los avisos. Que no exista ese estado intermedio.
create or replace function public.crear_tipo_contrato(
  p_nombre text,
  p_categorias_servicio text[],
  p_titulo text,
  p_cuerpo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede crear un tipo de contrato.';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'Ponle un nombre al contrato (por ejemplo: Contrato de hotel).';
  end if;
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'El título no puede estar vacío.';
  end if;
  if p_cuerpo is null or btrim(p_cuerpo) = '' then
    raise exception 'El cuerpo del contrato no puede estar vacío.';
  end if;

  insert into public.tipos_contrato (nombre, categorias_servicio, orden, created_by)
  values (
    btrim(p_nombre),
    coalesce(p_categorias_servicio, '{}'),
    coalesce((select max(orden) + 1 from public.tipos_contrato), 0),
    auth.uid()
  )
  returning id into v_tipo_id;

  insert into public.plantillas_contrato (tipo_contrato_id, version, titulo, cuerpo, activa, created_by)
  values (v_tipo_id, 1, btrim(p_titulo), p_cuerpo, true, auth.uid());

  return v_tipo_id;
end;
$$;

revoke execute on function public.crear_tipo_contrato(text, text[], text, text) from public;
grant execute on function public.crear_tipo_contrato(text, text[], text, text) to authenticated;

-- Cambiar nombre o aplicabilidad NO toca el texto ni las versiones: es
-- metadato del tipo, no del contrato firmado. Un contrato ya firmado
-- sigue apuntando a su misma plantilla y sigue contando igual.
create or replace function public.actualizar_tipo_contrato(
  p_tipo_id uuid,
  p_nombre text,
  p_categorias_servicio text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede editar un tipo de contrato.';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'Ponle un nombre al contrato (por ejemplo: Contrato de hotel).';
  end if;

  update public.tipos_contrato
  set nombre = btrim(p_nombre),
      categorias_servicio = coalesce(p_categorias_servicio, '{}')
  where id = p_tipo_id and deleted_at is null;

  if not found then
    raise exception 'Tipo de contrato no encontrado.';
  end if;
end;
$$;

revoke execute on function public.actualizar_tipo_contrato(uuid, text, text[]) from public;
grant execute on function public.actualizar_tipo_contrato(uuid, text, text[]) to authenticated;

-- Archivar: el negocio deja de usar este contrato. No se pide más, no se
-- genera más, y desaparece de los avisos de "falta" — pero los que ya se
-- firmaron siguen en el historial del perro, con su texto intacto.
create or replace function public.archivar_tipo_contrato(p_tipo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede archivar un tipo de contrato.';
  end if;

  update public.tipos_contrato
  set deleted_at = now()
  where id = p_tipo_id and deleted_at is null;

  if not found then
    raise exception 'Tipo de contrato no encontrado o ya archivado.';
  end if;
end;
$$;

revoke execute on function public.archivar_tipo_contrato(uuid) from public;
grant execute on function public.archivar_tipo_contrato(uuid) to authenticated;

create or replace function public.reactivar_tipo_contrato(p_tipo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede reactivar un tipo de contrato.';
  end if;

  select nombre into v_nombre from public.tipos_contrato
  where id = p_tipo_id and deleted_at is not null;
  if v_nombre is null then
    raise exception 'Tipo de contrato no encontrado o ya activo.';
  end if;

  if exists (
    select 1 from public.tipos_contrato
    where lower(nombre) = lower(v_nombre) and deleted_at is null
  ) then
    raise exception 'Ya hay un contrato activo con ese nombre. Renómbralo antes de reactivar este.';
  end if;

  update public.tipos_contrato set deleted_at = null where id = p_tipo_id;
end;
$$;

revoke execute on function public.reactivar_tipo_contrato(uuid) from public;
grant execute on function public.reactivar_tipo_contrato(uuid) to authenticated;
