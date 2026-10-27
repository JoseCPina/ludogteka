-- QA S39 (N138): al guardar (también «guardar los míos encima»), la acción devuelve cómo quedó el registro para que la
-- pantalla lo pinte al momento y tome su versión como la leída (`registrosFinales`, src/lib/concurrencia/registro-final.ts).
-- Las citas y consultas de Veterinaria no se leen directo (su política de lectura es `false`: todo va por funciones),
-- así que su versión sale de aquí: solo el updated_at, sin ningún dato clínico, para el personal del negocio.
create or replace function public.version_registro_vet(p_tabla text, p_id uuid)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v timestamptz;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio.' using errcode = '42501';
  end if;
  if p_tabla = 'vet_citas' then
    select c.updated_at into v from public.vet_citas c where c.id = p_id and c.negocio_id = public.negocio_actual();
  elsif p_tabla = 'vet_consultas' then
    select c.updated_at into v from public.vet_consultas c where c.id = p_id and c.negocio_id = public.negocio_actual();
  else
    raise exception 'Tipo de registro no válido: %', p_tabla;
  end if;
  return v;
end;
$$;
alter function public.version_registro_vet(text, uuid) owner to peludesk_definer;
revoke execute on function public.version_registro_vet(text, uuid) from public, anon;
grant execute on function public.version_registro_vet(text, uuid) to authenticated, service_role;
