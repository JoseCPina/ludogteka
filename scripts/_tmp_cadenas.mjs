import fs from "node:fs"; import path from "node:path";
const raiz = ["src"];
const archivos = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => { const p = path.join(d, e.name); return e.isDirectory() ? archivos(p) : /\.(tsx?|json|md)$/.test(e.name) ? [p] : []; });
const cuenta = new Map();
for (const f of archivos("src")) {
  const t = fs.readFileSync(f, "utf8");
  for (const m of t.matchAll(/((?:\*\*|\[|«)?[A-ZÁÉÍÓÚÑ¿][^\n→«»*\[\]()]{0,40}?(?:\*\*|\]\([^)]*\)|»)?)\s*→\s*((?:\*\*|\[|«)?[^\n→«»*\[\](),.:;]{1,40}(?:\*\*|\]\([^)]*\)|»)?)/g)) {
    const a = m[1].replace(/\*\*|«|»|\[|\]\([^)]*\)/g, "").trim();
    if (!a) continue;
    cuenta.set(a, (cuenta.get(a) ?? 0) + 1);
  }
}
console.log([...cuenta].sort((x, y) => y[1] - x[1]).slice(0, 90).map(([k, v]) => `${v}×${k}`).join(" | "));
