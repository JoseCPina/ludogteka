// Capturas crudas (PNG 2x de capturas.mjs) → WebP para la landing.
//
//   node scripts/demo/optimizar-capturas.mjs <carpeta-png>
//
//   <nombre>-escritorio.png (2560×1600) → public/peludesk/capturas/<nombre>-escritorio-1600.webp y -800.webp
//   <nombre>-celular.png    (780×1688)  → public/peludesk/capturas/<nombre>-celular.webp
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const [origen] = process.argv.slice(2);
if (!origen) throw new Error("Uso: optimizar-capturas.mjs <carpeta-png>");
const destino = path.join("public", "peludesk", "capturas");
fs.mkdirSync(destino, { recursive: true });

let total = 0;
for (const archivo of fs.readdirSync(origen).filter((f) => f.endsWith(".png")).sort()) {
  const base = archivo.slice(0, -4);
  const entrada = path.join(origen, archivo);
  const salidas = base.endsWith("-escritorio")
    ? [[1600, `${base}-1600.webp`], [800, `${base}-800.webp`]]
    : [[780, `${base}.webp`]];
  for (const [ancho, nombre] of salidas) {
    const out = path.join(destino, nombre);
    await sharp(entrada).resize({ width: ancho, withoutEnlargement: true }).webp({ quality: 80, effort: 6, smartSubsample: true }).toFile(out);
    const kb = Math.round(fs.statSync(out).size / 1024);
    total += kb;
    console.log(`${nombre}  ${kb} KB`);
  }
}
console.log(`total ${total} KB`);
