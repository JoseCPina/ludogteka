-- QA N44 (18 de octubre de 2026): la estilista, con el formulario abierto, mandó un horario que el admin acababa de
-- ocupar para ella. No se creó doble cita, pero la pantalla dijo «No pudimos crear la reserva para esta cita»: la
-- cuenta de la cita (`reservas`) solo la podían crear admin y recepción, así que una estilista nunca podía agendar,
-- y además el choque no se revisaba antes. Ahora:
--   * `crear_reserva_para_cita(perro)` crea la cuenta de una cita de estética para cualquier persona del personal
--     (la cita misma sigue sujeta a su política: la estilista solo en su propia agenda).
--   * `borrar_reserva_vacia(reserva)` quita la cuenta que quedó sin nada cuando la cita no se pudo crear (antes el
--     DELETE de la pantalla no tenía política y la dejaba huérfana).
--   * `cita_estetica_choques_texto` habla de tú cuando la agenda es de quien agenda: «Ya tienes a … a las 17:00».

create or replace function public.crear_reserva_para_cita(p_perro_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_id uuid;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio agenda citas.' using errcode = '42501';
  end if;
  select cliente_id into v_cliente from public.perros
   where id = p_perro_id and negocio_id = public.negocio_actual() and deleted_at is null;
  if v_cliente is null then
    raise exception 'No encontramos a esa mascota.';
  end if;
  insert into public.reservas (cliente_id) values (v_cliente) returning id into v_id;
  return v_id;
end;
$$;
alter function public.crear_reserva_para_cita(uuid) owner to peludesk_definer;
revoke execute on function public.crear_reserva_para_cita(uuid) from public, anon;
grant execute on function public.crear_reserva_para_cita(uuid) to authenticated, service_role;

create or replace function public.borrar_reserva_vacia(p_reserva_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) then
    return false;
  end if;
  delete from public.reservas r
   where r.id = p_reserva_id
     and r.negocio_id = public.negocio_actual()
     and r.created_by = auth.uid()
     and r.created_at > now() - interval '15 minutes'
     and not exists (select 1 from public.estancias e where e.reserva_id = r.id)
     and not exists (select 1 from public.citas_estetica c where c.reserva_id = r.id)
     and not exists (select 1 from public.cargos_aplicados g where g.reserva_id = r.id)
     and not exists (select 1 from public.cobros b where b.reserva_id = r.id);
  return found;
end;
$$;
alter function public.borrar_reserva_vacia(uuid) owner to peludesk_definer;
revoke execute on function public.borrar_reserva_vacia(uuid) from public, anon;
grant execute on function public.borrar_reserva_vacia(uuid) to authenticated, service_role;
grant delete on public.reservas to peludesk_definer;

CREATE OR REPLACE FUNCTION public.cita_estetica_choques_texto(p_empleado uuid, p_inicio timestamp with time zone, p_fin timestamp with time zone, p_excluir uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_nombre text;
  v_items text[];
  v_n int;
  v_aus record;
  v_partes text[] := '{}';
  v_tu boolean := p_empleado = auth.uid();
begin
  if p_empleado is null or p_inicio is null or p_fin is null or p_fin <= p_inicio then
    return null;
  end if;
  if auth.uid() is not null and not coalesce(public.is_staff(), false) then
    return null;
  end if;
  select public.nombre_de_persona(p_empleado, 'La estilista') into v_nombre;
  v_nombre := coalesce(v_nombre, 'La estilista');

  select array_agg(p.nombre || ' a las ' || to_char(c.inicio at time zone public.zona_negocio(), 'HH24:MI') order by c.inicio, c.id)
    into v_items
  from public.citas_estetica c
  join public.perros p on p.id = c.perro_id
  where c.negocio_id = public.negocio_actual()
    and c.empleado_id = p_empleado
    and c.deleted_at is null
    and c.estado not in ('cancelada', 'no_llego')
    and c.rango && tstzrange(p_inicio, p_fin)
    and (p_excluir is null or c.id <> p_excluir);
  v_n := coalesce(array_length(v_items, 1), 0);
  if v_n > 0 then
    v_partes := v_partes || (
      case when v_tu then 'Ya tienes a ' else v_nombre || ' ya tiene a ' end ||
      case when v_n = 1 then v_items[1]
           else array_to_string(v_items[1:v_n - 1], ', a ') || ' y a ' || v_items[v_n] end
    );
  end if;

  select * into v_aus from public.ausencia_que_choca(p_empleado, p_inicio, p_fin);
  if found then
    v_partes := v_partes || public.ausencia_texto(v_nombre, v_aus.tipo, v_aus.desde, v_aus.hasta, v_aus.hora_desde, v_aus.hora_hasta);
  end if;

  if array_length(v_partes, 1) is null then
    return null;
  end if;
  return array_to_string(v_partes, '. ') || case when v_tu then '. Escoge otro horario.' else '. Escoge a otra persona u otro horario.' end;
end;
$function$;
