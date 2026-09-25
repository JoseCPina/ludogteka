-- PeluDesk, paso 9: TRANSITORIO, para el despliegue.
--
-- El despliegue aplica las migraciones y DESPUÉS empuja el código; durante
-- el build (unos minutos) producción sigue corriendo el código de antes,
-- que no manda el encabezado x-negocio-id. Con negocio_actual() en NULL
-- todas las políticas dirían "ningún negocio" y Ludogteka no vería nada en
-- ese lapso.
--
-- Una petición SIN negocio (ni app.negocio_id ni encabezado) cuenta como
-- Ludogteka. No abre nada: el encabezado nunca autoriza, lo decide la
-- membresía (es_miembro, current_rol), así que omitirlo da exactamente lo
-- mismo que mandar el de Ludogteka, que cualquiera puede mandar. Un
-- encabezado presente pero inválido sigue siendo NULL.
--
-- Se quita en el paso 10, ya con el código nuevo en producción: sin
-- negocio explícito vuelve a no verse nada (falla cerrado, y un camino que
-- se olvide del encabezado se nota en vez de operar en silencio sobre
-- Ludogteka).

create or replace function public.negocio_actual()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when x is null then '10000000-0000-4000-8000-000000000001'::uuid
    when x ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then x::uuid
  end
  from (
    select coalesce(
      nullif(current_setting('app.negocio_id', true), ''),
      nullif(current_setting('request.headers', true), '')::json ->> 'x-negocio-id'
    ) as x
  ) s;
$$;
comment on function public.negocio_actual() is
  'El negocio de la petición (encabezado x-negocio-id que pone el servidor, o app.negocio_id). TRANSITORIO (paso 9): sin ninguno, Ludogteka; el paso 10 lo vuelve NULL.';
