-- Reasignar o corregir la estilista de una cita de estética — 5 de octubre de 2026.
--
-- Antes: la estilista se escogía al agendar y no había cómo cambiarla (la
-- política RLS dejaba a admin y recepción hacer UPDATE, pero no había botón
-- ni historial, y «sin asignar» no existía: empleado_id era NOT NULL).
--
-- Reglas:
--  · Antes de iniciar (reservada/confirmada): admin y recepción, sin motivo,
--    y también «sin asignar».
--  · En curso: admin y recepción, motivo opcional.
--  · Terminada (finalizada, cobrada o no): admin o el permiso NUEVO
--    «corregir_estilista», con motivo obligatorio.
--  · Cancelada / no llegó: no se reasigna (no hay servicio que atribuir).
--  · Solo estilistas vivas del negocio (membresía estética o admin, sin
--    baja). Todo por `reasignar_estilista_cita`; el cambio directo de
--    empleado_id lo rechaza un trigger. Cada cambio deja una fila en
--    `citas_estetica_asignaciones` (quién, cuándo, de quién a quién, estado
--    de la cita y motivo): nunca se reescribe en silencio.
--  · Dinero: un pago de nómina ya registrado NUNCA cambia, ni un corte de
--    caja. La comisión y la propina se calculan en vivo por la estilista de
--    la cita, así que si el periodo de quien la tenía ya se pagó, la
--    diferencia se calcula como AJUSTE (`ajustes_nomina_interno`) y viaja en
--    el siguiente pago de cada quien (negativa a quien ya cobró de más,
--    positiva a quien no cobró), documentada en el desglose del pago
--    (`ajustes_detalle`). Se deduce del estado actual (no se guarda un
--    monto): si un pago se revierte, el ajuste se reacomoda solo.

-- ── 0. Permiso «corregir_estilista» ─────────────────────────────────

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (permiso in (
  'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
  'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
  'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista'
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
    'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista'
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

CREATE OR REPLACE FUNCTION public.tiene_permiso(p_permiso text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  -- Nunca NULL: un anónimo o alguien sin membresía da false, no NULL.
  select (
    coalesce(public.is_admin(), false)
    or (
      public.current_rol() = 'recepcion'
      and exists (
        select 1 from public.permisos_staff ps
        where ps.profile_id = auth.uid()
          and ps.negocio_id = public.negocio_actual()
          and ps.permiso = p_permiso
          and ps.revocado_at is null
          and ps.deleted_at is null
      )
    )
  ) and (
    case p_permiso
      when 'reportes_financieros' then public.modulo_activo('reportes')
      when 'nomina' then public.modulo_activo('empleados')
      when 'gastos' then public.modulo_activo('gastos')
      when 'inventario_costos' then public.modulo_activo('inventario')
      when 'plantillas_contrato' then public.modulo_activo('contratos')
      when 'reportes_guarderia' then public.modulo_activo('guarderia') or public.modulo_activo('hotel')
      when 'corregir_estilista' then public.modulo_activo('estetica')
      else true
    end
  );
$function$;

-- ── 1. «Sin asignar» ────────────────────────────────────────────────
-- Con NULL el EXCLUDE de traslape no choca (NULL no es igual a nada): varias
-- citas sin asignar a la misma hora son válidas hasta que se les ponga estilista.

alter table public.citas_estetica alter column empleado_id drop not null;

-- ── 2. Historial de asignaciones ────────────────────────────────────

create table public.citas_estetica_asignaciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cita_id uuid not null references public.citas_estetica(id) on delete cascade,
  de_empleado_id uuid references auth.users(id) on delete set null,
  a_empleado_id uuid references auth.users(id) on delete set null,
  estado_cita text not null,
  motivo text,
  hecha_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index citas_estetica_asignaciones_negocio_idx on public.citas_estetica_asignaciones (negocio_id);
create index citas_estetica_asignaciones_cita_idx on public.citas_estetica_asignaciones (cita_id);
create trigger set_updated_at before insert or update on public.citas_estetica_asignaciones
  for each row execute function public.set_updated_at();
alter table public.citas_estetica_asignaciones enable row level security;

create policy citas_estetica_asignaciones_negocio on public.citas_estetica_asignaciones
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy citas_estetica_asignaciones_negocio_definer on public.citas_estetica_asignaciones
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy citas_estetica_asignaciones_escritura_ins on public.citas_estetica_asignaciones
  as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy citas_estetica_asignaciones_escritura_upd on public.citas_estetica_asignaciones
  as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy citas_estetica_asignaciones_escritura_del on public.citas_estetica_asignaciones
  as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
-- Leer: el personal del negocio. Escribir: solo por reasignar_estilista_cita.
create policy citas_estetica_asignaciones_select on public.citas_estetica_asignaciones
  for select to authenticated using ((select public.is_staff()));
revoke all on public.citas_estetica_asignaciones from anon, authenticated;
grant select on public.citas_estetica_asignaciones to authenticated;
grant select, insert, update, delete on public.citas_estetica_asignaciones to peludesk_definer;

-- ── 3. El cambio directo de estilista se rechaza ────────────────────

create or replace function public.proteger_estilista_cita()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.empleado_id is distinct from old.empleado_id
     and coalesce(current_setting('app.reasignacion_estilista', true), '') <> 'on' then
    raise exception 'La estilista de una cita se cambia con «Reasignar estilista», que deja historial.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger proteger_estilista_cita before update on public.citas_estetica
  for each row execute function public.proteger_estilista_cita();

-- ── 4. Estilistas que se pueden asignar ─────────────────────────────

create or replace function public.estilistas_asignables()
returns table (id uuid, nombre text, rol text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         coalesce(nullif(btrim(p.nombre_completo), ''), 'Sin nombre') as nombre,
         m.rol
  from public.membresias m
  join public.profiles p on p.id = m.profile_id
  where m.negocio_id = public.negocio_actual()
    and m.deleted_at is null and p.deleted_at is null
    and m.rol in ('estetica', 'admin')
    and coalesce(public.is_staff(), false)
    and not exists (
      select 1 from public.empleados e
      where e.profile_id = p.id and e.negocio_id = m.negocio_id and e.deleted_at is null
        and e.fecha_baja is not null and e.fecha_baja <= public.fecha_negocio()
    )
  order by (m.rol = 'estetica') desc, 2;
$$;
alter function public.estilistas_asignables() owner to peludesk_definer;
revoke execute on function public.estilistas_asignables() from public, anon;
grant execute on function public.estilistas_asignables() to authenticated, service_role;

-- ── 5. Reasignar ────────────────────────────────────────────────────

create or replace function public.reasignar_estilista_cita(
  p_cita_id uuid,
  p_empleado_id uuid,
  p_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rol text := coalesce(public.current_rol(), '');
  v_cita record;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_de text;
  v_a text;
  v_ajuste boolean := false;
begin
  if v_rol not in ('admin', 'recepcion') then
    raise exception 'Solo admin y recepción cambian la estilista de una cita.' using errcode = '42501';
  end if;
  if v_motivo is not null and char_length(v_motivo) > 300 then
    raise exception 'El motivo es demasiado largo (máximo 300 caracteres).';
  end if;

  select ce.id, ce.empleado_id, ce.estado, ce.inicio, ce.fin into v_cita
  from public.citas_estetica ce
  where ce.id = p_cita_id and ce.deleted_at is null
  for update;
  if not found then
    raise exception 'No encontramos esa cita.';
  end if;

  if v_cita.estado in ('cancelada', 'no_llego') then
    raise exception 'Esta cita está cerrada (%): ya no se le asigna estilista.',
      case when v_cita.estado = 'cancelada' then 'cancelada' else 'no llegó' end;
  end if;
  if v_cita.empleado_id is not distinct from p_empleado_id then
    return jsonb_build_object('sin_cambio', true);
  end if;

  if v_cita.estado = 'finalizada' then
    if not coalesce(public.tiene_permiso('corregir_estilista'), false) then
      raise exception 'Corregir la estilista de un servicio ya terminado es de admin o de quien tenga el permiso «Corregir estilista de servicios cerrados».'
        using errcode = '42501';
    end if;
    if v_motivo is null then
      raise exception 'Escribe el motivo de la corrección: el servicio ya terminó y el cambio queda en el historial.';
    end if;
  end if;

  if p_empleado_id is null then
    if v_cita.estado not in ('reservada', 'confirmada') then
      raise exception 'Una cita que ya empezó no puede quedarse sin estilista: escoge a quién se la pasas.';
    end if;
  else
    if not exists (select 1 from public.estilistas_asignables() e where e.id = p_empleado_id) then
      raise exception 'Esa persona no es una estilista activa de este negocio.';
    end if;
  end if;

  select coalesce(max(coalesce(nullif(btrim(pr.nombre_completo), ''), 'Sin nombre')), 'Sin asignar') into v_de
  from public.profiles pr where pr.id = v_cita.empleado_id;
  select coalesce(max(coalesce(nullif(btrim(pr.nombre_completo), ''), 'Sin nombre')), 'Sin asignar') into v_a
  from public.profiles pr where pr.id = p_empleado_id;

  perform set_config('app.reasignacion_estilista', 'on', true);
  begin
    update public.citas_estetica set empleado_id = p_empleado_id where id = p_cita_id;
  exception when exclusion_violation then
    perform set_config('app.reasignacion_estilista', 'off', true);
    raise exception '% ya tiene otra cita a esa hora (% – %). Escoge a otra persona o mueve esa cita primero.',
      v_a, to_char(v_cita.inicio at time zone public.zona_negocio(), 'HH24:MI'), to_char(v_cita.fin at time zone public.zona_negocio(), 'HH24:MI');
  end;
  perform set_config('app.reasignacion_estilista', 'off', true);

  insert into public.citas_estetica_asignaciones (cita_id, de_empleado_id, a_empleado_id, estado_cita, motivo)
  values (p_cita_id, v_cita.empleado_id, p_empleado_id, v_cita.estado, v_motivo);

  if v_cita.estado = 'finalizada' then
    v_ajuste := exists (
      select 1
      from public.empleados e
      where e.deleted_at is null and e.profile_id in (v_cita.empleado_id, p_empleado_id)
        and jsonb_array_length(public.ajustes_nomina_interno(e.id, public.fecha_negocio(), p_cita_id)) > 0
    );
  end if;

  return jsonb_build_object(
    'de', v_de, 'a', v_a, 'estado', v_cita.estado, 'motivo', v_motivo,
    'ajuste_nomina', v_ajuste
  );
end;
$$;
alter function public.reasignar_estilista_cita(uuid, uuid, text) owner to peludesk_definer;
revoke execute on function public.reasignar_estilista_cita(uuid, uuid, text) from public, anon;
grant execute on function public.reasignar_estilista_cita(uuid, uuid, text) to authenticated, service_role;


-- ── 6. Historial de una cita (con nombres) ──────────────────────────
-- Recepción no lee profiles del personal: por función, del negocio de la petición.

create or replace function public.historial_asignaciones_cita(p_cita_id uuid)
returns table (id uuid, cuando timestamptz, de_nombre text, a_nombre text, estado_cita text, motivo text, por_nombre text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.created_at,
    coalesce(nullif(btrim(d.nombre_completo), ''), case when a.de_empleado_id is null then 'Sin asignar' else 'Sin nombre' end),
    coalesce(nullif(btrim(n.nombre_completo), ''), case when a.a_empleado_id is null then 'Sin asignar' else 'Sin nombre' end),
    a.estado_cita, a.motivo,
    coalesce(nullif(btrim(h.nombre_completo), ''), 'Alguien del equipo')
  from public.citas_estetica_asignaciones a
  left join public.profiles d on d.id = a.de_empleado_id
  left join public.profiles n on n.id = a.a_empleado_id
  left join public.profiles h on h.id = a.hecha_por
  where a.cita_id = p_cita_id and a.deleted_at is null
    and a.negocio_id = public.negocio_actual()
    and coalesce(public.is_staff(), false)
  order by a.created_at desc;
$$;
alter function public.historial_asignaciones_cita(uuid) owner to peludesk_definer;
revoke execute on function public.historial_asignaciones_cita(uuid) from public, anon;
grant execute on function public.historial_asignaciones_cita(uuid) to authenticated, service_role;

-- ── 7. Ajustes de nómina por cambios de estilista ───────────────────
-- Para un empleado y hasta una fecha, lo que su pago de nómina YA registrado
-- no refleja porque la estilista de un servicio terminado cambió después:
--   correcto − pagado, solo en periodos que un pago vigente ya cubre
--   (en los que no, el cálculo en vivo ya trae lo correcto).
-- «pagado» = lo de esa cita (o cobro) en los pagos vigentes de la persona
-- (comisiones_detalle / propinas_detalle) + los ajustes ya aplicados en un
-- pago (ajustes_detalle). Solo se revisan citas con una corrección posterior
-- a terminarse: lo demás se comporta como siempre. Con p_cita_id se acota a
-- una cita (lo usa reasignar_estilista_cita para avisar si hay ajuste).

create or replace function public.ajustes_nomina_interno(p_empleado_id uuid, p_hasta date, p_cita_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile uuid;
  v_recibe_propinas boolean;
  v_com jsonb := '[]'::jsonb;
  v_prop jsonb := '[]'::jsonb;
begin
  select e.profile_id into v_profile from public.empleados e where e.id = p_empleado_id and e.deleted_at is null;
  if v_profile is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    (select ep.recibe_propinas from public.esquemas_pago ep
     where ep.empleado_id = p_empleado_id and ep.deleted_at is null and ep.vigente_desde <= p_hasta
     order by ep.vigente_desde desc, ep.created_at desc limit 1),
    true) into v_recibe_propinas;

  -- Comisiones
  with pv as (
    select np.periodo_desde, np.periodo_hasta, np.desglose
    from public.nomina_pagos np
    where np.empleado_id = p_empleado_id and np.tipo = 'pago' and np.deleted_at is null
      and not exists (select 1 from public.nomina_pagos r where r.reverso_de = np.id)
  ), cc as (
    select ce.id, ce.empleado_id, ce.servicio_id, ce.perro_id, public.fecha_negocio(ce.inicio) as fecha
    from public.citas_estetica ce
    where ce.deleted_at is null and ce.estado = 'finalizada'
      and public.fecha_negocio(ce.inicio) <= p_hasta
      and (p_cita_id is null or ce.id = p_cita_id)
      and exists (
        select 1 from public.citas_estetica_asignaciones a
        where a.cita_id = ce.id and a.estado_cita = 'finalizada' and a.deleted_at is null)
  ), y as (
    select cc.*,
      case when cc.empleado_id = v_profile then public.comision_de_cita(cc.id) else 0 end as correcto,
      coalesce((select sum((x ->> 'comision')::numeric) from pv, jsonb_array_elements(pv.desglose -> 'comisiones_detalle') x
                where (x ->> 'cita_id')::uuid = cc.id), 0)
      + coalesce((select sum((x ->> 'monto')::numeric) from pv, jsonb_array_elements(coalesce(pv.desglose -> 'ajustes_detalle', '[]'::jsonb)) x
                  where x ->> 'tipo' = 'comision' and (x ->> 'ref_id')::uuid = cc.id), 0) as pagado,
      exists (select 1 from pv where cc.fecha between pv.periodo_desde and pv.periodo_hasta) as cubierto
    from cc
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'tipo', 'comision', 'ref_id', y.id, 'fecha', y.fecha, 'perro', p.nombre, 'servicio', s.nombre,
      'monto', round(y.correcto - y.pagado, 2)) order by y.fecha), '[]'::jsonb)
  into v_com
  from y
  join public.servicios s on s.id = y.servicio_id
  join public.perros p on p.id = y.perro_id
  where y.cubierto and abs(y.correcto - y.pagado) >= 0.01;

  -- Propinas
  if v_recibe_propinas then
    with pv as (
      select np.periodo_desde, np.periodo_hasta, np.desglose
      from public.nomina_pagos np
      where np.empleado_id = p_empleado_id and np.tipo = 'pago' and np.deleted_at is null
        and not exists (select 1 from public.nomina_pagos r where r.reverso_de = np.id)
    ), cb as (
      select co.id, co.reserva_id, public.fecha_negocio(co.created_at) as fecha, sum(cm.propina) as propina
      from public.cobros co
      join public.cobro_metodos cm on cm.cobro_id = co.id
      where co.deleted_at is null and public.fecha_negocio(co.created_at) <= p_hasta
        and exists (
          select 1 from public.citas_estetica ce
          join public.citas_estetica_asignaciones a on a.cita_id = ce.id and a.estado_cita = 'finalizada' and a.deleted_at is null
          where ce.reserva_id = co.reserva_id and ce.deleted_at is null
            and (p_cita_id is null or ce.id = p_cita_id))
      group by co.id
      having sum(cm.propina) > 0
    ), y as (
      select cb.id, cb.fecha,
        coalesce(round(cb.propina * case when t.total_precio > 0 then t.mio_precio / t.total_precio
          else t.mio_cuenta::numeric / nullif(t.total_cuenta, 0) end, 2), 0) as correcto,
        coalesce((select sum((x ->> 'propina')::numeric) from pv, jsonb_array_elements(pv.desglose -> 'propinas_detalle') x
                  where (x ->> 'cobro_id')::uuid = cb.id), 0)
        + coalesce((select sum((x ->> 'monto')::numeric) from pv, jsonb_array_elements(coalesce(pv.desglose -> 'ajustes_detalle', '[]'::jsonb)) x
                    where x ->> 'tipo' = 'propina' and (x ->> 'ref_id')::uuid = cb.id), 0) as pagado,
        exists (select 1 from pv where cb.fecha between pv.periodo_desde and pv.periodo_hasta) as cubierto
      from cb
      cross join lateral (
        select coalesce(sum(ce.precio), 0) as total_precio,
          coalesce(sum(ce.precio) filter (where ce.empleado_id = v_profile), 0) as mio_precio,
          count(*) as total_cuenta,
          count(*) filter (where ce.empleado_id = v_profile) as mio_cuenta
        from public.citas_estetica ce
        where ce.reserva_id = cb.reserva_id and ce.deleted_at is null and ce.estado not in ('cancelada', 'no_llego')
      ) t
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'tipo', 'propina', 'ref_id', y.id, 'fecha', y.fecha, 'perro', null, 'servicio', null,
        'monto', round(y.correcto - y.pagado, 2)) order by y.fecha), '[]'::jsonb)
    into v_prop
    from y
    where y.cubierto and abs(y.correcto - y.pagado) >= 0.01;
  end if;

  return v_com || v_prop;
end;
$$;
alter function public.ajustes_nomina_interno(uuid, date, uuid) owner to peludesk_definer;
revoke execute on function public.ajustes_nomina_interno(uuid, date, uuid) from public, anon, authenticated;
grant execute on function public.ajustes_nomina_interno(uuid, date, uuid) to service_role;

-- ── 8. calcular_nomina_interno (suma los ajustes) y validar_cita_estetica
--      (iniciar o terminar pide estilista) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.calcular_nomina_interno(p_empleado_id uuid, p_desde date, p_hasta date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_ini date;
  v_fin date;
  v_dias_suyos int;
  v_aj jsonb := '[]'::jsonb;
  v_aj_com numeric := 0;
  v_aj_prop numeric := 0;
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
  -- Los días del periodo que de verdad le tocan: desde su ingreso y hasta
  -- su baja. El sueldo nunca se paga por días antes de que entrara.
  v_ini := greatest(p_desde, v_emp.fecha_ingreso);
  v_fin := least(p_hasta, coalesce(v_emp.fecha_baja, p_hasta));
  v_dias_suyos := greatest(0, v_fin - v_ini + 1);

  if p_hasta > public.fecha_negocio() then
    v_avisos := array_append(v_avisos, format(
      'El periodo todavía no termina (acaba el %s): esto es una proyección. Se puede pagar hasta hoy o cuando termine.',
      to_char(p_hasta, 'DD/MM/YYYY')));
  end if;

  if not v_hay_esquema then
    v_avisos := array_append(v_avisos, 'No tiene esquema de pago vigente en el periodo: solo se calculan comisiones, propinas y adelantos.');
  else
    if v_esq.sueldo_monto is not null then
      v_base := case v_esq.sueldo_periodicidad when 'semanal' then 7 when 'quincenal' then 15 else 30 end;
      v_tarifa_dia := round(v_esq.sueldo_monto / v_base, 2);
      v_completo := v_ini = p_desde and v_fin = p_hasta and case v_esq.sueldo_periodicidad
        when 'semanal' then v_dias_periodo = 7
        when 'quincenal' then (extract(day from p_desde) = 1 and p_hasta = p_desde + 14)
          or (extract(day from p_desde) = 16 and p_hasta = v_fin_mes)
        else extract(day from p_desde) = 1 and p_hasta = v_fin_mes
      end;
      if v_completo then
        v_sueldo := v_esq.sueldo_monto;
      else
        v_sueldo := round(v_esq.sueldo_monto * v_dias_suyos / v_base, 2);
        v_avisos := array_append(v_avisos, format(
          'El sueldo se prorrateó por %s %s ($%s por día) porque %s.',
          v_dias_suyos,
          case when v_dias_suyos = 1 then 'día' else 'días' end,
          to_char(v_tarifa_dia, 'FM999,999,990.00'),
          case
            when v_emp.fecha_ingreso > p_desde then 'entró el ' || to_char(v_emp.fecha_ingreso, 'DD/MM/YYYY')
            when v_emp.fecha_baja is not null and v_emp.fecha_baja < p_hasta then 'su baja fue el ' || to_char(v_emp.fecha_baja, 'DD/MM/YYYY')
            else 'el periodo no es ' || case v_esq.sueldo_periodicidad
              when 'semanal' then 'una semana completa' when 'quincenal' then 'una quincena completa' else 'un mes completo' end
          end));
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

    -- Ajustes por cambios de estilista en servicios cuyo periodo ya se pagó
    -- (reasignar_estilista_cita): el pago cerrado no cambia, la diferencia
    -- viaja en el siguiente pago de quien corresponda.
    v_aj := public.ajustes_nomina_interno(p_empleado_id, p_hasta);
    select coalesce(sum((x ->> 'monto')::numeric) filter (where x ->> 'tipo' = 'comision'), 0),
           coalesce(sum((x ->> 'monto')::numeric) filter (where x ->> 'tipo' = 'propina'), 0)
    into v_aj_com, v_aj_prop
    from jsonb_array_elements(v_aj) x;
    v_com := v_com + v_aj_com;
    v_prop := v_prop + v_aj_prop;
    if jsonb_array_length(v_aj) > 0 then
      v_avisos := array_append(v_avisos, 'Incluye ajustes por cambios de estilista en servicios de periodos que ya se pagaron.');
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
    v_avisos := array_append(v_avisos, 'Ya hay un pago registrado que cubre parte de este periodo.');
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
    'ajustes_detalle', v_aj,
    'adelantos', v_adel,
    'adelantos_detalle', v_adel_det,
    'total', v_sueldo - v_desc_faltas + v_pago_dias + v_com + v_prop - v_adel,
    'costo', v_sueldo - v_desc_faltas + v_pago_dias + v_com,
    'avisos', to_jsonb(v_avisos)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.validar_cita_estetica()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_categoria text;
  v_duracion int;
  v_depende_tamano boolean;
  v_depende_pelaje boolean;
  v_depende_grupo boolean;
  v_excluidos text[];
  v_nombre_servicio text;
  v_precio numeric;
  v_estado_precio text;
  v_fecha_local date;
  v_estancia record;
  v_fechas_cambiaron boolean;
  v_hora_cierre time;
  v_grupo record;
  v_permitidos text[];
  v_pelaje_clave text;
  v_cambio_recargo boolean;
begin
  select categoria, duracion_minutos, depende_tamano, depende_pelaje, depende_grupo_raza, pelajes_excluidos, nombre
    into v_categoria, v_duracion, v_depende_tamano, v_depende_pelaje, v_depende_grupo, v_excluidos, v_nombre_servicio
  from public.servicios
  where id = new.servicio_id and deleted_at is null;

  if v_categoria is null then
    raise exception 'El servicio de esta cita no existe.';
  end if;
  if v_categoria <> 'estetica' then
    raise exception 'Una cita de estética solo puede usar un servicio de categoría estetica.';
  end if;

  -- Iniciar o terminar un servicio pide una estilista: sin ella no hay a
  -- quién atribuirle la comisión ni el trabajo.
  if new.empleado_id is null and new.estado in ('en_curso', 'finalizada') then
    raise exception 'Esta cita no tiene estilista asignada. Asígnale una antes de iniciar o terminar el servicio.';
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

  -- El recargo manual: con motivo, de quien tenga «excepciones al reservar»,
  -- y no sobre una cita que ya se cobró o se cerró.
  new.recargo := coalesce(new.recargo, 0);
  v_cambio_recargo := TG_OP = 'INSERT' or new.recargo is distinct from old.recargo;
  if new.recargo < 0 then
    raise exception 'El recargo no puede ser negativo.';
  end if;
  if v_cambio_recargo and (new.recargo > 0 or (TG_OP = 'UPDATE' and old.recargo > 0)) then
    if not coalesce((select public.tiene_permiso('excepciones_reserva')), false) then
      raise exception 'Aplicar o quitar un recargo es de admin o de quien tenga el permiso de excepciones al reservar.' using errcode = '42501';
    end if;
    if TG_OP = 'UPDATE' and old.estado in ('finalizada', 'cancelada', 'no_llego') then
      raise exception 'Esta cita ya se cerró: no se le puede cambiar el recargo.';
    end if;
    if new.recargo > 0 then
      if btrim(coalesce(new.recargo_motivo, '')) = '' then
        raise exception 'El recargo necesita un motivo.';
      end if;
      new.recargo_por := auth.uid();
    else
      new.recargo_motivo := null;
      new.recargo_por := null;
    end if;
  end if;

  v_fechas_cambiaron := TG_OP = 'INSERT'
    or new.servicio_id is distinct from old.servicio_id
    or new.perro_id is distinct from old.perro_id
    or new.inicio is distinct from old.inicio
    or new.pelo_maltratado is distinct from old.pelo_maltratado
    or new.recargo is distinct from old.recargo;

  if v_fechas_cambiaron then
    -- Servicios que no se ofrecen a ciertos pelajes (el rapado, a pelo corto).
    if coalesce(cardinality(v_excluidos), 0) > 0 then
      select pe.clave into v_pelaje_clave
      from public.perros p left join public.tipos_pelaje pe on pe.id = p.pelaje_id
      where p.id = new.perro_id;
      if v_pelaje_clave is null then
        raise exception 'Este perro no tiene pelaje registrado y «%» depende de él. Complétalo en su expediente: /perros/%', v_nombre_servicio, new.perro_id;
      end if;
      if v_pelaje_clave = any (v_excluidos) then
        raise exception '«%» no se ofrece a perros con pelaje %. Escoge otro servicio, o corrige el pelaje del perro si está mal capturado: /perros/%', v_nombre_servicio, v_pelaje_clave, new.perro_id;
      end if;
    end if;

    if v_depende_grupo then
      select * into v_grupo from public.perro_grupo_raza where perro_id = new.perro_id;
      if coalesce(v_grupo.sin_grupo, false) then
        -- O el grupo de la raza no está decidido en este negocio, o el grupo
        -- no cobra automático a ese pelaje: no se adivina. O se resuelve
        -- (asignar el grupo / corregir el pelaje) o la cita lleva una
        -- excepción con grupo y motivo.
        if new.grupo_raza_excepcion_id is null then
          if v_grupo.sin_grupo_motivo = 'pelaje' then
            raise exception 'El grupo «%» de este perro solo cobra automático a ciertos pelajes y él tiene pelaje %. Corrige su pelaje en su expediente (/perros/%) o registra una excepción de grupo de precio con motivo al agendar la cita.', v_grupo.grupo_nombre, coalesce(v_grupo.pelaje_clave, 'sin capturar'), new.perro_id;
          end if;
          raise exception 'La raza % de este perro todavía no tiene grupo de precio en este negocio. Asígnalo en /perros/razas/grupos o registra una excepción al agendar la cita.', v_grupo.raza_nombre;
        end if;
        if btrim(coalesce(new.excepcion_grupo_motivo, '')) = '' then
          raise exception 'La excepción de grupo de precio necesita un motivo.';
        end if;
        if not coalesce((select public.tiene_permiso('excepciones_reserva')), false) then
          raise exception 'Registrar una excepción de grupo de precio es de admin o de quien tenga el permiso de excepciones al reservar.' using errcode = '42501';
        end if;
        select g.id, g.depende_tamano, g.pelajes_permitidos into v_grupo.grupo_raza_id, v_grupo.depende_tamano, v_permitidos
        from public.grupos_raza g where g.id = new.grupo_raza_excepcion_id and g.deleted_at is null;
        if v_grupo.grupo_raza_id is null then
          raise exception 'El grupo de la excepción no existe en este negocio.';
        end if;
        if v_permitidos is not null and (v_grupo.pelaje_clave is null or not (v_grupo.pelaje_clave = any (v_permitidos))) then
          raise exception 'El grupo de la excepción tampoco cobra automático al pelaje de este perro. Escoge otro grupo.';
        end if;
        new.excepcion_grupo_por := auth.uid();
      else
        new.grupo_raza_excepcion_id := null;
        new.excepcion_grupo_motivo := null;
        new.excepcion_grupo_por := null;
      end if;
      if v_grupo.grupo_raza_id is null then
        raise exception 'No se pudo determinar el grupo de raza de este perro. Revisa el catálogo de razas.';
      end if;

      if v_grupo.depende_tamano then
        select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
        if new.tamano_id is null then
          raise exception 'Este perro no tiene talla registrada y su grupo de raza cobra por talla. Captúrala en /perros/%', new.perro_id;
        end if;
      else
        new.tamano_id := null;
      end if;
    elsif v_depende_tamano then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene talla registrada y el precio depende de ella. Captúrala en /perros/%', new.perro_id;
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
      case when v_depende_grupo then v_grupo.grupo_raza_id else null end,
      new.pelo_maltratado
    );

    if v_estado_precio = 'sin_tarifa' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local, case when v_depende_grupo then v_grupo.grupo_raza_id else null end);
    elsif v_estado_precio = 'no_aplica' then
      raise exception '%', public.describir_precio_faltante(new.servicio_id, new.tamano_id, new.pelaje_id, 1, v_fecha_local, case when v_depende_grupo then v_grupo.grupo_raza_id else null end, 'no_aplica');
    end if;

    new.precio_base := v_precio;
    new.precio := v_precio + new.recargo;
  end if;

  -- Sin bloqueo sanitario aquí (ver encabezado). La marca de excepción
  -- ya no hace nada; si alguien la manda, no cambia el resultado.

  select hora_cierre into v_hora_cierre
  from public.resolver_cupo_configuracion(v_fecha_local);

  new.fuera_de_horario := v_hora_cierre is not null
    and public.hora_negocio(new.fin) > v_hora_cierre;

  return new;
end;
$function$;
