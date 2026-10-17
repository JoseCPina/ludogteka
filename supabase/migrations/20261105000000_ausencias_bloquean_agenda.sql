-- Una ausencia aprobada (vacaciones, incapacidad, día personal, falta
-- justificada) bloquea la agenda de estética de esa persona:
--   · no se le puede asignar ni mover una cita en esos días (o en esas horas,
--     si la ausencia es de medio día);
--   · al aprobar se puede ver qué citas ya tenía, y mientras sigan sin
--     reasignarse se marcan en la agenda y en el tablero;
--   · cancelar la ausencia libera la agenda (la regla lee el estado vivo).
-- Asistencia y nómina no cambian.

-- ── 1. Ausencias de medio día: horas opcionales (solo un día) ───────────────
alter table public.ausencias
  add column hora_desde time,
  add column hora_hasta time;
alter table public.ausencias
  add constraint ausencias_horas_check check (
    (hora_desde is null and hora_hasta is null)
    or (hora_desde is not null and hora_hasta is not null and hora_hasta > hora_desde and desde = hasta)
  );

-- ── 2. ¿Esta ausencia cubre este tramo de tiempo? ──────────────────────────
create or replace function public.ausencia_cubre(
  p_desde date, p_hasta date, p_hora_desde time, p_hora_hasta time, p_inicio timestamptz, p_fin timestamptz
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_hora_desde is null then
      daterange(p_desde, p_hasta, '[]') && daterange(
        (p_inicio at time zone public.zona_negocio())::date,
        ((p_fin - interval '1 second') at time zone public.zona_negocio())::date, '[]')
    else
      tstzrange(((p_desde + p_hora_desde) at time zone public.zona_negocio()),
                ((p_desde + p_hora_hasta) at time zone public.zona_negocio()), '[)')
      && tstzrange(p_inicio, p_fin, '[)')
  end;
$$;
alter function public.ausencia_cubre(date, date, time, time, timestamptz, timestamptz) owner to peludesk_definer;
revoke execute on function public.ausencia_cubre(date, date, time, time, timestamptz, timestamptz) from public, anon;
grant execute on function public.ausencia_cubre(date, date, time, time, timestamptz, timestamptz) to authenticated, service_role;

-- ── 3. La ausencia aprobada que choca con una cita (interna) ───────────────
create or replace function public.ausencia_que_choca(p_profile uuid, p_inicio timestamptz, p_fin timestamptz)
returns table (ausencia_id uuid, tipo text, desde date, hasta date, hora_desde time, hora_hasta time, nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.tipo, a.desde, a.hasta, a.hora_desde, a.hora_hasta, e.nombre
  from public.ausencias a
  join public.empleados e on e.id = a.empleado_id and e.deleted_at is null
  where e.profile_id = p_profile
    and e.negocio_id = public.negocio_actual()
    and a.negocio_id = e.negocio_id
    and a.deleted_at is null
    and a.estado = 'aprobada'
    and public.ausencia_cubre(a.desde, a.hasta, a.hora_desde, a.hora_hasta, p_inicio, p_fin)
  order by a.desde
  limit 1;
$$;
alter function public.ausencia_que_choca(uuid, timestamptz, timestamptz) owner to peludesk_definer;
revoke execute on function public.ausencia_que_choca(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ausencia_que_choca(uuid, timestamptz, timestamptz) to service_role, peludesk_definer;

create or replace function public.ausencia_texto(
  p_nombre text, p_tipo text, p_desde date, p_hasta date, p_hora_desde time, p_hora_hasta time
) returns text
language sql
immutable
set search_path = ''
as $$
  select p_nombre || ' tiene ' ||
    case p_tipo when 'vacaciones' then 'vacaciones' when 'incapacidad' then 'una incapacidad'
                when 'dia_personal' then 'un día personal' else 'una falta justificada' end ||
    ' aprobada' ||
    case
      when p_hora_desde is not null then ' el ' || to_char(p_desde, 'DD/MM/YYYY') || ' de ' || to_char(p_hora_desde, 'HH24:MI') || ' a ' || to_char(p_hora_hasta, 'HH24:MI')
      when p_desde = p_hasta then ' el ' || to_char(p_desde, 'DD/MM/YYYY')
      else ' del ' || to_char(p_desde, 'DD/MM/YYYY') || ' al ' || to_char(p_hasta, 'DD/MM/YYYY')
    end;
$$;

-- ── 4. La regla en la cita (agendar, mover, cambiar de estilista) ──────────
do $$
declare
  v_def text;
  v_ancla text := E'  v_fecha_local := public.fecha_negocio(new.inicio);\n';
  v_bloque text := E'  v_fecha_local := public.fecha_negocio(new.inicio);\n\n'
    || E'  -- Una persona con ausencia aprobada no recibe citas en esos días u horas.\n'
    || E'  -- Solo se revisa cuando cambia quién, cuándo o cuánto dura; cerrar, cobrar o\n'
    || E'  -- cancelar una cita que ya existía no depende de esto.\n'
    || E'  if new.empleado_id is not null and new.estado in (''reservada'', ''confirmada'', ''en_curso'')\n'
    || E'     and (TG_OP = ''INSERT'' or new.empleado_id is distinct from old.empleado_id\n'
    || E'          or new.inicio is distinct from old.inicio or new.fin is distinct from old.fin) then\n'
    || E'    declare\n'
    || E'      v_aus record;\n'
    || E'    begin\n'
    || E'      select * into v_aus from public.ausencia_que_choca(new.empleado_id, new.inicio, new.fin);\n'
    || E'      if found then\n'
    || E'        raise exception ''%. Escoge a otra persona u otro horario.'',\n'
    || E'          public.ausencia_texto(v_aus.nombre, v_aus.tipo, v_aus.desde, v_aus.hasta, v_aus.hora_desde, v_aus.hora_hasta)\n'
    || E'          using errcode = ''23P01'';\n'
    || E'      end if;\n'
    || E'    end;\n'
    || E'  end if;\n';
begin
  select pg_get_functiondef('public.validar_cita_estetica()'::regprocedure) into v_def;
  if position(v_ancla in v_def) = 0 then raise exception 'ancla de validar_cita_estetica no encontrada'; end if;
  v_def := replace(v_def, v_ancla, v_bloque);
  execute v_def;
end $$;

do $$
declare
  v_def text;
  v_ancla text := E'  perform set_config(''app.reasignacion_estilista'', ''on'', true);\n';
  v_bloque text := E'  -- Tampoco se le pasa una cita a quien tiene una ausencia aprobada que la cubre.\n'
    || E'  -- (Corregir quién atendió un servicio ya terminado sí se permite.)\n'
    || E'  if p_empleado_id is not null and v_cita.estado in (''reservada'', ''confirmada'', ''en_curso'') then\n'
    || E'    declare\n'
    || E'      v_aus record;\n'
    || E'    begin\n'
    || E'      select * into v_aus from public.ausencia_que_choca(p_empleado_id, v_cita.inicio, v_cita.fin);\n'
    || E'      if found then\n'
    || E'        raise exception ''%. Escoge a otra persona.'',\n'
    || E'          public.ausencia_texto(v_aus.nombre, v_aus.tipo, v_aus.desde, v_aus.hasta, v_aus.hora_desde, v_aus.hora_hasta);\n'
    || E'      end if;\n'
    || E'    end;\n'
    || E'  end if;\n\n' || E'  perform set_config(''app.reasignacion_estilista'', ''on'', true);\n';
begin
  select pg_get_functiondef('public.reasignar_estilista_cita(uuid, uuid, text)'::regprocedure) into v_def;
  if position(v_ancla in v_def) = 0 then raise exception 'ancla de reasignar_estilista_cita no encontrada'; end if;
  v_def := replace(v_def, v_ancla, v_bloque);
  execute v_def;
end $$;

-- ── 5. Quién está ausente en un tramo (para no ofrecerlo al agendar) ───────
create or replace function public.estilistas_ausentes(p_inicio timestamptz, p_fin timestamptz)
returns table (profile_id uuid, tipo text, desde date, hasta date, hora_desde time, hora_hasta time)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct on (e.profile_id) e.profile_id, a.tipo, a.desde, a.hasta, a.hora_desde, a.hora_hasta
  from public.ausencias a
  join public.empleados e on e.id = a.empleado_id and e.deleted_at is null
  where coalesce(public.is_staff(), false)
    and e.profile_id is not null
    and e.negocio_id = public.negocio_actual()
    and a.negocio_id = e.negocio_id
    and a.deleted_at is null
    and a.estado = 'aprobada'
    and p_fin > p_inicio
    and public.ausencia_cubre(a.desde, a.hasta, a.hora_desde, a.hora_hasta, p_inicio, p_fin)
  order by e.profile_id, a.desde;
$$;
alter function public.estilistas_ausentes(timestamptz, timestamptz) owner to peludesk_definer;
revoke execute on function public.estilistas_ausentes(timestamptz, timestamptz) from public, anon;
grant execute on function public.estilistas_ausentes(timestamptz, timestamptz) to authenticated, service_role;

-- ── 6. Citas que una ausencia deja sin atender ─────────────────────────────
-- De UNA ausencia (la lista que se enseña al aprobarla). Solo admin y recepción
-- (son quienes reasignan).
create or replace function public.citas_afectadas_por_ausencia(p_ausencia_id uuid)
returns table (cita_id uuid, inicio timestamptz, fin timestamptz, estado text, perro text, servicio text, empleado_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.inicio, c.fin, c.estado, p.nombre,
         coalesce(c.servicio_nombre, s.nombre, '—'), c.empleado_id
  from public.ausencias a
  join public.empleados e on e.id = a.empleado_id and e.deleted_at is null
  join public.citas_estetica c on c.empleado_id = e.profile_id and c.deleted_at is null
  join public.perros p on p.id = c.perro_id
  left join public.servicios s on s.id = c.servicio_id
  where public.current_rol() in ('admin', 'recepcion')
    and a.id = p_ausencia_id
    and a.negocio_id = public.negocio_actual()
    and a.deleted_at is null
    and a.estado in ('solicitada', 'aprobada')
    and c.negocio_id = a.negocio_id
    and c.estado in ('reservada', 'confirmada', 'en_curso')
    and public.fecha_negocio(c.inicio) >= public.fecha_negocio()
    and public.ausencia_cubre(a.desde, a.hasta, a.hora_desde, a.hora_hasta, c.inicio, c.fin)
  order by c.inicio, c.id;
$$;
alter function public.citas_afectadas_por_ausencia(uuid) owner to peludesk_definer;
revoke execute on function public.citas_afectadas_por_ausencia(uuid) from public, anon;
grant execute on function public.citas_afectadas_por_ausencia(uuid) to authenticated, service_role;

-- De TODAS las ausencias aprobadas: lo que se marca en la agenda y en el tablero.
create or replace function public.citas_en_ausencia()
returns table (
  cita_id uuid, inicio timestamptz, fin timestamptz, estado text, perro text, servicio text,
  empleado_id uuid, empleado_nombre text, ausencia_id uuid, ausencia_tipo text,
  desde date, hasta date, hora_desde time, hora_hasta time
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.inicio, c.fin, c.estado, p.nombre, coalesce(c.servicio_nombre, s.nombre, '—'),
         c.empleado_id, e.nombre, a.id, a.tipo, a.desde, a.hasta, a.hora_desde, a.hora_hasta
  from public.ausencias a
  join public.empleados e on e.id = a.empleado_id and e.deleted_at is null and e.profile_id is not null
  join public.citas_estetica c on c.empleado_id = e.profile_id and c.deleted_at is null
  join public.perros p on p.id = c.perro_id
  left join public.servicios s on s.id = c.servicio_id
  where coalesce(public.is_staff(), false)
    and a.negocio_id = public.negocio_actual()
    and a.deleted_at is null
    and a.estado = 'aprobada'
    and c.negocio_id = a.negocio_id
    and c.estado in ('reservada', 'confirmada', 'en_curso')
    and public.fecha_negocio(c.inicio) >= public.fecha_negocio()
    and public.ausencia_cubre(a.desde, a.hasta, a.hora_desde, a.hora_hasta, c.inicio, c.fin)
  order by c.inicio, c.id;
$$;
alter function public.citas_en_ausencia() owner to peludesk_definer;
revoke execute on function public.citas_en_ausencia() from public, anon;
grant execute on function public.citas_en_ausencia() to authenticated, service_role;

-- ── 7. Pedir una ausencia (con horas opcionales para medio día) ────────────
drop function public.solicitar_ausencia(uuid, text, date, date, text);
create or replace function public.solicitar_ausencia(
  p_empleado_id uuid,
  p_tipo text,
  p_desde date,
  p_hasta date,
  p_motivo text,
  p_hora_desde time default null,
  p_hora_hasta time default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empleado uuid := coalesce(p_empleado_id, public.mi_empleado_id());
  v_profile uuid;
  v_dias numeric;
  v_id uuid;
  v_hasta date := coalesce(p_hasta, p_desde);
  v_parcial boolean := p_hora_desde is not null or p_hora_hasta is not null;
begin
  if v_empleado is null then
    raise exception 'Tu cuenta no está ligada a ningún empleado. Pídele a un admin que la ligue.';
  end if;
  select profile_id into v_profile from public.empleados where id = v_empleado and deleted_at is null;
  if not found then
    raise exception 'Empleado no encontrado.';
  end if;
  if not (
    v_empleado = public.mi_empleado_id()
    or coalesce(public.is_admin(), false)
    or (public.current_rol() = 'recepcion' and v_profile is null)
  ) then
    raise exception 'Solo puedes pedir ausencias para ti. Recepción las pide por quien no tiene cuenta en la app.';
  end if;
  if p_tipo not in ('vacaciones', 'incapacidad', 'dia_personal', 'falta_justificada') then
    raise exception 'Tipo de ausencia no válido.';
  end if;
  if p_desde is null or v_hasta < p_desde then
    raise exception 'Revisa las fechas: el último día no puede ser antes del primero.';
  end if;
  if v_hasta - p_desde > 90 then
    raise exception 'Una ausencia no puede pasar de 90 días; si es más larga, pide varias.';
  end if;
  if v_parcial then
    if p_hora_desde is null or p_hora_hasta is null then
      raise exception 'Para una ausencia de medio día escribe la hora de inicio y la de fin.';
    end if;
    if v_hasta <> p_desde then
      raise exception 'Una ausencia por horas es de un solo día.';
    end if;
    if p_hora_hasta <= p_hora_desde then
      raise exception 'La hora de fin tiene que ser después de la de inicio.';
    end if;
  end if;
  if exists (
    select 1 from public.ausencias
    where empleado_id = v_empleado and deleted_at is null and estado in ('solicitada', 'aprobada')
      and daterange(desde, hasta, '[]') && daterange(p_desde, v_hasta, '[]')
      and (
        not v_parcial or hora_desde is null
        or (hora_desde < p_hora_hasta and p_hora_desde < hora_hasta)
      )
  ) then
    raise exception 'Ya hay una ausencia pedida o aprobada que cruza esas fechas.';
  end if;

  v_dias := public.dias_laborables_empleado(v_empleado, p_desde, v_hasta);
  if v_dias <= 0 then
    raise exception 'En esas fechas no le toca trabajar según su horario: no hay días que pedir.';
  end if;
  if v_parcial then
    v_dias := 0.5;
  end if;

  insert into public.ausencias (empleado_id, tipo, desde, hasta, dias, motivo, hora_desde, hora_hasta)
  values (v_empleado, p_tipo, p_desde, v_hasta, v_dias, nullif(btrim(coalesce(p_motivo, '')), ''), p_hora_desde, p_hora_hasta)
  returning id into v_id;
  return v_id;
end;
$$;
alter function public.solicitar_ausencia(uuid, text, date, date, text, time, time) owner to peludesk_definer;
revoke execute on function public.solicitar_ausencia(uuid, text, date, date, text, time, time) from public, anon;
grant execute on function public.solicitar_ausencia(uuid, text, date, date, text, time, time) to authenticated;
