-- QA S36: el login separa «Soy del equipo» y su «Olvidé mi contraseña» dice que la restablece un admin de su negocio
-- desde Empleados (o desde Administración → Cuentas, que está aunque el módulo de Empleados esté apagado). Estas son
-- esas puertas: el admin le genera una contraseña temporal a alguien de SU equipo (la Admin API de Auth la pone después,
-- en el servidor, solo con la cuenta que devuelven estas funciones).
create or replace function public.cuenta_del_equipo_para_restablecer(p_profile_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.current_rol() = 'admin', false) then
    raise exception 'Solo un admin restablece la contraseña de alguien del equipo.' using errcode = '42501';
  end if;
  if p_profile_id is null or not exists (
    select 1 from public.membresias m
    where m.profile_id = p_profile_id and m.negocio_id = public.negocio_actual()
      and m.rol in ('admin', 'recepcion', 'estetica') and m.deleted_at is null
  ) then
    raise exception 'Esa cuenta no es del equipo de este negocio.';
  end if;
  if p_profile_id = auth.uid() then
    raise exception 'Tu propia contraseña la cambias tú: «Salir» y «¿Olvidaste tu contraseña?», o pídesela a otro admin.';
  end if;
  if public.persona_en_otro_negocio(p_profile_id) then
    raise exception 'Esta persona usa la misma cuenta en otro negocio de PeluDesk, así que su contraseña no se cambia desde aquí: que la restablezca soporte de PeluDesk.';
  end if;
  return p_profile_id;
end;
$$;
alter function public.cuenta_del_equipo_para_restablecer(uuid) owner to peludesk_definer;
revoke execute on function public.cuenta_del_equipo_para_restablecer(uuid) from public, anon;
grant execute on function public.cuenta_del_equipo_para_restablecer(uuid) to authenticated, service_role;

-- Desde la ficha de Empleados: la cuenta ligada a ese empleado, con las mismas reglas.
create or replace function public.cuenta_de_personal_para_restablecer(p_empleado_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not coalesce(public.current_rol() = 'admin', false) then
    raise exception 'Solo un admin restablece la contraseña de alguien del equipo.' using errcode = '42501';
  end if;
  select e.profile_id into v_id from public.empleados e
  where e.id = p_empleado_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  if v_id is null then
    raise exception 'Esta persona no tiene cuenta en la app. Invítala desde Administración para que entre.';
  end if;
  return public.cuenta_del_equipo_para_restablecer(v_id);
end;
$$;
alter function public.cuenta_de_personal_para_restablecer(uuid) owner to peludesk_definer;
revoke execute on function public.cuenta_de_personal_para_restablecer(uuid) from public, anon;
grant execute on function public.cuenta_de_personal_para_restablecer(uuid) to authenticated, service_role;
