-- WhatsApp de ventas y el bot ligado al CRM de prospectos (18 de octubre de 2026).
--
-- 1. negocio_perfil.google_place_id: el check de 20261112000000 usaba una repetición {10,300}, que Postgres no
--    acepta (máximo 255): ningún perfil se podía guardar con su lugar de Google.
-- 2. prospectos.canal_ultimo_contacto admite 'whatsapp_bot' (el prospecto le escribió al bot de PeluDesk).
-- 3. prospeccion_ajustes.whatsapp_ventas: el número de ventas en frío (el que José usa a mano con WhatsApp
--    Business). Los mensajes de Instagram de «Contactar hoy» lo dan para quien prefiera contestar por WhatsApp.
-- 4. prospecto_registrar_whatsapp(): cuando alguien escribe al bot, el webhook pregunta si es un prospecto (por
--    la referencia que trae el mensaje prellenado de su página, «ref. abc12», o por su teléfono) y lo marca
--    «respondió» con canal whatsapp_bot. Solo el servidor.

-- 1 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.negocio_perfil drop constraint negocio_perfil_google_place_id_check;
alter table public.negocio_perfil add constraint negocio_perfil_google_place_id_check
  check (google_place_id is null or (google_place_id ~ '^[A-Za-z0-9_-]+$' and length(google_place_id) between 10 and 300));

-- 2 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.prospectos drop constraint prospectos_canal_ultimo_contacto_check;
alter table public.prospectos add constraint prospectos_canal_ultimo_contacto_check
  check (canal_ultimo_contacto is null or canal_ultimo_contacto in ('whatsapp', 'whatsapp_bot', 'llamada', 'correo', 'instagram', 'facebook', 'visita', 'otro'));

-- 3 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
alter table public.prospeccion_ajustes
  add column whatsapp_ventas text not null default '524443103236' check (whatsapp_ventas ~ '^52[0-9]{10}$');

-- 4 ───────────────────────────────────────────────────────────────────────────────────────────────────────────
create or replace function public.prospecto_registrar_whatsapp(p_telefono text, p_ref text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v public.prospectos;
  v_tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_ref text := lower(nullif(btrim(coalesce(p_ref, '')), ''));
  v_por text;
begin
  -- La referencia del mensaje prellenado (los 5 caracteres finales de su slug) manda; si no, su teléfono.
  if v_ref ~ '^[a-z0-9]{5}$' then
    select * into v from public.prospectos where slug like '%-' || v_ref and deleted_at is null order by created_at limit 1;
    v_por := 'referencia';
  end if;
  if v.id is null and length(v_tel) = 10 then
    select * into v from public.prospectos where telefono_norm = v_tel and deleted_at is null and principal_id is null order by created_at limit 1;
    v_por := 'telefono';
  end if;
  if v.id is null then return null; end if;

  update public.prospectos set
    etapa = case when etapa in ('nuevo', 'contactado', 'caliente') then 'respondio' else etapa end,
    canal_ultimo_contacto = 'whatsapp_bot',
    ultimo_contacto_at = now(),
    contacto_pausado_at = null
  where id = v.id;
  -- Lo que estaba en «Contactar hoy» deja de estar pendiente: ya contestó.
  update public.prospectos_contactos set estado = 'respondio'
  where prospecto_id = v.id and estado in ('pendiente', 'enviado') and deleted_at is null;
  -- Una nota por día en su historial (no una por mensaje).
  if not exists (select 1 from public.prospectos_eventos e where e.prospecto_id = v.id and e.tipo = 'contacto' and e.canal = 'whatsapp_bot' and e.created_at > now() - interval '1 day') then
    insert into public.prospectos_eventos (prospecto_id, tipo, canal, texto)
    values (v.id, 'contacto', 'whatsapp_bot', case v_por when 'referencia' then 'Le escribió al bot de WhatsApp desde su página' else 'Le escribió al bot de WhatsApp (por su teléfono)' end);
  end if;
  return jsonb_build_object('id', v.id, 'nombre', v.nombre, 'giro', v.giro, 'ciudad', v.ciudad, 'slug', v.slug, 'por', v_por,
    'servicios', coalesce(v.clasificacion -> 'servicios', '[]'::jsonb));
end;
$$;
revoke execute on function public.prospecto_registrar_whatsapp(text, text) from public, anon, authenticated;
grant execute on function public.prospecto_registrar_whatsapp(text, text) to service_role;
