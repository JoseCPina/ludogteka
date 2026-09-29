// "Tu cliente ve todo desde su celular" (~22 s). Un mensaje: el dueño
// consulta lo de su perro en su portal, sin ver tus precios.
import { TOMAS } from "./tomas.mjs";
import { POS, TITULO, escenaGancho, escenaCierre } from "../_serie/comun.mjs";
import { pantalla } from "../../lib/cortos.mjs";

// El segundo teléfono va del otro lado en horizontal, con el título a la derecha.
const TEL_IZQ = { "16x9": { x: 250, y: 92, ancho: 380 }, "9x16": POS.telefono["9x16"] };
const TIT_DER = { "16x9": { x: 760, y: 330, ancho: 1050, tam: 96 }, "9x16": TITULO.telefono["9x16"] };

const guion = {
  titulo: "Tu cliente ve todo desde su celular",
  traslape: 0.5,
  portada: 10,
  tomas: TOMAS,
  escenas: [
    escenaGancho({
      titulo: "las mismas preguntas",
      pregunta: "¿«A qué hora|es su *baño*?»",
      voz: "¿Otra vez te preguntan por WhatsApp a qué hora es su baño?",
      apuntes: [
        { texto: "WhatsApp · pendientes", clase: "fecha" },
        { texto: "Fer: ¿a qué hora?" },
        { texto: "Diego: ¿ya comió?" },
        { texto: "Ana: ¿cuándo le toca?" },
        { texto: "Contestar al rato", tachado: true },
      ],
      ilustracion: "chihuahua-feliz",
    }),
    {
      id: "e2", titulo: "Teléfono: el portal del dueño", duracion: 8.2, acento: "var(--morado)",
      pantalla: "El portal de Fernanda en su celular: sus próximas citas y reservas (la lista sale de la pantalla) y después su historial.",
      texto: "«Todo, en su celular.»",
      voz: { texto: "Tu cliente entra desde su celular y ve sus próximas citas, sus reservas y su historial.", desde: 0.5, hasta: 7.0 },
      componer: (c) => {
        const M = c.toma("portal").marcas;
        const d = 0.3;
        return pantalla(c, {
          disp: { tipo: "telefono", toma: "portal", ...POS.telefono },
          desde: d,
          titulo: { texto: "Todo, en su|*celular*.", ...TITULO.telefono },
          sacar: { marca: "proximas", hasta: M.historial.t - d - 0.6, destino: { "16x9": { x: 640, y: 740, s: 1.45, g: -2 }, "9x16": { x: 540, y: 400, s: 1.75, g: -2 } } },
        });
      },
    },
    {
      id: "e3", titulo: "Teléfono: vacunas y contratos, sin precios", duracion: 8.0, acento: "var(--menta-oscuro)",
      pantalla: "La ficha de Canela en el portal: sus vacunas vigentes (salen de la pantalla) y sus contratos firmados. Ningún precio.",
      texto: "«Sin ver tus precios.»",
      voz: { texto: "También sus vacunas y sus contratos. Tus precios y tus otros clientes, nunca.", desde: 0.5, hasta: 6.8 },
      componer: (c) => {
        const M = c.toma("perro").marcas;
        const d = 0.3;
        return pantalla(c, {
          disp: { tipo: "telefono", toma: "perro", ...TEL_IZQ },
          desde: d,
          titulo: { texto: "Sin ver|tus *precios*.", ...TIT_DER },
          sacar: { marca: "salud", hasta: M.contratos.t - d - 0.5, destino: { "16x9": { x: 1260, y: 760, s: 1.5, g: 2 }, "9x16": { x: 540, y: 420, s: 1.8, g: -2 } } },
        });
      },
    },
    escenaCierre({ telefonos: [["portal", "inicio"], ["perro", "inicio"], ["celular", "recepcion"]], reversos: [["celular", "guarderia"], ["celular", "estetica"], ["celular", "hotel"]] }),
  ],
};

export default guion;
