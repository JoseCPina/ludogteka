-- Corregir el servicio de una cita, y que una cita nunca quede sin poder
-- mostrar su servicio (7 de octubre de 2026).
--
-- 1. CAUSA RAÍZ de «El servicio de esta cita no existe.»: validar_cita_estetica
--    buscaba el servicio con `deleted_at is null`. Cuando se retiraron del
--    catálogo los siete servicios de estética de la Fase 3 (21 de septiembre),
--    toda cita vieja que apuntaba a uno quedó imposible de tocar: cancelarla,
--    cerrarla o cambiarle el recargo lanzaba ese error aunque el servicio SÍ
--    existía (solo dado de baja). Arreglo: (a) la cita guarda el NOMBRE del
--    servicio con el que se registró (`servicio_nombre`, snapshot; el precio
--    ya vivía en `precio`), y (b) una cita que ya existía y no cambia de
--    servicio se valida contra el servicio aunque esté dado de baja. Mover su
--    fecha, perro o recargo con un servicio retirado sí se rechaza, con un
--    mensaje que manda a corregir el servicio.
--
-- 2. Permiso NUEVO `corregir_servicio` («Corregir servicio de citas»): admin
--    siempre; recepción por persona. Cambiar el servicio de una cita (abierta,
--    terminada o cobrada) va SOLO por `corregir_servicio_cita`, con motivo, y
--    deja una fila inmutable en `citas_estetica_correcciones`. El cambio
--    directo de servicio_id lo rechaza un trigger.
--
-- 3. Dinero: la cuenta es la suma de sus líneas, así que cambiar el precio de
--    la cita cambia el saldo de la cuenta y nada se «anula» ni se duplica:
--    más caro → la cuenta queda con saldo por cobrar (cobro adicional en Caja);
--    más barato y ya pagado → saldo a favor, que se devuelve con las
--    devoluciones de siempre (con Mercado Pago, «Devolver con Mercado Pago»).
--    El cobro original NUNCA se toca. Un cobro en curso (orden de terminal o
--    link abierto) se cancela ANTES (lo hace la app con el proveedor; la base
--    rechaza si queda alguno) y uno «por confirmar» bloquea hasta revisarlo.
--
-- 4. Inventario y comisiones: al corregir una cita ya finalizada se regresa al
--    inventario lo que consumió el servicio anterior (ajuste positivo) y se
--    consume lo del nuevo; la comisión y la propina se recalculan en vivo y,
--    si el periodo de nómina de la persona ya se pagó, la diferencia sale en
--    «Ajustes» de su siguiente pago (ajustes_nomina_interno), sin mover lo ya
--    pagado.

-- ── 0. Permiso «corregir_servicio» ──────────────────────────────────

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (permiso in (
  'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
  'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
  'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista',
  'corregir_servicio'
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
    'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista',
    'corregir_servicio'
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
      when 'corregir_servicio' then public.modulo_activo('estetica')
      else true
    end
  );
$function$;

-- ── 1. El nombre del servicio con el que se registró la cita ────────

alter table public.citas_estetica add column servicio_nombre text;

-- Sin disparadores (no es un cambio de la cita: no debe mover updated_at ni
-- pasar por las validaciones de servicios que ya no se ofrecen).
alter table public.citas_estetica disable trigger user;
update public.citas_estetica ce
set servicio_nombre = s.nombre
from public.servicios s
where s.id = ce.servicio_id and ce.servicio_nombre is null;
alter table public.citas_estetica enable trigger user;

create or replace function public.fijar_servicio_nombre_cita()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.servicio_nombre is null or TG_OP = 'INSERT' or new.servicio_id is distinct from old.servicio_id then
    select s.nombre into new.servicio_nombre from public.servicios s where s.id = new.servicio_id;
  end if;
  return new;
end;
$$;
create trigger fijar_servicio_nombre_cita before insert or update on public.citas_estetica
  for each row execute function public.fijar_servicio_nombre_cita();

-- ── 2. El cambio directo de servicio se rechaza ─────────────────────

create or replace function public.proteger_servicio_cita()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.servicio_id is distinct from old.servicio_id
     and coalesce(current_setting('app.correccion_servicio', true), '') <> 'on' then
    raise exception 'El servicio de una cita se cambia con «Corregir servicio», que deja historial.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger proteger_servicio_cita before update on public.citas_estetica
  for each row execute function public.proteger_servicio_cita();

-- ── 3. Historial inmutable de correcciones ──────────────────────────

create table public.citas_estetica_correcciones (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cita_id uuid not null references public.citas_estetica(id) on delete cascade,
  reserva_id uuid references public.reservas(id) on delete set null,
  servicio_anterior_id uuid references public.servicios(id),
  servicio_nuevo_id uuid not null references public.servicios(id),
  servicio_anterior_nombre text not null,
  servicio_nuevo_nombre text not null,
  precio_anterior numeric(10, 2) not null,
  precio_nuevo numeric(10, 2) not null,
  diferencia numeric(10, 2) not null,
  estado_cita text not null,
  motivo text not null check (btrim(motivo) <> ''),
  saldo_antes numeric(10, 2),
  saldo_despues numeric(10, 2),
  tipo_ajuste text not null check (tipo_ajuste in ('ninguno', 'cobro_adicional', 'saldo_a_favor')),
  ordenes_canceladas jsonb not null default '[]'::jsonb,
  inventario jsonb not null default '{}'::jsonb,
  hecha_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create index citas_estetica_correcciones_negocio_idx on public.citas_estetica_correcciones (negocio_id);
create index citas_estetica_correcciones_cita_idx on public.citas_estetica_correcciones (cita_id);
create trigger set_updated_at before insert or update on public.citas_estetica_correcciones
  for each row execute function public.set_updated_at();

create or replace function public.citas_estetica_correcciones_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El historial de correcciones de servicio no se edita ni se borra.' using errcode = '42501';
end;
$$;
create trigger citas_estetica_correcciones_inmutable before update or delete on public.citas_estetica_correcciones
  for each row execute function public.citas_estetica_correcciones_inmutable();

alter table public.citas_estetica_correcciones enable row level security;
create policy citas_estetica_correcciones_negocio on public.citas_estetica_correcciones
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy citas_estetica_correcciones_negocio_definer on public.citas_estetica_correcciones
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy citas_estetica_correcciones_escritura_ins on public.citas_estetica_correcciones
  as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy citas_estetica_correcciones_escritura_upd on public.citas_estetica_correcciones
  as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy citas_estetica_correcciones_escritura_del on public.citas_estetica_correcciones
  as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
-- Leer: el personal (trae precios). Escribir: solo por corregir_servicio_cita.
create policy citas_estetica_correcciones_select on public.citas_estetica_correcciones
  for select to authenticated using ((select public.is_staff()));
revoke all on public.citas_estetica_correcciones from anon, authenticated;
grant select on public.citas_estetica_correcciones to authenticated;
grant select, insert, update, delete on public.citas_estetica_correcciones to peludesk_definer;

-- Un módulo de estética apagado bloquea la tabla como a las demás de estética.
create trigger exigir_modulo before insert or update on public.citas_estetica_correcciones
  for each row execute function public.exigir_modulo_tabla('estetica');


-- ── 4. validar_cita_estetica: tolera un servicio dado de baja ───────

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
  v_retirado boolean := false;
begin
  -- Cambiar SOLO la estilista (reasignar_estilista_cita) no vuelve a validar ni
  -- a cotizar: un servicio que ya se retiró del catálogo, o una tarifa que ya
  -- cambió, no pueden impedir corregir quién atendió una cita que ya existe.
  if TG_OP = 'UPDATE' and coalesce(current_setting('app.reasignacion_estilista', true), '') = 'on' then
    return new;
  end if;

  -- Una cita que ya existía y NO cambia de servicio se valida contra su
  -- servicio aunque ya se haya dado de baja del catálogo (cancelarla, cerrarla
  -- o cobrarla no depende de que se siga ofreciendo). Para una cita nueva, o
  -- para cambiarle el servicio, el servicio tiene que estar vivo.
  select categoria, duracion_minutos, depende_tamano, depende_pelaje, depende_grupo_raza, pelajes_excluidos, nombre, deleted_at is not null
    into v_categoria, v_duracion, v_depende_tamano, v_depende_pelaje, v_depende_grupo, v_excluidos, v_nombre_servicio, v_retirado
  from public.servicios
  where id = new.servicio_id
    and (deleted_at is null or (TG_OP = 'UPDATE' and old.servicio_id = new.servicio_id));

  if v_categoria is null then
    raise exception 'El servicio de esta cita ya no se ofrece en el catálogo. Cambia el servicio con «Corregir servicio» en el detalle de la cita.';
  end if;
  if v_retirado and (new.inicio is distinct from old.inicio or new.perro_id is distinct from old.perro_id
      or new.pelo_maltratado is distinct from old.pelo_maltratado or new.recargo is distinct from old.recargo) then
    raise exception 'El servicio «%» ya no se ofrece en el catálogo. Corrige el servicio de esta cita (Corregir servicio) antes de cambiar su fecha, su perro o su recargo.', v_nombre_servicio;
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


-- ── 5. Cobros en curso de una cuenta ────────────────────────────────
-- Lo que impide corregir el servicio hasta resolverlo: una orden en la
-- terminal, un link de pago abierto o un cobro por confirmar con el proveedor.

create or replace function public.ordenes_abiertas_de_reservas(p_reservas uuid[])
returns table (id uuid, reserva_id uuid, tipo text, estado text, monto numeric, proveedor text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.reserva_id, o.tipo, o.estado, o.monto, o.proveedor
  from public.mp_ordenes o
  where o.negocio_id = public.negocio_actual()
    and coalesce(public.is_staff(), false)
    and o.deleted_at is null
    and o.reserva_id = any (p_reservas)
    and (
      o.estado in ('en_terminal', 'por_confirmar')
      or (o.estado = 'creada' and (o.tipo <> 'link' or o.expira_at is null or o.expira_at > now()))
    );
$$;
alter function public.ordenes_abiertas_de_reservas(uuid[]) owner to peludesk_definer;
revoke execute on function public.ordenes_abiertas_de_reservas(uuid[]) from public, anon;
grant execute on function public.ordenes_abiertas_de_reservas(uuid[]) to authenticated, service_role;

-- ── 6. Vista previa: qué pasaría con otro servicio (no cambia nada) ─
-- Hace el cambio de verdad dentro de un sub-bloque y lo deshace: así el
-- precio sale de las MISMAS reglas que la cita (grupo de precio, talla, pelaje,
-- tarifa de la fecha, excepciones), sin duplicarlas.

create or replace function public.cotizar_correccion_servicio(
  p_cita_id uuid,
  p_servicio_id uuid,
  p_grupo_excepcion_id uuid default null,
  p_excepcion_motivo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cita record;
  v_serv record;
  v_reservas uuid[];
  v_main uuid;
  v_ordenes jsonb;
  v_bloqueos text[] := '{}';
  v_saldo_antes numeric;
  v_saldo_despues numeric;
  v_pagado numeric := 0;
  v_precio_nuevo numeric;
  v_error text;
  v_pide_excepcion boolean := false;
  v_ok boolean := false;
  v_tipo text := 'ninguno';
  v_dif numeric;
  v_desc numeric := 0;
  v_nombre_actual text;
begin
  if coalesce(public.current_rol(), '') not in ('admin', 'recepcion')
     or not coalesce(public.tiene_permiso('corregir_servicio'), false) then
    raise exception 'Corregir el servicio de una cita es de admin o de quien tenga el permiso «Corregir servicio de citas».'
      using errcode = '42501';
  end if;

  select ce.id, ce.servicio_id, ce.servicio_nombre, ce.estado, ce.precio, ce.reserva_id, e.reserva_id as reserva_estancia
    into v_cita
  from public.citas_estetica ce
  left join public.estancias e on e.id = ce.estancia_id
  where ce.id = p_cita_id and ce.deleted_at is null;
  if not found then
    raise exception 'No encontramos esa cita.';
  end if;
  v_main := v_cita.reserva_id;
  v_reservas := array_remove(array[v_cita.reserva_id, v_cita.reserva_estancia], null);
  v_nombre_actual := coalesce(v_cita.servicio_nombre, (select s.nombre from public.servicios s where s.id = v_cita.servicio_id), 'Servicio');

  select s.id, s.nombre, s.categoria into v_serv
  from public.servicios s where s.id = p_servicio_id and s.deleted_at is null;

  if v_cita.estado in ('cancelada', 'no_llego') then
    v_bloqueos := v_bloqueos || 'Esta cita está cerrada (cancelada o no llegó): no tiene servicio que corregir.';
  end if;
  if v_serv.id is null then
    v_bloqueos := v_bloqueos || 'Ese servicio no existe o ya no se ofrece.';
  elsif v_serv.categoria <> 'estetica' then
    v_bloqueos := v_bloqueos || 'Escoge un servicio de estética.';
  elsif v_serv.id = v_cita.servicio_id then
    v_bloqueos := v_bloqueos || 'Es el mismo servicio que ya tiene la cita.';
  end if;
  if exists (
    select 1 from public.movimientos_bono mb
    where mb.item_tipo = 'estetica' and mb.item_id = p_cita_id and mb.tipo = 'consumo'
  ) then
    v_bloqueos := v_bloqueos || 'Esta cita se cubrió con un pase: corrige primero el consumo del pase.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('id', o.id, 'tipo', o.tipo, 'estado', o.estado, 'monto', o.monto, 'proveedor', o.proveedor) order by o.estado), '[]'::jsonb)
    into v_ordenes
  from public.ordenes_abiertas_de_reservas(v_reservas) o;
  if exists (select 1 from public.ordenes_abiertas_de_reservas(v_reservas) o where o.estado = 'por_confirmar') then
    v_bloqueos := v_bloqueos || 'Hay un cobro por confirmar con el proveedor: revísalo en la cuenta antes de corregir el servicio.';
  end if;

  select t.saldo, t.total_cobrado - t.total_devuelto into v_saldo_antes, v_pagado
  from public.cuenta_totales_reserva(v_main) t;
  select coalesce(sum(da.monto_aplicado), 0) into v_desc
  from public.descuentos_aplicados da where da.reserva_id = v_main and da.cancelado = false;

  if cardinality(v_bloqueos) = 0 then
    begin
      perform set_config('app.correccion_servicio', 'on', true);
      if p_grupo_excepcion_id is not null then
        update public.citas_estetica
        set servicio_id = p_servicio_id,
            grupo_raza_excepcion_id = p_grupo_excepcion_id,
            excepcion_grupo_motivo = nullif(btrim(coalesce(p_excepcion_motivo, '')), '')
        where id = p_cita_id;
      else
        update public.citas_estetica set servicio_id = p_servicio_id where id = p_cita_id;
      end if;
      select precio into v_precio_nuevo from public.citas_estetica where id = p_cita_id;
      select saldo into v_saldo_despues from public.cuenta_totales_reserva(v_main);
      raise exception using errcode = 'P0099', message = 'cotizacion';
    exception
      when sqlstate 'P0099' then
        v_ok := true;
      when others then
        v_error := sqlerrm;
        v_pide_excepcion := v_error ilike '%grupo de precio%' or v_error ilike '%solo cobra autom_tico%';
    end;
    perform set_config('app.correccion_servicio', 'off', true);
  end if;

  v_dif := coalesce(v_precio_nuevo, v_cita.precio) - v_cita.precio;
  if v_ok then
    v_tipo := case
      when v_dif = 0 or v_pagado <= 0 then 'ninguno'
      when v_dif > 0 and v_saldo_despues > 0 then 'cobro_adicional'
      when v_dif < 0 and v_saldo_despues < 0 then 'saldo_a_favor'
      else 'ninguno'
    end;
  end if;

  return jsonb_build_object(
    'ok', v_ok and cardinality(v_bloqueos) = 0,
    'error', case when cardinality(v_bloqueos) > 0 then v_bloqueos[1] else v_error end,
    'bloqueos', to_jsonb(v_bloqueos),
    'pide_excepcion', v_pide_excepcion,
    'servicio_actual', v_nombre_actual,
    'servicio_nuevo', v_serv.nombre,
    'precio_actual', v_cita.precio,
    'precio_nuevo', v_precio_nuevo,
    'diferencia', case when v_ok then v_dif end,
    'estado_cita', v_cita.estado,
    'pagado', v_pagado,
    'saldo_actual', v_saldo_antes,
    'saldo_despues', v_saldo_despues,
    'tipo_ajuste', v_tipo,
    'descuento_cuenta', v_desc,
    'ordenes_abiertas', v_ordenes
  );
end;
$$;
alter function public.cotizar_correccion_servicio(uuid, uuid, uuid, text) owner to peludesk_definer;
revoke execute on function public.cotizar_correccion_servicio(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.cotizar_correccion_servicio(uuid, uuid, uuid, text) to authenticated, service_role;

-- ── 7. Corregir el servicio ─────────────────────────────────────────

create or replace function public.corregir_servicio_cita(
  p_cita_id uuid,
  p_servicio_id uuid,
  p_motivo text,
  p_grupo_excepcion_id uuid default null,
  p_excepcion_motivo text default null,
  p_precio_esperado numeric default null,
  p_ordenes_canceladas jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_cita record;
  v_serv record;
  v_reservas uuid[];
  v_main uuid;
  v_saldo_antes numeric;
  v_saldo_despues numeric;
  v_pagado numeric := 0;
  v_precio_nuevo numeric;
  v_tipo text := 'ninguno';
  v_dif numeric;
  v_nombre_ant text;
  v_inv jsonb := '{}'::jsonb;
  v_n_regresa int := 0;
  v_n_consume int := 0;
  v_r record;
  v_tamano uuid;
  v_ajuste_nomina boolean := false;
  v_id uuid;
  v_abierta record;
begin
  if coalesce(public.current_rol(), '') not in ('admin', 'recepcion')
     or not coalesce(public.tiene_permiso('corregir_servicio'), false) then
    raise exception 'Corregir el servicio de una cita es de admin o de quien tenga el permiso «Corregir servicio de citas».'
      using errcode = '42501';
  end if;
  if v_motivo is null then
    raise exception 'Escribe el motivo de la corrección: el cambio queda en el historial de la cita.';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception 'El motivo es demasiado largo (máximo 300 caracteres).';
  end if;

  select ce.id, ce.servicio_id, ce.servicio_nombre, ce.estado, ce.precio, ce.reserva_id, ce.empleado_id, e.reserva_id as reserva_estancia
    into v_cita
  from public.citas_estetica ce
  left join public.estancias e on e.id = ce.estancia_id
  where ce.id = p_cita_id and ce.deleted_at is null
  for update of ce;
  if not found then
    raise exception 'No encontramos esa cita.';
  end if;
  if v_cita.estado in ('cancelada', 'no_llego') then
    raise exception 'Esta cita está cerrada (cancelada o no llegó): no tiene servicio que corregir.';
  end if;
  if v_cita.servicio_id = p_servicio_id then
    raise exception 'Es el mismo servicio que ya tiene la cita.';
  end if;

  select s.id, s.nombre, s.categoria into v_serv
  from public.servicios s where s.id = p_servicio_id and s.deleted_at is null;
  if v_serv.id is null then
    raise exception 'Ese servicio no existe o ya no se ofrece.';
  end if;
  if v_serv.categoria <> 'estetica' then
    raise exception 'Escoge un servicio de estética.';
  end if;
  if exists (
    select 1 from public.movimientos_bono mb
    where mb.item_tipo = 'estetica' and mb.item_id = p_cita_id and mb.tipo = 'consumo'
  ) then
    raise exception 'Esta cita se cubrió con un pase: corrige primero el consumo del pase.';
  end if;

  v_main := v_cita.reserva_id;
  v_reservas := array_remove(array[v_cita.reserva_id, v_cita.reserva_estancia], null);

  -- Un cobro en curso por el monto equivocado: la app lo cancela con el
  -- proveedor ANTES de llamar aquí. Si queda alguno, no se cambia nada.
  select o.* into v_abierta from public.ordenes_abiertas_de_reservas(v_reservas) o
  order by (o.estado = 'por_confirmar') desc limit 1;
  if found then
    if v_abierta.estado = 'por_confirmar' then
      raise exception 'Hay un cobro por confirmar con el proveedor (por $%): revísalo en la cuenta antes de corregir el servicio.', v_abierta.monto;
    end if;
    raise exception 'Hay % abierto por $% en esta cuenta. Se cancela antes de corregir el servicio.',
      case when v_abierta.tipo = 'link' then 'un link de pago' else 'un cobro en la terminal' end, v_abierta.monto;
  end if;

  v_nombre_ant := coalesce(v_cita.servicio_nombre, (select s.nombre from public.servicios s where s.id = v_cita.servicio_id), 'Servicio');
  select t.saldo, t.total_cobrado - t.total_devuelto into v_saldo_antes, v_pagado
  from public.cuenta_totales_reserva(v_main) t;

  perform set_config('app.correccion_servicio', 'on', true);
  if p_grupo_excepcion_id is not null then
    update public.citas_estetica
    set servicio_id = p_servicio_id,
        grupo_raza_excepcion_id = p_grupo_excepcion_id,
        excepcion_grupo_motivo = nullif(btrim(coalesce(p_excepcion_motivo, '')), '')
    where id = p_cita_id;
  else
    update public.citas_estetica set servicio_id = p_servicio_id where id = p_cita_id;
  end if;
  perform set_config('app.correccion_servicio', 'off', true);

  select precio, tamano_id into v_precio_nuevo, v_tamano from public.citas_estetica where id = p_cita_id;
  if p_precio_esperado is not null and v_precio_nuevo is distinct from p_precio_esperado then
    raise exception 'El precio cambió desde que lo viste (ahora es $%). Vuelve a calcularlo antes de confirmar.', v_precio_nuevo;
  end if;
  v_dif := v_precio_nuevo - v_cita.precio;

  select t.saldo into v_saldo_despues from public.cuenta_totales_reserva(v_main) t;
  v_tipo := case
    when v_dif = 0 or v_pagado <= 0 then 'ninguno'
    when v_dif > 0 and v_saldo_despues > 0 then 'cobro_adicional'
    when v_dif < 0 and v_saldo_despues < 0 then 'saldo_a_favor'
    else 'ninguno'
  end;

  -- Inventario: si el servicio ya se cerró, regresa lo que consumió el
  -- anterior y consume lo del nuevo (movimientos nuevos; nada se reescribe).
  if v_cita.estado = 'finalizada' then
    for v_r in
      select mi.insumo_id,
        sum(case when mi.tipo = 'salida_consumo' then mi.cantidad_base
                 when mi.tipo = 'ajuste_positivo' then -mi.cantidad_base
                 when mi.tipo = 'ajuste_negativo' then mi.cantidad_base else 0 end) as neto
      from public.movimientos_inventario mi
      where mi.cita_estetica_id = p_cita_id and mi.deleted_at is null
      group by mi.insumo_id
      having sum(case when mi.tipo = 'salida_consumo' then mi.cantidad_base
                      when mi.tipo = 'ajuste_positivo' then -mi.cantidad_base
                      when mi.tipo = 'ajuste_negativo' then mi.cantidad_base else 0 end) > 0
    loop
      insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, cita_estetica_id)
      values (v_r.insumo_id, 'ajuste_positivo', v_r.neto,
        'Corrección de servicio de la cita: regresa lo que consumió «' || v_nombre_ant || '»', p_cita_id);
      v_n_regresa := v_n_regresa + 1;
    end loop;
    if v_tamano is not null then
      for v_r in
        select r.insumo_id, r.cantidad_consumo * um.equivalencia_en_base as base
        from public.recetas_consumo r
        join public.insumos i on i.id = r.insumo_id and i.deleted_at is null
        join public.unidades_medida um on um.id = i.unidad_consumo_id
        where r.servicio_id = p_servicio_id and r.tamano_id = v_tamano and r.deleted_at is null
          and r.cantidad_consumo > 0
      loop
        insert into public.movimientos_inventario (insumo_id, tipo, cantidad_base, motivo, cita_estetica_id)
        values (v_r.insumo_id, 'salida_consumo', v_r.base,
          'Corrección de servicio de la cita: consume lo de «' || v_serv.nombre || '»', p_cita_id);
        v_n_consume := v_n_consume + 1;
      end loop;
    end if;
    v_inv := jsonb_build_object('regresados', v_n_regresa, 'consumidos', v_n_consume);
  end if;

  insert into public.citas_estetica_correcciones (
    cita_id, reserva_id, servicio_anterior_id, servicio_nuevo_id, servicio_anterior_nombre, servicio_nuevo_nombre,
    precio_anterior, precio_nuevo, diferencia, estado_cita, motivo, saldo_antes, saldo_despues, tipo_ajuste,
    ordenes_canceladas, inventario)
  values (
    p_cita_id, v_main, v_cita.servicio_id, p_servicio_id, v_nombre_ant, v_serv.nombre,
    v_cita.precio, v_precio_nuevo, v_dif, v_cita.estado, v_motivo, v_saldo_antes, v_saldo_despues, v_tipo,
    coalesce(p_ordenes_canceladas, '[]'::jsonb), v_inv)
  returning id into v_id;

  -- ¿Hay nómina ya pagada que ajustar? (la diferencia sale en el siguiente pago)
  if v_cita.estado = 'finalizada' and v_cita.empleado_id is not null then
    v_ajuste_nomina := exists (
      select 1 from public.empleados e
      where e.deleted_at is null and e.profile_id = v_cita.empleado_id
        and jsonb_array_length(public.ajustes_nomina_interno(e.id, public.fecha_negocio(), p_cita_id)) > 0
    );
  end if;

  return jsonb_build_object(
    'correccion_id', v_id,
    'servicio_anterior', v_nombre_ant,
    'servicio_nuevo', v_serv.nombre,
    'precio_anterior', v_cita.precio,
    'precio_nuevo', v_precio_nuevo,
    'diferencia', v_dif,
    'estado_cita', v_cita.estado,
    'tipo_ajuste', v_tipo,
    'saldo_despues', v_saldo_despues,
    'reserva_id', v_main,
    'inventario', v_inv,
    'ajuste_nomina', v_ajuste_nomina
  );
end;
$$;
alter function public.corregir_servicio_cita(uuid, uuid, text, uuid, text, numeric, jsonb) owner to peludesk_definer;
revoke execute on function public.corregir_servicio_cita(uuid, uuid, text, uuid, text, numeric, jsonb) from public, anon;
grant execute on function public.corregir_servicio_cita(uuid, uuid, text, uuid, text, numeric, jsonb) to authenticated, service_role;

-- ── 8. Historial de una cita (con nombres) ──────────────────────────

create or replace function public.historial_correcciones_servicio_cita(p_cita_id uuid)
returns table (
  id uuid, cuando timestamptz, servicio_anterior text, servicio_nuevo text,
  precio_anterior numeric, precio_nuevo numeric, diferencia numeric, estado_cita text,
  motivo text, por_nombre text, tipo_ajuste text, reserva_id uuid, saldo_actual numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.created_at, k.servicio_anterior_nombre, k.servicio_nuevo_nombre,
    k.precio_anterior, k.precio_nuevo, k.diferencia, k.estado_cita, k.motivo,
    coalesce(nullif(btrim(h.nombre_completo), ''), 'Alguien del equipo'),
    k.tipo_ajuste, k.reserva_id,
    case when k.reserva_id is null then null
         else (select t.saldo from public.cuenta_totales_reserva(k.reserva_id) t) end
  from public.citas_estetica_correcciones k
  left join public.profiles h on h.id = k.hecha_por
  where k.cita_id = p_cita_id and k.deleted_at is null
    and k.negocio_id = public.negocio_actual()
    and coalesce(public.is_staff(), false)
  order by k.created_at desc;
$$;
alter function public.historial_correcciones_servicio_cita(uuid) owner to peludesk_definer;
revoke execute on function public.historial_correcciones_servicio_cita(uuid) from public, anon;
grant execute on function public.historial_correcciones_servicio_cita(uuid) to authenticated, service_role;

-- ── 9. Ajustes de cuenta que esperan (Necesita atención) ────────────
-- La última corrección de cada cita cuyo ajuste sigue sin resolverse: saldo
-- a favor sin devolver, o cobro adicional sin cobrar. Se resuelve solo cuando
-- el saldo de la cuenta llega a cero (con la devolución o el cobro de siempre).

create or replace function public.ajustes_servicio_por_atender()
returns table (
  correccion_id uuid, cita_id uuid, reserva_id uuid, cliente_nombre text, perro text,
  servicio_anterior text, servicio_nuevo text, diferencia numeric, tipo_ajuste text,
  saldo numeric, desde timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with ult as (
    select distinct on (k.cita_id) k.*
    from public.citas_estetica_correcciones k
    where k.negocio_id = public.negocio_actual() and k.deleted_at is null
    order by k.cita_id, k.created_at desc
  )
  select k.id, k.cita_id, k.reserva_id, cl.nombre, p.nombre,
    k.servicio_anterior_nombre, k.servicio_nuevo_nombre, k.diferencia, k.tipo_ajuste,
    t.saldo, k.created_at
  from ult k
  join public.reservas r on r.id = k.reserva_id
  join public.clientes cl on cl.id = r.cliente_id
  join public.citas_estetica ce on ce.id = k.cita_id
  join public.perros p on p.id = ce.perro_id
  cross join lateral public.cuenta_totales_reserva(k.reserva_id) t
  where coalesce(public.is_staff(), false)
    and k.tipo_ajuste in ('cobro_adicional', 'saldo_a_favor')
    and ((k.tipo_ajuste = 'saldo_a_favor' and t.saldo < 0) or (k.tipo_ajuste = 'cobro_adicional' and t.saldo > 0))
  order by k.created_at asc;
$$;
alter function public.ajustes_servicio_por_atender() owner to peludesk_definer;
revoke execute on function public.ajustes_servicio_por_atender() from public, anon;
grant execute on function public.ajustes_servicio_por_atender() to authenticated, service_role;

-- ── 10. Ajustes de nómina ───────────────────────────────────────────

-- Los ajustes de nómina también cubren las correcciones de servicio de una cita
-- ya terminada (lo que cambia es el servicio y, con él, el precio y la comisión).
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
      and (exists (
        select 1 from public.citas_estetica_asignaciones a
        where a.cita_id = ce.id and a.estado_cita = 'finalizada' and a.deleted_at is null)
        or exists (
        select 1 from public.citas_estetica_correcciones k
        where k.cita_id = ce.id and k.estado_cita = 'finalizada' and k.deleted_at is null))
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
          where ce.reserva_id = co.reserva_id and ce.deleted_at is null
            and (p_cita_id is null or ce.id = p_cita_id)
            and (exists (
              select 1 from public.citas_estetica_asignaciones a
              where a.cita_id = ce.id and a.estado_cita = 'finalizada' and a.deleted_at is null)
              or exists (
              select 1 from public.citas_estetica_correcciones k
              where k.cita_id = ce.id and k.estado_cita = 'finalizada' and k.deleted_at is null)))
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
