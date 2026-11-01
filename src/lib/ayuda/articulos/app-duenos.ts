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
    palabras: ["app", "app para dueños", "app.peludesk.mx", "mis mascotas", "entrar con whatsapp", "código por whatsapp", "sin contraseña", "avisos", "notificaciones", "instalar", "cerca de mí", "dueño", "cliente no puede entrar"],
    cuerpo: `Además del portal de tu negocio, tus clientes tienen la **app PeluDesk**, gratuita, en **app.peludesk.mx**. Es de la persona, no de un negocio: ahí ve a **todas sus mascotas**, las de tu negocio y las de cualquier otro que use PeluDesk, con la misma cuenta.

## Cómo entra tu cliente

1. Abre **app.peludesk.mx** en su celular y escribe su **número de WhatsApp** (el mismo que tiene en su ficha contigo).
2. La app le enseña un **código** y un botón para mandarlo por WhatsApp a PeluDesk («ENTRAR» y el código).
3. En cuanto lo manda desde su número, la pantalla **entra sola**. Sin contraseña y sin correo.

Si ya tiene contraseña del portal de tu negocio, también le sirve ahí («entrar con contraseña»), pero el código es el camino normal.

> El código se pide y se manda desde el mismo teléfono. Si tu cliente dice que «no entra», revisa que el número de su ficha sea el de su WhatsApp: la app lo reconoce por ese número.

## Qué ve

- **Mis mascotas**: una tarjeta por mascota con su foto, qué es, su edad y en qué negocios la conocen («En Ludogteka»). Las mascotas que registras tú aparecen **solas** en su app, al momento, siempre que la ficha del dueño tenga su número y él haya activado su cuenta (el link de alta o la invitación al portal). Si da de baja una mascota contigo, en su app deja de verse; si falleció, queda en «Siempre con nosotros».
- Desde cada mascota puede **abrir su expediente en tu portal** con la misma cuenta: sus citas, estancias, fotos, contratos y recibos siguen estando en el portal de tu negocio.
- **Avisos**: lo que la app le tiene que decir, y el botón para **activar los avisos en su celular** (notificaciones). En iPhone solo funcionan con la app instalada en la pantalla de inicio.
- **Cerca de mí**: veterinarias, estéticas, guarderías y hoteles cerca de donde está, con la calificación de Google Maps; los negocios que usan PeluDesk salen marcados.
- **Instalar la app**: desde Avisos, para tenerla como app en su celular, con su ícono.

## Qué NO cambia para ti

Tú sigues viendo solo lo tuyo: tus clientes, tus mascotas, tus citas. La app no te pide nada ni te quita nada. Lo que el dueño ve de tu negocio sale de lo que ya capturas en PeluDesk.

## Lo que el dueño puede hacer solo (aunque su mascota no esté contigo)

- **Dar de alta a su mascota** (nombre, especie, sexo, nacimiento y foto) y **leer su cartilla de papel con una foto**: la app saca las vacunas, desparasitaciones, lotes y fechas, él revisa y confirma. También puede **anotar a mano** las fechas que recuerde. Las fotos de la cartilla que ya revisó se guardan por si hay que volver a leerlas; desde su cartilla puede **borrarlas** cuando quiera, y lo que ya está en su cartilla no cambia.
- **Recordatorios**: una semana antes y el mismo día de cada próxima dosis, por notificación en su celular, en Avisos y por WhatsApp (si tiene avisos de WhatsApp prendidos). El recordatorio trae **Pedir cita**: si la mascota tiene expediente contigo, le abre WhatsApp con tu número de la landing y un mensaje listo; si no, las veterinarias cercanas.
- **Cartilla en PDF** para compartirla con cualquier vet.
- **Peso, medicinas (con recordatorio a sus horas) y gastos del mes** por mascota.
- **QR para la placa**: quien lo escanee ve a la mascota y le escribe a la familia sin ver su teléfono (PeluDesk lleva los mensajes; si quien la encontró manda «ENCONTRE» y el código al WhatsApp de PeluDesk, las respuestas del dueño le llegan a su WhatsApp). Los mensajes los ve y los contesta en «Si se pierde» de esa mascota, esté o no marcada como perdida.
- **Mascota perdida**: con un toque se avisa por notificación a los dueños de la app a 5 km y por WhatsApp a los negocios con PeluDesk a 15 km (si tu sucursal tiene ubicación guardada, te llega a ti el mensaje «Se perdió … cerca de …» con el link de su perfil), y se genera un cartel con QR para compartir. «¡Ya apareció!» la cierra.

> Lo que el dueño captura o lee de su cartilla de papel es suyo y no sustituye el carnet que tú firmas en Veterinaria; en la Fase 3 lo que registras tú aparece en su app automáticamente.

## Lo que viene

El QR que una vet sin PeluDesk escanea para registrar una vacuna (Fase 2), y citas, reservas, fotos, contratos y pagos desde la app (Fase 3): docs/app-duenos/PLAN.md.`,
  },
];
