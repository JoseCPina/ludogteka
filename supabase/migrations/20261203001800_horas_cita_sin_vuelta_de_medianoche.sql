-- App para dueños · Fase 3: las horas de una cita no le dan la vuelta a la medianoche (2 de noviembre de 2026; solo
-- funciones, nada de datos). docs/app-duenos/FASE-3.md.
--
-- Causa: `portal_horas_disponibles` y `portal_pedir_cita` comparaban HORAS (`time`) y en Postgres `time + interval`
-- da la vuelta a las 24:00. Con apertura 09:00, el bloque n = 30 vale 24:00 → 00:00, que es «menor que el cierre», y la
-- pantalla de la app ofrecía de 00:00 a 09:00 (del día siguiente) después de las 17:00 (lo vio la auditoría de pantallas
-- app-duenos-f3-pantallas-dev en su captura). En pedir cita, una hora pasada del cierre cuya duración cruza la
-- medianoche (23:30 + 60 min = 00:30) pasaba la validación.
-- Arreglo: se compara con INTERVALOS desde la apertura (`time - time` da un intervalo, sin vuelta): el bloque empieza en
-- la apertura o después y termina, a más tardar, al cierre. Se parcha sobre la definición viva: el resto no cambia.
do $$
declare
  v_def text;
  v_viejo text := E'    where (v_abre + (n * interval ''30 minutes'') + (v_dur * interval ''1 minute''))::time <= v_cierra\n'
               || E'      and (v_abre + (n * interval ''30 minutes''))::time < v_cierra\n';
  v_nuevo text := E'    -- Con intervalos desde la apertura (un `time` le da la vuelta a la medianoche): migración 20261203001800.\n'
               || E'    where (n * interval ''30 minutes'') + (v_dur * interval ''1 minute'') <= (v_cierra - v_abre)\n';
begin
  select replace(pg_get_functiondef('public.portal_horas_disponibles(uuid, date)'::regprocedure), chr(13), '') into v_def;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'portal_horas_disponibles cambió: no encuentro el filtro de bloques tal cual.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

do $$
declare
  v_def text;
  v_viejo text := E'  if (p_inicio at time zone v_zona)::time < v_abre or ((p_inicio at time zone v_zona)::time + (v_dur * interval ''1 minute'')) > v_cierra then\n';
  v_nuevo text := E'  -- Con intervalos desde la apertura (un `time` le da la vuelta a la medianoche): migración 20261203001800.\n'
               || E'  if (p_inicio at time zone v_zona)::time < v_abre or ((p_inicio at time zone v_zona)::time - v_abre) + (v_dur * interval ''1 minute'') > (v_cierra - v_abre) then\n';
begin
  select replace(pg_get_functiondef('public.portal_pedir_cita(uuid, uuid, timestamptz)'::regprocedure), chr(13), '') into v_def;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'portal_pedir_cita cambió: no encuentro la validación del horario tal cual.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
