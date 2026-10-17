-- Un solo mensaje para todo lo que impide agendar o mover una cita de estética: dice qué choca
-- (la estilista ya tiene a tal perro a tal hora, o está ausente) en vez de culpar al perro.
-- Lo usan el trigger de la cita, reasignar_estilista_cita y, si el choque llega como «empalme» de
-- la base (cita ya terminada, carrera), la app.
create or replace function public.cita_estetica_choques_texto(
  p_empleado uuid, p_inicio timestamptz, p_fin timestamptz, p_excluir uuid default null
) returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nombre text;
  v_items text[];
  v_n int;
  v_aus record;
  v_partes text[] := '{}';
begin
  if p_empleado is null or p_inicio is null or p_fin is null or p_fin <= p_inicio then
    return null;
  end if;
  if auth.uid() is not null and not coalesce(public.is_staff(), false) then
    return null;
  end if;
  select coalesce(nullif(btrim(nombre_completo), ''), 'La estilista') into v_nombre from public.profiles where id = p_empleado;
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
      v_nombre || ' ya tiene a ' ||
      case when v_n = 1 then v_items[1]
           else array_to_string(v_items[1:v_n - 1], ', a ') || ' y a ' || v_items[v_n] end
    );
  end if;

  select * into v_aus from public.ausencia_que_choca(p_empleado, p_inicio, p_fin);
  if found then
    v_partes := v_partes || public.ausencia_texto(v_aus.nombre, v_aus.tipo, v_aus.desde, v_aus.hasta, v_aus.hora_desde, v_aus.hora_hasta);
  end if;

  if array_length(v_partes, 1) is null then
    return null;
  end if;
  return array_to_string(v_partes, '. ') || '. Escoge a otra persona u otro horario.';
end;
$$;
alter function public.cita_estetica_choques_texto(uuid, timestamptz, timestamptz, uuid) owner to peludesk_definer;
revoke execute on function public.cita_estetica_choques_texto(uuid, timestamptz, timestamptz, uuid) from public, anon;
grant execute on function public.cita_estetica_choques_texto(uuid, timestamptz, timestamptz, uuid) to authenticated, service_role;

do $$
declare
  v_def text;
  v_viejo text;
  v_nuevo text;
begin
  -- Trigger de la cita
  select pg_get_functiondef('public.validar_cita_estetica()'::regprocedure) into v_def;
  v_viejo := E'    declare\n      v_aus record;\n    begin\n      select * into v_aus from public.ausencia_que_choca(new.empleado_id, new.inicio, new.fin);\n      if found then\n        raise exception ''%. Escoge a otra persona u otro horario.'',\n          public.ausencia_texto(v_aus.nombre, v_aus.tipo, v_aus.desde, v_aus.hasta, v_aus.hora_desde, v_aus.hora_hasta);\n      end if;\n    end;\n';
  v_nuevo := E'    declare\n      v_choque text;\n    begin\n      v_choque := public.cita_estetica_choques_texto(new.empleado_id, new.inicio, new.fin, new.id);\n      if v_choque is not null then\n        raise exception ''%'', v_choque;\n      end if;\n    end;\n';
  if position(v_viejo in v_def) = 0 then raise exception 'validar_cita_estetica: bloque no encontrado'; end if;
  execute replace(v_def, v_viejo, v_nuevo);

  -- Reasignar
  select pg_get_functiondef('public.reasignar_estilista_cita(uuid, uuid, text)'::regprocedure) into v_def;
  v_viejo := E'    declare\n      v_aus record;\n    begin\n      select * into v_aus from public.ausencia_que_choca(p_empleado_id, v_cita.inicio, v_cita.fin);\n      if found then\n        raise exception ''%. Escoge a otra persona.'',\n          public.ausencia_texto(v_aus.nombre, v_aus.tipo, v_aus.desde, v_aus.hasta, v_aus.hora_desde, v_aus.hora_hasta);\n      end if;\n    end;\n';
  v_nuevo := E'    declare\n      v_choque text;\n    begin\n      v_choque := public.cita_estetica_choques_texto(p_empleado_id, v_cita.inicio, v_cita.fin, p_cita_id);\n      if v_choque is not null then\n        raise exception ''%'', v_choque;\n      end if;\n    end;\n';
  if position(v_viejo in v_def) = 0 then raise exception 'reasignar_estilista_cita: bloque no encontrado'; end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
