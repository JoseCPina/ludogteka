-- El aviso de traslape lleva a la reserva que choca (no solo al calendario).
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.estancia_que_choca(uuid, date, date, uuid)'::regprocedure) into v_def;
  if position('select e.id, e.fecha_entrada' in v_def) = 0 or position(E'''estancia_id'', v_fila.id,' in v_def) = 0 then
    raise exception 'estancia_que_choca: no encuentro dónde agregar la reserva';
  end if;
  v_def := replace(v_def, 'select e.id, e.fecha_entrada', 'select e.id, e.reserva_id, e.fecha_entrada');
  v_def := replace(v_def, E'''estancia_id'', v_fila.id,', E'''estancia_id'', v_fila.id,\n    ''reserva_id'', v_fila.reserva_id,');
  execute v_def;
end $$;
