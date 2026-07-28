-- El endpoint de invite de staff necesita saber si un correo ya tiene cuenta
-- ANTES de llamar a auth.admin.generateLink({type:'invite'}): esa función no
-- rechaza un correo ya registrado si la cuenta sigue sin confirmar — la
-- reutiliza y regenera el link, lo que abriría la puerta a "reinvitar"
-- (y de paso cambiarle el rol) a alguien que ya existe.
--
-- Solo `service_role` la puede llamar (no `anon`/`authenticated`): expone
-- si un correo está registrado, así que no debe quedar abierta a enumeración.
create or replace function public.existe_usuario_por_email(p_email text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
$$;

revoke execute on function public.existe_usuario_por_email(text) from public;
grant execute on function public.existe_usuario_por_email(text) to service_role;
