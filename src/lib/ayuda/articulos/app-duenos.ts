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

## Lo que viene

La cartilla de vacunas a partir de la foto de la cartilla de papel, los recordatorios de cada dosis, el QR para la placa y el aviso de mascota perdida se agregan en las siguientes fases (docs/app-duenos/PLAN.md).`,
  },
];
