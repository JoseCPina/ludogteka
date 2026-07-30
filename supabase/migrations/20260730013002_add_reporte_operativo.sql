-- Fase 8 Bloque C: reporte operativo. Dos funciones a propósito, no una
-- sola — mezclan cosas de naturaleza distinta:
--
--   - reporte_operativo_periodo: cuánto se operó en un rango de fechas
--     (ocupación, servicios, cancelaciones) — sí depende de Desde/Hasta.
--   - reporte_estado_operativo_actual: una fotografía de AHORA MISMO
--     (cumplimiento sanitario, contratos, alertas de inventario) — no
--     tiene sentido filtrarla por fecha, un perro está vacunado o no
--     está vacunado HOY, no "en marzo". Mostrarla con el mismo selector
--     de fechas del resto de /reportes hubiera sido engañoso.
--
-- Ambas admin-only con chequeo explícito, mismo motivo que Bloque A/B:
-- no son security definer, y las tablas de abajo ya tienen SELECT
-- abierto a is_staff() para el día a día — un reporte agregado es otra
-- cosa (regla desde Fase 1: recepción no ve reportes).
--
-- Simplificación consciente, anotada a propósito: no calcula % de
-- ocupación contra cupo_configuracion (requeriría recorrer día por día
-- contra una configuración versionada por fecha) — solo cuenta
-- días/noches reales. Si el negocio pide el % después, es una extensión
-- de esta misma función, no un rediseño.
create or replace function public.reporte_operativo_periodo(p_desde date, p_hasta date)
returns table (
  dias_guarderia int,
  noches_hotel int,
  citas_estetica_finalizadas int,
  estancias_canceladas int,
  citas_no_llego int
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
  with guarderia as (
    select count(*) as dias
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    where s.categoria = 'guarderia'
      and e.deleted_at is null
      and e.estado <> 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  hotel as (
    select coalesce(sum(e.fecha_salida - e.fecha_entrada), 0) as noches
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    where s.categoria = 'hotel'
      and e.deleted_at is null
      and e.estado <> 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  citas as (
    select count(*) as total
    from public.citas_estetica ce
    where ce.estado = 'finalizada'
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  ),
  canceladas as (
    select count(*) as total
    from public.estancias e
    where e.deleted_at is null
      and e.estado = 'cancelada'
      and e.fecha_entrada between p_desde and p_hasta
  ),
  no_llego as (
    select count(*) as total
    from public.citas_estetica ce
    where ce.estado = 'no_llego'
      and public.fecha_negocio(ce.inicio) between p_desde and p_hasta
  )
  select
    (select dias from guarderia)::int,
    (select noches from hotel)::int,
    (select total from citas)::int,
    (select total from canceladas)::int,
    (select total from no_llego)::int;
end;
$$;

grant execute on function public.reporte_operativo_periodo(date, date) to authenticated;

-- Fotografía de ahora mismo: cumplimiento sanitario, contratos, alertas
-- de inventario. Reutiliza las vistas de estado explícito ya
-- construidas (perro_requisitos_sanitarios_estado en Fase 2,
-- perros_contrato_estado en Fase 6, insumos_existencia_actual /
-- insumos_proxima_caducidad en Fase 7) en vez de reinventar la lógica.
--
-- Un perro cuenta como "bloqueado" sanitariamente si CUALQUIERA de sus
-- requisitos obligatorios está vencido o sin registro — mismo criterio
-- de "el peor caso manda" que ya usa ResumenSanitario en la UI (ahí
-- sin_registro se pinta igual que vencida a propósito).
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
    (select count(*) from public.perros_contrato_estado where estado = 'vigente')::int,
    (select count(*) from public.perros_contrato_estado where estado = 'sin_contrato')::int,
    (select count(*) from public.perros_contrato_estado where estado = 'requiere_actualizacion')::int,
    (select count(*) from public.insumos_existencia_actual where bajo_minimo)::int,
    (select count(*) from public.insumos_proxima_caducidad where estado in ('por_vencer', 'vencida'))::int;
end;
$$;

grant execute on function public.reporte_estado_operativo_actual() to authenticated;
