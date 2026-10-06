-- reporte_financiero_periodo se volvió a crear (cambió su tipo de retorno) y
-- quedó de postgres: vuelve a ser de peludesk_definer, que ve solo el negocio
-- de la petición.
alter function public.reporte_financiero_periodo(date, date) owner to peludesk_definer;
