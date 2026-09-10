-- El cliente se identifica por TELÉFONO, no por correo.
--
-- Por qué: de 15 clientes en producción, la mayoría no tiene correo y
-- todos tienen WhatsApp. Pedirle un correo a alguien que va a dejar a su
-- perro dos horas es pedirle el dato que menos recuerda, y el que más se
-- teclea mal. El correo se queda, opcional, para quien lo quiera dar.
--
-- No hay verificación del número (nada de SMS, decisión del negocio), y
-- eso pone TODO el peso en la regla de abajo: un teléfono que ya tiene
-- cuenta no se puede volver a registrar. Sin esa regla, cualquiera que
-- teclee mal un dígito se llevaría el expediente de otro, o crearía un
-- segundo expediente para el mismo perro.
--
-- Cuerpo tomado de 20260910043753_add_contratos_al_alta_por_link.sql y
-- parcheado en la identidad del cliente y en la cuenta: el resto —los
-- perros, la raza, los contratos del flujo— es el mismo que ya corría.

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
  v_contratos jsonb := '[]'::jsonb;
  v_contrato record;
  v_contrato_id uuid;
  v_nombre text;
  v_telefono text;
  v_existente public.clientes%rowtype;
  v_tiene_cuenta boolean;
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
  if v_telefono !~ '^[0-9]{10}$' then
    raise exception 'El teléfono debe tener diez dígitos.';
  end if;

  -- El teléfono es la identidad del cliente, y no hay verificación por SMS
  -- detrás: lo único que impide que dos personas terminen peleándose un
  -- expediente es esta decisión, tomada dentro de la misma transacción que
  -- crea todo.
  --
  --   * Ya hay expediente CON cuenta  -> se rechaza. Sin verificar el
  --     número no podemos distinguir al dueño de alguien que se equivocó
  --     de dígito, y crear una segunda cuenta partiría el historial del
  --     perro en dos.
  --   * Ya hay expediente SIN cuenta  -> se le pone la cuenta a ESE
  --     expediente. Es el caso normal de este negocio: recepción capturó
  --     al cliente hace meses y hoy se registra. Crear uno nuevo dejaría
  --     sus perros, sus contratos y sus cobros del otro lado.
  --   * No hay expediente            -> se crea, como siempre.
  select * into v_existente
  from public.clientes
  where telefono = v_telefono and deleted_at is null;

  if found then
    select exists (select 1 from public.profiles where cliente_id = v_existente.id)
      into v_tiene_cuenta;

    if v_tiene_cuenta then
      raise exception 'Ya hay una cuenta registrada con ese teléfono. Si es tuya, inicia sesión; si no la recuerdas, pídele a recepción que te la restablezca.'
        using errcode = 'P0001';
    end if;
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
  if v_existente.id is not null then
    -- Expediente que ya existía: se completan sus huecos, nunca se pisa lo
    -- que recepción ya había capturado y verificado. Mismo criterio que
    -- completar_expediente_cliente.
    v_cliente_id := v_existente.id;

    update public.clientes
    set
      email = coalesce(
        nullif(btrim(coalesce(email, '')), ''),
        nullif(btrim(coalesce(p_cliente->>'email', '')), '')
      ),
      direccion = coalesce(
        nullif(btrim(coalesce(direccion, '')), ''),
        nullif(btrim(coalesce(p_cliente->>'direccion', '')), '')
      ),
      alta_por_cliente = true
    where id = v_cliente_id;
  else
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
  end if;

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

    -- El contrato del flujo por el que entró, pendiente de firma. Se
    -- inserta a mano y no por generar_contrato() porque esa funcion exige
    -- current_rol() in ('admin','recepcion') y aqui no hay nadie con
    -- sesion: el permiso lo dio el token, que ya se valido arriba.
    for v_contrato in
      select * from public.tipos_contrato_de_alta(v_invitacion.tipo)
    loop
      insert into public.contratos (perro_id, cliente_id, plantilla_id, created_by)
      values (v_perro_id, v_cliente_id, v_contrato.plantilla_id, p_user_id)
      returning id into v_contrato_id;

      v_contratos := v_contratos || jsonb_build_object(
        'id', v_contrato_id,
        'perro_id', v_perro_id,
        'perro_nombre', btrim(v_perro->>'nombre'),
        'tipo_nombre', v_contrato.tipo_nombre
      );
    end loop;
  end loop;

  -- La cuenta es opcional desde que estética se da de alta sin ella: quien
  -- solo viene a bañar a su perro no necesariamente quiere un portal. Sin
  -- cuenta el expediente queda igual de completo; lo único que no tiene es
  -- quién entre a verlo.
  if p_user_id is not null then
    perform set_config('app.vinculacion_interna', 'on', true);

    update public.profiles
    set cliente_id = v_cliente_id, rol = 'cliente'
    where id = p_user_id and cliente_id is null;

    if not found then
      raise exception 'Esa cuenta ya está ligada a un expediente.';
    end if;
  end if;

  -- Queda en la misma bitácora que el resto de las vinculaciones: quién
  -- accede al expediente de quién se audita igual, venga de recepción, de
  -- la coincidencia por correo o de un alta por link.
  if p_user_id is not null then
    insert into public.vinculacion_eventos (profile_id, cliente_id, accion, actor_id, automatico)
    values (p_user_id, v_cliente_id, 'vincular', p_user_id, true);
  end if;

  update public.invitaciones_cliente
  set usada_at = now(), cliente_id = v_cliente_id
  where id = v_invitacion.id;

  return jsonb_build_object(
    'cliente_id', v_cliente_id,
    'perros', v_perros_creados,
    'contratos', v_contratos
  );
end;
$$;

revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from public;
revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from anon;
revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from authenticated;
grant execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) to service_role;
