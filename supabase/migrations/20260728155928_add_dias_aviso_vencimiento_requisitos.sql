-- El umbral de "por vencer" no debe vivir incrustado en la vista: Fase 4 lo
-- va a usar para decidir si bloquea una reserva, y es justo el tipo de
-- número que el negocio va a querer ajustar sin pedir una migración. Se
-- deja en el catálogo (una columna más de tipos_requisito_sanitario, no una
-- tabla de configuración aparte) porque además permite, gratis, que a
-- futuro cada requisito tenga su propio umbral (avisar antes para
-- bordetella que para desparasitación, por ejemplo) sin cambiar el modelo.
alter table public.tipos_requisito_sanitario
  add column dias_aviso_vencimiento int not null default 30;

-- CREATE OR REPLACE VIEW es válido aquí: mismas columnas de salida, mismo
-- orden y tipos, solo cambia de dónde sale el umbral.
create or replace view public.perro_requisitos_sanitarios_estado
with (security_invoker = true)
as
select
  p.id as perro_id,
  p.nombre as perro_nombre,
  t.id as tipo_requisito_id,
  t.categoria,
  t.clave,
  t.etiqueta,
  t.es_critica,
  ult.fecha_aplicacion as ultima_fecha_aplicacion,
  ult.fecha_vencimiento,
  case
    when ult.fecha_vencimiento is null then 'sin_registro'
    when ult.fecha_vencimiento < current_date then 'vencida'
    when ult.fecha_vencimiento < current_date + (t.dias_aviso_vencimiento * interval '1 day') then 'por_vencer'
    else 'vigente'
  end as estado
from public.perros p
cross join public.tipos_requisito_sanitario t
left join lateral (
  select r.fecha_aplicacion, r.fecha_vencimiento
  from public.requisitos_sanitarios_aplicados r
  where r.perro_id = p.id
    and r.tipo_requisito_id = t.id
    and r.deleted_at is null
  order by r.fecha_aplicacion desc
  limit 1
) ult on true
where p.deleted_at is null
  and p.fallecido = false
  and t.obligatoria = true
  and t.deleted_at is null;
