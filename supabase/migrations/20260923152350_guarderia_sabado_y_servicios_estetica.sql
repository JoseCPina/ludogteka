-- Guardería abre también el sábado (10:00 a 14:00), y correcciones de
-- lo que incluyen los baños de estética.
--
-- El horario por día YA estaba bien capturado en horario_semana (lunes a
-- viernes 9–19, sábado 10–14, domingo cerrado) en desarrollo y en
-- producción, y la hora de cierre (minutos_retraso_cierre) ya lo leía
-- por día. Lo que seguía asumiendo "lunes a viernes" estaba en otro lado:
--   1. La mensualidad ilimitada contaba días hábiles L–V fijos para su
--      cantidad_total: un perro que viene de lunes a sábado se quedaba
--      sin saldo antes de que venciera. Ahora cuenta los días que abre
--      guardería según el horario.
--   2. El nombre de la mensualidad decía "(L–V ilimitado)".
--   3. Nada impedía reservar guardería (ni armar una serie) en un día
--      que el negocio no abre. Con sábado sí y domingo no, la base tiene
--      que saberlo.
--   4. La plantilla de contrato de guardería pide {{horario_guarderia}}
--      y nadie lo resolvía: salía el token crudo en el PDF.
--
-- Todo lo de días se deriva de horario_semana, nunca de una lista fija:
-- si mañana el negocio cambia el horario, esto lo sigue solo.

-- ── Ayudantes de horario ─────────────────────────────────────────────
-- security definer: horario_semana solo lo lee staff por RLS, pero el
-- horario es información pública (el dueño lo lee en su contrato), y
-- estas funciones no devuelven nada más que eso.

-- ¿Abre el negocio ese día? (hora de apertura capturada para ese día de
-- la semana, en la configuración vigente en esa fecha).
create or replace function public.negocio_abre(p_fecha date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select cc.hora_apertura is not null
    from public.resolver_cupo_configuracion(p_fecha) cc
    where cc.estado = 'configurado'
  ), false);
$$;

-- Cuántos días abre guardería en [p_desde, p_hasta).
create or replace function public.dias_que_abre_guarderia(p_desde date, p_hasta date)
returns int
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from generate_series(p_desde, p_hasta - 1, interval '1 day') d
  where public.negocio_abre(d::date);
$$;

-- El horario en una frase, agrupando días seguidos con la misma hora:
-- "lunes a viernes de 9:00 a 19:00 y sábado de 10:00 a 14:00".
create or replace function public.horario_texto(p_fecha date default null)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_fecha date := coalesce(p_fecha, public.fecha_negocio());
  v_nombres text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  v_tramos text[] := array[]::text[];
  v_desde int;
  v_hasta int;
  v_horas text;
  v_actual text;
  v_ap time;
  v_ci time;
  v_iso int;
begin
  for v_iso in 1..8 loop
    v_actual := null;
    if v_iso <= 7 then
      -- La fecha de esa misma semana que cae en ese día: el horario es
      -- por día de la semana dentro de la configuración vigente.
      select cc.hora_apertura, cc.hora_cierre into v_ap, v_ci
      from public.resolver_cupo_configuracion(v_fecha + (v_iso - extract(isodow from v_fecha)::int)) cc;
      if v_ap is not null then
        v_actual := 'de ' || to_char(v_ap, 'FMHH24:MI') || ' a ' || to_char(v_ci, 'FMHH24:MI');
      end if;
    end if;
    -- (v_iso = 8 es el centinela que cierra el último tramo.)

    if v_desde is not null and v_actual is distinct from v_horas then
      v_tramos := v_tramos || (
        case when v_desde = v_hasta then v_nombres[v_desde]
          else v_nombres[v_desde] || ' a ' || v_nombres[v_hasta] end
        || ' ' || v_horas);
      v_desde := null;
    end if;

    if v_actual is not null then
      if v_desde is null then
        v_desde := v_iso;
        v_horas := v_actual;
      end if;
      v_hasta := v_iso;
    end if;
  end loop;

  if coalesce(array_length(v_tramos, 1), 0) = 0 then
    return 'consultar horario vigente';
  end if;
  if array_length(v_tramos, 1) = 1 then
    return v_tramos[1];
  end if;
  return array_to_string(v_tramos[1:array_length(v_tramos, 1) - 1], ', ')
    || ' y ' || v_tramos[array_length(v_tramos, 1)];
end;
$$;

-- revoke ... from public NO le quita el permiso a anon en Supabase (el
-- proyecto se lo concede directo a cada función nueva): se nombra.
revoke execute on function public.negocio_abre(date) from public, anon;
revoke execute on function public.dias_que_abre_guarderia(date, date) from public, anon;
revoke execute on function public.horario_texto(date) from public, anon;
grant execute on function public.negocio_abre(date) to authenticated;
grant execute on function public.dias_que_abre_guarderia(date, date) to authenticated;
grant execute on function public.horario_texto(date) to authenticated;

-- ── 1. La mensualidad cuenta los días que abre guardería ─────────────
-- comprar_bono: cuerpo de 20260922060145_add_bonos_ilimitados.sql; solo
-- cambia el conteo de la rama ilimitada.
create or replace function public.comprar_bono(
  p_cliente_id uuid,
  p_servicio_id uuid,
  p_notas text,
  p_metodos jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_servicio public.servicios%rowtype;
  v_precio numeric;
  v_estado_precio text;
  v_turno_id uuid;
  v_reserva_id uuid;
  v_bono_id uuid;
  v_fecha_compra date;
  v_fecha_vencimiento date;
  v_cantidad int;
begin
  if coalesce(public.current_rol(), 'anonimo') not in ('admin', 'recepcion') then
    raise exception 'Solo admin o recepción pueden vender un bono.';
  end if;

  select * into v_servicio from public.servicios
  where id = p_servicio_id and categoria = 'bono' and deleted_at is null;
  if not found then
    raise exception 'Bono no encontrado en el catálogo.';
  end if;

  if not exists (select 1 from public.clientes where id = p_cliente_id and deleted_at is null) then
    raise exception 'Cliente no encontrado.';
  end if;

  select id into v_turno_id from public.turnos_caja where estado = 'abierto' limit 1;
  if v_turno_id is null then
    raise exception 'No hay turno de caja abierto. Ábrelo antes de vender un bono.';
  end if;

  v_fecha_compra := public.fecha_negocio();

  select precio, estado into v_precio, v_estado_precio
  from public.resolver_precio(p_servicio_id, null, null, 1, v_fecha_compra);

  if v_estado_precio = 'sin_tarifa' then
    raise exception 'No hay tarifa capturada para este bono. Captúrala antes de venderlo.';
  elsif v_estado_precio = 'no_aplica' then
    raise exception 'Este bono no aplica.';
  end if;

  insert into public.reservas (cliente_id, notas)
  values (p_cliente_id, 'Compra de bono: ' || v_servicio.nombre)
  returning id into v_reserva_id;

  v_fecha_vencimiento := case
    when v_servicio.vigencia_dias is not null then v_fecha_compra + v_servicio.vigencia_dias
    else null
  end;

  if v_servicio.ilimitado then
    -- Días que abre guardería entre la compra y el vencimiento, según el
    -- horario configurado (horario_semana): el máximo de veces que
    -- físicamente se puede consumir. Antes eran lunes a viernes fijos, y
    -- con el sábado abierto la mensualidad se agotaba antes de vencer.
    v_cantidad := greatest(1, public.dias_que_abre_guarderia(v_fecha_compra, v_fecha_vencimiento));
  else
    v_cantidad := v_servicio.cantidad_incluida;
  end if;

  insert into public.bonos_clientes (
    cliente_id, servicio_id, reserva_id, cantidad_total, cantidad_disponible,
    precio_pagado, fecha_compra, fecha_vencimiento, ilimitado
  )
  values (
    p_cliente_id, p_servicio_id, v_reserva_id, v_cantidad, v_cantidad,
    v_precio, v_fecha_compra, v_fecha_vencimiento, v_servicio.ilimitado
  )
  returning id into v_bono_id;

  insert into public.movimientos_bono (bono_cliente_id, tipo, cantidad, monto, turno_id, created_by)
  values (v_bono_id, 'venta', v_cantidad, v_precio, v_turno_id, auth.uid());

  perform public.registrar_cobro(v_reserva_id, p_notas, p_metodos);

  return v_bono_id;
end;
$$;

-- Las mensualidades ya vendidas NO se recalculan: su cantidad_total es la
-- base de la fórmula de reconocimiento de ingreso de Fase 5, y moverla
-- después de la venta cambiaría ingreso ya reportado. En producción no
-- había ninguna vendida al escribir esto (verificado contra la base).

comment on column public.bonos_clientes.ilimitado is
  'Copia de servicios.ilimitado al momento de la compra. cantidad_total es entonces el número de días que abre guardería en la vigencia (según horario_semana), no un tope comercial.';

-- ── 2. Nombre de la mensualidad ──────────────────────────────────────
-- Sin días en el nombre: los días los dice el horario, y un nombre con
-- "L–V" se queda viejo en cuanto el horario cambia (acaba de pasar).
update public.servicios
set nombre = 'Mensualidad de guardería (ilimitada)'
where clave = 'bono_mensualidad' and deleted_at is null;

-- ── 3. Guardería solo en días que abre el negocio ────────────────────
-- Trigger aparte de validar_estancia a propósito: es una regla sola y
-- corta, y así no hay que recopiar el cuerpo entero de esa función.
-- Solo revalida cuando cambian fechas o servicio, o cuando se reactiva:
-- una estancia vieja en domingo (hay datos de prueba así en desarrollo)
-- se puede seguir cerrando o cancelando.
create or replace function public.validar_estancia_dia_abierto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_dia date;
  v_nombres text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
begin
  if new.deleted_at is not null or new.estado in ('cancelada', 'no_llego') then
    return new;
  end if;

  if TG_OP = 'UPDATE'
    and new.servicio_id is not distinct from old.servicio_id
    and new.fecha_entrada is not distinct from old.fecha_entrada
    and new.fecha_salida is not distinct from old.fecha_salida
    and old.estado not in ('cancelada', 'no_llego')
  then
    return new;
  end if;

  select categoria into v_categoria from public.servicios where id = new.servicio_id;
  if v_categoria is distinct from 'guarderia' then
    return new;
  end if;

  for v_dia in select generate_series(new.fecha_entrada, new.fecha_salida - 1, interval '1 day')::date loop
    if not public.negocio_abre(v_dia) then
      raise exception 'Guardería no abre en % (%). Elige un día con horario de atención.',
        v_nombres[extract(isodow from v_dia)::int], to_char(v_dia, 'DD/MM/YYYY');
    end if;
  end loop;

  return new;
end;
$$;

create trigger validar_estancia_dia_abierto
before insert or update on public.estancias
for each row execute function public.validar_estancia_dia_abierto();

-- Una serie de guardería no puede pedir un día que no abre. Se valida
-- contra el horario vigente al guardarla; si el horario cambia después,
-- el trigger de estancias rechaza ese día al generarla y
-- generar_estancias_serie lo reporta por fecha sin abortar la serie.
create or replace function public.validar_serie_dias_abiertos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_categoria text;
  v_iso int;
  v_hoy date := public.fecha_negocio();
  v_nombres text[] := array['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
begin
  if new.deleted_at is not null then
    return new;
  end if;
  if TG_OP = 'UPDATE'
    and new.dias_semana is not distinct from old.dias_semana
    and new.servicio_id is not distinct from old.servicio_id
    and old.deleted_at is null
  then
    return new;
  end if;

  select categoria into v_categoria from public.servicios where id = new.servicio_id;
  if v_categoria is distinct from 'guarderia' then
    return new;
  end if;

  foreach v_iso in array new.dias_semana loop
    if not public.negocio_abre(v_hoy + ((v_iso - extract(isodow from v_hoy)::int + 7) % 7)) then
      raise exception 'Guardería no abre en %: quítalo de los días de la serie.', v_nombres[v_iso];
    end if;
  end loop;

  return new;
end;
$$;

create trigger validar_serie_dias_abiertos
before insert or update on public.series_recurrentes
for each row execute function public.validar_serie_dias_abiertos();

-- Son funciones de trigger: nadie las llama directo.
revoke execute on function public.validar_estancia_dia_abierto() from public, anon, authenticated;
revoke execute on function public.validar_serie_dias_abiertos() from public, anon, authenticated;

-- ── 4. {{horario_guarderia}} en el contrato ──────────────────────────
-- Cuerpo de 20260729062919_add_resolver_campos_contrato.sql, con un
-- campo más al final.
create or replace function public.resolver_campos_contrato(p_perro_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'cliente_nombre', c.nombre,
    'cliente_telefono', c.telefono,
    'cliente_email', coalesce(c.email, ''),
    'cliente_rfc', coalesce(c.rfc, ''),
    'perro_nombre', p.nombre,
    'perro_raza', coalesce(p.raza, ''),
    'perro_sexo', case p.sexo when 'macho' then 'Macho' when 'hembra' then 'Hembra' else '' end,
    'perro_fecha_nacimiento', coalesce(to_char(p.fecha_nacimiento, 'DD/MM/YYYY'), 'no registrada'),
    'perro_tamano', coalesce(tc.etiqueta, 'no registrado'),
    'autorizacion_medica_notas', coalesce(nullif(btrim(p.autorizacion_medica_notas), ''), 'Sin autorización médica registrada'),
    'tope_gasto_autorizado', case
      when p.tope_gasto_autorizado is null then 'sin tope definido'
      else '$' || to_char(p.tope_gasto_autorizado, 'FM999,999,990.00')
    end,
    'consentimiento_imagen', case when c.consentimiento_imagen then 'Sí autoriza' else 'No autoriza' end,
    'servicios_disponibles', coalesce((
      select string_agg(s.nombre, ', ' order by s.orden)
      from public.servicios s
      where s.categoria in ('guarderia', 'hotel', 'estetica') and s.deleted_at is null
    ), 'consultar catálogo vigente'),
    'fecha_firma', to_char(public.fecha_negocio(), 'DD/MM/YYYY'),
    'horario_guarderia', public.horario_texto(public.fecha_negocio())
  )
  from public.perros p
  join public.clientes c on c.id = p.cliente_id
  left join public.tamanos_categoria tc on tc.id = p.tamano_id
  where p.id = p_perro_id;
$$;

-- ── 5. Estética: qué incluye y qué NO incluye cada baño ──────────────
-- "Cepillado, deslanado O corte de pelo": son alternativas según el
-- perro, no las tres cosas.
update public.servicios
set incluye = array[
  'Baño',
  'Cepillado, deslanado o corte de pelo',
  'Corte de uñas',
  'Limpieza de orejas y dientes',
  'Corte higiénico',
  'Hidratación de nariz y huellitas'
]
where clave = 'estetica_estetico' and deleted_at is null;

-- El exprés tiene que decir lo que NO trae: quien compara $190 contra
-- $390 asume que es "lo mismo pero rápido". Columna propia y no un
-- renglón más de `incluye`, porque esa lista se pinta con palomitas.
alter table public.servicios
  add column if not exists no_incluye text;

comment on column public.servicios.no_incluye is
  'Aclaración explícita de lo que el servicio NO incluye. Se muestra junto a `incluye` donde el cliente compara servicios.';

update public.servicios
set incluye = array['Baño con shampoo', 'Secado'],
    no_incluye = 'Solo baño con shampoo y secado. No incluye cepillado, deslanado, corte de pelo, corte de uñas ni ningún otro servicio.'
where clave = 'estetica_expres' and deleted_at is null;
