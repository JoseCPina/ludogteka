-- Razas: normalización, variantes, propuestas de razas nuevas y grupo de
-- precio sin adivinar (3 de octubre de 2026).
--
-- El problema real: una raza que no está en el catálogo (calupoh) deja al
-- perro con la raza escrita a mano y sin raza_id, y ningún negocio puede
-- agregarla porque el catálogo es compartido y solo lo escribe la
-- plataforma. Y mientras no tenga raza_id, el baño se cotiza con el grupo
-- por defecto (pelo corto, el más barato) sin que nadie lo decida.
--
--  1. normalizar_raza(): UNA función de normalización (minúsculas, sin
--     acentos ni signos, sin palabras vacías, singular) y la vista
--     razas_variantes (nombre + alias de cada raza, ya normalizados).
--  2. Normalización en bloque con historial reversible
--     (razas_normalizaciones + razas_normalizacion_perros).
--  3. Razas nuevas: razas_propuestas (por negocio, ligadas a los perros que
--     las usan) y la bandeja de la plataforma (aprobar, rechazar con motivo,
--     aprobar como variante de una raza existente).
--  4. Precio: una raza del catálogo SIN grupo en el negocio ya no cae al
--     grupo por defecto. perro_grupo_raza.sin_grupo = true, la cita pide
--     asignar el grupo (permiso «tarifas») o registrar una excepción
--     (permiso «excepciones_reserva») y el tablero avisa con antigüedad.
--  5. «Mestizo» (criollo, corriente) es una entrada propia del catálogo.

create extension if not exists pg_trgm with schema extensions;

-- ── 1. Normalización y variantes ────────────────────────────────────

create or replace function public.normalizar_raza(p_texto text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text;
  w text;
  salida text[] := '{}';
  vacias constant text[] := array['perro','perra','perros','perras','raza','razas','de','del','la','el','los','las','un','una','mi'];
begin
  v := lower(coalesce(p_texto, ''));
  v := translate(v, 'áàäâãéèëêíìïîóòöôõúùüûñç', 'aaaaaeeeeiiiiooooouuuunc');
  v := regexp_replace(v, '[^a-z0-9]+', ' ', 'g');
  foreach w in array regexp_split_to_array(btrim(v), ' +') loop
    if w = '' or w = any (vacias) then continue; end if;
    -- Plural: «poodles» → «poodle», «pastores» → «pastor», «shih tzus» → «shih tzu».
    if length(w) > 4 and w ~ '(ores|eres)$' then
      w := left(w, length(w) - 2);
    elsif length(w) > 3 and w ~ '[^s]s$' then
      w := left(w, length(w) - 1);
    end if;
    salida := array_append(salida, w);
  end loop;
  return array_to_string(salida, ' ');
end;
$$;
grant execute on function public.normalizar_raza(text) to authenticated, service_role;
revoke execute on function public.normalizar_raza(text) from anon;

-- Catálogo compartido: lo que cada raza dice de sí misma (talla y pelo típicos,
-- solo informativos: el grupo de precio sigue siendo de cada negocio).
alter table public.razas
  add column if not exists tamano_tipico_id uuid references public.tamanos_categoria(id),
  add column if not exists pelaje_tipico_id uuid references public.tipos_pelaje(id);

-- «Mestizo» (criollo, corriente) es una entrada propia: antes solo existía
-- «No sé / mestizo», que además dispara el aviso de precio incierto.
update public.razas
set alias = array(select a from unnest(alias) a where lower(a) not in ('mestizo','mestiza','criollo','criolla','corriente'))
where es_desconocida;

insert into public.razas (nombre, alias, updated_at)
select 'Mestizo', array['mestiza','criollo','criolla','corriente','mestizo criollo','mestizo corriente','cruza','cruzado'], now()
where not exists (select 1 from public.razas where lower(nombre) = 'mestizo' and deleted_at is null);

-- Cada negocio que ya tenía «No sé / mestizo» agrupado le da a «Mestizo» el
-- MISMO grupo: se conserva el precio de hoy, no se decide uno nuevo.
insert into public.razas_grupo (negocio_id, raza_id, grupo_raza_id)
select rg.negocio_id, m.id, rg.grupo_raza_id
from public.razas d
join public.razas_grupo rg on rg.raza_id = d.id and rg.deleted_at is null
cross join (select id from public.razas where lower(nombre) = 'mestizo' and deleted_at is null) m
where d.es_desconocida and d.deleted_at is null
  and not exists (select 1 from public.razas_grupo x where x.negocio_id = rg.negocio_id and x.raza_id = m.id and x.deleted_at is null);

-- Variantes: el nombre y cada alias de la raza, normalizados (security_invoker:
-- el catálogo es de lectura para todos).
create or replace view public.razas_variantes with (security_invoker = true) as
select r.id as raza_id, r.nombre as raza_nombre, r.nombre as variante, public.normalizar_raza(r.nombre) as variante_norm, true as es_nombre
from public.razas r where r.deleted_at is null
union
select r.id, r.nombre, a, public.normalizar_raza(a), false
from public.razas r, unnest(r.alias) a
where r.deleted_at is null and public.normalizar_raza(a) <> '';
grant select on public.razas_variantes to authenticated, service_role;

-- ¿Este texto ya es una raza (o una variante) del catálogo? Devuelve la raza.
create or replace function public.razas_conflicto(p_texto text, p_excluir uuid default null)
returns table (raza_id uuid, raza_nombre text, variante text)
language sql
stable
set search_path = ''
as $$
  select v.raza_id, v.raza_nombre, v.variante
  from public.razas_variantes v
  where v.variante_norm = public.normalizar_raza(p_texto)
    and public.normalizar_raza(p_texto) <> ''
    and v.raza_id is distinct from p_excluir
  limit 1;
$$;
grant execute on function public.razas_conflicto(text, uuid) to authenticated, service_role;
revoke execute on function public.razas_conflicto(text, uuid) from anon;

-- ── 2. Tablas por negocio ───────────────────────────────────────────

create table public.razas_propuestas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  nombre text not null check (btrim(nombre) <> ''),
  nombre_norm text not null,
  variantes text[] not null default '{}',
  tamano_id uuid references public.tamanos_categoria(id),
  pelaje_id uuid references public.tipos_pelaje(id),
  texto_origen text,
  estado text not null default 'pendiente' check (estado in ('pendiente','aprobada','rechazada','variante')),
  raza_id uuid references public.razas(id),
  motivo text,
  propuesta_por uuid references auth.users(id) on delete set null default auth.uid(),
  resuelta_por uuid references auth.users(id) on delete set null,
  resuelta_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index razas_propuestas_pendiente_idx on public.razas_propuestas (negocio_id, nombre_norm) where estado = 'pendiente' and deleted_at is null;

create table public.razas_propuestas_perros (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  propuesta_id uuid not null references public.razas_propuestas(id),
  perro_id uuid not null references public.perros(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index razas_propuestas_perros_idx on public.razas_propuestas_perros (propuesta_id, perro_id) where deleted_at is null;

create table public.razas_normalizaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  texto_norm text not null,
  textos_originales text[] not null default '{}',
  raza_id uuid not null references public.razas(id),
  perros integer not null default 0,
  hecha_por uuid references auth.users(id) on delete set null default auth.uid(),
  revertida_at timestamptz,
  revertida_por uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table public.razas_normalizacion_perros (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  normalizacion_id uuid not null references public.razas_normalizaciones(id),
  perro_id uuid not null references public.perros(id),
  raza_texto_anterior text,
  raza_id_anterior uuid references public.razas(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

-- Citas de estética: la excepción de grupo de precio de ESA cita (raza
-- nueva sin grupo en el negocio), con su motivo y quién la hizo.
alter table public.citas_estetica
  add column grupo_raza_excepcion_id uuid references public.grupos_raza(id),
  add column excepcion_grupo_motivo text,
  add column excepcion_grupo_por uuid references auth.users(id) on delete set null;

do $$
declare
  t text;
begin
  foreach t in array array['razas_propuestas','razas_propuestas_perros','razas_normalizaciones','razas_normalizacion_perros'] loop
    execute format('create index %I on public.%I (negocio_id)', t || '_negocio_idx', t);
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$f$, t || '_negocio', t);
    execute format($f$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$f$, t || '_negocio_definer', t);
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_ins', t);
    execute format($f$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_upd', t);
    execute format($f$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_del', t);
    -- Leer: el personal del negocio. Escribir: solo por las funciones de abajo.
    execute format($f$create policy %I on public.%I for select to authenticated
      using ((select public.is_staff()))$f$, t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
  end loop;
end $$;

-- ── 3. Perros fuera del catálogo, agrupados por texto normalizado ───

create or replace function public.razas_fuera_de_catalogo()
returns table (texto_norm text, textos text[], perros integer, sugerencias jsonb, propuesta_id uuid, propuesta_estado text)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not coalesce((select public.is_staff()), false) then
    raise exception 'Solo el personal del negocio puede ver esto.' using errcode = '42501';
  end if;
  return query
  with g as (
    select public.normalizar_raza(p.raza) as n, array_agg(distinct btrim(p.raza)) as originales, count(*)::int as c
    from public.perros p
    where p.raza_id is null and p.deleted_at is null and p.fallecido = false and public.normalizar_raza(p.raza) <> ''
    group by 1
  )
  select g.n, g.originales, g.c,
    coalesce((
      select jsonb_agg(jsonb_build_object('raza_id', s.raza_id, 'nombre', s.raza_nombre, 'puntaje', round(s.puntaje::numeric, 2), 'exacta', s.puntaje >= 1) order by s.puntaje desc, s.raza_nombre)
      from (
        select v.raza_id, v.raza_nombre,
          max(case when v.variante_norm = g.n then 1.0::real else extensions.similarity(v.variante_norm, g.n) end) as puntaje
        from public.razas_variantes v
        group by v.raza_id, v.raza_nombre
        having max(case when v.variante_norm = g.n then 1.0::real else extensions.similarity(v.variante_norm, g.n) end) >= 0.4
        order by 3 desc limit 3
      ) s
    ), '[]'::jsonb),
    pr.id, pr.estado
  from g
  left join lateral (
    select x.id, x.estado from public.razas_propuestas x
    where x.deleted_at is null and x.estado = 'pendiente' and (x.nombre_norm = g.n or x.texto_origen = g.n)
    order by x.created_at desc limit 1
  ) pr on true
  order by g.c desc, g.n;
end;
$$;
grant execute on function public.razas_fuera_de_catalogo() to authenticated, service_role;
revoke execute on function public.razas_fuera_de_catalogo() from anon;

-- «Es esta raza»: reasigna TODOS los perros del grupo en un paso y guarda el
-- texto original de cada uno para poder deshacerlo.
create or replace function public.razas_asignar_texto(p_texto_norm text, p_raza_id uuid)
returns table (normalizacion_id uuid, perros integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raza record;
  v_id uuid;
  v_n int;
  v_originales text[];
begin
  if coalesce((select public.current_rol()), '') not in ('admin', 'recepcion') then
    raise exception 'Asignar razas es de admin o recepción.' using errcode = '42501';
  end if;
  if coalesce(btrim(p_texto_norm), '') = '' then
    raise exception 'Falta el texto de la raza.';
  end if;
  select id, nombre into v_raza from public.razas where id = p_raza_id and deleted_at is null;
  if v_raza.id is null then
    raise exception 'Esa raza no está en el catálogo.';
  end if;

  select array_agg(distinct btrim(p.raza)), count(*)::int into v_originales, v_n
  from public.perros p
  where p.raza_id is null and p.deleted_at is null and p.fallecido = false and public.normalizar_raza(p.raza) = p_texto_norm;
  if coalesce(v_n, 0) = 0 then
    raise exception 'Ya no hay perros con ese texto: alguien más pudo haberlos asignado. Recarga la página.';
  end if;

  insert into public.razas_normalizaciones (texto_norm, textos_originales, raza_id, perros)
  values (p_texto_norm, v_originales, p_raza_id, v_n)
  returning id into v_id;

  insert into public.razas_normalizacion_perros (normalizacion_id, perro_id, raza_texto_anterior, raza_id_anterior)
  select v_id, p.id, p.raza, p.raza_id
  from public.perros p
  where p.raza_id is null and p.deleted_at is null and p.fallecido = false and public.normalizar_raza(p.raza) = p_texto_norm;

  update public.perros p set raza_id = p_raza_id, raza = v_raza.nombre
  where p.id in (select np.perro_id from public.razas_normalizacion_perros np where np.normalizacion_id = v_id);

  return query select v_id, v_n;
end;
$$;

-- Deshacer: cada perro vuelve a su texto original, salvo el que ya cambió de
-- raza por otro camino (ese no se toca).
create or replace function public.razas_revertir_normalizacion(p_normalizacion_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_norm record;
  v_n int;
begin
  if coalesce((select public.current_rol()), '') not in ('admin', 'recepcion') then
    raise exception 'Deshacer una asignación de razas es de admin o recepción.' using errcode = '42501';
  end if;
  select * into v_norm from public.razas_normalizaciones where id = p_normalizacion_id and deleted_at is null;
  if v_norm.id is null then
    raise exception 'No encontré esa asignación.';
  end if;
  if v_norm.revertida_at is not null then
    raise exception 'Esa asignación ya se deshizo.';
  end if;

  update public.perros p
  set raza_id = np.raza_id_anterior, raza = np.raza_texto_anterior
  from public.razas_normalizacion_perros np
  where np.normalizacion_id = p_normalizacion_id and np.perro_id = p.id and p.raza_id = v_norm.raza_id and p.deleted_at is null;
  get diagnostics v_n = row_count;

  update public.razas_normalizaciones set revertida_at = now(), revertida_por = auth.uid() where id = p_normalizacion_id;
  return v_n;
end;
$$;

-- ── 4. Proponer una raza nueva ──────────────────────────────────────

create or replace function public.razas_proponer(
  p_nombre text, p_variantes text[], p_tamano_id uuid, p_pelaje_id uuid, p_texto_norm text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_norm text := public.normalizar_raza(p_nombre);
  v_conf record;
  v_id uuid;
  v_vars text[];
begin
  if not coalesce((select public.tiene_permiso('tarifas')), false) then
    raise exception 'Proponer una raza nueva es de admin o de quien tenga el permiso de precios y tarifas.' using errcode = '42501';
  end if;
  if v_norm = '' then
    raise exception 'Escribe el nombre de la raza.';
  end if;
  select * into v_conf from public.razas_conflicto(v_nombre);
  if v_conf.raza_id is not null then
    raise exception 'Esa raza ya existe en el catálogo como «%». Usa «Es esta raza» con ella.', v_conf.raza_nombre;
  end if;
  select array_agg(distinct btrim(x)) into v_vars
  from unnest(coalesce(p_variantes, '{}')) x
  where btrim(x) <> '' and public.normalizar_raza(x) <> v_norm;
  if exists (select 1 from unnest(coalesce(v_vars, '{}')) x, lateral public.razas_conflicto(x) c where c.raza_id is not null) then
    raise exception 'Una de las variantes ya es de otra raza del catálogo. Quítala o usa «Es esta raza».';
  end if;
  if exists (select 1 from public.razas_propuestas where nombre_norm = v_norm and estado = 'pendiente' and deleted_at is null) then
    raise exception 'Ya hay una propuesta pendiente para «%». Espera a que la plataforma la resuelva.', v_nombre;
  end if;

  insert into public.razas_propuestas (nombre, nombre_norm, variantes, tamano_id, pelaje_id, texto_origen)
  values (v_nombre, v_norm, coalesce(v_vars, '{}'), p_tamano_id, p_pelaje_id, nullif(btrim(coalesce(p_texto_norm, '')), ''))
  returning id into v_id;

  -- Los perros que usan esa raza (por el texto normalizado de origen, o por el nombre o alguna variante).
  insert into public.razas_propuestas_perros (propuesta_id, perro_id)
  select v_id, p.id
  from public.perros p
  where p.raza_id is null and p.deleted_at is null and p.fallecido = false
    and public.normalizar_raza(p.raza) in (select x from unnest(array[v_norm, nullif(btrim(coalesce(p_texto_norm, '')), '')] || coalesce((select array_agg(public.normalizar_raza(z)) from unnest(coalesce(v_vars, '{}')) z), '{}')) x where x is not null);
  return v_id;
end;
$$;

-- ── 5. Plataforma: la bandeja de propuestas y la alta directa ───────

create or replace function public.plataforma_razas_propuestas()
returns table (
  id uuid, negocio_id uuid, negocio_nombre text, nombre text, variantes text[], tamano text, pelaje text, texto_origen text,
  estado text, motivo text, perros integer, creada_at timestamptz, resuelta_at timestamptz, raza_nombre text, parecidas jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (coalesce((select public.es_admin_plataforma()), false) or auth.role() = 'service_role') then
    raise exception 'Solo la administración de la plataforma.' using errcode = '42501';
  end if;
  return query
  select pr.id, pr.negocio_id, n.nombre, pr.nombre, pr.variantes, t.etiqueta, pe.etiqueta, pr.texto_origen,
    pr.estado, pr.motivo,
    (select count(*)::int from public.razas_propuestas_perros pp where pp.propuesta_id = pr.id and pp.deleted_at is null),
    pr.created_at, pr.resuelta_at, r.nombre,
    coalesce((
      select jsonb_agg(jsonb_build_object('raza_id', s.raza_id, 'nombre', s.raza_nombre, 'puntaje', round(s.puntaje::numeric, 2)) order by s.puntaje desc)
      from (
        select v.raza_id, v.raza_nombre, max(extensions.similarity(v.variante_norm, pr.nombre_norm)) as puntaje
        from public.razas_variantes v group by v.raza_id, v.raza_nombre
        having max(extensions.similarity(v.variante_norm, pr.nombre_norm)) >= 0.4
        order by 3 desc limit 3
      ) s
    ), '[]'::jsonb)
  from public.razas_propuestas pr
  join public.negocios n on n.id = pr.negocio_id
  left join public.tamanos_categoria t on t.id = pr.tamano_id
  left join public.tipos_pelaje pe on pe.id = pr.pelaje_id
  left join public.razas r on r.id = pr.raza_id
  where pr.deleted_at is null
  order by (pr.estado = 'pendiente') desc, pr.created_at;
end;
$$;

create or replace function public.plataforma_resolver_propuesta(
  p_id uuid, p_accion text, p_motivo text default null, p_raza_destino uuid default null, p_nombre text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pr record;
  v_raza_id uuid;
  v_nombre text;
  v_conf record;
  v_vars text[];
begin
  if not (coalesce((select public.es_admin_plataforma()), false) or auth.role() = 'service_role') then
    raise exception 'Solo la administración de la plataforma.' using errcode = '42501';
  end if;
  select * into v_pr from public.razas_propuestas where id = p_id and deleted_at is null;
  if v_pr.id is null then raise exception 'No encontré esa propuesta.'; end if;
  if v_pr.estado <> 'pendiente' then raise exception 'Esa propuesta ya se resolvió.'; end if;
  if p_accion not in ('aprobar', 'rechazar', 'variante') then raise exception 'Acción desconocida.'; end if;

  -- Los triggers y la RLS trabajan en el negocio de la propuesta.
  perform set_config('app.negocio_id', v_pr.negocio_id::text, true);

  if p_accion = 'rechazar' then
    if btrim(coalesce(p_motivo, '')) = '' then raise exception 'El motivo del rechazo es obligatorio.'; end if;
    update public.razas_propuestas set estado = 'rechazada', motivo = btrim(p_motivo), resuelta_por = auth.uid(), resuelta_at = now() where id = p_id;
    return null;
  end if;

  if p_accion = 'variante' then
    select id, nombre into v_raza_id, v_nombre from public.razas where id = p_raza_destino and deleted_at is null;
    if v_raza_id is null then raise exception 'Elige la raza de la que es variante.'; end if;
    select array_agg(distinct x) into v_vars
    from unnest(array[v_pr.nombre] || v_pr.variantes) x
    where public.normalizar_raza(x) <> '' and not exists (select 1 from public.razas_conflicto(x) c where c.raza_id is not null);
    update public.razas set alias = alias || coalesce(v_vars, '{}') where id = v_raza_id;
  else
    v_nombre := btrim(coalesce(nullif(btrim(coalesce(p_nombre, '')), ''), v_pr.nombre));
    select * into v_conf from public.razas_conflicto(v_nombre);
    if v_conf.raza_id is not null then
      raise exception 'Ya existe «%» en el catálogo: apruébala como variante de esa raza.', v_conf.raza_nombre;
    end if;
    select array_agg(distinct x) into v_vars
    from unnest(v_pr.variantes) x
    where public.normalizar_raza(x) <> public.normalizar_raza(v_nombre) and not exists (select 1 from public.razas_conflicto(x) c where c.raza_id is not null);
    insert into public.razas (nombre, alias, tamano_tipico_id, pelaje_tipico_id)
    values (v_nombre, coalesce(v_vars, '{}'), v_pr.tamano_id, v_pr.pelaje_id)
    returning id into v_raza_id;
  end if;

  -- Los perros que la propusieron se ligan solos.
  update public.perros p set raza_id = v_raza_id, raza = v_nombre
  where p.negocio_id = v_pr.negocio_id and p.raza_id is null and p.deleted_at is null
    and p.id in (select pp.perro_id from public.razas_propuestas_perros pp where pp.propuesta_id = p_id and pp.deleted_at is null);

  update public.razas_propuestas
  set estado = case when p_accion = 'variante' then 'variante' else 'aprobada' end,
      raza_id = v_raza_id, motivo = nullif(btrim(coalesce(p_motivo, '')), ''), resuelta_por = auth.uid(), resuelta_at = now()
  where id = p_id;
  return v_raza_id;
end;
$$;

revoke execute on function public.plataforma_razas_propuestas() from public, anon;
revoke execute on function public.plataforma_resolver_propuesta(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.plataforma_razas_propuestas() to authenticated, service_role;
grant execute on function public.plataforma_resolver_propuesta(uuid, text, text, uuid, text) to authenticated, service_role;

-- ── 6. Precio: una raza sin grupo en el negocio NO cae al grupo por defecto ──

create or replace view public.perro_grupo_raza with (security_invoker = true) as
select p.id as perro_id,
  case when r.id is not null and g.id is null then null else coalesce(g.id, gp.id) end as grupo_raza_id,
  case when r.id is not null and g.id is null then null else coalesce(g.clave, gp.clave) end as grupo_clave,
  case when r.id is not null and g.id is null then null else coalesce(g.nombre, gp.nombre) end as grupo_nombre,
  case when r.id is not null and g.id is null then null else coalesce(g.depende_tamano, gp.depende_tamano) end as depende_tamano,
  (p.raza_id is null) as por_defecto,
  (r.id is not null and g.id is null) as sin_grupo,
  r.id as raza_id,
  r.nombre as raza_nombre
from public.perros p
left join public.razas r on r.id = p.raza_id and r.deleted_at is null
left join public.razas_grupo rg on rg.raza_id = r.id and rg.negocio_id = p.negocio_id and rg.deleted_at is null
left join public.grupos_raza g on g.id = rg.grupo_raza_id and g.deleted_at is null
left join public.grupos_raza gp on gp.es_predeterminado and gp.deleted_at is null and gp.negocio_id = p.negocio_id
where p.deleted_at is null;

-- Las razas con perros vivos del negocio que todavía no tienen grupo de precio.
create or replace function public.razas_sin_grupo()
returns table (raza_id uuid, nombre text, perros integer, desde timestamptz, tamano text, pelaje text)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not coalesce((select public.is_staff()), false) then
    raise exception 'Solo el personal del negocio puede ver esto.' using errcode = '42501';
  end if;
  return query
  select r.id, r.nombre, count(*)::int, r.created_at, t.etiqueta, pe.etiqueta
  from public.perros p
  join public.razas r on r.id = p.raza_id and r.deleted_at is null
  left join public.tamanos_categoria t on t.id = r.tamano_tipico_id
  left join public.tipos_pelaje pe on pe.id = r.pelaje_tipico_id
  where p.deleted_at is null and p.fallecido = false
    and not exists (
      select 1 from public.razas_grupo rg join public.grupos_raza g on g.id = rg.grupo_raza_id and g.deleted_at is null
      where rg.raza_id = r.id and rg.negocio_id = p.negocio_id and rg.deleted_at is null
    )
  group by r.id, r.nombre, r.created_at, t.etiqueta, pe.etiqueta
  order by r.created_at, r.nombre;
end;
$$;
grant execute on function public.razas_sin_grupo() to authenticated, service_role;
revoke execute on function public.razas_sin_grupo() from anon;

-- Asignar el grupo de precio de una raza en ESTE negocio. Conserva la
-- historia: la fila anterior se da de baja (deleted_at), no se pisa.
create or replace function public.asignar_grupo_raza(p_raza_id uuid, p_grupo_raza_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select public.tiene_permiso('tarifas')), false) then
    raise exception 'Asignar el grupo de precio de una raza es de admin o de quien tenga el permiso de precios y tarifas.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.razas where id = p_raza_id and deleted_at is null) then
    raise exception 'Esa raza no está en el catálogo.';
  end if;
  if not exists (select 1 from public.grupos_raza where id = p_grupo_raza_id and deleted_at is null and negocio_id = (select public.negocio_actual())) then
    raise exception 'Ese grupo de precio no existe en este negocio.';
  end if;
  update public.razas_grupo set deleted_at = now()
  where raza_id = p_raza_id and negocio_id = (select public.negocio_actual()) and deleted_at is null;
  insert into public.razas_grupo (raza_id, grupo_raza_id) values (p_raza_id, p_grupo_raza_id);
end;
$$;

do $$
declare
  f text;
begin
  foreach f in array array[
    'razas_asignar_texto(text, uuid)', 'razas_revertir_normalizacion(uuid)',
    'razas_proponer(text, text[], uuid, uuid, text)', 'asignar_grupo_raza(uuid, uuid)'
  ] loop
    execute format('alter function public.%s owner to peludesk_definer', f);
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;

-- Las dos funciones de la plataforma son de postgres (ven todos los negocios):
-- a la lista blanca de auditoria_frontera().
do $$
declare v_def text;
begin
  select pg_get_functiondef('public.auditoria_frontera()'::regprocedure) into v_def;
  if position('plataforma_razas_propuestas' in v_def) = 0 then
    v_def := replace(v_def, $a$('resumen_datos')$a$, $b$('resumen_datos'), ('plataforma_razas_propuestas'), ('plataforma_resolver_propuesta')$b$);
    if position('plataforma_razas_propuestas' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar la bandeja de razas.';
    end if;
    execute v_def;
  end if;
end $$;

-- ── 7. La cita: grupo asignado, o excepción con motivo; nunca el de por defecto ──

do $$
declare v_def text;
begin
  select pg_get_functiondef('public.validar_cita_estetica()'::regprocedure) into v_def;
  if position('grupo_raza_excepcion_id' in v_def) = 0 then
    v_def := replace(v_def,
$a$      if v_grupo.grupo_raza_id is null then
        raise exception 'No se pudo determinar el grupo de raza de este perro. Revisa el catálogo de razas.';
      end if;$a$,
$b$      if coalesce(v_grupo.sin_grupo, false) then
        -- Raza del catálogo sin grupo de precio en este negocio: no se adivina.
        -- O se asigna el grupo, o la cita lleva una excepción con motivo.
        if new.grupo_raza_excepcion_id is null then
          raise exception 'La raza % de este perro todavía no tiene grupo de precio en este negocio. Asígnalo en /perros/razas/grupos o registra una excepción al agendar la cita.', v_grupo.raza_nombre;
        end if;
        if btrim(coalesce(new.excepcion_grupo_motivo, '')) = '' then
          raise exception 'La excepción de grupo de precio necesita un motivo.';
        end if;
        if not coalesce((select public.tiene_permiso('excepciones_reserva')), false) then
          raise exception 'Registrar una excepción de grupo de precio es de admin o de quien tenga el permiso de excepciones al reservar.' using errcode = '42501';
        end if;
        v_grupo.grupo_raza_id := (select g.id from public.grupos_raza g where g.id = new.grupo_raza_excepcion_id and g.deleted_at is null);
        v_grupo.depende_tamano := (select g.depende_tamano from public.grupos_raza g where g.id = new.grupo_raza_excepcion_id and g.deleted_at is null);
        if v_grupo.grupo_raza_id is null then
          raise exception 'El grupo de la excepción no existe en este negocio.';
        end if;
        new.excepcion_grupo_por := auth.uid();
      else
        new.grupo_raza_excepcion_id := null;
        new.excepcion_grupo_motivo := null;
        new.excepcion_grupo_por := null;
      end if;
      if v_grupo.grupo_raza_id is null then
        raise exception 'No se pudo determinar el grupo de raza de este perro. Revisa el catálogo de razas.';
      end if;$b$);
    if position('grupo_raza_excepcion_id' in v_def) = 0 then
      raise exception 'validar_cita_estetica cambió: no se pudo agregar la excepción de grupo.';
    end if;
    execute v_def;
  end if;
end $$;
