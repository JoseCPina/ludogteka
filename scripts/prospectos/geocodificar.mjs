// Pone lat/lng a los prospectos que ya tienen lugar de Google y todavía no tienen ubicación, para el mapa de
// competencia (peludesk.mx/mapa-competencia).
//
//   node scripts/prospectos/geocodificar.mjs [--prod] [--tope 20000] [--paralelo 4]
//
// Pide a Place Details SOLO el campo `location` (SKU Essentials: 10,000 llamadas gratis al mes y después ~5 USD por
// mil); si Google responde 429 (cuota por minuto) el lugar vuelve a la cola y el hilo espera 20 s; la llave sale de GOOGLE_PLACES_API_KEY (entorno o .env.local). En producción la llave de servicio se lee al
// vuelo por el CLI (nunca se imprime). Un lugar que Google ya no tiene queda con ubicado_at y sin coordenadas, para
// no volver a pedirlo.
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const valor = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const prod = args.includes("--prod");
const TOPE = Number(valor("--tope") ?? 20000);
const PARALELO = Number(valor("--paralelo") ?? 4);
const env = fs.existsSync(".env.local") ? Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })) : {};
const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim() || env.GOOGLE_PLACES_API_KEY?.trim();
if (!apiKey) { console.error("Falta GOOGLE_PLACES_API_KEY."); process.exit(1); }
const base = (!prod && process.env.PLACES_API_URL) || "https://places.googleapis.com/v1";

let db;
if (prod) {
  const { servicioSinNegocio } = await import("../lib/prod.mjs");
  db = servicioSinNegocio();
} else {
  if (!env.NEXT_PUBLIC_SUPABASE_URL?.includes("sgfolltpvktbsiisfuzq")) throw new Error("Sin --prod esto solo corre contra DESARROLLO.");
  db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
}

const pendientes = [];
for (let desde = 0; pendientes.length < TOPE; desde += 1000) {
  const { data, error } = await db.from("prospectos").select("id, google_place_id").is("deleted_at", null).not("google_place_id", "is", null).is("ubicado_at", null).order("created_at").order("id").range(desde, desde + 999);
  if (error) throw new Error(error.message);
  pendientes.push(...(data ?? []));
  if ((data ?? []).length < 1000) break;
}
console.log(`${prod ? "PRODUCCIÓN" : "desarrollo"} · ${Math.min(pendientes.length, TOPE)} prospectos por ubicar`);
let hechos = 0, ubicados = 0, sinLugar = 0, errores = 0, pausas = 0, fatal = false;
const cola = pendientes.slice(0, TOPE);
await Promise.all(Array.from({ length: PARALELO }, async () => {
  while (cola.length && !fatal) {
    const p = cola.shift();
    try {
      const r = await fetch(`${base}/places/${encodeURIComponent(p.google_place_id)}`, { headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "location" }, signal: AbortSignal.timeout(15000) });
      if (r.status === 401 || r.status === 403) { fatal = true; console.error(`Google ${r.status}: ${(await r.text()).slice(0, 200)}`); break; }
      if (r.status === 429) {
        // Cuota por minuto de Place Details: el lugar vuelve a la cola y este hilo espera antes de seguir.
        cola.push(p);
        pausas++;
        await new Promise((f) => setTimeout(f, 20000));
        continue;
      }
      if (r.status === 404 || r.status === 400) {
        await db.from("prospectos").update({ ubicado_at: new Date().toISOString() }).eq("id", p.id);
        sinLugar++;
      } else if (r.ok) {
        const j = await r.json();
        const lat = j.location?.latitude, lng = j.location?.longitude;
        await db.from("prospectos").update({ lat: typeof lat === "number" ? lat : null, lng: typeof lng === "number" ? lng : null, ubicado_at: new Date().toISOString() }).eq("id", p.id);
        if (typeof lat === "number") ubicados++; else sinLugar++;
      } else {
        errores++;
      }
    } catch (e) {
      errores++;
      if (errores < 5) console.error("  error:", e.message);
    }
    hechos++;
    if (hechos % 500 === 0) console.log(`  ${hechos}/${Math.min(pendientes.length, TOPE)} · ubicados ${ubicados} · sin lugar ${sinLugar} · errores ${errores} · pausas por cuota ${pausas}`);
  }
}));
console.log(`\nlisto · revisados ${hechos} · ubicados ${ubicados} · sin lugar ${sinLugar} · errores ${errores}${fatal ? " · DETENIDO por la llave" : ""}`);
process.exit(fatal ? 1 : 0);
