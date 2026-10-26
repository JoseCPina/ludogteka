-- QA S36: una cita de estética iniciada por error («En curso») no se podía cancelar ni regresar. Ahora, desde la ficha
-- de la cita: «Regresar a reservada» y «Cancelar» con motivo, los dos SOLO si la cita no tiene cobros ni consumo de
-- inventario (lo que la ligaría a caja e inventario). Quedan en el historial de la cita.

-- La puerta en_curso → reservada / cancelada de una cita la abre solo `deshacer_inicio_cita` (como la de las estancias,
-- que abre `deshacer_checkin_estancia`).
create or replace function public.transicion_estado_reserva_valida(p_anterior text, p_nuevo text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select
    (p_anterior = 'reservada' and p_nuevo in ('confirmada', 'cancelada', 'no_llego', 'en_curso'))
    or (p_anterior = 'confirmada' and p_nuevo in ('en_curso', 'cancelada', 'no_llego'))
    or (p_anterior = 'en_curso' and p_nuevo = 'finalizada')
    -- Solo deshacer_checkin_estancia prende esta puerta, y solo para estancias.
    or (p_anterior = 'en_curso' and p_nuevo = 'reservada'
        and coalesce(current_setting('app.deshacer_checkin', true), '') = 'on')
    -- Solo deshacer_inicio_cita prende esta, y solo para citas de estética sin cobros ni consumo.
    or (p_anterior = 'en_curso' and p_nuevo in ('reservada', 'cancelada')
        and coalesce(current_setting('app.deshacer_inicio_cita', true), '') = 'on');
$$;

alter table public.citas_estetica_cambios drop constraint if exists citas_estetica_cambios_tipo_check;
alter table public.citas_estetica_cambios add constraint citas_estetica_cambios_tipo_check
  check (tipo in ('reprogramacion', 'cancelacion', 'no_llego', 'eliminacion', 'tarifa_guarderia', 'regreso_a_reservada'));

create or replace function public.deshacer_inicio_cita(p_cita_id uuid, p_destino text, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.citas_estetica%rowtype;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_cobrado numeric;
begin
  if p_destino is null or p_destino not in ('reservada', 'cancelada') then
    raise exception 'Una cita en curso solo regresa a reservada o se cancela.';
  end if;
  select * into c from public.citas_estetica
  where id = p_cita_id and negocio_id = public.negocio_actual() and deleted_at is null for update;
  if not found then
    raise exception 'Cita no encontrada.';
  end if;
  if not (coalesce(public.current_rol() in ('admin', 'recepcion'), false) or (public.current_rol() = 'estetica' and c.empleado_id = auth.uid())) then
    raise exception 'Solo admin, recepción o la estilista de la cita la regresan o la cancelan.' using errcode = '42501';
  end if;
  if c.estado <> 'en_curso' then
    raise exception 'Esta cita no está en curso (está %).', replace(c.estado, '_', ' ');
  end if;
  if p_destino = 'cancelada' and char_length(coalesce(v_motivo, '')) < 3 then
    raise exception 'Escribe el motivo de la cancelación.';
  end if;
  select t.total_cobrado into v_cobrado from public.cuenta_totales_reserva(c.reserva_id) t;
  if coalesce(v_cobrado, 0) > 0 then
    raise exception 'Esta cita ya tiene un cobro ($%). Anula el cobro primero (Caja → la cuenta → Anular cobro): /caja/cobrar/%', v_cobrado, c.reserva_id;
  end if;
  if exists (select 1 from public.movimientos_inventario m where m.cita_estetica_id = c.id and m.deleted_at is null) then
    raise exception 'Esta cita ya descontó insumos del inventario: no se puede regresar ni cancelar.';
  end if;

  perform set_config('app.cambio_agenda', 'on', true);
  perform set_config('app.deshacer_inicio_cita', 'on', true);
  update public.citas_estetica
     set estado = p_destino,
         entregado_por_nombre = case when p_destino = 'reservada' then null else entregado_por_nombre end,
         entregado_por_telefono = case when p_destino = 'reservada' then null else entregado_por_telefono end
   where id = p_cita_id;
  perform set_config('app.deshacer_inicio_cita', 'off', true);
  perform set_config('app.cambio_agenda', 'off', true);

  insert into public.citas_estetica_cambios (cita_id, tipo, motivo, estado_antes, estado_despues, inicio_antes, inicio_despues, fin_antes, fin_despues)
  values (p_cita_id, case when p_destino = 'reservada' then 'regreso_a_reservada' else 'cancelacion' end,
          coalesce(v_motivo, 'Se inició por error'), c.estado, p_destino, c.inicio, c.inicio, c.fin, c.fin);
  return jsonb_build_object('cita_id', p_cita_id, 'estado', p_destino);
end;
$$;
alter function public.deshacer_inicio_cita(uuid, text, text) owner to peludesk_definer;
revoke execute on function public.deshacer_inicio_cita(uuid, text, text) from public, anon;
grant execute on function public.deshacer_inicio_cita(uuid, text, text) to authenticated, service_role;
