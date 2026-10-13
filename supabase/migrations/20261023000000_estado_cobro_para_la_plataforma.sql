-- estado_cobro_en vuelve a poder leerse desde las funciones de la plataforma
-- (13 de octubre de 2026).
--
-- La migración 20261019000100 la pasó a SECURITY DEFINER de peludesk_definer,
-- que no salta la RLS: solo ve el negocio de la petición. Las funciones que
-- recorren varios negocios (plataforma_cobros → /plataforma/cobro,
-- bot_cuenta_por_telefono → lo que el bot sabe del cobro de un admin,
-- resumen_datos → pagos fallidos y MRR del resumen diario) quedaron recibiendo
-- NULL para cualquier negocio: /plataforma/cobro mostraba «—» en el estado de
-- todos, el bot no veía el pago fallido y el resumen no contaba ni gracia ni
-- ingreso recurrente.
--
-- Ahora es de postgres (salta la RLS) y se protege ella misma: solo contesta
-- para el negocio de la petición, para la administración de la plataforma o
-- para el servidor. A un admin de otro negocio le sigue dando NULL.

create or replace function public.estado_cobro_en(p_negocio_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not (coalesce(auth.role(), '') = 'service_role'
              or coalesce(public.es_admin_plataforma(), false)
              or p_negocio_id = public.negocio_actual()) then null
    else (
      select case
        when n.id is null then null
        when n.cobro_exento or n.plan = 'demo' then 'exento'
        when s.estado_stripe = 'trialing' then 'prueba'
        when s.estado_stripe = 'active' then 'al_corriente'
        when s.estado_stripe in ('past_due', 'unpaid') then
          case when now() < coalesce(s.primer_fallo_at, now()) + interval '7 days' then 'gracia' else 'solo_lectura' end
        when s.estado_stripe = 'canceled' and not (n.plan = 'prueba' and n.prueba_termina_at > now()) then 'cancelado'
        when n.plan = 'prueba' then
          case when n.prueba_termina_at is null or n.prueba_termina_at > now() then 'prueba' else 'prueba_vencida' end
        else 'sin_cobro'
      end
      from (select p_negocio_id as id) x
      left join public.negocios n on n.id = x.id and n.deleted_at is null
      left join public.suscripciones s on s.negocio_id = n.id and s.deleted_at is null
        and s.stripe_subscription_id is not null
        and s.estado_stripe not in ('incomplete', 'incomplete_expired')
    )
  end;
$$;
alter function public.estado_cobro_en(uuid) owner to postgres;
revoke execute on function public.estado_cobro_en(uuid) from public, anon;
grant execute on function public.estado_cobro_en(uuid) to authenticated, service_role, peludesk_definer;

-- Lista blanca de la auditoría: función de postgres justificada arriba.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('''estado_cobro_en''' in v_def) = 0 then
    v_def := replace(v_def, $a$('plataforma_tutoriales_marcar')$a$, $b$('plataforma_tutoriales_marcar'), ('estado_cobro_en')$b$);
    if position('''estado_cobro_en''' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar estado_cobro_en.';
    end if;
    execute v_def;
  end if;
end $$;
