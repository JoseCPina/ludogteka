-- /caja/turno con volumen: la pantalla traía los 1,000+ movimientos del turno (dos viajes por el tope de la API), los
-- sumaba en el navegador y pintaba una fila por cobro. Ahora UN viaje trae el total, las sumas que la pantalla enseña
-- y solo la página de movimientos que se ve (los más recientes primero). Es un envoltorio de movimientos_turno: la
-- misma regla de qué es cada movimiento, con la RLS de quien llama (invoker).
create or replace function public.movimientos_turno_pagina(p_turno_id uuid, p_limite integer default 50, p_desplazamiento integer default 0)
returns jsonb
language sql
stable
set search_path = ''
as $$
  with t as materialized (
    select * from public.movimientos_turno(p_turno_id)
  ),
  pag as (
    select * from t
    order by t.fecha desc, t.id
    limit greatest(coalesce(p_limite, 50), 1)
    offset greatest(coalesce(p_desplazamiento, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from t),
    'servicios', coalesce((select sum(t.monto) from t where t.tipo in ('cobro', 'venta_bono')), 0),
    'ventas_mostrador', coalesce((select sum(t.monto) from t where t.tipo = 'venta_mostrador'), 0),
    'movimientos', coalesce((select jsonb_agg(to_jsonb(pag) order by pag.fecha desc, pag.id) from pag), '[]'::jsonb)
  );
$$;
revoke execute on function public.movimientos_turno_pagina(uuid, integer, integer) from public, anon;
grant execute on function public.movimientos_turno_pagina(uuid, integer, integer) to authenticated, service_role, peludesk_definer;
