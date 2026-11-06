-- Recolección a domicilio ligada a la reserva (5 de noviembre de 2026; rama ux/recoleccion; docs/guarderia-hotel.md).
-- Al crear o editar una reserva de estética, hotel o guardería (panel, portal y app del dueño) se puede «Incluir
-- recolección»: dirección del cliente (la guardada o una nueva), punto de partida de la camioneta (la base de la
-- camioneta o el local, lo que ya se configura en Administración → Ubicación), hora estimada y el cargo según la tarifa
-- del negocio por km (el servicio `recoleccion`, unidad km), que ENTRA A LA CUENTA como una línea de cargos_aplicados
-- (como cualquier cargo: caja, cobro junto, descuentos, cortes y facturación no cambian). La recolección queda ligada a
-- la reserva (y a su estancia o cita): se ve en la reserva, en el tablero del día y en la lista del día ordenada por
-- cercanía al punto de partida; si la estancia o la cita se mueve, la recolección se mueve; si se cancela, se cancela
-- (y su cargo). Se escribe SOLO por funciones; el personal la lee con su sesión; el dueño no la lee (la dirección es suya
-- pero el precio no se le enseña aquí: lo ve en su cuenta).

-- ── 1. Tabla ──────────────────────────────────────────────────────────────────────────────────────────────────────
create table public.recolecciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  reserva_id uuid not null references public.reservas(id),
  estancia_id uuid references public.estancias(id),
  cita_id uuid references public.citas_estetica(id),
  perro_id uuid not null references public.perros(id),
  cliente_id uuid not null references public.clientes(id),
  fecha date not null,
  hora_estimada time,
  direccion text not null check (char_length(btrim(direccion)) between 5 and 300),
  lat double precision,
  lng double precision,
  punto_partida text not null default 'negocio' check (punto_partida in ('negocio', 'base')),
  km numeric(6, 1) not null check (km >= 0),
  precio numeric(10, 2) not null check (precio >= 0),
  cargo_id uuid references public.cargos_aplicados(id),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_camino', 'recogido', 'cancelada')),
  salio_at timestamptz,
  recogido_at timestamptz,
  hecho_por uuid references auth.users(id) on delete set null,
  cancelada_at timestamptz,
  cancelada_por uuid references auth.users(id) on delete set null,
  motivo_cancelacion text,
  notas text check (notas is null or char_length(notas) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (estado <> 'cancelada' or motivo_cancelacion is not null),
  check (estancia_id is not null or cita_id is not null or reserva_id is not null)
);
create index recolecciones_negocio_idx on public.recolecciones (negocio_id);
create index recolecciones_negocio_fecha_idx on public.recolecciones (negocio_id, fecha) where deleted_at is null;
create index recolecciones_reserva_idx on public.recolecciones (reserva_id);
-- Una recolección viva por estancia, por cita, o por reserva cuando no tiene ni una ni otra.
create unique index recolecciones_una_por_estancia on public.recolecciones (estancia_id) where estancia_id is not null and estado <> 'cancelada' and deleted_at is null;
create unique index recolecciones_una_por_cita on public.recolecciones (cita_id) where cita_id is not null and estado <> 'cancelada' and deleted_at is null;
create trigger set_updated_at before insert or update on public.recolecciones for each row execute function public.set_updated_at();
alter table public.recolecciones enable row level security;
create policy recolecciones_negocio on public.recolecciones as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy recolecciones_negocio_definer on public.recolecciones for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual())) with check (negocio_id = (select public.negocio_actual()));
-- El personal la lee; nadie la escribe directo (solo las funciones recoleccion_*).
create policy recolecciones_select_staff on public.recolecciones for select to authenticated using (coalesce((select public.is_staff()), false));
grant select on public.recolecciones to authenticated;
grant select, insert, update on public.recolecciones to peludesk_definer;
comment on table public.recolecciones is 'Recolección a domicilio ligada a una reserva (estancia o cita): dirección, punto de partida, hora, km, precio y su cargo en la cuenta. Solo por funciones recoleccion_*.';

-- ── 2. Puntos de partida (lo que ya se configura en Ubicación) ───────────────────────────────────────────────────
create or replace function public.recoleccion_puntos_partida()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'negocio', (select jsonb_build_object('direccion', s.direccion, 'lat', s.lat, 'lng', s.lng)
                from public.sucursales s where s.negocio_id = public.negocio_actual() and s.deleted_at is null
                order by s.activo desc, s.created_at limit 1),
    'base', (select case when c.base_direccion is null then null else jsonb_build_object('direccion', c.base_direccion, 'lat', c.base_lat, 'lng', c.base_lng) end
             from public.resolver_cupo_configuracion(public.fecha_negocio()) c)
  )
  where coalesce((select public.is_staff()), false) or (select public.mi_cliente_id()) is not null;
$$;
alter function public.recoleccion_puntos_partida() owner to peludesk_definer;
revoke execute on function public.recoleccion_puntos_partida() from public, anon;
grant execute on function public.recoleccion_puntos_partida() to authenticated, service_role;

-- ── 3. Cotizar: km y precio con la tarifa del negocio ────────────────────────────────────────────────────────────
-- km: la distancia guardada del cliente si la dirección es la suya; si no, línea recta entre el punto de partida y la
-- coordenada × 1.3 (calle) redondeada a 0.5 km hacia arriba; sin coordenadas, null (la pantalla lo pide a Google o a
-- mano). precio: la tarifa por km del servicio `recoleccion` × km redondeado hacia arriba (cargos_aplicados cobra por
-- cantidad entera), con la misma función que usará el cargo.
create or replace function public.recoleccion_cotizar(p_cliente uuid, p_direccion text, p_lat double precision, p_lng double precision, p_punto text default 'negocio')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cli record;
  v_puntos jsonb;
  v_p jsonb;
  v_km numeric;
  v_origen text := 'sin_datos';
  v_serv uuid;
  v_unit numeric;
  v_estado text;
  v_cant int;
begin
  if not (coalesce((select public.is_staff()), false) or (select public.mi_cliente_id()) = p_cliente) then
    raise exception 'Solo el personal, o el dueño de la cuenta, cotiza una recolección.' using errcode = '42501';
  end if;
  select c.direccion, c.direccion_lat, c.direccion_lng, c.distancia_base_km into v_cli
  from public.clientes c where c.id = p_cliente and c.negocio_id = public.negocio_actual() and c.deleted_at is null;
  if not found then
    raise exception 'Cliente no encontrado.';
  end if;
  if p_punto not in ('negocio', 'base') then
    raise exception 'El punto de partida es el local o la base de la camioneta.';
  end if;
  v_puntos := public.recoleccion_puntos_partida();
  v_p := coalesce(v_puntos -> p_punto, v_puntos -> 'negocio');
  if v_cli.distancia_base_km is not null and lower(btrim(coalesce(p_direccion, ''))) = lower(btrim(coalesce(v_cli.direccion, ''))) then
    v_km := v_cli.distancia_base_km;
    v_origen := 'guardada';
  elsif p_lat is not null and p_lng is not null and (v_p ->> 'lat') is not null then
    v_km := ceil((2 * 6371 * asin(sqrt(power(sin(radians(p_lat - (v_p ->> 'lat')::double precision) / 2), 2)
             + cos(radians((v_p ->> 'lat')::double precision)) * cos(radians(p_lat))
             * power(sin(radians(p_lng - (v_p ->> 'lng')::double precision) / 2), 2)))) * 1.3 * 2) / 2.0;
    v_origen := 'calculada';
  end if;
  select s.id into v_serv from public.servicios s where s.negocio_id = public.negocio_actual() and s.clave = 'recoleccion' and s.deleted_at is null limit 1;
  if v_serv is null then
    raise exception 'Este negocio no tiene el servicio «Recolección a domicilio»: captúralo en Servicios y precios (/servicios).';
  end if;
  v_cant := greatest(1, ceil(coalesce(v_km, 1)))::int;
  select r.precio, r.estado into v_unit, v_estado from public.resolver_precio(v_serv, null, null, v_cant, public.fecha_negocio()) r;
  return jsonb_build_object(
    'km', v_km, 'origen_km', v_origen, 'punto', p_punto, 'punto_direccion', v_p ->> 'direccion',
    'servicio_id', v_serv, 'cantidad', v_cant,
    'precio_km', case when v_estado = 'disponible' then v_unit end,
    'precio', case when v_estado = 'disponible' and v_km is not null then round(v_unit * v_cant, 2) end,
    'estado_precio', v_estado,
    'sin_tarifa', case when v_estado = 'disponible' then null else public.describir_precio_faltante(v_serv, null, null, v_cant, public.fecha_negocio()) end,
    'direccion_guardada', v_cli.direccion, 'lat_guardada', v_cli.direccion_lat, 'lng_guardada', v_cli.direccion_lng
  );
end;
$$;
alter function public.recoleccion_cotizar(uuid, text, double precision, double precision, text) owner to peludesk_definer;
revoke execute on function public.recoleccion_cotizar(uuid, text, double precision, double precision, text) from public, anon;
grant execute on function public.recoleccion_cotizar(uuid, text, double precision, double precision, text) to authenticated, service_role;

-- ── 4. Guardar: la recolección y su cargo en la cuenta ───────────────────────────────────────────────────────────
create or replace function public.recoleccion_guardar(
  p_reserva uuid, p_estancia uuid, p_cita uuid, p_fecha date, p_hora time,
  p_direccion text, p_lat double precision, p_lng double precision, p_punto text, p_km numeric,
  p_notas text default null, p_guardar_direccion boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res record;
  v_perro uuid;
  v_fecha date := p_fecha;
  v_hora time := p_hora;
  v_serv uuid;
  v_cant int;
  v_cargo record;
  v_fila public.recolecciones%rowtype;
  v_es_staff boolean := coalesce((select public.is_staff()), false);
begin
  select r.id, r.cliente_id into v_res from public.reservas r where r.id = p_reserva and r.negocio_id = public.negocio_actual() and r.deleted_at is null;
  if not found then
    raise exception 'Reserva no encontrada.';
  end if;
  if not (v_es_staff or (select public.mi_cliente_id()) = v_res.cliente_id) then
    raise exception 'Solo el personal, o el dueño de la cuenta, agrega una recolección.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(p_direccion, ''))) < 5 then
    raise exception 'Escribe la dirección de la recolección.';
  end if;
  if p_punto not in ('negocio', 'base') then
    raise exception 'El punto de partida es el local o la base de la camioneta.';
  end if;
  if p_km is null or p_km < 0 then
    raise exception 'Falta la distancia (km) de la recolección: cotízala primero.';
  end if;
  if p_estancia is not null then
    select e.perro_id, e.fecha_entrada into v_perro, v_fecha from public.estancias e
    where e.id = p_estancia and e.reserva_id = p_reserva and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego');
    if not found then raise exception 'La estancia no es de esta reserva o ya no está viva.'; end if;
    v_fecha := coalesce(p_fecha, v_fecha);
  elsif p_cita is not null then
    select c.perro_id, (c.inicio at time zone public.zona_negocio())::date, (c.inicio at time zone public.zona_negocio())::time
      into v_perro, v_fecha, v_hora from public.citas_estetica c
    where c.id = p_cita and c.reserva_id = p_reserva and c.deleted_at is null and c.estado not in ('cancelada', 'no_llego');
    if not found then raise exception 'La cita no es de esta reserva o ya no está viva.'; end if;
    v_fecha := coalesce(p_fecha, v_fecha);
    v_hora := coalesce(p_hora, v_hora);
  else
    select e.perro_id into v_perro from public.estancias e where e.reserva_id = p_reserva and e.deleted_at is null order by e.fecha_entrada limit 1;
    if v_perro is null then
      select c.perro_id into v_perro from public.citas_estetica c where c.reserva_id = p_reserva and c.deleted_at is null order by c.inicio limit 1;
    end if;
    if v_perro is null then raise exception 'La reserva no tiene estancias ni citas a las que ligar la recolección.'; end if;
  end if;
  if v_fecha is null then
    raise exception 'Indica la fecha de la recolección.';
  end if;
  select s.id into v_serv from public.servicios s where s.negocio_id = public.negocio_actual() and s.clave = 'recoleccion' and s.deleted_at is null limit 1;
  if v_serv is null then
    raise exception 'Este negocio no tiene el servicio «Recolección a domicilio»: captúralo en Servicios y precios (/servicios).';
  end if;
  v_cant := greatest(1, ceil(p_km))::int;
  -- El cargo, como cualquier otro: el disparador de cargos resuelve el precio por km (y truena con el texto de qué falta).
  insert into public.cargos_aplicados (negocio_id, estancia_id, reserva_id, perro_id, servicio_id, cantidad, descripcion, notas, created_by)
  values (public.negocio_actual(), p_estancia, p_reserva, v_perro, v_serv, v_cant,
          'Recolección a domicilio (' || p_km || ' km)', nullif(btrim(coalesce(p_notas, '')), ''), auth.uid())
  returning id, precio, cantidad into v_cargo;
  insert into public.recolecciones (negocio_id, reserva_id, estancia_id, cita_id, perro_id, cliente_id, fecha, hora_estimada, direccion, lat, lng,
                                    punto_partida, km, precio, cargo_id, notas, created_by)
  values (public.negocio_actual(), p_reserva, p_estancia, p_cita, v_perro, v_res.cliente_id, v_fecha, v_hora, btrim(p_direccion), p_lat, p_lng,
          p_punto, p_km, round(v_cargo.precio * v_cargo.cantidad, 2), v_cargo.id, nullif(btrim(coalesce(p_notas, '')), ''), auth.uid())
  returning * into v_fila;
  -- La dirección nueva se guarda en la ficha del cliente solo si se pidió (y solo el personal).
  if p_guardar_direccion and v_es_staff then
    update public.clientes set direccion = btrim(p_direccion), direccion_lat = p_lat, direccion_lng = p_lng,
      distancia_base_km = p_km, distancia_calculada_at = now(), distancia_ajustada_manualmente = (p_lat is null)
    where id = v_res.cliente_id and negocio_id = public.negocio_actual();
  end if;
  return to_jsonb(v_fila);
end;
$$;
alter function public.recoleccion_guardar(uuid, uuid, uuid, date, time, text, double precision, double precision, text, numeric, text, boolean) owner to peludesk_definer;
revoke execute on function public.recoleccion_guardar(uuid, uuid, uuid, date, time, text, double precision, double precision, text, numeric, text, boolean) from public, anon;
grant execute on function public.recoleccion_guardar(uuid, uuid, uuid, date, time, text, double precision, double precision, text, numeric, text, boolean) to authenticated, service_role;

-- ── 5. Marcar (en camino, recogido) y cancelar (con su cargo) ────────────────────────────────────────────────────
create or replace function public.recoleccion_marcar(p_id uuid, p_estado text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_fila public.recolecciones%rowtype;
begin
  if not coalesce((select public.is_staff()), false) then
    raise exception 'Solo el personal marca una recolección.' using errcode = '42501';
  end if;
  if p_estado not in ('en_camino', 'recogido', 'pendiente') then
    raise exception 'Estado no válido.';
  end if;
  update public.recolecciones r
  set estado = p_estado,
      salio_at = case when p_estado = 'en_camino' then now() when p_estado = 'pendiente' then null else r.salio_at end,
      recogido_at = case when p_estado = 'recogido' then now() when p_estado = 'pendiente' then null else r.recogido_at end,
      hecho_por = case when p_estado = 'recogido' then auth.uid() else r.hecho_por end
  where r.id = p_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.estado <> 'cancelada'
  returning * into v_fila;
  if not found then raise exception 'Recolección no encontrada o ya cancelada.'; end if;
  return to_jsonb(v_fila);
end;
$$;
alter function public.recoleccion_marcar(uuid, text) owner to peludesk_definer;
revoke execute on function public.recoleccion_marcar(uuid, text) from public, anon;
grant execute on function public.recoleccion_marcar(uuid, text) to authenticated, service_role;

create or replace function public.recoleccion_cancelar(p_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fila public.recolecciones%rowtype;
  v_es_staff boolean := coalesce((select public.is_staff()), false);
begin
  if char_length(btrim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'Escribe por qué se cancela la recolección.';
  end if;
  select * into v_fila from public.recolecciones r where r.id = p_id and r.negocio_id = public.negocio_actual() and r.deleted_at is null;
  if not found then raise exception 'Recolección no encontrada.'; end if;
  if not (v_es_staff or ((select public.mi_cliente_id()) = v_fila.cliente_id and v_fila.estado = 'pendiente')) then
    raise exception 'Solo el personal, o el dueño mientras siga pendiente, cancela una recolección.' using errcode = '42501';
  end if;
  if v_fila.estado = 'cancelada' then return to_jsonb(v_fila); end if;
  update public.recolecciones set estado = 'cancelada', cancelada_at = now(), cancelada_por = auth.uid(), motivo_cancelacion = btrim(p_motivo)
  where id = p_id returning * into v_fila;
  if v_fila.cargo_id is not null then
    update public.cargos_aplicados set cancelado = true, motivo_cancelacion = 'Recolección cancelada: ' || btrim(p_motivo), cancelado_por = auth.uid(), cancelado_at = now()
    where id = v_fila.cargo_id and cancelado = false;
  end if;
  return to_jsonb(v_fila);
end;
$$;
alter function public.recoleccion_cancelar(uuid, text) owner to peludesk_definer;
revoke execute on function public.recoleccion_cancelar(uuid, text) from public, anon;
grant execute on function public.recoleccion_cancelar(uuid, text) to authenticated, service_role;

-- ── 6. La lista del día, ordenada por cercanía al punto de partida ───────────────────────────────────────────────
create or replace function public.recolecciones_dia(p_fecha date default public.fecha_negocio())
returns table (
  id uuid, reserva_id uuid, estancia_id uuid, cita_id uuid, perro_id uuid, perro_nombre text, cliente_id uuid, cliente_nombre text, cliente_telefono text,
  fecha date, hora_estimada time, direccion text, lat double precision, lng double precision, punto_partida text, punto_direccion text,
  km numeric, precio numeric, estado text, salio_at timestamptz, recogido_at timestamptz, notas text, distancia_recta_km numeric, updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with pts as (select public.recoleccion_puntos_partida() as j)
  select r.id, r.reserva_id, r.estancia_id, r.cita_id, r.perro_id, p.nombre, r.cliente_id, c.nombre, c.telefono,
    r.fecha, r.hora_estimada, r.direccion, r.lat, r.lng, r.punto_partida,
    coalesce(pts.j -> r.punto_partida, pts.j -> 'negocio') ->> 'direccion',
    r.km, r.precio, r.estado, r.salio_at, r.recogido_at, r.notas,
    case when r.lat is not null and (coalesce(pts.j -> r.punto_partida, pts.j -> 'negocio') ->> 'lat') is not null then
      round((2 * 6371 * asin(sqrt(power(sin(radians(r.lat - (coalesce(pts.j -> r.punto_partida, pts.j -> 'negocio') ->> 'lat')::double precision) / 2), 2)
        + cos(radians((coalesce(pts.j -> r.punto_partida, pts.j -> 'negocio') ->> 'lat')::double precision)) * cos(radians(r.lat))
        * power(sin(radians(r.lng - (coalesce(pts.j -> r.punto_partida, pts.j -> 'negocio') ->> 'lng')::double precision) / 2), 2))))::numeric, 1)
    end,
    r.updated_at
  from public.recolecciones r
  cross join pts
  join public.perros p on p.id = r.perro_id
  join public.clientes c on c.id = r.cliente_id
  where r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.fecha = p_fecha
    and coalesce((select public.is_staff()), false)
  order by (r.estado = 'cancelada'), r.punto_partida, (r.lat is null), 23 nulls last, r.hora_estimada nulls last, r.created_at;
$$;
alter function public.recolecciones_dia(date) owner to peludesk_definer;
revoke execute on function public.recolecciones_dia(date) from public, anon;
grant execute on function public.recolecciones_dia(date) to authenticated, service_role;

-- ── 7. Sigue a su estancia o a su cita: si se mueve, se mueve; si se cancela, se cancela (con su cargo) ──────────
create or replace function public.recoleccion_sigue_estancia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado in ('cancelada', 'no_llego') and old.estado not in ('cancelada', 'no_llego') then
    perform set_config('app.negocio_id', new.negocio_id::text, true);
    update public.cargos_aplicados ca set cancelado = true, motivo_cancelacion = 'La estancia ' || case when new.estado = 'cancelada' then 'se canceló' else 'no llegó' end || ': recolección cancelada', cancelado_at = now()
    where ca.id in (select r.cargo_id from public.recolecciones r where r.estancia_id = new.id and r.estado <> 'cancelada' and r.deleted_at is null and r.cargo_id is not null) and ca.cancelado = false;
    update public.recolecciones r set estado = 'cancelada', cancelada_at = now(), motivo_cancelacion = 'La estancia ' || case when new.estado = 'cancelada' then 'se canceló' else 'no llegó' end
    where r.estancia_id = new.id and r.estado <> 'cancelada' and r.deleted_at is null;
  elsif new.fecha_entrada is distinct from old.fecha_entrada then
    perform set_config('app.negocio_id', new.negocio_id::text, true);
    update public.recolecciones r set fecha = new.fecha_entrada
    where r.estancia_id = new.id and r.estado in ('pendiente', 'en_camino') and r.deleted_at is null;
  end if;
  return new;
end;
$$;
alter function public.recoleccion_sigue_estancia() owner to peludesk_definer;
revoke execute on function public.recoleccion_sigue_estancia() from public, anon, authenticated;
drop trigger if exists estancias_recoleccion_sigue on public.estancias;
-- BEFORE: el cargo se cancela mientras la estancia todavía no está cancelada en la tabla (validar_cargo_aplicado rechaza
-- tocar un cargo de una estancia cancelada).
create trigger estancias_recoleccion_sigue before update of estado, fecha_entrada on public.estancias
  for each row execute function public.recoleccion_sigue_estancia();

create or replace function public.recoleccion_sigue_cita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado in ('cancelada', 'no_llego') and old.estado not in ('cancelada', 'no_llego') then
    perform set_config('app.negocio_id', new.negocio_id::text, true);
    update public.cargos_aplicados ca set cancelado = true, motivo_cancelacion = 'La cita ' || case when new.estado = 'cancelada' then 'se canceló' else 'no se presentó' end || ': recolección cancelada', cancelado_at = now()
    where ca.id in (select r.cargo_id from public.recolecciones r where r.cita_id = new.id and r.estado <> 'cancelada' and r.deleted_at is null and r.cargo_id is not null) and ca.cancelado = false;
    update public.recolecciones r set estado = 'cancelada', cancelada_at = now(), motivo_cancelacion = 'La cita ' || case when new.estado = 'cancelada' then 'se canceló' else 'no se presentó' end
    where r.cita_id = new.id and r.estado <> 'cancelada' and r.deleted_at is null;
  elsif new.inicio is distinct from old.inicio then
    perform set_config('app.negocio_id', new.negocio_id::text, true);
    update public.recolecciones r
    set fecha = (new.inicio at time zone public.zona_negocio())::date,
        hora_estimada = case when r.hora_estimada is null or r.hora_estimada = (old.inicio at time zone public.zona_negocio())::time
                             then (new.inicio at time zone public.zona_negocio())::time else r.hora_estimada end
    where r.cita_id = new.id and r.estado in ('pendiente', 'en_camino') and r.deleted_at is null;
  end if;
  return new;
end;
$$;
alter function public.recoleccion_sigue_cita() owner to peludesk_definer;
revoke execute on function public.recoleccion_sigue_cita() from public, anon, authenticated;
drop trigger if exists citas_recoleccion_sigue on public.citas_estetica;
create trigger citas_recoleccion_sigue after update of estado, inicio on public.citas_estetica
  for each row execute function public.recoleccion_sigue_cita();

-- ── 8. El dueño, desde su app: pedir cita o reservar CON recolección en el mismo paso ───────────────────────────
-- p_recoleccion: {"direccion", "lat", "lng", "punto", "km", "hora", "notas"} (lo que devolvió recoleccion_cotizar).
create or replace function public.portal_pedir_cita_con_recoleccion(p_perro uuid, p_servicio uuid, p_inicio timestamptz, p_recoleccion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_cita jsonb; v_rec jsonb;
begin
  v_cita := public.portal_pedir_cita(p_perro, p_servicio, p_inicio);
  if p_recoleccion is not null and (p_recoleccion ->> 'direccion') is not null then
    v_rec := public.recoleccion_guardar((v_cita ->> 'reserva_id')::uuid, null, (v_cita ->> 'cita_id')::uuid, null, (p_recoleccion ->> 'hora')::time,
      p_recoleccion ->> 'direccion', (p_recoleccion ->> 'lat')::double precision, (p_recoleccion ->> 'lng')::double precision,
      coalesce(p_recoleccion ->> 'punto', 'negocio'), (p_recoleccion ->> 'km')::numeric, p_recoleccion ->> 'notas', false);
  end if;
  return v_cita || jsonb_build_object('recoleccion', v_rec);
end;
$$;
alter function public.portal_pedir_cita_con_recoleccion(uuid, uuid, timestamptz, jsonb) owner to peludesk_definer;
revoke execute on function public.portal_pedir_cita_con_recoleccion(uuid, uuid, timestamptz, jsonb) from public, anon;
grant execute on function public.portal_pedir_cita_con_recoleccion(uuid, uuid, timestamptz, jsonb) to authenticated, service_role;

create or replace function public.portal_reservar_con_recoleccion(p_perro uuid, p_servicio uuid, p_entrada date, p_salida date, p_horas int, p_recoleccion jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_res jsonb; v_rec jsonb;
begin
  v_res := public.portal_reservar(p_perro, p_servicio, p_entrada, p_salida, p_horas);
  if p_recoleccion is not null and (p_recoleccion ->> 'direccion') is not null then
    v_rec := public.recoleccion_guardar((v_res ->> 'reserva_id')::uuid, (v_res ->> 'estancia_id')::uuid, null, null, (p_recoleccion ->> 'hora')::time,
      p_recoleccion ->> 'direccion', (p_recoleccion ->> 'lat')::double precision, (p_recoleccion ->> 'lng')::double precision,
      coalesce(p_recoleccion ->> 'punto', 'negocio'), (p_recoleccion ->> 'km')::numeric, p_recoleccion ->> 'notas', false);
  end if;
  return v_res || jsonb_build_object('recoleccion', v_rec);
end;
$$;
alter function public.portal_reservar_con_recoleccion(uuid, uuid, date, date, int, jsonb) owner to peludesk_definer;
revoke execute on function public.portal_reservar_con_recoleccion(uuid, uuid, date, date, int, jsonb) from public, anon;
grant execute on function public.portal_reservar_con_recoleccion(uuid, uuid, date, date, int, jsonb) to authenticated, service_role;

-- Lo que el dueño ve de sus recolecciones (sin precio: eso va en su cuenta): para la app.
create or replace function public.mis_recolecciones()
returns table (id uuid, reserva_id uuid, estancia_id uuid, cita_id uuid, perro_id uuid, perro_nombre text, fecha date, hora_estimada time, direccion text, estado text, salio_at timestamptz, recogido_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.reserva_id, r.estancia_id, r.cita_id, r.perro_id, p.nombre, r.fecha, r.hora_estimada, r.direccion, r.estado, r.salio_at, r.recogido_at
  from public.recolecciones r join public.perros p on p.id = r.perro_id
  where r.negocio_id = public.negocio_actual() and r.deleted_at is null and r.cliente_id = (select public.mi_cliente_id())
  order by r.fecha desc, r.hora_estimada;
$$;
alter function public.mis_recolecciones() owner to peludesk_definer;
revoke execute on function public.mis_recolecciones() from public, anon;
grant execute on function public.mis_recolecciones() to authenticated, service_role;
