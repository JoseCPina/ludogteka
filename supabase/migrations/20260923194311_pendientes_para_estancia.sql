-- Qué le falta a un perro para poder quedarse en guardería u hotel
-- (23 de septiembre de 2026).
--
-- El caso: un perro que entró por estética ahora quiere guardería. Hasta
-- hoy la única salida era mandarle al dueño el link de complemento, y el
-- sistema ni siquiera sabía qué le faltaba: perros_con_guarderia_hotel y
-- perros_contrato_estado solo cuentan a los perros que YA usan guardería u
-- hotel. Esta función lo calcula "como si fuera a usarla", para que
-- recepción lo vea y lo capture en el mostrador con el dueño enfrente.
--
-- Una fila por cosa que falta, con las MISMAS reglas que ya existen:
--   · talla vacía (sin ella no hay precio: validar_estancia)          bloquea
--   · sin evaluación de comportamiento (validar_estancia; admin puede
--     autorizar excepción)                                            bloquea
--   · requisito sanitario vencido o sin registro
--     (perro_requisitos_sanitarios_estado, igual que validar_estancia) bloquea
--   · en celo, gestante o alerta con bloquea_estancia                 bloquea
--   · los datos que pide el alta de guardería y hotel y están vacíos
--     (src/lib/alta/campos-perro.ts: CAMPOS_BASE + CAMPOS_EXPEDIENTE)  no bloquea
--   · cada contrato que se firma en el alta de guardería/hotel
--     (tipos_contrato.se_genera_al = 'alta', con categorías vacías o que
--     incluyan guardería u hotel) sin firmar o por volver a firmar —
--     misma cuenta que perros_contrato_estado                         no bloquea
--
-- `bloquea` = la base rechaza la reserva mientras falte. Lo demás es lo que
-- el negocio pide en el expediente, pero no detiene la reserva.

create or replace function public.pendientes_para_estancia(p_perro_ids uuid[])
returns table (
  perro_id uuid,
  clave text,
  etiqueta text,
  grupo text,
  bloquea boolean,
  tipo_contrato_id uuid,
  contrato_pendiente_id uuid
)
language sql
stable
set search_path = ''
as $$
  with perro as (
    select p.*
    from public.perros p
    where p.id = any (p_perro_ids)
      and p.deleted_at is null
      and not p.fallecido
  ),
  campos(clave, etiqueta, orden) as (
    values
      ('raza', 'Raza', 1),
      ('sexo', 'Sexo', 2),
      ('fecha_nacimiento', 'Fecha de nacimiento', 3),
      ('pelaje_id', 'Pelaje', 4),
      ('alimentacion_notas', 'Alimentación', 5),
      ('contacto_emergencia_nombre', 'Contacto de emergencia (nombre)', 6),
      ('contacto_emergencia_telefono', 'Contacto de emergencia (teléfono)', 7),
      ('veterinario_nombre', 'Veterinario (nombre)', 8),
      ('veterinario_telefono', 'Veterinario (teléfono)', 9),
      ('veterinario_clinica', 'Veterinario (clínica)', 10)
  ),
  tipos_alta as (
    select t.id, t.nombre, t.orden
    from public.tipos_contrato t
    where t.deleted_at is null
      and t.se_genera_al = 'alta'
      and (cardinality(t.categorias_servicio) = 0
           or t.categorias_servicio && array['guarderia', 'hotel'])
      and exists (
        select 1 from public.plantillas_contrato pl
        where pl.tipo_contrato_id = t.id and pl.activa
      )
  )
  -- Talla
  select p.id, 'talla', 'Talla', 'bloquea', true, null::uuid, null::uuid
  from perro p
  where p.tamano_id is null

  union all
  -- Evaluación de comportamiento
  select p.id, 'evaluacion', 'Evaluación de comportamiento', 'bloquea', true, null, null
  from perro p
  where p.evaluacion_comportamiento_fecha is null

  union all
  -- Requisitos sanitarios
  select pre.perro_id, 'sanitario:' || pre.clave,
    pre.etiqueta || case pre.estado when 'vencida' then ' (vencida)' else ' (sin registro)' end,
    'bloquea', true, null, null
  from public.perro_requisitos_sanitarios_estado pre
  join perro p on p.id = pre.perro_id
  where pre.estado in ('vencida', 'sin_registro')

  union all
  -- Condiciones que bloquean sin excepción
  select p.id, 'condicion:celo', 'Está marcada en celo', 'condicion', true, null, null
  from perro p where p.en_celo
  union all
  select p.id, 'condicion:gestante', 'Está marcada como gestante', 'condicion', true, null, null
  from perro p where p.gestante
  union all
  select pa.perro_id, 'condicion:alerta', 'Alerta activa: ' || ca.etiqueta, 'condicion', true, null, null
  from public.perro_alertas pa
  join public.catalogo_alertas ca on ca.id = pa.alerta_id
  join perro p on p.id = pa.perro_id
  where pa.activa and ca.bloquea_estancia and ca.deleted_at is null

  union all
  -- Datos del expediente que pide el alta de guardería y hotel
  select x.perro_id, 'campo:' || x.clave, x.etiqueta, 'expediente', false, null, null
  from (
    select p.id as perro_id, c.clave, c.etiqueta, c.orden,
      case c.clave
        -- La raza escrita a mano (sin catálogo) sí cuenta como capturada.
        when 'raza' then coalesce(p.raza_id::text, nullif(trim(p.raza), ''))
        when 'sexo' then p.sexo
        when 'fecha_nacimiento' then p.fecha_nacimiento::text
        when 'pelaje_id' then p.pelaje_id::text
        when 'alimentacion_notas' then nullif(trim(p.alimentacion_notas), '')
        when 'contacto_emergencia_nombre' then nullif(trim(p.contacto_emergencia_nombre), '')
        when 'contacto_emergencia_telefono' then nullif(trim(p.contacto_emergencia_telefono), '')
        when 'veterinario_nombre' then nullif(trim(p.veterinario_nombre), '')
        when 'veterinario_telefono' then nullif(trim(p.veterinario_telefono), '')
        when 'veterinario_clinica' then nullif(trim(p.veterinario_clinica), '')
      end as valor
    from perro p
    cross join campos c
    order by c.orden
  ) x
  where x.valor is null

  union all
  -- Contratos del alta de guardería y hotel sin firmar o por refirmar
  select p.id, 'contrato:' || t.id,
    '«' || t.nombre || '»' || case
      when exists (
        select 1 from public.contratos c
        join public.plantillas_contrato pl on pl.id = c.plantilla_id
        where c.perro_id = p.id and pl.tipo_contrato_id = t.id
          and c.estado in ('firmado_digital', 'firmado_papel')
      ) then ' (hay que volver a firmarlo)'
      else ' (sin firmar)'
    end,
    'contrato', false, t.id,
    (select c.id from public.contratos c
     join public.plantillas_contrato pl on pl.id = c.plantilla_id
     where c.perro_id = p.id and pl.tipo_contrato_id = t.id and c.estado = 'pendiente_firma'
     order by c.created_at desc limit 1)
  from perro p
  cross join tipos_alta t
  where not exists (
    select 1
    from public.contratos c
    join public.plantillas_contrato pl on pl.id = c.plantilla_id
    where c.perro_id = p.id
      and pl.tipo_contrato_id = t.id
      and c.estado in ('firmado_digital', 'firmado_papel')
      and pl.version >= coalesce(
        (select max(version) from public.plantillas_contrato
         where requiere_refirma and tipo_contrato_id = t.id),
        0
      )
  );
$$;

comment on function public.pendientes_para_estancia(uuid[]) is
  'Qué le falta a cada perro para guardería u hotel, con las reglas de validar_estancia y perros_contrato_estado. Corre con el RLS de quien llama.';

revoke execute on function public.pendientes_para_estancia(uuid[]) from public, anon;
grant execute on function public.pendientes_para_estancia(uuid[]) to authenticated;
