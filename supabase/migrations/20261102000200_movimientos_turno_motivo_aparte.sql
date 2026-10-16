-- N7 (QA externa, rechequeo del 16 de octubre de 2026): en «Movimientos de este turno» el efectivo agregado salía
-- como «Cambio — nota». Ahora la nota va tal cual en la descripción y el motivo (cambio, ingreso, otro…) viaja
-- aparte en la columna `origen` de ese renglón, para pintarlo como etiqueta propia.
do $$
declare
  v_def text;
  v_nuevo text;
begin
  v_def := pg_get_functiondef('public.movimientos_turno(uuid)'::regprocedure);
  v_nuevo := replace(v_def,
    $a$case when mc.tipo = 'ingreso' then mc.motivo || coalesce(' — ' || mc.nota, '') else mc.motivo end,$a$,
    $a$case when mc.tipo = 'ingreso' then coalesce(mc.nota, '') else mc.motivo end,$a$);
  if v_nuevo = v_def then
    raise exception 'movimientos_turno: no se encontró la descripción del efectivo agregado';
  end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def,
    $a$    0,
    'manual',
    mc.created_by,$a$,
    $a$    0,
    case when mc.tipo = 'ingreso' then coalesce(mc.origen_ingreso, 'otro') else 'manual' end,
    mc.created_by,$a$);
  if v_nuevo = v_def then
    raise exception 'movimientos_turno: no se encontró el origen del renglón de caja';
  end if;
  execute v_nuevo;
end $$;
