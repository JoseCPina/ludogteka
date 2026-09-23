-- El dueño sube o reemplaza la foto de identificación de su perro desde el
-- portal. Se aplica directo, sin pasar por recepción: es una foto de
-- identificación, no un documento que haya que confirmar contra nada.
--
-- Mismo patrón que actualizar_mi_perro: SECURITY DEFINER en vez de una
-- política de UPDATE sobre perros, porque foto_path convive con columnas
-- de solo-staff y una política no puede separarlas. Solo el dueño
-- PRINCIPAL (perros.cliente_id), nunca un acceso compartido; nunca un
-- perro fallecido (su foto se queda como está); y solo una ruta dentro
-- de la carpeta de perfil de ESE perro — así ni con la sesión del dueño
-- se puede apuntar foto_path a un archivo de otro perro o de otro dueño
-- y verlo firmado desde el portal.
--
-- La foto la sube el servidor de la app con la secret key después de las
-- mismas comprobaciones (src/app/portal/foto-mi-perro-actions.ts): el
-- dueño no gana ninguna política de escritura sobre el bucket.
create or replace function public.actualizar_foto_mi_perro(
  p_perro_id uuid,
  p_foto_path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente_id uuid;
begin
  select cliente_id into v_cliente_id
  from public.profiles
  where id = auth.uid();

  if v_cliente_id is null then
    raise exception 'Tu cuenta no está vinculada a un expediente.';
  end if;

  if p_foto_path is null
     or p_foto_path not like v_cliente_id::text || '/' || p_perro_id::text || '/perfil/%' then
    raise exception 'La ruta de la foto no corresponde a este perro.';
  end if;

  update public.perros
  set foto_path = p_foto_path
  where id = p_perro_id
    and cliente_id = v_cliente_id
    and deleted_at is null
    and fallecido = false;

  if not found then
    raise exception 'Solo el dueño principal puede cambiar la foto, y no la de un perro que falleció.';
  end if;
end;
$$;

revoke execute on function public.actualizar_foto_mi_perro(uuid, text) from public;
revoke execute on function public.actualizar_foto_mi_perro(uuid, text) from anon;
grant execute on function public.actualizar_foto_mi_perro(uuid, text) to authenticated;
