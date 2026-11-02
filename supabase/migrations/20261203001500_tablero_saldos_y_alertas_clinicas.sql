-- Tiempo de /admin y /recepcion, segunda vuelta (1 de noviembre de 2026; docs/rendimiento-panel.md).
--
-- 1. Saldos de perros que ya se fueron, en UNA consulta. El tablero llamaba `cuentas_abiertas_json(120)` (todas las
--    cuentas abiertas de ±120 días, ~85 ms y el JSON entero) y después, en dos viajes más, leía las estancias y las citas
--    de esas reservas para quedarse con las que ya terminaron y con saldo. Ahora la base devuelve directamente esa lista:
--    misma cuenta y mismo saldo que Caja (`cuentas_abiertas`), filtrada ahí: saldo > 0, nada pendiente (estancia o cita
--    reservada, confirmada o en curso) y la salida real del último perro.
create or replace function public.saldos_de_salidas_json(p_dias integer default 120)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with abiertas as materialized (
    select c.reserva_id, c.cliente_nombre, c.perros, c.descripcion, c.saldo
    from public.cuentas_abiertas(p_dias) c
    where c.saldo > 0
  ),
  movimiento as (
    select e.reserva_id,
           bool_or(e.estado in ('reservada', 'confirmada', 'en_curso')) as pendiente,
           max(case when e.estado = 'finalizada' then e.hora_salida_real end) as salida
    from public.estancias e
    where e.deleted_at is null and e.reserva_id in (select reserva_id from abiertas)
    group by e.reserva_id
    union all
    select ce.reserva_id,
           bool_or(ce.estado in ('reservada', 'confirmada', 'en_curso')),
           max(case when ce.estado = 'finalizada' then ce.fin end)
    from public.citas_estetica ce
    where ce.deleted_at is null and ce.reserva_id in (select reserva_id from abiertas)
    group by ce.reserva_id
  ),
  por_reserva as (
    select m.reserva_id, bool_or(m.pendiente) as pendiente, max(m.salida) as salida
    from movimiento m
    group by m.reserva_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'reserva_id', a.reserva_id, 'cliente_nombre', a.cliente_nombre, 'perros', a.perros, 'descripcion', a.descripcion,
      'saldo', a.saldo, 'salio_el', r.salida
    ) order by r.salida, a.reserva_id), '[]'::jsonb)
  from abiertas a
  join por_reserva r on r.reserva_id = a.reserva_id
  where not r.pendiente and r.salida is not null;
$$;
revoke execute on function public.saldos_de_salidas_json(integer) from public, anon;
grant execute on function public.saldos_de_salidas_json(integer) to authenticated, service_role;

-- 2. Alertas del inventario clínico en una pasada. `bajo_minimo` llamaba `existencia_actual_insumo(i.id)` por cada
--    insumo con lotes (una suma de movimientos por insumo, una tras otra): lineal en insumos × movimientos. Ahora la
--    existencia de todos los insumos con lotes se calcula con un solo recorrido de `movimientos_inventario` agrupado por
--    insumo, con la misma regla que `existencia_actual_insumo`. El resto (lotes caducados o por caducar) no cambia.
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
  con_lotes as (
    select i.id, i.existencia_inicial, i.stock_minimo
    from public.insumos i
    where i.deleted_at is null and i.controla_lotes and i.negocio_id = public.negocio_actual()
  ),
  movimientos as (
    select m.insumo_id,
           sum(case
             when m.tipo in ('entrada_compra', 'ajuste_positivo') then m.cantidad_base
             when m.tipo in ('salida_consumo', 'salida_merma', 'salida_venta', 'ajuste_negativo') then -m.cantidad_base
             else 0
           end) as neto,
           -- El día del último movimiento en la zona del negocio (nunca el de la sesión).
           (max(m.created_at) at time zone public.zona_negocio())::date as ultimo
    from public.movimientos_inventario m
    where m.insumo_id in (select id from con_lotes)
    group by m.insumo_id
  ),
  minimos as (
    select c.id, mv.ultimo as desde
    from con_lotes c
    left join movimientos mv on mv.insumo_id = c.id
    where c.existencia_inicial + coalesce(mv.neto, 0) < c.stock_minimo
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
alter function public.inventario_clinico_alertas() owner to peludesk_definer;
revoke execute on function public.inventario_clinico_alertas() from public, anon;
grant execute on function public.inventario_clinico_alertas() to authenticated, service_role;
