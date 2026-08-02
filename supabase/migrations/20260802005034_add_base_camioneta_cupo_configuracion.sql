-- Dirección de la base donde se guarda la camioneta (Fase 10, cotizador
-- de recolección), junto a cupo/hora_cierre a propósito — el negocio la
-- pidió ahí, y es la misma idea que hora_cierre: configuración operativa
-- que no debería vivir hardcodeada en el código. No es el domicilio de
-- Ludogteka (son lugares distintos) — esa dirección va en sucursales,
-- migración siguiente.
--
-- Nullable: una fila de cupo_configuracion ya existente (o una nueva que
-- alguien capture sin saber de este cotizador) sigue siendo válida sin
-- base configurada — el cálculo de distancia simplemente falla con un
-- mensaje explícito pidiendo capturarla primero, nunca infiere ni asume.
alter table public.cupo_configuracion
  add column base_direccion text,
  add column base_lat double precision,
  add column base_lng double precision;

-- resolver_cupo_configuracion cambia de forma (columnas nuevas en el
-- return), así que hay que drop + create — CREATE OR REPLACE no permite
-- cambiar la lista de columnas de salida de una función existente.
drop function public.resolver_cupo_configuracion(date);

create or replace function public.resolver_cupo_configuracion(
  p_fecha date default current_date
)
returns table (
  cupo_diurno int,
  cupo_nocturno int,
  hora_cierre time,
  vigencia_desde date,
  estado text,
  base_direccion text,
  base_lat double precision,
  base_lng double precision
)
language sql
stable
set search_path = ''
as $$
  select
    c.cupo_diurno,
    c.cupo_nocturno,
    c.hora_cierre,
    c.vigencia_desde,
    case when c.id is null then 'sin_configurar' else 'configurado' end as estado,
    c.base_direccion,
    c.base_lat,
    c.base_lng
  from (select 1) as _dummy
  left join lateral (
    select cc.id, cc.cupo_diurno, cc.cupo_nocturno, cc.hora_cierre, cc.vigencia_desde,
      cc.base_direccion, cc.base_lat, cc.base_lng
    from public.cupo_configuracion cc
    where cc.vigencia_desde <= p_fecha
      and cc.deleted_at is null
    order by cc.vigencia_desde desc
    limit 1
  ) c on true;
$$;

grant execute on function public.resolver_cupo_configuracion(date) to authenticated;
