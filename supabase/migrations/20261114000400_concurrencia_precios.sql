-- QA N43: los precios de un servicio (`tarifas`, `tarifas_dia_semana`) no se editan: cada guardado inserta filas
-- nuevas con su vigencia. El control de concurrencia de un UPDATE no les aplica, así que el «registro» es la lista
-- de precios del servicio: la pantalla manda `{t: 'precios_servicio', i: <servicio>, v: <la última captura que vio>}`
-- y, si desde entonces OTRA persona capturó precios de ese servicio, la base no guarda y dice quién y qué.

create or replace function public.concurrencia_precios_detalle(p_servicio uuid, p_desde timestamptz, p_yo uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_quien uuid;
  v_cuando timestamptz;
  v_precio numeric;
begin
  select x.created_by, x.created_at, x.precio into v_quien, v_cuando, v_precio
  from (
    select t.created_by, t.created_at, t.precio from public.tarifas t
     where t.servicio_id = p_servicio and t.negocio_id = public.negocio_actual() and date_trunc('milliseconds', t.created_at) > date_trunc('milliseconds', p_desde)
       and t.created_by is distinct from p_yo
    union all
    select d.created_by, d.created_at, d.precio from public.tarifas_dia_semana d
     where d.servicio_id = p_servicio and d.negocio_id = public.negocio_actual() and date_trunc('milliseconds', d.created_at) > date_trunc('milliseconds', p_desde)
       and d.created_by is distinct from p_yo
  ) x
  order by x.created_at desc
  limit 1;
  if v_cuando is null then
    return null;
  end if;
  return jsonb_build_object(
    'tabla', 'precios_servicio',
    'id', p_servicio,
    'quien', case when v_quien is null then null else public.nombre_de_persona(v_quien, null) end,
    'quien_id', v_quien,
    'cuando', v_cuando,
    'cambios', case when v_precio is null then '{}'::jsonb else jsonb_build_object('precio', jsonb_build_array(null, v_precio)) end,
    'version_actual', v_cuando,
    'version_leida', p_desde
  );
end;
$$;
alter function public.concurrencia_precios_detalle(uuid, timestamptz, uuid) owner to peludesk_definer;
revoke execute on function public.concurrencia_precios_detalle(uuid, timestamptz, uuid) from public, anon;
grant execute on function public.concurrencia_precios_detalle(uuid, timestamptz, uuid) to authenticated, service_role;

create or replace function public.concurrencia_precios_antes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_leida timestamptz;
  v_det jsonb;
begin
  v_leida := public.concurrencia_version_leida('precios_servicio', new.servicio_id);
  if v_leida is null or public.concurrencia_forzar() then
    return new;
  end if;
  v_det := public.concurrencia_precios_detalle(new.servicio_id, v_leida, auth.uid());
  if v_det is null then
    return new;
  end if;
  raise exception 'Alguien más cambió los precios de este servicio mientras los tenías abiertos.'
    using errcode = 'PT409', detail = v_det::text, hint = 'conflicto_version';
end;
$$;
revoke execute on function public.concurrencia_precios_antes() from public, anon;
grant execute on function public.concurrencia_precios_antes() to authenticated, service_role;

drop trigger if exists concurrencia_precios_ins on public.tarifas;
create trigger concurrencia_precios_ins before insert on public.tarifas
  for each row execute function public.concurrencia_precios_antes();
drop trigger if exists concurrencia_precios_ins on public.tarifas_dia_semana;
create trigger concurrencia_precios_ins before insert on public.tarifas_dia_semana
  for each row execute function public.concurrencia_precios_antes();
