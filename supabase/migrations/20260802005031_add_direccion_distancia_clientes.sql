-- Dirección del cliente + distancia cacheada (Fase 10, cotizador de
-- recolección). La coordenada se guarda aparte del texto: geocodificar
-- cuesta dinero y la dirección casi nunca cambia, así que se
-- geocodifica UNA vez y se reusa — recalcular solo tiene sentido cuando
-- el texto de la dirección cambia de verdad (ver distancia-actions.ts).
--
-- distancia_base_km es LA distancia que se cotiza, la misma para ida y
-- vuelta (base→domicilio→Ludogteka y Ludogteka→domicilio→base recorren
-- los mismos tres puntos, solo en orden inverso) — se cotiza por
-- trayecto en cargos_aplicados, no aquí; este campo es el insumo, no el
-- cobro.
--
-- distancia_ajustada_manualmente: en México es común que una colonia
-- geocodifique mal. Cuando recepción corrige el número a mano
-- (ajustar-distancia-manual), esto queda en true — es la señal de "no
-- confíes en que este número vino de Google" para cualquier pantalla que
-- lo muestre después. Un recalculo por cambio de dirección lo vuelve a
-- poner en false porque en ese momento sí viene de Google otra vez.
alter table public.clientes
  add column direccion text,
  add column direccion_lat double precision,
  add column direccion_lng double precision,
  add column distancia_base_km numeric(6, 1),
  add column distancia_calculada_at timestamptz,
  add column distancia_ajustada_manualmente boolean not null default false,
  add constraint clientes_distancia_no_negativa check (distancia_base_km is null or distancia_base_km >= 0);
