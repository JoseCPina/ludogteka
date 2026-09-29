// Lo que comparten los siete videos cortos de la serie (15–25 s, un solo
// mensaje): dónde va cada dispositivo, la toma de celulares del cierre y
// las escenas de gancho y cierre. Cada video vive en videos/<nombre>/ con
// su guion.mjs y sus tomas; esta carpeta no es un video.
import { gancho, cierre } from "../../lib/cortos.mjs";

// Dónde queda la PANTALLA de cada dispositivo (esquina y ancho), por formato.
export const POS = {
  monitor: { "16x9": { x: 760, y: 170, ancho: 1040 }, "9x16": { x: 60, y: 640, ancho: 960 } },
  tablet: { "16x9": { x: 760, y: 190, ancho: 1020 }, "9x16": { x: 50, y: 620, ancho: 980 } },
  telefono: { "16x9": { x: 1290, y: 92, ancho: 380 }, "9x16": { x: 305, y: 540, ancho: 470 } },
};

// Título de la escena junto al dispositivo.
export const TITULO = {
  monitor: { "16x9": { x: 110, y: 400, ancho: 600, tam: 84 }, "9x16": { x: 80, y: 250, ancho: 920, tam: 96 } },
  tablet: { "16x9": { x: 110, y: 400, ancho: 600, tam: 84 }, "9x16": { x: 80, y: 250, ancho: 920, tam: 96 } },
  telefono: { "16x9": { x: 110, y: 330, ancho: 1050, tam: 96 }, "9x16": { x: 80, y: 220, ancho: 920, tam: 92 } },
};

// Pantallas de celular para los teléfonos que giran en el cierre.
export const TOMA_CELULAR = {
  rol: "recepcion", ruta: "/recepcion", ancho: 390, alto: 844, escala: 3, puntero: "dedo",
  async pasos(g) {
    await g.foto("recepcion");
    await g.ir("/estetica");
    await g.foto("estetica");
    await g.ir("/caja");
    await g.foto("caja");
    await g.ir("/hotel");
    await g.foto("hotel");
    await g.ir("/guarderia");
    await g.foto("guarderia");
  },
};

export const MUSICA_SERIE = undefined; // la de producir.mjs: la misma en toda la serie

// Escena de gancho: nombra el problema en los primeros 2 s.
export function escenaGancho({ titulo, pregunta, voz, subtitulo, apuntes, ilustracion, duracion = 3.4, acento = "var(--coral-oscuro)" }) {
  return {
    id: "e1", titulo: `Gancho: ${titulo}`, duracion, acento,
    pantalla: `La pregunta en grande y una libreta con apuntes a mano (${apuntes.map((a) => `«${a.texto}»`).join(", ")}).`,
    texto: `«${pregunta.replace(/[|*]/g, (m) => (m === "|" ? " " : ""))}»`,
    voz: { texto: voz, subtitulo, desde: 0.15, hasta: duracion - 0.25 },
    componer: (c) => gancho(c, { pregunta, apuntes, ilustracion }),
  };
}

// Escena de cierre: «15 días gratis» y peludesk.mx.
export function escenaCierre({ id = "e4", telefonos, reversos, voz = "Pruébalo quince días gratis en peludesk punto mx." }) {
  return {
    id, titulo: "Cierre: 15 días gratis", duracion: 5.6, acento: "var(--menta)",
    pantalla: "Fondo morado; tres teléfonos llegan y giran; se van al fondo y queda «15 días gratis» con peludesk.mx.",
    texto: "«15 días gratis.» «Sin tarjeta. Si no te sirve, no pagas nada.» peludesk.mx",
    voz: { texto: voz, subtitulo: voz.replace("quince", "15").replace("peludesk punto mx", "peludesk.mx"), desde: 1.3, hasta: 5.2 },
    componer: (c) => cierre(c, { telefonos, reversos }),
  };
}
