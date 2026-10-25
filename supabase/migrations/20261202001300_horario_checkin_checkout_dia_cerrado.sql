-- Fuera del horario del negocio (QA N125, 25 de octubre de 2026). El hotel dejaba hacer check-in en domingo, con el
-- negocio cerrado y la configuración diciendo que ese día no recibe ni entrega perros. No se bloquea (el perro puede
-- estar en la puerta), pero se pide confirmar y queda anotado, igual que la casa llena (20261202000600):
--   * Check-in y check-out de hotel y guardería, hechos por una persona (con sesión), en un día que el negocio no abre
--     o a una hora fuera de su horario de ese día: no se guardan y lanzan «El negocio está cerrado hoy; ¿registrar de
--     todos modos?» (o «… cerrado a esta hora (hoy abre de 09:00 a 19:00); …») con hint `fuera_horario`.
--     Confirmado (`checkin_fuera_horario` / `checkout_fuera_horario` = 'confirmado' en el mismo UPDATE), se guarda y la
--     columna queda con lo que pasó («domingo 26/10/2026, el negocio no abre ese día»). registro_ediciones (la bitácora)
--     anota quién y cuándo. Las columnas solo las escribe este trigger.
--   * Una reserva nueva (o un cambio de fechas) con entrada en día cerrado —o salida, en hotel— sigue rechazándose con
--     el mismo texto, ahora con hint `dia_cerrado`; con `dia_cerrado_confirmado = 'confirmado'` se guarda y la columna
--     queda con lo que se confirmó. Quién: created_by (alta) o la bitácora (cambio de fechas).
--   * Sin horario capturado (resolver_cupo_configuracion sin configurar) no se pregunta nada en check-in/out. El cron
--     del demo (sin sesión) y las horas de otro día (historia) no pasan por la pregunta.

alter table public.estancias
  add column if not exists checkin_fuera_horario text,
  add column if not exists checkout_fuera_horario text,
  add column if not exists dia_cerrado_confirmado text;

-- null si el instante cae en el horario de su día (o el negocio no tiene horario); si no, qué pasa.
create or replace function public.fuera_de_horario(p_momento timestamptz)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_momento at time zone public.zona_negocio();
  v_fecha date := v_local::date;
  v_hora time := v_local::time;
  v_ap time;
  v_ci time;
  v_estado text;
  v_nombres text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
begin
  select c.estado, c.hora_apertura, c.hora_cierre into v_estado, v_ap, v_ci from public.resolver_cupo_configuracion(v_fecha) c;
  if v_estado is distinct from 'configurado' then
    return null;
  end if;
  if v_ap is null or v_ci is null then
    return format('%s %s, el negocio no abre ese día', v_nombres[extract(isodow from v_fecha)::int], to_char(v_fecha, 'DD/MM/YYYY'));
  end if;
  if v_hora < v_ap or v_hora >= v_ci then
    return format('%s %s a las %s, fuera del horario de %s a %s', v_nombres[extract(isodow from v_fecha)::int], to_char(v_fecha, 'DD/MM/YYYY'),
                  to_char(v_hora, 'HH24:MI'), to_char(v_ap, 'HH24:MI'), to_char(v_ci, 'HH24:MI'));
  end if;
  return null;
end;
$$;
revoke execute on function public.fuera_de_horario(timestamptz) from public, anon;
grant execute on function public.fuera_de_horario(timestamptz) to authenticated, service_role;

-- La pregunta que ve quien registra (el texto de la base llega tal cual a la pantalla).
create or replace function public.pregunta_fuera_de_horario(p_momento timestamptz)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_local timestamp := p_momento at time zone public.zona_negocio();
  v_ap time;
  v_ci time;
begin
  select c.hora_apertura, c.hora_cierre into v_ap, v_ci from public.resolver_cupo_configuracion(v_local::date) c;
  if v_ap is null or v_ci is null then
    return 'El negocio está cerrado hoy; ¿registrar de todos modos?';
  end if;
  return format('El negocio está cerrado a esta hora (hoy abre de %s a %s); ¿registrar de todos modos?', to_char(v_ap, 'HH24:MI'), to_char(v_ci, 'HH24:MI'));
end;
$$;
revoke execute on function public.pregunta_fuera_de_horario(timestamptz) from public, anon;
grant execute on function public.pregunta_fuera_de_horario(timestamptz) to authenticated, service_role;

create or replace function public.estancias_horario_checkin_checkout()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_entra boolean := new.estado = 'en_curso' and old.estado is distinct from 'en_curso';
  v_sale boolean := new.estado = 'finalizada' and old.estado = 'en_curso';
  v_momento timestamptz;
  v_fuera text;
begin
  -- Las columnas solo cambian en su transición.
  if not v_entra then new.checkin_fuera_horario := old.checkin_fuera_horario; end if;
  if not v_sale then new.checkout_fuera_horario := old.checkout_fuera_horario; end if;
  if not (v_entra or v_sale) then
    return new;
  end if;

  v_momento := coalesce(case when v_entra then new.hora_entrada_real else new.hora_salida_real end, now());
  -- Sin sesión (el cron del demo) o con la hora de otro día (historia): no se pregunta.
  if auth.uid() is null or (v_momento at time zone public.zona_negocio())::date <> public.fecha_negocio() then
    if v_entra then new.checkin_fuera_horario := null; else new.checkout_fuera_horario := null; end if;
    return new;
  end if;

  v_fuera := public.fuera_de_horario(v_momento);
  if v_fuera is null then
    if v_entra then new.checkin_fuera_horario := null; else new.checkout_fuera_horario := null; end if;
    return new;
  end if;
  if (case when v_entra then new.checkin_fuera_horario else new.checkout_fuera_horario end) is distinct from 'confirmado' then
    raise exception '%', public.pregunta_fuera_de_horario(v_momento) using hint = 'fuera_horario';
  end if;
  if v_entra then new.checkin_fuera_horario := v_fuera; else new.checkout_fuera_horario := v_fuera; end if;
  return new;
end;
$$;
revoke execute on function public.estancias_horario_checkin_checkout() from public, anon;
grant execute on function public.estancias_horario_checkin_checkout() to authenticated, service_role;

drop trigger if exists estancias_horario_checkin_checkout on public.estancias;
create trigger estancias_horario_checkin_checkout
  before update on public.estancias
  for each row execute function public.estancias_horario_checkin_checkout();

-- validar_estancia_dia_abierto: cuerpo de 20260923165922; el día cerrado se puede confirmar.
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
  v_cerrados text[] := array[]::text[];
  v_txt text;
begin
  if new.deleted_at is not null or new.estado in ('cancelada', 'no_llego') then
    if TG_OP = 'UPDATE' then new.dia_cerrado_confirmado := old.dia_cerrado_confirmado; else new.dia_cerrado_confirmado := null; end if;
    return new;
  end if;

  if TG_OP = 'UPDATE'
    and new.servicio_id is not distinct from old.servicio_id
    and new.fecha_entrada is not distinct from old.fecha_entrada
    and new.fecha_salida is not distinct from old.fecha_salida
    and old.estado not in ('cancelada', 'no_llego')
  then
    new.dia_cerrado_confirmado := old.dia_cerrado_confirmado;
    return new;
  end if;

  select categoria into v_categoria from public.servicios where id = new.servicio_id;

  if v_categoria = 'guarderia' then
    for v_dia in select generate_series(new.fecha_entrada, new.fecha_salida - 1, interval '1 day')::date loop
      if not public.negocio_abre(v_dia) then
        v_txt := coalesce(v_txt, format('Guardería no abre en %s (%s). Elige un día con horario de atención.',
          v_nombres[extract(isodow from v_dia)::int], to_char(v_dia, 'DD/MM/YYYY')));
        v_cerrados := v_cerrados || format('guardería el %s %s', v_nombres[extract(isodow from v_dia)::int], to_char(v_dia, 'DD/MM/YYYY'));
      end if;
    end loop;
  elsif v_categoria = 'hotel' then
    -- Solo el día de llegada y el de entrega: las noches de en medio no se revisan.
    if not public.negocio_abre(new.fecha_entrada) then
      v_txt := format('El hotel no recibe perros en %s (%s). Cambia la llegada a un día con horario de atención.',
        v_nombres[extract(isodow from new.fecha_entrada)::int], to_char(new.fecha_entrada, 'DD/MM/YYYY'));
      v_cerrados := v_cerrados || format('entrada el %s %s', v_nombres[extract(isodow from new.fecha_entrada)::int], to_char(new.fecha_entrada, 'DD/MM/YYYY'));
    end if;
    if not public.negocio_abre(new.fecha_salida) then
      v_txt := coalesce(v_txt, format('El hotel no entrega perros en %s (%s). Cambia la salida a un día con horario de atención.',
        v_nombres[extract(isodow from new.fecha_salida)::int], to_char(new.fecha_salida, 'DD/MM/YYYY')));
      v_cerrados := v_cerrados || format('salida el %s %s', v_nombres[extract(isodow from new.fecha_salida)::int], to_char(new.fecha_salida, 'DD/MM/YYYY'));
    end if;
  end if;

  if v_txt is null then
    new.dia_cerrado_confirmado := null;
    return new;
  end if;
  -- Solo la persona que reserva confirma (el cron y las series no traen la confirmación y siguen rechazándose).
  if new.dia_cerrado_confirmado is distinct from 'confirmado' then
    raise exception '%', v_txt using hint = 'dia_cerrado';
  end if;
  new.dia_cerrado_confirmado := 'Con el negocio cerrado: ' || array_to_string(v_cerrados, ', ');
  return new;
end;
$$;
