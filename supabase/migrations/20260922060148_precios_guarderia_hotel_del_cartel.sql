-- Fase 17, parte 3: el catálogo y los precios de guardería y hotel,
-- dictados por el negocio contra sus carteles (21 de septiembre de 2026).
--
-- Mismo criterio que la matriz de estética de 30c089a: valores dictados
-- explícitamente por el negocio en el chat, capturados de una vez y no
-- inventados. Verificado en producción antes de escribir esto: cero
-- estancias, cero bonos vendidos, cero cargos aplicados y cero tarifas
-- de guardería/hotel — nada de lo que se retira aquí ha cobrado nunca.

-- ── Guardería ─────────────────────────────────────────────────────────
-- Ocasional: $35 por hora, sin distinguir talla. Es un servicio propio
-- (unidad = hora) con la dimensión de cantidad, tramo 1+.
insert into public.servicios
  (clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad, orden, updated_at)
select 'guarderia_hora', 'Guardería ocasional (por hora)', 'guarderia', 'hora', false, false, true, 1, now()
where not exists (select 1 from public.servicios where clave = 'guarderia_hora');

insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica, updated_at)
select s.id, null, null, null, 1, null, current_date, 35.00, false, now()
from public.servicios s
where s.clave = 'guarderia_hora'
  and not exists (
    select 1 from public.tarifas t
    where t.servicio_id = s.id and t.deleted_at is null and t.vigencia_desde = current_date
  );

-- El día completo es lo que consumen los pases y la mensualidad. Deja de
-- depender de la talla: un pase es un pase, del perro que sea. Las
-- tarifas viejas por talla (solo en desarrollo) quedan huérfanas de esa
-- dimensión y se dan de baja para que no confundan a la matriz.
update public.servicios
set nombre = 'Guardería (día completo)',
    depende_tamano = false,
    orden = 2
where clave = 'guarderia_dia' and deleted_at is null;

update public.tarifas t
set deleted_at = now()
from public.servicios s
where s.id = t.servicio_id
  and s.clave = 'guarderia_dia'
  and t.tamano_id is not null
  and t.deleted_at is null;

-- ── Hotel ─────────────────────────────────────────────────────────────
-- Por noche: chica y mediana $270, grande $300. "Extra grande" cobra
-- igual que grande, así que la talla gigante NO se revive. Lo capturado
-- antes (solo en desarrollo) se da de baja y se reinserta, como en la
-- matriz de estética: tarifas es de solo inserción.
update public.tarifas t
set deleted_at = now()
from public.servicios s
where s.id = t.servicio_id
  and s.clave = 'hotel_noche'
  and t.deleted_at is null;

insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica, updated_at)
select s.id, null, tc.id, null, 1, null, current_date, v.precio, false, now()
from (values
  ('chico',   270.00),
  ('mediano', 270.00),
  ('grande',  300.00)
) as v(talla, precio)
join public.tamanos_categoria tc on tc.clave = v.talla and tc.deleted_at is null
join public.servicios s on s.clave = 'hotel_noche' and s.deleted_at is null;

-- ── Cargos que no existen ─────────────────────────────────────────────
-- Recogida tardía: no existe; el perro que no recogen pasa a hotel
-- (convertir_estancia_a_hotel). Día extra: extender es otra noche de
-- hotel a su tarifa. Medicamento administrado: no se administran
-- medicamentos como servicio; la bitácora de Fase 9 se queda para los
-- casos excepcionales, sin cobro. Baja lógica, tarifas primero.
update public.tarifas t
set deleted_at = now()
from public.servicios s
where s.id = t.servicio_id
  and s.clave in ('cargo_recogida_tardia', 'cargo_dia_extra', 'cargo_medicamento')
  and t.deleted_at is null;

update public.servicios
set deleted_at = now()
where clave in ('cargo_recogida_tardia', 'cargo_dia_extra', 'cargo_medicamento')
  and deleted_at is null;

-- ── Bonos ─────────────────────────────────────────────────────────────
-- El bono de ejemplo de Fase 3 (10 días, 90 de vigencia: valores
-- supuestos) se retira si nadie lo compró. Solo existe en desarrollo.
update public.servicios s
set deleted_at = now()
where s.clave = 'bono_guarderia_10dias'
  and s.deleted_at is null
  and not exists (
    select 1 from public.bonos_clientes bc where bc.servicio_id = s.id and bc.deleted_at is null
  );

-- Day pass: cada pase es un día completo de guardería dentro del horario.
insert into public.servicios
  (clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad,
   servicio_incluido_id, cantidad_incluida, vigencia_dias, ilimitado, orden, updated_at)
select v.clave, v.nombre, 'bono', 'dia', false, false, false,
       g.id, v.pases, v.vigencia, false, v.orden, now()
from (values
  ('bono_pases_10', 'Day pass — 10 pases',  10, 20, 30),
  ('bono_pases_15', 'Day pass — 15 pases',  15, 30, 31),
  ('bono_pases_20', 'Day pass — 20 pases',  20, 40, 32)
) as v(clave, nombre, pases, vigencia, orden)
join public.servicios g on g.clave = 'guarderia_dia' and g.deleted_at is null
where not exists (select 1 from public.servicios x where x.clave = v.clave);

-- Mensualidad: ilimitado de lunes a viernes durante 30 días.
insert into public.servicios
  (clave, nombre, categoria, unidad, depende_tamano, depende_pelaje, depende_cantidad,
   servicio_incluido_id, cantidad_incluida, vigencia_dias, ilimitado, orden, updated_at)
select 'bono_mensualidad', 'Mensualidad de guardería (L–V ilimitado)', 'bono', 'dia', false, false, false,
       g.id, null, 30, true, 33, now()
from public.servicios g
where g.clave = 'guarderia_dia' and g.deleted_at is null
  and not exists (select 1 from public.servicios x where x.clave = 'bono_mensualidad');

insert into public.tarifas
  (servicio_id, grupo_raza_id, tamano_id, pelaje_id, cantidad_desde, cantidad_hasta, vigencia_desde, precio, no_aplica, updated_at)
select s.id, null, null, null, 1, null, current_date, v.precio, false, now()
from (values
  ('bono_pases_10',    1150.00),
  ('bono_pases_15',    1380.00),
  ('bono_pases_20',    1610.00),
  ('bono_mensualidad', 1950.00)
) as v(clave, precio)
join public.servicios s on s.clave = v.clave and s.deleted_at is null
where not exists (
  select 1 from public.tarifas t
  where t.servicio_id = s.id and t.deleted_at is null and t.vigencia_desde = current_date
);

-- ── Requisitos sanitarios: vigencias del cartel ───────────────────────
-- Solo cambia el catálogo. Cada aplicación registrada lleva su propia
-- vigencia_meses_aplicado congelada desde que existe la tabla, así que
-- las ya registradas conservan la que tenían y solo las nuevas toman
-- estos valores — sin tocar una fila de requisitos_sanitarios_aplicados.
update public.tipos_requisito_sanitario set vigencia_meses = 6 where clave = 'bordetella';
update public.tipos_requisito_sanitario set vigencia_meses = 3 where clave = 'desparasitacion_interna';

-- ── Comprobación: qué queda sin poder cobrarse ───────────────────────
-- Todo servicio vivo de guardería, hotel y bono tiene que ser cotizable,
-- con UNA excepción conocida y deliberada: guarderia_dia. El cartel no
-- trae precio de día suelto (el ocasional es por hora y el día completo
-- solo se vende en pases y mensualidad), así que ese precio lo captura
-- el negocio por la UI cuando lo decida — no se inventa aquí. Si aparece
-- cualquier OTRO hueco, la migración se cae nombrándolo.
do $$
declare
  v_faltan text;
begin
  select string_agg(s.clave, ', ' order by s.orden) into v_faltan
  from public.servicios s
  where s.categoria in ('guarderia', 'hotel', 'bono')
    and s.deleted_at is null
    and s.clave <> 'guarderia_dia'
    and not exists (select 1 from public.servicios_cotizables c where c.id = s.id);

  if v_faltan is not null then
    raise exception 'Servicios de guardería/hotel/bono vivos sin ningún precio con el que cobrar: %', v_faltan;
  end if;
end;
$$;
