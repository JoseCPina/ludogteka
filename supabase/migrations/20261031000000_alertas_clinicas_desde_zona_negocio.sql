-- B20 (QA externa, 15 de octubre de 2026): `inventario_clinico_alertas`
-- calculaba desde cuándo está bajo mínimo un producto con
-- `max(created_at)::date`, que es el día en la zona de la sesión (UTC), no
-- el del negocio: un movimiento de las 18:30 locales salía al día siguiente.
-- Se parcha con pg_get_functiondef + replace (la función no se reescribe).
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'inventario_clinico_alertas';
  if v_def is null then
    raise exception 'inventario_clinico_alertas no existe';
  end if;
  v_nuevo := replace(
    v_def,
    '(select max(m.created_at) from public.movimientos_inventario m where m.insumo_id = i.id)::date',
    'public.fecha_negocio((select max(m.created_at) from public.movimientos_inventario m where m.insumo_id = i.id))'
  );
  if v_nuevo = v_def then
    raise exception 'no se encontró el texto a reemplazar en inventario_clinico_alertas';
  end if;
  execute v_nuevo;
end $$;
