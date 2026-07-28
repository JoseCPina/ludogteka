-- Adición 1: la vista original con DISTINCT ON solo devolvía perros con
-- alguna aplicación ya cargada, así que un perro sin NINGÚN registro de
-- antirrábica no aparecía — y en Fase 4 pasaría el bloqueo sin problema,
-- justo el hueco que no queremos. Aquí se cruza cada perro activo contra
-- CADA tipo de requisito obligatorio (CROSS JOIN), y se trae la última
-- aplicación con LEFT JOIN LATERAL: si no hay ninguna, el estado es
-- 'sin_registro' en vez de que la fila simplemente no exista.
--
-- security_invoker = true: la vista respeta el RLS del usuario que
-- consulta (staff ve todos los perros, el dueño solo los suyos/compartidos)
-- en vez del RLS de quien la creó. Sin esto, security_definer implícito de
-- las vistas filtraría con los permisos del dueño de la vista, no del
-- usuario real.
create view public.perro_requisitos_sanitarios_estado
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
    -- Umbral de 30 días para "por vencer": valor supuesto, ajustar si el
    -- negocio maneja otro criterio de aviso.
    when ult.fecha_vencimiento < current_date + interval '30 days' then 'por_vencer'
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
