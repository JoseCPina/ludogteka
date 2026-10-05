-- En PL/pgSQL, `arreglo_text || 'literal'` truena (22P02): se usa array_append.
create or replace function public.cotizar_correccion_servicio(
  p_cita_id uuid,
  p_servicio_id uuid,
  p_grupo_excepcion_id uuid default null,
  p_excepcion_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cita record;
  v_serv record;
  v_reservas uuid[];
  v_main uuid;
  v_ordenes jsonb;
  v_bloqueos text[] := '{}';
  v_saldo_antes numeric;
  v_saldo_despues numeric;
  v_pagado numeric := 0;
  v_precio_nuevo numeric;
  v_error text;
  v_pide_excepcion boolean := false;
  v_ok boolean := false;
  v_tipo text := 'ninguno';
  v_dif numeric;
  v_desc numeric := 0;
  v_nombre_actual text;
begin
  if coalesce(public.current_rol(), '') not in ('admin', 'recepcion')
     or not coalesce(public.tiene_permiso('corregir_servicio'), false) then
    raise exception 'Corregir el servicio de una cita es de admin o de quien tenga el permiso «Corregir servicio de citas».'
      using errcode = '42501';
  end if;

  select ce.id, ce.servicio_id, ce.servicio_nombre, ce.estado, ce.precio, ce.reserva_id, e.reserva_id as reserva_estancia
    into v_cita
  from public.citas_estetica ce
  left join public.estancias e on e.id = ce.estancia_id
  where ce.id = p_cita_id and ce.deleted_at is null;
  if not found then
    raise exception 'No encontramos esa cita.';
  end if;
  v_main := v_cita.reserva_id;
  v_reservas := array_remove(array[v_cita.reserva_id, v_cita.reserva_estancia], null);
  v_nombre_actual := coalesce(v_cita.servicio_nombre, (select s.nombre from public.servicios s where s.id = v_cita.servicio_id), 'Servicio');

  select s.id, s.nombre, s.categoria into v_serv
  from public.servicios s where s.id = p_servicio_id and s.deleted_at is null;

  if v_cita.estado in ('cancelada', 'no_llego') then
    v_bloqueos := array_append(v_bloqueos, 'Esta cita está cerrada (cancelada o no llegó): no tiene servicio que corregir.');
  end if;
  if v_serv.id is null then
    v_bloqueos := array_append(v_bloqueos, 'Ese servicio no existe o ya no se ofrece.');
  elsif v_serv.categoria <> 'estetica' then
    v_bloqueos := array_append(v_bloqueos, 'Escoge un servicio de estética.');
  elsif v_serv.id = v_cita.servicio_id then
    v_bloqueos := array_append(v_bloqueos, 'Es el mismo servicio que ya tiene la cita.');
  end if;
  if exists (
    select 1 from public.movimientos_bono mb
    where mb.item_tipo = 'estetica' and mb.item_id = p_cita_id and mb.tipo = 'consumo'
  ) then
    v_bloqueos := array_append(v_bloqueos, 'Esta cita se cubrió con un pase: corrige primero el consumo del pase.');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'tipo', o.tipo, 'estado', o.estado, 'monto', o.monto, 'proveedor', o.proveedor) order by o.estado), '[]'::jsonb)
    into v_ordenes
  from public.ordenes_abiertas_de_reservas(v_reservas) o;
  if exists (select 1 from public.ordenes_abiertas_de_reservas(v_reservas) o where o.estado = 'por_confirmar') then
    v_bloqueos := array_append(v_bloqueos, 'Hay un cobro por confirmar con el proveedor: revísalo en la cuenta antes de corregir el servicio.');
  end if;

  select t.saldo, t.total_cobrado - t.total_devuelto into v_saldo_antes, v_pagado
  from public.cuenta_totales_reserva(v_main) t;
  select coalesce(sum(da.monto_aplicado), 0) into v_desc
  from public.descuentos_aplicados da where da.reserva_id = v_main and da.cancelado = false;

  if cardinality(v_bloqueos) = 0 then
    begin
      perform set_config('app.correccion_servicio', 'on', true);
      if p_grupo_excepcion_id is not null then
        update public.citas_estetica
        set servicio_id = p_servicio_id,
            grupo_raza_excepcion_id = p_grupo_excepcion_id,
            excepcion_grupo_motivo = nullif(btrim(coalesce(p_excepcion_motivo, '')), '')
        where id = p_cita_id;
      else
        update public.citas_estetica set servicio_id = p_servicio_id where id = p_cita_id;
      end if;
      select precio into v_precio_nuevo from public.citas_estetica where id = p_cita_id;
      select saldo into v_saldo_despues from public.cuenta_totales_reserva(v_main);
      raise exception using errcode = 'P0099', message = 'cotizacion';
    exception
      when sqlstate 'P0099' then
        v_ok := true;
      when others then
        v_error := sqlerrm;
        v_pide_excepcion := v_error ilike '%grupo de precio%' or v_error ilike '%solo cobra autom_tico%';
    end;
    perform set_config('app.correccion_servicio', 'off', true);
  end if;

  v_dif := coalesce(v_precio_nuevo, v_cita.precio) - v_cita.precio;
  if v_ok then
    v_tipo := case
      when v_dif = 0 or v_pagado <= 0 then 'ninguno'
      when v_dif > 0 and v_saldo_despues > 0 then 'cobro_adicional'
      when v_dif < 0 and v_saldo_despues < 0 then 'saldo_a_favor'
      else 'ninguno'
    end;
  end if;

  return jsonb_build_object(
    'ok', v_ok and cardinality(v_bloqueos) = 0,
    'error', case when cardinality(v_bloqueos) > 0 then v_bloqueos[1] else v_error end,
    'bloqueos', to_jsonb(v_bloqueos),
    'pide_excepcion', v_pide_excepcion,
    'servicio_actual', v_nombre_actual,
    'servicio_nuevo', v_serv.nombre,
    'precio_actual', v_cita.precio,
    'precio_nuevo', v_precio_nuevo,
    'diferencia', case when v_ok then v_dif end,
    'estado_cita', v_cita.estado,
    'pagado', v_pagado,
    'saldo_actual', v_saldo_antes,
    'saldo_despues', v_saldo_despues,
    'tipo_ajuste', v_tipo,
    'descuento_cuenta', v_desc,
    'ordenes_abiertas', v_ordenes
  );
end;
$$;
alter function public.cotizar_correccion_servicio(uuid, uuid, uuid, text) owner to peludesk_definer;
revoke execute on function public.cotizar_correccion_servicio(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.cotizar_correccion_servicio(uuid, uuid, uuid, text) to authenticated, service_role;
