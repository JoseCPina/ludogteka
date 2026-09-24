-- Permisos delegables por persona (24 de septiembre de 2026).
--
-- Admin puede darle a una recepcionista en particular (no a todo el rol)
-- permisos extra para que funcione como su mano derecha. Se aplican en la
-- base —guardias de funciones y políticas—, no solo en la pantalla: un
-- permiso apagado no se salta pidiéndolo directo a la API, y uno prendido
-- funciona sin que la base lo rechace.
--
-- Delegables (clave → qué abre):
--   inventario_costos      ver compras_insumos (costos) y costo promedio,
--                          registrar_entrada_compra, alta/edición de proveedores
--   tarifas                escribir tarifas y tarifas_dia_semana
--   reportes_financieros   los cinco reporte_* (ahora security definer)
--   personal               invitar recepción/estética (/api/staff/invite) y
--                          ver la lista del personal (listar_personal)
--   configuracion_negocio  guardar_configuracion_negocio, guardar_horario_semana,
--                          cupo_configuracion, horario_semana, sucursales
--   excepciones_reserva    bloqueo sanitario y de evaluación al reservar
--   descuentos_sin_tope    aplicar_descuento arriba del tope de recepción
--   plantillas_contrato    tipos y plantillas de contrato
--
-- NUNCA se delega (sigue con is_admin(), no con tiene_permiso): dar o quitar
-- permisos (otorgar_permiso / revocar_permiso), crear o quitar admins,
-- cambiar el rol de alguien (proteger_columnas_sensibles_profile,
-- asignar_rol_staff), el tope de descuentos de recepción
-- (configuracion_descuentos: dárselo a quien tiene "configuración" sería
-- darle "descuentos sin tope" por la puerta de atrás), devoluciones de
-- dinero, quitar una evaluación de comportamiento y los catálogos base.
--
-- Solo se le dan a una cuenta con rol recepción, y valen mientras lo sea:
-- si la cuenta cambia de rol, tiene_permiso deja de reconocerlos.
--
-- La bitácora es la propia tabla: cada fila es un otorgamiento (quién y
-- cuándo: created_by, created_at) y, si se quitó, su revocación
-- (revocado_por, revocado_at). Nunca se borra una fila.

-- ── 1. Tabla ─────────────────────────────────────────────────────────

create table public.permisos_staff (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  permiso text not null check (permiso in (
    'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
    'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
    'plantillas_contrato'
  )),
  revocado_at timestamptz,
  revocado_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

comment on table public.permisos_staff is
  'Permisos extra de una persona de recepción. Una fila por otorgamiento; revocado_at la apaga. Es también la bitácora: nunca se borra.';

-- Un permiso vigente por persona a la vez.
create unique index permisos_staff_vigente_unico
  on public.permisos_staff (profile_id, permiso)
  where revocado_at is null and deleted_at is null;

create trigger set_updated_at
  before insert or update on public.permisos_staff
  for each row execute function public.set_updated_at();

alter table public.permisos_staff enable row level security;

-- Admin ve todo (la bitácora completa); cada quien ve los suyos.
create policy permisos_staff_select on public.permisos_staff
  for select to authenticated
  using (coalesce(public.is_admin(), false) or profile_id = auth.uid());

-- Escribir: solo admin (y en la práctica, por otorgar_permiso/revocar_permiso).
create policy permisos_staff_insert_admin on public.permisos_staff
  for insert to authenticated
  with check (coalesce(public.is_admin(), false));

create policy permisos_staff_update_admin on public.permisos_staff
  for update to authenticated
  using (coalesce(public.is_admin(), false))
  with check (coalesce(public.is_admin(), false));

-- ── 2. tiene_permiso y las funciones para darlos y quitarlos ─────────

create or replace function public.tiene_permiso(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Nunca NULL: un anónimo o alguien sin perfil da false, no NULL (un
  -- guardia `if not NULL` no se dispara y deja pasar).
  select coalesce(public.is_admin(), false)
    or exists (
      select 1
      from public.permisos_staff ps
      join public.profiles pr on pr.id = ps.profile_id
      where ps.profile_id = auth.uid()
        and ps.permiso = p_permiso
        and ps.revocado_at is null
        and ps.deleted_at is null
        and pr.rol = 'recepcion'
    );
$$;

revoke execute on function public.tiene_permiso(text) from public, anon;
grant execute on function public.tiene_permiso(text) to authenticated;

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
    'plantillas_contrato'
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

revoke execute on function public.mis_permisos() from public, anon;
grant execute on function public.mis_permisos() to authenticated;

-- Dar y quitar permisos: SOLO admin. is_admin(), nunca tiene_permiso: esto
-- no se delega.
create or replace function public.otorgar_permiso(p_profile_id uuid, p_permiso text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text;
  v_id uuid;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede dar permisos.';
  end if;

  select rol into v_rol from public.profiles where id = p_profile_id and deleted_at is null;
  if v_rol is null then
    raise exception 'No encontramos esa cuenta.';
  end if;
  if v_rol <> 'recepcion' then
    raise exception 'Los permisos extra solo se le dan a alguien de recepción.';
  end if;

  select id into v_id from public.permisos_staff
  where profile_id = p_profile_id and permiso = p_permiso
    and revocado_at is null and deleted_at is null;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.permisos_staff (profile_id, permiso, created_by)
  values (p_profile_id, p_permiso, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.otorgar_permiso(uuid, text) from public, anon;
grant execute on function public.otorgar_permiso(uuid, text) to authenticated;

create or replace function public.revocar_permiso(p_profile_id uuid, p_permiso text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede quitar permisos.';
  end if;

  update public.permisos_staff
  set revocado_at = now(), revocado_por = auth.uid()
  where profile_id = p_profile_id and permiso = p_permiso
    and revocado_at is null and deleted_at is null;
  return found;
end;
$$;

revoke execute on function public.revocar_permiso(uuid, text) from public, anon;
grant execute on function public.revocar_permiso(uuid, text) to authenticated;

-- La lista del personal (recepción y estética) para quien tiene el permiso
-- de personal. Admin sigue teniendo listar_cuentas, que incluye clientes y
-- cambio de rol: eso no se delega.
create or replace function public.listar_personal()
returns table (id uuid, nombre_completo text, rol text, email text, creado_at timestamptz, ultimo_acceso timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('personal') then
    raise exception 'Solo un admin, o quien tenga el permiso «Personal», puede ver la lista del personal.';
  end if;
  return query
  select p.id, p.nombre_completo, p.rol, u.email::text, p.created_at, u.last_sign_in_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.rol in ('recepcion', 'estetica') and p.deleted_at is null
  order by p.rol, p.nombre_completo;
end;
$$;

revoke execute on function public.listar_personal() from public, anon;
grant execute on function public.listar_personal() to authenticated;


-- ── 3. Costos y compras de inventario ─────────────────────────────

create or replace function public.registrar_entrada_compra(
  p_insumo_id uuid,
  p_proveedor_id uuid,
  p_cantidad_compra numeric,
  p_costo_unitario numeric,
  p_fecha_caducidad date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equivalencia numeric;
  v_requiere_caducidad boolean;
  v_cantidad_base numeric;
  v_movimiento_id uuid;
begin
  if not public.tiene_permiso('inventario_costos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Costos y compras de inventario», puede registrar una compra.';
  end if;

  if p_cantidad_compra is null or p_cantidad_compra <= 0 then
    raise exception 'La cantidad comprada debe ser mayor a cero.';
  end if;
  if p_costo_unitario is null or p_costo_unitario < 0 then
    raise exception 'El costo unitario no puede ser negativo.';
  end if;

  select um.equivalencia_en_base, i.requiere_caducidad
    into v_equivalencia, v_requiere_caducidad
  from public.insumos i
  join public.unidades_medida um on um.id = i.unidad_compra_id
  where i.id = p_insumo_id and i.deleted_at is null;

  if v_equivalencia is null then
    raise exception 'Insumo no encontrado.';
  end if;

  if v_requiere_caducidad and p_fecha_caducidad is null then
    raise exception 'Este insumo requiere fecha de caducidad para cada compra.';
  end if;

  if not exists (select 1 from public.proveedores where id = p_proveedor_id and deleted_at is null) then
    raise exception 'Proveedor no encontrado.';
  end if;

  v_cantidad_base := p_cantidad_compra * v_equivalencia;

  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, fecha_caducidad)
  values (p_insumo_id, 'entrada_compra', v_cantidad_base, p_fecha_caducidad)
  returning id into v_movimiento_id;

  insert into public.compras_insumos (movimiento_id, proveedor_id, cantidad_compra, costo_unitario)
  values (v_movimiento_id, p_proveedor_id, p_cantidad_compra, p_costo_unitario);

  return v_movimiento_id;
end;
$$;

-- ── 4. Reportes: security definer (con la RLS de quien llama, una
-- recepcionista con el permiso vería números parciales: la caja solo le
-- deja ver sus propios turnos) y la guardia del permiso.

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

create or replace function public.reporte_costos_periodo(p_desde date, p_hasta date)
returns table (
  compras_total numeric,
  consumo_valorizado_total numeric,
  merma_valorizada numeric,
  consumo_estetica_valorizado numeric,
  ingreso_estetica numeric,
  margen_estetica numeric
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
  with compras as (
    select coalesce(sum(ci.costo_total), 0) as total
    from public.compras_insumos ci
    join public.movimientos_inventario mi on mi.id = ci.movimiento_id
    where public.fecha_negocio(mi.created_at) between p_desde and p_hasta
  ),
  -- Salidas SIN cita ligada (consumo manual, merma, ajuste negativo):
  -- se valorizan y agrupan por la fecha del propio movimiento.
  salidas_sueltas as (
    select
      mi.tipo,
      mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0) as valor
    from public.movimientos_inventario mi
    where mi.cita_estetica_id is null
      and mi.tipo in ('salida_consumo', 'salida_merma', 'ajuste_negativo')
      and public.fecha_negocio(mi.created_at) between p_desde and p_hasta
  ),
  -- Citas de estética finalizadas en el periodo, por la fecha de la
  -- CITA (no del movimiento) — así ingreso y costo del mismo servicio
  -- siempre caen en el mismo periodo aunque el cierre real haya
  -- cruzado medianoche.
  citas_periodo as (
    select ce.id, ce.precio
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
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

create or replace function public.reporte_margen_por_servicio_periodo(p_desde date, p_hasta date)
returns table (
  servicio_id uuid,
  servicio_nombre text,
  citas_finalizadas int,
  ingreso numeric,
  costo_consumo numeric,
  margen numeric
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
  with citas_periodo as (
    select ce.id, ce.servicio_id, ce.precio
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  costo_por_cita as (
    select
      mi.cita_estetica_id as cita_id,
      sum(mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0)) as costo
    from public.movimientos_inventario mi
    where mi.cita_estetica_id in (select id from citas_periodo)
    group by mi.cita_estetica_id
  )
  select
    s.id,
    s.nombre,
    count(cp.id)::int,
    coalesce(sum(cp.precio), 0),
    coalesce(sum(cpc.costo), 0),
    coalesce(sum(cp.precio), 0) - coalesce(sum(cpc.costo), 0)
  from citas_periodo cp
  join public.servicios s on s.id = cp.servicio_id
  left join costo_por_cita cpc on cpc.cita_id = cp.id
  group by s.id, s.nombre
  order by s.nombre;
end;
$$;

create or replace function public.reporte_operativo_periodo(p_desde date, p_hasta date)
returns table (
  dias_guarderia int,
  noches_hotel int,
  citas_estetica_finalizadas int,
  estancias_canceladas int,
  citas_no_llego int
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
  with guarderia as (
    select count(*) as dias
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    where s.categoria = 'guarderia'
      and e.deleted_at is null
      and e.estado <> 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  hotel as (
    select coalesce(sum(e.fecha_salida - e.fecha_entrada), 0) as noches
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    where s.categoria = 'hotel'
      and e.deleted_at is null
      and e.estado <> 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  citas as (
    select count(*) as total
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  canceladas as (
    select count(*) as total
    from public.estancias e
    where e.deleted_at is null
      and e.estado = 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  no_llego as (
    select count(*) as total
    from public.citas_estetica ce
    where ce.estado = 'no_llego'
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  )
  select
    (select dias from guarderia)::int,
    (select noches from hotel)::int,
    (select total from citas)::int,
    (select total from canceladas)::int,
    (select total from no_llego)::int;
end;
$$;

create or replace function public.reporte_estado_operativo_actual()
returns table (
  sanitario_vigente int,
  sanitario_por_vencer int,
  sanitario_bloqueado int,
  contrato_vigente int,
  contrato_sin_firmar int,
  contrato_requiere_actualizacion int,
  insumos_bajo_minimo int,
  insumos_por_caducar int
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
  with sanitario_por_perro as (
    select
      perro_id,
      case
        when bool_or(estado in ('vencida', 'sin_registro')) then 'bloqueado'
        when bool_or(estado = 'por_vencer') then 'por_vencer'
        else 'vigente'
      end as estado_perro
    from public.perro_requisitos_sanitarios_estado
    group by perro_id
  )
  select
    (select count(*) from sanitario_por_perro where estado_perro = 'vigente')::int,
    (select count(*) from sanitario_por_perro where estado_perro = 'por_vencer')::int,
    (select count(*) from sanitario_por_perro where estado_perro = 'bloqueado')::int,
    (select count(*) from public.perros_contrato_resumen where estado = 'vigente')::int,
    (select count(*) from public.perros_contrato_resumen where estado = 'sin_contrato')::int,
    (select count(*) from public.perros_contrato_resumen where estado = 'requiere_actualizacion')::int,
    (select count(*) from public.insumos_existencia_actual where bajo_minimo)::int,
    (select count(*) from public.insumos_proxima_caducidad where estado in ('por_vencer', 'vencida'))::int;
end;
$$;

-- ── 5. Configuración del negocio (el tope de descuentos NO: se quedaría
-- con la llave de "descuentos sin tope" sin que se la dieran) ──────────

create or replace function public.guardar_configuracion_negocio(
  p_cupo_diurno int,
  p_cupo_nocturno int,
  p_telefono_recepcion text,
  p_base_direccion text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vigente public.cupo_configuracion%rowtype;
  v_direccion text;
  v_id uuid;
begin
  if not public.tiene_permiso('configuracion_negocio') then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», puede cambiar la configuración del negocio.';
  end if;

  if p_cupo_diurno is null or p_cupo_diurno < 0 or p_cupo_nocturno is null or p_cupo_nocturno < 0 then
    raise exception 'El cupo no puede ser negativo.';
  end if;
  if p_telefono_recepcion is not null and p_telefono_recepcion !~ '^[0-9]{10}$' then
    raise exception 'El teléfono de recepción debe tener diez dígitos.';
  end if;

  v_direccion := nullif(btrim(coalesce(p_base_direccion, '')), '');

  select * into v_vigente
  from public.cupo_configuracion
  where vigencia_desde <= public.fecha_negocio() and deleted_at is null
  order by vigencia_desde desc, created_at desc
  limit 1;

  insert into public.cupo_configuracion
    (vigencia_desde, cupo_diurno, cupo_nocturno, hora_cierre,
     base_direccion, base_lat, base_lng, telefono_recepcion, created_by)
  values (
    public.fecha_negocio(),
    p_cupo_diurno,
    p_cupo_nocturno,
    -- hora_cierre sigue siendo NOT NULL en la tabla aunque el horario real
    -- se lea de horario_semana desde Fase 4: se arrastra el valor viejo
    -- para no romper la restricción ni inventar un horario.
    coalesce(v_vigente.hora_cierre, time '19:00'),
    coalesce(v_direccion, v_vigente.base_direccion),
    -- Las coordenadas solo se tiran cuando la dirección CAMBIA de verdad:
    -- son de un geocodificado que cuesta una llamada a Google, y quien
    -- entra a cambiar el teléfono de recepción no manda la dirección. La
    -- primera versión comparaba contra el parámetro vacío y las borraba en
    -- cada guardado — con eso, cotizar una recolección dejaba de
    -- funcionar por haber tocado un campo que no tiene nada que ver.
    case when v_direccion is not null and v_direccion is distinct from v_vigente.base_direccion
      then null else v_vigente.base_lat end,
    case when v_direccion is not null and v_direccion is distinct from v_vigente.base_direccion
      then null else v_vigente.base_lng end,
    p_telefono_recepcion,
    auth.uid()
  )
  returning id into v_id;

  -- El horario por día de la semana cuelga del renglón de configuración,
  -- así que la versión nueva se queda sin horario si no se copia — y el
  -- negocio se encontraría con que "hoy no cerramos" de la nada.
  insert into public.horario_semana
    (cupo_configuracion_id, dia_semana, hora_apertura, hora_cierre, created_by)
  select v_id, hs.dia_semana, hs.hora_apertura, hs.hora_cierre, auth.uid()
  from public.horario_semana hs
  where hs.cupo_configuracion_id = v_vigente.id and hs.deleted_at is null;

  return v_id;
end;
$$;

create or replace function public.guardar_horario_semana(p_dias jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vigente public.cupo_configuracion%rowtype;
  v_hoy date := public.fecha_negocio();
  v_id uuid;
  v_dia jsonb;
  v_num int;
  v_ap time;
  v_ci time;
  v_vistos int[] := array[]::int[];
  v_afectadas int;
begin
  if not public.tiene_permiso('configuracion_negocio') then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», puede cambiar el horario del negocio.';
  end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) <> 7 then
    raise exception 'Manda el horario de los siete días.';
  end if;

  select * into v_vigente
  from public.cupo_configuracion
  where vigencia_desde <= v_hoy and deleted_at is null
  order by vigencia_desde desc, created_at desc
  limit 1;
  if not found then
    raise exception 'Primero guarda la configuración del negocio (cupo) y luego el horario.';
  end if;

  -- Validar todo antes de escribir nada.
  for v_dia in select * from jsonb_array_elements(p_dias) loop
    v_num := (v_dia->>'dia_semana')::int;
    if v_num is null or v_num < 0 or v_num > 6 or v_num = any(v_vistos) then
      raise exception 'El horario trae un día de la semana inválido o repetido.';
    end if;
    v_vistos := v_vistos || v_num;
    v_ap := nullif(v_dia->>'hora_apertura', '')::time;
    v_ci := nullif(v_dia->>'hora_cierre', '')::time;
    if (v_ap is null) <> (v_ci is null) then
      raise exception 'Cada día abierto necesita hora de apertura y de cierre.';
    end if;
    if v_ap is not null and v_ci <= v_ap then
      raise exception 'La hora de cierre tiene que ser después de la de apertura.';
    end if;
  end loop;

  if v_vigente.vigencia_desde = v_hoy then
    v_id := v_vigente.id;
    update public.horario_semana set deleted_at = now()
    where cupo_configuracion_id = v_id and deleted_at is null;
  else
    insert into public.cupo_configuracion
      (vigencia_desde, cupo_diurno, cupo_nocturno, hora_cierre,
       base_direccion, base_lat, base_lng, telefono_recepcion, created_by)
    values
      (v_hoy, v_vigente.cupo_diurno, v_vigente.cupo_nocturno, v_vigente.hora_cierre,
       v_vigente.base_direccion, v_vigente.base_lat, v_vigente.base_lng,
       v_vigente.telefono_recepcion, auth.uid())
    returning id into v_id;
  end if;

  insert into public.horario_semana (cupo_configuracion_id, dia_semana, hora_apertura, hora_cierre, created_by)
  select v_id,
    (d->>'dia_semana')::int,
    nullif(d->>'hora_apertura', '')::time,
    nullif(d->>'hora_cierre', '')::time,
    auth.uid()
  from jsonb_array_elements(p_dias) d;

  -- Reservas activas de hoy en adelante que caen en un día que ya no abre:
  -- guardería ese día, o llegada o salida de hotel ese día.
  select count(*) into v_afectadas
  from public.estancias e
  join public.servicios s on s.id = e.servicio_id
  where e.deleted_at is null
    and e.estado in ('reservada', 'confirmada', 'en_curso')
    and (
      (s.categoria = 'guarderia' and e.fecha_entrada >= v_hoy and not public.negocio_abre(e.fecha_entrada))
      or (s.categoria = 'hotel' and e.fecha_salida >= v_hoy and not public.negocio_abre(e.fecha_salida))
      or (s.categoria = 'hotel' and e.estado <> 'en_curso' and e.fecha_entrada >= v_hoy and not public.negocio_abre(e.fecha_entrada))
    );

  return jsonb_build_object('configuracion_id', v_id, 'reservas_en_dias_cerrados', v_afectadas);
end;
$$;

-- ── 6. Plantillas de contrato ─────────────────────────────────────

create or replace function public.crear_tipo_contrato(
  p_nombre text,
  p_categorias_servicio text[],
  p_titulo text,
  p_cuerpo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo_id uuid;
begin
  if not public.tiene_permiso('plantillas_contrato') then
    raise exception 'Solo un admin, o quien tenga el permiso «Plantillas de contrato», puede crear un tipo de contrato.';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'Ponle un nombre al contrato (por ejemplo: Contrato de hotel).';
  end if;
  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'El título no puede estar vacío.';
  end if;
  if p_cuerpo is null or btrim(p_cuerpo) = '' then
    raise exception 'El cuerpo del contrato no puede estar vacío.';
  end if;

  if exists (
    select 1 from public.tipos_contrato
    where lower(nombre) = lower(btrim(p_nombre)) and deleted_at is null
  ) then
    raise exception 'Ya hay un contrato que se llama "%". Ponle otro nombre.', btrim(p_nombre);
  end if;

  insert into public.tipos_contrato (nombre, categorias_servicio, orden, created_by)
  values (
    btrim(p_nombre),
    coalesce(p_categorias_servicio, '{}'),
    coalesce((select max(orden) + 1 from public.tipos_contrato), 0),
    auth.uid()
  )
  returning id into v_tipo_id;

  insert into public.plantillas_contrato (tipo_contrato_id, version, titulo, cuerpo, activa, created_by)
  values (v_tipo_id, 1, btrim(p_titulo), p_cuerpo, true, auth.uid());

  return v_tipo_id;
end;
$$;

create or replace function public.actualizar_tipo_contrato(
  p_tipo_id uuid,
  p_nombre text,
  p_categorias_servicio text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('plantillas_contrato') then
    raise exception 'Solo un admin, o quien tenga el permiso «Plantillas de contrato», puede editar un tipo de contrato.';
  end if;

  if p_nombre is null or btrim(p_nombre) = '' then
    raise exception 'Ponle un nombre al contrato (por ejemplo: Contrato de hotel).';
  end if;

  if exists (
    select 1 from public.tipos_contrato
    where lower(nombre) = lower(btrim(p_nombre))
      and deleted_at is null
      and id <> p_tipo_id
  ) then
    raise exception 'Ya hay un contrato que se llama "%". Ponle otro nombre.', btrim(p_nombre);
  end if;

  update public.tipos_contrato
  set nombre = btrim(p_nombre),
      categorias_servicio = coalesce(p_categorias_servicio, '{}')
  where id = p_tipo_id and deleted_at is null;

  if not found then
    raise exception 'Tipo de contrato no encontrado.';
  end if;
end;
$$;

create or replace function public.archivar_tipo_contrato(p_tipo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('plantillas_contrato') then
    raise exception 'Solo un admin, o quien tenga el permiso «Plantillas de contrato», puede archivar un tipo de contrato.';
  end if;

  update public.tipos_contrato
  set deleted_at = now()
  where id = p_tipo_id and deleted_at is null;

  if not found then
    raise exception 'Tipo de contrato no encontrado o ya archivado.';
  end if;
end;
$$;

create or replace function public.reactivar_tipo_contrato(p_tipo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text;
begin
  if not public.tiene_permiso('plantillas_contrato') then
    raise exception 'Solo un admin, o quien tenga el permiso «Plantillas de contrato», puede reactivar un tipo de contrato.';
  end if;

  select nombre into v_nombre from public.tipos_contrato
  where id = p_tipo_id and deleted_at is not null;
  if v_nombre is null then
    raise exception 'Tipo de contrato no encontrado o ya activo.';
  end if;

  if exists (
    select 1 from public.tipos_contrato
    where lower(nombre) = lower(v_nombre) and deleted_at is null
  ) then
    raise exception 'Ya hay un contrato activo con ese nombre. Renómbralo antes de reactivar este.';
  end if;

  update public.tipos_contrato set deleted_at = null where id = p_tipo_id;
end;
$$;

create or replace function public.publicar_plantilla(
  p_tipo_contrato_id uuid,
  p_titulo text,
  p_cuerpo text,
  p_requiere_refirma boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_version int;
  v_id uuid;
begin
  if not public.tiene_permiso('plantillas_contrato') then
    raise exception 'Solo un admin, o quien tenga el permiso «Plantillas de contrato», puede editar la plantilla del contrato.';
  end if;

  if not exists (
    select 1 from public.tipos_contrato where id = p_tipo_contrato_id and deleted_at is null
  ) then
    raise exception 'Tipo de contrato no encontrado o archivado.';
  end if;

  if p_titulo is null or btrim(p_titulo) = '' then
    raise exception 'El título no puede estar vacío.';
  end if;
  if p_cuerpo is null or btrim(p_cuerpo) = '' then
    raise exception 'El cuerpo del contrato no puede estar vacío.';
  end if;

  -- Solo se desactiva la versión activa DE ESTE TIPO: publicar una
  -- versión nueva del contrato de hotel no puede dejar sin plantilla
  -- activa al de guardería.
  update public.plantillas_contrato
  set activa = false
  where activa = true and tipo_contrato_id = p_tipo_contrato_id;

  select coalesce(max(version), 0) + 1 into v_version
  from public.plantillas_contrato
  where tipo_contrato_id = p_tipo_contrato_id;

  insert into public.plantillas_contrato (tipo_contrato_id, version, titulo, cuerpo, activa, requiere_refirma, created_by)
  values (p_tipo_contrato_id, v_version, btrim(p_titulo), p_cuerpo, true, coalesce(p_requiere_refirma, false), auth.uid())
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.marcar_requiere_refirma(p_plantilla_id uuid, p_valor boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('plantillas_contrato') then
    raise exception 'Solo un admin, o quien tenga el permiso «Plantillas de contrato», puede marcar una plantilla para refirma.';
  end if;

  update public.plantillas_contrato
  set requiere_refirma = coalesce(p_valor, false)
  where id = p_plantilla_id;

  if not found then
    raise exception 'Plantilla no encontrada.';
  end if;
end;
$$;

create or replace function public.definir_momento_tipo_contrato(p_tipo_id uuid, p_se_genera_al text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categorias text[];
begin
  if not public.tiene_permiso('plantillas_contrato') then
    raise exception 'Solo un admin, o quien tenga el permiso «Plantillas de contrato», puede cambiar cuándo se genera un contrato.';
  end if;
  if p_se_genera_al is null or p_se_genera_al not in ('alta', 'compra_paquete') then
    raise exception 'Elige cuándo se genera: al darse de alta o al comprar un paquete de guardería.';
  end if;
  select categorias_servicio into v_categorias
  from public.tipos_contrato where id = p_tipo_id and deleted_at is null;
  if not found then
    raise exception 'Tipo de contrato no encontrado o archivado.';
  end if;
  if p_se_genera_al = 'compra_paquete' and v_categorias is distinct from array['guarderia']::text[] then
    raise exception 'Solo un contrato que aplica únicamente a guardería se puede generar al comprar un paquete.';
  end if;
  update public.tipos_contrato set se_genera_al = p_se_genera_al where id = p_tipo_id;
end;
$$;

-- ── 7. Descuentos arriba del tope ─────────────────────────────────

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

  if p_tipo is null or p_tipo not in ('porcentaje', 'monto_fijo') then
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
    if not public.tiene_permiso('descuentos_sin_tope') then
      raise exception 'Este descuento ($%) pasa el tope de recepción ($%). Solo un admin, o quien tenga el permiso «Descuentos sin tope», puede aplicarlo.',
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

-- ── 8. Excepciones al reservar (sanitaria y evaluación) ───────────

create or replace function public.validar_estancia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_depende_tamano boolean;
  v_categoria text;
  v_unidad text;
  v_cantidad int;
  v_precio numeric;
  v_estado_precio text;
  v_tiene_bloqueo boolean;
  v_perro record;
  v_alerta text;
  v_fecha date;
  v_cupo_diurno int;
  v_cupo_nocturno int;
  v_cupo_estado text;
  v_ocupado_diurno int;
  v_ocupado_nocturno int;
  v_recotizar boolean;
  v_revalidar boolean;
  v_activa boolean;
  v_entra_en_curso boolean;
  v_entra_finalizada boolean;
  v_horas_reales int;
begin
  if TG_OP = 'INSERT' then
    if not public.estado_inicial_reserva_valido(new.estado) then
      raise exception 'Una reserva nueva no puede empezar en estado "%"', new.estado;
    end if;
  elsif new.estado is distinct from old.estado then
    if not public.transicion_estado_reserva_valida(old.estado, new.estado) then
      raise exception 'No se puede pasar de "%" a "%"', old.estado, new.estado;
    end if;
  end if;

  select depende_tamano, categoria, unidad
    into v_depende_tamano, v_categoria, v_unidad
  from public.servicios where id = new.servicio_id;

  if v_categoria is null or v_categoria not in ('guarderia', 'hotel') then
    raise exception 'Este servicio no es de guardería/hotel; no se puede usar en una estancia.';
  end if;

  v_entra_en_curso := new.estado = 'en_curso' and (TG_OP = 'INSERT' or old.estado <> 'en_curso');
  v_entra_finalizada := new.estado = 'finalizada' and (TG_OP = 'INSERT' or old.estado <> 'finalizada');

  -- Horas: obligatorias para un servicio por hora, prohibidas para el
  -- resto. Y al check-out, las reales mandan si fueron más que las
  -- estimadas — hacia abajo no, lo reservado se respeta.
  if v_unidad = 'hora' then
    if new.horas is null then
      raise exception 'Indica cuántas horas se queda el perro: este servicio se cobra por hora.';
    end if;
    if v_entra_finalizada and new.hora_entrada_real is not null then
      if new.hora_salida_real is null then
        new.hora_salida_real := now();
      end if;
      v_horas_reales := greatest(1, ceil(extract(epoch from (new.hora_salida_real - new.hora_entrada_real)) / 3600)::int);
      if v_horas_reales > new.horas then
        new.horas := v_horas_reales;
      end if;
    end if;
  else
    new.horas := null;
  end if;

  v_recotizar := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.fecha_entrada is distinct from old.fecha_entrada
    or new.fecha_salida is distinct from old.fecha_salida
    or new.horas is distinct from old.horas;

  v_revalidar := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.fecha_entrada is distinct from old.fecha_entrada
    or new.fecha_salida is distinct from old.fecha_salida;

  v_activa := new.estado not in ('cancelada', 'no_llego');

  if v_recotizar then
    if v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene talla registrada y el precio depende de ella. Captúrala en /perros/%', new.perro_id;
      end if;
    else
      new.tamano_id := null;
    end if;

    v_cantidad := case
      when v_unidad = 'hora' then new.horas
      else new.fecha_salida - new.fecha_entrada
    end;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(new.servicio_id, new.tamano_id, null, v_cantidad, new.fecha_entrada);

    if v_estado_precio = 'sin_tarifa' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, null, v_cantidad, new.fecha_entrada);
    elsif v_estado_precio = 'no_aplica' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, null, v_cantidad, new.fecha_entrada, null, 'no_aplica');
    end if;

    new.precio_unitario := v_precio;
  end if;

  if v_revalidar and v_activa then
    select sexo, en_celo, gestante, evaluacion_comportamiento_fecha
      into v_perro
    from public.perros where id = new.perro_id;

    -- Celo y gestación: bloqueo sin excepción. No es un trámite que
    -- falte, es una condición del perro mientras dure.
    if v_perro.en_celo then
      raise exception 'Esta perra está marcada en celo: no puede quedarse en guardería ni hotel mientras dure. Quita la marca en su expediente cuando pase.';
    end if;
    if v_perro.gestante then
      raise exception 'Esta perra está marcada como gestante: no puede quedarse en guardería ni hotel. Quita la marca en su expediente cuando ya no aplique.';
    end if;

    -- Agresividad: cualquier alerta activa del catálogo marcada como
    -- bloqueante. Tampoco tiene excepción.
    select ca.etiqueta into v_alerta
    from public.perro_alertas pa
    join public.catalogo_alertas ca on ca.id = pa.alerta_id
    where pa.perro_id = new.perro_id
      and pa.activa
      and ca.bloquea_estancia
      and ca.deleted_at is null
    limit 1;

    if v_alerta is not null then
      raise exception 'Este perro tiene activa la alerta "%": no se recibe en guardería ni hotel. Si ya no aplica, desactívala en su expediente.', v_alerta;
    end if;

    -- Evaluación de comportamiento: aviso con excepción de admin, con el
    -- mismo contrato que la sanitaria.
    if new.bloqueo_comportamiento_superado and not public.tiene_permiso('excepciones_reserva') then
      raise exception 'Solo un admin, o quien tenga el permiso «Excepciones al reservar», puede autorizar reservar sin evaluación de comportamiento.';
    end if;

    if new.bloqueo_comportamiento_superado then
      new.autorizado_por := auth.uid();
    elsif v_perro.evaluacion_comportamiento_fecha is null then
      raise exception 'Este perro no tiene evaluación previa de comportamiento. Márcala en su expediente, o un admin puede autorizar una excepción con motivo.';
    end if;

    -- Sanitario, tal cual estaba.
    if new.bloqueo_sanitario_superado and not public.tiene_permiso('excepciones_reserva') then
      raise exception 'Solo un admin, o quien tenga el permiso «Excepciones al reservar», puede autorizar una excepción al bloqueo sanitario.';
    end if;

    if new.bloqueo_sanitario_superado then
      new.autorizado_por := auth.uid();
    else
      select exists (
        select 1
        from public.perro_requisitos_sanitarios_estado pre
        where pre.perro_id = new.perro_id
          and pre.estado in ('vencida', 'sin_registro')
      ) into v_tiene_bloqueo;

      if v_tiene_bloqueo then
        raise exception 'Este perro tiene un requisito sanitario obligatorio vencido o sin registro. Un admin puede autorizar una excepción con motivo.';
      end if;
    end if;
  end if;

  if v_revalidar and v_activa then
    perform pg_advisory_xact_lock(hashtext('estancias_cupo'));

    for v_fecha in select generate_series(new.fecha_entrada, new.fecha_salida - 1, interval '1 day')::date loop
      select cupo_diurno, cupo_nocturno, estado into v_cupo_diurno, v_cupo_nocturno, v_cupo_estado
      from public.resolver_cupo_configuracion(v_fecha);

      if v_cupo_estado = 'sin_configurar' then
        raise exception 'No hay cupo configurado para el %. Captúralo antes de reservar.', v_fecha;
      end if;

      select count(*) into v_ocupado_diurno
      from public.estancias e
      where e.deleted_at is null
        and e.estado not in ('cancelada', 'no_llego')
        and e.id is distinct from new.id
        and daterange(e.fecha_entrada, e.fecha_salida) @> v_fecha;

      if (v_ocupado_diurno + 1) > v_cupo_diurno then
        raise exception 'No hay cupo disponible (diurno) para el %.', v_fecha;
      end if;

      if v_categoria = 'hotel' then
        select count(*) into v_ocupado_nocturno
        from public.estancias e
        join public.servicios s on s.id = e.servicio_id
        where e.deleted_at is null
          and e.estado not in ('cancelada', 'no_llego')
          and e.id is distinct from new.id
          and s.categoria = 'hotel'
          and daterange(e.fecha_entrada, e.fecha_salida) @> v_fecha;

        if (v_ocupado_nocturno + 1) > v_cupo_nocturno then
          raise exception 'No hay cupo disponible (nocturno) para el %.', v_fecha;
        end if;
      end if;
    end loop;
  end if;

  -- Check-in: quién entrega es obligatorio, la hora se autocompleta.
  if v_entra_en_curso then
    if new.entregado_por_nombre is null or btrim(new.entregado_por_nombre) = '' then
      raise exception 'Registra quién entrega al perro antes de hacer el check-in.';
    end if;
    if new.hora_entrada_real is null then
      new.hora_entrada_real := now();
    end if;
  end if;

  -- Check-out: quién recoge y si es el dueño registrado son obligatorios
  -- — nunca opcional, es la validación más importante de esta tabla.
  if v_entra_finalizada then
    if new.recogido_por_nombre is null or btrim(new.recogido_por_nombre) = '' then
      raise exception 'Registra quién recoge al perro antes de cerrar el check-out.';
    end if;
    if new.recogido_por_es_dueno is null then
      raise exception 'Indica si quien recoge es el dueño registrado o una persona autorizada distinta.';
    end if;
    if new.hora_salida_real is null then
      new.hora_salida_real := now();
    end if;
  end if;

  return new;
end;
$$;

-- ── 9. Políticas por permiso ──────────────────────────────────────────
-- tiene_permiso() incluye a admin, así que admin no pierde nada.

-- Costos: las compras (costo_total) y los proveedores. costo_promedio_base_insumo
-- es invoker y lee compras_insumos: con esta política funciona para quien
-- tiene el permiso y sigue dando null a quien no.
drop policy if exists compras_insumos_select_admin on public.compras_insumos;
create policy compras_insumos_select_costos on public.compras_insumos
  for select to authenticated
  using (public.tiene_permiso('inventario_costos'));

drop policy if exists proveedores_insert_admin on public.proveedores;
create policy proveedores_insert_costos on public.proveedores
  for insert to authenticated
  with check (public.tiene_permiso('inventario_costos'));
drop policy if exists proveedores_update_admin on public.proveedores;
create policy proveedores_update_costos on public.proveedores
  for update to authenticated
  using (public.tiene_permiso('inventario_costos'))
  with check (public.tiene_permiso('inventario_costos'));

-- Precios y tarifas.
drop policy if exists tarifas_insert_admin on public.tarifas;
create policy tarifas_insert_permiso on public.tarifas
  for insert to authenticated
  with check (public.tiene_permiso('tarifas'));
drop policy if exists tarifas_update_admin on public.tarifas;
create policy tarifas_update_permiso on public.tarifas
  for update to authenticated
  using (public.tiene_permiso('tarifas'))
  with check (public.tiene_permiso('tarifas'));

drop policy if exists tarifas_dia_semana_insert_admin on public.tarifas_dia_semana;
create policy tarifas_dia_semana_insert_permiso on public.tarifas_dia_semana
  for insert to authenticated
  with check (public.tiene_permiso('tarifas'));
drop policy if exists tarifas_dia_semana_update_admin on public.tarifas_dia_semana;
create policy tarifas_dia_semana_update_permiso on public.tarifas_dia_semana
  for update to authenticated
  using (public.tiene_permiso('tarifas'))
  with check (public.tiene_permiso('tarifas'));

-- Configuración del negocio: cupo, horario y datos de la sucursal.
drop policy if exists cupo_configuracion_insert_admin on public.cupo_configuracion;
create policy cupo_configuracion_insert_permiso on public.cupo_configuracion
  for insert to authenticated
  with check (public.tiene_permiso('configuracion_negocio'));
drop policy if exists cupo_configuracion_update_admin on public.cupo_configuracion;
create policy cupo_configuracion_update_permiso on public.cupo_configuracion
  for update to authenticated
  using (public.tiene_permiso('configuracion_negocio'))
  with check (public.tiene_permiso('configuracion_negocio'));

drop policy if exists horario_semana_insert_admin on public.horario_semana;
create policy horario_semana_insert_permiso on public.horario_semana
  for insert to authenticated
  with check (public.tiene_permiso('configuracion_negocio'));
drop policy if exists horario_semana_update_admin on public.horario_semana;
create policy horario_semana_update_permiso on public.horario_semana
  for update to authenticated
  using (public.tiene_permiso('configuracion_negocio'))
  with check (public.tiene_permiso('configuracion_negocio'));

drop policy if exists sucursales_update_admin on public.sucursales;
create policy sucursales_update_permiso on public.sucursales
  for update to authenticated
  using (public.tiene_permiso('configuracion_negocio'))
  with check (public.tiene_permiso('configuracion_negocio'));

-- Los reportes ahora son security definer: sin anon por nombre.
revoke execute on function public.reporte_financiero_periodo(date, date) from public, anon;
revoke execute on function public.reporte_costos_periodo(date, date) from public, anon;
revoke execute on function public.reporte_margen_por_servicio_periodo(date, date) from public, anon;
revoke execute on function public.reporte_operativo_periodo(date, date) from public, anon;
revoke execute on function public.reporte_estado_operativo_actual() from public, anon;

