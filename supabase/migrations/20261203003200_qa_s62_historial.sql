-- QA S62 (UX del historial de caja).
--   · El detalle de un cobro dice si fue abono y el saldo que quedó en la cuenta después de él (con el total de la
--     cuenta de hoy; corte ciego igual que los montos).
--   · El abono de una venta no sale en dos categorías: el filtro «Cobros y abonos» son los cobros de servicios; las
--     ventas de mostrador y los pases tienen el suyo.

-- El saldo de la cuenta justo después de un cobro: total de la cuenta − pases − descuentos − lo cobrado hasta ese cobro
-- (incluido) + lo devuelto hasta ese momento. La misma cuenta que cuenta_totales_reserva.
create or replace function public.saldo_tras_cobro(p_cobro uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  with c as (select id, reserva_id, created_at from public.cobros where id = p_cobro),
  t as (select x.* from c cross join lateral public.cuenta_totales_reserva(c.reserva_id) x)
  select round(
    (select coalesce(t.total_cuenta, 0) - coalesce(t.total_bono, 0) - coalesce(t.total_descuento, 0) from t)
    - coalesce((select sum(cm.monto) from public.cobro_metodos cm join public.cobros c2 on c2.id = cm.cobro_id, c
                where c2.reserva_id = c.reserva_id and c2.created_at <= c.created_at), 0)
    + coalesce((select sum(dm.monto) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
                join public.cobros c3 on c3.id = d.cobro_id, c
                where c3.reserva_id = c.reserva_id and d.deleted_at is null and d.created_at <= c.created_at), 0), 2);
$$;
revoke execute on function public.saldo_tras_cobro(uuid) from public, anon;
grant execute on function public.saldo_tras_cobro(uuid) to authenticated, service_role, peludesk_definer;

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.caja_movimiento_detalle(text, uuid)'::regprocedure), E'\r', '') into v_def;
  if position('''anulado'', c.anulado_at is not null,' in v_def) = 0 then
    raise exception 'caja_movimiento_detalle cambió: no encuentro el cobro.';
  end if;
  v_def := replace(v_def, '''anulado'', c.anulado_at is not null,',
    '''anulado'', c.anulado_at is not null, ''saldo_despues'', case when v_ciego then null else public.saldo_tras_cobro(c.id) end,');
  execute v_def;

  select replace(pg_get_functiondef('public.caja_movimientos(date, date, uuid, text, text, int, int)'::regprocedure), E'\r', '') into v_def;
  if position('(p_tipo = ''cobro'' and m.tipo in (''cobro'', ''venta_mostrador'', ''venta_bono'') and m.ajuste_tipo is null)' in v_def) = 0 then
    raise exception 'caja_movimientos cambió: no encuentro el filtro de cobros.';
  end if;
  v_def := replace(v_def, '(p_tipo = ''cobro'' and m.tipo in (''cobro'', ''venta_mostrador'', ''venta_bono'') and m.ajuste_tipo is null)',
                          '(p_tipo = ''cobro'' and m.tipo = ''cobro'' and m.ajuste_tipo is null)');
  execute v_def;
end $$;
