-- Diagnóstico puntual (barrido de zona horaria, Fase 4): confirma en qué
-- zona horaria evalúa la sesión current_date/now(), para saber con
-- certeza si los usos de current_date sin conversión son un bug real o
-- no. Se elimina en la siguiente migración — no es parte permanente del
-- esquema.
create or replace function public.diagnostico_zona_horaria_temp()
returns table (
  current_date_crudo date,
  now_crudo timestamptz,
  timezone_sesion text,
  fecha_negocio_actual date
)
language sql
stable
set search_path = ''
as $$
  select current_date, now(), current_setting('TimeZone'), public.fecha_negocio();
$$;

grant execute on function public.diagnostico_zona_horaria_temp() to authenticated;
