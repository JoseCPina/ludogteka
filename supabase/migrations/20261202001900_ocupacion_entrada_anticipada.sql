-- QA S36 · N131: la ocupación cuenta a cada perro por su PRESENCIA real (N122). Lo que faltaba: el que entra antes de
-- su fecha de entrada (check-in anticipado; S33 entró el 25 con una reserva del 26) no contaba ese día, porque el filtro
-- de arriba pedía `fecha_entrada <= p_fecha`. Ahora cuenta desde el día de su entrada real. Lo demás se queda:
--   · con check-out hecho no cuenta ningún día posterior a su salida real (salida anticipada: libera los días que no usó);
--   · adentro con la salida vencida (salida tardía) cuenta hoy, y los días futuros solo hasta su salida prevista;
--   · reservas vivas cuentan los días futuros de su reserva.
-- `validar_estancia` usa esta misma función para el cupo al reservar (migración 20261202000300), así que el cambio
-- aplica en los dos lados.
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
     -- Desde su entrada prevista o, si entró antes, desde el día de su entrada real.
     and (e.fecha_entrada <= p_fecha
          or (e.hora_entrada_real is not null and (e.hora_entrada_real at time zone z.zona)::date <= p_fecha))
     and case
           when p_fecha = z.hoy then
             (e.hora_entrada_real is not null and e.hora_salida_real is null and e.estado <> 'finalizada')
             or (e.hora_entrada_real is null and e.estado in ('reservada', 'confirmada')
                 and e.fecha_entrada = p_fecha and e.fecha_salida > p_fecha)
           when p_fecha < z.hoy then
             e.hora_entrada_real is not null
             and (e.hora_entrada_real at time zone z.zona)::date <= p_fecha
             and (e.hora_salida_real is null
                  or (e.hora_salida_real at time zone z.zona)::date > p_fecha
                  or (not p_solo_hotel and (e.hora_salida_real at time zone z.zona)::date = p_fecha))
           else
             e.fecha_salida > p_fecha
             and ((e.estado in ('reservada', 'confirmada') and e.fecha_entrada >= z.hoy)
                  or (e.hora_entrada_real is not null and e.hora_salida_real is null and e.estado <> 'finalizada'))
         end;
$$;
revoke execute on function public.ocupacion_del_dia(date, boolean, uuid) from public, anon;
grant execute on function public.ocupacion_del_dia(date, boolean, uuid) to authenticated, service_role, peludesk_definer;
