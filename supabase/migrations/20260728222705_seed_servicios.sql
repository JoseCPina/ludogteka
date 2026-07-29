-- Estructura del catálogo únicamente — sin precios reales. Los precios
-- (tarifas) los captura el negocio en la UI cuando exista; inventarlos
-- aquí sería dato de negocio real disfrazado de seed.
insert into public.servicios (clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, orden, updated_at) values
  ('guarderia_dia', 'Guardería (por día)', 'guarderia', 'dia', true, false, false, 1, now()),
  -- depende_cantidad = true: el hotel es el caso explícito de descuento
  -- por volumen (adición 1). Guardería se deja sin tramos por ahora — no
  -- se pidió, y es más fácil agregarlo después (depende_cantidad = true
  -- + capturar tramos) que quitarlo si se supuso de más.
  ('hotel_noche', 'Hotel (por noche)', 'hotel', 'noche', true, false, true, 2, now()),

  ('estetica_bano', 'Baño', 'estetica', 'sesion', true, true, false, 10, now()),
  ('estetica_corte', 'Corte', 'estetica', 'sesion', true, true, false, 11, now()),
  ('estetica_deslanado', 'Deslanado', 'estetica', 'sesion', true, true, false, 12, now()),
  ('estetica_unas', 'Corte de uñas', 'estetica', 'sesion', true, true, false, 13, now()),
  ('estetica_oidos', 'Limpieza de oídos', 'estetica', 'sesion', true, true, false, 14, now()),
  -- Combos: precio propio e independiente (adición confirmada), no suma
  -- de componentes con descuento. Si Fase 7 necesita saber qué insumos
  -- consume cada combo, se mapean directo al combo, no a una receta.
  ('estetica_combo_bano_corte', 'Baño y corte', 'estetica', 'sesion', true, true, false, 15, now()),
  ('estetica_combo_completo', 'Baño completo (corte, uñas y oídos)', 'estetica', 'sesion', true, true, false, 16, now()),

  ('cargo_recogida_tardia', 'Recogida tardía', 'cargo', 'evento', false, false, false, 20, now()),
  ('cargo_dia_extra', 'Día extra no reservado', 'cargo', 'dia', true, false, false, 21, now()),
  ('cargo_medicamento', 'Medicamento administrado', 'cargo', 'evento', false, false, false, 22, now()),
  ('cargo_comida_especial', 'Comida especial', 'cargo', 'dia', false, false, false, 23, now());

-- Un bono de ejemplo para probar que el modelo aguanta la forma completa
-- (Fase 5 hace la venta/consumo real). vigencia_dias es un valor supuesto
-- — 90 días desde la compra — sin confirmar con el negocio.
insert into public.servicios (
  clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad,
  servicio_incluido_id, cantidad_incluida, vigencia_dias, orden, updated_at
)
select
  'bono_guarderia_10dias', 'Bono 10 días de guardería', 'bono', 'dia', true, false, false,
  id, 10, 90, 30, now()
from public.servicios where clave = 'guarderia_dia';
