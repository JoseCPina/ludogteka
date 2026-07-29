-- hora_negocio() pedía p_ts obligatorio; se le da default now() para
-- poder preguntar "¿qué hora es ahora mismo en San Luis Potosí?" sin
-- tener que mandar el timestamp a mano cada vez — justo lo que necesita
-- la sugerencia de recogida tardía de abajo.
create or replace function public.hora_negocio(p_ts timestamptz default now())
returns time
language sql
stable
set search_path = ''
as $$
  select (p_ts at time zone 'America/Mexico_City')::time;
$$;

-- Punto 1 y 3 del check-out (Fase 4): cuántos minutos de retraso lleva
-- una salida contra la hora de cierre configurada, calculado UNA sola
-- vez aquí y consumido por la pantalla — nunca reconstruido a mano
-- comparando horas, que es exactamente donde ya mordió la zona horaria
-- dos veces. Reutiliza fecha_negocio()/hora_negocio(), no zona horaria
-- nueva ni literal repetido.
--
-- Devuelve null (no 0) cuando no hay hora_cierre configurada para esa
-- fecha — "no lo sabemos" es distinto de "no hay retraso", mismo
-- principio que sin_tarifa/sin_configurar en el resto del esquema.
-- p_hora_real acepta un timestamp explícito (para recalcular sobre una
-- salida ya ocurrida) y por default usa el momento actual (para sugerir
-- en vivo durante el check-out, antes de confirmar la salida).
create or replace function public.minutos_retraso_cierre(
  p_fecha date,
  p_hora_real timestamptz default now()
)
returns int
language sql
stable
set search_path = ''
as $$
  select greatest(
    0,
    round(extract(epoch from (public.hora_negocio(p_hora_real) - cc.hora_cierre)) / 60)
  )::int
  from public.resolver_cupo_configuracion(p_fecha) cc
  where cc.estado = 'configurado';
$$;

grant execute on function public.minutos_retraso_cierre(date, timestamptz) to authenticated;
