-- El tope de alerta de tarjeta manual es una cifra interna del negocio: solo
-- el personal la lee (un cliente con sesión recibe NULL, nunca el monto).
create or replace function public.tarjeta_manual_tope()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(public.is_staff(), false) then coalesce((
    select a.tope_alerta from public.tarjeta_manual_ajustes a
    where a.negocio_id = public.negocio_actual() and a.deleted_at is null
  ), 2000) else null end;
$$;
