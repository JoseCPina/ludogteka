-- Consecuencia directa de tapar el agujero de la migración anterior, y la
-- razón por la que valió la pena correr la regresión completa antes de
-- desplegar: DOS funciones internas dependían del mismo bug para poder
-- hacer su trabajo.
--
-- El trigger proteger_columnas_sensibles_profile() exige rol admin o
-- recepción para cambiar profiles.cliente_id. Cuando current_rol()
-- devolvía NULL para un contexto sin sesión, ese guardia no se disparaba y
-- las funciones internas pasaban de largo sin que nadie lo notara:
--
--   * vincular_cliente_por_email() — la vinculación automática por correo
--     al confirmar una cuenta (Fase 1), que corre desde un trigger de
--     auth.users donde no hay auth.uid() ninguno. Peor todavía: esa
--     función captura `when others` y solo deja un `raise warning`, así
--     que tras el arreglo habría dejado de vincular EN SILENCIO.
--   * completar_alta_cliente() — el alta por link de esta misma fase, que
--     corre desde el servidor con la secret key. Esa sí tronaba de frente
--     ("Solo admin o recepción pueden vincular o desvincular un cliente").
--
-- El arreglo no es aflojar el guardia, es darle a lo interno una puerta
-- con nombre. `app.vinculacion_interna` se pone con set_config(..., true):
-- el `true` la hace LOCAL A LA TRANSACCIÓN, así que desaparece al
-- terminar y no puede quedarse encendida para la siguiente petición.
--
-- Por qué un cliente no puede encenderla y colgarse del expediente de
-- otro: para que le sirviera tendría que ejecutar set_config y el UPDATE
-- en la MISMA transacción, y por PostgREST cada petición es su propia
-- transacción. No hay ninguna función expuesta que llame a set_config,
-- así que no tiene forma de prenderla. Su política de RLS
-- (profiles_update_propio) lo deja tocar su propia fila, pero este mismo
-- trigger le sigue bloqueando cliente_id.
create or replace function public.proteger_columnas_sensibles_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol is distinct from old.rol and not public.is_admin() then
    raise exception 'Solo un admin puede modificar el rol de un profile';
  end if;

  if new.sucursal_id is distinct from old.sucursal_id and not public.is_admin() then
    raise exception 'Solo un admin puede modificar la sucursal de un profile';
  end if;

  if new.cliente_id is distinct from old.cliente_id
     and not (public.current_rol() in ('admin', 'recepcion'))
     and coalesce(current_setting('app.vinculacion_interna', true), '') <> 'on' then
    raise exception 'Solo admin o recepción pueden vincular o desvincular un cliente';
  end if;

  return new;
end;
$$;

-- La vinculación automática por correo, con la puerta declarada. El cuerpo
-- es el mismo de la Fase 1 (incluido su `when others`, que sigue teniendo
-- sentido: si esto falla, el signup NO debe tronar — la cuenta queda sin
-- vincular y aparece en la cola de /vinculacion, que es un problema de
-- recepción, no del dueño que se acaba de registrar).
create or replace function public.vincular_cliente_por_email(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_confirmado boolean;
  v_ids uuid[];
begin
  select email, (email_confirmed_at is not null)
    into v_email, v_confirmado
  from auth.users
  where id = p_user_id;

  if v_email is null or not v_confirmado then
    return;
  end if;

  select array_agg(id)
    into v_ids
  from public.clientes
  where lower(email) = lower(v_email)
    and deleted_at is null;

  if array_length(v_ids, 1) = 1 then
    perform set_config('app.vinculacion_interna', 'on', true);

    update public.profiles
    set cliente_id = v_ids[1]
    where id = p_user_id
      and cliente_id is null
      and rol = 'cliente';

    if found then
      insert into public.vinculacion_eventos (profile_id, cliente_id, accion, actor_id, automatico)
      values (p_user_id, v_ids[1], 'vincular', null, true);
    end if;
  end if;
exception
  when others then
    raise warning 'vincular_cliente_por_email fallo para user %: %', p_user_id, sqlerrm;
end;
$$;

-- El alta por link, igual: mismo cuerpo, con la puerta declarada justo
-- antes del UPDATE que vincula.
create or replace function public.completar_alta_cliente(
  p_token text,
  p_user_id uuid,
  p_cliente jsonb,
  p_perros jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitacion public.invitaciones_cliente%rowtype;
  v_cliente_id uuid;
  v_perro jsonb;
  v_perro_id uuid;
  v_perros_creados jsonb := '[]'::jsonb;
  v_nombre text;
  v_telefono text;
begin
  select * into v_invitacion
  from public.invitaciones_cliente
  where token = p_token and deleted_at is null
  for update;

  if not found then
    raise exception 'Este link de alta no existe.' using errcode = 'P0001';
  end if;
  if v_invitacion.cancelada_at is not null then
    raise exception 'Este link de alta fue cancelado. Pídele uno nuevo a recepción.';
  end if;
  if v_invitacion.usada_at is not null then
    raise exception 'Este link de alta ya se usó.';
  end if;
  if v_invitacion.expira_at <= now() then
    raise exception 'Este link de alta ya venció. Pídele uno nuevo a recepción.';
  end if;

  v_nombre := btrim(coalesce(p_cliente->>'nombre', ''));
  v_telefono := btrim(coalesce(p_cliente->>'telefono', ''));
  if v_nombre = '' then
    raise exception 'Escribe tu nombre.';
  end if;
  if v_telefono = '' then
    raise exception 'Escribe tu teléfono.';
  end if;
  if p_perros is null or jsonb_array_length(p_perros) = 0 then
    raise exception 'Agrega al menos un perro.';
  end if;

  insert into public.clientes (
    nombre, telefono, email, alta_por_cliente, created_by
  )
  values (
    v_nombre,
    v_telefono,
    nullif(btrim(coalesce(p_cliente->>'email', '')), ''),
    true,
    p_user_id
  )
  returning id into v_cliente_id;

  for v_perro in select * from jsonb_array_elements(p_perros)
  loop
    if btrim(coalesce(v_perro->>'nombre', '')) = '' then
      raise exception 'Cada perro necesita un nombre.';
    end if;

    insert into public.perros (
      cliente_id, nombre, raza, sexo, fecha_nacimiento, tamano_id, pelaje_id,
      alimentacion_notas,
      contacto_emergencia_nombre, contacto_emergencia_telefono,
      veterinario_nombre, veterinario_telefono, veterinario_clinica,
      created_by
    )
    values (
      v_cliente_id,
      btrim(v_perro->>'nombre'),
      nullif(btrim(coalesce(v_perro->>'raza', '')), ''),
      nullif(btrim(coalesce(v_perro->>'sexo', '')), ''),
      nullif(btrim(coalesce(v_perro->>'fecha_nacimiento', '')), '')::date,
      nullif(btrim(coalesce(v_perro->>'tamano_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_perro->>'pelaje_id', '')), '')::uuid,
      nullif(btrim(coalesce(v_perro->>'alimentacion_notas', '')), ''),
      nullif(btrim(coalesce(v_perro->>'contacto_emergencia_nombre', '')), ''),
      nullif(btrim(coalesce(v_perro->>'contacto_emergencia_telefono', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_nombre', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_telefono', '')), ''),
      nullif(btrim(coalesce(v_perro->>'veterinario_clinica', '')), ''),
      p_user_id
    )
    returning id into v_perro_id;

    v_perros_creados := v_perros_creados || jsonb_build_object(
      'id', v_perro_id,
      'nombre', btrim(v_perro->>'nombre')
    );
  end loop;

  perform set_config('app.vinculacion_interna', 'on', true);

  update public.profiles
  set cliente_id = v_cliente_id, rol = 'cliente'
  where id = p_user_id and cliente_id is null;

  if not found then
    raise exception 'Esa cuenta ya está ligada a un expediente.';
  end if;

  -- Queda en la misma bitácora que el resto de las vinculaciones: quién
  -- accede al expediente de quién se audita igual, venga de recepción, de
  -- la coincidencia por correo o de un alta por link.
  insert into public.vinculacion_eventos (profile_id, cliente_id, accion, actor_id, automatico)
  values (p_user_id, v_cliente_id, 'vincular', p_user_id, true);

  update public.invitaciones_cliente
  set usada_at = now(), cliente_id = v_cliente_id
  where id = v_invitacion.id;

  return jsonb_build_object('cliente_id', v_cliente_id, 'perros', v_perros_creados);
end;
$$;

revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from public;
revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from anon;
revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from authenticated;
grant execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) to service_role;
