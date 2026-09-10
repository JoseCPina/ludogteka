-- El grupo de raza entra a la matriz de precios como UNA DIMENSIÓN MÁS,
-- no como un sistema de precios paralelo: misma tabla `tarifas`, mismo
-- resolver_precio, mismo snapshot de precio al reservar, mismo candado
-- de "sin tarifa capturada no se puede cobrar". Lo único que cambia es
-- que la fila ahora puede decir "para este grupo de raza".
alter table public.tarifas
  add column grupo_raza_id uuid references public.grupos_raza(id);

-- La bandera que le dice a la pantalla de tarifas qué forma tiene la
-- matriz de este servicio, igual que ya lo hacen depende_tamano y
-- depende_pelaje.
alter table public.servicios
  add column depende_grupo_raza boolean not null default false;

drop index if exists public.tarifas_busqueda_idx;
create index tarifas_busqueda_idx
  on public.tarifas (servicio_id, grupo_raza_id, tamano_id, pelaje_id, vigencia_desde desc);

-- El EXCLUDE de traslape tiene que conocer la dimensión nueva: sin esto,
-- la tarifa de "estético, grupo poodle" y la de "estético, grupo shih
-- tzu" se verían como la misma celda y la segunda sería rechazada por
-- traslaparse con la primera. Mismo truco del UUID centinela que ya usan
-- tamano/pelaje, por la misma razón: "=" nunca considera iguales dos
-- NULL, así que sin coalesce las filas sin grupo (hotel, guardería,
-- cargos) nunca colisionarían entre sí.
alter table public.tarifas drop constraint tarifas_sin_traslape;

alter table public.tarifas
  add constraint tarifas_sin_traslape
  exclude using gist (
    servicio_id with =,
    coalesce(grupo_raza_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(tamano_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    coalesce(pelaje_id, '00000000-0000-0000-0000-000000000000'::uuid) with =,
    vigencia_desde with =,
    -- Rango con límite superior EXCLUSIVO y null de verdad para "sin
    -- tope", tal como quedó en el fix de Fase 3: la forma original con
    -- '[]' y 2147483647 desborda int4 al normalizar (le suma 1 al máximo
    -- de int4). Copiar la versión original de la migración de creación en
    -- vez de la vigente reintroducía ese bug — comprobado: "integer out
    -- of range".
    int4range(
      cantidad_desde,
      case when cantidad_hasta is null then null else cantidad_hasta + 1 end
    ) with &&
  )
  where (deleted_at is null);

-- resolver_precio gana el parámetro AL FINAL y con default null: las
-- llamadas que ya existen (estancias, cargos — cinco argumentos
-- posicionales) siguen funcionando sin tocarse, y sus tarifas viven con
-- grupo_raza_id null, que es lo que `is not distinct from null` empata.
-- Cambiarle el orden a los parámetros habría roto en silencio los
-- triggers de Fase 4, que es justo donde un precio equivocado entra sin
-- que nadie lo note.
create or replace function public.resolver_precio(
  p_servicio_id uuid,
  p_tamano_id uuid,
  p_pelaje_id uuid,
  p_cantidad int,
  p_fecha date default current_date,
  p_grupo_raza_id uuid default null
)
returns table (precio numeric, no_aplica boolean, estado text, vigencia_desde date)
language sql
stable
set search_path = ''
as $$
  select
    t.precio,
    t.no_aplica,
    case
      when t.id is null then 'sin_tarifa'
      when t.no_aplica then 'no_aplica'
      else 'disponible'
    end as estado,
    t.vigencia_desde
  from (select 1) as _dummy
  left join lateral (
    select tr.id, tr.precio, tr.no_aplica, tr.vigencia_desde
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
  ) t on true;
$$;

revoke execute on function public.resolver_precio(uuid, uuid, uuid, int, date, uuid) from public;
revoke execute on function public.resolver_precio(uuid, uuid, uuid, int, date, uuid) from anon;
grant execute on function public.resolver_precio(uuid, uuid, uuid, int, date, uuid) to authenticated;

-- La versión de cinco argumentos se elimina para que no queden dos
-- funciones con el mismo nombre: con las dos vivas, una llamada nueva que
-- se olvide del grupo caería en la vieja y cotizaría contra las tarifas
-- sin grupo — el mismo tipo de función zombi que ya mordió con
-- publicar_plantilla en Fase 11. Las llamadas de cinco argumentos siguen
-- funcionando porque el sexto tiene default.
drop function if exists public.resolver_precio(uuid, uuid, uuid, int, date);

drop view if exists public.tarifas_vigentes;

create view public.tarifas_vigentes
with (security_invoker = true)
as
select distinct on (t.servicio_id, t.grupo_raza_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta)
  t.servicio_id,
  s.nombre as servicio_nombre,
  s.categoria,
  s.unidad,
  t.grupo_raza_id,
  gr.nombre as grupo_raza_nombre,
  t.tamano_id,
  t.pelaje_id,
  t.cantidad_desde,
  t.cantidad_hasta,
  t.precio,
  t.no_aplica,
  t.vigencia_desde
from public.tarifas t
join public.servicios s on s.id = t.servicio_id
left join public.grupos_raza gr on gr.id = t.grupo_raza_id
where t.vigencia_desde <= current_date
  and t.deleted_at is null
  and s.deleted_at is null
order by
  t.servicio_id, t.grupo_raza_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta,
  t.vigencia_desde desc;

-- El trigger de citas de estética es el único que tiene que resolver el
-- grupo. La regla de qué se le pasa a resolver_precio la manda el GRUPO,
-- no el servicio: solo el grupo de pelo corto se cobra por talla, los
-- demás tienen un precio por grupo sin importar el tamaño del perro. Por
-- eso el tamaño se manda o se anula según grupos_raza.depende_tamano, y
-- no según servicios.depende_tamano.
create or replace function public.validar_cita_estetica()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_duracion int;
  v_depende_tamano boolean;
  v_depende_pelaje boolean;
  v_depende_grupo boolean;
  v_precio numeric;
  v_estado_precio text;
  v_fecha_local date;
  v_estancia record;
  v_fechas_cambiaron boolean;
  v_activa boolean;
  v_hora_cierre time;
  v_grupo record;
begin
  select categoria, duracion_minutos, depende_tamano, depende_pelaje, depende_grupo_raza
    into v_categoria, v_duracion, v_depende_tamano, v_depende_pelaje, v_depende_grupo
  from public.servicios
  where id = new.servicio_id and deleted_at is null;

  if v_categoria is null then
    raise exception 'El servicio de esta cita no existe.';
  end if;
  if v_categoria <> 'estetica' then
    raise exception 'Una cita de estética solo puede usar un servicio de categoría estetica.';
  end if;

  if new.fin is null then
    new.fin := new.inicio + (coalesce(v_duracion, 60) * interval '1 minute');
  end if;

  v_fecha_local := public.fecha_negocio(new.inicio);

  if new.estancia_id is not null then
    select perro_id, fecha_entrada, fecha_salida into v_estancia
    from public.estancias
    where id = new.estancia_id and deleted_at is null;

    if not found then
      raise exception 'La estancia ligada a esta cita no existe.';
    end if;

    if v_estancia.perro_id is distinct from new.perro_id then
      raise exception 'Esta cita es de un perro distinto al de la estancia que se está ligando.';
    end if;

    if v_fecha_local < v_estancia.fecha_entrada or v_fecha_local >= v_estancia.fecha_salida then
      raise exception 'La fecha de esta cita no cae dentro del rango de la estancia ligada.';
    end if;
  end if;

  v_fechas_cambiaron := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.inicio is distinct from old.inicio;

  v_activa := new.estado not in ('cancelada', 'no_llego');

  if v_fechas_cambiaron then
    if v_depende_grupo then
      select * into v_grupo from public.perro_grupo_raza where perro_id = new.perro_id;
      if v_grupo.grupo_raza_id is null then
        raise exception 'No se pudo determinar el grupo de raza de este perro. Revisa el catálogo de razas.';
      end if;

      -- Dentro de un servicio por grupo, el tamaño solo cuenta si el
      -- grupo lo pide (pelo corto). Mandarlo cuando el grupo no lo usa
      -- haría que no empate ninguna tarifa y todo saliera 'sin_tarifa'.
      if v_grupo.depende_tamano then
        select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
        if new.tamano_id is null then
          raise exception 'Este perro no tiene tamaño registrado y su grupo de raza cobra por talla. Complétalo en su expediente antes de reservar.';
        end if;
      else
        new.tamano_id := null;
      end if;
    elsif v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene tamaño registrado. Complétalo en su expediente antes de reservar.';
      end if;
    else
      new.tamano_id := null;
    end if;

    if v_depende_pelaje then
      select pelaje_id into new.pelaje_id from public.perros where id = new.perro_id;
      if new.pelaje_id is null then
        raise exception 'Este perro no tiene pelaje registrado. Complétalo en su expediente antes de reservar.';
      end if;
    else
      new.pelaje_id := null;
    end if;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(
      new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local,
      case when v_depende_grupo then v_grupo.grupo_raza_id else null end
    );

    if v_estado_precio = 'sin_tarifa' then
      raise exception 'No hay tarifa capturada para este servicio en esta fecha. Captúrala antes de reservar.';
    elsif v_estado_precio = 'no_aplica' then
      raise exception 'Este servicio no aplica para este perro.';
    end if;

    new.precio := v_precio;
  end if;

  if v_fechas_cambiaron and v_activa then
    if new.bloqueo_sanitario_superado and not public.is_admin() then
      raise exception 'Solo un admin puede autorizar una excepción al bloqueo sanitario.';
    end if;

    if new.bloqueo_sanitario_superado then
      new.autorizado_por := auth.uid();
    else
      if exists (
        select 1 from public.perro_requisitos_sanitarios_estado e
        where e.perro_id = new.perro_id
          and e.es_critica
          and e.estado in ('vencida', 'sin_registro')
      ) then
        raise exception 'Este perro tiene requisitos sanitarios críticos vencidos o sin registro.';
      end if;
    end if;
  end if;

  select hora_cierre into v_hora_cierre
  from public.resolver_cupo_configuracion(v_fecha_local);

  new.fuera_de_horario := v_hora_cierre is not null
    and public.hora_negocio(new.fin) > v_hora_cierre;

  return new;
end;
$$;
