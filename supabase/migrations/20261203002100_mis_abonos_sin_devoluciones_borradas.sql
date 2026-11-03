-- mis_abonos (migración 20261203002000) contaba también devoluciones dadas de baja: solo las vigentes.
do $$
declare
  v_def text;
  v_viejo text := E'      where c.reserva_id = p_reserva and d.negocio_id = public.negocio_actual()\n';
  v_nuevo text := E'      where c.reserva_id = p_reserva and d.negocio_id = public.negocio_actual() and d.deleted_at is null\n';
begin
  select replace(pg_get_functiondef('public.mis_abonos(uuid)'::regprocedure), chr(13), '') into v_def;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'mis_abonos cambió: no encuentro el filtro de devoluciones tal cual.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
