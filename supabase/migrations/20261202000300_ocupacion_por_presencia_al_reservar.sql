-- N122, segunda parte (QA R41, 24 de octubre de 2026): el cupo que se VALIDA al reservar (validar_estancia) también
-- contaba por fechas reservadas: con la estancia de check-out hecho el 24 y salida prevista el 26, no dejaba reservar
-- el 25 aunque la pantalla ya lo diera libre. Una sola regla para lo que se ve y lo que se valida:
-- `ocupacion_del_dia(fecha, solo_hotel, excluir)` (la de 20261202000000, ahora en una función) la usan
-- calendario_ocupacion (tableros, inicio, /reservas/calendario) y validar_estancia (al reservar o mover fechas).
--   - HOY: los que están adentro (check-in sin check-out), aunque su salida prevista ya haya vencido.
--   - DÍAS PASADOS: los que estuvieron adentro ese día (de noche, los de hotel con check-out después de ese día).
--   - DÍAS FUTUROS: reservas vivas (reservada o confirmada) que cubren el día + los que están adentro y su salida
--     prevista alcanza ese día.
--   - Canceladas y no-show nunca.
-- `solo_hotel` = el cupo nocturno (perros que duermen ahí); sin él, el diurno (toda la casa). Solo las estancias del
-- negocio de la petición (la llave de servicio ve todos los negocios).

create or replace function public.ocupacion_del_dia(p_fecha date, p_solo_hotel boolean, p_excluir uuid default null)
returns int
language sql
stable
set search_path = ''
as $$
  with z as (select public.fecha_negocio() as hoy, public.zona_negocio() as zona)
  select count(*)::int
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    cross join z
   where e.deleted_at is null
     and e.negocio_id = coalesce(public.negocio_actual(), e.negocio_id)
     and e.estado not in ('cancelada', 'no_llego')
     and (p_excluir is null or e.id <> p_excluir)
     and (not p_solo_hotel or s.categoria = 'hotel')
     and e.fecha_entrada <= p_fecha
     and case
           when p_fecha = z.hoy then
             e.hora_entrada_real is not null and e.hora_salida_real is null and e.estado <> 'finalizada'
           when p_fecha < z.hoy then
             e.hora_entrada_real is not null
             and (e.hora_entrada_real at time zone z.zona)::date <= p_fecha
             and (e.hora_salida_real is null
                  or (e.hora_salida_real at time zone z.zona)::date > p_fecha
                  or (not p_solo_hotel and (e.hora_salida_real at time zone z.zona)::date = p_fecha))
           else
             e.fecha_salida > p_fecha
             and (e.estado in ('reservada', 'confirmada')
                  or (e.hora_entrada_real is not null and e.hora_salida_real is null and e.estado <> 'finalizada'))
         end;
$$;
revoke execute on function public.ocupacion_del_dia(date, boolean, uuid) from public, anon;
grant execute on function public.ocupacion_del_dia(date, boolean, uuid) to authenticated, service_role, peludesk_definer;

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
begin
  -- Nunca contra un valor que pueda ser NULL: coalesce a false.
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal puede ver el cupo y la ocupación.';
  end if;

  return query
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  ),
  cuenta as (
    select dias.fecha, public.ocupacion_del_dia(dias.fecha, false) as diurno, public.ocupacion_del_dia(dias.fecha, true) as nocturno
      from dias
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

-- validar_estancia: el mismo conteo al reservar (se cambian solo los dos conteos; el resto de la función no se toca).
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.validar_estancia()'::regprocedure), chr(13), '') into v_def;
  if position('public.ocupacion_del_dia(' in v_def) > 0 then
    return;
  end if;
  v_def := replace(v_def,
'      select count(*) into v_ocupado_diurno
      from public.estancias e
      where e.deleted_at is null
        and e.estado not in (''cancelada'', ''no_llego'')
        and e.id is distinct from new.id
        and daterange(e.fecha_entrada, e.fecha_salida) @> v_fecha;',
'      -- N122: los que ocupan ese día según la misma regla que la pantalla (adentro hoy; reservas vivas después).
      v_ocupado_diurno := public.ocupacion_del_dia(v_fecha, false, new.id);');
  v_def := replace(v_def,
'        select count(*) into v_ocupado_nocturno
        from public.estancias e
        join public.servicios s on s.id = e.servicio_id
        where e.deleted_at is null
          and e.estado not in (''cancelada'', ''no_llego'')
          and e.id is distinct from new.id
          and s.categoria = ''hotel''
          and daterange(e.fecha_entrada, e.fecha_salida) @> v_fecha;',
'        v_ocupado_nocturno := public.ocupacion_del_dia(v_fecha, true, new.id);');
  if (length(v_def) - length(replace(v_def, 'public.ocupacion_del_dia(', ''))) / length('public.ocupacion_del_dia(') <> 2 then
    raise exception 'validar_estancia cambió: no se pudieron cambiar los dos conteos del cupo.';
  end if;
  execute v_def;
end $$;
