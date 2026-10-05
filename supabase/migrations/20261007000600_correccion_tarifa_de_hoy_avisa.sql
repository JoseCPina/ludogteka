-- Las funciones de corrección dicen cuando el precio salió de la tarifa de hoy (la cita es
-- anterior a la primera tarifa vigente).

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
  v_tarifa_hoy boolean := false;
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
      v_tarifa_hoy := coalesce(current_setting('app.correccion_tarifa_hoy', true), '') = 'on';
      raise exception using errcode = 'P0099', message = 'cotizacion';
    exception
      when sqlstate 'P0099' then
        v_ok := true;
      when others then
        v_error := sqlerrm;
        v_pide_excepcion := v_error ilike '%grupo de precio%' or v_error ilike '%solo cobra autom_tico%';
    end;
    perform set_config('app.correccion_servicio', 'off', true);
    perform set_config('app.correccion_tarifa_hoy', 'off', true);
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
    'ordenes_abiertas', v_ordenes,
    'tarifa_de_hoy', v_tarifa_hoy
  );
end;
$$;

create or replace function public.corregir_servicio_cita(
  p_cita_id uuid,
  p_servicio_id uuid,
  p_motivo text,
  p_grupo_excepcion_id uuid default null,
  p_excepcion_motivo text default null,
  p_precio_esperado numeric default null,
  p_ordenes_canceladas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_cita record;
  v_serv record;
  v_reservas uuid[];
  v_main uuid;
  v_saldo_antes numeric;
  v_saldo_despues numeric;
  v_pagado numeric := 0;
  v_precio_nuevo numeric;
  v_tipo text := 'ninguno';
  v_dif numeric;
  v_nombre_ant text;
  v_inv jsonb := '{}'::jsonb;
  v_n_regresa int := 0;
  v_n_consume int := 0;
  v_r record;
  v_tamano uuid;
  v_ajuste_nomina boolean := false;
  v_id uuid;
  v_abierta record;
  v_tarifa_hoy boolean := false;
begin
  if coalesce(public.current_rol(), '') not in ('admin', 'recepcion')
     or not coalesce(public.tiene_permiso('corregir_servicio'), false) then
    raise exception 'Corregir el servicio de una cita es de admin o de quien tenga el permiso «Corregir servicio de citas».'
      using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Escribe el motivo de la corrección: el cambio queda en el historial de la cita.';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception 'El motivo es demasiado largo (máximo 300 caracteres).';
  end if;

  select ce.id, ce.servicio_id, ce.servicio_nombre, ce.estado, ce.precio, ce.reserva_id, ce.empleado_id, e.reserva_id as reserva_estancia
    into v_cita
  from public.citas_estetica ce
  left join public.estancias e on e.id = ce.estancia_id
  where ce.id = p_cita_id and ce.deleted_at is null
  for update of ce;
  if not found then
    raise exception 'No encontramos esa cita.';
  end if;
  if v_cita.estado in ('cancelada', 'no_llego') then
    raise exception 'Esta cita está cerrada (cancelada o no llegó): no tiene servicio que corregir.';
  end if;
  if v_cita.servicio_id = p_servicio_id then
    raise exception 'Es el mismo servicio que ya tiene la cita.';
  end if;

  select s.id, s.nombre, s.categoria into v_serv
  from public.servicios s where s.id = p_servicio_id and s.deleted_at is null;
  if v_serv.id is null then
    raise exception 'Ese servicio no existe o ya no se ofrece.';
  end if;
  if v_serv.categoria <> 'estetica' then
    raise exception 'Escoge un servicio de estética.';
  end if;
  if exists (
    select 1 from public.movimientos_bono mb
    where mb.item_tipo = 'estetica' and mb.item_id = p_cita_id and mb.tipo = 'consumo'
  ) then
    raise exception 'Esta cita se cubrió con un pase: corrige primero el consumo del pase.';
  end if;

  v_main := v_cita.reserva_id;
  v_reservas := array_remove(array[v_cita.reserva_id, v_cita.reserva_estancia], null);

  -- Un cobro en curso por el monto equivocado: la app lo cancela con el
  -- proveedor ANTES de llamar aquí. Si queda alguno, no se cambia nada.
  select o.* into v_abierta from public.ordenes_abiertas_de_reservas(v_reservas) o
  order by (o.estado = 'por_confirmar') desc limit 1;
  if found then
    if v_abierta.estado = 'por_confirmar' then
      raise exception 'Hay un cobro por confirmar con el proveedor (por $%): revísalo en la cuenta antes de corregir el servicio.', v_abierta.monto;
    end if;
    raise exception 'Hay % abierto por $% en esta cuenta. Se cancela antes de corregir el servicio.',
      case when v_abierta.tipo = 'link' then 'un link de pago' else 'un cobro en la terminal' end, v_abierta.monto;
  end if;

  v_nombre_ant := coalesce(v_cita.servicio_nombre, (select s.nombre from public.servicios s where s.id = v_cita.servicio_id), 'Servicio');
  select t.saldo, t.total_cobrado - t.total_devuelto into v_saldo_antes, v_pagado
  from public.cuenta_totales_reserva(v_main) t;

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
  perform set_config('app.correccion_servicio', 'off', true);
  v_tarifa_hoy := coalesce(current_setting('app.correccion_tarifa_hoy', true), '') = 'on';
  perform set_config('app.correccion_tarifa_hoy', 'off', true);

  select precio, tamano_id into v_precio_nuevo, v_tamano from public.citas_estetica where id = p_cita_id;
  if p_precio_esperado is not null and v_precio_nuevo is distinct from p_precio_esperado then
    raise exception 'El precio cambió desde que lo viste (ahora es $%). Vuelve a calcularlo antes de confirmar.', v_precio_nuevo;
  end if;
  v_dif := v_precio_nuevo - v_cita.precio;

  select t.saldo into v_saldo_despues from public.cuenta_totales_reserva(v_main) t;
  v_tipo := case
    when v_dif = 0 or v_pagado <= 0 then 'ninguno'
    when v_dif > 0 and v_saldo_despues > 0 then 'cobro_adicional'
    when v_dif < 0 and v_saldo_despues < 0 then 'saldo_a_favor'
    else 'ninguno'
  end;

  -- Inventario: si el servicio ya se cerró, regresa lo que consumió el
  -- anterior y consume lo del nuevo (movimientos nuevos; nada se reescribe).
  if v_cita.estado = 'finalizada' then
    for v_r in
      select mi.insumo_id,
        sum(case when mi.tipo = 'salida_consumo' then mi.cantidad_base
                 when mi.tipo = 'ajuste_positivo' then -mi.cantidad_base
                 when mi.tipo = 'ajuste_negativo' then mi.cantidad_base else 0 end) as neto
      from public.movimientos_inventario mi
      where mi.cita_estetica_id = p_cita_id and mi.deleted_at is null
      group by mi.insumo_id
      having sum(case when mi.tipo = 'salida_consumo' then mi.cantidad_base
                      when mi.tipo = 'ajuste_positivo' then -mi.cantidad_base
                      when mi.tipo = 'ajuste_negativo' then mi.cantidad_base else 0 end) > 0
    loop
      insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, cita_estetica_id)
      values (v_r.insumo_id, 'ajuste_positivo', v_r.neto,
        'Corrección de servicio de la cita: regresa lo que consumió «' || v_nombre_ant || '»', p_cita_id);
      v_n_regresa := v_n_regresa + 1;
    end loop;
    if v_tamano is not null then
      for v_r in
        select r.insumo_id, r.cantidad_consumo * um.equivalencia_en_base as base
        from public.recetas_consumo r
        join public.insumos i on i.id = r.insumo_id and i.deleted_at is null
        join public.unidades_medida um on um.id = i.unidad_consumo_id
        where r.servicio_id = p_servicio_id and r.tamano_id = v_tamano and r.deleted_at is null
          and r.cantidad_consumo > 0
      loop
        insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, cita_estetica_id)
        values (v_r.insumo_id, 'salida_consumo', v_r.base,
          'Corrección de servicio de la cita: consume lo de «' || v_serv.nombre || '»', p_cita_id);
        v_n_consume := v_n_consume + 1;
      end loop;
    end if;
    v_inv := jsonb_build_object('regresados', v_n_regresa, 'consumidos', v_n_consume);
  end if;

  insert into public.citas_estetica_correcciones (
    cita_id, reserva_id, servicio_anterior_id, servicio_nuevo_id, servicio_anterior_nombre, servicio_nuevo_nombre,
    precio_anterior, precio_nuevo, diferencia, estado_cita, motivo, saldo_antes, saldo_despues, tipo_ajuste,
    ordenes_canceladas, inventario)
  values (
    p_cita_id, v_main, v_cita.servicio_id, p_servicio_id, v_nombre_ant, v_serv.nombre,
    v_cita.precio, v_precio_nuevo, v_dif, v_cita.estado, v_motivo, v_saldo_antes, v_saldo_despues, v_tipo,
    coalesce(p_ordenes_canceladas, '[]'::jsonb), v_inv)
  returning id into v_id;

  -- ¿Hay nómina ya pagada que ajustar? (la diferencia sale en el siguiente pago)
  if v_cita.estado = 'finalizada' and v_cita.empleado_id is not null then
    v_ajuste_nomina := exists (
      select 1 from public.empleados e
      where e.deleted_at is null and e.profile_id = v_cita.empleado_id
        and jsonb_array_length(public.ajustes_nomina_interno(e.id, public.fecha_negocio(), p_cita_id)) > 0
    );
  end if;

  return jsonb_build_object(
    'correccion_id', v_id,
    'servicio_anterior', v_nombre_ant,
    'servicio_nuevo', v_serv.nombre,
    'precio_anterior', v_cita.precio,
    'precio_nuevo', v_precio_nuevo,
    'diferencia', v_dif,
    'estado_cita', v_cita.estado,
    'tipo_ajuste', v_tipo,
    'saldo_despues', v_saldo_despues,
    'reserva_id', v_main,
    'inventario', v_inv,
    'ajuste_nomina', v_ajuste_nomina,
    'tarifa_de_hoy', v_tarifa_hoy
  );
end;
$$;
