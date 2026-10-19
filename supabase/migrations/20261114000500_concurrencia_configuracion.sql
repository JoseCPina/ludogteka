-- QA N43, configuración del negocio: el horario son varias filas (una por día, versionadas) y políticas, cupo y
-- ajustes de Veterinaria son una fila por negocio. Su «registro» es el negocio: la pantalla manda
-- `{t: <tabla>, i: <negocio>, v: <la última actualización que vio>}`. Para eso el disparador compara «cambió
-- DESPUÉS de lo que se vio» (antes: «es distinta»), lo que para una fila suelta es lo mismo.

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
  raise exception 'Alguien más cambió este registro mientras lo tenías abierto.'
    using errcode = 'PT409', detail = v_det::text, hint = 'conflicto_version';
end;
$$;
revoke execute on function public.concurrencia_antes() from public, anon;
grant execute on function public.concurrencia_antes() to authenticated, service_role;

do $$
declare
  t text;
begin
  foreach t in array array['horario_semana', 'negocio_politicas', 'cupo_configuracion', 'veterinaria_ajustes'] loop
    execute format('drop trigger if exists concurrencia_antes on public.%I', t);
    execute format('drop trigger if exists concurrencia_despues on public.%I', t);
    execute format('create trigger concurrencia_antes before update on public.%I for each row execute function public.concurrencia_antes(%L)', t, 'negocio_id');
    execute format('create trigger concurrencia_despues after update on public.%I for each row execute function public.concurrencia_despues(%L)', t, 'negocio_id');
  end loop;
end $$;

-- La bitácora marca «guardó encima» solo si de verdad había un cambio posterior a lo que se vio.
do $$
declare
  d text := pg_get_functiondef('public.concurrencia_despues()'::regprocedure);
begin
  d := replace(d,
    'and date_trunc(''milliseconds'', v_antes) <> date_trunc(''milliseconds'', v_leida)',
    'and date_trunc(''milliseconds'', v_antes) > date_trunc(''milliseconds'', v_leida)');
  execute d;
end $$;
