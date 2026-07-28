-- El cliente puede corregir su teléfono y correo, nunca su nombre (eso lo
-- maneja recepción). Deliberadamente NO es una política RLS de UPDATE
-- sobre clientes: ya nos topamos una vez (vinculación de profiles) con
-- que Postgres necesita visibilidad bajo RLS sobre el espacio donde
-- podría haber un conflicto de índice único para poder validarlo, y
-- clientes.email tiene ese mismo tipo de índice (clientes_email_activo_idx,
-- Migración 1). clientes_select_propio solo deja ver la fila propia — así
-- que ampliar eso para que el chequeo de unicidad "funcione" filtraría
-- datos de otros clientes al dueño de la cuenta, que es justo lo que no
-- queremos. Una función SECURITY DEFINER evita el problema por completo:
-- corre con visibilidad total, sin pasar por RLS, y el límite de
-- seguridad lo pone la función misma (solo toca la fila de auth.uid()),
-- no una política.
create or replace function public.actualizar_mi_cliente(p_telefono text, p_email text)
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

  update public.clientes
  set telefono = p_telefono, email = p_email
  where id = v_cliente_id
    and deleted_at is null;

  if not found then
    raise exception 'No pudimos encontrar tu expediente.';
  end if;
end;
$$;

revoke execute on function public.actualizar_mi_cliente(text, text) from public;
grant execute on function public.actualizar_mi_cliente(text, text) to authenticated;
