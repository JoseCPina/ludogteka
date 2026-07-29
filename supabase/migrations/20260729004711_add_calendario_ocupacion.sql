-- Dos preguntas distintas, dos objetos distintos — confundirlas se ve
-- como cupo fantasma:
--
--   - "¿Quién ocupa esta fecha?" (calendario_ocupacion): cuenta estancias
--     RESERVADAS (no canceladas/no-llegó) cuyo rango cubre esa fecha, sin
--     importar si ya hizo check-in. Responde "¿cabe una reserva nueva el
--     15 de agosto?".
--   - "¿Quién está adentro ahora?" (quienes_estan_adentro): perros con
--     check-in real y sin check-out (estado = 'en_curso'), sin fecha de
--     por medio — es una pregunta de "ahora mismo", no de calendario.
--
-- Diurno y nocturno se reportan por separado, no como un solo número: un
-- día puede tener lugar de día y estar lleno de noche (o viceversa,
-- aunque menos común) — sobre todo en temporada alta, que es justo
-- cuando más importa no mentir. cupo_* sale null (no 0) cuando la fecha
-- no tiene configuración capturada — null se propaga a disponible_*
-- también, para que la pantalla lo distinga de "cupo cero real".
create or replace function public.calendario_ocupacion(p_desde date, p_hasta date)
returns table (
  fecha date,
  cupo_diurno int,
  ocupado_diurno int,
  disponible_diurno int,
  cupo_nocturno int,
  ocupado_nocturno int,
  disponible_nocturno int,
  cupo_estado text
)
language sql
stable
set search_path = ''
as $$
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  )
  select
    dias.fecha,
    cc.cupo_diurno,
    coalesce(od.ocupado, 0)::int as ocupado_diurno,
    cc.cupo_diurno - coalesce(od.ocupado, 0)::int as disponible_diurno,
    cc.cupo_nocturno,
    coalesce(on_.ocupado, 0)::int as ocupado_nocturno,
    cc.cupo_nocturno - coalesce(on_.ocupado, 0)::int as disponible_nocturno,
    cc.estado as cupo_estado
  from dias
  cross join lateral public.resolver_cupo_configuracion(dias.fecha) as cc
  left join lateral (
    select count(*) as ocupado
    from public.estancias e
    where e.deleted_at is null
      and e.estado not in ('cancelada', 'no_llego')
      and daterange(e.fecha_entrada, e.fecha_salida) @> dias.fecha
  ) od on true
  left join lateral (
    select count(*) as ocupado
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    where e.deleted_at is null
      and e.estado not in ('cancelada', 'no_llego')
      and s.categoria = 'hotel'
      and daterange(e.fecha_entrada, e.fecha_salida) @> dias.fecha
  ) on_ on true
  order by dias.fecha;
$$;

grant execute on function public.calendario_ocupacion(date, date) to authenticated;

create view public.quienes_estan_adentro
with (security_invoker = true)
as
select
  e.id as estancia_id,
  e.perro_id,
  p.nombre as perro_nombre,
  e.servicio_id,
  s.categoria,
  s.nombre as servicio_nombre,
  e.hora_entrada_real,
  e.fecha_salida
from public.estancias e
join public.perros p on p.id = e.perro_id
join public.servicios s on s.id = e.servicio_id
where e.deleted_at is null
  and e.estado = 'en_curso';
