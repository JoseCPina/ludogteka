-- QA S30 (24 de octubre de 2026): un primer «Abrir turno» no surtió efecto en pantalla y al repetirlo quedó un solo turno
-- (el índice turnos_caja_un_abierto_idx ya impide dos abiertos, pero el segundo intento respondía «Ya hay un turno de
-- caja abierto» aunque fuera el mismo). Cada formulario de apertura manda una clave (uuid) que se guarda con el turno:
-- si la misma clave llega dos veces (doble clic, reintento después de un tope), la acción devuelve el turno que ya abrió
-- en vez de un error. Única dentro del negocio.

alter table public.turnos_caja add column clave_apertura uuid;
create unique index turnos_caja_clave_apertura_idx on public.turnos_caja (negocio_id, clave_apertura) where clave_apertura is not null;
