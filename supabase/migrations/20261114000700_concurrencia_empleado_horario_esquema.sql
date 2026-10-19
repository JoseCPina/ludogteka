-- QA N43, cierre: el horario de un empleado (`guardar_horario_empleado`: da de baja las filas vigentes e inserta
-- las nuevas) y su esquema de pago (`esquemas_pago`: cada cambio es una fila nueva con su fecha) no se editan
-- fila por fila. El «registro» es el conjunto del empleado: la pantalla manda
-- `{t: 'horario_empleado' | 'esquemas_empleado', i: <empleado>, v: <lo último que vio>}` y, si desde entonces OTRA
-- persona capturó o dio de baja algo de ese conjunto, la base no guarda y dice quién.

create or replace function public.concurrencia_conjunto_detalle(p_tabla text, p_col text, p_clave text, p_id uuid, p_desde timestamptz, p_yo uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_quien uuid;
  v_cuando timestamptz;
begin
  -- Filas nuevas de otra persona (fuera de esta misma transacción).
  execute format(
    'select created_by, created_at from public.%I
      where %I = $1 and negocio_id = public.negocio_actual()
        and date_trunc(''milliseconds'', created_at) > date_trunc(''milliseconds'', $2)
        and created_at <> now() and created_by is distinct from $3
      order by created_at desc limit 1', p_tabla, p_col)
    into v_quien, v_cuando using p_id, p_desde, p_yo;
  -- Cambios (bajas) de otra persona sobre filas de ese conjunto.
  if v_cuando is null then
    execute format(
      'select e.profile_id, e.ultimo_at from public.registro_ediciones e
         join public.%I r on r.id = e.registro_id
        where e.tabla = %L and r.%I = $1 and e.negocio_id = public.negocio_actual()
          and date_trunc(''milliseconds'', e.ultimo_at) > date_trunc(''milliseconds'', $2)
          and e.ultimo_at <> now() and e.profile_id is distinct from $3
        order by e.ultimo_at desc limit 1', p_tabla, p_tabla, p_col)
      into v_quien, v_cuando using p_id, p_desde, p_yo;
  end if;
  if v_cuando is null then
    return null;
  end if;
  return jsonb_build_object(
    'tabla', p_clave, 'id', p_id,
    'quien', case when v_quien is null then null else public.nombre_de_persona(v_quien, null) end,
    'quien_id', v_quien, 'cuando', v_cuando, 'cambios', '{}'::jsonb,
    'version_actual', v_cuando, 'version_leida', p_desde);
end;
$$;
alter function public.concurrencia_conjunto_detalle(text, text, text, uuid, timestamptz, uuid) owner to peludesk_definer;
revoke execute on function public.concurrencia_conjunto_detalle(text, text, text, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.concurrencia_conjunto_detalle(text, text, text, uuid, timestamptz, uuid) to authenticated, service_role;

-- Argumentos: clave del conjunto y columna que lo identifica.
create or replace function public.concurrencia_conjunto_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_clave text := tg_argv[0];
  v_col text := tg_argv[1];
  v_id uuid := (to_jsonb(new) ->> v_col)::uuid;
  v_leida timestamptz;
  v_det jsonb;
begin
  v_leida := public.concurrencia_version_leida(v_clave, v_id);
  if v_leida is null or public.concurrencia_forzar() then
    return new;
  end if;
  v_det := public.concurrencia_conjunto_detalle(tg_table_name, v_col, v_clave, v_id, v_leida, auth.uid());
  if v_det is null then
    return new;
  end if;
  raise exception 'Alguien más cambió esto mientras lo tenías abierto.'
    using errcode = 'PT409', detail = v_det::text, hint = 'conflicto_version';
end;
$$;
revoke execute on function public.concurrencia_conjunto_antes() from public, anon;
grant execute on function public.concurrencia_conjunto_antes() to authenticated, service_role;

drop trigger if exists concurrencia_conjunto on public.empleados_horario;
create trigger concurrencia_conjunto before insert or update on public.empleados_horario
  for each row execute function public.concurrencia_conjunto_antes('horario_empleado', 'empleado_id');
drop trigger if exists concurrencia_conjunto on public.esquemas_pago;
create trigger concurrencia_conjunto before insert or update on public.esquemas_pago
  for each row execute function public.concurrencia_conjunto_antes('esquemas_empleado', 'empleado_id');
