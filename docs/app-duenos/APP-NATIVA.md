# App para dueños · La app nativa (Expo) · base y paridad de las fases 0 a 3 (3 de noviembre de 2026)

Cuándo leerlo: al tocar cualquier cosa de `apps/duenos-movil`, `/api/movil`, la sesión de la app nativa, sus notificaciones
o su compilación en EAS. El porqué está en `PLAN.md` («La app es nativa»); el diseño, en `docs/diseno/DESIGN.md` sección 7.

## Dónde vive
- `apps/duenos-movil`: Expo SDK 58 (React Native 0.88, expo-router, TypeScript, React Compiler). Su propio `package.json`,
  `tsconfig.json` y `eslint.config.js`; la raíz del repo la excluye de su TypeScript, su ESLint y del despliegue de Vercel
  (`.vercelignore`). Controles: `cd apps/duenos-movil && npx tsc --noEmit && npx eslint src app.config.ts`; que el paquete
  compile: `npx expo export --platform android --output-dir <carpeta temporal>`.
- `app.config.ts`: nombre «PeluDesk», paquete y bundle `mx.peludesk.app`, esquema `peludesk`, dueño `menteo`, proyecto de EAS
  `@menteo/peludesk-duenos` (`ba752b19-16a4-4a08-8f01-86ef13f6c1f9`). Íconos del isotipo de PeluDesk (ícono adaptable y monocromo
  de Android). Nada secreto: la API es `https://app.peludesk.mx` (o `EXPO_PUBLIC_API_URL`) y la llave de Google Maps para
  Android llega del entorno de EAS (`GOOGLE_MAPS_ANDROID_KEY`).
- `eas.json`: `preview` (APK de prueba, distribución interna) y `production` (AAB para Google Play, versión automática).
  `.easignore` en la raíz del repo: EAS sube solo la app nativa.

## Cómo habla con PeluDesk: `/api/movil/<accion>`
- La app NO habla con Supabase directo. Todo va a `POST https://app.peludesk.mx/api/movil/<accion>` con `{ "args": [...] }`
  (o multipart con `args` y archivos; un argumento `"$form"` recibe el FormData) y la sesión en `Authorization: Bearer`.
- La ruta (`src/app/api/movil/[accion]/route.ts`) solo existe en el dominio de la app (el middleware la deja pasar ahí y da
  404 en el dominio de un negocio). Corre la acción dentro de `conSesionMovil` (`src/lib/movil/contexto.ts`, AsyncLocalStorage):
  `createSupabaseServerClient("portal")` y `supabaseAppEnNegocio()` leen la sesión de ahí (una cookie armada con el token, sin
  refresh) en lugar de la cookie. Así la app nativa usa **las mismas funciones** que la web, con la misma RLS. Un Bearer en
  cualquier otra ruta no cambia nada.
- **Lista cerrada** (`src/lib/movil/acciones.ts`): las acciones de entrar (públicas: `pedirCodigo`, `consultarEntrada`,
  `canjearEntrada`, `entrarConContrasena`, `renovarSesion`), un cargador por pantalla (`src/lib/movil/pantallas.ts`: `inicio`,
  `mascota`, `cartilla`, `seguimiento`, `perdida`, `qr`, `avisos`, `yo`, `negocioDeMascota`, `cita`, `reservar`, `visitas`,
  `pagos`, `pases`, `contratos`) y las acciones del servidor de la web (cartilla, seguimiento, perdida, avisos, Fase 3…), más
  `leerCartilla` (la lógica de la ruta de la web, ahora en `src/lib/app/cartilla-foto.ts`), `cartillaPdf` (base64),
  `registrarDispositivo` / `quitarDispositivo`, y las de las fases 4 y 5. Sin sesión: 401 (`sesion: false`); lo que no es de la
  persona: 404; una acción de la web que navega (`redirect`) devuelve `{ ir }`.
- **Sesión**: la entrada es la de siempre (código «ENTRAR ABC123» por WhatsApp, `src/lib/app/entrada.ts`); con
  `destino: "tokens"`, `canjearEntrada` y `entrarConContrasena` devuelven el access y el refresh token en lugar de escribir la
  cookie. La app los guarda en el almacén seguro del sistema (`expo-secure-store`: Keychain / Keystore) y los renueva cinco
  minutos antes de vencer (`renovarSesion`; Supabase rota el refresh token). Un 401 renueva una vez; si no se puede, sale.

## Notificaciones nativas
- `expo-notifications` pide permiso, crea los canales de Android («Avisos de tus mascotas» y «Alertas de animales cerca») y
  saca el token de Expo; `registrarDispositivo` lo guarda en **`app_push_dispositivos`** (migración `20261203002500`, tabla de
  la persona: cada quien ve y escribe solo los suyos; el servidor reasigna un token que cambia de persona).
- `enviarPush()` (`src/lib/app/push.ts`) manda a TODO lo de la persona: Web Push a sus navegadores y, por el servicio de push
  de Expo (`src/lib/movil/push.ts`), a sus celulares; un token que Expo da por muerto (`DeviceNotRegistered`) se da de baja.
  `EXPO_ACCESS_TOKEN` (opcional, solo en Vercel) si se activa el push seguro del proyecto de Expo.
- En Android, Expo entrega por FCM: **hace falta el proyecto de Firebase de PeluDesk** (`google-services.json` en la app y la
  llave de cuenta de servicio de FCM V1 subida a EAS). Sin eso, la app dice «Este celular todavía no puede recibirlas» y todo
  llega igual a Avisos y por WhatsApp. En iOS, APNs con la cuenta de Apple Developer.
- Tocar una notificación abre su pantalla: las direcciones de los avisos son las de la web y `rutaDeAviso()` las traduce.

## Pantallas (paridad de las fases 0 a 3)
Cinco pestañas nativas (Mascotas, Cerca, Alertas, Avisos, Yo) y lo demás encima, con gesto de regreso:
entrar (teléfono → código → entra sola; o contraseña) · Mis mascotas (carrusel con foto, «Te toca», «Lo que sigue», próximas
visitas) · alta de mascota (foto, especie, sexo, nacimiento) · ficha (foto grande que se cambia con la cámara, peso, cartilla,
medicinas, «Le toca», todo lo suyo, dónde la conocen, lo registrado con su QR) · leer cartilla con la cámara nativa (visor con
el marco de la hoja, galería, revisar y confirmar renglón por renglón) · cartilla (por año, «Le toca pronto», agregar a mano,
quitar, recordatorios, PDF con la hoja de compartir del sistema) · peso con gráfica, medicinas con horario y gastos del mes ·
placa con QR · mascota perdida (avisar con la ubicación del celular, cartel, mensajes, «Ya apareció») · la mascota en un
negocio (fotos del día en cuadrícula con visor, reportes, carnet, consultas, recetas, opiniones) · pedir cita (servicio, tira
de 14 días, horas libres) · reservar con cupo real y contratos de alta · mis visitas (confirmar, opinar con estrellas) ·
por pagar (link de Mercado Pago) · pases · contratos y firma con el dedo · Avisos (estado de las notificaciones, marcar leídos)
· Yo (nombre, negocios, aviso de prueba, salir).

## Pruebas
- `node scripts/auditoria/app-movil-api-dev.mjs` (app en el 3001): la puerta (acción desconocida 404, sin token y token basura
  401, no existe en el dominio de un negocio, un Bearer no abre sesión en una página), entrar y renovar, las pantallas con la
  sesión del celular (lo suyo sí, lo de otro dueño 404), y los dispositivos de notificaciones (RLS con el JWT de otro dueño y
  la llave anónima). 30 comprobaciones.
- La app nativa: `tsc`, `eslint` y `expo export` en `apps/duenos-movil`; el APK de EAS se instala y se recorre en un celular o
  emulador Android.

## Compilar y publicar
- APK de prueba: `cd apps/duenos-movil && npx eas-cli@latest build -p android --profile preview` (en la nube; el enlace de
  instalación sale al terminar). AAB para Google Play: `--profile production`.
- Lo que falta para las tiendas y para el mapa de Android está en el reporte del 3 de noviembre de 2026 y en `FASE-4.md`.
