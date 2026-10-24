-- Llegadas atrasadas (decisión del dueño, 24 de octubre de 2026): una reserva viva (reservada o confirmada) cuya
-- fecha de entrada ya pasó sin check-in deja de contar en la ocupación desde el día siguiente a su entrada, en la
-- pantalla y en el cupo al reservar (las dos usan ocupacion_del_dia). Sigue viva: el tablero la enseña en «Llegadas
-- atrasadas» para marcarla «No llegó», hacer el check-in tardío o reprogramarla. Con el check-in tardío vuelve a
-- contar desde ese momento (cuenta como adentro); reprogramada a hoy o después, cuenta como reserva.
--   - HOY: adentro (check-in sin check-out, aunque su salida prevista ya haya vencido) + las reservas vivas que
--     entran hoy y todavía no hacen check-in.
--   - DÍAS PASADOS: los que estuvieron adentro ese día.
--   - DÍAS FUTUROS: las reservas vivas que cubren el día y cuya entrada es hoy o después + los que están adentro y
--     su salida prevista alcanza ese día.
--   - Canceladas y no-show nunca.

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
