-- El demo cobra sus cuentas (24 de octubre de 2026). estancias_poner_al_dia (20261202000700) hacía el check-out de lo que
-- ya pasó, pero la cuenta se quedaba en «Debe» (35 en producción). En el demo, cada cuenta de estancias que ya terminó
-- con saldo y sin cobro se cobra completa el día de su salida, a los 5 minutos: en efectivo, y 1 de cada 10 con
-- terminal. Así Caja, Reportes y el portal se ven como un negocio operando.
--
-- Por los mismos caminos que la app (registrar_cobro y cerrar_turno, con sus reglas y sus totales), como lo hace
-- sembrar-demo con la sesión de recepción:
--   * El cobro va en el turno de ese día. Si no hay, se abre (fondo $800, 08:45; sábado 09:45) con la recepción del
--     demo, y al final se cierra con el conteo igual a lo esperado (diferencia $0) a las 19:15 (sábado 14:20). Un turno
--     de un día anterior que se quedó abierto se cierra igual, con quien lo abrió.
--   * Se hace pasar por esa persona (auth.uid) solo dentro de esta transacción, y les abre la escritura a las cuentas
--     del demo (membresias.solo_lectura) solo mientras tanto: al terminar todo vuelve como estaba, y nadie ve el cambio
--     porque es la misma transacción.
--   * Las horas se fechan después con la llave de servicio, como en sembrar-demo.
-- Solo el demo (plan 'demo'). Los negocios PRUEBA de QA no cobran nada.

create or replace function public.demo_cobrar_cuentas(p_negocio uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date;
  v_zona text;
  v_recep uuid;
  v_sl uuid[];
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  r record;
  t record;
  v_saldo numeric;
  v_dia date;
  v_turno uuid;
  v_estado text;
  v_cobro uuid;
  v_metodo text;
  v_previo record;
  v_cobros int := 0;
  v_total numeric := 0;
  v_abiertos int := 0;
  v_cerrados int := 0;
  v_omitidas int := 0;
begin
  if coalesce((select n.plan from public.negocios n where n.id = p_negocio), '') <> 'demo' then
    return jsonb_build_object('cobros', 0);
  end if;
  perform set_config('app.negocio_id', p_negocio::text, true);
  v_hoy := public.fecha_negocio();
  v_zona := public.zona_negocio();

  select m.profile_id into v_recep
    from public.membresias m
   where m.negocio_id = p_negocio and m.rol = 'recepcion' and m.deleted_at is null
   -- La recepción sembrada (de solo lectura, la que ve el visitante), no la cuenta gemela del corredor de tutoriales.
   order by m.solo_lectura desc, m.created_at, m.profile_id
   limit 1;
  if v_recep is null then
    return jsonb_build_object('cobros', 0, 'motivo', 'el demo no tiene recepción');
  end if;

  -- Escritura abierta solo dentro de esta transacción.
  select coalesce(array_agg(m.id), '{}') into v_sl
    from public.membresias m where m.negocio_id = p_negocio and m.solo_lectura and m.deleted_at is null;
  -- proteger_membresia solo deja a la plataforma (o a un cambio interno) tocar solo_lectura.
  perform set_config('app.asignacion_rol_interna', 'on', true);
  update public.membresias set solo_lectura = false where id = any (v_sl);
  perform set_config('app.asignacion_rol_interna', '', true);

  for r in
    select e.reserva_id, max(e.hora_salida_real) as salio
      from public.estancias e
     where e.negocio_id = p_negocio and e.deleted_at is null
     group by e.reserva_id
    having bool_and(e.estado in ('finalizada', 'no_llego', 'cancelada'))
       and bool_or(e.estado = 'finalizada')
       and (max(e.hora_salida_real) at time zone v_zona)::date < v_hoy
       and not exists (select 1 from public.cobros c where c.reserva_id = e.reserva_id)
     order by max(e.hora_salida_real), e.reserva_id
  loop
    select ct.saldo into v_saldo from public.cuenta_totales_reserva(r.reserva_id) ct;
    if coalesce(v_saldo, 0) <= 0 then
      continue;
    end if;
    v_dia := (r.salio at time zone v_zona)::date;

    -- Los turnos de días anteriores que se quedaron abiertos se cierran primero (uno abierto a la vez).
    for t in
      select tc.id, tc.abierto_por, (tc.abierto_at at time zone v_zona)::date as dia
        from public.turnos_caja tc
       where tc.negocio_id = p_negocio and tc.estado = 'abierto' and (tc.abierto_at at time zone v_zona)::date < v_dia
    loop
      perform set_config('request.jwt.claim.sub', '', true);
      perform set_config('request.jwt.claims', json_build_object('sub', t.abierto_por, 'role', 'authenticated')::text, true);
      select * into v_previo from public.cerrar_turno(t.id, 0, 0, 0, null, null);
      if not v_previo.cerrado then
        perform public.cerrar_turno(t.id, v_previo.esperado_efectivo, v_previo.esperado_terminal, v_previo.esperado_transferencia, null, null);
      end if;
      update public.turnos_caja set cerrado_at = (t.dia + case when extract(isodow from t.dia) = 6 then time '14:20' else time '19:15' end) at time zone v_zona
       where id = t.id;
      update public.cortes_caja set created_at = (t.dia + case when extract(isodow from t.dia) = 6 then time '14:20' else time '19:15' end) at time zone v_zona
       where turno_id = t.id;
      v_cerrados := v_cerrados + 1;
    end loop;

    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_recep, 'role', 'authenticated')::text, true);

    select tc.id, tc.estado into v_turno, v_estado
      from public.turnos_caja tc
     where tc.negocio_id = p_negocio and (tc.abierto_at at time zone v_zona)::date = v_dia
     order by tc.abierto_at desc
     limit 1;
    if v_turno is not null and v_estado <> 'abierto' then
      -- Ese día ya se cerró (un corte real): no se le agrega nada.
      v_omitidas := v_omitidas + 1;
      continue;
    end if;
    if v_turno is null then
      if exists (select 1 from public.turnos_caja tc where tc.negocio_id = p_negocio and tc.estado = 'abierto') then
        v_omitidas := v_omitidas + 1; -- el de hoy está abierto: un turno abierto a la vez
        continue;
      end if;
      insert into public.turnos_caja (abierto_por, fondo_inicial, notas_apertura)
      values (v_recep, 800, null)
      returning id into v_turno;
      update public.turnos_caja
         set abierto_at = (v_dia + case when extract(isodow from v_dia) = 6 then time '09:45' else time '08:45' end) at time zone v_zona,
             created_at = (v_dia + time '08:45') at time zone v_zona
       where id = v_turno;
      v_abiertos := v_abiertos + 1;
    end if;

    v_metodo := case when abs(hashtext(r.reserva_id::text)) % 10 = 0 then 'terminal' else 'efectivo' end;
    v_cobro := public.registrar_cobro(r.reserva_id, null, jsonb_build_array(jsonb_build_object('metodo', v_metodo, 'monto', v_saldo, 'propina', 0)));
    update public.cobros set created_at = r.salio + interval '5 minutes' where id = v_cobro;
    update public.cobro_metodos set created_at = r.salio + interval '5 minutes' where cobro_id = v_cobro;
    v_cobros := v_cobros + 1;
    v_total := v_total + v_saldo;
  end loop;

  -- Al final, ningún turno de un día anterior queda abierto: se cierra con diferencia $0.
  for t in
    select tc.id, tc.abierto_por, (tc.abierto_at at time zone v_zona)::date as dia
      from public.turnos_caja tc
     where tc.negocio_id = p_negocio and tc.estado = 'abierto' and (tc.abierto_at at time zone v_zona)::date < v_hoy
  loop
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', json_build_object('sub', t.abierto_por, 'role', 'authenticated')::text, true);
    select * into v_previo from public.cerrar_turno(t.id, 0, 0, 0, null, null);
    if not v_previo.cerrado then
      perform public.cerrar_turno(t.id, v_previo.esperado_efectivo, v_previo.esperado_terminal, v_previo.esperado_transferencia, null, null);
    end if;
    update public.turnos_caja set cerrado_at = (t.dia + case when extract(isodow from t.dia) = 6 then time '14:20' else time '19:15' end) at time zone v_zona
     where id = t.id;
    update public.cortes_caja set created_at = (t.dia + case when extract(isodow from t.dia) = 6 then time '14:20' else time '19:15' end) at time zone v_zona
     where turno_id = t.id;
    v_cerrados := v_cerrados + 1;
  end loop;

  -- Todo como estaba: primero la identidad de quien llamó (para que la bitácora no lo anote a nombre de recepción) y
  -- luego la solo lectura.
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('app.asignacion_rol_interna', 'on', true);
  update public.membresias set solo_lectura = true where id = any (v_sl);
  perform set_config('app.asignacion_rol_interna', '', true);

  return jsonb_build_object('cobros', v_cobros, 'total', v_total, 'turnos_abiertos', v_abiertos, 'turnos_cerrados', v_cerrados, 'omitidas', v_omitidas);
end;
$$;
revoke execute on function public.demo_cobrar_cuentas(uuid) from public, anon, authenticated;
grant execute on function public.demo_cobrar_cuentas(uuid) to service_role;

-- estancias_poner_al_dia en modo 'atender' (solo el demo) cobra al terminar.
do $$
declare
  v_def text;
begin
  select replace(pg_get_functiondef('public.estancias_poner_al_dia(uuid, text)'::regprocedure), chr(13), '') into v_def;
  if position('public.demo_cobrar_cuentas(' in v_def) > 0 then
    return;
  end if;
  v_def := replace(v_def,
    $t$  return jsonb_build_object('checkin', v_checkin, 'checkout', v_checkout, 'no_llego', v_no_llego);$t$,
    $t$  return jsonb_build_object('checkin', v_checkin, 'checkout', v_checkout, 'no_llego', v_no_llego)
    || case when p_modo = 'atender' then jsonb_build_object('caja', public.demo_cobrar_cuentas(p_negocio)) else '{}'::jsonb end;$t$);
  if position('public.demo_cobrar_cuentas(' in v_def) = 0 then
    raise exception 'estancias_poner_al_dia cambió: no se pudo agregar el cobro del demo.';
  end if;
  execute v_def;
end $$;

-- Una vez, ya: las cuentas que quedaron abiertas en el demo.
do $$
declare
  n record;
begin
  for n in select id, slug from public.negocios where plan = 'demo' order by slug loop
    raise notice 'demo_cobrar_cuentas %: %', n.slug, public.demo_cobrar_cuentas(n.id);
  end loop;
end $$;
