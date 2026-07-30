-- Única puerta de entrada para registrar una compra. Solo admin (regla
-- de Bloque B). Convierte la cantidad capturada en unidad de COMPRA a la
-- unidad base del insumo — la misma disciplina de Bloque A, ahora en el
-- movimiento real, no solo en la existencia inicial.
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
  if not public.is_admin() then
    raise exception 'Solo un admin puede registrar una compra.';
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

revoke execute on function public.registrar_entrada_compra(uuid, uuid, numeric, numeric, date) from public;
grant execute on function public.registrar_entrada_compra(uuid, uuid, numeric, numeric, date) to authenticated;

-- Función interna compartida: existencia real de un insumo AHORA MISMO,
-- calculada directo del ledger (no depende de que la vista ya se haya
-- actualizado para incluir movimientos — se calcula igual en los dos
-- lados). No expuesta a PostgREST (sin grant a authenticated).
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
        when m.tipo in ('salida_consumo', 'salida_merma', 'ajuste_negativo') then -m.cantidad_base
        else 0
      end
    ), 0)
  from public.insumos i
  left join public.movimientos_inventario m on m.insumo_id = i.id
  where i.id = p_insumo_id
  group by i.existencia_inicial;
$$;

-- Única puerta de entrada para salidas de consumo/merma. Los tres roles
-- de staff pueden llamarla (regla de Bloque B) — nunca pide costo.
-- Bloquea dejar la existencia en negativo: si el conteo real es menor
-- al esperado, eso se resuelve con un ajuste (función siguiente), no
-- forzando una salida que no cabe.
create or replace function public.registrar_salida(
  p_insumo_id uuid,
  p_cantidad_consumo numeric,
  p_tipo text,
  p_motivo text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equivalencia numeric;
  v_cantidad_base numeric;
  v_existencia numeric;
  v_tipo_real text;
  v_movimiento_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Solo personal del negocio puede registrar salidas de inventario.';
  end if;

  if p_tipo not in ('consumo', 'merma') then
    raise exception 'Tipo de salida inválido.';
  end if;
  v_tipo_real := case p_tipo when 'consumo' then 'salida_consumo' else 'salida_merma' end;

  if p_tipo = 'merma' and (p_motivo is null or btrim(p_motivo) = '') then
    raise exception 'Escribe el motivo de la merma.';
  end if;

  if p_cantidad_consumo is null or p_cantidad_consumo <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select um.equivalencia_en_base into v_equivalencia
  from public.insumos i
  join public.unidades_medida um on um.id = i.unidad_consumo_id
  where i.id = p_insumo_id and i.deleted_at is null;

  if v_equivalencia is null then
    raise exception 'Insumo no encontrado.';
  end if;

  v_cantidad_base := p_cantidad_consumo * v_equivalencia;
  v_existencia := public.existencia_actual_insumo(p_insumo_id);

  if v_cantidad_base > v_existencia then
    raise exception 'No hay suficiente existencia de este insumo (queda menos de lo que intentas sacar).';
  end if;

  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo)
  values (p_insumo_id, v_tipo_real, v_cantidad_base, nullif(btrim(coalesce(p_motivo, '')), ''))
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

revoke execute on function public.registrar_salida(uuid, numeric, text, text) from public;
grant execute on function public.registrar_salida(uuid, numeric, text, text) to authenticated;

-- Única puerta de entrada para ajustes por conteo físico. Motivo SIEMPRE
-- obligatorio (a diferencia de la merma, que solo lo pide porque es un
-- caso "raro" — un ajuste lo es siempre: alguien contó físico y no
-- coincidía). Los tres roles de staff pueden registrarlo.
create or replace function public.registrar_ajuste(
  p_insumo_id uuid,
  p_cantidad_consumo numeric,
  p_sentido text,
  p_motivo text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_equivalencia numeric;
  v_cantidad_base numeric;
  v_existencia numeric;
  v_tipo_real text;
  v_movimiento_id uuid;
begin
  if not public.is_staff() then
    raise exception 'Solo personal del negocio puede registrar ajustes de inventario.';
  end if;

  if p_sentido not in ('positivo', 'negativo') then
    raise exception 'Sentido de ajuste inválido.';
  end if;
  v_tipo_real := case p_sentido when 'positivo' then 'ajuste_positivo' else 'ajuste_negativo' end;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo del ajuste.';
  end if;

  if p_cantidad_consumo is null or p_cantidad_consumo <= 0 then
    raise exception 'La cantidad debe ser mayor a cero.';
  end if;

  select um.equivalencia_en_base into v_equivalencia
  from public.insumos i
  join public.unidades_medida um on um.id = i.unidad_consumo_id
  where i.id = p_insumo_id and i.deleted_at is null;

  if v_equivalencia is null then
    raise exception 'Insumo no encontrado.';
  end if;

  v_cantidad_base := p_cantidad_consumo * v_equivalencia;

  if p_sentido = 'negativo' then
    v_existencia := public.existencia_actual_insumo(p_insumo_id);
    if v_cantidad_base > v_existencia then
      raise exception 'El ajuste negativo no puede dejar la existencia en negativo.';
    end if;
  end if;

  insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo)
  values (p_insumo_id, v_tipo_real, v_cantidad_base, btrim(p_motivo))
  returning id into v_movimiento_id;

  return v_movimiento_id;
end;
$$;

revoke execute on function public.registrar_ajuste(uuid, numeric, text, text) from public;
grant execute on function public.registrar_ajuste(uuid, numeric, text, text) to authenticated;
