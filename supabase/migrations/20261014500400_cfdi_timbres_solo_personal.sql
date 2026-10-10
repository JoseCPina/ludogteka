-- Facturación CFDI: el contador de timbres es del personal (y de la tarea
-- programada), no de cualquier sesión. Antes devolvía el número a un cliente.
-- REVERSA: volver a crear la función de la migración 20261014500000.
create or replace function public.cfdi_timbres_mes()
returns table (usados integer, tope integer, aviso integer, cerca boolean, agotado boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tope integer;
  v_aviso integer;
  v_n integer;
begin
  if not (coalesce(public.is_staff(), false) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo el personal del negocio.';
  end if;
  select coalesce(c.tope_timbres_mes, 100), coalesce(c.aviso_timbres_pct, 80) into v_tope, v_aviso
  from (select 1) x left join public.cfdi_config_negocio c on c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  select count(*)::int into v_n from public.cfdi_facturas f
  where f.negocio_id = public.negocio_actual() and f.fecha_timbrado is not null and f.deleted_at is null
    and (f.fecha_timbrado at time zone public.zona_negocio())::date >= date_trunc('month', public.fecha_negocio())::date;
  return query select v_n, v_tope, v_aviso, v_n * 100 >= v_tope * v_aviso, v_n >= v_tope;
end;
$$;
