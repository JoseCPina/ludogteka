-- "Juntar en una sola cuenta todo lo cobrable de una reserva: estancias
-- de varios perros, cargos aplicados y citas de estética ligadas."
--
-- Una cita de estética SIEMPRE trae su propia reserva_id (crearCita crea
-- una reserva nueva incluso cuando la cita queda ligada a una estancia en
-- curso, Fase 4) — por eso una cita ligada a una estancia de ESTA reserva
-- se incluye por estancia_id, no por su propio reserva_id, que apunta a
-- otro lado. Una cita suelta (sin estancia_id) sí se incluye por su
-- propio reserva_id. No hay traslape entre ambos casos: una cita ligada
-- nunca comparte reserva_id con la estancia a la que está ligada.
--
-- Bug real encontrado al construir esto: la pantalla de check-in/checkout
-- (estancia-fila.tsx) mostraba precio_unitario tal cual como si fuera el
-- total de la estancia. Según la propia documentación de tarifas
-- ("el total de una estancia de N noches es N × precio del tramo"),
-- precio_unitario es tarifa POR NOCHE/DÍA — para guardería (siempre 1
-- día) el bug era invisible; para hotel de varias noches, cobraba de
-- menos. cuenta_lineas_reserva es la única fuente de verdad del total de
-- cada línea desde ahora; estancia-fila.tsx se corrige en el mismo commit
-- para multiplicar por noches en vez de repetir el cálculo a mano.
create or replace function public.cuenta_lineas_reserva(p_reserva_id uuid)
returns table (
  tipo text,
  origen_id uuid,
  descripcion text,
  cantidad numeric,
  precio_unitario numeric,
  total numeric
)
language sql
stable
set search_path = ''
as $$
  select
    'estancia'::text,
    e.id,
    p.nombre || ' — ' || s.nombre,
    (e.fecha_salida - e.fecha_entrada)::numeric,
    e.precio_unitario,
    e.precio_unitario * (e.fecha_salida - e.fecha_entrada)::numeric
  from public.estancias e
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = e.servicio_id
  where e.reserva_id = p_reserva_id
    and e.deleted_at is null
    and e.estado not in ('cancelada', 'no_llego')

  union all

  select
    'cargo'::text,
    c.id,
    p.nombre || ' — ' || s.nombre,
    c.cantidad::numeric,
    c.precio,
    c.precio * c.cantidad
  from public.cargos_aplicados c
  join public.estancias e on e.id = c.estancia_id
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = c.servicio_id
  where e.reserva_id = p_reserva_id
    and c.deleted_at is null
    and c.cancelado = false

  union all

  select
    'estetica'::text,
    ce.id,
    p.nombre || ' — ' || s.nombre,
    1::numeric,
    ce.precio,
    ce.precio
  from public.citas_estetica ce
  join public.perros p on p.id = ce.perro_id
  join public.servicios s on s.id = ce.servicio_id
  left join public.estancias e on e.id = ce.estancia_id
  where (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
    and ce.deleted_at is null
    and ce.estado not in ('cancelada', 'no_llego');
$$;

grant execute on function public.cuenta_lineas_reserva(uuid) to authenticated;

-- Totales de la cuenta. Subconsultas escalares separadas a propósito:
-- unir estancias + cargos + citas + cobros + devoluciones en un solo
-- join multiplicaría filas entre sí (fan-out) e inflaría las sumas —
-- error clásico de "sum de un join", no una elección de estilo.
--
-- saldo puede ser negativo (anticipo/a favor del cliente) — no es un
-- error, "pagos parciales y anticipos" lo permite explícitamente. No hay
-- bloqueo aquí sobre cobrar de más; sí lo hay en registrar_devolucion
-- sobre devolver de más de lo cobrado.
create or replace function public.cuenta_totales_reserva(p_reserva_id uuid)
returns table (
  total_cuenta numeric,
  total_cobrado numeric,
  total_propinas numeric,
  total_devuelto numeric,
  saldo numeric
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce((select sum(l.total) from public.cuenta_lineas_reserva(p_reserva_id) l), 0) as total_cuenta,
    coalesce((
      select sum(cm.monto) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.reserva_id = p_reserva_id
    ), 0) as total_cobrado,
    coalesce((
      select sum(cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.reserva_id = p_reserva_id
    ), 0) as total_propinas,
    coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      join public.cobros c on c.id = d.cobro_id
      where c.reserva_id = p_reserva_id
    ), 0) as total_devuelto,
    coalesce((select sum(l.total) from public.cuenta_lineas_reserva(p_reserva_id) l), 0)
      - coalesce((
        select sum(cm.monto) from public.cobro_metodos cm
        join public.cobros c on c.id = cm.cobro_id
        where c.reserva_id = p_reserva_id
      ), 0)
      + coalesce((
        select sum(dm.monto) from public.devolucion_metodos dm
        join public.devoluciones d on d.id = dm.devolucion_id
        join public.cobros c on c.id = d.cobro_id
        where c.reserva_id = p_reserva_id
      ), 0) as saldo;
$$;

grant execute on function public.cuenta_totales_reserva(uuid) to authenticated;
