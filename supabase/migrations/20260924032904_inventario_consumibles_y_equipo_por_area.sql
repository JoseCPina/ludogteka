-- Inventario rehecho: consumibles y equipo, por área (24 de septiembre de 2026).
--
-- Antes todo era "insumo" con stock. Ahora son dos cosas distintas:
--   · CONSUMIBLES (la tabla insumos de siempre): se gastan y se reponen.
--     Existencia, unidad, stock mínimo, compras, consumo, merma y ajuste.
--     Se queda en insumos para que la receta de consumo por servicio
--     (recetas_consumo → insumos) y finalizar_cita_con_consumo sigan
--     funcionando sin tocarse.
--   · EQUIPO (tabla nueva equipos): no se gasta. Cuántos hay, en qué estado
--     (bueno, necesita mantenimiento, descompuesto, dado de baja) y cuándo
--     fue su último mantenimiento; avisa cuando toca mantenimiento, no
--     cuando "se acaba". Cada cambio queda en equipo_eventos.
-- Los dos se agrupan por ÁREA (areas_inventario, editable por admin).
--
-- Quién hace qué:
--   · Admin y recepción dan de alta y editan consumibles y equipo, rápido,
--     sin proveedor y SIN costos: el costo vive en insumos_costos (solo con
--     el permiso «Costos y compras de inventario»), no en insumos, que el
--     personal sí lee. Lo que se da de alta sin costo aparece en
--     insumos_sin_costo() para que admin lo complete.
--   · Recepción y estética registran consumo, merma, ajuste (ya era así) y
--     el estado o el mantenimiento del equipo (registrar_evento_equipo).
--   · Compras con costo: admin o quien tenga el permiso. El proveedor ya es
--     opcional.
--
-- Producción no tenía nada de inventario capturado al aplicar esto (0
-- insumos, movimientos, compras, proveedores y recetas): el catálogo
-- inicial se siembra sin existencias ni costos. El alimento que el dueño
-- trae para su perro NO es inventario del negocio (va en su expediente);
-- aquí solo "Alimento del negocio".

-- ── 1. Áreas ─────────────────────────────────────────────────────────

create table public.areas_inventario (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique,
  nombre text not null,
  orden int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.areas_inventario
  for each row execute function public.set_updated_at();

alter table public.areas_inventario enable row level security;

create policy areas_inventario_select_staff on public.areas_inventario
  for select to authenticated using (coalesce(public.is_staff(), false));
create policy areas_inventario_insert_admin on public.areas_inventario
  for insert to authenticated with check (coalesce(public.is_admin(), false));
create policy areas_inventario_update_admin on public.areas_inventario
  for update to authenticated
  using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false));

insert into public.areas_inventario (clave, nombre, orden) values
  ('estetica', 'Estética', 1),
  ('guarderia_hotel', 'Guardería y hotel', 2),
  ('limpieza', 'Limpieza', 3),
  ('botiquin', 'Botiquín', 4)
on conflict (clave) do nothing;

-- ── 2. Consumibles: área en vez de categoría ─────────────────────────

alter table public.insumos add column if not exists area_id uuid references public.areas_inventario(id);
alter table public.insumos alter column categoria_id drop not null;

-- Lo que ya existiera (en producción no hay nada) toma el área de su
-- categoría vieja.
update public.insumos i
set area_id = a.id
from public.categorias_insumo c, public.areas_inventario a
where i.area_id is null
  and c.id = i.categoria_id
  and a.clave = case c.clave
    when 'estetica' then 'estetica'
    when 'limpieza' then 'limpieza'
    else 'guarderia_hotel'
  end;
update public.insumos
set area_id = (select id from public.areas_inventario where clave = 'guarderia_hotel')
where area_id is null;

alter table public.insumos alter column area_id set not null;

-- Alta y edición de consumibles: admin y recepción (sin costos: no hay
-- costo en esta tabla).
drop policy if exists insumos_insert_admin on public.insumos;
create policy insumos_insert_staff on public.insumos
  for insert to authenticated
  with check (coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion'));
drop policy if exists insumos_update_admin on public.insumos;
create policy insumos_update_staff on public.insumos
  for update to authenticated
  using (coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion'))
  with check (coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion'));

-- Las vistas de existencia y caducidad traen el área (columnas al final:
-- create or replace view no deja reordenar).
create or replace view public.insumos_existencia_actual
with (security_invoker = true)
as
select
  i.id as insumo_id,
  i.nombre,
  i.categoria_id,
  i.unidad_consumo_id,
  i.stock_minimo,
  public.existencia_actual_insumo(i.id) as existencia_actual,
  (public.existencia_actual_insumo(i.id) < i.stock_minimo) as bajo_minimo,
  i.area_id
from public.insumos i
where i.deleted_at is null;

-- ── 3. Costo de referencia (fuera de insumos, solo con el permiso) ──

create table public.insumos_costos (
  id uuid primary key default gen_random_uuid(),
  insumo_id uuid not null unique references public.insumos(id),
  -- Costo por UNIDAD DE COMPRA (la misma unidad con la que se registran
  -- las compras). Sirve de costo mientras el insumo no tenga compras.
  costo_unitario_compra numeric(10, 2) not null check (costo_unitario_compra >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.insumos_costos
  for each row execute function public.set_updated_at();

alter table public.insumos_costos enable row level security;

create policy insumos_costos_select_costos on public.insumos_costos
  for select to authenticated using (public.tiene_permiso('inventario_costos'));
create policy insumos_costos_insert_costos on public.insumos_costos
  for insert to authenticated with check (public.tiene_permiso('inventario_costos'));
create policy insumos_costos_update_costos on public.insumos_costos
  for update to authenticated
  using (public.tiene_permiso('inventario_costos')) with check (public.tiene_permiso('inventario_costos'));

-- Costo promedio por unidad base: el de las compras; si no hay compras, el
-- de referencia. Sigue siendo invoker: a quien no tiene el permiso, las
-- políticas de compras_insumos e insumos_costos le dan null.
create or replace function public.costo_promedio_base_insumo(
  p_insumo_id uuid,
  p_hasta date default public.fecha_negocio()
)
returns numeric
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (
      select case when coalesce(sum(mi.cantidad_base), 0) > 0
        then sum(ci.costo_total) / sum(mi.cantidad_base)
        else null end
      from public.movimientos_inventario mi
      join public.compras_insumos ci on ci.movimiento_id = mi.id
      where mi.insumo_id = p_insumo_id
        and mi.tipo = 'entrada_compra'
        and public.fecha_negocio(mi.created_at) <= p_hasta
    ),
    (
      select ic.costo_unitario_compra / nullif(um.equivalencia_en_base, 0)
      from public.insumos_costos ic
      join public.insumos i on i.id = ic.insumo_id
      join public.unidades_medida um on um.id = i.unidad_compra_id
      where ic.insumo_id = p_insumo_id and ic.deleted_at is null
    )
  );
$$;

-- Consumibles sin ningún costo (ni compras ni referencia): la lista que admin
-- completa después de que recepción da de alta algo.
create or replace function public.insumos_sin_costo()
returns table (id uuid, nombre text, area_id uuid, area_nombre text, unidad_compra text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('inventario_costos') then
    raise exception 'Solo un admin, o quien tenga el permiso «Costos y compras de inventario», puede ver los costos.';
  end if;
  return query
  select i.id, i.nombre, a.id, a.nombre, um.etiqueta, i.created_at
  from public.insumos i
  join public.areas_inventario a on a.id = i.area_id
  join public.unidades_medida um on um.id = i.unidad_compra_id
  where i.deleted_at is null
    and not exists (select 1 from public.insumos_costos ic where ic.insumo_id = i.id and ic.deleted_at is null)
    and not exists (
      select 1 from public.movimientos_inventario m
      join public.compras_insumos c on c.movimiento_id = m.id
      where m.insumo_id = i.id
    )
  order by a.orden, i.nombre;
end;
$$;

revoke execute on function public.insumos_sin_costo() from public, anon;
grant execute on function public.insumos_sin_costo() to authenticated;

-- ── 4. Compras: el proveedor es opcional ─────────────────────────────

alter table public.compras_insumos alter column proveedor_id drop not null;

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

  -- Proveedor opcional: si viene, tiene que existir.
  if p_proveedor_id is not null
     and not exists (select 1 from public.proveedores where id = p_proveedor_id and deleted_at is null) then
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

-- ── 5. Equipo ────────────────────────────────────────────────────────

create table public.equipos (
  id uuid primary key default gen_random_uuid(),
  area_id uuid not null references public.areas_inventario(id),
  nombre text not null check (btrim(nombre) <> ''),
  cantidad int not null default 0 check (cantidad >= 0),
  estado text not null default 'bueno'
    check (estado in ('bueno', 'mantenimiento', 'descompuesto', 'baja')),
  -- Cada cuántos días toca (afilado, cambio de cuchillas, servicio). Null =
  -- no lleva mantenimiento programado.
  frecuencia_mantenimiento_dias int check (frecuencia_mantenimiento_dias is null or frecuencia_mantenimiento_dias > 0),
  que_mantenimiento text,
  ultimo_mantenimiento date,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.equipos
  for each row execute function public.set_updated_at();

alter table public.equipos enable row level security;

create policy equipos_select_staff on public.equipos
  for select to authenticated using (coalesce(public.is_staff(), false));
-- Alta y edición: admin y recepción. El estado y el mantenimiento los
-- registra también estética, por registrar_evento_equipo.
create policy equipos_insert_staff on public.equipos
  for insert to authenticated
  with check (coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion'));
create policy equipos_update_staff on public.equipos
  for update to authenticated
  using (coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion'))
  with check (coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion'));

-- Bitácora del equipo: cada cambio de estado, mantenimiento o conteo.
create table public.equipo_eventos (
  id uuid primary key default gen_random_uuid(),
  equipo_id uuid not null references public.equipos(id),
  tipo text not null check (tipo in ('estado', 'mantenimiento', 'cantidad')),
  estado_anterior text,
  estado_nuevo text,
  cantidad_anterior int,
  cantidad_nueva int,
  fecha date not null default public.fecha_negocio(),
  nota text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.equipo_eventos
  for each row execute function public.set_updated_at();

alter table public.equipo_eventos enable row level security;

create policy equipo_eventos_select_staff on public.equipo_eventos
  for select to authenticated using (coalesce(public.is_staff(), false));
-- Se escribe por registrar_evento_equipo (security definer); la política
-- existe para no dejar la tabla con RLS y sin reglas, y solo deja al staff.
create policy equipo_eventos_insert_staff on public.equipo_eventos
  for insert to authenticated with check (coalesce(public.is_staff(), false));
create policy equipo_eventos_update_admin on public.equipo_eventos
  for update to authenticated
  using (coalesce(public.is_admin(), false)) with check (coalesce(public.is_admin(), false));

-- Cambiar el estado, registrar un mantenimiento o corregir la cantidad.
-- Recepción y estética también (es parte del día a día); cada uno queda en
-- equipo_eventos con quién y cuándo.
create or replace function public.registrar_evento_equipo(
  p_equipo_id uuid,
  p_tipo text,
  p_estado text default null,
  p_cantidad int default null,
  p_fecha date default null,
  p_nota text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eq public.equipos%rowtype;
  v_fecha date := coalesce(p_fecha, public.fecha_negocio());
  v_id uuid;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal puede registrar cambios del equipo.';
  end if;

  select * into v_eq from public.equipos where id = p_equipo_id and deleted_at is null;
  if not found then
    raise exception 'Equipo no encontrado.';
  end if;

  if p_tipo = 'estado' then
    if p_estado is null or p_estado not in ('bueno', 'mantenimiento', 'descompuesto', 'baja') then
      raise exception 'Estado inválido.';
    end if;
    if p_estado in ('descompuesto', 'baja') and (p_nota is null or btrim(p_nota) = '') then
      raise exception 'Escribe qué pasó (descompuesto o de baja necesita una nota).';
    end if;
    update public.equipos set estado = p_estado where id = p_equipo_id;
    insert into public.equipo_eventos (equipo_id, tipo, estado_anterior, estado_nuevo, fecha, nota)
    values (p_equipo_id, 'estado', v_eq.estado, p_estado, v_fecha, nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;

  elsif p_tipo = 'mantenimiento' then
    if v_fecha > public.fecha_negocio() then
      raise exception 'La fecha del mantenimiento no puede ser futura.';
    end if;
    -- Hecho el mantenimiento, el equipo queda en buen estado (salvo que
    -- esté dado de baja, que no se revive con un afilado).
    update public.equipos
    set ultimo_mantenimiento = greatest(coalesce(ultimo_mantenimiento, v_fecha), v_fecha),
        estado = case when estado = 'baja' then estado else 'bueno' end
    where id = p_equipo_id;
    insert into public.equipo_eventos (equipo_id, tipo, estado_anterior, estado_nuevo, fecha, nota)
    values (p_equipo_id, 'mantenimiento', v_eq.estado,
            case when v_eq.estado = 'baja' then 'baja' else 'bueno' end,
            v_fecha, nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;

  elsif p_tipo = 'cantidad' then
    if p_cantidad is null or p_cantidad < 0 then
      raise exception 'La cantidad no puede ser negativa.';
    end if;
    update public.equipos set cantidad = p_cantidad where id = p_equipo_id;
    insert into public.equipo_eventos (equipo_id, tipo, cantidad_anterior, cantidad_nueva, fecha, nota)
    values (p_equipo_id, 'cantidad', v_eq.cantidad, p_cantidad, v_fecha, nullif(btrim(coalesce(p_nota, '')), ''))
    returning id into v_id;

  else
    raise exception 'Tipo de cambio inválido.';
  end if;

  return v_id;
end;
$$;

revoke execute on function public.registrar_evento_equipo(uuid, text, text, int, date, text) from public, anon;
grant execute on function public.registrar_evento_equipo(uuid, text, text, int, date, text) to authenticated;

-- Cuándo toca el siguiente mantenimiento y qué aviso dar. "pronto" = en
-- los próximos 7 días.
create view public.equipos_estado
with (security_invoker = true)
as
select
  e.id as equipo_id,
  e.area_id,
  e.nombre,
  e.cantidad,
  e.estado,
  e.frecuencia_mantenimiento_dias,
  e.que_mantenimiento,
  e.ultimo_mantenimiento,
  case when e.frecuencia_mantenimiento_dias is not null and e.ultimo_mantenimiento is not null
    then e.ultimo_mantenimiento + e.frecuencia_mantenimiento_dias end as proximo_mantenimiento,
  case
    when e.estado = 'baja' then null
    when e.estado = 'descompuesto' then 'descompuesto'
    when e.estado = 'mantenimiento' then 'necesita_mantenimiento'
    when e.frecuencia_mantenimiento_dias is null then null
    when e.ultimo_mantenimiento is null then 'sin_registro'
    when e.ultimo_mantenimiento + e.frecuencia_mantenimiento_dias < public.fecha_negocio() then 'vencido'
    when e.ultimo_mantenimiento + e.frecuencia_mantenimiento_dias <= public.fecha_negocio() + 7 then 'pronto'
    else null
  end as aviso,
  e.notas
from public.equipos e
where e.deleted_at is null;

-- ── 6. Catálogo inicial (sin existencias ni costos) ─────────────────
-- Unidad de compra / de consumo: líquidos en litro / mililitro, polvos y
-- pastas en kilo / gramo, lo demás por pieza. El negocio las cambia.

do $$
declare
  v_area record;
  v_item record;
  v_u record;
begin
  for v_item in
    select * from (values
      ('estetica', 'Shampoo', 'l', 'ml'),
      ('estetica', 'Acondicionador', 'l', 'ml'),
      ('estetica', 'Talco', 'kg', 'g'),
      ('estetica', 'Perfume o colonia', 'l', 'ml'),
      ('estetica', 'Moños y pañoletas', 'pieza', 'pieza'),
      ('estetica', 'Limpiador de oídos', 'l', 'ml'),
      ('estetica', 'Pasta dental canina', 'kg', 'g'),
      ('estetica', 'Bálsamo para nariz y huellitas', 'kg', 'g'),
      ('estetica', 'Polvo hemostático para uñas', 'kg', 'g'),
      ('estetica', 'Algodón', 'kg', 'g'),
      ('estetica', 'Toallas desechables', 'pieza', 'pieza'),
      ('guarderia_hotel', 'Alimento del negocio', 'kg', 'g'),
      ('guarderia_hotel', 'Premios', 'pieza', 'pieza'),
      ('guarderia_hotel', 'Bolsas para desechos', 'pieza', 'pieza'),
      ('limpieza', 'Desinfectante', 'l', 'ml'),
      ('limpieza', 'Cloro', 'l', 'ml'),
      ('limpieza', 'Jabón', 'l', 'ml'),
      ('limpieza', 'Bolsas de basura', 'pieza', 'pieza'),
      ('limpieza', 'Papel', 'pieza', 'pieza'),
      ('limpieza', 'Trapeadores', 'pieza', 'pieza'),
      ('botiquin', 'Gasas', 'pieza', 'pieza'),
      ('botiquin', 'Vendas', 'pieza', 'pieza'),
      ('botiquin', 'Antiséptico', 'l', 'ml')
    ) as t(area, nombre, compra, consumo)
  loop
    select id into v_area from public.areas_inventario where clave = v_item.area;
    select
      (select id from public.unidades_medida where clave = v_item.compra and deleted_at is null) as compra,
      (select id from public.unidades_medida where clave = v_item.consumo and deleted_at is null) as consumo
    into v_u;
    if v_u.compra is null or v_u.consumo is null then
      raise exception 'Falta la unidad de medida % o % para sembrar %', v_item.compra, v_item.consumo, v_item.nombre;
    end if;
    if not exists (
      select 1 from public.insumos
      where lower(nombre) = lower(v_item.nombre) and area_id = v_area.id and deleted_at is null
    ) then
      insert into public.insumos (nombre, area_id, unidad_compra_id, unidad_consumo_id, created_by)
      values (v_item.nombre, v_area.id, v_u.compra, v_u.consumo, null);
    end if;
  end loop;

  for v_item in
    select * from (values
      ('estetica', 'Tijeras rectas', 90, 'Afilado'),
      ('estetica', 'Tijeras curvas', 90, 'Afilado'),
      ('estetica', 'Tijeras de entresacar', 90, 'Afilado'),
      ('estetica', 'Rasuradora', 180, 'Servicio y lubricación'),
      ('estetica', 'Cuchillas de rasuradora', 60, 'Afilado o cambio de cuchillas'),
      ('estetica', 'Cortaúñas', null, null),
      ('estetica', 'Lima', null, null),
      ('estetica', 'Cepillos', null, null),
      ('estetica', 'Cardas', null, null),
      ('estetica', 'Peines', null, null),
      ('estetica', 'Secadora o soplador', 90, 'Limpieza de filtro'),
      ('estetica', 'Mesa de grooming', null, null),
      ('estetica', 'Tina', null, null),
      ('guarderia_hotel', 'Camas', null, null),
      ('guarderia_hotel', 'Platos', null, null),
      ('guarderia_hotel', 'Bebederos', null, null),
      ('guarderia_hotel', 'Juguetes', null, null),
      ('guarderia_hotel', 'Correas', null, null)
    ) as t(area, nombre, frecuencia, que)
  loop
    select id into v_area from public.areas_inventario where clave = v_item.area;
    if not exists (
      select 1 from public.equipos
      where lower(nombre) = lower(v_item.nombre) and area_id = v_area.id and deleted_at is null
    ) then
      insert into public.equipos (area_id, nombre, cantidad, frecuencia_mantenimiento_dias, que_mantenimiento, created_by)
      values (v_area.id, v_item.nombre, 0, v_item.frecuencia, v_item.que, null);
    end if;
  end loop;
end;
$$;
