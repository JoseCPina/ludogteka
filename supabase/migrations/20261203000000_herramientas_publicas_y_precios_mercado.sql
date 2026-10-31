-- Herramientas públicas de peludesk.mx (30 de octubre de 2026): la base común de todas (medición por herramienta,
-- lo que cada persona captura ligado a su teléfono para precargarlo en su cuenta, prospectos con fuente
-- «herramienta») y los datos del Índice PeluDesk de precios (precios_mercado y sus rangos).
--
-- Todas son tablas de la PLATAFORMA (sin negocio_id; a la lista de compartidas de auditoria_frontera): las lee la
-- administración de PeluDesk (es_admin_plataforma) y las escribe solo el servidor (service_role). Ningún negocio ve
-- nada de aquí; lo único que toca a un negocio es negocio_perfil.comparte_precios_mercado (su propio interruptor).

-- 1. Prospectos: una fuente más (la persona dejó su teléfono en una herramienta) -----------------------------------
alter table public.prospectos drop constraint if exists prospectos_fuente_check;
alter table public.prospectos add constraint prospectos_fuente_check check (fuente in ('google_places', 'manual', 'anuncio_meta', 'herramienta'));
alter table public.prospectos add column if not exists herramienta_origen text;

-- 2. Medición: visitas, usos, teléfonos y cuentas por herramienta y por fuente ------------------------------------
create table public.herramientas_eventos (
  id uuid primary key default gen_random_uuid(),
  herramienta text not null check (length(herramienta) between 2 and 40),
  evento text not null check (evento in ('visita', 'uso', 'telefono', 'cuenta')),
  fuente text,
  medio text,
  campana text,
  contenido text,
  giro text,
  ciudad text,
  ip_hash text,
  prospecto_id uuid references public.prospectos(id) on delete set null,
  negocio_id uuid references public.negocios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index herramientas_eventos_herramienta on public.herramientas_eventos (herramienta, created_at desc) where deleted_at is null;
create trigger set_updated_at before insert or update on public.herramientas_eventos for each row execute function public.set_updated_at();
alter table public.herramientas_eventos enable row level security;
create policy herramientas_eventos_plataforma on public.herramientas_eventos for select to authenticated using ((select public.es_admin_plataforma()));
-- Nadie con sesión escribe: el servidor (service_role) registra cada evento.

-- 3. Lo que la persona capturó en una herramienta, ligado a su teléfono: se precarga al abrir su prueba -----------
create table public.herramientas_capturas (
  id uuid primary key default gen_random_uuid(),
  telefono_norm text not null check (telefono_norm ~ '^[0-9]{10}$'),
  herramienta text not null check (length(herramienta) between 2 and 40),
  datos jsonb not null default '{}'::jsonb,
  prospecto_id uuid references public.prospectos(id) on delete set null,
  aplicado_negocio_id uuid references public.negocios(id) on delete set null,
  aplicado_at timestamptz,
  aplicado_detalle text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index herramientas_capturas_unica on public.herramientas_capturas (telefono_norm, herramienta) where deleted_at is null;
create trigger set_updated_at before insert or update on public.herramientas_capturas for each row execute function public.set_updated_at();
alter table public.herramientas_capturas enable row level security;
create policy herramientas_capturas_plataforma on public.herramientas_capturas for select to authenticated using ((select public.es_admin_plataforma()));

-- 4. El prospecto que deja su teléfono en una herramienta (solo el servidor) ---------------------------------------
-- Por teléfono: si ya existe (de Google, a mano, de un anuncio) se completa lo que le faltaba y sube a «caliente»;
-- si no, nace con fuente «herramienta». Devuelve id, slug y si es nuevo. El nombre, si no lo dio, sale del giro y
-- los últimos 4 del teléfono («Estética · WhatsApp 1234»); la ciudad, si no la dio, «Por confirmar».
create or replace function public.prospecto_registrar_herramienta(p_telefono text, p_nombre text, p_giro text, p_ciudad text, p_herramienta text)
returns jsonb language plpgsql set search_path = '' as $$
declare
  v public.prospectos;
  v_tel text := right(regexp_replace(coalesce(p_telefono, ''), '\D', '', 'g'), 10);
  v_giro text := case when p_giro in ('guarderia', 'hotel', 'estetica', 'veterinaria', 'mixto') then p_giro else null end;
  v_ciudad text := nullif(btrim(coalesce(p_ciudad, '')), '');
  v_nombre text := nullif(btrim(coalesce(p_nombre, '')), '');
  v_nuevo boolean := false;
  v_texto_giro text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  if length(v_tel) <> 10 then
    raise exception 'Teléfono inválido.';
  end if;
  select * into v from public.prospectos where telefono_norm = v_tel and deleted_at is null and principal_id is null order by created_at limit 1;
  if v.id is null then
    select * into v from public.prospectos where whatsapp_bot = v_tel and deleted_at is null order by updated_at desc limit 1;
  end if;
  if v.id is null then
    v_texto_giro := case coalesce(v_giro, 'mixto') when 'guarderia' then 'Guardería' when 'hotel' then 'Hotel' when 'estetica' then 'Estética' when 'veterinaria' then 'Veterinaria' else 'Negocio' end;
    insert into public.prospectos (nombre, giro, ciudad, telefono, fuente, etapa, herramienta_origen, canal_ultimo_contacto, ultimo_contacto_at)
    values (coalesce(v_nombre, v_texto_giro || ' · WhatsApp ' || right(v_tel, 4)), coalesce(v_giro, 'mixto'), coalesce(v_ciudad, 'Por confirmar'), v_tel, 'herramienta', 'caliente', left(p_herramienta, 40), 'whatsapp', now())
    returning * into v;
    v_nuevo := true;
  else
    update public.prospectos set
      etapa = case when etapa in ('nuevo', 'contactado') then 'caliente' else etapa end,
      giro = case when v_giro is not null and giro = 'mixto' and v_giro <> 'mixto' and clasificado_at is null then v_giro else giro end,
      ciudad = case when v_ciudad is not null and ciudad in ('Por confirmar', '') then v_ciudad else ciudad end,
      nombre = case when v_nombre is not null and nombre like '% · WhatsApp %' then v_nombre else nombre end,
      herramienta_origen = coalesce(herramienta_origen, left(p_herramienta, 40)),
      contacto_pausado_at = null
    where id = v.id
    returning * into v;
  end if;
  insert into public.prospectos_eventos (prospecto_id, tipo, canal, texto)
  values (v.id, 'contacto', 'whatsapp', 'Dejó su teléfono en la herramienta «' || left(p_herramienta, 40) || '» de peludesk.mx');
  return jsonb_build_object('id', v.id, 'slug', v.slug, 'nombre', v.nombre, 'giro', v.giro, 'ciudad', v.ciudad, 'nuevo', v_nuevo, 'baja', v.publicidad_baja_at is not null);
end;
$$;
revoke execute on function public.prospecto_registrar_herramienta(text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.prospecto_registrar_herramienta(text, text, text, text, text) to service_role;

-- 5. Resumen por herramienta y fuente para /plataforma/prospectos → «Herramientas» ---------------------------------
create or replace function public.herramientas_resumen(p_desde timestamptz)
returns table (herramienta text, fuente text, visitas bigint, usos bigint, telefonos bigint, cuentas bigint)
language sql stable set search_path = '' as $$
  select e.herramienta, coalesce(nullif(e.fuente, ''), 'directo') as fuente,
    count(*) filter (where e.evento = 'visita') as visitas,
    count(*) filter (where e.evento = 'uso') as usos,
    count(*) filter (where e.evento = 'telefono') as telefonos,
    count(*) filter (where e.evento = 'cuenta') as cuentas
  from public.herramientas_eventos e
  where e.deleted_at is null
    and (p_desde is null or e.created_at >= p_desde)
    and (select coalesce(public.es_admin_plataforma(), false) or auth.role() = 'service_role')
  group by e.herramienta, coalesce(nullif(e.fuente, ''), 'directo')
  order by e.herramienta, 3 desc;
$$;
revoke execute on function public.herramientas_resumen(timestamptz) from public, anon;
grant execute on function public.herramientas_resumen(timestamptz) to authenticated, service_role;

-- 6. Índice PeluDesk de precios ------------------------------------------------------------------------------------
-- Una fila por precio observado. `servicio` es una clave del catálogo canónico (src/lib/mercado/catalogo.ts) y
-- `talla` acompaña a los servicios que dependen del tamaño del perro. `huella` evita volver a guardar el mismo
-- precio de la misma fuente en el mismo mes.
create table public.precios_mercado (
  id uuid primary key default gen_random_uuid(),
  giro text not null check (giro in ('estetica', 'hotel', 'guarderia', 'veterinaria')),
  servicio text not null check (length(servicio) between 2 and 40),
  talla text check (talla is null or talla in ('chico', 'mediano', 'grande')),
  precio numeric(10, 2) not null check (precio > 0 and precio < 100000),
  ciudad text,
  ciudad_norm text,
  estado text,
  fuente text not null check (fuente in ('sitio_web', 'resenas_google', 'doctoralia', 'cuidadores', 'negocio_peludesk', 'herramienta')),
  url text,
  prospecto_id uuid references public.prospectos(id) on delete set null,
  negocio_origen_id uuid,
  fecha date not null default (now() at time zone 'America/Mexico_City')::date,
  detalle text check (detalle is null or length(detalle) <= 400),
  valido boolean not null default true,
  huella text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index precios_mercado_huella on public.precios_mercado (huella) where huella is not null and deleted_at is null;
create index precios_mercado_busqueda on public.precios_mercado (giro, servicio, ciudad_norm, fecha desc) where deleted_at is null and valido;
create index precios_mercado_estado on public.precios_mercado (giro, servicio, estado) where deleted_at is null and valido;
create index precios_mercado_fuente on public.precios_mercado (fuente, created_at desc) where deleted_at is null;

create or replace function public.precios_mercado_normalizar()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.ciudad := nullif(btrim(coalesce(new.ciudad, '')), '');
  new.ciudad_norm := public.prospecto_texto_norm(new.ciudad);
  new.estado := nullif(btrim(coalesce(new.estado, '')), '');
  return new;
end;
$$;
create trigger precios_mercado_normalizar before insert or update on public.precios_mercado for each row execute function public.precios_mercado_normalizar();
create trigger set_updated_at before insert or update on public.precios_mercado for each row execute function public.set_updated_at();
alter table public.precios_mercado enable row level security;
create policy precios_mercado_plataforma on public.precios_mercado for select to authenticated using ((select public.es_admin_plataforma()));

create table public.precios_mercado_corridas (
  id uuid primary key default gen_random_uuid(),
  fuente text not null check (fuente in ('sitio_web', 'resenas_google', 'doctoralia', 'cuidadores', 'negocio_peludesk', 'reporte_mensual')),
  origen text not null default 'script' check (origen in ('script', 'cron', 'manual')),
  estado text not null default 'corriendo' check (estado in ('corriendo', 'terminada', 'fallida')),
  inicio_at timestamptz not null default now(),
  fin_at timestamptz,
  revisados int not null default 0,
  encontrados int not null default 0,
  insertados int not null default 0,
  costo_ia_mxn numeric(10, 2) not null default 0,
  gasto_usd numeric(10, 2) not null default 0,
  errores int not null default 0,
  detalle jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index precios_mercado_corridas_inicio on public.precios_mercado_corridas (inicio_at desc) where deleted_at is null;
create trigger set_updated_at before insert or update on public.precios_mercado_corridas for each row execute function public.set_updated_at();
alter table public.precios_mercado_corridas enable row level security;
create policy precios_mercado_corridas_plataforma on public.precios_mercado_corridas for select to authenticated using ((select public.es_admin_plataforma()));

-- El interruptor del negocio: compartir sus tarifas con el índice, solo como agregado (apagado por omisión).
alter table public.negocio_perfil add column if not exists comparte_precios_mercado boolean not null default false;

-- 7. Rangos: p25, mediana y p75 de un servicio en una ciudad; con menos de 8 muestras cae al estado y luego al país
-- (solo precios del último año, válidos). `p_talla` null = todas las tallas. Devuelve siempre un objeto con `nivel`
-- ('ciudad', 'estado', 'pais' o 'sin_datos'), el lugar que se usó y la fecha del precio más reciente.
create or replace function public.precios_mercado_rangos(p_giro text, p_servicio text, p_ciudad text, p_estado text, p_talla text default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare
  v_ciudad text := public.prospecto_texto_norm(p_ciudad);
  v_estado text := nullif(btrim(coalesce(p_estado, '')), '');
  r record;
  v_nivel text;
begin
  for v_nivel in select unnest(array['ciudad', 'estado', 'pais']) loop
    if v_nivel = 'ciudad' and (v_ciudad is null or v_ciudad = '') then continue; end if;
    if v_nivel = 'estado' and v_estado is null then continue; end if;
    select count(*) as n,
      percentile_cont(0.25) within group (order by precio) as p25,
      percentile_cont(0.5) within group (order by precio) as mediana,
      percentile_cont(0.75) within group (order by precio) as p75,
      min(precio) as minimo, max(precio) as maximo, max(fecha) as fecha
    into r
    from public.precios_mercado m
    where m.deleted_at is null and m.valido and m.giro = p_giro and m.servicio = p_servicio
      and (p_talla is null or m.talla is null or m.talla = p_talla)
      and m.fecha > (now() at time zone 'America/Mexico_City')::date - 400
      and (v_nivel <> 'ciudad' or m.ciudad_norm = v_ciudad)
      and (v_nivel <> 'estado' or m.estado = v_estado);
    if r.n >= 8 then
      return jsonb_build_object('nivel', v_nivel, 'lugar', case v_nivel when 'ciudad' then p_ciudad when 'estado' then v_estado else 'México' end,
        'p25', round(r.p25::numeric), 'mediana', round(r.mediana::numeric), 'p75', round(r.p75::numeric), 'minimo', r.minimo, 'maximo', r.maximo,
        'muestras', r.n, 'fecha', r.fecha);
    end if;
  end loop;
  return jsonb_build_object('nivel', 'sin_datos', 'muestras', coalesce(r.n, 0));
end;
$$;
revoke execute on function public.precios_mercado_rangos(text, text, text, text, text) from public, anon;
grant execute on function public.precios_mercado_rangos(text, text, text, text, text) to authenticated, service_role;

-- Las ciudades con página propia: las que juntan 8 muestras o más de ese giro (cualquier servicio), con su total.
create or replace function public.precios_mercado_ciudades(p_giro text, p_minimo int default 8)
returns table (ciudad text, estado text, muestras bigint, servicios bigint, fecha date)
language sql stable set search_path = '' as $$
  select min(m.ciudad) as ciudad, min(m.estado) as estado, count(*) as muestras, count(distinct m.servicio) as servicios, max(m.fecha) as fecha
  from public.precios_mercado m
  where m.deleted_at is null and m.valido and m.giro = p_giro and m.ciudad_norm is not null
    and m.fecha > (now() at time zone 'America/Mexico_City')::date - 400
  group by m.ciudad_norm
  having count(*) >= p_minimo
  order by count(*) desc, min(m.ciudad);
$$;
revoke execute on function public.precios_mercado_ciudades(text, int) from public, anon;
grant execute on function public.precios_mercado_ciudades(text, int) to authenticated, service_role;

-- Resumen para /plataforma/mercado: totales por fuente, por giro, por ciudad, prospectos con sitio web por giro.
create or replace function public.precios_mercado_resumen()
returns jsonb language sql stable set search_path = '' as $$
  with m as (
    select * from public.precios_mercado
    where deleted_at is null and (select coalesce(public.es_admin_plataforma(), false) or auth.role() = 'service_role')
  )
  select jsonb_build_object(
    'total', (select count(*) from m where valido),
    'invalidos', (select count(*) from m where not valido),
    'ultima_fecha', (select max(fecha) from m),
    'por_fuente', (select coalesce(jsonb_agg(jsonb_build_object('fuente', fuente, 'n', n, 'validos', v) order by n desc), '[]'::jsonb)
      from (select fuente, count(*) n, count(*) filter (where valido) v from m group by fuente) x),
    'por_giro', (select coalesce(jsonb_agg(jsonb_build_object('giro', giro, 'n', n) order by n desc), '[]'::jsonb)
      from (select giro, count(*) n from m where valido group by giro) x),
    'por_servicio', (select coalesce(jsonb_agg(jsonb_build_object('giro', giro, 'servicio', servicio, 'n', n) order by giro, n desc), '[]'::jsonb)
      from (select giro, servicio, count(*) n from m where valido group by giro, servicio) x),
    'por_ciudad', (select coalesce(jsonb_agg(jsonb_build_object('ciudad', ciudad, 'estado', estado, 'n', n) order by n desc), '[]'::jsonb)
      from (select min(ciudad) ciudad, min(estado) estado, count(*) n from m where valido and ciudad_norm is not null group by ciudad_norm order by count(*) desc limit 40) x),
    'prospectos_con_web', (select coalesce(jsonb_agg(jsonb_build_object('giro', giro, 'n', n) order by giro), '[]'::jsonb)
      from (select giro, count(*) n from public.prospectos where deleted_at is null and web_dominio is not null and etapa <> 'descartado' group by giro) x),
    'ciudades_con_pagina', (select count(*) from (
      select giro, ciudad_norm from m where valido and ciudad_norm is not null and fecha > (now() at time zone 'America/Mexico_City')::date - 400
      group by giro, ciudad_norm having count(*) >= 8) x)
  );
$$;
revoke execute on function public.precios_mercado_resumen() from public, anon;
grant execute on function public.precios_mercado_resumen() to authenticated, service_role;

-- 8. Las tarifas de los negocios que lo autorizan, al índice (solo el servidor; una fila por servicio y talla, sin el
-- nombre del negocio: solo su id para no repetir en el mes). Devuelve cuántas filas entraron.
create or replace function public.precios_mercado_de_negocios()
returns int language plpgsql set search_path = '' as $$
declare
  v_n int := 0;
  v_mes text := to_char((now() at time zone 'America/Mexico_City')::date, 'YYYY-MM');
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  with autorizados as (
    select p.negocio_id, n.ciudad
    from public.negocio_perfil p
    join public.negocios n on n.id = p.negocio_id and n.deleted_at is null and n.activo and n.plan <> 'demo' and coalesce(n.interno, false) = false
    where p.deleted_at is null and p.comparte_precios_mercado
  ),
  vigentes as (
    select distinct on (t.servicio_id, t.tamano_id, t.pelaje_id, t.grupo_raza_id, t.cantidad_desde)
      t.negocio_id, t.servicio_id, t.tamano_id, t.precio
    from public.tarifas t
    join autorizados a on a.negocio_id = t.negocio_id
    where t.deleted_at is null and not t.no_aplica and t.precio > 0 and t.vigencia_desde <= (now() at time zone 'America/Mexico_City')::date
      and t.cantidad_desde = 1
    order by t.servicio_id, t.tamano_id, t.pelaje_id, t.grupo_raza_id, t.cantidad_desde, t.vigencia_desde desc
  ),
  canonicos as (
    select v.negocio_id, a.ciudad,
      case s.categoria when 'hotel' then 'hotel' when 'guarderia' then 'guarderia' when 'estetica' then 'estetica' end as giro,
      case
        when s.categoria = 'hotel' and s.unidad = 'noche' then 'noche_hotel'
        when s.categoria = 'guarderia' and s.unidad = 'dia' then 'dia_guarderia'
        when s.categoria = 'estetica' and s.clave ~ 'rapado|corte' then 'bano_y_corte'
        when s.categoria = 'estetica' then 'bano'
      end as servicio,
      case tc.clave when 'chico' then 'chico' when 'mediano' then 'mediano' when 'grande' then 'grande' when 'gigante' then 'grande' end as talla,
      percentile_cont(0.5) within group (order by v.precio) as precio
    from vigentes v
    join public.servicios s on s.id = v.servicio_id and s.deleted_at is null and s.categoria in ('hotel', 'guarderia', 'estetica')
    join autorizados a on a.negocio_id = v.negocio_id
    left join public.tamanos_categoria tc on tc.id = v.tamano_id
    group by v.negocio_id, a.ciudad, s.categoria, s.unidad, s.clave, tc.clave
  ),
  insertadas as (
    insert into public.precios_mercado (giro, servicio, talla, precio, ciudad, estado, fuente, negocio_origen_id, huella)
    select c.giro, c.servicio, c.talla, round(c.precio::numeric, 2), c.ciudad, null, 'negocio_peludesk', c.negocio_id,
      md5('negocio|' || c.negocio_id || '|' || c.servicio || '|' || coalesce(c.talla, '-') || '|' || v_mes)
    from canonicos c
    where c.giro is not null and c.servicio is not null and c.precio > 0
    on conflict do nothing
    returning 1
  )
  select count(*) into v_n from insertadas;
  return v_n;
end;
$$;
revoke execute on function public.precios_mercado_de_negocios() from public, anon, authenticated;
grant execute on function public.precios_mercado_de_negocios() to service_role;

-- 9. Las cuatro tablas nuevas son de la plataforma: a la lista de compartidas de auditoria_frontera ----------------
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('herramientas_eventos')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_flow_sesiones'), $a$, $b$('wa_flow_sesiones'), ('herramientas_eventos'), ('herramientas_capturas'), ('precios_mercado'), ('precios_mercado_corridas'), $b$);
    if position($a$('herramientas_eventos')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar herramientas_eventos, herramientas_capturas, precios_mercado y precios_mercado_corridas.';
    end if;
    execute v_def;
  end if;
end $$;
