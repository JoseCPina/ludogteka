-- QA R34: recetas emitidas antes de N112 cuyo texto libre de indicaciones solo repite lo que dicen sus campos
-- (dosis, frecuencia y días, a veces con el nombre y la concentración delante: así lo armaba el prellenado antes
-- de N97). El portal lo mostraba dos veces. La pantalla ya no lo muestra (`indicacionRepetida`); aquí se quita
-- de lo guardado, con constancia en plataforma_eventos (`limpiar_indicacion_receta`).

-- ── 1. La regla (gemela de `indicacionRepetida` en src/lib/veterinaria/recetas.ts) ──
create or replace function public.vet_texto_comparable(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select btrim(regexp_replace(regexp_replace(regexp_replace(
           lower(translate(coalesce(p, ''), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
           '\m(via|por|cada)\M', ' ', 'g'),
           '[^a-z0-9/]+', ' ', 'g'),
           '\s+', ' ', 'g'));
$$;
revoke execute on function public.vet_texto_comparable(text) from public, anon;
grant execute on function public.vet_texto_comparable(text) to authenticated, service_role, peludesk_definer;

create or replace function public.vet_indicacion_repetida(
  p_producto text, p_presentacion text, p_dosis text, p_via text, p_frecuencia text, p_dias int, p_texto text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_c text := public.vet_texto_comparable(p_texto);
  v_frec text := btrim(coalesce(p_frecuencia, ''));
  v_dias text := case when coalesce(p_dias, 0) > 0 then 'por ' || p_dias || case when p_dias = 1 then ' día' else ' días' end else '' end;
  v_gen text;
  v_renglon text;
  v_pre text;
  v_sin_nombre text;
  v_sin_conc text;
  t text;
begin
  if v_c = '' then return true; end if;
  v_frec := lower(left(v_frec, 1)) || substr(v_frec, 2);
  v_gen := public.vet_texto_comparable(concat_ws(' ', nullif(btrim(p_dosis), ''), nullif(v_frec, ''), nullif(v_dias, '')));
  v_renglon := public.vet_texto_comparable(concat_ws(', ', nullif(btrim(p_producto), ''), nullif(btrim(p_dosis), ''),
                 case when btrim(coalesce(p_via, '')) <> '' then 'vía ' || lower(btrim(p_via)) end, nullif(v_frec, ''), nullif(v_dias, '')));
  -- Sin el nombre del medicamento delante.
  v_pre := public.vet_texto_comparable(p_producto);
  v_sin_nombre := case when v_pre <> '' and (v_c = v_pre or v_c like v_pre || ' %') then btrim(substr(v_c, length(v_pre) + 1)) else v_c end;
  -- Sin la presentación o una concentración («1 mg», «0.1 mg/kg») delante de la dosis.
  v_pre := public.vet_texto_comparable(p_presentacion);
  v_sin_conc := case when v_pre <> '' and (v_sin_nombre = v_pre or v_sin_nombre like v_pre || ' %') then btrim(substr(v_sin_nombre, length(v_pre) + 1)) else v_sin_nombre end;
  v_sin_conc := btrim(regexp_replace(v_sin_conc, '^\d+( \d+)? ?(mg|mcg|g|ui)(/(kg|ml))? ', ''));
  foreach t in array array[v_c, v_sin_nombre, v_sin_conc] loop
    if t = v_gen or (t <> '' and position(t in v_renglon) > 0) or (t = '' and t <> v_c) then return true; end if;
  end loop;
  return false;
end;
$$;
revoke execute on function public.vet_indicacion_repetida(text, text, text, text, text, int, text) from public, anon;
grant execute on function public.vet_indicacion_repetida(text, text, text, text, text, int, text) to authenticated, service_role, peludesk_definer;

-- ── 2. Acción nueva de la bitácora de la plataforma (se suma a la lista vigente) ──
do $$
declare
  v_def text;
  v_acciones text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  v_acciones := string_to_array((regexp_match(v_def, '\{([^}]*)\}'))[1], ',');
  if coalesce(array_length(v_acciones, 1), 0) < 10 then raise exception 'plataforma_eventos_accion_check cambió de forma: no se pudo leer la lista de acciones.'; end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || array['limpiar_indicacion_receta']) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

-- La misma fórmula de `vet_receta_hash`, sin acotar al negocio de la petición: `vet_receta_hash` es de
-- peludesk_definer y en una migración (sin negocio) no ve la receta y devuelve NULL. Solo para reparaciones.
create or replace function public._vet_receta_hash_migracion(p_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select encode(sha256(convert_to(jsonb_build_object(
    'numero', r.numero, 'fecha', r.fecha_emision, 'perro', r.perro_id, 'medico', r.medico_id, 'diagnostico', r.diagnostico, 'observaciones', r.observaciones,
    'lineas', coalesce((select jsonb_agg(jsonb_build_array(l.producto, l.principio_activo, l.presentacion, l.dosis, l.via, l.frecuencia,
                                                           l.duracion_dias, l.tiempo_retiro, l.cantidad_surtir, l.cantidad_unidad, l.indicaciones) order by l.orden, l.id)
                        from public.vet_receta_lineas l where l.receta_id = r.id and l.deleted_at is null), '[]'::jsonb))::text, 'UTF8')), 'hex')
  from public.vet_recetas r where r.id = p_id;
$$;
revoke execute on function public._vet_receta_hash_migracion(uuid) from public, anon, authenticated;

-- ── 3. Reparación: líneas de recetas emitidas antes de N112 (PR #146, 21 oct 2026 20:36 UTC) ──
-- Solo se vacía el texto libre que repite los campos; nada más de la receta cambia. La huella de la receta se
-- recalcula con su misma fórmula (`vet_receta_hash`) y la de antes queda en el evento.
do $$
declare
  rc record;
  v_lineas jsonb;
  v_n int := 0;
  v_l int := 0;
  v_hash_nuevo text;
begin
  alter table public.vet_receta_lineas disable trigger user;
  alter table public.vet_recetas disable trigger user;
  for rc in
    select r.id, r.negocio_id, r.numero, r.hash_contenido
      from public.vet_recetas r
     where r.deleted_at is null and r.created_at < '2026-10-21T20:36:38Z'
     order by r.created_at
  loop
    select coalesce(jsonb_agg(jsonb_build_object('linea_id', l.id, 'producto', l.producto, 'indicaciones_antes', l.indicaciones) order by l.orden, l.id), '[]'::jsonb)
      into v_lineas
      from public.vet_receta_lineas l
     where l.receta_id = rc.id and l.deleted_at is null and btrim(coalesce(l.indicaciones, '')) <> ''
       and public.vet_indicacion_repetida(l.producto, l.presentacion, l.dosis, l.via, l.frecuencia, l.duracion_dias, l.indicaciones);
    continue when jsonb_array_length(v_lineas) = 0;
    update public.vet_receta_lineas set indicaciones = null
     where id in (select (e ->> 'linea_id')::uuid from jsonb_array_elements(v_lineas) e);
    v_hash_nuevo := case when rc.hash_contenido is null then null else public._vet_receta_hash_migracion(rc.id) end;
    update public.vet_recetas set hash_contenido = v_hash_nuevo where id = rc.id and hash_contenido is distinct from v_hash_nuevo;
    insert into public.plataforma_eventos (accion, negocio_id, motivo, detalle)
    values ('limpiar_indicacion_receta', rc.negocio_id, 'QA R34: indicación que repetía los campos del medicamento',
            jsonb_build_object('receta_id', rc.id, 'numero', rc.numero, 'lineas', v_lineas,
                               'hash_antes', rc.hash_contenido, 'hash_nuevo', v_hash_nuevo));
    v_n := v_n + 1;
    v_l := v_l + jsonb_array_length(v_lineas);
  end loop;
  alter table public.vet_recetas enable trigger user;
  alter table public.vet_receta_lineas enable trigger user;
  raise notice 'Recetas reparadas: % (líneas: %)', v_n, v_l;
end $$;
