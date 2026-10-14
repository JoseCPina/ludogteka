-- cuentas_abiertas devuelve una fila por cuenta con saldo y la API de Supabase corta TODA lectura en 1,000
-- filas (max_rows). Paginarla en la app obliga a recalcular la función completa en cada página (con un mes de
-- operación tarda segundos). Esta envoltura devuelve las mismas cuentas, en el mismo orden, como UN solo
-- jsonb: una sola cuenta de la base y sin tope de filas. Invoker, igual que cuentas_abiertas: la RLS de
-- quien llama decide qué cuentas ve.
create or replace function public.cuentas_abiertas_json(p_dias integer default 30)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(to_jsonb(t) order by t.fecha_actividad desc, t.saldo desc, t.reserva_id),
    '[]'::jsonb
  )
  from public.cuentas_abiertas(p_dias) t;
$$;

revoke execute on function public.cuentas_abiertas_json(integer) from public, anon;
grant execute on function public.cuentas_abiertas_json(integer) to authenticated, service_role;
