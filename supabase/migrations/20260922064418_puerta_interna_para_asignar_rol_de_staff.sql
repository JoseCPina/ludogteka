-- Invitar staff estaba roto desde el 10 de septiembre de 2026.
--
-- POST /api/staff/invite crea la cuenta con generateLink y luego pone el
-- rol en profiles con la secret key. Desde el arreglo de guardias
-- (current_rol() devuelve 'anonimo' sin sesión, is_admin() va con
-- coalesce), el trigger proteger_columnas_sensibles_profile rechaza ese
-- UPDATE: "Solo un admin puede modificar el rol de un profile". Antes
-- pasaba porque el guardia evaluaba a NULL — el mismo agujero que se
-- cerró, y esta ruta dependía de él sin que nadie lo supiera.
--
-- El arreglo no es aflojar el guardia, es darle a lo interno una puerta
-- con nombre, igual que app.vinculacion_interna: una RPC que solo puede
-- ejecutar service_role, que prende `app.asignacion_rol_interna` LOCAL A
-- LA TRANSACCIÓN (set_config con true) y hace el UPDATE ahí mismo. Por
-- PostgREST cada petición es su propia transacción, así que la puerta
-- nunca queda abierta para nadie más, y ningún usuario con sesión puede
-- ejecutar la RPC.

create or replace function public.proteger_columnas_sensibles_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol
     and not coalesce(public.is_admin(), false)
     and coalesce(current_setting('app.asignacion_rol_interna', true), '') <> 'on' then
    raise exception 'Solo un admin puede modificar el rol de un profile';
  end if;

  if new.sucursal_id is distinct from old.sucursal_id and not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede modificar la sucursal de un profile';
  end if;

  if new.cliente_id is distinct from old.cliente_id
     and not (coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion'))
     and coalesce(current_setting('app.vinculacion_interna', true), '') <> 'on' then
    raise exception 'Solo admin o recepción pueden vincular o desvincular un cliente';
  end if;

  return new;
end;
$$;

-- La puerta. Es deliberadamente estrecha: solo los roles que la ruta
-- puede invitar, y solo sobre una cuenta que todavía es 'cliente' (la
-- recién creada). Un profile que ya es staff no se toca por aquí: eso
-- es de un admin con sesión, como siempre.
create or replace function public.asignar_rol_staff(
  p_user_id uuid,
  p_rol text,
  p_nombre_completo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol_actual text;
begin
  if p_rol not in ('recepcion', 'estetica') then
    raise exception 'Rol no invitable: %', p_rol;
  end if;

  select rol into v_rol_actual from public.profiles where id = p_user_id;
  if v_rol_actual is null then
    raise exception 'La cuenta no existe todavía.';
  end if;
  if v_rol_actual <> 'cliente' then
    raise exception 'Esa cuenta ya tiene rol %; no se reasigna por invitación.', v_rol_actual;
  end if;

  perform set_config('app.asignacion_rol_interna', 'on', true);

  update public.profiles
  set rol = p_rol,
      nombre_completo = coalesce(nullif(btrim(coalesce(p_nombre_completo, '')), ''), nombre_completo)
  where id = p_user_id;
end;
$$;

-- Solo service_role. Nombrar a anon y authenticated explícitamente: el
-- ALTER DEFAULT PRIVILEGES del proyecto les concede EXECUTE a cada
-- función nueva, y `from public` no se los quita.
revoke execute on function public.asignar_rol_staff(uuid, text, text) from public;
revoke execute on function public.asignar_rol_staff(uuid, text, text) from anon;
revoke execute on function public.asignar_rol_staff(uuid, text, text) from authenticated;
grant execute on function public.asignar_rol_staff(uuid, text, text) to service_role;
