-- Estética: reprogramar, cancelar / «no llegó» y eliminar una cita CON historial,
-- y la regla de que una cita cobrada no se mueve sin anular su cobro primero.
--
-- ANTES: «Reagendar», «Cancelar» y «Marcar no llegó» eran un UPDATE directo a la
-- cita: sin motivo, sin historial, sin revisar si la cuenta ya tenía un cobro (se
-- cancelaba una cita cobrada y el dinero quedaba colgado), y reagendar volvía a
-- cotizar el precio con la tarifa de la fecha nueva. No existía «eliminar».
--
-- AHORA (misma forma que «Reasignar estilista» y «Corregir servicio»): tres
-- funciones, todo cambio de agenda en `citas_estetica_cambios` (inmutable, con el
-- antes y el después, motivo, quién y cuándo) y un trigger que rechaza el UPDATE
-- directo de la fecha, del estado cancelada/no_llego y de la baja (salvo la puerta
-- `app.cambio_agenda`, que solo prenden estas funciones). La llave de servicio
-- (siembras y limpiezas) sigue pasando.
--
--   * reprogramar_cita_estetica: solo reservada o confirmada, sin cobro, sin
--     empalmes con otra cita de la estilista, el precio NO se vuelve a cotizar (lo
--     acordado se respeta aunque cambie la tarifa).
--   * cancelar_cita_estetica: «cancelada» (con motivo) o «no llegó» (la persona no
--     se presentó). Una cita con cobro pasa primero por la anulación del cobro.
--   * eliminar_cita_estetica: para una cita capturada por error o duplicada. No se
--     borra físicamente: deleted_at + historial; el horario se libera. Permiso
--     nuevo «eliminar_citas» (admin siempre; recepción apagado).
--
-- REVERSA: volver a poner validar_cita_estetica de 20261007000600 y quitar el
-- trigger proteger_agenda_cita; las tablas y columnas nuevas pueden quedarse.
-- Sin datos que respaldar: la migración no cambia ninguna fila existente.

-- ── 0. Permiso «eliminar_citas» ───────────────────────────────────────

alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
alter table public.permisos_staff add constraint permisos_staff_permiso_check check (permiso in (
  'inventario_costos', 'tarifas', 'reportes_financieros', 'personal',
  'configuracion_negocio', 'excepciones_reserva', 'descuentos_sin_tope',
  'plantillas_contrato', 'nomina', 'gastos', 'reportes_guarderia', 'corregir_estilista',
  'corregir_servicio', 'tarjeta_manual', 'ajustar_pases',
  'anular_cobros', 'editar_monto_cobros', 'corregir_turnos_cerrados', 'agregar_efectivo',
  'eliminar_citas'
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
    'corregir_servicio', 'tarjeta_manual', 'ajustar_pases',
    'anular_cobros', 'editar_monto_cobros', 'corregir_turnos_cerrados', 'agregar_efectivo',
    'eliminar_citas'
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

create or replace function public.tiene_permiso(p_permiso text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
      when 'eliminar_citas' then public.modulo_activo('estetica')
      when 'ajustar_pases' then public.modulo_activo('bonos')
      else true
    end
  );
$$;

-- ── 1. Historial de cambios de agenda ─────────────────────────────────

create table public.citas_estetica_cambios (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cita_id uuid not null references public.citas_estetica(id),
  tipo text not null check (tipo in ('reprogramacion', 'cancelacion', 'no_llego', 'eliminacion', 'tarifa_guarderia')),
  motivo text,
  estado_antes text not null,
  estado_despues text not null,
  inicio_antes timestamptz not null,
  inicio_despues timestamptz not null,
  fin_antes timestamptz not null,
  fin_despues timestamptz not null,
  detalle jsonb,
  hecha_por uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (tipo not in ('cancelacion', 'eliminacion') or char_length(btrim(coalesce(motivo, ''))) >= 3)
);
create index citas_estetica_cambios_negocio_idx on public.citas_estetica_cambios (negocio_id);
create index citas_estetica_cambios_cita_idx on public.citas_estetica_cambios (cita_id, created_at desc);
create trigger set_updated_at before insert or update on public.citas_estetica_cambios
  for each row execute function public.set_updated_at();
alter table public.citas_estetica_cambios enable row level security;
create policy citas_estetica_cambios_select on public.citas_estetica_cambios
  for select to authenticated using ((select coalesce(public.is_staff(), false)));
create policy citas_estetica_cambios_negocio on public.citas_estetica_cambios
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy citas_estetica_cambios_negocio_definer on public.citas_estetica_cambios
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy citas_estetica_cambios_escritura_ins on public.citas_estetica_cambios
  as restrictive for insert to authenticated, peludesk_definer with check ((select public.exigir_negocio_escribible()));
create policy citas_estetica_cambios_escritura_upd on public.citas_estetica_cambios
  as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy citas_estetica_cambios_escritura_del on public.citas_estetica_cambios
  as restrictive for delete to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible()));
grant select on public.citas_estetica_cambios to authenticated;
grant select, insert, update, delete on public.citas_estetica_cambios to peludesk_definer;

-- Historial inmutable: solo se inserta.
create or replace function public.citas_estetica_cambios_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'El historial de cambios de una cita no se edita ni se borra.';
end;
$$;
revoke execute on function public.citas_estetica_cambios_inmutable() from public, anon, authenticated;
create trigger citas_estetica_cambios_inmutable before update or delete on public.citas_estetica_cambios
  for each row execute function public.citas_estetica_cambios_inmutable();

-- ── 2. Solo las funciones mueven la agenda ────────────────────────────

create or replace function public.proteger_agenda_cita()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or coalesce(current_setting('app.cambio_agenda', true), '') = 'on' then
    return new;
  end if;
  if new.inicio is distinct from old.inicio then
    raise exception 'La fecha de una cita se cambia con «Reprogramar» (queda en el historial).' using errcode = '42501';
  end if;
  if new.estado in ('cancelada', 'no_llego') and old.estado not in ('cancelada', 'no_llego') then
    raise exception 'Una cita se cancela con «Cancelar cita» o «No se presentó» (con su motivo y su historial).' using errcode = '42501';
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    raise exception 'Una cita se elimina con «Eliminar cita» (con su motivo y su historial).' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke execute on function public.proteger_agenda_cita() from public, anon, authenticated;
create trigger proteger_agenda_cita before update on public.citas_estetica
  for each row execute function public.proteger_agenda_cita();

-- ── 3. Reprogramar sin volver a cotizar ───────────────────────────────
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
  v_grupo_dep_pelaje boolean := false;
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
  -- Reprogramar (reprogramar_cita_estetica) solo mueve la hora: lo acordado no se
  -- vuelve a cotizar con la tarifa de la fecha nueva.
  if TG_OP = 'UPDATE' and coalesce(current_setting('app.reprogramacion_cita', true), '') = 'on'
     and new.servicio_id is not distinct from old.servicio_id and new.perro_id is not distinct from old.perro_id
     and new.pelo_maltratado is not distinct from old.pelo_maltratado and new.recargo is not distinct from old.recargo then
    v_fechas_cambiaron := false;
  end if;

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
      if coalesce(v_grupo.sin_grupo, false) or new.grupo_raza_excepcion_id is not null then
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

    -- El grupo de raza puede cobrar por pelaje (la matriz del mestizo): ese
    -- pelaje entra al precio de ESE grupo aunque el servicio no dependa de él.
    if v_depende_grupo then
      v_grupo_dep_pelaje := coalesce((select g.depende_pelaje from public.grupos_raza g where g.id = v_grupo.grupo_raza_id), false);
    end if;
    if v_depende_pelaje or v_grupo_dep_pelaje then
      select pelaje_id into new.pelaje_id from public.perros where id = new.perro_id;
      if new.pelaje_id is null then
        raise exception 'Este perro no tiene pelaje registrado. Captúralo en su expediente (/perros/%) antes de reservar.', new.perro_id;
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

    -- Al CORREGIR el servicio de una cita vieja puede no haber tarifa vigente en
    -- la fecha de la cita (se capturó antes de que existiera): se usa la
    -- tarifa de hoy y se marca para decírselo a quien corrige.
    if v_estado_precio = 'sin_tarifa'
       and coalesce(current_setting('app.correccion_servicio', true), '') = 'on'
       and v_fecha_local < public.fecha_negocio() then
      select precio, estado into v_precio, v_estado_precio
      from public.resolver_precio(
        new.servicio_id, new.tamano_id, new.pelaje_id, 1, public.fecha_negocio(),
        case when v_depende_grupo then v_grupo.grupo_raza_id else null end,
        new.pelo_maltratado
      );
      if v_estado_precio not in ('sin_tarifa', 'no_aplica') then
        perform set_config('app.correccion_tarifa_hoy', 'on', true);
      end if;
    end if;

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

create or replace function public.reprogramar_cita_estetica(p_cita_id uuid, p_inicio timestamptz, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.citas_estetica%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_cobrado numeric;
  v_nuevo public.citas_estetica%rowtype;
  v_perro text;
  v_cliente record;
  v_servicio text;
begin
  select * into c from public.citas_estetica
  where id = p_cita_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Cita no encontrada.';
  end if;
  if not (public.current_rol() in ('admin', 'recepcion') or (public.current_rol() = 'estetica' and c.empleado_id = auth.uid())) then
    raise exception 'Solo admin, recepción o la estilista de la cita la reprograman.' using errcode = '42501';
  end if;
  if p_inicio is null then
    raise exception 'Elige la fecha y la hora nuevas.';
  end if;
  if c.estado not in ('reservada', 'confirmada') then
    raise exception 'Solo se reprograma una cita que todavía no empieza (reservada o confirmada). Esta está %.', replace(c.estado, '_', ' ');
  end if;
  if p_inicio = c.inicio then
    raise exception 'Esa ya es la fecha y la hora de la cita.';
  end if;
  if p_inicio < now() - interval '5 minutes' then
    raise exception 'La fecha nueva ya pasó. Elige una fecha y hora que todavía no lleguen.';
  end if;
  select t.total_cobrado into v_cobrado from public.cuenta_totales_reserva(c.reserva_id) t;
  if coalesce(v_cobrado, 0) > 0 then
    raise exception 'Esta cita ya tiene un cobro ($%). Anula el cobro primero (Caja → la cuenta → Anular cobro) y luego reprograma la cita: /caja/cobrar/%', v_cobrado, c.reserva_id;
  end if;

  perform set_config('app.cambio_agenda', 'on', true);
  perform set_config('app.reprogramacion_cita', 'on', true);
  begin
    update public.citas_estetica set inicio = p_inicio, fin = null where id = p_cita_id
    returning * into v_nuevo;
  exception when exclusion_violation then
    perform set_config('app.cambio_agenda', 'off', true);
    perform set_config('app.reprogramacion_cita', 'off', true);
    raise exception 'La estilista ya tiene otra cita que se empalma con ese horario. Elige otra hora, o cambia primero a la estilista.';
  end;
  perform set_config('app.cambio_agenda', 'off', true);
  perform set_config('app.reprogramacion_cita', 'off', true);

  insert into public.citas_estetica_cambios (cita_id, tipo, motivo, estado_antes, estado_despues, inicio_antes, inicio_despues, fin_antes, fin_despues, detalle)
  values (p_cita_id, 'reprogramacion', v_motivo, c.estado, v_nuevo.estado, c.inicio, v_nuevo.inicio, c.fin, v_nuevo.fin,
    jsonb_build_object('fuera_de_horario', v_nuevo.fuera_de_horario, 'empleado_id', v_nuevo.empleado_id));

  select p.nombre into v_perro from public.perros p where p.id = c.perro_id;
  select cl.nombre, cl.telefono into v_cliente from public.clientes cl join public.reservas r on r.cliente_id = cl.id where r.id = c.reserva_id;
  select coalesce(c.servicio_nombre, s.nombre) into v_servicio from public.servicios s where s.id = c.servicio_id;
  return jsonb_build_object('cita_id', p_cita_id, 'inicio_antes', c.inicio, 'inicio_despues', v_nuevo.inicio, 'fin_despues', v_nuevo.fin,
    'fuera_de_horario', v_nuevo.fuera_de_horario, 'perro_nombre', v_perro, 'cliente_nombre', v_cliente.nombre,
    'cliente_telefono', v_cliente.telefono, 'servicio_nombre', v_servicio);
end;
$$;
alter function public.reprogramar_cita_estetica(uuid, timestamptz, text) owner to peludesk_definer;
revoke execute on function public.reprogramar_cita_estetica(uuid, timestamptz, text) from public, anon;
grant execute on function public.reprogramar_cita_estetica(uuid, timestamptz, text) to authenticated, service_role;

-- ── 4. Cancelar («cancelada») o «no se presentó» ──────────────────────

create or replace function public.cancelar_cita_estetica(p_cita_id uuid, p_motivo text, p_no_llego boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.citas_estetica%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_cobrado numeric;
  v_destino text := case when coalesce(p_no_llego, false) then 'no_llego' else 'cancelada' end;
  v_perro text;
  v_cliente record;
  v_servicio text;
begin
  select * into c from public.citas_estetica
  where id = p_cita_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Cita no encontrada.';
  end if;
  if not (public.current_rol() in ('admin', 'recepcion') or (public.current_rol() = 'estetica' and c.empleado_id = auth.uid())) then
    raise exception 'Solo admin, recepción o la estilista de la cita la cancelan.' using errcode = '42501';
  end if;
  if c.estado not in ('reservada', 'confirmada') then
    raise exception 'Solo se cancela una cita que todavía no empieza (reservada o confirmada). Esta está %.', replace(c.estado, '_', ' ');
  end if;
  if v_destino = 'cancelada' and char_length(coalesce(v_motivo, '')) < 3 then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;
  select t.total_cobrado into v_cobrado from public.cuenta_totales_reserva(c.reserva_id) t;
  if coalesce(v_cobrado, 0) > 0 then
    raise exception 'Esta cita ya tiene un cobro ($%). Anula el cobro primero (Caja → la cuenta → Anular cobro) y luego cancela la cita: /caja/cobrar/%', v_cobrado, c.reserva_id;
  end if;

  perform set_config('app.cambio_agenda', 'on', true);
  update public.citas_estetica set estado = v_destino where id = p_cita_id;
  perform set_config('app.cambio_agenda', 'off', true);

  insert into public.citas_estetica_cambios (cita_id, tipo, motivo, estado_antes, estado_despues, inicio_antes, inicio_despues, fin_antes, fin_despues)
  values (p_cita_id, case when v_destino = 'no_llego' then 'no_llego' else 'cancelacion' end, v_motivo, c.estado, v_destino, c.inicio, c.inicio, c.fin, c.fin);

  select p.nombre into v_perro from public.perros p where p.id = c.perro_id;
  select cl.nombre, cl.telefono into v_cliente from public.clientes cl join public.reservas r on r.cliente_id = cl.id where r.id = c.reserva_id;
  select coalesce(c.servicio_nombre, s.nombre) into v_servicio from public.servicios s where s.id = c.servicio_id;
  return jsonb_build_object('cita_id', p_cita_id, 'estado', v_destino, 'inicio', c.inicio, 'perro_nombre', v_perro,
    'cliente_nombre', v_cliente.nombre, 'cliente_telefono', v_cliente.telefono, 'servicio_nombre', v_servicio);
end;
$$;
alter function public.cancelar_cita_estetica(uuid, text, boolean) owner to peludesk_definer;
revoke execute on function public.cancelar_cita_estetica(uuid, text, boolean) from public, anon;
grant execute on function public.cancelar_cita_estetica(uuid, text, boolean) to authenticated, service_role;

-- ── 5. Eliminar una cita (capturada por error o duplicada) ────────────

create or replace function public.eliminar_cita_estetica(p_cita_id uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.citas_estetica%rowtype;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_cobrado numeric;
begin
  if not coalesce(public.tiene_permiso('eliminar_citas'), false) then
    raise exception 'No tienes el permiso «Eliminar citas». Pídeselo a un admin (Administración → Permisos). Para una cita que ya no va, usa «Cancelar cita».' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo por el que se elimina la cita.';
  end if;
  select * into c from public.citas_estetica
  where id = p_cita_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Cita no encontrada.';
  end if;
  if c.estado in ('en_curso', 'finalizada') then
    raise exception 'Una cita que ya empezó o ya terminó no se elimina (hay consumo de inventario, comisión y cuenta ligados). Si estaba mal el servicio o el precio, corrígelos en la cita.';
  end if;
  select t.total_cobrado into v_cobrado from public.cuenta_totales_reserva(c.reserva_id) t;
  if coalesce(v_cobrado, 0) > 0 then
    raise exception 'Esta cita ya tiene un cobro ($%). Anula el cobro primero (Caja → la cuenta → Anular cobro) y luego elimina la cita: /caja/cobrar/%', v_cobrado, c.reserva_id;
  end if;

  perform set_config('app.cambio_agenda', 'on', true);
  update public.citas_estetica set deleted_at = now() where id = p_cita_id;
  perform set_config('app.cambio_agenda', 'off', true);

  insert into public.citas_estetica_cambios (cita_id, tipo, motivo, estado_antes, estado_despues, inicio_antes, inicio_despues, fin_antes, fin_despues)
  values (p_cita_id, 'eliminacion', v_motivo, c.estado, c.estado, c.inicio, c.inicio, c.fin, c.fin);
  return jsonb_build_object('cita_id', p_cita_id, 'estado_antes', c.estado);
end;
$$;
alter function public.eliminar_cita_estetica(uuid, text) owner to peludesk_definer;
revoke execute on function public.eliminar_cita_estetica(uuid, text) from public, anon;
grant execute on function public.eliminar_cita_estetica(uuid, text) to authenticated, service_role;

-- ── 6. El historial, con nombres (recepción no lee profiles) ──────────

create or replace function public.historial_cambios_cita(p_cita_id uuid)
returns table (id uuid, cuando timestamptz, tipo text, motivo text, estado_antes text, estado_despues text,
  inicio_antes timestamptz, inicio_despues timestamptz, por_nombre text, detalle jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select k.id, k.created_at, k.tipo, k.motivo, k.estado_antes, k.estado_despues, k.inicio_antes, k.inicio_despues,
    coalesce(nullif(btrim(h.nombre_completo), ''), 'Alguien del equipo'), k.detalle
  from public.citas_estetica_cambios k
  left join public.profiles h on h.id = k.hecha_por
  where k.cita_id = p_cita_id and k.deleted_at is null
    and k.negocio_id = public.negocio_actual()
    and coalesce(public.is_staff(), false)
  order by k.created_at desc;
$$;
alter function public.historial_cambios_cita(uuid) owner to peludesk_definer;
revoke execute on function public.historial_cambios_cita(uuid) from public, anon;
grant execute on function public.historial_cambios_cita(uuid) to authenticated, service_role;

-- demo_vaciar: la tabla nueva cuelga de citas_estetica.
CREATE OR REPLACE FUNCTION public.demo_vaciar(p_negocio_id uuid)
 RETURNS TABLE(tabla text, borradas bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_plan text;
  v_tabla text;
  v_n bigint;
  v_pendientes text[];
  v_siguen text[];
  v_pasada int := 0;
begin
  if coalesce(auth.role(), '') <> 'service_role' and nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception 'Solo el servidor vacía el demo.';
  end if;
  select n.plan into v_plan from public.negocios n where n.id = p_negocio_id and n.deleted_at is null;
  if v_plan is distinct from 'demo' then
    raise exception 'Solo se vacía un negocio con plan demo.';
  end if;
  delete from public.membresias m where m.negocio_id = p_negocio_id and m.rol = 'cliente';
  tabla := 'membresias (clientes)'; get diagnostics borradas = row_count; return next;

  v_pendientes := array[
    'adelantos', 'asistencia_correcciones', 'asistencias', 'ausencias', 'bitacora_entradas', 'bonos_ajustes', 'bonos_clientes',
    'cargos_aplicados', 'categorias_insumo', 'citas_estetica_cambios', 'citas_estetica', 'clientes', 'cobro_metodos', 'cobro_correcciones', 'cuenta_ajustes_precio', 'cobros',
    'comisiones_servicio', 'compras_insumos', 'contratos', 'corte_metodos', 'cortes_caja', 'descuentos_aplicados',
    'devolucion_metodos', 'devoluciones', 'empleados', 'empleados_horario', 'equipo_eventos', 'equipos',
    'esquemas_pago', 'estancia_pertenencias', 'estancias', 'gastos', 'gastos_recurrentes', 'insumos',
    'insumos_costos', 'invitaciones_cliente', 'medicamentos_administrados', 'movimientos_bono', 'movimientos_caja',
    'movimientos_inventario', 'mp_ordenes', 'nomina_pagos', 'perro_accesos_compartidos', 'perro_alergias',
    'perro_alertas', 'perro_historial_dueno', 'perro_medicamentos', 'perros', 'pesos_registrados',
    'plantillas_contrato', 'proveedores', 'recetas_consumo', 'requisitos_sanitarios_aplicados',
    'requisitos_sanitarios_propuestos', 'reservas', 'series_pausas', 'series_recurrentes', 'tarifas',
    'tarifas_dia_semana', 'turnos_caja', 'vacaciones_movimientos', 'vinculacion_eventos', 'ventas_mostrador', 'reembolsos_cobro', 'cobros_grupo_eventos', 'cobros_grupo', 'tarjetas_manuales_eventos', 'tarjetas_manuales', 'soporte_ticket_mensajes', 'soporte_tickets', 'soporte_mensajes_asistente', 'soporte_conversaciones'
  ];
  while cardinality(v_pendientes) > 0 loop
    v_pasada := v_pasada + 1;
    if v_pasada > 30 then
      raise exception 'No se pudo vaciar el demo: siguen con filas %.', v_pendientes;
    end if;
    v_siguen := array[]::text[];
    foreach v_tabla in array v_pendientes loop
      begin
        execute format('delete from public.%I where negocio_id = $1', v_tabla) using p_negocio_id;
        get diagnostics v_n = row_count;
        if v_n > 0 then
          tabla := v_tabla; borradas := v_n; return next;
        end if;
      exception when foreign_key_violation then
        v_siguen := array_append(v_siguen, v_tabla);
      end;
    end loop;
    v_pendientes := v_siguen;
  end loop;
  -- Lo que sembró el script en el catálogo copiado (los paquetes) se queda:
  -- el script los reconoce por su clave.
end;
$function$;
