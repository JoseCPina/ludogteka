# App para dueños · Fase 0 · Cimientos (31 de octubre de 2026)

Lo construido de la Fase 0 del plan (PLAN.md). Cuándo leerlo: al tocar app.peludesk.mx, `duenos`, `mascotas`, `mascotas_vinculos`, la entrada por código de WhatsApp, las notificaciones push o el service worker de la app.

## Dónde vive
- **Dominio**: `app.peludesk.mx` (`esHostApp`, `src/lib/negocio/host.ts`; en desarrollo `app.localhost:3001`; más hosts con `PELUDESK_HOSTS_APP`). Ya no es host de plataforma. Los links hacia la app se arman con `urlApp()` (`PELUDESK_APP_URL` en desarrollo).
- **Rutas**: las páginas viven en `src/app/app/` y el middleware (`appDuenos`) reescribe `/` → `/app`, `/avisos` → `/app/avisos`, etc. En el dominio de un negocio y en el de la plataforma `/app` no existe (404). Las públicas: `/entrar`, `/manifest.webmanifest`, `/sw-app.js`, `/icono-pwa`, `/sin-conexion`. Todo lo demás pide sesión y sin ella manda a `/entrar?ir=<ruta>`.
- **Encabezado** `x-peludesk-app: 1` firmado (`ENCABEZADO_APP`, misma firma que la plataforma): lo leen el layout raíz (metadatos PWA) y `esApp()`. Sin `x-negocio-id`: `negocioActual()` no se llama en la app.
- **Sesión**: la cookie del portal (`area.ts`, área `portal`), porque es la misma cuenta de Auth con la que el dueño entra al portal de cualquier negocio. `sesionApp()` (`src/lib/app/sesion.ts`) la lee y asegura la fila en `duenos`.

## Identidad y datos (migración `20261203000900`)
- `duenos` (id = `auth.users.id`, teléfono a 10 dígitos, nombre, lat/lng/ciudad para «Cerca de mí» y «mascota perdida», último acceso). RLS: la propia fila.
- `mascotas` (la mascota global de la persona: nombre, especie, sexo, nacimiento, esterilizado, raza en texto, microchip, foto propia, fallecido, `origen` app|negocio|qr). RLS: las propias.
- `mascotas_vinculos` (mascota ↔ `perros` de un negocio; tabla de negocio con las dos redes; el personal del negocio la lee, el dueño la lee por `app_mis_vinculos()`).
- **El puente** `app_vincular_perro(perro_id)` (de postgres, lista blanca de la frontera, categoría identidad): el expediente de un cliente que tiene cuenta (membresía `cliente`) queda ligado a una mascota del dueño; se dispara al crear o cambiar un `perros` (`perros_app_vincular`) y al ligarse la cuenta (`membresias_app_vincular`), y la migración ligó todo lo que ya existía (desarrollo: 38 dueños, 1,338 mascotas). Nunca tumba la escritura del negocio (atrapa y avisa). Una baja en el negocio oculta la mascota solo si nació de un negocio y no tiene otro expediente; el fallecimiento se refleja.
- `app_mis_vinculos()` y `app_mis_negocios()` (de postgres, lista blanca): cruzan negocios filtradas por `auth.uid()`.
- `app_entradas` (códigos de entrada, solo servidor), `app_push_suscripciones` (RLS propia), `app_avisos` (RLS propia; las escribe el servidor con `crearAviso`).
- La foto de una mascota sin foto propia es la del expediente del negocio: se firma con la llave del servidor acotada a ese negocio (`fotoDeMascota`, `src/lib/app/datos.ts`).

## Entrar por teléfono con código de WhatsApp (`src/lib/app/entrada.ts`)
1. `/entrar`: el dueño escribe su número; `pedirEntrada` crea un código de 6 caracteres (15 minutos; tope de 8 por teléfono al día; se reusa el pendiente).
2. La pantalla enseña el código, el mensaje completo para copiar y el botón que abre WhatsApp al número de PeluDesk (`PELUDESK_WHATSAPP`) con «ENTRAR ABC123»; pregunta cada 3 s (`estadoEntrada`, con tope y aviso de reintento).
3. El webhook del bot (`atenderEntrada`, antes de la Escuela y del asistente) comprueba que el código exista, no haya vencido y venga de ese número; lo marca `verificada` y contesta por WhatsApp.
4. `canjearEntrada`: una sola vez y dentro de 10 minutos; la cuenta es la que ya tiene el teléfono en toda la plataforma (`email_de_persona_por_telefono`) o una nueva (correo sintético, `email_confirm`); se abre por enlace mágico (`generateLink` + `verifyOtp`) en la cookie del portal y la acción navega.
- Camino secundario: «entrar con contraseña» (la del portal de un negocio), `entrarConContrasena`.
- Así no hace falta una plantilla de autenticación de Meta (que no se puede mandar a aprobar desde esta computadora) y la verificación es real.

## PWA y push
- `public/sw-app.js`: copia de las pantallas que ya se abrieron (red primero con tope de 4 s, luego copia, luego `/sin-conexion`), nunca POST ni `/api`, copia de una sola persona; `push` y `notificationclick`.
- `src/components/app/pwa-app.tsx` lo registra y avisa sin señal. `manifest.webmanifest` e `/icono-pwa` sirven lo de PeluDesk en el host de la app.
- Push: `web-push` con VAPID (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, en Vercel y `.env.local`). `enviarPush(duenoId, carga)` (`src/lib/app/push.ts`) da de baja la suscripción con 404/410 o 5 fallos. Activar: Avisos → «Activar avisos en este teléfono» (`activar-avisos.tsx`); «Mandarme un aviso de prueba» crea un aviso y lo manda.

## Pantallas
- `/` Mis mascotas (tarjetas con foto, especie, edad, «En <negocio>»; «Siempre con nosotros»; «Donde te conocen» con el portal de cada negocio), `/mascotas/<id>` (datos, dónde la conocen, lo que sigue), `/avisos` (activar avisos, instalar, lista con «Nuevo» y marcar leídos), `/cerca` (ubicación → lugares del directorio por giro a 6 km, `prospectos_cerca`, marcados los que usan PeluDesk; guarda la zona redondeada a ~1 km en `duenos`), `/yo` (nombre, número, negocios, cerrar sesión).
- Diseño propio: `src/app/app/app-duenos.css` (clases `apd-*`): crema, tarjetas blancas con sombra difusa, píldoras, tres pestañas flotantes abajo, entradas con peso, apagado con «reducir movimiento».
- El portal de cada negocio sigue completo (citas, contratos, facturas, fotos: eso pasa a la app en la Fase 3) y enseña arriba el aviso con el link a la app (`AvisoAppPortal`).

## Pruebas
- `node scripts/auditoria/app-duenos-dev.mjs` (con `next start -p 3001` y los dobles de WhatsApp en el 4456): hosts, entrada por código de punta a punta (webhook firmado), aislamiento, puente con un expediente nuevo y una baja, push, manifest, service worker, 390 px, el portal del negocio con el aviso.
- Estáticas: `acciones-registro-final`, `botones-con-tope`, `rutas-en-textos`, `secretos`; `auditoria_frontera()` vacía.

## Pendiente (se dijo en el reporte de la fase)
- El alta por link de un negocio a un teléfono que YA tiene cuenta creada por la app pide «la contraseña que ya usas», y esa cuenta no tiene: hay que ofrecerle ahí el código por WhatsApp (Fase 3, al unificar el portal).
- «Cerca de mí» no distingue negocios PeluDesk sin ficha reclamada ni sabe quién está abierto (Fase 4).
- Las rutas viejas del portal no redirigen todavía a la app: redirigen cuando la app cubra lo que el portal hace (Fase 3).
