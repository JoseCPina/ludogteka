-- QA N35 (18 de octubre de 2026): el catálogo con el que nace un negocio nuevo de Estética solo traía las variantes
-- de baño (se copia del negocio modelo, y el de Ludogteka solo tiene esas). Un negocio nuevo ahora nace TAMBIÉN con
-- los servicios sueltos más comunes —corte de uñas, limpieza de oídos, corte de pelo y deslanado—, de precio único
-- (no dependen del grupo de raza, la talla ni el pelaje), SIN precio: el negocio los captura en Servicios y precios
-- (salen en «Precios sin capturar») y puede renombrarlos, cambiarles la duración o darlos de baja.
-- Solo cambia crear_negocio (negocios NUEVOS). Los negocios que ya existen no se tocan.
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.crear_negocio'::regproc), chr(13), '') into v_def;
  if position('estetica_corte_unas' in v_def) = 0 then
    if position(E'\n  return v_id;' in v_def) = 0 then
      raise exception 'crear_negocio cambió: no se encontró el return para agregar los servicios sueltos de estética.';
    end if;
    v_def := replace(v_def, E'\n  return v_id;', $bloque$

  -- Servicios sueltos de estética (precio único, sin precio capturado): el negocio los edita.
  insert into public.servicios (
    negocio_id, clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad,
    depende_grupo_raza, duracion_minutos, orden, incluye
  )
  select v_id, s.clave, s.nombre, 'estetica', 'sesion', false, false, false, false, s.duracion, s.orden, array[s.incluye]
  from (values
    ('estetica_corte_unas',     'Corte de uñas',      15, 8,  'Corte y limado de uñas.'),
    ('estetica_limpieza_oidos', 'Limpieza de oídos',  15, 9,  'Limpieza externa de los oídos.'),
    ('estetica_corte_pelo',     'Corte de pelo',      60, 10, 'Corte de pelo del cuerpo.'),
    ('estetica_deslanado',      'Deslanado',          60, 11, 'Retiro del pelo muerto con cepillado profundo.')
  ) as s(clave, nombre, duracion, orden, incluye)
  where not exists (select 1 from public.servicios x where x.negocio_id = v_id and x.clave = s.clave);

  return v_id;$bloque$);
    execute v_def;
  end if;
end $$;
