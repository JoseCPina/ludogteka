-- Venta de mostrador (29 de septiembre de 2026).
--
-- Cobrar algo sin reserva, sin perro y sin servicio: un concepto libre con
-- su monto, o un producto del inventario (shampoo, croquetas, un collar)
-- con su cantidad. La venta arma una CUENTA (reservas) de la persona que
-- compra —por omisión «Público en general»— y se cobra en la MISMA
-- pantalla de cobro de siempre: efectivo, terminal o link, propina,
-- comisión, descuento con el tope de recepción. Así entra al turno, al
-- corte y a los reportes sin un camino de cobro nuevo.
--
--   - insumos.se_vende + precio_venta: el producto vendible, con su precio
--     por unidad de compra (lo que se compra es lo que se vende: una
--     botella, una bolsa, un collar). El precio sale del catálogo; para
--     venderlo más barato se aplica un descuento al cobrar (con el tope de
--     siempre).
--   - ventas_mostrador: las líneas de la venta. Un producto descuenta
--     existencias en el mismo paso (movimientos_inventario 'salida_venta').
--   - clientes.publico_general: UN cliente por negocio, «Público en
--     general», que no sale en listas ni buscadores y cuyo teléfono no es
--     un número (ningún alta ni login lo alcanza).

-- ───────────────────────────── producto vendible
alter table public.insumos
  add column se_vende boolean not null default false,
  add column precio_venta numeric(12,2);
alter table public.insumos add constraint insumos_precio_venta
  check ((not se_vende) or (precio_venta is not null and precio_venta > 0));
comment on column public.insumos.precio_venta is
  'Precio de venta al público por unidad de compra (lo que se vende en mostrador). No es un costo: lo ve recepción.';

-- ───────────────────────────── Público en general
alter table public.clientes add column publico_general boolean not null default false;
create unique index clientes_publico_general on public.clientes (negocio_id) where publico_general and deleted_at is null;
comment on column public.clientes.publico_general is
  'El cliente «Público en general» de las ventas de mostrador sin cliente. Uno por negocio; no sale en listas.';

-- Nadie da de alta ni edita al público general a mano.
create or replace function public.proteger_publico_general()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and new.publico_general and current_setting('app.publico_general_interno', true) is distinct from 'si' then
    raise exception 'El cliente «Público en general» lo crea la app sola.';
  end if;
  if tg_op = 'UPDATE' and (old.publico_general or new.publico_general) and current_setting('app.publico_general_interno', true) is distinct from 'si' then
    if new.publico_general is distinct from old.publico_general or new.telefono is distinct from old.telefono
       or new.nombre is distinct from old.nombre or new.deleted_at is distinct from old.deleted_at then
      raise exception 'El cliente «Público en general» no se edita.';
    end if;
  end if;
  return new;
end;
$$;
create trigger proteger_publico_general before insert or update on public.clientes
  for each row execute function public.proteger_publico_general();

create or replace function public.cliente_publico_general()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción.';
  end if;
  select id into v_id from public.clientes where publico_general and deleted_at is null;
  if v_id is null then
    perform set_config('app.publico_general_interno', 'si', true);
    insert into public.clientes (nombre, telefono, publico_general)
    values ('Público en general', 'PUBLICO-GENERAL', true)
    returning id into v_id;
    perform set_config('app.publico_general_interno', '', true);
  end if;
  return v_id;
end;
$$;
alter function public.cliente_publico_general() owner to peludesk_definer;
revoke execute on function public.cliente_publico_general() from public, anon;
grant execute on function public.cliente_publico_general() to authenticated;

-- ───────────────────────────── ventas_mostrador
create table public.ventas_mostrador (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  reserva_id uuid not null references public.reservas(id),
  insumo_id uuid references public.insumos(id),
  concepto text not null check (btrim(concepto) <> ''),
  cantidad numeric(12,3) not null check (cantidad > 0),
  precio_unitario numeric(12,2) not null check (precio_unitario > 0),
  movimiento_id uuid references public.movimientos_inventario(id),
  cancelado boolean not null default false,
  motivo_cancelacion text,
  cancelado_por uuid references auth.users(id) on delete set null,
  cancelado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check ((not cancelado) or btrim(coalesce(motivo_cancelacion, '')) <> '')
);
comment on table public.ventas_mostrador is
  'Líneas de una venta de mostrador: un concepto libre o un producto del inventario. Se cobran en su cuenta (reserva) como cualquier otra.';
create index ventas_mostrador_negocio_idx on public.ventas_mostrador (negocio_id);
create index ventas_mostrador_reserva_idx on public.ventas_mostrador (reserva_id);
create index ventas_mostrador_insumo_idx on public.ventas_mostrador (insumo_id) where insumo_id is not null;
create trigger set_updated_at before insert or update on public.ventas_mostrador
  for each row execute function public.set_updated_at();
alter table public.ventas_mostrador enable row level security;
create policy ventas_mostrador_negocio on public.ventas_mostrador as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy ventas_mostrador_negocio_definer on public.ventas_mostrador for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
-- Dinero: solo el personal. Se escribe solo por crear_venta_mostrador y
-- cancelar_venta_mostrador.
create policy ventas_mostrador_select_staff on public.ventas_mostrador for select to authenticated
  using ((select public.is_staff()));
create policy ventas_mostrador_sin_insert on public.ventas_mostrador for insert to authenticated with check (false);
create policy ventas_mostrador_sin_update on public.ventas_mostrador for update to authenticated using (false);
create policy ventas_mostrador_escritura_ins on public.ventas_mostrador as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy ventas_mostrador_escritura_upd on public.ventas_mostrador as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy ventas_mostrador_escritura_del on public.ventas_mostrador as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
revoke all on public.ventas_mostrador from anon, authenticated;
grant select on public.ventas_mostrador to authenticated;
grant select, insert, update on public.ventas_mostrador to peludesk_definer;

-- ───────────────────────────── inventario: la salida por venta
alter table public.movimientos_inventario drop constraint movimientos_inventario_tipo_check;
alter table public.movimientos_inventario add constraint movimientos_inventario_tipo_check
  check (tipo in ('entrada_compra', 'salida_consumo', 'salida_merma', 'salida_venta', 'ajuste_positivo', 'ajuste_negativo'));
alter table public.movimientos_inventario add column venta_id uuid references public.ventas_mostrador(id);
create index movimientos_inventario_venta_idx on public.movimientos_inventario (venta_id) where venta_id is not null;

create or replace function public.existencia_actual_insumo(p_insumo_id uuid)
returns numeric
language sql
stable
set search_path = ''
as $$
  select
    i.existencia_inicial + coalesce(sum(
      case
        when m.tipo in ('entrada_compra', 'ajuste_positivo') then m.cantidad_base
        when m.tipo in ('salida_consumo', 'salida_merma', 'salida_venta', 'ajuste_negativo') then -m.cantidad_base
        else 0
      end
    ), 0)
  from public.insumos i
  left join public.movimientos_inventario m on m.insumo_id = i.id
  where i.id = p_insumo_id
  group by i.existencia_inicial;
$$;

-- ───────────────────────────── crear la venta
-- p_lineas: [{ "insumo_id": uuid } + "cantidad"] o [{ "concepto", "precio", "cantidad" }].
-- El precio de un producto es SIEMPRE el del catálogo (lo que venga en la
-- línea se ignora): venderlo más barato es un descuento, con su tope.
create or replace function public.crear_venta_mostrador(p_cliente_id uuid, p_lineas jsonb, p_notas text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_reserva uuid;
  v_linea jsonb;
  v_insumo record;
  v_cantidad numeric;
  v_precio numeric;
  v_concepto text;
  v_base numeric;
  v_venta uuid;
  v_mov uuid;
  v_resumen text[] := array[]::text[];
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden vender en mostrador.';
  end if;
  if p_lineas is null or jsonb_typeof(p_lineas) <> 'array' or jsonb_array_length(p_lineas) = 0 then
    raise exception 'Agrega al menos un producto o concepto.';
  end if;
  if jsonb_array_length(p_lineas) > 30 then
    raise exception 'Una venta lleva a lo más 30 renglones.';
  end if;

  if p_cliente_id is null then
    v_cliente := public.cliente_publico_general();
  else
    select id into v_cliente from public.clientes where id = p_cliente_id and deleted_at is null;
    if v_cliente is null then
      raise exception 'Cliente no encontrado.';
    end if;
  end if;

  insert into public.reservas (cliente_id, notas)
  values (v_cliente, 'Venta de mostrador' || coalesce(' — ' || nullif(btrim(coalesce(p_notas, '')), ''), ''))
  returning id into v_reserva;

  for v_linea in select * from jsonb_array_elements(p_lineas)
  loop
    begin
      v_cantidad := (v_linea ->> 'cantidad')::numeric;
    exception when others then
      raise exception 'Cantidad no válida.';
    end;
    if v_cantidad is null or v_cantidad <= 0 then
      raise exception 'Cada renglón necesita una cantidad mayor a cero.';
    end if;

    if nullif(v_linea ->> 'insumo_id', '') is not null then
      select i.id, i.nombre, i.se_vende, i.precio_venta, um.equivalencia_en_base, um.etiqueta as unidad
        into v_insumo
      from public.insumos i
      join public.unidades_medida um on um.id = i.unidad_compra_id
      where i.id = (v_linea ->> 'insumo_id')::uuid and i.deleted_at is null;
      if not found then
        raise exception 'Ese producto no existe en el inventario.';
      end if;
      if not v_insumo.se_vende or v_insumo.precio_venta is null then
        raise exception '«%» no está marcado para venta. Dale precio de venta en Inventario → %.', v_insumo.nombre, v_insumo.nombre;
      end if;
      v_base := v_cantidad * v_insumo.equivalencia_en_base;
      if v_base > public.existencia_actual_insumo(v_insumo.id) then
        raise exception 'No hay suficiente «%» en inventario (quedan %). Si sí hay, registra la compra o un ajuste en /inventario/%.',
          v_insumo.nombre, round(public.existencia_actual_insumo(v_insumo.id) / v_insumo.equivalencia_en_base, 2), v_insumo.id;
      end if;
      insert into public.ventas_mostrador (reserva_id, insumo_id, concepto, cantidad, precio_unitario)
      values (v_reserva, v_insumo.id, v_insumo.nombre, v_cantidad, v_insumo.precio_venta)
      returning id into v_venta;
      insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, venta_id)
      values (v_insumo.id, 'salida_venta', v_base, 'Venta de mostrador', v_venta)
      returning id into v_mov;
      update public.ventas_mostrador set movimiento_id = v_mov where id = v_venta;
      v_resumen := array_append(v_resumen, v_insumo.nombre);
    else
      v_concepto := nullif(btrim(coalesce(v_linea ->> 'concepto', '')), '');
      if v_concepto is null then
        raise exception 'Escribe qué se vende en cada renglón.';
      end if;
      begin
        v_precio := round((v_linea ->> 'precio')::numeric, 2);
      exception when others then
        raise exception 'Precio no válido.';
      end;
      if v_precio is null or v_precio <= 0 then
        raise exception 'Cada concepto necesita un precio mayor a cero.';
      end if;
      if v_cantidad <> trunc(v_cantidad) then
        raise exception 'La cantidad de un concepto es en piezas enteras.';
      end if;
      insert into public.ventas_mostrador (reserva_id, concepto, cantidad, precio_unitario)
      values (v_reserva, left(v_concepto, 120), v_cantidad, v_precio);
      v_resumen := array_append(v_resumen, left(v_concepto, 40));
    end if;
  end loop;

  update public.reservas
  set notas = 'Venta de mostrador: ' || array_to_string(v_resumen, ', ')
    || coalesce(' — ' || nullif(btrim(coalesce(p_notas, '')), ''), '')
  where id = v_reserva;
  return v_reserva;
end;
$$;
alter function public.crear_venta_mostrador(uuid, jsonb, text) owner to peludesk_definer;
revoke execute on function public.crear_venta_mostrador(uuid, jsonb, text) from public, anon;
grant execute on function public.crear_venta_mostrador(uuid, jsonb, text) to authenticated;

-- Cancelar un renglón que todavía no se cobra: el producto regresa al
-- inventario con un ajuste (nada se borra).
create or replace function public.cancelar_venta_mostrador(p_venta_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.ventas_mostrador%rowtype;
  v_base numeric;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe por qué se cancela.';
  end if;
  select * into v from public.ventas_mostrador where id = p_venta_id and deleted_at is null for update;
  if not found then
    raise exception 'Venta no encontrada.';
  end if;
  if v.cancelado then
    raise exception 'Ese renglón ya está cancelado.';
  end if;
  if exists (select 1 from public.cobros where reserva_id = v.reserva_id and deleted_at is null) then
    raise exception 'Esta cuenta ya tiene cobros: primero registra la devolución y después cancela.';
  end if;
  update public.ventas_mostrador
  set cancelado = true, motivo_cancelacion = btrim(p_motivo), cancelado_por = auth.uid(), cancelado_at = now()
  where id = v.id;
  if v.movimiento_id is not null then
    select cantidad_base into v_base from public.movimientos_inventario where id = v.movimiento_id;
    insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, venta_id)
    values (v.insumo_id, 'ajuste_positivo', v_base, 'Venta cancelada: ' || btrim(p_motivo), v.id);
  end if;
end;
$$;
alter function public.cancelar_venta_mostrador(uuid, text) owner to peludesk_definer;
revoke execute on function public.cancelar_venta_mostrador(uuid, text) from public, anon;
grant execute on function public.cancelar_venta_mostrador(uuid, text) to authenticated;

-- ───────────────────────────── la venta en la cuenta
create or replace function public.cuenta_lineas_reserva(p_reserva_id uuid)
returns table(tipo text, origen_id uuid, servicio_id uuid, descripcion text, cantidad numeric, precio_unitario numeric, total numeric)
language sql
stable
set search_path = ''
as $$
  select
    'estancia'::text,
    e.id,
    e.servicio_id,
    p.nombre || ' — ' || s.nombre,
    (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric,
    e.precio_unitario,
    e.precio_unitario * (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric
  from public.estancias e
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = e.servicio_id
  where e.reserva_id = p_reserva_id
    and e.deleted_at is null
    and e.estado not in ('cancelada', 'no_llego')

  union all

  select
    'cargo'::text,
    c.id,
    c.servicio_id,
    coalesce(p.nombre || ' — ', '') || s.nombre
      || case when c.descripcion is not null and btrim(c.descripcion) <> '' then ' (' || c.descripcion || ')' else '' end,
    c.cantidad::numeric,
    c.precio,
    c.precio * c.cantidad
  from public.cargos_aplicados c
  join public.servicios s on s.id = c.servicio_id
  left join public.perros p on p.id = c.perro_id
  where c.reserva_id = p_reserva_id
    and c.deleted_at is null
    and c.cancelado = false

  union all

  select
    'estetica'::text,
    ce.id,
    ce.servicio_id,
    p.nombre || ' — ' || s.nombre,
    1::numeric,
    ce.precio,
    ce.precio
  from public.citas_estetica ce
  join public.perros p on p.id = ce.perro_id
  join public.servicios s on s.id = ce.servicio_id
  left join public.estancias e on e.id = ce.estancia_id
  where (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
    and ce.deleted_at is null
    and ce.estado not in ('cancelada', 'no_llego')

  union all

  select
    'bono'::text,
    bc.id,
    bc.servicio_id,
    s.nombre,
    1::numeric,
    bc.precio_pagado,
    bc.precio_pagado
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.reserva_id = p_reserva_id
    and bc.deleted_at is null

  union all

  select
    'venta'::text,
    v.id,
    null::uuid,
    v.concepto,
    v.cantidad,
    v.precio_unitario,
    round(v.precio_unitario * v.cantidad, 2)
  from public.ventas_mostrador v
  where v.reserva_id = p_reserva_id
    and v.deleted_at is null
    and not v.cancelado;
$$;

-- cuentas_abiertas suma las líneas igual que cuenta_lineas_reserva.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.cuentas_abiertas(integer)'::regprocedure) into v_def;
  if position('ventas_mostrador' in v_def) = 0 then
    v_def := replace(v_def,
      $a$    select bc.reserva_id, bc.precio_pagado
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    where bc.deleted_at is null
      and bc.reserva_id in (select id from candidatas)
  ),$a$,
      $b$    select bc.reserva_id, bc.precio_pagado
    from public.bonos_clientes bc
    join public.servicios s on s.id = bc.servicio_id
    where bc.deleted_at is null
      and bc.reserva_id in (select id from candidatas)
    union all
    select v.reserva_id, round(v.precio_unitario * v.cantidad, 2)
    from public.ventas_mostrador v
    where v.deleted_at is null and not v.cancelado
      and v.reserva_id in (select id from candidatas)
  ),$b$);
    if position('ventas_mostrador' in v_def) = 0 then
      raise exception 'cuentas_abiertas cambió: no se pudo agregar la venta de mostrador.';
    end if;
    execute v_def;
  end if;
end;
$$;

-- ───────────────────────────── turno y reportes
create or replace function public.movimientos_turno(p_turno_id uuid)
returns table(id uuid, tipo text, fecha timestamptz, reserva_id uuid, cliente_nombre text, descripcion text, metodo text, monto numeric, propina numeric, origen text, hecho_por uuid)
language sql
stable
set search_path = ''
as $$
  select
    cm.id,
    case
      when exists (select 1 from public.ventas_mostrador v where v.reserva_id = c.reserva_id) then 'venta_mostrador'
      when exists (select 1 from public.bonos_clientes bc where bc.reserva_id = c.reserva_id) then 'venta_bono'
      else 'cobro' end,
    c.created_at,
    c.reserva_id,
    cl.nombre,
    coalesce(c.notas, ''),
    cm.metodo,
    cm.monto,
    cm.propina,
    coalesce(c.origen, 'manual'),
    c.created_by
  from public.cobro_metodos cm
  join public.cobros c on c.id = cm.cobro_id
  join public.reservas r on r.id = c.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  where c.turno_id = p_turno_id

  union all

  select
    dm.id,
    'devolucion',
    d.created_at,
    c.reserva_id,
    cl.nombre,
    d.motivo,
    dm.metodo,
    -dm.monto,
    0,
    d.origen,
    d.autorizado_por
  from public.devolucion_metodos dm
  join public.devoluciones d on d.id = dm.devolucion_id
  join public.cobros c on c.id = d.cobro_id
  join public.reservas r on r.id = c.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  where d.turno_id = p_turno_id

  union all

  select
    mc.id,
    'retiro',
    mc.created_at,
    null,
    null,
    mc.motivo,
    'efectivo',
    -mc.monto,
    0,
    'manual',
    mc.created_by
  from public.movimientos_caja mc
  where mc.turno_id = p_turno_id and mc.deleted_at is null

  order by 3 desc;
$$;

-- Lo vendido en mostrador en un periodo, aparte de los servicios. Por la
-- fecha de la venta; el costo es el del producto que salió del inventario.
create or replace function public.reporte_ventas_mostrador_periodo(p_desde date, p_hasta date)
returns table(ventas bigint, total_vendido numeric, productos numeric, conceptos numeric, costo_productos numeric, cobrado numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;
  return query
  with lineas as (
    select v.reserva_id, v.insumo_id, round(v.precio_unitario * v.cantidad, 2) as total,
      coalesce((select mi.cantidad_base from public.movimientos_inventario mi where mi.id = v.movimiento_id), 0)
        * coalesce(public.costo_promedio_base_insumo(v.insumo_id, p_hasta), 0) as costo
    from public.ventas_mostrador v
    where v.deleted_at is null and not v.cancelado
      and public.fecha_negocio(v.created_at) between p_desde and p_hasta
  )
  select
    count(distinct l.reserva_id),
    coalesce(sum(l.total), 0),
    coalesce(sum(l.total) filter (where l.insumo_id is not null), 0),
    coalesce(sum(l.total) filter (where l.insumo_id is null), 0),
    round(coalesce(sum(l.costo), 0), 2),
    coalesce((
      select sum(cm.monto) from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
      where c.reserva_id in (select reserva_id from lineas)
    ), 0)
      - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
      join public.cobros c on c.id = d.cobro_id
      where c.reserva_id in (select reserva_id from lineas)
    ), 0)
  from lineas l;
end;
$$;
alter function public.reporte_ventas_mostrador_periodo(date, date) owner to peludesk_definer;
revoke execute on function public.reporte_ventas_mostrador_periodo(date, date) from public, anon;
grant execute on function public.reporte_ventas_mostrador_periodo(date, date) to authenticated;

-- El costo de lo vendido entra al costo de insumos de la utilidad.
create or replace function public.reporte_costos_periodo(p_desde date, p_hasta date)
returns table(compras_total numeric, consumo_valorizado_total numeric, merma_valorizada numeric, consumo_estetica_valorizado numeric, ingreso_estetica numeric, margen_estetica numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;

  return query
  with compras as (
    select coalesce(sum(ci.costo_total), 0) as total
    from public.compras_insumos ci
    join public.movimientos_inventario mi on mi.id = ci.movimiento_id
    where public.fecha_negocio(mi.created_at) between p_desde and p_hasta
  ),
  -- Salidas SIN cita ligada (consumo manual, merma, venta de mostrador,
  -- ajuste negativo) menos lo que regresó al cancelar una venta: por la
  -- fecha del propio movimiento.
  salidas_sueltas as (
    select
      mi.tipo,
      (case when mi.tipo = 'ajuste_positivo' then -1 else 1 end)
        * mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0) as valor
    from public.movimientos_inventario mi
    where mi.cita_estetica_id is null
      and (mi.tipo in ('salida_consumo', 'salida_merma', 'salida_venta', 'ajuste_negativo')
        or (mi.tipo = 'ajuste_positivo' and mi.venta_id is not null))
      and public.fecha_negocio(mi.created_at) between p_desde and p_hasta
  ),
  citas_periodo as (
    select ce.id, ce.precio
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and ce.deleted_at is null
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  consumo_estetica as (
    select
      mi.cita_estetica_id as cita_id,
      sum(mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0)) as costo
    from public.movimientos_inventario mi
    where mi.cita_estetica_id in (select id from citas_periodo)
    group by mi.cita_estetica_id
  )
  select
    (select total from compras),
    (select coalesce(sum(valor), 0) from salidas_sueltas) + (select coalesce(sum(costo), 0) from consumo_estetica),
    (select coalesce(sum(valor), 0) from salidas_sueltas where tipo in ('salida_merma', 'ajuste_negativo')),
    (select coalesce(sum(costo), 0) from consumo_estetica),
    (select coalesce(sum(precio), 0) from citas_periodo),
    (select coalesce(sum(precio), 0) from citas_periodo) - (select coalesce(sum(costo), 0) from consumo_estetica);
end;
$$;

-- El demo se vacía también de ventas y reembolsos.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure) into v_def;
  if position('ventas_mostrador' in v_def) = 0 then
    v_def := replace(v_def, $a$'turnos_caja', 'vacaciones_movimientos', 'vinculacion_eventos'$a$,
      $b$'turnos_caja', 'vacaciones_movimientos', 'vinculacion_eventos', 'ventas_mostrador', 'reembolsos_cobro'$b$);
    if position('ventas_mostrador' in v_def) = 0 then
      raise exception 'demo_vaciar cambió: no se pudo agregar ventas y reembolsos.';
    end if;
    execute v_def;
  end if;
end;
$$;
