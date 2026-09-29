// "Cada raza, su precio" (~22 s). Un mensaje: el baño se cobra por grupo
// de raza (y aparte si llega maltratado), y cada estilista tiene su agenda.
import { TOMAS } from "./tomas.mjs";
import { POS, TITULO, escenaGancho, escenaCierre } from "../_serie/comun.mjs";
import { pantalla } from "../../lib/cortos.mjs";

const guion = {
  titulo: "Cada raza, su precio",
  traslape: 0.5,
  portada: 11,
  tomas: TOMAS,
  escenas: [
    escenaGancho({
      titulo: "el precio del baño",
      pregunta: "¿Cuánto cobras|por un *husky*?",
      voz: "¿Cuánto cobras por bañar a un husky? ¿Y a un poodle?",
      apuntes: [
        { texto: "Precios · baño", clase: "fecha" },
        { texto: "Poodle: $ ?" },
        { texto: "Husky… ¿$500?" },
        { texto: "Pastor: preguntar", tachado: true },
        { texto: "¿Y si trae nudos?", clase: "rojo" },
      ],
      ilustracion: "escena-bano",
    }),
    {
      id: "e2", titulo: "Monitor: precio por grupo de raza", duracion: 8.4, acento: "var(--morado)",
      pantalla: "Las tarifas del baño estético completo: un precio por grupo de raza y, debajo de cada uno, «Si llega maltratado»; el renglón de poodle sale de la pantalla.",
      texto: "«Un precio por raza.»",
      voz: { texto: "Le pones un precio a cada grupo de raza, y otro por si llega con el pelo maltratado.", desde: 0.6, hasta: 7.1 },
      componer: (c) => {
        const M = c.toma("tarifas").marcas;
        const d = 0.2;
        return pantalla(c, {
          disp: { tipo: "monitor", toma: "tarifas", ...POS.monitor },
          desde: d,
          titulo: { texto: "Un precio|por *raza*.", ...TITULO.monitor },
          zoom: [{ marca: "pomerania", z: { "16x9": 1.7, "9x16": 2.3 }, t: M.poodle.t - d - 0.3 }],
          sacar: { marca: "poodle", t: M.maltratado.t - d + 0.2, destino: { "16x9": { x: 700, y: 780, ancho: 1100, g: -1.5 }, "9x16": { x: 540, y: 440, ancho: 1000, g: -1.5 } } },
        });
      },
    },
    {
      id: "e3", titulo: "Tablet: una columna por estilista", duracion: 7.8, acento: "var(--morado)",
      pantalla: "La agenda de estética de hoy en la tablet, una columna por estilista; el dedo va a una cita.",
      texto: "«Y cada estilista, su agenda.»",
      voz: { texto: "La cita toma el precio de la raza del perro, y cada estilista ve sus citas en su columna.", desde: 0.5, hasta: 6.6 },
      componer: (c) => {
        const M = c.toma("agenda").marcas;
        return pantalla(c, {
          disp: { tipo: "tablet", toma: "agenda", ...POS.tablet },
          desde: 0.2,
          titulo: { texto: "Y cada estilista,|su *agenda*.", ...TITULO.tablet },
          zoom: [{ marca: "cita", z: { "16x9": 1.6, "9x16": 1.9 }, t: M.cita.t - 0.2 - 0.6 }],
          recuadro: { marca: "cita", t: M.cita.t - 0.2 + 0.4 },
        });
      },
    },
    escenaCierre({ telefonos: [["celular", "estetica"], ["celular", "recepcion"], ["celular", "caja"]], reversos: [["celular", "guarderia"], ["celular", "estetica"], ["celular", "hotel"]] }),
  ],
};

export default guion;
