// Prueba del comparador visual (sin base ni servidor): pantallas sintéticas hechas con SVG.
//
//   node scripts/tutoriales/prueba-visual.mjs
//
// Debe decir «igual» cuando cambian solo datos (una fecha, un contador, un nombre, el cursor, la etiqueta del paso,
// compresión) y «cambio» cuando aparece o desaparece algo de diseño (un aviso, una tarjeta, un botón, una
// columna) o todo se corre hacia abajo.
import sharp from "sharp";
import { W, H, grisDe, compararBloques, UMBRALES } from "./lib/visual.mjs";

const lienzo = (cuerpo) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#fdf5ee"/>${cuerpo}</svg>`);
const texto = (x, y, t, tam = 28, peso = 500) => `<text x="${x}" y="${y}" font-family="Arial" font-size="${tam}" font-weight="${peso}" fill="#241f3a">${t}</text>`;
const tarjeta = (x, y, w, h, titulo, valor) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="#fff" stroke="#e5ddd3" stroke-width="2"/>${texto(x + 24, y + 44, titulo, 22)}${texto(x + 24, y + 100, valor, 54, 700)}`;
const menu = [...Array(12)].map((_, i) => texto(40, 160 + i * 64, ["Inicio", "Guardería", "Hotel", "Estética", "Clientes", "Caja", "Contratos", "Inventario", "Reportes", "Empleados", "Gastos", "Ayuda"][i], 26)).join("");

function pantalla({ fecha = "12 oct 2026", cuenta = "8", nombre = "Rocco", aviso = false, empuje = 0, boton = true, tabla = true, tarjetas = 4, cursor = false, etiqueta = false }) {
  let s = menu + texto(420, 120 + empuje, "Hoy en Patitas &amp; Co.", 44, 700) + texto(420, 168 + empuje, `${fecha} · toda la casa en una pantalla.`, 24);
  if (aviso) s += `<rect x="420" y="190" width="1400" height="90" rx="12" fill="#ffe8a8"/>${texto(450, 245, "Aviso nuevo: algo necesita tu atención", 30, 700)}`;
  const y0 = 240 + empuje + (aviso ? 100 : 0);
  for (let i = 0; i < tarjetas; i++) s += tarjeta(420 + i * 350, y0, 320, 160, ["Llegan hoy", "Se van hoy", "Adentro ahora", "Ocupación"][i], i === 0 ? cuenta : String(i + 3));
  s += texto(420, y0 + 260, `Siguiente: ${nombre} llega el ${fecha}`, 30);
  if (tabla) s += `<rect x="420" y="${y0 + 300}" width="1400" height="260" rx="14" fill="#fff" stroke="#e5ddd3" stroke-width="2"/>${[...Array(4)].map((_, i) => texto(450, y0 + 350 + i * 52, `${nombre} ${i + 1} · contrato de hotel · pendiente desde ${fecha}`, 24)).join("")}`;
  if (boton) s += `<rect x="1560" y="70" width="260" height="60" rx="12" fill="#5b3fb5"/>${texto(1600, 110, "Nueva reserva", 26, 700)}`;
  if (cursor) s += `<polygon points="1000,600 1000,628 1008,621 1022,642 1029,638 1016,618 1030,618" fill="#000"/>`;
  if (etiqueta) s += `<rect x="760" y="18" width="400" height="56" rx="28" fill="#3b2f6b"/>${texto(800, 54, "2/5  Escena de ejemplo", 26, 700)}`;
  return lienzo(s);
}
async function grises(opciones, { jpeg = false } = {}) {
  let png = await sharp(pantalla(opciones)).png().toBuffer();
  if (jpeg) png = await sharp(png).resize(1920, 1080).jpeg({ quality: 60 }).toBuffer(); // compresión del video
  return grisDe(png);
}

const base = await grises({});
const casos = [
  ["la misma pantalla con compresión", { jpeg: true }, {}, false],
  ["otra fecha, otro contador y otro nombre", {}, { fecha: "15 oct 2026", cuenta: "10", nombre: "Thor" }, false],
  ["con cursor y etiqueta del paso encima", {}, { cursor: true, etiqueta: true }, false],
  ["aparece un aviso nuevo (todo baja)", {}, { aviso: true }, true],
  ["desaparece un botón", {}, { boton: false }, true],
  ["desaparece la tabla de abajo", {}, { tabla: false }, true],
  ["todo se corre 80 px hacia abajo", {}, { empuje: 80 }, true],
];
let mal = 0;
for (const [nombre, optsBase, opts, esperaCambio] of casos) {
  const otra = await grises(opts, { jpeg: !!optsBase.jpeg });
  const r = compararBloques(base, otra, UMBRALES);
  const bien = r.cambio === esperaCambio;
  if (!bien) mal++;
  console.log(`${bien ? "✔" : "✘"} ${nombre.padEnd(44)} → ${r.cambio ? "cambio" : "igual "}  (mancha ${r.manchaMayor} bloques, ${(r.fraccion * 100).toFixed(1)} % de la pantalla)`);
}
console.log(mal ? `\n${mal} caso(s) mal.` : "\nTodo bien.");
void W; void H;
process.exit(mal ? 1 : 0);
