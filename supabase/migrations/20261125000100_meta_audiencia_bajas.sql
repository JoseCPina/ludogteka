-- Lista de exclusión de los conjuntos de anuncios (21 de octubre de 2026): quien pidió no recibir publicidad
-- (baja de publicidad del prospecto o BAJA por WhatsApp) va en esta audiencia y TODO conjunto la excluye. Así un
-- público similar, que no sale de nuestras listas, tampoco le muestra anuncios. Solo se usa para excluir.
insert into public.meta_audiencias (clave, nombre, descripcion, tipo) values
  ('bajas', 'PeluDesk · Bajas de publicidad (exclusión)', 'Quien pidió no recibir publicidad. Solo para excluir en los conjuntos de anuncios.', 'lista')
on conflict (clave) do nothing;
