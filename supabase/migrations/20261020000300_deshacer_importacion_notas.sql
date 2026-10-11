-- Deshacer una importación: las notas internas que la propia importación creó (clientes_notas_internas y
-- perros_notas_clinicas, ver 20261019000000) son parte de la importación y no cuentan como "registros
-- que no son de la importación". Si alguien las editó después, la nota toca el updated_at del dueño o de
-- la mascota y el bloqueo de "se modificó después" ya lo detiene.
-- Reversa: volver a parchar la función sin esas dos líneas.
do $$
declare
  v_def text;
begin
  v_def := pg_get_functiondef('public.importacion_deshacer_revisar(uuid)'::regprocedure);
  v_def := replace(v_def, E'\r', '');
  if v_def not like '%clientes_notas_internas%' then
    v_def := replace(v_def, E'  loop\n    if fk.destino = ''public.clientes'' then',
      E'  loop\n    if fk.tabla in (''public.clientes_notas_internas'', ''public.perros_notas_clinicas'') then continue; end if;\n    if fk.destino = ''public.clientes'' then');
    if v_def not like '%clientes_notas_internas%' then
      raise exception 'No se pudo parchar importacion_deshacer_revisar: cambió su texto.';
    end if;
    execute v_def;
  end if;
end $$;
