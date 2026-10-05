-- El historial de correcciones de servicio no se EDITA (ni siquiera con baja
-- lógica). Borrar queda solo para quien borra la cita de verdad (cascada) o el
-- negocio entero: nadie con sesión tiene DELETE (solo SELECT).
drop trigger citas_estetica_correcciones_inmutable on public.citas_estetica_correcciones;
create trigger citas_estetica_correcciones_inmutable before update on public.citas_estetica_correcciones
  for each row execute function public.citas_estetica_correcciones_inmutable();
create or replace function public.citas_estetica_correcciones_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El historial de correcciones de servicio no se edita.' using errcode = '42501';
end;
$$;
revoke execute on function public.citas_estetica_correcciones_inmutable() from public, anon;
