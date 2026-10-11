-- Servicios extra cobrables del módulo Hotel y guardería (carril B).
--
-- Qué ya existía y se REUTILIZA (nada de esto se duplica):
--  · servicios (categoria 'cargo', monto_libre) + cargos_aplicados: la línea de
--    cobro de siempre. Cada servicio extra es un servicio 'cargo' de monto libre
--    (clave 'extra_…') y cada vez que se hace entra a la cuenta como un cargo
--    de la estancia: Caja, cobro junto, descuentos, cortes y facturación no
--    cambian.
--  · cfdi_servicio_fiscal: la clase fiscal (IVA) y la clave SAT del servicio.
--  · El motor de bonos: un paquete de N sesiones es un servicio 'bono' cuyo
--    servicio_incluido_id es el extra; se vende con comprar_bono (ficha del
--    cliente) y consumir_bono lo aplica al cargo de la estancia.
--  · permisos_catalogo y tiene_permiso().
--
-- Qué es NUEVO:
--  · servicios_extra (catálogo por negocio), servicios_extra_zonas (precio por
--    zona o distancia de un traslado) y servicios_extra_aplicados (lo agregado a
--    una estancia: programado → hecho; el traslado pasa por «en camino»).
--  · Marcar un extra como hecho crea el cargo (precio de la foto guardada al
--    agregarlo, nunca el de la pantalla) y, si el perro tiene un paquete
--    vigente de ese extra, cubre la sesión con el paquete en vez de cobrarla.
--  · Cancelar un cargo extra (desde aquí o desde el check-out) cancela la fila
--    y devuelve la sesión del paquete.
--  · Permisos «Agregar servicios extra» (recepción ENCENDIDO por omisión) y
--    «Editar catálogo de servicios extra» (admin; delegable por persona).
--  · reporte_servicios_extra_periodo: ingresos por servicio y por empleado.
--
-- NO se altera ninguna tabla de clientes, mascotas, inventario ni citas, ni se
-- toca el esquema de Veterinaria.
--
-- REVERSA: drop de las funciones extra(s)_*, del trigger
-- cargos_aplicados_extras_cancelado, de las tres tablas servicios_extra* y de las
-- filas 'agregar_servicios_extra' / 'editar_catalogo_extras' de permisos_catalogo.
-- Los cargos ya cobrados quedan como cargos normales de sus cuentas.

-- ── 0. Permisos ─────────────────────────────────────────────────────────────
insert into public.permisos_catalogo (clave, etiqueta, modulos, orden, updated_at) values
  ('agregar_servicios_extra', 'Agregar servicios extra', '{guarderia,hotel}', 62, now()),
  ('editar_catalogo_extras', 'Editar catálogo de servicios extra', '{guarderia,hotel}', 63, now())
on conflict (clave) do nothing;

-- «Agregar» viene ENCENDIDO para recepción: se siembra a las cuentas de hoy y, por
-- trigger, a las que lleguen. Si el admin se lo quita a alguien, esa fila queda
-- revocada y NO se vuelve a sembrar.
insert into public.permisos_staff (negocio_id, profile_id, permiso, created_by)
select m.negocio_id, m.profile_id, 'agregar_servicios_extra', null
from public.membresias m
where m.rol = 'recepcion' and m.deleted_at is null
  and not exists (
    select 1 from public.permisos_staff ps
    where ps.profile_id = m.profile_id and ps.negocio_id = m.negocio_id and ps.permiso = 'agregar_servicios_extra'
  );

create or replace function public.permiso_extras_por_omision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol = 'recepcion' and new.deleted_at is null and not exists (
    select 1 from public.permisos_staff ps
    where ps.profile_id = new.profile_id and ps.negocio_id = new.negocio_id and ps.permiso = 'agregar_servicios_extra'
  ) then
    insert into public.permisos_staff (negocio_id, profile_id, permiso, created_by)
    values (new.negocio_id, new.profile_id, 'agregar_servicios_extra', null);
  end if;
  return new;
end;
$$;
revoke execute on function public.permiso_extras_por_omision() from public, anon, authenticated;
create trigger membresias_permiso_extras
  after insert or update of rol on public.membresias
  for each row execute function public.permiso_extras_por_omision();

-- ── 1. Tablas ───────────────────────────────────────────────────────────────
create table public.servicios_extra (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  -- La línea de cobro: un servicio 'cargo' de monto libre creado con el extra.
  servicio_id uuid not null references public.servicios(id),
  nombre text not null check (char_length(btrim(nombre)) between 2 and 80),
  descripcion text check (descripcion is null or char_length(descripcion) <= 300),
  tipo text not null default 'general' check (tipo in ('general', 'traslado')),
  unidad text not null default 'vez' check (unidad in ('vez', 'dia', 'sesion', 'viaje')),
  -- Precio por unidad. En un traslado con zonas manda el precio de la zona.
  precio numeric(10, 2) not null default 0 check (precio >= 0),
  -- Clase fiscal (de cfdi_clases: ahí vive la tasa de IVA) y clave SAT propia (opcional).
  clase_fiscal text not null default 'otro_servicio'
    check (clase_fiscal in ('estetica', 'hospedaje', 'guarderia', 'otro_servicio')),
  clave_prod_serv text check (clave_prod_serv is null or clave_prod_serv ~ '^[0-9]{8}$'),
  activo boolean not null default true,
  orden integer not null default 0,
  -- Paquete de N sesiones (servicio 'bono' del motor de bonos), si el extra lo tiene.
  paquete_servicio_id uuid references public.servicios(id)
);
create index servicios_extra_negocio_idx on public.servicios_extra (negocio_id);
create unique index servicios_extra_servicio_uq on public.servicios_extra (negocio_id, servicio_id);
create unique index servicios_extra_nombre_uq on public.servicios_extra (negocio_id, lower(btrim(nombre))) where deleted_at is null;

create table public.servicios_extra_zonas (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  extra_id uuid not null references public.servicios_extra(id),
  nombre text not null check (char_length(btrim(nombre)) between 1 and 80),
  -- Referencia de distancia (hasta cuántos km cubre la zona); el precio es el que manda.
  km_hasta numeric(6, 1) check (km_hasta is null or km_hasta > 0),
  precio numeric(10, 2) not null check (precio > 0),
  activo boolean not null default true,
  orden integer not null default 0
);
create index servicios_extra_zonas_negocio_idx on public.servicios_extra_zonas (negocio_id);
create index servicios_extra_zonas_extra_idx on public.servicios_extra_zonas (extra_id);
create unique index servicios_extra_zonas_nombre_uq on public.servicios_extra_zonas (extra_id, lower(btrim(nombre))) where deleted_at is null;

create table public.servicios_extra_aplicados (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  -- created_by = quién lo registró.
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  extra_id uuid not null references public.servicios_extra(id),
  estancia_id uuid not null references public.estancias(id),
  perro_id uuid not null references public.perros(id),
  fecha date not null,
  hora time,
  cantidad integer not null default 1 check (cantidad between 1 and 99),
  zona_id uuid references public.servicios_extra_zonas(id),
  -- Foto del precio al agregarlo: cambiar el catálogo después no mueve lo ya agregado.
  precio_unitario numeric(10, 2) not null check (precio_unitario > 0),
  -- pendiente → (en_camino, solo traslados) → hecho; cancelado desde cualquiera.
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_camino', 'hecho', 'cancelado')),
  direccion text check (direccion is null or char_length(direccion) <= 300),
  sentido text check (sentido is null or sentido in ('recoger', 'entregar')),
  notas text check (notas is null or char_length(notas) <= 300),
  salio_at timestamptz,
  aviso_whatsapp_at timestamptz,
  hecho_at timestamptz,
  hecho_por uuid references auth.users(id) on delete set null,
  cargo_id uuid references public.cargos_aplicados(id),
  -- Paquete que cubrió la sesión (no se cobró).
  bono_cliente_id uuid references public.bonos_clientes(id),
  cancelado_at timestamptz,
  cancelado_por uuid references auth.users(id) on delete set null,
  motivo_cancelacion text,
  check (estado <> 'hecho' or (hecho_at is not null and cargo_id is not null)),
  check (estado <> 'cancelado' or motivo_cancelacion is not null)
);
create index servicios_extra_aplicados_negocio_idx on public.servicios_extra_aplicados (negocio_id);
create index servicios_extra_aplicados_dia_idx on public.servicios_extra_aplicados (negocio_id, fecha, estado);
create index servicios_extra_aplicados_estancia_idx on public.servicios_extra_aplicados (estancia_id);
create index servicios_extra_aplicados_cargo_idx on public.servicios_extra_aplicados (cargo_id);
create index servicios_extra_aplicados_extra_idx on public.servicios_extra_aplicados (extra_id);

do $$
declare
  t text;
begin
  foreach t in array array['servicios_extra', 'servicios_extra_zonas', 'servicios_extra_aplicados'] loop
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('create trigger exigir_modulo before insert or update on public.%I for each row execute function public.exigir_modulo_estancias()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$f$, t || '_negocio', t);
    execute format($f$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$f$, t || '_negocio_definer', t);
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_ins', t);
    execute format($f$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_upd', t);
    execute format($f$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_del', t);
    -- Se LEE con la sesión del personal; se ESCRIBE solo por las funciones de abajo.
    execute format('create policy %I on public.%I for select to authenticated using ((select public.is_staff()))', t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── 2. Permisos en la base ──────────────────────────────────────────────────
create or replace function public.extras_exigir(p_permiso text)
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not coalesce(public.tiene_permiso(p_permiso), false) then
    raise exception 'No tienes el permiso «%» para hacer esto.',
      case p_permiso when 'agregar_servicios_extra' then 'Agregar servicios extra' else 'Editar catálogo de servicios extra' end
      using errcode = '42501';
  end if;
end;
$$;

-- ── 3. Catálogo ─────────────────────────────────────────────────────────────
create or replace function public.extra_guardar(
  p_id uuid,
  p_nombre text,
  p_descripcion text,
  p_tipo text,
  p_unidad text,
  p_precio numeric,
  p_clase_fiscal text,
  p_clave_prod_serv text,
  p_activo boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_servicio uuid;
  v_unidad_servicio text;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_clave_sat text := nullif(btrim(coalesce(p_clave_prod_serv, '')), '');
  v_hay boolean;
begin
  perform public.extras_exigir('editar_catalogo_extras');
  if char_length(v_nombre) < 2 then
    raise exception 'Escribe el nombre del servicio extra.';
  end if;
  if p_tipo not in ('general', 'traslado') then
    raise exception 'El tipo debe ser general o traslado.';
  end if;
  if p_unidad not in ('vez', 'dia', 'sesion', 'viaje') then
    raise exception 'La unidad debe ser por vez, por día, por sesión o por viaje.';
  end if;
  if coalesce(p_precio, -1) < 0 then
    raise exception 'El precio no puede ser negativo.';
  end if;
  if p_tipo = 'general' and coalesce(p_precio, 0) <= 0 then
    raise exception 'Captura el precio de este servicio.';
  end if;
  if p_clase_fiscal not in ('estetica', 'hospedaje', 'guarderia', 'otro_servicio') then
    raise exception 'Elige la clase fiscal (de ella sale el IVA).';
  end if;
  if v_clave_sat is not null and v_clave_sat !~ '^[0-9]{8}$' then
    raise exception 'La clave del SAT son 8 números.';
  end if;
  v_unidad_servicio := case p_unidad when 'dia' then 'dia' when 'sesion' then 'sesion' else 'evento' end;

  if p_id is null then
    if exists (select 1 from public.servicios_extra e where e.negocio_id = public.negocio_actual()
               and lower(btrim(e.nombre)) = lower(v_nombre) and e.deleted_at is null) then
      raise exception 'Ya existe un servicio extra con ese nombre.';
    end if;
    insert into public.servicios (clave, nombre, categoria, unidad, monto_libre, orden)
    values ('extra_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_nombre, 'cargo', v_unidad_servicio, true, 800)
    returning id into v_servicio;
    insert into public.servicios_extra (servicio_id, nombre, descripcion, tipo, unidad, precio, clase_fiscal, clave_prod_serv, activo)
    values (v_servicio, v_nombre, nullif(btrim(coalesce(p_descripcion, '')), ''), p_tipo, p_unidad, coalesce(p_precio, 0),
            p_clase_fiscal, v_clave_sat, coalesce(p_activo, true))
    returning id into v_id;
  else
    select e.servicio_id into v_servicio from public.servicios_extra e
    where e.id = p_id and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
    v_hay := found;
    if not v_hay then
      raise exception 'Ese servicio extra no existe.';
    end if;
    if exists (select 1 from public.servicios_extra e where e.negocio_id = public.negocio_actual()
               and lower(btrim(e.nombre)) = lower(v_nombre) and e.deleted_at is null and e.id <> p_id) then
      raise exception 'Ya existe otro servicio extra con ese nombre.';
    end if;
    update public.servicios_extra
    set nombre = v_nombre, descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''), tipo = p_tipo, unidad = p_unidad,
        precio = coalesce(p_precio, 0), clase_fiscal = p_clase_fiscal, clave_prod_serv = v_clave_sat,
        activo = coalesce(p_activo, true)
    where id = p_id;
    update public.servicios set nombre = v_nombre, unidad = v_unidad_servicio where id = v_servicio;
    v_id := p_id;
  end if;

  -- Lo fiscal vive en la tabla de facturación (no se agrega nada a servicios).
  insert into public.cfdi_servicio_fiscal (servicio_id, clase, clave_prod_serv)
  values (v_servicio, p_clase_fiscal, v_clave_sat)
  on conflict (negocio_id, servicio_id) where deleted_at is null
  do update set clase = excluded.clase, clave_prod_serv = excluded.clave_prod_serv;

  return v_id;
end;
$$;

create or replace function public.extra_zona_guardar(
  p_id uuid,
  p_extra uuid,
  p_nombre text,
  p_km_hasta numeric,
  p_precio numeric,
  p_activo boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_tipo text;
  v_hay boolean;
begin
  perform public.extras_exigir('editar_catalogo_extras');
  select e.tipo into v_tipo from public.servicios_extra e
  where e.id = p_extra and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  v_hay := found;
  if not v_hay then
    raise exception 'Ese servicio extra no existe.';
  end if;
  if v_tipo <> 'traslado' then
    raise exception 'Solo un traslado tiene zonas.';
  end if;
  if v_nombre = '' then
    raise exception 'Escribe el nombre de la zona.';
  end if;
  if coalesce(p_precio, 0) <= 0 then
    raise exception 'Captura el precio de la zona.';
  end if;
  if p_id is null then
    insert into public.servicios_extra_zonas (extra_id, nombre, km_hasta, precio, activo)
    values (p_extra, v_nombre, p_km_hasta, p_precio, coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.servicios_extra_zonas
    set nombre = v_nombre, km_hasta = p_km_hasta, precio = p_precio, activo = coalesce(p_activo, true)
    where id = p_id and extra_id = p_extra and negocio_id = public.negocio_actual() and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Esa zona no existe.';
    end if;
  end if;
  return v_id;
end;
$$;

-- Paquete de N sesiones: un servicio 'bono' del motor de bonos que da acceso al extra.
-- p_sesiones null = quitar el paquete (los ya vendidos siguen valiendo).
create or replace function public.extra_paquete_guardar(
  p_extra uuid,
  p_sesiones integer,
  p_precio numeric,
  p_vigencia_dias integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.servicios_extra%rowtype;
  v_hay boolean;
  v_paquete uuid;
  v_nombre text;
  v_hoy date := public.fecha_negocio();
  v_tarifa uuid;
begin
  perform public.extras_exigir('editar_catalogo_extras');
  select * into v_e from public.servicios_extra e
  where e.id = p_extra and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  v_hay := found;
  if not v_hay then
    raise exception 'Ese servicio extra no existe.';
  end if;

  if p_sesiones is null then
    if v_e.paquete_servicio_id is not null then
      update public.servicios set deleted_at = now() where id = v_e.paquete_servicio_id;
      update public.servicios_extra set paquete_servicio_id = null where id = p_extra;
    end if;
    return null;
  end if;

  if p_sesiones < 2 or p_sesiones > 200 then
    raise exception 'Un paquete lleva entre 2 y 200 sesiones.';
  end if;
  if coalesce(p_precio, 0) <= 0 then
    raise exception 'Captura el precio del paquete.';
  end if;
  if p_vigencia_dias is not null and (p_vigencia_dias < 1 or p_vigencia_dias > 1095) then
    raise exception 'La vigencia va de 1 a 1095 días (o sin vencimiento).';
  end if;
  if v_e.tipo = 'traslado' then
    raise exception 'Un traslado tiene precio por zona: no se vende como paquete.';
  end if;

  v_nombre := 'Paquete de ' || p_sesiones || ' · ' || v_e.nombre;
  v_paquete := v_e.paquete_servicio_id;
  if v_paquete is null then
    insert into public.servicios (clave, nombre, categoria, unidad, servicio_incluido_id, cantidad_incluida, vigencia_dias, orden)
    values ('extrapaq_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10), v_nombre, 'bono', 'sesion',
            v_e.servicio_id, p_sesiones, p_vigencia_dias, 801)
    returning id into v_paquete;
    update public.servicios_extra set paquete_servicio_id = v_paquete where id = p_extra;
  else
    update public.servicios
    set nombre = v_nombre, cantidad_incluida = p_sesiones, vigencia_dias = p_vigencia_dias, deleted_at = null
    where id = v_paquete;
  end if;

  -- El precio vive en la matriz de tarifas como cualquier paquete (vigente desde hoy).
  select t.id into v_tarifa from public.tarifas t
  where t.servicio_id = v_paquete and t.vigencia_desde = v_hoy and t.deleted_at is null
    and t.tamano_id is null and t.pelaje_id is null and t.cantidad_desde = 1 and t.grupo_raza_id is null
  limit 1;
  if v_tarifa is not null then
    update public.tarifas set precio = p_precio, no_aplica = false where id = v_tarifa;
  else
    insert into public.tarifas (servicio_id, vigencia_desde, precio) values (v_paquete, v_hoy, p_precio);
  end if;
  return v_paquete;
end;
$$;

-- ── 4. Agregar, programar y marcar ──────────────────────────────────────────
-- Crea la fila (sin cargo). Interna: la llaman extra_agregar y extra_programar.
create or replace function public.extras_crear_interno(
  p_estancia uuid,
  p_extra uuid,
  p_fecha date,
  p_hora time,
  p_cantidad integer,
  p_zona uuid,
  p_direccion text,
  p_sentido text,
  p_notas text,
  p_permitir_finalizada boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e public.servicios_extra%rowtype;
  v_est record;
  v_zona public.servicios_extra_zonas%rowtype;
  v_hay boolean;
  v_precio numeric;
  v_dir text := nullif(btrim(coalesce(p_direccion, '')), '');
  v_id uuid;
begin
  select * into v_e from public.servicios_extra e
  where e.id = p_extra and e.negocio_id = public.negocio_actual() and e.deleted_at is null;
  v_hay := found;
  if not v_hay then
    raise exception 'Ese servicio extra no existe.';
  end if;
  if not v_e.activo then
    raise exception 'Ese servicio extra está apagado en el catálogo.';
  end if;
  if coalesce(p_cantidad, 0) < 1 or p_cantidad > 99 then
    raise exception 'La cantidad debe ser de 1 a 99.';
  end if;

  select e.id, e.estado, e.perro_id, e.fecha_entrada, e.fecha_salida, p.cliente_id
    into v_est
  from public.estancias e join public.perros p on p.id = e.perro_id
  where e.id = p_estancia and e.deleted_at is null;
  v_hay := found;
  if not v_hay then
    raise exception 'Esa estancia no existe.';
  end if;
  if v_est.estado in ('cancelada', 'no_llego') then
    raise exception 'No se pueden agregar servicios extra a una estancia cancelada o que no llegó.';
  end if;
  if v_est.estado = 'finalizada' and not p_permitir_finalizada then
    raise exception 'Esa estancia ya terminó: solo se puede registrar lo que ya se hizo.';
  end if;
  if p_fecha is null or p_fecha < v_est.fecha_entrada or p_fecha > greatest(v_est.fecha_salida, v_est.fecha_entrada) then
    raise exception 'La fecha tiene que caer dentro de la estancia (del % al %).',
      to_char(v_est.fecha_entrada, 'DD/MM/YYYY'), to_char(greatest(v_est.fecha_salida, v_est.fecha_entrada), 'DD/MM/YYYY');
  end if;

  v_precio := v_e.precio;
  if v_e.tipo = 'traslado' then
    if p_zona is not null then
      select * into v_zona from public.servicios_extra_zonas z
      where z.id = p_zona and z.extra_id = p_extra and z.negocio_id = public.negocio_actual() and z.deleted_at is null and z.activo;
      v_hay := found;
      if not v_hay then
        raise exception 'Esa zona no existe o está apagada.';
      end if;
      v_precio := v_zona.precio;
    elsif exists (select 1 from public.servicios_extra_zonas z where z.extra_id = p_extra and z.deleted_at is null and z.activo) then
      raise exception 'Elige la zona del traslado: de ella sale el precio.';
    end if;
    if p_sentido is null or p_sentido not in ('recoger', 'entregar') then
      raise exception 'Indica si es para recoger o para entregar al perro.';
    end if;
    if v_dir is null then
      select nullif(btrim(c.direccion), '') into v_dir from public.clientes c where c.id = v_est.cliente_id;
    end if;
    if v_dir is null then
      raise exception 'Falta la dirección del traslado: captúrala aquí o en la ficha del cliente.';
    end if;
  else
    p_zona := null;
    p_sentido := null;
    v_dir := null;
  end if;
  if coalesce(v_precio, 0) <= 0 then
    raise exception 'Este servicio no tiene precio: captúralo en el catálogo de servicios extra.';
  end if;

  insert into public.servicios_extra_aplicados
    (extra_id, estancia_id, perro_id, fecha, hora, cantidad, zona_id, precio_unitario, direccion, sentido, notas)
  values
    (p_extra, p_estancia, v_est.perro_id, p_fecha, p_hora, p_cantidad, p_zona, v_precio, v_dir, p_sentido,
     nullif(btrim(coalesce(p_notas, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Hace el cargo de una fila ya creada: foto del precio, paquete si hay. Interna.
create or replace function public.extras_cerrar_interno(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.servicios_extra_aplicados%rowtype;
  v_e public.servicios_extra%rowtype;
  v_zona text;
  v_cargo uuid;
  v_bono uuid;
  v_desc text;
begin
  select * into a from public.servicios_extra_aplicados x
  where x.id = p_id and x.negocio_id = public.negocio_actual() and x.deleted_at is null for update;
  if not found then
    raise exception 'Ese servicio extra no existe.';
  end if;
  if a.estado = 'hecho' then
    return jsonb_build_object('cargo_id', a.cargo_id, 'cubierto', a.bono_cliente_id is not null, 'ya', true);
  end if;
  if a.estado = 'cancelado' then
    raise exception 'Ese servicio extra está cancelado.';
  end if;
  select * into v_e from public.servicios_extra where id = a.extra_id;
  select z.nombre into v_zona from public.servicios_extra_zonas z where z.id = a.zona_id;

  v_desc := v_e.nombre || coalesce(' — ' || v_zona, '') || ' · ' || to_char(a.fecha, 'DD/MM')
            || coalesce(' ' || to_char(a.hora, 'HH24:MI'), '');

  insert into public.cargos_aplicados (estancia_id, servicio_id, cantidad, precio, descripcion, notas)
  values (a.estancia_id, v_e.servicio_id, a.cantidad, a.precio_unitario, v_desc, a.notas)
  returning id into v_cargo;

  -- Paquete vigente de ESTE perro para ESTE extra (el que vence primero).
  select bc.id into v_bono
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.perro_id = a.perro_id and bc.deleted_at is null
    and s.servicio_incluido_id = v_e.servicio_id
    and bc.cantidad_disponible >= a.cantidad
    and (bc.fecha_vencimiento is null or bc.fecha_vencimiento >= public.fecha_negocio())
  order by bc.fecha_vencimiento nulls last, bc.fecha_compra
  limit 1;
  if v_bono is not null then
    begin
      perform public.consumir_bono(v_bono, 'cargo', v_cargo, a.cantidad);
    exception when others then
      -- Si el paquete no puede cubrirla, se cobra normal.
      v_bono := null;
    end;
  end if;

  update public.servicios_extra_aplicados
  set estado = 'hecho', hecho_at = now(), hecho_por = auth.uid(), cargo_id = v_cargo, bono_cliente_id = v_bono
  where id = p_id;
  return jsonb_build_object('cargo_id', v_cargo, 'cubierto', v_bono is not null, 'ya', false);
end;
$$;

-- Agregar UNA vez. p_ya_hecho = ya se hizo (entra al cargo al momento); si no, queda
-- programado para el tablero del día.
create or replace function public.extra_agregar(
  p_estancia uuid,
  p_extra uuid,
  p_fecha date,
  p_hora time,
  p_cantidad integer,
  p_zona uuid,
  p_direccion text,
  p_sentido text,
  p_notas text,
  p_ya_hecho boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_res jsonb := '{}'::jsonb;
begin
  perform public.extras_exigir('agregar_servicios_extra');
  v_id := public.extras_crear_interno(p_estancia, p_extra, p_fecha, p_hora, p_cantidad, p_zona, p_direccion, p_sentido, p_notas, coalesce(p_ya_hecho, false));
  if coalesce(p_ya_hecho, false) then
    v_res := public.extras_cerrar_interno(v_id);
  end if;
  return jsonb_build_object('id', v_id) || v_res;
end;
$$;

-- Programar un rango (p. ej. un paseo diario a las 10:00 todos los días de la estancia).
create or replace function public.extra_programar(
  p_estancia uuid,
  p_extra uuid,
  p_desde date,
  p_hasta date,
  p_hora time,
  p_cantidad integer,
  p_zona uuid,
  p_direccion text,
  p_sentido text,
  p_notas text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia date;
  v_n integer := 0;
begin
  perform public.extras_exigir('agregar_servicios_extra');
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'El rango de fechas no es válido.';
  end if;
  if p_hasta - p_desde > 90 then
    raise exception 'Se pueden programar hasta 90 días a la vez.';
  end if;
  for v_dia in select d::date from generate_series(p_desde, p_hasta, interval '1 day') d loop
    -- No se duplica lo que ya está programado el mismo día a la misma hora.
    if exists (select 1 from public.servicios_extra_aplicados x
               where x.estancia_id = p_estancia and x.extra_id = p_extra and x.fecha = v_dia
                 and x.hora is not distinct from p_hora and x.estado <> 'cancelado' and x.deleted_at is null) then
      continue;
    end if;
    perform public.extras_crear_interno(p_estancia, p_extra, v_dia, p_hora, p_cantidad, p_zona, p_direccion, p_sentido, p_notas, false);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.extra_marcar_hecho(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.extras_exigir('agregar_servicios_extra');
  return public.extras_cerrar_interno(p_id);
end;
$$;

-- Traslado: «salió» (en camino). El aviso por WhatsApp es un link wa.me que arma la
-- pantalla; aquí solo queda cuándo salió y cuándo se avisó.
create or replace function public.extra_traslado_salir(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_estado text;
begin
  perform public.extras_exigir('agregar_servicios_extra');
  select e.tipo, x.estado into v_tipo, v_estado
  from public.servicios_extra_aplicados x join public.servicios_extra e on e.id = x.extra_id
  where x.id = p_id and x.negocio_id = public.negocio_actual() and x.deleted_at is null;
  if v_tipo is null then
    raise exception 'Ese servicio extra no existe.';
  end if;
  if v_tipo <> 'traslado' then
    raise exception 'Solo un traslado sale «en camino».';
  end if;
  if v_estado <> 'pendiente' then
    raise exception 'Este traslado ya no está pendiente.';
  end if;
  update public.servicios_extra_aplicados set estado = 'en_camino', salio_at = now() where id = p_id;
end;
$$;

create or replace function public.extra_traslado_avisado(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.extras_exigir('agregar_servicios_extra');
  update public.servicios_extra_aplicados set aviso_whatsapp_at = now()
  where id = p_id and negocio_id = public.negocio_actual() and deleted_at is null;
end;
$$;

-- Cancelar: programado → se cancela y ya; hecho → se cancela el cargo (y se devuelve la
-- sesión del paquete, si la cubrió uno).
create or replace function public.extra_cancelar(p_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.servicios_extra_aplicados%rowtype;
begin
  perform public.extras_exigir('agregar_servicios_extra');
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;
  select * into a from public.servicios_extra_aplicados x
  where x.id = p_id and x.negocio_id = public.negocio_actual() and x.deleted_at is null for update;
  if not found then
    raise exception 'Ese servicio extra no existe.';
  end if;
  if a.estado = 'cancelado' then
    return;
  end if;
  if a.estado = 'hecho' and a.cargo_id is not null then
    -- El disparador de cargos_aplicados cancela esta fila y devuelve el paquete.
    update public.cargos_aplicados set cancelado = true, motivo_cancelacion = btrim(p_motivo)
    where id = a.cargo_id and not cancelado;
  end if;
  update public.servicios_extra_aplicados
  set estado = 'cancelado', cancelado_at = now(), cancelado_por = auth.uid(), motivo_cancelacion = btrim(p_motivo)
  where id = p_id and estado <> 'cancelado';
end;
$$;

-- Si el cargo se cancela por otro camino (la lista de cargos del check-out), la fila de
-- servicio extra se cancela con él y la sesión del paquete regresa.
create or replace function public.extras_cargo_cancelado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if new.cancelado and not old.cancelado then
    select x.id into v_id from public.servicios_extra_aplicados x
    where x.cargo_id = new.id and x.estado = 'hecho';
    if v_id is not null then
      if public.cobertura_bono_de_item('cargo', new.id) > 0 then
        perform public.devolver_bono_de_item('cargo', new.id, coalesce(new.motivo_cancelacion, 'Servicio extra cancelado'));
      end if;
      update public.servicios_extra_aplicados
      set estado = 'cancelado', cancelado_at = now(), cancelado_por = auth.uid(),
          motivo_cancelacion = coalesce(new.motivo_cancelacion, 'Cargo cancelado')
      where id = v_id;
    end if;
  end if;
  return new;
end;
$$;
create trigger cargos_aplicados_extras_cancelado
  after update of cancelado on public.cargos_aplicados
  for each row execute function public.extras_cargo_cancelado();

-- ── 5. Lecturas ─────────────────────────────────────────────────────────────
-- El tablero y la hoja de traslados: lo del día y lo pendiente de días anteriores.
create or replace function public.extras_listar(
  p_fecha date default null,
  p_estancia uuid default null,
  p_solo_traslados boolean default false
)
returns table (
  id uuid,
  fecha date,
  hora time,
  estado text,
  atrasada boolean,
  extra_id uuid,
  extra_nombre text,
  tipo text,
  unidad text,
  cantidad integer,
  precio_unitario numeric,
  zona_nombre text,
  direccion text,
  sentido text,
  notas text,
  estancia_id uuid,
  perro_id uuid,
  perro_nombre text,
  cliente_id uuid,
  cliente_nombre text,
  cliente_telefono text,
  cargo_id uuid,
  cubierto_paquete boolean,
  aviso_whatsapp_at timestamptz,
  motivo_cancelacion text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    x.id, x.fecha, x.hora, x.estado,
    (p_fecha is not null and x.fecha < p_fecha and x.estado in ('pendiente', 'en_camino')) as atrasada,
    e.id, e.nombre, e.tipo, e.unidad, x.cantidad, x.precio_unitario,
    z.nombre, x.direccion, x.sentido, x.notas, x.estancia_id,
    pe.id, pe.nombre, c.id, c.nombre, c.telefono,
    x.cargo_id, (x.bono_cliente_id is not null), x.aviso_whatsapp_at, x.motivo_cancelacion
  from public.servicios_extra_aplicados x
  join public.servicios_extra e on e.id = x.extra_id
  join public.perros pe on pe.id = x.perro_id
  join public.clientes c on c.id = pe.cliente_id
  left join public.servicios_extra_zonas z on z.id = x.zona_id
  where x.negocio_id = public.negocio_actual()
    and x.deleted_at is null
    and public.is_staff()
    and (p_estancia is null or x.estancia_id = p_estancia)
    and (
      p_fecha is null
      or x.fecha = p_fecha
      or (x.fecha < p_fecha and x.estado in ('pendiente', 'en_camino'))
    )
    and (not p_solo_traslados or e.tipo = 'traslado')
  order by x.fecha, x.hora nulls last, x.created_at;
$$;

-- Ingresos por servicio extra y por empleado (quien lo marcó hecho).
create or replace function public.reporte_servicios_extra_periodo(p_desde date, p_hasta date)
returns table (
  agrupacion text,
  clave text,
  nombre text,
  veces bigint,
  cantidad bigint,
  ingreso numeric,
  cubierto_paquete numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.tiene_permiso('reportes_financieros'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;
  return query
  with base as (
    select x.*, e.nombre as extra_nombre
    from public.servicios_extra_aplicados x
    join public.servicios_extra e on e.id = x.extra_id
    join public.cargos_aplicados c on c.id = x.cargo_id and not c.cancelado
    where x.negocio_id = public.negocio_actual() and x.deleted_at is null and x.estado = 'hecho'
      and public.fecha_negocio(x.hecho_at) between p_desde and p_hasta
  )
  select 'servicio'::text, b.extra_id::text, b.extra_nombre, count(*), sum(b.cantidad)::bigint,
         coalesce(sum(b.precio_unitario * b.cantidad) filter (where b.bono_cliente_id is null), 0),
         coalesce(sum(b.precio_unitario * b.cantidad) filter (where b.bono_cliente_id is not null), 0)
  from base b group by b.extra_id, b.extra_nombre
  union all
  select 'empleado'::text, coalesce(b.hecho_por::text, ''),
         coalesce(nullif(btrim(p.nombre_completo), ''), 'Sin nombre'),
         count(*), sum(b.cantidad)::bigint,
         coalesce(sum(b.precio_unitario * b.cantidad) filter (where b.bono_cliente_id is null), 0),
         coalesce(sum(b.precio_unitario * b.cantidad) filter (where b.bono_cliente_id is not null), 0)
  from base b
  left join public.profiles p on p.id = b.hecho_por
  group by b.hecho_por, p.nombre_completo
  order by 1, 6 desc;
end;
$$;

-- ── 6. Dueños y permisos de las funciones ───────────────────────────────────
do $$
declare
  f text;
begin
  foreach f in array array[
    'extras_exigir(text)',
    'extra_guardar(uuid, text, text, text, text, numeric, text, text, boolean)',
    'extra_zona_guardar(uuid, uuid, text, numeric, numeric, boolean)',
    'extra_paquete_guardar(uuid, integer, numeric, integer)',
    'extras_crear_interno(uuid, uuid, date, time, integer, uuid, text, text, text, boolean)',
    'extras_cerrar_interno(uuid)',
    'extra_agregar(uuid, uuid, date, time, integer, uuid, text, text, text, boolean)',
    'extra_programar(uuid, uuid, date, date, time, integer, uuid, text, text, text)',
    'extra_marcar_hecho(uuid)',
    'extra_traslado_salir(uuid)',
    'extra_traslado_avisado(uuid)',
    'extra_cancelar(uuid, text)',
    'extras_cargo_cancelado()',
    'extras_listar(date, uuid, boolean)',
    'reporte_servicios_extra_periodo(date, date)'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Las internas y el disparador no se ofrecen a la API.
  foreach f in array array['extras_crear_interno(uuid, uuid, date, time, integer, uuid, text, text, text, boolean)',
                           'extras_cerrar_interno(uuid)', 'extras_cargo_cancelado()', 'extras_exigir(text)'] loop
    execute format('revoke execute on function public.%s from authenticated', f);
  end loop;
end $$;

-- ── 7. El demo se vacía también con las tablas nuevas ───────────────────────
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure) into v_def;
  if position('servicios_extra_aplicados' in v_def) = 0 then
    v_def := replace(v_def, $a$'adelantos', $a$,
      $b$'servicios_extra_aplicados', 'servicios_extra_zonas', 'servicios_extra', 'adelantos', $b$);
    if position('servicios_extra_aplicados' in v_def) = 0 then
      raise exception 'demo_vaciar cambió: no se pudieron agregar las tablas de servicios extra.';
    end if;
    execute v_def;
  end if;
end $$;

-- ── 8. Frontera: el disparador de permisos por omisión es de postgres (lista blanca) ──
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('permiso_extras_por_omision' in v_def) = 0 then
    v_def := replace(v_def, $a$('avisos_marcar')$a$, $b$('avisos_marcar'), ('permiso_extras_por_omision')$b$);
    if position('permiso_extras_por_omision' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar permiso_extras_por_omision.';
    end if;
    execute v_def;
  end if;
end $$;
