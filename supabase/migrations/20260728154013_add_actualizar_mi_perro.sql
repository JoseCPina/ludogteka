-- Mismo patrón que actualizar_mi_cliente: SECURITY DEFINER en vez de una
-- política de UPDATE, porque estas columnas conviven en perros con otras
-- de solo-staff (nombre, tamaño, fallecido, etc.) y no hay forma de
-- separar eso con una sola política sin un trigger de protección de
-- columnas. La función solo toca las 5 columnas acordadas en Q1 y solo en
-- la fila cuyo cliente_id es el del dueño principal — un acceso compartido
-- (perro_accesos_compartidos) es de solo lectura, no puede editar aquí.
create or replace function public.actualizar_mi_perro(
  p_perro_id uuid,
  p_contacto_emergencia_nombre text,
  p_contacto_emergencia_telefono text,
  p_veterinario_nombre text,
  p_veterinario_telefono text,
  p_veterinario_clinica text,
  p_autorizacion_medica_notas text,
  p_tope_gasto_autorizado numeric,
  p_alimentacion_notas text
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

  update public.perros
  set
    contacto_emergencia_nombre = p_contacto_emergencia_nombre,
    contacto_emergencia_telefono = p_contacto_emergencia_telefono,
    veterinario_nombre = p_veterinario_nombre,
    veterinario_telefono = p_veterinario_telefono,
    veterinario_clinica = p_veterinario_clinica,
    autorizacion_medica_notas = p_autorizacion_medica_notas,
    tope_gasto_autorizado = p_tope_gasto_autorizado,
    alimentacion_notas = p_alimentacion_notas
  where id = p_perro_id
    and cliente_id = v_cliente_id
    and deleted_at is null;

  if not found then
    raise exception 'No pudimos encontrar ese perro en tu expediente.';
  end if;
end;
$$;

revoke execute on function public.actualizar_mi_perro(
  uuid, text, text, text, text, text, text, numeric, text
) from public;
grant execute on function public.actualizar_mi_perro(
  uuid, text, text, text, text, text, text, numeric, text
) to authenticated;
