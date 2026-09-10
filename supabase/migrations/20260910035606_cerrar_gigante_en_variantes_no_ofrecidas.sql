-- El catálogo de tamaños tiene CUATRO tallas (chico, mediano, grande,
-- gigante) y al capturar los precios del cartel escribí solo tres. En el
-- grupo de pelo corto, que es el único que se cobra por talla, eso dejó
-- la fila de "gigante" vacía en las cuatro variantes.
--
-- No todas esas cuatro celdas vacías significan lo mismo, y la diferencia
-- importa: una es un hueco de captura (naranja, alarmante, "hay que
-- decidir un precio") y la otra es una decisión de negocio ("no lo
-- ofrecemos"). La matriz ya sabe distinguirlas desde Fase 3; lo que
-- faltaba era decírselo.
--
--   * Rapado y baño con pelo maltratado NO se ofrecen a un perro de pelo
--     corto en NINGUNA talla — las otras tres tallas ya dicen "no aplica".
--     Que gigante saliera distinto es una inconsistencia que metí yo, no
--     algo que el negocio haya decidido. Se cierran aquí.
--
--   * Baño estético y baño exprés SÍ se cobran por talla en este grupo, y
--     el cartel simplemente no menciona la talla gigante. Esas dos se
--     quedan vacías A PROPÓSITO, por instrucción explícita del dueño:
--     "prefiero que salga alarmante a inventar un precio; si llega uno, lo
--     capturo en el momento". No se tocan.
insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica, updated_at)
select s.id, g.id, tc.id, null, 1, null, current_date, null, true, now()
from public.servicios s
join public.grupos_raza g on g.clave = 'pelo_corto'
join public.tamanos_categoria tc on tc.clave = 'gigante'
where s.clave in ('estetica_rapado', 'estetica_pelo_maltratado')
  and s.deleted_at is null;
