-- Un cliente que ya entró por un flujo y ahora usa el otro no puede
-- volver a capturar todo. Si se dio de alta para bañar a su perro y meses
-- después lo va a dejar en guardería, lo único que le falta es lo que el
-- flujo de estética no le pidió (veterinario, contacto de emergencia,
-- alimentación) y el contrato de guardería. Pedirle otra vez su nombre,
-- su teléfono y los datos de su perro es la manera de que no lo haga.
--
-- Esta función es el complemento: recibe el mismo token de siempre, pero
-- el de una invitación que ya trae cliente_id (ver la migración del tipo),
-- y SOLO RELLENA HUECOS.
--
-- "Solo rellena huecos" es una regla de integridad, no una comodidad: es
-- un formulario público, con la única llave de un link que pudo reenviarse
-- por WhatsApp. Que no pueda sobreescribir un dato ya capturado significa
-- que ni un link filtrado ni un dueño distraído pueden borrar el teléfono
-- del veterinario que recepción verificó. Lo que ya está, se queda; lo que
-- falta, se llena.
create or replace function public.completar_expediente_cliente(
  p_token text,
  p_user_id uuid,
  p_cliente jsonb,
  p_perros jsonb,
  p_perros_nuevos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitacion public.invitaciones_cliente%rowtype;
  v_cliente_id uuid;
  v_profile_actual uuid;
  v_perro jsonb;
  v_perro_id uuid;
  v_perros_tocados jsonb := '[]'::jsonb;
  v_contratos jsonb := '[]'::jsonb;
  v_contrato record;
  v_contrato_id uuid;
  v_fila record;
begin
  select * into v_invitacion
  from public.invitaciones_cliente
  where token = p_token and deleted_at is null
  for update;

  if not found then
    raise exception 'Este link no existe.' using errcode = 'P0001';
  end if;
  if v_invitacion.cancelada_at is not null then
    raise exception 'Este link fue cancelado. Pídele uno nuevo a recepción.';
  end if;
  if v_invitacion.usada_at is not null then
    raise exception 'Este link ya se usó.';
  end if;
  if v_invitacion.expira_at <= now() then
    raise exception 'Este link ya venció. Pídele uno nuevo a recepción.';
  end if;
  if v_invitacion.cliente_id is null then
    raise exception 'Este link es para un alta nueva, no para completar un expediente.';
  end if;

  v_cliente_id := v_invitacion.cliente_id;

  -- La cuenta. Un cliente capturado a mano por recepción puede no tener
  -- ninguna todavía; uno que se dio de alta por link ya la tiene y solo
  -- inició sesión, así que aquí llega con p_user_id nulo.
  select id into v_profile_actual
  from public.profiles
  where cliente_id = v_cliente_id
  limit 1;

  if p_user_id is not null then
    if v_profile_actual is not null and v_profile_actual <> p_user_id then
      raise exception 'Este expediente ya está ligado a otra cuenta. Inicia sesión con ella.';
    end if;
  elsif v_profile_actual is null then
    raise exception 'Este expediente todavía no tiene cuenta. Crea una para continuar.';
  end if;

  -- Del dueño solo se completan los datos que están vacíos. El nombre y
  -- el teléfono no entran: un expediente no existe sin ellos, así que
  -- nunca están vacíos y aceptarlos aquí sería abrir la puerta a
  -- sobreescribirlos.
  update public.clientes
  set
    direccion = coalesce(
      nullif(btrim(coalesce(direccion, '')), ''),
      nullif(btrim(coalesce(p_cliente->>'direccion', '')), '')
    ),
    email = coalesce(
      nullif(btrim(coalesce(email, '')), ''),
      nullif(btrim(coalesce(p_cliente->>'email', '')), '')
    )
  where id = v_cliente_id and deleted_at is null;

  -- Perros que ya existen: mismo criterio campo por campo.
  for v_perro in select * from jsonb_array_elements(coalesce(p_perros, '[]'::jsonb))
  loop
    v_perro_id := nullif(btrim(coalesce(v_perro->>'id', '')), '')::uuid;
    if v_perro_id is null then
      raise exception 'Falta el identificador de uno de los perros.';
    end if;

    -- Que el perro sea de ESTE cliente es lo único que impide que alguien
    -- con un link válido edite el expediente de otra persona cambiando el
    -- id en la petición.
    if not exists (
      select 1 from public.perros
      where id = v_perro_id and cliente_id = v_cliente_id and deleted_at is null
    ) then
      raise exception 'Ese perro no es de este expediente.';
    end if;

    update public.perros
    set
      -- La raza es el único campo donde "rellenar el hueco" no basta.
      -- Un perro capturado antes del catálogo trae el texto escrito a
      -- mano ("Beagle") y raza_id vacío, así que su dueño SÍ tiene algo
      -- que aportar: escogerla de la lista es lo que hace que deje de
      -- cotizar con el grupo por defecto.
      --
      -- Y si escoge una distinta de la que estaba escrita, el texto tiene
      -- que seguirla. Dejar "Beagle" con el id de bóxer sería peor que
      -- cualquiera de los dos por separado: la ficha diría una cosa y el
      -- precio saldría de otra.
      raza = case
        when raza_id is null
             and nullif(btrim(coalesce(v_perro->>'raza_id', '')), '') is not null
          then nullif(btrim(coalesce(v_perro->>'raza', '')), '')
        else coalesce(
          nullif(btrim(coalesce(raza, '')), ''),
          nullif(btrim(coalesce(v_perro->>'raza', '')), '')
        )
      end,
      raza_id = coalesce(
        raza_id,
        nullif(btrim(coalesce(v_perro->>'raza_id', '')), '')::uuid
      ),
      sexo = coalesce(sexo, nullif(btrim(coalesce(v_perro->>'sexo', '')), '')),
      fecha_nacimiento = coalesce(
        fecha_nacimiento,
        nullif(btrim(coalesce(v_perro->>'fecha_nacimiento', '')), '')::date
      ),
      tamano_id = coalesce(
        tamano_id,
        nullif(btrim(coalesce(v_perro->>'tamano_id', '')), '')::uuid
      ),
      pelaje_id = coalesce(
        pelaje_id,
        nullif(btrim(coalesce(v_perro->>'pelaje_id', '')), '')::uuid
      ),
      alimentacion_notas = coalesce(
        nullif(btrim(coalesce(alimentacion_notas, '')), ''),
        nullif(btrim(coalesce(v_perro->>'alimentacion_notas', '')), '')
      ),
      contacto_emergencia_nombre = coalesce(
        nullif(btrim(coalesce(contacto_emergencia_nombre, '')), ''),
        nullif(btrim(coalesce(v_perro->>'contacto_emergencia_nombre', '')), '')
      ),
      contacto_emergencia_telefono = coalesce(
        nullif(btrim(coalesce(contacto_emergencia_telefono, '')), ''),
        nullif(btrim(coalesce(v_perro->>'contacto_emergencia_telefono', '')), '')
      ),
      veterinario_nombre = coalesce(
        nullif(btrim(coalesce(veterinario_nombre, '')), ''),
        nullif(btrim(coalesce(v_perro->>'veterinario_nombre', '')), '')
      ),
      veterinario_telefono = coalesce(
        nullif(btrim(coalesce(veterinario_telefono, '')), ''),
        nullif(btrim(coalesce(v_perro->>'veterinario_telefono', '')), '')
      ),
      veterinario_clinica = coalesce(
        nullif(btrim(coalesce(veterinario_clinica, '')), ''),
        nullif(btrim(coalesce(v_perro->>'veterinario_clinica', '')), '')
      )
    where id = v_perro_id;

    v_perros_tocados := v_perros_tocados || jsonb_build_object(
      'id', v_perro_id,
      'nombre', (select nombre from public.perros where id = v_perro_id)
    );
  end loop;

  -- Perros nuevos: el dueño puede haber adoptado otro desde la última vez.
  for v_perro in select * from jsonb_array_elements(coalesce(p_perros_nuevos, '[]'::jsonb))
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
      coalesce(p_user_id, v_profile_actual)
    )
    returning id into v_perro_id;

    v_perros_tocados := v_perros_tocados || jsonb_build_object(
      'id', v_perro_id,
      'nombre', btrim(v_perro->>'nombre')
    );
  end loop;

  -- Los contratos del flujo, para TODOS los perros del expediente, no
  -- solo para los que se tocaron: el link de guardería lo manda recepción
  -- porque el cliente va a dejar a su perro, y si tiene tres, los tres
  -- van a entrar.
  --
  -- Se salta el perro que ya tenga ese contrato firmado o pendiente:
  -- generar otro dejaría dos pendientes del mismo tipo y el dueño
  -- firmaría dos veces lo mismo.
  for v_fila in
    select id, nombre from public.perros
    where cliente_id = v_cliente_id and deleted_at is null
  loop
    for v_contrato in select * from public.tipos_contrato_de_alta(v_invitacion.tipo)
    loop
      if exists (
        select 1
        from public.contratos c
        join public.plantillas_contrato pl on pl.id = c.plantilla_id
        where c.perro_id = v_fila.id
          and pl.tipo_contrato_id = v_contrato.tipo_contrato_id
          and c.estado in ('pendiente_firma', 'firmado_digital', 'firmado_papel')
      ) then
        continue;
      end if;

      insert into public.contratos (perro_id, cliente_id, plantilla_id, created_by)
      values (v_fila.id, v_cliente_id, v_contrato.plantilla_id, coalesce(p_user_id, v_profile_actual))
      returning id into v_contrato_id;

      v_contratos := v_contratos || jsonb_build_object(
        'id', v_contrato_id,
        'perro_id', v_fila.id,
        'perro_nombre', v_fila.nombre,
        'tipo_nombre', v_contrato.tipo_nombre
      );
    end loop;
  end loop;

  -- Ligar la cuenta recién creada, si es el caso. Misma puerta con nombre
  -- que usa el alta nueva: los guardias de vinculación bloquean a
  -- cualquiera que no sea staff, y esta función ya validó el token.
  if p_user_id is not null and v_profile_actual is null then
    perform set_config('app.vinculacion_interna', 'on', true);

    update public.profiles
    set cliente_id = v_cliente_id, rol = 'cliente'
    where id = p_user_id and cliente_id is null;

    if not found then
      raise exception 'Esa cuenta ya está ligada a un expediente.';
    end if;

    insert into public.vinculacion_eventos (profile_id, cliente_id, accion, actor_id, automatico)
    values (p_user_id, v_cliente_id, 'vincular', p_user_id, true);
  end if;

  update public.invitaciones_cliente
  set usada_at = now()
  where id = v_invitacion.id;

  return jsonb_build_object(
    'cliente_id', v_cliente_id,
    'perros', v_perros_tocados,
    'contratos', v_contratos
  );
end;
$$;

-- Igual que completar_alta_cliente: solo el servidor de la aplicación la
-- llama, con la secret key, después de haber validado el token. Nadie con
-- la llave anónima ni con una sesión de cliente puede tocarla.
revoke execute on function public.completar_expediente_cliente(text, uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.completar_expediente_cliente(text, uuid, jsonb, jsonb, jsonb) from anon;
revoke execute on function public.completar_expediente_cliente(text, uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.completar_expediente_cliente(text, uuid, jsonb, jsonb, jsonb) to service_role;
