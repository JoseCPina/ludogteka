-- Ocupación de HOY con las llegadas pendientes (decisión del dueño, 24 de octubre de 2026): además de los que están
-- adentro, cuentan las reservas vivas (reservada o confirmada) que cubren hoy y todavía no hacen check-in. Con 8
-- adentro, 5 por llegar y cupo de 10, ya no deja reservar hoy. Una llegada pendiente que se marca no-show o se cancela
-- deja de contar al momento. Es la misma función para la pantalla (calendario_ocupacion) y para el cupo al reservar
-- (validar_estancia): las dos la llaman, así que basta con cambiarla aquí.
--   - HOY: adentro (check-in sin check-out, aunque su salida prevista ya haya vencido) + llegadas pendientes.
--   - DÍAS PASADOS y FUTUROS: igual que en 20261202000300.

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
             or (e.hora_entrada_real is null and e.estado in ('reservada', 'confirmada') and e.fecha_salida > p_fecha)
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
