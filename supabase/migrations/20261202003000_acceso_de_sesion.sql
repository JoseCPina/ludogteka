-- El middleware preguntaba en cada petición, en dos tandas seguidas, current_rol() y modulos_activos() y después
-- mis_permisos(), acceso_veterinaria() y es_medico_veterinario(): con getUser() eran 3 viajes a la base uno tras otro
-- antes de pintar cualquier pantalla o correr cualquier acción. Esta función devuelve lo mismo en un solo viaje, y el
-- middleware la lanza en paralelo con getUser().
--
-- No cambia ninguna regla: solo llama a las mismas cinco funciones (cada una sigue siendo security definer y lee el
-- negocio de la petición y la membresía de quien llama). Es INVOKER: no ve nada que quien llama no vea con ellas.
-- El middleware sigue tomando los permisos y lo de Veterinaria solo cuando la zona los pide (zonaPidePermisos /
-- zonaPideVeterinaria), así que la decisión de acceso es la misma.

create or replace function public.acceso_de_sesion()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'rol', public.current_rol(),
    'modulos', to_jsonb(coalesce(public.modulos_activos(), '{}'::text[])),
    'permisos', coalesce((select jsonb_agg(p) from public.mis_permisos() p), '[]'::jsonb),
    'acceso_veterinaria', coalesce(public.acceso_veterinaria(), false),
    'es_medico', coalesce(public.es_medico_veterinario(), false)
  );
$$;

revoke execute on function public.acceso_de_sesion() from public, anon;
grant execute on function public.acceso_de_sesion() to authenticated, service_role;
