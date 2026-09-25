-- Gastos del local (25 de septiembre de 2026): lo que cuesta operar además
-- de insumos y nómina, para que la utilidad lo reste.
--
-- · Categorías editables por admin (sembradas: las pidió el dueño; es un
--   catálogo de la app, no datos de un cliente).
-- · Un gasto dice qué PERIODO cubre (la luz de CFE es bimestral, un seguro
--   anual): en la utilidad se reparte por días entre lo que cubre, no se
--   carga completo al mes en que se pagó.
-- · Pagado en efectivo DEL CAJÓN: el mismo registro genera el retiro en el
--   turno abierto, para que el corte cuadre; sin turno abierto, no se deja.
-- · Nunca se borra: se cancela con motivo (y si su retiro está en el turno
--   todavía abierto, el retiro se da de baja: el dinero no salió) o se
--   corrige con un AJUSTE ligado al original.
-- · Recurrentes: plantillas que generan el gasto esperado de cada periodo
--   (estado «pendiente»), que se marca pagado con su monto real.
-- · Dinero detrás del permiso NUEVO «gastos». Ni «inventario_costos» ni
--   «nomina» lo dan.

-- ── 0. Permiso «gastos» ─────────────────────────────────────────────

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (permiso in (
  'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
  'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
  'plantillas_contrato', 'nomina', 'gastos'
));

create or replace function public.mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select unnest(array[
    'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
    'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
    'plantillas_contrato', 'nomina', 'gastos'
  ]) as permiso
  where coalesce(public.is_admin(), false)
  union
  select ps.permiso
  from public.permisos_staff ps
  join public.profiles pr on pr.id = ps.profile_id
  where ps.profile_id = auth.uid()
    and ps.revocado_at is null
    and ps.deleted_at is null
    and pr.rol = 'recepcion';
$$;

-- ── 1. Categorías ───────────────────────────────────────────────────

create table public.categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  -- Clave fija solo para las que la app necesita encontrar (comisiones).
  clave text unique,
  nombre text not null check (btrim(nombre) <> ''),
  descripcion text,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.categorias_gasto
  for each row execute function public.set_updated_at();
create unique index categorias_gasto_nombre_vivo on public.categorias_gasto (lower(nombre)) where deleted_at is null;

alter table public.categorias_gasto enable row level security;
create policy categorias_gasto_select on public.categorias_gasto
  for select to authenticated
  using (public.tiene_permiso('gastos') or public.tiene_permiso('reportes_financieros'));
create policy categorias_gasto_insert_admin on public.categorias_gasto
  for insert to authenticated
  with check (coalesce(public.is_admin(), false));
create policy categorias_gasto_update_admin on public.categorias_gasto
  for update to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));

insert into public.categorias_gasto (clave, nombre, descripcion, orden) values
  ('renta', 'Renta', null, 1),
  ('luz', 'Luz', 'CFE; normalmente bimestral', 2),
  ('agua', 'Agua', null, 3),
  ('gas', 'Gas', null, 4),
  ('internet_telefono', 'Internet y teléfono', null, 5),
  ('mantenimiento_local', 'Mantenimiento del local', null, 6),
  ('camioneta', 'Camioneta', 'Gasolina, servicio, seguro, tenencia', 7),
  ('publicidad', 'Publicidad', null, 8),
  ('comisiones', 'Comisiones bancarias y de Mercado Pago', 'Las de Mercado Pago por link de pago se registran solas', 9),
  ('papeleria', 'Papelería', null, 10),
  ('otros', 'Otros', null, 11);

-- ── 2. Gastos recurrentes (plantillas) ──────────────────────────────

create table public.gastos_recurrentes (
  id uuid primary key default gen_random_uuid(),
  concepto text not null check (btrim(concepto) <> ''),
  categoria_id uuid not null references public.categorias_gasto(id),
  proveedor_id uuid references public.proveedores(id),
  monto_estimado numeric(12, 2) check (monto_estimado > 0),
  -- Cada cuántos meses se paga, y qué día del mes vence.
  cada_meses int not null check (cada_meses in (1, 2, 3, 4, 6, 12)),
  dia int not null check (dia between 1 and 31),
  -- Qué periodo cubre cada pago: los meses desde el del vencimiento
  -- (renta), o los meses anteriores al vencimiento (luz: se paga lo ya usado).
  cubre text not null default 'mes_del_pago' check (cubre in ('mes_del_pago', 'meses_anteriores')),
  proxima_fecha date not null,
  activo boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.gastos_recurrentes
  for each row execute function public.set_updated_at();

alter table public.gastos_recurrentes enable row level security;
create policy gastos_recurrentes_select on public.gastos_recurrentes
  for select to authenticated
  using (public.tiene_permiso('gastos'));
create policy gastos_recurrentes_insert on public.gastos_recurrentes
  for insert to authenticated
  with check (public.tiene_permiso('gastos'));
create policy gastos_recurrentes_update on public.gastos_recurrentes
  for update to authenticated
  using (public.tiene_permiso('gastos'))
  with check (public.tiene_permiso('gastos'));

-- ── 3. Gastos ───────────────────────────────────────────────────────

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  -- gasto: lo normal. ajuste: corrección de un gasto (monto ± la diferencia).
  tipo text not null default 'gasto' check (tipo in ('gasto', 'ajuste')),
  ajuste_de uuid references public.gastos(id),
  -- pendiente: esperado por una plantilla recurrente, todavía sin pagar.
  estado text not null check (estado in ('pendiente', 'pagado', 'cancelado')),
  concepto text not null check (btrim(concepto) <> ''),
  categoria_id uuid not null references public.categorias_gasto(id),
  proveedor_id uuid references public.proveedores(id),
  monto numeric(12, 2),
  monto_estimado numeric(12, 2),
  vencimiento date,
  fecha_pago date,
  metodo text check (metodo in ('efectivo_caja', 'efectivo', 'transferencia', 'tarjeta', 'domiciliado', 'retenido', 'otro')),
  periodo_desde date not null,
  periodo_hasta date not null,
  comprobante_path text,
  notas text,
  recurrente_id uuid references public.gastos_recurrentes(id),
  movimiento_caja_id uuid references public.movimientos_caja(id),
  mp_orden_id uuid references public.mp_ordenes(id),
  motivo_cancelacion text,
  cancelado_por uuid references auth.users(id) on delete set null,
  cancelado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (periodo_hasta >= periodo_desde),
  check ((tipo = 'ajuste') = (ajuste_de is not null)),
  check (estado <> 'pagado' or (monto is not null and fecha_pago is not null and metodo is not null)),
  check (tipo = 'ajuste' or monto is null or monto > 0),
  check (estado <> 'cancelado' or btrim(coalesce(motivo_cancelacion, '')) <> '')
);
create trigger set_updated_at before insert or update on public.gastos
  for each row execute function public.set_updated_at();
create index gastos_periodo_idx on public.gastos (periodo_desde, periodo_hasta);
create index gastos_fecha_pago_idx on public.gastos (fecha_pago);
create unique index gastos_recurrente_vencimiento on public.gastos (recurrente_id, vencimiento)
  where recurrente_id is not null and tipo = 'gasto';
create unique index gastos_mp_orden_unico on public.gastos (mp_orden_id) where mp_orden_id is not null;

alter table public.gastos enable row level security;
create policy gastos_select on public.gastos
  for select to authenticated
  using (public.tiene_permiso('gastos'));
-- Solo por las funciones de abajo (validan, generan el retiro y dejan rastro).
create policy gastos_escritura_por_rpc on public.gastos
  for insert to authenticated
  with check (false);

-- Comprobantes: bucket privado; los sube y los firma el servidor con la
-- secret key después de comprobar el permiso (sin políticas de Storage).
insert into storage.buckets (id, name, public)
values ('gastos-comprobantes', 'gastos-comprobantes', false)
on conflict (id) do nothing;

-- ── 4. Registrar, pagar, cancelar y corregir ────────────────────────

-- Periodo por omisión: el mes de la fecha de pago.
create or replace function public.periodo_mes(p_fecha date)
returns table (desde date, hasta date)
language sql
immutable
set search_path = ''
as $$
  select date_trunc('month', p_fecha)::date, (date_trunc('month', p_fecha) + interval '1 month - 1 day')::date;
$$;

-- El retiro del cajón de un gasto en efectivo: en el turno abierto.
create or replace function public.retiro_de_gasto(p_monto numeric, p_concepto text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno uuid;
  v_id uuid;
begin
  select id into v_turno from public.turnos_caja where estado = 'abierto' and deleted_at is null limit 1;
  if v_turno is null then
    raise exception 'No hay turno de caja abierto: ábrelo para sacar el dinero del cajón, o registra el gasto con otro método (por ejemplo, efectivo que no salió del cajón).';
  end if;
  insert into public.movimientos_caja (turno_id, monto, motivo)
  values (v_turno, p_monto, 'Gasto: ' || btrim(p_concepto))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.retiro_de_gasto(numeric, text) from public, anon, authenticated;

create or replace function public.validar_datos_gasto(p_monto numeric, p_fecha date, p_metodo text, p_desde date, p_hasta date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_fecha is null then
    raise exception 'Pon la fecha de pago.';
  end if;
  if p_metodo is null or p_metodo not in ('efectivo_caja', 'efectivo', 'transferencia', 'tarjeta', 'domiciliado', 'retenido', 'otro') then
    raise exception 'Elige cómo se pagó.';
  end if;
  if p_desde is not null and p_hasta is not null and p_hasta < p_desde then
    raise exception 'El periodo que cubre está al revés: el final no puede ser antes del inicio.';
  end if;
  if p_desde is not null and p_hasta is not null and p_hasta - p_desde > 800 then
    raise exception 'Un gasto no puede cubrir más de dos años.';
  end if;
end;
$$;

create or replace function public.registrar_gasto(
  p_concepto text,
  p_categoria_id uuid,
  p_monto numeric,
  p_fecha_pago date,
  p_metodo text,
  p_proveedor_id uuid,
  p_periodo_desde date,
  p_periodo_hasta date,
  p_comprobante_path text,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_desde date;
  v_hasta date;
  v_mov uuid;
  v_id uuid;
begin
  if not public.tiene_permiso('gastos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Gastos», registra gastos.';
  end if;
  if p_concepto is null or btrim(p_concepto) = '' then
    raise exception 'Escribe el concepto.';
  end if;
  if not exists (select 1 from public.categorias_gasto where id = p_categoria_id and deleted_at is null) then
    raise exception 'Elige la categoría.';
  end if;
  perform public.validar_datos_gasto(p_monto, p_fecha_pago, p_metodo, p_periodo_desde, p_periodo_hasta);
  select desde, hasta into v_desde, v_hasta from public.periodo_mes(p_fecha_pago);

  if p_metodo = 'efectivo_caja' then
    v_mov := public.retiro_de_gasto(round(p_monto, 2), p_concepto);
  end if;

  insert into public.gastos (
    estado, concepto, categoria_id, proveedor_id, monto, fecha_pago, metodo,
    periodo_desde, periodo_hasta, comprobante_path, notas, movimiento_caja_id
  )
  values (
    'pagado', btrim(p_concepto), p_categoria_id, p_proveedor_id, round(p_monto, 2), p_fecha_pago, p_metodo,
    coalesce(p_periodo_desde, v_desde), coalesce(p_periodo_hasta, v_hasta),
    nullif(p_comprobante_path, ''), nullif(btrim(coalesce(p_notas, '')), ''), v_mov
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.registrar_gasto(text, uuid, numeric, date, text, uuid, date, date, text, text) from public, anon;
grant execute on function public.registrar_gasto(text, uuid, numeric, date, text, uuid, date, date, text, text) to authenticated;

-- Marcar pagado un gasto esperado (de una plantilla), con su monto real.
create or replace function public.pagar_gasto_esperado(
  p_gasto_id uuid,
  p_monto numeric,
  p_fecha_pago date,
  p_metodo text,
  p_proveedor_id uuid,
  p_periodo_desde date,
  p_periodo_hasta date,
  p_comprobante_path text,
  p_notas text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_mov uuid;
begin
  if not public.tiene_permiso('gastos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Gastos», marca gastos como pagados.';
  end if;
  select * into v from public.gastos where id = p_gasto_id and deleted_at is null for update;
  if not found then
    raise exception 'Gasto no encontrado.';
  end if;
  if v.estado <> 'pendiente' then
    raise exception 'Ese gasto ya no está pendiente.';
  end if;
  perform public.validar_datos_gasto(p_monto, p_fecha_pago, p_metodo, p_periodo_desde, p_periodo_hasta);
  if p_metodo = 'efectivo_caja' then
    v_mov := public.retiro_de_gasto(round(p_monto, 2), v.concepto);
  end if;
  update public.gastos
  set estado = 'pagado', monto = round(p_monto, 2), fecha_pago = p_fecha_pago, metodo = p_metodo,
      proveedor_id = coalesce(p_proveedor_id, proveedor_id),
      periodo_desde = coalesce(p_periodo_desde, periodo_desde), periodo_hasta = coalesce(p_periodo_hasta, periodo_hasta),
      comprobante_path = coalesce(nullif(p_comprobante_path, ''), comprobante_path),
      notas = coalesce(nullif(btrim(coalesce(p_notas, '')), ''), notas),
      movimiento_caja_id = v_mov
  where id = v.id;
end;
$$;
revoke execute on function public.pagar_gasto_esperado(uuid, numeric, date, text, uuid, date, date, text, text) from public, anon;
grant execute on function public.pagar_gasto_esperado(uuid, numeric, date, text, uuid, date, date, text, text) to authenticated;

-- Cancelar con motivo (un pendiente que no se va a pagar, o uno capturado
-- por error). Si salió del cajón y su turno sigue abierto, el retiro se da
-- de baja: el dinero no salió y el corte debe cuadrar. Si el turno ya se
-- cerró, el retiro se queda (el corte ya se hizo) y se avisa.
create or replace function public.cancelar_gasto(p_gasto_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_turno_abierto boolean;
  v_aviso text := null;
begin
  if not public.tiene_permiso('gastos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Gastos», cancela gastos.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe por qué se cancela.';
  end if;
  select * into v from public.gastos where id = p_gasto_id and deleted_at is null for update;
  if not found then
    raise exception 'Gasto no encontrado.';
  end if;
  if v.estado = 'cancelado' then
    raise exception 'Ese gasto ya está cancelado.';
  end if;
  if v.tipo = 'ajuste' then
    raise exception 'Un ajuste no se cancela solo: cancela el gasto original, o registra otro ajuste.';
  end if;

  if v.movimiento_caja_id is not null then
    select t.estado = 'abierto' into v_turno_abierto
    from public.movimientos_caja mc join public.turnos_caja t on t.id = mc.turno_id
    where mc.id = v.movimiento_caja_id;
    if v_turno_abierto then
      update public.movimientos_caja set deleted_at = now() where id = v.movimiento_caja_id;
      v_aviso := 'Se quitó también su retiro del turno abierto: el dinero se queda en el cajón.';
    else
      v_aviso := 'Su retiro de caja ya quedó en un corte cerrado y no se toca. Si el dinero no salió, regrésalo al cajón y anótalo en el siguiente corte.';
    end if;
  end if;

  update public.gastos
  set estado = 'cancelado', motivo_cancelacion = btrim(p_motivo), cancelado_por = auth.uid(), cancelado_at = now()
  where id = v.id or (ajuste_de = v.id and estado <> 'cancelado');
  return v_aviso;
end;
$$;
revoke execute on function public.cancelar_gasto(uuid, text) from public, anon;
grant execute on function public.cancelar_gasto(uuid, text) to authenticated;

-- Corregir el monto de un gasto pagado: un AJUSTE por la diferencia, ligado
-- al original, con el mismo periodo y categoría. No toca la caja.
create or replace function public.corregir_gasto(p_gasto_id uuid, p_monto_correcto numeric, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_actual numeric;
  v_id uuid;
begin
  if not public.tiene_permiso('gastos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Gastos», corrige gastos.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  if p_monto_correcto is null or p_monto_correcto <= 0 then
    raise exception 'El monto correcto tiene que ser mayor a cero (para quitarlo, cancélalo).';
  end if;
  select * into v from public.gastos where id = p_gasto_id and deleted_at is null for update;
  if not found or v.tipo <> 'gasto' then
    raise exception 'Gasto no encontrado.';
  end if;
  if v.estado <> 'pagado' then
    raise exception 'Solo se corrige un gasto pagado.';
  end if;
  select v.monto + coalesce(sum(monto), 0) into v_actual
  from public.gastos where ajuste_de = v.id and estado = 'pagado' and deleted_at is null;
  if round(p_monto_correcto, 2) = v_actual then
    raise exception 'Ese ya es su monto.';
  end if;
  insert into public.gastos (
    tipo, ajuste_de, estado, concepto, categoria_id, proveedor_id, monto, fecha_pago, metodo,
    periodo_desde, periodo_hasta, notas
  )
  values (
    'ajuste', v.id, 'pagado', 'Corrección: ' || v.concepto, v.categoria_id, v.proveedor_id,
    round(p_monto_correcto, 2) - v_actual, public.fecha_negocio(), v.metodo,
    v.periodo_desde, v.periodo_hasta, btrim(p_motivo)
  )
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.corregir_gasto(uuid, numeric, text) from public, anon;
grant execute on function public.corregir_gasto(uuid, numeric, text) to authenticated;

create or replace function public.adjuntar_comprobante_gasto(p_gasto_id uuid, p_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('gastos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Gastos», adjunta comprobantes.';
  end if;
  if p_path is null or p_path not like 'gastos/%' then
    raise exception 'Ruta de comprobante no válida.';
  end if;
  update public.gastos set comprobante_path = p_path where id = p_gasto_id and deleted_at is null;
  if not found then
    raise exception 'Gasto no encontrado.';
  end if;
end;
$$;
revoke execute on function public.adjuntar_comprobante_gasto(uuid, text) from public, anon;
grant execute on function public.adjuntar_comprobante_gasto(uuid, text) to authenticated;

-- ── 5. Recurrentes: generar lo esperado y avisar ────────────────────

-- Siguiente vencimiento: el mismo día (o el último del mes si no existe).
create or replace function public.siguiente_vencimiento(p_fecha date, p_meses int, p_dia int)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    extract(year from m)::int, extract(month from m)::int,
    least(p_dia, extract(day from (m + interval '1 month - 1 day'))::int)
  )
  from (select date_trunc('month', p_fecha) + make_interval(months => p_meses) as m) x;
$$;

-- Crea los gastos esperados que vencen hasta dentro de 15 días. Interna:
-- la llama gastos_por_atender (con su guardia).
create or replace function public.generar_gastos_esperados()
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_fecha date;
  v_desde date;
  v_hasta date;
  v_creados int := 0;
  v_vueltas int;
begin
  for r in
    select * from public.gastos_recurrentes
    where activo and deleted_at is null and proxima_fecha <= public.fecha_negocio() + 15
    for update
  loop
    v_fecha := r.proxima_fecha;
    v_vueltas := 0;
    while v_fecha <= public.fecha_negocio() + 15 and v_vueltas < 36 loop
      if r.cubre = 'mes_del_pago' then
        v_desde := date_trunc('month', v_fecha)::date;
        v_hasta := (date_trunc('month', v_fecha) + make_interval(months => r.cada_meses) - interval '1 day')::date;
      else
        v_hasta := (date_trunc('month', v_fecha) - interval '1 day')::date;
        v_desde := (date_trunc('month', v_fecha) - make_interval(months => r.cada_meses))::date;
      end if;
      insert into public.gastos (estado, concepto, categoria_id, proveedor_id, monto_estimado, vencimiento, periodo_desde, periodo_hasta, recurrente_id, created_by)
      values ('pendiente', r.concepto, r.categoria_id, r.proveedor_id, r.monto_estimado, v_fecha, v_desde, v_hasta, r.id, r.created_by)
      on conflict do nothing;
      if found then v_creados := v_creados + 1; end if;
      v_fecha := public.siguiente_vencimiento(v_fecha, r.cada_meses, r.dia);
      v_vueltas := v_vueltas + 1;
    end loop;
    update public.gastos_recurrentes set proxima_fecha = v_fecha where id = r.id;
  end loop;
  return v_creados;
end;
$$;
revoke execute on function public.generar_gastos_esperados() from public, anon, authenticated;

-- Los pendientes vencidos y los que vencen en los próximos 7 días (para
-- el tablero y la pantalla de gastos). Genera antes lo que toque.
create or replace function public.gastos_por_atender()
returns table (
  id uuid,
  concepto text,
  categoria text,
  monto_estimado numeric,
  vencimiento date,
  dias int,
  vencido boolean,
  recurrente_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('gastos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Gastos», ve los gastos por pagar.';
  end if;
  perform public.generar_gastos_esperados();
  return query
  select g.id, g.concepto, c.nombre, g.monto_estimado, g.vencimiento,
    abs(g.vencimiento - public.fecha_negocio())::int,
    g.vencimiento < public.fecha_negocio(),
    g.recurrente_id
  from public.gastos g
  join public.categorias_gasto c on c.id = g.categoria_id
  where g.estado = 'pendiente' and g.deleted_at is null
    and g.vencimiento <= public.fecha_negocio() + 7
  order by g.vencimiento;
end;
$$;
revoke execute on function public.gastos_por_atender() from public, anon;
grant execute on function public.gastos_por_atender() to authenticated;

-- ── 6. Comisión de Mercado Pago, sola ───────────────────────────────
-- La registra el servidor (service_role) al registrar un cobro de MP, con
-- lo que la API de pagos dice que retuvo (fee_details). Una por orden.
create or replace function public.registrar_comision_mercadopago(p_orden_id uuid, p_monto numeric, p_detalle text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria uuid;
  v_hoy date := public.fecha_negocio();
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor registra comisiones de Mercado Pago.';
  end if;
  if p_monto is null or p_monto <= 0 then
    return false;
  end if;
  select id into v_categoria from public.categorias_gasto where clave = 'comisiones' and deleted_at is null;
  if v_categoria is null then
    select id into v_categoria from public.categorias_gasto where clave = 'otros' and deleted_at is null;
  end if;
  insert into public.gastos (estado, concepto, categoria_id, monto, fecha_pago, metodo, periodo_desde, periodo_hasta, mp_orden_id, notas)
  values (
    'pagado', 'Comisión de Mercado Pago', v_categoria, round(p_monto, 2), v_hoy, 'retenido',
    date_trunc('month', v_hoy)::date, (date_trunc('month', v_hoy) + interval '1 month - 1 day')::date,
    p_orden_id, nullif(p_detalle, '')
  )
  on conflict do nothing;
  return found;
end;
$$;
revoke execute on function public.registrar_comision_mercadopago(uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.registrar_comision_mercadopago(uuid, numeric, text) to service_role;

-- ── 7. Reportes ─────────────────────────────────────────────────────

-- Lo que le toca a [p_desde, p_hasta] de un gasto que cubre
-- [periodo_desde, periodo_hasta]: repartido por días.
create or replace function public.gasto_en_rango(p_monto numeric, p_pd date, p_ph date, p_desde date, p_hasta date)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when least(p_ph, p_hasta) < greatest(p_pd, p_desde) then 0
    else p_monto * (least(p_ph, p_hasta) - greatest(p_pd, p_desde) + 1)::numeric / (p_ph - p_pd + 1)
  end;
$$;

create or replace function public.gastos_por_categoria_periodo(p_desde date, p_hasta date)
returns table (categoria_id uuid, categoria text, orden int, monto numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (public.tiene_permiso('reportes_financieros') or public.tiene_permiso('gastos')) then
    raise exception 'Solo un admin, o quien tenga «Reportes financieros» o «Gastos», ve los gastos del periodo.';
  end if;
  return query
  select c.id, c.nombre, c.orden,
    round(coalesce(sum(public.gasto_en_rango(g.monto, g.periodo_desde, g.periodo_hasta, p_desde, p_hasta)), 0), 2)
  from public.categorias_gasto c
  left join public.gastos g
    on g.categoria_id = c.id and g.estado = 'pagado' and g.deleted_at is null
    and g.periodo_hasta >= p_desde and g.periodo_desde <= p_hasta
  where c.deleted_at is null or g.id is not null
  group by c.id, c.nombre, c.orden
  order by c.orden, c.nombre;
end;
$$;
revoke execute on function public.gastos_por_categoria_periodo(date, date) from public, anon;
grant execute on function public.gastos_por_categoria_periodo(date, date) to authenticated;

-- Utilidad = ingreso reconocido − insumos − nómina − gastos del local
-- (cambia el tipo de retorno: se recrea).
drop function public.reporte_utilidad_periodo(date, date);
create function public.reporte_utilidad_periodo(p_desde date, p_hasta date)
returns table (
  ingreso_reconocido numeric,
  costo_insumos numeric,
  nomina_costo numeric,
  nomina_pagada numeric,
  propinas_repartidas numeric,
  adelantos_pendientes numeric,
  gastos_local numeric,
  utilidad numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ingreso numeric;
  v_insumos numeric;
  v_gastos numeric;
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;
  select f.ingreso_reconocido into v_ingreso from public.reporte_financiero_periodo(p_desde, p_hasta) f;
  select c.consumo_valorizado_total into v_insumos from public.reporte_costos_periodo(p_desde, p_hasta) c;
  select round(coalesce(sum(public.gasto_en_rango(g.monto, g.periodo_desde, g.periodo_hasta, p_desde, p_hasta)), 0), 2)
    into v_gastos
  from public.gastos g
  where g.estado = 'pagado' and g.deleted_at is null
    and g.periodo_hasta >= p_desde and g.periodo_desde <= p_hasta;

  return query
  select
    coalesce(v_ingreso, 0),
    coalesce(v_insumos, 0),
    coalesce(n.costo, 0),
    coalesce(n.total, 0),
    coalesce(n.propinas, 0),
    (select coalesce(sum(a.monto), 0) from public.adelantos a
      where not a.cancelado and a.pago_id is null and a.deleted_at is null and a.fecha <= p_hasta),
    coalesce(v_gastos, 0),
    coalesce(v_ingreso, 0) - coalesce(v_insumos, 0) - coalesce(n.costo, 0) - coalesce(v_gastos, 0)
  from (
    select sum(np.costo) as costo, sum(np.total) as total, sum(np.propinas) as propinas
    from public.nomina_pagos np
    where np.deleted_at is null and np.fecha_pago between p_desde and p_hasta
  ) n;
end;
$$;
revoke execute on function public.reporte_utilidad_periodo(date, date) from public, anon;
grant execute on function public.reporte_utilidad_periodo(date, date) to authenticated;

revoke execute on function public.periodo_mes(date) from anon;
revoke execute on function public.validar_datos_gasto(numeric, date, text, date, date) from anon;
revoke execute on function public.siguiente_vencimiento(date, int, int) from anon;
revoke execute on function public.gasto_en_rango(numeric, date, date, date, date) from anon;

-- ── 8. Un retiro dado de baja no cuenta en la caja ──────────────────
-- (el de un gasto cancelado mientras su turno seguía abierto). Mismas
-- funciones, con el filtro.

create or replace function public.cerrar_turno(
  p_turno_id uuid,
  p_conteo_efectivo numeric,
  p_conteo_terminal numeric,
  p_conteo_transferencia numeric,
  p_explicacion_diferencias text,
  p_notas_cierre text
)
returns table (
  cerrado boolean,
  corte_id uuid,
  esperado_efectivo numeric,
  esperado_terminal numeric,
  esperado_transferencia numeric,
  diferencia_efectivo numeric,
  diferencia_terminal numeric,
  diferencia_transferencia numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_turno public.turnos_caja%rowtype;
  v_esperado_efectivo numeric;
  v_esperado_terminal numeric;
  v_esperado_transferencia numeric;
  v_diferencia_efectivo numeric;
  v_diferencia_terminal numeric;
  v_diferencia_transferencia numeric;
  v_hay_diferencia boolean;
  v_corte_id uuid;
begin
  select * into v_turno from public.turnos_caja where id = p_turno_id;
  if not found then
    raise exception 'Turno no encontrado.';
  end if;
  if v_turno.estado <> 'abierto' then
    raise exception 'Este turno ya está cerrado.';
  end if;

  if public.is_admin() then
    null;
  elsif public.current_rol() = 'recepcion' then
    if v_turno.abierto_por <> auth.uid() then
      raise exception 'Solo puedes cerrar el turno que tú abriste.';
    end if;
  else
    raise exception 'Solo admin o recepción pueden cerrar un turno.';
  end if;

  if p_conteo_efectivo is null or p_conteo_terminal is null or p_conteo_transferencia is null then
    raise exception 'Captura el conteo de los tres métodos.';
  end if;
  if p_conteo_efectivo < 0 or p_conteo_terminal < 0 or p_conteo_transferencia < 0 then
    raise exception 'El conteo no puede ser negativo.';
  end if;

  v_esperado_efectivo := v_turno.fondo_inicial
    + coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'efectivo'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'efectivo'
    ), 0)
    - coalesce((select sum(monto) from public.movimientos_caja where turno_id = p_turno_id and deleted_at is null), 0);

  v_esperado_terminal := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'terminal'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'terminal'
    ), 0);

  v_esperado_transferencia := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'transferencia'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'transferencia'
    ), 0);

  v_diferencia_efectivo := p_conteo_efectivo - v_esperado_efectivo;
  v_diferencia_terminal := p_conteo_terminal - v_esperado_terminal;
  v_diferencia_transferencia := p_conteo_transferencia - v_esperado_transferencia;

  v_hay_diferencia := v_diferencia_efectivo <> 0 or v_diferencia_terminal <> 0 or v_diferencia_transferencia <> 0;

  if v_hay_diferencia and (p_explicacion_diferencias is null or btrim(p_explicacion_diferencias) = '') then
    -- Fase 1 con diferencia: no se escribe nada todavía, solo se revela
    -- lo que el sistema esperaba para que la pantalla pida el motivo.
    cerrado := false;
    corte_id := null;
    esperado_efectivo := v_esperado_efectivo;
    esperado_terminal := v_esperado_terminal;
    esperado_transferencia := v_esperado_transferencia;
    diferencia_efectivo := v_diferencia_efectivo;
    diferencia_terminal := v_diferencia_terminal;
    diferencia_transferencia := v_diferencia_transferencia;
    return next;
    return;
  end if;

  insert into public.cortes_caja (turno_id, explicacion_diferencias, created_by)
  values (p_turno_id, nullif(btrim(p_explicacion_diferencias), ''), auth.uid())
  returning id into v_corte_id;

  insert into public.corte_metodos (corte_id, metodo, conteo, esperado, diferencia, created_by)
  values
    (v_corte_id, 'efectivo', p_conteo_efectivo, v_esperado_efectivo, v_diferencia_efectivo, auth.uid()),
    (v_corte_id, 'terminal', p_conteo_terminal, v_esperado_terminal, v_diferencia_terminal, auth.uid()),
    (v_corte_id, 'transferencia', p_conteo_transferencia, v_esperado_transferencia, v_diferencia_transferencia, auth.uid());

  update public.turnos_caja
  set estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid(), notas_cierre = nullif(btrim(p_notas_cierre), '')
  where id = p_turno_id;

  cerrado := true;
  corte_id := v_corte_id;
  esperado_efectivo := v_esperado_efectivo;
  esperado_terminal := v_esperado_terminal;
  esperado_transferencia := v_esperado_transferencia;
  diferencia_efectivo := v_diferencia_efectivo;
  diferencia_terminal := v_diferencia_terminal;
  diferencia_transferencia := v_diferencia_transferencia;
  return next;
end;
$$;

create or replace function public.movimientos_turno(p_turno_id uuid)
returns table (
  id uuid,
  tipo text,
  fecha timestamptz,
  reserva_id uuid,
  cliente_nombre text,
  descripcion text,
  metodo text,
  monto numeric,
  propina numeric,
  origen text,
  hecho_por uuid
)
language sql
stable
set search_path = ''
as $$
  select
    cm.id,
    case when exists (select 1 from public.bonos_clientes bc where bc.reserva_id = c.reserva_id) then 'venta_bono' else 'cobro' end,
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
    'manual',
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
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
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
    where deleted_at is null
      and public.fecha_negocio(created_at) between p_desde and p_hasta
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
