-- Los videos tutoriales pasan del folio 99: `tutoriales.numero` y `tutoriales_progreso.numero` admiten
-- dos o tres dígitos (el folio 100, recordatorios automáticos por WhatsApp, y los que sigan).
-- El orden de la serie no sale de `numero` (texto) sino de `orden` (entero, del catálogo), así que
-- «100» no se cuela antes de «11».
alter table public.tutoriales drop constraint if exists tutoriales_numero_check;
alter table public.tutoriales add constraint tutoriales_numero_check check (numero ~ '^[0-9]{2,3}$');
alter table public.tutoriales_progreso drop constraint if exists tutoriales_progreso_numero_check;
alter table public.tutoriales_progreso add constraint tutoriales_progreso_numero_check check (numero ~ '^[0-9]{2,3}$');
