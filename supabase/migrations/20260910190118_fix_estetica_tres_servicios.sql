-- Los tipos de baño son TRES servicios distintos, y lo que los distingue
-- no es el precio: es lo que incluye cada uno, y esa lista se le enseña
-- al cliente antes de que agende.
--
-- Yo había capturado cuatro, con "pelo maltratado" como servicio propio.
-- Está mal: el pelo maltratado no es otro baño, es el MISMO baño estético
-- completo cobrado distinto porque el perro llega enredado. Se corrige en
-- la migración siguiente, con un precio alternativo en la misma tarifa.
--
-- Nada de esto se ha cobrado todavía (cero citas de estética y cero
-- cargos en producción al momento de escribirlo), así que la corrección
-- no toca dinero ya facturado.

update public.servicios
set nombre = 'Baño estético completo',
    incluye = array[
      'Baño',
      'Cepillado, deslanado y corte de pelo',
      'Corte de uñas',
      'Limpieza de orejas y dientes',
      'Corte higiénico',
      'Hidratación de nariz y huellitas'
    ],
    duracion_minutos = 120
where clave = 'estetica_estetico';

-- La diferencia con el completo es una sola línea: rapado en vez de
-- cepillado/deslanado/corte. Todo lo demás es igual, y por eso se lista
-- igual — que el cliente vea qué NO cambia es la mitad de la explicación.
update public.servicios
set nombre = 'Baño estético rapado',
    incluye = array[
      'Baño',
      'Corte de pelo rapado',
      'Corte de uñas',
      'Limpieza de orejas y dientes',
      'Corte higiénico',
      'Hidratación de nariz y huellitas'
    ],
    duracion_minutos = 90
where clave = 'estetica_rapado';

-- El exprés es otra cosa, y su lista corta es justamente el argumento:
-- quien compara $190 contra $390 tiene que poder ver por qué.
update public.servicios
set nombre = 'Baño exprés',
    incluye = array[
      'Baño con shampoo',
      'Secado'
    ],
    duracion_minutos = 45
where clave = 'estetica_expres';

-- El cuarto servicio que yo había inventado se da de baja lógica, junto
-- con sus tarifas. Baja y no borrado, como todo en este esquema: existió
-- unas horas y algo pudo haberlo referenciado.
update public.tarifas t
set deleted_at = now()
from public.servicios s
where s.id = t.servicio_id
  and s.clave = 'estetica_pelo_maltratado'
  and t.deleted_at is null;

update public.servicios
set deleted_at = now()
where clave = 'estetica_pelo_maltratado'
  and deleted_at is null;
