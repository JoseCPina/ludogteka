-- Los tres servicios reales de estética y sus precios por grupo de raza,
-- leídos del cartel impreso del negocio.
--
-- Excepción consciente a "nada de datos de negocio a mano en producción"
-- (CLAUDE.md): son valores dictados explícitamente por el dueño en el
-- chat, no captura rutinaria ni números inventados — mismo criterio y
-- mismo precedente que las tarifas de recolección y las direcciones de
-- Fase 10. Quedan aquí para que el negocio los VERIFIQUE contra el
-- impreso; corregir cualquiera es capturar una tarifa nueva desde la
-- matriz, que es el camino normal y no requiere tocar esto.
--
-- Los servicios viejos de estética (baño, corte, deslanado, uñas, oídos y
-- los dos combos) se quedan como están: nunca tuvieron tarifas
-- capturadas, y darlos de baja es una decisión del negocio desde la
-- pantalla de servicios, no algo que deba decidir una migración.
insert into public.servicios
  (clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, depende_grupo_raza, duracion_minutos, orden, updated_at)
values
  ('estetica_estetico', 'Baño estético', 'estetica', 'sesion', false, false, false, true, 120, 5, now()),
  ('estetica_rapado',   'Rapado',        'estetica', 'sesion', false, false, false, true,  90, 6, now()),
  ('estetica_expres',   'Baño exprés',   'estetica', 'sesion', false, false, false, true,  45, 7, now());

-- depende_tamano se queda en false a nivel de SERVICIO y el tamaño lo
-- decide el GRUPO (grupos_raza.depende_tamano). Ponerlo en true aquí
-- obligaría a capturar precio por talla en los siete grupos, cuando solo
-- el de pelo corto se cobra así.

-- El recargo por pelo maltratado es un cargo, no un servicio de estética:
-- se aplica sobre la cita ya hecha con el mismo mecanismo que la
-- recolección a domicilio (cargos_aplicados + resolver_precio), sin
-- inventar nada nuevo. $450 para las razas pequeñas; en los grupos
-- grandes el cartel ya lo trae dentro del precio del servicio, así que
-- ahí no se aplica este cargo.
insert into public.servicios
  (clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, depende_grupo_raza, orden, updated_at)
values
  ('recargo_pelo_maltratado', 'Recargo por pelo maltratado', 'cargo', 'evento', false, false, false, false, 25, now());

-- Precios del cartel. Una fila por (servicio, grupo) — y por talla en el
-- único grupo que cobra por talla.
--
-- Las combinaciones que el cartel NO lista (pomerania no tiene rapado,
-- pastor de pelo largo solo tiene estético) se capturan como
-- no_aplica = true, NO se dejan vacías: un hueco vacío significa "nadie
-- ha capturado este precio" y sale alarmante en la matriz, que es
-- justamente lo que debe pasar con un olvido de captura. Una variante que
-- el negocio decidió no ofrecer es otra cosa, y el modelo ya sabe
-- distinguirlas desde Fase 3.
insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica, updated_at)
select
  s.id, g.id, tc.id, null, 1, null, current_date, v.precio, v.no_aplica, now()
from (values
  -- servicio            grupo                 talla      precio  no_aplica
  ('estetica_estetico', 'poodle_maltes',      null,       390.00, false),
  ('estetica_rapado',   'poodle_maltes',      null,       320.00, false),
  ('estetica_expres',   'poodle_maltes',      null,       190.00, false),

  ('estetica_estetico', 'pomerania',          null,       390.00, false),
  ('estetica_rapado',   'pomerania',          null,       null,   true),
  ('estetica_expres',   'pomerania',          null,       190.00, false),

  ('estetica_estetico', 'shihtzu_similares',  null,       450.00, false),
  ('estetica_rapado',   'shihtzu_similares',  null,       null,   true),
  ('estetica_expres',   'shihtzu_similares',  null,       190.00, false),

  ('estetica_estetico', 'pastor_corto',       null,       590.00, false),
  ('estetica_rapado',   'pastor_corto',       null,       null,   true),
  ('estetica_expres',   'pastor_corto',       null,       370.00, false),

  ('estetica_estetico', 'pastor_largo',       null,       650.00, false),
  ('estetica_rapado',   'pastor_largo',       null,       null,   true),
  ('estetica_expres',   'pastor_largo',       null,       null,   true),

  ('estetica_estetico', 'viejo_pastor',       null,       790.00, false),
  ('estetica_rapado',   'viejo_pastor',       null,       590.00, false),
  ('estetica_expres',   'viejo_pastor',       null,       450.00, false),

  -- Pelo corto: el único grupo con precio por talla.
  ('estetica_estetico', 'pelo_corto',         'grande',   490.00, false),
  ('estetica_estetico', 'pelo_corto',         'mediano',  350.00, false),
  ('estetica_estetico', 'pelo_corto',         'chico',    250.00, false),
  ('estetica_expres',   'pelo_corto',         'grande',   230.00, false),
  ('estetica_expres',   'pelo_corto',         'mediano',  190.00, false),
  ('estetica_expres',   'pelo_corto',         'chico',    150.00, false),
  ('estetica_rapado',   'pelo_corto',         'grande',   null,   true),
  ('estetica_rapado',   'pelo_corto',         'mediano',  null,   true),
  ('estetica_rapado',   'pelo_corto',         'chico',    null,   true)
) as v(servicio_clave, grupo_clave, talla_clave, precio, no_aplica)
join public.servicios s on s.clave = v.servicio_clave
join public.grupos_raza g on g.clave = v.grupo_clave
left join public.tamanos_categoria tc on tc.clave = v.talla_clave;

-- El grupo de pelo corto tiene talla "gigante" en el catálogo de tamaños
-- y el cartel no le pone precio: queda deliberadamente SIN capturar, para
-- que salga alarmante en la matriz y el negocio decida si cobra como
-- grande o si le pone su propio precio. Dejarlo en no_aplica diría "no lo
-- ofrecemos", que no es lo que el cartel dice — el cartel simplemente no
-- lo menciona.

insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica, updated_at)
select s.id, null, null, null, 1, null, current_date, 450.00, false, now()
from public.servicios s
where s.clave = 'recargo_pelo_maltratado';
