// Control de calidad de un clip: 12 cuadros a resolución completa, hojas de
// revisión (para MIRARLAS: el veredicto lo da una persona o el agente con los
// ojos, nunca un número) y un segundo pase independiente: tira de cuadros
// consecutivos + SSIM entre vecinos (una caída brusca = morphing).
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export const CUADROS = 12;
const ff = (...a) => execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...a]);
export function duracionDe(archivo) {
  return Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", archivo]).toString().trim());
}

export function revisar(clip, dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const d = duracionDe(clip);
  const tiempos = Array.from({ length: CUADROS }, (_, i) => Math.min(d - 0.15, 0.02 + (i * (d - 0.2)) / (CUADROS - 1)));
  const cuadros = tiempos.map((t, i) => {
    const f = path.join(dir, `cuadro-${String(i + 1).padStart(2, "0")}.png`);
    ff("-ss", t.toFixed(3), "-i", clip, "-frames:v", "1", f);
    return f;
  });
  // Pase 1: hojas de 3 cuadros a ~640 px de ancho cada uno.
  const hojas = [];
  for (let i = 0; i < CUADROS; i += 3) {
    const grupo = cuadros.slice(i, i + 3);
    const h = path.join(dir, `hoja-${i / 3 + 1}.png`);
    ff(...grupo.flatMap((f) => ["-i", f]), "-filter_complex", `${grupo.map((_, k) => `[${k}:v]scale=640:-1[s${k}]`).join(";")};${grupo.map((_, k) => `[s${k}]`).join("")}hstack=inputs=${grupo.length}`, "-frames:v", "1", h);
    hojas.push(h);
  }
  // Pase 2: SSIM entre cuadros vecinos (cada 3 cuadros del clip a 30 fps) y tira de cuadros consecutivos.
  const ssim = path.join(dir, "ssim.txt");
  const stats = ssim.replace(/\\/g, "/").replace(/^([A-Za-z]):/, "$1\\:");
  spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", clip, "-i", clip, "-filter_complex", `[0:v]fps=10,setpts=N/FRAME_RATE/TB[a];[1:v]fps=10,trim=start_frame=1,setpts=N/FRAME_RATE/TB[b];[a][b]ssim=stats_file='${stats}'`, "-f", "null", "-"], { encoding: "utf8" });
  let minimo = null, peor = null;
  if (fs.existsSync(ssim)) {
    const v = fs.readFileSync(ssim, "utf8").split("\n").map((l) => /All:([\d.]+)/.exec(l)?.[1]).filter(Boolean).map(Number);
    if (v.length) { minimo = Math.min(...v); peor = v.indexOf(minimo) + 1; }
  }
  const tira = path.join(dir, "tira-consecutivos.png");
  ff("-i", clip, "-vf", `fps=${(20 / d).toFixed(4)},scale=320:-1,tile=5x4`, "-frames:v", "1", tira);
  return { duracion: d, hojas, tira, ssimMinimo: minimo, ssimPeorPar: peor, dir };
}

/** Hoja de contactos de un clip aprobado (8 cuadros), para la carpeta _revision. */
export function hojaDeContactos(clip, salida) {
  const d = duracionDe(clip);
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  ff("-i", clip, "-vf", `fps=${(8 / d).toFixed(4)},scale=270:-1,tile=8x1`, "-frames:v", "1", "-q:v", "3", salida);
}
