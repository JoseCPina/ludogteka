-- QA S62 (UX): la ficha del cliente enseña su saldo pendiente y el historial de sus cuentas. Las últimas cuentas del
-- cliente con su nombre (sin correcciones, nombre_de_cuenta), total, lo pagado y el saldo, de la MISMA cuenta que Caja
-- (cuenta_totales_reserva). Solo personal de caja (admin y recepción); una llamada.
create or replace function public.cuentas_de_cliente(p_cliente uuid, p_limite int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_rol text := public.current_rol();
begin
  if v_rol not in ('admin', 'recepcion') then
    raise exception 'Solo admin y recepción ven las cuentas del cliente.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'reserva_id', r.id, 'creada', r.created_at, 'nombre', public.nombre_de_cuenta(r.id),
        'cancelada', exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = r.id),
        'total', t.total_cuenta, 'pagado', t.total_cobrado - t.total_devuelto, 'saldo', t.saldo) order by r.created_at desc)
    from (
      select r0.id, r0.created_at from public.reservas r0
      where r0.negocio_id = public.negocio_actual() and r0.cliente_id = p_cliente and r0.deleted_at is null
      order by r0.created_at desc limit least(greatest(coalesce(p_limite, 30), 1), 100)
    ) r
    cross join lateral public.cuenta_totales_reserva(r.id) t
    where t.total_cuenta > 0.005 or t.total_cobrado > 0.005
  ), '[]'::jsonb);
end;
$$;
alter function public.cuentas_de_cliente(uuid, int) owner to peludesk_definer;
revoke execute on function public.cuentas_de_cliente(uuid, int) from public, anon;
grant execute on function public.cuentas_de_cliente(uuid, int) to authenticated, service_role;
