# App para dueños · Fase 2 · El QR como entrada de negocios (1 de noviembre de 2026)

Lo construido de la Fase 2 del plan (PLAN.md), sobre las fases 0 y 1. Léelo al tocar el formulario público
`/m/<token>/registrar`, `app_atenciones`, `app_qr_escaneos`, la precarga de pacientes del QR al abrir una cuenta, la
plantilla `peludesk_cita_sugerida_v1` o `/plataforma/app-duenos`.

## La idea
Cualquier veterinaria, estética u hotel que tenga enfrente a una mascota con placa de PeluDesk escanea su QR y, sin
cuenta ni app, registra lo que le hizo. El dueño lo recibe al momento en su cartilla. El negocio queda como «por
reclamar» y, desde su tercer registro, se le ofrece abrir su cuenta gratis con esos pacientes ya cargados.

## Base (migración `20261203001300_app_duenos_fase2`)
- `app_qr_escaneos` guarda una fila cada vez que se abre el formulario. El mismo teléfono (IP) sobre la misma mascota en 30
  minutos cuenta una sola vez. Guarda `ip_hash` (huella del día, nunca la IP), y `prospecto_id` y `giro` cuando el
  escaneo terminó en un registro.
- `app_atenciones` guarda lo que registró el negocio. Columnas:
  - `giro`: veterinaria, estetica u hotel.
  - Del negocio: `negocio_nombre` y `negocio_whatsapp` (10 dígitos).
  - `datos` (jsonb). Veterinaria: `aplicaciones[]` con tipo, nombre, subtipo, lote y próxima dosis. Estética: `servicio` y
    `proxima_cita`. Hotel: `entrada` y `salida`.
  - `fecha`, `peso_kg`, `nota` (280 caracteres), `firma_path` (PNG en `app-mascotas/atenciones/<mascota>/…`).
  - Para la edición: `editor_hash` (huella del token que solo guarda el teléfono que registró), `editable_hasta` (24 h) y
    `historial` (cada versión anterior).
  - `oculto_at`: la pone el dueño.
- Las dos tablas son SOLO del servidor: RLS con lectura para la plataforma y la red `peludesk_definer`. No tienen
  `negocio_id`, igual que el resto de las tablas de la persona; están en las «compartidas» de `auditoria_frontera()`.
- `mascotas_cartilla.atencion_id` y `mascotas_pesos.atencion_id` indican qué atención escribió cada fila.
- Tipos nuevos:
  - `app_recordatorios.tipo` gana `cita_sugerida`.
  - `app_avisos.tipo` gana `registro`.
  - `prospectos.fuente` gana `qr`.
- `app_mis_atenciones(p_mascota)` (definer) es la única forma en que el dueño lee las atenciones de SU mascota. No
  devuelve huellas, prospecto ni escaneo.

## El formulario (`src/app/app/m/[token]/registrar/`, `src/lib/app/atenciones.ts`)
- `/m/<token>` (cuando la mascota no está perdida) enseña la tarjeta «¿Atiendes a …? Registrar atención». El middleware
  deja pasar `/m/<token>/registrar` sin sesión.
- La página enseña SOLO el nombre, la especie, la raza y la cartilla (`mascotaParaNegocio`). Nunca el nombre ni el
  teléfono de la familia; la auditoría lo revisa en el HTML y en las respuestas de las acciones.
- Los pasos:
  1. Escoger Veterinaria, Estética u Hotel.
  2. Llenar según el giro:
     - Veterinaria: chips con las vacunas por especie y desparasitación. Cada uno propone la próxima dosis (12 o 3 meses),
       y se anotan el lote, el peso y una nota.
     - Estética: el servicio y la próxima cita sugerida (chips de 2 semanas, 1 mes o 2 meses, o una fecha).
     - Hotel: la entrada y la salida.
  3. Escribir el nombre y el WhatsApp del negocio. Se recuerdan en `localStorage` de ese teléfono para el siguiente
     paciente. La ubicación es opcional.
  4. Firmar con el dedo (canvas). Sin firma, «Guardar» dice que falta.
- `registrarAtencion` hace, en orden:
  1. Valida.
  2. Aplica los límites.
  3. Busca o crea el prospecto (`prospectoDe`; detalle en «Negocio por reclamar»).
  4. Sube la firma.
  5. Inserta la atención.
  6. La aplica al expediente: cartilla con fuente `qr` y pesos, y reprograma los recordatorios.
  7. Avisa al dueño con push y Avisos (`tipo = registro`).
  8. Devuelve el token de edición y el conteo para la oferta.
- **Límites al día** (`LIMITES`): 6 por mascota, 30 por WhatsApp del negocio y 40 por IP. Sin cuenta, se dice qué pasa.
- **Edición**: solo el teléfono que lo hizo (el token vive en su `localStorage`; la base guarda la huella) y solo durante
  24 h. «Corregir el de las HH:MM» vuelve a llenar el formulario. Cada versión anterior queda en `historial`, y la cartilla
  y el peso se reescriben (lo anterior se marca con `deleted_at`).
- **El dueño oculta, no borra**: en la ficha de su mascota, «Lo que registraron los negocios» (`AtencionesDeNegocios`)
  tiene «Ocultar» y «Volver a mostrar».
  - Ocultar le pone `oculto_at` a la atención, quita sus filas de la cartilla y los pesos, y reprograma.
  - Volver a mostrar las vuelve a escribir.
  - La atención nunca se borra.

## Del lado del dueño
- La cartilla dice «lo registró <negocio> con el QR».
- **Recordatorios firmados**:
  - Las próximas dosis registradas por QR llevan «De parte de <negocio>» en push y Avisos.
  - La plantilla de vacuna `peludesk_rec_vacuna_v2` lleva el negocio en {{3}}.
  - «Agendar» contesta con el wa.me del negocio y el mensaje listo (`atenderBotonApp`).
- **Cita sugerida** (estética): se avisa 3 días antes y el mismo día. Por WhatsApp va SOLO con la plantilla
  `peludesk_cita_sugerida_v1` aprobada; mientras no lo esté, `wa_estado = plantilla_no_aprobada` y el aviso sale por push y
  Avisos.
- «Pedir cita» (`/mascotas/<id>/cita`) también ofrece los negocios del QR.

## Negocio por reclamar y la oferta
- `prospectoDe` reutiliza el registro del directorio:
  - Busca primero el mismo WhatsApp (`telefono_norm`).
  - Si no, el mismo nombre normalizado a 300 m o menos (cuando hay ubicación).
  - Si no, crea un prospecto `fuente = 'qr'` con su evento.
- **Oferta** (`OFERTA_A_LA = 3`): desde el tercer registro de ese prospecto, y mientras no tenga negocio, la pantalla de
  éxito dice «Ya registraste 3 pacientes aquí; abre tu cuenta gratis y quédate con su expediente».
- **El reclamo** usa el mismo mecanismo que el directorio (`iniciarReclamo`):
  1. «Abrir mi cuenta gratis» da el código.
  2. El negocio manda «RECLAMO ABC123» desde su WhatsApp. El webhook lo verifica (`prospecto_reclamo_verificar` exige ese
     mismo número).
  3. La pantalla pregunta cada 3 s (`verReclamo`, con tope) y enseña «Abrir mi cuenta», que lleva a
     `peludesk.mx/registro?prospecto=…&reclamo=…&utm_source=app_duenos&utm_medium=qr` (`urlSitio()`; en desarrollo,
     `PELUDESK_SITIO_URL`).
- **Precarga** (`aplicarPrecargaQR`, desde `registro/actions.ts` después de `aplicarReclamoAlRegistro` verificado):
  - Crea el cliente «Pacientes del QR de PeluDesk» con el WhatsApp DEL NEGOCIO. El del dueño nunca viaja.
  - Cada mascota entra como su perro (nombre, especie, raza) con un `mascotas_vinculos`, para que lo que registre después
    le llegue al dueño.
  - Lo registrado queda en las notas clínicas de cada mascota si el negocio tiene Veterinaria (esa tabla exige el
    módulo). Si no, va a las notas internas del cliente, un bloque por mascota.
  - Es idempotente. Corre al terminar el registro, unos segundos después de la redirección.

## Métricas (`/plataforma/app-duenos`)
- Escaneos: total, en 30 días y sin registro.
- Atenciones: total y en 30 días.
- Dueños y mascotas.
- El embudo: por reclamar, reclamado (código verificado o negocio ligado), en prueba (`plan = prueba`) y pagando (otro
  plan que no sea demo).
- La tabla «Escaneos por negocio».

## Plantilla
- `peludesk_cita_sugerida_v1` (UTILITY, botones Agendar y Después): `src/lib/app/plantilla-cita-sugerida.json`, en el
  catálogo `PLANTILLAS_PELUDESK`.
- La tarea diaria `/api/cron/plantillas-whatsapp` la manda a aprobar. También se puede con «Mandar a aprobar» en
  `/plataforma/plantillas-whatsapp` (`app-duenos-prod.mjs --plantillas`).

## Pruebas
- `node scripts/auditoria/app-duenos-f2-dev.mjs` (desarrollo; arranque del servidor con dobles en su cabecera). Cubre el
  escaneo y lo que ve el negocio; vet, estética y hotel; la oferta; la edición (mismo teléfono, otro teléfono y vencida);
  la ficha y cartilla del dueño, y ocultar/mostrar; el cron con la plantilla de vacuna firmada y la cita sin aprobar;
  «Agendar»; el reclamo por el webhook; el registro con la precarga; la métrica; los límites; la RLS; y 390 px.
- `node scripts/auditoria/app-duenos-prod.mjs [--escribir] [--plantillas]` (producción, con la mascota de la dueña de la
  demo; `--escribir` limpia todo lo que crea).

## Pendiente
- El video tutorial de «Tus pacientes del QR» (en `ARTICULOS_SIN_VIDEO`).
- El WhatsApp de la cita sugerida depende de la aprobación de Meta.
