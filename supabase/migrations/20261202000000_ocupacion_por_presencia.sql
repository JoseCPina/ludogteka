-- N122 (QA R41, 24 de octubre de 2026): la ocupación de la casa contaba por FECHAS RESERVADAS, no por quién está
-- adentro. Una estancia con check-out el 24 (salida prevista el 26) seguía ocupando el 24 y el 25, y un perro con la
-- salida vencida (prevista el 20) que todavía no hacía check-out no contaba en ningún día.
--
-- Regla (calendario_ocupacion; la usan el tablero de Guardería y de Hotel, el inicio y /reservas/calendario):
--   - HOY: los perros que están adentro ahora (check-in hecho y sin check-out), aunque su salida prevista ya haya
--     vencido. El check-out libera el cupo desde ese momento. Una llegada de hoy cuenta cuando hace check-in.
--   - DÍAS PASADOS: los que estuvieron adentro ese día (en el diurno, check-in ese día o antes y check-out ese día o
--     después, o todavía adentro; en el nocturno, los de hotel que durmieron ahí: check-out después de ese día).
--   - DÍAS FUTUROS: las reservas vivas (reservada o confirmada) que cubren ese día, más los perros que están adentro
--     y cuya salida prevista todavía alcanza ese día.
--   - Canceladas y no-show nunca cuentan; finalizadas solo en los días que el perro estuvo.
-- Los días del check-in y el check-out se leen en la zona del negocio.

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
begin
  -- Nunca contra un valor que pueda ser NULL: coalesce a false.
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal puede ver el cupo y la ocupación.';
  end if;

  return query
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  ),
  vivas as (
    select e.fecha_entrada, e.fecha_salida, e.estado, s.categoria = 'hotel' as es_hotel,
           e.hora_entrada_real is not null and e.hora_salida_real is null and e.estado <> 'finalizada' as adentro,
           (e.hora_entrada_real at time zone v_zona)::date as dia_entrada_real,
           (e.hora_salida_real at time zone v_zona)::date as dia_salida_real
      from public.estancias e
      join public.servicios s on s.id = e.servicio_id
     where e.deleted_at is null
       and e.estado not in ('cancelada', 'no_llego')
       and e.fecha_entrada <= p_hasta
       and (e.fecha_salida > p_desde or (e.hora_entrada_real is not null and e.hora_salida_real is null)
            or e.hora_salida_real >= p_desde::timestamp at time zone v_zona)
  ),
  cuenta as (
    select dias.fecha,
           count(*) filter (where
             case
               when dias.fecha = v_hoy then v.adentro
               when dias.fecha < v_hoy then v.dia_entrada_real <= dias.fecha
                                            and (v.dia_salida_real is null or v.dia_salida_real >= dias.fecha)
               else (v.estado in ('reservada', 'confirmada') and v.fecha_entrada <= dias.fecha and v.fecha_salida > dias.fecha)
                    or (v.adentro and v.fecha_salida > dias.fecha)
             end) as diurno,
           count(*) filter (where v.es_hotel and
             case
               when dias.fecha = v_hoy then v.adentro
               when dias.fecha < v_hoy then v.dia_entrada_real <= dias.fecha
                                            and (v.dia_salida_real is null or v.dia_salida_real > dias.fecha)
               else (v.estado in ('reservada', 'confirmada') and v.fecha_entrada <= dias.fecha and v.fecha_salida > dias.fecha)
                    or (v.adentro and v.fecha_salida > dias.fecha)
             end) as nocturno
      from dias
      left join vivas v on true
     group by dias.fecha
  )
  select
    dias.fecha,
    cc.cupo_diurno,
    coalesce(c.diurno, 0)::int as ocupado_diurno,
    cc.cupo_diurno - coalesce(c.diurno, 0)::int as disponible_diurno,
    cc.cupo_nocturno,
    coalesce(c.nocturno, 0)::int as ocupado_nocturno,
    cc.cupo_nocturno - coalesce(c.nocturno, 0)::int as disponible_nocturno,
    cc.estado as cupo_estado
  from dias
  cross join lateral public.resolver_cupo_configuracion(dias.fecha) as cc
  left join cuenta c on c.fecha = dias.fecha
  order by dias.fecha;
end;
$$;

-- revoke from public no le quita el permiso a anon en Supabase: se nombra.
revoke execute on function public.calendario_ocupacion(date, date) from public, anon;
grant execute on function public.calendario_ocupacion(date, date) to authenticated;
