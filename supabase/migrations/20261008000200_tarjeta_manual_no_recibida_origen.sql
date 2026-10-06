-- tarjeta_manual_no_recibida: la devolución entra con origen «manual» (como la
-- de «no recibido» de terminal): el check de devoluciones.origen no tiene un
-- valor propio y lo que distingue a esta corrección es cobro_correcciones.tipo.
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
  values (v_t.cobro_id, v_turno_abierto, 'Tarjeta manual no recibida (folio ' || v_t.folio || '): ' || v_motivo, auth.uid(), auth.uid(), 'manual')
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
revoke execute on function public.tarjeta_manual_no_recibida(uuid, text) from public, anon;
grant execute on function public.tarjeta_manual_no_recibida(uuid, text) to authenticated, service_role;
