-- Embudo de ventas, etapa 1: prospección diaria y CRM (17 de octubre de 2026, carril B).
--   prospectos               un negocio que podría usar PeluDesk (de Google Places o capturado a mano)
--   prospectos_eventos       historial: alta, cambio de etapa, nota, marca de cliente
--   prospeccion_ajustes      una fila: ciudades, consultas por giro, tope de búsquedas al día, pausa
--   prospeccion_cursores     qué combinación ciudad + consulta se buscó y cuándo (rotación del tope diario)
--   prospeccion_corridas     registro de cada corrida (nuevos, duplicados, clientes, errores)
-- Son de la PLATAFORMA (sin negocio_id: van en `compartidas` de auditoria_frontera). Solo la administración de
-- PeluDesk las lee y edita (es_admin_plataforma); el servidor (llave de servicio) registra lo que encuentra Google.
-- Ningún negocio ve nada.
-- Sin duplicados: lo deciden índices únicos sobre columnas que llena la base (teléfono normalizado a 10 dígitos,
-- dominio web —salvo redes y sitios compartidos—, nombre + ciudad normalizados y el id de Google).
-- Un prospecto que ya es negocio de PeluDesk (por teléfono, correo o nombre) queda con negocio_cliente_id y no
-- cuenta como prospecto (uuid suelto, sin llave foránea: borrar un negocio no debe tropezar con el CRM).
-- Reversa: drop table public.prospeccion_corridas, public.prospeccion_cursores, public.prospeccion_ajustes,
--   public.prospectos_eventos, public.prospectos; drop function public.prospecto_* ;

-- 1. Normalización (una sola: la usan el disparador, la búsqueda de duplicados y la marca de clientes) ----------

create or replace function public.prospecto_texto_norm(p text)
returns text language sql immutable set search_path = '' as $$
  select nullif(btrim(regexp_replace(
    translate(lower(coalesce(p, '')), 'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'),
    '[^a-z0-9]+', ' ', 'g')), '')
$$;

create or replace function public.prospecto_telefono_norm(p text)
returns text language sql immutable set search_path = '' as $$
  select case when length(regexp_replace(coalesce(p, ''), '\D', '', 'g')) >= 10
    then right(regexp_replace(p, '\D', '', 'g'), 10) end
$$;

-- Dominio de una web. Las redes y los sitios que comparten muchos negocios no cuentan como dominio propio
-- (dos guarderías con su Facebook no son la misma).
create or replace function public.prospecto_dominio(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare v text;
begin
  v := lower(btrim(coalesce(p, '')));
  if v = '' then return null; end if;
  v := regexp_replace(v, '^[a-z]+://', '');
  v := split_part(split_part(split_part(v, '/', 1), '?', 1), '#', 1);
  v := split_part(v, ':', 1);
  v := regexp_replace(v, '^(www|m|web)\.', '');
  if v !~ '\.' then return null; end if;
  if v ~ '(^|\.)(facebook\.com|fb\.com|fb\.me|instagram\.com|wa\.me|whatsapp\.com|linktr\.ee|tiktok\.com|youtube\.com|twitter\.com|x\.com|google\.com|goo\.gl|g\.page|business\.site|negocio\.site|bit\.ly|linkin\.bio|beacons\.ai|taplink\.cc|wixsite\.com|blogspot\.com|wordpress\.com|mercadolibre\.com\.mx|doctoralia\.com\.mx|ueniweb\.com|square\.site|godaddysites\.com|site123\.me|webnode\.mx|jimdosite\.com|canva\.site)$' then
    return null;
  end if;
  return v;
end;
$$;

-- 2. Tablas ----------------------------------------------------------------------------------------------------

create table public.prospectos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(btrim(nombre)) between 1 and 200),
  giro text not null check (giro in ('guarderia', 'hotel', 'estetica', 'veterinaria', 'mixto')),
  ciudad text not null check (length(btrim(ciudad)) between 1 and 80),
  direccion text,
  telefono text,
  whatsapp text,
  correo text,
  instagram text,
  facebook text,
  web text,
  calificacion numeric(2, 1) check (calificacion is null or calificacion between 0 and 5),
  resenas int check (resenas is null or resenas >= 0),
  fuente text not null default 'manual' check (fuente in ('google_places', 'manual')),
  google_place_id text,
  google_tipos text[] not null default '{}',
  etapa text not null default 'nuevo' check (etapa in ('nuevo', 'contactado', 'respondio', 'en_prueba', 'pagando', 'descartado')),
  canal_ultimo_contacto text check (canal_ultimo_contacto is null or canal_ultimo_contacto in ('whatsapp', 'llamada', 'correo', 'instagram', 'facebook', 'visita', 'otro')),
  ultimo_contacto_at timestamptz,
  notas text check (notas is null or length(notas) <= 4000),
  -- Ya es negocio de PeluDesk: el negocio y por qué se reconoció. No cuenta como prospecto.
  negocio_cliente_id uuid,
  cliente_por text check (cliente_por is null or cliente_por in ('telefono', 'correo', 'nombre')),
  -- Lo llena la base (disparador): con esto se decide si es duplicado.
  telefono_norm text,
  web_dominio text,
  nombre_norm text,
  ciudad_norm text,
  web_revisada_at timestamptz,
  web_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index prospectos_telefono_unico on public.prospectos (telefono_norm) where deleted_at is null and telefono_norm is not null;
create unique index prospectos_dominio_unico on public.prospectos (web_dominio) where deleted_at is null and web_dominio is not null;
create unique index prospectos_nombre_ciudad_unico on public.prospectos (nombre_norm, ciudad_norm) where deleted_at is null;
create unique index prospectos_google_unico on public.prospectos (google_place_id) where deleted_at is null and google_place_id is not null;
create index prospectos_filtros on public.prospectos (ciudad_norm, giro, etapa) where deleted_at is null;
create index prospectos_sin_web_revisada on public.prospectos (created_at) where deleted_at is null and web is not null and web_revisada_at is null;

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
  return new;
end;
$$;
create trigger prospectos_normalizar before insert or update on public.prospectos for each row execute function public.prospectos_normalizar();
create trigger set_updated_at before insert or update on public.prospectos for each row execute function public.set_updated_at();

create table public.prospectos_eventos (
  id uuid primary key default gen_random_uuid(),
  prospecto_id uuid not null references public.prospectos(id) on delete cascade,
  tipo text not null check (tipo in ('alta', 'etapa', 'nota', 'cliente', 'datos')),
  etapa_anterior text,
  etapa_nueva text,
  canal text,
  texto text check (texto is null or length(texto) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index prospectos_eventos_prospecto on public.prospectos_eventos (prospecto_id, created_at desc);
create trigger set_updated_at before insert or update on public.prospectos_eventos for each row execute function public.set_updated_at();

-- El historial de etapa lo escribe la base: cualquier cambio de etapa (pantalla o servidor) deja su renglón.
create or replace function public.prospectos_historial()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.prospectos_eventos (prospecto_id, tipo, etapa_nueva, texto)
    values (new.id, 'alta', new.etapa, case when new.fuente = 'google_places' then 'Encontrado en Google Maps' else 'Capturado a mano' end);
    if new.negocio_cliente_id is not null then
      insert into public.prospectos_eventos (prospecto_id, tipo, texto) values (new.id, 'cliente', 'Ya es negocio de PeluDesk (por ' || coalesce(new.cliente_por, '?') || ')');
    end if;
  else
    if new.etapa is distinct from old.etapa then
      insert into public.prospectos_eventos (prospecto_id, tipo, etapa_anterior, etapa_nueva, canal)
      values (new.id, 'etapa', old.etapa, new.etapa, new.canal_ultimo_contacto);
    end if;
    if new.negocio_cliente_id is not null and old.negocio_cliente_id is null then
      insert into public.prospectos_eventos (prospecto_id, tipo, texto) values (new.id, 'cliente', 'Ya es negocio de PeluDesk (por ' || coalesce(new.cliente_por, '?') || ')');
    end if;
  end if;
  return new;
end;
$$;
create trigger prospectos_historial after insert or update on public.prospectos for each row execute function public.prospectos_historial();

create table public.prospeccion_ajustes (
  id smallint primary key default 1 check (id = 1),
  ciudades text[] not null default array['San Luis Potosí', 'Ciudad de México', 'Guadalajara', 'Monterrey', 'Querétaro'],
  consultas jsonb not null default jsonb_build_object(
    'guarderia', jsonb_build_array('guardería canina', 'guardería para perros'),
    'hotel', jsonb_build_array('hotel para perros', 'pensión canina'),
    'estetica', jsonb_build_array('estética canina', 'grooming para perros'),
    'veterinaria', jsonb_build_array('veterinaria', 'clínica veterinaria')
  ),
  tope_busquedas_dia int not null default 30 check (tope_busquedas_dia between 0 and 500),
  paginas_por_consulta int not null default 3 check (paginas_por_consulta between 1 and 3),
  pausado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.prospeccion_ajustes for each row execute function public.set_updated_at();
insert into public.prospeccion_ajustes (id) values (1);

create table public.prospeccion_cursores (
  id uuid primary key default gen_random_uuid(),
  ciudad text not null,
  consulta text not null,
  giro text not null,
  ultima_at timestamptz,
  resultados int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index prospeccion_cursores_unico on public.prospeccion_cursores (ciudad, consulta);
create trigger set_updated_at before insert or update on public.prospeccion_cursores for each row execute function public.set_updated_at();

create table public.prospeccion_corridas (
  id uuid primary key default gen_random_uuid(),
  origen text not null default 'cron' check (origen in ('cron', 'manual', 'script')),
  estado text not null default 'corriendo' check (estado in ('corriendo', 'terminada', 'fallida', 'sin_llave', 'pausada')),
  busquedas int not null default 0,
  resultados int not null default 0,
  nuevos int not null default 0,
  duplicados int not null default 0,
  clientes int not null default 0,
  errores int not null default 0,
  webs_revisadas int not null default 0,
  detalle jsonb not null default '{}'::jsonb,
  error text,
  inicio_at timestamptz not null default now(),
  fin_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index prospeccion_corridas_fecha on public.prospeccion_corridas (inicio_at desc);
create trigger set_updated_at before insert or update on public.prospeccion_corridas for each row execute function public.set_updated_at();

-- 3. Acceso: solo la administración de la plataforma (y el servidor, que salta la RLS) ---------------------------

do $$
declare t text;
begin
  foreach t in array array['prospectos', 'prospectos_eventos', 'prospeccion_ajustes', 'prospeccion_cursores', 'prospeccion_corridas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
  -- Lo que la pantalla escribe: prospectos (alta a mano, etapa, notas, datos), eventos (notas) y ajustes.
  create policy prospectos_insert_plataforma on public.prospectos for insert to authenticated with check ((select public.es_admin_plataforma()));
  create policy prospectos_update_plataforma on public.prospectos for update to authenticated using ((select public.es_admin_plataforma())) with check ((select public.es_admin_plataforma()));
  create policy prospectos_eventos_insert_plataforma on public.prospectos_eventos for insert to authenticated with check ((select public.es_admin_plataforma()));
  create policy prospeccion_ajustes_update_plataforma on public.prospeccion_ajustes for update to authenticated using ((select public.es_admin_plataforma())) with check ((select public.es_admin_plataforma()));
  grant insert, update on public.prospectos to authenticated;
  grant insert on public.prospectos_eventos to authenticated;
  grant update on public.prospeccion_ajustes to authenticated;
  create policy prospeccion_cursores_sin_escritura on public.prospeccion_cursores for insert to authenticated with check (false);
  create policy prospeccion_corridas_sin_escritura on public.prospeccion_corridas for insert to authenticated with check (false);
end $$;

-- 4. ¿Ya es negocio de PeluDesk? (lee teléfonos de registro y recepción, correos de los admins en Auth) -----------
-- De postgres (lee auth.users) y en la lista blanca; solo el servidor la ejecuta. Nunca el demo.

create or replace function public.prospecto_negocio_de(p_telefono_norm text, p_correo text, p_nombre_norm text)
returns table (negocio_id uuid, por text)
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  if p_telefono_norm is not null then
    select n.id into v from public.negocios n
    where n.plan is distinct from 'demo' and (
      exists (select 1 from public.registros_prueba r where r.negocio_id = n.id and r.deleted_at is null and public.prospecto_telefono_norm(r.telefono) = p_telefono_norm)
      or exists (select 1 from public.cupo_configuracion c where c.negocio_id = n.id and public.prospecto_telefono_norm(c.telefono_recepcion) = p_telefono_norm)
      or exists (select 1 from public.membresias m join auth.users u on u.id = m.profile_id
                 where m.negocio_id = n.id and m.rol = 'admin' and m.deleted_at is null and lower(u.email) like 't' || p_telefono_norm || '@%')
    ) limit 1;
    if v is not null then return query select v, 'telefono'::text; return; end if;
  end if;
  if p_correo is not null and p_correo <> '' then
    select m.negocio_id into v from public.membresias m join auth.users u on u.id = m.profile_id join public.negocios n on n.id = m.negocio_id
    where m.rol = 'admin' and m.deleted_at is null and n.plan is distinct from 'demo' and lower(u.email) = lower(p_correo) limit 1;
    if v is not null then return query select v, 'correo'::text; return; end if;
  end if;
  if p_nombre_norm is not null then
    select n.id into v from public.negocios n where n.plan is distinct from 'demo' and public.prospecto_texto_norm(n.nombre) = p_nombre_norm limit 1;
    if v is not null then return query select v, 'nombre'::text; return; end if;
  end if;
end;
$$;

-- 5. Registrar lo que encontró Google (solo el servidor) ------------------------------------------------------------
-- Devuelve {resultado: nuevo | duplicado | cliente, id}. Un duplicado con otro giro pasa a «mixto» y se le
-- llenan los datos que le faltaban (sin pisar lo que ya tenía ni lo que se editó a mano).

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
        giro = case when giro <> (p->>'giro') and giro <> 'mixto' then 'mixto' else giro end,
        google_place_id = coalesce(google_place_id, p->>'google_place_id'),
        direccion = coalesce(direccion, p->>'direccion'),
        telefono = coalesce(telefono, p->>'telefono'),
        web = coalesce(web, p->>'web'),
        calificacion = coalesce((p->>'calificacion')::numeric, calificacion),
        resenas = coalesce((p->>'resenas')::int, resenas),
        google_tipos = case when cardinality(google_tipos) = 0 then coalesce(array(select jsonb_array_elements_text(p->'google_tipos')), '{}') else google_tipos end
      where id = v_ex.id;
    exception when unique_violation then
      -- Lo que traía choca con OTRO prospecto (mismo teléfono o dominio): se queda como estaba.
      null;
    end;
    return jsonb_build_object('resultado', case when v_ex.negocio_cliente_id is not null then 'cliente' else 'duplicado' end, 'id', v_ex.id);
  end if;

  select d.negocio_id, d.por into v_neg, v_por from public.prospecto_negocio_de(v_tel, v_correo, v_nom) d;
  begin
    insert into public.prospectos (nombre, giro, ciudad, direccion, telefono, correo, web, calificacion, resenas, fuente,
      google_place_id, google_tipos, negocio_cliente_id, cliente_por)
    values (p->>'nombre', p->>'giro', p->>'ciudad', p->>'direccion', p->>'telefono', v_correo, p->>'web',
      (p->>'calificacion')::numeric, (p->>'resenas')::int, coalesce(p->>'fuente', 'google_places'),
      p->>'google_place_id', coalesce(array(select jsonb_array_elements_text(p->'google_tipos')), '{}'), v_neg, v_por)
    returning id into v_id;
  exception when unique_violation then
    -- Otra corrida lo insertó al mismo tiempo.
    return jsonb_build_object('resultado', 'duplicado', 'id', null);
  end;
  return jsonb_build_object('resultado', case when v_neg is not null then 'cliente' else 'nuevo' end, 'id', v_id);
end;
$$;

-- Completar con lo que dice su web (correo, Instagram, Facebook, WhatsApp). Solo llena lo vacío y vuelve a
-- revisar si con el correo ya es un negocio de PeluDesk.
create or replace function public.prospecto_completar_web(p_id uuid, p jsonb)
returns jsonb language plpgsql set search_path = '' as $$
declare v public.prospectos; v_neg uuid; v_por text;
begin
  update public.prospectos set
    correo = coalesce(correo, nullif(p->>'correo', '')),
    instagram = coalesce(instagram, nullif(p->>'instagram', '')),
    facebook = coalesce(facebook, nullif(p->>'facebook', '')),
    whatsapp = coalesce(whatsapp, nullif(p->>'whatsapp', '')),
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

-- Repasa todos los prospectos contra los negocios (un negocio nuevo puede ser un prospecto de antes).
create or replace function public.prospectos_revisar_clientes()
returns int language plpgsql set search_path = '' as $$
declare r record; v_neg uuid; v_por text; v_n int := 0;
begin
  for r in select id, telefono_norm, correo, nombre_norm from public.prospectos where deleted_at is null and negocio_cliente_id is null loop
    v_neg := null;
    select d.negocio_id, d.por into v_neg, v_por from public.prospecto_negocio_de(r.telefono_norm, r.correo, r.nombre_norm) d;
    if v_neg is not null then
      update public.prospectos set negocio_cliente_id = v_neg, cliente_por = v_por where id = r.id;
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

-- Conteos para la pantalla (sin el tope de 1,000 filas de la API): por ciudad, giro y etapa, y cuántos tienen
-- teléfono, correo e Instagram. Los que ya son negocio de PeluDesk van aparte.
create or replace function public.prospectos_resumen()
returns jsonb language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'total', count(*) filter (where negocio_cliente_id is null),
    'clientes', count(*) filter (where negocio_cliente_id is not null),
    'con_telefono', count(*) filter (where negocio_cliente_id is null and telefono_norm is not null),
    'con_correo', count(*) filter (where negocio_cliente_id is null and correo is not null),
    'con_instagram', count(*) filter (where negocio_cliente_id is null and instagram is not null),
    'por_ciudad_giro', coalesce((
      select jsonb_agg(jsonb_build_object('ciudad', ciudad, 'giro', giro, 'n', n) order by ciudad, giro)
      from (select min(ciudad) ciudad, giro, count(*) n from public.prospectos
            where deleted_at is null and negocio_cliente_id is null group by ciudad_norm, giro) g), '[]'::jsonb),
    'por_etapa', coalesce((
      select jsonb_object_agg(etapa, n) from (select etapa, count(*) n from public.prospectos
            where deleted_at is null and negocio_cliente_id is null group by etapa) e), '{}'::jsonb)
  )
  from public.prospectos where deleted_at is null and (select public.es_admin_plataforma() or auth.role() = 'service_role')
$$;

do $$
declare f text;
begin
  foreach f in array array['prospecto_texto_norm(text)', 'prospecto_telefono_norm(text)', 'prospecto_dominio(text)',
    'prospectos_normalizar()', 'prospectos_historial()', 'prospectos_resumen()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
  -- Solo el servidor.
  foreach f in array array['prospecto_negocio_de(text,text,text)', 'prospecto_registrar(jsonb)', 'prospecto_completar_web(uuid,jsonb)', 'prospectos_revisar_clientes()'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;

-- 6. auditoria_frontera: tablas de la plataforma y la función que lee Auth --------------------------------------

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position($a$('prospectos')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('indexnow_envios')$a$, $b$('indexnow_envios'), ('prospectos'), ('prospectos_eventos'), ('prospeccion_ajustes'), ('prospeccion_cursores'), ('prospeccion_corridas')$b$);
    if position($a$('prospectos')$a$ in v_def) = 0 then raise exception 'auditoria_frontera cambió: no se pudieron agregar las tablas de prospectos.'; end if;
  end if;
  if position($a$('prospecto_negocio_de')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('estado_cobro_en')$a$, $b$('estado_cobro_en'), ('prospecto_negocio_de')$b$);
    if position($a$('prospecto_negocio_de')$a$ in v_def) = 0 then raise exception 'auditoria_frontera cambió: no se pudo agregar prospecto_negocio_de.'; end if;
  end if;
  execute v_def;
end $$;
