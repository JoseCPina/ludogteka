-- En estética NO hay contratos. Los contratos son de guardería y hotel:
-- cubren dejar al perro a cargo del negocio, no traerlo a bañar y
-- llevárselo en dos horas.
--
-- Esto estaba mal en tres lugares a la vez, y el que más molestaba era el
-- último: un perro que solo viene a bañarse aparecía como "sin contrato"
-- en los avisos, porque el "Contrato general" tiene categorias_servicio
-- vacío y eso significaba "le aplica a todos". Recepción terminaba
-- persiguiendo una firma que nadie necesita.

-- 1. Estructural: ya no se puede ni crear un contrato de estética.
--    Vale más un candado en la tabla que acordarse de la regla en cada
--    pantalla nueva.
alter table public.tipos_contrato
  drop constraint tipos_contrato_categorias_servicio_check;

alter table public.tipos_contrato
  add constraint tipos_contrato_categorias_servicio_check
  check (categorias_servicio <@ array['guarderia', 'hotel']);

comment on column public.tipos_contrato.categorias_servicio is
  'A qué categorías aplica. Vacío = a todo perro que use guardería u hotel. Estética no lleva contrato.';

-- 2. Qué categorías con contrato usa cada perro. Las citas de estética
--    salen de aquí: ya no cuentan para nada relacionado con contratos.
drop view if exists public.perros_contrato_resumen;
drop view if exists public.perros_contrato_estado;
drop view if exists public.perro_categorias_servicio;

create view public.perro_categorias_servicio
with (security_invoker = true)
as
select distinct e.perro_id, s.categoria
from public.estancias e
join public.servicios s on s.id = e.servicio_id
where e.estado <> 'cancelada'
  and s.categoria in ('guarderia', 'hotel');

-- 3. Y "categorias vacío" deja de significar "a todos los perros" para
--    significar "a todo perro que use guardería u hotel". Sin este
--    cambio, el perro de puro baño seguiría cayendo en el Contrato
--    general aunque estética ya no exista como categoría de contrato.
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
  and exists (
    select 1 from public.perro_categorias_servicio pcs
    where pcs.perro_id = p.id
      and (
        cardinality(t.categorias_servicio) = 0
        or pcs.categoria = any (t.categorias_servicio)
      )
  );

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

-- 4. El alta por link de estética deja de generar contratos. Devuelve
--    cero filas para ese flujo, y el formulario ya sabe saltarse el paso
--    de firma cuando no hay ninguno.
create or replace function public.tipos_contrato_de_alta(p_tipo text)
returns table (tipo_contrato_id uuid, tipo_nombre text, plantilla_id uuid)
language sql
stable
set search_path = ''
as $$
  select t.id, t.nombre, pl.id
  from public.tipos_contrato t
  join public.plantillas_contrato pl
    on pl.tipo_contrato_id = t.id and pl.activa
  where t.deleted_at is null
    and p_tipo = 'guarderia_hotel'
    and (
      cardinality(t.categorias_servicio) = 0
      or t.categorias_servicio && array['guarderia', 'hotel']
    )
  order by t.orden, t.nombre;
$$;

revoke execute on function public.tipos_contrato_de_alta(text) from public;
revoke execute on function public.tipos_contrato_de_alta(text) from anon;
grant execute on function public.tipos_contrato_de_alta(text) to authenticated;
