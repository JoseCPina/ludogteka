-- El demo con su caja en horario (24 de octubre de 2026). El cron /api/cron/demo pone al día el demo, pero el turno de
-- caja solo existía en los días con cobros: en horario, un prospecto entraba a Caja y no veía turno abierto. Ahora el
-- demo vive el día como un negocio operando, con el horario de su configuración (resolver_cupo_configuracion):
--   * A la hora de apertura se abre el turno del día (fondo $800, con la recepción del demo), fechado a la apertura.
--   * Durante el día se hacen los check-ins de las llegadas de hoy (10:00 o la apertura) y los check-outs que ya
--     tocaron (hotel a las 12:00 de su salida; guardería a las horas que reservó o 8 h, a más tardar 15 minutos antes
--     del cierre), y cada cuenta terminada se cobra a los 5 minutos de su salida dentro del turno de su día.
--   * A la hora de cierre el turno se cierra con el conteo igual a lo esperado (diferencia $0), fechado al cierre.
--   * Fuera de horario (antes de abrir, después de cerrar, domingo) no hay turno abierto.
-- Una llegada de hoy que «no llega» (1 de cada 8) se queda pendiente hasta el día siguiente, cuando pasa a «No llegó».
-- Los negocios PRUEBA de QA (modo 'no_llego') siguen igual: solo lo de días pasados, y no cobran nada.

-- Apertura y cierre de un día del negocio de la petición (app.negocio_id). Sin horario ese día (domingo): abre = false,
-- con 09:00–19:00 de referencia para fechar lo que haya que cerrar.
create or replace function public.demo_horario_del_dia(p_fecha date, out abre timestamptz, out cierra timestamptz, out abierto boolean)
language sql
stable
set search_path = ''
as $$
  select (p_fecha + coalesce(c.hora_apertura, time '09:00')) at time zone public.zona_negocio(),
         (p_fecha + coalesce(c.hora_cierre, time '19:00')) at time zone public.zona_negocio(),
         c.hora_apertura is not null and c.hora_cierre is not null
    from public.resolver_cupo_configuracion(p_fecha) c;
$$;
revoke execute on function public.demo_horario_del_dia(date) from public, anon, authenticated;
grant execute on function public.demo_horario_del_dia(date) to service_role;

create or replace function public.estancias_poner_al_dia(p_negocio uuid, p_modo text)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date;
  v_zona text;
  v_ahora timestamptz := now();
  v_hoy_tambien boolean := p_modo = 'atender';
  r record;
  v_entra timestamptz;
  v_sale timestamptz;
  v_checkin int := 0;
  v_checkout int := 0;
  v_no_llego int := 0;
begin
  if p_modo not in ('atender', 'no_llego') then
    raise exception 'Modo desconocido: %', p_modo;
  end if;
  perform set_config('app.negocio_id', p_negocio::text, true);
  v_hoy := public.fecha_negocio();
  v_zona := public.zona_negocio();

  for r in
    select e.id, e.fecha_entrada, e.fecha_salida, e.estado, e.hora_entrada_real, e.horas, s.categoria, c.nombre as cliente
      from public.estancias e
      join public.servicios s on s.id = e.servicio_id
      join public.perros p on p.id = e.perro_id
      join public.clientes c on c.id = p.cliente_id
     where e.negocio_id = p_negocio
       and e.deleted_at is null
       and ((e.estado in ('reservada', 'confirmada') and e.hora_entrada_real is null
             and (e.fecha_entrada < v_hoy or (v_hoy_tambien and e.fecha_entrada = v_hoy)))
            or (e.estado = 'en_curso'
                and ((s.categoria = 'hotel' and (e.fecha_salida < v_hoy or (v_hoy_tambien and e.fecha_salida = v_hoy)))
                     or (s.categoria <> 'hotel' and (e.fecha_entrada < v_hoy or (v_hoy_tambien and e.fecha_entrada = v_hoy))))))
     order by e.fecha_entrada, e.id
  loop
    begin
      if r.estado <> 'en_curso' then
        if r.fecha_entrada < v_hoy and (p_modo = 'no_llego' or abs(hashtext(r.id::text)) % 8 = 0) then
          update public.estancias set estado = 'no_llego' where id = r.id;
          v_no_llego := v_no_llego + 1;
          continue;
        end if;
        if r.fecha_entrada = v_hoy and abs(hashtext(r.id::text)) % 8 = 0 then
          continue; -- no llega: mañana pasa a «No llegó»
        end if;
        v_entra := greatest((r.fecha_entrada + time '10:00') at time zone v_zona, (select h.abre from public.demo_horario_del_dia(r.fecha_entrada) h));
        if v_entra > v_ahora then
          continue; -- todavía no llega
        end if;
        -- Hoy pasa por el aviso de la casa llena ya confirmado; con la hora de otro día no aplica (estancias_sobrecupo_checkin).
        update public.estancias
           set estado = 'en_curso', entregado_por_nombre = r.cliente, hora_entrada_real = v_entra, checkin_sobrecupo = 'confirmado'
         where id = r.id;
        v_checkin := v_checkin + 1;
      else
        v_entra := r.hora_entrada_real;
      end if;

      if r.categoria = 'hotel' then
        if r.fecha_salida > v_hoy or (r.fecha_salida = v_hoy and not v_hoy_tambien) then
          continue; -- sigue adentro (o se va hoy)
        end if;
        v_sale := (r.fecha_salida + time '12:00') at time zone v_zona;
      else
        v_entra := coalesce(v_entra, (r.fecha_entrada + time '10:00') at time zone v_zona);
        v_sale := greatest(v_entra + interval '30 minutes',
                           least(v_entra + make_interval(hours => coalesce(r.horas, 8)),
                                 (select h.cierra from public.demo_horario_del_dia(r.fecha_entrada) h) - interval '15 minutes'));
      end if;
      if v_sale > v_ahora then
        continue; -- todavía no sale
      end if;
      update public.estancias
         set estado = 'finalizada', recogido_por_nombre = r.cliente, recogido_por_es_dueno = true, hora_salida_real = v_sale
       where id = r.id;
      v_checkout := v_checkout + 1;
    exception when others then
      update public.estancias set estado = 'no_llego' where id = r.id and estado in ('reservada', 'confirmada') and fecha_entrada < v_hoy;
      if found then v_no_llego := v_no_llego + 1; end if;
    end;
  end loop;

  return jsonb_build_object('checkin', v_checkin, 'checkout', v_checkout, 'no_llego', v_no_llego)
    || case when p_modo = 'atender' then jsonb_build_object('caja', public.demo_cobrar_cuentas(p_negocio)) else '{}'::jsonb end;
end;
$$;
revoke execute on function public.estancias_poner_al_dia(uuid, text) from public, anon, authenticated;
grant execute on function public.estancias_poner_al_dia(uuid, text) to service_role;

create or replace function public.demo_cobrar_cuentas(p_negocio uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date;
  v_zona text;
  v_ahora timestamptz := now();
  v_recep uuid;
  v_sl uuid[];
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
  r record;
  t record;
  h record;
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

  -- Las cuentas terminadas sin cobro: a los 5 minutos de su salida, en el turno de su día.
  for r in
    select e.reserva_id, max(e.hora_salida_real) as salio
      from public.estancias e
     where e.negocio_id = p_negocio and e.deleted_at is null
     group by e.reserva_id
    having bool_and(e.estado in ('finalizada', 'no_llego', 'cancelada'))
       and bool_or(e.estado = 'finalizada')
       and max(e.hora_salida_real) + interval '5 minutes' <= v_ahora
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
      update public.turnos_caja set cerrado_at = (select x.cierra from public.demo_horario_del_dia(t.dia) x) where id = t.id;
      update public.cortes_caja set created_at = (select x.cierra from public.demo_horario_del_dia(t.dia) x) where turno_id = t.id;
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
         set abierto_at = (select x.abre from public.demo_horario_del_dia(v_dia) x),
             created_at = (select x.abre from public.demo_horario_del_dia(v_dia) x)
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

  -- Al final, fuera de horario no queda turno abierto: el de un día anterior, y el de hoy después del cierre (o en un
  -- día sin horario), se cierran con diferencia $0 a la hora de cierre de su día.
  select * into h from public.demo_horario_del_dia(v_hoy);
  for t in
    select tc.id, tc.abierto_por, (tc.abierto_at at time zone v_zona)::date as dia
      from public.turnos_caja tc
     where tc.negocio_id = p_negocio and tc.estado = 'abierto'
       and ((tc.abierto_at at time zone v_zona)::date < v_hoy
            or ((tc.abierto_at at time zone v_zona)::date = v_hoy and (not h.abierto or v_ahora >= h.cierra)))
  loop
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', json_build_object('sub', t.abierto_por, 'role', 'authenticated')::text, true);
    select * into v_previo from public.cerrar_turno(t.id, 0, 0, 0, null, null);
    if not v_previo.cerrado then
      perform public.cerrar_turno(t.id, v_previo.esperado_efectivo, v_previo.esperado_terminal, v_previo.esperado_transferencia, null, null);
    end if;
    update public.turnos_caja set cerrado_at = (select x.cierra from public.demo_horario_del_dia(t.dia) x) where id = t.id;
    update public.cortes_caja set created_at = (select x.cierra from public.demo_horario_del_dia(t.dia) x) where turno_id = t.id;
    v_cerrados := v_cerrados + 1;
  end loop;

  -- En horario, el turno de hoy abierto desde la apertura (si hoy no se ha abierto uno).
  if h.abierto and v_ahora >= h.abre and v_ahora < h.cierra
     and not exists (select 1 from public.turnos_caja tc
                      where tc.negocio_id = p_negocio and (tc.abierto_at at time zone v_zona)::date = v_hoy)
     and not exists (select 1 from public.turnos_caja tc where tc.negocio_id = p_negocio and tc.estado = 'abierto') then
    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_recep, 'role', 'authenticated')::text, true);
    insert into public.turnos_caja (abierto_por, fondo_inicial, notas_apertura)
    values (v_recep, 800, null)
    returning id into v_turno;
    update public.turnos_caja set abierto_at = h.abre, created_at = h.abre where id = v_turno;
    v_abiertos := v_abiertos + 1;
  end if;

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

-- Una vez, ya: el demo al día con su turno según la hora.
do $$
declare
  n record;
begin
  for n in select id, slug from public.negocios where plan = 'demo' order by slug loop
    raise notice 'estancias_poner_al_dia %: %', n.slug, public.estancias_poner_al_dia(n.id, 'atender');
  end loop;
end $$;
