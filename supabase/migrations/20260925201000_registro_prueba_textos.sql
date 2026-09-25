-- Los motivos de rechazo del registro de prueba se le muestran tal cual a
-- la persona: sin mandarla a "escribirnos" mientras PeluDesk no tenga un
-- canal de contacto publicado (el WhatsApp va a ser un bot, más adelante).
create or replace function public.puede_registrar_prueba(p_telefono text, p_ip text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.registros_prueba r where r.telefono = p_telefono and r.deleted_at is null)
      then 'Ese teléfono ya tiene un negocio en PeluDesk. Entra a tu negocio con tu teléfono y tu contraseña.'
    when p_ip is not null and (select count(*) from public.registros_prueba r
                               where r.ip = p_ip and r.created_at > now() - interval '1 day') >= 3
      then 'Se registraron varios negocios desde esta conexión hoy. Intenta de nuevo mañana.'
  end;
$$;
revoke execute on function public.puede_registrar_prueba(text, text) from public, anon, authenticated;
grant execute on function public.puede_registrar_prueba(text, text) to service_role;
