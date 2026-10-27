// Los videos tutoriales después de un despliegue, en un proceso aparte del despliegue.
//
//   npm run videos:verificar -- --archivo <marcas.json> [--prod] [--sin-compilar]
//   npm run videos:verificar -- --desde <commit> [--hasta <commit>] [--prod]
//
// Existe porque el paso de videos (compilar la app, levantarla y abrir Chromium para comparar contra los masters)
// es lo que más memoria pide, y corriendo dentro de `npm run desplegar` el despliegue entero se cortó por memoria
// dos veces (QA S39, 27 de octubre de 2026) con el código ya fusionado y los videos sin marcar. `npm run desplegar`
// (con `--sin-videos`, como lo corre package.json) guarda la lista de afectados que calculó ANTES de fusionar y, al
// terminar, lanza este script desacoplado; también se corre a mano con la lista guardada o con un rango de commits
// (`--desde 6c59a67 --hasta 1fb5430`: lo que cambió en ese despliegue).
//
// Pasos: (1) sincroniza el catálogo con la tabla `tutoriales`; (2) compila la app del árbol actual (salvo
// --sin-compilar) y verifica por lo que se ve (verificar-visual.mjs): los que se ven igual no se marcan; si el
// verificador no da resultados, se marcan todos los que cambiaron por código; (3) marca «por actualizar».
// Escribe todo en la bitácora que dice al arrancar (carpeta temporal) y sale con 1 si algo quedó pendiente.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const flag = (k) => args.includes(k);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const PROD = flag("--prod");
const node = (script, extra, opciones = {}) => spawnSync(process.execPath, [script, ...extra], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opciones });
const sangria = (t) => String(t || "").trimEnd().split("\n").map((l) => `   ${l}`).join("\n");
const PENDIENTES = [];

// ── Qué videos ──
let videos = [];
if (val("--archivo")) {
  videos = JSON.parse(fs.readFileSync(val("--archivo"), "utf8"));
} else if (val("--desde")) {
  // afectados.mjs compara `--desde` contra HEAD: HEAD tiene que contener lo desplegado (`--hasta`).
  const hasta = val("--hasta");
  if (hasta) {
    const actual = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const destino = spawnSync("git", ["rev-parse", hasta], { encoding: "utf8" }).stdout.trim();
    if (actual !== destino && spawnSync("git", ["merge-base", "--is-ancestor", destino, "HEAD"]).status !== 0) {
      throw new Error(`HEAD no contiene ${hasta}: cámbiate a una rama que lo tenga.`);
    }
  }
  const r = node("scripts/tutoriales/afectados.mjs", [val("--desde"), "--json"]);
  videos = JSON.parse((r.stdout || "[]").trim() || "[]");
} else {
  throw new Error("Falta --archivo <marcas.json> o --desde <commit>");
}
console.log(`Videos con cambios de código: ${videos.map((v) => v.numero).join(", ") || "ninguno"}`);

// ── 1. Catálogo ──
{
  const s = node("scripts/tutoriales/sincronizar.mjs", PROD ? ["--prod"] : []);
  console.log(sangria((s.stdout || "") + (s.stderr || "")));
  if (s.status !== 0) PENDIENTES.push(`node scripts/tutoriales/sincronizar.mjs${PROD ? " --prod" : ""}`);
}

// ── 2. ¿Cambió lo que se ve? ──
if (videos.length) {
  if (!flag("--sin-compilar")) {
    console.log("\nCompilando la app del árbol actual (npm run build)…");
    const b = spawnSync("npm", ["run", "build"], { stdio: ["ignore", "ignore", "inherit"], shell: true });
    if (b.status !== 0) console.log("   npm run build falló: el verificador va a usar lo que haya en .next o no va a poder levantar la app.");
  }
  const candidatos = videos.map((v) => v.numero);
  console.log(`\nVerificación visual de ${candidatos.length} video(s) (${candidatos.join(", ")})…`);
  const vv = node("scripts/tutoriales/verificar-visual.mjs", ["--videos", candidatos.join(","), "--levantar", "--subir", ...(PROD ? ["--prod"] : []), "--json", "-"], { timeout: 60 * 60 * 1000 });
  console.log(sangria((vv.stderr || "").split("\n").slice(-40).join("\n")));
  try {
    const dicho = JSON.parse((vv.stdout || "").trim());
    if (!Array.isArray(dicho) || !dicho.length) throw new Error("sin resultados");
    const por = new Map(dicho.map((d) => [d.numero, d]));
    const antes = videos.length;
    videos = videos.flatMap((v) => {
      const d = por.get(v.numero);
      if (!d) return [v];
      if (d.estado === "igual" || d.estado === "sin_grabar") return [];
      const captura = d.imagen ? ` (captura: ${v.numero}-…/diferencias/${d.imagen.split("/").pop()})` : "";
      return [{ numero: v.numero, motivo: (d.estado === "cambio" ? `se ve distinto: ${d.motivo}` : `no pude compararlo (${d.motivo}); cambió el código: ${v.motivo}`).slice(0, 260) + captura }];
    });
    console.log(`   Se ven igual ${antes - videos.length} de ${antes}: no se marcan.`);
  } catch (e) {
    console.log(`   (la verificación visual no dio resultados: ${e.message}; se marcan todos los que cambiaron por código)`);
    PENDIENTES.push(`node scripts/tutoriales/verificar-visual.mjs --marcados --aplicar${PROD ? " --prod" : ""}   (desmarca los que se ven igual)`);
  }
}

// ── 3. Marcar ──
if (videos.length) {
  const m = node("scripts/tutoriales/marcar.mjs", ["--json", JSON.stringify(videos), ...(PROD ? ["--prod"] : [])]);
  console.log(`\nVideos «por actualizar»: ${videos.map((v) => v.numero).join(", ")}`);
  console.log(sangria((m.stdout || "") + (m.stderr || "")));
  if (m.status !== 0 || /error:/.test(m.stdout || "")) {
    const archivo = path.join(os.tmpdir(), "marcas-videos-pendientes.json");
    fs.writeFileSync(archivo, JSON.stringify(videos));
    PENDIENTES.push(`node scripts/tutoriales/marcar.mjs --archivo ${archivo}${PROD ? " --prod" : ""}`);
  }
} else {
  console.log("\nNingún video que marcar.");
}

if (PENDIENTES.length) {
  console.log("\nPENDIENTE (corre en este orden):");
  for (const c of PENDIENTES) console.log(`  ${c}`);
  process.exit(1);
}
console.log("\nVideos listos.");
