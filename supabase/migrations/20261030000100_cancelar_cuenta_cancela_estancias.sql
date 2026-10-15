-- QA externa B16 (15 de octubre de 2026): se canceló desde Caja la cuenta de una reserva de guardería
-- futura; la cuenta salió de Caja pero la estancia siguió «reservada», ocupando cupo y sin aparecer en
-- ninguna lista. Ahora «Cancelar cuenta» cancela también la reserva de guardería u hotel que no ha
-- empezado, en el mismo paso y bajo la misma casilla que ya cancelaba las citas de estética:
--   · «No se presentó» deja la estancia en «no llegó» (no devuelve el pase);
--   · los demás motivos la dejan «cancelada» (el trigger de siempre devuelve el pase y libera el cupo);
--   · una estancia en curso o terminada no se toca.
-- Además repara las que ya estaban en ese estado (cuenta cancelada por «Cita cancelada» o «No se presentó»
-- y estancia todavía reservada/confirmada). La tabla cuentas_canceladas es inmutable, así que lo
-- reparado no se anota ahí: queda en el historial de la propia estancia (updated_at).

alter table public.cuentas_canceladas
  add column if not exists estancias_canceladas uuid[] not null default '{}',
  add column if not exists estancias_no_canceladas uuid[] not null default '{}';

-- ── 1. cancelar_cuenta ───────────────────────────────────────────────
do $$
declare
  v_def text := replace(pg_get_functiondef('public.cancelar_cuenta(uuid,text,text,boolean)'::regprocedure), chr(13), '');
  v_nuevo text;
begin
  if position('estancias_canceladas' in v_def) > 0 then
    return;
  end if;
  v_nuevo := replace(v_def, $a$  v_id uuid;
begin$a$, $b$  v_id uuid;
  v_est record;
  v_est_canc uuid[] := '{}';
  v_est_no uuid[] := '{}';
begin$b$);
  if v_nuevo = v_def then raise exception 'cancelar_cuenta cambió: no se pudo declarar las estancias.'; end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def, $a$  insert into public.cuentas_canceladas (reserva_id,$a$, $b$  -- La reserva de guardería u hotel que no ha empezado se cancela en el mismo paso, si se pidió.
  if coalesce(p_cancelar_cita, false) then
    for v_est in
      select e.id, e.estado from public.estancias e
      where e.reserva_id = r.id and e.deleted_at is null and e.estado not in ('cancelada', 'no_llego', 'finalizada')
      order by e.fecha_entrada
    loop
      if v_est.estado in ('reservada', 'confirmada') then
        update public.estancias
           set estado = case when p_motivo = 'no_se_presento' then 'no_llego' else 'cancelada' end
         where id = v_est.id;
        v_est_canc := array_append(v_est_canc, v_est.id);
      else
        v_est_no := array_append(v_est_no, v_est.id);
      end if;
    end loop;
  end if;

  insert into public.cuentas_canceladas (reserva_id,$b$);
  if v_nuevo = v_def then raise exception 'cancelar_cuenta cambió: no se pudo cancelar las estancias.'; end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def, $a$servicio_realizado, citas_canceladas, citas_no_canceladas)
  values (r.id, r.cliente_id, p_motivo, v_texto, v_tot.saldo, coalesce(v_tot.total_cuenta, 0), v_desc, v_realizado, v_canceladas, v_no_canceladas)$a$,
  $b$servicio_realizado, citas_canceladas, citas_no_canceladas, estancias_canceladas, estancias_no_canceladas)
  values (r.id, r.cliente_id, p_motivo, v_texto, v_tot.saldo, coalesce(v_tot.total_cuenta, 0), v_desc, v_realizado, v_canceladas, v_no_canceladas, v_est_canc, v_est_no)$b$);
  if v_nuevo = v_def then raise exception 'cancelar_cuenta cambió: no se pudo guardar las estancias.'; end if;
  v_def := v_nuevo;

  v_nuevo := replace(v_def, $a$'citas_no_canceladas', to_jsonb(v_no_canceladas),$a$,
    $b$'citas_no_canceladas', to_jsonb(v_no_canceladas),
    'estancias_canceladas', to_jsonb(v_est_canc), 'estancias_no_canceladas', to_jsonb(v_est_no),$b$);
  if v_nuevo = v_def then raise exception 'cancelar_cuenta cambió: no se pudo devolver las estancias.'; end if;
  execute v_nuevo;
end $$;

-- ── 2. cuenta_para_cancelar: las estancias que se pueden cancelar en el mismo paso ──
do $$
declare
  v_def text := replace(pg_get_functiondef('public.cuenta_para_cancelar(uuid)'::regprocedure), chr(13), '');
  v_nuevo text;
begin
  if position('estancias_pendientes' in v_def) > 0 then
    return;
  end if;
  v_nuevo := replace(v_def, $a$'citas_pendientes', coalesce(v_citas, '[]'::jsonb),$a$,
    $b$'citas_pendientes', coalesce(v_citas, '[]'::jsonb),
    'estancias_pendientes', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'estado', e.estado, 'fecha_entrada', e.fecha_entrada) order by e.fecha_entrada)
      from public.estancias e where e.reserva_id = p_reserva_id and e.deleted_at is null and e.estado in ('reservada', 'confirmada')), '[]'::jsonb),$b$);
  if v_nuevo = v_def then raise exception 'cuenta_para_cancelar cambió: no se pudo agregar las estancias.'; end if;
  execute v_nuevo;
end $$;

-- ── 3. Reparación: cuenta cancelada y reserva todavía abierta ────────
do $$
declare
  r record;
  v_n int := 0;
  v_admin uuid;
begin
  for r in
    select e.id, cc.negocio_id, cc.motivo
    from public.cuentas_canceladas cc
    join public.estancias e on e.reserva_id = cc.reserva_id and e.negocio_id = cc.negocio_id
    where cc.motivo in ('cita_cancelada', 'no_se_presento')
      and e.deleted_at is null
      and e.estado in ('reservada', 'confirmada')
    order by e.fecha_entrada
  loop
    perform set_config('app.negocio_id', r.negocio_id::text, true);
    -- Cancelar una estancia devuelve su pase y eso lo hace un admin o recepción: se actúa como un admin del negocio.
    select m.profile_id into v_admin from public.membresias m
     where m.negocio_id = r.negocio_id and m.rol = 'admin' and m.deleted_at is null order by m.created_at limit 1;
    if v_admin is null then
      raise notice 'Sin admin en el negocio %: no se reparó la estancia %.', r.negocio_id, r.id;
      continue;
    end if;
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    update public.estancias
       set estado = case when r.motivo = 'no_se_presento' then 'no_llego' else 'cancelada' end
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  perform set_config('app.negocio_id', '', true);
  perform set_config('request.jwt.claims', '', true);
  raise notice 'Reservas reparadas (cuenta cancelada y reserva abierta): %', v_n;
end $$;
