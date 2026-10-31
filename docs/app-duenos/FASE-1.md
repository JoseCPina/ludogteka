# App para dueños · Fase 1 · Útil el día uno (31 de octubre de 2026)

Lo construido de la Fase 1 del plan (PLAN.md), sobre la Fase 0 (FASE-0.md). Cuándo leerlo: al tocar la cartilla de la app (`mascotas_cartilla*`), la lectura por foto con IA, los recordatorios de la app (`app_recordatorios`), el perfil público `/m/<token>`, «mascota perdida» o peso/medicación/gastos.

## Base (migración `20261203001000`)
- Bucket privado `app-mascotas` (8 MB; fotos de perfil y de la cartilla; el servidor sube y firma).
- `mascotas`: `token_publico` (10 caracteres sin 0/O/1/I, único, para el QR), `perdida_at/perdida_nota/perdida_lat/perdida_lng/encontrada_at`, `recordatorios_apagados`. `duenos.recordatorios_whatsapp`.
- Tablas de la mascota (RLS por `app_mascota_mia(mascota_id)`): `mascotas_cartilla` (vacuna/desparasitación, nombre, subtipo, lote, laboratorio, fechas, `fuente` foto|manual|negocio|qr, `confianza`, `foto_id`), `mascotas_cartilla_fotos` (la foto, lo que leyó la IA, `ms`, tokens, estado), `mascotas_pesos`, `mascotas_medicamentos` (`horas time[]`, inicio/fin), `mascotas_gastos` (el gasto del dueño; `monto` está en `NO_ES_DINERO` de dinero-cliente porque no es dinero de un negocio), `app_recordatorios` (una fila por aviso programado; solo las lee el dueño, las escribe el servidor), `mascotas_mensajes` (solo servidor; el dueño lee por `app_mensajes_de()` sin el teléfono de quien escribió).
- Funciones: `app_gastos_mes` (el total del mes sale de la base), `app_duenos_cerca` (ids a N km; servidor), `app_negocios_cerca` (sucursales con ubicación; de postgres, lista blanca), `app_mascotas_encontradas`, `app_mascota_publica(token)` (servidor).

## Cartilla por foto (`src/lib/app/cartilla-ia.ts`, ruta POST `/mascotas/<id>/cartilla/leer/foto`)
- La foto se comprime en el celular (lado 1800 px), se sube al bucket y se manda a Claude (`claude-sonnet-5`, tope 55 s) con la herramienta obligatoria `registrar_cartilla`: por registro, tipo, nombre, subtipo, fecha de aplicación, próxima dosis (solo si está escrita), lote, laboratorio y confianza 0–1; además es_cartilla, nombre, especie, peso y observaciones. Fechas día/mes/año → AAAA-MM-DD.
- El dueño REVISA fila por fila (puede corregir y quitar; las de confianza < 0.7 salen marcadas) y confirma (`confirmarLectura`): ahí recién se escriben `mascotas_cartilla` (fuente foto) y, si venía, el peso. Cada lectura queda en `mascotas_cartilla_fotos` con `ms` y tokens: de ahí sale la medición de tiempo y acierto.
- Sin IA (sin `ANTHROPIC_API_KEY`): la ruta responde 503 y la pantalla manda a capturar a mano. Localmente la llave no sirve: la lectura real solo corre en Vercel.
- Captura a mano: sugerencias por especie con intervalo habitual (`SUGERENCIAS`), que proponen la próxima dosis.

## Recordatorios (`src/lib/app/cartilla.ts` `programarRecordatorios`, `src/lib/app/recordatorios.ts`, cron `/api/cron/app-recordatorios` a los :03/:18/:33/:48)
- Por cada producto, la última aplicación con próxima dosis genera dos filas: 7 días antes y el mismo día, a las 10:00 del centro de México. Medicamentos activos: una por hora del día, 14 días adelante. Reprogramar es idempotente (lo pendiente que ya no corresponde se omite; lo enviado no se toca).
- El cron toma lo vencido y lo manda UNA vez: push (`enviarPush`), aviso en Avisos y, para vacuna/desparasitación, WhatsApp con la plantilla aprobada `peludesk_rec_vacuna_v2` ({{3}} = «tu app PeluDesk»; botones Agendar / Después con payload `app:<id>:<acción>`, atendidos por `atenderBotonApp` antes que los de negocio). Medicamentos nunca van por WhatsApp. Estados: `wa_estado` (enviado, sin_telefono, apagado, plantilla_no_aprobada, fallo:…).
- «Pedir cita» (`/mascotas/<id>/cita`): WhatsApp del negocio donde tiene expediente (`negocios.landing.telefono_wa`) con el mensaje listo; sin negocio, Cerca de mí.

## QR, perfil público y mensajes relevados (`src/lib/app/publico.ts`)
- `/mascotas/<id>/qr`: el QR (biblioteca `qrcode`, en el navegador) de `urlApp()/m/<token>`, PNG para bajar y el link para grabar.
- `/m/<token>` (público; middleware `appDuenos` lo deja pasar; `src/app/app/m/[token]`): la mascota, si está perdida, y el formulario de quien la encontró (mensaje, nombre y WhatsApp opcionales, campo trampa; tope 20 mensajes por mascota al día). También «Mejor por WhatsApp»: abre el bot con «ENCONTRE <token>: » (`atenderHallazgo` en el webhook). Al dueño le llega push y aviso; contesta desde `/mascotas/<id>/perdida` (`responderHallador`): sale por el bot al WhatsApp de quien escribió si la ventana de 24 h está abierta; si no, queda en el hilo, que quien escribió ve en la misma página (guarda en localStorage desde cuándo). Nadie ve el teléfono del otro.
- `/m/<token>/cartel`: PNG 1080×1350 (`ImageResponse`) con foto, nombre, zona y QR.

## Mascota perdida (`src/lib/app/perdida.ts`)
- `marcarPerdida` (ubicación del celular o la zona guardada + nota) → `avisarPerdida`: push + aviso a los dueños de la app a 5 km (`app_duenos_cerca`) y WhatsApp a los admins (teléfono del correo sintético) de los negocios PeluDesk con sucursal a 15 km (`app_negocios_cerca`) con la plantilla `peludesk_mascota_perdida_v1` (en el catálogo; el cron diario la manda a aprobar a Meta; mientras no esté APPROVED+UTILITY no se manda y la pantalla lo dice). Cartel y «Compartir por WhatsApp». «¡Ya apareció!» pone `encontrada_at`; la métrica pública es `app_mascotas_encontradas()` (en /entrar y en /m).

## Pantallas nuevas
`/mascotas/nueva`, `/mascotas/<id>` (lo que le toca, accesos), `/mascotas/<id>/cartilla` (+ `leer`, `pdf`), `/mascotas/<id>/seguimiento`, `/mascotas/<id>/qr`, `/mascotas/<id>/perdida`, `/mascotas/<id>/cita`, `/m/<token>` (+ `cartel`). El service worker (v2) muestra acciones en la notificación.

## Pruebas
- `node scripts/auditoria/app-duenos-f1-dev.mjs` (app compilada + dobles de WhatsApp y de Anthropic en el 4456): alta con foto, lectura por foto (doble de IA → revisar → confirmar; los recordatorios quedan programados), captura a mano, PDF, seguimiento, QR, perfil público y mensaje de quien la encontró (página y «ENCONTRE» por el webhook; el dueño ve el mensaje; su respuesta sale por el bot), perdida/encontrada con dueños cerca y negocios cerca, cron de recordatorios (push + plantilla al doble), RLS de todo lo nuevo con JWT reales, 390 px.
- `node scripts/auditoria/app-cartillas-prod.mjs`: las 10 cartillas de prueba contra la IA real en producción con la dueña de la demo: tiempo y acierto por campo.

## Pendiente (en el reporte de la fase)
- El aviso a negocios por WhatsApp depende de que Meta apruebe `peludesk_mascota_perdida_v1` (se manda a aprobar desde Vercel con el cron de plantillas); hasta entonces solo salen los avisos a dueños de la app.
- Un negocio sin ubicación en su sucursal no recibe avisos de mascotas perdidas: la ubicación se guarda en Administración → Configuración (punto de salida).
- Las fotos de la cartilla no se borran solas: se guardan para revisar lecturas; el dueño no tiene todavía botón para borrarlas.
