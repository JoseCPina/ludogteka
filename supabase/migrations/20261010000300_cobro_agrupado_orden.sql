-- Los cobros de un pago agrupado se crean en la misma transacción (mismo
-- created_at): su posición en el reparto (la cuenta más antigua es la 1) se
-- guarda para poder listarlos y fusionarlos siempre en el mismo orden.
alter table public.cobros add column grupo_orden smallint;

do $$
declare
  v_def text;
  v_nuevo text;
begin
  select replace(pg_get_functiondef('public.cobro_grupo_aplicar(uuid,uuid,jsonb,jsonb,text,text,uuid,boolean,uuid)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def,
    E'    insert into public.cobros (reserva_id, turno_id, notas, origen, grupo_id, created_by)\n    values (v_res[v_i], p_turno_id,',
    E'    insert into public.cobros (reserva_id, turno_id, notas, origen, grupo_id, grupo_orden, created_by)\n    values (v_res[v_i], p_turno_id,');
  if v_nuevo = v_def then raise exception 'cobro_grupo_aplicar cambió (columnas).'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, E'      p_origen, v_grupo, p_actor)\n    returning id into v_idc;', E'      p_origen, v_grupo, v_i, p_actor)\n    returning id into v_idc;');
  if v_nuevo = v_def then raise exception 'cobro_grupo_aplicar cambió (valores).'; end if;
  execute v_nuevo;

  select replace(pg_get_functiondef('public.cobro_grupo_detalle(uuid)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def, E') order by c.created_at, c.id)', E') order by c.grupo_orden, c.created_at, c.id)');
  if v_nuevo = v_def then raise exception 'cobro_grupo_detalle cambió.'; end if;
  execute v_nuevo;

  select replace(pg_get_functiondef('public.cobro_de_orden_para_monto(uuid,uuid,numeric)'::regprocedure), chr(13), '') into v_def;
  v_nuevo := replace(v_def, 'order by c.created_at, c.id limit 1', 'order by c.grupo_orden, c.created_at, c.id limit 1');
  if v_nuevo = v_def then raise exception 'cobro_de_orden_para_monto cambió.'; end if;
  execute v_nuevo;
end $$;
