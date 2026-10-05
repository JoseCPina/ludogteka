// Los guiones (scripts/tutoriales/videos/<NN>-<slug>.mjs) y el plan de tiempos.
//
// Un guion declarativo:
//   export default {
//     inicio: "/recepcion",                // pantalla donde empieza
//     gancho: "Locución del gancho…",      // la voz mientras sale la tarjeta de título
//     subtitulo: "Texto bajo el título",   // opcional
//     preparar: async ({ sb, negocioId, tel }) => {},   // opcional: datos previos (invisible)
//     escenas: [
//       { titulo: "Abre Clientes", dice: "Locución…", pasos: [["clic", "Clientes", { nav: true }], ["resaltar", "Capturar a mano"]] },
//     ],
//     resumen: ["Punto 1", "Punto 2", "Punto 3"],
//     resumenDice: "En resumen…",          // opcional (si falta, se arma con los puntos)
//   };
// Los pasos son tuplas: ir, clic, escribir, elegir, marcar, resaltar, zoom,
// mover, desplazar, esperar, tecla, subir, js (ver lib/grabador.mjs).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const AQUI = path.dirname(new URL(import.meta.url).pathname);
export const DIR_VIDEOS = path.join(AQUI, "../videos");

// Español de plática: unas 150 palabras por minuto.
export const PALABRAS_POR_SEG = 2.5;
export const palabras = (t) => String(t ?? "").trim().split(/\s+/).filter(Boolean).length;
export const duracionLocucion = (t) => (t ? palabras(t) / PALABRAS_POR_SEG + 0.5 : 0);

export async function cargarGuion(v) {
  const archivo = path.join(DIR_VIDEOS, `${v.id}-${v.slug}.mjs`);
  if (!fs.existsSync(archivo)) return null;
  const m = await import(`${pathToFileURL(archivo).href}?v=${fs.statSync(archivo).mtimeMs}`);
  return m.default;
}

export function validarGuion(v, g) {
  const errores = [];
  if (!g.inicio?.startsWith("/")) errores.push("falta `inicio` (una ruta)");
  if (!g.gancho) errores.push("falta el `gancho`");
  if (!g.escenas?.length) errores.push("no hay escenas");
  for (const [i, e] of (g.escenas ?? []).entries()) {
    if (!e.titulo) errores.push(`escena ${i + 1}: falta el título`);
    if (!e.dice) errores.push(`escena ${i + 1}: falta la locución`);
    for (const p of e.pasos ?? []) if (!Array.isArray(p) || typeof p[0] !== "string") errores.push(`escena ${i + 1}: un paso no es una tupla`);
  }
  if (!g.resumen?.length) errores.push("falta el resumen");
  return errores;
}

export function textoResumen(g) {
  return g.resumenDice ?? `En resumen. ${g.resumen.map((p) => p.replace(/[.]+$/, "")).join(". ")}.`;
}

export function textoSiguiente(siguiente) {
  return siguiente ? `En el siguiente video: ${siguiente}.` : "Y eso es todo por ahora. Encuentras más videos y artículos en la sección de Ayuda.";
}

// Las locuciones de un video, en orden, con su identificador.
export function locuciones(g, siguiente) {
  return [
    { id: "titulo", texto: g.gancho },
    ...g.escenas.map((e, i) => ({ id: `e${i + 1}`, texto: e.dice })),
    { id: "resumen", texto: textoResumen(g) },
    { id: "cierre", texto: textoSiguiente(siguiente) },
  ];
}

/**
 * Cuánto dura cada tramo. `largos` (segundos de voz por id) viene de la voz
 * real si ya se generó; si no, se estima por palabras.
 */
export function plan(g, siguiente, largos = {}) {
  const l = (id, texto) => largos[id] ?? duracionLocucion(texto);
  return {
    titulo: Math.max(4, l("titulo", g.gancho) + 1.0),
    escenas: g.escenas.map((e, i) => Math.max(3, l(`e${i + 1}`, e.dice) + 0.9)),
    resumen: Math.max(7, l("resumen", textoResumen(g)) + 0.9 + 0.65 * g.resumen.length),
    cierre: Math.max(4, l("cierre", textoSiguiente(siguiente)) + 0.9),
    voz: Object.keys(largos).length > 0,
  };
}

export const total = (p) => p.titulo + 0.6 + p.escenas.reduce((a, b) => a + b, 0) + p.resumen + p.cierre;
