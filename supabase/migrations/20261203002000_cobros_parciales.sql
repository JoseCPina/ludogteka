-- Cobros parciales (ux/cobros-parciales, 3 de noviembre de 2026; solo funciones, nada de datos). docs/caja-y-cuentas.md.
-- Una cuenta ya admitía abonos (registrar_cobro valida contra el saldo, no exige el total). Esto agrega lo que faltaba
-- para VERLOS, siempre de la misma fuente (cuenta_totales_reserva y los cobros registrados):
--   1. saldos_de_reservas(uuid[]): el saldo de varias cuentas en UNA consulta (las salidas del día en Recepción).
--   2. mis_abonos(reserva): para el dueño, lo pagado y la lista de sus abonos (fecha, forma de pago y monto) de SU cuenta,
--      sin quién cobró ni nada del personal. Mismo criterio que mis_pagos_pendientes: el dueño ve lo suyo por función.

create or replace function public.saldos_de_reservas(p_reservas uuid[])
returns jsonb
language sql
stable
set search_path = ''
as $$
  -- Solo el personal (el saldo de cuentas ajenas no es del dueño); invoker: la RLS de quien llama manda.
  select coalesce(jsonb_object_agg(r.id, (select t.saldo from public.cuenta_totales_reserva(r.id) t)), '{}'::jsonb)
  from unnest(coalesce(p_reservas, '{}'::uuid[])) as r(id)
  where (select public.is_staff());
$$;
revoke execute on function public.saldos_de_reservas(uuid[]) from public, anon;
grant execute on function public.saldos_de_reservas(uuid[]) to authenticated, service_role;

create or replace function public.mis_abonos(p_reserva uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.mi_cliente_id();
  v_t record;
begin
  if v_cliente is null then
    raise exception 'Solo el dueño, desde su cuenta.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.reservas r where r.id = p_reserva and r.cliente_id = v_cliente and r.deleted_at is null
                 and r.negocio_id = public.negocio_actual()) then
    raise exception 'Esa cuenta no es tuya.' using errcode = '42501';
  end if;
  select * into v_t from public.cuenta_totales_reserva(p_reserva);
  return jsonb_build_object(
    'total', v_t.total_cuenta,
    'pagado', v_t.total_cobrado - v_t.total_devuelto,
    'cubierto', v_t.total_bono + v_t.total_descuento,
    'saldo', v_t.saldo,
    'abonos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', c.created_at,
               'monto', (select coalesce(sum(cm.monto), 0) from public.cobro_metodos cm where cm.cobro_id = c.id),
               'formas', (select coalesce(jsonb_agg(distinct cm.metodo), '[]'::jsonb) from public.cobro_metodos cm where cm.cobro_id = c.id and cm.monto > 0),
               'por_link', c.origen = 'mercadopago_link') order by c.created_at)
      from public.cobros c
      where c.reserva_id = p_reserva and c.anulado_at is null and c.negocio_id = public.negocio_actual()
    ), '[]'::jsonb),
    'devoluciones', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', d.created_at,
               'monto', (select coalesce(sum(dm.monto), 0) from public.devolucion_metodos dm where dm.devolucion_id = d.id)) order by d.created_at)
      from public.devoluciones d join public.cobros c on c.id = d.cobro_id
      where c.reserva_id = p_reserva and d.negocio_id = public.negocio_actual()
    ), '[]'::jsonb)
  );
end;
$$;
alter function public.mis_abonos(uuid) owner to peludesk_definer;
revoke execute on function public.mis_abonos(uuid) from public, anon;
grant execute on function public.mis_abonos(uuid) to authenticated, service_role;
grant execute on function public.cuenta_totales_reserva(uuid) to peludesk_definer;
