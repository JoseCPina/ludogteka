-- Catálogos internos y ocupación de la casa: solo para el staff
-- (23 de septiembre de 2026).
--
-- El cliente podía leer por la API catálogos que no usa en ninguna
-- pantalla: categorías de insumo, unidades de medida y el catálogo de
-- descuentos (políticas *_select_autenticados con using (true)), y llamar
-- calendario_ocupacion(), que es el cupo y la ocupación de la casa por
-- día: información del negocio, no del cliente.
--
-- calendario_ocupacion era `language sql` con la RLS de quien llama: al
-- cliente ya le salía el cupo en null (cupo_configuracion es de staff) y la
-- ocupación en 0 (desde 20260923210648 no ve estancias), pero seguía
-- siendo una puerta abierta que dependía de dos políticas ajenas. Ahora
-- rechaza de frente a quien tiene sesión y no es staff. El cuerpo es el
-- mismo; solo cambia a plpgsql para poder llevar la guardia.
--
-- resolver_cupo_configuracion NO se toca: la usan negocio_abre y
-- horario_texto, que también corren para el dueño (el horario sale en su
-- contrato), y al cliente ya le devuelve el cupo vacío por la RLS de
-- cupo_configuracion.

drop policy if exists categorias_insumo_select_autenticados on public.categorias_insumo;
create policy categorias_insumo_select_staff on public.categorias_insumo
  for select to authenticated
  using (coalesce(public.is_staff(), false));

drop policy if exists unidades_medida_select_autenticados on public.unidades_medida;
create policy unidades_medida_select_staff on public.unidades_medida
  for select to authenticated
  using (coalesce(public.is_staff(), false));

drop policy if exists catalogo_descuentos_select_autenticados on public.catalogo_descuentos;
create policy catalogo_descuentos_select_staff on public.catalogo_descuentos
  for select to authenticated
  using (coalesce(public.is_staff(), false));

create or replace function public.calendario_ocupacion(p_desde date, p_hasta date)
returns table (
  fecha date,
  cupo_diurno int,
  ocupado_diurno int,
  disponible_diurno int,
  cupo_nocturno int,
  ocupado_nocturno int,
  disponible_nocturno int,
  cupo_estado text
)
language plpgsql
stable
set search_path = ''
as $$
begin
  -- Nunca contra un valor que pueda ser NULL: coalesce a false.
  if not coalesce(public.is_staff(), false) then
    raise exception 'Solo el personal puede ver el cupo y la ocupación.';
  end if;

  return query
  with dias as (
    select generate_series(p_desde, p_hasta, interval '1 day')::date as fecha
  )
  select
    dias.fecha,
    cc.cupo_diurno,
    coalesce(od.ocupado, 0)::int as ocupado_diurno,
    cc.cupo_diurno - coalesce(od.ocupado, 0)::int as disponible_diurno,
    cc.cupo_nocturno,
    coalesce(on_.ocupado, 0)::int as ocupado_nocturno,
    cc.cupo_nocturno - coalesce(on_.ocupado, 0)::int as disponible_nocturno,
    cc.estado as cupo_estado
  from dias
  cross join lateral public.resolver_cupo_configuracion(dias.fecha) as cc
  left join lateral (
    select count(*) as ocupado
    from public.estancias e
    where e.deleted_at is null
      and e.estado not in ('cancelada', 'no_llego')
      and daterange(e.fecha_entrada, e.fecha_salida) @> dias.fecha
  ) od on true
  left join lateral (
    select count(*) as ocupado
    from public.estancias e
    join public.servicios s on s.id = e.servicio_id
    where e.deleted_at is null
      and e.estado not in ('cancelada', 'no_llego')
      and s.categoria = 'hotel'
      and daterange(e.fecha_entrada, e.fecha_salida) @> dias.fecha
  ) on_ on true
  order by dias.fecha;
end;
$$;

-- revoke from public no le quita el permiso a anon en Supabase: se nombra.
revoke execute on function public.calendario_ocupacion(date, date) from public, anon;
grant execute on function public.calendario_ocupacion(date, date) to authenticated;
