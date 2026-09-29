// "Ese perro no está vacunado" (~22 s). Un mensaje: si una vacuna venció,
// no te deja reservarle guardería ni hotel, y te dice cuál.
import { TOMAS } from "./tomas.mjs";
import { POS, TITULO, escenaGancho, escenaCierre } from "../_serie/comun.mjs";
import { pantalla } from "../../lib/cortos.mjs";

const guion = {
  titulo: "Ese perro no está vacunado",
  traslape: 0.5,
  portada: 11,
  tomas: TOMAS,
  escenas: [
    escenaGancho({
      titulo: "la vacuna vencida",
      pregunta: "¿Y si ya|*venció*|su vacuna?",
      voz: "¿Te enteraste de la vacuna vencida cuando el perro ya estaba adentro?",
      duracion: 3.9,
      apuntes: [
        { texto: "Cartillas · revisar", clase: "fecha" },
        { texto: "Simba: ¿Bordetella?" },
        { texto: "Toby: rabia ¿2025?" },
        { texto: "Pedir foto del carnet", tachado: true },
        { texto: "¿Quién revisó?", clase: "rojo" },
      ],
      ilustracion: "escena-vacunas",
    }),
    {
      id: "e2", titulo: "Monitor: el expediente de Simba", duracion: 9.0, acento: "var(--coral-oscuro)",
      pantalla: "El expediente de Simba en el monitor: la pastilla «Bordetella · Vencida» sale de la pantalla y se marca «No se le puede reservar hasta que esto quede».",
      texto: "«No te deja reservarlo.»",
      voz: { texto: "Si a un perro se le venció una vacuna, no te deja reservarle guardería ni hotel. Y te dice cuál.", desde: 0.6, hasta: 7.7 },
      componer: (c) => {
        const M = c.toma("expediente").marcas;
        const d = 0.2;
        return pantalla(c, {
          disp: { tipo: "monitor", toma: "expediente", ...POS.monitor },
          desde: d,
          titulo: { texto: "No te deja|*reservarlo*.", ...TITULO.monitor },
          zoom: [{ marca: "panel", z: { "16x9": 1.55, "9x16": 2.0 }, t: M.vencida.t - d - 0.9 }],
          sacar: { marca: "vencida", destino: { "16x9": { x: 400, y: 760, s: 2.3, g: -3 }, "9x16": { x: 540, y: 430, s: 2.4, g: -3 } }, radio: 999 },
          recuadro: { marca: "no-se-puede", t: M["no-se-puede"].t - d + 0.2, color: "var(--coral-oscuro)" },
          alFondo: false, // el renglón marcado tiene que leerse
          flecha: { t: M["no-se-puede"].t - d - 0.2, color: "var(--coral-oscuro)", curva: { "16x9": -0.3, "9x16": 0.25 } },
        });
      },
    },
    {
      id: "e3", titulo: "Tablet: las que van a vencer", duracion: 7.6, acento: "var(--menta-oscuro)",
      pantalla: "Reportes en la tablet: baja a «Estado actual» y la tarjeta «Cumplimiento sanitario» (vigentes, por vencer, vencidos) sale de la pantalla.",
      texto: "«Y ves las que van a vencer.»",
      voz: { texto: "Y en reportes ves cuántos perros tienen vacunas por vencer, para avisarles a tiempo.", desde: 0.5, hasta: 6.4 },
      componer: (c) => {
        const d = 0.4;
        return pantalla(c, {
          disp: { tipo: "tablet", toma: "reporte", ...POS.tablet },
          desde: d,
          titulo: { texto: "Y ves las que|van a *vencer*.", ...TITULO.tablet },
          sacar: { marca: "sanitario", destino: { "16x9": { x: 520, y: 760, s: 1.6, g: -2 }, "9x16": { x: 540, y: 430, s: 2.0, g: -2 } } },
        });
      },
    },
    escenaCierre({ telefonos: [["celular", "recepcion"], ["celular", "guarderia"], ["celular", "hotel"]], reversos: [["celular", "estetica"], ["celular", "caja"], ["celular", "recepcion"]] }),
  ],
};

export default guion;
