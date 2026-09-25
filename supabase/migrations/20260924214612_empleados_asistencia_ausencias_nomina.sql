-- Empleados: asistencia, ausencias, nómina y su costo en la utilidad
-- (24 de septiembre de 2026).
--
-- EMPLEADO ≠ CUENTA. `empleados` es un registro propio (nombre, puesto,
-- ingreso, teléfono, contacto de emergencia) que se liga a una cuenta de
-- la app (`profile_id`) solo si la tiene: limpieza o el chofer trabajan
-- ahí sin usar la app.
--
-- Quién ve qué:
--   · Datos del empleado, horario, asistencia y ausencias: admin,
--     recepción (registra la asistencia de quien no tiene cuenta) y el
--     propio empleado (lo suyo).
--   · Dinero (esquema de pago, comisiones, adelantos, pagos): admin o
--     quien tenga el permiso NUEVO «nomina». «inventario_costos» no da
--     acceso a esto. El empleado ve SUS pagos y adelantos, nunca los de otro.
--
-- Lo que se escribe por RPC y no a mano (asistencia, correcciones,
-- ausencias, saldo de vacaciones, pagos): su política de INSERT/UPDATE es
-- `false` a propósito — la única puerta es la función, que valida y deja
-- rastro. Nunca se borra un pago: se corrige con un movimiento inverso.

-- ── 0. Permiso «nomina» ─────────────────────────────────────────────

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (permiso in (
  'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
  'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
  'plantillas_contrato', 'nomina'
));

create or replace function public.mis_permisos()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select unnest(array[
    'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
    'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
    'plantillas_contrato', 'nomina'
  ]) as permiso
  where coalesce(public.is_admin(), false)
  union
  select ps.permiso
  from public.permisos_staff ps
  join public.profiles pr on pr.id = ps.profile_id
  where ps.profile_id = auth.uid()
    and ps.revocado_at is null
    and ps.deleted_at is null
    and pr.rol = 'recepcion';
$$;

-- ── 1. Empleados ────────────────────────────────────────────────────

create table public.empleados (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (btrim(nombre) <> ''),
  puesto text not null check (btrim(puesto) <> ''),
  fecha_ingreso date not null,
  telefono text,
  emergencia_nombre text,
  emergencia_telefono text,
  emergencia_parentesco text,
  -- La cuenta de la app, si la tiene. Solo una cuenta del personal.
  profile_id uuid references public.profiles(id) on delete set null,
  fecha_baja date,
  motivo_baja text,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (fecha_baja is null or fecha_baja >= fecha_ingreso)
);
create trigger set_updated_at before insert or update on public.empleados
  for each row execute function public.set_updated_at();
create unique index empleados_profile_unico on public.empleados (profile_id)
  where profile_id is not null and deleted_at is null;

-- El empleado ligado a quien llama (NULL si no tiene).
create or replace function public.mi_empleado_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select id from public.empleados
  where profile_id = auth.uid() and deleted_at is null
  limit 1;
$$;
revoke execute on function public.mi_empleado_id() from public, anon;
grant execute on function public.mi_empleado_id() to authenticated;

-- ¿Puede quien llama ver la operación (no el dinero) de este empleado?
create or replace function public.puede_ver_empleado(p_empleado_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_rol() in ('admin', 'recepcion'), false)
    or coalesce(public.tiene_permiso('nomina'), false)
    or (p_empleado_id is not null and p_empleado_id = public.mi_empleado_id());
$$;
revoke execute on function public.puede_ver_empleado(uuid) from public, anon;
grant execute on function public.puede_ver_empleado(uuid) to authenticated;

-- Solo una cuenta del personal se liga a un empleado (nunca un cliente).
create or replace function public.validar_cuenta_de_empleado()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null and not exists (
    select 1 from public.profiles
    where id = new.profile_id and rol in ('admin', 'recepcion', 'estetica') and deleted_at is null
  ) then
    raise exception 'Solo se puede ligar una cuenta del personal (admin, recepción o estética).';
  end if;
  return new;
end;
$$;
create trigger validar_cuenta_de_empleado before insert or update of profile_id on public.empleados
  for each row execute function public.validar_cuenta_de_empleado();

alter table public.empleados enable row level security;
create policy empleados_select on public.empleados
  for select to authenticated
  using (public.puede_ver_empleado(id));
create policy empleados_insert_nomina on public.empleados
  for insert to authenticated
  with check (public.tiene_permiso('nomina'));
create policy empleados_update_nomina on public.empleados
  for update to authenticated
  using (public.tiene_permiso('nomina'))
  with check (public.tiene_permiso('nomina'));

-- Cuentas del personal que se pueden ligar (para el selector). No pide
-- el permiso «personal»: con «nomina» basta para dar de alta empleados.
create or replace function public.cuentas_para_empleado()
returns table (id uuid, nombre_completo text, rol text, email text, empleado_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», puede ligar cuentas a empleados.';
  end if;
  return query
  select p.id, p.nombre_completo, p.rol, u.email::text,
    (select e.id from public.empleados e where e.profile_id = p.id and e.deleted_at is null limit 1)
  from public.profiles p
  join auth.users u on u.id = p.id
  where p.rol in ('admin', 'recepcion', 'estetica') and p.deleted_at is null
  order by p.nombre_completo nulls last, u.email;
end;
$$;
revoke execute on function public.cuentas_para_empleado() from public, anon;
grant execute on function public.cuentas_para_empleado() to authenticated;

-- ── 2. Horario programado ───────────────────────────────────────────
-- Un renglón por día de la semana que trabaja (0 = domingo … 6 = sábado,
-- igual que horario_semana). Cambiarlo NO reescribe el pasado: el renglón
-- viejo se da de baja y el nuevo vale desde el día en que se capturó, así
-- los retardos y faltas de antes se siguen midiendo contra el horario que
-- tenía entonces.

create table public.empleados_horario (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_entrada time not null,
  hora_salida time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (hora_salida > hora_entrada)
);
create trigger set_updated_at before insert or update on public.empleados_horario
  for each row execute function public.set_updated_at();
create unique index empleados_horario_vigente on public.empleados_horario (empleado_id, dia_semana)
  where deleted_at is null;

alter table public.empleados_horario enable row level security;
create policy empleados_horario_select on public.empleados_horario
  for select to authenticated
  using (public.puede_ver_empleado(empleado_id));
-- Solo por guardar_horario_empleado.
create policy empleados_horario_escritura_por_rpc on public.empleados_horario
  for insert to authenticated
  with check (false);

create or replace function public.guardar_horario_empleado(p_empleado_id uuid, p_dias jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dia jsonb;
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», puede cambiar horarios.';
  end if;
  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado.';
  end if;

  update public.empleados_horario set deleted_at = now()
  where empleado_id = p_empleado_id and deleted_at is null;

  for v_dia in select * from jsonb_array_elements(coalesce(p_dias, '[]'::jsonb)) loop
    if nullif(v_dia ->> 'hora_entrada', '') is null then
      continue;
    end if;
    if (v_dia ->> 'hora_salida')::time <= (v_dia ->> 'hora_entrada')::time then
      raise exception 'La salida tiene que ser después de la entrada.';
    end if;
    insert into public.empleados_horario (empleado_id, dia_semana, hora_entrada, hora_salida)
    values (p_empleado_id, (v_dia ->> 'dia_semana')::int, (v_dia ->> 'hora_entrada')::time, (v_dia ->> 'hora_salida')::time);
  end loop;
end;
$$;
revoke execute on function public.guardar_horario_empleado(uuid, jsonb) from public, anon;
grant execute on function public.guardar_horario_empleado(uuid, jsonb) to authenticated;

-- ── 3. Asistencia ───────────────────────────────────────────────────
-- Un registro por empleado y día del negocio. Cada extremo dice quién lo
-- capturó y cómo (el propio empleado, recepción por él, o admin). Solo
-- admin corrige, con motivo, y el valor original queda en
-- asistencia_correcciones.

create table public.asistencias (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  fecha date not null,
  entrada_at timestamptz not null,
  salida_at timestamptz,
  entrada_capturada_por uuid references auth.users(id) on delete set null,
  entrada_origen text not null check (entrada_origen in ('propio', 'recepcion', 'admin')),
  salida_capturada_por uuid references auth.users(id) on delete set null,
  salida_origen text check (salida_origen in ('propio', 'recepcion', 'admin')),
  corregida boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (salida_at is null or salida_at > entrada_at)
);
create trigger set_updated_at before insert or update on public.asistencias
  for each row execute function public.set_updated_at();
create unique index asistencias_una_por_dia on public.asistencias (empleado_id, fecha)
  where deleted_at is null;

alter table public.asistencias enable row level security;
create policy asistencias_select on public.asistencias
  for select to authenticated
  using (public.puede_ver_empleado(empleado_id));
-- Solo por registrar_entrada / registrar_salida / corregir_asistencia.
create policy asistencias_escritura_por_rpc on public.asistencias
  for insert to authenticated
  with check (false);

create table public.asistencia_correcciones (
  id uuid primary key default gen_random_uuid(),
  asistencia_id uuid not null references public.asistencias(id),
  entrada_anterior timestamptz,
  salida_anterior timestamptz,
  entrada_nueva timestamptz,
  salida_nueva timestamptz,
  motivo text not null check (btrim(motivo) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.asistencia_correcciones
  for each row execute function public.set_updated_at();

alter table public.asistencia_correcciones enable row level security;
create policy asistencia_correcciones_select on public.asistencia_correcciones
  for select to authenticated
  using (exists (
    select 1 from public.asistencias a
    where a.id = asistencia_id and public.puede_ver_empleado(a.empleado_id)
  ));
create policy asistencia_correcciones_escritura_por_rpc on public.asistencia_correcciones
  for insert to authenticated
  with check (false);

-- Quién puede registrar entrada/salida de este empleado, y con qué origen.
-- El empleado con cuenta registra lo suyo; recepción registra por quien NO
-- tiene cuenta; admin, por cualquiera.
create or replace function public.origen_registro_asistencia(p_empleado_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_baja date;
begin
  select profile_id, fecha_baja into v_profile, v_baja
  from public.empleados where id = p_empleado_id and deleted_at is null;
  if not found then
    raise exception 'Empleado no encontrado.';
  end if;
  if v_baja is not null and v_baja < public.fecha_negocio() then
    raise exception 'Ese empleado está dado de baja.';
  end if;
  if v_profile is not null and v_profile = auth.uid() then
    return 'propio';
  end if;
  if coalesce(public.is_admin(), false) then
    return 'admin';
  end if;
  if public.current_rol() = 'recepcion' then
    if v_profile is not null then
      raise exception 'Esta persona tiene cuenta en la app: registra su entrada y salida desde su propia sesión. Si no puede, avísale a un admin.';
    end if;
    return 'recepcion';
  end if;
  raise exception 'No puedes registrar la asistencia de otra persona.';
end;
$$;
revoke execute on function public.origen_registro_asistencia(uuid) from public, anon, authenticated;

create or replace function public.registrar_entrada(p_empleado_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empleado uuid := coalesce(p_empleado_id, public.mi_empleado_id());
  v_origen text;
  v_previa timestamptz;
  v_id uuid;
begin
  if v_empleado is null then
    raise exception 'Tu cuenta no está ligada a ningún empleado. Pídele a un admin que la ligue.';
  end if;
  v_origen := public.origen_registro_asistencia(v_empleado);

  select entrada_at into v_previa from public.asistencias
  where empleado_id = v_empleado and fecha = public.fecha_negocio() and deleted_at is null;
  if found then
    raise exception 'La entrada de hoy ya está registrada a las %.', to_char(public.hora_negocio(v_previa), 'HH24:MI');
  end if;

  insert into public.asistencias (empleado_id, fecha, entrada_at, entrada_capturada_por, entrada_origen)
  values (v_empleado, public.fecha_negocio(), now(), auth.uid(), v_origen)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.registrar_entrada(uuid) from public, anon;
grant execute on function public.registrar_entrada(uuid) to authenticated;

create or replace function public.registrar_salida(p_empleado_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_empleado uuid := coalesce(p_empleado_id, public.mi_empleado_id());
  v_origen text;
  v_asistencia record;
begin
  if v_empleado is null then
    raise exception 'Tu cuenta no está ligada a ningún empleado. Pídele a un admin que la ligue.';
  end if;
  v_origen := public.origen_registro_asistencia(v_empleado);

  select id, salida_at into v_asistencia from public.asistencias
  where empleado_id = v_empleado and fecha = public.fecha_negocio() and deleted_at is null;
  if not found then
    raise exception 'No hay entrada registrada hoy: primero registra la entrada.';
  end if;
  if v_asistencia.salida_at is not null then
    raise exception 'La salida de hoy ya está registrada a las %.', to_char(public.hora_negocio(v_asistencia.salida_at), 'HH24:MI');
  end if;

  update public.asistencias
  set salida_at = now(), salida_capturada_por = auth.uid(), salida_origen = v_origen
  where id = v_asistencia.id;
end;
$$;
revoke execute on function public.registrar_salida(uuid) from public, anon;
grant execute on function public.registrar_salida(uuid) to authenticated;

-- Corrección por admin: cambia entrada/salida de un día (o lo crea si no
-- hubo registro, o lo anula con p_entrada NULL), con motivo, y guarda los
-- valores originales. Las horas llegan como hora local del negocio.
create or replace function public.corregir_asistencia(
  p_empleado_id uuid,
  p_fecha date,
  p_entrada time,
  p_salida time,
  p_motivo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actual record;
  v_hay boolean;
  v_entrada timestamptz;
  v_salida timestamptz;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin puede corregir la asistencia.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la corrección.';
  end if;
  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado.';
  end if;
  if p_fecha > public.fecha_negocio() then
    raise exception 'No se puede registrar asistencia de un día que no ha pasado.';
  end if;

  v_entrada := case when p_entrada is null then null else (p_fecha + p_entrada) at time zone 'America/Mexico_City' end;
  v_salida := case when p_salida is null then null else (p_fecha + p_salida) at time zone 'America/Mexico_City' end;
  if v_salida is not null and v_entrada is null then
    raise exception 'Una salida necesita su entrada.';
  end if;
  if v_salida is not null and v_salida <= v_entrada then
    raise exception 'La salida tiene que ser después de la entrada.';
  end if;

  select * into v_actual from public.asistencias
  where empleado_id = p_empleado_id and fecha = p_fecha and deleted_at is null;
  v_hay := found;

  if not v_hay then
    if v_entrada is null then
      raise exception 'Ese día no tiene registro que anular.';
    end if;
    insert into public.asistencias (
      empleado_id, fecha, entrada_at, salida_at, entrada_capturada_por, entrada_origen,
      salida_capturada_por, salida_origen, corregida
    )
    values (
      p_empleado_id, p_fecha, v_entrada, v_salida, auth.uid(), 'admin',
      case when v_salida is null then null else auth.uid() end,
      case when v_salida is null then null else 'admin' end, true
    )
    returning * into v_actual;
    insert into public.asistencia_correcciones (asistencia_id, entrada_anterior, salida_anterior, entrada_nueva, salida_nueva, motivo)
    values (v_actual.id, null, null, v_entrada, v_salida, btrim(p_motivo));
    return;
  end if;

  insert into public.asistencia_correcciones (asistencia_id, entrada_anterior, salida_anterior, entrada_nueva, salida_nueva, motivo)
  values (v_actual.id, v_actual.entrada_at, v_actual.salida_at, v_entrada, v_salida, btrim(p_motivo));

  if v_entrada is null then
    -- Anular: el registro queda (dado de baja) con su corrección.
    update public.asistencias set deleted_at = now(), corregida = true where id = v_actual.id;
  else
    update public.asistencias
    set entrada_at = v_entrada,
        salida_at = v_salida,
        salida_capturada_por = case when v_salida is distinct from v_actual.salida_at then auth.uid() else salida_capturada_por end,
        salida_origen = case when v_salida is null then null when v_salida is distinct from v_actual.salida_at then 'admin' else salida_origen end,
        corregida = true
    where id = v_actual.id;
  end if;
end;
$$;
revoke execute on function public.corregir_asistencia(uuid, date, time, time, text) from public, anon;
grant execute on function public.corregir_asistencia(uuid, date, time, time, text) to authenticated;

-- ── 4. Ausencias y saldo de vacaciones ──────────────────────────────
-- "Ausencias", no "permisos": permisos ya es otra cosa en la app.

create table public.ausencias (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  tipo text not null check (tipo in ('vacaciones', 'incapacidad', 'dia_personal', 'falta_justificada')),
  desde date not null,
  hasta date not null,
  -- Días que cuenta: los que le tocaba trabajar en el rango, según su horario.
  dias numeric(6, 1) not null check (dias > 0),
  motivo text,
  estado text not null default 'solicitada' check (estado in ('solicitada', 'aprobada', 'rechazada', 'cancelada')),
  solicitada_por uuid references auth.users(id) on delete set null default auth.uid(),
  revisada_por uuid references auth.users(id) on delete set null,
  revisada_at timestamptz,
  motivo_revision text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (hasta >= desde)
);
create trigger set_updated_at before insert or update on public.ausencias
  for each row execute function public.set_updated_at();
create index ausencias_empleado_idx on public.ausencias (empleado_id, desde);

alter table public.ausencias enable row level security;
create policy ausencias_select on public.ausencias
  for select to authenticated
  using (public.puede_ver_empleado(empleado_id));
create policy ausencias_escritura_por_rpc on public.ausencias
  for insert to authenticated
  with check (false);

create table public.vacaciones_movimientos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  -- Positivo: días que se le dan. Negativo: días que usó.
  dias numeric(6, 1) not null check (dias <> 0),
  tipo text not null check (tipo in ('asignacion', 'ajuste', 'ausencia', 'cancelacion_ausencia')),
  ausencia_id uuid references public.ausencias(id),
  motivo text not null check (btrim(motivo) <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.vacaciones_movimientos
  for each row execute function public.set_updated_at();

alter table public.vacaciones_movimientos enable row level security;
create policy vacaciones_movimientos_select on public.vacaciones_movimientos
  for select to authenticated
  using (coalesce(public.is_admin(), false) or public.tiene_permiso('nomina') or empleado_id = public.mi_empleado_id());
create policy vacaciones_movimientos_escritura_por_rpc on public.vacaciones_movimientos
  for insert to authenticated
  with check (false);

create or replace function public.saldo_vacaciones(p_empleado_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(public.is_admin(), false) or public.tiene_permiso('nomina') or p_empleado_id = public.mi_empleado_id()
    then (select coalesce(sum(dias), 0) from public.vacaciones_movimientos where empleado_id = p_empleado_id and deleted_at is null)
  end;
$$;
revoke execute on function public.saldo_vacaciones(uuid) from public, anon;
grant execute on function public.saldo_vacaciones(uuid) to authenticated;

-- Días que le tocaba trabajar en el rango según su horario de hoy; sin
-- horario capturado, días de calendario.
create or replace function public.dias_laborables_empleado(p_empleado_id uuid, p_desde date, p_hasta date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when exists (select 1 from public.empleados_horario where empleado_id = p_empleado_id and deleted_at is null)
    then (
      select count(*)::numeric
      from generate_series(p_desde, p_hasta, interval '1 day') d
      where exists (
        select 1 from public.empleados_horario h
        where h.empleado_id = p_empleado_id and h.deleted_at is null
          and h.dia_semana = extract(dow from d)::int
      )
    )
    else (p_hasta - p_desde + 1)::numeric
  end;
$$;
revoke execute on function public.dias_laborables_empleado(uuid, date, date) from public, anon;
grant execute on function public.dias_laborables_empleado(uuid, date, date) to authenticated;

-- La pide el propio empleado, o recepción/admin por quien no tiene cuenta.
create or replace function public.solicitar_ausencia(
  p_empleado_id uuid,
  p_tipo text,
  p_desde date,
  p_hasta date,
  p_motivo text
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
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Revisa las fechas: el último día no puede ser antes del primero.';
  end if;
  if p_hasta - p_desde > 90 then
    raise exception 'Una ausencia no puede pasar de 90 días; si es más larga, pide varias.';
  end if;
  if exists (
    select 1 from public.ausencias
    where empleado_id = v_empleado and deleted_at is null and estado in ('solicitada', 'aprobada')
      and daterange(desde, hasta, '[]') && daterange(p_desde, p_hasta, '[]')
  ) then
    raise exception 'Ya hay una ausencia pedida o aprobada que cruza esas fechas.';
  end if;

  v_dias := public.dias_laborables_empleado(v_empleado, p_desde, p_hasta);
  if v_dias <= 0 then
    raise exception 'En esas fechas no le toca trabajar según su horario: no hay días que pedir.';
  end if;

  insert into public.ausencias (empleado_id, tipo, desde, hasta, dias, motivo)
  values (v_empleado, p_tipo, p_desde, p_hasta, v_dias, nullif(btrim(coalesce(p_motivo, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.solicitar_ausencia(uuid, text, date, date, text) from public, anon;
grant execute on function public.solicitar_ausencia(uuid, text, date, date, text) to authenticated;

-- Aprobar o rechazar: solo admin. Aprobar vacaciones descuenta del saldo
-- (y no deja aprobar más días de los que tiene).
create or replace function public.resolver_ausencia(p_ausencia_id uuid, p_aprobar boolean, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aus record;
  v_saldo numeric;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin aprueba o rechaza ausencias.';
  end if;
  select * into v_aus from public.ausencias where id = p_ausencia_id and deleted_at is null for update;
  if not found then
    raise exception 'Ausencia no encontrada.';
  end if;
  if v_aus.estado <> 'solicitada' then
    raise exception 'Esa ausencia ya se resolvió.';
  end if;
  if not p_aprobar and (p_motivo is null or btrim(p_motivo) = '') then
    raise exception 'Escribe por qué se rechaza.';
  end if;

  if p_aprobar and v_aus.tipo = 'vacaciones' then
    select coalesce(sum(dias), 0) into v_saldo from public.vacaciones_movimientos
    where empleado_id = v_aus.empleado_id and deleted_at is null;
    if v_saldo < v_aus.dias then
      raise exception 'Pide % días de vacaciones y su saldo es de %. Ajusta el saldo o la solicitud.', v_aus.dias, v_saldo;
    end if;
    insert into public.vacaciones_movimientos (empleado_id, dias, tipo, ausencia_id, motivo)
    values (v_aus.empleado_id, -v_aus.dias, 'ausencia', v_aus.id,
      'Vacaciones del ' || to_char(v_aus.desde, 'DD/MM/YYYY') || ' al ' || to_char(v_aus.hasta, 'DD/MM/YYYY'));
  end if;

  update public.ausencias
  set estado = case when p_aprobar then 'aprobada' else 'rechazada' end,
      revisada_por = auth.uid(), revisada_at = now(),
      motivo_revision = nullif(btrim(coalesce(p_motivo, '')), '')
  where id = v_aus.id;
end;
$$;
revoke execute on function public.resolver_ausencia(uuid, boolean, text) from public, anon;
grant execute on function public.resolver_ausencia(uuid, boolean, text) to authenticated;

-- Cancelar: quien la pidió mientras está solicitada; admin también una
-- aprobada (y entonces los días de vacaciones regresan al saldo).
create or replace function public.cancelar_ausencia(p_ausencia_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_aus record;
begin
  select * into v_aus from public.ausencias where id = p_ausencia_id and deleted_at is null for update;
  if not found then
    raise exception 'Ausencia no encontrada.';
  end if;
  if v_aus.estado not in ('solicitada', 'aprobada') then
    raise exception 'Esa ausencia ya no está vigente.';
  end if;
  if v_aus.estado = 'aprobada' and not coalesce(public.is_admin(), false) then
    raise exception 'Una ausencia aprobada solo la cancela un admin.';
  end if;
  if v_aus.estado = 'solicitada' and not (
    coalesce(public.is_admin(), false)
    or v_aus.solicitada_por = auth.uid()
    or v_aus.empleado_id = public.mi_empleado_id()
  ) then
    raise exception 'Solo quien la pidió, o un admin, puede cancelarla.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe por qué se cancela.';
  end if;

  if v_aus.estado = 'aprobada' and v_aus.tipo = 'vacaciones' then
    insert into public.vacaciones_movimientos (empleado_id, dias, tipo, ausencia_id, motivo)
    values (v_aus.empleado_id, v_aus.dias, 'cancelacion_ausencia', v_aus.id, 'Se canceló: ' || btrim(p_motivo));
  end if;

  update public.ausencias
  set estado = 'cancelada', motivo_revision = btrim(p_motivo), revisada_por = auth.uid(), revisada_at = now()
  where id = v_aus.id;
end;
$$;
revoke execute on function public.cancelar_ausencia(uuid, text) from public, anon;
grant execute on function public.cancelar_ausencia(uuid, text) to authenticated;

create or replace function public.ajustar_vacaciones(p_empleado_id uuid, p_dias numeric, p_tipo text, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin asigna o ajusta días de vacaciones.';
  end if;
  if p_tipo not in ('asignacion', 'ajuste') then
    raise exception 'Tipo de movimiento no válido.';
  end if;
  if p_dias is null or p_dias = 0 then
    raise exception 'Escribe cuántos días.';
  end if;
  if p_tipo = 'asignacion' and p_dias < 0 then
    raise exception 'Una asignación suma días; para quitar, usa un ajuste.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo.';
  end if;
  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado.';
  end if;
  insert into public.vacaciones_movimientos (empleado_id, dias, tipo, motivo)
  values (p_empleado_id, p_dias, p_tipo, btrim(p_motivo));
end;
$$;
revoke execute on function public.ajustar_vacaciones(uuid, numeric, text, text) from public, anon;
grant execute on function public.ajustar_vacaciones(uuid, numeric, text, text) to authenticated;

-- ── 5. Día por día: retardos y faltas contra su horario ─────────────
-- Estado de cada día (hora del negocio):
--   a_tiempo / retardo (más de 10 minutos tarde) / extra (vino sin tocarle)
--   ausencia (aprobada) / descanso / programado (futuro)
--   pendiente (hoy, antes de su hora de salida) / falta.
-- Interna: sin guardia, nadie la llama directo; la usan las de abajo.

create or replace function public.dias_asistencia_interno(p_empleado_id uuid, p_desde date, p_hasta date)
returns table (
  fecha date,
  hora_entrada_prog time,
  hora_salida_prog time,
  asistencia_id uuid,
  entrada_at timestamptz,
  salida_at timestamptz,
  entrada_origen text,
  salida_origen text,
  corregida boolean,
  minutos_retardo int,
  estado text,
  ausencia_id uuid,
  ausencia_tipo text
)
language sql
stable
security definer
set search_path = ''
as $$
  with emp as (
    select * from public.empleados where id = p_empleado_id and deleted_at is null
  ),
  dias as (
    select d::date as fecha
    from emp, generate_series(
      greatest(p_desde, emp.fecha_ingreso),
      least(p_hasta, coalesce(emp.fecha_baja, p_hasta)),
      interval '1 day'
    ) d
  ),
  base as (
    select
      dd.fecha,
      h.hora_entrada, h.hora_salida,
      a.id as asistencia_id, a.entrada_at, a.salida_at, a.entrada_origen, a.salida_origen, a.corregida,
      au.id as ausencia_id, au.tipo as ausencia_tipo
    from dias dd
    left join lateral (
      select hh.hora_entrada, hh.hora_salida
      from public.empleados_horario hh
      where hh.empleado_id = p_empleado_id
        and hh.dia_semana = extract(dow from dd.fecha)::int
        and public.fecha_negocio(hh.created_at) <= dd.fecha
        and (hh.deleted_at is null or public.fecha_negocio(hh.deleted_at) > dd.fecha)
      order by hh.created_at desc
      limit 1
    ) h on true
    left join public.asistencias a
      on a.empleado_id = p_empleado_id and a.fecha = dd.fecha and a.deleted_at is null
    left join lateral (
      select x.id, x.tipo from public.ausencias x
      where x.empleado_id = p_empleado_id and x.estado = 'aprobada' and x.deleted_at is null
        and dd.fecha between x.desde and x.hasta
      limit 1
    ) au on true
  )
  select
    b.fecha, b.hora_entrada, b.hora_salida,
    b.asistencia_id, b.entrada_at, b.salida_at, b.entrada_origen, b.salida_origen, coalesce(b.corregida, false),
    case when b.asistencia_id is not null and b.hora_entrada is not null
      then greatest(0, floor(extract(epoch from (public.hora_negocio(b.entrada_at) - b.hora_entrada)) / 60))::int
    end,
    case
      when b.asistencia_id is not null and b.hora_entrada is null then 'extra'
      when b.asistencia_id is not null and public.hora_negocio(b.entrada_at) > b.hora_entrada + interval '10 minutes' then 'retardo'
      when b.asistencia_id is not null then 'a_tiempo'
      when b.ausencia_id is not null then 'ausencia'
      when b.hora_entrada is null then 'descanso'
      when b.fecha > public.fecha_negocio() then 'programado'
      when b.fecha = public.fecha_negocio() and public.hora_negocio() <= b.hora_salida then 'pendiente'
      else 'falta'
    end,
    b.ausencia_id, b.ausencia_tipo
  from base b
  order by b.fecha;
$$;
revoke execute on function public.dias_asistencia_interno(uuid, date, date) from public, anon, authenticated;

-- Pública: de un empleado (lo propio, o recepción/admin/nómina) o de todos
-- los activos (recepción/admin/nómina).
create or replace function public.asistencia_periodo(p_desde date, p_hasta date, p_empleado_id uuid default null)
returns table (
  empleado_id uuid,
  empleado_nombre text,
  tiene_cuenta boolean,
  fecha date,
  hora_entrada_prog time,
  hora_salida_prog time,
  asistencia_id uuid,
  entrada_at timestamptz,
  salida_at timestamptz,
  entrada_origen text,
  salida_origen text,
  corregida boolean,
  minutos_retardo int,
  estado text,
  ausencia_tipo text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_hasta < p_desde or p_hasta - p_desde > 93 then
    raise exception 'El periodo tiene que ser de máximo tres meses.';
  end if;
  if p_empleado_id is null then
    if not (coalesce(public.current_rol() in ('admin', 'recepcion'), false) or public.tiene_permiso('nomina')) then
      raise exception 'Solo recepción o admin ven la asistencia de todos.';
    end if;
  elsif not public.puede_ver_empleado(p_empleado_id) then
    raise exception 'Solo puedes ver tu propia asistencia.';
  end if;

  return query
  select e.id, e.nombre, e.profile_id is not null,
    d.fecha, d.hora_entrada_prog, d.hora_salida_prog, d.asistencia_id, d.entrada_at, d.salida_at,
    d.entrada_origen, d.salida_origen, d.corregida, d.minutos_retardo, d.estado, d.ausencia_tipo
  from public.empleados e
  cross join lateral public.dias_asistencia_interno(e.id, p_desde, p_hasta) d
  where e.deleted_at is null
    and (p_empleado_id is null or e.id = p_empleado_id)
  order by e.nombre, d.fecha;
end;
$$;
revoke execute on function public.asistencia_periodo(date, date, uuid) from public, anon;
grant execute on function public.asistencia_periodo(date, date, uuid) to authenticated;

-- ── 6. Esquema de pago y comisiones (dinero: permiso «nomina») ──────

create table public.esquemas_pago (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  -- Desde cuándo vale. Cambiar el esquema es capturar uno nuevo: el
  -- anterior queda como historia y los pagos ya hechos no cambian.
  vigente_desde date not null,
  sueldo_monto numeric(10, 2) check (sueldo_monto > 0),
  sueldo_periodicidad text check (sueldo_periodicidad in ('semanal', 'quincenal', 'mensual')),
  pago_por_dia numeric(10, 2) check (pago_por_dia > 0),
  con_comision boolean not null default false,
  -- Comisión de estética por omisión, si el servicio no tiene regla propia.
  comision_tipo text check (comision_tipo in ('porcentaje', 'monto')),
  comision_valor numeric(10, 2) check (comision_valor > 0),
  recibe_propinas boolean not null default true,
  notas text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check ((sueldo_monto is null) = (sueldo_periodicidad is null)),
  check ((comision_tipo is null) = (comision_valor is null)),
  check (comision_tipo <> 'porcentaje' or comision_valor <= 100),
  check (sueldo_monto is not null or pago_por_dia is not null or con_comision)
);
create trigger set_updated_at before insert or update on public.esquemas_pago
  for each row execute function public.set_updated_at();
create index esquemas_pago_empleado_idx on public.esquemas_pago (empleado_id, vigente_desde desc);

alter table public.esquemas_pago enable row level security;
create policy esquemas_pago_select_nomina on public.esquemas_pago
  for select to authenticated
  using (public.tiene_permiso('nomina'));
create policy esquemas_pago_insert_nomina on public.esquemas_pago
  for insert to authenticated
  with check (public.tiene_permiso('nomina'));

-- Regla de comisión por servicio de estética: de un estilista en
-- particular, o de todos (empleado_id NULL). Gana la del estilista.
create table public.comisiones_servicio (
  id uuid primary key default gen_random_uuid(),
  servicio_id uuid not null references public.servicios(id),
  empleado_id uuid references public.empleados(id),
  tipo text not null check (tipo in ('porcentaje', 'monto')),
  valor numeric(10, 2) not null check (valor > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (tipo <> 'porcentaje' or valor <= 100)
);
create trigger set_updated_at before insert or update on public.comisiones_servicio
  for each row execute function public.set_updated_at();
create unique index comisiones_servicio_vigente on public.comisiones_servicio
  (servicio_id, coalesce(empleado_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where deleted_at is null;

alter table public.comisiones_servicio enable row level security;
create policy comisiones_servicio_select_nomina on public.comisiones_servicio
  for select to authenticated
  using (public.tiene_permiso('nomina'));
create policy comisiones_servicio_insert_nomina on public.comisiones_servicio
  for insert to authenticated
  with check (public.tiene_permiso('nomina'));
create policy comisiones_servicio_update_nomina on public.comisiones_servicio
  for update to authenticated
  using (public.tiene_permiso('nomina'))
  with check (public.tiene_permiso('nomina'));

-- La comisión de UNA cita finalizada: sale sola de quién la atendió
-- (citas_estetica.empleado_id → empleados.profile_id) y de su esquema
-- vigente ese día. Interna (la usan la nómina y el margen, que ya
-- tienen su guardia).
create or replace function public.comision_de_cita(p_cita_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cita record;
  v_empleado uuid;
  v_esquema record;
  v_regla record;
begin
  select ce.servicio_id, ce.empleado_id, ce.precio, ce.estado, public.fecha_negocio(ce.inicio) as fecha
  into v_cita
  from public.citas_estetica ce
  where ce.id = p_cita_id and ce.deleted_at is null;
  if not found or v_cita.estado <> 'finalizada' then
    return 0;
  end if;

  select id into v_empleado from public.empleados
  where profile_id = v_cita.empleado_id and deleted_at is null;
  if v_empleado is null then
    return 0;
  end if;

  select * into v_esquema from public.esquemas_pago
  where empleado_id = v_empleado and deleted_at is null and vigente_desde <= v_cita.fecha
  order by vigente_desde desc, created_at desc
  limit 1;
  if not found or not v_esquema.con_comision then
    return 0;
  end if;

  select tipo, valor into v_regla from public.comisiones_servicio
  where servicio_id = v_cita.servicio_id and deleted_at is null
    and (empleado_id = v_empleado or empleado_id is null)
  order by (empleado_id is null)
  limit 1;
  if not found then
    if v_esquema.comision_tipo is null then
      return 0;
    end if;
    return round(case when v_esquema.comision_tipo = 'porcentaje'
      then coalesce(v_cita.precio, 0) * v_esquema.comision_valor / 100
      else v_esquema.comision_valor end, 2);
  end if;

  return round(case when v_regla.tipo = 'porcentaje'
    then coalesce(v_cita.precio, 0) * v_regla.valor / 100
    else v_regla.valor end, 2);
end;
$$;
revoke execute on function public.comision_de_cita(uuid) from public, anon, authenticated;

-- ── 7. Adelantos ────────────────────────────────────────────────────

create table public.adelantos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  monto numeric(10, 2) not null check (monto > 0),
  fecha date not null,
  metodo text not null check (metodo in ('efectivo', 'transferencia', 'otro')),
  motivo text,
  -- El pago que lo descontó (NULL = pendiente de descontar).
  pago_id uuid,
  cancelado boolean not null default false,
  motivo_cancelacion text,
  cancelado_por uuid references auth.users(id) on delete set null,
  cancelado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create trigger set_updated_at before insert or update on public.adelantos
  for each row execute function public.set_updated_at();

alter table public.adelantos enable row level security;
create policy adelantos_select on public.adelantos
  for select to authenticated
  using (public.tiene_permiso('nomina') or empleado_id = public.mi_empleado_id());
-- Solo por registrar_adelanto / cancelar_adelanto.
create policy adelantos_escritura_por_rpc on public.adelantos
  for insert to authenticated
  with check (false);

create or replace function public.registrar_adelanto(p_empleado_id uuid, p_monto numeric, p_fecha date, p_metodo text, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», registra adelantos.';
  end if;
  if not exists (select 1 from public.empleados where id = p_empleado_id and deleted_at is null) then
    raise exception 'Empleado no encontrado.';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto tiene que ser mayor a cero.';
  end if;
  if p_metodo not in ('efectivo', 'transferencia', 'otro') then
    raise exception 'Método no válido.';
  end if;
  insert into public.adelantos (empleado_id, monto, fecha, metodo, motivo)
  values (p_empleado_id, round(p_monto, 2), coalesce(p_fecha, public.fecha_negocio()), p_metodo, nullif(btrim(coalesce(p_motivo, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.registrar_adelanto(uuid, numeric, date, text, text) from public, anon;
grant execute on function public.registrar_adelanto(uuid, numeric, date, text, text) to authenticated;

create or replace function public.cancelar_adelanto(p_adelanto_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», cancela adelantos.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe por qué se cancela.';
  end if;
  select * into v from public.adelantos where id = p_adelanto_id and deleted_at is null for update;
  if not found then
    raise exception 'Adelanto no encontrado.';
  end if;
  if v.cancelado then
    raise exception 'Ese adelanto ya está cancelado.';
  end if;
  if v.pago_id is not null then
    raise exception 'Ese adelanto ya se descontó de un pago. Para corregirlo, revierte ese pago.';
  end if;
  update public.adelantos
  set cancelado = true, motivo_cancelacion = btrim(p_motivo), cancelado_por = auth.uid(), cancelado_at = now()
  where id = v.id;
end;
$$;
revoke execute on function public.cancelar_adelanto(uuid, text) from public, anon;
grant execute on function public.cancelar_adelanto(uuid, text) to authenticated;

-- ── 8. Pagos de nómina ──────────────────────────────────────────────
-- Un pago guarda el cálculo con el que se hizo (desglose) y no se toca
-- nunca. Para corregirlo se registra un REVERSO (mismos montos en
-- negativo, ligado al original) y se vuelve a pagar el periodo.

create table public.nomina_pagos (
  id uuid primary key default gen_random_uuid(),
  empleado_id uuid not null references public.empleados(id),
  tipo text not null check (tipo in ('pago', 'reverso')),
  reverso_de uuid references public.nomina_pagos(id),
  periodo_desde date not null,
  periodo_hasta date not null,
  sueldo numeric(10, 2) not null default 0,
  descuento_faltas numeric(10, 2) not null default 0,
  pago_dias numeric(10, 2) not null default 0,
  comisiones numeric(10, 2) not null default 0,
  propinas numeric(10, 2) not null default 0,
  adelantos numeric(10, 2) not null default 0,
  -- Lo que se le entregó en este pago.
  total numeric(10, 2) not null,
  -- Lo que le cuesta al negocio (sin propinas, que no son ingreso del
  -- negocio, y con los adelantos, que ya se habían entregado antes).
  costo numeric(10, 2) not null,
  desglose jsonb not null,
  metodo text check (metodo in ('efectivo', 'transferencia', 'otro')),
  fecha_pago date not null,
  notas text,
  motivo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (periodo_hasta >= periodo_desde),
  check ((tipo = 'reverso') = (reverso_de is not null)),
  check (tipo = 'pago' or btrim(coalesce(motivo, '')) <> '')
);
create trigger set_updated_at before insert or update on public.nomina_pagos
  for each row execute function public.set_updated_at();
create unique index nomina_pagos_un_reverso on public.nomina_pagos (reverso_de) where reverso_de is not null;
create index nomina_pagos_empleado_idx on public.nomina_pagos (empleado_id, periodo_desde);

alter table public.adelantos
  add constraint adelantos_pago_id_fkey foreign key (pago_id) references public.nomina_pagos(id);

alter table public.nomina_pagos enable row level security;
create policy nomina_pagos_select on public.nomina_pagos
  for select to authenticated
  using (public.tiene_permiso('nomina') or empleado_id = public.mi_empleado_id());
-- Solo por registrar_pago_nomina / revertir_pago_nomina. Sin UPDATE ni DELETE.
create policy nomina_pagos_escritura_por_rpc on public.nomina_pagos
  for insert to authenticated
  with check (false);

-- El cálculo del periodo, con desglose. Interno; lo exponen
-- calcular_nomina (vista previa) y registrar_pago_nomina (que lo guarda).
create or replace function public.calcular_nomina_interno(p_empleado_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_emp record;
  v_esq record;
  v_hay_esquema boolean;
  v_dias_periodo int;
  v_base int;
  v_completo boolean := false;
  v_sueldo numeric := 0;
  v_tarifa_dia numeric := 0;
  v_desc_faltas numeric := 0;
  v_pago_dias numeric := 0;
  v_com numeric := 0;
  v_prop numeric := 0;
  v_adel numeric := 0;
  v_trabajados int; v_faltas int; v_retardos int; v_vacaciones int; v_otras int; v_programados int;
  v_com_det jsonb := '[]'::jsonb;
  v_prop_det jsonb := '[]'::jsonb;
  v_adel_det jsonb := '[]'::jsonb;
  v_avisos text[] := '{}';
  v_fin_mes date;
begin
  select * into v_emp from public.empleados where id = p_empleado_id and deleted_at is null;
  if not found then
    raise exception 'Empleado no encontrado.';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Revisa el periodo: el último día no puede ser antes del primero.';
  end if;
  if p_hasta - p_desde > 62 then
    raise exception 'Un periodo de nómina no puede pasar de dos meses.';
  end if;

  select * into v_esq from public.esquemas_pago
  where empleado_id = p_empleado_id and deleted_at is null and vigente_desde <= p_hasta
  order by vigente_desde desc, created_at desc
  limit 1;
  v_hay_esquema := found;

  select
    count(*) filter (where estado in ('a_tiempo', 'retardo', 'extra')),
    count(*) filter (where estado = 'falta'),
    count(*) filter (where estado = 'retardo'),
    count(*) filter (where estado = 'ausencia' and ausencia_tipo = 'vacaciones'),
    count(*) filter (where estado = 'ausencia' and ausencia_tipo <> 'vacaciones'),
    count(*) filter (where hora_entrada_prog is not null)
  into v_trabajados, v_faltas, v_retardos, v_vacaciones, v_otras, v_programados
  from public.dias_asistencia_interno(p_empleado_id, p_desde, p_hasta);

  v_dias_periodo := p_hasta - p_desde + 1;
  v_fin_mes := (date_trunc('month', p_desde) + interval '1 month - 1 day')::date;

  if not v_hay_esquema then
    v_avisos := v_avisos || 'No tiene esquema de pago vigente en el periodo: solo se calculan comisiones, propinas y adelantos.';
  else
    if v_esq.sueldo_monto is not null then
      v_base := case v_esq.sueldo_periodicidad when 'semanal' then 7 when 'quincenal' then 15 else 30 end;
      v_tarifa_dia := round(v_esq.sueldo_monto / v_base, 2);
      v_completo := case v_esq.sueldo_periodicidad
        when 'semanal' then v_dias_periodo = 7
        when 'quincenal' then (extract(day from p_desde) = 1 and p_hasta = p_desde + 14)
          or (extract(day from p_desde) = 16 and p_hasta = v_fin_mes)
        else extract(day from p_desde) = 1 and p_hasta = v_fin_mes
      end;
      if v_completo then
        v_sueldo := v_esq.sueldo_monto;
      else
        v_sueldo := round(v_esq.sueldo_monto * v_dias_periodo / v_base, 2);
        v_avisos := v_avisos || format(
          'El periodo no es %s completo: el sueldo se prorrateó por %s días (%s por día).',
          case v_esq.sueldo_periodicidad when 'semanal' then 'una semana' when 'quincenal' then 'una quincena' else 'un mes' end,
          v_dias_periodo, v_tarifa_dia);
      end if;
      v_desc_faltas := round(v_faltas * v_tarifa_dia, 2);
    end if;
    if v_esq.pago_por_dia is not null then
      v_pago_dias := round((v_trabajados + v_vacaciones) * v_esq.pago_por_dia, 2);
    end if;
  end if;

  -- Comisiones: citas finalizadas que atendió, por la fecha de la cita.
  if v_emp.profile_id is not null then
    select coalesce(sum(x.comision), 0), coalesce(jsonb_agg(jsonb_build_object(
      'cita_id', x.id, 'fecha', x.fecha, 'servicio', x.servicio, 'perro', x.perro,
      'precio', x.precio, 'comision', x.comision) order by x.fecha) filter (where x.comision > 0), '[]'::jsonb)
    into v_com, v_com_det
    from (
      select ce.id, public.fecha_negocio(ce.inicio) as fecha, s.nombre as servicio, p.nombre as perro,
        ce.precio, public.comision_de_cita(ce.id) as comision
      from public.citas_estetica ce
      join public.servicios s on s.id = ce.servicio_id
      join public.perros p on p.id = ce.perro_id
      where ce.empleado_id = v_emp.profile_id
        and ce.estado = 'finalizada'
        and ce.deleted_at is null
        and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
    ) x;

    -- Propinas: las de cada cobro del periodo, repartidas entre quienes
    -- atendieron las citas de esa cuenta (por el precio de cada cita).
    if not v_hay_esquema or v_esq.recibe_propinas then
      select coalesce(sum(y.suya), 0), coalesce(jsonb_agg(jsonb_build_object(
        'cobro_id', y.id, 'fecha', y.fecha, 'propina_total', y.propina, 'propina', y.suya) order by y.fecha), '[]'::jsonb)
      into v_prop, v_prop_det
      from (
        select c.id, public.fecha_negocio(c.created_at) as fecha, c.propina,
          round(c.propina * case when t.total_precio > 0 then t.mio_precio / t.total_precio
            else t.mio_cuenta::numeric / nullif(t.total_cuenta, 0) end, 2) as suya
        from (
          select co.id, co.reserva_id, co.created_at, sum(cm.propina) as propina
          from public.cobros co
          join public.cobro_metodos cm on cm.cobro_id = co.id
          where co.deleted_at is null
            and public.fecha_negocio(co.created_at) between p_desde and p_hasta
          group by co.id
          having sum(cm.propina) > 0
        ) c
        cross join lateral (
          select
            coalesce(sum(ce.precio), 0) as total_precio,
            coalesce(sum(ce.precio) filter (where ce.empleado_id = v_emp.profile_id), 0) as mio_precio,
            count(*) as total_cuenta,
            count(*) filter (where ce.empleado_id = v_emp.profile_id) as mio_cuenta
          from public.citas_estetica ce
          where ce.reserva_id = c.reserva_id and ce.deleted_at is null
            and ce.estado not in ('cancelada', 'no_llego')
        ) t
        where t.mio_cuenta > 0
      ) y
      where y.suya > 0;
    end if;
  end if;

  select coalesce(sum(monto), 0), coalesce(jsonb_agg(jsonb_build_object(
    'adelanto_id', id, 'fecha', fecha, 'monto', monto, 'motivo', motivo) order by fecha), '[]'::jsonb)
  into v_adel, v_adel_det
  from public.adelantos
  where empleado_id = p_empleado_id and not cancelado and pago_id is null and deleted_at is null
    and fecha <= p_hasta;

  if exists (
    select 1 from public.nomina_pagos np
    where np.empleado_id = p_empleado_id and np.tipo = 'pago' and np.deleted_at is null
      and daterange(np.periodo_desde, np.periodo_hasta, '[]') && daterange(p_desde, p_hasta, '[]')
      and not exists (select 1 from public.nomina_pagos r where r.reverso_de = np.id)
  ) then
    v_avisos := v_avisos || 'Ya hay un pago registrado que cubre parte de este periodo.';
  end if;

  return jsonb_build_object(
    'empleado_id', p_empleado_id,
    'empleado_nombre', v_emp.nombre,
    'periodo_desde', p_desde,
    'periodo_hasta', p_hasta,
    'esquema', case when v_hay_esquema then jsonb_build_object(
      'vigente_desde', v_esq.vigente_desde,
      'sueldo_monto', v_esq.sueldo_monto,
      'sueldo_periodicidad', v_esq.sueldo_periodicidad,
      'pago_por_dia', v_esq.pago_por_dia,
      'con_comision', v_esq.con_comision,
      'recibe_propinas', v_esq.recibe_propinas) end,
    'dias', jsonb_build_object(
      'periodo', v_dias_periodo,
      'programados', v_programados,
      'trabajados', v_trabajados,
      'faltas', v_faltas,
      'retardos', v_retardos,
      'vacaciones', v_vacaciones,
      'otras_ausencias', v_otras),
    'tarifa_dia_sueldo', v_tarifa_dia,
    'sueldo', v_sueldo,
    'descuento_faltas', v_desc_faltas,
    'pago_dias', v_pago_dias,
    'comisiones', v_com,
    'comisiones_detalle', v_com_det,
    'propinas', v_prop,
    'propinas_detalle', v_prop_det,
    'adelantos', v_adel,
    'adelantos_detalle', v_adel_det,
    'total', v_sueldo - v_desc_faltas + v_pago_dias + v_com + v_prop - v_adel,
    'costo', v_sueldo - v_desc_faltas + v_pago_dias + v_com,
    'avisos', to_jsonb(v_avisos)
  );
end;
$$;
revoke execute on function public.calcular_nomina_interno(uuid, date, date) from public, anon, authenticated;

create or replace function public.calcular_nomina(p_empleado_id uuid, p_desde date, p_hasta date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», calcula la nómina.';
  end if;
  return public.calcular_nomina_interno(p_empleado_id, p_desde, p_hasta);
end;
$$;
revoke execute on function public.calcular_nomina(uuid, date, date) from public, anon;
grant execute on function public.calcular_nomina(uuid, date, date) to authenticated;

create or replace function public.registrar_pago_nomina(
  p_empleado_id uuid,
  p_desde date,
  p_hasta date,
  p_metodo text,
  p_fecha_pago date,
  p_notas text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_calc jsonb;
  v_id uuid;
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», registra pagos de nómina.';
  end if;
  if p_metodo not in ('efectivo', 'transferencia', 'otro') then
    raise exception 'Método de pago no válido.';
  end if;
  -- Un periodo a la vez por empleado: no se paga dos veces el mismo día.
  perform pg_advisory_xact_lock(hashtext('nomina:' || p_empleado_id::text));
  if exists (
    select 1 from public.nomina_pagos np
    where np.empleado_id = p_empleado_id and np.tipo = 'pago' and np.deleted_at is null
      and daterange(np.periodo_desde, np.periodo_hasta, '[]') && daterange(p_desde, p_hasta, '[]')
      and not exists (select 1 from public.nomina_pagos r where r.reverso_de = np.id)
  ) then
    raise exception 'Ya hay un pago registrado que cubre parte de este periodo. Si está mal, reviértelo primero.';
  end if;

  v_calc := public.calcular_nomina_interno(p_empleado_id, p_desde, p_hasta);
  if (v_calc ->> 'total')::numeric < 0 then
    raise exception 'Los adelantos (%) son más que lo que se le debe en el periodo. Paga un periodo más largo o cancela un adelanto.',
      v_calc ->> 'adelantos';
  end if;

  insert into public.nomina_pagos (
    empleado_id, tipo, periodo_desde, periodo_hasta, sueldo, descuento_faltas, pago_dias, comisiones,
    propinas, adelantos, total, costo, desglose, metodo, fecha_pago, notas
  )
  values (
    p_empleado_id, 'pago', p_desde, p_hasta,
    (v_calc ->> 'sueldo')::numeric, (v_calc ->> 'descuento_faltas')::numeric, (v_calc ->> 'pago_dias')::numeric,
    (v_calc ->> 'comisiones')::numeric, (v_calc ->> 'propinas')::numeric, (v_calc ->> 'adelantos')::numeric,
    (v_calc ->> 'total')::numeric, (v_calc ->> 'costo')::numeric, v_calc, p_metodo,
    coalesce(p_fecha_pago, public.fecha_negocio()), nullif(btrim(coalesce(p_notas, '')), '')
  )
  returning id into v_id;

  update public.adelantos set pago_id = v_id
  where id in (select (x ->> 'adelanto_id')::uuid from jsonb_array_elements(v_calc -> 'adelantos_detalle') x);

  return v_id;
end;
$$;
revoke execute on function public.registrar_pago_nomina(uuid, date, date, text, date, text) from public, anon;
grant execute on function public.registrar_pago_nomina(uuid, date, date, text, date, text) to authenticated;

-- Corregir un pago: movimiento inverso. Los adelantos que descontó
-- vuelven a quedar pendientes (el reverso guarda cuáles eran).
create or replace function public.revertir_pago_nomina(p_pago_id uuid, p_motivo text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  v_id uuid;
begin
  if not public.tiene_permiso('nomina') then
    raise exception 'Solo un admin, o quien tenga el permiso «Nómina», revierte pagos de nómina.';
  end if;
  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe por qué se revierte.';
  end if;
  select * into v from public.nomina_pagos where id = p_pago_id and deleted_at is null for update;
  if not found then
    raise exception 'Pago no encontrado.';
  end if;
  if v.tipo <> 'pago' then
    raise exception 'Solo se revierte un pago, no un reverso.';
  end if;
  if exists (select 1 from public.nomina_pagos where reverso_de = v.id) then
    raise exception 'Ese pago ya se revirtió.';
  end if;

  insert into public.nomina_pagos (
    empleado_id, tipo, reverso_de, periodo_desde, periodo_hasta, sueldo, descuento_faltas, pago_dias,
    comisiones, propinas, adelantos, total, costo, desglose, metodo, fecha_pago, motivo
  )
  values (
    v.empleado_id, 'reverso', v.id, v.periodo_desde, v.periodo_hasta, -v.sueldo, -v.descuento_faltas, -v.pago_dias,
    -v.comisiones, -v.propinas, -v.adelantos, -v.total, -v.costo,
    jsonb_build_object('reverso_de', v.id, 'adelantos_liberados',
      (select coalesce(jsonb_agg(id), '[]'::jsonb) from public.adelantos where pago_id = v.id)),
    v.metodo, public.fecha_negocio(), btrim(p_motivo)
  )
  returning id into v_id;

  update public.adelantos set pago_id = null where pago_id = v.id;
  return v_id;
end;
$$;
revoke execute on function public.revertir_pago_nomina(uuid, text) from public, anon;
grant execute on function public.revertir_pago_nomina(uuid, text) to authenticated;

-- ── 9. Reportes: nómina en la utilidad y comisión en el margen ─────

-- Utilidad del periodo = ingreso reconocido − consumo de insumos
-- (incluye merma) − costo de nómina. La nómina entra por la FECHA DE PAGO
-- (con sus reversos), sin propinas (no son ingreso del negocio: se
-- reparten) y con los adelantos que ese pago descontó.
create or replace function public.reporte_utilidad_periodo(p_desde date, p_hasta date)
returns table (
  ingreso_reconocido numeric,
  costo_insumos numeric,
  nomina_costo numeric,
  nomina_pagada numeric,
  propinas_repartidas numeric,
  adelantos_pendientes numeric,
  utilidad numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ingreso numeric;
  v_insumos numeric;
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;
  select f.ingreso_reconocido into v_ingreso from public.reporte_financiero_periodo(p_desde, p_hasta) f;
  select c.consumo_valorizado_total into v_insumos from public.reporte_costos_periodo(p_desde, p_hasta) c;

  return query
  select
    coalesce(v_ingreso, 0),
    coalesce(v_insumos, 0),
    coalesce(n.costo, 0),
    coalesce(n.total, 0),
    coalesce(n.propinas, 0),
    (select coalesce(sum(a.monto), 0) from public.adelantos a
      where not a.cancelado and a.pago_id is null and a.deleted_at is null and a.fecha <= p_hasta),
    coalesce(v_ingreso, 0) - coalesce(v_insumos, 0) - coalesce(n.costo, 0)
  from (
    select sum(np.costo) as costo, sum(np.total) as total, sum(np.propinas) as propinas
    from public.nomina_pagos np
    where np.deleted_at is null and np.fecha_pago between p_desde and p_hasta
  ) n;
end;
$$;
revoke execute on function public.reporte_utilidad_periodo(date, date) from public, anon;
grant execute on function public.reporte_utilidad_periodo(date, date) to authenticated;

-- Margen por servicio: se agregan la comisión del estilista y el margen
-- después de comisión (cambia el tipo de retorno: se recrea).
drop function public.reporte_margen_por_servicio_periodo(date, date);
create function public.reporte_margen_por_servicio_periodo(p_desde date, p_hasta date)
returns table (
  servicio_id uuid,
  servicio_nombre text,
  citas_finalizadas int,
  ingreso numeric,
  costo_consumo numeric,
  margen numeric,
  comision numeric,
  margen_con_comision numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;

  return query
  with citas_periodo as (
    select ce.id, ce.servicio_id, ce.precio, public.comision_de_cita(ce.id) as comision
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  costo_por_cita as (
    select
      mi.cita_estetica_id as cita_id,
      sum(mi.cantidad_base * coalesce(public.costo_promedio_base_insumo(mi.insumo_id, p_hasta), 0)) as costo
    from public.movimientos_inventario mi
    where mi.cita_estetica_id in (select id from citas_periodo)
    group by mi.cita_estetica_id
  )
  select
    s.id,
    s.nombre,
    count(cp.id)::int,
    coalesce(sum(cp.precio), 0),
    coalesce(sum(cpc.costo), 0),
    coalesce(sum(cp.precio), 0) - coalesce(sum(cpc.costo), 0),
    coalesce(sum(cp.comision), 0),
    coalesce(sum(cp.precio), 0) - coalesce(sum(cpc.costo), 0) - coalesce(sum(cp.comision), 0)
  from citas_periodo cp
  join public.servicios s on s.id = cp.servicio_id
  left join costo_por_cita cpc on cpc.cita_id = cp.id
  group by s.id, s.nombre
  order by s.nombre;
end;
$$;
revoke execute on function public.reporte_margen_por_servicio_periodo(date, date) from public, anon;
grant execute on function public.reporte_margen_por_servicio_periodo(date, date) to authenticated;

-- Las funciones nuevas no quedan abiertas a anon por los privilegios por
-- omisión del proyecto (revoke from public no alcanza: se nombra a anon).
revoke execute on function public.validar_cuenta_de_empleado() from public, anon;
