-- La pantalla 2 (detalle de reserva) necesita que la pantalla 1 pueda
-- enlazar cada fila directo a su reserva. CREATE OR REPLACE VIEW no
-- admite insertar una columna nueva a media lista (solo agregar al
-- final) — más simple recrearlas.
drop view public.llegadas_hoy;
drop view public.salidas_hoy;
drop view public.quienes_estan_adentro;

create view public.llegadas_hoy
with (security_invoker = true)
as
select
  e.id as estancia_id,
  e.reserva_id,
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

create view public.salidas_hoy
with (security_invoker = true)
as
select
  e.id as estancia_id,
  e.reserva_id,
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

create view public.quienes_estan_adentro
with (security_invoker = true)
as
select
  e.id as estancia_id,
  e.reserva_id,
  e.perro_id,
  p.nombre as perro_nombre,
  e.servicio_id,
  s.categoria,
  s.nombre as servicio_nombre,
  e.hora_entrada_real,
  e.fecha_salida
from public.estancias e
join public.perros p on p.id = e.perro_id
join public.servicios s on s.id = e.servicio_id
where e.deleted_at is null
  and e.estado = 'en_curso';
