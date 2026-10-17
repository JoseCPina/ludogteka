-- Rechequeo de la QA externa (17 de octubre de 2026).
-- 1) Un link de alta/complemento NO se genera para un cliente que ya tiene cuenta activa en este negocio
--    (la invitación al portal ya lo rechazaba; ahora el link de alta dice lo mismo).
-- 2) La vista previa del importador aplica la MISMA regla que el proceso (perro_faltantes_alta): una mascota
--    nueva sin lo obligatorio sale con error antes de importar, no al procesar.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'crear_invitacion_cliente';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def,
    E'      raise exception ''Ese cliente no existe.'';\n    end if;\n',
    E'      raise exception ''Ese cliente no existe.'';\n    end if;\n\n    if exists (\n      select 1 from public.membresias m\n      where m.cliente_id = p_cliente_id and m.negocio_id = (select public.negocio_actual()) and m.deleted_at is null\n    ) then\n      raise exception ''Este cliente ya tiene cuenta activa. No hace falta mandarle un link.'';\n    end if;\n');
  -- El alta nueva por un teléfono que ya es de un cliente con cuenta dice lo mismo.
  v_nuevo := replace(v_nuevo,
    E'  v_token := replace(gen_random_uuid()::text, ''-'', '''')',
    E'  if p_cliente_id is null and exists (\n    select 1 from public.clientes c\n    join public.membresias m on m.cliente_id = c.id and m.negocio_id = c.negocio_id and m.deleted_at is null\n    where c.negocio_id = (select public.negocio_actual()) and c.deleted_at is null and c.telefono = btrim(p_telefono)\n  ) then\n    raise exception ''Este cliente ya tiene cuenta activa. No hace falta mandarle un link.'';\n  end if;\n\n  v_token := replace(gen_random_uuid()::text, ''-'', '''')');
  if v_nuevo = v_def or position('ya tiene cuenta activa' in v_nuevo) = 0 or position('p_cliente_id is null and exists' in v_nuevo) = 0 then
    raise exception 'crear_invitacion_cliente: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.pronamespace = 'public'::regnamespace and p.proname = 'importacion_revisar';
  v_def := replace(v_def, E'\r', '');
  v_nuevo := replace(v_def,
    E'  v_raza_estado text;\nbegin',
    E'  v_raza_estado text;\n  v_tam uuid;\n  v_pel uuid;\n  v_falta text[];\nbegin');
  v_nuevo := replace(v_nuevo,
    E'    v_salida := v_salida || jsonb_build_array(jsonb_build_object(',
    E'    v_falta := ''{}'';\n    if nullif(btrim(coalesce(e->>''mascota'', '''')), '''') is not null and v_perro is null then\n      select t.id into v_tam from public.tamanos_categoria t where t.clave = nullif(e->>''tamano'', '''') and t.deleted_at is null;\n      select p.id into v_pel from public.tipos_pelaje p where p.clave = nullif(e->>''pelaje'', '''') and p.deleted_at is null;\n      v_falta := public.perro_faltantes_alta(nullif(btrim(coalesce(e->>''raza'', '''')), ''''), v_raza, v_tam, v_pel);\n    end if;\n    v_salida := v_salida || jsonb_build_array(jsonb_build_object(');
  v_nuevo := replace(v_nuevo,
    E'      ''raza_estado'', v_raza_estado\n',
    E'      ''raza_estado'', v_raza_estado,\n      ''faltantes'', to_jsonb(v_falta)\n');
  if v_nuevo = v_def or position('perro_faltantes_alta' in v_nuevo) = 0 or position('faltantes' in v_nuevo) = 0 then
    raise exception 'importacion_revisar: el parche no encontró el texto esperado';
  end if;
  execute v_nuevo;
end;
$$;
