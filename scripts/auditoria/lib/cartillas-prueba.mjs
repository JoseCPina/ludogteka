// Diez cartillas de prueba (imágenes) con su verdad conocida, para medir la lectura por foto de la app para dueños
// (docs/app-duenos/FASE-1.md). Se dibujan con sharp a partir de SVG: tablas distintas, letra de máquina y «a mano»
// (Segoe Print / Comic Sans donde existan), etiquetas pegadas, sellos, rotación y ruido. SON SINTÉTICAS: miden la
// lectura de tablas y etiquetas legibles, no cartillas reales arrugadas; eso se dice en el reporte.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const dmy = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dmy2 = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/** Cada caso: mascota, estilo y registros (la verdad). */
export const CASOS = [
  { id: 1, mascota: "Canela", especie: "perro", estilo: "maquina", registros: [
    { tipo: "vacuna", nombre: "Séxtuple", fecha_aplicacion: "2026-03-05", proxima_dosis: "2027-03-05", lote: "A2231", laboratorio: "Zoetis" },
    { tipo: "vacuna", nombre: "Antirrábica", fecha_aplicacion: "2026-03-05", proxima_dosis: "2027-03-05", lote: "R-887", laboratorio: "MSD" },
    { tipo: "desparasitacion", nombre: "Drontal Plus", fecha_aplicacion: "2026-08-10", proxima_dosis: "2026-11-10", lote: null, laboratorio: "Bayer" },
  ] },
  { id: 2, mascota: "Pimienta", especie: "gato", estilo: "mano", registros: [
    { tipo: "vacuna", nombre: "Triple felina", fecha_aplicacion: "2026-01-20", proxima_dosis: "2027-01-20", lote: "TF551", laboratorio: null },
    { tipo: "vacuna", nombre: "Antirrábica", fecha_aplicacion: "2026-01-20", proxima_dosis: "2027-01-20", lote: null, laboratorio: null },
  ] },
  { id: 3, mascota: "Rocky", especie: "perro", estilo: "etiquetas", registros: [
    { tipo: "vacuna", nombre: "Nobivac DHPPi", fecha_aplicacion: "2025-11-12", proxima_dosis: "2026-11-12", lote: "A318B01", laboratorio: "MSD" },
    { tipo: "vacuna", nombre: "Nobivac Rabies", fecha_aplicacion: "2025-11-12", proxima_dosis: "2026-11-12", lote: "A552C03", laboratorio: "MSD" },
    { tipo: "vacuna", nombre: "Nobivac KC", fecha_aplicacion: "2026-05-02", proxima_dosis: "2027-05-02", lote: "B119A", laboratorio: "MSD" },
    { tipo: "desparasitacion", nombre: "Bravecto", fecha_aplicacion: "2026-09-01", proxima_dosis: "2026-12-01", lote: null, laboratorio: "MSD" },
  ] },
  { id: 4, mascota: "Luna", especie: "perro", estilo: "maquina-rotada", registros: [
    { tipo: "vacuna", nombre: "Puppy DP", fecha_aplicacion: "2026-06-14", proxima_dosis: "2026-07-05", lote: "P7731", laboratorio: "Vanguard" },
    { tipo: "vacuna", nombre: "Quíntuple", fecha_aplicacion: "2026-07-05", proxima_dosis: "2026-07-26", lote: "Q1120", laboratorio: "Vanguard" },
    { tipo: "vacuna", nombre: "Séxtuple", fecha_aplicacion: "2026-07-26", proxima_dosis: "2027-07-26", lote: "S0097", laboratorio: "Vanguard" },
    { tipo: "desparasitacion", nombre: "Desparasitación interna", fecha_aplicacion: "2026-06-14", proxima_dosis: "2026-07-14", lote: null, laboratorio: null },
  ] },
  { id: 5, mascota: "Milo", especie: "gato", estilo: "mano-dos-digitos", registros: [
    { tipo: "vacuna", nombre: "Leucemia felina", fecha_aplicacion: "2026-02-02", proxima_dosis: "2027-02-02", lote: "L4409", laboratorio: null },
    { tipo: "desparasitacion", nombre: "Desparasitación interna", fecha_aplicacion: "2026-08-15", proxima_dosis: "2026-11-15", lote: null, laboratorio: null },
    { tipo: "desparasitacion", nombre: "Pipeta pulgas", fecha_aplicacion: "2026-10-01", proxima_dosis: "2026-11-01", lote: null, laboratorio: null },
  ] },
  { id: 6, mascota: "Toby", especie: "perro", estilo: "maquina-ruido", registros: [
    { tipo: "vacuna", nombre: "Bordetella", fecha_aplicacion: "2026-04-18", proxima_dosis: "2027-04-18", lote: "BB-204", laboratorio: "Zoetis" },
    { tipo: "vacuna", nombre: "Antirrábica", fecha_aplicacion: "2026-04-18", proxima_dosis: "2027-04-18", lote: "RB-910", laboratorio: "Zoetis" },
  ] },
  { id: 7, mascota: "Nala", especie: "perro", estilo: "etiquetas-mano", registros: [
    { tipo: "vacuna", nombre: "Eurican DAPPi2-L", fecha_aplicacion: "2026-09-09", proxima_dosis: "2027-09-09", lote: "L489122", laboratorio: "Boehringer" },
    { tipo: "desparasitacion", nombre: "NexGard", fecha_aplicacion: "2026-10-09", proxima_dosis: "2026-11-09", lote: null, laboratorio: "Boehringer" },
  ] },
  { id: 8, mascota: "Simba", especie: "gato", estilo: "maquina", registros: [
    { tipo: "vacuna", nombre: "Triple felina", fecha_aplicacion: "2025-12-01", proxima_dosis: "2026-12-01", lote: "FV3-77", laboratorio: "Zoetis" },
    { tipo: "vacuna", nombre: "Antirrábica", fecha_aplicacion: "2025-12-01", proxima_dosis: "2026-12-01", lote: "RAB-21", laboratorio: "Zoetis" },
    { tipo: "desparasitacion", nombre: "Revolution", fecha_aplicacion: "2026-10-05", proxima_dosis: "2026-11-05", lote: null, laboratorio: "Zoetis" },
  ] },
  { id: 9, mascota: "Max", especie: "perro", estilo: "mano", registros: [
    { tipo: "vacuna", nombre: "Séxtuple", fecha_aplicacion: "2026-05-21", proxima_dosis: "2027-05-21", lote: "6X-3301", laboratorio: null },
    { tipo: "desparasitacion", nombre: "Desparasitación interna", fecha_aplicacion: "2026-05-21", proxima_dosis: "2026-08-21", lote: null, laboratorio: null },
    { tipo: "desparasitacion", nombre: "Desparasitación interna", fecha_aplicacion: "2026-08-23", proxima_dosis: "2026-11-23", lote: null, laboratorio: null },
  ] },
  { id: 10, mascota: "Kira", especie: "perro", estilo: "sin-proxima", registros: [
    { tipo: "vacuna", nombre: "Antirrábica", fecha_aplicacion: "2026-10-12", proxima_dosis: null, lote: "R2026-4", laboratorio: "Zoetis" },
    { tipo: "vacuna", nombre: "Séxtuple", fecha_aplicacion: "2026-10-12", proxima_dosis: null, lote: "S2026-9", laboratorio: "Zoetis" },
  ] },
];

const FUENTE_MAQ = "Arial, Helvetica, sans-serif";
const FUENTE_MANO = "'Segoe Print', 'Comic Sans MS', 'Bradley Hand', cursive";

function svgDe(caso) {
  const W = 1240, H = 1600;
  const mano = /mano/.test(caso.estilo);
  const etiquetas = /etiquetas/.test(caso.estilo);
  const dosDigitos = /dos-digitos/.test(caso.estilo);
  const f = (iso) => (iso ? (dosDigitos ? dmy2(iso) : dmy(iso)) : "");
  const fuente = mano ? FUENTE_MANO : FUENTE_MAQ;
  const filas = caso.registros;
  let cuerpo = "";
  const y0 = 420, alto = 110;
  // Encabezado de la cartilla.
  cuerpo += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fbfaf5"/>`;
  cuerpo += `<text x="80" y="110" font-family="${FUENTE_MAQ}" font-size="44" font-weight="700" fill="#1d3a6b">CARTILLA DE VACUNACIÓN</text>`;
  cuerpo += `<text x="80" y="165" font-family="${FUENTE_MAQ}" font-size="26" fill="#444">Clínica Veterinaria San Francisco · Cédula 4433901</text>`;
  cuerpo += `<text x="80" y="240" font-family="${FUENTE_MAQ}" font-size="28" fill="#222">Nombre: <tspan font-family="${FUENTE_MANO}" font-size="34">${esc(caso.mascota)}</tspan>   Especie: <tspan font-family="${FUENTE_MANO}" font-size="34">${caso.especie === "gato" ? "Felino" : "Canino"}</tspan></text>`;
  cuerpo += `<text x="80" y="300" font-family="${FUENTE_MAQ}" font-size="28" fill="#222">Propietario: <tspan font-family="${FUENTE_MANO}" font-size="32">Fam. Luna Arriaga</tspan>   Tel: <tspan font-family="${FUENTE_MANO}" font-size="32">442 000 0201</tspan></text>`;
  // Tabla.
  const cols = [80, 400, 660, 920, 1090];
  const enc = ["Vacuna / producto", "Fecha", "Próxima", "Lote", "Lab."];
  cuerpo += `<rect x="60" y="${y0 - 60}" width="${W - 120}" height="${alto * (filas.length + 1) + 20}" fill="none" stroke="#1d3a6b" stroke-width="3"/>`;
  enc.forEach((h, i) => (cuerpo += `<text x="${cols[i]}" y="${y0 - 15}" font-family="${FUENTE_MAQ}" font-size="26" font-weight="700" fill="#1d3a6b">${esc(h)}</text>`));
  cuerpo += `<line x1="60" y1="${y0 + 5}" x2="${W - 60}" y2="${y0 + 5}" stroke="#1d3a6b" stroke-width="2"/>`;
  filas.forEach((r, i) => {
    const y = y0 + alto * (i + 1) - 30;
    cuerpo += `<line x1="60" y1="${y + 35}" x2="${W - 60}" y2="${y + 35}" stroke="#9aa5b8" stroke-width="1.5"/>`;
    if (etiquetas && r.tipo === "vacuna") {
      // Etiqueta pegada del frasco: fondo de color, nombre comercial, lote y laboratorio impresos; fechas a mano.
      cuerpo += `<rect x="${cols[0] - 8}" y="${y - 52}" width="320" height="76" rx="8" fill="${i % 2 ? "#ffe9c9" : "#d9ecff"}" stroke="#777" transform="rotate(${(i % 3) - 1} ${cols[0]} ${y})"/>`;
      cuerpo += `<text x="${cols[0] + 6}" y="${y - 20}" font-family="${FUENTE_MAQ}" font-size="26" font-weight="700" fill="#111" transform="rotate(${(i % 3) - 1} ${cols[0]} ${y})">${esc(r.nombre)}</text>`;
      cuerpo += `<text x="${cols[0] + 6}" y="${y + 12}" font-family="${FUENTE_MAQ}" font-size="18" fill="#333" transform="rotate(${(i % 3) - 1} ${cols[0]} ${y})">Lote ${esc(r.lote ?? "")} · ${esc(r.laboratorio ?? "")}</text>`;
    } else {
      cuerpo += `<text x="${cols[0]}" y="${y}" font-family="${fuente}" font-size="${mano ? 28 : 26}" fill="#182033">${esc(r.nombre)}</text>`;
      cuerpo += `<text x="${cols[3]}" y="${y}" font-family="${fuente}" font-size="${mano ? 24 : 22}" fill="#182033">${esc(r.lote ?? "")}</text>`;
      cuerpo += `<text x="${cols[4]}" y="${y}" font-family="${fuente}" font-size="${mano ? 22 : 20}" fill="#182033">${esc(r.laboratorio ?? "")}</text>`;
    }
    cuerpo += `<text x="${cols[1]}" y="${y}" font-family="${/etiquetas|mano/.test(caso.estilo) ? FUENTE_MANO : fuente}" font-size="${mano || etiquetas ? 27 : 24}" fill="#1b2a7a">${esc(f(r.fecha_aplicacion))}</text>`;
    cuerpo += `<text x="${cols[2]}" y="${y}" font-family="${/etiquetas|mano/.test(caso.estilo) ? FUENTE_MANO : fuente}" font-size="${mano || etiquetas ? 27 : 24}" fill="#1b2a7a">${esc(f(r.proxima_dosis))}</text>`;
  });
  // Sello y firma (no son registros).
  cuerpo += `<circle cx="980" cy="${H - 260}" r="110" fill="none" stroke="#6b2d9b" stroke-width="4" opacity="0.7"/>`;
  cuerpo += `<text x="980" y="${H - 270}" text-anchor="middle" font-family="${FUENTE_MAQ}" font-size="22" fill="#6b2d9b" opacity="0.8">MVZ R. Hernández</text>`;
  cuerpo += `<text x="980" y="${H - 240}" text-anchor="middle" font-family="${FUENTE_MAQ}" font-size="18" fill="#6b2d9b" opacity="0.8">Céd. Prof. 7781234</text>`;
  cuerpo += `<text x="120" y="${H - 220}" font-family="${FUENTE_MANO}" font-size="40" fill="#1b2a7a">R. Hernández</text>`;
  cuerpo += `<text x="80" y="${H - 120}" font-family="${FUENTE_MAQ}" font-size="20" fill="#666">Peso: <tspan font-family="${FUENTE_MANO}" font-size="28">${caso.especie === "gato" ? "4.2" : "12.5"} kg</tspan></text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${cuerpo}</svg>`;
}

/** Genera los PNG en `dir` y devuelve [{ id, archivo, caso }]. */
export async function generarCartillas(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const salida = [];
  for (const caso of CASOS) {
    const archivo = path.join(dir, `cartilla-${String(caso.id).padStart(2, "0")}.png`);
    let img = sharp(Buffer.from(svgDe(caso))).png();
    if (/rotada/.test(caso.estilo)) img = img.rotate(3, { background: "#fbfaf5" });
    if (/ruido/.test(caso.estilo)) img = img.blur(0.8).modulate({ brightness: 0.92 });
    // Como una foto: JPEG con algo de compresión.
    const buf = await img.jpeg({ quality: /ruido/.test(caso.estilo) ? 62 : 82 }).toBuffer();
    const jpg = archivo.replace(/\.png$/, ".jpg");
    fs.writeFileSync(jpg, buf);
    salida.push({ id: caso.id, archivo: jpg, caso });
  }
  return salida;
}

const norm = (t) => String(t ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/** ¿El nombre leído corresponde al esperado? (contiene las palabras clave del esperado o al revés). */
export function nombreCoincide(leido, esperado) {
  const a = norm(leido), b = norm(esperado);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  const pal = b.split(" ").filter((p) => p.length > 2);
  return pal.length > 0 && pal.every((p) => a.includes(p));
}

/** Compara una lectura con la verdad de un caso: por registro esperado, si se encontró y qué campos coinciden. */
export function calificar(caso, lectura) {
  const leidos = [...(lectura?.registros ?? [])];
  const detalle = [];
  let encontrados = 0, fechas = 0, proximas = 0, lotes = 0, tipos = 0;
  for (const esp of caso.registros) {
    const i = leidos.findIndex((l) => nombreCoincide(l.nombre, esp.nombre) && (l.fecha_aplicacion === esp.fecha_aplicacion || !l.fecha_aplicacion || !esp.fecha_aplicacion || leidos.filter((x) => nombreCoincide(x.nombre, esp.nombre)).length === 1));
    const l = i >= 0 ? leidos.splice(i, 1)[0] : null;
    const okFecha = Boolean(l) && l.fecha_aplicacion === esp.fecha_aplicacion;
    const okProx = Boolean(l) && (l.proxima_dosis ?? null) === (esp.proxima_dosis ?? null);
    const okLote = Boolean(l) && (esp.lote == null ? !l.lote || true : norm(l.lote) === norm(esp.lote));
    const okTipo = Boolean(l) && l.tipo === esp.tipo;
    if (l) encontrados++;
    if (okFecha) fechas++;
    if (okProx) proximas++;
    if (okLote && esp.lote != null) lotes++;
    if (okTipo) tipos++;
    detalle.push({ esperado: esp.nombre, leido: l?.nombre ?? null, okFecha, okProx, okLote: esp.lote == null ? null : okLote, okTipo });
  }
  return { esperados: caso.registros.length, encontrados, deMas: leidos.length, fechas, proximas, lotes, lotesEsperados: caso.registros.filter((r) => r.lote != null).length, tipos, detalle };
}
