-- Bloque C necesita rastrear qué consumo vino de qué cita, para que
-- Fase 8 pueda calcular el costo real por servicio cruzando esta
-- columna con compras_insumos — sin esto, un consumo automático se ve
-- igual que uno manual y no hay forma de agrupar por servicio.
-- Nullable: solo lo llenan las salidas que vienen de
-- finalizar_cita_con_consumo, nunca las manuales.
alter table public.movimientos_inventario
  add column cita_estetica_id uuid references public.citas_estetica(id);

create index movimientos_inventario_cita_estetica_id_idx
  on public.movimientos_inventario (cita_estetica_id)
  where cita_estetica_id is not null;
