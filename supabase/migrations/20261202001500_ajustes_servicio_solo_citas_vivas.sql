-- Caja → Ajustes por corrección de servicio enlazaba a citas dadas de baja (25 de octubre de 2026, Huellitas:
-- /estetica/08853dea… respondía 404). ajustes_servicio_por_atender() unía la corrección con su cita y su cuenta SIN
-- mirar deleted_at: una cita borrada cuya cuenta conservaba saldo seguía en la lista con «Ver la cita», y la ficha de
-- la cita (que sí filtra las borradas) daba 404. El saldo de esa cuenta no se pierde: sigue en la cuenta.
-- Se parcha la definición viva (la de 20261024500000 ya trae lo de las cuentas canceladas). Idempotente.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := replace(pg_get_functiondef('public.ajustes_servicio_por_atender()'::regprocedure), chr(13), '');
  if position('ce.deleted_at is null' in v_def) > 0 then
    return;
  end if;
  v_nuevo := replace(v_def,
    'join public.citas_estetica ce on ce.id = k.cita_id',
    'join public.citas_estetica ce on ce.id = k.cita_id and ce.deleted_at is null');
  v_nuevo := replace(v_nuevo,
    'join public.reservas r on r.id = k.reserva_id',
    'join public.reservas r on r.id = k.reserva_id and r.deleted_at is null');
  if position('ce.deleted_at is null' in v_nuevo) = 0 or position('r.deleted_at is null' in v_nuevo) = 0 then
    raise exception 'ajustes_servicio_por_atender cambió: no se pudo dejar fuera las citas y cuentas borradas.';
  end if;
  execute v_nuevo;
end $$;
