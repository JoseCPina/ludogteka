-- Veterinaria, Fase 0 · parte 5: inventario clínico con lotes, caducidades
-- y clasificaciones.
--
-- Los productos clínicos son INSUMOS (la tabla de siempre) con
-- `controla_lotes = true`; no hay un segundo inventario. Encima de la
-- existencia que ya se deriva de `movimientos_inventario` se agrega el
-- nivel de LOTE, con el mismo patrón que los pases (bonos):
--   · `insumo_lotes`        el lote: código, caducidad, proveedor.
--   · `lotes_movimientos`   libro INMUTABLE de cada lote (entrada, surtido,
--                           merma, caducado, ajuste). El saldo de un lote es
--                           la suma del libro (`insumo_lotes_saldo`); nadie lo
--                           escribe.
-- Cada movimiento de lote se refleja en `movimientos_inventario` (la
-- existencia global, el mínimo y los reportes siguen exactamente igual), y al
-- revés: un movimiento que otra parte de la app haga sobre un producto con
-- lotes (consumo de una receta, venta de mostrador, regreso al cancelar una
-- venta) se reparte solo entre los lotes, primero el que caduca antes (PEPS),
-- así lotes y existencia nunca se descuadran. Una compra sin lote se rechaza:
-- hace falta el código y la caducidad.
--
-- DOS clasificaciones por producto, independientes y editables (se copian del
-- catálogo de principios activos al elegir uno, pero cada producto guarda las
-- suyas): grupo SENASICA (I, II, III o ninguno) y clasificación de la Ley
-- General de Salud (estupefaciente art. 234; psicotrópico fracción II, III o
-- IV del art. 245; ninguna), más la marca «antimicrobiano». Un producto del
-- Grupo I o con clasificación LGS «exige folio de receta» al surtirse: en
-- esta fase el movimiento guarda el folio si se captura y avisa si falta, no
-- lo exige todavía.
--
-- Quién: «Administrar lotes e inventario clínico» (`lotes_clinicos`, con
-- Veterinaria prendida). Las columnas clínicas de `insumos` las protege un
-- trigger contra la API directa.

-- ── 1. Columnas clínicas en insumos ──────────────────────────────────

alter table public.insumos
  add column controla_lotes boolean not null default false,
  add column principio_activo_id uuid references public.principios_activos(id),
  add column grupo_senasica text check (grupo_senasica in ('I', 'II', 'III')),
  add column clasificacion_lgs text check (clasificacion_lgs in ('estupefaciente_234', 'psicotropico_245_II', 'psicotropico_245_III', 'psicotropico_245_IV')),
  add column es_antimicrobiano boolean not null default false,
  add column clasificacion_por_confirmar boolean not null default false,
  add column exige_folio_receta boolean generated always as (coalesce(grupo_senasica = 'I', false) or clasificacion_lgs is not null) stored;

create index insumos_principio_activo_idx on public.insumos (principio_activo_id) where principio_activo_id is not null;

create or replace function public.proteger_insumo_clinico()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_toca boolean;
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_toca := new.controla_lotes or new.principio_activo_id is not null or new.grupo_senasica is not null
              or new.clasificacion_lgs is not null or new.es_antimicrobiano or new.clasificacion_por_confirmar;
  else
    v_toca := new.controla_lotes is distinct from old.controla_lotes or new.principio_activo_id is distinct from old.principio_activo_id
              or new.grupo_senasica is distinct from old.grupo_senasica or new.clasificacion_lgs is distinct from old.clasificacion_lgs
              or new.es_antimicrobiano is distinct from old.es_antimicrobiano
              or new.clasificacion_por_confirmar is distinct from old.clasificacion_por_confirmar;
  end if;
  if v_toca and not coalesce(public.tiene_permiso('lotes_clinicos'), false) then
    raise exception 'Los lotes y las clasificaciones de un producto clínico los edita un admin o quien tenga «Administrar lotes e inventario clínico», con el módulo Veterinaria prendido.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.proteger_insumo_clinico() from public, anon;
create trigger proteger_insumo_clinico before insert or update on public.insumos
  for each row execute function public.proteger_insumo_clinico();

-- ── 2. Lotes y su libro ──────────────────────────────────────────────

create table public.insumo_lotes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  insumo_id uuid not null references public.insumos(id),
  codigo text not null check (btrim(codigo) <> ''),
  fecha_caducidad date,
  fecha_recepcion date not null default public.fecha_negocio(),
  proveedor text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index insumo_lotes_codigo on public.insumo_lotes (negocio_id, insumo_id, lower(btrim(codigo))) where deleted_at is null;
create index insumo_lotes_insumo_idx on public.insumo_lotes (insumo_id);
select public._veterinaria_redes('insumo_lotes', '(select public.is_staff())');

create table public.lotes_movimientos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  lote_id uuid not null references public.insumo_lotes(id),
  insumo_id uuid not null references public.insumos(id),
  tipo text not null check (tipo in ('entrada_compra', 'entrada_inicial', 'salida_surtido', 'salida_merma', 'salida_caducado', 'ajuste_positivo', 'ajuste_negativo')),
  -- En la unidad base del insumo, igual que movimientos_inventario.
  cantidad_base numeric(12, 2) not null check (cantidad_base > 0),
  motivo text,
  -- Receta con la que se surtió (hoy opcional; el aviso lo da la función).
  folio_receta text,
  -- El movimiento de la existencia global que lo refleja (no hay para la
  -- entrada inicial: esa existencia ya estaba).
  movimiento_inventario_id uuid references public.movimientos_inventario(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (tipo not in ('salida_merma', 'salida_caducado', 'ajuste_positivo', 'ajuste_negativo') or btrim(coalesce(motivo, '')) <> '')
);
create index lotes_movimientos_lote_idx on public.lotes_movimientos (lote_id, created_at);
create index lotes_movimientos_insumo_idx on public.lotes_movimientos (insumo_id);
select public._veterinaria_redes('lotes_movimientos', '(select public.is_staff())');

create or replace function public.lotes_movimientos_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Los movimientos de un lote no se editan ni se borran: se corrigen con un ajuste.' using errcode = '42501';
end;
$$;
revoke execute on function public.lotes_movimientos_inmutable() from public, anon;
create trigger lotes_movimientos_inmutable before update or delete on public.lotes_movimientos
  for each row execute function public.lotes_movimientos_inmutable();

-- Saldo derivado de cada lote (nunca guardado) y su estado de caducidad.
create view public.insumo_lotes_saldo with (security_invoker = true) as
select l.id as lote_id, l.negocio_id, l.insumo_id, l.codigo, l.fecha_caducidad, l.fecha_recepcion, l.proveedor, l.notas, l.created_at,
       coalesce(sum(case when m.tipo in ('entrada_compra', 'entrada_inicial', 'ajuste_positivo') then m.cantidad_base else -m.cantidad_base end), 0)::numeric(12, 2) as saldo,
       case
         when l.fecha_caducidad is null then 'sin_caducidad'
         when l.fecha_caducidad < public.fecha_negocio() then 'caducado'
         when l.fecha_caducidad <= public.fecha_negocio() + coalesce(i.dias_aviso_caducidad, 30) then 'por_caducar'
         else 'vigente'
       end as estado_caducidad
from public.insumo_lotes l
join public.insumos i on i.id = l.insumo_id
left join public.lotes_movimientos m on m.lote_id = l.id and m.deleted_at is null
where l.deleted_at is null
group by l.id, i.dias_aviso_caducidad;
revoke all on public.insumo_lotes_saldo from anon, authenticated;
grant select on public.insumo_lotes_saldo to authenticated;

-- Los lotes se mueven solos cuando otra parte de la app (receta, venta)
-- mueve un producto con lotes, aunque Veterinaria esté apagada: ahí el
-- módulo no se exige, o la venta del producto tronaría.
create or replace function public.exigir_modulo_lotes()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.modulo_activo('veterinaria') then
    return new;
  end if;
  if tg_table_name = 'lotes_movimientos' and new.movimiento_inventario_id is not null then
    return new;
  end if;
  if tg_table_name = 'insumo_lotes' and lower(btrim(new.codigo)) = 'sin lote' then
    return new;
  end if;
  perform public.exigir_modulo('veterinaria');
  return new;
end;
$$;
revoke execute on function public.exigir_modulo_lotes() from public, anon;
drop trigger exigir_modulo on public.insumo_lotes;
create trigger exigir_modulo before insert or update on public.insumo_lotes
  for each row execute function public.exigir_modulo_lotes();
drop trigger exigir_modulo on public.lotes_movimientos;
create trigger exigir_modulo before insert or update on public.lotes_movimientos
  for each row execute function public.exigir_modulo_lotes();

-- ── 3. Lotes y existencia global siempre de acuerdo ──────────────────

-- Reparte una salida entre los lotes, primero el que caduca antes (PEPS).
create or replace function public.lotes_repartir_salida(
  p_insumo_id uuid, p_cantidad numeric, p_tipo_lote text, p_movimiento uuid, p_motivo text
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_resta numeric := p_cantidad;
  v_lote record;
  v_toma numeric;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_insumo_id::text, 0));
  for v_lote in
    select l.id, sum(case when m.tipo in ('entrada_compra', 'entrada_inicial', 'ajuste_positivo') then m.cantidad_base else -m.cantidad_base end) as saldo
    from public.insumo_lotes l
    join public.lotes_movimientos m on m.lote_id = l.id and m.deleted_at is null
    where l.insumo_id = p_insumo_id and l.deleted_at is null
    group by l.id, l.fecha_caducidad, l.created_at
    having sum(case when m.tipo in ('entrada_compra', 'entrada_inicial', 'ajuste_positivo') then m.cantidad_base else -m.cantidad_base end) > 0
    order by l.fecha_caducidad nulls last, l.created_at
  loop
    exit when v_resta <= 0;
    v_toma := least(v_lote.saldo, v_resta);
    insert into public.lotes_movimientos (lote_id, insumo_id, tipo, cantidad_base, motivo, movimiento_inventario_id)
    values (v_lote.id, p_insumo_id, p_tipo_lote, v_toma, p_motivo, p_movimiento);
    v_resta := v_resta - v_toma;
  end loop;
  if v_resta > 0 then
    raise exception 'No hay suficiente existencia en los lotes de este producto (faltan % de lo que intentas sacar).', v_resta;
  end if;
end;
$$;
alter function public.lotes_repartir_salida(uuid, numeric, text, uuid, text) owner to peludesk_definer;
revoke execute on function public.lotes_repartir_salida(uuid, numeric, text, uuid, text) from public, anon, authenticated;

-- Antes: un producto con lotes no recibe compras sin lote.
create or replace function public.movimiento_inventario_exige_lote()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.tipo = 'entrada_compra'
     and coalesce(current_setting('app.lote_mov', true), '') <> '1'
     and exists (select 1 from public.insumos i where i.id = new.insumo_id and i.controla_lotes) then
    raise exception 'Este producto se maneja por lotes: registra la entrada con su lote y caducidad en Veterinaria → Inventario clínico.'
      using hint = 'lotes';
  end if;
  return new;
end;
$$;
revoke execute on function public.movimiento_inventario_exige_lote() from public, anon;
create trigger movimiento_inventario_exige_lote before insert on public.movimientos_inventario
  for each row execute function public.movimiento_inventario_exige_lote();

-- Después: lo que otra parte de la app mueva sobre un producto con lotes
-- se refleja en sus lotes.
create or replace function public.movimiento_inventario_a_lotes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote uuid;
begin
  if coalesce(current_setting('app.lote_mov', true), '') = '1' then
    return new;
  end if;
  if not exists (select 1 from public.insumos i where i.id = new.insumo_id and i.controla_lotes) then
    return new;
  end if;
  if new.tipo in ('salida_consumo', 'salida_venta') then
    perform public.lotes_repartir_salida(new.insumo_id, new.cantidad_base, 'salida_surtido', new.id, new.motivo);
  elsif new.tipo = 'salida_merma' then
    perform public.lotes_repartir_salida(new.insumo_id, new.cantidad_base, 'salida_merma', new.id, new.motivo);
  elsif new.tipo = 'ajuste_negativo' then
    perform public.lotes_repartir_salida(new.insumo_id, new.cantidad_base, 'ajuste_negativo', new.id, new.motivo);
  elsif new.tipo = 'ajuste_positivo' then
    -- Un regreso (p. ej. una venta cancelada) no trae lote: va al lote
    -- «SIN LOTE» del producto.
    select l.id into v_lote from public.insumo_lotes l
    where l.insumo_id = new.insumo_id and l.deleted_at is null and lower(btrim(l.codigo)) = 'sin lote';
    if v_lote is null then
      insert into public.insumo_lotes (negocio_id, insumo_id, codigo, notas)
      values (new.negocio_id, new.insumo_id, 'SIN LOTE', 'Reingresos que llegaron sin lote.')
      returning id into v_lote;
    end if;
    insert into public.lotes_movimientos (lote_id, insumo_id, tipo, cantidad_base, motivo, movimiento_inventario_id)
    values (v_lote, new.insumo_id, 'ajuste_positivo', new.cantidad_base, coalesce(new.motivo, 'Regreso sin lote'), new.id);
  end if;
  return new;
end;
$$;
alter function public.movimiento_inventario_a_lotes() owner to peludesk_definer;
revoke execute on function public.movimiento_inventario_a_lotes() from public, anon;
create trigger movimiento_inventario_a_lotes after insert on public.movimientos_inventario
  for each row execute function public.movimiento_inventario_a_lotes();

-- ── 4. Funciones de la pantalla ──────────────────────────────────────

create or replace function public.exigir_lotes_clinicos()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  if not coalesce(public.tiene_permiso('lotes_clinicos'), false) then
    raise exception 'Esto lo hace un admin o quien tenga «Administrar lotes e inventario clínico», con el módulo Veterinaria prendido.'
      using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.exigir_lotes_clinicos() from public, anon;
grant execute on function public.exigir_lotes_clinicos() to authenticated, service_role, peludesk_definer;

-- Alta o edición de un producto clínico (un insumo con lotes y clasificación).
create or replace function public.guardar_producto_clinico(
  p_id uuid, p_nombre text, p_area_id uuid, p_unidad_compra_id uuid, p_unidad_consumo_id uuid, p_stock_minimo numeric,
  p_dias_aviso_caducidad int, p_principio_activo_id uuid, p_grupo_senasica text, p_clasificacion_lgs text,
  p_es_antimicrobiano boolean, p_clasificacion_por_confirmar boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_existencia numeric;
begin
  perform public.exigir_lotes_clinicos();
  if btrim(coalesce(p_nombre, '')) = '' then
    raise exception 'Escribe el nombre del producto.';
  end if;
  if p_principio_activo_id is not null and not exists (select 1 from public.principios_activos pa where pa.id = p_principio_activo_id and pa.deleted_at is null) then
    raise exception 'Ese principio activo no existe.';
  end if;
  if p_id is null then
    insert into public.insumos (nombre, area_id, unidad_compra_id, unidad_consumo_id, stock_minimo, requiere_caducidad, dias_aviso_caducidad,
                                controla_lotes, principio_activo_id, grupo_senasica, clasificacion_lgs, es_antimicrobiano, clasificacion_por_confirmar)
    values (btrim(p_nombre), p_area_id, p_unidad_compra_id, p_unidad_consumo_id, coalesce(p_stock_minimo, 0), true,
            nullif(p_dias_aviso_caducidad, 0), true, p_principio_activo_id, nullif(p_grupo_senasica, ''), nullif(p_clasificacion_lgs, ''),
            coalesce(p_es_antimicrobiano, false), coalesce(p_clasificacion_por_confirmar, false))
    returning id into v_id;
  else
    update public.insumos
    set nombre = btrim(p_nombre), area_id = p_area_id, stock_minimo = coalesce(p_stock_minimo, 0),
        dias_aviso_caducidad = nullif(p_dias_aviso_caducidad, 0), principio_activo_id = p_principio_activo_id,
        grupo_senasica = nullif(p_grupo_senasica, ''), clasificacion_lgs = nullif(p_clasificacion_lgs, ''),
        es_antimicrobiano = coalesce(p_es_antimicrobiano, false), clasificacion_por_confirmar = coalesce(p_clasificacion_por_confirmar, false)
    where id = p_id and deleted_at is null and controla_lotes
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese producto clínico no existe.';
    end if;
  end if;
  return v_id;
end;
$$;
alter function public.guardar_producto_clinico(uuid, text, uuid, uuid, uuid, numeric, int, uuid, text, text, boolean, boolean) owner to peludesk_definer;

-- Pasa un insumo que ya existe a producto con lotes. Su existencia actual
-- queda en un lote «INICIAL» (sin caducidad) para que lotes y existencia
-- cuadren desde el primer día.
create or replace function public.activar_lotes_insumo(p_insumo_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existencia numeric;
  v_lote uuid;
begin
  perform public.exigir_lotes_clinicos();
  if not exists (select 1 from public.insumos i where i.id = p_insumo_id and i.deleted_at is null) then
    raise exception 'Ese producto no existe.';
  end if;
  if exists (select 1 from public.insumos i where i.id = p_insumo_id and i.controla_lotes) then
    return;
  end if;
  v_existencia := public.existencia_actual_insumo(p_insumo_id);
  update public.insumos set controla_lotes = true where id = p_insumo_id;
  if v_existencia > 0 then
    insert into public.insumo_lotes (insumo_id, codigo, notas) values (p_insumo_id, 'INICIAL', 'Existencia que había al activar los lotes.')
    returning id into v_lote;
    insert into public.lotes_movimientos (lote_id, insumo_id, tipo, cantidad_base, motivo)
    values (v_lote, p_insumo_id, 'entrada_inicial', v_existencia, 'Existencia al activar los lotes');
  end if;
end;
$$;
alter function public.activar_lotes_insumo(uuid) owner to peludesk_definer;

-- Una entrada: crea el lote (o suma a uno del mismo código y caducidad).
create or replace function public.registrar_lote_entrada(
  p_insumo_id uuid, p_codigo text, p_caducidad date, p_cantidad_compra numeric, p_proveedor text default null, p_notas text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_insumo record;
  v_equiv numeric;
  v_base numeric;
  v_lote record;
  v_mov uuid;
  v_id uuid;
begin
  perform public.exigir_lotes_clinicos();
  select i.id, i.requiere_caducidad, i.controla_lotes into v_insumo from public.insumos i where i.id = p_insumo_id and i.deleted_at is null;
  if v_insumo.id is null or not v_insumo.controla_lotes then
    raise exception 'Ese producto no se maneja por lotes.';
  end if;
  if btrim(coalesce(p_codigo, '')) = '' then
    raise exception 'Escribe el código de lote que viene en la caja.';
  end if;
  if p_cantidad_compra is null or p_cantidad_compra <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;
  if v_insumo.requiere_caducidad and p_caducidad is null then
    raise exception 'Este producto necesita la fecha de caducidad del lote.';
  end if;
  select um.equivalencia_en_base into v_equiv from public.insumos i join public.unidades_medida um on um.id = i.unidad_compra_id where i.id = p_insumo_id;
  v_base := p_cantidad_compra * v_equiv;

  select l.id, l.fecha_caducidad into v_lote from public.insumo_lotes l
  where l.insumo_id = p_insumo_id and l.deleted_at is null and lower(btrim(l.codigo)) = lower(btrim(p_codigo));
  if v_lote.id is not null then
    if v_lote.fecha_caducidad is distinct from p_caducidad then
      raise exception 'El lote % ya existe con otra caducidad (%). Revisa el código o la fecha.', btrim(p_codigo), coalesce(v_lote.fecha_caducidad::text, 'sin caducidad');
    end if;
    v_id := v_lote.id;
  else
    insert into public.insumo_lotes (insumo_id, codigo, fecha_caducidad, proveedor, notas)
    values (p_insumo_id, btrim(p_codigo), p_caducidad, nullif(btrim(coalesce(p_proveedor, '')), ''), nullif(btrim(coalesce(p_notas, '')), ''))
    returning id into v_id;
  end if;

  perform set_config('app.lote_mov', '1', true);
  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, fecha_caducidad)
  values (p_insumo_id, 'entrada_compra', v_base, p_caducidad) returning id into v_mov;
  perform set_config('app.lote_mov', '', true);
  insert into public.lotes_movimientos (lote_id, insumo_id, tipo, cantidad_base, movimiento_inventario_id)
  values (v_id, p_insumo_id, 'entrada_compra', v_base, v_mov);
  return v_id;
end;
$$;
alter function public.registrar_lote_entrada(uuid, text, date, numeric, text, text) owner to peludesk_definer;

-- Una salida de un lote: surtido, merma o caducado. Devuelve el aviso de
-- receta (hoy solo avisa; más adelante exigirá el folio).
create or replace function public.registrar_lote_salida(
  p_lote_id uuid, p_cantidad_consumo numeric, p_tipo text, p_motivo text default null, p_folio_receta text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote record;
  v_insumo record;
  v_equiv numeric;
  v_base numeric;
  v_saldo numeric;
  v_tipo_lote text;
  v_tipo_inv text;
  v_mov uuid;
  v_folio text := nullif(btrim(coalesce(p_folio_receta, '')), '');
  v_aviso text;
begin
  perform public.exigir_lotes_clinicos();
  if p_tipo not in ('surtido', 'merma', 'caducado') then
    raise exception 'Tipo de salida inválido.';
  end if;
  if p_cantidad_consumo is null or p_cantidad_consumo <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;
  if p_tipo in ('merma', 'caducado') and btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo.';
  end if;
  select l.id, l.insumo_id into v_lote from public.insumo_lotes l where l.id = p_lote_id and l.deleted_at is null;
  if v_lote.id is null then
    raise exception 'Ese lote no existe.';
  end if;
  select i.id, i.exige_folio_receta, i.grupo_senasica, i.clasificacion_lgs into v_insumo from public.insumos i where i.id = v_lote.insumo_id;
  select um.equivalencia_en_base into v_equiv from public.insumos i join public.unidades_medida um on um.id = i.unidad_consumo_id where i.id = v_lote.insumo_id;
  v_base := p_cantidad_consumo * v_equiv;
  perform pg_advisory_xact_lock(hashtextextended(v_lote.insumo_id::text, 0));
  select s.saldo into v_saldo from public.insumo_lotes_saldo s where s.lote_id = p_lote_id;
  if v_base > coalesce(v_saldo, 0) then
    raise exception 'El lote no tiene suficiente existencia (queda menos de lo que intentas sacar).';
  end if;
  v_tipo_lote := case p_tipo when 'surtido' then 'salida_surtido' when 'merma' then 'salida_merma' else 'salida_caducado' end;
  v_tipo_inv := case p_tipo when 'surtido' then 'salida_consumo' else 'salida_merma' end;

  perform set_config('app.lote_mov', '1', true);
  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo)
  values (v_lote.insumo_id, v_tipo_inv, v_base,
          case p_tipo when 'caducado' then 'Caducado: ' || btrim(p_motivo) when 'surtido' then nullif(btrim(coalesce(p_motivo, '')), '') else btrim(p_motivo) end)
  returning id into v_mov;
  perform set_config('app.lote_mov', '', true);
  insert into public.lotes_movimientos (lote_id, insumo_id, tipo, cantidad_base, motivo, folio_receta, movimiento_inventario_id)
  values (p_lote_id, v_lote.insumo_id, v_tipo_lote, v_base, nullif(btrim(coalesce(p_motivo, '')), ''), v_folio, v_mov);

  if p_tipo = 'surtido' and v_insumo.exige_folio_receta and v_folio is null then
    v_aviso := 'Este producto ' ||
      case when v_insumo.grupo_senasica = 'I' and v_insumo.clasificacion_lgs is not null then 'es del Grupo I de SENASICA y está controlado por la Ley General de Salud'
           when v_insumo.grupo_senasica = 'I' then 'es del Grupo I de SENASICA'
           else 'está controlado por la Ley General de Salud' end ||
      ': más adelante el sistema exigirá el folio de receta al surtirlo. Por ahora quedó registrado sin folio.';
  end if;
  return jsonb_build_object('movimiento_id', v_mov, 'aviso', v_aviso);
end;
$$;
alter function public.registrar_lote_salida(uuid, numeric, text, text, text) owner to peludesk_definer;

create or replace function public.registrar_lote_ajuste(p_lote_id uuid, p_cantidad_consumo numeric, p_sentido text, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lote record;
  v_equiv numeric;
  v_base numeric;
  v_saldo numeric;
  v_mov uuid;
  v_id uuid;
begin
  perform public.exigir_lotes_clinicos();
  if p_sentido not in ('positivo', 'negativo') then
    raise exception 'Sentido de ajuste inválido.';
  end if;
  if btrim(coalesce(p_motivo, '')) = '' then
    raise exception 'Escribe el motivo del ajuste.';
  end if;
  if p_cantidad_consumo is null or p_cantidad_consumo <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;
  select l.id, l.insumo_id into v_lote from public.insumo_lotes l where l.id = p_lote_id and l.deleted_at is null;
  if v_lote.id is null then
    raise exception 'Ese lote no existe.';
  end if;
  select um.equivalencia_en_base into v_equiv from public.insumos i join public.unidades_medida um on um.id = i.unidad_consumo_id where i.id = v_lote.insumo_id;
  v_base := p_cantidad_consumo * v_equiv;
  perform pg_advisory_xact_lock(hashtextextended(v_lote.insumo_id::text, 0));
  if p_sentido = 'negativo' then
    select s.saldo into v_saldo from public.insumo_lotes_saldo s where s.lote_id = p_lote_id;
    if v_base > coalesce(v_saldo, 0) then
      raise exception 'El ajuste negativo no puede dejar el lote en negativo.';
    end if;
  end if;
  perform set_config('app.lote_mov', '1', true);
  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo)
  values (v_lote.insumo_id, case p_sentido when 'positivo' then 'ajuste_positivo' else 'ajuste_negativo' end, v_base, btrim(p_motivo))
  returning id into v_mov;
  perform set_config('app.lote_mov', '', true);
  insert into public.lotes_movimientos (lote_id, insumo_id, tipo, cantidad_base, motivo, movimiento_inventario_id)
  values (p_lote_id, v_lote.insumo_id, case p_sentido when 'positivo' then 'ajuste_positivo' else 'ajuste_negativo' end, v_base, btrim(p_motivo), v_mov)
  returning id into v_id;
  return v_id;
end;
$$;
alter function public.registrar_lote_ajuste(uuid, numeric, text, text) owner to peludesk_definer;

-- Alertas del inventario clínico: lotes caducados o por caducar CON
-- existencia, y productos bajo su mínimo. `desde` es la fecha más vieja
-- desde la que algo está esperando (para la antigüedad del aviso).
create or replace function public.inventario_clinico_alertas()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with permitido as (select coalesce(public.tiene_permiso('lotes_clinicos'), false) as ok),
  lotes as (
    select s.* from public.insumo_lotes_saldo s
    join public.insumos i on i.id = s.insumo_id and i.deleted_at is null and i.controla_lotes
    where s.saldo > 0 and s.estado_caducidad in ('caducado', 'por_caducar')
  ),
  minimos as (
    select i.id, i.stock_minimo from public.insumos i
    where i.deleted_at is null and i.controla_lotes and public.existencia_actual_insumo(i.id) < i.stock_minimo
  )
  select case when not (select ok from permitido) then '{}'::jsonb else jsonb_build_object(
    'caducados', (select count(*) from lotes where estado_caducidad = 'caducado'),
    'por_caducar', (select count(*) from lotes where estado_caducidad = 'por_caducar'),
    'caducado_desde', (select min(fecha_caducidad) from lotes where estado_caducidad = 'caducado'),
    'por_caducar_primero', (select min(fecha_caducidad) from lotes where estado_caducidad = 'por_caducar'),
    'bajo_minimo', (select count(*) from minimos)
  ) end;
$$;
alter function public.inventario_clinico_alertas() owner to peludesk_definer;

do $$
declare
  f text;
begin
  foreach f in array array[
    'guardar_producto_clinico(uuid, text, uuid, uuid, uuid, numeric, int, uuid, text, text, boolean, boolean)',
    'activar_lotes_insumo(uuid)', 'registrar_lote_entrada(uuid, text, date, numeric, text, text)',
    'registrar_lote_salida(uuid, numeric, text, text, text)', 'registrar_lote_ajuste(uuid, numeric, text, text)',
    'inventario_clinico_alertas()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

drop function public._veterinaria_redes(text, text, text);
