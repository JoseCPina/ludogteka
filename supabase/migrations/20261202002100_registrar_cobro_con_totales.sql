-- QA S36: «Registrar cobro» se quedaba ~4 s en «Cobrando…»: la acción hacía en serie la revisión de cobros recientes,
-- el cobro y la lectura de la cuenta nueva. Esta función registra el cobro (la misma `registrar_cobro`, con sus
-- reglas y permisos) y devuelve en el mismo viaje los totales de la cuenta para pintarlos al momento. Es INVOKER: la
-- llamada hace lo mismo que las dos por separado, con la sesión de quien cobra.
create or replace function public.registrar_cobro_con_totales(p_reserva_id uuid, p_notas text, p_metodos jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  t record;
begin
  v_id := public.registrar_cobro(p_reserva_id, p_notas, p_metodos);
  select * into t from public.cuenta_totales_reserva(p_reserva_id);
  return jsonb_build_object('cobro_id', v_id, 'totales', to_jsonb(t));
end;
$$;
revoke execute on function public.registrar_cobro_con_totales(uuid, text, jsonb) from public, anon;
grant execute on function public.registrar_cobro_con_totales(uuid, text, jsonb) to authenticated, service_role;
