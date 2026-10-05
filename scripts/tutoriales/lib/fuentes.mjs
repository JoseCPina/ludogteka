// Lo que la plataforma TIENE hoy, leído del código: rutas de pantalla, menú,
// módulos, permisos, artículos de ayuda y avisos de «Necesita atención».
// Es la base del mapa de cobertura (docs/TUTORIALES.md): si algo se agrega a la
// app y no está en un video ni excluido con motivo, `cobertura.mjs` lo dice.
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../..");
const leer = (r) => fs.readFileSync(path.join(RAIZ, r), "utf8");

// Rutas de pantalla del personal y del dueño (sin plataforma, demo, páginas legales).
export function rutasDePantalla() {
  const sal = [];
  const rec = (dir, ruta) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        const nombre = e.name.startsWith("(") ? "" : `/${e.name}`;
        rec(path.join(dir, e.name), ruta + nombre);
      } else if (e.name === "page.tsx") sal.push(ruta || "/");
    }
  };
  rec(path.join(RAIZ, "src/app"), "");
  return sal
    .filter((r) => !/^\/(peludesk|plataforma|demo)(\/|$)/.test(r))
    .sort();
}

export function menuDelPersonal() {
  const fuente = leer("src/lib/nav/config.ts");
  const items = [];
  for (const m of fuente.matchAll(/\{ etiqueta: "([^"]+)", href: "([^"]+)"[^}]*\}/g)) items.push({ etiqueta: m[1], href: m[2] });
  return items;
}

export function permisosCatalogo() {
  const fuente = leer("src/lib/auth/permisos.ts");
  return [...fuente.matchAll(/clave: "([a-z_]+)",\s*etiqueta: "([^"]+)"/g)].map((m) => ({ clave: m[1], etiqueta: m[2] }));
}

export function modulosCatalogo() {
  const fuente = leer("src/lib/plan/modulos.ts");
  const m = fuente.match(/type ClaveModulo =([\s\S]*?);/);
  return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
}

export function articulosDeAyuda() {
  const dir = path.join(RAIZ, "src/lib/ayuda/articulos");
  const sal = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
    const t = fs.readFileSync(path.join(dir, f), "utf8");
    for (const b of t.split(/\n  \{\n    slug: /).slice(1)) {
      const slug = b.match(/^"([^"]+)"/)?.[1];
      const titulo = b.match(/titulo: "([^"]+)"/)?.[1];
      const grupo = b.match(/grupo: "([^"]+)"/)?.[1];
      const rutas = [...(b.match(/rutas: \[([^\]]*)\]/)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((x) => x[1]);
      if (slug) sal.push({ slug, titulo, grupo, rutas, archivo: f });
    }
  }
  return sal;
}

export function avisosNecesitaAtencion() {
  const t = leer("src/app/(staff)/tablero-dia.tsx");
  const claves = new Set();
  for (const m of t.matchAll(/clave: [`"]([a-z-]+?)(?:-\$\{|["`])/g)) claves.add(m[1].replace(/-$/, ""));
  return [...claves].sort();
}
