-- El prospecto que le escribe al bot se reconoce en TODOS sus mensajes, no solo en el primero (18 de octubre de
-- 2026). El mensaje prellenado de su página trae la referencia («ref. abc12») solo una vez; al reconocerlo por ella
-- se guarda el número desde el que escribió (prospectos.whatsapp_bot, últimos 10 dígitos) y los siguientes
-- mensajes se reconocen por ese número.

alter table public.prospectos add column whatsapp_bot text check (whatsapp_bot is null or whatsapp_bot ~ '^[0-9]{10}$');
create index prospectos_whatsapp_bot on public.prospectos (whatsapp_bot) where whatsapp_bot is not null and deleted_at is null;

create or replace function public.prospecto_registrar_whatsapp(p_telefono text, p_ref text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v public.prospectos;
  v_tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_ref text := lower(nullif(btrim(coalesce(p_ref, '')), ''));
  v_por text;
begin
  -- La referencia del mensaje prellenado (los 5 caracteres finales de su slug) manda; luego el número desde el que
  -- ya le escribió al bot; al final, su teléfono de Google.
  if v_ref ~ '^[a-z0-9]{5}$' then
    select * into v from public.prospectos where slug like '%-' || v_ref and deleted_at is null order by created_at limit 1;
    v_por := 'referencia';
  end if;
  if v.id is null and length(v_tel) = 10 then
    select * into v from public.prospectos where whatsapp_bot = v_tel and deleted_at is null order by updated_at desc limit 1;
    v_por := 'whatsapp';
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
    contacto_pausado_at = null,
    whatsapp_bot = case when length(v_tel) = 10 then v_tel else whatsapp_bot end
  where id = v.id;
  update public.prospectos_contactos set estado = 'respondio'
  where prospecto_id = v.id and estado in ('pendiente', 'enviado') and deleted_at is null;
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
