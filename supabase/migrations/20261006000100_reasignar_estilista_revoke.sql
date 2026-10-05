-- La función del trigger que protege la estilista de una cita también va con
-- revoke de public y anon (toda función nueva de public).
revoke execute on function public.proteger_estilista_cita() from public, anon;
grant execute on function public.proteger_estilista_cita() to authenticated, service_role;
