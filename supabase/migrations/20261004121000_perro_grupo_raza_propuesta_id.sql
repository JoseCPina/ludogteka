-- perro_grupo_raza dice también CUÁL propuesta de raza tiene pendiente el perro,
-- para que la pantalla de agendar estética pueda asignarle el grupo a la
-- propuesta cuando la raza todavía no está en el catálogo.
create or replace view public.perro_grupo_raza with (security_invoker = true) as
select p.id as perro_id,
  case when r.id is not null then g.id when pr.id is not null then gpr.id else gp.id end as grupo_raza_id,
  case when r.id is not null then g.clave when pr.id is not null then gpr.clave else gp.clave end as grupo_clave,
  case when r.id is not null then g.nombre when pr.id is not null then gpr.nombre else gp.nombre end as grupo_nombre,
  case when r.id is not null then g.depende_tamano when pr.id is not null then gpr.depende_tamano else gp.depende_tamano end as depende_tamano,
  (p.raza_id is null and pr.id is null) as por_defecto,
  ((r.id is not null and g.id is null) or (pr.id is not null and gpr.id is null)) as sin_grupo,
  r.id as raza_id,
  coalesce(r.nombre, pr.nombre) as raza_nombre,
  pr.id as propuesta_id
from public.perros p
left join public.razas r on r.id = p.raza_id and r.deleted_at is null
left join public.razas_grupo rg on rg.raza_id = r.id and rg.negocio_id = p.negocio_id and rg.deleted_at is null
left join public.grupos_raza g on g.id = rg.grupo_raza_id and g.deleted_at is null
left join lateral (
  select x.id, x.nombre, x.grupo_raza_id
  from public.razas_propuestas_perros pp
  join public.razas_propuestas x on x.id = pp.propuesta_id and x.deleted_at is null and x.estado = 'pendiente'
  where pp.perro_id = p.id and pp.deleted_at is null and p.raza_id is null
  order by pp.created_at desc limit 1
) pr on true
left join public.grupos_raza gpr on gpr.id = pr.grupo_raza_id and gpr.deleted_at is null
left join public.grupos_raza gp on gp.es_predeterminado and gp.deleted_at is null and gp.negocio_id = p.negocio_id
where p.deleted_at is null;
