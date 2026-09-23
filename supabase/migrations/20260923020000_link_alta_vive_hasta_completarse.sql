-- El link de alta (nuevo o de complemento) SIGUE SIRVIENDO hasta que el
-- cliente termine TODO lo que le faltaba, no se consume en el primer paso.
--
-- Cómo estaba: completar_alta_cliente y completar_expediente_cliente
-- marcaban usada_at en cuanto se guardaban los datos, ANTES de la firma.
-- Si el dueño cerraba el celular con el contrato enfrente y volvía a abrir
-- su link, se encontraba "Este link ya se usó" y tenía que pedir otro a
-- recepción — y recepción no podía generarle otro de complemento sin
-- cancelar el que "ya se usó". Y si de verdad ya había terminado, el
-- mismo mensaje seco en vez de mandarlo a su portal.
--
-- Cómo queda: dos marcas de tiempo con significados distintos.
--
--   alta_completada_at  el dueño ya guardó lo que el link le pedía
--                       (expediente creado o huecos rellenados, contratos
--                       generados). El link entró en curso.
--   usada_at            ya no queda NADA por hacer con este link: datos
--                       guardados y, si el flujo lleva contrato, los de
--                       todos sus perros firmados. Solo entonces deja de
--                       servir, y al abrirlo se le manda a su portal.
--
-- Entre una y otra el link se puede abrir las veces que haga falta: la
-- pantalla reconoce al dueño (inicia sesión con su teléfono), rellena lo
-- que siga vacío sin volver a preguntar lo que ya dijo, y le pone enfrente
-- los contratos pendientes — los que se generaron la vez anterior, no
-- otros nuevos.

-- 1. Columnas y lo que se deduce de las filas que ya existen.
alter table public.invitaciones_cliente
  add column if not exists alta_completada_at timestamptz,
  add column if not exists es_complemento boolean not null default false;

comment on column public.invitaciones_cliente.alta_completada_at is
  'Cuándo el dueño guardó los datos que el link le pedía. Desde aquí el link está "en curso": sirve para volver y terminar (firmar), no para capturar de nuevo.';
comment on column public.invitaciones_cliente.usada_at is
  'Cuándo quedó TODO lo que este link pedía (datos y contratos firmados). Solo entonces deja de servir: al abrirlo se manda al dueño a su portal.';
comment on column public.invitaciones_cliente.es_complemento is
  'true si el link nació para completar un expediente que ya existía (lo genera recepción desde la ficha del cliente); false si es un alta nueva.';

-- Todo lo usado hasta hoy se usó de un golpe: los datos se completaron
-- en el mismo momento en que se marcó.
update public.invitaciones_cliente
set alta_completada_at = usada_at
where usada_at is not null and alta_completada_at is null;

-- Un link de complemento se reconocía porque traía expediente ANTES de
-- usarse; una vez usado ya no había forma de distinguirlo de un alta
-- nueva. Para las filas que ya existen se deduce del orden de creación:
-- si el expediente es más viejo que el link, el link fue para
-- completarlo. (Un alta nueva que se ligó a un expediente sin cuenta
-- que ya existía cae aquí también, y en la práctica eso es lo que fue.)
update public.invitaciones_cliente i
set es_complemento = true
where i.cliente_id is not null
  and exists (
    select 1 from public.clientes c
    where c.id = i.cliente_id and c.created_at < i.created_at
  );

-- Lo que siempre tiene que ser cierto: usada implica completada, y
-- completada implica que ya se sabe de qué expediente es.
alter table public.invitaciones_cliente
  drop constraint if exists invitaciones_cliente_usada_tras_completar;
alter table public.invitaciones_cliente
  add constraint invitaciones_cliente_usada_tras_completar
  check (usada_at is null or alta_completada_at is not null);

alter table public.invitaciones_cliente
  drop constraint if exists invitaciones_cliente_completada_con_expediente;
alter table public.invitaciones_cliente
  add constraint invitaciones_cliente_completada_con_expediente
  check (alta_completada_at is null or cliente_id is not null);

-- 2. Qué contratos del flujo siguen sin firmar para los perros de un
--    cliente. Es la definición de "le falta algo" que usan la función que
--    completa el expediente (para devolverlos a la pantalla) y la que
--    cierra el link (para saber si ya no queda nada).
create or replace function public.contratos_pendientes_de_alta(p_cliente_id uuid, p_tipo text)
returns table (id uuid, perro_id uuid, perro_nombre text, tipo_nombre text)
language sql
stable
set search_path = ''
as $$
  select c.id, p.id, p.nombre, t.tipo_nombre
  from public.contratos c
  join public.perros p on p.id = c.perro_id and p.deleted_at is null
  join public.plantillas_contrato pl on pl.id = c.plantilla_id
  join public.tipos_contrato_de_alta(p_tipo) t on t.tipo_contrato_id = pl.tipo_contrato_id
  where c.cliente_id = p_cliente_id
    and c.estado = 'pendiente_firma'
  order by p.nombre, t.tipo_nombre;
$$;

revoke execute on function public.contratos_pendientes_de_alta(uuid, text) from public;
revoke execute on function public.contratos_pendientes_de_alta(uuid, text) from anon;
revoke execute on function public.contratos_pendientes_de_alta(uuid, text) from authenticated;
grant execute on function public.contratos_pendientes_de_alta(uuid, text) to service_role;

-- 3. Cerrar el link si ya no queda nada. La llama la pantalla del link
--    cada vez que se abre en curso, y la app después de cada firma: así
--    recepción ve "completado" en cuanto el dueño firma, no hasta que
--    vuelva a abrir el link. Nunca cierra un link al que todavía le
--    falte algo, y no toca uno cancelado.
create or replace function public.cerrar_invitacion_si_completa(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitacion public.invitaciones_cliente%rowtype;
  v_pendientes jsonb;
begin
  select * into v_invitacion
  from public.invitaciones_cliente
  where token = p_token and deleted_at is null
  for update;

  if not found then
    raise exception 'Este link no existe.' using errcode = 'P0001';
  end if;

  if v_invitacion.cliente_id is null or v_invitacion.alta_completada_at is null then
    return jsonb_build_object('completa', false, 'en_curso', false, 'contratos_pendientes', '[]'::jsonb);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', cp.id,
      'perro_id', cp.perro_id,
      'perro_nombre', cp.perro_nombre,
      'tipo_nombre', cp.tipo_nombre
    )), '[]'::jsonb)
    into v_pendientes
  from public.contratos_pendientes_de_alta(v_invitacion.cliente_id, v_invitacion.tipo) cp;

  if jsonb_array_length(v_pendientes) = 0
     and v_invitacion.usada_at is null
     and v_invitacion.cancelada_at is null then
    update public.invitaciones_cliente
    set usada_at = now()
    where id = v_invitacion.id;
    v_invitacion.usada_at := now();
  end if;

  return jsonb_build_object(
    'completa', v_invitacion.usada_at is not null,
    'en_curso', v_invitacion.usada_at is null,
    'contratos_pendientes', v_pendientes
  );
end;
$$;

revoke execute on function public.cerrar_invitacion_si_completa(text) from public;
revoke execute on function public.cerrar_invitacion_si_completa(text) from anon;
revoke execute on function public.cerrar_invitacion_si_completa(text) from authenticated;
grant execute on function public.cerrar_invitacion_si_completa(text) to service_role;

-- 4. La vista que ve recepción: un estado más, "en_curso", entre
--    pendiente y usada. Va ANTES de vencida a propósito: un link en curso
--    que venció sigue diciendo algo útil (se registró, falta firmar) y el
--    dueño puede terminar desde su portal, no está "vencido sin usarse".
drop view if exists public.invitaciones_cliente_estado;

create view public.invitaciones_cliente_estado
with (security_invoker = true)
as
select
  i.id,
  i.nombre_referencia,
  i.telefono,
  i.tipo,
  i.expira_at,
  i.alta_completada_at,
  i.usada_at,
  i.cancelada_at,
  i.cliente_id,
  c.nombre as cliente_nombre,
  i.es_complemento,
  i.created_at,
  case
    when i.cancelada_at is not null then 'cancelada'
    when i.usada_at is not null then 'usada'
    when i.alta_completada_at is not null then 'en_curso'
    when i.expira_at <= now() then 'vencida'
    else 'pendiente'
  end as estado
from public.invitaciones_cliente i
left join public.clientes c on c.id = i.cliente_id
where i.deleted_at is null;

-- 5. crear_invitacion_cliente marca es_complemento al nacer. Cuerpo
--    tomado de 20260910043750 sin otro cambio.
create or replace function public.crear_invitacion_cliente(
  p_nombre_referencia text,
  p_telefono text,
  p_dias_vigencia int default 7,
  p_tipo text default 'guarderia_hotel',
  p_cliente_id uuid default null
)
returns table (id uuid, token text, expira_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_token text;
  v_expira timestamptz;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden invitar a un cliente.';
  end if;

  if p_nombre_referencia is null or btrim(p_nombre_referencia) = '' then
    raise exception 'Escribe un nombre de referencia para reconocer la invitación.';
  end if;
  if p_telefono is null or btrim(p_telefono) = '' then
    raise exception 'Escribe el teléfono al que se va a mandar el link.';
  end if;
  if coalesce(p_dias_vigencia, 0) < 1 or p_dias_vigencia > 30 then
    raise exception 'La vigencia debe estar entre 1 y 30 días.';
  end if;
  if p_tipo is null or p_tipo not in ('guarderia_hotel', 'estetica') then
    raise exception 'El tipo de link debe ser guarderia_hotel o estetica.';
  end if;

  if p_cliente_id is not null then
    if not exists (
      select 1 from public.clientes c
      where c.id = p_cliente_id and c.deleted_at is null
    ) then
      raise exception 'Ese cliente no existe.';
    end if;

    -- Un link en curso (registrado, falta firmar) sigue vivo y sigue
    -- contando: el dueño lo puede abrir para terminar. Recepción lo
    -- reenvía o lo cancela antes de generar otro.
    if exists (
      select 1 from public.invitaciones_cliente i
      where i.cliente_id = p_cliente_id
        and i.tipo = p_tipo
        and i.usada_at is null
        and i.cancelada_at is null
        and (i.expira_at > now() or i.alta_completada_at is not null)
        and i.deleted_at is null
    ) then
      raise exception 'Ya hay un link de este tipo esperando a ese cliente. Reenvíalo o cancélalo antes de generar otro.';
    end if;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + make_interval(days => p_dias_vigencia);

  insert into public.invitaciones_cliente
    (token, nombre_referencia, telefono, tipo, cliente_id, es_complemento, expira_at, created_by)
  values
    (v_token, btrim(p_nombre_referencia), btrim(p_telefono), p_tipo, p_cliente_id, p_cliente_id is not null, v_expira, auth.uid())
  returning invitaciones_cliente.id into v_id;

  return query select v_id, v_token, v_expira;
end;
$$;

revoke execute on function public.crear_invitacion_cliente(text, text, int, text, uuid) from public;
revoke execute on function public.crear_invitacion_cliente(text, text, int, text, uuid) from anon;
grant execute on function public.crear_invitacion_cliente(text, text, int, text, uuid) to authenticated;

-- 6. Alta nueva. Cambian los guardias y el cierre; el cuerpo (expediente
--    por teléfono, perros, contratos) es el de 20260910171600.
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
  -- Ya se registró por este link: lo que sigue (firmar, completar
  -- huecos) se hace volviendo a abrirlo, no capturando de nuevo.
  if v_invitacion.usada_at is not null then
    raise exception 'Este link ya cumplió: ya quedó todo. Entra a tu portal con tu teléfono y contraseña.';
  end if;
  if v_invitacion.cliente_id is not null then
    raise exception 'Tu registro ya quedó guardado. Vuelve a abrir el link para continuar donde te quedaste.';
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

  if v_existente.id is not null then
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

  if p_user_id is not null then
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

  -- Los datos ya quedaron: el link entra en curso. Solo si no hay nada
  -- que firmar (estética) queda usado de una vez; si hay contratos, se
  -- usa cuando el último quede firmado (cerrar_invitacion_si_completa).
  update public.invitaciones_cliente
  set cliente_id = v_cliente_id,
      alta_completada_at = now(),
      usada_at = case when jsonb_array_length(v_contratos) = 0 then now() end
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

-- 7. Complemento (y el alta nueva que se vuelve a abrir en curso). Ya no
--    rechaza un link en curso; devuelve TODOS los contratos del flujo que
--    sigan pendientes de firma —los que generó esta vez y los que quedaron
--    de la vez anterior— para que la pantalla los ofrezca; y cierra el
--    link solo si no queda ninguno. Cuerpo de 20260910043755.
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
    raise exception 'Este link ya cumplió: ya quedó todo. Entra a tu portal con tu teléfono y contraseña.';
  end if;
  -- Un link en curso no vence para terminar lo que empezó: el dueño ya
  -- se registró y lo que falta es suyo. Solo el que nunca se usó vence.
  if v_invitacion.expira_at <= now() and v_invitacion.alta_completada_at is null then
    raise exception 'Este link ya venció. Pídele uno nuevo a recepción.';
  end if;
  if v_invitacion.cliente_id is null then
    raise exception 'Este link es para un alta nueva, no para completar un expediente.';
  end if;

  v_cliente_id := v_invitacion.cliente_id;

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

  for v_perro in select * from jsonb_array_elements(coalesce(p_perros, '[]'::jsonb))
  loop
    v_perro_id := nullif(btrim(coalesce(v_perro->>'id', '')), '')::uuid;
    if v_perro_id is null then
      raise exception 'Falta el identificador de uno de los perros.';
    end if;

    if not exists (
      select 1 from public.perros
      where id = v_perro_id and cliente_id = v_cliente_id and deleted_at is null
    ) then
      raise exception 'Ese perro no es de este expediente.';
    end if;

    update public.perros
    set
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

  -- Contratos del flujo para todos los perros del expediente. Se salta el
  -- perro que ya tenga ese contrato firmado o pendiente: generar otro
  -- dejaría dos pendientes del mismo tipo.
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
      values (v_fila.id, v_cliente_id, v_contrato.plantilla_id, coalesce(p_user_id, v_profile_actual));
    end loop;
  end loop;

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

  -- Lo que le falta firmar, sea de esta vez o de la anterior: es lo que
  -- la pantalla le pone enfrente. Si no hay nada, el link ya cumplió.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', cp.id,
      'perro_id', cp.perro_id,
      'perro_nombre', cp.perro_nombre,
      'tipo_nombre', cp.tipo_nombre
    )), '[]'::jsonb)
    into v_contratos
  from public.contratos_pendientes_de_alta(v_cliente_id, v_invitacion.tipo) cp;

  update public.invitaciones_cliente
  set alta_completada_at = coalesce(alta_completada_at, now()),
      usada_at = case when jsonb_array_length(v_contratos) = 0 then now() end
  where id = v_invitacion.id;

  return jsonb_build_object(
    'cliente_id', v_cliente_id,
    'perros', v_perros_tocados,
    'contratos', v_contratos
  );
end;
$$;

revoke execute on function public.completar_expediente_cliente(text, uuid, jsonb, jsonb, jsonb) from public;
revoke execute on function public.completar_expediente_cliente(text, uuid, jsonb, jsonb, jsonb) from anon;
revoke execute on function public.completar_expediente_cliente(text, uuid, jsonb, jsonb, jsonb) from authenticated;
grant execute on function public.completar_expediente_cliente(text, uuid, jsonb, jsonb, jsonb) to service_role;
