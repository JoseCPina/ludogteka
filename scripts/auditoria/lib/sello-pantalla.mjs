// Sellos de las auditorías de pantalla (UX, 1 de noviembre de 2026). Las auditorías con navegador necesitan
// `npm run build` + `next start` y no caben dentro de `npm run desplegar` (que no compila en esta máquina): cada una,
// al pasar un rol sin hallazgos, deja aquí la huella del contenido de `src/` con el que corrió, por rol. El despliegue se
// niega a publicar si a alguna de las obligatorias le falta algún rol con ESA misma huella (cualquier cambio en src/
// después las invalida). Por rol, y no por corrida completa, porque la base de desarrollo se estrangula con carga
// sostenida (1 de noviembre de 2026): cada rol se puede correr aparte, con pausa entre uno y otro.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

export const ARCHIVO_SELLOS = path.join(os.tmpdir(), "peludesk-sellos-pantalla.json");
/** Las que `npm run desplegar` exige, con los roles que cada una tiene que haber pasado. */
export const ROLES_OBLIGATORIOS = {
  "celular-390-dev": ["admin", "recepcion", "estetica", "medico"],
  "ux-jerarquia-dev": ["admin", "recepcion", "estetica", "encargada", "medico"],
  "ux-respuesta-dev": ["admin", "recepcion", "estetica", "encargada", "medico"],
};
export const AUDITORIAS_OBLIGATORIAS = Object.keys(ROLES_OBLIGATORIOS);

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

/** La auditoría `nombre` pasó sin hallazgos estos `roles` con el src/ actual. */
export function sellar(nombre, roles, detalle = {}) {
  const huella = huellaSrc();
  const sellos = leer();
  const previo = sellos[nombre]?.huella === huella ? sellos[nombre].roles ?? {} : {};
  const ahora = new Date().toISOString();
  for (const r of roles) previo[r] = ahora;
  sellos[nombre] = { huella, roles: previo, fecha: ahora, ...detalle };
  fs.writeFileSync(ARCHIVO_SELLOS, JSON.stringify(sellos, null, 2));
  console.log(`  · sello de ${nombre} para src/ ${huella}: ${Object.keys(previo).sort().join(", ")}`);
}

/** Las obligatorias a las que les falta algún rol con el src/ actual (vacío = se puede desplegar). */
export function sellosFaltantes(raiz = process.cwd()) {
  const huella = huellaSrc(raiz);
  const sellos = leer();
  const faltan = [];
  for (const [nombre, roles] of Object.entries(ROLES_OBLIGATORIOS)) {
    const s = sellos[nombre];
    const tiene = s?.huella === huella ? Object.keys(s.roles ?? {}) : [];
    const sinRol = roles.filter((r) => !tiene.includes(r));
    if (sinRol.length) faltan.push({ nombre, tiene: s?.huella ?? null, falta: huella, roles: sinRol });
  }
  return faltan;
}
