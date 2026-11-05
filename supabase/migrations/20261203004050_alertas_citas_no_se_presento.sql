-- «Dar por revisadas todas las anteriores a…»: casilla aparte, apagada por omisión, «También cerrar citas pasadas sin cerrar
-- como no se presentó». Con ella, las citas de estética (reservada, confirmada) y de veterinaria (programada, confirmada)
-- ya pasadas y anteriores a la fecha quedan como «No llegó», con la nota en su historial cuando lo tienen. Las de estética
-- con un cobro NO se tocan (son dinero, se devuelven en `pendientes.citas_con_cobro`) y una cita en curso sí llegó.
-- La cuenta previa sale de alertas_por_revisar_hasta con las mismas reglas. El permiso sigue siendo «revisar_alertas».
drop function if exists public.alertas_dar_por_revisadas_hasta(date, text);
create or replace function public.alertas_dar_por_revisadas_hasta(p_hasta date, p_nota text, p_cerrar_citas boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nota text := btrim(coalesce(p_nota, ''));
  v_motivo text;
  v_tarjetas int := 0;
  v_contratos int := 0;
  v_llegadas int := 0;
  v_links int := 0;
  v_conciliacion int := 0;
  v_citas int := 0;
  v_citas_con_cobro int := 0;
  v_c record;
  v_saldos int := 0;
  v_comprobantes int := 0;
  v_zona text := public.zona_negocio();
begin
  if not coalesce(public.tiene_permiso('revisar_alertas'), false) then
    raise exception 'Solo un admin, o quien tenga el permiso «Dar por revisadas alertas en lote», cierra alertas en lote.' using errcode = '42501';
  end if;
  if p_hasta is null then
    raise exception 'Indica hasta qué fecha.';
  end if;
  if p_hasta > public.fecha_negocio() + 1 then
    raise exception 'La fecha no puede ser posterior a mañana.';
  end if;
  if char_length(v_nota) < 5 then
    raise exception 'Escribe qué revisaste.';
  end if;
  v_motivo := 'Dadas por revisadas en lote hasta el ' || to_char(p_hasta, 'DD/MM/YYYY') || ': ' || v_nota;

  -- Tarjetas manuales por revisar
  with c as (
    update public.tarjetas_manuales t
    set estado = 'revisada', revisada_por = auth.uid(), revisada_at = now(), nota_revision = v_motivo
    where t.negocio_id = public.negocio_actual() and t.estado = 'por_revisar' and t.deleted_at is null
      and (t.created_at at time zone v_zona)::date < p_hasta
    returning 1
  ) select count(*) into v_tarjetas from c;

  -- Contratos pendientes de firma
  with c as (
    update public.contratos k
    set estado = 'cancelado'
    where k.negocio_id = public.negocio_actual() and k.estado = 'pendiente_firma' and k.deleted_at is null
      and (k.created_at at time zone v_zona)::date < p_hasta
    returning k.id
  ), m as (
    insert into public.contratos_internos (contrato_id, motivo_cancelacion)
    select c.id, v_motivo from c
    on conflict (contrato_id) do update set motivo_cancelacion = excluded.motivo_cancelacion
    returning 1
  ) select count(*) into v_contratos from m;

  -- Llegadas atrasadas: reservadas o confirmadas con la entrada ya pasada → «No llegó»
  with c as (
    update public.estancias e
    set estado = 'no_llego', notas = case when coalesce(e.notas, '') = '' then v_motivo else e.notas || E'\n' || v_motivo end
    where e.negocio_id = public.negocio_actual() and e.estado in ('reservada', 'confirmada') and e.deleted_at is null
      and e.fecha_entrada < p_hasta
    returning 1
  ) select count(*) into v_llegadas from c;

  -- Links de pago creados y nunca resueltos
  with c as (
    update public.mp_ordenes o
    set estado = 'cancelada', detalle_error = v_motivo, notificado_at = now()
    where o.negocio_id = public.negocio_actual() and o.estado = 'creada' and o.deleted_at is null
      and (o.created_at at time zone v_zona)::date < p_hasta
    returning 1
  ) select count(*) into v_links from c;

  -- Conciliación con el proveedor
  with c as (
    update public.conciliacion_terminal ct
    set resuelta_at = now(), resuelta_motivo = v_motivo, resuelta_por = auth.uid()
    where ct.negocio_id = public.negocio_actual() and ct.resuelta_at is null and ct.deleted_at is null
      and (ct.ocurrio_at at time zone v_zona)::date < p_hasta
    returning 1
  ) select count(*) into v_conciliacion from c;

  -- Citas pasadas sin cerrar → «No se presentó» (solo si se pidió aparte). Las de estética con un cobro no se tocan: son
  -- dinero y se resuelven en su cuenta. Una cita empezada (en curso) sí llegó: tampoco.
  if coalesce(p_cerrar_citas, false) then
    for v_c in
      select c.id, c.estado, c.inicio, c.fin, c.reserva_id from public.citas_estetica c
      where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado in ('reservada', 'confirmada')
        and c.inicio < now() and (c.inicio at time zone v_zona)::date < p_hasta
      for update
    loop
      if coalesce((select t.total_cobrado from public.cuenta_totales_reserva(v_c.reserva_id) t), 0) > 0 then
        v_citas_con_cobro := v_citas_con_cobro + 1;
        continue;
      end if;
      perform set_config('app.cambio_agenda', 'on', true);
      update public.citas_estetica set estado = 'no_llego' where id = v_c.id;
      perform set_config('app.cambio_agenda', 'off', true);
      insert into public.citas_estetica_cambios (cita_id, tipo, motivo, estado_antes, estado_despues, inicio_antes, inicio_despues, fin_antes, fin_despues)
      values (v_c.id, 'no_llego', v_motivo, v_c.estado, 'no_llego', v_c.inicio, v_c.inicio, v_c.fin, v_c.fin);
      v_citas := v_citas + 1;
    end loop;
    with c as (
      update public.vet_citas vc
      set estado = 'no_llego'
      where vc.negocio_id = public.negocio_actual() and vc.deleted_at is null and vc.estado in ('programada', 'confirmada')
        and vc.inicia_at < now() and (vc.inicia_at at time zone v_zona)::date < p_hasta
      returning 1
    ) select count(*) + v_citas into v_citas from c;
  end if;

  -- Lo que no se cierra solo, para decirlo
  select count(*) into v_comprobantes from public.requisitos_sanitarios_propuestos p
  where p.negocio_id = public.negocio_actual() and p.estado = 'pendiente' and p.deleted_at is null
    and (p.created_at at time zone v_zona)::date < p_hasta;
  select count(*) into v_saldos from public.cuentas_abiertas(400) ca where ca.saldo > 0 and ca.fecha_actividad < p_hasta;

  return jsonb_build_object(
    'hasta', p_hasta,
    'cerradas', jsonb_build_object('tarjetas', v_tarjetas, 'contratos', v_contratos, 'llegadas', v_llegadas, 'links', v_links, 'conciliacion', v_conciliacion, 'citas', v_citas),
    'total', v_tarjetas + v_contratos + v_llegadas + v_links + v_conciliacion + v_citas,
    'pendientes', jsonb_build_object('cuentas_con_saldo', v_saldos, 'comprobantes', v_comprobantes, 'citas_con_cobro', v_citas_con_cobro)
  );
end;
$$;
alter function public.alertas_dar_por_revisadas_hasta(date, text, boolean) owner to peludesk_definer;
revoke execute on function public.alertas_dar_por_revisadas_hasta(date, text, boolean) from public, anon;
grant execute on function public.alertas_dar_por_revisadas_hasta(date, text, boolean) to authenticated, service_role;
comment on function public.alertas_dar_por_revisadas_hasta(date, text, boolean) is
  'Admin o permiso «revisar_alertas»: cierra en lote, con nota, lo anterior a una fecha (hora del negocio): tarjetas manuales, contratos pendientes de firma, llegadas atrasadas, links de pago y conciliación; con p_cerrar_citas, también las citas pasadas sin cerrar como «No llegó» (no las de estética con cobro). Devuelve {cerradas, total, pendientes}.';

create or replace function public.alertas_por_revisar_hasta(p_hasta date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'tarjetas', (select count(*) from public.tarjetas_manuales t where t.negocio_id = public.negocio_actual() and t.estado = 'por_revisar' and t.deleted_at is null and (t.created_at at time zone public.zona_negocio())::date < p_hasta),
    'contratos', (select count(*) from public.contratos k where k.negocio_id = public.negocio_actual() and k.estado = 'pendiente_firma' and k.deleted_at is null and (k.created_at at time zone public.zona_negocio())::date < p_hasta),
    'llegadas', (select count(*) from public.estancias e where e.negocio_id = public.negocio_actual() and e.estado in ('reservada', 'confirmada') and e.deleted_at is null and e.fecha_entrada < p_hasta),
    'links', (select count(*) from public.mp_ordenes o where o.negocio_id = public.negocio_actual() and o.estado = 'creada' and o.deleted_at is null and (o.created_at at time zone public.zona_negocio())::date < p_hasta),
    'conciliacion', (select count(*) from public.conciliacion_terminal ct where ct.negocio_id = public.negocio_actual() and ct.resuelta_at is null and ct.deleted_at is null and (ct.ocurrio_at at time zone public.zona_negocio())::date < p_hasta),
    'citas', (select count(*) from public.citas_estetica c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado in ('reservada', 'confirmada') and c.inicio < now() and (c.inicio at time zone public.zona_negocio())::date < p_hasta and coalesce((select t.total_cobrado from public.cuenta_totales_reserva(c.reserva_id) t), 0) = 0) + (select count(*) from public.vet_citas vc where vc.negocio_id = public.negocio_actual() and vc.deleted_at is null and vc.estado in ('programada', 'confirmada') and vc.inicia_at < now() and (vc.inicia_at at time zone public.zona_negocio())::date < p_hasta),
    'citas_con_cobro', (select count(*) from public.citas_estetica c where c.negocio_id = public.negocio_actual() and c.deleted_at is null and c.estado in ('reservada', 'confirmada') and c.inicio < now() and (c.inicio at time zone public.zona_negocio())::date < p_hasta and coalesce((select t.total_cobrado from public.cuenta_totales_reserva(c.reserva_id) t), 0) > 0)
  )
  where coalesce(public.tiene_permiso('revisar_alertas'), false);
$$;
