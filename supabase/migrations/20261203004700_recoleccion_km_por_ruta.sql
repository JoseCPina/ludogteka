-- Recolección: los km salen de la DIRECCIÓN, por ruta (Routes API), nunca de la ubicación del celular.
--   1. Caché por negocio: una dirección se geocodifica una vez y un par origen-destino se consulta una vez.
--   2. recoleccion_cotizaciones: lo que el servidor calculó. Un dueño solo puede guardar una recolección con los km de una
--      cotización suya, vigente y de esa misma dirección; cualquier otro número se rechaza. El personal sigue pudiendo
--      capturar los km a mano.
--   3. Al llegar al tope del mes, la cotización sale en línea recta × 1.3 y «Necesita atención» se lo dice al negocio.
-- Las tres tablas solo las toca el servidor (service_role) y las funciones; ni el personal ni el dueño las leen.

create table public.maps_geocodificaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  direccion_norm text not null check (char_length(direccion_norm) between 5 and 300),
  lat double precision not null,
  lng double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index maps_geocodificaciones_uq on public.maps_geocodificaciones (negocio_id, direccion_norm) where deleted_at is null;
create index maps_geocodificaciones_negocio_idx on public.maps_geocodificaciones (negocio_id);
create trigger set_updated_at before insert or update on public.maps_geocodificaciones for each row execute function public.set_updated_at();

create table public.maps_rutas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  origen text not null,
  destino text not null,
  km numeric(7, 1) not null check (km >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index maps_rutas_uq on public.maps_rutas (negocio_id, origen, destino) where deleted_at is null;
create index maps_rutas_negocio_idx on public.maps_rutas (negocio_id);
create trigger set_updated_at before insert or update on public.maps_rutas for each row execute function public.set_updated_at();

create table public.recoleccion_cotizaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cliente_id uuid not null references public.clientes(id),
  direccion_norm text not null,
  punto text not null check (punto in ('negocio', 'base')),
  lat double precision,
  lng double precision,
  km numeric(7, 1) not null check (km >= 0),
  origen text not null check (origen in ('guardada', 'ruta', 'estimada')),
  expira_at timestamptz not null default now() + interval '2 hours',
  usada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index recoleccion_cotizaciones_negocio_idx on public.recoleccion_cotizaciones (negocio_id);
create index recoleccion_cotizaciones_cliente_idx on public.recoleccion_cotizaciones (negocio_id, cliente_id, created_at desc);
create trigger set_updated_at before insert or update on public.recoleccion_cotizaciones for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  foreach t in array array['maps_geocodificaciones', 'maps_rutas', 'recoleccion_cotizaciones'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro())) with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))', t || '_negocio', t);
    execute format('create policy %I on public.%I for all to peludesk_definer using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()))', t || '_negocio_definer', t);
    -- Nadie con sesión la lee: solo el servidor y las funciones de abajo.
    execute format('create policy %I on public.%I for select to authenticated using (false)', t || '_sin_lectura', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to peludesk_definer', t);
  end loop;
end $$;

create or replace function public.recoleccion_direccion_norm(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g'));
$$;
revoke execute on function public.recoleccion_direccion_norm(text) from public, anon;
grant execute on function public.recoleccion_direccion_norm(text) to authenticated, service_role, peludesk_definer;

-- Lo que calculó el servidor: guarda la cotización y le pone precio con la misma tarifa que usará el cargo. Solo service_role.
create or replace function public.recoleccion_cotizacion_registrar(p_cliente uuid, p_direccion text, p_punto text, p_lat double precision, p_lng double precision, p_km numeric, p_origen text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_serv uuid;
  v_cant int := greatest(1, ceil(p_km))::int;
  v_unit numeric;
  v_estado text;
  v_id uuid;
begin
  if not exists (select 1 from public.clientes c where c.id = p_cliente and c.negocio_id = public.negocio_actual() and c.deleted_at is null) then
    raise exception 'Cliente no encontrado.';
  end if;
  select s.id into v_serv from public.servicios s where s.negocio_id = public.negocio_actual() and s.clave = 'recoleccion' and s.deleted_at is null limit 1;
  if v_serv is null then
    raise exception 'Este negocio no tiene el servicio «Recolección a domicilio»: captúralo en Servicios y precios (/servicios).';
  end if;
  select r.precio, r.estado into v_unit, v_estado from public.resolver_precio(v_serv, null, null, v_cant, public.fecha_negocio()) r;
  insert into public.recoleccion_cotizaciones (negocio_id, cliente_id, direccion_norm, punto, lat, lng, km, origen)
  values (public.negocio_actual(), p_cliente, public.recoleccion_direccion_norm(p_direccion), p_punto, p_lat, p_lng, p_km, p_origen)
  returning id into v_id;
  return jsonb_build_object('cotizacion_id', v_id, 'km', p_km, 'origen_km', p_origen, 'cantidad', v_cant,
    'precio_km', case when v_estado = 'disponible' then v_unit end,
    'precio', case when v_estado = 'disponible' then round(v_unit * v_cant, 2) end,
    'sin_tarifa', case when v_estado = 'disponible' then null else public.describir_precio_faltante(v_serv, null, null, v_cant, public.fecha_negocio()) end);
end;
$$;
alter function public.recoleccion_cotizacion_registrar(uuid, text, text, double precision, double precision, numeric, text) owner to peludesk_definer;
revoke execute on function public.recoleccion_cotizacion_registrar(uuid, text, text, double precision, double precision, numeric, text) from public, anon, authenticated;
grant execute on function public.recoleccion_cotizacion_registrar(uuid, text, text, double precision, double precision, numeric, text) to service_role;

-- Los km que valen para un dueño: los de su última cotización vigente y sin usar de esa dirección. Si manda otros, se rechaza.
create or replace function public.recoleccion_km_cotizados(p_cliente uuid, p_direccion text, p_punto text, p_km numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid; v_km numeric;
begin
  select q.id, q.km into v_id, v_km from public.recoleccion_cotizaciones q
  where q.negocio_id = public.negocio_actual() and q.cliente_id = p_cliente and q.direccion_norm = public.recoleccion_direccion_norm(p_direccion)
    and q.punto = coalesce(p_punto, 'negocio') and q.usada_at is null and q.deleted_at is null and q.expira_at > now()
  order by q.created_at desc limit 1;
  if v_id is null then
    raise exception 'Esa dirección no está cotizada. Vuelve a ver cuánto cuesta.' using errcode = '42501';
  end if;
  if p_km is not null and abs(p_km - v_km) > 0.05 then
    raise exception 'Los kilómetros no coinciden con la cotización. Vuelve a ver cuánto cuesta.' using errcode = '42501';
  end if;
  update public.recoleccion_cotizaciones set usada_at = now() where id = v_id;
  return v_km;
end;
$$;
alter function public.recoleccion_km_cotizados(uuid, text, text, numeric) owner to peludesk_definer;
revoke execute on function public.recoleccion_km_cotizados(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.recoleccion_km_cotizados(uuid, text, text, numeric) to service_role;

-- recoleccion_guardar: quien no es del personal solo guarda los km de su cotización (también si llama a la función directo).
do $$
declare v_def text; v_ancla text := $a$  if p_estancia is not null then
    select e.perro_id, e.fecha_entrada into v_perro, v_fecha$a$;
begin
  select replace(pg_get_functiondef('public.recoleccion_guardar(uuid, uuid, uuid, date, time, text, double precision, double precision, text, numeric, text, boolean)'::regprocedure), E'\r', '') into v_def;
  if position(v_ancla in v_def) = 0 then
    raise exception 'recoleccion_guardar cambió: no encuentro dónde revisar la cotización.';
  end if;
  v_def := replace(v_def, v_ancla, $b$  if not v_es_staff then
    perform public.recoleccion_km_cotizados(v_res.cliente_id, p_direccion, p_punto, p_km);
  end if;
$b$ || v_ancla);
  execute v_def;
end $$;

-- El dueño: los km de su cotización, con su tope. La ubicación del celular ya no cuenta.
create or replace function public.recoleccion_km_del_portal(p_perro uuid, p_recoleccion jsonb)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_km numeric;
begin
  select p.cliente_id into v_cliente from public.perros p
   where p.id = p_perro and p.negocio_id = public.negocio_actual() and p.deleted_at is null;
  if v_cliente is null or v_cliente is distinct from public.mi_cliente_id() then
    raise exception 'Esa mascota no es tuya en este negocio.' using errcode = '42501';
  end if;
  select q.km into v_km from public.recoleccion_cotizaciones q
  where q.negocio_id = public.negocio_actual() and q.cliente_id = v_cliente and q.direccion_norm = public.recoleccion_direccion_norm(p_recoleccion ->> 'direccion')
    and q.punto = coalesce(p_recoleccion ->> 'punto', 'negocio') and q.usada_at is null and q.deleted_at is null and q.expira_at > now()
  order by q.created_at desc limit 1;
  if v_km is null then
    raise exception 'Esa dirección no está cotizada. Vuelve a ver cuánto cuesta.' using errcode = '42501';
  end if;
  if v_km > 60 then
    raise exception 'Esa dirección queda a más de 60 km del negocio. Pregúntale al negocio si puede pasar por tu mascota.';
  end if;
  return v_km;
end;
$$;

-- Necesita atención: el negocio llegó al tope de Google Maps del mes (las cotizaciones salen en línea recta × 1.3).
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.tablero_atencion(text)'::regprocedure), E'\r', '') into v_def;
  if position('  if cardinality(v_fallos) > 0 then' in v_def) = 0 or position('v_dinero' in v_def) = 0 then
    raise exception 'tablero_atencion cambió: no encuentro dónde agregar el tope de Google Maps.';
  end if;
  if position('maps_tope' in v_def) = 0 then
    v_def := replace(v_def, '  if cardinality(v_fallos) > 0 then',
'  if v_dinero and v_rol = ''admin'' then
    begin
      r := r || jsonb_build_object(''maps_tope'', (
        select case when u.usadas >= t.tope and public.modulo_activo(''recoleccion'') then jsonb_build_object(''usadas'', u.usadas, ''tope'', t.tope) end
        from (select count(*) as usadas from public.maps_consultas m
              where m.negocio_id = public.negocio_actual() and m.mes = date_trunc(''month'', public.fecha_negocio())::date and m.deleted_at is null and m.tipo <> ''pagina'') u,
             (select public.maps_tope_mes() as tope) t));
    exception when others then v_fallos := array_append(v_fallos, ''maps_tope'');
    end;
  end if;
  if cardinality(v_fallos) > 0 then');
    execute v_def;
  end if;
end $$;
