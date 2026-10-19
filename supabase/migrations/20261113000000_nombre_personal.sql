-- QA N24 (18 de octubre de 2026): una cuenta del personal sin nombre (ni en su perfil ni en su ficha de empleado)
-- salía como «Sin nombre» en el encabezado, el historial de cobros y Permisos. La app le pide su nombre completo
-- una sola vez al entrar y lo guarda aquí, en SU perfil. Solo para el personal de ESTE negocio y solo si su perfil
-- no tiene nombre (no reescribe el de nadie: el nombre de una persona lo comparten sus negocios).

create or replace function public.guardar_mi_nombre_personal(p_nombre text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g');
  v_actual text;
begin
  if auth.uid() is null or not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio guarda su nombre aquí.' using errcode = '42501';
  end if;
  if char_length(v_nombre) < 5 or char_length(v_nombre) > 120 or array_length(regexp_split_to_array(v_nombre, ' '), 1) < 2 then
    raise exception 'Escribe tu nombre completo (nombre y apellido).' using errcode = '22023';
  end if;
  if v_nombre ~ '@' or v_nombre ~ '[0-9]{4,}' then
    raise exception 'Escribe tu nombre, no tu correo ni tu teléfono.' using errcode = '22023';
  end if;
  select nullif(btrim(nombre_completo), '') into v_actual from public.profiles where id = auth.uid();
  if v_actual is not null then
    return v_actual;
  end if;
  update public.profiles set nombre_completo = v_nombre where id = auth.uid();
  return v_nombre;
end;
$$;
alter function public.guardar_mi_nombre_personal(text) owner to peludesk_definer;
revoke execute on function public.guardar_mi_nombre_personal(text) from public, anon;
grant execute on function public.guardar_mi_nombre_personal(text) to authenticated, service_role;
