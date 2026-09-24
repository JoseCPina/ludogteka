-- Una serie de guardería puede usar los pases del perro o cobrar cada día
-- suelto (24 de septiembre de 2026).
--
-- Hasta hoy generar_estancias_serie aplicaba el pase del perro en cada
-- fecha, siempre, y recepción no lo veía ni lo podía evitar. Ahora la
-- pantalla muestra el paquete que se usaría (el que vence primero), su
-- saldo y su vencimiento, y deja escoger. La elección se guarda en la serie
-- porque las fechas se siguen generando después (renovar el horizonte,
-- reanudar una pausa): cada generación la respeta.
--
-- Por omisión true: las series que ya existen siguen usando pases, igual
-- que hasta hoy.
--
-- generar_estancias_serie es copia exacta de su definición anterior
-- (20260923000000); solo cambia el bloque que aplica el pase.

alter table public.series_recurrentes
  add column if not exists usar_pase boolean not null default true;

comment on column public.series_recurrentes.usar_pase is
  'true: cada fecha usa un pase del perro mientras le queden (el que vence primero). false: cada día se cobra suelto.';

create or replace function public.generar_estancias_serie(
  p_serie_id uuid,
  p_horizonte_semanas int default 8
)
returns table (fecha date, exito boolean, motivo text, bono jsonb)
language plpgsql
set search_path = ''
as $$
declare
  v_serie public.series_recurrentes%rowtype;
  v_cliente_id uuid;
  v_fecha_limite date;
  v_fecha date;
  v_reserva_id uuid;
  v_estancia_id uuid;
  v_bono jsonb;
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
      values (v_reserva_id, v_serie.perro_id, v_serie.servicio_id, v_fecha, v_fecha + 1, p_serie_id)
      returning id into v_estancia_id;

      if v_serie.usar_pase then
        begin
          v_bono := public.aplicar_bono_a_estancia(v_estancia_id);
        exception when others then
          v_bono := jsonb_build_object('aplicado', false, 'motivo', 'error', 'detalle', sqlerrm);
        end;
      else
        -- Recepción escogió pagar cada día suelto aunque tenga pases.
        v_bono := jsonb_build_object('aplicado', false, 'motivo', 'elegido_suelto');
      end if;

      fecha := v_fecha;
      exito := true;
      motivo := null;
      bono := v_bono;
      return next;
    exception when others then
      fecha := v_fecha;
      exito := false;
      motivo := sqlerrm;
      bono := null;
      return next;
    end;
  end loop;

  return;
end;
$$;
