-- La matriz de estética completa, dictada por el negocio contra el cartel
-- impreso. Reemplaza TODO lo que yo había capturado: había tres errores
-- de lectura míos (shih tzu a $450 cuando su precio base es $390, rapado
-- de shih tzu marcado como no ofrecido cuando sí se ofrece a $320, y
-- exprés de pastor de pelo largo marcado como no ofrecido cuando cuesta
-- $370).
--
-- Regla que ordena todo esto: después de esta migración la matriz de
-- estética no debe tener NI UNA celda vacía. Lo que el negocio no ofrece
-- va como no_aplica, que es una decisión; un hueco es un olvido de
-- captura y significa que ese servicio no se puede cobrar.

-- ── La talla gigante se retira ────────────────────────────────────────
-- No existe en ningún cartel. Se da de baja lógica en vez de dejarla
-- "sin tarifa": una talla que nadie va a cotizar nunca no es un pendiente
-- de captura, es una talla que no existe para este negocio. Verificado
-- antes: cero perros la tienen asignada, así que nadie se queda con un
-- tamaño colgando.
update public.tarifas t
set deleted_at = now()
from public.tamanos_categoria tc
where tc.id = t.tamano_id
  and tc.clave = 'gigante'
  and t.deleted_at is null;

update public.tamanos_categoria
set deleted_at = now()
where clave = 'gigante' and deleted_at is null;

-- ── El grupo por defecto se llama por lo que es ───────────────────────
-- Se llamaba "Pelo corto", y ahí cae CUALQUIER perro sin raza del
-- catálogo, tenga el pelo que tenga. El nombre hacía pensar que el precio
-- por talla era solo para perros de pelo corto, y no: es para todo perro
-- sin grupo. La clave no se toca, solo la etiqueta que se lee.
update public.grupos_raza
set nombre = 'Por talla (perros sin grupo de raza)'
where clave = 'pelo_corto';

-- ── Se retira lo capturado y se pone la tabla del negocio ─────────────
-- Baja lógica y reinserción, no UPDATE: `tarifas` es de solo inserción y
-- un precio firmado en una cita apunta a su fila exacta. Aquí no hay
-- ninguna cita (cero al momento de escribir esto), así que lo retirado no
-- deja nada huérfano; y si mañana la hubiera, seguiría apuntando a su
-- fila vieja, que es justo lo que este patrón protege.
update public.tarifas t
set deleted_at = now()
from public.servicios s
where s.id = t.servicio_id
  and s.categoria = 'estetica'
  and t.grupo_raza_id is not null
  and t.deleted_at is null;

insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta,
   vigencia_desde, precio, precio_pelo_maltratado, no_aplica, updated_at)
select s.id, g.id, tc.id, null, 1, null, current_date, v.precio, v.maltratado, v.no_aplica, now()
from (values
  -- servicio            grupo                 talla      precio  maltratado  no_aplica
  --
  -- Los dos grupos chicos de pelo largo cobran IGUAL. En el cartel el de
  -- shih tzu aparece a $450 porque suelen llegar maltratados, pero su
  -- precio base es el mismo $390 — leerlo como precio base fue el error
  -- que esta migración corrige.
  ('estetica_estetico', 'poodle_maltes',      null,       390.00, 450.00, false),
  ('estetica_rapado',   'poodle_maltes',      null,       320.00, null,   false),
  ('estetica_expres',   'poodle_maltes',      null,       190.00, null,   false),

  ('estetica_estetico', 'shihtzu_similares',  null,       390.00, 450.00, false),
  ('estetica_rapado',   'shihtzu_similares',  null,       320.00, null,   false),
  ('estetica_expres',   'shihtzu_similares',  null,       190.00, null,   false),

  ('estetica_estetico', 'pomerania',          null,       390.00, 450.00, false),
  ('estetica_rapado',   'pomerania',          null,       null,   null,   true),
  ('estetica_expres',   'pomerania',          null,       190.00, null,   false),

  ('estetica_estetico', 'pastor_corto',       null,       590.00, null,   false),
  ('estetica_rapado',   'pastor_corto',       null,       null,   null,   true),
  ('estetica_expres',   'pastor_corto',       null,       370.00, null,   false),

  ('estetica_estetico', 'pastor_largo',       null,       650.00, null,   false),
  ('estetica_rapado',   'pastor_largo',       null,       null,   null,   true),
  ('estetica_expres',   'pastor_largo',       null,       370.00, null,   false),

  ('estetica_estetico', 'viejo_pastor',       null,       790.00, null,   false),
  ('estetica_rapado',   'viejo_pastor',       null,       590.00, null,   false),
  ('estetica_expres',   'viejo_pastor',       null,       450.00, null,   false),

  -- Perro sin grupo de raza: cobra por talla. El exprés aplica a
  -- cualquiera de ellos, no solo a los de pelo corto. El rapado no: a un
  -- perro de pelo corto no se le rapa, y solo se ofrece en los dos grupos
  -- chicos de pelo largo y en viejo pastor inglés.
  ('estetica_estetico', 'pelo_corto',         'chico',    250.00, null,   false),
  ('estetica_estetico', 'pelo_corto',         'mediano',  350.00, null,   false),
  ('estetica_estetico', 'pelo_corto',         'grande',   490.00, null,   false),
  ('estetica_expres',   'pelo_corto',         'chico',    150.00, null,   false),
  ('estetica_expres',   'pelo_corto',         'mediano',  190.00, null,   false),
  ('estetica_expres',   'pelo_corto',         'grande',   230.00, null,   false),
  ('estetica_rapado',   'pelo_corto',         'chico',    null,   null,   true),
  ('estetica_rapado',   'pelo_corto',         'mediano',  null,   null,   true),
  ('estetica_rapado',   'pelo_corto',         'grande',   null,   null,   true)
) as v(servicio_clave, grupo_clave, talla_clave, precio, maltratado, no_aplica)
join public.servicios s on s.clave = v.servicio_clave and s.deleted_at is null
join public.grupos_raza g on g.clave = v.grupo_clave
left join public.tamanos_categoria tc on tc.clave = v.talla_clave and tc.deleted_at is null;

-- Comprobación dentro de la propia migración: 3 servicios × (6 grupos con
-- precio único + 3 tallas del grupo por talla) = 27 celdas, ni una vacía.
-- Si el conteo no cuadra, la migración se cae aquí y no deja la matriz a
-- medias — que es exactamente el estado que este cambio viene a eliminar.
do $$
declare
  v_celdas int;
begin
  select count(*) into v_celdas
  from public.tarifas t
  join public.servicios s on s.id = t.servicio_id
  where s.categoria = 'estetica'
    and s.deleted_at is null
    and t.deleted_at is null
    and t.grupo_raza_id is not null;

  if v_celdas <> 27 then
    raise exception 'La matriz de estética quedó con % celdas y deberían ser 27.', v_celdas;
  end if;
end;
$$;
