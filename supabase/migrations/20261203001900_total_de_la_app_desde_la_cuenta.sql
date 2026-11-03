-- App para dueños · Fase 3: el total que la app le dice al dueño sale de la CUENTA (una sola fuente), no de su propia
-- cuenta (2 de noviembre de 2026; solo funciones, nada de datos). docs/app-duenos/FASE-3.md, docs/caja-y-cuentas.md.
--
-- Causa: `portal_reservar` devolvía 'precio_total' = precio_unitario × noches (u horas), una cuenta aparte de la de Caja.
-- Coincide al crear la reserva, pero la cuenta de la estancia (`cuenta_lineas_estancia` / `cuenta_totales_reserva`) suma
-- además cargos, servicios de estética ligados, correcciones de precio y lo cubierto con un pase; en producción, 10 de 477
-- estancias ya tenían un total distinto de precio × noches (todas por una corrección de precio; p. ej. 1,200 contra 600).
-- Arreglo: `portal_reservar` y `portal_pedir_cita` devuelven el total, lo cubierto con pase y el saldo de
-- `cuenta_totales_reserva` (sobre `cuenta_lineas_reserva`, lo mismo que Caja, el panel y el link de pago). 'precio_total'
-- se conserva como nombre (es el total de la cuenta) para no romper a quien ya lo lee.
grant execute on function public.cuenta_totales_reserva(uuid) to peludesk_definer;

do $$
declare
  v_def text;
  v_viejo text := E'    ''precio_total'', case when v_unidad = ''hora'' then v_est.precio_unitario * coalesce(v_est.horas, 1) else v_est.precio_unitario * (v_est.fecha_salida - v_est.fecha_entrada) end,\n';
  v_nuevo text := E'    -- El total y el saldo de la CUENTA (cuenta_totales_reserva), no precio × noches: migración 20261203001900.\n'
               || E'    ''precio_total'', (select t.total_cuenta from public.cuenta_totales_reserva(v_reserva) t),\n'
               || E'    ''cubierto_con_pase'', (select t.total_bono from public.cuenta_totales_reserva(v_reserva) t),\n'
               || E'    ''saldo'', (select t.saldo from public.cuenta_totales_reserva(v_reserva) t),\n';
begin
  select replace(pg_get_functiondef('public.portal_reservar(uuid, uuid, date, date, integer)'::regprocedure), chr(13), '') into v_def;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'portal_reservar cambió: no encuentro precio_total tal cual.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;

do $$
declare
  v_def text;
  v_viejo text := E'    ''atiende'', public.nombre_de_persona(v_empleado, null));\n';
  v_nuevo text := E'    ''atiende'', public.nombre_de_persona(v_empleado, null),\n'
               || E'    -- El total y el saldo de la CUENTA de la cita (cuenta_totales_reserva): migración 20261203001900.\n'
               || E'    ''total_cuenta'', (select t.total_cuenta from public.cuenta_totales_reserva(v_reserva) t),\n'
               || E'    ''saldo'', (select t.saldo from public.cuenta_totales_reserva(v_reserva) t));\n';
begin
  select replace(pg_get_functiondef('public.portal_pedir_cita(uuid, uuid, timestamptz)'::regprocedure), chr(13), '') into v_def;
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 1 then
    raise exception 'portal_pedir_cita cambió: no encuentro el cierre del jsonb tal cual.';
  end if;
  execute replace(v_def, v_viejo, v_nuevo);
end $$;
