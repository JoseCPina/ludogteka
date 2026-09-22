-- Dos huecos del day pass, encontrados al construirlo y ahora cerrados:
--
--  1. Cancelar una estancia cubierta con pase lo perdía. El cliente que
--     cancela el martes perdía un pase que pagó. Ahora la cancelación lo
--     regresa al saldo con un movimiento INVERSO ('devolucion'), con
--     motivo y quién, sin borrar nada: el ledger de movimientos_bono
--     sigue contando la historia completa. Si el bono ya venció cuando se
--     cancela, no se devuelve un pase inservible — se deja dicho.
--
--  2. Las series recurrentes generaban cada día como día suelto. Ahora
--     cada estancia generada intenta aplicar el pase con la misma regla
--     (el que vence primero); donde no hay saldo o el bono no alcanza esa
--     fecha, la estancia queda como día suelto con su aviso, sin abortar
--     la serie.

-- ── 1. El ledger admite devoluciones ─────────────────────────────────
alter table public.movimientos_bono
  add column if not exists motivo text;

comment on column public.movimientos_bono.motivo is
  'Obligatorio en devoluciones: por qué regresó el pase (p. ej. "Estancia cancelada").';

do $$
declare
  v_nombre text;
begin
  for v_nombre in
    select conname
    from pg_constraint
    where conrelid = 'public.movimientos_bono'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%''venta''%' or pg_get_constraintdef(oid) like '%item_tipo IS NOT NULL%')
  loop
    execute format('alter table public.movimientos_bono drop constraint %I', v_nombre);
  end loop;
end;
$$;

alter table public.movimientos_bono
  add constraint movimientos_bono_tipo_check
  check (tipo in ('venta', 'consumo', 'devolucion'));

alter table public.movimientos_bono
  add constraint movimientos_bono_item_coherente
  check ((tipo in ('consumo', 'devolucion')) = (item_tipo is not null and item_id is not null));

alter table public.movimientos_bono
  add constraint movimientos_bono_devolucion_con_motivo
  check (tipo <> 'devolucion' or (motivo is not null and btrim(motivo) <> ''));

-- Cuánto de una línea sigue cubierto por bono: consumos menos
-- devoluciones. Es la ÚNICA forma de leer cobertura de aquí en
-- adelante; sumar solo consumos volvería a contar pases ya devueltos.
create or replace function public.cobertura_bono_de_item(p_item_tipo text, p_item_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select coalesce(sum(case mb.tipo when 'consumo' then mb.cantidad when 'devolucion' then -mb.cantidad else 0 end), 0)::int
  from public.movimientos_bono mb
  where mb.item_tipo = p_item_tipo and mb.item_id = p_item_id;
$$;

grant execute on function public.cobertura_bono_de_item(text, uuid) to authenticated;

-- ── 2. Devolver el pase de una línea ─────────────────────────────────
-- Por bono: si la línea consumió de más de un bono (raro, pero el
-- ledger lo permite), cada uno recibe lo suyo. Un bono vencido no recibe
-- nada, y el resultado lo dice con la fecha.
create or replace function public.devolver_bono_de_item(
  p_item_tipo text,
  p_item_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bono record;
  v_turno_id uuid;
  v_devueltos int := 0;
  v_perdidos int := 0;
  v_detalle jsonb := '[]'::jsonb;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden devolver un bono.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Indica el motivo de la devolución.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;

  for v_bono in
    select
      mb.bono_cliente_id,
      sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end)::int as neto,
      sum(case mb.tipo when 'consumo' then mb.monto else -mb.monto end) as monto_neto,
      bc.fecha_vencimiento,
      bc.ilimitado,
      s.nombre
    from public.movimientos_bono mb
    join public.bonos_clientes bc on bc.id = mb.bono_cliente_id
    join public.servicios s on s.id = bc.servicio_id
    where mb.item_tipo = p_item_tipo and mb.item_id = p_item_id
      and mb.tipo in ('consumo', 'devolucion')
    group by mb.bono_cliente_id, bc.fecha_vencimiento, bc.ilimitado, s.nombre
    having sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end) > 0
  loop
    if v_bono.fecha_vencimiento is not null and v_bono.fecha_vencimiento < public.fecha_negocio() then
      v_perdidos := v_perdidos + v_bono.neto;
      v_detalle := v_detalle || jsonb_build_object(
        'bono', v_bono.nombre, 'pases', v_bono.neto, 'devuelto', false, 'vencio', v_bono.fecha_vencimiento
      );
      continue;
    end if;

    update public.bonos_clientes
    set cantidad_disponible = cantidad_disponible + v_bono.neto
    where id = v_bono.bono_cliente_id;

    insert into public.movimientos_bono
      (bono_cliente_id, tipo, cantidad, monto, item_tipo, item_id, turno_id, motivo, created_by)
    values
      (v_bono.bono_cliente_id, 'devolucion', v_bono.neto, greatest(v_bono.monto_neto, 0),
       p_item_tipo, p_item_id, v_turno_id, btrim(p_motivo), auth.uid());

    v_devueltos := v_devueltos + v_bono.neto;
    v_detalle := v_detalle || jsonb_build_object(
      'bono', v_bono.nombre, 'pases', v_bono.neto, 'devuelto', true, 'ilimitado', v_bono.ilimitado,
      'restantes', (select cantidad_disponible from public.bonos_clientes where id = v_bono.bono_cliente_id)
    );
  end loop;

  return jsonb_build_object('devueltos', v_devueltos, 'perdidos', v_perdidos, 'detalle', v_detalle);
end;
$$;

revoke execute on function public.devolver_bono_de_item(text, uuid, text) from public;
revoke execute on function public.devolver_bono_de_item(text, uuid, text) from anon;
grant execute on function public.devolver_bono_de_item(text, uuid, text) to authenticated;

-- Cancelar una estancia devuelve su pase, por cualquier camino que se
-- cancele (una suelta, toda la reserva, editar o cancelar una serie).
-- "No llegó" NO devuelve: el día se reservó y se apartó el lugar; eso lo
-- decide el negocio caso por caso, no la app sola.
create or replace function public.devolver_bono_al_cancelar_estancia()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.estado = 'cancelada' and old.estado is distinct from 'cancelada' then
    perform public.devolver_bono_de_item('estancia', new.id, 'Estancia cancelada');
  end if;
  return new;
end;
$$;

drop trigger if exists devolver_bono_al_cancelar_estancia on public.estancias;
create trigger devolver_bono_al_cancelar_estancia
after update of estado on public.estancias
for each row execute function public.devolver_bono_al_cancelar_estancia();

-- ── 3. Todo lo que lee cobertura pasa por la resta ───────────────────
-- consumir_bono: cuerpo de 20260910013850, con v_ya_cubierta neto.
create or replace function public.consumir_bono(
  p_bono_cliente_id uuid,
  p_item_tipo text,
  p_item_id uuid,
  p_cantidad int
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bono record;
  v_item_servicio_id uuid;
  v_item_cliente_id uuid;
  v_item_estado text;
  v_item_cantidad int;
  v_ya_cubierta int;
  v_monto numeric;
  v_turno_id uuid;
  v_movimiento_id uuid;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un bono.';
  end if;

  if p_item_tipo is null or p_item_tipo not in ('estancia', 'cargo', 'estetica') then
    raise exception 'Tipo de línea inválido: %', p_item_tipo;
  end if;
  if p_cantidad is null or p_cantidad < 1 then
    raise exception 'La cantidad a cubrir con el bono debe ser al menos 1.';
  end if;

  select bc.id, bc.cliente_id, bc.cantidad_disponible, bc.cantidad_total, bc.precio_pagado,
    bc.fecha_vencimiento, s.servicio_incluido_id
  into v_bono
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.id = p_bono_cliente_id and bc.deleted_at is null;

  if not found then
    raise exception 'Bono no encontrado.';
  end if;

  if v_bono.fecha_vencimiento is not null and v_bono.fecha_vencimiento < public.fecha_negocio() then
    raise exception 'Este bono ya venció.';
  end if;

  if v_bono.cantidad_disponible < p_cantidad then
    raise exception 'El bono no tiene suficientes unidades disponibles (quedan %).', v_bono.cantidad_disponible;
  end if;

  if p_item_tipo = 'estancia' then
    select e.servicio_id, p.cliente_id, e.estado, (e.fecha_salida - e.fecha_entrada)
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad
    from public.estancias e join public.perros p on p.id = e.perro_id
    where e.id = p_item_id;
  elsif p_item_tipo = 'cargo' then
    select c.servicio_id, p.cliente_id,
      case when c.cancelado then 'cancelada' else 'activa' end,
      c.cantidad
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad
    from public.cargos_aplicados c
    join public.estancias e on e.id = c.estancia_id
    join public.perros p on p.id = e.perro_id
    where c.id = p_item_id;
  else
    select ce.servicio_id, p.cliente_id, ce.estado, 1
      into v_item_servicio_id, v_item_cliente_id, v_item_estado, v_item_cantidad
    from public.citas_estetica ce join public.perros p on p.id = ce.perro_id
    where ce.id = p_item_id;
  end if;

  if v_item_servicio_id is null then
    raise exception 'No se encontró esa línea.';
  end if;

  if v_item_estado in ('cancelada', 'no_llego') then
    raise exception 'Esa línea está cancelada; no se le puede aplicar un bono.';
  end if;

  if v_item_cliente_id is distinct from v_bono.cliente_id then
    raise exception 'Este bono no pertenece al cliente de esa línea.';
  end if;

  if v_item_servicio_id is distinct from v_bono.servicio_incluido_id then
    raise exception 'Este bono no aplica al servicio de esa línea.';
  end if;

  v_ya_cubierta := public.cobertura_bono_de_item(p_item_tipo, p_item_id);

  if v_ya_cubierta + p_cantidad > v_item_cantidad then
    raise exception 'Esa línea ya tiene % de % unidades cubiertas con bono; no se puede cubrir más de lo que vale.',
      v_ya_cubierta, v_item_cantidad;
  end if;

  update public.bonos_clientes
  set cantidad_disponible = cantidad_disponible - p_cantidad
  where id = p_bono_cliente_id;

  v_monto := round((v_bono.precio_pagado / v_bono.cantidad_total) * p_cantidad, 2);

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, item_tipo, item_id, turno_id, created_by)
  values (p_bono_cliente_id, 'consumo', p_cantidad, v_monto, p_item_tipo, p_item_id, v_turno_id, auth.uid())
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

-- aplicar_bono_a_estancia: cuerpo de 20260922230000, con cobertura neta.
create or replace function public.aplicar_bono_a_estancia(p_estancia_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estancia record;
  v_cliente_id uuid;
  v_unidad text;
  v_categoria text;
  v_dias int;
  v_cubierta int;
  v_faltante int;
  v_bono record;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden aplicar un bono.';
  end if;

  select e.id, e.perro_id, e.servicio_id, e.estado, e.fecha_entrada, e.fecha_salida
    into v_estancia
  from public.estancias e
  where e.id = p_estancia_id and e.deleted_at is null;

  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if v_estancia.estado in ('cancelada', 'no_llego') then
    return jsonb_build_object('aplicado', false, 'motivo', 'estancia_inactiva');
  end if;

  select s.unidad, s.categoria into v_unidad, v_categoria
  from public.servicios s where s.id = v_estancia.servicio_id;

  if v_categoria <> 'guarderia' or v_unidad <> 'dia' then
    return jsonb_build_object('aplicado', false, 'motivo', 'no_aplica');
  end if;

  select p.cliente_id into v_cliente_id from public.perros p where p.id = v_estancia.perro_id;

  v_dias := v_estancia.fecha_salida - v_estancia.fecha_entrada;
  v_cubierta := public.cobertura_bono_de_item('estancia', p_estancia_id);
  v_faltante := v_dias - v_cubierta;
  if v_faltante <= 0 then
    return jsonb_build_object('aplicado', false, 'motivo', 'ya_cubierta');
  end if;

  select bc.id, bc.cantidad_total, bc.cantidad_disponible, bc.fecha_vencimiento, bc.ilimitado, s.nombre
    into v_bono
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.cliente_id = v_cliente_id
    and bc.deleted_at is null
    and s.servicio_incluido_id = v_estancia.servicio_id
    and (bc.fecha_vencimiento is null or bc.fecha_vencimiento >= greatest(v_estancia.fecha_entrada, public.fecha_negocio()))
    and bc.cantidad_disponible >= v_faltante
  order by bc.fecha_vencimiento asc nulls last, bc.fecha_compra asc
  limit 1;

  if not found then
    return jsonb_build_object('aplicado', false, 'motivo', 'sin_bono');
  end if;

  perform public.consumir_bono(v_bono.id, 'estancia', p_estancia_id, v_faltante);

  return jsonb_build_object(
    'aplicado', true,
    'bono_id', v_bono.id,
    'nombre', v_bono.nombre,
    'ilimitado', v_bono.ilimitado,
    'usados', v_faltante,
    'total', v_bono.cantidad_total,
    'restantes', v_bono.cantidad_disponible - v_faltante,
    'vence', v_bono.fecha_vencimiento
  );
end;
$$;

-- cuenta_totales_reserva: cuerpo de 20260729053001; la cobertura por
-- bono ahora es consumos menos devoluciones (el signo del case).
drop function if exists public.cuenta_totales_reserva(uuid);

create function public.cuenta_totales_reserva(p_reserva_id uuid)
returns table (
  total_cuenta numeric,
  total_cobrado numeric,
  total_propinas numeric,
  total_devuelto numeric,
  total_bono numeric,
  total_descuento numeric,
  saldo numeric
)
language sql
stable
set search_path = ''
as $$
  with cobertura as (
    select sum(
      (case mb.tipo when 'consumo' then mb.cantidad when 'devolucion' then -mb.cantidad else 0 end) * (
        case mb.item_tipo
          when 'estancia' then (select e.precio_unitario from public.estancias e where e.id = mb.item_id)
          when 'cargo' then (select c.precio from public.cargos_aplicados c where c.id = mb.item_id)
          when 'estetica' then (select ce.precio from public.citas_estetica ce where ce.id = mb.item_id)
        end
      )
    ) as total
    from public.movimientos_bono mb
    where mb.tipo in ('consumo', 'devolucion')
      and (
        (mb.item_tipo = 'estancia' and exists (
          select 1 from public.estancias e where e.id = mb.item_id and e.reserva_id = p_reserva_id
        ))
        or (mb.item_tipo = 'cargo' and exists (
          select 1 from public.cargos_aplicados c
          join public.estancias e on e.id = c.estancia_id
          where c.id = mb.item_id and e.reserva_id = p_reserva_id
        ))
        or (mb.item_tipo = 'estetica' and exists (
          select 1 from public.citas_estetica ce
          left join public.estancias e on e.id = ce.estancia_id
          where ce.id = mb.item_id and (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
        ))
      )
  ),
  cobrado as (
    select coalesce(sum(cm.monto), 0) as monto, coalesce(sum(cm.propina), 0) as propina
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where c.reserva_id = p_reserva_id
  ),
  devuelto as (
    select coalesce(sum(dm.monto), 0) as monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    join public.cobros c on c.id = d.cobro_id
    where c.reserva_id = p_reserva_id
  ),
  descuento as (
    select coalesce(sum(da.monto_aplicado), 0) as monto
    from public.descuentos_aplicados da
    where da.reserva_id = p_reserva_id and da.cancelado = false
  ),
  cuenta as (
    select coalesce(sum(l.total), 0) as total from public.cuenta_lineas_reserva(p_reserva_id) l
  )
  select
    cuenta.total,
    cobrado.monto,
    cobrado.propina,
    devuelto.monto,
    coalesce(cobertura.total, 0),
    descuento.monto,
    cuenta.total - cobrado.monto - coalesce(cobertura.total, 0) - descuento.monto + devuelto.monto
  from cuenta, cobrado, devuelto, descuento, cobertura;
$$;

grant execute on function public.cuenta_totales_reserva(uuid) to authenticated;

-- reporte_financiero_periodo: cuerpo de 20260730010044; bonos_consumidos
-- es lo reconocido neto (consumos menos devoluciones).
create or replace function public.reporte_financiero_periodo(p_desde date, p_hasta date)
returns table (
  cobros_efectivo numeric,
  cobros_terminal numeric,
  cobros_transferencia numeric,
  propinas_efectivo numeric,
  propinas_terminal numeric,
  propinas_transferencia numeric,
  devoluciones_efectivo numeric,
  devoluciones_terminal numeric,
  devoluciones_transferencia numeric,
  retiros_efectivo numeric,
  bonos_vendidos numeric,
  bonos_consumidos numeric,
  descuentos_otorgados numeric,
  ingreso_caja_neto numeric,
  ingreso_reconocido numeric
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede ver reportes.';
  end if;

  return query
  with cobros_periodo as (
    select cm.metodo, cm.monto, cm.propina
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where public.fecha_negocio(c.created_at) between p_desde and p_hasta
  ),
  devoluciones_periodo as (
    select dm.metodo, dm.monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    where public.fecha_negocio(d.created_at) between p_desde and p_hasta
  ),
  retiros_periodo as (
    select coalesce(sum(monto), 0) as total
    from public.movimientos_caja
    where public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  bonos_periodo as (
    select
      coalesce(sum(monto) filter (where tipo = 'venta'), 0) as vendidos,
      coalesce(sum(monto) filter (where tipo = 'consumo'), 0)
        - coalesce(sum(monto) filter (where tipo = 'devolucion'), 0) as consumidos
    from public.movimientos_bono
    where public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  descuentos_periodo as (
    select coalesce(sum(monto_aplicado), 0) as total
    from public.descuentos_aplicados
    where not cancelado
      and public.fecha_negocio(created_at) between p_desde and p_hasta
  )
  select
    coalesce(sum(monto) filter (where metodo = 'efectivo'), 0),
    coalesce(sum(monto) filter (where metodo = 'terminal'), 0),
    coalesce(sum(monto) filter (where metodo = 'transferencia'), 0),
    coalesce(sum(propina) filter (where metodo = 'efectivo'), 0),
    coalesce(sum(propina) filter (where metodo = 'terminal'), 0),
    coalesce(sum(propina) filter (where metodo = 'transferencia'), 0),
    (select coalesce(sum(monto) filter (where metodo = 'efectivo'), 0) from devoluciones_periodo),
    (select coalesce(sum(monto) filter (where metodo = 'terminal'), 0) from devoluciones_periodo),
    (select coalesce(sum(monto) filter (where metodo = 'transferencia'), 0) from devoluciones_periodo),
    (select total from retiros_periodo),
    (select vendidos from bonos_periodo),
    (select consumidos from bonos_periodo),
    (select total from descuentos_periodo),
    (coalesce(sum(monto), 0) + coalesce(sum(propina), 0))
      - (select coalesce(sum(monto), 0) from devoluciones_periodo)
      - (select total from retiros_periodo),
    coalesce(sum(monto), 0)
      - (select coalesce(sum(monto), 0) from devoluciones_periodo)
      - (select vendidos from bonos_periodo)
      + (select consumidos from bonos_periodo)
  from cobros_periodo;
end;
$$;

-- ── 4. Las series aplican el pase al generar cada estancia ───────────
-- Cuerpo de 20260729035218, con una columna más de salida (el resultado
-- del bono, JSON) y el intento de aplicar el pase dentro de su propio
-- bloque: si falla, la estancia queda como día suelto y la serie sigue.
drop function if exists public.generar_estancias_serie(uuid, int);

create function public.generar_estancias_serie(
  p_serie_id uuid,
  p_horizonte_semanas int default 8
)
returns table (fecha date, exito boolean, motivo text, bono jsonb)
language plpgsql
set search_path = ''
as $$
declare
  v_serie public.series_recurrentes%rowtype;
  v_cliente_id uuid;
  v_fecha_limite date;
  v_fecha date;
  v_reserva_id uuid;
  v_estancia_id uuid;
  v_bono jsonb;
begin
  select * into v_serie from public.series_recurrentes
  where id = p_serie_id and deleted_at is null;

  if not found then
    raise exception 'Serie recurrente no encontrada.';
  end if;

  select cliente_id into v_cliente_id from public.perros where id = v_serie.perro_id;

  v_fecha_limite := public.fecha_negocio() + (p_horizonte_semanas * 7);
  if v_serie.fecha_fin is not null and v_serie.fecha_fin < v_fecha_limite then
    v_fecha_limite := v_serie.fecha_fin;
  end if;

  for v_fecha in
    select d::date
    from generate_series(
      greatest(v_serie.fecha_inicio, public.fecha_negocio()),
      v_fecha_limite,
      interval '1 day'
    ) d
    where extract(isodow from d)::int = any(v_serie.dias_semana)
      and not exists (
        select 1 from public.estancias e
        where e.serie_id = p_serie_id and e.fecha_entrada = d::date and e.deleted_at is null
      )
      and not exists (
        select 1 from public.series_pausas sp
        where sp.serie_id = p_serie_id and sp.deleted_at is null
          and d::date between sp.desde and sp.hasta
      )
  loop
    begin
      insert into public.reservas (cliente_id, notas)
      values (v_cliente_id, 'Generada por serie recurrente')
      returning id into v_reserva_id;

      insert into public.estancias (reserva_id, perro_id, servicio_id, fecha_entrada, fecha_salida, serie_id)
      values (v_reserva_id, v_serie.perro_id, v_serie.servicio_id, v_fecha, v_fecha + 1, p_serie_id)
      returning id into v_estancia_id;

      begin
        v_bono := public.aplicar_bono_a_estancia(v_estancia_id);
      exception when others then
        v_bono := jsonb_build_object('aplicado', false, 'motivo', 'error', 'detalle', sqlerrm);
      end;

      fecha := v_fecha;
      exito := true;
      motivo := null;
      bono := v_bono;
      return next;
    exception when others then
      fecha := v_fecha;
      exito := false;
      motivo := sqlerrm;
      bono := null;
      return next;
    end;
  end loop;

  return;
end;
$$;

grant execute on function public.generar_estancias_serie(uuid, int) to authenticated;
