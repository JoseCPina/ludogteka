-- estado_cobro(): el estado de la suscripción a PeluDesk es cosa del negocio.
-- El personal lo ve (sin montos); un cliente del portal solo sabe si por
-- ahora no se pueden hacer cambios ('solo_lectura'), sin el porqué ni fechas.
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
  v_estado text;
begin
  if not coalesce(public.es_miembro(), false) then
    return null;
  end if;
  v_estado := public.estado_cobro_en(public.negocio_actual());
  if not coalesce(public.is_staff(), false) then
    return jsonb_build_object('estado',
      case when v_estado in ('prueba_vencida', 'solo_lectura', 'cancelado') then 'solo_lectura' end);
  end if;
  select s.estado_stripe, s.primer_fallo_at into v_s
  from public.suscripciones s
  where s.negocio_id = public.negocio_actual() and s.deleted_at is null
    and s.stripe_subscription_id is not null and s.estado_stripe not in ('incomplete', 'incomplete_expired');
  v_hay := found;
  return jsonb_build_object(
    'estado', v_estado,
    'contratado', v_hay and v_s.estado_stripe in ('trialing', 'active', 'past_due', 'unpaid'),
    'primer_fallo_at', case when v_hay then v_s.primer_fallo_at end,
    'solo_lectura_desde', case when v_hay and v_s.primer_fallo_at is not null then v_s.primer_fallo_at + interval '7 days' end
  );
end;
$$;
alter function public.estado_cobro() owner to peludesk_definer;
revoke execute on function public.estado_cobro() from public, anon;
grant execute on function public.estado_cobro() to authenticated;
