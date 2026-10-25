-- Ajustes al demo que atiende sus citas (24 de octubre de 2026, después de 20261202001000):
--   * La agenda de estética se quedaba corta (un miércoles sin citas): pedía perros sin otra cita en ±13 días y que ya
--     hubieran tenido ese mismo servicio, y el demo tiene ~30 perros para ~24 citas por semana. Ahora ±6 días (una vez
--     por semana a lo mucho), primero los que ya tuvieron ese servicio y después cualquiera con historial de estética,
--     hasta 6 intentos por cita.

create or replace function public.demo_agenda_al_dia(p_negocio uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_zona text := public.zona_negocio();
  v_ahora timestamptz := now();
  v_k int;
  v_d date;
  h record;
  v_src date;
  sc record;
  v_cand record;
  v_inicia timestamptz;
  v_res uuid;
  v_slots time[];
  v_medicos uuid[];
  v_medico uuid;
  v_i int;
  v_caso record;
  v_est int := 0;
  v_vet int := 0;
begin
  select coalesce(array_agg(m.id order by m.created_at, m.id), '{}') into v_medicos
    from public.medicos_veterinarios m
   where m.negocio_id = p_negocio and m.deleted_at is null
     and exists (select 1 from public.membresias mb where mb.profile_id = m.profile_id and mb.negocio_id = p_negocio and mb.deleted_at is null);

  for v_k in 0..6 loop
    v_d := v_hoy + v_k;
    select * into h from public.demo_horario_del_dia(v_d);
    continue when not h.abierto or (v_k = 0 and v_ahora >= h.cierra);

    -- Estética: la agenda del mismo día de la semana anterior.
    if not exists (select 1 from public.citas_estetica ce
                    where ce.negocio_id = p_negocio and ce.deleted_at is null and (ce.inicio at time zone v_zona)::date = v_d) then
      select max((ce.inicio at time zone v_zona)::date) into v_src
        from public.citas_estetica ce
       where ce.negocio_id = p_negocio and ce.deleted_at is null and ce.estado <> 'cancelada'
         and (ce.inicio at time zone v_zona)::date between v_d - 35 and v_d - 1
         and extract(isodow from (ce.inicio at time zone v_zona)::date) = extract(isodow from v_d);
      if v_src is not null then
        for sc in
          select ce.servicio_id, ce.empleado_id, (ce.inicio at time zone v_zona)::time as hora
            from public.citas_estetica ce
           where ce.negocio_id = p_negocio and ce.deleted_at is null and ce.estado <> 'cancelada' and ce.empleado_id is not null
             and (ce.inicio at time zone v_zona)::date = v_src
           order by ce.inicio, ce.id
        loop
          v_inicia := (v_d + sc.hora) at time zone v_zona;
          continue when v_inicia < v_ahora;
          for v_cand in
            select p.id
              from public.perros p
             where p.negocio_id = p_negocio and p.deleted_at is null and not coalesce(p.fallecido, false)
               and exists (select 1 from public.citas_estetica x
                            where x.perro_id = p.id and x.estado = 'finalizada' and x.deleted_at is null)
               and not exists (select 1 from public.citas_estetica y
                                where y.perro_id = p.id and y.deleted_at is null and y.estado not in ('cancelada', 'no_llego')
                                  and y.inicio > v_inicia - interval '6 days' and y.inicio < v_inicia + interval '6 days')
             -- Primero los que ya tuvieron ese servicio (su precio existe); después cualquiera con historial de estética.
             order by not exists (select 1 from public.citas_estetica x
                                   where x.perro_id = p.id and x.servicio_id = sc.servicio_id and x.estado = 'finalizada' and x.deleted_at is null),
                      (select max(y.inicio) from public.citas_estetica y where y.perro_id = p.id and y.deleted_at is null) nulls first,
                      public.demo_hash(p.id::text || v_d::text, 1000000), p.id
             limit 6
          loop
            begin
              v_res := public.crear_reserva_para_cita(v_cand.id);
              insert into public.citas_estetica (reserva_id, perro_id, servicio_id, empleado_id, inicio, pelo_maltratado)
              values (v_res, v_cand.id, sc.servicio_id, sc.empleado_id, v_inicia, false);
              v_est := v_est + 1;
              exit;
            exception when others then
              null; -- otro perro (sin precio para su talla, estilista ocupada…)
            end;
          end loop;
        end loop;
      end if;
    end if;

    -- Veterinaria: 2 citas entre semana, 1 el sábado, alternando médicos.
    if cardinality(v_medicos) > 0 and public.modulo_activo('veterinaria')
       and not exists (select 1 from public.vet_citas c
                        where c.negocio_id = p_negocio and c.deleted_at is null and (c.inicia_at at time zone v_zona)::date = v_d) then
      v_slots := case when extract(isodow from v_d) = 6 then array[time '10:30'] else array[time '10:00', time '16:30'] end;
      for v_i in 1..cardinality(v_slots) loop
        v_inicia := (v_d + v_slots[v_i]) at time zone v_zona;
        continue when v_inicia < v_ahora;
        v_medico := v_medicos[1 + public.demo_hash(v_d::text || v_i::text, cardinality(v_medicos))];
        for v_cand in
          select p.id, p.especie
            from public.perros p
           where p.negocio_id = p_negocio and p.deleted_at is null and not coalesce(p.fallecido, false) and p.especie in ('perro', 'gato')
             and not exists (select 1 from public.vet_citas c
                              where c.perro_id = p.id and c.deleted_at is null and c.estado not in ('cancelada', 'no_llego')
                                and c.inicia_at > v_inicia - interval '21 days' and c.inicia_at < v_inicia + interval '21 days')
             and not exists (select 1 from public.vet_consultas c
                              where c.perro_id = p.id and c.deleted_at is null and c.estado <> 'anulada' and c.atendida_at > v_inicia - interval '21 days')
             and not exists (select 1 from public.hospitalizaciones hz where hz.perro_id = p.id and hz.estado = 'ingresado' and hz.deleted_at is null)
           order by (select max(c.atendida_at) from public.vet_consultas c where c.perro_id = p.id and c.deleted_at is null) nulls first,
                    public.demo_hash(p.id::text || v_d::text || v_i::text, 1000000), p.id
           limit 3
        loop
          select * into v_caso from public.demo_caso_vet(v_cand.especie, v_cand.id::text || v_d::text)
            as (n int, especie text, apto boolean, tipo text, motivo text, anamnesis text, examen text, diagnostico text, dx_tipo text,
                plan text, tratamiento text, temperatura numeric, producto text, dosis text, via text, frecuencia text,
                frecuencia_horas numeric, dias int, surtir numeric, unidad text);
          begin
            perform public.vet_agendar_cita(v_cand.id, v_caso.tipo, v_medico, v_inicia, null, v_caso.motivo);
            v_vet := v_vet + 1;
            exit;
          exception when others then
            null;
          end;
        end loop;
      end loop;
    end if;
  end loop;
  return jsonb_build_object('estetica', v_est, 'vet', v_vet);
end;
$$;
revoke execute on function public.demo_agenda_al_dia(uuid) from public, anon, authenticated;
grant execute on function public.demo_agenda_al_dia(uuid) to service_role;

-- Una vez, ya: los días de la próxima semana que se quedaron sin agenda.
do $$
declare
  n record;
begin
  for n in select id, slug from public.negocios where plan = 'demo' order by slug loop
    raise notice 'estancias_poner_al_dia %: %', n.slug, public.estancias_poner_al_dia(n.id, 'atender');
  end loop;
end $$;
