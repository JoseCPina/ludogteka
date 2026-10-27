-- QA R50 (N136), lo mismo en Reportes: «Noches de hotel» (tarjeta y desglose) sumaba las noches RESERVADAS
-- (fecha_salida − fecha_entrada) aunque el perro saliera antes y la cuenta ya cobrara solo las que usó. Una sola regla
-- de cuántas noches (o días) usó una estancia: unidades_usadas_estancia, la misma que da cuenta_lineas_estancia. Con
-- salida real antes de la prevista cuenta desde que entró (si entró antes de su fecha, desde ese día) hasta que salió;
-- si no, las reservadas (nunca más: una salida tardía no se cuenta aquí).

create or replace function public.unidades_usadas_estancia(p_estancia_id uuid)
returns int
language sql
stable
set search_path = ''
as $$
  select case
    when s.unidad not in ('noche', 'dia') then null
    when e.estado = 'finalizada' and e.hora_salida_real is not null then
      least(e.fecha_salida - e.fecha_entrada,
        greatest(1,
          (e.hora_salida_real at time zone public.zona_negocio())::date
            - least(e.fecha_entrada, coalesce((e.hora_entrada_real at time zone public.zona_negocio())::date, e.fecha_entrada))
            + case when s.unidad = 'dia' then 1 else 0 end))
    else e.fecha_salida - e.fecha_entrada
  end
  from public.estancias e
  join public.servicios s on s.id = e.servicio_id
  where e.id = p_estancia_id;
$$;
comment on function public.unidades_usadas_estancia(uuid) is
  'Noches (hotel) o días (guardería por día) que de verdad usó una estancia: con salida anticipada, hasta su salida real; si no, las reservadas. La usan cuenta_lineas_estancia y Reportes.';
revoke execute on function public.unidades_usadas_estancia(uuid) from public, anon;
grant execute on function public.unidades_usadas_estancia(uuid) to authenticated, service_role, peludesk_definer;

-- cuenta_lineas_estancia: «usadas» con la misma regla.
create or replace function public.cuenta_lineas_estancia(p_reserva_id uuid)
returns table (
  estancia_id uuid,
  tipo text,
  origen_id uuid,
  descripcion text,
  cantidad numeric,
  precio_unitario numeric,
  total numeric,
  motivo text,
  concepto text,
  unidad text,
  reservadas int,
  usadas int
)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(e.id, c.estancia_id, ce.estancia_id, ae.id, ac.estancia_id, ace.estancia_id),
    l.tipo, l.origen_id, l.descripcion, l.cantidad, l.precio_unitario, l.total,
    a.motivo,
    a.concepto,
    s.unidad,
    case when e.id is not null and s.unidad in ('noche', 'dia') then e.fecha_salida - e.fecha_entrada end,
    case when e.id is not null then public.unidades_usadas_estancia(e.id) end
  from public.cuenta_lineas_reserva(p_reserva_id) l
  left join public.estancias e on l.tipo = 'estancia' and e.id = l.origen_id
  left join public.servicios s on s.id = e.servicio_id
  left join public.cargos_aplicados c on l.tipo = 'cargo' and c.id = l.origen_id
  left join public.citas_estetica ce on l.tipo = 'estetica' and ce.id = l.origen_id
  left join public.cuenta_ajustes_precio a on l.tipo = 'ajuste' and a.id = l.origen_id
  left join public.estancias ae on a.linea_tipo = 'estancia' and ae.id = a.linea_id
  left join public.cargos_aplicados ac on a.linea_tipo = 'cargo' and ac.id = a.linea_id
  left join public.citas_estetica ace on a.linea_tipo = 'estetica' and ace.id = a.linea_id;
$$;

-- Reportes: la tarjeta «Noches de hotel» y su desglose. Se parchan sobre la definición viva (el texto se busca sin
-- retorno de carro, ver N122) y, si no está, la migración se detiene en vez de dejar la regla a medias.
do $$
declare
  v_def text;
  v_viejo text := 'sum(e.fecha_salida - e.fecha_entrada)';
begin
  v_def := replace(pg_get_functiondef('public.reporte_operativo_periodo(date, date)'::regprocedure), E'\r', '');
  if position(v_viejo in v_def) = 0 then
    raise exception 'reporte_operativo_periodo: no encontré «%»', v_viejo;
  end if;
  execute replace(v_def, v_viejo, 'sum(coalesce(public.unidades_usadas_estancia(e.id), e.fecha_salida - e.fecha_entrada))');

  v_viejo := '(e.fecha_salida - e.fecha_entrada)';
  v_def := replace(pg_get_functiondef('public.reporte_desglose(text, date, date, text, text, text, integer, integer)'::regprocedure), E'\r', '');
  if (length(v_def) - length(replace(v_def, v_viejo, ''))) / length(v_viejo) <> 2 then
    raise exception 'reporte_desglose: esperaba 2 veces «%»', v_viejo;
  end if;
  execute replace(v_def, v_viejo, 'coalesce(public.unidades_usadas_estancia(e.id), e.fecha_salida - e.fecha_entrada)');
end;
$$;
