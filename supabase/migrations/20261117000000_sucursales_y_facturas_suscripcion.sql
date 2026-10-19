-- Sucursales y facturas de la suscripción de PeluDesk (19 de octubre de 2026).
--
-- 1. SUCURSALES. Cada sucursal es un negocio de PeluDesk (su caja, agenda, personal y página), ligado a la primera
--    del mismo dueño por `negocios.principal_id`. La primera paga el plan; cada sucursal adicional suma a la MISMA
--    suscripción de Stripe un concepto «Sucursal adicional» (plan de tipo 'sucursal' en `planes`, precio editable
--    solo desde la plataforma). La prueba gratis es solo de la primera: una sucursal se abre cuando la primera ya
--    tiene su plan pagado (suscripción activa). El estado de cobro de una sucursal es el de su principal.
-- 2. FACTURAS POR EMITIR. Mientras la emisión automática del CFDI de la suscripción no esté conectada, cada pago de
--    un negocio que capturó sus datos de facturación deja una tarea para la administración de PeluDesk, con los
--    datos fiscales y el monto. Tabla de la PLATAFORMA (sin negocio_id).

-- ── 1. La sucursal apunta a su principal ─────────────────────────────────────────────────────────────────────
alter table public.negocios
  add column if not exists principal_id uuid references public.negocios(id);
alter table public.negocios drop constraint if exists negocios_principal_no_si_mismo;
alter table public.negocios add constraint negocios_principal_no_si_mismo check (principal_id is null or principal_id <> id);
create index if not exists negocios_principal_idx on public.negocios (principal_id) where principal_id is not null;

-- Nadie con sesión cambia a qué negocio pertenece una sucursal.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.validar_negocio()'::regprocedure), chr(13), '') into v_def;
  if position('principal_id' in v_def) = 0 then
    v_def := replace(v_def, 'or new.interno is distinct from old.interno)',
                     'or new.interno is distinct from old.interno or new.principal_id is distinct from old.principal_id)');
    if position('principal_id' in v_def) = 0 then raise exception 'validar_negocio cambió: no se pudo proteger principal_id.'; end if;
    execute v_def;
  end if;
end $$;

-- ── 2. El precio de la sucursal adicional vive en planes ─────────────────────────────────────────────────────
alter table public.planes drop constraint if exists planes_tipo_check;
alter table public.planes add constraint planes_tipo_check check (tipo in ('plan', 'complemento', 'sucursal'));

insert into public.planes (clave, nombre, descripcion, tipo, precio_mensual, precio_anual, modulos, orden, activo)
select 'sucursal_adicional', 'Sucursal adicional',
       'Cada sucursal del mismo dueño después de la primera: su propia caja, agenda, personal y página.',
       'sucursal', 325, 3250, '{}', 90, true
where not exists (select 1 from public.planes where clave = 'sucursal_adicional' and deleted_at is null);

-- ── 3. El estado de cobro de una sucursal es el de su principal ──────────────────────────────────────────────
create or replace function public.estado_cobro_en(p_negocio_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid := p_negocio_id;
  v_principal uuid;
  v_exento boolean;
begin
  if not (coalesce(auth.role(), '') = 'service_role'
          or coalesce(public.es_admin_plataforma(), false)
          or p_negocio_id = public.negocio_actual()) then
    return null;
  end if;
  select n.principal_id, (n.cobro_exento or n.plan = 'demo') into v_principal, v_exento
  from public.negocios n where n.id = p_negocio_id and n.deleted_at is null;
  if not found then
    return null;
  end if;
  if v_exento then
    return 'exento';
  end if;
  -- Una sucursal no tiene suscripción propia: la paga su principal.
  if v_principal is not null then
    v_id := v_principal;
  end if;
  return (
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
    from (select v_id as id) x
    left join public.negocios n on n.id = x.id and n.deleted_at is null
    left join public.suscripciones s on s.negocio_id = n.id and s.deleted_at is null
      and s.stripe_subscription_id is not null
      and s.estado_stripe not in ('incomplete', 'incomplete_expired')
  );
end;
$$;
alter function public.estado_cobro_en(uuid) owner to postgres;
revoke execute on function public.estado_cobro_en(uuid) from public, anon;
grant execute on function public.estado_cobro_en(uuid) to authenticated, service_role, peludesk_definer;

-- mi_cobro dice si el negocio es sucursal de otro.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.mi_cobro()'::regprocedure), chr(13), '') into v_def;
  if position('sucursal_de' in v_def) = 0 then
    v_def := replace(v_def, $a$'exento', v_n.cobro_exento,$a$,
      $b$'exento', v_n.cobro_exento,
    'sucursal_de', (select n2.principal_id from public.negocios n2 where n2.id = public.negocio_actual()),$b$);
    if position('sucursal_de' in v_def) = 0 then raise exception 'mi_cobro cambió: no se pudo agregar sucursal_de.'; end if;
    execute v_def;
  end if;
end $$;

-- ── 4. Las sucursales del dueño ──────────────────────────────────────────────────────────────────────────────
-- Para «Módulos y plan»: la principal y sus sucursales (las de ESTE grupo), si quien llama es admin del negocio
-- de la petición. De postgres porque lee negocios que no son el de la petición; solo nombres y direcciones.
create or replace function public.mis_sucursales()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actual uuid := public.negocio_actual();
  v_principal uuid;
  v_admin_principal boolean;
  v_estado text;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo el admin del negocio.' using errcode = '42501';
  end if;
  select coalesce(n.principal_id, n.id) into v_principal from public.negocios n where n.id = v_actual and n.deleted_at is null;
  v_admin_principal := exists (
    select 1 from public.membresias m
    where m.negocio_id = v_principal and m.profile_id = auth.uid() and m.rol = 'admin' and m.deleted_at is null);
  select s.estado_stripe into v_estado from public.suscripciones s
  where s.negocio_id = v_principal and s.deleted_at is null and s.stripe_subscription_id is not null;
  return jsonb_build_object(
    'principal_id', v_principal,
    'es_principal', v_principal = v_actual,
    'soy_admin_principal', v_admin_principal,
    'estado_stripe', v_estado,
    'negocios', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', n.id, 'nombre', n.nombre, 'slug', n.slug, 'dominio', n.dominio, 'url_publica', n.url_publica,
               'es_principal', n.id = v_principal, 'activo', n.activo,
               'soy_miembro', exists (select 1 from public.membresias m where m.negocio_id = n.id and m.profile_id = auth.uid() and m.deleted_at is null))
             order by n.id <> v_principal, n.created_at)
      from public.negocios n
      where (n.id = v_principal or n.principal_id = v_principal) and n.deleted_at is null), '[]'::jsonb)
  );
end;
$$;
alter function public.mis_sucursales() owner to postgres;
revoke execute on function public.mis_sucursales() from public, anon;
grant execute on function public.mis_sucursales() to authenticated, service_role;

-- Cuántas sucursales adicionales cobra la suscripción de una principal (solo el servidor).
create or replace function public.sucursales_activas(p_principal uuid)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select case when coalesce(auth.role(), '') = 'service_role' then
    (select count(*)::int from public.negocios n where n.principal_id = p_principal and n.activo and n.deleted_at is null)
  end;
$$;
alter function public.sucursales_activas(uuid) owner to postgres;
revoke execute on function public.sucursales_activas(uuid) from public, anon, authenticated;
grant execute on function public.sucursales_activas(uuid) to service_role;

-- Abrir una sucursal. SOLO el servidor (como el registro de prueba): la acción comprueba primero la sesión y el
-- cobro en Stripe; aquí se vuelve a comprobar todo con la persona y el negocio desde donde se pidió.
-- p_solo_revisar: valida nombre y subdominio sin crear nada (antes de cobrar en Stripe).
create or replace function public.crear_sucursal(
  p_persona_id uuid, p_desde_negocio uuid, p_nombre text, p_slug text, p_solo_revisar boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_p record;
  v_principal uuid;
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'Solo el servidor abre sucursales.' using errcode = '42501';
  end if;
  select coalesce(n.principal_id, n.id) into v_principal from public.negocios n where n.id = p_desde_negocio and n.deleted_at is null;
  if v_principal is null then
    raise exception 'Ese negocio no existe.';
  end if;
  select n.* into v_p from public.negocios n where n.id = v_principal and n.deleted_at is null and n.activo;
  if not found then
    raise exception 'Tu primera sucursal no está activa.';
  end if;
  if not exists (select 1 from public.membresias m
                 where m.negocio_id = v_principal and m.profile_id = p_persona_id and m.rol = 'admin' and m.deleted_at is null) then
    raise exception 'Solo el admin de tu primera sucursal abre sucursales nuevas.' using errcode = '42501';
  end if;
  if v_p.plan = 'demo' or v_p.cobro_exento then
    raise exception 'Este negocio está fuera del cobro de PeluDesk: para abrir una sucursal, escríbenos por WhatsApp.';
  end if;
  if not exists (select 1 from public.suscripciones s
                 where s.negocio_id = v_principal and s.deleted_at is null and s.estado_stripe = 'active') then
    raise exception 'La prueba gratis es solo para tu primera sucursal: abres otra cuando tu plan ya esté pagado (al terminar la prueba).';
  end if;
  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'Escribe el nombre de la sucursal (de 2 a 80 caracteres).';
  end if;
  if v_slug !~ '^[a-z0-9]([a-z0-9-]{0,40}[a-z0-9])?$' or length(v_slug) < 3 then
    raise exception 'El subdominio va en minúsculas, números y guiones (de 3 a 42 caracteres), sin acentos ni ñ y sin empezar ni terminar en guion.';
  end if;
  if v_slug in ('www', 'app', 'api', 'admin', 'mail', 'static', 'plataforma', 'soporte', 'demo', 'registro', 'ayuda', 'blog', 'precios') then
    raise exception 'Ese subdominio está reservado para PeluDesk.';
  end if;
  if exists (select 1 from public.negocios n where n.slug = v_slug)
     or exists (select 1 from public.negocios_slugs_anteriores a where a.slug = v_slug and a.deleted_at is null) then
    raise exception 'Ese subdominio ya está ocupado. Escoge otro.';
  end if;
  if p_solo_revisar then
    return jsonb_build_object('principal_id', v_principal, 'slug', v_slug);
  end if;

  -- La sucursal nace con la configuración de la principal (catálogos, requisitos, horario…; nunca precios ni
  -- clientes), en el plan de la principal y sin prueba propia.
  v_id := public.crear_negocio(v_slug, v_nombre, v_p.zona_horaria, v_p.ciudad, null, v_principal);
  update public.negocios
  set plan = 'activo', prueba_termina_at = null, plan_id = v_p.plan_id, principal_id = v_principal
  where id = v_id;
  insert into public.negocio_modulos (negocio_id, modulo, activo)
  select v_id, nm.modulo, nm.activo from public.negocio_modulos nm
  where nm.negocio_id = v_principal and nm.deleted_at is null
  on conflict do nothing;
  perform public.agregar_admin_negocio(v_id, p_persona_id);
  return jsonb_build_object('principal_id', v_principal, 'negocio_id', v_id, 'slug', v_slug);
end;
$$;
alter function public.crear_sucursal(uuid, uuid, text, text, boolean) owner to postgres;
revoke execute on function public.crear_sucursal(uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.crear_sucursal(uuid, uuid, text, text, boolean) to service_role;

-- ── 5. Los negocios de una persona, con sus sucursales juntas ────────────────────────────────────────────────
drop function if exists public.mis_negocios();
create function public.mis_negocios()
returns table(id uuid, slug text, nombre text, dominio text, url_publica text, rol text, grupo_id uuid, grupo_nombre text, es_principal boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select n.id, n.slug, n.nombre, n.dominio, n.url_publica, m.rol,
         coalesce(n.principal_id, n.id) as grupo_id,
         coalesce(p.nombre, n.nombre) as grupo_nombre,
         n.principal_id is null as es_principal
  from public.membresias m
  join public.negocios n on n.id = m.negocio_id and n.activo and n.deleted_at is null
  left join public.negocios p on p.id = n.principal_id
  where m.profile_id = auth.uid() and m.deleted_at is null
  order by coalesce(p.nombre, n.nombre), coalesce(n.principal_id, n.id), n.principal_id is not null, n.nombre;
$$;
alter function public.mis_negocios() owner to postgres;
revoke execute on function public.mis_negocios() from public, anon;
grant execute on function public.mis_negocios() to authenticated, service_role;

-- ── 6. Facturas de la suscripción por emitir (de la plataforma) ──────────────────────────────────────────────
create table if not exists public.facturas_peludesk_por_emitir (
  id uuid primary key default gen_random_uuid(),
  -- Sin llave foránea: tabla de la plataforma (el negocio puede borrarse; el pago no).
  negocio_afectado uuid,
  negocio_nombre text not null,
  modo text not null check (modo in ('test', 'live')),
  stripe_invoice_id text not null,
  stripe_customer_id text,
  numero_stripe text,
  monto_centavos int not null check (monto_centavos > 0),
  concepto text,
  pagado_at timestamptz,
  rfc text not null,
  razon_social text not null,
  regimen_fiscal text not null,
  codigo_postal text not null,
  uso_cfdi text not null,
  correo text not null,
  estado text not null default 'por_emitir' check (estado in ('por_emitir', 'emitida', 'descartada')),
  emitida_at timestamptz,
  emitida_por uuid references auth.users(id) on delete set null,
  folio_fiscal text check (folio_fiscal is null or length(folio_fiscal) <= 60),
  nota text check (nota is null or length(nota) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index if not exists facturas_peludesk_por_emitir_factura_uq on public.facturas_peludesk_por_emitir (stripe_invoice_id) where deleted_at is null;
create index if not exists facturas_peludesk_por_emitir_estado_idx on public.facturas_peludesk_por_emitir (estado, created_at);
create trigger set_updated_at before insert or update on public.facturas_peludesk_por_emitir
  for each row execute function public.set_updated_at();
alter table public.facturas_peludesk_por_emitir enable row level security;
create policy facturas_peludesk_por_emitir_select on public.facturas_peludesk_por_emitir for select to authenticated
  using ((select public.es_admin_plataforma()));
-- La administración marca emitida o descartada; la registra solo el servidor (la llave de servicio salta la RLS).
create policy facturas_peludesk_por_emitir_update on public.facturas_peludesk_por_emitir for update to authenticated
  using ((select public.es_admin_plataforma())) with check ((select public.es_admin_plataforma()));
create policy facturas_peludesk_por_emitir_insert on public.facturas_peludesk_por_emitir for insert to authenticated
  with check (false);
revoke all on public.facturas_peludesk_por_emitir from anon;
revoke all on public.facturas_peludesk_por_emitir from authenticated;
grant select, update on public.facturas_peludesk_por_emitir to authenticated;

-- ── 7. auditoria_frontera: lo nuevo a sus listas blancas ─────────────────────────────────────────────────────
do $$
declare v_def text; v_nuevo text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('crear_sucursal' in v_def) > 0 then return; end if;
  v_nuevo := replace(v_def, $a$('prospecto_negocio_de')$a$,
    $b$('prospecto_negocio_de'), ('crear_sucursal'), ('mis_sucursales'), ('sucursales_activas')$b$);
  if v_nuevo = v_def then raise exception 'auditoria_frontera cambió: lista de funciones de postgres.'; end if;
  v_def := v_nuevo;
  v_nuevo := replace(v_def, $a$('prospectos')$a$, $b$('prospectos'), ('facturas_peludesk_por_emitir')$b$);
  if v_nuevo = v_def then raise exception 'auditoria_frontera cambió: lista de tablas compartidas.'; end if;
  execute v_nuevo;
end $$;
