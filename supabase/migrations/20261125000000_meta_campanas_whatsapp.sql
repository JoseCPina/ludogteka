-- Campañas de Meta de clic a WhatsApp para PeluDesk (21 de octubre de 2026).
--
-- 1. Públicos similares (lookalike) de las listas de prospectos: viven en meta_audiencias con tipo «similar».
-- 2. La estructura de la campaña (campaña, conjuntos, imágenes, creativos y anuncios) que el servidor crea en PAUSADO
--    con la Marketing API y revisa cada día: meta_campanas, con el estado que Meta reporta y el gasto, las
--    conversaciones y el costo por conversación de los últimos 7 días.
-- 3. Un mensaje que llega al bot desde un anuncio (referral con ctwa_clid y el id del anuncio) deja un prospecto con
--    fuente «anuncio_meta», el giro del conjunto y el id del anuncio.
-- Todo es de la PLATAFORMA (sin negocio_id; en `compartidas` de auditoria_frontera): lo lee la administración de
-- PeluDesk y lo escribe el servidor.

-- 1. Públicos similares ------------------------------------------------------------------------------------------
alter table public.meta_audiencias
  add column if not exists tipo text not null default 'lista' check (tipo in ('lista', 'similar')),
  add column if not exists origen_clave text,
  add column if not exists ratio numeric check (ratio is null or (ratio > 0 and ratio <= 0.2)),
  add column if not exists pais text;

insert into public.meta_audiencias (clave, nombre, descripcion, tipo, origen_clave, ratio, pais) values
  ('similar_veterinarias', 'PeluDesk · Similar 1 % Veterinarias', 'Público similar (1 %, México) de la lista Veterinarias.', 'similar', 'veterinarias', 0.01, 'MX'),
  ('similar_esteticas', 'PeluDesk · Similar 1 % Estéticas', 'Público similar (1 %, México) de la lista Estéticas.', 'similar', 'esteticas', 0.01, 'MX'),
  ('similar_prospectos', 'PeluDesk · Similar 2 % Prospectos', 'Público similar (2 %, México) de la lista Prospectos.', 'similar', 'prospectos', 0.02, 'MX')
on conflict (clave) do nothing;

-- 2. Estructura de la campaña -----------------------------------------------------------------------------------
create table public.meta_campanas (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z0-9_:.-]{3,120}$'),
  tipo text not null check (tipo in ('campana', 'conjunto', 'imagen', 'creativo', 'anuncio')),
  giro text check (giro is null or giro in ('veterinarias', 'esteticas', 'hotel_guarderia', 'retargeting')),
  nombre text not null check (length(btrim(nombre)) between 3 and 200),
  meta_id text,
  -- pendiente: todavía no está en Meta; creado: existe; error: el último intento falló (ultimo_error lo dice).
  estado text not null default 'pendiente' check (estado in ('pendiente', 'creado', 'error')),
  ultimo_error text check (ultimo_error is null or length(ultimo_error) <= 2000),
  datos jsonb not null default '{}'::jsonb,
  -- Lo que Meta reporta (campaña y conjuntos): estado efectivo y los últimos 7 días.
  estado_meta text,
  presupuesto_diario numeric,
  gasto_7d numeric,
  conversaciones_7d int,
  costo_conversacion numeric,
  insights_at timestamptz,
  -- El conjunto de retargeting lo activa la tarea UNA vez, cuando su público alcanza el tamaño mínimo.
  activado_auto_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index meta_campanas_tipo_idx on public.meta_campanas (tipo, giro);
create index meta_campanas_meta_id_idx on public.meta_campanas (meta_id) where meta_id is not null;

create trigger set_updated_at before insert or update on public.meta_campanas for each row execute function public.set_updated_at();
alter table public.meta_campanas enable row level security;
create policy meta_campanas_select_plataforma on public.meta_campanas for select to authenticated using ((select public.es_admin_plataforma()));
-- Nadie con sesión escribe: solo el servidor (la llave de servicio salta la RLS).
create policy meta_campanas_insert_nadie on public.meta_campanas for insert to authenticated with check (false);
revoke all on public.meta_campanas from anon;

-- 3. Prospectos que llegan por un anuncio ------------------------------------------------------------------------
alter table public.prospectos drop constraint if exists prospectos_fuente_check;
alter table public.prospectos add constraint prospectos_fuente_check check (fuente in ('google_places', 'manual', 'anuncio_meta'));
alter table public.prospectos
  add column if not exists anuncio_id text check (anuncio_id is null or anuncio_id ~ '^[0-9]{1,40}$'),
  add column if not exists anuncio_ctwa_clid text check (anuncio_ctwa_clid is null or length(anuncio_ctwa_clid) <= 300),
  add column if not exists anuncio_at timestamptz;

-- Giro del prospecto por el conjunto del anuncio (o, si el anuncio no es nuestro, por el mensaje prellenado).
create or replace function public.prospecto_giro_de_anuncio(p_ad_id text, p_texto text)
returns text language sql stable set search_path = '' as $$
  select coalesce(
    (select case c.giro when 'veterinarias' then 'veterinaria' when 'esteticas' then 'estetica' when 'hotel_guarderia' then 'mixto' end
       from public.meta_campanas c where c.tipo = 'anuncio' and c.meta_id = p_ad_id and c.deleted_at is null and c.giro <> 'retargeting' limit 1),
    case
      when coalesce(p_texto, '') ~* 'veterinari' then 'veterinaria'
      when coalesce(p_texto, '') ~* 'est[eé]tica' then 'estetica'
      when coalesce(p_texto, '') ~* 'hotel' and coalesce(p_texto, '') ~* 'guarder' then 'mixto'
      when coalesce(p_texto, '') ~* 'hotel' then 'hotel'
      when coalesce(p_texto, '') ~* 'guarder' then 'guarderia'
    end)
$$;
revoke execute on function public.prospecto_giro_de_anuncio(text, text) from public, anon, authenticated;
grant execute on function public.prospecto_giro_de_anuncio(text, text) to service_role;

-- Registra (o encuentra) al prospecto que escribió desde un anuncio. Solo el servidor (webhook del bot).
create or replace function public.prospecto_registrar_anuncio(p_telefono text, p_nombre text, p_ad_id text, p_ctwa_clid text, p_texto text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v public.prospectos;
  v_tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_ad text := nullif(regexp_replace(coalesce(p_ad_id, ''), '\D', '', 'g'), '');
  v_giro text := public.prospecto_giro_de_anuncio(nullif(regexp_replace(coalesce(p_ad_id, ''), '\D', '', 'g'), ''), p_texto);
  v_nombre text := left(coalesce(nullif(btrim(regexp_replace(coalesce(p_nombre, ''), '[\r\n\t]+', ' ', 'g')), ''), 'Contacto'), 120);
  v_nuevo boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if length(v_tel) <> 10 then return null; end if;
  select * into v from public.prospectos where whatsapp_bot = v_tel and deleted_at is null order by updated_at desc limit 1;
  if v.id is null then
    select * into v from public.prospectos where telefono_norm = v_tel and deleted_at is null and principal_id is null order by created_at limit 1;
  end if;
  if v.id is null then
    insert into public.prospectos (nombre, giro, ciudad, telefono, whatsapp, fuente, etapa, canal_ultimo_contacto, ultimo_contacto_at,
                                   whatsapp_bot, anuncio_id, anuncio_ctwa_clid, anuncio_at)
    values (v_nombre || ' · WhatsApp ' || right(v_tel, 4), coalesce(v_giro, 'mixto'), 'Por confirmar', v_tel, v_tel, 'anuncio_meta', 'respondio',
            'whatsapp_bot', now(), v_tel, v_ad, left(p_ctwa_clid, 300), now())
    returning * into v;
    v_nuevo := true;
    insert into public.prospectos_eventos (prospecto_id, tipo, canal, texto)
    values (v.id, 'alta', 'whatsapp_bot', 'Llegó por un anuncio de Meta' || coalesce(' (anuncio ' || v_ad || ')', ''));
  else
    update public.prospectos set
      etapa = case when etapa in ('nuevo', 'contactado', 'caliente') then 'respondio' else etapa end,
      canal_ultimo_contacto = 'whatsapp_bot',
      ultimo_contacto_at = now(),
      contacto_pausado_at = null,
      whatsapp_bot = v_tel,
      anuncio_id = coalesce(v_ad, anuncio_id),
      anuncio_ctwa_clid = coalesce(left(p_ctwa_clid, 300), anuncio_ctwa_clid),
      anuncio_at = now()
    where id = v.id
    returning * into v;
    update public.prospectos_contactos set estado = 'respondio'
    where prospecto_id = v.id and estado in ('pendiente', 'enviado') and deleted_at is null;
    if not exists (select 1 from public.prospectos_eventos e where e.prospecto_id = v.id and e.tipo = 'contacto' and e.canal = 'whatsapp_bot' and e.created_at > now() - interval '1 day') then
      insert into public.prospectos_eventos (prospecto_id, tipo, canal, texto)
      values (v.id, 'contacto', 'whatsapp_bot', 'Le escribió al bot de WhatsApp desde un anuncio de Meta' || coalesce(' (anuncio ' || v_ad || ')', ''));
    end if;
  end if;
  return jsonb_build_object('id', v.id, 'nombre', v.nombre, 'giro', v.giro, 'ciudad', v.ciudad, 'slug', v.slug, 'nuevo', v_nuevo,
    'fuente', v.fuente, 'servicios', coalesce(v.clasificacion -> 'servicios', '[]'::jsonb));
end;
$$;
revoke execute on function public.prospecto_registrar_anuncio(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.prospecto_registrar_anuncio(text, text, text, text, text) to service_role;

-- 4. La tabla nueva es de la plataforma: va a `compartidas` de auditoria_frontera (se parcha la lista vigente).
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.auditoria_frontera()'::regprocedure);
  if position($a$('meta_audiencias_corridas')$a$ in v_def) = 0 then
    raise exception 'auditoria_frontera cambió: no se encontró meta_audiencias_corridas en compartidas.';
  end if;
  if position($a$('meta_campanas')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('meta_audiencias_corridas')$a$, $b$('meta_audiencias_corridas'), ('meta_campanas')$b$);
    execute v_def;
  end if;
end $$;
