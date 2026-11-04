# App para dueños · Fase 5 · Alertas de animales en la calle (3 de noviembre de 2026)

Cuándo leerlo: al tocar las alertas (`alertas_calle*`), `src/lib/movil/alertas.ts`, la pestaña Alertas de la app nativa,
`/alertas/<id>` de la web, `/plataforma/alertas` o la tarea `/api/cron/alertas`.

## Qué hace
Cualquier persona con la app sube una alerta de un perro o gato que vio en la calle (perdido, herido, en peligro o
abandonado): foto (cámara o galería), qué le pasa, especie, tamaño, color, descripción y la ubicación del GPS, con el pin
ajustable moviendo el mapa. Al publicar:
1. **La foto pierde sus metadatos**: el celular la vuelve a codificar (sin EXIF) y el servidor otra vez con `sharp` (gira
   según EXIF, 1600 px, JPEG sin metadatos), en el bucket privado `alertas-calle`. La carpeta es una **huella** del id de la
   persona (`_alerta_carpeta`: sha256, 24 caracteres; la misma en el servidor, `carpetaDe`): la URL firmada no dice quién la
   subió, y la base comprueba que la foto es de quien publica.
2. **Avisos**: «¿Puede ser …?» a los dueños de mascotas perdidas parecidas (`alerta_calle_coincidencias`: misma especie,
   perdida en los últimos 60 días, a 5 km; el puntaje suma cercanía, días, y color o raza en la descripción; una vez por alerta
   y mascota en `alertas_calle_coincidencias`); «Vieron … cerca de ti» a los dueños de la app a 3 km (`app_duenos_cerca`); y a
   los admins de los negocios PeluDesk a 3 km por WhatsApp con la plantilla `peludesk_alerta_calle_v1` (catálogo
   `src/lib/whatsapp/plantillas.ts`, texto en `src/lib/app/plantilla-alerta-calle.json`; **solo cuando Meta la apruebe**:
   mandarla a aprobar desde `/plataforma/plantillas-whatsapp`). Los avisos son tipo `alerta` (Avisos + push; en Android, el canal
   «Alertas de animales cerca»).
3. **Estados**: sigue ahí, ya no está, rescatado, reunido con su familia; cualquiera lo cambia con una novedad (texto y/o
   foto); a quien la subió le llega el aviso. Las resueltas se ven 3 días más en el mapa.
4. **Mensajes relevados**: cualquiera le escribe a quien la subió; quien la subió contesta a cada persona («Persona 1, 2…»).
   Llegan por Avisos y push, y por WhatsApp solo si la persona habló con el bot en las últimas 24 horas (fuera de esa ventana
   Meta pide plantilla). Nadie ve teléfonos ni ids.
5. **Caducan solas**: sin actividad en 72 horas quedan «caducada» (`alertas_calle_caducar`, `/api/cron/alertas` cada hora).

## Base (migraciones `20261203002700`, `…2800`, `…2900`)
Tablas de la PERSONA (sin `negocio_id`, en la lista de `auditoria_frontera`): `alertas_calle`, `alertas_calle_actualizaciones`,
`alertas_calle_reportes`, `alertas_calle_mensajes`, `alertas_calle_coincidencias`. Nadie lee lo de otros directo: cada quien
lee SUS alertas, novedades y reportes; los mensajes, ni eso (llevaban el id de la otra persona: `…2800` quitó esa política);
las coincidencias, el dueño de la mascota. Todo lo demás por funciones `peludesk_definer` que nunca devuelven ids de
personas: `alertas_calle_cerca` (solo `es_mia`), `alerta_calle_detalle` (alias por conversación), `alerta_calle_crear`,
`alerta_calle_actualizar`, `alerta_calle_reportar`, `alerta_calle_mensaje`. Solo servidor: `alerta_calle_coincidencias`,
`alertas_calle_caducar`. Plataforma: `plataforma_alertas_calle`, `plataforma_alerta_calle_moderar`, `app_alertas_metricas`.

**Anti abuso en la base**: 5 alertas por persona en 24 horas y una cada 2 minutos; 20 novedades y 40 mensajes al día; reportar
(falsa, ofensiva, repetida, otro) una vez por persona, nunca la propia; con 3 reportes de personas distintas se esconde sola.
**Moderación**: `/plataforma/alertas` (reportadas, escondidas, todas; esconder con motivo, mostrar otra vez —borra los
reportes—, borrar). **Métricas**: `/plataforma/app-duenos`, sección «Alertas de la calle» (total, en 30 días, activas,
rescatados, reunidos, escondidas, caducadas).

## La web
`/alertas/<id>` en app.peludesk.mx (con sesión): la foto, qué le pasa, estado, «Cómo llegar» y las novedades; para
actualizar o escribir, la invitación a la app nativa (sale cuando hay liga de la tienda). Es la dirección de los avisos.

## Pruebas
`node scripts/auditoria/app-movil-cerca-alertas-dev.mjs` (secciones 3 a 9, dos dueños de Huellitas): la foto guardada ya no
trae EXIF/XMP/IPTC y su carpeta no lleva el id; ninguna respuesta (lista, detalle con la URL de la foto, mensajes) lleva el id
de quien la subió; por la API nadie lee alertas ni mensajes ajenos y la llave anónima nada; aviso «¿Puede ser…?» y su
coincidencia; a quien la subió no le llega su propio aviso; segunda alerta inmediata rechazada; no reportar la propia; un
reporte por persona; un dueño no modera ni lee métricas; «rescatado» avisa a quien la subió; mensajes de ida y vuelta;
caducidad. Limpia lo que crea.
