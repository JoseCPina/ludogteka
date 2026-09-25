// Uso: node scripts/diseno/favicons-peludesk.mjs
// Genera los favicons de PeluDesk desde public/marca/peludesk/isotipo.svg
// (la única fuente del dibujo): PNG de 16, 32, 48, 180 (Apple) y 512, y un
// favicon.ico con 16/32/48 adentro.
import fs from "node:fs";
import sharp from "sharp";

const dir = "public/marca/peludesk";
const svg = fs.readFileSync(`${dir}/isotipo.svg`);
const png = (n) => sharp(svg, { density: 72 * Math.max(1, (n / 100) * 4) }).resize(n, n).png().toBuffer();

const tamanos = [16, 32, 48, 180, 512];
const bufs = {};
for (const n of tamanos) {
  bufs[n] = await png(n);
  fs.writeFileSync(`${dir}/favicon-${n}.png`, bufs[n]);
}
// ICO con PNG adentro (válido desde Windows Vista y en todo navegador).
const entradas = [16, 32, 48];
const cabecera = Buffer.alloc(6 + 16 * entradas.length);
cabecera.writeUInt16LE(0, 0);
cabecera.writeUInt16LE(1, 2);
cabecera.writeUInt16LE(entradas.length, 4);
let desplazamiento = cabecera.length;
entradas.forEach((n, i) => {
  const o = 6 + 16 * i;
  cabecera.writeUInt8(n, o);
  cabecera.writeUInt8(n, o + 1);
  cabecera.writeUInt8(0, o + 2);
  cabecera.writeUInt8(0, o + 3);
  cabecera.writeUInt16LE(1, o + 4);
  cabecera.writeUInt16LE(32, o + 6);
  cabecera.writeUInt32LE(bufs[n].length, o + 8);
  cabecera.writeUInt32LE(desplazamiento, o + 12);
  desplazamiento += bufs[n].length;
});
fs.writeFileSync(`${dir}/favicon.ico`, Buffer.concat([cabecera, ...entradas.map((n) => bufs[n])]));
console.log("favicons:", tamanos.map((n) => `${n}px`).join(", "), "+ favicon.ico");
