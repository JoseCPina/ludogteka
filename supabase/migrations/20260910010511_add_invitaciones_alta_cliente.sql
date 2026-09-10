-- Se invierte el alta de clientes. Hasta hoy: recepción capturaba al dueño
-- y, si esa persona después se registraba en el portal, había que
-- vincular la cuenta con el expediente a mano (o esperar a que
-- vincular_cliente_por_email() acertara por coincidencia de correo).
-- Ahora: recepción manda un link, el dueño captura sus datos y los de sus
-- perros, y el expediente nace YA LIGADO a su cuenta.
--
-- La diferencia de fondo no es la pantalla, es de dónde sale el vínculo:
-- aquí `profiles.cliente_id` se asigna explícitamente dentro de la misma
-- transacción que crea el expediente, contra el user_id que acaba de
-- registrarse. No se parece en nada a adivinar por correo — no puede
-- fallar por un correo distinto al que dio en el mostrador, ni caer en la
-- cola de /vinculacion, ni vincular a la persona equivocada si dos
-- clientes comparten correo.
--
-- Lo que NO cambia: el alta manual de recepción sigue igual (va a haber
-- quien llegue sin celular o no quiera registrarse) y /vinculacion se
-- queda para esos clientes y para lo que se salga del flujo.
create table public.invitaciones_cliente (
  id uuid primary key default gen_random_uuid(),

  -- Token opaco de un solo uso. Es lo único que protege el formulario de
  -- alta (es una pantalla pública, sin sesión), así que se genera con
  -- gen_random_bytes y NO a partir de nada adivinable como el teléfono o
  -- la fecha. En hex y no en base64 para que viaje limpio en una URL de
  -- WhatsApp, sin +, / ni = que algún cliente de mensajería recorte.
  token text not null unique,

  -- Cómo reconoce recepción esta invitación en la lista antes de que
  -- exista un expediente: "Ana, la del labrador". No es el nombre real del
  -- cliente — ese lo captura el dueño.
  nombre_referencia text not null,
  telefono text not null,

  expira_at timestamptz not null,
  usada_at timestamptz,
  cliente_id uuid references public.clientes(id),
  cancelada_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),

  -- Usada y sin expediente, o con expediente y sin marcar como usada, son
  -- dos formas de la misma inconsistencia: o pasó, o no pasó.
  check ((usada_at is null) = (cliente_id is null))
);

create trigger set_updated_at before insert or update on public.invitaciones_cliente
  for each row execute function public.set_updated_at();

create index invitaciones_cliente_pendientes_idx
  on public.invitaciones_cliente (expira_at)
  where usada_at is null and cancelada_at is null and deleted_at is null;

alter table public.invitaciones_cliente enable row level security;

create policy invitaciones_cliente_select_staff on public.invitaciones_cliente
  for select to authenticated
  using (public.current_rol() in ('admin', 'recepcion'));

-- Sin INSERT/UPDATE directo: crear y cancelar pasan por las funciones de
-- abajo, y completar el alta pasa por completar_alta_cliente(), que es la
-- única que puede marcar una invitación como usada. Que la pantalla no
-- pueda escribir el token a mano es justamente el punto.

-- Marca de origen: recepción tiene que saber que estos datos los tecleó el
-- dueño y no el mostrador, porque conviene revisarlos contra la realidad
-- (y contra el carnet, cuando lleguen las vacunas). datos_revisados_at lo
-- apaga: sin una forma de darlo por revisado, el aviso se vuelve ruido
-- permanente y deja de mirarse.
alter table public.clientes
  add column alta_por_cliente boolean not null default false,
  add column datos_revisados_at timestamptz,
  add column datos_revisados_por uuid references auth.users(id) on delete set null;

-- Estado derivado, nunca una columna `estado` que haya que mantener al
-- día: "vencida" depende del reloj, y una columna se quedaría diciendo
-- "pendiente" para siempre a menos que algo la actualice. Mismo criterio
-- que perro_requisitos_sanitarios_estado y perros_contrato_estado.
create view public.invitaciones_cliente_estado
with (security_invoker = true)
as
select
  i.id,
  i.nombre_referencia,
  i.telefono,
  i.expira_at,
  i.usada_at,
  i.cancelada_at,
  i.cliente_id,
  c.nombre as cliente_nombre,
  i.created_at,
  case
    when i.cancelada_at is not null then 'cancelada'
    when i.usada_at is not null then 'usada'
    when i.expira_at <= now() then 'vencida'
    else 'pendiente'
  end as estado
from public.invitaciones_cliente i
left join public.clientes c on c.id = i.cliente_id
where i.deleted_at is null;

create or replace function public.crear_invitacion_cliente(
  p_nombre_referencia text,
  p_telefono text,
  p_dias_vigencia int default 7
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

  v_token := encode(gen_random_bytes(24), 'hex');
  v_expira := now() + make_interval(days => p_dias_vigencia);

  insert into public.invitaciones_cliente (token, nombre_referencia, telefono, expira_at, created_by)
  values (v_token, btrim(p_nombre_referencia), btrim(p_telefono), v_expira, auth.uid())
  returning invitaciones_cliente.id into v_id;

  return query select v_id, v_token, v_expira;
end;
$$;

revoke execute on function public.crear_invitacion_cliente(text, text, int) from public;
grant execute on function public.crear_invitacion_cliente(text, text, int) to authenticated;

-- Cancelar: el link se mandó al número equivocado, o el cliente ya se dio
-- de alta por otro lado. No se borra (el historial de qué se mandó y a
-- quién es justo lo que recepción necesita ver), solo deja de servir.
create or replace function public.cancelar_invitacion_cliente(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usada timestamptz;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden cancelar una invitación.';
  end if;

  select usada_at into v_usada from public.invitaciones_cliente
  where id = p_id and deleted_at is null;

  if not found then
    raise exception 'Invitación no encontrada.';
  end if;
  if v_usada is not null then
    raise exception 'Esa invitación ya se usó: el cliente ya tiene expediente.';
  end if;

  update public.invitaciones_cliente
  set cancelada_at = now()
  where id = p_id and cancelada_at is null;
end;
$$;

revoke execute on function public.cancelar_invitacion_cliente(uuid) from public;
grant execute on function public.cancelar_invitacion_cliente(uuid) to authenticated;

create or replace function public.marcar_datos_revisados(p_cliente_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden marcar un expediente como revisado.';
  end if;

  update public.clientes
  set datos_revisados_at = now(), datos_revisados_por = auth.uid()
  where id = p_cliente_id and deleted_at is null;

  if not found then
    raise exception 'Cliente no encontrado.';
  end if;
end;
$$;

revoke execute on function public.marcar_datos_revisados(uuid) from public;
grant execute on function public.marcar_datos_revisados(uuid) to authenticated;

-- El alta completa, en UNA transacción: expediente + perros + vínculo de
-- la cuenta + invitación quemada. O queda todo, o no queda nada.
--
-- Eso es lo que evita el expediente basura: si el dueño abre el link y
-- abandona a la mitad, aquí no se escribió una sola fila — el formulario
-- vive en el navegador hasta el último botón. Y como el usuario de Auth
-- se crea justo antes de llamar a esta función, si esta falla la
-- aplicación borra ese usuario (ver src/app/alta/acciones.ts): tampoco
-- queda una cuenta huérfana esperando en la cola de /vinculacion.
--
-- p_user_id llega desde el servidor, no desde el navegador: quien llama es
-- una server action con la secret key, que acaba de crear ese usuario. Por
-- eso la función se revoca de public/authenticated/anon y solo la puede
-- ejecutar service_role — un cliente con el token pero sin la secret key
-- no puede inventarse un user_id ajeno y colgarse de su cuenta.
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
  -- for update: dos pestañas mandando el formulario al mismo tiempo se
  -- serializan aquí, y la segunda encuentra la invitación ya usada.
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

  -- El vínculo, explícito y contra el usuario recién creado. La condición
  -- `cliente_id is null` no es adorno: si esa cuenta ya tuviera expediente
  -- (alguien reusando un link con una sesión vieja), preferimos tronar y
  -- que no quede nada, a colgarle un segundo expediente.
  update public.profiles
  set cliente_id = v_cliente_id, rol = 'cliente'
  where id = p_user_id and cliente_id is null;

  if not found then
    raise exception 'Esa cuenta ya está ligada a un expediente.';
  end if;

  update public.invitaciones_cliente
  set usada_at = now(), cliente_id = v_cliente_id
  where id = v_invitacion.id;

  return jsonb_build_object('cliente_id', v_cliente_id, 'perros', v_perros_creados);
end;
$$;

-- Solo el servidor. Ni anon ni authenticated pueden llamarla: el token por
-- sí solo no basta para escribir en la base, tiene que pasar por la server
-- action que además crea la cuenta.
revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from public;
revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from anon;
revoke execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) from authenticated;
grant execute on function public.completar_alta_cliente(text, uuid, jsonb, jsonb) to service_role;
