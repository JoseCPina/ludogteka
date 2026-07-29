-- Materializa una serie recurrente dentro de un horizonte acotado (8
-- semanas por default, confirmado con el negocio). Adición 4 del plan:
-- si alguna fecha choca con cupo/sanitario/lo que sea, NO aborta la serie
-- completa — cada fecha se intenta en su propio savepoint (el bloque
-- BEGIN/EXCEPTION de plpgsql ya crea uno implícito), y la función
-- devuelve una fila por fecha con éxito/motivo para que recepción decida
-- qué hacer con las que no cupieron. Fallar en bloque por una fecha de
-- dentro de dos meses sería insufrible, como bien se dijo.
--
-- Cada fecha generada recibe su PROPIA reserva (no una reserva compartida
-- para toda la serie): cada ocurrencia es una visita independiente que
-- Fase 5 cobra por separado, igual que si se hubiera reservado a mano un
-- martes suelto.
--
-- "Renovar serie" más adelante es literal: volver a llamar esta función
-- con la misma serie ya avanza el horizonte, generando solo las fechas
-- que todavía no existían (evitadas por el EXCLUDE de estancias si ya se
-- había generado esa fecha, con el mismo perro).
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

  v_fecha_limite := current_date + (p_horizonte_semanas * 7);
  if v_serie.fecha_fin is not null and v_serie.fecha_fin < v_fecha_limite then
    v_fecha_limite := v_serie.fecha_fin;
  end if;

  for v_fecha in
    select d::date
    from generate_series(
      greatest(v_serie.fecha_inicio, current_date),
      v_fecha_limite,
      interval '1 day'
    ) d
    where extract(isodow from d)::int = any(v_serie.dias_semana)
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
