-- «No se presentó» en el demo (24 de octubre de 2026): demo_atender_citas fechaba hacia atrás la fila de
-- citas_estetica_cambios, y el historial de una cita es inmutable («El historial de cambios de una cita no se edita
-- ni se borra»): las 3 citas que tocaba marcar se quedaban «reservada». El historial queda con la hora en que se marca
-- (el cron corre cada 15 minutos: entre 15 y 30 minutos después de la hora de la cita).
do $$
declare
  v_def text;
  v_viejo text := $t$            perform public.cancelar_cita_estetica(c.id, null, true);
            update public.citas_estetica_cambios set created_at = c.inicio + interval '15 minutes'
             where cita_id = c.id and tipo = 'no_llego';$t$;
begin
  select replace(pg_get_functiondef('public.demo_atender_citas(uuid)'::regprocedure), chr(13), '') into v_def;
  if position('update public.citas_estetica_cambios' in v_def) = 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'demo_atender_citas cambió: no se pudo quitar el fechado del historial.';
  end if;
  execute replace(v_def, v_viejo, $t$            perform public.cancelar_cita_estetica(c.id, null, true);$t$);
end $$;

-- Una vez, ya: las citas que se quedaron sin marcar.
do $$
declare
  n record;
begin
  for n in select id, slug from public.negocios where plan = 'demo' order by slug loop
    raise notice 'estancias_poner_al_dia %: %', n.slug, public.estancias_poner_al_dia(n.id, 'atender');
  end loop;
end $$;
