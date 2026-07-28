-- Helpers de rol para políticas RLS. SECURITY DEFINER + dueño postgres =
-- corren con RLS de por medio evitado sobre public.profiles, así que no hay
-- recursión al usarlos DENTRO de políticas de la propia tabla profiles.
create or replace function public.current_rol()
returns text
language sql
security definer
stable
set search_path = ''
as $$
  select rol from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.current_rol() = 'admin';
$$;

create or replace function public.is_staff()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select public.current_rol() in ('admin', 'recepcion', 'estetica');
$$;

grant execute on function public.current_rol() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;

-- rol/cliente_id/sucursal_id nunca los toca el propio dueño de la fila,
-- sin importar qué política de UPDATE lo dejó llegar hasta aquí. Sin esto,
-- un cliente podría auto-promoverse a admin editando su propio profile.
create or replace function public.proteger_columnas_sensibles_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    if new.rol is distinct from old.rol
       or new.cliente_id is distinct from old.cliente_id
       or new.sucursal_id is distinct from old.sucursal_id then
      raise exception 'Solo un admin puede modificar rol, cliente_id o sucursal_id de un profile';
    end if;
  end if;
  return new;
end;
$$;

create trigger proteger_columnas_sensibles
before update on public.profiles
for each row execute function public.proteger_columnas_sensibles_profile();

-- profiles: cada quien ve/edita su fila; admin ve/edita todas; recepción
-- además ve la cola de cuentas sin vincular (rol cliente, cliente_id null)
-- para poder resolverla a mano.
create policy profiles_select_propio
on public.profiles for select
to authenticated
using (id = auth.uid());

create policy profiles_select_admin
on public.profiles for select
to authenticated
using (public.is_admin());

create policy profiles_select_recepcion_pendientes
on public.profiles for select
to authenticated
using (
  public.current_rol() = 'recepcion'
  and rol = 'cliente'
  and cliente_id is null
);

create policy profiles_update_propio
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy profiles_update_admin
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- clientes: admin/recepción/estetica ven todos (ninguno de estos roles
-- expone datos financieros desde esta tabla); un cliente solo ve su propia
-- fila vía profiles.cliente_id. Solo admin/recepción dan de alta o editan
-- (incluye el borrado suave vía deleted_at).
create policy clientes_select_admin
on public.clientes for select
to authenticated
using (public.is_admin());

create policy clientes_select_recepcion
on public.clientes for select
to authenticated
using (public.current_rol() = 'recepcion');

create policy clientes_select_estetica
on public.clientes for select
to authenticated
using (public.current_rol() = 'estetica');

create policy clientes_select_propio
on public.clientes for select
to authenticated
using (id = (select cliente_id from public.profiles where id = auth.uid()));

create policy clientes_insert_staff
on public.clientes for insert
to authenticated
with check (public.current_rol() in ('admin', 'recepcion'));

create policy clientes_update_staff
on public.clientes for update
to authenticated
using (public.current_rol() in ('admin', 'recepcion'))
with check (public.current_rol() in ('admin', 'recepcion'));
