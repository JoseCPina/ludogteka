-- El panel de admin necesita correo + rol + vinculación + fecha de alta
-- de cada cuenta. El correo vive en auth.users, que PostgREST no expone
-- directo — de ahí esta función en vez de una vista sobre profiles sola.
create or replace function public.listar_cuentas()
returns table (
  id uuid,
  email text,
  rol text,
  cliente_id uuid,
  creado_en timestamptz
)
language plpgsql
security definer
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver esto.';
  end if;

  return query
    select p.id, u.email, p.rol, p.cliente_id, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.deleted_at is null
    order by p.created_at desc;
end;
$$;

revoke execute on function public.listar_cuentas() from public;
grant execute on function public.listar_cuentas() to authenticated;
