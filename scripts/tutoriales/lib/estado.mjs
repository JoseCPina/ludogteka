// El estado persistido de cada video de la cola: un JSON local (para reanudar
// aunque se caiga la sesión) y la fila de `tutoriales_progreso` en desarrollo
// (para verlo en /plataforma/tutoriales). Estados: pendiente → guion → voz →
// grabado → render → qc → listo | listo_sin_voz | error.
import fs from "node:fs";
import path from "node:path";
import { rpc } from "./db.mjs";

const AQUI = path.dirname(new URL(import.meta.url).pathname);
export const DIR_SALIDA = path.join(AQUI, "../salida");

export const archivoEstado = (id) => path.join(DIR_SALIDA, id, "estado.json");

export function leerEstado(id) {
  try { return JSON.parse(fs.readFileSync(archivoEstado(id), "utf8")); } catch { return { id, estado: "pendiente", intentos: 0 }; }
}

export async function guardarEstado(c, id, cambios) {
  const e = { ...leerEstado(id), id, ...cambios };
  fs.mkdirSync(path.join(DIR_SALIDA, id), { recursive: true });
  fs.writeFileSync(archivoEstado(id), JSON.stringify(e, null, 2));
  try {
    await rpc(c, "tutoriales_progreso_guardar", {
      p: {
        numero: id, estado: e.estado, intentos: e.intentos ?? 0, fase_error: e.faseError ?? null, error: e.error ?? null, caracteres_voz: e.caracteresVoz ?? 0,
        duracion_s: e.duracion ?? null, tamano_bytes: e.tamano ?? null, hash_guion: e.hash ?? null, qc: e.qc ?? null, iniciado_at: e.iniciadoAt ?? null, terminado_at: e.terminadoAt ?? null,
      },
    });
  } catch (err) {
    console.warn(`  (no pude guardar el progreso en la base: ${err.message})`);
  }
  return e;
}
