# PeluDesk para dueños · Plan

## Hacia dónde vamos
Una app gratuita para dueños de mascotas en México donde el expediente de su perro o gato se llena solo: con la foto de su cartilla, con el QR que la vet escanea sin instalar nada, o automáticamente cuando su negocio usa PeluDesk. Para el dueño es la cartilla, los recordatorios y la forma de pedir cita y reservar. Para PeluDesk es el canal que convierte a los negocios: cada vez que una vet, estética u hotel que no nos conoce escanea el QR de un cliente, ve PeluDesk funcionando con su propio paciente y le ofrecemos quedarse con su expediente abriendo su cuenta. Es el mismo modelo que paciente-psic en Menteo: el usuario final trae al profesional.

## Principios (no se negocian)
1. El dueño nunca teclea el expediente. Entradas válidas: foto de cartilla con IA, QR escaneado por un profesional, o el negocio desde PeluDesk.
2. Sirve el día uno aunque ningún negocio del dueño use PeluDesk.
3. Cada contacto con un negocio ajeno es una puerta de entrada a PeluDesk, nunca una pared.
4. Gratis para el dueño, sin anuncios, sin límite de mascotas, perros y gatos por igual. Nunca se cobra por la cartilla ni por los recordatorios.
5. Una sola fuente de datos: lo que ve el dueño y lo que ve el negocio sale de la misma base.
6. Local primero: la red de la app es la colonia y la ciudad (mascota perdida, vets abiertas ahora, hoteles con cupo).
7. Celular primero y nativa: la app del dueño es una app nativa para Android y iOS (Expo), publicada en las tiendas con la cuenta de Menteo S.A.S. La web se queda para lo público y para quien no instala.
8. Las quejas que matan a las apps de mascotas no pueden pasar aquí: no se pierden datos nunca (todo en la base, exportable en PDF), entrar es por teléfono con código de WhatsApp sin contraseña, y la pantalla principal tiene tres cosas, no veinte.

## La app es nativa (decisión del 3 de noviembre de 2026)
La versión web (PWA) no se sentía app y su «Cerca de mí» era una lista sin mapa. La app del dueño pasa a ser **nativa para Android y iOS** con **Expo** (expo-router, TypeScript):

- **Dónde vive**: `apps/duenos-movil`, con su propio `package.json`, TypeScript y lint. La app web (`src/`) no se mueve.
- **La lógica no se duplica**: sigue en las funciones de la base (`portal_*`, `app_*`, RPC con la sesión del dueño). Lo que vivía solo en una acción de servidor de Next se expone a la app nativa por **`/api/movil/<accion>`** (lista cerrada en `src/lib/movil/acciones.ts`): la MISMA función de la web, con la sesión del celular (`Authorization: Bearer`) que la ruta pone en un contexto que leen los clientes de Supabase del servidor (`src/lib/movil/contexto.ts`). Detalle: `docs/app-duenos/APP-NATIVA.md`.
- **La web se queda** solo para lo público y para quien no instala: el perfil `/m/<token>` (el QR de la placa), el registro de la vet por QR, el reclamo del negocio, la página de una alerta (`/alertas/<id>`) y una versión mínima de la app web que invita a descargar la nativa en cuanto esté en las tiendas (`PELUDESK_APP_ANDROID_URL`, `PELUDESK_APP_IOS_URL`).
- **Diseño nativo de verdad** (docs/diseno/DESIGN.md, sección 7): barra de pestañas inferior, gesto de regreso, hojas inferiores, cámara y permisos del sistema, háptica, iconos SF Symbols / Material.
- **Compilación**: EAS Build en la nube (cuenta de Expo `menteo`, proyecto `@menteo/peludesk-duenos`): APK de prueba y AAB para Google Play; iOS cuando esté la cuenta de Apple Developer.

## Qué ya existe y se reutiliza
Portal del dueño (cartilla, citas, reservas, fotos, contratos, pagos, acceso compartido), bot y plantillas de WhatsApp, recordatorios automáticos, índice de precios, directorio con reclamo, prospectos geocodificados, vocabulario por especie, control de concurrencia y bloqueo de escritura.

## Fases

### Fase 0 · Cimientos
- Identidad global del dueño por teléfono (código por WhatsApp, sin contraseña) que agrupa sus membresías de cliente en todos los negocios; una mascota global con vínculos a los expedientes que tiene en cada negocio; el negocio sigue viendo solo lo suyo y el dueño ve todo lo suyo. Migración de los dueños y mascotas existentes sin que nadie pierda acceso ni datos.
- PWA «PeluDesk» en app.peludesk.mx (construida); desde el 3 de noviembre de 2026 la app es nativa (arriba) y la PWA queda como versión mínima.
- App nativa: cinco pestañas (Mascotas, Cerca, Alertas, Avisos, Yo), entrada por código de WhatsApp, notificaciones push nativas (expo-notifications: FCM en Android, APNs en iOS, por el servicio de push de Expo; `app_push_dispositivos`).

### Fase 1 · Útil el día uno
- Alta de mascota en un minuto: nombre, especie, foto, y foto de la cartilla de papel; la IA extrae vacunas, desparasitaciones, lotes y fechas, el dueño confirma y queda la cartilla digital con sus recordatorios. Si no tiene cartilla, se capturan solo las fechas que recuerde.
- Recordatorios de vacuna y desparasitación por push y WhatsApp, con botón «Pedir cita» (a su negocio en PeluDesk si lo tiene; si no, a la lista de vets cercanas).
- Cartilla en PDF para compartir con cualquier vet.
- Perfil público de la mascota con QR para la placa: quien la encuentra escribe al dueño sin ver su teléfono (chat relevado por el bot).
- Mascota perdida: el dueño la marca perdida, se avisa por push a los dueños de la app en 5 km y por WhatsApp a los negocios PeluDesk de la zona, se genera el cartel para compartir, y se marca encontrada con un toque. Métrica pública: mascotas encontradas.
- Peso, medicación con recordatorio y gastos del mes por mascota.

### Fase 2 · El QR para la vet que no nos conoce
- La vet escanea el QR con la cámara del celular y abre un formulario web de 20 segundos: vacuna o desparasitación con lote y próxima dosis, peso, nota breve, nombre de la clínica y su WhatsApp, firma con el dedo. Sin cuenta ni app.
- Cada clínica que registra queda como «negocio por reclamar» que acumula pacientes y registros; a la tercera vez le decimos «ya registraste 3 pacientes aquí; abre tu cuenta gratis y quédate con su expediente» y entra a la prueba con todo precargado. El reclamo se verifica por código al WhatsApp de la clínica.
- El recordatorio de la siguiente dosis le llega al dueño firmado por esa clínica y con su WhatsApp para agendar; es la razón por la que la vet escanea.
- Lo mismo para estéticas (servicio y próxima cita sugerida) y hoteles (estancia con fechas).
- Anti abuso: límites por teléfono, registros editables solo por quien los hizo, el dueño puede ocultar un registro pero no borrar la bitácora.

### Fase 3 · Negocios que ya usan PeluDesk
- Todo automático: citas y reservas con confirmar en un toque, fotos y reporte del día, contratos para firmar, pagos pendientes con link, pases y saldo, recetas y expediente clínico.
- Pedir cita y reservar hotel o guardería con disponibilidad real, cupo de la noche y contrato en el mismo flujo.
- Reseñas verificadas: solo quien tuvo cita o estancia registrada puede opinar.

### Fase 4 · Cerca de mí (completa, en la app nativa)
- Mapa a pantalla completa (react-native-maps: Google Maps en Android, Apple Maps en iOS) con la ubicación del dueño, pines por tipo y una hoja inferior deslizable con la lista sincronizada con el mapa.
- Filtros en chips: veterinarias, abiertas ahora, urgencias 24 h, estéticas, guarderías, hoteles con cupo esta noche, pet friendly (parques, restaurantes, cafés, hoteles para personas que aceptan mascotas), tiendas e insumos, y paseadores cuando haya datos.
- Los negocios PeluDesk primero y marcados, con Reservar o Pedir cita que abre el flujo de la Fase 3 (si la mascota ya es su cliente; si no, su WhatsApp); los demás del directorio con datos de Google en vivo y su atribución, horario, distancia, calificación, llamar, WhatsApp y cómo llegar.
- Al lado de cada servicio, el rango del Índice de precios de esa ciudad.
- Ficha del lugar como hoja con fotos, horario, reseñas verificadas de PeluDesk si las hay y el reclamo del directorio para el dueño del negocio.
- Proveedores e insumos cuando exista el Bloque 6. Detalle: `docs/app-duenos/FASE-4.md`.

### Fase 5 · Alertas
- Cualquier usuario de la app sube una alerta de un perro o gato que vio en la calle: perdido, herido, en peligro o abandonado. Foto con la cámara (o de la galería), descripción y ubicación precisa del GPS, con el pin ajustable en el mapa.
- Al publicar: se quitan los metadatos de la foto, la alerta aparece en el mapa de alertas (pestaña propia), se manda push a los dueños de la app a 3 km y aviso a los negocios PeluDesk cercanos, y se compara con las mascotas reportadas perdidas en la zona (especie, color, raza, fecha y distancia) para avisarle al dueño «puede ser tu mascota».
- Estados (sigue ahí, ya no está, rescatado, reunido con su familia), actualizaciones de otros usuarios con foto y contacto con quien la subió relevado por la app y el bot, sin mostrar teléfonos. Caducan solas sin actualizaciones.
- Anti abuso: límite por usuario, reportar alerta falsa u ofensiva, moderación desde /plataforma/alertas, y nunca se muestra quién la subió. Métricas en /plataforma/app-duenos: alertas, rescatados y reunidos. Detalle: `docs/app-duenos/FASE-5.md`.

### Fase 6 · Monetización (solo cuando haya decenas de miles de dueños)
- Al negocio: aparecer destacado y reservable en «Cerca de mí» viene incluido en su suscripción; es argumento de venta, no un cobro aparte. Nunca comisión por cliente.
- Alianzas opcionales para el dueño: seguro, vet 24/7 por chat, productos. Nunca se cobra la cartilla, los recordatorios ni las mascotas.

## Distribución
1. Clientes de Ludogteka y de cada negocio nuevo: al terminar la bienvenida, el negocio manda la invitación a sus clientes con una plantilla (sus mascotas ya aparecen cargadas al entrar).
2. Cada escaneo de QR en una clínica ajena es un negocio nuevo en el embudo.
3. Mascota perdida y RUAC (CDMX) como contenido y anuncios: son las dos búsquedas con más intención de los dueños.
4. Enlaces desde la Escuela, el índice de precios y el directorio.

## Métricas que importan
Dueños activos a 30 y 90 días; mascotas con cartilla y por qué entrada (foto, QR, negocio); escaneos de QR por clínica y clínicas que reclaman; negocios que pasan de «por reclamar» a prueba y a pago; alertas de pérdida y encontradas; alertas de la calle, rescatados y reunidos; citas pedidas desde la app; instalaciones de la app nativa por plataforma. Todo en /plataforma/app-duenos.

## Reglas de construcción
- Mismo repo, misma base, misma seguridad por negocio; auditorías de aislamiento, 390 px, permisos y acciones con registro final aplican igual.
- La app nativa no habla con Supabase directo: todo por `/api/movil` (una función de la web por acción). Una acción nueva de la app se agrega a la lista cerrada de `src/lib/movil/acciones.ts` y a su auditoría (`app-movil-api-dev.mjs`, `app-movil-cerca-alertas-dev.mjs`).
- Cada fase se despliega sola con el procedimiento normal, con su auditoría de punta a punta en desarrollo y verificación en producción con los clientes de la demo.
- Ayuda, bot y docs se actualizan con cada fase; CLAUDE.md lleva el índice.

## Hacerse cliente desde la app (6 de noviembre de 2026)
Un dueño sin expediente en un negocio PeluDesk pide su reserva o cita desde «Cerca de mí», ve qué datos se comparten y confirma. Sin cobro ni cupo hasta que el negocio acepte; al aceptar se crea el expediente y se liga la misma mascota. Sin comisión por cliente. El negocio lo puede apagar y recibirlos por WhatsApp. Detalle: FASE-3.md, «Cliente nuevo».
