-- N120, texto de la confirmación (QA R41, 24 de octubre de 2026): «Guardar los míos encima» avisaba que «se pierden
-- los cambios que hiciste en la otra pestaña», pero en una cita la recepción reprogramó, el admin corrigió el servicio
-- encima, y quedaron los dos: cada acción escribe solo sus campos. Otras pantallas (la ficha del cliente, la del perro)
-- mandan el formulario completo y ahí sí se sustituye lo de la otra persona en esos campos.
--
-- La base es la única que sabe qué va a pasar: en el momento del conflicto tiene OLD (con lo que cambió la otra
-- persona o pestaña) y NEW (lo que este guardado escribiría). El detalle del conflicto agrega:
--   sustituye: {campo: [lo que puso la otra persona, lo que quedaría]} — campos que ella cambió y este guardado pisa;
--   conserva:  [campo, …] — campos que ella cambió y este guardado deja como están;
--   mios:      {campo: lo que quedaría} — lo que este guardado cambia y ella no tocó.
-- La pantalla arma la confirmación con eso («Se guarda tu cambio de servicio; la hora que puso QA Recepción se
-- conserva»). Las columnas generadas y updated_at no cuentan.

create or replace function public.concurrencia_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_col text := coalesce(tg_argv[0], 'id');
  v_id uuid := (to_jsonb(old) ->> v_col)::uuid;
  v_leida timestamptz;
  v_actual timestamptz := (to_jsonb(old) ->> 'updated_at')::timestamptz;
  v_det jsonb;
  v_yo uuid := auth.uid();
  v_old jsonb;
  v_new jsonb;
  v_otros jsonb;
  v_fuera text[];
  v_sustituye jsonb := '{}'::jsonb;
  v_conserva jsonb := '[]'::jsonb;
  v_mios jsonb := '{}'::jsonb;
  k text;
begin
  v_leida := public.concurrencia_version_leida(tg_table_name, v_id);
  if v_leida is null or v_actual is null then
    return new;
  end if;
  if v_actual = now() then
    return new;
  end if;
  -- Si la fila no cambió DESPUÉS de lo que la pantalla vio, no hay conflicto (una configuración de varias filas
  -- manda la versión más reciente de todas: las filas más viejas tampoco chocan).
  if date_trunc('milliseconds', v_actual) <= date_trunc('milliseconds', v_leida) then
    return new;
  end if;
  if public.concurrencia_forzar() then
    return new;
  end if;
  if v_yo is not null and public.concurrencia_solo_mios(tg_table_name, v_id, v_leida, v_yo) then
    return new;
  end if;
  v_det := public.concurrencia_detalle(tg_table_name, v_id, v_leida)
    || jsonb_build_object('version_actual', v_actual, 'version_leida', v_leida);

  -- Qué haría este guardado con lo de la otra persona.
  select coalesce(array_agg(a.attname::text), '{}') into v_fuera
    from pg_attribute a
   where a.attrelid = tg_relid and a.attnum > 0 and not a.attisdropped and a.attgenerated <> '';
  v_fuera := v_fuera || array['updated_at', 'created_at', 'created_by'];
  v_old := to_jsonb(old);
  v_new := to_jsonb(new);
  v_otros := coalesce(v_det -> 'cambios', '{}'::jsonb);
  for k in select jsonb_object_keys(v_otros) loop
    continue when k = any (v_fuera) or not (v_old ? k);
    if (v_new -> k) is distinct from (v_old -> k) then
      v_sustituye := v_sustituye || jsonb_build_object(k, jsonb_build_array(v_old -> k, v_new -> k));
    else
      v_conserva := v_conserva || to_jsonb(k);
    end if;
  end loop;
  for k in select jsonb_object_keys(v_new) loop
    continue when k = any (v_fuera) or v_otros ? k;
    if (v_new -> k) is distinct from (v_old -> k) then
      v_mios := v_mios || jsonb_build_object(k, v_new -> k);
    end if;
  end loop;
  v_det := v_det || jsonb_build_object('sustituye', v_sustituye, 'conserva', v_conserva, 'mios', v_mios);

  raise exception 'Alguien más cambió este registro mientras lo tenías abierto.'
    using errcode = 'PT409', detail = v_det::text, hint = 'conflicto_version';
end;
$$;
revoke execute on function public.concurrencia_antes() from public, anon;
grant execute on function public.concurrencia_antes() to authenticated, service_role;
