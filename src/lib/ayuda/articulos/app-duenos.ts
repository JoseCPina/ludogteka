import type { Articulo } from "../tipos";

// La app para dueños de mascotas (docs/app-duenos/PLAN.md). Lo que el personal del negocio tiene que saber para
// explicársela a sus clientes. Si una pantalla de la app cambia, se cambia aquí en el mismo cambio.
export const ARTICULOS_APP_DUENOS: Articulo[] = [
  {
    slug: "app-peludesk-para-duenos",
    titulo: "La app PeluDesk para tus clientes: qué ven y cómo entran",
    resumen: "Tus clientes tienen una app gratuita donde ven a todas sus mascotas, de todos sus negocios, y entran con su número de WhatsApp.",
    grupo: "portal",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/portal"],
    palabras: ["app", "app para dueños", "app.peludesk.mx", "mis mascotas", "entrar con whatsapp", "código por whatsapp", "sin contraseña", "avisos", "notificaciones", "instalar", "cerca de mí", "dueño", "cliente no puede entrar", "pedir cita", "reservar", "confirmar cita", "reseñas", "opiniones", "confirmar cita", "aviso al dueño", "notificación al dueño", "cancelé la cita", "pagar desde la app", "firmar contrato", "pases", "mapa", "alertas", "perro en la calle", "perro herido", "animal abandonado", "hotel con cupo", "pet friendly", "app para android", "app para iphone"],
    cuerpo: `Además del portal de tu negocio, tus clientes tienen la **app PeluDesk**, gratuita, en **app.peludesk.mx**. Es de la persona, no de un negocio: ahí ve a **todas sus mascotas**, las de tu negocio y las de cualquier otro que use PeluDesk, con la misma cuenta.

## Cómo entra tu cliente

1. Abre **app.peludesk.mx** en su celular y escribe su **número de WhatsApp** (el mismo que tiene en su ficha contigo).
2. PeluDesk le manda un **código de 6 dígitos** por WhatsApp. En la app de Android se escribe solo con el botón «Autocompletar»; en iPhone y en la web lo copia o lo escribe. Vence a los 10 minutos.
3. Si no le llega en un minuto, toca **Reenviar**. Sin contraseña y sin correo.

Si ya tiene contraseña del portal de tu negocio, también le sirve ahí («entrar con contraseña»), pero el código es el camino normal.

> El código llega al WhatsApp de ese número. Si tu cliente dice que «no entra», revisa que el número de su ficha sea el de su WhatsApp: la app lo reconoce por ese número.

## Qué ve

- **Mis mascotas**: una tarjeta por mascota con su foto, qué es, su edad y en qué negocios la conocen («En Ludogteka»). Las mascotas que registras tú aparecen **solas** en su app, al momento, siempre que la ficha del dueño tenga su número y él haya activado su cuenta (el link de alta o la invitación al portal). Si da de baja una mascota contigo, en su app deja de verse; si falleció, queda en «Siempre con nosotros».
- Desde cada mascota abre **su ficha en tu negocio** dentro de la app: sus fotos del día, los reportes que le mandaste, su carnet, sus consultas y recetas (sin notas internas), y desde ahí **pide cita o reserva** contigo. Su expediente completo sigue en el portal de tu negocio, con la misma cuenta.
- **Te toca**: arriba de todo, lo que le pide algo: contratos por firmar, visitas por confirmar y lo que tiene por pagar contigo.
- **Avisos**: lo que la app le tiene que decir, y el botón para **activar los avisos en su celular** (notificaciones). En iPhone solo funcionan con la app instalada en la pantalla de inicio.
- **Cerca de mí**: veterinarias, estéticas, guarderías y hoteles cerca de donde está, con la calificación de Google Maps; los negocios que usan PeluDesk salen marcados. En la app para celular es un mapa (abajo, «Cerca de mí en el mapa»).
- **Instalar la app**: desde Avisos, para tenerla como app en su celular, con su ícono.

## Qué NO cambia para ti

Tú sigues viendo solo lo tuyo: tus clientes, tus mascotas, tus citas. La app no te pide nada ni te quita nada. Lo que el dueño ve de tu negocio sale de lo que ya capturas en PeluDesk.

## Lo que el dueño puede hacer solo (aunque su mascota no esté contigo)

- **Dar de alta a su mascota** (nombre, especie, sexo, nacimiento y foto) y **leer su cartilla de papel con una foto**: la app saca las vacunas, desparasitaciones, lotes y fechas, él revisa y confirma. También puede **anotar a mano** las fechas que recuerde. Las fotos de la cartilla que ya revisó se guardan por si hay que volver a leerlas; desde su cartilla puede **borrarlas** cuando quiera, y lo que ya está en su cartilla no cambia.
- **Recordatorios**: una semana antes y el mismo día de cada próxima dosis, por notificación en su celular, en Avisos y por WhatsApp (si tiene avisos de WhatsApp prendidos). El recordatorio trae **Pedir cita**: si la mascota tiene expediente contigo y tienes servicios de estética, la pide en línea con tus horas libres (y, si prefiere, WhatsApp con tu número de la landing y un mensaje listo); si no, las veterinarias cercanas.
- **Cartilla en PDF** para compartirla con cualquier vet.
- **Peso, medicinas (con recordatorio a sus horas) y gastos del mes** por mascota.
- **QR para la placa**: quien lo escanee ve a la mascota y le escribe a la familia sin ver su teléfono (PeluDesk lleva los mensajes; si quien la encontró manda «ENCONTRE» y el código al WhatsApp de PeluDesk, las respuestas del dueño le llegan a su WhatsApp). Los mensajes los ve y los contesta en «Si se pierde» de esa mascota, esté o no marcada como perdida.
- **Mascota perdida**: con un toque se avisa por notificación a los dueños de la app a 5 km y por WhatsApp a los negocios con PeluDesk a 15 km (si tu sucursal tiene ubicación guardada, te llega a ti el mensaje «Se perdió … cerca de …» con el link de su perfil), y se genera un cartel con QR para compartir. «¡Ya apareció!» la cierra.

> Lo que el dueño captura o lee de su cartilla de papel es suyo y no sustituye el carnet que tú firmas en Veterinaria; lo que registras tú aparece en su app automáticamente.

## El QR de la placa también sirve para la vet, la estética o el hotel

Cualquier negocio que tenga enfrente a la mascota, aunque no use PeluDesk, escanea su QR con la cámara del celular y toca **Registrar atención**. Sin cuenta ni app:

1. Escoge si es **Veterinaria**, **Estética** u **Hotel**.
2. La vet anota la **vacuna o desparasitación** (con un toque en la que puso), su **lote**, la **próxima dosis**, el **peso** y una nota; la estética, el **servicio** y la **próxima cita sugerida**; el hotel, las **fechas de la estancia**.
3. Escribe el **nombre y el WhatsApp de su negocio** (el teléfono los recuerda para el siguiente paciente) y **firma con el dedo**.

Le llega al dueño **al momento** en su cartilla (notificación y Avisos), y el recordatorio de la próxima dosis o cita le llega **firmado por ese negocio**, con su WhatsApp para agendar. El negocio solo ve el nombre, la especie, la raza y la cartilla de la mascota: **nada de la familia**.

Reglas: hasta 6 registros por mascota al día y 30 por número al día; el registro lo corrige solo el teléfono que lo hizo y solo las primeras 24 horas; el dueño lo puede **ocultar** desde la ficha de su mascota («Lo que registraron los negocios»), pero no se borra.

A partir de su **tercer paciente registrado**, al negocio se le ofrece abrir su cuenta gratis: comprueba su WhatsApp con un código y entra a la prueba de PeluDesk con esos pacientes y lo que les registró ([[articulo:pacientes-del-qr]]).

## Citas, reservas, contratos y pagos desde la app

Si la mascota tiene expediente contigo, tu cliente hace esto desde su celular y te llega igual que si lo capturaras tú:

- **Pedir cita de estética**: escoge el servicio, el día y una hora libre. Solo salen horas dentro de tu horario, que caben antes del cierre y donde alguien de tu equipo está libre (sin cita encimada ni ausencia aprobada). La cita queda **reservada** en tu agenda con la primera persona libre (estilistas antes que admin, la menos cargada ese día) y con su precio; al dueño le enseña el precio y quién la atiende. Una mascota no puede pedir dos citas el mismo día: eso lo decides tú.
- **Incluir recolección** (al pedir cita o reservar): el dueño usa su dirección guardada o escribe otra, y ve lo que cuesta antes de confirmar. Los km se calculan por esa dirección, por ruta en coche y desde tu local. «¿Usar donde estás ahora?» solo le propone una dirección que él confirma: nunca se cobra por dónde está su celular.
- **Reservar guardería u hotel**: escoge las fechas y ve el **cupo real** por noche (o por día); la reserva pasa por las mismas reglas que en recepción (cupo, requisitos sanitarios, evaluación, celo y traslapes) y queda **reservada** en tu calendario. Si tiene un pase, se usa solo. El total que le dice es el de la cuenta en tu Caja (con sus correcciones de precio, cargos y lo que cubre el pase), nunca un cálculo aparte. Si tu negocio pide contrato de alta de guardería u hotel y le falta, se lo deja **pendiente de firma** y lo **firma ahí mismo** con el dedo.
- **Confirmar en un toque** una cita o estancia reservada que todavía no empieza: pasa a **confirmada** en tu agenda. Mover o cancelar sigue siendo contigo (por WhatsApp).
- **Se entera de lo que haces tú**: cuando alguien de tu equipo **confirma** una cita o estancia (**Confirmar cita** en el detalle de la cita; **Confirmar** en la estancia, dentro de la reserva), la **mueve** (Reprogramar, Mover fechas) o la **cancela**, al dueño le llega en ese momento un aviso en su app («Ludogteka movió la cita de Toby: ahora es el 14/11 a las 10:30») y, si activó los avisos en su celular, la notificación. Lo que hace el dueño desde la app o contestando el WhatsApp no le avisa a él mismo, y en la demo no sale nada.
- **Firmar contratos pendientes** («Contratos»): el mismo contrato y la misma firma del portal; te queda el PDF firmado en su expediente.
- **Pagar lo pendiente** («Por pagar»): ve el saldo de sus cuentas contigo (el mismo de tu Caja) y «Pagar» abre tu link de Mercado Pago (si ya mandaste uno vigente, ese; si no, uno nuevo). Si tu negocio no cobra con link, le dice que pague en el mostrador o por WhatsApp. El pago entra a tu caja como cualquier link.
- **Ver sus pases**: cuántos días o servicios le quedan y hasta cuándo (sin lo que pagó).
- **Opinar** sobre una cita o estancia **finalizada**: estrellas y una línea, una vez por visita. Sus reseñas salen en tu página pública («Lo que dicen sus clientes», con su primer nombre y «verificadas por PeluDesk»), porque solo puede opinar quien sí fue. Las contestas o las escondes en **Reseñas** ([[articulo:resenas-de-tus-clientes]]).

Lo que el dueño no ve nunca: notas internas, quién llenó un reporte, lotes ni folios, ni nada de otros clientes.

## Cerca de mí en el mapa (app para celular)

En la app PeluDesk para Android y iPhone, **Cerca de mí** es un mapa a pantalla completa con la ubicación del dueño y una lista deslizable abajo. Arriba escoge qué buscar: **veterinarias**, **abiertas ahora**, **urgencias 24 h**, **estéticas**, **guarderías**, **hoteles con cupo hoy**, **pet friendly** (parques, restaurantes, cafés y hoteles que aceptan mascotas) y **tiendas**.

- **Tu negocio sale primero y marcado** si usa PeluDesk y tu sucursal tiene ubicación guardada (o tu ficha del directorio está reclamada). Si tienes hotel, dice si **hay cupo esta noche** o si está lleno, con la misma cuenta de tu calendario (sin precios).
- Si la mascota del dueño ya tiene expediente contigo, **Reservar** o **Pedir cita** abre el flujo de la app con tu cupo y tus horas reales. Si todavía no es tu cliente, el botón le abre tu WhatsApp con un mensaje listo.
- Al lado de cada categoría sale el **rango de precios de su ciudad** del Índice de precios de PeluDesk (no tu precio).
- Cada lugar abre su ficha: fotos, horario y opiniones de Google, tus **opiniones verificadas** de PeluDesk, llamar, WhatsApp y cómo llegar. Los negocios del directorio que no usan PeluDesk tienen «¿Es tu negocio? Reclama tu ficha».

## Alertas de animales en la calle

Cualquier persona con la app PeluDesk puede subir una **alerta** de un perro o gato que vio en la calle: **perdido, herido, en peligro o abandonado**, con su foto, una descripción y la ubicación del celular (el pin se ajusta en el mapa).

- Al publicarla se avisa a la gente con la app a **3 km** y, por WhatsApp, a los negocios PeluDesk a 3 km (si tu sucursal tiene ubicación guardada, te llega «Alguien de la app PeluDesk vio … cerca de tu negocio» con el link de la alerta, su foto y cómo llegar).
- Si coincide con una mascota reportada como perdida en la zona (misma especie, a menos de 5 km, perdida en los últimos 60 días), a su dueño le llega **«¿Puede ser …?»**.
- Cada alerta dice cómo está (**sigue ahí, ya no está, rescatado, ya está con su familia**), y cualquiera le agrega novedades con foto o le escribe a quien la subió **por la app, sin ver teléfonos**. **Nunca se muestra quién la subió.**
- Caducan solas a las **72 horas sin novedades**. Hay límite de alertas por persona y se pueden **reportar** como falsas u ofensivas: con tres reportes de personas distintas se esconde y PeluDesk la revisa.`,
  },
  {
    slug: "resenas-de-tus-clientes",
    titulo: "Reseñas: contestarlas y esconderlas",
    resumen: "Lo que opinan tus clientes desde su app después de una visita: las lees, las contestas y escondes las que no deben salir en tu página.",
    grupo: "portal",
    modulo: "portal",
    roles: ["admin", "recepcion"],
    rutas: ["/resenas"],
    palabras: ["reseñas", "opiniones", "estrellas", "contestar reseña", "responder reseña", "esconder reseña", "quitar reseña", "mala reseña", "calificación"],
    cuerpo: `Tus clientes opinan desde la app PeluDesk cuando termina una cita de estética o una estancia: de 1 a 5 estrellas y una línea, una vez por visita. Solo opina quien sí fue, por eso salen en tu página como **verificadas por PeluDesk**.

## Dónde están

En el menú, **Reseñas** (en Clientes). Arriba ves el **promedio** de las que se ven en tu página, cuántas hay y cuántas están **sin respuesta**. Filtra con **Todas**, **Sin respuesta** o **Escondidas**.

## Contestar

1. En la reseña, toca **Contestar** (o **Cambiar respuesta** si ya tiene una).
2. Escribe tu respuesta (hasta 500 caracteres) y toca **Guardar respuesta**.
3. Sale abajo de la reseña en tu página pública y en la app, como «Respuesta del negocio», y al dueño le llega un aviso en su app: «… contestó tu reseña».

Para quitar una respuesta, borra el texto y guarda.

## Esconder

**Esconder de la página** la quita de tu página y de la app (no se borra: queda en el filtro **Escondidas** y se vuelve a enseñar con **Mostrar en la página**). El promedio de tu página cuenta solo las que se ven.

Las estrellas y el texto del dueño no se pueden cambiar: eso es de él.

## Quién puede

El admin siempre. Recepción, solo con el permiso **Responder y esconder reseñas** (en **Permisos**). Necesita el módulo Portal prendido.`,
  },
  {
    slug: "pacientes-del-qr",
    titulo: "Tus pacientes del QR: lo que registraste antes de abrir tu cuenta",
    resumen: "Si registraste vacunas, baños o estancias con el QR de las mascotas antes de usar PeluDesk, entran como tus pacientes al abrir tu cuenta.",
    grupo: "clientes",
    modulo: null,
    roles: ["admin", "recepcion"],
    rutas: ["/clientes"],
    palabras: ["qr", "pacientes del qr", "registrar atención", "placa", "reclamar", "precargado", "sin datos del dueño", "familia", "código por whatsapp"],
    cuerpo: `Si antes de abrir tu cuenta registraste atenciones con el **QR de la placa** de las mascotas (desde su perfil en la app PeluDesk, con **Registrar atención**), al abrir tu cuenta desde ese mismo flujo —comprobando tu WhatsApp con el código— entran a PeluDesk como tus pacientes.

## Dónde quedan

- En [Clientes](/clientes) aparece **Pacientes del QR de PeluDesk**, con el WhatsApp de tu propio negocio. Ahí están todas las mascotas que registraste, con su nombre, especie y raza.
- Lo que le registraste a cada una (la fecha, la vacuna o desparasitación con su próxima dosis, el baño o la estancia, el peso y tu nota) queda en sus **Notas clínicas** si tu negocio tiene Veterinaria; si no, en las **notas internas** de «Pacientes del QR de PeluDesk», una lista por mascota. Esas notas solo las ve tu personal.

## Por qué no vienen los datos de la familia

Con el QR nunca ves los datos del dueño: solo la mascota y su cartilla. Por eso aquí tampoco llegan. Pídeselos a la familia en su próxima visita y dala de alta como cliente; mientras, lo que registres de esa mascota le sigue llegando a su app.

## Si algo no sale

- **No veo a «Pacientes del QR de PeluDesk»**: la cuenta se tuvo que abrir desde la oferta del QR (con el código por WhatsApp desde el número con el que registraste). Si la abriste por otro camino, escríbenos desde [Ayuda](/ayuda).`,
  },
];
