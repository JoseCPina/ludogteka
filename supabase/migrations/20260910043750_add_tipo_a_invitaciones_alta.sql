-- El link de alta deja de ser uno solo. Hay dos flujos con necesidades
-- distintas:
--
--   * guarderia_hotel — el perro se queda a dormir o pasa el día. El
--     negocio necesita el expediente completo: a quién llamar si algo
--     pasa, quién es su veterinario, qué y cuánto come.
--   * estetica — el perro viene dos horas a bañarse. Pedirle a esa
--     persona el teléfono de su veterinario para agendar un baño es la
--     forma más segura de que abandone el formulario a la mitad. Lo que
--     sí necesita es lo que el negocio no le puede decir por WhatsApp:
--     cuánto le va a costar.
--
-- Y cada flujo trae su contrato: el que aplica a esas categorías de
-- servicio, que es un concepto que ya existe desde Fase 11
-- (tipos_contrato.categorias_servicio). No se inventa una lista nueva.
alter table public.invitaciones_cliente
  add column if not exists tipo text not null default 'guarderia_hotel'
    check (tipo in ('guarderia_hotel', 'estetica'));

-- Las invitaciones que ya existían se quedan en 'guarderia_hotel', que es
-- literalmente lo que hacían: el formulario de antes pedía el expediente
-- completo.
comment on column public.invitaciones_cliente.tipo is
  'Qué flujo abre este link: guarderia_hotel pide el expediente completo, estetica pide lo básico y muestra el precio estimado.';

-- cliente_id pasa a tener DOS momentos posibles, y la diferencia es lo
-- que separa un alta nueva de un complemento de expediente:
--
--   * null al crearse, se llena al usarse -> alta nueva. El expediente
--     no existía y lo crea el dueño.
--   * lleno al crearse -> complemento. El cliente YA tiene expediente
--     (entró por el otro flujo, o lo capturó recepción a mano) y este
--     link solo viene a pedirle lo que falta y el contrato que no ha
--     firmado. Nunca a preguntarle todo otra vez.
comment on column public.invitaciones_cliente.cliente_id is
  'El expediente de esta invitación. Si viene lleno desde que se crea, es un complemento de un expediente que ya existe; si se llena al usarse, es el expediente que acaba de crear el dueño.';

-- Y con eso, la restricción original deja de ser cierta. Decía
--   check ((usada_at is null) = (cliente_id is null))
-- porque cuando cliente_id solo podía llenarse AL USARSE, tener uno sin
-- el otro era una inconsistencia. Un link de complemento nace con
-- expediente y sin usar, que es exactamente lo que esa forma prohibía.
--
-- Lo que sigue siendo cierto —y es lo que de verdad importa— es la otra
-- mitad: una invitación marcada como usada SIEMPRE tiene que decir qué
-- expediente salió de ella. Sin eso, un alta completada se vuelve
-- inrastreable.
alter table public.invitaciones_cliente
  drop constraint if exists invitaciones_cliente_check;

alter table public.invitaciones_cliente
  drop constraint if exists invitaciones_cliente_usada_con_expediente;

alter table public.invitaciones_cliente
  add constraint invitaciones_cliente_usada_con_expediente
  check (usada_at is null or cliente_id is not null);

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
  i.usada_at,
  i.cancelada_at,
  i.cliente_id,
  c.nombre as cliente_nombre,
  -- Un link de complemento se reconoce porque ya traía expediente antes
  -- de usarse. Recepción necesita distinguirlos en la lista: uno que
  -- lleva tres días sin usarse significa cosas distintas si el cliente ya
  -- existe (le falta firmar) o si no existe todavía (no se ha dado de
  -- alta).
  (i.cliente_id is not null and i.usada_at is null) as es_complemento,
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

-- Cuerpo tomado de 20260910011254_fix_token_invitacion_sin_pgcrypto.sql
-- (la versión vigente, con el token de dos gen_random_uuid en vez de
-- gen_random_bytes) y ampliado con el tipo y el cliente destino.
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

  -- Ojo con los nombres: esta función devuelve una tabla (id, token,
  -- expira_at), así que esos tres son variables de salida y chocan con
  -- las columnas homónimas de cualquier consulta de adentro. Por eso todo
  -- va calificado con su tabla — es la misma razón por la que el insert de
  -- abajo ya decía `invitaciones_cliente.id`.
  if p_cliente_id is not null then
    if not exists (
      select 1 from public.clientes c
      where c.id = p_cliente_id and c.deleted_at is null
    ) then
      raise exception 'Ese cliente no existe.';
    end if;

    -- Dos links de complemento vivos para el mismo cliente y el mismo
    -- flujo se pisan entre sí: el dueño usa uno, el otro se queda
    -- "pendiente" para siempre y recepción persigue algo que ya se hizo.
    if exists (
      select 1 from public.invitaciones_cliente i
      where i.cliente_id = p_cliente_id
        and i.tipo = p_tipo
        and i.usada_at is null
        and i.cancelada_at is null
        and i.expira_at > now()
        and i.deleted_at is null
    ) then
      raise exception 'Ya hay un link de este tipo esperando a ese cliente. Reenvíalo o cancélalo antes de generar otro.';
    end if;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + make_interval(days => p_dias_vigencia);

  insert into public.invitaciones_cliente
    (token, nombre_referencia, telefono, tipo, cliente_id, expira_at, created_by)
  values
    (v_token, btrim(p_nombre_referencia), btrim(p_telefono), p_tipo, p_cliente_id, v_expira, auth.uid())
  returning invitaciones_cliente.id into v_id;

  return query select v_id, v_token, v_expira;
end;
$$;

-- La versión de tres argumentos se elimina: con las dos vivas, una
-- llamada que se olvide del tipo caería en la vieja y generaría un link
-- de guardería para un cliente de estética sin que nadie lo note — el
-- mismo tipo de función zombi que ya mordió con publicar_plantilla en
-- Fase 11 y con resolver_precio en Fase 14. Las llamadas de tres
-- argumentos siguen funcionando porque los dos nuevos tienen default.
drop function if exists public.crear_invitacion_cliente(text, text, int);

revoke execute on function public.crear_invitacion_cliente(text, text, int, text, uuid) from public;
revoke execute on function public.crear_invitacion_cliente(text, text, int, text, uuid) from anon;
grant execute on function public.crear_invitacion_cliente(text, text, int, text, uuid) to authenticated;
