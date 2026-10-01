// "¿Eres dueña o dueño de un negocio canino?" (~42 s). El guion de las tomas de
// IA y la locución vive en scripts/videos/ia/videos/eres-duena-o-dueno/guion.json;
// este archivo lo convierte en el guion de producir.mjs. Las pantallas de la
// app son las grabaciones de "Un día en tu guardería" (`grabaciones`).
// Las tomas de IA son las APROBADAS en el control de calidad (ia/ia.mjs):
// si falta alguna, no se produce.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TOMAS } from "../un-dia-en-tu-guarderia/tomas.mjs";
import { gancho } from "../un-dia-en-tu-guarderia/gancho.mjs";
import { tomasIA, cifra, agendaCorta, vacunaCorta, cajaCorta, cierreCorto } from "./escenas.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const IA = path.resolve(AQUI, "../../ia");
const ia = JSON.parse(fs.readFileSync(path.join(IA, "videos/eres-duena-o-dueno/guion.json"), "utf8"));

const aprobadas = {};
for (const t of Object.keys(ia.tomas)) {
  const m = JSON.parse(fs.readFileSync(path.join(IA, "manifiestos/eres-duena-o-dueno", `${t}.json`), "utf8"));
  // IA_PROVISIONAL=1: para probar la edición mientras se aprueban las tomas (usa el primer clip aprobado). Nunca para publicar.
  if (!m.aprobado && process.env.IA_PROVISIONAL !== "1") throw new Error(`La toma ${t} de IA no está aprobada: corre el control de calidad (scripts/videos/ia/ia.mjs).`);
  aprobadas[t] = m.aprobado ? path.join(IA, m.aprobado) : path.join(IA, "cache/eres-duena-o-dueno/aprobadas/T1.mp4");
}
const esc = Object.fromEntries(ia.escenas.map((e) => [e.id, e]));
const tomasE1 = esc.e1.tomas;
// La toma 4 empieza en la escena 1 y sigue en la 2, desde el segundo exacto en que quedó.
const inicioT4 = tomasE1.slice(0, -1).reduce((s, [, d]) => s + d, 0);
const continuaEn = Math.round((esc.e1.duracion - ia.traslape - inicioT4) * 100) / 100;

const base = (id, titulo, acento, pantalla, texto, componer) => ({ id, titulo, acento, pantalla, texto, duracion: esc[id].duracion, voz: esc[id].voz, componer });

const guion = {
  titulo: ia.titulo,
  traslape: ia.traslape,
  portada: ia.portada,
  grabaciones: "un-dia-en-tu-guarderia",
  musica: ia.musica,
  tomas: TOMAS,
  escenas: [
    base("e1", "Cuatro tomas de IA", "var(--morado)", "Cuatro tomas documentales generadas con IA: la guardería, la estética, el descanso y la dueña sola de noche.", "(sin texto)", (c) => tomasIA(c, { aprobadas, tomas: tomasE1 })),
    base("e2", "La cifra del INEGI", "var(--coral)", "La toma de la dueña sola se oscurece y entra «52 de cada 100» con 100 puntos; 52 se llenan.", "«52 de cada 100 negocios en México cierran antes de cumplir 2 años.» Fuente: INEGI, Demografía de los Negocios 1989-2019.", (c) => cifra(c, { aprobadas, continuaEn })),
    base("e3", "Libreta y chats", "var(--morado)", "La libreta con apuntes tachados y el teléfono con chats que no paran.", "«Libreta y chats, sin control.»", (c) => gancho(c, { soloCaos: true, titulo: "Libreta y chats,|sin *control*." })),
    base("e4", "Agenda", "var(--morado)", "La agenda de estética en el monitor; la cámara entra a las columnas.", "«Tu agenda, sin choques.»", (c) => agendaCorta(c)),
    base("e5", "Vacuna vencida", "var(--coral-oscuro)", "El expediente de Simba: la Bordetella vencida sale del teléfono.", "«Te avisa antes de recibirlo.»", (c) => vacunaCorta(c)),
    base("e6", "Caja", "#8a5400", "La caja en el monitor; el saldo flota fuera de la pantalla.", "«Y la caja, cuadrada.»", (c) => cajaCorta(c)),
    base("e7", "Cierre", "var(--menta)", "Fondo morado con «15 días gratis», sin tarjeta, y peludesk.mx.", "«15 días gratis.» «Sin tarjeta.» peludesk.mx", (c) => cierreCorto(c)),
  ],
};

export default guion;
