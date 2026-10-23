-- QA S27 (N119): «Emitir receta» prellenaba el medicamento desde el Tratamiento cortando el nombre antes de la primera
-- cantidad y dejaba colgando el separador («PRUEBA QA S27 Medicamento ficticio ·»). El prellenado ya limpia el final
-- (`sinSeparadorFinal`, src/lib/veterinaria/recetas.ts). Aquí se reparan las líneas ya guardadas: en producción, la
-- receta N.º 10 de «PRUEBA QA S27 Mascota Vet» (negocio de pruebas «PRUEBA QA Onboarding Vet S16»); la N.º 9 de la
-- misma mascota ya tenía el nombre limpio. Solo cambia `producto` (se le quita el «·», punto, coma, dos puntos,
-- viñeta o guion del final); la huella se recalcula con la misma fórmula y la de antes queda en plataforma_eventos
-- (`limpiar_nombre_receta`). Ver docs/OPERACIONES-PRODUCCION.md.

-- ── 1. Acción nueva de la bitácora de la plataforma (se suma a la lista vigente) ──
do $$
declare
  v_def text;
  v_acciones text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  v_acciones := string_to_array((regexp_match(v_def, '\{([^}]*)\}'))[1], ',');
  if coalesce(array_length(v_acciones, 1), 0) < 10 then raise exception 'plataforma_eventos_accion_check cambió de forma: no se pudo leer la lista de acciones.'; end if;
  v_acciones := (select array_agg(distinct a) from unnest(v_acciones || array['limpiar_nombre_receta']) a);
  alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
  execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
end $$;

-- ── 2. Reparación ──
do $$
declare
  rc record;
  v_lineas jsonb;
  v_n int := 0;
  v_hash_nuevo text;
  v_colgando constant text := '[[:space:]·•.,;:|/–—-]+$';
begin
  alter table public.vet_receta_lineas disable trigger user;
  alter table public.vet_recetas disable trigger user;
  for rc in
    select r.id, r.negocio_id, r.numero, r.hash_contenido
      from public.vet_recetas r
     where r.deleted_at is null
       and exists (select 1 from public.vet_receta_lineas l where l.receta_id = r.id and l.deleted_at is null and l.producto ~ v_colgando)
     order by r.created_at
  loop
    select coalesce(jsonb_agg(jsonb_build_object('linea_id', l.id, 'producto_antes', l.producto, 'producto', btrim(regexp_replace(l.producto, v_colgando, ''))) order by l.orden, l.id), '[]'::jsonb)
      into v_lineas
      from public.vet_receta_lineas l
     where l.receta_id = rc.id and l.deleted_at is null and l.producto ~ v_colgando;
    update public.vet_receta_lineas set producto = btrim(regexp_replace(producto, v_colgando, ''))
     where receta_id = rc.id and deleted_at is null and producto ~ v_colgando;
    v_hash_nuevo := case when rc.hash_contenido is null then null else public._vet_receta_hash_migracion(rc.id) end;
    update public.vet_recetas set hash_contenido = v_hash_nuevo where id = rc.id and hash_contenido is distinct from v_hash_nuevo;
    insert into public.plataforma_eventos (accion, negocio_id, motivo, detalle)
    values ('limpiar_nombre_receta', rc.negocio_id, 'QA S27 (N119): nombre del medicamento con separador colgando',
            jsonb_build_object('receta_id', rc.id, 'numero', rc.numero, 'lineas', v_lineas,
                               'hash_antes', rc.hash_contenido, 'hash_nuevo', v_hash_nuevo));
    v_n := v_n + 1;
  end loop;
  alter table public.vet_recetas enable trigger user;
  alter table public.vet_receta_lineas enable trigger user;
  raise notice 'Recetas reparadas: %', v_n;
end $$;
