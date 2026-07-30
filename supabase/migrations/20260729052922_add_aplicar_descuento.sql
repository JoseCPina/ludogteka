-- Única puerta de entrada para aplicar un descuento — la validación del
-- tope vive AQUÍ, en trigger/función, no solo en la pantalla: "un
-- descuento sin límite es una fuga de dinero con permiso". Resuelve el
-- total de la cuenta y el tope vigente él mismo, nunca confía en lo que
-- mande el cliente.
create or replace function public.aplicar_descuento(
  p_reserva_id uuid,
  p_catalogo_descuento_id uuid,
  p_tipo text,
  p_valor numeric,
  p_motivo_adicional text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_cuenta numeric;
  v_ya_descontado numeric;
  v_monto_aplicado numeric;
  v_tope numeric;
  v_autorizado_por uuid;
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un descuento.';
  end if;

  if not exists (select 1 from public.reservas where id = p_reserva_id) then
    raise exception 'Reserva no encontrada.';
  end if;

  if p_tipo not in ('porcentaje', 'monto_fijo') then
    raise exception 'Tipo de descuento inválido: %', p_tipo;
  end if;
  if p_valor is null or p_valor <= 0 then
    raise exception 'El valor del descuento debe ser mayor a cero.';
  end if;
  if p_tipo = 'porcentaje' and p_valor > 100 then
    raise exception 'Un descuento por porcentaje no puede pasar de 100.';
  end if;

  if not exists (
    select 1 from public.catalogo_descuentos where id = p_catalogo_descuento_id and deleted_at is null
  ) then
    raise exception 'Motivo de descuento no encontrado.';
  end if;

  select total_cuenta into v_total_cuenta from public.cuenta_totales_reserva(p_reserva_id);

  select coalesce(sum(monto_aplicado), 0) into v_ya_descontado
  from public.descuentos_aplicados
  where reserva_id = p_reserva_id and cancelado = false;

  v_monto_aplicado := case
    when p_tipo = 'porcentaje' then round(v_total_cuenta * p_valor / 100, 2)
    else p_valor
  end;

  if v_monto_aplicado <= 0 then
    raise exception 'El descuento calculado debe ser mayor a cero.';
  end if;

  if v_ya_descontado + v_monto_aplicado > v_total_cuenta then
    raise exception 'Ese descuento deja la cuenta en negativo (total de la cuenta: %, ya descontado: %).',
      v_total_cuenta, v_ya_descontado;
  end if;

  select tope_recepcion into v_tope from public.resolver_tope_descuento_recepcion(public.fecha_negocio());
  v_tope := coalesce(v_tope, 0);

  v_autorizado_por := null;
  if v_monto_aplicado > v_tope then
    if not public.is_admin() then
      raise exception 'Este descuento ($%) pasa el tope de recepción ($%). Solo un admin puede aplicarlo.',
        v_monto_aplicado, v_tope;
    end if;
    if p_motivo_adicional is null or btrim(p_motivo_adicional) = '' then
      raise exception 'Un descuento arriba del tope necesita un motivo por escrito.';
    end if;
    v_autorizado_por := auth.uid();
  end if;

  insert into public.descuentos_aplicados (
    reserva_id, catalogo_descuento_id, tipo, valor, monto_aplicado, motivo_adicional, autorizado_por, created_by
  ) values (
    p_reserva_id, p_catalogo_descuento_id, p_tipo, p_valor, v_monto_aplicado,
    nullif(btrim(p_motivo_adicional), ''), v_autorizado_por, auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function public.aplicar_descuento(uuid, uuid, text, numeric, text) from public;
grant execute on function public.aplicar_descuento(uuid, uuid, text, numeric, text) to authenticated;
