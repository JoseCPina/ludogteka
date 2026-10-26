// Anuncios de los recordatorios automáticos por WhatsApp en la campaña de clic a WhatsApp (oct 2026).
//
//   node scripts/ads/recordatorios.mjs              (= --revisar: SOLO lee y dice qué haría; no escribe nada)
//   node scripts/ads/recordatorios.mjs --aplicar    (sube imágenes, crea creativos y anuncios, cambia textos)
//
// Sobre la campaña «PeluDesk · WhatsApp · Prospección» (CAMPANA abajo) y sus 4 conjuntos, que se buscan por su nombre
// oficial (CONJUNTOS de src/lib/meta-ads/campanas.ts):
//   1. el anuncio «recordatorio» de cada conjunto: imágenes public/peludesk/anuncios/<giro>-recordatorio-<formato>.jpg
//      (las compone scripts/anuncios/creativos.mjs --piezas recordatorio), creativo con especCreativo y anuncio con el
//      mismo nombre que usa la tarea diaria («PeluDesk · <etiqueta> · recordatorio», así la tarea lo adopta y no lo
//      duplica), en el MISMO estado que su conjunto (activo si el conjunto está activo, pausado si no). Si la tarea ya
//      lo creó (en pausa), solo se le pone el estado del conjunto.
//   2. el texto de los anuncios que ya existen: Meta no deja editar el texto de un creativo, así que se crea un
//      creativo nuevo («… · v2», mismas imágenes, título y mensaje de bienvenida; el texto nuevo de textoAnuncio) y se
//      cambia en el anuncio. El anuncio conserva su id, su estado y sus resultados; Meta lo vuelve a revisar.
// NUNCA crea conjuntos (Meta los rechaza por la API; se hacen a mano en Ads Manager). Las llamadas no imprimen el
// token: META_ADS_TOKEN y META_AD_ACCOUNT_ID se leen de .env.local (o del entorno) y no salen de este proceso.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearApiMeta } from "../../src/lib/meta-ads/api.ts";
import { archivoImagen, CONJUNTOS, especCreativo, GIROS, nombreNormalizado, PIEZAS, textoAnuncio } from "../../src/lib/meta-ads/campanas.ts";

const CAMPANA = "120253386148370589";
const PIEZA_NUEVA = "recordatorio";
const SUFIJO_V2 = " · v2";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const APLICAR = process.argv.includes("--aplicar");

function leerEnvLocal() {
  const ruta = path.join(raiz, ".env.local");
  if (!fs.existsSync(ruta)) return {};
  return Object.fromEntries(
    fs.readFileSync(ruta, "utf8").split(/\r?\n/).filter((l) => /^[A-Z0-9_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
  );
}
const envLocal = leerEnvLocal();
const TOKEN = process.env.META_ADS_TOKEN || envLocal.META_ADS_TOKEN;
const CUENTA = process.env.META_AD_ACCOUNT_ID || envLocal.META_AD_ACCOUNT_ID;
if (!TOKEN || !CUENTA) {
  console.error("Faltan META_ADS_TOKEN o META_AD_ACCOUNT_ID (en el entorno o en .env.local).");
  process.exit(1);
}
const api = crearApiMeta({ token: TOKEN, cuenta: CUENTA });
const msg = (e) => (e instanceof Error ? e.message : String(e)).split(TOKEN).join("«token»");
const corto = (t, n = 110) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
};

async function todos(ruta, fields) {
  const filas = [];
  let despues = null;
  for (let i = 0; i < 20; i++) {
    const d = await api.graph("GET", ruta, { fields, limit: "100", ...(despues ? { after: despues } : {}) });
    filas.push(...(d.data ?? []));
    despues = (d.paging?.next && d.paging?.cursors?.after) || null;
    if (!despues) break;
  }
  return filas;
}

const textoDe = (creativo) => creativo?.asset_feed_spec?.bodies?.[0]?.text ?? creativo?.body ?? null;
/** Los hashes de la imagen cuadrada y la vertical de un creativo de la tarea (por su etiqueta). */
function hashesDe(creativo) {
  const imgs = creativo?.asset_feed_spec?.images ?? [];
  const de = (etq) => imgs.find((i) => (i.adlabels ?? []).some((a) => a.name === etq))?.hash ?? null;
  const cuadrada = de("cuadrada");
  const vertical = de("vertical");
  return cuadrada && vertical ? { cuadrada, vertical } : null;
}
/** La pieza de un anuncio por su nombre («PeluDesk · <etiqueta> · <pieza>»), o por el de su creativo. */
function piezaDe(anuncio, giro) {
  const base = `PeluDesk · ${CONJUNTOS[giro].etiqueta} · `;
  for (const n of [anuncio.name, anuncio.creative?.name]) {
    if (!n?.startsWith(base)) continue;
    const resto = n.slice(base.length).replace(SUFIJO_V2, "").trim();
    if (PIEZAS.includes(resto)) return resto;
  }
  return null;
}

const errores = [];
const hecho = [];

// ───────────── leer
console.log(`MODO: ${APLICAR ? "--aplicar (ESCRIBE en Meta)" : "--revisar (solo lectura)"}`);
const campana = await api.graph("GET", CAMPANA, { fields: "id,name,status,effective_status,objective" });
console.log(`\nCAMPAÑA ${campana.id} · «${campana.name}» · ${campana.status} (efectivo ${campana.effective_status}) · ${campana.objective}`);

const conjuntos = (await todos(`${CAMPANA}/adsets`, "id,name,status,effective_status,destination_type")).filter((c) => !["DELETED", "ARCHIVED"].includes(c.effective_status));
const porGiro = new Map();
for (const g of GIROS) {
  const c = conjuntos.find((x) => nombreNormalizado(x.name) === nombreNormalizado(CONJUNTOS[g].nombre));
  if (c) porGiro.set(g, c);
}
const sinGiro = conjuntos.filter((c) => ![...porGiro.values()].includes(c));
console.log(`CONJUNTOS en la campaña: ${conjuntos.length}${sinGiro.length ? ` (sin giro reconocido: ${sinGiro.map((c) => `«${c.name}» ${c.id}`).join(", ")})` : ""}`);

// Creativos de la cuenta por nombre (para no duplicar uno ya creado en una corrida anterior o por la tarea).
const creativosCuenta = await todos(`${api.cuenta}/adcreatives`, "id,name");
const creativoPorNombre = (n) => creativosCuenta.find((c) => c.name === n)?.id ?? null;

const plan = [];
let totalAnuncios = 0;
for (const g of GIROS) {
  const c = porGiro.get(g);
  const deseado = textoAnuncio(g);
  console.log(`\n── ${CONJUNTOS[g].nombre}`);
  if (!c) {
    console.log(`   NO EXISTE en la campaña: no se crea por la API (se hace a mano en Ads Manager). Se salta este giro.`);
    errores.push(`Falta el conjunto «${CONJUNTOS[g].nombre}» en la campaña.`);
    continue;
  }
  console.log(`   conjunto ${c.id} · estado ${c.status} (efectivo ${c.effective_status}) · destino ${c.destination_type ?? "?"}`);
  const anuncios = (await todos(`${c.id}/ads`, "id,name,status,effective_status,creative{id,name,body,asset_feed_spec}")).filter((a) => !["DELETED", "ARCHIVED"].includes(a.effective_status));
  totalAnuncios += anuncios.length;
  console.log(`   texto nuevo: «${corto(deseado, 200)}»`);
  const piezas = new Map();
  for (const a of anuncios) {
    const p = piezaDe(a, g);
    const actual = textoDe(a.creative);
    const alDia = actual === deseado;
    console.log(`   · anuncio ${a.id} «${a.name}» [${p ?? "pieza ?"}] · ${a.status} (efectivo ${a.effective_status})`);
    console.log(`       creativo ${a.creative?.id} «${a.creative?.name ?? ""}» · texto actual: «${corto(actual, 160)}»`);
    if (p) piezas.set(p, a);
    if (!alDia) {
      if (!p) {
        console.log(`       → NO se toca: no se reconoce su pieza por el nombre.`);
        continue;
      }
      if (p !== PIEZA_NUEVA && !hashesDe(a.creative)) {
        console.log(`       → NO se puede rehacer: su creativo no trae las imágenes «cuadrada» y «vertical».`);
        errores.push(`${a.name} (${a.id}): sin imágenes reconocibles en el creativo.`);
        continue;
      }
      console.log(`       → cambiar el texto: creativo nuevo «${especCreativo(g, p, { cuadrada: "x", vertical: "x" }).name}${SUFIJO_V2}» y ponerlo en este anuncio (conserva estado ${a.status}).`);
      plan.push({ tipo: "texto", giro: g, pieza: p, anuncio: a });
    } else {
      console.log(`       → texto al día.`);
    }
  }
  const rec = piezas.get(PIEZA_NUEVA);
  const estadoDeseado = c.status === "ACTIVE" ? "ACTIVE" : "PAUSED";
  if (!rec) {
    const faltan = ["cuadrada", "vertical"].filter((f) => !fs.existsSync(path.join(raiz, "public/peludesk/anuncios", archivoImagen(g, PIEZA_NUEVA, f))));
    if (faltan.length) {
      console.log(`   → FALTA la imagen local ${faltan.map((f) => archivoImagen(g, PIEZA_NUEVA, f)).join(", ")}: corre scripts/anuncios/creativos.mjs --piezas recordatorio.`);
      errores.push(`Faltan imágenes de ${g}.`);
    } else {
      console.log(`   → crear anuncio «PeluDesk · ${CONJUNTOS[g].etiqueta} · ${PIEZA_NUEVA}» en ${estadoDeseado} (igual que su conjunto): subir ${archivoImagen(g, PIEZA_NUEVA, "cuadrada")} y ${archivoImagen(g, PIEZA_NUEVA, "vertical")}, creativo con el texto nuevo.`);
      plan.push({ tipo: "nuevo", giro: g, conjunto: c, estado: estadoDeseado });
    }
  } else if (rec.status !== estadoDeseado) {
    console.log(`   → el anuncio «recordatorio» ya existe (${rec.id}) en ${rec.status}: ponerlo en ${estadoDeseado} como su conjunto.`);
    plan.push({ tipo: "estado", giro: g, anuncio: rec, estado: estadoDeseado });
  }
}

console.log(`\nRESUMEN: ${porGiro.size}/4 conjuntos, ${totalAnuncios} anuncios vivos. Por hacer: ${plan.filter((p) => p.tipo === "nuevo").length} anuncios nuevos, ${plan.filter((p) => p.tipo === "texto").length} textos por cambiar, ${plan.filter((p) => p.tipo === "estado").length} estados por igualar.`);
if (errores.length) console.log(`AVISOS:\n${errores.map((e) => `  - ${e}`).join("\n")}`);

if (!APLICAR) {
  console.log("\nNo se escribió nada. Para hacerlo: node scripts/ads/recordatorios.mjs --aplicar");
  process.exit(0);
}

// ───────────── aplicar
async function subirImagen(giro, formato) {
  const archivo = archivoImagen(giro, PIEZA_NUEVA, formato);
  const bytes = fs.readFileSync(path.join(raiz, "public/peludesk/anuncios", archivo)).toString("base64");
  const d = await api.graph("POST", `${api.cuenta}/adimages`, { bytes, name: archivo });
  const img = Object.values(d.images ?? {})[0];
  if (!img?.hash) throw new Error(`Meta no devolvió el hash de ${archivo}.`);
  return img.hash;
}
async function crearCreativo(espec) {
  const ya = creativoPorNombre(espec.name);
  if (ya) return ya;
  const id = String((await api.graph("POST", `${api.cuenta}/adcreatives`, espec)).id);
  creativosCuenta.push({ id, name: espec.name });
  return id;
}

for (const p of plan) {
  try {
    if (p.tipo === "nuevo") {
      const hashes = { cuadrada: await subirImagen(p.giro, "cuadrada"), vertical: await subirImagen(p.giro, "vertical") };
      const espec = especCreativo(p.giro, PIEZA_NUEVA, hashes);
      const cr = await crearCreativo(espec);
      const nombre = `PeluDesk · ${CONJUNTOS[p.giro].etiqueta} · ${PIEZA_NUEVA}`;
      const ad = await api.graph("POST", `${api.cuenta}/ads`, { name: nombre, adset_id: p.conjunto.id, creative: JSON.stringify({ creative_id: cr }), status: p.estado });
      hecho.push(`anuncio nuevo ${ad.id} «${nombre}» en ${p.estado} (creativo ${cr})`);
    } else if (p.tipo === "texto") {
      const espec = especCreativo(p.giro, p.pieza, hashesDe(p.anuncio.creative));
      espec.name = `${espec.name}${SUFIJO_V2}`;
      const cr = await crearCreativo(espec);
      await api.graph("POST", p.anuncio.id, { creative: JSON.stringify({ creative_id: cr }) });
      hecho.push(`texto nuevo en ${p.anuncio.id} «${p.anuncio.name}» (creativo ${cr}; antes ${p.anuncio.creative?.id})`);
    } else if (p.tipo === "estado") {
      await api.graph("POST", p.anuncio.id, { status: p.estado });
      hecho.push(`${p.anuncio.id} «${p.anuncio.name}» → ${p.estado}`);
    }
  } catch (e) {
    errores.push(`${p.tipo} ${p.giro}${p.anuncio ? ` ${p.anuncio.id}` : ""}: ${msg(e)}`);
  }
}
console.log(`\nHECHO (${hecho.length}):\n${hecho.map((h) => `  - ${h}`).join("\n") || "  (nada)"}`);
if (errores.length) {
  console.log(`ERRORES/AVISOS (${errores.length}):\n${errores.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
