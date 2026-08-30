-- Tercera parte: la vigencia deja de ser un sí/no por perro y pasa a ser
-- un estado POR TIPO DE CONTRATO. Un perro puede tener firmado el de
-- guardería y no el de hotel — con la vista anterior eso se veía como
-- "vigente" (existe al menos un contrato firmado), que es justo el
-- agujero que este cambio cierra.
--
-- Y para que el aviso sea relevante y no ruido: solo se le exige a un
-- perro el contrato de los servicios que de verdad usa. A un perro que
-- solo viene a bañarse no le falta el contrato de hotel.

-- Qué categorías de servicio usa cada perro, según su propio historial y
-- lo que tiene agendado. Se mira estancias (guardería/hotel) y
-- citas_estetica, no reservas: la reserva es el contenedor del cliente,
-- el servicio concreto vive en la estancia/cita. Las canceladas no
-- cuentan (nunca llegó a usarse ese servicio); 'no_llego' sí cuenta —
-- la intención de usar el servicio existió y va a repetirse.
create view public.perro_categorias_servicio
with (security_invoker = true)
as
select distinct e.perro_id, s.categoria
from public.estancias e
join public.servicios s on s.id = e.servicio_id
where e.estado <> 'cancelada'
  and s.categoria in ('guarderia', 'hotel', 'estetica')
union
select distinct ce.perro_id, s.categoria
from public.citas_estetica ce
join public.servicios s on s.id = ce.servicio_id
where ce.estado <> 'cancelada'
  and s.categoria in ('guarderia', 'hotel', 'estetica');

drop view public.perros_contrato_estado;

-- Una fila por (perro, tipo de contrato que le aplica). Los tres estados
-- son los mismos de antes y significan lo mismo, solo que ahora acotados
-- a un tipo:
--   sin_contrato           — nunca ha firmado ESTE contrato
--   requiere_actualizacion — lo firmó, pero con una versión anterior al
--                            punto de quiebre marcado EN ESTE TIPO
--   vigente                — al día para este contrato
--
-- Qué tipos le aplican a un perro:
--   * categorias_servicio vacío  -> le aplica a todos, siempre (es el
--     comportamiento previo a esta migración, que conserva el "Contrato
--     general" del backfill: nadie deja de tener contrato pendiente de
--     un día para otro por este cambio).
--   * categorias_servicio con valores -> solo si el perro ya usó (o
--     tiene agendado) un servicio de alguna de esas categorías.
--
-- Se exige además que el tipo tenga una versión activa: un tipo sin
-- plantilla publicada no se le puede generar a nadie, así que pedirlo
-- sería un aviso que nadie puede resolver.
create view public.perros_contrato_estado
with (security_invoker = true)
as
select
  p.id as perro_id,
  t.id as tipo_contrato_id,
  t.nombre as tipo_nombre,
  t.categorias_servicio,
  case
    when not exists (
      select 1
      from public.contratos c
      join public.plantillas_contrato pl on pl.id = c.plantilla_id
      where c.perro_id = p.id
        and pl.tipo_contrato_id = t.id
        and c.estado in ('firmado_digital', 'firmado_papel')
    ) then 'sin_contrato'
    when exists (
      select 1
      from public.contratos c
      join public.plantillas_contrato pl on pl.id = c.plantilla_id
      where c.perro_id = p.id
        and pl.tipo_contrato_id = t.id
        and c.estado in ('firmado_digital', 'firmado_papel')
        and pl.version >= coalesce(
          (
            select max(version) from public.plantillas_contrato
            where requiere_refirma and tipo_contrato_id = t.id
          ),
          0
        )
    ) then 'vigente'
    else 'requiere_actualizacion'
  end as estado
from public.perros p
cross join public.tipos_contrato t
where p.deleted_at is null
  and t.deleted_at is null
  and exists (
    select 1 from public.plantillas_contrato pl
    where pl.tipo_contrato_id = t.id and pl.activa
  )
  and (
    cardinality(t.categorias_servicio) = 0
    or exists (
      select 1 from public.perro_categorias_servicio pcs
      where pcs.perro_id = p.id
        and pcs.categoria = any (t.categorias_servicio)
    )
  );

-- Resumen por perro, para los lugares donde no cabe una lista (pastilla
-- de la ficha del cliente, renglón de la lista de check-in, conteo de
-- reportes). "El peor caso manda", mismo criterio que ya usa
-- ResumenSanitario: si falta alguno, el perro está en sin_contrato.
--
-- faltantes/desactualizados traen los NOMBRES para que el aviso pueda
-- decir cuál falta en vez de solo que falta algo — que era la queja
-- concreta: "Sin contrato" no le dice a recepción qué tiene que pedir.
--
-- 'no_aplica' es explícito a propósito (nunca ausencia silenciosa, mismo
-- criterio que resolver_precio): un perro que todavía no usa ningún
-- servicio con contrato exigible no está "vigente" ni "sin contrato",
-- simplemente no hay nada que pedirle todavía.
create view public.perros_contrato_resumen
with (security_invoker = true)
as
select
  p.id as perro_id,
  case
    when count(e.tipo_contrato_id) = 0 then 'no_aplica'
    when bool_or(e.estado = 'sin_contrato') then 'sin_contrato'
    when bool_or(e.estado = 'requiere_actualizacion') then 'requiere_actualizacion'
    else 'vigente'
  end as estado,
  coalesce(
    array_agg(e.tipo_nombre order by e.tipo_nombre) filter (where e.estado = 'sin_contrato'),
    '{}'
  ) as faltantes,
  coalesce(
    array_agg(e.tipo_nombre order by e.tipo_nombre) filter (where e.estado = 'requiere_actualizacion'),
    '{}'
  ) as desactualizados
from public.perros p
left join public.perros_contrato_estado e on e.perro_id = p.id
where p.deleted_at is null
group by p.id;

-- El reporte contaba filas de la vista vieja, que era una por perro. Con
-- una fila por perro y tipo, ese mismo count contaría "contratos
-- pendientes" en vez de "perros pendientes" y los números se inflarían
-- solos al crear el segundo tipo de contrato. Pasa a contar perros,
-- sobre el resumen. Los perros en 'no_aplica' no entran en ninguna de
-- las tres cifras a propósito: no tienen contrato pendiente porque
-- todavía no usan ningún servicio que lo exija, contarlos como
-- "sin firmar" sería inventar un pendiente que no existe.
create or replace function public.reporte_estado_operativo_actual()
returns table (
  sanitario_vigente int,
  sanitario_por_vencer int,
  sanitario_bloqueado int,
  contrato_vigente int,
  contrato_sin_firmar int,
  contrato_requiere_actualizacion int,
  insumos_bajo_minimo int,
  insumos_por_caducar int
)
language plpgsql
stable
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver reportes.';
  end if;

  return query
  with sanitario_por_perro as (
    select
      perro_id,
      case
        when bool_or(estado in ('vencida', 'sin_registro')) then 'bloqueado'
        when bool_or(estado = 'por_vencer') then 'por_vencer'
        else 'vigente'
      end as estado_perro
    from public.perro_requisitos_sanitarios_estado
    group by perro_id
  )
  select
    (select count(*) from sanitario_por_perro where estado_perro = 'vigente')::int,
    (select count(*) from sanitario_por_perro where estado_perro = 'por_vencer')::int,
    (select count(*) from sanitario_por_perro where estado_perro = 'bloqueado')::int,
    (select count(*) from public.perros_contrato_resumen where estado = 'vigente')::int,
    (select count(*) from public.perros_contrato_resumen where estado = 'sin_contrato')::int,
    (select count(*) from public.perros_contrato_resumen where estado = 'requiere_actualizacion')::int,
    (select count(*) from public.insumos_existencia_actual where bajo_minimo)::int,
    (select count(*) from public.insumos_proxima_caducidad where estado in ('por_vencer', 'vencida'))::int;
end;
$$;

grant execute on function public.reporte_estado_operativo_actual() to authenticated;
