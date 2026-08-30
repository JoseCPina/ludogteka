-- Probando con JWT real: crear un tipo con un nombre ya usado tronaba
-- con el 23505 crudo del índice único, y traducirError() solo pasa tal
-- cual los P0001 — al admin le hubiera salido "No pudimos guardar esto.
-- Intenta de nuevo." sin decirle nunca que el problema es el nombre
-- repetido. Se valida explícitamente, igual que el resto de las reglas
-- de negocio de estas funciones. El índice único se queda como red de
-- seguridad para las carreras entre dos pestañas.
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

  if exists (
    select 1 from public.tipos_contrato
    where lower(nombre) = lower(btrim(p_nombre)) and deleted_at is null
  ) then
    raise exception 'Ya hay un contrato que se llama "%". Ponle otro nombre.', btrim(p_nombre);
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

  if exists (
    select 1 from public.tipos_contrato
    where lower(nombre) = lower(btrim(p_nombre))
      and deleted_at is null
      and id <> p_tipo_id
  ) then
    raise exception 'Ya hay un contrato que se llama "%". Ponle otro nombre.', btrim(p_nombre);
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
