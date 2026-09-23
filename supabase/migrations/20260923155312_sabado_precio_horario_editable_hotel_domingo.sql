-- Cuatro cosas que dependen del día de la semana:
--   1. Precio distinto por día (guardería día completo en sábado: $140).
--   2. El horario por día se edita desde la configuración del admin.
--   3. El hotel no entrega perros en día cerrado (domingo).
--   4. Convertir guardería en noche de hotel no deja la salida en domingo.

-- ── 1. Precio por día de la semana ───────────────────────────────────
-- Tabla aparte y no una dimensión más de `tarifas`: la matriz
-- (tarifas_vigentes) alimenta la pantalla de tarifas, las cotizaciones,
-- servicios_cotizables y el alta por link, y todos la leen como UNA
-- celda por combinación de grupo/talla/pelaje/tramo. Una fila de sábado
-- ahí chocaría con la celda normal en cada uno. Aquí es un reemplazo del
-- precio que resolver_precio aplica sobre la celda encontrada, solo en
-- ese día, y la matriz no se entera.
create table public.tarifas_dia_semana (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id),
  dia_semana int not null check (dia_semana between 1 and 7), -- 1=lunes…7=domingo, igual que extract(isodow)
  precio numeric(10,2) not null check (precio >= 0),
  vigencia_desde date not null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create trigger set_updated_at before insert or update on public.tarifas_dia_semana
  for each row execute function public.set_updated_at();

create unique index tarifas_dia_semana_celda_idx
  on public.tarifas_dia_semana (servicio_id, dia_semana, vigencia_desde)
  where deleted_at is null;

alter table public.tarifas_dia_semana enable row level security;

-- Misma apertura que `tarifas`: cualquiera con sesión la lee (la usa
-- resolver_precio con los permisos de quien reserva), solo admin escribe.
create policy tarifas_dia_semana_select_autenticados on public.tarifas_dia_semana
  for select to authenticated
  using (true);

create policy tarifas_dia_semana_insert_admin on public.tarifas_dia_semana
  for insert to authenticated
  with check (public.is_admin());

create policy tarifas_dia_semana_update_admin on public.tarifas_dia_semana
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.tarifas_dia_semana is
  'Precio distinto para un servicio en un día de la semana (p. ej. guardería día completo en sábado). Reemplaza el precio de la celda de tarifas ese día; aplica a todas las tallas. Insert-only con vigencia, igual que tarifas.';

-- resolver_precio: cuerpo de 20260910190120, con el reemplazo por día.
-- Si la celda no existe o no aplica, el día no la inventa.
create or replace function public.resolver_precio(
  p_servicio_id uuid,
  p_tamano_id uuid,
  p_pelaje_id uuid,
  p_cantidad int,
  p_fecha date default current_date,
  p_grupo_raza_id uuid default null,
  p_pelo_maltratado boolean default false
)
returns table (
  precio numeric,
  precio_pelo_maltratado numeric,
  no_aplica boolean,
  estado text,
  vigencia_desde date
)
language sql
stable
set search_path = ''
as $$
  select
    case
      when p_pelo_maltratado and t.precio_pelo_maltratado is not null
        then t.precio_pelo_maltratado
      when t.id is not null and not t.no_aplica and d.precio is not null
        then d.precio
      else t.precio
    end,
    t.precio_pelo_maltratado,
    t.no_aplica,
    case
      when t.id is null then 'sin_tarifa'
      when t.no_aplica then 'no_aplica'
      else 'disponible'
    end as estado,
    t.vigencia_desde
  from (select 1) as _dummy
  left join lateral (
    select tr.id, tr.precio, tr.precio_pelo_maltratado, tr.no_aplica, tr.vigencia_desde
    from public.tarifas tr
    where tr.servicio_id = p_servicio_id
      and tr.grupo_raza_id is not distinct from p_grupo_raza_id
      and tr.tamano_id is not distinct from p_tamano_id
      and tr.pelaje_id is not distinct from p_pelaje_id
      and p_cantidad >= tr.cantidad_desde
      and (tr.cantidad_hasta is null or p_cantidad <= tr.cantidad_hasta)
      and tr.vigencia_desde <= p_fecha
      and tr.deleted_at is null
    order by tr.vigencia_desde desc
    limit 1
  ) t on true
  left join lateral (
    select td.precio
    from public.tarifas_dia_semana td
    where td.servicio_id = p_servicio_id
      and td.dia_semana = extract(isodow from p_fecha)::int
      and td.vigencia_desde <= p_fecha
      and td.deleted_at is null
    order by td.vigencia_desde desc, td.created_at desc
    limit 1
  ) d on true;
$$;

-- Captura del cartel: guardería día completo en sábado, $140, desde hoy.
-- Mismo camino que los precios de Fase 17 (migración de datos del
-- cartel); de aquí en adelante se cambia desde la pantalla de tarifas.
insert into public.tarifas_dia_semana (servicio_id, dia_semana, precio, vigencia_desde)
select s.id, 6, 140, public.fecha_negocio()
from public.servicios s
where s.clave = 'guarderia_dia' and s.deleted_at is null;

-- ── 2. Horario por día editable ──────────────────────────────────────
-- Dos generaciones de configuración con la misma vigencia_desde (pasa si
-- se guarda dos veces el mismo día) quedaban empatadas y
-- "limit 1" escogía una al azar. Desempate: la más reciente.
create or replace function public.resolver_cupo_configuracion(
  p_fecha date default current_date
)
returns table (
  cupo_diurno int,
  cupo_nocturno int,
  hora_apertura time,
  hora_cierre time,
  vigencia_desde date,
  estado text,
  base_direccion text,
  base_lat double precision,
  base_lng double precision,
  telefono_recepcion text
)
language sql
stable
set search_path = ''
as $$
  select
    c.cupo_diurno,
    c.cupo_nocturno,
    h.hora_apertura,
    h.hora_cierre,
    c.vigencia_desde,
    case when c.id is null then 'sin_configurar' else 'configurado' end as estado,
    c.base_direccion,
    c.base_lat,
    c.base_lng,
    c.telefono_recepcion
  from (select 1) as _dummy
  left join lateral (
    select cc.id, cc.cupo_diurno, cc.cupo_nocturno, cc.vigencia_desde,
      cc.base_direccion, cc.base_lat, cc.base_lng, cc.telefono_recepcion
    from public.cupo_configuracion cc
    where cc.vigencia_desde <= p_fecha
      and cc.deleted_at is null
    order by cc.vigencia_desde desc, cc.created_at desc
    limit 1
  ) c on true
  left join lateral (
    select hs.hora_apertura, hs.hora_cierre
    from public.horario_semana hs
    where hs.cupo_configuracion_id = c.id
      and hs.dia_semana = extract(dow from p_fecha)
      and hs.deleted_at is null
  ) h on true;
$$;

create or replace function public.telefono_recepcion_publico()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select cc.telefono_recepcion
  from public.cupo_configuracion cc
  where cc.vigencia_desde <= current_date
    and cc.deleted_at is null
  order by cc.vigencia_desde desc, cc.created_at desc
  limit 1;
$$;

-- guardar_configuracion_negocio: mismo desempate al escoger la vigente
-- que se copia.
create or replace function public.guardar_configuracion_negocio(
  p_cupo_diurno int,
  p_cupo_nocturno int,
  p_telefono_recepcion text,
  p_base_direccion text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vigente public.cupo_configuracion%rowtype;
  v_direccion text;
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede cambiar la configuración del negocio.';
  end if;

  if p_cupo_diurno is null or p_cupo_diurno < 0 or p_cupo_nocturno is null or p_cupo_nocturno < 0 then
    raise exception 'El cupo no puede ser negativo.';
  end if;
  if p_telefono_recepcion is not null and p_telefono_recepcion !~ '^[0-9]{10}$' then
    raise exception 'El teléfono de recepción debe tener diez dígitos.';
  end if;

  v_direccion := nullif(btrim(coalesce(p_base_direccion, '')), '');

  select * into v_vigente
  from public.cupo_configuracion
  where vigencia_desde <= public.fecha_negocio() and deleted_at is null
  order by vigencia_desde desc, created_at desc
  limit 1;

  insert into public.cupo_configuracion
    (vigencia_desde, cupo_diurno, cupo_nocturno, hora_cierre,
     base_direccion, base_lat, base_lng, telefono_recepcion, created_by)
  values (
    public.fecha_negocio(),
    p_cupo_diurno,
    p_cupo_nocturno,
    -- hora_cierre sigue siendo NOT NULL en la tabla aunque el horario real
    -- se lea de horario_semana desde Fase 4: se arrastra el valor viejo
    -- para no romper la restricción ni inventar un horario.
    coalesce(v_vigente.hora_cierre, time '19:00'),
    coalesce(v_direccion, v_vigente.base_direccion),
    -- Las coordenadas solo se tiran cuando la dirección CAMBIA de verdad:
    -- son de un geocodificado que cuesta una llamada a Google, y quien
    -- entra a cambiar el teléfono de recepción no manda la dirección. La
    -- primera versión comparaba contra el parámetro vacío y las borraba en
    -- cada guardado — con eso, cotizar una recolección dejaba de
    -- funcionar por haber tocado un campo que no tiene nada que ver.
    case when v_direccion is not null and v_direccion is distinct from v_vigente.base_direccion
      then null else v_vigente.base_lat end,
    case when v_direccion is not null and v_direccion is distinct from v_vigente.base_direccion
      then null else v_vigente.base_lng end,
    p_telefono_recepcion,
    auth.uid()
  )
  returning id into v_id;

  -- El horario por día de la semana cuelga del renglón de configuración,
  -- así que la versión nueva se queda sin horario si no se copia — y el
  -- negocio se encontraría con que "hoy no cerramos" de la nada.
  insert into public.horario_semana
    (cupo_configuracion_id, dia_semana, hora_apertura, hora_cierre, created_by)
  select v_id, hs.dia_semana, hs.hora_apertura, hs.hora_cierre, auth.uid()
  from public.horario_semana hs
  where hs.cupo_configuracion_id = v_vigente.id and hs.deleted_at is null;

  return v_id;
end;
$$;

-- El horario vigente, un renglón por día (0 = domingo … 6 = sábado,
-- igual que horario_semana). Lo leen el editor del admin y el alta por
-- link, en vez de adivinar cuál generación es la vigente por su cuenta.
create or replace function public.horario_semana_vigente(p_fecha date default null)
returns table (dia_semana int, hora_apertura time, hora_cierre time)
language sql
stable
security definer
set search_path = ''
as $$
  select extract(dow from d)::int, cc.hora_apertura, cc.hora_cierre
  from generate_series(
    coalesce(p_fecha, public.fecha_negocio()),
    coalesce(p_fecha, public.fecha_negocio()) + 6,
    interval '1 day'
  ) d
  cross join lateral public.resolver_cupo_configuracion(d::date) cc
  order by 1;
$$;

revoke execute on function public.horario_semana_vigente(date) from public, anon;
grant execute on function public.horario_semana_vigente(date) to authenticated;

-- Guarda los siete días. Si la configuración vigente ya es de hoy, le
-- reemplaza el horario; si es de antes, crea una generación nueva con
-- vigencia de hoy que arrastra todo lo demás (cupo, base, teléfono): el
-- horario de días pasados no se reescribe.
-- Devuelve cuántas reservas futuras quedaron en un día que ya no abre,
-- para que la pantalla lo avise (la base no las cancela sola).
create or replace function public.guardar_horario_semana(p_dias jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_vigente public.cupo_configuracion%rowtype;
  v_hoy date := public.fecha_negocio();
  v_id uuid;
  v_dia jsonb;
  v_num int;
  v_ap time;
  v_ci time;
  v_vistos int[] := array[]::int[];
  v_afectadas int;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede cambiar el horario del negocio.';
  end if;
  if p_dias is null or jsonb_typeof(p_dias) <> 'array' or jsonb_array_length(p_dias) <> 7 then
    raise exception 'Manda el horario de los siete días.';
  end if;

  select * into v_vigente
  from public.cupo_configuracion
  where vigencia_desde <= v_hoy and deleted_at is null
  order by vigencia_desde desc, created_at desc
  limit 1;
  if not found then
    raise exception 'Primero guarda la configuración del negocio (cupo) y luego el horario.';
  end if;

  -- Validar todo antes de escribir nada.
  for v_dia in select * from jsonb_array_elements(p_dias) loop
    v_num := (v_dia->>'dia_semana')::int;
    if v_num is null or v_num < 0 or v_num > 6 or v_num = any(v_vistos) then
      raise exception 'El horario trae un día de la semana inválido o repetido.';
    end if;
    v_vistos := v_vistos || v_num;
    v_ap := nullif(v_dia->>'hora_apertura', '')::time;
    v_ci := nullif(v_dia->>'hora_cierre', '')::time;
    if (v_ap is null) <> (v_ci is null) then
      raise exception 'Cada día abierto necesita hora de apertura y de cierre.';
    end if;
    if v_ap is not null and v_ci <= v_ap then
      raise exception 'La hora de cierre tiene que ser después de la de apertura.';
    end if;
  end loop;

  if v_vigente.vigencia_desde = v_hoy then
    v_id := v_vigente.id;
    update public.horario_semana set deleted_at = now()
    where cupo_configuracion_id = v_id and deleted_at is null;
  else
    insert into public.cupo_configuracion
      (vigencia_desde, cupo_diurno, cupo_nocturno, hora_cierre,
       base_direccion, base_lat, base_lng, telefono_recepcion, created_by)
    values
      (v_hoy, v_vigente.cupo_diurno, v_vigente.cupo_nocturno, v_vigente.hora_cierre,
       v_vigente.base_direccion, v_vigente.base_lat, v_vigente.base_lng,
       v_vigente.telefono_recepcion, auth.uid())
    returning id into v_id;
  end if;

  insert into public.horario_semana (cupo_configuracion_id, dia_semana, hora_apertura, hora_cierre, created_by)
  select v_id,
    (d->>'dia_semana')::int,
    nullif(d->>'hora_apertura', '')::time,
    nullif(d->>'hora_cierre', '')::time,
    auth.uid()
  from jsonb_array_elements(p_dias) d;

  -- Reservas activas de hoy en adelante que caen en un día que ya no abre:
  -- guardería ese día, o salida de hotel ese día.
  select count(*) into v_afectadas
  from public.estancias e
  join public.servicios s on s.id = e.servicio_id
  where e.deleted_at is null
    and e.estado in ('reservada', 'confirmada', 'en_curso')
    and (
      (s.categoria = 'guarderia' and e.fecha_entrada >= v_hoy and not public.negocio_abre(e.fecha_entrada))
      or (s.categoria = 'hotel' and e.fecha_salida >= v_hoy and not public.negocio_abre(e.fecha_salida))
    );

  return jsonb_build_object('configuracion_id', v_id, 'reservas_en_dias_cerrados', v_afectadas);
end;
$$;

revoke execute on function public.guardar_horario_semana(jsonb) from public, anon;
grant execute on function public.guardar_horario_semana(jsonb) to authenticated;

-- ── 3 y 4. Guardería y salida de hotel solo en días que abre ─────────
-- Cuerpo de 20260923152350 con la regla del hotel: el perro de hotel no
-- se entrega en día cerrado (la landing y el contrato lo dicen). Entrar
-- en domingo no se toca: nadie lo pidió.
create or replace function public.validar_estancia_dia_abierto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_dia date;
  v_nombres text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
begin
  if new.deleted_at is not null or new.estado in ('cancelada', 'no_llego') then
    return new;
  end if;

  if TG_OP = 'UPDATE'
    and new.servicio_id is not distinct from old.servicio_id
    and new.fecha_entrada is not distinct from old.fecha_entrada
    and new.fecha_salida is not distinct from old.fecha_salida
    and old.estado not in ('cancelada', 'no_llego')
  then
    return new;
  end if;

  select categoria into v_categoria from public.servicios where id = new.servicio_id;

  if v_categoria = 'guarderia' then
    for v_dia in select generate_series(new.fecha_entrada, new.fecha_salida - 1, interval '1 day')::date loop
      if not public.negocio_abre(v_dia) then
        raise exception 'Guardería no abre en % (%). Elige un día con horario de atención.',
          v_nombres[extract(isodow from v_dia)::int], to_char(v_dia, 'DD/MM/YYYY');
      end if;
    end loop;
  elsif v_categoria = 'hotel' then
    if not public.negocio_abre(new.fecha_salida) then
      raise exception 'El hotel no entrega perros en % (%). Cambia la salida a un día con horario de atención.',
        v_nombres[extract(isodow from new.fecha_salida)::int], to_char(new.fecha_salida, 'DD/MM/YYYY');
    end if;
  end if;

  return new;
end;
$$;

-- convertir_estancia_a_hotel: cuerpo de 20260922060141; la salida pasa
-- al siguiente día que abre. El perro que no recogieron el sábado se
-- entrega el lunes (dos noches), no el domingo.
create or replace function public.convertir_estancia_a_hotel(p_estancia_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_estancia record;
  v_hotel_id uuid;
  v_salida date;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden convertir una estancia en noche de hotel.';
  end if;

  select e.id, e.estado, e.fecha_entrada, s.categoria
    into v_estancia
  from public.estancias e
  join public.servicios s on s.id = e.servicio_id
  where e.id = p_estancia_id and e.deleted_at is null;

  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if v_estancia.categoria <> 'guarderia' then
    raise exception 'Solo una estancia de guardería se convierte en noche de hotel.';
  end if;
  if v_estancia.estado <> 'en_curso' then
    raise exception 'Solo se convierte una estancia con el perro adentro (en curso).';
  end if;

  select c.id into v_hotel_id
  from public.servicios_cotizables c
  where c.categoria = 'hotel'
  order by c.orden, c.nombre
  limit 1;

  if v_hotel_id is null then
    raise exception 'No hay ningún servicio de hotel con tarifa capturada. Captúrala antes de convertir la estancia.';
  end if;

  v_salida := v_estancia.fecha_entrada + 1;
  while not public.negocio_abre(v_salida) and v_salida < v_estancia.fecha_entrada + 8 loop
    v_salida := v_salida + 1;
  end loop;

  update public.estancias
  set servicio_id = v_hotel_id,
      fecha_salida = v_salida,
      horas = null
  where id = p_estancia_id;
end;
$$;
