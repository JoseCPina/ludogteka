-- B21 (QA externa, 15 de octubre de 2026): una guardería ya FINALIZADA (el
-- perro ya se fue) seguía ocupando el rango de su día y rechazaba otra visita
-- del mismo día con «ya tiene una reserva que se traslapa», y esa reserva ni
-- salía en el calendario. Ahora el traslape por mascota solo cuenta las
-- estancias que ocupan o van a ocupar al perro: reservada, confirmada y en
-- curso. (El cupo de la casa, `calendario_ocupacion`, no cambia: lo que ya
-- pasó sigue contando en su historia.)
alter table public.estancias drop constraint estancias_perro_sin_traslape;
alter table public.estancias
  add constraint estancias_perro_sin_traslape
  exclude using gist (perro_id with =, rango with &&)
  where (deleted_at is null and estado not in ('cancelada', 'no_llego', 'finalizada'));

-- Con qué reserva choca un rango: para decirlo en el mensaje de traslape
-- (mascota, módulo, fechas y estado) y llevar al día correcto. Solo personal.
create or replace function public.estancia_que_choca(
  p_perro uuid, p_entrada date, p_salida date, p_excluir uuid default null
) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_fila record;
  v_hay boolean;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal puede consultar las reservas.' using errcode = '42501';
  end if;
  select e.id, e.fecha_entrada, e.fecha_salida, e.estado, s.categoria, s.nombre as servicio, p.nombre as perro
    into v_fila
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    join public.perros p on p.id = e.perro_id
   where e.perro_id = p_perro
     and e.deleted_at is null
     and e.estado not in ('cancelada', 'no_llego', 'finalizada')
     and (p_excluir is null or e.id <> p_excluir)
     and e.rango && daterange(p_entrada, p_salida)
   order by e.fecha_entrada
   limit 1;
  v_hay := found;
  if not v_hay then
    return null;
  end if;
  return jsonb_build_object(
    'estancia_id', v_fila.id,
    'perro', v_fila.perro,
    'modulo', v_fila.categoria,
    'servicio', v_fila.servicio,
    'entrada', v_fila.fecha_entrada,
    'salida', v_fila.fecha_salida,
    'estado', v_fila.estado,
    'dia', greatest(v_fila.fecha_entrada, p_entrada)
  );
end $$;
alter function public.estancia_que_choca(uuid, date, date, uuid) owner to peludesk_definer;
revoke execute on function public.estancia_que_choca(uuid, date, date, uuid) from public, anon;
grant execute on function public.estancia_que_choca(uuid, date, date, uuid) to authenticated, service_role;
