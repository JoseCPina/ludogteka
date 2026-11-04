-- QA S63 · N167 (ALTO): «Mover fechas» no podía guardar ninguna fecha que la base rechazara por una regla.
-- Causa: estancia_cotizar_fechas (20261114000000) atrapa el error del UPDATE de prueba en `v_error` y después arma la
-- respuesta leyendo `v_despues.total_cuenta`; cuando el UPDATE falló, `v_despues` nunca se asignó y leerlo truena
-- (`55000 record "v_despues" is not assigned yet`), así que el mensaje real se perdía y la pantalla decía «No pudimos
-- guardar esto». Desde el candado de día cerrado (20261202001300, QA R44/S33) cualquier fecha de entrada (o salida de
-- hotel) en un día que el negocio no abre cae ahí, y mover fechas no tenía cómo confirmarlo.
-- Arreglo: la cotización devuelve el error real con su código (`dia_cerrado`, `cupo`…) sin leer lo que no existe, y las
-- dos funciones reciben `p_dia_cerrado_confirmado` para que la pantalla confirme el día cerrado como en la reserva nueva
-- (la columna queda con lo confirmado y la bitácora con quién).
drop function if exists public.estancia_cotizar_fechas(uuid, date, date);
drop function if exists public.estancia_mover_fechas(uuid, date, date, numeric);

create or replace function public.estancia_cotizar_fechas(
  p_estancia_id uuid, p_entrada date, p_salida date, p_dia_cerrado_confirmado boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_reserva uuid;
  v_total_antes numeric;
  v_saldo_antes numeric;
  v_total_despues numeric;
  v_saldo_despues numeric;
  v_precio numeric;
  v_error text;
  v_codigo text;
begin
  select reserva_id into v_reserva from public.estancias where id = p_estancia_id and deleted_at is null;
  if v_reserva is null then
    raise exception 'No encontramos esa reserva.';
  end if;
  select t.total_cuenta, t.saldo into v_total_antes, v_saldo_antes from public.cuenta_totales_reserva(v_reserva) t;
  begin
    update public.estancias
       set fecha_entrada = p_entrada, fecha_salida = p_salida,
           dia_cerrado_confirmado = case when p_dia_cerrado_confirmado then 'confirmado' else dia_cerrado_confirmado end
     where id = p_estancia_id;
    select precio_unitario into v_precio from public.estancias where id = p_estancia_id;
    select t.total_cuenta, t.saldo into v_total_despues, v_saldo_despues from public.cuenta_totales_reserva(v_reserva) t;
    raise exception using errcode = 'P0001', message = '__vista_previa__';
  exception when others then
    if sqlerrm <> '__vista_previa__' then
      get stacked diagnostics v_codigo = pg_exception_hint;
      v_error := sqlerrm;
      v_codigo := coalesce(nullif(v_codigo, ''), sqlstate);
      v_total_despues := null;
      v_saldo_despues := null;
    end if;
  end;
  return jsonb_build_object(
    'error', v_error, 'codigo', v_codigo,
    'total_antes', v_total_antes, 'saldo_antes', v_saldo_antes,
    'total_despues', v_total_despues, 'saldo_despues', v_saldo_despues,
    'precio_unitario', v_precio
  );
end;
$$;
revoke execute on function public.estancia_cotizar_fechas(uuid, date, date, boolean) from public, anon;
grant execute on function public.estancia_cotizar_fechas(uuid, date, date, boolean) to authenticated, service_role;

-- Guardar: el mismo cambio, y si el total que resulta no es el que la persona vio, no se guarda.
create or replace function public.estancia_mover_fechas(
  p_estancia_id uuid, p_entrada date, p_salida date, p_total_visto numeric, p_dia_cerrado_confirmado boolean default false
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_reserva uuid;
  v_total numeric;
  v_saldo numeric;
begin
  select reserva_id into v_reserva from public.estancias where id = p_estancia_id and deleted_at is null;
  if v_reserva is null then
    raise exception 'No encontramos esa reserva.';
  end if;
  update public.estancias
     set fecha_entrada = p_entrada, fecha_salida = p_salida,
         dia_cerrado_confirmado = case when p_dia_cerrado_confirmado then 'confirmado' else dia_cerrado_confirmado end
   where id = p_estancia_id;
  select t.total_cuenta, t.saldo into v_total, v_saldo from public.cuenta_totales_reserva(v_reserva) t;
  if p_total_visto is null or abs(coalesce(v_total, 0) - p_total_visto) > 0.005 then
    raise exception 'Con esas fechas el total de la cuenta queda en $%. Revisa la vista previa antes de guardar.',
      to_char(coalesce(v_total, 0), 'FM999,999,990.00')
      using errcode = 'P0001', hint = 'total_distinto';
  end if;
  return jsonb_build_object('total', v_total, 'saldo', v_saldo,
    'version', (select updated_at from public.estancias where id = p_estancia_id));
end;
$$;
revoke execute on function public.estancia_mover_fechas(uuid, date, date, numeric, boolean) from public, anon;
grant execute on function public.estancia_mover_fechas(uuid, date, date, numeric, boolean) to authenticated, service_role;
