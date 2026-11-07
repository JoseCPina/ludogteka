-- demo_vaciar no conocía las tablas que colgaron de reservas, estancias, citas y perros desde octubre de 2026:
-- recolecciones (20261203004100), recoleccion_cotizaciones (20261203004700), solicitudes_reserva (20261203004900),
-- operaciones_revertidas (20261203004300) y perros_bajas (20261203000700). Con filas en cualquiera de ellas,
-- `sembrar-demo.mjs --rehacer` fallaba con «No se pudo vaciar el demo: siguen con filas {reservas,…}» (al grabar
-- los videos 54, 101 y 102 el demo las tiene). Se parcha la definición viva, como en 20261029500000.
do $$
declare
  v_def text;
begin
  select pg_get_functiondef('public.demo_vaciar(uuid)'::regprocedure) into v_def;
  if v_def is null then
    raise exception 'No encontré demo_vaciar.';
  end if;
  if position('solicitudes_reserva' in v_def) = 0 then
    v_def := replace(v_def, '''reservas'', ''series_pausas''', '''recolecciones'', ''recoleccion_cotizaciones'', ''solicitudes_reserva'', ''operaciones_revertidas'', ''perros_bajas'', ''reservas'', ''series_pausas''');
    if position('solicitudes_reserva' in v_def) = 0 then
      raise exception 'No pude parchar demo_vaciar: cambió su lista.';
    end if;
    execute v_def;
  end if;
end;
$$;
