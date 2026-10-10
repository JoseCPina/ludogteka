-- Veterinaria · acceso a la zona (carril A).
--
-- Hasta hoy /veterinaria solo abría para los roles admin y recepción, así que un médico
-- veterinario designado cuyo rol en el negocio es «estetica» (o cualquier otro del personal)
-- no podía entrar a su propio expediente. El acceso a la ZONA ahora depende de la
-- designación de médico veterinario o de tener algún permiso del módulo, cualquiera que
-- sea el rol. Cada pantalla y cada función sigue validando SU permiso en la base
-- (`vet_puede`): esto solo decide si la persona ve la zona.
create or replace function public.acceso_veterinaria()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.modulo_activo('veterinaria'), false)
    and coalesce(public.is_staff(), false)
    and (
      coalesce(public.is_admin(), false)
      or coalesce(public.es_medico_veterinario(), false)
      or exists (
        select 1 from public.permisos_catalogo c
        where c.deleted_at is null and 'veterinaria' = any (c.modulos)
          and coalesce(public.tiene_permiso(c.clave), false)
      )
    );
$$;
alter function public.acceso_veterinaria() owner to peludesk_definer;
revoke execute on function public.acceso_veterinaria() from public, anon;
grant execute on function public.acceso_veterinaria() to authenticated, service_role;
