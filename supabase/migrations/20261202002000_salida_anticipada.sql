-- QA S36 · N132: salida anticipada y cobro. Por omisión la cuenta se ajusta a las noches (hotel) o días (guardería)
-- que de verdad usó: lo no usado se quita con una corrección de precio de la línea de la estancia con motivo «Salida
-- anticipada» (la misma tabla `cuenta_ajustes_precio` que «Corregir precio», así cuadran cuenta, caja y reportes). El
-- negocio puede elegir en Configuración → Hotel «Cobrar la estancia completa aunque salga antes»: entonces no se toca.
-- El check-out lo enseña ANTES de confirmar (`salida_anticipada_cotizar`) y lo aplica al confirmar
-- (`salida_anticipada_aplicar`, idempotente).

alter table public.negocio_ajustes_operacion
  add column cobrar_estancia_completa boolean not null default false;

-- La política del negocio (la lee el check-out y Configuración → Hotel).
create or replace function public.cobrar_estancia_completa()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select a.cobrar_estancia_completa from public.negocio_ajustes_operacion a
                   where a.negocio_id = public.negocio_actual() and a.deleted_at is null limit 1), false);
$$;
alter function public.cobrar_estancia_completa() owner to peludesk_definer;
revoke execute on function public.cobrar_estancia_completa() from public, anon;
grant execute on function public.cobrar_estancia_completa() to authenticated, service_role;

create or replace function public.guardar_politica_salida_anticipada(p_completa boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not coalesce(public.tiene_permiso('configuracion_negocio'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», cambia la política de salida anticipada.' using errcode = '42501';
  end if;
  if p_completa is null then
    raise exception 'Indica si se cobra la estancia completa.';
  end if;
  v_id := public._ajustes_operacion_id();
  update public.negocio_ajustes_operacion set cobrar_estancia_completa = p_completa where id = v_id;
end;
$$;
alter function public.guardar_politica_salida_anticipada(boolean) owner to peludesk_definer;
revoke execute on function public.guardar_politica_salida_anticipada(boolean) from public, anon;
grant execute on function public.guardar_politica_salida_anticipada(boolean) to authenticated, service_role;

-- Lo que pasa con la cuenta si el perro sale hoy (o salió, si ya hizo check-out) antes de su salida prevista.
--   aplica: hay unidades no usadas y la cuenta se ajusta · politica: 'ajustar' | 'completa'
--   unidad: 'noche' | 'dia' · reservadas, usadas, no_usadas · total_antes / total_despues: total de la cuenta
--   motivo_no: por qué no se ajusta aunque salga antes ('pase', 'correccion', 'ajustada')
create or replace function public.salida_anticipada_cotizar(p_estancia_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  e record;
  v_zona text := public.zona_negocio();
  v_inicio date;
  v_salida date;
  v_reservadas int;
  v_usadas int;
  v_precio numeric;
  v_estado_precio text;
  v_linea numeric;
  v_nueva numeric;
  v_total numeric;
  v_completa boolean := public.cobrar_estancia_completa();
  v_base jsonb;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal ve la cuenta de una estancia.' using errcode = '42501';
  end if;
  select es.*, s.categoria, s.unidad into e
  from public.estancias es join public.servicios s on s.id = es.servicio_id
  where es.id = p_estancia_id and es.negocio_id = public.negocio_actual() and es.deleted_at is null;
  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if e.categoria not in ('hotel', 'guarderia') or e.unidad not in ('noche', 'dia') or e.estado in ('cancelada', 'no_llego') then
    return jsonb_build_object('aplica', false);
  end if;
  -- Desde que entró (si entró antes de su fecha, desde ese día) hasta hoy o su salida real.
  v_inicio := least(e.fecha_entrada, coalesce((e.hora_entrada_real at time zone v_zona)::date, e.fecha_entrada));
  v_salida := coalesce((e.hora_salida_real at time zone v_zona)::date, public.fecha_negocio());
  v_reservadas := e.fecha_salida - e.fecha_entrada;
  v_usadas := greatest(1, case when e.unidad = 'noche' then v_salida - v_inicio else v_salida - v_inicio + 1 end);
  select t.total_cuenta into v_total from public.cuenta_totales_reserva(e.reserva_id) t;
  v_base := jsonb_build_object('unidad', e.unidad, 'categoria', e.categoria, 'reservadas', v_reservadas, 'usadas', v_usadas,
    'no_usadas', greatest(0, v_reservadas - v_usadas), 'total_antes', v_total, 'politica', case when v_completa then 'completa' else 'ajustar' end);
  if v_usadas >= v_reservadas then
    return v_base || jsonb_build_object('aplica', false, 'total_despues', v_total);
  end if;
  if exists (select 1 from public.cuenta_ajustes_precio a
             where a.linea_tipo = 'estancia' and a.linea_id = e.id and a.deleted_at is null and a.motivo = 'Salida anticipada') then
    return v_base || jsonb_build_object('aplica', false, 'motivo_no', 'ajustada', 'total_despues', v_total);
  end if;
  if v_completa then
    return v_base || jsonb_build_object('aplica', false, 'total_despues', v_total);
  end if;
  if exists (
    select 1 from public.movimientos_bono mb
    where mb.item_id = e.id and mb.tipo in ('consumo', 'devolucion')
    having coalesce(sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end), 0) > 0
  ) then
    return v_base || jsonb_build_object('aplica', false, 'motivo_no', 'pase', 'total_despues', v_total);
  end if;
  if exists (select 1 from public.cuenta_ajustes_precio a where a.linea_tipo = 'estancia' and a.linea_id = e.id and a.deleted_at is null) then
    return v_base || jsonb_build_object('aplica', false, 'motivo_no', 'correccion', 'total_despues', v_total);
  end if;
  -- El precio de las unidades usadas con la misma tarifa (sus tramos por cantidad), del día de entrada.
  select precio, estado into v_precio, v_estado_precio
  from public.resolver_precio(e.servicio_id, e.tamano_id, null, v_usadas, e.fecha_entrada);
  if v_precio is null or v_estado_precio in ('sin_tarifa', 'no_aplica') then
    v_precio := e.precio_unitario;
  end if;
  v_linea := round(e.precio_unitario * v_reservadas, 2);
  v_nueva := round(v_precio * v_usadas, 2);
  if v_nueva >= v_linea or v_nueva <= 0 then
    return v_base || jsonb_build_object('aplica', false, 'total_despues', v_total);
  end if;
  return v_base || jsonb_build_object('aplica', true, 'linea_antes', v_linea, 'linea_despues', v_nueva,
    'total_despues', round(v_total - (v_linea - v_nueva), 2));
end;
$$;
alter function public.salida_anticipada_cotizar(uuid) owner to peludesk_definer;
revoke execute on function public.salida_anticipada_cotizar(uuid) from public, anon;
grant execute on function public.salida_anticipada_cotizar(uuid) to authenticated, service_role;

-- Al confirmar el check-out: deja la línea de la estancia en las unidades usadas (corrección «Salida anticipada»).
-- Solo con la estancia ya finalizada; idempotente (una segunda llamada no hace nada).
create or replace function public.salida_anticipada_aplicar(p_estancia_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c jsonb;
  e record;
  v_desc text;
  v_turno uuid;
  v_n int;
  v_saldo numeric;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal registra la salida.' using errcode = '42501';
  end if;
  select es.id, es.reserva_id, es.estado into e from public.estancias es
  where es.id = p_estancia_id and es.negocio_id = public.negocio_actual() and es.deleted_at is null
  for update;
  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if e.estado <> 'finalizada' then
    raise exception 'La cuenta se ajusta al registrar la salida.';
  end if;
  c := public.salida_anticipada_cotizar(p_estancia_id);
  if not coalesce((c ->> 'aplica')::boolean, false) then
    select t.saldo into v_saldo from public.cuenta_totales_reserva(e.reserva_id) t;
    return c || jsonb_build_object('aplicada', false, 'saldo', v_saldo);
  end if;
  v_n := (c ->> 'no_usadas')::int;
  select l.descripcion into v_desc from public.cuenta_lineas_reserva(e.reserva_id) l where l.tipo = 'estancia' and l.origen_id = e.id;
  select t.id into v_turno from public.turnos_caja t where t.estado = 'abierto' limit 1;
  insert into public.cuenta_ajustes_precio (reserva_id, linea_tipo, linea_id, concepto, monto, precio_antes, precio_despues, precio_original, motivo, turno_id)
  values (e.reserva_id, 'estancia', e.id,
          coalesce(v_desc, 'Estancia') || ' — ' || v_n || ' ' ||
            case when c ->> 'unidad' = 'noche' then case when v_n = 1 then 'noche no usada' else 'noches no usadas' end
                 else case when v_n = 1 then 'día no usado' else 'días no usados' end end,
          round((c ->> 'linea_despues')::numeric - (c ->> 'linea_antes')::numeric, 2),
          (c ->> 'linea_antes')::numeric, (c ->> 'linea_despues')::numeric, (c ->> 'linea_antes')::numeric,
          'Salida anticipada', v_turno);
  select t.saldo into v_saldo from public.cuenta_totales_reserva(e.reserva_id) t;
  return c || jsonb_build_object('aplicada', true, 'saldo', v_saldo);
end;
$$;
alter function public.salida_anticipada_aplicar(uuid) owner to peludesk_definer;
revoke execute on function public.salida_anticipada_aplicar(uuid) from public, anon;
grant execute on function public.salida_anticipada_aplicar(uuid) to authenticated, service_role;
