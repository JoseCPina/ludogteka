-- El estado de cobro del negocio para el aviso de arriba y el tablero, para
-- cualquier miembro (recepción también tiene que saber que el negocio quedó
-- en solo lectura y por qué). Sin montos: solo el estado y sus fechas. La
-- suscripción misma (monto, plan, factura) sigue siendo solo del admin
-- (mi_cobro, RLS de suscripciones).
create or replace function public.estado_cobro()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s record;
  v_hay boolean;
begin
  if not coalesce(public.es_miembro(), false) then
    return null;
  end if;
  select s.estado_stripe, s.primer_fallo_at, s.cancela_al_terminar, s.periodo_fin into v_s
  from public.suscripciones s
  where s.negocio_id = public.negocio_actual() and s.deleted_at is null
    and s.stripe_subscription_id is not null and s.estado_stripe not in ('incomplete', 'incomplete_expired');
  v_hay := found;
  return jsonb_build_object(
    'estado', public.estado_cobro_en(public.negocio_actual()),
    'contratado', v_hay and v_s.estado_stripe in ('trialing', 'active', 'past_due', 'unpaid'),
    'primer_fallo_at', case when v_hay then v_s.primer_fallo_at end,
    'solo_lectura_desde', case when v_hay and v_s.primer_fallo_at is not null then v_s.primer_fallo_at + interval '7 days' end
  );
end;
$$;
alter function public.estado_cobro() owner to peludesk_definer;
revoke execute on function public.estado_cobro() from public, anon;
grant execute on function public.estado_cobro() to authenticated;
