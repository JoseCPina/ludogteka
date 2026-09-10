-- Encontrado al probar la primera invitación de verdad:
--   "function gen_random_bytes(integer) does not exist"
--
-- gen_random_bytes viene de pgcrypto, que en Supabase vive en el esquema
-- `extensions`, y todas estas funciones corren con `set search_path = ''`
-- (a propósito: es lo que impide que alguien las engañe metiendo un
-- objeto con el mismo nombre en un esquema propio). Sin calificar, no se
-- encuentra. gen_random_uuid sí funcionaba porque es del core de Postgres
-- desde la 13, no de pgcrypto — de ahí que la tabla se creara bien y
-- solo tronara al generar el token.
--
-- Se podría calificar como extensions.gen_random_bytes(), pero eso ata la
-- función a dónde tenga instalada pgcrypto este proyecto en particular.
-- Dos gen_random_uuid() concatenados dan 64 caracteres hex y 244 bits de
-- aleatoriedad, del mismo generador criptográfico del sistema, sin
-- depender de ninguna extensión ni de en qué esquema quedó.
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

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_expira := now() + make_interval(days => p_dias_vigencia);

  insert into public.invitaciones_cliente (token, nombre_referencia, telefono, expira_at, created_by)
  values (v_token, btrim(p_nombre_referencia), btrim(p_telefono), v_expira, auth.uid())
  returning invitaciones_cliente.id into v_id;

  return query select v_id, v_token, v_expira;
end;
$$;

revoke execute on function public.crear_invitacion_cliente(text, text, int) from public;
grant execute on function public.crear_invitacion_cliente(text, text, int) to authenticated;
