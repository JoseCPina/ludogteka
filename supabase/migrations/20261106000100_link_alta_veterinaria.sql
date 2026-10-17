-- El link de alta tiene un tercer tipo, «veterinaria» (dueño y mascota, sin contrato de guardería), y
-- el servidor solo deja crear un link de un servicio que el negocio tiene prendido.
alter table public.invitaciones_cliente drop constraint invitaciones_cliente_tipo_check;
alter table public.invitaciones_cliente
  add constraint invitaciones_cliente_tipo_check check (tipo = any (array['guarderia_hotel', 'estetica', 'veterinaria']));

do $$
declare
  v_def text;
  v_viejo text := E'  if p_tipo is null or p_tipo not in (''guarderia_hotel'', ''estetica'') then\n    raise exception ''El tipo de link debe ser guarderia_hotel o estetica.'';\n  end if;\n';
  v_nuevo text := E'  if p_tipo is null or p_tipo not in (''guarderia_hotel'', ''estetica'', ''veterinaria'') then\n    raise exception ''El tipo de link debe ser guarderia_hotel, estetica o veterinaria.'';\n  end if;\n'
    || E'  if p_tipo = ''guarderia_hotel'' and not (public.modulo_activo(''guarderia'') or public.modulo_activo(''hotel'')) then\n'
    || E'    raise exception ''Tu negocio no tiene prendida la guardería ni el hotel: escoge uno de los servicios que sí tienes.'';\n'
    || E'  elsif p_tipo = ''estetica'' and not public.modulo_activo(''estetica'') then\n'
    || E'    raise exception ''Tu negocio no tiene prendida la estética: escoge uno de los servicios que sí tienes.'';\n'
    || E'  elsif p_tipo = ''veterinaria'' and not public.modulo_activo(''veterinaria'') then\n'
    || E'    raise exception ''Tu negocio no tiene prendida la veterinaria: escoge uno de los servicios que sí tienes.'';\n'
    || E'  end if;\n';
begin
  select pg_get_functiondef('public.crear_invitacion_cliente(text, text, integer, text, uuid)'::regprocedure) into v_def;
  if position(v_viejo in v_def) = 0 then raise exception 'crear_invitacion_cliente: bloque no encontrado'; end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
