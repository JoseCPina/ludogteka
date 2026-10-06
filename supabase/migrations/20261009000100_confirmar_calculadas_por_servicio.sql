-- confirmar_tarifas_calculadas puede limitarse a un servicio (la pantalla de
-- tarifas de un servicio confirma solo lo que muestra).
drop function public.confirmar_tarifas_calculadas(uuid);
create or replace function public.confirmar_tarifas_calculadas(p_grupo_id uuid, p_servicio_id uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n int;
  v_ids jsonb;
begin
  if not coalesce(public.tiene_permiso('tarifas'), false) then
    raise exception 'Confirmar precios es de admin o de quien tenga el permiso «Precios y tarifas».' using errcode = '42501';
  end if;
  if not exists (select 1 from public.grupos_raza where id = p_grupo_id and negocio_id = public.negocio_actual() and deleted_at is null) then
    raise exception 'Ese grupo no existe en este negocio.';
  end if;
  select coalesce(jsonb_agg(t.id), '[]'::jsonb) into v_ids
  from public.tarifas t
  where t.grupo_raza_id = p_grupo_id and t.calculado and t.deleted_at is null and (p_servicio_id is null or t.servicio_id = p_servicio_id);
  update public.tarifas set calculado = false
  where grupo_raza_id = p_grupo_id and calculado and deleted_at is null and (p_servicio_id is null or servicio_id = p_servicio_id);
  get diagnostics v_n = row_count;
  insert into public.tarifas_eventos (negocio_id, accion, grupo_raza_id, detalle, actor)
  values (public.negocio_actual(), 'confirmar_calculadas', p_grupo_id,
          jsonb_build_object('tarifas', v_ids, 'cuantas', v_n, 'servicio_id', p_servicio_id), auth.uid());
  return v_n;
end;
$$;
alter function public.confirmar_tarifas_calculadas(uuid, uuid) owner to peludesk_definer;
revoke execute on function public.confirmar_tarifas_calculadas(uuid, uuid) from public, anon;
grant execute on function public.confirmar_tarifas_calculadas(uuid, uuid) to authenticated, service_role;
