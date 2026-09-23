-- Los requisitos sanitarios (vacunas, desparasitación) son de guardería
-- y hotel, no de estética. Un perro que solo viene a bañarse los veía en
-- rojo en el portal, en la ficha del cliente y en su expediente, como si
-- le faltaran — y no le faltan: nadie se los va a pedir.
--
-- Esta vista dice qué perros SÍ usan guardería u hotel, y con eso las
-- pantallas deciden si el estado sanitario alarma o solo se menciona.
-- Cuenta como "usa":
--   * tiene o tuvo una estancia de guardería u hotel (perro_categorias_servicio), o
--   * tiene un contrato vivo (los contratos son solo de guardería y hotel:
--     un perro recién dado de alta por el link de guardería todavía no
--     tiene estancias, pero ya firmó —o le generaron— el contrato).
-- El bloqueo al reservar guardería u hotel no cambia: sigue en el
-- trigger de estancias y aplica a cualquier perro en el momento de reservar.
create view public.perros_con_guarderia_hotel
with (security_invoker = true)
as
select p.id as perro_id
from public.perros p
where p.deleted_at is null
  and (
    exists (select 1 from public.perro_categorias_servicio pcs where pcs.perro_id = p.id)
    or exists (
      select 1 from public.contratos c
      where c.perro_id = p.id and c.estado <> 'cancelado'
    )
  );

comment on view public.perros_con_guarderia_hotel is
  'Perros a los que aplican los requisitos sanitarios: usan (o van a usar) guardería u hotel. Un perro solo de estética no aparece.';
