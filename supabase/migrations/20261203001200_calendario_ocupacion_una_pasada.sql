-- Tiempo de Recepción y Hotel (31 de octubre de 2026). Medido en producción: `calendario_ocupacion` tardaba de 120 ms
-- (Ludogteka) a 400 ms (demo) POR DÍA, porque por cada día llamaba dos veces a `ocupacion_del_dia` (una para el cupo
-- diurno y otra para el nocturno) y cada llamada volvía a recorrer todas las estancias del negocio y a resolver
-- `fecha_negocio()` / `zona_negocio()`. Los 14 días del tablero de Hotel costaban de 0.6 a 0.9 s en Ludogteka y en la
-- demo se pasaban del `statement_timeout`. Recepción pide un día (hoy) y pagaba 250–400 ms solo por eso.
--
-- Ahora el calendario se calcula en UNA pasada: se leen una vez las estancias vivas que tocan el rango, se cruzan con
-- los días y se cuentan con exactamente la misma regla que `ocupacion_del_dia` (N122 y llegadas atrasadas: hoy cuentan
-- los que están adentro y las llegadas pendientes de hoy; los días pasados, los que estuvieron; los futuros, las
-- reservas vivas con entrada de hoy en adelante más quien sigue adentro hasta su salida prevista; canceladas y no-show
-- nunca; en el diurno de un día pasado cuenta también quien salió ese día). `ocupacion_del_dia` no cambia: la sigue
-- usando `validar_estancia` (un día por reserva). Se comprobó en desarrollo que los dos dan lo mismo día por día en
-- rangos pasados, presentes y futuros (Huellitas y Ludogteka de desarrollo).
create or replace function public.calendario_ocupacion(p_desde date, p_hasta date)
returns table (
  fecha date,
  cupo_diurno int,
  ocupado_diurno int,
  disponible_diurno int,
  cupo_nocturno int,
  ocupado_nocturno int,
  disponible_nocturno int,
  cupo_estado text
)
language plpgsql
stable
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_zona text := public.zona_negocio();
  v_negocio uuid := public.negocio_actual();
begin
  -- Nunca contra un valor que pueda ser NULL: coalesce a false.
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal puede ver el cupo y la ocupación.';
  end if;

  return query
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  ),
  -- Las estancias vivas que pueden tocar el rango (una sola lectura), con sus fechas reales ya en la zona del negocio.
  est as (
    select e.fecha_entrada, e.fecha_salida, e.estado, e.hora_entrada_real, e.hora_salida_real,
           (e.hora_entrada_real at time zone v_zona)::date as ent_real,
           (e.hora_salida_real at time zone v_zona)::date as sal_real,
           (s.categoria = 'hotel') as es_hotel
      from public.estancias e
      join public.servicios s on s.id = e.servicio_id
     where e.deleted_at is null
       and e.negocio_id = coalesce(v_negocio, e.negocio_id)
       and e.estado not in ('cancelada', 'no_llego')
       and (e.fecha_salida >= p_desde or e.hora_salida_real is null or (e.hora_salida_real at time zone v_zona)::date >= p_desde)
       and (e.fecha_entrada <= p_hasta or (e.hora_entrada_real is not null and (e.hora_entrada_real at time zone v_zona)::date <= p_hasta))
  ),
  -- La regla de `ocupacion_del_dia`, día por día.
  calc as (
    select d.fecha, x.es_hotel,
      case
        when d.fecha = v_hoy then
          (x.hora_entrada_real is not null and x.hora_salida_real is null and x.estado <> 'finalizada')
          or (x.hora_entrada_real is null and x.estado in ('reservada', 'confirmada')
              and x.fecha_entrada = d.fecha and x.fecha_salida > d.fecha)
        when d.fecha < v_hoy then
          x.hora_entrada_real is not null and x.ent_real <= d.fecha
          and (x.hora_salida_real is null or x.sal_real > d.fecha)
        else
          x.fecha_salida > d.fecha
          and ((x.estado in ('reservada', 'confirmada') and x.fecha_entrada >= v_hoy)
               or (x.hora_entrada_real is not null and x.hora_salida_real is null and x.estado <> 'finalizada'))
      end as ocupa,
      -- Solo en el diurno: en un día pasado cuenta también quien salió ese mismo día.
      (d.fecha < v_hoy and x.hora_entrada_real is not null and x.ent_real <= d.fecha and x.sal_real = d.fecha) as salio_ese_dia
      from dias d
      join est x on (x.fecha_entrada <= d.fecha or (x.ent_real is not null and x.ent_real <= d.fecha))
  ),
  cuenta as (
    select d.fecha,
           coalesce(count(*) filter (where c.ocupa or c.salio_ese_dia), 0)::int as diurno,
           coalesce(count(*) filter (where c.es_hotel and c.ocupa), 0)::int as nocturno
      from dias d
      left join calc c on c.fecha = d.fecha
     group by d.fecha
  )
  select
    c.fecha,
    cc.cupo_diurno,
    c.diurno as ocupado_diurno,
    cc.cupo_diurno - c.diurno as disponible_diurno,
    cc.cupo_nocturno,
    c.nocturno as ocupado_nocturno,
    cc.cupo_nocturno - c.nocturno as disponible_nocturno,
    cc.estado as cupo_estado
  from cuenta c
  cross join lateral public.resolver_cupo_configuracion(c.fecha) as cc
  order by c.fecha;
end;
$$;
revoke execute on function public.calendario_ocupacion(date, date) from public, anon;
grant execute on function public.calendario_ocupacion(date, date) to authenticated;

-- Índice para la pasada: las estancias vivas de un negocio por su rango de fechas (el que ya había es por entrada).
create index if not exists estancias_negocio_salida_idx on public.estancias (negocio_id, fecha_salida) where deleted_at is null;
