-- Tarjeta (registro manual) — 8 de octubre de 2026.
--
-- Contexto: el 5 de octubre se cerró la puerta de «Terminal» a mano (un cobro
-- con terminal solo entra verificado por Mercado Pago o Clip). Pero a veces la
-- terminal vinculada no se puede usar (caída, sin señal, otra terminal) y la
-- recepción no puede quedar bloqueada. Esta migración agrega un método APARTE:
--
--   «Tarjeta (registro manual)» = metodo 'tarjeta_manual' en cobro_metodos,
--   devolucion_metodos y corte_metodos. Cuenta como pagado desde que se registra,
--   pero SIEMPRE con folio/autorización del voucher y motivo, marcado «sin
--   verificar», y nunca se mezcla con los cobros verificados de terminal: en
--   turno, corte y reportes es una línea aparte. «Terminal» sigue bloqueado a
--   mano cuando hay Mercado Pago o Clip elegido (terminal_manual_bloqueada).
--
--   · Permiso nuevo «Registrar tarjeta manual» (tarjeta_manual): admin siempre;
--     recepción por omisión (se siembra a las cuentas actuales y a las nuevas) y
--     el admin se lo puede quitar por persona.
--   · tarjetas_manuales: un renglón por línea de cobro con folio (único dentro
--     del negocio), motivo, últimos 4 y banco opcionales, quién, cuándo y turno.
--     Nunca guarda un número de tarjeta completo.
--   · Tope de alerta por negocio (tarjeta_manual_ajustes, $2,000 por omisión):
--     arriba se registra igual pero sube a «Necesita atención».
--   · Revisión del admin: «Revisado con voucher» o «Marcar como no recibida»
--     (devolución aparte en el turno ABIERTO; el original y el corte cerrado no
--     se tocan). Cada paso deja un evento (tarjetas_manuales_eventos).
--   · Alerta de patrón (negocio con Mercado Pago o Clip conectado): más de 3
--     tarjetas manuales en un día, o más del 30 % de las tarjetas del turno
--     (con al menos 2 manuales); en «Necesita atención» y en /plataforma.
--
-- REVERSA (si hiciera falta, antes de que se use): drop de las funciones
-- tarjeta_manual_* / tarjetas_manuales_* / plataforma_tarjetas_manuales_patron,
-- de las tres tablas nuevas y del trigger de membresías; volver a poner los
-- checks de metodo sin 'tarjeta_manual'; restaurar registrar_cobro,
-- registrar_devolucion, cerrar_turno, resumen_turno y reporte_financiero_periodo
-- de 20261006120000 / 20260929022303 / 20260925023050. Los registros ya hechos
-- con el método nuevo se dejarían como están (no se borran).

-- ── 1. Métodos y orígenes ────────────────────────────────────────────
alter table public.cobro_metodos drop constraint cobro_metodos_metodo_check;
alter table public.cobro_metodos add constraint cobro_metodos_metodo_check
  check (metodo in ('efectivo', 'terminal', 'transferencia', 'tarjeta_manual'));
alter table public.devolucion_metodos drop constraint devolucion_metodos_metodo_check;
alter table public.devolucion_metodos add constraint devolucion_metodos_metodo_check
  check (metodo in ('efectivo', 'terminal', 'transferencia', 'tarjeta_manual'));
alter table public.corte_metodos drop constraint corte_metodos_metodo_check;
alter table public.corte_metodos add constraint corte_metodos_metodo_check
  check (metodo in ('efectivo', 'terminal', 'transferencia', 'tarjeta_manual'));

alter table public.cobro_correcciones drop constraint cobro_correcciones_tipo_check;
alter table public.cobro_correcciones add constraint cobro_correcciones_tipo_check
  check (tipo in ('no_recibido', 'tarjeta_manual_no_recibida'));

-- ── 2. Permiso «Registrar tarjeta manual» ────────────────────────────
alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check
  check (permiso in (
    'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
    'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
    'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista',
    'corregir_servicio', 'tarjeta_manual'
  ));

create or replace function public.mis_permisos()
 returns setof text
 language sql
 stable security definer
 set search_path to ''
as $$
  select unnest(array[
    'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
    'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
    'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista',
    'corregir_servicio', 'tarjeta_manual'
  ]) as permiso
  where coalesce(public.is_admin(), false)
  union
  select ps.permiso
  from public.permisos_staff ps
  where ps.profile_id = auth.uid()
    and ps.negocio_id = public.negocio_actual()
    and ps.revocado_at is null
    and ps.deleted_at is null
    and public.current_rol() = 'recepcion';
$$;

-- Por omisión lo tiene toda la recepción: se siembra a las cuentas de hoy y,
-- por trigger, a las que lleguen (o pasen a recepción). Si el admin se lo quita
-- a alguien, esa fila queda revocada y NO se vuelve a sembrar.
insert into public.permisos_staff (negocio_id, profile_id, permiso, created_by)
select m.negocio_id, m.profile_id, 'tarjeta_manual', null
from public.membresias m
where m.rol = 'recepcion' and m.deleted_at is null
  and not exists (
    select 1 from public.permisos_staff ps
    where ps.profile_id = m.profile_id and ps.negocio_id = m.negocio_id and ps.permiso = 'tarjeta_manual'
  );

create or replace function public.permiso_tarjeta_manual_por_omision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.rol = 'recepcion' and new.deleted_at is null and not exists (
    select 1 from public.permisos_staff ps
    where ps.profile_id = new.profile_id and ps.negocio_id = new.negocio_id and ps.permiso = 'tarjeta_manual'
  ) then
    insert into public.permisos_staff (negocio_id, profile_id, permiso, created_by)
    values (new.negocio_id, new.profile_id, 'tarjeta_manual', null);
  end if;
  return new;
end;
$$;
revoke execute on function public.permiso_tarjeta_manual_por_omision() from public, anon, authenticated;
create trigger membresias_permiso_tarjeta_manual
  after insert or update of rol on public.membresias
  for each row execute function public.permiso_tarjeta_manual_por_omision();

-- ── 3. Tablas ────────────────────────────────────────────────────────
create table public.tarjeta_manual_ajustes (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tope_alerta numeric not null default 2000 check (tope_alerta > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index tarjeta_manual_ajustes_negocio_uq on public.tarjeta_manual_ajustes (negocio_id) where deleted_at is null;

create table public.tarjetas_manuales (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cobro_id uuid not null references public.cobros(id),
  cobro_metodo_id uuid not null references public.cobro_metodos(id),
  turno_id uuid not null references public.turnos_caja(id),
  monto numeric not null check (monto > 0),
  propina numeric not null default 0 check (propina >= 0),
  folio text not null check (char_length(btrim(folio)) >= 4),
  -- Folio sin espacios ni signos y en minúsculas: «A-1234» y «a 1234» son el mismo.
  folio_norm text not null check (char_length(folio_norm) >= 4),
  motivo text not null check (motivo in ('terminal_no_responde', 'sin_senal', 'otra_terminal', 'otro')),
  motivo_texto text,
  ultimos4 text check (ultimos4 ~ '^[0-9]{4}$'),
  banco text,
  sobre_tope boolean not null default false,
  tope_aplicado numeric,
  estado text not null default 'por_revisar' check (estado in ('por_revisar', 'revisada', 'no_recibida')),
  revisada_por uuid references auth.users(id) on delete set null,
  revisada_at timestamptz,
  nota_revision text,
  correccion_id uuid references public.cobro_correcciones(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint tarjetas_manuales_motivo_otro check (motivo <> 'otro' or char_length(btrim(coalesce(motivo_texto, ''))) >= 3)
);
create unique index tarjetas_manuales_cobro_metodo_uq on public.tarjetas_manuales (cobro_metodo_id);
-- Un folio se registra una sola vez por negocio (salvo el de una marcada «no recibida»).
create unique index tarjetas_manuales_folio_uq on public.tarjetas_manuales (negocio_id, folio_norm)
  where deleted_at is null and estado <> 'no_recibida';
create index tarjetas_manuales_turno_idx on public.tarjetas_manuales (turno_id);
create index tarjetas_manuales_cobro_idx on public.tarjetas_manuales (cobro_id);

create table public.tarjetas_manuales_eventos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tarjeta_id uuid references public.tarjetas_manuales(id),
  tipo text not null check (tipo in ('registrada', 'sobre_tope', 'revisada', 'no_recibida', 'tope_cambiado')),
  actor uuid references auth.users(id) on delete set null,
  detalle jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index tarjetas_manuales_eventos_tarjeta_idx on public.tarjetas_manuales_eventos (tarjeta_id);

do $$
declare
  t text;
begin
  foreach t in array array['tarjeta_manual_ajustes', 'tarjetas_manuales', 'tarjetas_manuales_eventos'] loop
    execute format('create index %I on public.%I (negocio_id)', t || '_negocio_idx', t);
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$f$, t || '_negocio', t);
    execute format($f$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$f$, t || '_negocio_definer', t);
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_ins', t);
    execute format($f$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_upd', t);
    execute format($f$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_del', t);
    -- Leer: admin y recepción (el dinero no lo ve estética ni el cliente). Escribir: solo por funciones.
    execute format($f$create policy %I on public.%I for select to authenticated
      using ((select coalesce(public.current_rol() in ('admin', 'recepcion'), false)))$f$, t || '_select', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
  end loop;
end $$;

-- ── 4. Tope de alerta por negocio ────────────────────────────────────
create or replace function public.tarjeta_manual_tope()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select a.tope_alerta from public.tarjeta_manual_ajustes a
    where a.negocio_id = public.negocio_actual() and a.deleted_at is null
  ), 2000);
$$;
alter function public.tarjeta_manual_tope() owner to peludesk_definer;

create or replace function public.guardar_tope_tarjeta_manual(p_tope numeric)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_antes numeric;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin cambia el tope de alerta de tarjeta manual.' using errcode = '42501';
  end if;
  if p_tope is null or p_tope <= 0 or p_tope > 1000000 then
    raise exception 'El tope tiene que ser un monto mayor a cero.';
  end if;
  v_antes := public.tarjeta_manual_tope();
  update public.tarjeta_manual_ajustes set tope_alerta = round(p_tope, 2)
  where negocio_id = public.negocio_actual() and deleted_at is null;
  if not found then
    insert into public.tarjeta_manual_ajustes (negocio_id, tope_alerta) values (public.negocio_actual(), round(p_tope, 2));
  end if;
  insert into public.tarjetas_manuales_eventos (negocio_id, tipo, actor, detalle)
  values (public.negocio_actual(), 'tope_cambiado', auth.uid(), jsonb_build_object('antes', v_antes, 'ahora', round(p_tope, 2)));
  return round(p_tope, 2);
end;
$$;
alter function public.guardar_tope_tarjeta_manual(numeric) owner to peludesk_definer;

-- ── 5. registrar_cobro con el método nuevo ───────────────────────────
-- p_metodos: {"metodo": "efectivo"|"terminal"|"transferencia"|"tarjeta_manual", "monto": n, "propina": n,
--   y para tarjeta_manual: "folio", "motivo" (terminal_no_responde|sin_senal|otra_terminal|otro),
--   "motivo_texto" (si es «otro»), "ultimos4" y "banco" opcionales}.
create or replace function public.registrar_cobro(p_reserva_id uuid, p_notas text, p_metodos jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_turno_id uuid;
  v_cobro_id uuid;
  v_cm_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_propina numeric;
  v_nombre_metodo text;
  v_folio text;
  v_norm text;
  v_motivo text;
  v_motivo_texto text;
  v_ult4 text;
  v_banco text;
  v_tope numeric;
  v_total_manual numeric := 0;
  v_tarjeta_id uuid;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden registrar cobros.';
  end if;

  if not exists (select 1 from public.reservas where id = p_reserva_id) then
    raise exception 'Reserva no encontrada.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método de pago.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de cobrar.';
  end if;

  -- Lo que se pasa por tarjeta manual en este cobro, para el tope de alerta.
  select coalesce(sum(coalesce((m ->> 'monto')::numeric, 0) + coalesce((m ->> 'propina')::numeric, 0)), 0)
  into v_total_manual
  from jsonb_array_elements(p_metodos) m
  where m ->> 'metodo' = 'tarjeta_manual';
  v_tope := public.tarjeta_manual_tope();

  insert into public.cobros (reserva_id, turno_id, notas, created_by)
  values (p_reserva_id, v_turno_id, nullif(btrim(p_notas), ''), auth.uid())
  returning id into v_cobro_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;
    v_propina := coalesce((v_metodo ->> 'propina')::numeric, 0);

    if v_nombre_metodo is null or v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia', 'tarjeta_manual') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;
    -- Un cobro con terminal solo entra cuando el proveedor confirma un pago
    -- aprobado (por la terminal conectada), nunca tecleado a mano.
    if v_nombre_metodo = 'terminal' and public.terminal_manual_bloqueada() then
      raise exception 'Este negocio cobra con la terminal conectada: usa «Cobrar con terminal» en la cuenta. Si no se puede cobrar por ahí (terminal caída, sin señal, otra terminal), usa «Tarjeta (registro manual)» con el folio del voucher. A mano también: efectivo y transferencia.';
    end if;
    if v_propina < 0 then
      raise exception 'La propina no puede ser negativa.';
    end if;

    insert into public.cobro_metodos (cobro_id, metodo, monto, propina, created_by)
    values (v_cobro_id, v_nombre_metodo, v_monto, v_propina, auth.uid())
    returning id into v_cm_id;

    if v_nombre_metodo = 'tarjeta_manual' then
      if not public.tiene_permiso('tarjeta_manual') then
        raise exception 'No tienes el permiso «Registrar tarjeta manual». Pídeselo al admin (Administración → Permisos).' using errcode = '42501';
      end if;
      v_folio := btrim(coalesce(v_metodo ->> 'folio', ''));
      v_norm := lower(regexp_replace(v_folio, '[^A-Za-z0-9]', '', 'g'));
      v_motivo := btrim(coalesce(v_metodo ->> 'motivo', ''));
      v_motivo_texto := nullif(btrim(coalesce(v_metodo ->> 'motivo_texto', '')), '');
      v_ult4 := nullif(btrim(coalesce(v_metodo ->> 'ultimos4', '')), '');
      v_banco := nullif(btrim(coalesce(v_metodo ->> 'banco', '')), '');
      if char_length(v_folio) < 4 or char_length(v_norm) < 4 then
        raise exception 'Escribe el folio o número de autorización del voucher (mínimo 4 caracteres).';
      end if;
      if v_motivo not in ('terminal_no_responde', 'sin_senal', 'otra_terminal', 'otro') then
        raise exception 'Elige por qué no se cobró con la terminal vinculada.';
      end if;
      if v_motivo = 'otro' and char_length(coalesce(v_motivo_texto, '')) < 3 then
        raise exception 'Cuéntanos el motivo (escríbelo en «Otro»).';
      end if;
      if v_ult4 is not null and v_ult4 !~ '^[0-9]{4}$' then
        raise exception 'Los últimos dígitos son 4 números. Nunca captures la tarjeta completa.';
      end if;
      if exists (
        select 1 from public.tarjetas_manuales
        where negocio_id = public.negocio_actual() and folio_norm = v_norm and deleted_at is null and estado <> 'no_recibida'
      ) then
        raise exception 'El folio «%» ya está registrado en otro cobro de este negocio. Revisa el voucher: un mismo folio no se registra dos veces.', v_folio;
      end if;

      insert into public.tarjetas_manuales (
        cobro_id, cobro_metodo_id, turno_id, monto, propina, folio, folio_norm,
        motivo, motivo_texto, ultimos4, banco, sobre_tope, tope_aplicado, created_by
      ) values (
        v_cobro_id, v_cm_id, v_turno_id, v_monto, v_propina, v_folio, v_norm,
        v_motivo, case when v_motivo = 'otro' then v_motivo_texto else null end, v_ult4, v_banco,
        v_total_manual > v_tope, v_tope, auth.uid()
      ) returning id into v_tarjeta_id;

      insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
      values (public.negocio_actual(), v_tarjeta_id, 'registrada', auth.uid(),
        jsonb_build_object('cobro_id', v_cobro_id, 'turno_id', v_turno_id, 'monto', v_monto, 'folio', v_folio, 'motivo', v_motivo));
      if v_total_manual > v_tope then
        insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
        values (public.negocio_actual(), v_tarjeta_id, 'sobre_tope', auth.uid(),
          jsonb_build_object('total_manual_del_cobro', v_total_manual, 'tope', v_tope));
      end if;
    end if;
  end loop;

  return v_cobro_id;
end;
$function$;

-- ── 6. Revisión del admin ────────────────────────────────────────────
-- Lista para Caja → Conciliación y «Necesita atención». Solo admin la ve
-- (trae nombres del equipo y de clientes). Con p_historial trae también lo
-- ya revisado o marcado no recibido de los últimos 60 días.
create or replace function public.tarjetas_manuales_por_revisar(p_historial boolean default false)
returns table(
  id uuid, cobro_id uuid, reserva_id uuid, turno_id uuid, turno_cerrado boolean,
  monto numeric, propina numeric, folio text, motivo text, motivo_texto text, ultimos4 text, banco text,
  sobre_tope boolean, estado text, registrada_at timestamptz, registrada_por_nombre text, cliente_nombre text,
  devuelto numeric, revisada_at timestamptz, revisada_por_nombre text, nota_revision text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.cobro_id, c.reserva_id, t.turno_id, (tc.estado <> 'abierto'),
    t.monto, t.propina, t.folio, t.motivo, t.motivo_texto, t.ultimos4, t.banco,
    t.sobre_tope, t.estado, t.created_at,
    coalesce(nullif(btrim(pr.nombre_completo), ''), 'Alguien del equipo'),
    cl.nombre,
    coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.cobro_id = t.cobro_id and d.deleted_at is null and dm.metodo = 'tarjeta_manual'
    ), 0),
    t.revisada_at,
    coalesce(nullif(btrim(rv.nombre_completo), ''), case when t.revisada_por is null then null else 'Alguien del equipo' end),
    t.nota_revision
  from public.tarjetas_manuales t
  join public.cobros c on c.id = t.cobro_id
  join public.turnos_caja tc on tc.id = t.turno_id
  join public.reservas r on r.id = c.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  left join public.profiles pr on pr.id = t.created_by
  left join public.profiles rv on rv.id = t.revisada_por
  where t.negocio_id = public.negocio_actual()
    and t.deleted_at is null
    and coalesce(public.is_admin(), false)
    and (t.estado = 'por_revisar' or (p_historial and t.created_at > now() - interval '60 days'))
  order by (t.estado = 'por_revisar') desc, t.created_at asc;
$$;
alter function public.tarjetas_manuales_por_revisar(boolean) owner to peludesk_definer;

create or replace function public.tarjeta_manual_revisar(p_tarjeta_id uuid, p_nota text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tarjetas_manuales%rowtype;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin revisa las tarjetas manuales.' using errcode = '42501';
  end if;
  select * into v_t from public.tarjetas_manuales
  where id = p_tarjeta_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Registro de tarjeta manual no encontrado.';
  end if;
  if v_t.estado <> 'por_revisar' then
    raise exception 'Esta tarjeta ya se revisó (%).', case v_t.estado when 'revisada' then 'revisada con voucher' else 'marcada como no recibida' end;
  end if;
  update public.tarjetas_manuales
  set estado = 'revisada', revisada_por = auth.uid(), revisada_at = now(), nota_revision = nullif(btrim(p_nota), '')
  where id = p_tarjeta_id;
  insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
  values (public.negocio_actual(), p_tarjeta_id, 'revisada', auth.uid(), jsonb_build_object('nota', nullif(btrim(p_nota), '')));
end;
$$;
alter function public.tarjeta_manual_revisar(uuid, text) owner to peludesk_definer;

-- «Marcar como no recibida»: el voucher no existe o el banco no la acreditó.
-- Con la sesión del admin (no hay proveedor que consultar). Entra como una
-- devolución de origen «no_recibido» en el turno ABIERTO: el cobro original y
-- un corte ya cerrado no se tocan, y la cuenta recupera su saldo.
create or replace function public.tarjeta_manual_no_recibida(p_tarjeta_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_t public.tarjetas_manuales%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_cobro record;
  v_turno_abierto uuid;
  v_dev uuid;
  v_corr uuid;
  v_ya_devuelto numeric;
begin
  if not coalesce(public.is_admin(), false) then
    raise exception 'Solo un admin marca una tarjeta manual como no recibida.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo (qué pasó) para marcarla como no recibida.';
  end if;
  select * into v_t from public.tarjetas_manuales
  where id = p_tarjeta_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Registro de tarjeta manual no encontrado.';
  end if;
  if v_t.estado <> 'por_revisar' then
    raise exception 'Esta tarjeta ya se revisó: solo se marca como no recibida una que sigue por revisar.';
  end if;
  if v_t.propina > 0 then
    raise exception 'Este cobro de tarjeta trae propina: avisa a quien lleva la nómina antes de corregirlo.';
  end if;
  select coalesce(sum(dm.monto), 0) into v_ya_devuelto
  from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
  where d.cobro_id = v_t.cobro_id and d.deleted_at is null and dm.metodo = 'tarjeta_manual';
  if v_ya_devuelto > 0 or public.cobro_disponible_para_devolver(v_t.cobro_id) < v_t.monto - 0.005 then
    raise exception 'Este cobro ya tiene devoluciones: no se puede marcar como no recibida.';
  end if;
  select id into v_turno_abierto from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_abierto is null then
    raise exception 'No hay turno de caja abierto. Ábrelo: la corrección se anota en el turno abierto (un turno cerrado nunca cambia).';
  end if;

  select c.reserva_id, c.turno_id, c.origen, c.notas, c.created_at, c.created_by, tc.estado as turno_estado
  into v_cobro
  from public.cobros c join public.turnos_caja tc on tc.id = c.turno_id
  where c.id = v_t.cobro_id;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
  values (v_t.cobro_id, v_turno_abierto, 'Tarjeta manual no recibida (folio ' || v_t.folio || '): ' || v_motivo, auth.uid(), auth.uid(), 'no_recibido')
  returning id into v_dev;
  insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
  values (v_dev, 'tarjeta_manual', v_t.monto, auth.uid());

  insert into public.cobro_correcciones (cobro_id, devolucion_id, tipo, motivo, estado_anterior, evidencia, turno_cobro_id, turno_efecto_id, hecha_por, created_by)
  values (v_t.cobro_id, v_dev, 'tarjeta_manual_no_recibida', v_motivo,
    jsonb_build_object('reserva_id', v_cobro.reserva_id, 'turno_id', v_cobro.turno_id, 'origen', coalesce(v_cobro.origen, 'manual'),
      'notas', v_cobro.notas, 'cobrado_at', v_cobro.created_at, 'cobrado_por', v_cobro.created_by,
      'tarjeta', jsonb_build_object('folio', v_t.folio, 'monto', v_t.monto, 'motivo', v_t.motivo, 'ultimos4', v_t.ultimos4, 'banco', v_t.banco)),
    jsonb_build_object('verificado_con', 'revision_del_admin'), v_cobro.turno_id, v_turno_abierto, auth.uid(), auth.uid())
  returning id into v_corr;

  update public.tarjetas_manuales
  set estado = 'no_recibida', revisada_por = auth.uid(), revisada_at = now(), nota_revision = v_motivo, correccion_id = v_corr
  where id = p_tarjeta_id;
  insert into public.tarjetas_manuales_eventos (negocio_id, tarjeta_id, tipo, actor, detalle)
  values (public.negocio_actual(), p_tarjeta_id, 'no_recibida', auth.uid(),
    jsonb_build_object('motivo', v_motivo, 'devolucion_id', v_dev, 'turno_cobro_id', v_cobro.turno_id, 'turno_efecto_id', v_turno_abierto));

  return jsonb_build_object('devolucion_id', v_dev, 'monto', v_t.monto, 'reserva_id', v_cobro.reserva_id,
    'turno_cobro_id', v_cobro.turno_id, 'turno_efecto_id', v_turno_abierto, 'turno_del_cobro_cerrado', v_cobro.turno_estado <> 'abierto');
end;
$$;
alter function public.tarjeta_manual_no_recibida(uuid, text) owner to peludesk_definer;

-- ── 7. Avisos para «Necesita atención» (solo admin) ──────────────────
-- Por revisar, sobre el tope y patrón de uso. El patrón solo aplica a un
-- negocio con Mercado Pago o Clip elegido (en uno «solo manual» la tarjeta
-- manual es lo normal): más de 3 al día, o más del 30 % de las tarjetas de un
-- turno de hoy (con al menos 2 manuales, para no avisar por una sola).
create or replace function public.tarjetas_manuales_atencion()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_por_revisar int;
  v_sobre int;
  v_mas_viejo timestamptz;
  v_integrado boolean;
  v_hoy int;
  v_pct numeric := 0;
  v_pct_manuales int := 0;
  v_pct_total int := 0;
  r record;
begin
  if not coalesce(public.is_admin(), false) then
    return jsonb_build_object('visible', false);
  end if;
  select count(*), count(*) filter (where sobre_tope), min(created_at)
  into v_por_revisar, v_sobre, v_mas_viejo
  from public.tarjetas_manuales
  where negocio_id = public.negocio_actual() and deleted_at is null and estado = 'por_revisar';

  v_integrado := public.terminal_manual_bloqueada();
  select count(*) into v_hoy from public.tarjetas_manuales
  where negocio_id = public.negocio_actual() and deleted_at is null
    and public.fecha_negocio(created_at) = public.fecha_negocio();

  if v_integrado then
    for r in
      select tm.turno_id, count(*) as manuales
      from public.tarjetas_manuales tm
      where tm.negocio_id = public.negocio_actual() and tm.deleted_at is null
        and public.fecha_negocio(tm.created_at) = public.fecha_negocio()
      group by tm.turno_id
    loop
      declare
        v_term int;
        v_p numeric;
      begin
        select count(*) into v_term from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
        where c.turno_id = r.turno_id and cm.metodo = 'terminal';
        v_p := r.manuales::numeric / nullif(r.manuales + v_term, 0);
        if r.manuales >= 2 and v_p > v_pct then
          v_pct := v_p; v_pct_manuales := r.manuales; v_pct_total := r.manuales + v_term;
        end if;
      end;
    end loop;
  end if;

  return jsonb_build_object(
    'visible', true,
    'por_revisar', v_por_revisar,
    'sobre_tope', v_sobre,
    'mas_viejo', v_mas_viejo,
    'tope', public.tarjeta_manual_tope(),
    'integrado', v_integrado,
    'manuales_hoy', v_hoy,
    'patron_por_dia', v_integrado and v_hoy > 3,
    'patron_por_turno', v_integrado and v_pct > 0.30,
    'pct_turno', round(v_pct * 100),
    'pct_manuales', v_pct_manuales,
    'pct_total', v_pct_total
  );
end;
$$;
alter function public.tarjetas_manuales_atencion() owner to peludesk_definer;

-- Para /plataforma: negocios con Mercado Pago o Clip conectado que hoy usan
-- tarjeta manual de más. De postgres (ve todos los negocios) y solo la
-- plataforma o el servidor la llaman; está en la lista blanca de la frontera.
create or replace function public.plataforma_tarjetas_manuales_patron()
returns table(negocio_id uuid, negocio_nombre text, slug text, proveedor text, manuales_hoy int, pct_turno numeric, manuales_turno int, tarjetas_turno int, por_revisar int, sobre_tope int)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' and not coalesce((select public.es_admin_plataforma()), false) then
    raise exception 'Solo la administración de PeluDesk.' using errcode = '42501';
  end if;
  return query
  with integrados as (
    select n.id, n.nombre, n.slug, ic.proveedor, coalesce(n.zona_horaria, 'America/Mexico_City') as zona
    from public.negocios n
    join public.integraciones_cobro ic on ic.negocio_id = n.id and ic.elegida and ic.deleted_at is null and ic.proveedor in ('mercadopago', 'clip')
    where n.deleted_at is null and n.activo and coalesce(n.plan, '') not in ('demo', 'prueba')
  ),
  hoy as (
    select i.id as nid, tm.turno_id, count(*) as manuales
    from integrados i
    join public.tarjetas_manuales tm on tm.negocio_id = i.id and tm.deleted_at is null
      and (tm.created_at at time zone i.zona)::date = (now() at time zone i.zona)::date
    group by i.id, tm.turno_id
  ),
  turnos as (
    select h.nid, h.turno_id, h.manuales,
      (select count(*) from public.cobro_metodos cm join public.cobros c on c.id = cm.cobro_id
        where c.turno_id = h.turno_id and cm.metodo = 'terminal') as terminal
    from hoy h
  ),
  por_negocio as (
    select t.nid,
      sum(t.manuales)::int as manuales_hoy,
      max(case when t.manuales >= 2 then t.manuales::numeric / (t.manuales + t.terminal) else 0 end) as pct,
      (array_agg(t.manuales order by (t.manuales::numeric / (t.manuales + t.terminal)) desc))[1]::int as m_turno,
      (array_agg((t.manuales + t.terminal) order by (t.manuales::numeric / (t.manuales + t.terminal)) desc))[1]::int as tot_turno
    from turnos t group by t.nid
  )
  select i.id, i.nombre, i.slug, i.proveedor, p.manuales_hoy, round(p.pct * 100), p.m_turno, p.tot_turno,
    (select count(*)::int from public.tarjetas_manuales x where x.negocio_id = i.id and x.deleted_at is null and x.estado = 'por_revisar'),
    (select count(*)::int from public.tarjetas_manuales x where x.negocio_id = i.id and x.deleted_at is null and x.estado = 'por_revisar' and x.sobre_tope)
  from integrados i join por_negocio p on p.nid = i.id
  where p.manuales_hoy > 3 or p.pct > 0.30
  order by p.manuales_hoy desc;
end;
$$;
revoke execute on function public.plataforma_tarjetas_manuales_patron() from public, anon;
grant execute on function public.plataforma_tarjetas_manuales_patron() to authenticated, service_role;

-- Permisos de ejecución de las funciones nuevas.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.tarjeta_manual_tope()', 'public.guardar_tope_tarjeta_manual(numeric)',
    'public.tarjetas_manuales_por_revisar(boolean)', 'public.tarjeta_manual_revisar(uuid, text)',
    'public.tarjeta_manual_no_recibida(uuid, text)', 'public.tarjetas_manuales_atencion()',
    'public.registrar_cobro(uuid, text, jsonb)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ── 8. Devoluciones, turno, corte y reportes con la línea aparte ─────
CREATE OR REPLACE FUNCTION public.registrar_devolucion(p_cobro_id uuid, p_motivo text, p_metodos jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_turno_id uuid;
  v_devolucion_id uuid;
  v_metodo jsonb;
  v_monto numeric;
  v_nombre_metodo text;
  v_origen text;
  v_total_nuevo numeric;
  v_disponible numeric;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede registrar una devolución.';
  end if;

  select coalesce(origen, 'manual') into v_origen from public.cobros where id = p_cobro_id and deleted_at is null;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  if v_origen in ('mercadopago_point', 'mercadopago_link') then
    raise exception 'Este cobro entró por Mercado Pago: devuélvelo con «Devolver con Mercado Pago», que hace el reembolso y lo registra en caja.';
  end if;

  if p_motivo is null or btrim(p_motivo) = '' then
    raise exception 'Escribe el motivo de la devolución.';
  end if;

  if p_metodos is null or jsonb_typeof(p_metodos) <> 'array' or jsonb_array_length(p_metodos) = 0 then
    raise exception 'Agrega al menos un método a devolver.';
  end if;

  v_total_nuevo := (
    select coalesce(sum((m ->> 'monto')::numeric), 0)
    from jsonb_array_elements(p_metodos) m
  );
  v_disponible := public.cobro_disponible_para_devolver(p_cobro_id);
  if v_total_nuevo > v_disponible then
    raise exception 'No se puede devolver más de lo que sigue cobrado en este cobro (queda por devolver: %).', v_disponible;
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de registrar la devolución.';
  end if;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
  values (p_cobro_id, v_turno_id, btrim(p_motivo), auth.uid(), auth.uid(), 'manual')
  returning id into v_devolucion_id;

  for v_metodo in select * from jsonb_array_elements(p_metodos)
  loop
    v_nombre_metodo := v_metodo ->> 'metodo';
    v_monto := (v_metodo ->> 'monto')::numeric;

    if v_nombre_metodo is null or v_nombre_metodo not in ('efectivo', 'terminal', 'transferencia', 'tarjeta_manual') then
      raise exception 'Método de pago inválido: %', v_nombre_metodo;
    end if;
    if v_monto is null or v_monto <= 0 then
      raise exception 'Cada método debe tener un monto mayor a cero.';
    end if;

    -- Una tarjeta manual solo se devuelve hasta lo que ese cobro pasó por tarjeta manual:
    -- es una devolución manual (el reembolso integrado de Mercado Pago no aplica).
    if v_nombre_metodo = 'tarjeta_manual' and v_monto > (
      coalesce((select sum(cm.monto) from public.cobro_metodos cm where cm.cobro_id = p_cobro_id and cm.metodo = 'tarjeta_manual'), 0)
      - coalesce((select sum(dm.monto) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
          where d.cobro_id = p_cobro_id and d.deleted_at is null and dm.metodo = 'tarjeta_manual' and d.id <> v_devolucion_id), 0)
    ) then
      raise exception 'No se puede devolver por tarjeta manual más de lo que este cobro pasó por tarjeta manual.';
    end if;

    insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
    values (v_devolucion_id, v_nombre_metodo, v_monto, auth.uid());
  end loop;

  return v_devolucion_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.cerrar_turno(p_turno_id uuid, p_conteo_efectivo numeric, p_conteo_terminal numeric, p_conteo_transferencia numeric, p_explicacion_diferencias text, p_notas_cierre text)
 RETURNS TABLE(cerrado boolean, corte_id uuid, esperado_efectivo numeric, esperado_terminal numeric, esperado_transferencia numeric, diferencia_efectivo numeric, diferencia_terminal numeric, diferencia_transferencia numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_turno public.turnos_caja%rowtype;
  v_esperado_efectivo numeric;
  v_esperado_terminal numeric;
  v_esperado_transferencia numeric;
  v_esperado_tarjeta_manual numeric;
  v_diferencia_efectivo numeric;
  v_diferencia_terminal numeric;
  v_diferencia_transferencia numeric;
  v_hay_diferencia boolean;
  v_corte_id uuid;
begin
  select * into v_turno from public.turnos_caja where id = p_turno_id;
  if not found then
    raise exception 'Turno no encontrado.';
  end if;
  if v_turno.estado <> 'abierto' then
    raise exception 'Este turno ya está cerrado.';
  end if;

  if public.is_admin() then
    null;
  elsif public.current_rol() = 'recepcion' then
    if v_turno.abierto_por <> auth.uid() then
      raise exception 'Solo puedes cerrar el turno que tú abriste.';
    end if;
  else
    raise exception 'Solo admin o recepción pueden cerrar un turno.';
  end if;

  if p_conteo_efectivo is null or p_conteo_terminal is null or p_conteo_transferencia is null then
    raise exception 'Captura el conteo de los tres métodos.';
  end if;
  if p_conteo_efectivo < 0 or p_conteo_terminal < 0 or p_conteo_transferencia < 0 then
    raise exception 'El conteo no puede ser negativo.';
  end if;

  v_esperado_efectivo := v_turno.fondo_inicial
    + coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'efectivo'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'efectivo'
    ), 0)
    - coalesce((select sum(monto) from public.movimientos_caja where turno_id = p_turno_id and deleted_at is null), 0);

  v_esperado_terminal := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'terminal'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'terminal'
    ), 0);

  v_esperado_transferencia := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'transferencia'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'transferencia'
    ), 0);

  -- Tarjeta manual (sin verificar): línea aparte, sin conteo propio. Se anota con
  -- conteo = esperado (los vouchers se revisan en Conciliación) y nunca entra a la
  -- diferencia del corte.
  v_esperado_tarjeta_manual := coalesce((
      select sum(cm.monto + cm.propina) from public.cobro_metodos cm
      join public.cobros c on c.id = cm.cobro_id
      where c.turno_id = p_turno_id and cm.metodo = 'tarjeta_manual'
    ), 0)
    - coalesce((
      select sum(dm.monto) from public.devolucion_metodos dm
      join public.devoluciones d on d.id = dm.devolucion_id
      where d.turno_id = p_turno_id and dm.metodo = 'tarjeta_manual'
    ), 0);

  v_diferencia_efectivo := p_conteo_efectivo - v_esperado_efectivo;
  v_diferencia_terminal := p_conteo_terminal - v_esperado_terminal;
  v_diferencia_transferencia := p_conteo_transferencia - v_esperado_transferencia;

  v_hay_diferencia := v_diferencia_efectivo <> 0 or v_diferencia_terminal <> 0 or v_diferencia_transferencia <> 0;

  if v_hay_diferencia and (p_explicacion_diferencias is null or btrim(p_explicacion_diferencias) = '') then
    -- Fase 1 con diferencia: no se escribe nada todavía, solo se revela
    -- lo que el sistema esperaba para que la pantalla pida el motivo.
    cerrado := false;
    corte_id := null;
    esperado_efectivo := v_esperado_efectivo;
    esperado_terminal := v_esperado_terminal;
    esperado_transferencia := v_esperado_transferencia;
    diferencia_efectivo := v_diferencia_efectivo;
    diferencia_terminal := v_diferencia_terminal;
    diferencia_transferencia := v_diferencia_transferencia;
    return next;
    return;
  end if;

  insert into public.cortes_caja (turno_id, explicacion_diferencias, created_by)
  values (p_turno_id, nullif(btrim(p_explicacion_diferencias), ''), auth.uid())
  returning id into v_corte_id;

  insert into public.corte_metodos (corte_id, metodo, conteo, esperado, diferencia, created_by)
  values
    (v_corte_id, 'efectivo', p_conteo_efectivo, v_esperado_efectivo, v_diferencia_efectivo, auth.uid()),
    (v_corte_id, 'terminal', p_conteo_terminal, v_esperado_terminal, v_diferencia_terminal, auth.uid()),
    (v_corte_id, 'transferencia', p_conteo_transferencia, v_esperado_transferencia, v_diferencia_transferencia, auth.uid()),
    (v_corte_id, 'tarjeta_manual', v_esperado_tarjeta_manual, v_esperado_tarjeta_manual, 0, auth.uid());

  update public.turnos_caja
  set estado = 'cerrado', cerrado_at = now(), cerrado_por = auth.uid(), notas_cierre = nullif(btrim(p_notas_cierre), '')
  where id = p_turno_id;

  cerrado := true;
  corte_id := v_corte_id;
  esperado_efectivo := v_esperado_efectivo;
  esperado_terminal := v_esperado_terminal;
  esperado_transferencia := v_esperado_transferencia;
  diferencia_efectivo := v_diferencia_efectivo;
  diferencia_terminal := v_diferencia_terminal;
  diferencia_transferencia := v_diferencia_transferencia;
  return next;
end;
$function$;

CREATE OR REPLACE FUNCTION public.resumen_turno(p_turno_id uuid)
 RETURNS TABLE(metodo text, origen text, cobrado numeric, propinas numeric, devuelto numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with cobros_t as (
    select cm.metodo, coalesce(c.origen, 'manual') as origen, sum(cm.monto) as cobrado, sum(cm.propina) as propinas
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where c.turno_id = p_turno_id
    group by cm.metodo, coalesce(c.origen, 'manual')
  ),
  devol_t as (
    select dm.metodo, d.origen, sum(dm.monto) as devuelto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    where d.turno_id = p_turno_id
    group by dm.metodo, d.origen
  )
  select
    m.metodo,
    m.origen,
    coalesce(ct.cobrado, 0),
    coalesce(ct.propinas, 0),
    coalesce(dv.devuelto, 0)
  from (
    select unnest(array['efectivo', 'terminal', 'transferencia', 'tarjeta_manual']) as metodo,
           unnest(array['manual', 'manual', 'manual', 'manual']) as origen
    union
    select 'terminal', 'mercadopago_point'
    union
    select 'transferencia', 'mercadopago_link'
    union
    select 'terminal', 'clip_terminal'
  ) m
  left join cobros_t ct on ct.metodo = m.metodo and ct.origen = m.origen
  left join devol_t dv on dv.metodo = m.metodo and dv.origen = m.origen
  order by 1, 2;
$function$;

drop function public.reporte_financiero_periodo(date, date);
CREATE OR REPLACE FUNCTION public.reporte_financiero_periodo(p_desde date, p_hasta date)
 RETURNS TABLE(cobros_efectivo numeric, cobros_terminal numeric, cobros_transferencia numeric, propinas_efectivo numeric, propinas_terminal numeric, propinas_transferencia numeric, devoluciones_efectivo numeric, devoluciones_terminal numeric, devoluciones_transferencia numeric, retiros_efectivo numeric, bonos_vendidos numeric, bonos_consumidos numeric, descuentos_otorgados numeric, ingreso_caja_neto numeric, ingreso_reconocido numeric, cobros_tarjeta_manual numeric, propinas_tarjeta_manual numeric, devoluciones_tarjeta_manual numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if not public.tiene_permiso('reportes_financieros') then
    raise exception 'Solo un admin, o quien tenga el permiso «Reportes financieros», puede ver reportes.';
  end if;

  return query
  with cobros_periodo as (
    select cm.metodo, cm.monto, cm.propina
    from public.cobro_metodos cm
    join public.cobros c on c.id = cm.cobro_id
    where public.fecha_negocio(c.created_at) between p_desde and p_hasta
  ),
  devoluciones_periodo as (
    select dm.metodo, dm.monto
    from public.devolucion_metodos dm
    join public.devoluciones d on d.id = dm.devolucion_id
    where public.fecha_negocio(d.created_at) between p_desde and p_hasta
  ),
  retiros_periodo as (
    select coalesce(sum(monto), 0) as total
    from public.movimientos_caja
    where deleted_at is null
      and public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  bonos_periodo as (
    select
      coalesce(sum(monto) filter (where tipo = 'venta'), 0) as vendidos,
      coalesce(sum(monto) filter (where tipo = 'consumo'), 0)
        - coalesce(sum(monto) filter (where tipo = 'devolucion'), 0) as consumidos
    from public.movimientos_bono
    where public.fecha_negocio(created_at) between p_desde and p_hasta
  ),
  descuentos_periodo as (
    select coalesce(sum(monto_aplicado), 0) as total
    from public.descuentos_aplicados
    where not cancelado
      and public.fecha_negocio(created_at) between p_desde and p_hasta
  )
  select
    coalesce(sum(monto) filter (where metodo = 'efectivo'), 0),
    coalesce(sum(monto) filter (where metodo = 'terminal'), 0),
    coalesce(sum(monto) filter (where metodo = 'transferencia'), 0),
    coalesce(sum(propina) filter (where metodo = 'efectivo'), 0),
    coalesce(sum(propina) filter (where metodo = 'terminal'), 0),
    coalesce(sum(propina) filter (where metodo = 'transferencia'), 0),
    (select coalesce(sum(monto) filter (where metodo = 'efectivo'), 0) from devoluciones_periodo),
    (select coalesce(sum(monto) filter (where metodo = 'terminal'), 0) from devoluciones_periodo),
    (select coalesce(sum(monto) filter (where metodo = 'transferencia'), 0) from devoluciones_periodo),
    (select total from retiros_periodo),
    (select vendidos from bonos_periodo),
    (select consumidos from bonos_periodo),
    (select total from descuentos_periodo),
    (coalesce(sum(monto), 0) + coalesce(sum(propina), 0))
      - (select coalesce(sum(monto), 0) from devoluciones_periodo)
      - (select total from retiros_periodo),
    coalesce(sum(monto), 0)
      - (select coalesce(sum(monto), 0) from devoluciones_periodo)
      - (select vendidos from bonos_periodo)
      + (select consumidos from bonos_periodo),
    coalesce(sum(monto) filter (where metodo = 'tarjeta_manual'), 0),
    coalesce(sum(propina) filter (where metodo = 'tarjeta_manual'), 0),
    (select coalesce(sum(monto) filter (where metodo = 'tarjeta_manual'), 0) from devoluciones_periodo)
  from cobros_periodo;
end;
$function$;
revoke execute on function public.reporte_financiero_periodo(date, date) from public, anon;
grant execute on function public.reporte_financiero_periodo(date, date) to authenticated, service_role;
revoke execute on function public.resumen_turno(uuid) from public, anon;
grant execute on function public.resumen_turno(uuid) to authenticated, service_role;

-- ── 9. Frontera: la función de la plataforma y el trigger de permisos ──
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), chr(13), '') into v_def;
  if position('plataforma_tarjetas_manuales_patron' in v_def) = 0 then
    v_def := replace(v_def, $a$('avisos_marcar')$a$, $b$('avisos_marcar'), ('plataforma_tarjetas_manuales_patron'), ('permiso_tarjeta_manual_por_omision')$b$);
    if position('plataforma_tarjetas_manuales_patron' in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar plataforma_tarjetas_manuales_patron.';
    end if;
    execute v_def;
  end if;
end $$;
