-- El demo atiende Estética y Veterinaria (24 de octubre de 2026). Hotel y guardería ya vivían su día solos
-- (20261202000700 a 000900); las citas no: la agenda sembrada se acababa y lo pasado se quedaba «reservada». Ahora, en el
-- demo (plan 'demo'), el cron de cada 15 minutos también:
--   * Llena la agenda de los próximos 7 días con horario que todavía no tengan citas:
--       Estética: la misma agenda del mismo día de la semana anterior (servicio, estilista y hora), con perros que ya
--         tuvieron ese servicio y no tienen otra cita en ±13 días.
--       Veterinaria: 2 citas entre semana (10:00 y 16:30) y 1 el sábado (10:30), alternando médicos, con mascotas sin
--         visita en 21 días; el motivo sale de un catálogo de 20 casos ficticios (demo_casos_vet), 1 de cada 4 de
--         chequeo o vacunación.
--   * Atiende cada cita a su hora:
--       Estética: a su hora pasa a «en curso», al terminar su duración se finaliza (con su consumo; si el inventario no
--         alcanza, sin consumo) y 1 de cada 10 queda «No se presentó» a los 15 minutos. Las pasadas sin atender se
--         ponen al día igual, con sus horas.
--       Veterinaria: a su hora la médica abre la consulta (atendida a la hora de la cita); al terminar la redacta con
--         el caso (motivo, exploración, diagnóstico, plan y tratamiento), aplica la vacuna si el caso es de vacunación
--         y no tiene esa vacuna en 300 días, la firma, y 1 de cada 3 lleva receta. Una consulta firmada no se fecha
--         hacia atrás (el expediente es inmutable): una cita de un día anterior que nadie atendió queda «No llegó».
--   * Cobra cada cuenta terminada (estancias, citas de estética y consultas firmadas) a los 5 minutos de su salida, en
--     el turno de su día: en efectivo y 1 de cada 10 con terminal. Si el turno de ese día ya se cerró, se cobra en el
--     siguiente turno abierto, a la hora en que se cobra (pagó después).
-- Todo por las mismas funciones que usa la app (crear_reserva_para_cita, finalizar_cita_con_consumo,
-- cancelar_cita_estetica, vet_agendar_cita, vet_consulta_iniciar/guardar/firmar, registrar_vacuna, vet_receta_emitir,
-- registrar_cobro, cerrar_turno), haciéndose pasar por la recepción o por la médica de la cita solo dentro de la
-- transacción, como demo_cobrar_cuentas.

create or replace function public.demo_hash(p_texto text, p_n int)
returns int
language sql
immutable
set search_path = ''
as $$
  select mod(abs(hashtext(p_texto)::bigint), greatest(p_n, 1))::int;
$$;
revoke execute on function public.demo_hash(text, int) from public, anon, authenticated;
grant execute on function public.demo_hash(text, int) to service_role;

-- Los 20 casos ficticios de la clínica del demo. `apto`: chequeo o vacunación (se puede vacunar ese día).
create or replace function public.demo_casos_vet()
returns table (
  n int, especie text, apto boolean, tipo text, motivo text, anamnesis text, examen text, diagnostico text, dx_tipo text,
  plan text, tratamiento text, temperatura numeric, producto text, dosis text, via text, frecuencia text,
  frecuencia_horas numeric, dias int, surtir numeric, unidad text
)
language sql
immutable
set search_path = ''
as $$
  values
  (1, 'ambos', true, 'consulta', 'Chequeo anual', 'Sin molestias. Come y bebe normal. Vive en casa con patio.',
   'Mucosas rosadas, hidratado, ganglios normales. Auscultación sin soplos. Dentadura con sarro leve.', 'Paciente sano', 'definitivo',
   'Desparasitar hoy. Próximo chequeo en un año.', 'Desparasitante interno, dosis única.', 38.5,
   'Praziquantel, pirantel y febantel (tableta)', '1 tableta', 'Oral', 'Dosis única', null, 1, 1, 'tableta'),
  (2, 'perro', true, 'vacuna', 'Refuerzo de vacuna anual', 'Le toca su refuerzo. Sin enfermedades recientes.',
   'Buen estado general. Temperatura normal. Apto para vacunar.', 'Paciente sano, apto para vacunación', 'definitivo',
   'Vacuna aplicada. Puede sentirse cansado 24 horas.', 'Desparasitante interno, dosis única.', 38.4,
   'Praziquantel, pirantel y febantel (tableta)', '1 tableta', 'Oral', 'Dosis única', null, 1, 1, 'tableta'),
  (3, 'gato', true, 'vacuna', 'Vacunación anual felina', 'Gato de interior. Sin estornudos ni vómito.',
   'Buen estado general, mucosas rosadas. Apto para vacunar.', 'Paciente sano, apto para vacunación', 'definitivo',
   'Vacuna aplicada. Vigilar el sitio de aplicación 48 horas.', 'Desparasitante interno, dosis única.', 38.7,
   'Praziquantel y pamoato de pirantel (tableta felina)', '1 tableta', 'Oral', 'Dosis única', null, 1, 1, 'tableta'),
  (4, 'ambos', true, 'seguimiento', 'Control de peso', 'Subió de peso en los últimos meses. Come premios a diario.',
   'Condición corporal 6/9. Sin otros hallazgos.', 'Sobrepeso leve', 'definitivo',
   'Reducir la ración 10 % y quitar premios. Pesarlo en un mes.', 'Omega 3 una cápsula al día por 30 días.', 38.5,
   'Omega 3 (cápsula)', '1 cápsula', 'Oral', 'Cada 24 horas', 24, 30, 30, 'cápsula'),
  (5, 'perro', true, 'consulta', 'Revisión antes de viaje', 'Viaja en dos semanas. Necesita su revisión.',
   'Buen estado general. Sin pulgas ni garrapatas.', 'Apto para viajar', 'definitivo',
   'Protección contra pulgas y garrapatas antes del viaje.', 'Fluralaner una tableta, dosis única.', 38.6,
   'Fluralaner (tableta masticable)', '1 tableta', 'Oral', 'Dosis única', null, 1, 1, 'tableta'),
  (6, 'ambos', true, 'seguimiento', 'Revisión dental de rutina', 'Mal aliento leve. Come bien.',
   'Sarro grado 1 en premolares. Encías sin sangrado.', 'Sarro dental grado 1', 'definitivo',
   'Cepillado diario. Valorar limpieza dental en 6 meses.', 'Gel dental enzimático cada 24 horas por 30 días.', 38.5,
   'Gel dental enzimático', '1 aplicación', 'Tópica oral', 'Cada 24 horas', 24, 30, 1, 'tubo'),
  (7, 'perro', false, 'consulta', 'Se rasca mucho y tiene ronchas', 'Comezón desde hace una semana. Cambió de croquetas.',
   'Eritema en abdomen y axilas, sin pulgas. Piel sin heridas abiertas.', 'Dermatitis alérgica', 'presuntivo',
   'Volver a sus croquetas de antes. Baño con champú hipoalergénico. Revisión en 10 días.', 'Prednisolona 5 mg una tableta al día por 5 días.', 38.6,
   'Prednisolona 5 mg (tableta)', '1 tableta', 'Oral', 'Cada 24 horas', 24, 5, 5, 'tableta'),
  (8, 'perro', false, 'consulta', 'Cojea de la pata trasera', 'Empezó a cojear después de correr en el parque.',
   'Dolor a la flexión de la rodilla derecha. Sin inestabilidad.', 'Esguince de rodilla', 'presuntivo',
   'Reposo 7 días, paseos cortos con correa. Revisión si no mejora.', 'Meloxicam suspensión cada 24 horas por 5 días.', 38.7,
   'Meloxicam 1.5 mg/mL (suspensión oral)', '1 mL', 'Oral', 'Cada 24 horas', 24, 5, 5, 'mL'),
  (9, 'perro', false, 'consulta', 'Vómito desde ayer', 'Vomitó tres veces. Toma agua. Comió basura en la calle.',
   'Abdomen levemente sensible, sin masas. Hidratación normal.', 'Gastritis aguda', 'definitivo',
   'Ayuno de 12 horas y dieta blanda 3 días. Volver si vomita sangre.', 'Maropitant una tableta al día por 3 días.', 38.9,
   'Maropitant 16 mg (tableta)', '1 tableta', 'Oral', 'Cada 24 horas', 24, 3, 3, 'tableta'),
  (10, 'perro', false, 'consulta', 'Diarrea con moco', 'Evacuaciones blandas con moco desde hace 2 días. Come normal.',
   'Buen estado general. Abdomen sin dolor.', 'Colitis', 'presuntivo',
   'Dieta blanda y probiótico. Coproparasitoscópico si sigue.', 'Metronidazol 250 mg cada 12 horas por 5 días.', 38.6,
   'Metronidazol 250 mg (tableta)', '1 tableta', 'Oral', 'Cada 12 horas', 12, 5, 10, 'tableta'),
  (11, 'gato', false, 'consulta', 'No quiere comer y está decaído', 'Come poco desde hace 2 días. Babea un poco.',
   'Encías inflamadas, dolor al abrir la boca. Deshidratación leve.', 'Gingivoestomatitis', 'presuntivo',
   'Alimento húmedo tibio. Revisión en 5 días para valorar limpieza dental.', 'Robenacoxib 6 mg una tableta al día por 3 días.', 39.2,
   'Robenacoxib 6 mg (tableta)', '1 tableta', 'Oral', 'Cada 24 horas', 24, 3, 3, 'tableta'),
  (12, 'gato', false, 'consulta', 'Orina fuera del arenero', 'Va seguido al arenero y orina poco. Cambio de casa reciente.',
   'Vejiga pequeña, no obstruida. Sin dolor abdominal marcado.', 'Cistitis idiopática felina', 'presuntivo',
   'Más agua (fuente), alimento húmedo y menos estrés. Volver de inmediato si no orina.', 'Suplemento urinario una cápsula al día por 30 días.', 38.8,
   'Suplemento urinario con glucosamina (cápsula)', '1 cápsula', 'Oral', 'Cada 24 horas', 24, 30, 30, 'cápsula'),
  (13, 'ambos', false, 'consulta', 'Ojo rojo con lagaña', 'Desde ayer tiene el ojo izquierdo rojo y lloroso.',
   'Conjuntiva hiperémica, secreción mucosa. Prueba de fluoresceína negativa.', 'Conjuntivitis', 'definitivo',
   'Limpiar con suero antes de cada aplicación. Revisión en una semana.', 'Tobramicina gotas oftálmicas cada 8 horas por 7 días.', 38.6,
   'Tobramicina 0.3 % (gotas oftálmicas)', '1 gota', 'Oftálmica', 'Cada 8 horas', 8, 7, 1, 'frasco'),
  (14, 'perro', false, 'consulta', 'Tos seca desde hace 3 días', 'Tose al jalar la correa. Estuvo en contacto con otros perros.',
   'Tos al palpar la tráquea. Pulmones sin ruidos anormales.', 'Traqueobronquitis infecciosa', 'presuntivo',
   'Pechera en lugar de collar. Aislar de otros perros 10 días.', 'Doxiciclina 100 mg una tableta al día por 7 días.', 39.0,
   'Doxiciclina 100 mg (tableta)', '1 tableta', 'Oral', 'Cada 24 horas', 24, 7, 7, 'tableta'),
  (15, 'perro', false, 'seguimiento', 'Revisión de herida en la pata', 'Se cortó con un vidrio hace 5 días. Se la lame.',
   'Herida de 2 cm en cojinete, bordes limpios, sin pus.', 'Herida en cicatrización', 'definitivo',
   'Collar isabelino. Curación diaria. Revisión en 7 días.', 'Clorhexidina tópica cada 12 horas por 7 días.', 38.5,
   'Clorhexidina 2 % (solución tópica)', '1 aplicación', 'Tópica', 'Cada 12 horas', 12, 7, 1, 'frasco'),
  (16, 'ambos', false, 'consulta', 'Se sacude la cabeza', 'Se rasca la oreja derecha desde hace 4 días.',
   'Conducto auditivo derecho con eritema y cerumen oscuro.', 'Otitis externa', 'definitivo',
   'Limpieza ótica antes de las gotas. Revisión en 10 días.', 'Gotas óticas cada 12 horas por 7 días.', 38.7,
   'Gentamicina y betametasona (gotas óticas)', '4 gotas', 'Ótica', 'Cada 12 horas', 12, 7, 1, 'frasco'),
  (17, 'gato', false, 'consulta', 'Vomita bolas de pelo', 'Vomita pelo una o dos veces por semana. Época de muda.',
   'Buen estado general. Abdomen sin dolor.', 'Tricobezoar', 'definitivo',
   'Cepillado diario y alimento para control de bolas de pelo.', 'Pasta de malta cada 24 horas por 7 días.', 38.6,
   'Pasta de malta (laxante oral)', '2 cm', 'Oral', 'Cada 24 horas', 24, 7, 1, 'tubo'),
  (18, 'perro', false, 'consulta', 'Se lame las patas todo el día', 'Lamido de patas delanteras desde hace 2 semanas.',
   'Espacios interdigitales enrojecidos con pústulas.', 'Pododermatitis bacteriana', 'presuntivo',
   'Secar bien las patas después de pasear. Revisión en 10 días.', 'Cefalexina 500 mg cada 12 horas por 10 días.', 38.8,
   'Cefalexina 500 mg (cápsula)', '1 cápsula', 'Oral', 'Cada 12 horas', 12, 10, 20, 'cápsula'),
  (19, 'perro', false, 'seguimiento', 'Control tras gastroenteritis', 'Ya no vomita. Heces casi normales.',
   'Hidratado, abdomen sin dolor.', 'Gastroenteritis en resolución', 'definitivo',
   'Regresar poco a poco a su alimento normal.', 'Probiótico un sobre al día por 5 días.', 38.5,
   'Probiótico oral (sobre)', '1 sobre', 'Oral', 'Cada 24 horas', 24, 5, 5, 'sobre'),
  (20, 'gato', false, 'seguimiento', 'Revisión por pulgas', 'Le vieron pulgas al cepillarlo.',
   'Pulgas y excremento de pulga en la base de la cola. Piel sin heridas.', 'Pulicosis', 'definitivo',
   'Tratar a todos los animales de la casa y lavar su cama.', 'Selamectina una pipeta, dosis única.', 38.6,
   'Selamectina (pipeta)', '1 pipeta', 'Tópica', 'Dosis única', null, 1, 1, 'pipeta');
$$;
revoke execute on function public.demo_casos_vet() from public, anon, authenticated;
grant execute on function public.demo_casos_vet() to service_role;

-- El caso de una mascota para una semilla: 1 de cada 4, de chequeo o vacunación.
create or replace function public.demo_caso_vet(p_especie text, p_semilla text)
returns setof record
language sql
stable
set search_path = ''
as $$
  with f as (
    select c, row_number() over (order by c.n) - 1 as k, count(*) over () as total
      from public.demo_casos_vet() c
     where c.especie in (coalesce(p_especie, 'perro'), 'ambos')
       and c.apto = (public.demo_hash(p_semilla, 4) = 0)
  )
  select (f.c).* from f where f.k = public.demo_hash(p_semilla || ':caso', f.total::int);
$$;
revoke execute on function public.demo_caso_vet(text, text) from public, anon, authenticated;
grant execute on function public.demo_caso_vet(text, text) to service_role;

-- La agenda de los próximos 7 días con horario. La llama demo_atender_citas, ya con la sesión de recepción.
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
                            where x.perro_id = p.id and x.servicio_id = sc.servicio_id and x.estado = 'finalizada' and x.deleted_at is null)
               and not exists (select 1 from public.citas_estetica y
                                where y.perro_id = p.id and y.deleted_at is null and y.estado not in ('cancelada', 'no_llego')
                                  and y.inicio > v_inicia - interval '13 days' and y.inicio < v_inicia + interval '13 days')
             order by (select max(y.inicio) from public.citas_estetica y where y.perro_id = p.id and y.deleted_at is null) nulls first,
                      public.demo_hash(p.id::text || v_d::text, 1000000), p.id
             limit 3
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

create or replace function public.demo_atender_citas(p_negocio uuid)
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
  v_agenda jsonb;
  c record;
  v_caso record;
  v_cons uuid;
  v_peso numeric;
  v_bio text;
  v_insumo uuid;
  v_lote record;
  v_vacuna boolean;
  v_ini int := 0;
  v_fin int := 0;
  v_no int := 0;
  v_vet_ini int := 0;
  v_vet_fin int := 0;
  v_vet_no int := 0;
  v_vacunas int := 0;
  v_recetas int := 0;
  v_errores text[] := '{}';
begin
  if coalesce((select n.plan from public.negocios n where n.id = p_negocio), '') <> 'demo' then
    return jsonb_build_object('citas', 0);
  end if;
  perform set_config('app.negocio_id', p_negocio::text, true);
  v_hoy := public.fecha_negocio();
  v_zona := public.zona_negocio();
  select m.profile_id into v_recep
    from public.membresias m
   where m.negocio_id = p_negocio and m.rol = 'recepcion' and m.deleted_at is null
   order by m.solo_lectura desc, m.created_at, m.profile_id
   limit 1;
  if v_recep is null then
    return jsonb_build_object('citas', 0, 'motivo', 'el demo no tiene recepción');
  end if;

  -- Escritura abierta solo dentro de esta transacción (como demo_cobrar_cuentas).
  select coalesce(array_agg(m.id), '{}') into v_sl
    from public.membresias m where m.negocio_id = p_negocio and m.solo_lectura and m.deleted_at is null;
  perform set_config('app.asignacion_rol_interna', 'on', true);
  update public.membresias set solo_lectura = false where id = any (v_sl);
  perform set_config('app.asignacion_rol_interna', '', true);

  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_recep, 'role', 'authenticated')::text, true);
  v_agenda := public.demo_agenda_al_dia(p_negocio);

  -- Estética: a su hora «en curso», al terminar «finalizada»; 1 de cada 10 «No se presentó» a los 15 minutos.
  for c in
    select ce.id, ce.inicio, ce.fin, ce.estado, ce.servicio_id, ce.tamano_id, cl.nombre as cliente
      from public.citas_estetica ce
      join public.perros p on p.id = ce.perro_id
      join public.clientes cl on cl.id = p.cliente_id
     where ce.negocio_id = p_negocio and ce.deleted_at is null
       and ce.estado in ('reservada', 'confirmada', 'en_curso') and ce.inicio <= v_ahora
     order by ce.inicio, ce.id
  loop
    begin
      perform set_config('request.jwt.claims', json_build_object('sub', v_recep, 'role', 'authenticated')::text, true);
      if c.estado in ('reservada', 'confirmada') then
        if public.demo_hash(c.id::text, 10) = 0 then
          if v_ahora >= c.inicio + interval '15 minutes' then
            perform public.cancelar_cita_estetica(c.id, null, true);
            update public.citas_estetica_cambios set created_at = c.inicio + interval '15 minutes'
             where cita_id = c.id and tipo = 'no_llego';
            v_no := v_no + 1;
          end if;
          continue;
        end if;
        update public.citas_estetica set estado = 'en_curso', entregado_por_nombre = c.cliente where id = c.id;
        v_ini := v_ini + 1;
      end if;
      continue when c.fin > v_ahora;
      begin
        perform public.finalizar_cita_con_consumo(c.id, c.cliente, null, true, '[]'::jsonb);
      exception when others then
        -- Sin existencia para su consumo: se cierra sin descontar.
        perform public.finalizar_cita_con_consumo(c.id, c.cliente, null, true, (
          select coalesce(jsonb_agg(jsonb_build_object('insumo_id', r.insumo_id, 'cantidad', 0)), '[]'::jsonb)
            from public.recetas_consumo r
           where r.servicio_id = c.servicio_id and r.tamano_id = c.tamano_id and r.deleted_at is null));
      end;
      update public.movimientos_inventario set created_at = c.fin where cita_estetica_id = c.id;
      v_fin := v_fin + 1;
    exception when others then
      v_errores := v_errores || ('estética ' || c.id::text || ': ' || sqlerrm);
    end;
  end loop;

  -- Veterinaria.
  for c in
    select vc.id, vc.perro_id, vc.medico_id, vc.inicia_at, vc.termina_at, vc.estado, vc.consulta_id, vc.motivo,
           p.especie, m.profile_id as medico_profile
      from public.vet_citas vc
      join public.perros p on p.id = vc.perro_id
      join public.medicos_veterinarios m on m.id = vc.medico_id
     where vc.negocio_id = p_negocio and vc.deleted_at is null
       and vc.estado in ('programada', 'confirmada', 'en_curso') and vc.inicia_at <= v_ahora
     order by vc.inicia_at, vc.id
  loop
    begin
      if (c.inicia_at at time zone v_zona)::date < v_hoy then
        -- Una consulta firmada no se fecha hacia atrás: la cita de un día anterior sin atender no llegó.
        if c.consulta_id is null then
          perform set_config('request.jwt.claims', json_build_object('sub', v_recep, 'role', 'authenticated')::text, true);
          perform public.vet_cita_estado(c.id, 'no_llego', null);
          v_vet_no := v_vet_no + 1;
        end if;
        continue;
      end if;
      perform set_config('request.jwt.claims', json_build_object('sub', c.medico_profile, 'role', 'authenticated')::text, true);
      v_cons := c.consulta_id;
      if v_cons is null then
        v_cons := public.vet_consulta_iniciar(null, c.id, null, c.medico_id);
        v_vet_ini := v_vet_ini + 1;
      end if;
      continue when c.termina_at > v_ahora;
      continue when (select co.estado from public.vet_consultas co where co.id = v_cons) <> 'borrador';

      select x.* into v_caso from public.demo_casos_vet() x
       where x.motivo = c.motivo and x.especie in (coalesce(c.especie, 'perro'), 'ambos') order by x.n limit 1;
      if v_caso.n is null then
        select * into v_caso from public.demo_caso_vet(c.especie, c.id::text)
          as (n int, especie text, apto boolean, tipo text, motivo text, anamnesis text, examen text, diagnostico text, dx_tipo text,
              plan text, tratamiento text, temperatura numeric, producto text, dosis text, via text, frecuencia text,
              frecuencia_horas numeric, dias int, surtir numeric, unidad text);
      end if;

      -- La vacuna del día (antes de firmar: la consulta la liga y la cobra).
      v_vacuna := false;
      if v_caso.apto then
        v_bio := case when c.especie = 'gato' then 'Triple felina'
                      when public.demo_hash(c.perro_id::text, 2) = 0 then 'Antirrábica' else 'Séxtuple canina' end;
        if not exists (select 1 from public.carnet_vacunas cv
                        where cv.perro_id = c.perro_id and cv.biologico = v_bio and cv.anulada_at is null and cv.deleted_at is null
                          and cv.fecha_aplicacion > v_hoy - 300) then
          select i.id into v_insumo from public.insumos i
           where i.negocio_id = p_negocio and i.deleted_at is null and i.nombre ilike 'Vacuna ' || v_bio || '%'
           order by i.created_at limit 1;
          select l.id, l.codigo into v_lote from public.insumo_lotes l
           where l.insumo_id = v_insumo and l.deleted_at is null and (l.fecha_caducidad is null or l.fecha_caducidad >= v_hoy)
           order by l.created_at desc limit 1;
          perform public.registrar_vacuna(c.perro_id, v_bio, null, v_insumo, v_lote.id, coalesce(v_lote.codigo, 'DEMO-' || to_char(v_hoy, 'YYMM')),
                                          'Laboratorio de ejemplo', v_hoy, v_hoy + 365, c.medico_id, '1 mL', null, false);
          v_vacuna := true;
          v_vacunas := v_vacunas + 1;
        end if;
      end if;

      select w.peso_kg into v_peso from public.pesos_registrados w
       where w.perro_id = c.perro_id and w.deleted_at is null order by w.fecha desc, w.created_at desc limit 1;
      perform public.vet_consulta_guardar(v_cons, jsonb_build_object(
        'motivo', coalesce(c.motivo, v_caso.motivo),
        'anamnesis', v_caso.anamnesis,
        'examen_fisico', v_caso.examen,
        'hallazgos', '',
        'peso_kg', v_peso,
        'temperatura_c', v_caso.temperatura,
        'frecuencia_cardiaca', case when c.especie = 'gato' then 180 else 100 end,
        'frecuencia_respiratoria', case when c.especie = 'gato' then 28 else 24 end,
        'diagnosticos', jsonb_build_array(jsonb_build_object('ref_id', null, 'origen', 'libre', 'nombre', v_caso.diagnostico, 'tipo', v_caso.dx_tipo, 'nota', '')),
        'plan', v_caso.plan || case when v_vacuna then ' Se aplicó la vacuna ' || v_bio || '.' else '' end,
        'tratamiento', v_caso.tratamiento));
      perform public.vet_consulta_firmar(v_cons);
      v_vet_fin := v_vet_fin + 1;

      if public.demo_hash(c.id::text || ':receta', 3) = 0 then
        perform public.vet_receta_emitir(c.perro_id, v_cons, jsonb_build_array(jsonb_build_object(
          'producto', v_caso.producto, 'dosis', v_caso.dosis, 'via', v_caso.via, 'frecuencia', v_caso.frecuencia,
          'frecuencia_horas', v_caso.frecuencia_horas, 'duracion_dias', v_caso.dias, 'cantidad_surtir', v_caso.surtir,
          'cantidad_unidad', v_caso.unidad)), v_caso.diagnostico, null);
        v_recetas := v_recetas + 1;
      end if;
    exception when others then
      v_errores := v_errores || ('vet ' || c.id::text || ': ' || sqlerrm);
    end;
  end loop;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('app.asignacion_rol_interna', 'on', true);
  update public.membresias set solo_lectura = true where id = any (v_sl);
  perform set_config('app.asignacion_rol_interna', '', true);

  return jsonb_build_object('agenda', v_agenda,
    'estetica', jsonb_build_object('iniciadas', v_ini, 'finalizadas', v_fin, 'no_se_presento', v_no),
    'vet', jsonb_build_object('iniciadas', v_vet_ini, 'firmadas', v_vet_fin, 'no_llego', v_vet_no, 'vacunas', v_vacunas, 'recetas', v_recetas),
    'errores', to_jsonb(v_errores));
end;
$$;
revoke execute on function public.demo_atender_citas(uuid) from public, anon, authenticated;
grant execute on function public.demo_atender_citas(uuid) to service_role;

-- El turno de hoy en horario (si hoy no se ha abierto uno y no hay otro abierto). Con la sesión de recepción.
create or replace function public.demo_abrir_turno_de_hoy(p_negocio uuid, p_recep uuid)
returns int
language plpgsql
set search_path = ''
as $$
declare
  v_hoy date := public.fecha_negocio();
  v_zona text := public.zona_negocio();
  h record;
  v_turno uuid;
begin
  select * into h from public.demo_horario_del_dia(v_hoy);
  if not (h.abierto and now() >= h.abre and now() < h.cierra)
     or exists (select 1 from public.turnos_caja tc where tc.negocio_id = p_negocio and (tc.abierto_at at time zone v_zona)::date = v_hoy)
     or exists (select 1 from public.turnos_caja tc where tc.negocio_id = p_negocio and tc.estado = 'abierto') then
    return 0;
  end if;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_recep, 'role', 'authenticated')::text, true);
  insert into public.turnos_caja (abierto_por, fondo_inicial, notas_apertura) values (p_recep, 800, null) returning id into v_turno;
  update public.turnos_caja set abierto_at = h.abre, created_at = h.abre where id = v_turno;
  return 1;
end;
$$;
revoke execute on function public.demo_abrir_turno_de_hoy(uuid, uuid) from public, anon, authenticated;
grant execute on function public.demo_abrir_turno_de_hoy(uuid, uuid) to service_role;

-- Cierra con diferencia $0 un turno abierto, a la hora de cierre de su día, con quien lo abrió.
create or replace function public.demo_cerrar_turno(p_turno uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t record;
  v_previo record;
  v_cierra timestamptz;
begin
  select tc.id, tc.abierto_por, (tc.abierto_at at time zone public.zona_negocio())::date as dia into t
    from public.turnos_caja tc where tc.id = p_turno;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', json_build_object('sub', t.abierto_por, 'role', 'authenticated')::text, true);
  select * into v_previo from public.cerrar_turno(t.id, 0, 0, 0, null, null);
  if not v_previo.cerrado then
    perform public.cerrar_turno(t.id, v_previo.esperado_efectivo, v_previo.esperado_terminal, v_previo.esperado_transferencia, null, null);
  end if;
  select x.cierra into v_cierra from public.demo_horario_del_dia(t.dia) x;
  update public.turnos_caja set cerrado_at = v_cierra where id = t.id;
  update public.cortes_caja set created_at = v_cierra where turno_id = t.id;
end;
$$;
revoke execute on function public.demo_cerrar_turno(uuid) from public, anon, authenticated;
grant execute on function public.demo_cerrar_turno(uuid) to service_role;

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
  v_tarde boolean;
  v_cobro uuid;
  v_metodo text;
  v_cobros int := 0;
  v_tarde_n int := 0;
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

  -- En horario, el turno de hoy primero: lo que se cobra tarde va en él.
  v_abiertos := v_abiertos + public.demo_abrir_turno_de_hoy(p_negocio, v_recep);

  -- Las cuentas terminadas sin cobro: estancias, citas de estética y consultas firmadas.
  for r in
    with fin as (
      select e.reserva_id, e.hora_salida_real as t from public.estancias e
       where e.negocio_id = p_negocio and e.deleted_at is null and e.estado = 'finalizada'
      union all
      select ce.reserva_id, ce.fin from public.citas_estetica ce
       where ce.negocio_id = p_negocio and ce.deleted_at is null and ce.estado = 'finalizada'
      union all
      select ca.reserva_id, coalesce(vc.termina_at, co.atendida_at + interval '30 minutes')
        from public.vet_consultas co
        join public.vet_consulta_cargos x on x.consulta_id = co.id and x.deleted_at is null and x.cargo_id is not null
        join public.cargos_aplicados ca on ca.id = x.cargo_id
        left join public.vet_citas vc on vc.id = co.cita_id
       where co.negocio_id = p_negocio and co.deleted_at is null and co.estado = 'firmada'
    )
    select f.reserva_id, max(f.t) as salio
      from fin f
     group by f.reserva_id
    having max(f.t) + interval '5 minutes' <= v_ahora
       and not exists (select 1 from public.cobros c where c.reserva_id = f.reserva_id)
       and not exists (select 1 from public.cuentas_canceladas cc where cc.reserva_id = f.reserva_id)
       and not exists (select 1 from public.estancias e where e.reserva_id = f.reserva_id and e.deleted_at is null
                         and e.estado not in ('finalizada', 'no_llego', 'cancelada'))
       and not exists (select 1 from public.citas_estetica ce where ce.reserva_id = f.reserva_id and ce.deleted_at is null
                         and ce.estado not in ('finalizada', 'no_llego', 'cancelada'))
       and not exists (select 1 from public.hospitalizaciones hz where hz.reserva_id = f.reserva_id and hz.estado = 'ingresado' and hz.deleted_at is null)
     order by max(f.t), f.reserva_id
  loop
    select ct.saldo into v_saldo from public.cuenta_totales_reserva(r.reserva_id) ct;
    if coalesce(v_saldo, 0) <= 0 then
      continue;
    end if;
    v_dia := (r.salio at time zone v_zona)::date;
    v_tarde := false;

    -- Los turnos de días anteriores que se quedaron abiertos se cierran primero (uno abierto a la vez).
    for t in
      select tc.id from public.turnos_caja tc
       where tc.negocio_id = p_negocio and tc.estado = 'abierto' and (tc.abierto_at at time zone v_zona)::date < v_dia
    loop
      perform public.demo_cerrar_turno(t.id);
      v_cerrados := v_cerrados + 1;
    end loop;

    perform set_config('request.jwt.claim.sub', '', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_recep, 'role', 'authenticated')::text, true);

    select tc.id, tc.estado into v_turno, v_estado
      from public.turnos_caja tc
     where tc.negocio_id = p_negocio and (tc.abierto_at at time zone v_zona)::date = v_dia
     order by tc.abierto_at desc
     limit 1;
    if (v_turno is not null and v_estado <> 'abierto')
       or (v_turno is null and v_dia < v_hoy and exists (select 1 from public.turnos_caja tc where tc.negocio_id = p_negocio and tc.estado = 'abierto')) then
      -- Ese día ya cerró su caja: paga en el siguiente turno abierto (el de hoy), a la hora en que se cobra.
      select tc.id into v_turno from public.turnos_caja tc
       where tc.negocio_id = p_negocio and tc.estado = 'abierto' and (tc.abierto_at at time zone v_zona)::date = v_hoy;
      if v_turno is null then
        v_omitidas := v_omitidas + 1; -- fuera de horario: espera al siguiente turno
        continue;
      end if;
      v_tarde := true;
    elsif v_turno is null then
      if exists (select 1 from public.turnos_caja tc where tc.negocio_id = p_negocio and tc.estado = 'abierto') then
        v_omitidas := v_omitidas + 1;
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

    v_metodo := case when public.demo_hash(r.reserva_id::text, 10) = 0 then 'terminal' else 'efectivo' end;
    v_cobro := public.registrar_cobro(r.reserva_id, null, jsonb_build_array(jsonb_build_object('metodo', v_metodo, 'monto', v_saldo, 'propina', 0)));
    if v_tarde then
      v_tarde_n := v_tarde_n + 1;
    else
      update public.cobros set created_at = r.salio + interval '5 minutes' where id = v_cobro;
      update public.cobro_metodos set created_at = r.salio + interval '5 minutes' where cobro_id = v_cobro;
    end if;
    v_cobros := v_cobros + 1;
    v_total := v_total + v_saldo;
  end loop;

  -- Fuera de horario no queda turno abierto: el de un día anterior, y el de hoy después del cierre (o en un día sin
  -- horario), se cierran con diferencia $0 a la hora de cierre de su día.
  select * into h from public.demo_horario_del_dia(v_hoy);
  for t in
    select tc.id from public.turnos_caja tc
     where tc.negocio_id = p_negocio and tc.estado = 'abierto'
       and ((tc.abierto_at at time zone v_zona)::date < v_hoy
            or ((tc.abierto_at at time zone v_zona)::date = v_hoy and (not h.abierto or v_ahora >= h.cierra)))
  loop
    perform public.demo_cerrar_turno(t.id);
    v_cerrados := v_cerrados + 1;
  end loop;
  v_abiertos := v_abiertos + public.demo_abrir_turno_de_hoy(p_negocio, v_recep);

  -- Todo como estaba: primero la identidad de quien llamó (para que la bitácora no lo anote a nombre de recepción) y
  -- luego la solo lectura.
  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
  perform set_config('app.asignacion_rol_interna', 'on', true);
  update public.membresias set solo_lectura = true where id = any (v_sl);
  perform set_config('app.asignacion_rol_interna', '', true);

  return jsonb_build_object('cobros', v_cobros, 'cobrados_tarde', v_tarde_n, 'total', v_total, 'turnos_abiertos', v_abiertos,
    'turnos_cerrados', v_cerrados, 'omitidas', v_omitidas);
end;
$$;
revoke execute on function public.demo_cobrar_cuentas(uuid) from public, anon, authenticated;
grant execute on function public.demo_cobrar_cuentas(uuid) to service_role;

-- estancias_poner_al_dia en modo 'atender' (solo el demo): atiende las citas y luego cobra.
do $$
declare
  v_def text;
  v_viejo text := $t$  return jsonb_build_object('checkin', v_checkin, 'checkout', v_checkout, 'no_llego', v_no_llego)
    || case when p_modo = 'atender' then jsonb_build_object('caja', public.demo_cobrar_cuentas(p_negocio)) else '{}'::jsonb end;$t$;
  v_nuevo text := $t$  if p_modo = 'atender' then
    v_citas := public.demo_atender_citas(p_negocio);
    return jsonb_build_object('checkin', v_checkin, 'checkout', v_checkout, 'no_llego', v_no_llego, 'citas', v_citas,
      'caja', public.demo_cobrar_cuentas(p_negocio));
  end if;
  return jsonb_build_object('checkin', v_checkin, 'checkout', v_checkout, 'no_llego', v_no_llego);$t$;
begin
  select replace(pg_get_functiondef('public.estancias_poner_al_dia(uuid, text)'::regprocedure), chr(13), '') into v_def;
  if position('public.demo_atender_citas(' in v_def) > 0 then
    return;
  end if;
  if position(v_viejo in v_def) = 0 then
    raise exception 'estancias_poner_al_dia cambió: no se pudo agregar la atención de citas del demo.';
  end if;
  v_def := replace(v_def, v_viejo, v_nuevo);
  v_def := replace(v_def, E'  v_no_llego int := 0;\n', E'  v_no_llego int := 0;\n  v_citas jsonb;\n');
  if position('v_citas jsonb;' in v_def) = 0 then
    raise exception 'estancias_poner_al_dia cambió: no se pudo declarar v_citas.';
  end if;
  execute v_def;
end $$;

-- Una vez, ya: el demo con su agenda, sus citas pasadas puestas al día y sus cuentas cobradas.
do $$
declare
  n record;
begin
  for n in select id, slug from public.negocios where plan = 'demo' order by slug loop
    raise notice 'estancias_poner_al_dia %: %', n.slug, public.estancias_poner_al_dia(n.id, 'atender');
  end loop;
end $$;
