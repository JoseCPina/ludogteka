-- Arreglos de 20261011000000 (ajuste de días usados de un pase), encontrados
-- al probarla contra la base:
--
--  1. Deshacer un check-in lleva la estancia de «en curso» a «reservada», y la
--     tabla de transiciones no lo permite (con razón: nadie lo hace a mano).
--     La transición solo vale con la puerta `app.deshacer_checkin`, que ÚNICAMENTE
--     prende deshacer_checkin_estancia dentro de su transacción. La función deja
--     de ser IMMUTABLE (lee un ajuste de sesión).
--  2. El historial de ajustes es información de caja, igual que el saldo de los
--     pases (estética no los ve): solo admin y recepción lo leen.
--
-- REVERSA: volver a poner transicion_estado_reserva_valida de
-- 20260729002707 (immutable, sin la puerta) y las dos lecturas con is_staff().

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
        and coalesce(current_setting('app.deshacer_checkin', true), '') = 'on');
$$;

create or replace function public.deshacer_checkin_estancia(
  p_estancia_id uuid,
  p_motivo text,
  p_motivo_texto text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_e record;
  v_b record;
  v_ids uuid[] := '{}';
  v_snapshot jsonb;
  v_hoy date := public.fecha_negocio();
  v_disp_despues int;
  v_devolucion jsonb;
  v_devueltos int := 0;
  v_antes jsonb := '[]'::jsonb;
  v_pase record;
begin
  if not coalesce(public.tiene_permiso('ajustar_pases'), false) then
    raise exception 'No tienes el permiso «Ajustar días de pases». Pídeselo a un admin.' using errcode = '42501';
  end if;
  if p_motivo is null or p_motivo not in ('checkin_por_error', 'dia_no_registrado', 'uso_previo', 'otro') then
    raise exception 'Elige el motivo.';
  end if;
  if p_motivo = 'otro' and btrim(coalesce(p_motivo_texto, '')) = '' then
    raise exception 'Con «Otro», escribe el motivo.';
  end if;

  select e.id, e.perro_id, e.estado, e.fecha_entrada, e.hora_entrada_real, e.entregado_por_nombre,
         e.entregado_por_telefono, e.estado_llegada, e.foto_llegada_path
    into v_e
  from public.estancias e
  where e.id = p_estancia_id and e.deleted_at is null
  for update;
  if not found then
    raise exception 'Estancia no encontrada.';
  end if;
  if v_e.estado <> 'en_curso' then
    raise exception 'Solo se deshace el check-in de un perro que está adentro (en curso).';
  end if;

  -- Los pases que cubren esta estancia (consumos menos devoluciones).
  for v_b in
    select mb.bono_cliente_id as id
    from public.movimientos_bono mb
    where mb.item_tipo = 'estancia' and mb.item_id = p_estancia_id and mb.tipo in ('consumo', 'devolucion')
    group by mb.bono_cliente_id
    having sum(case mb.tipo when 'consumo' then mb.cantidad else -mb.cantidad end) > 0
  loop
    v_ids := array_append(v_ids, v_b.id);
  end loop;
  if cardinality(v_ids) = 0 then
    raise exception 'Este check-in no usó un pase, así que no hay un día que devolver. Si fue por error, cancela la estancia o márcala «no llegó».';
  end if;

  v_snapshot := jsonb_build_object(
    'estado_anterior', v_e.estado,
    'hora_entrada_real', v_e.hora_entrada_real,
    'entregado_por_nombre', v_e.entregado_por_nombre,
    'entregado_por_telefono', v_e.entregado_por_telefono,
    'estado_llegada', v_e.estado_llegada,
    'foto_llegada_path', v_e.foto_llegada_path,
    'fecha_entrada', v_e.fecha_entrada
  );

  -- No se devuelve a un pase vencido (la devolución se salta sola): se avisa
  -- antes de tocar nada.
  for v_b in
    select bc.id, bc.fecha_vencimiento from public.bonos_clientes bc where bc.id = any (v_ids)
  loop
    if v_b.fecha_vencimiento is not null and v_b.fecha_vencimiento < v_hoy then
      raise exception 'El pase venció el %: el día no se puede devolver. Un admin puede extender su vigencia con «Ajustar días usados» y luego repetir esto.', v_b.fecha_vencimiento;
    end if;
  end loop;

  for v_pase in
    select bc.id, bc.perro_id, bc.cantidad_total, bc.cantidad_disponible, bc.fecha_vencimiento
    from public.bonos_clientes bc where bc.id = any (v_ids) for update
  loop
    v_antes := v_antes || jsonb_build_object(
      'id', v_pase.id, 'perro_id', v_pase.perro_id, 'total', v_pase.cantidad_total,
      'disp', v_pase.cantidad_disponible, 'venc', v_pase.fecha_vencimiento);
  end loop;

  -- El día vuelve al pase por el camino que ya usa cancelar una estancia.
  v_devolucion := public.devolver_bono_de_item(
    'estancia', p_estancia_id, 'Check-in deshecho: ' ||
    case p_motivo when 'checkin_por_error' then 'check-in marcado por error'
                  when 'dia_no_registrado' then 'día no registrado'
                  when 'uso_previo' then 'uso previo a PeluDesk'
                  else btrim(p_motivo_texto) end);
  v_devueltos := coalesce((v_devolucion ->> 'devueltos')::int, 0);

  for v_pase in
    select (x ->> 'id')::uuid as id, (x ->> 'perro_id')::uuid as perro_id, (x ->> 'total')::int as total,
           (x ->> 'disp')::int as disp, (x ->> 'venc')::date as venc
    from jsonb_array_elements(v_antes) x
  loop
    select cantidad_disponible into v_disp_despues from public.bonos_clientes where id = v_pase.id;
    insert into public.bonos_ajustes (
      bono_cliente_id, perro_id, origen, motivo, motivo_texto,
      usados_antes, usados_despues, total, disponibles_antes, disponibles_despues,
      vencimiento_antes, vencimiento_despues, estado_antes, estado_despues, fechas,
      estancia_id, checkin_snapshot
    ) values (
      v_pase.id, v_pase.perro_id, 'deshacer_checkin', p_motivo, nullif(btrim(coalesce(p_motivo_texto, '')), ''),
      greatest(v_pase.total - v_pase.disp, 0), greatest(v_pase.total - v_disp_despues, 0), v_pase.total,
      v_pase.disp, v_disp_despues, v_pase.venc, v_pase.venc,
      case when v_pase.disp = 0 then 'agotado' else 'activo' end,
      case when v_disp_despues = 0 then 'agotado' else 'activo' end,
      array[v_e.fecha_entrada], p_estancia_id, v_snapshot
    );
  end loop;

  -- El check-in vuelve a empezar; lo que se capturó queda en el snapshot.
  perform set_config('app.deshacer_checkin', 'on', true);
  update public.estancias
  set estado = 'reservada', hora_entrada_real = null
  where id = p_estancia_id;
  perform set_config('app.deshacer_checkin', 'off', true);

  return jsonb_build_object('devueltos', v_devueltos, 'estancia_id', p_estancia_id, 'devolucion', v_devolucion);
end;
$$;

-- Lectura: caja (admin y recepción), como el saldo de los pases.
drop policy bonos_ajustes_select on public.bonos_ajustes;
create policy bonos_ajustes_select on public.bonos_ajustes
  for select to authenticated using ((select public.current_rol()) in ('admin', 'recepcion'));

create or replace function public.historial_ajustes_pase(p_bono_id uuid)
returns table (
  id uuid, cuando timestamptz, origen text, motivo text, motivo_texto text,
  usados_antes int, usados_despues int, total int,
  disponibles_antes int, disponibles_despues int,
  vencimiento_antes date, vencimiento_despues date,
  fechas date[], estancia_id uuid, por_nombre text
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.created_at, a.origen, a.motivo, a.motivo_texto,
    a.usados_antes, a.usados_despues, a.total, a.disponibles_antes, a.disponibles_despues,
    a.vencimiento_antes, a.vencimiento_despues, a.fechas, a.estancia_id,
    coalesce(nullif(btrim(h.nombre_completo), ''), 'Alguien del equipo')
  from public.bonos_ajustes a
  left join public.profiles h on h.id = a.created_by
  where a.bono_cliente_id = p_bono_id and a.deleted_at is null
    and a.negocio_id = public.negocio_actual()
    and coalesce(public.current_rol(), 'anonimo') in ('admin', 'recepcion')
  order by a.created_at desc;
$$;
