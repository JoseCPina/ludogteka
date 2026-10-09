-- Estética: tarifa «Cliente de guardería» (equivale al servicio exprés).
--
-- ANTES: a un perro de guardería que venía a bañarse se le cobraba el precio del
-- exprés escogiendo a mano ese servicio (o con un descuento): nada en la app
-- decía que era una tarifa, y dependía de que quien agendaba se acordara.
--
-- AHORA, una regla EXPLÍCITA y por negocio (Administración → Tarifa de guardería):
--
--   * El negocio la activa y dice qué servicio de estética es el «equivalente»
--     (el exprés) y a qué servicios se aplica la tarifa (el baño completo, el
--     rapado…). Viene APAGADA: nadie la tiene hasta que el negocio la prende.
--   * Un perro es «cliente de guardería» si tiene un pase vigente (day pass o
--     mensualidad) o una estancia de guardería en los últimos N días (60 por
--     omisión) o agendada en los próximos 30.
--   * Con la tarifa activa, la cita de ese perro PROPONE el precio del servicio
--     equivalente para su talla, pelaje y grupo: queda en la cita como TARIFA
--     (citas_estetica.tarifa_guarderia) con su servicio y su origen (automática o
--     manual), no como un descuento. La cuenta lo dice en la línea.
--   * Quitarla (o ponerla a mano a quien no la tiene) es de admin o de quien tenga
--     «Excepciones al reservar», con motivo al quitarla. Queda en el historial de
--     la cita.
--
-- REVERSA: apagar la tarifa en Administración. Las citas ya agendadas conservan su
-- precio (se congela). Para volver a las funciones de antes: validar_cita_estetica,
-- cotizar_cita_estetica y cuenta_lineas_reserva de 20261013000100 / 20261009000100.
-- Sin datos que respaldar: la migración no cambia ninguna fila existente.

-- ── 1. Configuración por negocio ──────────────────────────────────────

create table public.tarifa_guarderia_config (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  activa boolean not null default false,
  servicio_tarifa_id uuid references public.servicios(id),
  servicios_incluidos uuid[] not null default '{}',
  dias_actividad integer not null default 60 check (dias_actividad between 1 and 365),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  check (not activa or servicio_tarifa_id is not null)
);
create unique index tarifa_guarderia_config_negocio_uq on public.tarifa_guarderia_config (negocio_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.tarifa_guarderia_config
  for each row execute function public.set_updated_at();
alter table public.tarifa_guarderia_config enable row level security;
create policy tarifa_guarderia_config_select on public.tarifa_guarderia_config
  for select to authenticated using ((select coalesce(public.is_staff(), false)));
create policy tarifa_guarderia_config_negocio on public.tarifa_guarderia_config
  as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy tarifa_guarderia_config_negocio_definer on public.tarifa_guarderia_config
  for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
create policy tarifa_guarderia_config_escritura_ins on public.tarifa_guarderia_config
  as restrictive for insert to authenticated, peludesk_definer with check ((select public.exigir_negocio_escribible()));
create policy tarifa_guarderia_config_escritura_upd on public.tarifa_guarderia_config
  as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy tarifa_guarderia_config_escritura_del on public.tarifa_guarderia_config
  as restrictive for delete to authenticated, peludesk_definer using ((select public.exigir_negocio_escribible()));
grant select on public.tarifa_guarderia_config to authenticated;
grant select, insert, update, delete on public.tarifa_guarderia_config to peludesk_definer;

-- ── 2. Lo que la cita guarda ──────────────────────────────────────────

alter table public.citas_estetica
  add column tarifa_guarderia_modo text not null default 'auto' check (tarifa_guarderia_modo in ('auto', 'si', 'no')),
  add column tarifa_guarderia boolean not null default false,
  add column tarifa_guarderia_servicio_id uuid references public.servicios(id),
  add column tarifa_guarderia_motivo text,
  add column tarifa_guarderia_por uuid references auth.users(id) on delete set null;

-- ── 3. ¿Es cliente de guardería? ──────────────────────────────────────

create or replace function public.perro_cliente_guarderia(p_perro_id uuid, p_fecha date, p_dias integer)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.modulo_activo('guarderia'), false) and (
    exists (
      select 1 from public.bonos_clientes_estado b
      where b.perro_id = p_perro_id and b.estado = 'activo'
    )
    or exists (
      select 1 from public.estancias e
      join public.servicios s on s.id = e.servicio_id
      where e.perro_id = p_perro_id and e.negocio_id = public.negocio_actual()
        and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego')
        and s.categoria = 'guarderia'
        and e.fecha_entrada between p_fecha - greatest(coalesce(p_dias, 60), 1) and p_fecha + 30
    )
  );
$$;
alter function public.perro_cliente_guarderia(uuid, date, integer) owner to peludesk_definer;
revoke execute on function public.perro_cliente_guarderia(uuid, date, integer) from public, anon;
grant execute on function public.perro_cliente_guarderia(uuid, date, integer) to authenticated, service_role;

-- El servicio con cuyo precio se cobra la cita (el equivalente), o NULL si no aplica.
create or replace function public.tarifa_guarderia_para(p_perro_id uuid, p_servicio_id uuid, p_fecha date, p_modo text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c record;
begin
  select * into c from public.tarifa_guarderia_config g
  where g.negocio_id = public.negocio_actual() and g.deleted_at is null and g.activa;
  if not found or c.servicio_tarifa_id is null then
    return null;
  end if;
  if p_servicio_id = c.servicio_tarifa_id or not (p_servicio_id = any (c.servicios_incluidos)) then
    return null;
  end if;
  if not exists (select 1 from public.servicios s where s.id = c.servicio_tarifa_id and s.deleted_at is null and s.categoria = 'estetica') then
    return null;
  end if;
  if coalesce(p_modo, 'auto') = 'no' then
    return null;
  elsif p_modo = 'si' then
    return c.servicio_tarifa_id;
  end if;
  return case when public.perro_cliente_guarderia(p_perro_id, p_fecha, c.dias_actividad) then c.servicio_tarifa_id else null end;
end;
$$;
alter function public.tarifa_guarderia_para(uuid, uuid, date, text) owner to peludesk_definer;
revoke execute on function public.tarifa_guarderia_para(uuid, uuid, date, text) from public, anon;
grant execute on function public.tarifa_guarderia_para(uuid, uuid, date, text) to authenticated, service_role;

-- ── 4. Guardar la configuración (Administración) ──────────────────────

create or replace function public.guardar_tarifa_guarderia(p_activa boolean, p_servicio_tarifa uuid, p_servicios uuid[], p_dias integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[] := coalesce(p_servicios, '{}');
begin
  if not coalesce(public.tiene_permiso('tarifas'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Precios y tarifas», cambia la tarifa de guardería.' using errcode = '42501';
  end if;
  if not coalesce(public.modulo_activo('estetica'), false) then
    raise exception 'El módulo de estética está apagado.';
  end if;
  if coalesce(p_dias, 0) < 1 or p_dias > 365 then
    raise exception 'Los días de actividad van de 1 a 365.';
  end if;
  if p_servicio_tarifa is not null and not exists (
    select 1 from public.servicios s where s.id = p_servicio_tarifa and s.deleted_at is null and s.categoria = 'estetica'
  ) then
    raise exception 'El servicio equivalente tiene que ser un servicio de estética de este negocio.';
  end if;
  if coalesce(p_activa, false) and p_servicio_tarifa is null then
    raise exception 'Elige el servicio con cuyo precio se cobra la tarifa (el exprés).';
  end if;
  if exists (
    select 1 from unnest(v_ids) x(id)
    where not exists (select 1 from public.servicios s where s.id = x.id and s.deleted_at is null and s.categoria = 'estetica')
  ) then
    raise exception 'Solo servicios de estética de este negocio.';
  end if;
  v_ids := array(select distinct x from unnest(v_ids) x where x <> p_servicio_tarifa);
  if coalesce(p_activa, false) and cardinality(v_ids) = 0 then
    raise exception 'Elige al menos un servicio al que se le aplique la tarifa.';
  end if;

  insert into public.tarifa_guarderia_config (activa, servicio_tarifa_id, servicios_incluidos, dias_actividad, updated_by)
  values (coalesce(p_activa, false), p_servicio_tarifa, v_ids, p_dias, auth.uid())
  on conflict (negocio_id) where deleted_at is null
  do update set activa = excluded.activa, servicio_tarifa_id = excluded.servicio_tarifa_id,
    servicios_incluidos = excluded.servicios_incluidos, dias_actividad = excluded.dias_actividad, updated_by = auth.uid();
end;
$$;
alter function public.guardar_tarifa_guarderia(boolean, uuid, uuid[], integer) owner to peludesk_definer;
revoke execute on function public.guardar_tarifa_guarderia(boolean, uuid, uuid[], integer) from public, anon;
grant execute on function public.guardar_tarifa_guarderia(boolean, uuid, uuid[], integer) to authenticated, service_role;
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
  v_modo_tg text;
  v_tg_serv uuid;
  v_serv_precio uuid;
  v_p_dt boolean;
  v_p_dp boolean;
  v_p_dg boolean;
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

  -- Tarifa «cliente de guardería»: el servicio con cuyo precio se cobra esta cita
  -- (el equivalente, el exprés), o ninguno. Una cita que ya existía conserva lo
  -- que se le decidió mientras no cambie de perro, de servicio ni de modo.
  v_modo_tg := coalesce(new.tarifa_guarderia_modo, 'auto');
  if v_modo_tg in ('si', 'no') and (TG_OP = 'INSERT' or new.tarifa_guarderia_modo is distinct from old.tarifa_guarderia_modo) then
    if not coalesce((select public.tiene_permiso('excepciones_reserva')), false) then
      raise exception 'Poner o quitar la tarifa de cliente de guardería es de admin o de quien tenga el permiso de excepciones al reservar.' using errcode = '42501';
    end if;
    if v_modo_tg = 'no' and char_length(btrim(coalesce(new.tarifa_guarderia_motivo, ''))) < 3 then
      raise exception 'Quitar la tarifa de cliente de guardería necesita un motivo.';
    end if;
    new.tarifa_guarderia_por := auth.uid();
  end if;
  if TG_OP = 'UPDATE' and v_modo_tg = 'auto' and new.servicio_id is not distinct from old.servicio_id
     and new.perro_id is not distinct from old.perro_id and new.tarifa_guarderia_modo is not distinct from old.tarifa_guarderia_modo then
    v_tg_serv := old.tarifa_guarderia_servicio_id;
  else
    v_tg_serv := public.tarifa_guarderia_para(new.perro_id, new.servicio_id, public.fecha_negocio(new.inicio), v_modo_tg);
    if v_tg_serv is null and v_modo_tg = 'si' then
      raise exception 'La tarifa de cliente de guardería no aplica a este servicio (o no está activa en tu negocio: Administración → Tarifa de guardería).';
    end if;
  end if;
  v_serv_precio := coalesce(v_tg_serv, new.servicio_id);
  v_p_dt := v_depende_tamano;
  v_p_dp := v_depende_pelaje;
  v_p_dg := v_depende_grupo;
  if v_tg_serv is not null then
    select s.depende_tamano, s.depende_pelaje, s.depende_grupo_raza into v_p_dt, v_p_dp, v_p_dg
    from public.servicios s where s.id = v_tg_serv;
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
    or new.recargo is distinct from old.recargo
    or new.tarifa_guarderia_modo is distinct from old.tarifa_guarderia_modo;
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

    if v_p_dg then
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
    elsif v_p_dt then
      select tamano_id into new.tamano_id from public.perros where id = new.perro_id;
      if new.tamano_id is null then
        raise exception 'Este perro no tiene talla registrada y el precio depende de ella. Captúrala en /perros/%', new.perro_id;
      end if;
    else
      new.tamano_id := null;
    end if;

    -- El grupo de raza puede cobrar por pelaje (la matriz del mestizo): ese
    -- pelaje entra al precio de ESE grupo aunque el servicio no dependa de él.
    if v_p_dg then
      v_grupo_dep_pelaje := coalesce((select g.depende_pelaje from public.grupos_raza g where g.id = v_grupo.grupo_raza_id), false);
    end if;
    if v_p_dp or v_grupo_dep_pelaje then
      select pelaje_id into new.pelaje_id from public.perros where id = new.perro_id;
      if new.pelaje_id is null then
        raise exception 'Este perro no tiene pelaje registrado. Captúralo en su expediente (/perros/%) antes de reservar.', new.perro_id;
      end if;
    else
      new.pelaje_id := null;
    end if;

    select precio, estado into v_precio, v_estado_precio
    from public.resolver_precio(
      v_serv_precio, new.tamano_id, new.pelaje_id, 1, v_fecha_local,
      case when v_p_dg then v_grupo.grupo_raza_id else null end,
      (new.pelo_maltratado and v_tg_serv is null)
    );

    -- Al CORREGIR el servicio de una cita vieja puede no haber tarifa vigente en
    -- la fecha de la cita (se capturó antes de que existiera): se usa la
    -- tarifa de hoy y se marca para decírselo a quien corrige.
    if v_estado_precio = 'sin_tarifa'
       and coalesce(current_setting('app.correccion_servicio', true), '') = 'on'
       and v_fecha_local < public.fecha_negocio() then
      select precio, estado into v_precio, v_estado_precio
      from public.resolver_precio(
        v_serv_precio, new.tamano_id, new.pelaje_id, 1, public.fecha_negocio(),
        case when v_p_dg then v_grupo.grupo_raza_id else null end,
        (new.pelo_maltratado and v_tg_serv is null)
      );
      if v_estado_precio not in ('sin_tarifa', 'no_aplica') then
        perform set_config('app.correccion_tarifa_hoy', 'on', true);
      end if;
    end if;

    if v_estado_precio = 'sin_tarifa' then
      raise exception '%', public.describir_precio_faltante(v_serv_precio, new.tamano_id, new.pelaje_id, 1, v_fecha_local, case when v_p_dg then v_grupo.grupo_raza_id else null end);
    elsif v_estado_precio = 'no_aplica' then
      raise exception '%', public.describir_precio_faltante(v_serv_precio, new.tamano_id, new.pelaje_id, 1, v_fecha_local, case when v_p_dg then v_grupo.grupo_raza_id else null end, 'no_aplica');
    end if;

    new.tarifa_guarderia := v_tg_serv is not null;
    new.tarifa_guarderia_servicio_id := v_tg_serv;
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

CREATE OR REPLACE FUNCTION public.cotizar_cita_estetica_base(p_perro_id uuid, p_servicio_id uuid, p_pelo_maltratado boolean DEFAULT false, p_grupo_excepcion_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_serv record;
  v_perro record;
  v_grupo record;
  v_hay_grupo boolean := false;
  v_g_id uuid;
  v_g_nombre text;
  v_g_dt boolean;
  v_g_dp boolean;
  v_permitidos text[];
  v_necesita_talla boolean;
  v_necesita_pelaje boolean;
  v_pelaje_en_precio boolean;
  v_faltan text[] := '{}';
  v_res record;
  v_ruta text := '/servicios/' || p_servicio_id || '/tarifas';
  v_base jsonb;
begin
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal cotiza una cita.' using errcode = '42501';
  end if;
  select s.id, s.nombre, s.depende_tamano, s.depende_pelaje, s.depende_grupo_raza, coalesce(s.pelajes_excluidos, '{}') as excluidos
  into v_serv from public.servicios s where s.id = p_servicio_id and s.deleted_at is null;
  if not found then
    raise exception 'Ese servicio no existe.';
  end if;
  select p.id, p.nombre, p.tamano_id, p.pelaje_id, pe.clave as pelaje_clave
  into v_perro from public.perros p left join public.tipos_pelaje pe on pe.id = p.pelaje_id
  where p.id = p_perro_id and p.deleted_at is null;
  if not found then
    raise exception 'Ese perro no existe.';
  end if;

  v_base := jsonb_build_object('servicio_id', p_servicio_id, 'ruta_precios', v_ruta,
    'tamano_id', v_perro.tamano_id, 'pelaje_id', v_perro.pelaje_id);

  if v_perro.pelaje_clave is not null and v_perro.pelaje_clave = any (v_serv.excluidos) then
    return v_base || jsonb_build_object('estado', 'pelaje_no_ofrecido', 'pelaje_clave', v_perro.pelaje_clave);
  end if;

  if v_serv.depende_grupo_raza then
    if p_grupo_excepcion_id is not null then
      select g.id, g.nombre, g.depende_tamano, g.depende_pelaje, g.pelajes_permitidos into v_g_id, v_g_nombre, v_g_dt, v_g_dp, v_permitidos
      from public.grupos_raza g where g.id = p_grupo_excepcion_id and g.deleted_at is null;
      if v_g_id is null then
        raise exception 'El grupo de la excepción no existe en este negocio.';
      end if;
      v_hay_grupo := true;
    else
      select * into v_grupo from public.perro_grupo_raza where perro_id = p_perro_id;
      if coalesce(v_grupo.sin_grupo, false) then
        return v_base || jsonb_build_object('estado', 'sin_grupo', 'motivo', v_grupo.sin_grupo_motivo,
          'grupo_nombre', v_grupo.grupo_nombre, 'raza_nombre', v_grupo.raza_nombre);
      end if;
      select g.id, g.nombre, g.depende_tamano, g.depende_pelaje, g.pelajes_permitidos into v_g_id, v_g_nombre, v_g_dt, v_g_dp, v_permitidos
      from public.grupos_raza g where g.id = v_grupo.grupo_raza_id;
      v_hay_grupo := v_g_id is not null;
    end if;
  end if;

  v_necesita_talla := case when v_hay_grupo then coalesce(v_g_dt, false) else v_serv.depende_tamano end;
  v_pelaje_en_precio := coalesce(v_serv.depende_pelaje, false) or (v_hay_grupo and coalesce(v_g_dp, false));
  v_necesita_pelaje := v_pelaje_en_precio or cardinality(v_serv.excluidos) > 0;

  if v_necesita_talla and v_perro.tamano_id is null then v_faltan := array_append(v_faltan, 'tamano'); end if;
  if v_necesita_pelaje and v_perro.pelaje_id is null then v_faltan := array_append(v_faltan, 'pelaje'); end if;
  if cardinality(v_faltan) > 0 then
    return v_base || jsonb_build_object('estado', 'faltan_datos', 'faltan', to_jsonb(v_faltan),
      'grupo_nombre', v_g_nombre, 'depende_pelaje', v_pelaje_en_precio, 'depende_tamano', v_necesita_talla);
  end if;

  if v_permitidos is not null and (v_perro.pelaje_clave is null or not (v_perro.pelaje_clave = any (v_permitidos))) then
    return v_base || jsonb_build_object('estado', 'sin_precio', 'grupo_nombre', v_g_nombre, 'motivo', 'pelaje_fuera_del_grupo');
  end if;

  select * into v_res from public.resolver_precio(
    p_servicio_id,
    case when v_necesita_talla then v_perro.tamano_id else null end,
    case when v_pelaje_en_precio then v_perro.pelaje_id else null end,
    1, public.fecha_negocio(),
    case when v_hay_grupo then v_g_id else null end,
    coalesce(p_pelo_maltratado, false));

  if v_res.estado = 'disponible' then
    return v_base || jsonb_build_object('estado', 'ok', 'precio', v_res.precio, 'grupo_nombre', v_g_nombre,
      'maltratado_aplicado', coalesce(p_pelo_maltratado, false) and v_res.precio_pelo_maltratado is not null);
  elsif v_res.estado = 'no_aplica' then
    return v_base || jsonb_build_object('estado', 'no_aplica', 'grupo_nombre', v_g_nombre);
  end if;
  return v_base || jsonb_build_object('estado', 'sin_precio', 'grupo_nombre', v_g_nombre);
end;
$function$;
alter function public.cotizar_cita_estetica_base(uuid, uuid, boolean, uuid) owner to peludesk_definer;
revoke execute on function public.cotizar_cita_estetica_base(uuid, uuid, boolean, uuid) from public, anon, authenticated;
grant execute on function public.cotizar_cita_estetica_base(uuid, uuid, boolean, uuid) to service_role;


drop function public.cotizar_cita_estetica(uuid, uuid, boolean, uuid);
create function public.cotizar_cita_estetica(p_perro_id uuid, p_servicio_id uuid, p_pelo_maltratado boolean default false,
  p_grupo_excepcion_id uuid default null, p_tarifa_modo text default 'auto')
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_normal jsonb;
  v_tar jsonb;
  v_tg uuid;
  v_elegible boolean;
  v_nombre text;
  v_modo text := coalesce(p_tarifa_modo, 'auto');
begin
  v_normal := public.cotizar_cita_estetica_base(p_perro_id, p_servicio_id, p_pelo_maltratado, p_grupo_excepcion_id);
  if v_normal ->> 'estado' = 'pelaje_no_ofrecido' then
    return v_normal;
  end if;
  v_tg := public.tarifa_guarderia_para(p_perro_id, p_servicio_id, public.fecha_negocio(), v_modo);
  v_elegible := public.tarifa_guarderia_para(p_perro_id, p_servicio_id, public.fecha_negocio(), 'auto') is not null;
  -- «Puede ponerse a mano»: la tarifa está activa para este servicio aunque el perro no sea de guardería.
  if v_tg is null then
    return v_normal || jsonb_build_object('tarifa_guarderia', false, 'tarifa_guarderia_elegible', v_elegible,
      'tarifa_guarderia_aplicable', public.tarifa_guarderia_para(p_perro_id, p_servicio_id, public.fecha_negocio(), 'si') is not null);
  end if;
  v_tar := public.cotizar_cita_estetica_base(p_perro_id, v_tg, false, p_grupo_excepcion_id);
  if v_tar ->> 'estado' <> 'ok' then
    return v_normal || jsonb_build_object('tarifa_guarderia', false, 'tarifa_guarderia_elegible', v_elegible,
      'tarifa_guarderia_aviso', 'La tarifa de guardería no se pudo calcular (el servicio equivalente no tiene precio para este perro): se muestra el precio normal.');
  end if;
  select s.nombre into v_nombre from public.servicios s where s.id = v_tg;
  return v_tar || jsonb_build_object('servicio_id', p_servicio_id, 'ruta_precios', v_normal ->> 'ruta_precios',
    'tarifa_guarderia', true, 'tarifa_guarderia_elegible', v_elegible, 'tarifa_guarderia_aplicable', true,
    'tarifa_guarderia_origen', case when v_modo = 'si' then 'manual' else 'auto' end,
    'servicio_tarifa_nombre', v_nombre,
    'precio_normal', case when v_normal ->> 'estado' = 'ok' then v_normal -> 'precio' else null end);
end;
$$;
alter function public.cotizar_cita_estetica(uuid, uuid, boolean, uuid, text) owner to peludesk_definer;
revoke execute on function public.cotizar_cita_estetica(uuid, uuid, boolean, uuid, text) from public, anon;
grant execute on function public.cotizar_cita_estetica(uuid, uuid, boolean, uuid, text) to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cuenta_lineas_reserva(p_reserva_id uuid)
 RETURNS TABLE(tipo text, origen_id uuid, servicio_id uuid, descripcion text, cantidad numeric, precio_unitario numeric, total numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select
    'estancia'::text,
    e.id,
    e.servicio_id,
    p.nombre || ' — ' || s.nombre,
    (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric,
    e.precio_unitario,
    e.precio_unitario * (case when s.unidad = 'hora' then coalesce(e.horas, 1) else (e.fecha_salida - e.fecha_entrada) end)::numeric
  from public.estancias e
  join public.perros p on p.id = e.perro_id
  join public.servicios s on s.id = e.servicio_id
  where e.reserva_id = p_reserva_id
    and e.deleted_at is null
    and e.estado not in ('cancelada', 'no_llego')

  union all

  select
    'cargo'::text,
    c.id,
    c.servicio_id,
    coalesce(p.nombre || ' — ', '') || s.nombre
      || case when c.descripcion is not null and btrim(c.descripcion) <> '' then ' (' || c.descripcion || ')' else '' end,
    c.cantidad::numeric,
    c.precio,
    c.precio * c.cantidad
  from public.cargos_aplicados c
  join public.servicios s on s.id = c.servicio_id
  left join public.perros p on p.id = c.perro_id
  where c.reserva_id = p_reserva_id
    and c.deleted_at is null
    and c.cancelado = false

  union all

  select
    'estetica'::text,
    ce.id,
    ce.servicio_id,
    p.nombre || ' — ' || s.nombre || case when ce.tarifa_guarderia then ' (tarifa cliente de guardería)' else '' end,
    1::numeric,
    ce.precio,
    ce.precio
  from public.citas_estetica ce
  join public.perros p on p.id = ce.perro_id
  join public.servicios s on s.id = ce.servicio_id
  left join public.estancias e on e.id = ce.estancia_id
  where (ce.reserva_id = p_reserva_id or e.reserva_id = p_reserva_id)
    and ce.deleted_at is null
    and ce.estado not in ('cancelada', 'no_llego')

  union all

  select
    'bono'::text,
    bc.id,
    bc.servicio_id,
    s.nombre,
    1::numeric,
    bc.precio_pagado,
    bc.precio_pagado
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.reserva_id = p_reserva_id
    and bc.deleted_at is null

  union all

  select
    'venta'::text,
    v.id,
    null::uuid,
    v.concepto,
    v.cantidad,
    v.precio_unitario,
    round(v.precio_unitario * v.cantidad, 2)
  from public.ventas_mostrador v
  where v.reserva_id = p_reserva_id
    and v.deleted_at is null
    and not v.cancelado

  union all

  -- Corrección de precio de la cuenta (no es un descuento).
  select
    'ajuste'::text,
    a.id,
    null::uuid,
    'Corrección de precio: ' || a.concepto,
    1::numeric,
    a.monto,
    a.monto
  from public.cuenta_ajustes_precio a
  where a.reserva_id = p_reserva_id
    and a.deleted_at is null;
$function$;

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
    'cargos_aplicados', 'categorias_insumo', 'citas_estetica_cambios', 'citas_estetica', 'tarifa_guarderia_config', 'clientes', 'cobro_metodos', 'cobro_correcciones', 'cuenta_ajustes_precio', 'cobros',
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

-- ── 5. Poner o quitar la tarifa en una cita que ya existe ─────────────

create or replace function public.cambiar_tarifa_guarderia_cita(p_cita_id uuid, p_modo text, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.citas_estetica%rowtype;
  v_nuevo public.citas_estetica%rowtype;
  v_cobrado numeric;
begin
  if public.current_rol() not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción cambian la tarifa de una cita.' using errcode = '42501';
  end if;
  if p_modo is null or p_modo not in ('auto', 'si', 'no') then
    raise exception 'Modo de tarifa inválido.';
  end if;
  select * into c from public.citas_estetica
  where id = p_cita_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Cita no encontrada.';
  end if;
  if c.estado not in ('reservada', 'confirmada', 'en_curso') then
    raise exception 'La tarifa solo se cambia en una cita que todavía no termina. Esta está %.', replace(c.estado, '_', ' ');
  end if;
  if c.tarifa_guarderia_modo = p_modo then
    raise exception 'La cita ya está así.';
  end if;
  select t.total_cobrado into v_cobrado from public.cuenta_totales_reserva(c.reserva_id) t;
  if coalesce(v_cobrado, 0) > 0 then
    raise exception 'Esta cita ya tiene un cobro ($%). Anula el cobro primero (Caja → la cuenta → Anular cobro) y luego cambia la tarifa: /caja/cobrar/%', v_cobrado, c.reserva_id;
  end if;
  -- La base (validar_cita_estetica) vuelve a cotizar, exige el permiso y el motivo.
  update public.citas_estetica
  set tarifa_guarderia_modo = p_modo,
      tarifa_guarderia_motivo = case when p_modo = 'no' then nullif(btrim(coalesce(p_motivo, '')), '') else null end
  where id = p_cita_id
  returning * into v_nuevo;

  insert into public.citas_estetica_cambios (cita_id, tipo, motivo, estado_antes, estado_despues, inicio_antes, inicio_despues, fin_antes, fin_despues, detalle)
  values (p_cita_id, 'tarifa_guarderia', nullif(btrim(coalesce(p_motivo, '')), ''), c.estado, v_nuevo.estado, c.inicio, v_nuevo.inicio, c.fin, v_nuevo.fin,
    jsonb_build_object('modo_antes', c.tarifa_guarderia_modo, 'modo_despues', p_modo, 'precio_antes', c.precio, 'precio_despues', v_nuevo.precio,
      'tarifa_antes', c.tarifa_guarderia, 'tarifa_despues', v_nuevo.tarifa_guarderia));
  return jsonb_build_object('cita_id', p_cita_id, 'precio_antes', c.precio, 'precio_despues', v_nuevo.precio, 'tarifa_guarderia', v_nuevo.tarifa_guarderia);
end;
$$;
alter function public.cambiar_tarifa_guarderia_cita(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.cambiar_tarifa_guarderia_cita(uuid, text, text) from public, anon;
grant execute on function public.cambiar_tarifa_guarderia_cita(uuid, text, text) to authenticated, service_role;
