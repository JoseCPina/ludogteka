-- QA S39 (pendientes de N137): el importador sigue la regla por especie del alta.
--   1. Con Veterinaria prendida, la especie del archivo se toma aunque quien importa no tenga el permiso de ficha clínica
--      (igual que el alta: la especie la escoge quien da de alta; microchip, folio, peso y alergias siguen siendo de la
--      ficha clínica).
--   2. La raza se liga al catálogo DE SU ESPECIE (`importacion_raza(texto, especie)`): un «Mestizo» de gato cae en el
--      «Mestizo» de gato, «Siamés» en Siamés; un perro sigue con las variantes de siempre (`razas_variantes`).
--   3. `perro_faltantes_alta(…, especie)`: raza, tamaño y pelaje obligatorios son de un perro (gemela de
--      `faltantesAltaPerro` en src/lib/perros/alta-requisitos.ts). Un gato u «otro» no los pide, y no se le guardan
--      tamaño ni pelaje.
--   4. Reparación: las mascotas con especie gato que quedaron con una raza de perro (antes de `razas.especie` el alta
--      solo ofrecía razas de perro) pasan al «Mestizo» de gato si su raza era mestizo, criollo o desconocida, y a
--      «Doméstico de pelo corto» si era una raza de perro definida. Prueba: scripts/auditoria/gatos-con-raza-de-perro.mjs.

-- ── 1. La raza del archivo, en el catálogo de su especie ──
create or replace function public.importacion_raza(p_texto text, p_especie text)
returns table (raza_id uuid, nombre text, estado text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_norm text := public.normalizar_raza(coalesce(p_texto, ''));
  v_n integer;
begin
  if coalesce(p_especie, 'perro') = 'perro' then
    return query select * from public.importacion_raza(p_texto);
    return;
  end if;
  if v_norm = '' then
    return query select null::uuid, null::text, 'vacia'::text;
    return;
  end if;
  select count(distinct r.id) into v_n
  from public.razas r
  where r.deleted_at is null and r.especie = p_especie
    and (public.normalizar_raza(r.nombre) = v_norm
         or exists (select 1 from unnest(r.alias) a where public.normalizar_raza(a) = v_norm));
  if v_n = 1 then
    return query select r.id, r.nombre, 'catalogo'::text
      from public.razas r
      where r.deleted_at is null and r.especie = p_especie
        and (public.normalizar_raza(r.nombre) = v_norm
             or exists (select 1 from unnest(r.alias) a where public.normalizar_raza(a) = v_norm))
      limit 1;
  elsif v_n > 1 then
    return query select null::uuid, null::text, 'ambigua'::text;
  else
    return query select null::uuid, null::text, 'sin_coincidencia'::text;
  end if;
end;
$$;
alter function public.importacion_raza(text, text) owner to peludesk_definer;
revoke execute on function public.importacion_raza(text, text) from public, anon, authenticated;
grant execute on function public.importacion_raza(text, text) to service_role, peludesk_definer;

-- ── 2. Qué pide el alta, por especie ──
create or replace function public.perro_faltantes_alta(p_raza text, p_raza_id uuid, p_tamano_id uuid, p_pelaje_id uuid, p_especie text)
returns text[]
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if coalesce(p_especie, 'perro') <> 'perro' then
    return '{}'::text[];
  end if;
  return public.perro_faltantes_alta(p_raza, p_raza_id, p_tamano_id, p_pelaje_id);
end;
$$;
alter function public.perro_faltantes_alta(text, uuid, uuid, uuid, text) owner to peludesk_definer;
revoke execute on function public.perro_faltantes_alta(text, uuid, uuid, uuid, text) from public, anon;
grant execute on function public.perro_faltantes_alta(text, uuid, uuid, uuid, text) to authenticated, service_role;

-- ── 3. El proceso y la vista previa del importador (parches sobre su texto vigente) ──
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'importacion_procesar_fila';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def,
    E'v_esp := case when v_clin then coalesce(nullif(d->>''m_especie'', ''''), ''perro'') else ''perro'' end;',
    E'v_esp := case when v_clin or public.modulo_activo(''veterinaria'') then coalesce(nullif(d->>''m_especie'', ''''), ''perro'') else ''perro'' end;');
  v_nuevo := replace(v_nuevo,
    E'public.importacion_raza(d->>''m_raza'')',
    E'public.importacion_raza(d->>''m_raza'', v_esp)');
  v_nuevo := replace(v_nuevo,
    E'public.perro_faltantes_alta(v_raza, v_raza_id, v_tam, v_pel)',
    E'public.perro_faltantes_alta(v_raza, v_raza_id, v_tam, v_pel, v_esp)');
  v_nuevo := replace(v_nuevo,
    E'case when v_clin and v_esp = ''otro'' then',
    E'case when v_esp = ''otro'' then');
  -- Un gato u «otro» no lleva tamaño ni pelaje (son del precio de estética de un perro).
  v_nuevo := replace(v_nuevo,
    E'    select b.perro_id, b.perro_cliente_id into v_h_id, v_h_cli from public.importacion_buscar_perro(v_cli, v_micro, d->>''m_nombre'', v_esp) b;',
    E'    if v_esp <> ''perro'' then\n      v_tam := null;\n      v_pel := null;\n    end if;\n    select b.perro_id, b.perro_cliente_id into v_h_id, v_h_cli from public.importacion_buscar_perro(v_cli, v_micro, d->>''m_nombre'', v_esp) b;');
  if v_nuevo = v_def
     or position('modulo_activo(''veterinaria'')' in v_nuevo) = 0
     or position('importacion_raza(d->>''m_raza'', v_esp)' in v_nuevo) = 0
     or position('v_tam, v_pel, v_esp)' in v_nuevo) = 0
     or position('if v_esp <> ''perro'' then' in v_nuevo) = 0
     or position('v_clin and v_esp' in v_nuevo) > 0 then
    raise exception 'importacion_procesar_fila: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'importacion_revisar';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def,
    E'public.importacion_raza(e->>''raza'')',
    E'public.importacion_raza(e->>''raza'', coalesce(nullif(e->>''especie'', ''''), ''perro''))');
  v_nuevo := replace(v_nuevo,
    E'v_raza, v_tam, v_pel);',
    E'v_raza, v_tam, v_pel, coalesce(nullif(e->>''especie'', ''''), ''perro''));');
  if v_nuevo = v_def
     or position('importacion_raza(e->>''raza'', coalesce' in v_nuevo) = 0
     or position('v_tam, v_pel, coalesce' in v_nuevo) = 0 then
    raise exception 'importacion_revisar: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;
end;
$$;

-- ── 4. Gatos con raza de perro ──
with gato as (
  select
    (select r.id from public.razas r where r.especie = 'gato' and r.nombre = 'Mestizo' and r.deleted_at is null) as mestizo,
    (select r.id from public.razas r where r.especie = 'gato' and r.nombre = 'Doméstico de pelo corto' and r.deleted_at is null) as domestico
)
update public.perros p
set raza_id = case
      when coalesce(rp.es_desconocida, false) or rp.nombre ~* 'mestiz|criollo|cruza' then gato.mestizo
      else gato.domestico
    end
from public.razas rp, gato
where p.especie = 'gato'
  and p.raza_id = rp.id
  and rp.especie = 'perro'
  and gato.mestizo is not null and gato.domestico is not null;
