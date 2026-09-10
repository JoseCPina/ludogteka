-- "No sé / mestizo" no es una raza: es la ausencia de respuesta, metida
-- en el catálogo para que el dueño tenga dónde decirlo.
--
-- La diferencia importa para el precio estimado del alta. Hasta ahora la
-- pantalla deducía "no me dijo la raza" de que el grupo de precio fuera el
-- predeterminado, y eso es falso: el grupo predeterminado es el de PELO
-- CORTO, un grupo real, con precios reales, al que pertenecen el labrador,
-- el bóxer y el pitbull. Un dueño que contestó "labrador" recibía el aviso
-- de "como no nos dijiste la raza…" encima de una cotización que era
-- exactamente correcta — un labrador grande son $490 y punto.
--
-- Con esta bandera las dos cosas quedan separadas: el aviso fuerte sale
-- cuando el dueño NO identificó el pelo de su perro (escogió "no sé" o
-- escribió una raza fuera del catálogo), no cuando su raza cae en el grupo
-- que además sirve de destino por defecto.
alter table public.razas
  add column es_desconocida boolean not null default false;

comment on column public.razas.es_desconocida is
  'Esta entrada del catálogo significa "el dueño no sabe la raza", no una raza concreta. El precio estimado la trata como incierta.';

-- Una sola, por la misma razón que grupos_raza tiene un solo
-- predeterminado: si hubiera dos, la pantalla tendría que elegir cuál
-- significa "no sé" y elegiría mal.
create unique index razas_una_desconocida_idx
  on public.razas (es_desconocida) where es_desconocida;

update public.razas
set es_desconocida = true
where lower(nombre) = 'no sé / mestizo'
  and deleted_at is null;
