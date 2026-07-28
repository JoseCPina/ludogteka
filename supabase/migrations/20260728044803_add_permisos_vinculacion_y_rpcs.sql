-- Permite que recepción (no solo admin) modifique cliente_id de un
-- profile con rol='cliente' — necesario para que pueda vincular/
-- desvincular manualmente. rol y sucursal_id se quedan admin-only: antes
-- una sola condición cubría las tres columnas, ahora cada una tiene su
-- propia regla.
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
     and not (public.current_rol() in ('admin', 'recepcion')) then
    raise exception 'Solo admin o recepción pueden vincular o desvincular un cliente';
  end if;

  return new;
end;
$$;

-- RLS no tenía ninguna política que dejara a recepción actualizar la fila
-- de OTRA persona; sin esto, el trigger de arriba nunca se alcanza porque
-- Postgres ya descarta la fila antes. Acotado a rol='cliente', mismo
-- alcance que profiles_select_recepcion_pendientes.
create policy profiles_update_recepcion_vincular
on public.profiles for update
to authenticated
using (public.current_rol() = 'recepcion' and rol = 'cliente')
with check (public.current_rol() = 'recepcion' and rol = 'cliente');

-- La vinculación automática (signup con correo coincidente) también queda
-- registrada en la bitácora, con actor_id null y automatico=true — es el
-- mismo tipo de evento (acceso al expediente de un tercero) que uno
-- manual, y hoy no dejaba rastro.
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

-- Cola de vinculación pendiente: cuentas con rol=cliente y cliente_id
-- null, con su correo (auth.users, que PostgREST no expone directo).
-- admin y recepción, no estética.
create or replace function public.listar_cuentas_sin_vincular()
returns table (
  id uuid,
  email text,
  creado_en timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not (public.current_rol() in ('admin', 'recepcion')) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
    select p.id, u.email::text, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.rol = 'cliente'
      and p.cliente_id is null
      and p.deleted_at is null
    order by p.created_at asc;
end;
$$;

-- Cuentas ya vinculadas, con el detalle del cliente y de la bitácora
-- (quién/cuándo/automática) para poder desvincular con contexto completo,
-- no a ciegas.
create or replace function public.listar_cuentas_vinculadas()
returns table (
  profile_id uuid,
  email text,
  cliente_id uuid,
  cliente_nombre text,
  cliente_telefono text,
  vinculado_en timestamptz,
  vinculado_por text,
  automatico boolean
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not (public.current_rol() in ('admin', 'recepcion')) then
    raise exception 'No tienes permiso para ver esto.';
  end if;

  return query
    select
      p.id,
      u.email::text,
      c.id,
      c.nombre,
      c.telefono,
      ev.created_at,
      actor.email::text,
      ev.automatico
    from public.profiles p
    join auth.users u on u.id = p.id
    join public.clientes c on c.id = p.cliente_id
    left join lateral (
      select e.created_at, e.actor_id, e.automatico
      from public.vinculacion_eventos e
      where e.profile_id = p.id and e.accion = 'vincular'
      order by e.created_at desc
      limit 1
    ) ev on true
    left join auth.users actor on actor.id = ev.actor_id
    where p.rol = 'cliente'
      and p.cliente_id is not null
      and p.deleted_at is null
    order by ev.created_at desc nulls last;
end;
$$;

revoke execute on function public.listar_cuentas_sin_vincular() from public;
grant execute on function public.listar_cuentas_sin_vincular() to authenticated;
revoke execute on function public.listar_cuentas_vinculadas() from public;
grant execute on function public.listar_cuentas_vinculadas() to authenticated;
