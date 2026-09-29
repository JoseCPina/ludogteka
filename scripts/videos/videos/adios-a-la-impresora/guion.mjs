// "Adiós a la impresora" (~22 s). Un mensaje: el contrato se firma en línea,
// desde el celular del dueño, y tú sabes cuál falta.
import { TOMAS } from "./tomas.mjs";
import { POS, TITULO, escenaGancho, escenaCierre } from "../_serie/comun.mjs";
import { pantalla } from "../../lib/cortos.mjs";

const guion = {
  titulo: "Adiós a la impresora",
  traslape: 0.5,
  portada: 12,
  tomas: TOMAS,
  escenas: [
    escenaGancho({
      titulo: "imprimir contratos",
      pregunta: "¿Todavía|*imprimes*|contratos?",
      voz: "¿Todavía imprimes cada contrato y esperas a que vengan a firmarlo?",
      duracion: 3.9,
      apuntes: [
        { texto: "Contratos · pendientes", clase: "fecha" },
        { texto: "Rocco: ¿ya firmó?" },
        { texto: "Imprimir 3 copias", tachado: true },
        { texto: "Nube: falta firma" },
        { texto: "Sin tinta", clase: "rojo" },
      ],
      ilustracion: "expediente",
    }),
    {
      id: "e2", titulo: "Monitor: contratos por firmar", duracion: 8.6, acento: "var(--morado)",
      pantalla: "El tablero del día avisa «2 contratos esperan la firma del dueño»; se abre la lista, la antigüedad («Espera la firma desde hace 4 días») sale de la pantalla y el cursor va a «Recordar por WhatsApp».",
      texto: "«Sabes cuál falta.»",
      voz: { texto: "PeluDesk te dice qué contratos faltan y desde cuándo, y se lo recuerdas al dueño por WhatsApp.", desde: 0.6, hasta: 7.3 },
      componer: (c) => {
        const M = c.toma("pendientes").marcas;
        const d = 0.2;
        return pantalla(c, {
          disp: { tipo: "monitor", toma: "pendientes", ...POS.monitor },
          desde: d,
          titulo: { texto: "Sabes cuál|*falta*.", ...TITULO.monitor },
          zoom: [
            { marca: "aviso", z: { "16x9": 1.8, "9x16": 2.2 }, t: 0.9 },
            { marca: "fila", z: { "16x9": 1.45, "9x16": 1.9 }, t: M["clic-aviso"].t - d + 0.25 },
          ],
          sacar: { marca: "espera", destino: { "16x9": { x: 420, y: 760, s: 2.0, g: -3 }, "9x16": { x: 540, y: 470, s: 2.3, g: -3 } }, radio: 999 },
          recuadro: { marca: "whatsapp", t: M.whatsapp.t - d + 0.1, color: "var(--menta-oscuro)" },
        });
      },
    },
    {
      id: "e3", titulo: "Teléfono: firmado desde el portal", duracion: 8.0, acento: "var(--menta-oscuro)",
      pantalla: "El portal de la dueña en su celular: la ficha de Canela baja a «Contratos» y la tarjeta «Contrato de guardería · Firmado» sale de la pantalla.",
      texto: "«Lo firma desde su celular.»",
      voz: { texto: "El dueño lo firma con el dedo desde su celular, y queda guardado en su portal.", desde: 0.5, hasta: 6.8 },
      componer: (c) => {
        const d = 0.3;
        return pantalla(c, {
          disp: { tipo: "telefono", toma: "firmados", ...POS.telefono },
          desde: d,
          titulo: { texto: "Lo firma desde|su *celular*.", ...TITULO.telefono },
          sacar: { marca: "guarderia", destino: { "16x9": { x: 640, y: 700, s: 1.55, g: -2 }, "9x16": { x: 540, y: 380, s: 1.9, g: -2 } } },
        });
      },
    },
    escenaCierre({ id: "e4", telefonos: [["celular", "recepcion"], ["firmados", "inicio"], ["celular", "guarderia"]], reversos: [["celular", "caja"], ["celular", "estetica"], ["celular", "hotel"]] }),
  ],
};

export default guion;
