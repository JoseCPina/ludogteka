// "Un día en tu guardería" (~45 s). El guion: orden, duración, texto en
// pantalla y locución de cada escena. Cambiar una escena de lugar o de
// duración es cambiarla aquí; producir.mjs recalcula los tiempos, los
// subtítulos y el GUION.md.
//
// Voz: tono de la landing (tú, corto, de quien conoce el día a día). Cada
// escena dice en qué segundo empieza y termina su locución (voz.desde /
// voz.hasta, relativos a la escena).
import { TOMAS } from "./tomas.mjs";
import { gancho } from "./gancho.mjs";
import { estetica, cupo, vacuna, caja, cierre } from "./escenas.mjs";

// El monitor con el que termina la escena 1 es el mismo con el que empieza
// la 2: corte invisible de la libreta a la agenda.
const MONITOR = {
  "16x9": { x: 760, y: 170, ancho: 1040 },
  "9x16": { x: 60, y: 620, ancho: 960 },
};
const monitor = (c) => MONITOR[c.vertical ? "9x16" : "16x9"];

const guion = {
  titulo: "Un día en tu guardería",
  traslape: 0.5,
  portada: 44,
  tomas: TOMAS,
  escenas: [
    {
      id: "e1", titulo: "Gancho: la libreta y los chats", duracion: 7.3, acento: "var(--morado)",
      pantalla: "Libreta con apuntes tachados y un teléfono con chats que no paran; se van al fondo y sube el monitor con la agenda limpia.",
      texto: "«Así empiezan muchas mañanas.» → «Y así, con PeluDesk.»",
      // Primero lo que dice la pantalla («Así empiezan muchas mañanas.»), luego
      // lo que se ve en la libreta y los chats.
      voz: { texto: "Así empiezan muchas mañanas: la libreta, veinte chats sin contestar y el cupo apuntado en la cabeza.", desde: 0.3, hasta: 6.85 },
      componer: (c) => gancho(c, { monitorFinal: monitor(c), fotoAgenda: c.imagen("estetica", "inicio") }),
    },
    {
      id: "e2", titulo: "Monitor: agenda de estética", duracion: 8.5, acento: "var(--morado)",
      pantalla: "Estética en vista de semana: la cámara entra a las columnas de cada estilista, sigue al cursor hasta una cita y la abre.",
      texto: "«Una columna por estilista.»",
      voz: { texto: "En estética, cada estilista tiene su columna: ves quién está libre y qué perro sigue.", desde: 0.5, hasta: 7.6 },
      componer: (c) => estetica(c, { monitor: monitor(c) }),
    },
    {
      id: "e3", titulo: "Tablet: el cupo se cuenta solo", duracion: 8.0, acento: "var(--menta-oscuro)",
      pantalla: "Tablero de hotel en la tablet; baja a «Ocupación de la casa» y el renglón de hoy sale de la pantalla con sus barras de día y de noche.",
      texto: "«El cupo se cuenta solo.»",
      voz: { texto: "El cupo de hotel y guardería se cuenta solo, con cada reserva, llegada y salida.", desde: 0.5, hasta: 7.3 },
      componer: (c) => cupo(c),
    },
    {
      id: "e4", titulo: "Teléfono: la vacuna vencida", duracion: 8.0, acento: "var(--coral-oscuro)",
      pantalla: "Recepción busca a Simba en el celular; en su expediente la Bordetella vencida salta fuera del teléfono y la flecha lleva a «No se le puede reservar».",
      texto: "«Te avisa antes de recibirlo.»",
      voz: { texto: "¿A Simba se le venció la vacuna? Te avisa antes de recibirlo, no cuando ya está adentro.", desde: 0.5, hasta: 7.3 },
      componer: (c) => vacuna(c),
    },
    {
      id: "e5", titulo: "Monitor y teléfono: caja y portal", duracion: 10.0, acento: "#8a5400",
      pantalla: "La caja abre la cuenta de Oreo, el saldo flota fuera del monitor, se abre «Cobrar con terminal»; entra el teléfono con el portal de la dueña y sus próximas visitas.",
      texto: "«Cobras con terminal.» → «Y el dueño lo ve en su portal.»",
      voz: { texto: "En la caja cobras con terminal, y el dueño ve en su portal las visitas de su perro.", desde: 0.6, hasta: 9.2 },
      componer: (c) => caja(c),
    },
    {
      id: "e6", titulo: "Cierre: 15 días gratis", duracion: 8.6, acento: "var(--menta)",
      pantalla: "Fondo morado; tres teléfonos llegan y giran cambiando de pantalla; se van al fondo y queda «15 días gratis» con peludesk.mx.",
      texto: "«15 días gratis.» «Sin tarjeta. Si no te sirve, no pagas nada.» peludesk.mx",
      voz: {
        texto: "Los perros ya te dan suficiente trabajo. Prueba PeluDesk quince días gratis en peludesk punto mx.",
        subtitulo: "Los perros ya te dan suficiente trabajo. Prueba PeluDesk 15 días gratis en peludesk.mx",
        desde: 0.6, hasta: 8.1,
      },
      componer: (c) => cierre(c),
    },
  ],
};

export default guion;
