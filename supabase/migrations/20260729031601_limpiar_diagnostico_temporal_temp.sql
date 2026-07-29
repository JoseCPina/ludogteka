-- Confirmado: la sesión corre en UTC (timezone_sesion = 'UTC'), y en el
-- momento de la prueba current_date (29 jul) ya iba un día completo
-- adelante de fecha_negocio() (28 jul, hora real de San Luis Potosí).
-- Se quita la función de diagnóstico, ya cumplió su propósito.
drop function public.diagnostico_zona_horaria_temp();
