-- Veterinaria, Fase 0 · parte 6: el aviso «bajo mínimo» del inventario clínico
-- también dice desde cuándo. No se guarda cuándo cruzó el mínimo; la mejor
-- fecha de origen es la del último movimiento del producto (el que lo dejó
-- abajo), y la más vieja de todos los productos bajo mínimo es la que da la
-- antigüedad del aviso en «Necesita atención».
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
    select i.id,
           (select max(m.created_at) from public.movimientos_inventario m where m.insumo_id = i.id)::date as desde
    from public.insumos i
    where i.deleted_at is null and i.controla_lotes and public.existencia_actual_insumo(i.id) < i.stock_minimo
  )
  select case when not (select ok from permitido) then '{}'::jsonb else jsonb_build_object(
    'caducados', (select count(*) from lotes where estado_caducidad = 'caducado'),
    'por_caducar', (select count(*) from lotes where estado_caducidad = 'por_caducar'),
    'caducado_desde', (select min(fecha_caducidad) from lotes where estado_caducidad = 'caducado'),
    'por_caducar_primero', (select min(fecha_caducidad) from lotes where estado_caducidad = 'por_caducar'),
    'bajo_minimo', (select count(*) from minimos),
    'bajo_minimo_desde', (select min(desde) from minimos)
  ) end;
$$;
