-- PeluDesk: cobro automático de la suscripción con Stripe (cuenta de Menteo,
-- S.A.S.; productos y precios propios con lookup keys peludesk_*).
--
-- · Stripe es la ÚNICA fuente de verdad del cobro. La app nunca escribe
--   "pagado": el webhook (firmado) y el regreso del Checkout leen la
--   suscripción ACTUAL de Stripe y la aplican con cobro_aplicar(), que solo
--   puede llamar service_role. Nadie con sesión escribe suscripciones,
--   pagos_suscripcion ni las columnas de plan de negocios (validar_negocio).
-- · estado_cobro_en(negocio): exento (Ludogteka y demo), prueba,
--   prueba_vencida, al_corriente, gracia (7 días desde el primer cobro
--   fallido), solo_lectura (del día 8 en adelante), cancelado y sin_cobro
--   (activado a mano por la plataforma). negocio_escribible_en() lo usa: con
--   prueba_vencida, solo_lectura o cancelado el negocio queda en solo lectura,
--   igual que la prueba vencida de siempre. Pagar después lo reactiva solo,
--   porque el estado se vuelve a calcular con lo que diga Stripe.
-- · Mientras dura la prueba, contratar no le quita días: la suscripción nace
--   en `trialing` con trial_end = fin de la prueba y el negocio sigue en
--   plan 'prueba' (con los módulos de Completo) hasta que Stripe cobra.
-- · planes_precios_stripe: cada precio que se dio de alta en Stripe para un
--   plan (compartida, solo la plataforma). Un precio de Stripe no se edita:
--   al cambiar un importe se crea otro y la lookup key pasa al nuevo.
-- · eventos_stripe: cada evento recibido, una sola vez (idempotencia por id).
-- · El anual siempre es diez mensualidades («2 meses gratis»).

-- ── Ludogteka y el demo quedan fuera del cobro ──
alter table public.negocios add column cobro_exento boolean not null default false;
update public.negocios set cobro_exento = true
where id = '10000000-0000-4000-8000-000000000001' or plan = 'demo';

CREATE OR REPLACE FUNCTION public.validar_negocio()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  perform now() at time zone new.zona_horaria;
  new.dominio := nullif(lower(btrim(coalesce(new.dominio, ''))), '');
  new.url_publica := nullif(lower(btrim(coalesce(new.url_publica, ''))), '');
  new.slug := lower(btrim(new.slug));
  -- Subdominios de PeluDesk que no son negocios (src/lib/negocio/host.ts).
  if new.slug in ('www', 'app', 'api', 'admin', 'mail', 'static', 'plataforma', 'soporte', 'demo', 'registro', 'ayuda', 'blog', 'precios') then
    raise exception 'La dirección «%» está reservada para PeluDesk.', new.slug;
  end if;
  if tg_op = 'UPDATE'
     and (new.slug is distinct from old.slug or new.dominio is distinct from old.dominio
          or new.url_publica is distinct from old.url_publica or new.activo is distinct from old.activo
          or new.plan is distinct from old.plan or new.prueba_termina_at is distinct from old.prueba_termina_at
          or new.plan_id is distinct from old.plan_id or new.complementos is distinct from old.complementos
          or new.modulos_cortesia is distinct from old.modulos_cortesia or new.web_gratis_at is distinct from old.web_gratis_at
          or new.cobro_exento is distinct from old.cobro_exento)
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin') then
    raise exception 'El plan, los módulos, el dominio y el estado de un negocio solo los cambia la plataforma.';
  end if;
  return new;
exception
  when invalid_parameter_value then
    raise exception 'La zona horaria «%» no existe.', new.zona_horaria;
end;
$function$;

-- ── Precios de Stripe de cada plan (compartida: solo la plataforma) ──
create table public.planes_precios_stripe (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.planes(id),
  periodicidad text not null check (periodicidad in ('mensual', 'anual')),
  neto numeric(10, 2) not null check (neto >= 0),
  total_centavos int not null check (total_centavos >= 0),
  lookup_key text not null,
  stripe_price_id text not null,
  stripe_product_id text not null,
  modo text not null check (modo in ('test', 'live')),
  vigente boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index planes_precios_stripe_precio on public.planes_precios_stripe (stripe_price_id);
create unique index planes_precios_stripe_vigente on public.planes_precios_stripe (plan_id, periodicidad, modo)
  where vigente and deleted_at is null;
create trigger set_updated_at before insert or update on public.planes_precios_stripe
  for each row execute function public.set_updated_at();
alter table public.planes_precios_stripe enable row level security;
create policy planes_precios_stripe_select on public.planes_precios_stripe for select to authenticated
  using ((select public.es_admin_plataforma()));
create policy planes_precios_stripe_insert on public.planes_precios_stripe for insert to authenticated
  with check ((select public.es_admin_plataforma()));
create policy planes_precios_stripe_update on public.planes_precios_stripe for update to authenticated
  using ((select public.es_admin_plataforma())) with check ((select public.es_admin_plataforma()));
grant select, insert, update on public.planes_precios_stripe to authenticated;

-- ── Eventos recibidos de Stripe (compartida: el webhook es de la plataforma) ──
create table public.eventos_stripe (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null,
  tipo text not null,
  modo text not null check (modo in ('test', 'live')),
  objeto_id text,
  negocio_afectado uuid references public.negocios(id),
  payload jsonb not null,
  procesado_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index eventos_stripe_evento on public.eventos_stripe (stripe_event_id);
create index eventos_stripe_negocio on public.eventos_stripe (negocio_afectado);
create trigger set_updated_at before insert or update on public.eventos_stripe
  for each row execute function public.set_updated_at();
alter table public.eventos_stripe enable row level security;
create policy eventos_stripe_select on public.eventos_stripe for select to authenticated
  using ((select public.es_admin_plataforma()));
-- Solo el webhook (service_role) escribe.
create policy eventos_stripe_sin_escritura on public.eventos_stripe for insert to authenticated with check (false);
grant select on public.eventos_stripe to authenticated;

-- ── La suscripción de cada negocio (una por negocio) ──
create table public.suscripciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  modo text not null check (modo in ('test', 'live')),
  stripe_customer_id text,
  stripe_subscription_id text,
  estado_stripe text,
  plan_id uuid references public.planes(id),
  periodicidad text check (periodicidad in ('mensual', 'anual')),
  complementos text[] not null default '{}',
  monto_centavos int,
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  prueba_hasta timestamptz,
  cancela_al_terminar boolean not null default false,
  cancelada_at timestamptz,
  primer_fallo_at timestamptz,
  factura_pendiente_url text,
  cambio_programado jsonb,
  recordatorio_visto_at timestamptz,
  sincronizada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index suscripciones_negocio on public.suscripciones (negocio_id) where deleted_at is null;
create unique index suscripciones_stripe on public.suscripciones (negocio_id, stripe_subscription_id) where stripe_subscription_id is not null;
create index suscripciones_negocio_idx on public.suscripciones (negocio_id);
create index suscripciones_sub_idx on public.suscripciones (stripe_subscription_id);
create trigger set_updated_at before insert or update on public.suscripciones
  for each row execute function public.set_updated_at();
alter table public.suscripciones enable row level security;
create policy suscripciones_negocio on public.suscripciones as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy suscripciones_negocio_definer on public.suscripciones for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
-- Solo el admin del negocio la ve; nadie la escribe con su sesión.
create policy suscripciones_select_admin on public.suscripciones for select to authenticated
  using ((select public.is_admin()));
create policy suscripciones_sin_escritura on public.suscripciones for insert to authenticated with check (false);
create policy suscripciones_escritura_ins on public.suscripciones as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy suscripciones_escritura_upd on public.suscripciones as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy suscripciones_escritura_del on public.suscripciones as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
grant select on public.suscripciones to authenticated;
grant select, update on public.suscripciones to peludesk_definer;

-- ── Historial de pagos (una fila por factura de Stripe) ──
create table public.pagos_suscripcion (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  modo text not null check (modo in ('test', 'live')),
  stripe_invoice_id text not null,
  numero text,
  estado text not null check (estado in ('pagado', 'fallido', 'pendiente', 'anulado')),
  monto_centavos int not null,
  periodo_inicio timestamptz,
  periodo_fin timestamptz,
  pagado_at timestamptz,
  fallo_at timestamptz,
  motivo_fallo text,
  url_factura text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index pagos_suscripcion_factura on public.pagos_suscripcion (negocio_id, stripe_invoice_id);
create index pagos_suscripcion_negocio_idx on public.pagos_suscripcion (negocio_id);
create trigger set_updated_at before insert or update on public.pagos_suscripcion
  for each row execute function public.set_updated_at();
alter table public.pagos_suscripcion enable row level security;
create policy pagos_suscripcion_negocio on public.pagos_suscripcion as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy pagos_suscripcion_negocio_definer on public.pagos_suscripcion for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy pagos_suscripcion_select_admin on public.pagos_suscripcion for select to authenticated
  using ((select public.is_admin()));
create policy pagos_suscripcion_sin_escritura on public.pagos_suscripcion for insert to authenticated with check (false);
create policy pagos_suscripcion_escritura_ins on public.pagos_suscripcion as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy pagos_suscripcion_escritura_upd on public.pagos_suscripcion as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy pagos_suscripcion_escritura_del on public.pagos_suscripcion as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
grant select on public.pagos_suscripcion to authenticated;
grant select on public.pagos_suscripcion to peludesk_definer;

-- ── El estado de cobro de un negocio ──
-- Sin definer: quien la llama con su sesión solo ve la suscripción de su
-- negocio (RLS); negocio_escribible_en y las funciones de la plataforma la
-- llaman como su dueño y ven la de cualquiera.
create or replace function public.estado_cobro_en(p_negocio_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
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
    and s.estado_stripe not in ('incomplete', 'incomplete_expired');
$$;
revoke execute on function public.estado_cobro_en(uuid) from public, anon;
grant execute on function public.estado_cobro_en(uuid) to authenticated, service_role, peludesk_definer;

CREATE OR REPLACE FUNCTION public.negocio_escribible_en(p_negocio_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce((
      select n.activo and n.deleted_at is null
             and coalesce(public.estado_cobro_en(n.id), 'cancelado') not in ('prueba_vencida', 'solo_lectura', 'cancelado')
      from public.negocios n
      where n.id = p_negocio_id
    ), false)
    and not exists (
      select 1 from public.membresias m
      where m.profile_id = auth.uid() and m.negocio_id = p_negocio_id
        and m.deleted_at is null and m.solo_lectura
    );
$function$;

-- ── Lo que ve el admin de su negocio ──
create or replace function public.mi_cobro()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_s public.suscripciones;
  v_hay boolean;
  v_estado text;
  v_n record;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo el admin del negocio.';
  end if;
  select * into v_s from public.suscripciones s where s.negocio_id = public.negocio_actual() and s.deleted_at is null;
  v_hay := found;
  select n.plan, n.prueba_termina_at, n.plan_id, n.complementos, n.web_gratis_at, n.cobro_exento into v_n
  from public.negocios n where n.id = public.negocio_actual();
  v_estado := public.estado_cobro_en(public.negocio_actual());
  return jsonb_build_object(
    'estado', v_estado,
    'plan', v_n.plan,
    'prueba_termina_at', v_n.prueba_termina_at,
    'plan_id', v_n.plan_id,
    'complementos', v_n.complementos,
    'web_gratis', v_n.web_gratis_at is not null,
    'exento', v_n.cobro_exento,
    'tiene_suscripcion', v_hay and v_s.stripe_subscription_id is not null
      and v_s.estado_stripe not in ('incomplete', 'incomplete_expired', 'canceled'),
    'tiene_cliente', v_hay and v_s.stripe_customer_id is not null,
    'estado_stripe', case when v_hay then v_s.estado_stripe end,
    'plan_contratado', case when v_hay then v_s.plan_id end,
    'periodicidad', case when v_hay then v_s.periodicidad end,
    'complementos_contratados', case when v_hay then to_jsonb(v_s.complementos) else '[]'::jsonb end,
    'monto_centavos', case when v_hay then v_s.monto_centavos end,
    'periodo_fin', case when v_hay then v_s.periodo_fin end,
    'prueba_hasta', case when v_hay then v_s.prueba_hasta end,
    'cancela_al_terminar', v_hay and v_s.cancela_al_terminar,
    'primer_fallo_at', case when v_hay then v_s.primer_fallo_at end,
    'solo_lectura_desde', case when v_hay and v_s.primer_fallo_at is not null then v_s.primer_fallo_at + interval '7 days' end,
    'factura_pendiente_url', case when v_hay then v_s.factura_pendiente_url end,
    'cambio_programado', case when v_hay then v_s.cambio_programado end,
    -- El recordatorio de un pago fallido sale cada tercer día (días 1, 4 y 7).
    'toca_recordatorio', v_estado = 'gracia'
      and (v_s.recordatorio_visto_at is null or v_s.recordatorio_visto_at < now() - interval '3 days'
           or v_s.recordatorio_visto_at < v_s.primer_fallo_at)
  );
end;
$$;
alter function public.mi_cobro() owner to peludesk_definer;
revoke execute on function public.mi_cobro() from public, anon;
grant execute on function public.mi_cobro() to authenticated;

-- El admin cerró el recordatorio de pago fallido (vuelve en tres días).
create or replace function public.cobro_recordatorio_visto()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo el admin del negocio.';
  end if;
  update public.suscripciones set recordatorio_visto_at = now()
  where negocio_id = public.negocio_actual() and deleted_at is null;
end;
$$;
alter function public.cobro_recordatorio_visto() owner to peludesk_definer;
revoke execute on function public.cobro_recordatorio_visto() from public, anon;
grant execute on function public.cobro_recordatorio_visto() to authenticated;

-- ── Lo que escribe el servidor con lo que dice Stripe (solo service_role) ──
-- p: modo, customer, subscription, estado_stripe, plan_clave, periodicidad,
-- complementos, monto_centavos, periodo_inicio, periodo_fin, prueba_hasta,
-- cancela_al_terminar, cancelada_at, fallo_at, factura_pendiente_url,
-- cambio_programado. Sin subscription: solo guarda el cliente de Stripe.
create or replace function public.cobro_aplicar(p_negocio_id uuid, p jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_n record;
  v_plan uuid;
  v_estado text := p ->> 'estado_stripe';
  v_sub text := nullif(p ->> 'subscription', '');
  v_actual public.suscripciones;
  v_hay boolean;
  v_complementos text[];
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor aplica el cobro.' using errcode = '42501';
  end if;
  select n.id, n.plan, n.cobro_exento, n.deleted_at into v_n from public.negocios n where n.id = p_negocio_id;
  if not found or v_n.deleted_at is not null then
    raise exception 'Ese negocio no existe.';
  end if;
  if v_n.cobro_exento or v_n.plan = 'demo' then
    raise exception 'Este negocio está fuera del cobro.';
  end if;
  if p ? 'plan_clave' and p ->> 'plan_clave' is not null then
    select pl.id into v_plan from public.planes pl
    where pl.clave = p ->> 'plan_clave' and pl.tipo = 'plan' and pl.deleted_at is null;
    if v_plan is null then
      raise exception 'El plan «%» no existe.', p ->> 'plan_clave';
    end if;
  end if;
  v_complementos := coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'complementos', '[]'::jsonb))), '{}');

  select * into v_actual from public.suscripciones s where s.negocio_id = p_negocio_id and s.deleted_at is null for update;
  v_hay := found;
  -- Un evento de una suscripción vieja (ya reemplazada) no pisa la vigente.
  if v_hay and v_sub is not null and v_actual.stripe_subscription_id is not null
     and v_actual.stripe_subscription_id <> v_sub
     and v_actual.estado_stripe in ('active', 'trialing', 'past_due', 'unpaid')
     and v_estado in ('canceled', 'incomplete', 'incomplete_expired') then
    return 'ignorada: la suscripción vigente es otra';
  end if;
  if not v_hay then
    insert into public.suscripciones (negocio_id, modo) values (p_negocio_id, p ->> 'modo') returning * into v_actual;
  end if;

  update public.suscripciones s set
    modo = coalesce(p ->> 'modo', s.modo),
    stripe_customer_id = coalesce(nullif(p ->> 'customer', ''), s.stripe_customer_id),
    stripe_subscription_id = coalesce(v_sub, s.stripe_subscription_id),
    estado_stripe = case when v_sub is null then s.estado_stripe else v_estado end,
    plan_id = case when v_sub is null then s.plan_id else coalesce(v_plan, s.plan_id) end,
    periodicidad = case when v_sub is null then s.periodicidad else coalesce(p ->> 'periodicidad', s.periodicidad) end,
    complementos = case when v_sub is null then s.complementos else v_complementos end,
    monto_centavos = case when v_sub is null then s.monto_centavos else (p ->> 'monto_centavos')::int end,
    periodo_inicio = case when v_sub is null then s.periodo_inicio else (p ->> 'periodo_inicio')::timestamptz end,
    periodo_fin = case when v_sub is null then s.periodo_fin else (p ->> 'periodo_fin')::timestamptz end,
    prueba_hasta = case when v_sub is null then s.prueba_hasta else (p ->> 'prueba_hasta')::timestamptz end,
    cancela_al_terminar = case when v_sub is null then s.cancela_al_terminar else coalesce((p ->> 'cancela_al_terminar')::boolean, false) end,
    cancelada_at = case when v_sub is null then s.cancelada_at else (p ->> 'cancelada_at')::timestamptz end,
    -- La gracia corre desde el PRIMER cobro fallido y se limpia al quedar al corriente.
    primer_fallo_at = case
      when v_sub is null then s.primer_fallo_at
      when v_estado in ('past_due', 'unpaid') then coalesce(s.primer_fallo_at, (p ->> 'fallo_at')::timestamptz, now())
      else null end,
    recordatorio_visto_at = case when v_sub is null or v_estado in ('past_due', 'unpaid') then s.recordatorio_visto_at else null end,
    factura_pendiente_url = case when v_sub is null then s.factura_pendiente_url else nullif(p ->> 'factura_pendiente_url', '') end,
    cambio_programado = case when v_sub is null then s.cambio_programado else p -> 'cambio_programado' end,
    sincronizada_at = now()
  where s.id = v_actual.id;

  if v_sub is null or v_plan is null then
    return 'cliente';
  end if;
  -- El plan del negocio sigue a Stripe. En la prueba se queda en 'prueba'
  -- (con los módulos de Completo) hasta que Stripe cobre el primer periodo.
  if v_estado in ('active', 'past_due', 'unpaid') then
    update public.negocios
    set plan = 'activo', prueba_termina_at = null, plan_id = v_plan, complementos = v_complementos
    where id = p_negocio_id
      and (plan, prueba_termina_at, plan_id, complementos) is distinct from ('activo', null::timestamptz, v_plan, v_complementos);
  elsif v_estado = 'trialing' then
    update public.negocios set plan_id = v_plan, complementos = v_complementos
    where id = p_negocio_id and (plan_id, complementos) is distinct from (v_plan, v_complementos);
  end if;
  return public.estado_cobro_en(p_negocio_id);
end;
$$;
revoke execute on function public.cobro_aplicar(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.cobro_aplicar(uuid, jsonb) to service_role;

-- Una factura de Stripe al historial (solo service_role).
create or replace function public.cobro_registrar_pago(p_negocio_id uuid, p jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor registra pagos.' using errcode = '42501';
  end if;
  insert into public.pagos_suscripcion as ps (negocio_id, modo, stripe_invoice_id, numero, estado, monto_centavos,
    periodo_inicio, periodo_fin, pagado_at, fallo_at, motivo_fallo, url_factura)
  values (p_negocio_id, p ->> 'modo', p ->> 'invoice', p ->> 'numero', p ->> 'estado', (p ->> 'monto_centavos')::int,
    (p ->> 'periodo_inicio')::timestamptz, (p ->> 'periodo_fin')::timestamptz, (p ->> 'pagado_at')::timestamptz,
    (p ->> 'fallo_at')::timestamptz, p ->> 'motivo_fallo', p ->> 'url_factura')
  on conflict (negocio_id, stripe_invoice_id) do update set
    numero = coalesce(excluded.numero, ps.numero),
    -- Una factura pagada no vuelve a fallida por un evento viejo que llegó tarde.
    estado = case when ps.estado = 'pagado' then 'pagado' else excluded.estado end,
    monto_centavos = excluded.monto_centavos,
    periodo_inicio = coalesce(excluded.periodo_inicio, ps.periodo_inicio),
    periodo_fin = coalesce(excluded.periodo_fin, ps.periodo_fin),
    pagado_at = coalesce(ps.pagado_at, excluded.pagado_at),
    fallo_at = coalesce(ps.fallo_at, excluded.fallo_at),
    motivo_fallo = coalesce(excluded.motivo_fallo, ps.motivo_fallo),
    url_factura = coalesce(excluded.url_factura, ps.url_factura);
end;
$$;
revoke execute on function public.cobro_registrar_pago(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.cobro_registrar_pago(uuid, jsonb) to service_role;

-- ── La plataforma: estado de cobro, pagos e ingreso recurrente ──
create or replace function public.plataforma_cobros()
returns table (negocio_id uuid, slug text, nombre text, estado text, plan text, plan_nombre text, periodicidad text,
               complementos text[], monto_centavos int, mensual_centavos int, periodo_fin timestamptz,
               prueba_termina_at timestamptz, primer_fallo_at timestamptz, cancela_al_terminar boolean,
               stripe_customer_id text, stripe_subscription_id text, estado_stripe text, modo text,
               ultimo_pago_at timestamptz, pagos bigint, pagado_centavos bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
    select n.id, n.slug, n.nombre, public.estado_cobro_en(n.id), n.plan,
      coalesce(ps.nombre, pn.nombre), s.periodicidad, coalesce(s.complementos, '{}'::text[]), s.monto_centavos,
      case when s.monto_centavos is null then null
           when s.periodicidad = 'anual' then round(s.monto_centavos / 12.0)::int else s.monto_centavos end,
      s.periodo_fin, n.prueba_termina_at, s.primer_fallo_at, coalesce(s.cancela_al_terminar, false),
      s.stripe_customer_id, s.stripe_subscription_id, s.estado_stripe, s.modo,
      (select max(p.pagado_at) from public.pagos_suscripcion p where p.negocio_id = n.id and p.estado = 'pagado'),
      (select count(*) from public.pagos_suscripcion p where p.negocio_id = n.id and p.estado = 'pagado'),
      (select coalesce(sum(p.monto_centavos), 0) from public.pagos_suscripcion p where p.negocio_id = n.id and p.estado = 'pagado')
    from public.negocios n
    left join public.suscripciones s on s.negocio_id = n.id and s.deleted_at is null
    left join public.planes ps on ps.id = s.plan_id
    left join public.planes pn on pn.id = n.plan_id
    where n.deleted_at is null
    order by n.created_at;
end;
$$;
revoke execute on function public.plataforma_cobros() from public, anon;
grant execute on function public.plataforma_cobros() to authenticated;

create or replace function public.plataforma_pagos_negocio(p_negocio_id uuid)
returns table (stripe_invoice_id text, numero text, estado text, monto_centavos int, periodo_inicio timestamptz,
               periodo_fin timestamptz, pagado_at timestamptz, fallo_at timestamptz, motivo_fallo text,
               url_factura text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  return query
    select p.stripe_invoice_id, p.numero, p.estado, p.monto_centavos, p.periodo_inicio, p.periodo_fin,
      p.pagado_at, p.fallo_at, p.motivo_fallo, p.url_factura, p.created_at
    from public.pagos_suscripcion p
    where p.negocio_id = p_negocio_id and p.deleted_at is null
    order by coalesce(p.pagado_at, p.fallo_at, p.created_at) desc;
end;
$$;
revoke execute on function public.plataforma_pagos_negocio(uuid) from public, anon;
grant execute on function public.plataforma_pagos_negocio(uuid) to authenticated;

-- ── Guardar un plan: el anual siempre son diez mensualidades ──
create or replace function public.plataforma_guardar_plan(
  p_id uuid, p_clave text, p_nombre text, p_descripcion text, p_tipo text,
  p_precio_mensual numeric, p_precio_anual numeric, p_modulos text[], p_orden int, p_activo boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_invalidos text[];
  v_anual numeric := round(p_precio_mensual * 10, 2);
begin
  if not public.es_admin_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  if coalesce(btrim(p_nombre), '') = '' or coalesce(btrim(p_clave), '') = '' then
    raise exception 'El plan necesita clave y nombre.';
  end if;
  if p_precio_mensual is null or p_precio_mensual < 0 then
    raise exception 'El precio mensual tiene que ser de cero para arriba.';
  end if;
  if lower(btrim(p_clave)) !~ '^[a-z0-9_]+$' then
    raise exception 'La clave solo lleva minúsculas, números y guion bajo (va en la lookup key de Stripe).';
  end if;
  v_invalidos := array(select x from unnest(coalesce(p_modulos, '{}'::text[])) x
                       where not exists (select 1 from public.modulos m where m.clave = x));
  if cardinality(v_invalidos) > 0 then
    raise exception 'Módulos que no existen: %.', array_to_string(v_invalidos, ', ');
  end if;
  if p_id is null then
    insert into public.planes (clave, nombre, descripcion, tipo, precio_mensual, precio_anual, modulos, orden, activo)
    values (lower(btrim(p_clave)), btrim(p_nombre), nullif(btrim(coalesce(p_descripcion, '')), ''), p_tipo,
            p_precio_mensual, v_anual, coalesce(p_modulos, '{}'), coalesce(p_orden, 0), coalesce(p_activo, true))
    returning id into v_id;
  else
    update public.planes set nombre = btrim(p_nombre), descripcion = nullif(btrim(coalesce(p_descripcion, '')), ''),
      tipo = p_tipo, precio_mensual = p_precio_mensual, precio_anual = v_anual, modulos = coalesce(p_modulos, '{}'),
      orden = coalesce(p_orden, orden), activo = coalesce(p_activo, activo)
    where id = p_id and deleted_at is null
    returning id into v_id;
    if v_id is null then
      raise exception 'Ese plan no existe.';
    end if;
  end if;
  perform public.plataforma_registrar_evento('editar_plan', null, null, null,
    jsonb_build_object('plan', p_clave, 'nombre', p_nombre, 'mensual', p_precio_mensual, 'anual', v_anual, 'modulos', p_modulos));
  return v_id;
end;
$$;
update public.planes set precio_anual = round(precio_mensual * 10, 2) where precio_anual <> round(precio_mensual * 10, 2);

-- ── La frontera ──
create or replace function public.auditoria_frontera()
returns table (tipo text, nombre text, detalle text)
language sql
stable
security definer
set search_path = ''
as $$
  with lista_blanca(nombre) as (values
    ('current_rol'), ('es_miembro'), ('mi_cliente_id'), ('rol_en_negocio'), ('tiene_permiso'), ('mis_permisos'),
    ('persona_en_negocio'), ('zona_negocio'), ('negocio_por_host'), ('mis_negocios'), ('is_admin'), ('is_staff'),
    ('mi_empleado_id'), ('puede_ver_empleado'), ('cuentas_para_empleado'), ('email_de_login_por_telefono'),
    ('existe_usuario_por_email'), ('listar_cuentas'), ('listar_cuentas_sin_vincular'), ('listar_cuentas_vinculadas'),
    ('listar_personal'), ('listar_personal_estetica'), ('handle_new_user'), ('negocio_de_archivo_perro'),
    ('es_dueno_de_archivo_perro'), ('proteger_membresia'), ('crear_negocio'), ('agregar_admin_negocio'),
    ('auditoria_frontera'), ('proteger_columnas_sensibles_profile'), ('asignar_rol_staff'),
    ('usuario_por_email'), ('negocio_publico'), ('email_de_persona_por_telefono'),
    ('persona_en_otro_negocio'), ('es_admin_plataforma'), ('agregar_admin_plataforma'),
    ('plataforma_negocios'), ('plataforma_buscar_personas'), ('plataforma_registrar_evento'),
    ('plataforma_actualizar_negocio'), ('membresia_no_plataforma'), ('plataforma_buscar_personas_por_id'), ('negocio_escribible'), ('negocio_escribible_en'),
    ('slug_libre'), ('registrar_negocio_prueba'), ('puede_registrar_prueba'), ('demo_vaciar'), ('plataforma_cambiar_plan'), ('plataforma_guardar_plan'), ('plataforma_asignar_plan'), ('evaluar_web_gratis'),
    ('plataforma_cobros'), ('plataforma_pagos_negocio')
  ),
  compartidas(nombre) as (values ('razas'), ('tamanos_categoria'), ('tipos_pelaje'), ('unidades_medida'), ('profiles'), ('negocios'), ('plataforma_admins'), ('plataforma_eventos'), ('registros_prueba'), ('modulos'), ('planes'),
    ('planes_precios_stripe'), ('eventos_stripe'))
  select 'funcion_definer_postgres', p.proname::text, pg_get_function_identity_arguments(p.oid)
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
    and p.proname not in (select nombre from lista_blanca)
  union all
  select 'tabla_sin_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and c.relname not in (select nombre from compartidas)
    and not exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
  union all
  select 'tabla_sin_politica_negocio', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from pg_attribute a where a.attrelid = c.oid and a.attname = 'negocio_id' and not a.attisdropped)
    and c.relname not in (select nombre from compartidas)
    and (
      not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                  and pp.permissive = 'RESTRICTIVE' and pp.qual like '%negocio_actual()%' and pp.qual like '%es_miembro()%')
      or not exists (select 1 from pg_policies pp where pp.schemaname = 'public' and pp.tablename = c.relname
                     and 'peludesk_definer' = any(pp.roles) and pp.qual like '%negocio_actual()%')
      or not c.relrowsecurity
    )
  union all
  select 'vista_sin_security_invoker', c.relname::text, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
    and not coalesce('security_invoker=true' = any(c.reloptions), false)
  union all
  select 'politica_storage_sin_negocio', pp.policyname::text, coalesce(pp.qual, pp.with_check)
  from pg_policies pp
  where pp.schemaname = 'storage' and pp.tablename = 'objects'
    and coalesce(pp.qual, '') || coalesce(pp.with_check, '') ~ '(is_staff\(\)|current_rol\(\)|is_admin\(\))'
  union all
  -- Una función que llama a otra que ya no existe truena hasta que alguien
  -- la ejerce (así quedó handle_user_email_confirmed en el paso 2).
  select 'llamada_a_funcion_inexistente', r.proname::text, r.ref
  from (
    select distinct p.proname, (regexp_matches(pg_get_functiondef(p.oid), 'public[.]([a-z_0-9]+)[ ]*[(]', 'g'))[1] as ref
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
  ) r
  where not exists (select 1 from pg_proc p2 where p2.proname = r.ref)
    and not exists (select 1 from pg_class c where c.relname = r.ref and c.relnamespace = 'public'::regnamespace);
$$;
revoke execute on function public.auditoria_frontera() from public, anon, authenticated;
grant execute on function public.auditoria_frontera() to service_role;
