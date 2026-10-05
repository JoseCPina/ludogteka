-- Las funciones de disparador no se ejecutan por la API: sin EXECUTE para
-- public ni anon (auditoria_frontera).
revoke execute on function public.fijar_servicio_nombre_cita() from public, anon;
revoke execute on function public.proteger_servicio_cita() from public, anon;
revoke execute on function public.citas_estetica_correcciones_inmutable() from public, anon;
