-- Entrar con el teléfono, sin que la app deje de funcionar para quien ya
-- entraba con su correo.
--
-- Supabase Auth identifica al usuario por correo (habilitar teléfono de
-- verdad exige un proveedor de SMS contratado, que es justo lo que el
-- negocio NO quiere). Así que el teléfono se traduce: la app resuelve de
-- qué cuenta se trata y firma con el correo de esa cuenta. Para el dueño
-- la pantalla pide teléfono y contraseña, y ya.
--
-- Consecuencia importante para quien lea esto después: las cuentas que se
-- creen de aquí en adelante llevan un correo SINTÉTICO derivado del
-- número (ver src/lib/auth/identidad.ts). No es una dirección real, no
-- recibe correo y nadie se la teclea. Las cuentas viejas conservan su
-- correo de verdad y siguen entrando igual — por eso esta función busca
-- el correo REGISTRADO en vez de calcularlo: calcularlo dejaría fuera a
-- todos los que ya existían.
create or replace function public.email_de_login_por_telefono(p_telefono text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select u.email
  from public.clientes c
  join public.profiles p on p.cliente_id = c.id
  join auth.users u on u.id = p.id
  where c.telefono = p_telefono
    and c.deleted_at is null
  limit 1;
$$;

-- Solo el servidor de la aplicación. Devuelve el correo de una cuenta a
-- partir de un teléfono: en manos de cualquiera sería una forma cómoda de
-- cosechar correos de clientes probando números.
revoke execute on function public.email_de_login_por_telefono(text) from public;
revoke execute on function public.email_de_login_por_telefono(text) from anon;
revoke execute on function public.email_de_login_por_telefono(text) from authenticated;
grant execute on function public.email_de_login_por_telefono(text) to service_role;

-- Qué pasa si alguien se registra con este teléfono. La pantalla de alta
-- la llama ANTES de que la persona llene el formulario completo, para
-- poder decírselo en la primera pantalla y no después de veinte campos.
--
-- La decisión final NO es esta: la toma completar_alta_cliente dentro de
-- su transacción. Esta función existe para que el aviso llegue temprano,
-- no para autorizar nada.
create or replace function public.estado_telefono_alta(p_telefono text)
returns table (existe_cliente boolean, tiene_cuenta boolean, nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    c.id is not null,
    coalesce(p.id is not null, false),
    c.nombre
  from (select 1) as _dummy
  left join lateral (
    select cl.id, cl.nombre
    from public.clientes cl
    where cl.telefono = p_telefono and cl.deleted_at is null
    limit 1
  ) c on true
  left join lateral (
    select pr.id from public.profiles pr where pr.cliente_id = c.id limit 1
  ) p on true;
$$;

revoke execute on function public.estado_telefono_alta(text) from public;
revoke execute on function public.estado_telefono_alta(text) from anon;
revoke execute on function public.estado_telefono_alta(text) from authenticated;
grant execute on function public.estado_telefono_alta(text) to service_role;

-- A quién le puede restablecer la contraseña recepción.
--
-- El restablecimiento en sí lo hace la aplicación con la Admin API de
-- Auth (la base no puede cambiar una contraseña), pero QUIÉN puede
-- hacerlo y SOBRE QUIÉN se decide aquí, no en el servidor de la app:
-- staff nunca puede tocar la cuenta de otro miembro del staff, solo la de
-- un cliente. Si esto viviera solo en TypeScript, un descuido en una
-- pantalla nueva abriría el panel entero.
create or replace function public.cuenta_de_cliente_para_restablecer(p_cliente_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_rol text;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden restablecer una contraseña.';
  end if;

  select p.id, p.rol into v_id, v_rol
  from public.profiles p
  where p.cliente_id = p_cliente_id
  limit 1;

  if v_id is null then
    raise exception 'Ese cliente todavía no tiene cuenta. Mándale un link de alta para que la cree.';
  end if;
  if v_rol <> 'cliente' then
    raise exception 'Esa cuenta no es de un cliente.';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.cuenta_de_cliente_para_restablecer(uuid) from public;
revoke execute on function public.cuenta_de_cliente_para_restablecer(uuid) from anon;
grant execute on function public.cuenta_de_cliente_para_restablecer(uuid) to authenticated;
