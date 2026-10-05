// Qué videos tutoriales pueden haber quedado desactualizados por un cambio.
//
//   node scripts/tutoriales/afectados.mjs [base]     (base: origin/main por omisión)
//
// Mira los archivos que cambiaron entre `base` y HEAD y los cruza con el
// catálogo: una pantalla (src/app/…/page.tsx o sus componentes) → los videos que
// la enseñan; un artículo de ayuda cambiado → los videos que lo cubren. Es un
// AVISO, no un bloqueo: lo imprime `npm run desplegar` para que quien cambia
// una pantalla sepa qué video hay que volver a grabar
// (`npm run tutoriales -- --video NN --regrabar`). Sale siempre con 0.
import { execFileSync } from "node:child_process";
import { VIDEOS } from "./catalogo.mjs";

const args = process.argv.slice(2);
const JSON_SALIDA = args.includes("--json");
const base = args.find((a) => !a.startsWith("--")) ?? "origin/main";
let archivos = [];
try {
  archivos = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { encoding: "utf8" }).split("\n").filter(Boolean);
} catch {
  if (JSON_SALIDA) console.log("[]"); else console.log("   (no pude comparar contra " + base + ": sin aviso de videos)");
  process.exit(0);
}

// src/app/(staff)/estetica/nueva/agendar-form.tsx → /estetica/nueva ; src/app/alta/[token]/x.tsx → /alta/[token]
function rutaDeArchivo(f) {
  const m = f.match(/^src\/app\/(.+)\/[^/]+\.(tsx|ts)$/);
  if (!m) return null;
  return "/" + m[1].split("/").filter((p) => !p.startsWith("(")).join("/");
}
const coincide = (rutaVideo, rutaArchivo) => rutaArchivo === rutaVideo || rutaArchivo.startsWith(rutaVideo + "/") || rutaVideo.startsWith(rutaArchivo + "/");

const afectados = new Map();
const marcar = (v, motivo) => {
  const a = afectados.get(v.id) ?? { v, motivos: new Set() };
  a.motivos.add(motivo);
  afectados.set(v.id, a);
};
for (const f of archivos) {
  const ruta = rutaDeArchivo(f);
  if (ruta && !ruta.startsWith("/api") && !ruta.startsWith("/plataforma") && !ruta.startsWith("/peludesk")) {
    for (const v of VIDEOS) if (v.rutas.some((r) => coincide(r, ruta))) marcar(v, `cambió ${f}`);
  }
  const art = f.match(/^src\/lib\/ayuda\/articulos\/.+\.ts$/);
  if (art) {
    // Los slugs que tocó el diff de ese archivo.
    let diff = "";
    try { diff = execFileSync("git", ["diff", "-U0", `${base}...HEAD`, "--", f], { encoding: "utf8" }); } catch { /* sin diff */ }
    for (const v of VIDEOS) for (const s of v.articulos) if (diff.includes(`"${s}"`) || diff.includes(s)) marcar(v, `cambió el artículo ${s}`);
  }
  if (/^src\/components\/chrome\//.test(f) || /^src\/lib\/nav\//.test(f)) for (const v of VIDEOS.filter((x) => ["01", "04"].includes(x.id))) marcar(v, `cambió ${f} (menú y estructura)`);
}

// Con --json: solo la lista [{numero, motivo}] para marcarlos «por actualizar»
// (marcar.mjs; lo hace `npm run desplegar` después de publicar).
if (JSON_SALIDA) {
  console.log(JSON.stringify([...afectados.values()].sort((a, b) => a.v.id.localeCompare(b.v.id)).map(({ v, motivos }) => ({ numero: v.id, motivo: [...motivos].slice(0, 3).join("; ") }))));
  process.exit(0);
}
if (!afectados.size) {
  console.log("   Ningún video tutorial parece afectado por estos cambios.");
} else {
  console.log(`   ⚠ ${afectados.size} video(s) tutorial(es) pueden haber quedado desactualizados (aviso, no bloquea):`);
  for (const { v, motivos } of [...afectados.values()].sort((a, b) => a.v.id.localeCompare(b.v.id))) {
    console.log(`     · ${v.id} ${v.titulo} — ${[...motivos].slice(0, 2).join("; ")}`);
  }
  console.log("   Quedan marcados «por actualizar» al desplegar (npm run tutoriales -- --listar los muestra).");
  console.log("   Para volver a grabarlos: npm run tutoriales -- --video <NN> --regrabar");
}
