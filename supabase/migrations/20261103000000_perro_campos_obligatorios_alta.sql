-- QA externa, cierre del 16 de octubre de 2026 (N16): un perro quedó en Estética sin raza, tamaño ni pelaje.
-- Qué pide el alta de una mascota depende de lo que el negocio ofrece (misma regla que src/lib/perros/alta-requisitos.ts):
--   · con Estética o con guardería u hotel: raza (o «Mestizo»);
--   · con Estética, además tamaño y pelaje cuando la raza no fija el precio sola (texto suelto, mestizo o sin raza,
--     raza sin grupo de precio, o un grupo que cobra por tamaño × pelaje: la misma regla del formulario del perro);
--   · solo Veterinaria: nada de esto es obligatorio.
-- El importador (la única vía de alta que no pasa por una acción de la app) la usa para rechazar la fila con el
-- mensaje de qué falta; el resto de las vías la validan en el servidor con la gemela de TypeScript.

create or replace function public.perro_faltantes_alta(p_raza text, p_raza_id uuid, p_tamano_id uuid, p_pelaje_id uuid)
returns text[]
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_mod text[] := coalesce(public.modulos_activos(), '{}'::text[]);
  v_est boolean := 'estetica' = any (v_mod);
  v_estancias boolean := 'guarderia' = any (v_mod) or 'hotel' = any (v_mod);
  v_faltan text[] := '{}'::text[];
  v_tiene_raza boolean := p_raza_id is not null or nullif(btrim(coalesce(p_raza, '')), '') is not null;
  v_nombre text;
  v_desconocida boolean;
  v_grupo text;
  v_depende_pelaje boolean;
  v_matriz boolean;
begin
  if not (v_est or v_estancias) then
    return v_faltan;
  end if;
  if not v_tiene_raza then
    v_faltan := array_append(v_faltan, 'raza (si es mestizo, escoge «Mestizo»)');
    return v_faltan;
  end if;
  if v_est then
    -- La raza fija el precio sola solo si es del catálogo, con grupo de precio que no cobra por tamaño × pelaje.
    v_matriz := true;
    if p_raza_id is not null then
      select r.nombre, coalesce(r.es_desconocida, false), g.nombre, coalesce(g.depende_pelaje, false)
        into v_nombre, v_desconocida, v_grupo, v_depende_pelaje
      from public.razas r
      left join public.razas_grupo rg on rg.raza_id = r.id and rg.negocio_id = public.negocio_actual() and rg.deleted_at is null
      left join public.grupos_raza g on g.id = rg.grupo_raza_id
      where r.id = p_raza_id;
      if found then
        v_matriz := v_desconocida or v_nombre ~* 'mestiz|criollo' or v_grupo is null or v_depende_pelaje;
      end if;
    end if;
    if v_matriz and p_tamano_id is null then
      v_faltan := array_append(v_faltan, 'tamaño');
    end if;
    if v_matriz and p_pelaje_id is null then
      v_faltan := array_append(v_faltan, 'pelaje');
    end if;
  end if;
  return v_faltan;
end;
$$;

alter function public.perro_faltantes_alta(text, uuid, uuid, uuid) owner to peludesk_definer;
revoke execute on function public.perro_faltantes_alta(text, uuid, uuid, uuid) from public, anon;
grant execute on function public.perro_faltantes_alta(text, uuid, uuid, uuid) to authenticated, service_role;

-- El importador: una mascota NUEVA sin lo obligatorio se rechaza (la fila entera, con su mensaje); una que ya existía
-- y solo se actualiza no se toca.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'importacion_procesar_fila';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def,
    E'      insert into public.perros (cliente_id, nombre, raza, raza_id, sexo, esterilizado, fecha_nacimiento, tamano_id, pelaje_id,',
    E'      if cardinality(public.perro_faltantes_alta(v_raza, v_raza_id, v_tam, v_pel)) > 0 then\n        raise exception ''A la mascota «%» le falta: %. Complétalo en el archivo (en «raza» puedes poner «Mestizo»).'',\n          btrim(d->>''m_nombre''), array_to_string(public.perro_faltantes_alta(v_raza, v_raza_id, v_tam, v_pel), '', '');\n      end if;\n      insert into public.perros (cliente_id, nombre, raza, raza_id, sexo, esterilizado, fecha_nacimiento, tamano_id, pelaje_id,');
  if v_nuevo = v_def or position('perro_faltantes_alta' in v_nuevo) = 0 then
    raise exception 'importacion_procesar_fila: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;
end;
$$;
