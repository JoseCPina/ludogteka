-- Embudo de ventas, etapa 2 (17 de octubre de 2026, carril B): calidad de la base, página personalizada por
-- prospecto (peludesk.mx/para/<slug>) y lista diaria «Contactar hoy».
--   prospectos            + clasificación (giro real y descarte «no es del giro», reversible), ciudad de la
--                           dirección (la de la búsqueda queda en ciudad_busqueda), sucursales (principal_id),
--                           slug de su página, visitas y clics, seguimientos y pausa, etapa «caliente».
--   prospectos_visitas    cada visita a su página y cada clic en «Activar mi prueba gratis» / «Hablar por WhatsApp»
--   prospectos_contactos  la lista del día: un renglón por prospecto y día con canal, tipo (primero, seguimiento) y
--                           el mensaje que se le escribió; queda como bitácora de lo enviado
-- Todo de la PLATAFORMA (en `compartidas` de auditoria_frontera). Solo la administración de PeluDesk lee; las
-- visitas las registra el servidor (la página es pública). Reversa: drop table public.prospectos_contactos,
-- public.prospectos_visitas; alter table public.prospectos drop column … (las de abajo).

-- 1. Etapa «caliente» (abrió su página o le dio clic a algo) y nuevos tipos de evento ----------------------------
alter table public.prospectos drop constraint if exists prospectos_etapa_check;
alter table public.prospectos add constraint prospectos_etapa_check
  check (etapa in ('nuevo', 'contactado', 'caliente', 'respondio', 'en_prueba', 'pagando', 'descartado'));
alter table public.prospectos_eventos drop constraint if exists prospectos_eventos_tipo_check;
alter table public.prospectos_eventos add constraint prospectos_eventos_tipo_check
  check (tipo in ('alta', 'etapa', 'nota', 'cliente', 'datos', 'clasificacion', 'visita', 'sucursal', 'ciudad', 'contacto'));

-- 2. Columnas nuevas de prospectos ------------------------------------------------------------------------------
alter table public.prospectos
  add column ciudad_busqueda text,
  add column estado text,
  add column giro_busqueda text,
  add column web_resumen text check (web_resumen is null or length(web_resumen) <= 600),
  add column clasificacion jsonb,
  add column clasificado_at timestamptz,
  add column clasificacion_revertida_at timestamptz,
  add column descarte_tipo text check (descarte_tipo is null or descarte_tipo in ('no_es_del_giro', 'no_le_interesa', 'manual')),
  add column descarte_motivo text check (descarte_motivo is null or length(descarte_motivo) <= 300),
  add column etapa_antes_descarte text,
  add column principal_id uuid references public.prospectos(id) on delete set null,
  add column marca_norm text,
  add column slug text,
  add column visitas int not null default 0,
  add column primera_visita_at timestamptz,
  add column ultima_visita_at timestamptz,
  add column clic_prueba_at timestamptz,
  add column clic_whatsapp_at timestamptz,
  add column seguimientos int not null default 0,
  add column contacto_pausado_at timestamptz,
  -- «Separar» en la ficha: ya no se vuelve a agrupar como sucursal.
  add column no_agrupar boolean not null default false;

update public.prospectos set ciudad_busqueda = ciudad, giro_busqueda = giro where ciudad_busqueda is null;
create index prospectos_principal on public.prospectos (principal_id) where principal_id is not null;
create index prospectos_marca on public.prospectos (marca_norm) where deleted_at is null and marca_norm is not null;

-- Slug de su página: el nombre en minúsculas sin acentos + 5 caracteres al azar (nadie llega adivinando).
create or replace function public.prospecto_slug_nuevo(p_nombre text)
returns text language sql volatile set search_path = '' as $$
  select left(coalesce(nullif(regexp_replace(coalesce(public.prospecto_texto_norm(p_nombre), ''), ' +', '-', 'g'), ''), 'negocio'), 40)
    || '-' || substr(md5(gen_random_uuid()::text), 1, 5)
$$;
update public.prospectos set slug = public.prospecto_slug_nuevo(nombre) where slug is null;
create unique index prospectos_slug_unico on public.prospectos (slug) where slug is not null;

create or replace function public.prospectos_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.nombre := btrim(new.nombre);
  new.ciudad := btrim(new.ciudad);
  new.correo := nullif(lower(btrim(coalesce(new.correo, ''))), '');
  new.telefono_norm := public.prospecto_telefono_norm(new.telefono);
  new.web_dominio := public.prospecto_dominio(new.web);
  new.nombre_norm := public.prospecto_texto_norm(new.nombre);
  new.ciudad_norm := public.prospecto_texto_norm(new.ciudad);
  if new.slug is null then new.slug := public.prospecto_slug_nuevo(new.nombre); end if;
  if tg_op = 'INSERT' then
    new.ciudad_busqueda := coalesce(new.ciudad_busqueda, new.ciudad);
    new.giro_busqueda := coalesce(new.giro_busqueda, new.giro);
  end if;
  return new;
end;
$$;

-- 3. Registrar lo de Google: la ciudad ya viene de la dirección (la calcula el servidor) y la de la búsqueda aparte.
create or replace function public.prospecto_registrar(p jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v_tel text := public.prospecto_telefono_norm(p->>'telefono');
  v_dom text := public.prospecto_dominio(p->>'web');
  v_nom text := public.prospecto_texto_norm(p->>'nombre');
  v_ciu text := public.prospecto_texto_norm(p->>'ciudad');
  v_correo text := nullif(lower(btrim(coalesce(p->>'correo', ''))), '');
  v_ex public.prospectos;
  v_hay boolean;
  v_neg uuid; v_por text;
  v_id uuid;
begin
  select * into v_ex from public.prospectos x
  where x.deleted_at is null and (
    (p->>'google_place_id' is not null and x.google_place_id = p->>'google_place_id')
    or (v_tel is not null and x.telefono_norm = v_tel)
    or (v_dom is not null and x.web_dominio = v_dom)
    or (x.nombre_norm = v_nom and x.ciudad_norm = v_ciu))
  limit 1;
  v_hay := found;
  if v_hay then
    begin
      update public.prospectos set
        -- Un giro ya decidido por la clasificación no lo cambia otra búsqueda.
        giro = case when clasificado_at is null and giro <> (p->>'giro') and giro <> 'mixto' then 'mixto' else giro end,
        google_place_id = coalesce(google_place_id, p->>'google_place_id'),
        direccion = coalesce(direccion, p->>'direccion'),
        telefono = coalesce(telefono, p->>'telefono'),
        web = coalesce(web, p->>'web'),
        calificacion = coalesce((p->>'calificacion')::numeric, calificacion),
        resenas = coalesce((p->>'resenas')::int, resenas),
        google_tipos = case when cardinality(google_tipos) = 0 then coalesce(array(select jsonb_array_elements_text(p->'google_tipos')), '{}') else google_tipos end
      where id = v_ex.id;
    exception when unique_violation then
      null;
    end;
    return jsonb_build_object('resultado', case when v_ex.negocio_cliente_id is not null then 'cliente' else 'duplicado' end, 'id', v_ex.id);
  end if;

  select d.negocio_id, d.por into v_neg, v_por from public.prospecto_negocio_de(v_tel, v_correo, v_nom) d;
  begin
    insert into public.prospectos (nombre, giro, ciudad, ciudad_busqueda, estado, direccion, telefono, correo, web, calificacion, resenas, fuente,
      google_place_id, google_tipos, negocio_cliente_id, cliente_por)
    values (p->>'nombre', p->>'giro', p->>'ciudad', coalesce(p->>'ciudad_busqueda', p->>'ciudad'), p->>'estado', p->>'direccion', p->>'telefono', v_correo, p->>'web',
      (p->>'calificacion')::numeric, (p->>'resenas')::int, coalesce(p->>'fuente', 'google_places'),
      p->>'google_place_id', coalesce(array(select jsonb_array_elements_text(p->'google_tipos')), '{}'), v_neg, v_por)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('resultado', 'duplicado', 'id', null);
  end;
  return jsonb_build_object('resultado', case when v_neg is not null then 'cliente' else 'nuevo' end, 'id', v_id);
end;
$$;

create or replace function public.prospecto_completar_web(p_id uuid, p jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare v public.prospectos; v_neg uuid; v_por text;
begin
  update public.prospectos set
    correo = coalesce(correo, nullif(p->>'correo', '')),
    instagram = coalesce(instagram, nullif(p->>'instagram', '')),
    facebook = coalesce(facebook, nullif(p->>'facebook', '')),
    whatsapp = coalesce(whatsapp, nullif(p->>'whatsapp', '')),
    web_resumen = coalesce(nullif(left(p->>'resumen', 600), ''), web_resumen),
    web_revisada_at = now(),
    web_error = nullif(p->>'error', '')
  where id = p_id and deleted_at is null
  returning * into v;
  if v.id is null then return jsonb_build_object('ok', false); end if;
  if v.negocio_cliente_id is null and v.correo is not null then
    select d.negocio_id, d.por into v_neg, v_por from public.prospecto_negocio_de(null, v.correo, null) d;
    if v_neg is not null then
      update public.prospectos set negocio_cliente_id = v_neg, cliente_por = v_por where id = p_id;
    end if;
  end if;
  return jsonb_build_object('ok', true, 'cliente', v_neg is not null);
end;
$$;

-- 4. Visitas a su página --------------------------------------------------------------------------------------
create table public.prospectos_visitas (
  id uuid primary key default gen_random_uuid(),
  prospecto_id uuid not null references public.prospectos(id) on delete cascade,
  tipo text not null check (tipo in ('visita', 'clic_prueba', 'clic_whatsapp')),
  ip_hash text,
  navegador text check (navegador is null or length(navegador) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index prospectos_visitas_prospecto on public.prospectos_visitas (prospecto_id, created_at desc);
create trigger set_updated_at before insert or update on public.prospectos_visitas for each row execute function public.set_updated_at();

-- La registra el servidor (página pública). Sube a «caliente» a quien estaba nuevo o contactado.
create or replace function public.prospecto_registrar_visita(p_slug text, p_tipo text, p_ip_hash text, p_navegador text)
returns uuid language plpgsql set search_path = '' as $$
declare v public.prospectos;
begin
  if p_tipo not in ('visita', 'clic_prueba', 'clic_whatsapp') then raise exception 'Tipo de visita no válido.'; end if;
  select * into v from public.prospectos where slug = p_slug and deleted_at is null;
  if v.id is null then return null; end if;
  insert into public.prospectos_visitas (prospecto_id, tipo, ip_hash, navegador) values (v.id, p_tipo, p_ip_hash, left(p_navegador, 300));
  update public.prospectos set
    visitas = visitas + case when p_tipo = 'visita' then 1 else 0 end,
    primera_visita_at = coalesce(primera_visita_at, now()),
    ultima_visita_at = now(),
    clic_prueba_at = case when p_tipo = 'clic_prueba' then now() else clic_prueba_at end,
    clic_whatsapp_at = case when p_tipo = 'clic_whatsapp' then now() else clic_whatsapp_at end,
    etapa = case when etapa in ('nuevo', 'contactado') then 'caliente' else etapa end,
    contacto_pausado_at = null
  where id = v.id;
  insert into public.prospectos_eventos (prospecto_id, tipo, texto)
  values (v.id, 'visita', case p_tipo when 'visita' then 'Abrió su página' when 'clic_prueba' then 'Le dio clic a «Activar mi prueba gratis»' else 'Le dio clic a «Hablar por WhatsApp»' end);
  return v.id;
end;
$$;

-- 5. Lista del día «Contactar hoy» --------------------------------------------------------------------------------
create table public.prospectos_contactos (
  id uuid primary key default gen_random_uuid(),
  prospecto_id uuid not null references public.prospectos(id) on delete cascade,
  fecha date not null,
  canal text not null check (canal in ('whatsapp', 'instagram')),
  tipo text not null check (tipo in ('primero', 'seguimiento_1', 'seguimiento_2')),
  orden int not null default 0,
  mensaje text not null check (length(mensaje) between 1 and 1500),
  redactado_por text not null default 'ia' check (redactado_por in ('ia', 'plantilla')),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'enviado', 'respondio', 'no_interesa', 'omitido')),
  enviado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index prospectos_contactos_dia on public.prospectos_contactos (prospecto_id, fecha) where deleted_at is null;
create index prospectos_contactos_fecha on public.prospectos_contactos (fecha, canal, orden);
create trigger set_updated_at before insert or update on public.prospectos_contactos for each row execute function public.set_updated_at();

alter table public.prospeccion_ajustes
  add column lista_whatsapp int not null default 15 check (lista_whatsapp between 0 and 100),
  add column lista_instagram int not null default 15 check (lista_instagram between 0 and 100),
  add column dias_seguimiento int not null default 3 check (dias_seguimiento between 1 and 30),
  add column max_seguimientos int not null default 2 check (max_seguimientos between 0 and 5),
  add column firma text not null default 'José' check (length(btrim(firma)) between 1 and 40);

-- Marcar lo que pasó con un renglón de la lista (la pantalla, con la sesión de la plataforma). Pasa al prospecto
-- de etapa en la misma transacción: enviado → contactado (con canal y fecha), respondió, no le interesa.
create or replace function public.plataforma_prospecto_contacto(p_contacto uuid, p_accion text)
returns jsonb language plpgsql set search_path = '' as $$
declare c public.prospectos_contactos; p public.prospectos;
begin
  if not coalesce(public.es_admin_plataforma(), false) then raise exception 'Solo la administración de PeluDesk.' using errcode = '42501'; end if;
  if p_accion not in ('enviado', 'respondio', 'no_interesa') then raise exception 'Acción no válida.'; end if;
  select * into c from public.prospectos_contactos where id = p_contacto and deleted_at is null;
  if c.id is null then raise exception 'Ese renglón de la lista ya no existe.'; end if;
  select * into p from public.prospectos where id = c.prospecto_id;
  if p_accion = 'enviado' then
    update public.prospectos_contactos set estado = case when estado = 'pendiente' then 'enviado' else estado end, enviado_at = coalesce(enviado_at, now()) where id = c.id;
    if c.enviado_at is null then
      update public.prospectos set
        etapa = case when etapa in ('nuevo', 'contactado') then 'contactado' else etapa end,
        canal_ultimo_contacto = c.canal,
        ultimo_contacto_at = now(),
        seguimientos = case when c.tipo = 'primero' then 0 else seguimientos + 1 end
      where id = p.id;
      insert into public.prospectos_eventos (prospecto_id, tipo, canal, texto)
      values (p.id, 'contacto', c.canal, case c.tipo when 'primero' then 'Primer mensaje' when 'seguimiento_1' then 'Seguimiento 1' else 'Seguimiento 2' end || E':\n' || c.mensaje);
    end if;
  elsif p_accion = 'respondio' then
    update public.prospectos_contactos set estado = 'respondio', enviado_at = coalesce(enviado_at, now()) where id = c.id;
    update public.prospectos set etapa = case when etapa in ('nuevo', 'contactado', 'caliente') then 'respondio' else etapa end,
      canal_ultimo_contacto = c.canal, ultimo_contacto_at = coalesce(ultimo_contacto_at, now()), contacto_pausado_at = null where id = p.id;
  else
    update public.prospectos_contactos set estado = 'no_interesa' where id = c.id;
    update public.prospectos set etapa_antes_descarte = etapa, etapa = 'descartado', descarte_tipo = 'no_le_interesa', descarte_motivo = 'No le interesa' where id = p.id and etapa <> 'descartado';
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- 6. Acceso ----------------------------------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['prospectos_visitas', 'prospectos_contactos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_sin_escritura', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  -- Marcar enviado / respondió / no le interesa (plataforma_prospecto_contacto corre con la sesión de quien llama).
  create policy prospectos_contactos_update_plataforma on public.prospectos_contactos for update to authenticated
    using ((select public.es_admin_plataforma())) with check ((select public.es_admin_plataforma()));
  grant update on public.prospectos_contactos to authenticated;
end $$;

-- 7. Conteos: solo principales (las sucursales van dentro de su negocio), sin clientes ni descartados ------------
create or replace function public.prospectos_resumen()
returns jsonb language sql stable set search_path = '' as $$
  with base as (
    select * from public.prospectos
    where deleted_at is null and (select public.es_admin_plataforma() or auth.role() = 'service_role')
  ), vivos as (
    select * from base where negocio_cliente_id is null and principal_id is null and etapa <> 'descartado'
  )
  select jsonb_build_object(
    'total', (select count(*) from vivos),
    'clientes', (select count(*) from base where negocio_cliente_id is not null),
    'descartados', (select count(*) from base where negocio_cliente_id is null and principal_id is null and etapa = 'descartado'),
    'descartados_no_giro', (select count(*) from base where negocio_cliente_id is null and etapa = 'descartado' and descarte_tipo = 'no_es_del_giro'),
    'sucursales', (select count(*) from base where principal_id is not null),
    'calientes', (select count(*) from vivos where etapa = 'caliente'),
    'con_telefono', (select count(*) from vivos where telefono_norm is not null),
    'con_correo', (select count(*) from vivos where correo is not null),
    'con_instagram', (select count(*) from vivos where instagram is not null),
    'por_ciudad_giro', coalesce((
      select jsonb_agg(jsonb_build_object('ciudad', ciudad, 'giro', giro, 'n', n) order by ciudad, giro)
      from (select min(ciudad) ciudad, giro, count(*) n from vivos group by ciudad_norm, giro) g), '[]'::jsonb),
    'por_etapa', coalesce((
      select jsonb_object_agg(etapa, n) from (select etapa, count(*) n from base
        where negocio_cliente_id is null and principal_id is null group by etapa) e), '{}'::jsonb)
  )
$$;

do $$
declare f text;
begin
  foreach f in array array['prospecto_slug_nuevo(text)', 'plataforma_prospecto_contacto(uuid,text)', 'prospectos_resumen()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  foreach f in array array['prospecto_registrar_visita(text,text,text,text)', 'prospecto_registrar(jsonb)', 'prospecto_completar_web(uuid,jsonb)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- 8. auditoria_frontera: las dos tablas nuevas son de la plataforma -----------------------------------------------
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position($a$('prospectos_visitas')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('prospeccion_corridas')$a$, $b$('prospeccion_corridas'), ('prospectos_visitas'), ('prospectos_contactos')$b$);
    if position($a$('prospectos_visitas')$a$ in v_def) = 0 then raise exception 'auditoria_frontera cambió: no se pudieron agregar las tablas de prospectos.'; end if;
    execute v_def;
  end if;
end $$;
