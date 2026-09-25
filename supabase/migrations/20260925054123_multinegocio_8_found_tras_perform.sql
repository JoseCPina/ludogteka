-- PeluDesk, paso 8.
--
-- En PL/pgSQL, PERFORM también fija FOUND. asignar_rol_staff y
-- vincular_membresia_cliente (paso 2) hacían `select … into v_m`, luego
-- `perform set_config(…)`, y DESPUÉS `if not found`: FOUND ya era el del
-- perform (verdadero), así que nunca creaban la membresía nueva, y como
-- v_m venía vacío tampoco entraban a ninguna otra rama. Sin error: invitar
-- personal y el alta por link de una persona nueva no daban acceso a nadie.
-- Se encontró al armar el negocio de prueba en desarrollo.
--
-- Se decide con una bandera tomada justo después del select.

create or replace function public.asignar_rol_staff(p_user_id uuid, p_rol text, p_nombre_completo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.membresias%rowtype;
  v_hay boolean;
begin
  if p_rol not in ('recepcion', 'estetica') then
    raise exception 'Rol no invitable: %', p_rol;
  end if;
  if public.negocio_actual() is null then
    raise exception 'Falta el negocio de la petición.';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'La cuenta no existe todavía.';
  end if;

  select * into v_m from public.membresias
  where profile_id = p_user_id and negocio_id = public.negocio_actual() and deleted_at is null;
  v_hay := found;

  perform set_config('app.asignacion_rol_interna', 'on', true);
  if not v_hay then
    insert into public.membresias (negocio_id, profile_id, rol, created_by)
    values (public.negocio_actual(), p_user_id, p_rol, auth.uid());
  elsif v_m.rol <> 'cliente' or v_m.cliente_id is not null then
    raise exception 'Esa cuenta ya tiene rol % en este negocio; no se reasigna por invitación.', v_m.rol;
  else
    update public.membresias set rol = p_rol where id = v_m.id;
  end if;

  update public.profiles
  set nombre_completo = coalesce(nullif(btrim(coalesce(p_nombre_completo, '')), ''), nombre_completo)
  where id = p_user_id;
end;
$$;

create or replace function public.vincular_membresia_cliente(p_user_id uuid, p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.membresias%rowtype;
  v_hay boolean;
begin
  if public.negocio_actual() is null then
    raise exception 'Falta el negocio de la petición.';
  end if;
  select * into v_m from public.membresias
  where profile_id = p_user_id and negocio_id = public.negocio_actual() and deleted_at is null
  for update;
  v_hay := found;

  perform set_config('app.vinculacion_interna', 'on', true);
  if not v_hay then
    insert into public.membresias (negocio_id, profile_id, rol, cliente_id, created_by)
    values (public.negocio_actual(), p_user_id, 'cliente', p_cliente_id, p_user_id);
  elsif v_m.rol <> 'cliente' then
    raise exception 'Esa cuenta es del personal de este negocio; para ser cliente aquí usa otro teléfono.';
  elsif v_m.cliente_id is not null and v_m.cliente_id <> p_cliente_id then
    raise exception 'Esa cuenta ya está ligada a un expediente.';
  elsif v_m.cliente_id is null then
    update public.membresias set cliente_id = p_cliente_id where id = v_m.id;
  end if;

  insert into public.vinculacion_eventos (profile_id, cliente_id, accion, actor_id, automatico)
  values (p_user_id, p_cliente_id, 'vincular', p_user_id, true);
end;
$$;
