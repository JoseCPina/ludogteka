-- Nómina contra los días que de verdad le tocan al empleado: el sueldo se
-- prorratea desde su ingreso y hasta su baja (antes se pagaba el periodo
-- completo aunque hubiera entrado a la mitad), y no se registra el pago
-- de un periodo que todavía no termina.

create or replace function public.calcular_nomina_interno(p_empleado_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_emp record;
  v_esq record;
  v_hay_esquema boolean;
  v_dias_periodo int;
  v_base int;
  v_completo boolean := false;
  v_sueldo numeric := 0;
  v_tarifa_dia numeric := 0;
  v_desc_faltas numeric := 0;
  v_pago_dias numeric := 0;
  v_com numeric := 0;
  v_prop numeric := 0;
  v_adel numeric := 0;
  v_trabajados int; v_faltas int; v_retardos int; v_vacaciones int; v_otras int; v_programados int;
  v_com_det jsonb := '[]'::jsonb;
  v_prop_det jsonb := '[]'::jsonb;
  v_adel_det jsonb := '[]'::jsonb;
  v_avisos text[] := '{}';
  v_fin_mes date;
  v_ini date;
  v_fin date;
  v_dias_suyos int;
begin
  select * into v_emp from public.empleados where id = p_empleado_id and deleted_at is null;
  if not found then
    raise exception 'Empleado no encontrado.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Revisa el periodo: el último día no puede ser antes del primero.';
  end if;
  if p_hasta - p_desde > 62 then
    raise exception 'Un periodo de nómina no puede pasar de dos meses.';
  end if;

  select * into v_esq from public.esquemas_pago
  where empleado_id = p_empleado_id and deleted_at is null and vigente_desde <= p_hasta
  order by vigente_desde desc, created_at desc
  limit 1;
  v_hay_esquema := found;

  select
    count(*) filter (where estado in ('a_tiempo', 'retardo', 'extra')),
    count(*) filter (where estado = 'falta'),
    count(*) filter (where estado = 'retardo'),
    count(*) filter (where estado = 'ausencia' and ausencia_tipo = 'vacaciones'),
    count(*) filter (where estado = 'ausencia' and ausencia_tipo <> 'vacaciones'),
    count(*) filter (where hora_entrada_prog is not null)
  into v_trabajados, v_faltas, v_retardos, v_vacaciones, v_otras, v_programados
  from public.dias_asistencia_interno(p_empleado_id, p_desde, p_hasta);

  v_dias_periodo := p_hasta - p_desde + 1;
  v_fin_mes := (date_trunc('month', p_desde) + interval '1 month - 1 day')::date;
  -- Los días del periodo que de verdad le tocan: desde su ingreso y hasta
  -- su baja. El sueldo nunca se paga por días antes de que entrara.
  v_ini := greatest(p_desde, v_emp.fecha_ingreso);
  v_fin := least(p_hasta, coalesce(v_emp.fecha_baja, p_hasta));
  v_dias_suyos := greatest(0, v_fin - v_ini + 1);

  if p_hasta > public.fecha_negocio() then
    v_avisos := array_append(v_avisos, format(
      'El periodo todavía no termina (acaba el %s): esto es una proyección. Se puede pagar hasta hoy o cuando termine.',
      to_char(p_hasta, 'DD/MM/YYYY')));
  end if;

  if not v_hay_esquema then
    v_avisos := array_append(v_avisos, 'No tiene esquema de pago vigente en el periodo: solo se calculan comisiones, propinas y adelantos.');
  else
    if v_esq.sueldo_monto is not null then
      v_base := case v_esq.sueldo_periodicidad when 'semanal' then 7 when 'quincenal' then 15 else 30 end;
      v_tarifa_dia := round(v_esq.sueldo_monto / v_base, 2);
      v_completo := v_ini = p_desde and v_fin = p_hasta and case v_esq.sueldo_periodicidad
        when 'semanal' then v_dias_periodo = 7
        when 'quincenal' then (extract(day from p_desde) = 1 and p_hasta = p_desde + 14)
          or (extract(day from p_desde) = 16 and p_hasta = v_fin_mes)
        else extract(day from p_desde) = 1 and p_hasta = v_fin_mes
      end;
      if v_completo then
        v_sueldo := v_esq.sueldo_monto;
      else
        v_sueldo := round(v_esq.sueldo_monto * v_dias_suyos / v_base, 2);
        v_avisos := array_append(v_avisos, format(
          'El sueldo se prorrateó por %s %s ($%s por día) porque %s.',
          v_dias_suyos,
          case when v_dias_suyos = 1 then 'día' else 'días' end,
          to_char(v_tarifa_dia, 'FM999,999,990.00'),
          case
            when v_emp.fecha_ingreso > p_desde then 'entró el ' || to_char(v_emp.fecha_ingreso, 'DD/MM/YYYY')
            when v_emp.fecha_baja is not null and v_emp.fecha_baja < p_hasta then 'su baja fue el ' || to_char(v_emp.fecha_baja, 'DD/MM/YYYY')
            else 'el periodo no es ' || case v_esq.sueldo_periodicidad
              when 'semanal' then 'una semana completa' when 'quincenal' then 'una quincena completa' else 'un mes completo' end
          end));
      end if;
      v_desc_faltas := round(v_faltas * v_tarifa_dia, 2);
    end if;
    if v_esq.pago_por_dia is not null then
      v_pago_dias := round((v_trabajados + v_vacaciones) * v_esq.pago_por_dia, 2);
    end if;
  end if;

  -- Comisiones: citas finalizadas que atendió, por la fecha de la cita.
  if v_emp.profile_id is not null then
    select coalesce(sum(x.comision), 0), coalesce(jsonb_agg(jsonb_build_object(
      'cita_id', x.id, 'fecha', x.fecha, 'servicio', x.servicio, 'perro', x.perro,
      'precio', x.precio, 'comision', x.comision) order by x.fecha) filter (where x.comision > 0), '[]'::jsonb)
    into v_com, v_com_det
    from (
      select ce.id, public.fecha_negocio(ce.inicio) as fecha, s.nombre as servicio, p.nombre as perro,
        ce.precio, public.comision_de_cita(ce.id) as comision
      from public.citas_estetica ce
      join public.servicios s on s.id = ce.servicio_id
      join public.perros p on p.id = ce.perro_id
      where ce.empleado_id = v_emp.profile_id
        and ce.estado = 'finalizada'
        and ce.deleted_at is null
        and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
    ) x;

    -- Propinas: las de cada cobro del periodo, repartidas entre quienes
    -- atendieron las citas de esa cuenta (por el precio de cada cita).
    if not v_hay_esquema or v_esq.recibe_propinas then
      select coalesce(sum(y.suya), 0), coalesce(jsonb_agg(jsonb_build_object(
        'cobro_id', y.id, 'fecha', y.fecha, 'propina_total', y.propina, 'propina', y.suya) order by y.fecha), '[]'::jsonb)
      into v_prop, v_prop_det
      from (
        select c.id, public.fecha_negocio(c.created_at) as fecha, c.propina,
          round(c.propina * case when t.total_precio > 0 then t.mio_precio / t.total_precio
            else t.mio_cuenta::numeric / nullif(t.total_cuenta, 0) end, 2) as suya
        from (
          select co.id, co.reserva_id, co.created_at, sum(cm.propina) as propina
          from public.cobros co
          join public.cobro_metodos cm on cm.cobro_id = co.id
          where co.deleted_at is null
            and public.fecha_negocio(co.created_at) between p_desde and p_hasta
          group by co.id
          having sum(cm.propina) > 0
        ) c
        cross join lateral (
          select
            coalesce(sum(ce.precio), 0) as total_precio,
            coalesce(sum(ce.precio) filter (where ce.empleado_id = v_emp.profile_id), 0) as mio_precio,
            count(*) as total_cuenta,
            count(*) filter (where ce.empleado_id = v_emp.profile_id) as mio_cuenta
          from public.citas_estetica ce
          where ce.reserva_id = c.reserva_id and ce.deleted_at is null
            and ce.estado not in ('cancelada', 'no_llego')
        ) t
        where t.mio_cuenta > 0
      ) y
      where y.suya > 0;
    end if;
  end if;

  select coalesce(sum(monto), 0), coalesce(jsonb_agg(jsonb_build_object(
    'adelanto_id', id, 'fecha', fecha, 'monto', monto, 'motivo', motivo) order by fecha), '[]'::jsonb)
  into v_adel, v_adel_det
  from public.adelantos
  where empleado_id = p_empleado_id and not cancelado and pago_id is null and deleted_at is null
    and fecha <= p_hasta;

  if exists (
    select 1 from public.nomina_pagos np
    where np.empleado_id = p_empleado_id and np.tipo = 'pago' and np.deleted_at is null
      and daterange(np.periodo_desde, np.periodo_hasta, '[]') && daterange(p_desde, p_hasta, '[]')
      and not exists (select 1 from public.nomina_pagos r where r.reverso_de = np.id)
  ) then
    v_avisos := array_append(v_avisos, 'Ya hay un pago registrado que cubre parte de este periodo.');
  end if;

  return jsonb_build_object(
    'empleado_id', p_empleado_id,
    'empleado_nombre', v_emp.nombre,
    'periodo_desde', p_desde,
    'periodo_hasta', p_hasta,
    'esquema', case when v_hay_esquema then jsonb_build_object(
      'vigente_desde', v_esq.vigente_desde,
      'sueldo_monto', v_esq.sueldo_monto,
      'sueldo_periodicidad', v_esq.sueldo_periodicidad,
      'pago_por_dia', v_esq.pago_por_dia,
      'con_comision', v_esq.con_comision,
      'recibe_propinas', v_esq.recibe_propinas) end,
    'dias', jsonb_build_object(
      'periodo', v_dias_periodo,
      'programados', v_programados,
      'trabajados', v_trabajados,
      'faltas', v_faltas,
      'retardos', v_retardos,
      'vacaciones', v_vacaciones,
      'otras_ausencias', v_otras),
    'tarifa_dia_sueldo', v_tarifa_dia,
    'sueldo', v_sueldo,
    'descuento_faltas', v_desc_faltas,
    'pago_dias', v_pago_dias,
    'comisiones', v_com,
    'comisiones_detalle', v_com_det,
    'propinas', v_prop,
    'propinas_detalle', v_prop_det,
    'adelantos', v_adel,
    'adelantos_detalle', v_adel_det,
    'total', v_sueldo - v_desc_faltas + v_pago_dias + v_com + v_prop - v_adel,
    'costo', v_sueldo - v_desc_faltas + v_pago_dias + v_com,
    'avisos', to_jsonb(v_avisos)
  );
end;
$$;
revoke execute on function public.calcular_nomina_interno(uuid, date, date) from public, anon, authenticated;

create or replace function public.registrar_pago_nomina(
  p_empleado_id uuid,
  p_desde date,
  p_hasta date,
  p_metodo text,
  p_fecha_pago date,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calc jsonb;
  v_id uuid;
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», registra pagos de nómina.';
  end if;
  if p_metodo not in ('efectivo', 'transferencia', 'otro') then
    raise exception 'Método de pago no válido.';
  end if;
  -- No se pagan días que no han pasado: sus faltas todavía no se saben.
  if p_hasta > public.fecha_negocio() then
    raise exception 'El periodo todavía no termina (acaba el %). Paga cuando termine, o calcula hasta hoy.', to_char(p_hasta, 'DD/MM/YYYY');
  end if;
  -- Un periodo a la vez por empleado: no se paga dos veces el mismo día.
  perform pg_advisory_xact_lock(hashtext('nomina:' || p_empleado_id::text));
  if exists (
    select 1 from public.nomina_pagos np
    where np.empleado_id = p_empleado_id and np.tipo = 'pago' and np.deleted_at is null
      and daterange(np.periodo_desde, np.periodo_hasta, '[]') && daterange(p_desde, p_hasta, '[]')
      and not exists (select 1 from public.nomina_pagos r where r.reverso_de = np.id)
  ) then
    raise exception 'Ya hay un pago registrado que cubre parte de este periodo. Si está mal, reviértelo primero.';
  end if;

  v_calc := public.calcular_nomina_interno(p_empleado_id, p_desde, p_hasta);
  if (v_calc ->> 'total')::numeric < 0 then
    raise exception 'Los adelantos (%) son más que lo que se le debe en el periodo. Paga un periodo más largo o cancela un adelanto.',
      v_calc ->> 'adelantos';
  end if;

  insert into public.nomina_pagos (
    empleado_id, tipo, periodo_desde, periodo_hasta, sueldo, descuento_faltas, pago_dias, comisiones,
    propinas, adelantos, total, costo, desglose, metodo, fecha_pago, notas
  )
  values (
    p_empleado_id, 'pago', p_desde, p_hasta,
    (v_calc ->> 'sueldo')::numeric, (v_calc ->> 'descuento_faltas')::numeric, (v_calc ->> 'pago_dias')::numeric,
    (v_calc ->> 'comisiones')::numeric, (v_calc ->> 'propinas')::numeric, (v_calc ->> 'adelantos')::numeric,
    (v_calc ->> 'total')::numeric, (v_calc ->> 'costo')::numeric, v_calc, p_metodo,
    coalesce(p_fecha_pago, public.fecha_negocio()), nullif(btrim(coalesce(p_notas, '')), '')
  )
  returning id into v_id;

  update public.adelantos set pago_id = v_id
  where id in (select (x ->> 'adelanto_id')::uuid from jsonb_array_elements(v_calc -> 'adelantos_detalle') x);

  return v_id;
end;
$$;
revoke execute on function public.registrar_pago_nomina(uuid, date, date, text, date, text) from public, anon;
grant execute on function public.registrar_pago_nomina(uuid, date, date, text, date, text) to authenticated;
