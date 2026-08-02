-- Recolección a domicilio (Fase 10): categoria='cargo' a propósito, no
-- una categoría nueva — encaja tal cual en cargos_aplicados (mismo
-- trigger de snapshot de precio vía resolver_precio, misma pantalla de
-- aplicación de cargos en /reservas, mismo total en cuenta_lineas_reserva)
-- sin escribir ningún mecanismo nuevo. depende_cantidad=true: la
-- "cantidad" que va en cargos_aplicados.cantidad son kilómetros del
-- trayecto (redondeados a entero), y el precio resuelto es por km dentro
-- del tramo correspondiente — mismo modelo que noches de hotel.
--
-- No depende_tamano ni depende_pelaje: el costo del viaje no cambia según
-- el perro, cambia según la distancia. Se cotiza por trayecto (ida O
-- vuelta), nunca por par — recolección y entrega pueden caer en fechas
-- distintas (ej. hotel de varias noches), así que cada una es su propio
-- cargo aplicado sobre la estancia correspondiente.
insert into public.servicios (clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, orden, updated_at)
values ('recoleccion', 'Recolección a domicilio', 'cargo', 'km', false, false, true, 24, now());
