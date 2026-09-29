// "Tu corte de caja, sin sorpresas" (~22 s). Un mensaje: cobras con
// terminal, la propina va aparte y el corte te dice si cuadró.
import { TOMAS } from "./tomas.mjs";
import { POS, TITULO, escenaGancho, escenaCierre } from "../_serie/comun.mjs";
import { pantalla } from "../../lib/cortos.mjs";

const guion = {
  titulo: "Tu corte de caja, sin sorpresas",
  traslape: 0.5,
  portada: 12,
  tomas: TOMAS,
  escenas: [
    escenaGancho({
      titulo: "la caja no cuadra",
      pregunta: "¿La caja|no te *cuadra*?",
      voz: "¿Cierras el día y la caja no te cuadra?",
      apuntes: [
        { texto: "Corte · sábado", clase: "fecha" },
        { texto: "Efectivo: $ ??" },
        { texto: "Terminal: ¿cuánto?" },
        { texto: "¿La propina va aparte?" },
        { texto: "Faltan $150", clase: "rojo", tachado: true },
      ],
      ilustracion: "clipboard",
    }),
    {
      id: "e2", titulo: "Monitor: cobrar con terminal", duracion: 8.4, acento: "var(--morado)",
      pantalla: "La cuenta de Oreo en la caja: se abre «Cobrar con terminal» y en «Registrar cobro» la propina se escribe en su propio campo, que sale de la pantalla.",
      texto: "«Cobras con terminal.» «La propina, aparte.»",
      voz: { texto: "Cobras la cuenta con terminal, y si te dejan propina, se anota aparte.", desde: 0.6, hasta: 7.1 },
      componer: (c) => {
        const M = c.toma("cobro").marcas;
        return pantalla(c, {
          disp: { tipo: "monitor", toma: "cobro", ...POS.monitor },
          desde: 0.2,
          titulo: { texto: "Cobras con|*terminal*.", ...TITULO.monitor },
          zoom: [
            { marca: "terminal", z: { "16x9": 1.7, "9x16": 1.9 }, t: M["clic-terminal"].t - 0.2 - 0.9 },
            { marca: "propina", z: { "16x9": 2.1, "9x16": 2.4 }, t: M.propina.t - 0.2 - 1.6 },
          ],
          sacar: { marca: "propina", destino: { "16x9": { x: 420, y: 760, s: 1.5, g: -2 }, "9x16": { x: 540, y: 470, s: 1.9, g: -2 } } },
          etiquetas: [{ texto: "La propina, aparte", t: M.propina.t - 0.2 + 0.9, "16x9": { x: 250, y: 880 }, "9x16": { x: 330, y: 610 } }],
        });
      },
    },
    {
      id: "e3", titulo: "Tablet: el corte que cuadra", duracion: 8.4, acento: "var(--menta-oscuro)",
      pantalla: "Turno de caja en la tablet: se abre «Cerrar turno — arqueo» y baja a los turnos cerrados; la tarjeta del último corte, con «Cuadró», sale de la pantalla.",
      texto: "«Y el corte cuadra.»",
      voz: { texto: "Al cerrar, cuentas lo que hay en caja y el corte te dice si cuadró, método por método.", desde: 0.5, hasta: 7.2 },
      componer: (c) => {
        const M = c.toma("turno").marcas;
        return pantalla(c, {
          disp: { tipo: "tablet", toma: "turno", ...POS.tablet },
          desde: 0.3,
          titulo: { texto: "Y el corte|*cuadra*.", ...TITULO.tablet },
          zoom: [{ marca: "arqueo", z: { "16x9": 1.35, "9x16": 1.5 }, t: M["clic-cerrar"].t - 0.3 + 0.2 }, { marca: "vuelve", t: M.turno.t - 0.3 - 1.4, dur: 1.0 }],
          sacar: { marca: "turno", destino: { "16x9": { x: 560, y: 800, s: 1.35, g: -1.5 }, "9x16": { x: 540, y: 470, s: 1.3, g: -1.5 } } },
        });
      },
    },
    escenaCierre({ telefonos: [["celular", "caja"], ["celular", "recepcion"], ["celular", "estetica"]], reversos: [["celular", "hotel"], ["celular", "guarderia"], ["celular", "caja"]] }),
  ],
};

export default guion;
