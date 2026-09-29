// "Tu página web, gratis" (~23 s). Un mensaje: si en la prueba completas
// tu perfil en la primera semana, la página web te queda gratis de por vida
// (lo decide evaluar_web_gratis(): primeros pasos, logo, 3 fotos, un
// precio, horario y dirección, en los primeros 7 días).
import { TOMAS } from "./tomas.mjs";
import { POS, TITULO, escenaGancho, escenaCierre } from "../_serie/comun.mjs";
import { pantalla } from "../../lib/cortos.mjs";

const guion = {
  titulo: "Tu página web, gratis",
  traslape: 0.5,
  portada: 11,
  tomas: TOMAS,
  escenas: [
    escenaGancho({
      titulo: "sin página web",
      pregunta: "¿Tu negocio|no tiene|*página web*?",
      voz: "¿Tu negocio todavía no tiene página web?",
      apuntes: [
        { texto: "Pendientes", clase: "fecha" },
        { texto: "Hacer página web" },
        { texto: "Cotizar diseñador $$", tachado: true },
        { texto: "Subir precios ¿dónde?" },
        { texto: "Algún día…", clase: "rojo" },
      ],
      ilustracion: "laptop",
    }),
    {
      id: "e2", titulo: "Monitor: completa tu perfil", duracion: 9.2, acento: "var(--morado)",
      pantalla: "«Perfil y página web»: descripción y dirección del negocio; baja a «Fotos del negocio».",
      texto: "«Completa tu perfil en 7 días.»",
      voz: { texto: "En tu prueba, completa tu perfil la primera semana: logo, tres fotos, horario, dirección y un precio.", desde: 0.5, hasta: 8.5 },
      componer: (c) => {
        const M = c.toma("perfil").marcas;
        const d = 0.2;
        return pantalla(c, {
          disp: { tipo: "monitor", toma: "perfil", ...POS.monitor },
          desde: d,
          titulo: { texto: "Completa|tu *perfil*.", ...TITULO.monitor },
          zoom: [{ marca: "direccion", z: { "16x9": 1.6, "9x16": 2.0 }, t: 0.9 }, { marca: "vuelve", t: M.fotos.t - d - 1.6, dur: 1.1 }],
          etiquetas: [{ texto: "En tus primeros 7 días", t: 2.2, "16x9": { x: 110, y: 640 }, "9x16": { x: 250, y: 470 } }],
        });
      },
    },
    {
      id: "e3", titulo: "Teléfono: tu página, gratis", duracion: 8.2, acento: "var(--menta-oscuro)",
      pantalla: "La página del negocio en un celular: portada, servicios con sus precios (el baño estético completo sale de la pantalla) y fotos.",
      texto: "«Tu página, gratis.»",
      voz: { texto: "Y tu página web queda gratis de por vida, con tus servicios, tus precios y tus fotos.", desde: 0.5, hasta: 7.0 },
      componer: (c) => {
        const M = c.toma("pagina").marcas;
        const d = 0.3;
        return pantalla(c, {
          disp: { tipo: "telefono", toma: "pagina", ...POS.telefono, fondoBarra: "#ffffff" },
          desde: d,
          titulo: { texto: "Tu página,|*gratis*.", ...TITULO.telefono },
          sacar: { marca: "bano", hasta: M.fotos.t - d - 0.3, destino: { "16x9": { x: 640, y: 720, s: 1.2, g: -2 }, "9x16": { x: 540, y: 420, s: 1.45, g: -2 } } },
        });
      },
    },
    escenaCierre({ telefonos: [["pagina", "inicio"], ["celular", "recepcion"], ["pagina", "fotos"]], reversos: [["celular", "estetica"], ["celular", "caja"], ["celular", "guarderia"]] }),
  ],
};

export default guion;
