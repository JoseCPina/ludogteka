-- «Necesita atención» dice cuánto lleva esperando cada contrato: la vista
-- expone desde cuándo (columnas agregadas al final; nada más cambia).
create or replace view public.contratos_por_atender
with (security_invoker = true)
as
select
  case when c.estado = 'pendiente_firma' then 'por_firmar' else 'por_regenerar' end as situacion,
  c.id as contrato_id,
  c.perro_id,
  p.nombre as perro_nombre,
  c.cliente_id,
  cl.nombre as cliente_nombre,
  cl.telefono as cliente_telefono,
  t.nombre as tipo_nombre,
  public.nombre_paquete_de_bono(c.bono_cliente_id) as paquete_nombre,
  c.created_at,
  c.fecha_firma,
  c.regenerar_motivo,
  c.regenerar_marcado_at,
  -- Desde cuándo espera: el pendiente de firma, desde que se generó; el
  -- que hay que regenerar, desde que se marcó (los marcados antes de que
  -- existiera la marca, desde su firma).
  case
    when c.estado = 'pendiente_firma' then c.created_at
    else coalesce(c.regenerar_marcado_at, c.fecha_firma, c.created_at)
  end as espera_desde
from public.contratos c
join public.perros p on p.id = c.perro_id and p.deleted_at is null
join public.clientes cl on cl.id = c.cliente_id
join public.plantillas_contrato pl on pl.id = c.plantilla_id
join public.tipos_contrato t on t.id = pl.tipo_contrato_id
where c.deleted_at is null
  and (
    c.estado = 'pendiente_firma'
    or (
      c.regenerar_motivo is not null
      and not exists (
        select 1 from public.contratos c2
        join public.plantillas_contrato pl2 on pl2.id = c2.plantilla_id
        where c2.perro_id = c.perro_id
          and pl2.tipo_contrato_id = pl.tipo_contrato_id
          and c2.created_at > c.created_at
          and c2.estado <> 'cancelado'
          and c2.deleted_at is null
      )
    )
  );

