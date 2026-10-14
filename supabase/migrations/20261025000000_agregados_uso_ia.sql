-- La API de Supabase corta TODA lectura en 1,000 filas (max_rows) sin avisar. El
-- gasto de IA del mes (el tope del bot y del asistente de ayuda) se sumaba en
-- JavaScript sobre las filas de wa_uso_ia: pasadas 1,000 llamadas en el mes la
-- suma se quedaba corta y el tope dejaba de proteger. Ahora se suma en la base.
--
-- Invoker a propósito: la lee el servidor (service_role) y la administración de
-- la plataforma con su sesión; la RLS de wa_uso_ia ya decide quién ve qué.
create or replace function public.wa_uso_ia_resumen(p_desde timestamptz)
returns jsonb
language sql
stable
set search_path = public
as $$
  select jsonb_build_object(
    'gasto_mxn', coalesce(sum(u.costo_mxn), 0),
    'respuestas', count(*),
    'escalados', count(*) filter (where u.resultado = 'escalo')
  )
  from public.wa_uso_ia u
  where u.deleted_at is null
    and u.created_at >= p_desde;
$$;

revoke execute on function public.wa_uso_ia_resumen(timestamptz) from public, anon;
grant execute on function public.wa_uso_ia_resumen(timestamptz) to authenticated, service_role;
