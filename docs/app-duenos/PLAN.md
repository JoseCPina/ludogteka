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
7. Celular primero: PWA instalable con notificaciones desde el día uno; tiendas después con la cuenta de Menteo S.A.S.
8. Las quejas que matan a las apps de mascotas no pueden pasar aquí: no se pierden datos nunca (todo en la base, exportable en PDF), entrar es por teléfono con código de WhatsApp sin contraseña, y la pantalla principal tiene tres cosas, no veinte.

## Qué ya existe y se reutiliza
Portal del dueño (cartilla, citas, reservas, fotos, contratos, pagos, acceso compartido), bot y plantillas de WhatsApp, recordatorios automáticos, índice de precios, directorio con reclamo, prospectos geocodificados, vocabulario por especie, control de concurrencia y bloqueo de escritura.

## Fases

### Fase 0 · Cimientos
- Identidad global del dueño por teléfono (código por WhatsApp, sin contraseña) que agrupa sus membresías de cliente en todos los negocios; una mascota global con vínculos a los expedientes que tiene en cada negocio; el negocio sigue viendo solo lo suyo y el dueño ve todo lo suyo. Migración de los dueños y mascotas existentes sin que nadie pierda acceso ni datos.
- PWA «PeluDesk» en app.peludesk.mx: instalable, notificaciones push, funciona con mala señal, íconos y pantalla de inicio propios. El portal actual se convierte en esta app; las rutas viejas redirigen.
- Diseño propio de la app (distinto al panel del negocio): tres pestañas, Mis mascotas, Avisos y Cerca de mí.

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

### Fase 4 · Cerca de mí
- Vets abiertas ahora, estéticas, hoteles con cupo esta noche y lugares pet friendly: negocios PeluDesk primero (con reservar), después los del directorio con datos de Google en vivo y atribución; rangos del índice de precios al lado.
- Proveedores e insumos cuando exista el Bloque 6.

### Fase 5 · Monetización (solo cuando haya decenas de miles de dueños)
- Al negocio: aparecer destacado y reservable en «Cerca de mí» viene incluido en su suscripción; es argumento de venta, no un cobro aparte. Nunca comisión por cliente.
- Alianzas opcionales para el dueño: seguro, vet 24/7 por chat, productos. Nunca se cobra la cartilla, los recordatorios ni las mascotas.

## Distribución
1. Clientes de Ludogteka y de cada negocio nuevo: al terminar la bienvenida, el negocio manda la invitación a sus clientes con una plantilla (sus mascotas ya aparecen cargadas al entrar).
2. Cada escaneo de QR en una clínica ajena es un negocio nuevo en el embudo.
3. Mascota perdida y RUAC (CDMX) como contenido y anuncios: son las dos búsquedas con más intención de los dueños.
4. Enlaces desde la Escuela, el índice de precios y el directorio.

## Métricas que importan
Dueños activos a 30 y 90 días; mascotas con cartilla y por qué entrada (foto, QR, negocio); escaneos de QR por clínica y clínicas que reclaman; negocios que pasan de «por reclamar» a prueba y a pago; alertas de pérdida y encontradas; citas pedidas desde la app. Todo en /plataforma/app-duenos.

## Reglas de construcción
- Mismo repo, misma base, misma seguridad por negocio; auditorías de aislamiento, 390 px, permisos y acciones con registro final aplican igual.
- Cada fase se despliega sola con el procedimiento normal, con su auditoría de punta a punta en desarrollo y verificación en producción con los clientes de la demo.
- Ayuda, bot y docs se actualizan con cada fase; CLAUDE.md lleva el índice.
