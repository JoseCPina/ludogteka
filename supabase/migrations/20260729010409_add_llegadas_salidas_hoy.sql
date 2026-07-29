-- Las tres preguntas de la mañana en recepción: quién llega, quién se va,
-- quién sigue aquí. La tercera ya existe (quienes_estan_adentro); estas
-- dos completan el trío. "Hoy" siempre en hora del negocio
-- (fecha_negocio()), no en UTC — misma lección de siempre.
--
-- llegadas_hoy: estancias que empiezan hoy y todavía no hacen check-in.
-- Sirve igual para guardería y hotel (ambas usan fecha_entrada = hoy).
create view public.llegadas_hoy
with (security_invoker = true)
as
select
  e.id as estancia_id,
  e.perro_id,
  p.nombre as perro_nombre,
  e.servicio_id,
  s.categoria,
  s.nombre as servicio_nombre,
  e.fecha_entrada,
  e.fecha_salida,
  e.estado
from public.estancias e
join public.perros p on p.id = e.perro_id
join public.servicios s on s.id = e.servicio_id
where e.deleted_at is null
  and e.estado in ('reservada', 'confirmada')
  and e.fecha_entrada = public.fecha_negocio();

-- salidas_hoy: aquí NO basta con "fecha_salida = hoy". Guardería es una
-- visita de un solo día — su fecha_salida en la fila es fecha_entrada + 1
-- SOLO para que el rango ocupe exactamente ese día en el cálculo de cupo
-- (ver comentario en add_estancias.sql), no porque el perro se quede a
-- dormir. Un perro de guardería que entra hoy también SALE hoy, aunque su
-- columna fecha_salida diga mañana. Hotel sí usa fecha_salida tal cual
-- (el día de checkout real). Confundir los dos aquí haría que un perro de
-- guardería nunca aparezca en "se va hoy".
create view public.salidas_hoy
with (security_invoker = true)
as
select
  e.id as estancia_id,
  e.perro_id,
  p.nombre as perro_nombre,
  e.servicio_id,
  s.categoria,
  s.nombre as servicio_nombre,
  e.fecha_entrada,
  e.fecha_salida,
  e.hora_entrada_real,
  e.estado
from public.estancias e
join public.perros p on p.id = e.perro_id
join public.servicios s on s.id = e.servicio_id
where e.deleted_at is null
  and e.estado = 'en_curso'
  and (
    (s.categoria = 'hotel' and e.fecha_salida = public.fecha_negocio())
    or (s.categoria = 'guarderia' and e.fecha_entrada = public.fecha_negocio())
  );
