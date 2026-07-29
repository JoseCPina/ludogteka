-- Dos ajustes para que "renovar horizonte" y "editar patrón" (pantalla 6
-- de reservas) se comporten bien:
--
-- 1. Saltar en silencio fechas que YA tienen una estancia no borrada para
--    esta serie. Sin esto, volver a llamar la función para avanzar el
--    horizonte reintentaba TODAS las fechas ya generadas y las reportaba
--    como "fallidas" por el EXCLUDE de traslape — ruido, no un fallo
--    real. Nótese que una fecha cancelada SUELTA (estado='cancelada',
--    deleted_at sigue null) también se salta: es una baja deliberada de
--    ese día y no debe resucitar sola en la siguiente renovación. Cuando
--    "editar patrón" reemplaza el patrón sí libera esas fechas, pero lo
--    hace borrando (deleted_at) las estancias que reemplaza, no solo
--    cancelándolas — por eso el filtro es por deleted_at, no por estado.
--
-- 2. Saltar fechas dentro de un rango de series_pausas activo (vacaciones
--    del cliente): el cupo de esos días se libera y la serie no lo
--    vuelve a ocupar hasta que la pausa termine.
create or replace function public.generar_estancias_serie(
  p_serie_id uuid,
  p_horizonte_semanas int default 8
)
returns table (fecha date, exito boolean, motivo text)
language plpgsql
set search_path = ''
as $$
declare
  v_serie public.series_recurrentes%rowtype;
  v_cliente_id uuid;
  v_fecha_limite date;
  v_fecha date;
  v_reserva_id uuid;
begin
  select * into v_serie from public.series_recurrentes
  where id = p_serie_id and deleted_at is null;

  if not found then
    raise exception 'Serie recurrente no encontrada.';
  end if;

  select cliente_id into v_cliente_id from public.perros where id = v_serie.perro_id;

  v_fecha_limite := public.fecha_negocio() + (p_horizonte_semanas * 7);
  if v_serie.fecha_fin is not null and v_serie.fecha_fin < v_fecha_limite then
    v_fecha_limite := v_serie.fecha_fin;
  end if;

  for v_fecha in
    select d::date
    from generate_series(
      greatest(v_serie.fecha_inicio, public.fecha_negocio()),
      v_fecha_limite,
      interval '1 day'
    ) d
    where extract(isodow from d)::int = any(v_serie.dias_semana)
      and not exists (
        select 1 from public.estancias e
        where e.serie_id = p_serie_id and e.fecha_entrada = d::date and e.deleted_at is null
      )
      and not exists (
        select 1 from public.series_pausas sp
        where sp.serie_id = p_serie_id and sp.deleted_at is null
          and d::date between sp.desde and sp.hasta
      )
  loop
    begin
      insert into public.reservas (cliente_id, notas)
      values (v_cliente_id, 'Generada por serie recurrente')
      returning id into v_reserva_id;

      insert into public.estancias (reserva_id, perro_id, servicio_id, fecha_entrada, fecha_salida, serie_id)
      values (v_reserva_id, v_serie.perro_id, v_serie.servicio_id, v_fecha, v_fecha + 1, p_serie_id);

      fecha := v_fecha;
      exito := true;
      motivo := null;
      return next;
    exception when others then
      fecha := v_fecha;
      exito := false;
      motivo := sqlerrm;
      return next;
    end;
  end loop;

  return;
end;
$$;

grant execute on function public.generar_estancias_serie(uuid, int) to authenticated;
