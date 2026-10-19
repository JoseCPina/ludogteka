-- Audiencias personalizadas de Meta con la base de prospectos (19 de octubre de 2026).
--
-- Cada día, después de la limpieza de las 7:00, el servidor arma las listas (prospectos vivos, por giro, los que
-- visitaron su página, negocios en prueba y negocios que pagan), normaliza teléfono y correo, los hashea con SHA-256
-- y los sincroniza con la cuenta publicitaria de PeluDesk: altas, bajas y cambios. Todo es de la PLATAFORMA (sin
-- negocio_id; en `compartidas` de auditoria_frontera): lo lee la administración de PeluDesk y lo escribe el servidor.
-- Nunca se guarda aquí un teléfono ni un correo en claro: solo sus hashes (lo que se le mandó a Meta).

-- 1. Baja de publicidad de un prospecto -------------------------------------------------------------------------
alter table public.prospectos
  add column if not exists publicidad_baja_at timestamptz,
  add column if not exists publicidad_baja_motivo text check (publicidad_baja_motivo is null or length(publicidad_baja_motivo) <= 300);

-- 2. Audiencias --------------------------------------------------------------------------------------------------
create table public.meta_audiencias (
  id uuid primary key default gen_random_uuid(),
  clave text not null unique check (clave ~ '^[a-z_]{3,40}$'),
  nombre text not null check (length(btrim(nombre)) between 3 and 120),
  descripcion text check (descripcion is null or length(descripcion) <= 300),
  audience_id text,
  -- Lo que hay en Meta según lo que le mandamos (miembros vivos) y lo que Meta reporta de vuelta.
  miembros int not null default 0,
  coincidencias_min bigint,
  coincidencias_max bigint,
  estado_meta jsonb,
  ultima_sync_at timestamptz,
  ultimo_error text check (ultimo_error is null or length(ultimo_error) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

-- 3. Miembros: lo que ya se le mandó a Meta por audiencia (para calcular altas, bajas y cambios) --------------------
create table public.meta_audiencias_miembros (
  id uuid primary key default gen_random_uuid(),
  audiencia_id uuid not null references public.meta_audiencias(id) on delete cascade,
  -- prospecto:<uuid> o negocio:<uuid>
  miembro text not null check (miembro ~ '^(prospecto|negocio):[0-9a-f-]{36}$'),
  hash_telefono text check (hash_telefono is null or hash_telefono ~ '^[0-9a-f]{64}$'),
  hash_correo text check (hash_correo is null or hash_correo ~ '^[0-9a-f]{64}$'),
  check (hash_telefono is not null or hash_correo is not null),
  enviado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index meta_audiencias_miembros_unico on public.meta_audiencias_miembros (audiencia_id, miembro) where deleted_at is null;
create index meta_audiencias_miembros_audiencia_idx on public.meta_audiencias_miembros (audiencia_id);

-- 4. Corridas -------------------------------------------------------------------------------------------------------
create table public.meta_audiencias_corridas (
  id uuid primary key default gen_random_uuid(),
  origen text not null check (origen in ('cron', 'manual', 'script')),
  estado text not null default 'corriendo' check (estado in ('corriendo', 'ok', 'con_errores', 'fallida', 'sin_credenciales')),
  inicio_at timestamptz not null default now(),
  fin_at timestamptz,
  -- Por audiencia: altas, bajas, enviados, recibidos, invalidos, coincidencias.
  resumen jsonb not null default '{}'::jsonb,
  errores jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index meta_audiencias_corridas_inicio_idx on public.meta_audiencias_corridas (inicio_at desc);

do $$
declare t text;
begin
  foreach t in array array['meta_audiencias', 'meta_audiencias_miembros', 'meta_audiencias_corridas'] loop
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I for select to authenticated using ((select public.es_admin_plataforma()))', t || '_select_plataforma', t);
    -- Nadie con sesión escribe: solo el servidor (la llave de servicio salta la RLS).
    execute format('create policy %I on public.%I for insert to authenticated with check (false)', t || '_insert_nadie', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

insert into public.meta_audiencias (clave, nombre, descripcion) values
  ('prospectos', 'PeluDesk · Prospectos', 'Todos los prospectos vivos (sin descartados, sin bajas, sin negocios que ya pagan).'),
  ('veterinarias', 'PeluDesk · Veterinarias', 'Prospectos vivos de giro veterinaria.'),
  ('esteticas', 'PeluDesk · Estéticas', 'Prospectos vivos de giro estética.'),
  ('hotel_guarderia', 'PeluDesk · Hotel y guardería', 'Prospectos vivos de hotel, guardería y mixtos.'),
  ('visitaron', 'PeluDesk · Visitaron su página', 'Prospectos que abrieron su página /para/ o pasaron a caliente.'),
  ('en_prueba', 'PeluDesk · En prueba', 'Negocios reales en su prueba gratis.'),
  ('pagando', 'PeluDesk · Pagando', 'Negocios que pagan PeluDesk (al corriente o en gracia).')
on conflict (clave) do nothing;

-- 5. Contactos de los negocios en prueba y que pagan (lee Auth: es de postgres) -------------------------------------
create or replace function public.meta_audiencias_negocios()
returns table (negocio_id uuid, tipo text, telefonos text[], correos text[])
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor.' using errcode = '42501';
  end if;
  return query
  with reales as (
    select n.id, n.plan, public.estado_cobro_en(n.id) as estado
    from public.negocios n
    where n.activo and n.plan is distinct from 'demo' and not coalesce(n.interno, false) and not coalesce(n.cobro_exento, false)
  ),
  clasificados as (
    select r.id,
      case when r.estado in ('al_corriente', 'gracia') then 'pagando'
           when r.plan = 'prueba' and r.estado = 'prueba' then 'prueba' end as tipo
    from reales r
  ),
  tels as (
    select c.id, array_agg(distinct t.tel) filter (where t.tel is not null) as telefonos
    from clasificados c
    left join lateral (
      select right(regexp_replace(rp.telefono, '\D', '', 'g'), 10) as tel from public.registros_prueba rp
        where rp.negocio_id = c.id and rp.deleted_at is null and length(regexp_replace(coalesce(rp.telefono, ''), '\D', '', 'g')) >= 10
      union
      select right(regexp_replace(cc.telefono_recepcion, '\D', '', 'g'), 10) from public.cupo_configuracion cc
        where cc.negocio_id = c.id and length(regexp_replace(coalesce(cc.telefono_recepcion, ''), '\D', '', 'g')) >= 10
      union
      select substring(lower(u.email) from '^t([0-9]{10})@') from public.membresias m join auth.users u on u.id = m.profile_id
        where m.negocio_id = c.id and m.rol = 'admin' and m.deleted_at is null and lower(u.email) ~ '^t[0-9]{10}@'
    ) t on true
    where c.tipo is not null
    group by c.id
  ),
  mails as (
    select c.id, array_agg(distinct lower(btrim(u.email))) filter (where u.email is not null) as correos
    from clasificados c
    join public.membresias m on m.negocio_id = c.id and m.rol = 'admin' and m.deleted_at is null
    join auth.users u on u.id = m.profile_id
    where c.tipo is not null and lower(u.email) !~ '^t[0-9]{10}@' and u.email like '%@%'
    group by c.id
  )
  select c.id, c.tipo, coalesce(t.telefonos, '{}'), coalesce(ma.correos, '{}')
  from clasificados c
  left join tels t on t.id = c.id
  left join mails ma on ma.id = c.id
  where c.tipo is not null;
end;
$$;
revoke execute on function public.meta_audiencias_negocios() from public, anon, authenticated;
grant execute on function public.meta_audiencias_negocios() to service_role;

-- 6. auditoria_frontera: tablas de la plataforma y la función que lee Auth ------------------------------------------
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position($a$('meta_audiencias')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('prospectos')$a$, $b$('prospectos'), ('meta_audiencias'), ('meta_audiencias_miembros'), ('meta_audiencias_corridas')$b$);
    if position($a$('meta_audiencias')$a$ in v_def) = 0 then raise exception 'auditoria_frontera cambió: no se pudieron agregar las tablas de audiencias.'; end if;
  end if;
  if position($a$('meta_audiencias_negocios')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('prospecto_negocio_de')$a$, $b$('prospecto_negocio_de'), ('meta_audiencias_negocios')$b$);
    if position($a$('meta_audiencias_negocios')$a$ in v_def) = 0 then raise exception 'auditoria_frontera cambió: no se pudo agregar meta_audiencias_negocios.'; end if;
  end if;
  execute v_def;
end $$;

