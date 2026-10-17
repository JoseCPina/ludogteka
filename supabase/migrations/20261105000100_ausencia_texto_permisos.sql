-- ausencia_texto es un ayudante interno de los mensajes: ni la llave anónima ni la API lo ejecutan.
alter function public.ausencia_texto(text, text, date, date, time, time) owner to peludesk_definer;
revoke execute on function public.ausencia_texto(text, text, date, date, time, time) from public, anon, authenticated;
grant execute on function public.ausencia_texto(text, text, date, date, time, time) to service_role, peludesk_definer;
