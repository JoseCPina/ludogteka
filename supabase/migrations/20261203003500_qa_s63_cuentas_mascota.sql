-- QA S63 (UX): la ficha de la mascota también enseña su saldo pendiente y el historial de sus cuentas: las cuentas
-- (reservas) donde la mascota tiene algo (estancia, cita de estética, cargo, hospitalización o estimado), con el mismo
-- nombre, total, pagado y saldo que Caja (cuenta_totales_reserva). Solo admin y recepción; una llamada.
create or replace function public.cuentas_de_mascota(p_perro uuid, p_limite int default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v_rol text := public.current_rol();
begin
  if v_rol not in ('admin', 'recepcion') then
    raise exception 'Solo admin y recepción ven las cuentas de la mascota.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
        'reserva_id', r.id, 'creada', r.created_at, 'nombre', public.nombre_de_cuenta(r.id),
        'cancelada', exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = r.id),
        'total', t.total_cuenta, 'pagado', t.total_cobrado - t.total_devuelto, 'saldo', t.saldo) order by r.created_at desc)
    from (
      select r0.id, r0.created_at from public.reservas r0
      where r0.negocio_id = public.negocio_actual() and r0.deleted_at is null
        and (
          exists (select 1 from public.estancias e where e.reserva_id = r0.id and e.perro_id = p_perro and e.deleted_at is null)
          or exists (select 1 from public.citas_estetica c where c.reserva_id = r0.id and c.perro_id = p_perro and c.deleted_at is null)
          or exists (select 1 from public.cargos_aplicados ca where ca.reserva_id = r0.id and ca.perro_id = p_perro and ca.deleted_at is null)
          or exists (select 1 from public.hospitalizaciones h where h.reserva_id = r0.id and h.perro_id = p_perro)
          or exists (select 1 from public.vet_estimados ve where ve.reserva_id = r0.id and ve.perro_id = p_perro)
        )
      order by r0.created_at desc limit least(greatest(coalesce(p_limite, 30), 1), 100)
    ) r
    cross join lateral public.cuenta_totales_reserva(r.id) t
    where t.total_cuenta > 0.005 or t.total_cobrado > 0.005
  ), '[]'::jsonb);
end;
$$;
alter function public.cuentas_de_mascota(uuid, int) owner to peludesk_definer;
revoke execute on function public.cuentas_de_mascota(uuid, int) from public, anon;
grant execute on function public.cuentas_de_mascota(uuid, int) to authenticated, service_role;
