-- «No recibido»: la devolución que corrige el cobro queda con origen 'manual'.
-- resumen_turno agrupa las devoluciones por el origen del COBRO (manual,
-- mercadopago_point…): con un origen propio, el turno no la restaba. Que la
-- devolución sea de una corrección se sabe por cobro_correcciones.devolucion_id
-- y por su motivo («No recibido: …»).
update public.devoluciones set origen = 'manual' where origen = 'no_recibido';
alter table public.devoluciones drop constraint devoluciones_origen_check;
alter table public.devoluciones add constraint devoluciones_origen_check
  check (origen in ('manual', 'mercadopago_point', 'mercadopago_link', 'clip_terminal'));

create or replace function public.cobro_marcar_no_recibido(p_cobro_id uuid, p_motivo text, p_actor uuid, p_evidencia jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cobro record;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_turno_abierto uuid;
  v_monto numeric;
  v_propina numeric;
  v_disponible numeric;
  v_dev uuid;
  v_metodos jsonb;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Solo el servidor de la aplicación marca un cobro como no recibido.' using errcode = '42501';
  end if;
  if p_actor is null or not exists (
    select 1 from public.membresias m
    where m.profile_id = p_actor and m.negocio_id = public.negocio_actual() and m.rol = 'admin' and m.deleted_at is null
  ) then
    raise exception 'Solo un admin del negocio marca un cobro como no recibido.' using errcode = '42501';
  end if;
  if char_length(v_motivo) < 5 then
    raise exception 'Escribe el motivo (qué pasó) para marcar el cobro como no recibido.';
  end if;
  if coalesce(p_evidencia ->> 'mp_sin_pago_aprobado', '') <> 'true' then
    raise exception 'Solo se marca como no recibido cuando el proveedor confirma que NO hay un pago aprobado para este cobro.';
  end if;

  select c.id, c.reserva_id, c.turno_id, c.origen, c.notas, c.created_at, c.created_by, t.estado as turno_estado
  into v_cobro
  from public.cobros c
  join public.turnos_caja t on t.id = c.turno_id
  where c.id = p_cobro_id and c.deleted_at is null
  for update of c;
  if not found then
    raise exception 'Cobro no encontrado.';
  end if;
  if coalesce(v_cobro.origen, 'manual') <> 'manual' then
    raise exception 'Este cobro entró con un pago que el proveedor confirmó: si hay que devolverlo, usa la devolución con el proveedor.';
  end if;

  select coalesce(sum(cm.monto), 0), coalesce(sum(cm.propina), 0),
         coalesce(jsonb_agg(jsonb_build_object('metodo', cm.metodo, 'monto', cm.monto, 'propina', cm.propina)), '[]'::jsonb)
  into v_monto, v_propina, v_metodos
  from public.cobro_metodos cm where cm.cobro_id = p_cobro_id and cm.metodo = 'terminal';
  if v_monto <= 0 then
    raise exception 'Este cobro no tiene un método de terminal: solo se corrigen así los cobros con terminal.';
  end if;
  if v_propina > 0 then
    raise exception 'Este cobro de terminal trae propina: avisa a quien lleva la nómina antes de corregirlo.';
  end if;
  v_disponible := public.cobro_disponible_para_devolver(p_cobro_id);
  if v_disponible < v_monto - 0.005 then
    raise exception 'Este cobro ya tiene devoluciones: no se puede marcar como no recibido.';
  end if;
  select id into v_turno_abierto from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_abierto is null then
    raise exception 'No hay turno de caja abierto. Ábrelo: la corrección se anota en el turno abierto (un turno cerrado nunca cambia).';
  end if;

  insert into public.devoluciones (cobro_id, turno_id, motivo, autorizado_por, created_by, origen)
  values (p_cobro_id, v_turno_abierto, 'No recibido: ' || v_motivo, p_actor, p_actor, 'manual')
  returning id into v_dev;
  insert into public.devolucion_metodos (devolucion_id, metodo, monto, created_by)
  select v_dev, 'terminal', cm.monto, p_actor from public.cobro_metodos cm where cm.cobro_id = p_cobro_id and cm.metodo = 'terminal';

  insert into public.cobro_correcciones (cobro_id, devolucion_id, tipo, motivo, estado_anterior, evidencia, turno_cobro_id, turno_efecto_id, hecha_por, created_by)
  values (p_cobro_id, v_dev, 'no_recibido', v_motivo,
    jsonb_build_object('reserva_id', v_cobro.reserva_id, 'turno_id', v_cobro.turno_id, 'origen', coalesce(v_cobro.origen, 'manual'),
      'notas', v_cobro.notas, 'cobrado_at', v_cobro.created_at, 'cobrado_por', v_cobro.created_by, 'metodos', v_metodos),
    p_evidencia, v_cobro.turno_id, v_turno_abierto, p_actor, p_actor);

  -- Si lo había marcado la conciliación, queda resuelto.
  update public.conciliacion_terminal
  set resuelta_at = now(), resuelta_motivo = 'Marcado como no recibido: ' || v_motivo, resuelta_por = p_actor
  where cobro_id = p_cobro_id and resuelta_at is null;

  return jsonb_build_object('devolucion_id', v_dev, 'monto', v_monto, 'reserva_id', v_cobro.reserva_id,
    'turno_cobro_id', v_cobro.turno_id, 'turno_efecto_id', v_turno_abierto, 'turno_del_cobro_cerrado', v_cobro.turno_estado <> 'abierto');
end;
$$;
