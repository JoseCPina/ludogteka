-- auth.users.email es varchar(255), no text: el tipo de retorno declarado
-- de listar_cuentas() no lo aceptaba tal cual ("structure of query does
-- not match function result type"). Cast explícito a text.
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
    select p.id, u.email::text, p.rol, p.cliente_id, p.created_at
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.deleted_at is null
    order by p.created_at desc;
end;
$$;
