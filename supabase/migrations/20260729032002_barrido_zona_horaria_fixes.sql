-- Barrido sistemático de zona horaria (Fase 4): current_date/now() sin
-- convertir usan la zona de la SESIÓN (confirmado: UTC), no la de San
-- Luis Potosí. Van tres bugs de esta clase encontrados por casualidad;
-- este barrido corrige los que quedaban sin revisar, todos con la MISMA
-- causa raíz — nunca reconstruidos a mano, siempre vía fecha_negocio().

-- 1. perro_requisitos_sanitarios_estado (Fase 2): vencida/por_vencer
-- podía adelantarse hasta ~6 horas en la tarde/noche de SLP.
create or replace view public.perro_requisitos_sanitarios_estado
with (security_invoker = true)
as
select
  p.id as perro_id,
  p.nombre as perro_nombre,
  t.id as tipo_requisito_id,
  t.categoria,
  t.clave,
  t.etiqueta,
  t.es_critica,
  ult.fecha_aplicacion as ultima_fecha_aplicacion,
  ult.fecha_vencimiento,
  case
    when ult.fecha_vencimiento is null then 'sin_registro'
    when ult.fecha_vencimiento < public.fecha_negocio() then 'vencida'
    when ult.fecha_vencimiento < public.fecha_negocio() + (t.dias_aviso_vencimiento * interval '1 day') then 'por_vencer'
    else 'vigente'
  end as estado
from public.perros p
cross join public.tipos_requisito_sanitario t
left join lateral (
  select r.fecha_aplicacion, r.fecha_vencimiento
  from public.requisitos_sanitarios_aplicados r
  where r.perro_id = p.id
    and r.tipo_requisito_id = t.id
    and r.deleted_at is null
  order by r.fecha_aplicacion desc
  limit 1
) ult on true
where p.deleted_at is null
  and p.fallecido = false
  and t.obligatoria = true
  and t.deleted_at is null;

-- 2. tarifas_vigentes (Fase 3): "vigente hoy" comparaba contra el día
-- UTC, no el de SLP.
create or replace view public.tarifas_vigentes
with (security_invoker = true)
as
select distinct on (t.servicio_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta)
  t.servicio_id,
  s.nombre as servicio_nombre,
  s.categoria,
  s.unidad,
  t.tamano_id,
  t.pelaje_id,
  t.cantidad_desde,
  t.cantidad_hasta,
  t.precio,
  t.no_aplica,
  t.vigencia_desde
from public.tarifas t
join public.servicios s on s.id = t.servicio_id
where t.vigencia_desde <= public.fecha_negocio()
  and t.deleted_at is null
  and s.deleted_at is null
order by
  t.servicio_id, t.tamano_id, t.pelaje_id, t.cantidad_desde, t.cantidad_hasta,
  t.vigencia_desde desc;

-- 3 y 4. resolver_precio() / resolver_cupo_configuracion(): el default de
-- p_fecha era current_date. Ningún llamador actual depende de este
-- default (todos mandan la fecha explícita), pero es una trampa latente
-- para el día en que alguien los llame sin pensarlo — se corrige el
-- default aunque hoy no muerda a nadie.
create or replace function public.resolver_precio(
  p_servicio_id uuid,
  p_tamano_id uuid,
  p_pelaje_id uuid,
  p_cantidad int,
  p_fecha date default public.fecha_negocio()
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

create or replace function public.resolver_cupo_configuracion(
  p_fecha date default public.fecha_negocio()
)
returns table (cupo_diurno int, cupo_nocturno int, hora_cierre time, vigencia_desde date, estado text)
language sql
stable
set search_path = ''
as $$
  select
    c.cupo_diurno,
    c.cupo_nocturno,
    c.hora_cierre,
    c.vigencia_desde,
    case when c.id is null then 'sin_configurar' else 'configurado' end as estado
  from (select 1) as _dummy
  left join lateral (
    select cc.id, cc.cupo_diurno, cc.cupo_nocturno, cc.hora_cierre, cc.vigencia_desde
    from public.cupo_configuracion cc
    where cc.vigencia_desde <= p_fecha
      and cc.deleted_at is null
    order by cc.vigencia_desde desc
    limit 1
  ) c on true;
$$;

-- 5. generar_estancias_serie(): el horizonte de 8 semanas se contaba
-- desde el día UTC, no el de SLP — podía generar o saltarse un día en el
-- límite.
create or replace function public.generar_estancias_serie(
  p_serie_id uuid,
  p_horizonte_semanas int default 8
)
returns table (fecha date, exito boolean, motivo text)
language plpgsql
set search_path = ''
as $$
declare
  v_serie public.series_recurrentes%rowtype;
  v_cliente_id uuid;
  v_fecha_limite date;
  v_fecha date;
  v_reserva_id uuid;
begin
  select * into v_serie from public.series_recurrentes
  where id = p_serie_id and deleted_at is null;

  if not found then
    raise exception 'Serie recurrente no encontrada.';
  end if;

  select cliente_id into v_cliente_id from public.perros where id = v_serie.perro_id;

  v_fecha_limite := public.fecha_negocio() + (p_horizonte_semanas * 7);
  if v_serie.fecha_fin is not null and v_serie.fecha_fin < v_fecha_limite then
    v_fecha_limite := v_serie.fecha_fin;
  end if;

  for v_fecha in
    select d::date
    from generate_series(
      greatest(v_serie.fecha_inicio, public.fecha_negocio()),
      v_fecha_limite,
      interval '1 day'
    ) d
    where extract(isodow from d)::int = any(v_serie.dias_semana)
  loop
    begin
      insert into public.reservas (cliente_id, notas)
      values (v_cliente_id, 'Generada por serie recurrente')
      returning id into v_reserva_id;

      insert into public.estancias (reserva_id, perro_id, servicio_id, fecha_entrada, fecha_salida, serie_id)
      values (v_reserva_id, v_serie.perro_id, v_serie.servicio_id, v_fecha, v_fecha + 1, p_serie_id);

      fecha := v_fecha;
      exito := true;
      motivo := null;
      return next;
    exception when others then
      fecha := v_fecha;
      exito := false;
      motivo := sqlerrm;
      return next;
    end;
  end loop;

  return;
end;
$$;

-- 6. pesos_registrados.fecha: el default de la columna (usado solo si
-- alguien inserta sin mandar fecha, p. ej. desde el SQL editor) era
-- current_date.
alter table public.pesos_registrados
  alter column fecha set default public.fecha_negocio();
