-- El selector de "Empleado" al agendar una cita de estética salía vacío
-- para recepción. No porque no hubiera personal de estética (en
-- producción sí lo hay), sino por el RLS de profiles: recepción solo
-- puede leer su propia fila y las de clientes, así que la consulta
-- "profiles con rol estetica o admin" le devolvía cero filas. Un campo
-- vacío que parece pantalla rota.
--
-- Esta función es la puerta con nombre para eso: quién puede quedar como
-- responsable de una cita (personal de estética y admin), legible por
-- cualquier staff, sin abrir el resto de profiles. Devuelve un nombre
-- para mostrar siempre: el nombre completo o, si no lo capturaron, la
-- parte local del correo (un option en blanco es lo que hay que evitar).
create or replace function public.listar_personal_estetica()
returns table (id uuid, nombre text, rol text)
language sql
security definer
stable
set search_path = ''
as $$
  select
    p.id,
    coalesce(nullif(btrim(p.nombre_completo), ''), split_part(u.email::text, '@', 1)) as nombre,
    p.rol
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.deleted_at is null
    and p.rol in ('estetica', 'admin')
    and public.is_staff()
  order by (p.rol = 'estetica') desc, 2;
$$;

revoke execute on function public.listar_personal_estetica() from public;
revoke execute on function public.listar_personal_estetica() from anon;
grant execute on function public.listar_personal_estetica() to authenticated;
