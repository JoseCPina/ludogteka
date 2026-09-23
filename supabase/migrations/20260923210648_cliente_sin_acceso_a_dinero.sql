-- El cliente ya no alcanza ningún monto por la API (23 de septiembre de 2026).
--
-- Regla del proyecto: el cliente (dueño del perro) nunca ve información
-- financiera. La app no se la mostraba, pero la API sí se la entregaba a
-- quien la pidiera con su JWT: con las políticas *_select_propio un
-- cliente leía por REST estancias.precio_unitario, citas_estetica.precio,
-- cargos_aplicados.precio, cobro_metodos.monto, bonos_clientes.precio_pagado,
-- movimientos_bono.monto, descuentos_aplicados.monto_aplicado,
-- devolucion_metodos.monto y mp_ordenes.monto; y con tarifas abiertas a
-- todo autenticado, la matriz de precios completa. Las funciones de caja
-- que son `language sql` sin security definer (movimientos_turno,
-- resumen_turno, cuenta_lineas_reserva, cuentas_abiertas) le devolvían
-- esos mismos montos, porque corren con la RLS de quien llama.
--
-- Lo que el portal necesita de esas tablas ya no pasa por ellas:
--   · citas y reservas → mis_visitas() (security definer, sin precios).
--   · "este perro usa guardería u hotel" → perro_categorias_servicio, que
--     ahora sale de una función security definer que solo entrega
--     (perro, categoría) de los perros que el que llama puede ver.
--   · el nombre del paquete del contrato por firmar → nombre_paquete_de_bono(),
--     que solo entrega el nombre del servicio.
-- Por eso esas dos vistas se redefinen ANTES de quitar las políticas.
--
-- El staff no cambia: sus políticas *_select_staff siguen igual.

-- ── 1. perro_categorias_servicio sin leer estancias con la RLS del cliente ──

create or replace function public.perro_categorias_servicio_visibles()
returns table (perro_id uuid, categoria text)
language sql
stable
security definer
set search_path = ''
as $$
  with yo as (
    select pr.cliente_id from public.profiles pr where pr.id = auth.uid()
  )
  select distinct e.perro_id, s.categoria
  from public.estancias e
  join public.servicios s on s.id = e.servicio_id
  where e.estado <> 'cancelada'
    and s.categoria in ('guarderia', 'hotel')
    and (
      coalesce(public.is_staff(), false)
      or exists (
        -- La misma regla que perros_select_propio: sus perros y los de
        -- acceso compartido.
        select 1
        from public.perros p, yo
        where p.id = e.perro_id
          and yo.cliente_id is not null
          and (
            p.cliente_id = yo.cliente_id
            or exists (
              select 1 from public.perro_accesos_compartidos pac
              where pac.perro_id = p.id
                and pac.deleted_at is null
                and pac.cliente_id = yo.cliente_id
            )
          )
      )
    );
$$;

revoke execute on function public.perro_categorias_servicio_visibles() from public, anon;
grant execute on function public.perro_categorias_servicio_visibles() to authenticated;

create or replace view public.perro_categorias_servicio
with (security_invoker = true)
as
select v.perro_id, v.categoria
from public.perro_categorias_servicio_visibles() v;

-- ── 2. contratos_por_atender sin leer bonos_clientes con la RLS del cliente ──

create or replace function public.nombre_paquete_de_bono(p_bono_cliente_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.nombre
  from public.bonos_clientes bc
  join public.servicios s on s.id = bc.servicio_id
  where bc.id = p_bono_cliente_id
    and (
      coalesce(public.is_staff(), false)
      or bc.cliente_id = (select pr.cliente_id from public.profiles pr where pr.id = auth.uid())
    );
$$;

revoke execute on function public.nombre_paquete_de_bono(uuid) from public, anon;
grant execute on function public.nombre_paquete_de_bono(uuid) to authenticated;

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
  c.regenerar_motivo
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

-- ── 3. Fuera las lecturas del cliente sobre tablas con dinero ──

drop policy if exists estancias_select_propio on public.estancias;
drop policy if exists citas_estetica_select_propio on public.citas_estetica;
drop policy if exists cargos_aplicados_select_propio on public.cargos_aplicados;
drop policy if exists cobros_select_propio on public.cobros;
drop policy if exists cobro_metodos_select_propio on public.cobro_metodos;
drop policy if exists bonos_clientes_select_propio on public.bonos_clientes;
drop policy if exists movimientos_bono_select_propio on public.movimientos_bono;
drop policy if exists descuentos_aplicados_select_propio on public.descuentos_aplicados;
drop policy if exists devoluciones_select_propio on public.devoluciones;
drop policy if exists devolucion_metodos_select_propio on public.devolucion_metodos;
drop policy if exists mp_ordenes_select_propio on public.mp_ordenes;
-- Sin montos, pero es el esqueleto de la cuenta (notas internas incluidas)
-- y el portal no la usa: tampoco se le deja al cliente.
drop policy if exists reservas_select_propio on public.reservas;

-- ── 4. La matriz de precios, solo para el staff ──
-- Los precios de escaparate viven en la landing; el alta de estética cotiza
-- del lado del servidor con la llave de servicio. Ninguna pantalla del
-- cliente lee tarifas con su sesión.

drop policy if exists tarifas_select_autenticados on public.tarifas;
create policy tarifas_select_staff on public.tarifas
  for select to authenticated
  using (coalesce(public.is_staff(), false));

drop policy if exists tarifas_dia_semana_select_autenticados on public.tarifas_dia_semana;
create policy tarifas_dia_semana_select_staff on public.tarifas_dia_semana
  for select to authenticated
  using (coalesce(public.is_staff(), false));
