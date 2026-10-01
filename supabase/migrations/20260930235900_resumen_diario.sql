-- Resumen diario de PeluDesk por Telegram (30 de septiembre de 2026).
--
-- Es de la PLATAFORMA (sin negocio_id: van en la lista de compartidas de
-- auditoria_frontera). Las lee la administración de PeluDesk y solo las
-- escribe el servidor (secret key) o las funciones plataforma_resumen_*.
--
--   resumenes_diarios  uno por día cubierto (fecha única entre los vivos):
--                      lo que se mandó, en cuántas partes, qué fuentes
--                      fallaron y la foto de los seguidores/ingreso de ese
--                      día (para la comparación del siguiente).
--   resumen_ajustes    hora, secciones, umbrales y pausa.
--
--   resumen_reservar(fecha, origen, forzar)  toma el día de forma atómica:
--       NULL = ya se mandó o se está mandando; no se manda dos veces.
--   resumen_datos(...)  lo que sale de las tablas de negocios (registros,
--       pruebas, cobro) y del bot, agregado: nunca filas de un negocio ni
--       teléfonos completos. Solo service_role.

create table public.resumenes_diarios (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  estado text not null default 'enviando' check (estado in ('enviando', 'enviado', 'fallido')),
  origen text not null default 'cron' check (origen in ('cron', 'manual')),
  texto text,
  partes int not null default 0,
  fuentes_fallidas text[] not null default '{}',
  snapshot jsonb,
  error text,
  veces int not null default 0,
  enviado_at timestamptz,
  bloqueo_hasta timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index resumenes_diarios_fecha on public.resumenes_diarios (fecha) where deleted_at is null;
create trigger set_updated_at before insert or update on public.resumenes_diarios for each row execute function public.set_updated_at();

create table public.resumen_ajustes (
  id uuid primary key default gen_random_uuid(),
  clave text not null,
  valor text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index resumen_ajustes_clave on public.resumen_ajustes (clave) where deleted_at is null;
create trigger set_updated_at before insert or update on public.resumen_ajustes for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['resumenes_diarios', 'resumen_ajustes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_escritura', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ── Ajustes (desde /plataforma/resumen, con la sesión de la plataforma) ──
create or replace function public.plataforma_resumen_ajustes(p_valores jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_k text;
  v_v text;
  v_validas text[] := array['pausa', 'hora', 'secciones', 'umbral_gasto', 'umbral_horas'];
begin
  if not public.soporte_es_plataforma() then
    raise exception 'Solo la administración de PeluDesk.';
  end if;
  for v_k, v_v in select key, value from jsonb_each_text(coalesce(p_valores, '{}'::jsonb)) loop
    if not (v_k = any (v_validas)) then
      raise exception 'Ajuste desconocido: %', v_k;
    end if;
    if length(v_v) > 200 then
      raise exception 'Valor demasiado largo.';
    end if;
    update public.resumen_ajustes set valor = v_v where clave = v_k and deleted_at is null;
    if not found then
      insert into public.resumen_ajustes (clave, valor, created_by) values (v_k, v_v, null);
    end if;
  end loop;
end;
$$;

-- ── Tomar el día de forma atómica ──
create or replace function public.resumen_reservar(p_fecha date, p_origen text, p_forzar boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.resumenes_diarios (fecha, estado, origen, bloqueo_hasta, created_by)
  values (p_fecha, 'enviando', p_origen, now() + interval '10 minutes', null)
  on conflict (fecha) where deleted_at is null do nothing
  returning id into v_id;
  if v_id is not null then
    return v_id;
  end if;
  update public.resumenes_diarios
     set estado = 'enviando', origen = p_origen, bloqueo_hasta = now() + interval '10 minutes'
   where fecha = p_fecha and deleted_at is null
     and (
       (estado = 'enviando' and bloqueo_hasta < now())
       or estado = 'fallido'
       or (p_forzar and estado = 'enviado')
     )
  returning id into v_id;
  return v_id;
end;
$$;

-- ── Los datos internos, agregados ──
-- p_dia: el día cubierto (Ciudad de México). Todo se agrupa en ese día, el
-- día anterior, la semana (7 días que terminan en p_dia) y la anterior, y el
-- mes que contiene a p_dia. p_utm_campana: la campaña de PeluDesk en Meta.
create or replace function public.resumen_datos(p_dia date, p_modo text, p_utm_campana text, p_horas_sin_contestar numeric)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  z constant text := 'America/Mexico_City';
  d0 timestamptz := p_dia::timestamp at time zone z;
  d1 timestamptz := (p_dia + 1)::timestamp at time zone z;
  da timestamptz := (p_dia - 1)::timestamp at time zone z;
  s0 timestamptz := (p_dia - 6)::timestamp at time zone z;
  sa timestamptz := (p_dia - 13)::timestamp at time zone z;
  m0 timestamptz := date_trunc('month', p_dia::timestamp) at time zone z;
  h1 timestamptz := (p_dia + 2)::timestamp at time zone z;
  ahora timestamptz := now();
  r jsonb;
begin
  r := jsonb_build_object(
    'registros', jsonb_build_object(
      'dia', (select count(*) from public.registros_prueba x where x.deleted_at is null and x.created_at >= d0 and x.created_at < d1),
      'antes', (select count(*) from public.registros_prueba x where x.deleted_at is null and x.created_at >= da and x.created_at < d0),
      'mes', (select count(*) from public.registros_prueba x where x.deleted_at is null and x.created_at >= m0 and x.created_at < d1),
      'semana', (select count(*) from public.registros_prueba x where x.deleted_at is null and x.created_at >= s0 and x.created_at < d1),
      'semana_antes', (select count(*) from public.registros_prueba x where x.deleted_at is null and x.created_at >= sa and x.created_at < s0),
      'campana_dia', (select count(*) from public.registros_prueba x where x.deleted_at is null and x.utm_campaign = p_utm_campana and x.created_at >= d0 and x.created_at < d1),
      'campana_mes', (select count(*) from public.registros_prueba x where x.deleted_at is null and x.utm_campaign = p_utm_campana and x.created_at >= m0 and x.created_at < d1),
      'origen_dia', coalesce((select jsonb_agg(jsonb_build_object('origen', o, 'n', n) order by n desc) from (
          select coalesce(nullif(concat_ws(' · ', x.utm_source, x.utm_campaign), ''), 'directo') o, count(*) n
          from public.registros_prueba x where x.deleted_at is null and x.created_at >= d0 and x.created_at < d1 group by 1) q), '[]'::jsonb),
      'origen_mes', coalesce((select jsonb_agg(jsonb_build_object('origen', o, 'n', n) order by n desc) from (
          select coalesce(nullif(concat_ws(' · ', x.utm_source, x.utm_campaign), ''), 'directo') o, count(*) n
          from public.registros_prueba x where x.deleted_at is null and x.created_at >= m0 and x.created_at < d1 group by 1) q), '[]'::jsonb),
      'anuncio_dia', coalesce((select jsonb_object_agg(c, n) from (
          select x.utm_content c, count(*) n from public.registros_prueba x
          where x.deleted_at is null and x.utm_campaign = p_utm_campana and x.utm_content is not null and x.created_at >= d0 and x.created_at < d1 group by 1) q), '{}'::jsonb),
      'anuncio_mes', coalesce((select jsonb_object_agg(c, n) from (
          select x.utm_content c, count(*) n from public.registros_prueba x
          where x.deleted_at is null and x.utm_campaign = p_utm_campana and x.utm_content is not null and x.created_at >= m0 and x.created_at < d1 group by 1) q), '{}'::jsonb)
    ),
    'negocios', jsonb_build_object(
      'pruebas_activas', (select count(*) from public.negocios n where n.deleted_at is null and n.activo and n.plan = 'prueba' and not n.cobro_exento and n.prueba_termina_at > ahora),
      'vencen', coalesce((select jsonb_agg(jsonb_build_object('nombre', n.nombre, 'dias', ceil(extract(epoch from (n.prueba_termina_at - ahora)) / 86400)) order by n.prueba_termina_at)
          from public.negocios n where n.deleted_at is null and n.activo and n.plan = 'prueba' and not n.cobro_exento
            and n.prueba_termina_at > ahora and n.prueba_termina_at <= ahora + interval '3 days'), '[]'::jsonb),
      'convertidas_dia', (select count(*) from (
          select p.negocio_id, min(p.pagado_at) primero from public.pagos_suscripcion p
          join public.negocios n on n.id = p.negocio_id and not n.cobro_exento and n.plan <> 'demo'
          where p.estado = 'pagado' and p.modo = p_modo and p.monto_centavos > 0 and p.deleted_at is null group by p.negocio_id) q
          where q.primero >= d0 and q.primero < d1),
      'convertidas_mes', (select count(*) from (
          select p.negocio_id, min(p.pagado_at) primero from public.pagos_suscripcion p
          join public.negocios n on n.id = p.negocio_id and not n.cobro_exento and n.plan <> 'demo'
          where p.estado = 'pagado' and p.modo = p_modo and p.monto_centavos > 0 and p.deleted_at is null group by p.negocio_id) q
          where q.primero >= m0 and q.primero < d1),
      'cancelaciones_dia', (select count(*) from public.suscripciones s where s.deleted_at is null and s.modo = p_modo and s.cancelada_at >= d0 and s.cancelada_at < d1),
      'cancelaciones_mes', (select count(*) from public.suscripciones s where s.deleted_at is null and s.modo = p_modo and s.cancelada_at >= m0 and s.cancelada_at < d1),
      'pagos_fallidos_dia', (select count(*) from public.pagos_suscripcion p where p.deleted_at is null and p.modo = p_modo and p.fallo_at >= d0 and p.fallo_at < d1),
      'en_gracia', coalesce((select jsonb_agg(jsonb_build_object('nombre', q.nombre, 'estado', q.estado)) from (
          select n.nombre, public.estado_cobro_en(n.id) estado from public.negocios n where n.deleted_at is null and n.activo) q
          where q.estado in ('gracia', 'solo_lectura')), '[]'::jsonb),
      -- El mismo cálculo de /plataforma/cobro (plataforma_cobros): suscripciones
      -- que se están cobrando; el anual cuenta como su doceava parte. Con IVA.
      'mrr_centavos', coalesce((select sum(case when s.periodicidad = 'anual' then round(s.monto_centavos / 12.0) else s.monto_centavos end)::bigint
          from public.negocios n
          join public.suscripciones s on s.negocio_id = n.id and s.deleted_at is null
          where n.deleted_at is null and s.monto_centavos is not null and not s.cancela_al_terminar
            and public.estado_cobro_en(n.id) in ('al_corriente', 'gracia')), 0)
    ),
    'chats', (
      with nuevos as (
        select h.* from public.wa_hilos h where h.deleted_at is null and h.created_at >= d0 and h.created_at < d1
      ), antes as (
        select h.* from public.wa_hilos h where h.deleted_at is null and h.created_at >= da and h.created_at < d0
      ), esc as (
        select n.id, n.estado,
               (n.telegram_message_id is not null or exists (select 1 from public.wa_uso_ia u where u.telefono = n.telefono and u.resultado = 'escalo' and u.created_at >= n.created_at)) escalado,
               exists (select 1 from public.wa_mensajes m where m.telefono = n.telefono and m.quien in ('agente', 'humano') and m.deleted_at is null) respondido
        from nuevos n
      ), tiempos as (
        select extract(epoch from (b.t1 - b.t0)) seg from (
          select a.t0, (select min(m.created_at) from public.wa_mensajes m
                        where m.telefono = a.telefono and m.quien in ('agente', 'humano') and m.deleted_at is null and m.created_at > a.t0) t1
          from (select n.telefono, (select min(m.created_at) from public.wa_mensajes m where m.telefono = n.telefono and m.quien = 'usuario' and m.deleted_at is null) t0
                from nuevos n) a) b
        where b.t0 is not null and b.t1 is not null
      )
      select jsonb_build_object(
        'prospectos', (select count(*) from nuevos where tipo = 'prospecto'),
        'clientes', (select count(*) from nuevos where tipo <> 'prospecto'),
        'antes_prospectos', (select count(*) from antes where tipo = 'prospecto'),
        'antes_clientes', (select count(*) from antes where tipo <> 'prospecto'),
        'ia_sola', (select count(*) from esc where not escalado and respondido),
        'escaladas', (select count(*) from esc where escalado),
        'escaladas_abiertas', (select count(*) from esc where escalado and estado = 'abierto'),
        'primera_respuesta_seg', (select round(avg(seg)::numeric, 1) from tiempos),
        'primera_respuesta_n', (select count(*) from tiempos),
        'sin_contestar', coalesce((select jsonb_agg(jsonb_build_object('tel4', right(h.telefono, 4), 'horas', round((extract(epoch from (ahora - h.ultimo_entrante_at)) / 3600)::numeric, 1)) order by h.ultimo_entrante_at)
            from public.wa_hilos h
            where h.deleted_at is null and h.estado = 'abierto' and h.telegram_message_id is not null
              and h.ultimo_entrante_at is not null and h.ultimo_entrante_at < ahora - make_interval(secs => (p_horas_sin_contestar * 3600)::double precision)
              and (h.ultimo_humano_at is null or h.ultimo_humano_at < h.ultimo_entrante_at)), '[]'::jsonb),
        'ia_errores_24h', (select count(*) from public.wa_uso_ia u where u.deleted_at is null and u.resultado = 'error' and u.created_at > ahora - interval '24 hours'),
        'ia_ultimo', (select u.resultado from public.wa_uso_ia u where u.deleted_at is null and u.created_at > ahora - interval '24 hours' order by u.created_at desc limit 1),
        'ia_costo_mxn', (select coalesce(round(sum(u.costo_mxn)::numeric, 2), 0) from public.wa_uso_ia u where u.deleted_at is null and u.created_at >= d0 and u.created_at < d1)
      )
    ),
    'redes', jsonb_build_object(
      'publicadas', coalesce((select jsonb_agg(jsonb_build_object('video', p.video, 'red', p.red, 'formato', p.formato, 'url', p.url, 'publicacion_id', p.publicacion_id) order by p.publicada_at)
          from public.redes_publicaciones p where p.deleted_at is null and not p.prueba and p.estado = 'publicada' and p.publicada_at >= d0 and p.publicada_at < d1), '[]'::jsonb),
      'hoy', coalesce((select jsonb_agg(jsonb_build_object('video', p.video, 'red', p.red, 'hora', to_char(p.programada_at at time zone z, 'HH24:MI')) order by p.programada_at)
          from public.redes_publicaciones p where p.deleted_at is null and not p.prueba and p.estado in ('programada', 'reintentar', 'publicando')
            and p.programada_at >= d1 and p.programada_at < h1), '[]'::jsonb),
      'borradores', coalesce((select jsonb_agg(jsonb_build_object('video', p.video, 'fecha', to_char(p.publicada_at at time zone z, 'DD/MM')) order by p.publicada_at)
          from public.redes_publicaciones p where p.deleted_at is null and not p.prueba and p.red = 'tiktok' and p.estado = 'publicada' and p.publicada_at > ahora - interval '14 days'), '[]'::jsonb),
      'con_problema', coalesce((select jsonb_agg(jsonb_build_object('video', p.video, 'red', p.red, 'estado', p.estado, 'error', left(coalesce(p.error, ''), 120)) order by p.programada_at)
          from public.redes_publicaciones p where p.deleted_at is null and not p.prueba and p.estado in ('fallida', 'revisar')), '[]'::jsonb)
    )
  );
  return r;
end;
$$;

revoke execute on function public.plataforma_resumen_ajustes(jsonb) from public, anon;
grant execute on function public.plataforma_resumen_ajustes(jsonb) to authenticated, service_role;
revoke execute on function public.resumen_reservar(date, text, boolean) from public, anon, authenticated;
revoke execute on function public.resumen_datos(date, text, text, numeric) from public, anon, authenticated;
grant execute on function public.resumen_reservar(date, text, boolean) to service_role;
grant execute on function public.resumen_datos(date, text, text, numeric) to service_role;

-- Tablas compartidas + funciones de postgres: a la lista blanca de la auditoría.
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('resumenes_diarios' in v_def) = 0 then
    v_def := replace(v_def, $a$('aceptaciones_legales'))$a$, $b$('aceptaciones_legales'), ('resumenes_diarios'), ('resumen_ajustes'))$b$);
    v_def := replace(v_def, $a$('redes_secreto_leer')$a$, $b$('redes_secreto_leer'), ('plataforma_resumen_ajustes'), ('resumen_reservar'), ('resumen_datos')$b$);
    if position('resumenes_diarios' in v_def) = 0 or position('resumen_datos' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar el resumen diario.';
    end if;
    execute v_def;
  end if;
end $$;
