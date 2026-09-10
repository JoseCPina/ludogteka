-- Error de lectura del cartel, corregido por el negocio: "Pelo maltratado
-- $450" NO es un recargo que se suma, es el PRECIO TOTAL alternativo del
-- mismo servicio. En el grupo de poodle/maltés, un perro que llega
-- maltratado cuesta $450 EN LUGAR de los $390 normales.
--
-- Como cargo aparte (que fue como lo capturé) habría cobrado $390 + $450
-- = $840, casi el doble de lo que el negocio cobra. El modelo no estaba
-- mal: estaba mal a qué concepto lo colgué.
--
-- Lo correcto es una variante más del servicio, al lado de estético,
-- rapado y exprés — que es exactamente como el cartel lo lista dentro de
-- cada grupo. Así el precio sale de resolver_precio como cualquier otro,
-- entra en el snapshot al reservar, y nadie puede sumarlo por accidente.

-- El cargo se da de baja lógica, no se borra: la tabla de servicios es
-- historial y algo pudo haberlo referenciado en las horas que existió.
-- Con deleted_at deja de aparecer en la pantalla de cargos y deja de
-- resolver precio, que es lo que importa.
update public.tarifas t
set deleted_at = now()
from public.servicios s
where s.id = t.servicio_id
  and s.clave = 'recargo_pelo_maltratado'
  and t.deleted_at is null;

update public.servicios
set deleted_at = now()
where clave = 'recargo_pelo_maltratado'
  and deleted_at is null;

-- La variante nueva. Dura más que un estético normal (un perro
-- enredado se trabaja más lento), así que la agenda le reserva más
-- tiempo: 150 minutos contra 120. Ese número es supuesto, como los de
-- los demás servicios de estética — ajustable desde la pantalla de
-- servicios cuando el negocio lo confirme.
insert into public.servicios
  (clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, depende_grupo_raza, duracion_minutos, orden, updated_at)
values
  ('estetica_pelo_maltratado', 'Baño estético con pelo maltratado', 'estetica', 'sesion', false, false, false, true, 150, 8, now());

-- $450 en los tres grupos de razas pequeñas. En los demás no aplica: en
-- los grupos grandes el cartel ya trae el trabajo extra dentro de su
-- propio precio, y un perro de pelo corto no se enreda.
insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica, updated_at)
select s.id, g.id, tc.id, null, 1, null, current_date, v.precio, v.no_aplica, now()
from (values
  ('poodle_maltes',     null,      450.00, false),
  ('pomerania',         null,      450.00, false),
  ('shihtzu_similares', null,      450.00, false),
  ('pastor_corto',      null,      null,   true),
  ('pastor_largo',      null,      null,   true),
  ('viejo_pastor',      null,      null,   true),
  -- Pelo corto cobra por talla, así que su "no aplica" también va por
  -- talla: una sola fila sin tamaño no empataría nunca con lo que manda
  -- el trigger para ese grupo, y saldría 'sin_tarifa' (hueco de captura)
  -- en vez de 'no_aplica' (decisión de negocio).
  ('pelo_corto',        'chico',   null,   true),
  ('pelo_corto',        'mediano', null,   true),
  ('pelo_corto',        'grande',  null,   true)
) as v(grupo_clave, talla_clave, precio, no_aplica)
join public.servicios s on s.clave = 'estetica_pelo_maltratado'
join public.grupos_raza g on g.clave = v.grupo_clave
left join public.tamanos_categoria tc on tc.clave = v.talla_clave;
