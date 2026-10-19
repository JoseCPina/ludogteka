-- QA N43, ajuste: si TODO lo que cambió el registro desde la versión leída lo hizo la misma persona (otra pestaña,
-- otro panel de la misma pantalla: cargos de la consulta, una vacuna aplicada…), no es un conflicto. Solo cuenta
-- lo que hizo OTRA persona; un cambio sin autor anotado (el sistema) también se avisa.
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
  if date_trunc('milliseconds', v_actual) = date_trunc('milliseconds', v_leida) then
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

create or replace function public.concurrencia_solo_mios(p_tabla text, p_id uuid, p_desde timestamptz, p_yo uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
           select 1 from public.registro_ediciones e
            where e.tabla = p_tabla and e.registro_id = p_id and e.ultimo_at > p_desde
              and e.negocio_id = public.negocio_actual())
     and not exists (
           select 1 from public.registro_ediciones e
            where e.tabla = p_tabla and e.registro_id = p_id and e.ultimo_at > p_desde
              and e.negocio_id = public.negocio_actual()
              and e.profile_id is distinct from p_yo);
$$;
alter function public.concurrencia_solo_mios(text, uuid, timestamptz, uuid) owner to peludesk_definer;
revoke execute on function public.concurrencia_solo_mios(text, uuid, timestamptz, uuid) from public, anon;
grant execute on function public.concurrencia_solo_mios(text, uuid, timestamptz, uuid) to authenticated, service_role;
