// Sellos de las auditorías de pantalla (UX, 1 de noviembre de 2026). Las auditorías con navegador necesitan
// `npm run build` + `next start` y no caben dentro de `npm run desplegar` (que no compila en esta máquina): cada una,
// al pasar, deja aquí la huella del contenido de `src/` con el que corrió, y el despliegue se niega a publicar si
// alguna de las obligatorias no tiene un sello de ESA misma huella (cualquier cambio en src/ después las invalida).
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const ARCHIVO_SELLOS = path.join(os.tmpdir(), "peludesk-sellos-pantalla.json");
/** Las que `npm run desplegar` exige (QA de UX, 1 de noviembre de 2026). */
export const AUDITORIAS_OBLIGATORIAS = ["celular-390-dev", "ux-jerarquia-dev", "ux-respuesta-dev"];

/** Huella del contenido de src/ (versionado y nuevo sin ignorar), tal como está en disco. */
export function huellaSrc(raiz = process.cwd()) {
  const archivos = execFileSync("git", ["ls-files", "-co", "--exclude-standard", "src"], { cwd: raiz, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean)
    .sort();
  const h = crypto.createHash("sha256");
  for (const a of archivos) {
    const ruta = path.join(raiz, a);
    if (!fs.existsSync(ruta)) continue;
    h.update(a + "\0");
    // CRLF y LF valen lo mismo: el checkout de Windows no invalida el sello.
    h.update(fs.readFileSync(ruta, "utf8").replace(/\r\n/g, "\n"));
  }
  return h.digest("hex").slice(0, 16);
}

function leer() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVO_SELLOS, "utf8"));
  } catch {
    return {};
  }
}

/** La auditoría `nombre` pasó completa (todos sus roles) con el src/ actual. */
export function sellar(nombre, detalle = {}) {
  const sellos = leer();
  sellos[nombre] = { huella: huellaSrc(), fecha: new Date().toISOString(), ...detalle };
  fs.writeFileSync(ARCHIVO_SELLOS, JSON.stringify(sellos, null, 2));
  console.log(`  · sello de ${nombre} para src/ ${sellos[nombre].huella}`);
}

/** Las obligatorias que no tienen sello del src/ actual (vacío = se puede desplegar). */
export function sellosFaltantes(raiz = process.cwd()) {
  const huella = huellaSrc(raiz);
  const sellos = leer();
  return AUDITORIAS_OBLIGATORIAS.filter((n) => sellos[n]?.huella !== huella).map((n) => ({ nombre: n, tiene: sellos[n]?.huella ?? null, falta: huella }));
}
