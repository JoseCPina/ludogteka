// Precios que la gente menciona en las RESEÑAS DE GOOGLE de una muestra de prospectos, para el Índice PeluDesk.
//
//   node --experimental-strip-types scripts/mercado/resenas.mjs [--prod] [--muestra 600] [--municipios 30] [--tope-usd 40]
//
// Toma los 30 municipios con más prospectos y, de cada uno, los prospectos con más reseñas (600 en total, repartidos),
// pide a Place Details SOLO el campo `reviews` (hasta 5 reseñas por lugar; SKU con Atmosphere, ~25 USD por 1,000:
// 600 lugares ≈ 15 USD, tope 40 USD), saca las cantidades en pesos de cada reseña y la IA dice de qué servicio son.
// Las reseñas NO se guardan: solo el precio, el servicio, la ciudad y el fragmento de hasta 200 caracteres.
import { abrirBase, abrirIA, clasificarCandidatos, Corrida, env, insertarPrecios, prod, todas, valor } from "./lib.mjs";
import { candidatosDePrecio } from "../../src/lib/mercado/extraer.ts";

const MUESTRA = Number(valor("--muestra") ?? 600);
const MUNICIPIOS = Number(valor("--municipios") ?? 30);
const TOPE_USD = Number(valor("--tope-usd") ?? 40);
const USD_POR_LLAMADA = 0.025;
const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || env.GOOGLE_PLACES_API_KEY?.trim();
const base = (!prod && process.env.PLACES_API_URL) || "https://places.googleapis.com/v1";
if (!apiKey) {
  console.error("Falta GOOGLE_PLACES_API_KEY.");
  process.exit(1);
}
const giroDeProspecto = (p) => (p.giro === "mixto" ? (p.clasificacion?.servicios?.[0] ?? "hotel") : p.giro);

const db = await abrirBase();
const ia = abrirIA();
const corrida = await new Corrida(db, "resenas_google").empezar();

const vivos = await todas(() => db.from("prospectos").select("id, giro, ciudad, estado, google_place_id, resenas, clasificacion").is("deleted_at", null).is("principal_id", null).not("google_place_id", "is", null).neq("etapa", "descartado").gt("resenas", 4).order("resenas", { ascending: false }).order("id"));
const porCiudad = new Map();
for (const p of vivos) porCiudad.set(p.ciudad, [...(porCiudad.get(p.ciudad) ?? []), p]);
const municipios = [...porCiudad.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, MUNICIPIOS);
const porMunicipio = Math.max(1, Math.floor(MUESTRA / municipios.length));
const muestra = municipios.flatMap(([, ps]) => ps.slice(0, porMunicipio)).slice(0, MUESTRA);
console.log(`${prod ? "PRODUCCIÓN" : "desarrollo"} · ${municipios.length} municipios · muestra de ${muestra.length} prospectos · costo estimado ${(muestra.length * USD_POR_LLAMADA).toFixed(2)} USD (tope ${TOPE_USD})`);
corrida.detalle.notas.push(`municipios: ${municipios.map(([c, ps]) => `${c} (${ps.length})`).join(", ")}`);

const candidatos = [];
try {
  for (const p of muestra) {
    if (corrida.gastoUsd + USD_POR_LLAMADA > TOPE_USD) {
      corrida.detalle.notas.push(`tope de Places alcanzado (${TOPE_USD} USD)`);
      break;
    }
    let j;
    try {
      const r = await fetch(`${base}/places/${encodeURIComponent(p.google_place_id)}?languageCode=es&regionCode=MX`, { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "reviews" }, signal: AbortSignal.timeout(15_000) });
      corrida.gastoUsd += USD_POR_LLAMADA;
      corrida.revisados++;
      if (!r.ok) {
        const t = await r.text().catch(() => "");
        corrida.error(`Places ${r.status}: ${t.slice(0, 120)}`);
        if (r.status === 401 || r.status === 403) break;
        continue;
      }
      j = await r.json();
    } catch (e) {
      corrida.error(`Places: ${e.message}`);
      continue;
    }
    const giro = giroDeProspecto(p);
    (j.reviews ?? []).forEach((rs, i) => {
      const texto = (rs.text?.text ?? rs.originalText?.text ?? "").trim();
      if (!texto) return;
      for (const c of candidatosDePrecio(texto, giro, `${p.id.slice(0, 8)}-${i}`, 5)) candidatos.push({ ...c, giro, prospecto: p });
    });
  }
  console.log(`  ${candidatos.length} cantidades en reseñas por clasificar`);
  const clasificados = await clasificarCandidatos(ia, corrida, candidatos);
  corrida.encontrados = clasificados.length;
  await insertarPrecios(db, corrida, clasificados.map((c) => ({ giro: c.giro, servicio: c.servicio, talla: c.talla, precio: c.precio, ciudad: c.prospecto.ciudad, estado: c.prospecto.estado, fuente: "resenas_google", prospecto_id: c.prospecto.id, detalle: `Reseña de Google: ${c.contexto.slice(0, 170)}`, origen: c.prospecto.id })));
  await corrida.terminar();
} catch (e) {
  await corrida.terminar(e.message);
  process.exit(1);
}
