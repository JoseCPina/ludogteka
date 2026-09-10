-- "Mestiza" no encontraba nada.
--
-- Encontrado mirando los 16 perros reales de producción antes de pasarle
-- la pantalla de normalización a recepción: seis de ellos tienen escrito
-- "Mestiza", en femenino, y el catálogo solo conocía "mestizo". Con eso:
--
--   * la normalización en bloque no los podía resolver, aunque no hay
--     absolutamente nada que preguntar sobre ellos, y
--   * una dueña que escriba "mestiza" en el alta no encuentra nada en el
--     buscador. Termina escribiendo texto libre, que cotiza igual pero
--     deja el expediente sin raza del catálogo — el mismo hueco que esto
--     viene a cerrar.
--
-- Es una omisión del catálogo, no de la búsqueda: el buscador ya empata
-- contra los alias, solo que estos no estaban. Se agregan las formas
-- femeninas y las variantes de una sola palabra que la gente escribe de
-- verdad, sin inventar sinónimos que no se usan.
update public.razas
set alias = array(select distinct unnest(alias || array['mestiza', 'criolla', 'cruzada', 'callejero', 'callejera']))
where lower(nombre) = 'no sé / mestizo'
  and deleted_at is null;

-- Mismo caso, otras razas donde el femenino es lo que se teclea.
update public.razas
set alias = array(select distinct unnest(alias || array['pastora alemana']))
where lower(nombre) = 'pastor alemán'
  and deleted_at is null;

update public.razas
set alias = array(select distinct unnest(alias || array['perra salchicha']))
where lower(nombre) = 'salchicha'
  and deleted_at is null;

-- Deliberadamente NO se agregan alias para "Pastor Belga" ni "Schnauzer"
-- a secas, que son los otros dos textos que quedan pendientes en
-- producción. Hay dos pastores belgas en el catálogo (malinois y
-- groenendael) y cuatro schnauzers, y cobran distinto: un alias
-- resolvería la ambigüedad a ciegas y le cambiaría el precio a ese perro
-- sin que nadie lo haya decidido. Esos los contesta recepción.
