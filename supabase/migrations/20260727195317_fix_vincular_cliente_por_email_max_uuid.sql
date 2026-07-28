-- Bug en Migración 2: `max(id)` sobre una columna uuid no existe en Postgres
-- (no hay operador de orden para uuid). Como esta función corre dentro de un
-- trigger AFTER UPDATE de auth.users, el error tumbaba la confirmación de
-- correo completa: el UPDATE a auth.users se revertía y el usuario quedaba
-- confirmado en apariencia pero sin persistirse.
--
-- Fix: array_agg(id) + array_length(...) = 1 para "exactamente un match",
-- sin depender de ningún operador de orden sobre uuid. Además, toda la
-- vinculación queda envuelta en un exception handler: si algo truena aquí,
-- el profile simplemente se queda sin vincular (cliente_id null) en vez de
-- reventar el alta o la confirmación del usuario.
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
    update public.profiles
    set cliente_id = v_ids[1]
    where id = p_user_id
      and cliente_id is null
      and rol = 'cliente';
  end if;
exception
  when others then
    raise warning 'vincular_cliente_por_email fallo para user %: %', p_user_id, sqlerrm;
end;
$$;
