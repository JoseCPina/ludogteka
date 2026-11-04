-- Fase 5 · Alertas: los mensajes con quien subió una alerta NO se leen directo por la API. Con la política de «leer lo
-- mío» quien escribía veía `para_id` (el id de la persona que subió la alerta) y la regla es que nunca se sabe quién la
-- subió. Se leen solo por alerta_calle_detalle(), que devuelve el texto, la hora, si es mío y un alias de conversación.
drop policy if exists alertas_calle_msj_propios_select on public.alertas_calle_mensajes;
revoke select on public.alertas_calle_mensajes from authenticated;
-- RLS sigue activa: la política de peludesk_definer es la única (las funciones de la app escriben y leen por ella).
