-- El alta por link ahora guarda también la raza del catálogo, no solo el
-- texto que el dueño escribió.
--
-- Es lo que decide el precio de estética: sin raza_id, todo perro dado de
-- alta por link cotiza con el grupo predeterminado, y un shih tzu pagaría
-- como pelo corto de su talla. El texto libre se sigue guardando en
-- `raza` — es lo que se lee en la ficha, y es lo único que queda cuando
-- la raza no está en el catálogo.
--
-- Cuerpo tomado de 20260910023614_add_direccion_a_alta_por_link.sql y
-- parcheado solo en el insert de perros: es el mismo que ya corría.

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

  -- La dirección se guarda tal cual la escribió el dueño. Geocodificarla y
  -- medir la ruta NO pasa aquí a propósito: son llamadas HTTP a Google, y
  -- meterlas dentro de esta transacción significaría que un timeout de un
  -- servicio ajeno tire un alta completa. Lo hace la aplicación justo
  -- después (calcularDistanciaAlta en src/app/alta/acciones.ts), y si
  -- falla, el expediente ya quedó bien y recepción ajusta la distancia a
  -- mano desde la ficha.
  insert into public.clientes (
    nombre, telefono, email, direccion, alta_por_cliente, created_by
  )
  values (
    v_nombre,
    v_telefono,
    nullif(btrim(coalesce(p_cliente->>'email', '')), ''),
    nullif(btrim(coalesce(p_cliente->>'direccion', '')), ''),
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
      cliente_id, nombre, raza, raza_id, sexo, fecha_nacimiento, tamano_id, pelaje_id,
      alimentacion_notas,
      contacto_emergencia_nombre, contacto_emergencia_telefono,
      veterinario_nombre, veterinario_telefono, veterinario_clinica,
      created_by
    )
    values (
      v_cliente_id,
      btrim(v_perro->>'nombre'),
      nullif(btrim(coalesce(v_perro->>'raza', '')), ''),
      -- El id llega solo cuando el dueño escogió del catálogo. Si escribió
      -- una raza que no está, viaja el texto y raza_id se queda en null:
      -- el perro cotiza con el grupo predeterminado, que es lo que la
      -- vista perro_grupo_raza ya resuelve.
      nullif(btrim(coalesce(v_perro->>'raza_id', '')), '')::uuid,
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
