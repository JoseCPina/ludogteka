-- 'km' como unidad nueva, para el servicio de Recolección a domicilio
-- (Fase 10): la cantidad que depende_cantidad captura son kilómetros de
-- ruta, no días/noches/sesiones/eventos. Se agrega al CHECK de la base Y
-- a la lista espejo en el frontend (servicios/actions.ts) — esa lista ya
-- causó un bug latente antes (unidad no reconocida se caía al primer
-- <option> del <select> en un re-guardado), así que ambas se tocan en el
-- mismo commit.
alter table public.servicios drop constraint servicios_unidad_check;

alter table public.servicios
  add constraint servicios_unidad_check
  check (unidad in ('dia', 'noche', 'sesion', 'evento', 'km'));
