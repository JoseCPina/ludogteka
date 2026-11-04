# App para dueños · Fase 4 · Cerca de mí (3 de noviembre de 2026)

Cuándo leerlo: al tocar «Cerca de mí» de la app nativa, `src/lib/movil/cerca.ts`, las funciones `cerca_*` o el costo de
Google Places de la app.

## Qué ve el dueño
Mapa a pantalla completa (react-native-maps: Apple Maps en iOS, Google Maps en Android) con su ubicación, chips arriba
(veterinarias, abiertas ahora, urgencias 24 h, estéticas, guarderías, hoteles con cupo hoy, pet friendly, tiendas) y una hoja
inferior deslizable con la lista. Tocar un pin sube la hoja con la ficha del lugar y desplaza la lista; tocar un renglón
centra el mapa. La ficha: fotos, horario y opiniones de Google, opiniones verificadas de PeluDesk, llamar, WhatsApp, cómo
llegar (Apple Maps / Google Maps), Reservar o Pedir cita, y «¿Es tu negocio? Reclama tu ficha». Su ubicación se guarda
redondeada a ~1 km (`guardarZona`) para avisarle de mascotas perdidas y alertas.

## De dónde sale (`cercaDeMi(lat, lng, categoria)`)
- **Directorio de PeluDesk**: `prospectos_cerca` (6 km) con teléfono, WhatsApp, `google_place_id` y si ya es negocio PeluDesk
  (`negocio_cliente_id` o reclamo registrado).
- **Negocios PeluDesk** por la ubicación de su sucursal, aunque no estén en el directorio: `cerca_negocios_peludesk` (migración
  `20261203002600`; de postgres y en la lista blanca de `auditoria_frontera`, como `app_negocios_cerca`, porque lee lo público
  de las sucursales de todos los negocios; solo el servidor). Solo salen en estética, guardería u hotel si tienen ese servicio.
- **Cupo de esta noche** de los hoteles PeluDesk: `cerca_cupo_hotel_esta_noche()` (definer, acotada al negocio por la llave
  de servicio con su `x-negocio-id`; la misma cuenta que valida una reserva: `resolver_cupo_configuracion` +
  `ocupacion_del_dia`). Sin precios.
- **Google en vivo** (Places API New, Text Search; `GOOGLE_PLACES_API_KEY` del servidor): abiertas ahora (`openNow`, tipo
  `veterinary_care`), urgencias 24 h, pet friendly (parque, restaurante, café y hotel que acepta mascotas: cuatro búsquedas),
  tiendas (`pet_store`). Se muestra con atribución («Datos de Google Maps») y no se guarda; se recuerda **30 minutos por zona
  de ~1 km y búsqueda** (`unstable_cache`) para cuidar el costo por llamada (SKU Enterprise por `openNow` y teléfono). Un lugar
  de Google que ya está en el directorio se queda con la ficha del directorio y su marca PeluDesk. La ficha pide Place Details
  (`lugarDeGoogle`, ya con su caché de dos horas del directorio).
- **Orden**: PeluDesk primero (los hoteles con cupo antes que los llenos), después por distancia; hasta 60.
- **Precio de la zona**: el servicio principal de la categoría (consulta, baño, día de guardería, noche de hotel) con
  `rangoDe` del Índice de precios en la ciudad del directorio (o el estado, o el país); p25 a p75.
- **Reservar / Pedir cita**: `mascotasConVinculo` dice qué mascotas del dueño ya tienen expediente en ese negocio: el botón
  abre el flujo de la Fase 3 de la primera. Si no es su cliente: su WhatsApp con un mensaje listo, o su página.
- Paseadores: el chip sale cuando haya datos de paseadores en el directorio (hoy el directorio no los tiene).

## Pendiente
- **Android sin llave de Google Maps** (`GOOGLE_MAPS_ANDROID_KEY` en EAS, restringida al paquete `mx.peludesk.app` y la huella
  SHA-1 del certificado de EAS): Google Maps truena sin llave, así que el APK enseña la lista sin mapa (`hayMapa`). En iOS el
  mapa es Apple Maps y no pide llave.
- Atribución de Google sobre Apple Maps (iOS): los términos de Places piden el logo «Google» junto a los datos cuando no se
  muestran sobre un mapa de Google; la ficha dice «Datos de Google Maps»; antes de publicar en la App Store, poner el logo.

## Pruebas
`node scripts/auditoria/app-movil-cerca-alertas-dev.mjs` (secciones 1 y 2): sin sesión 401, categoría desconocida rechazada,
respuesta por categoría con PeluDesk primero y ubicación de cada lugar, y que `cerca_negocios_peludesk` y
`cerca_cupo_hotel_esta_noche` no las llama un dueño ni la llave anónima.
