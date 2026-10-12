-- Estado de entrega de cada mensaje de WhatsApp que manda PeluDesk (aceptado → enviado → entregado → leído, o
-- fallido con el código de Meta). Hasta hoy el webhook descartaba los «statuses»: un mensaje que Meta aceptaba
-- (devuelve un wamid) pero no entregaba —12-oct, WABA con el método de pago en error, código 141006/131042— no
-- dejaba rastro. Tabla de la PLATAFORMA (sin negocio_id: en `compartidas` de auditoria_frontera); la escribe solo
-- el servidor y los negocios ven únicamente SUS fallos por `wa_fallos_atencion()`.
-- Reversa: drop de las funciones wa_entrega_* / wa_fallo* / plataforma_wa_entregas y de la tabla wa_entregas.

create table public.wa_entregas (
  id uuid primary key default gen_random_uuid(),
  wa_message_id text not null,
  tipo text not null default 'texto',            -- texto | plantilla:<nombre> | imagen | desconocido
  origen text not null default 'desconocido',    -- carnet_recordatorio | teleconsulta | seguimiento | soporte | bot | desconocido
  negocio_ref uuid references public.negocios(id) on delete set null,
  ref_id uuid,
  etiqueta text,                                  -- «Recordatorio de vacuna de Firulais»
  href text,                                      -- dónde se resuelve (ruta de la app del negocio)
  telefono_ult4 text,
  estado text not null default 'aceptado' check (estado in ('aceptado', 'enviado', 'entregado', 'leido', 'fallido')),
  error_codigo int,
  error_titulo text,
  error_detalle text,
  motivo text,                                    -- el motivo en palabras claras (lo arma el servidor)
  aceptado_at timestamptz not null default now(),
  enviado_at timestamptz,
  entregado_at timestamptz,
  leido_at timestamptz,
  fallido_at timestamptz,
  avisado_at timestamptz,                         -- ya se avisó al operador por Telegram
  resuelto_at timestamptz,                        -- «enterado» o reintentado
  resuelto_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index wa_entregas_wamid on public.wa_entregas (wa_message_id);
create index wa_entregas_negocio_fallo on public.wa_entregas (negocio_ref, fallido_at desc) where estado = 'fallido' and resuelto_at is null;
create index wa_entregas_fecha on public.wa_entregas (aceptado_at desc);
create trigger set_updated_at before insert or update on public.wa_entregas for each row execute function public.set_updated_at();

alter table public.wa_entregas enable row level security;
create policy wa_entregas_select_plataforma on public.wa_entregas for select to authenticated using ((select public.es_admin_plataforma()));
create policy wa_entregas_sin_escritura on public.wa_entregas for insert to authenticated with check (false);
grant select on public.wa_entregas to authenticated;

-- ── Registrar el envío (lo que Meta aceptó) ─────────────────────────────
create or replace function public.wa_entrega_registrar(
  p_wa_id text, p_tipo text, p_origen text, p_negocio uuid, p_ref uuid, p_etiqueta text, p_href text, p_ult4 text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_wa_id, '')) = '' then return; end if;
  insert into public.wa_entregas (wa_message_id, tipo, origen, negocio_ref, ref_id, etiqueta, href, telefono_ult4)
  values (p_wa_id, coalesce(p_tipo, 'texto'), coalesce(p_origen, 'desconocido'), p_negocio, p_ref, left(p_etiqueta, 200), left(p_href, 200), right(regexp_replace(coalesce(p_ult4, ''), '\D', '', 'g'), 4))
  on conflict (wa_message_id) do update
     set tipo = excluded.tipo, origen = excluded.origen, negocio_ref = excluded.negocio_ref, ref_id = excluded.ref_id,
         etiqueta = excluded.etiqueta, href = excluded.href, telefono_ult4 = excluded.telefono_ult4;
  -- Si el estado llegó antes que el registro (pasa en milisegundos), el fallo ya se había anotado sin contexto.
  perform public.wa_entrega_propagar(p_wa_id);
end;
$$;

-- ── Un cambio de estado que Meta avisó por el webhook ───────────────────
create or replace function public.wa_entrega_estado(
  p_wa_id text, p_estado text, p_ts timestamptz, p_codigo int, p_titulo text, p_detalle text, p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.wa_entregas;
  v_rango int;
  v_rango_actual int;
  v_nuevo_fallo boolean := false;
  v_avisar boolean := false;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if p_estado not in ('enviado', 'entregado', 'leido', 'fallido') then
    raise exception 'Estado desconocido: %', p_estado;
  end if;
  insert into public.wa_entregas (wa_message_id, tipo) values (p_wa_id, 'desconocido') on conflict (wa_message_id) do nothing;
  select * into v from public.wa_entregas where wa_message_id = p_wa_id for update;
  v_rango := case p_estado when 'enviado' then 1 when 'entregado' then 2 when 'leido' then 3 else 0 end;
  v_rango_actual := case v.estado when 'aceptado' then 0 when 'enviado' then 1 when 'entregado' then 2 when 'leido' then 3 else -1 end;
  if p_estado = 'fallido' then
    -- Un mensaje ya entregado o leído no se vuelve fallido por un aviso tardío.
    if v.estado not in ('entregado', 'leido') then
      v_nuevo_fallo := v.estado <> 'fallido';
      update public.wa_entregas
         set estado = 'fallido', fallido_at = coalesce(p_ts, now()), error_codigo = p_codigo, error_titulo = left(p_titulo, 300),
             error_detalle = left(p_detalle, 500), motivo = left(p_motivo, 500), resuelto_at = null
       where id = v.id;
      v_avisar := v_nuevo_fallo and not exists (
        select 1 from public.wa_entregas o
        where o.avisado_at > now() - interval '6 hours' and o.error_codigo is not distinct from p_codigo and o.id <> v.id
      );
      if v_avisar then update public.wa_entregas set avisado_at = now() where id = v.id; end if;
    end if;
  elsif v_rango > v_rango_actual then
    update public.wa_entregas
       set estado = p_estado,
           enviado_at = case when p_estado = 'enviado' then coalesce(p_ts, now()) else enviado_at end,
           entregado_at = case when p_estado = 'entregado' then coalesce(p_ts, now()) else entregado_at end,
           leido_at = case when p_estado = 'leido' then coalesce(p_ts, now()) else leido_at end,
           -- Si por fin se entregó, el fallo anterior deja de contar.
           error_codigo = case when v.estado = 'fallido' then null else error_codigo end,
           resuelto_at = case when v.estado = 'fallido' then now() else resuelto_at end
     where id = v.id;
  end if;
  perform public.wa_entrega_propagar(p_wa_id);
  select * into v from public.wa_entregas where id = v.id;
  return jsonb_build_object('estado', v.estado, 'origen', v.origen, 'etiqueta', v.etiqueta, 'avisar', v_avisar, 'negocio', v.negocio_ref);
end;
$$;

-- El recordatorio de dosis refleja lo que pasó con su mensaje: si Meta no lo entregó, vuelve a «fallido»
-- (sale en su lista con el botón de wa.me y en «Necesita atención»); si sí, se queda «enviado».
create or replace function public.wa_entrega_propagar(p_wa_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.wa_entregas;
begin
  select * into v from public.wa_entregas where wa_message_id = p_wa_id;
  if not found or v.origen <> 'carnet_recordatorio' or v.ref_id is null or v.negocio_ref is null then return; end if;
  if v.estado = 'fallido' then
    update public.carnet_recordatorios
       set estado = 'fallido', error = left('WhatsApp no lo entregó: ' || coalesce(v.motivo, v.error_titulo, 'sin detalle'), 300)
     where id = v.ref_id and negocio_id = v.negocio_ref and estado = 'enviado' and deleted_at is null;
  end if;
end;
$$;

-- ── Lo que ve el personal del negocio ───────────────────────────────────
create or replace function public.wa_fallos_atencion()
returns table (id uuid, origen text, etiqueta text, href text, motivo text, error_codigo int, fallido_at timestamptz, telefono_ult4 text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) then return; end if;
  return query
  select e.id, e.origen, e.etiqueta, e.href, e.motivo, e.error_codigo, e.fallido_at, e.telefono_ult4
  from public.wa_entregas e
  where e.negocio_ref = public.negocio_actual() and e.estado = 'fallido' and e.resuelto_at is null and e.deleted_at is null
    and e.origen in ('carnet_recordatorio', 'teleconsulta') and e.fallido_at > now() - interval '30 days'
  order by e.fallido_at;
end;
$$;

create or replace function public.wa_fallo_enterado(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal del negocio.' using errcode = '42501';
  end if;
  update public.wa_entregas set resuelto_at = now(), resuelto_por = auth.uid()
   where id = p_id and negocio_ref = public.negocio_actual() and estado = 'fallido' and resuelto_at is null;
  if not found then raise exception 'Ese aviso no existe o ya se resolvió.'; end if;
end;
$$;

-- «Reintentar»: el recordatorio vuelve a «pendiente» y la tarea lo manda otra vez en su siguiente corrida.
create or replace function public.wa_fallo_reintentar(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.wa_entregas;
begin
  if not public.vet_puede('registrar_vacunas') then
    raise exception 'Reintentar un recordatorio es de un médico veterinario, de admin o de quien tenga «Registrar vacunas y desparasitaciones».' using errcode = '42501';
  end if;
  select * into v from public.wa_entregas where id = p_id and negocio_ref = public.negocio_actual() and estado = 'fallido' and resuelto_at is null;
  if not found then raise exception 'Ese aviso no existe o ya se resolvió.'; end if;
  if v.origen <> 'carnet_recordatorio' or v.ref_id is null then
    raise exception 'Este mensaje no se reintenta solo: ábrelo y mándalo por WhatsApp desde su pantalla.';
  end if;
  update public.carnet_recordatorios set estado = 'pendiente', error = null, intentos = 0
   where id = v.ref_id and negocio_id = v.negocio_ref and estado = 'fallido' and deleted_at is null;
  update public.wa_entregas set resuelto_at = now(), resuelto_por = auth.uid() where id = v.id;
end;
$$;

-- ── Lo que ve la plataforma ─────────────────────────────────────────────
create or replace function public.plataforma_wa_entregas(p_dias int default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_desde timestamptz := now() - make_interval(days => greatest(1, least(coalesce(p_dias, 7), 90)));
begin
  if not (public.es_admin_plataforma() or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'por_estado', (select coalesce(jsonb_object_agg(estado, n), '{}'::jsonb) from (select estado, count(*) n from public.wa_entregas where aceptado_at >= v_desde group by estado) x),
    'fallos', (select coalesce(jsonb_agg(f order by f.fallido_at desc), '[]'::jsonb) from (
        select e.origen, e.tipo, e.etiqueta, e.error_codigo, e.motivo, e.fallido_at, e.telefono_ult4, n.nombre as negocio
        from public.wa_entregas e left join public.negocios n on n.id = e.negocio_ref
        where e.estado = 'fallido' and e.aceptado_at >= v_desde order by e.fallido_at desc limit 30) f)
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'wa_entrega_registrar(text,text,text,uuid,uuid,text,text,text)', 'wa_entrega_estado(text,text,timestamptz,int,text,text,text)',
    'wa_entrega_propagar(text)', 'wa_fallos_atencion()', 'wa_fallo_enterado(uuid)', 'wa_fallo_reintentar(uuid)', 'plataforma_wa_entregas(int)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
  end loop;
  revoke execute on function public.wa_entrega_registrar(text,text,text,uuid,uuid,text,text,text) from authenticated;
  revoke execute on function public.wa_entrega_estado(text,text,timestamptz,int,text,text,text) from authenticated;
  revoke execute on function public.wa_entrega_propagar(text) from authenticated;
  grant execute on function public.wa_entrega_registrar(text,text,text,uuid,uuid,text,text,text) to service_role;
  grant execute on function public.wa_entrega_estado(text,text,timestamptz,int,text,text,text) to service_role;
  grant execute on function public.wa_entrega_propagar(text) to service_role;
  grant execute on function public.wa_fallos_atencion() to authenticated, service_role;
  grant execute on function public.wa_fallo_enterado(uuid) to authenticated, service_role;
  grant execute on function public.wa_fallo_reintentar(uuid) to authenticated, service_role;
  grant execute on function public.plataforma_wa_entregas(int) to authenticated, service_role;
end $$;

-- Tabla de la plataforma y funciones de postgres (leen una tabla sin negocio_id): a la lista blanca de la frontera.
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('wa_entregas')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_aprendido'), $a$, $b$('wa_aprendido'), ('wa_entregas'), $b$);
    v_def := replace(v_def, $a$('bot_cuenta_por_telefono')$a$,
      $b$('bot_cuenta_por_telefono'),
    ('wa_entrega_registrar'), ('wa_entrega_estado'), ('wa_entrega_propagar'), ('wa_fallos_atencion'), ('wa_fallo_enterado'), ('wa_fallo_reintentar'), ('plataforma_wa_entregas')$b$);
    if position($a$('wa_entregas')$a$ in v_def) = 0 or position('wa_fallo_reintentar' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar wa_entregas.';
    end if;
    execute v_def;
  end if;
end $$;
