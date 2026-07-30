-- Única puerta para cerrar una cita de estética Y descontar su consumo
-- de inventario en la misma transacción — si el descuento fallara a
-- medias, no queremos una cita finalizada sin su consumo ni viceversa.
-- SECURITY DEFINER porque necesita insertar en movimientos_inventario
-- (sin política de INSERT para authenticated); por eso replica aquí
-- mismo el permiso de citas_estetica_update_staff en vez de confiar en
-- que el RLS de citas_estetica ya lo filtró — una función definer
-- salta ese RLS, así que el chequeo tiene que vivir adentro.
--
-- p_ajustes: jsonb con la forma [{"insumo_id": "...", "cantidad": 250}],
-- una entrada por cada insumo de la receta cuya cantidad real fue
-- distinta a la sugerida. Un insumo de la receta que no aparece en
-- p_ajustes usa su cantidad_consumo tal cual; una entrada con
-- cantidad = 0 se interpreta como "esta vez no se usó", y se omite.
--
-- Decisión deliberada: si la existencia no alcanza, el consumo se
-- registra igual (a diferencia de registrar_salida, que si bloquea
-- quedar en negativo). El baño ya pasó y el insumo ya se usó — bloquear
-- el cierre de la cita por un faltante de inventario detendría trabajo
-- real por un problema de abasto; ese faltante ya se ve solo en la
-- alerta de stock mínimo (existencia negativa siempre está bajo mínimo).
create or replace function public.finalizar_cita_con_consumo(
  p_cita_id uuid,
  p_recogido_por_nombre text,
  p_recogido_por_telefono text,
  p_recogido_por_es_dueno boolean,
  p_ajustes jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_servicio_id uuid;
  v_tamano_id uuid;
  v_empleado_id uuid;
  v_estado text;
  v_receta record;
  v_cantidad_ajustada numeric;
  v_cantidad numeric;
  v_cantidad_base numeric;
begin
  select servicio_id, tamano_id, empleado_id, estado
    into v_servicio_id, v_tamano_id, v_empleado_id, v_estado
  from public.citas_estetica
  where id = p_cita_id;

  if v_estado is null then
    raise exception 'Cita no encontrada.';
  end if;

  if not (
    public.current_rol() in ('admin', 'recepcion')
    or (public.current_rol() = 'estetica' and v_empleado_id = auth.uid())
  ) then
    raise exception 'No tienes permiso para cerrar esta cita.';
  end if;

  if v_estado <> 'en_curso' then
    raise exception 'Solo se puede finalizar una cita que está en curso.';
  end if;

  update public.citas_estetica
  set estado = 'finalizada',
      recogido_por_nombre = p_recogido_por_nombre,
      recogido_por_telefono = p_recogido_por_telefono,
      recogido_por_es_dueno = p_recogido_por_es_dueno
  where id = p_cita_id;

  if v_tamano_id is not null then
    for v_receta in
      select r.insumo_id, r.cantidad_consumo, um.equivalencia_en_base
      from public.recetas_consumo r
      join public.insumos i on i.id = r.insumo_id and i.deleted_at is null
      join public.unidades_medida um on um.id = i.unidad_consumo_id
      where r.servicio_id = v_servicio_id
        and r.tamano_id = v_tamano_id
        and r.deleted_at is null
    loop
      select (elem ->> 'cantidad')::numeric into v_cantidad_ajustada
      from jsonb_array_elements(coalesce(p_ajustes, '[]'::jsonb)) elem
      where (elem ->> 'insumo_id')::uuid = v_receta.insumo_id
      limit 1;

      v_cantidad := coalesce(v_cantidad_ajustada, v_receta.cantidad_consumo);
      v_cantidad_ajustada := null;

      if v_cantidad > 0 then
        v_cantidad_base := v_cantidad * v_receta.equivalencia_en_base;
        insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, cita_estetica_id)
        values (v_receta.insumo_id, 'salida_consumo', v_cantidad_base, p_cita_id);
      end if;
    end loop;
  end if;
end;
$$;

revoke execute on function public.finalizar_cita_con_consumo(uuid, text, text, boolean, jsonb) from public;
grant execute on function public.finalizar_cita_con_consumo(uuid, text, text, boolean, jsonb) to authenticated;
