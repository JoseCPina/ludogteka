// Lectura de cartillas por foto, contra la IA REAL en producción (la llave de Anthropic solo vive en Vercel).
// Con la dueña de la demo (Patitas & Co., 4420000201): se crea una mascota temporal en su app, se mandan las 10
// cartillas de prueba (scripts/auditoria/lib/cartillas-prueba.mjs) a POST /mascotas/<id>/cartilla/leer y se compara
// lo leído con la verdad de cada una: tiempo, registros encontrados, fechas, próximas dosis, lotes y tipo. Al
// terminar se borra la mascota temporal (y con ella sus fotos y lecturas). Nada más se toca.
//
//   node scripts/auditoria/app-cartillas-prod.mjs [--dir <carpeta de las imágenes>]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { llavesProd, URL_PROD, REF_PROD } from "../lib/prod.mjs";
import { CASOS, calificar, generarCartillas } from "./lib/cartillas-prueba.mjs";

const APP = process.env.APP_URL ?? "https://app.peludesk.mx";
const args = process.argv.slice(2);
const dir = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : path.join(os.tmpdir(), "peludesk-cartillas-prueba");

const S = createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false } });
const { data: demo } = await S.from("negocios").select("id").eq("slug", "patitasyco").single();
const servicioDemo = createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": demo.id } } });
const { data: cliente } = await servicioDemo.from("clientes").select("id").eq("negocio_id", demo.id).eq("telefono", "4420000201").is("deleted_at", null).single();
const { data: m } = await servicioDemo.from("membresias").select("profile_id").eq("negocio_id", demo.id).eq("cliente_id", cliente.id).eq("rol", "cliente").is("deleted_at", null).single();
const duenoId = m.profile_id;

// Sesión de la dueña (enlace mágico canjeado aquí) como cookie del portal en app.peludesk.mx.
const { data: u } = await S.auth.admin.getUserById(duenoId);
const { data: link } = await S.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const cli = createClient(URL_PROD, llavesProd().anon, { auth: { persistSession: false } });
const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (error) throw error;
const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
const trozos = valor.match(/.{1,3180}/g);
const cookie = (trozos.length === 1 ? [[`sb-${REF_PROD}-portal-auth-token`, valor]] : trozos.map((t, i) => [`sb-${REF_PROD}-portal-auth-token.${i}`, t])).map(([k, v]) => `${k}=${v}`).join("; ");

await S.from("duenos").upsert({ id: duenoId, updated_at: new Date().toISOString() }, { onConflict: "id", ignoreDuplicates: true });
const { data: mascota, error: eM } = await S.from("mascotas").insert({ dueno_id: duenoId, nombre: "Prueba de lectura", especie: "perro", origen: "app", created_by: duenoId, updated_at: new Date().toISOString() }).select("id").single();
if (eM) throw new Error(`No se pudo crear la mascota temporal: ${eM.message}`);
console.log(`Mascota temporal ${mascota.id} de la dueña de la demo. Imágenes en ${dir}`);

const imagenes = await generarCartillas(dir);
const resultados = [];
try {
  for (const { id, archivo, caso } of imagenes) {
    const fd = new FormData();
    fd.set("foto", new Blob([fs.readFileSync(archivo)], { type: "image/jpeg" }), path.basename(archivo));
    const inicio = Date.now();
    let j = null, status = 0;
    try {
      const r = await fetch(`${APP}/mascotas/${mascota.id}/cartilla/leer/foto`, { method: "POST", body: fd, headers: { cookie }, signal: AbortSignal.timeout(90_000) });
      status = r.status;
      j = await r.json().catch(() => null);
    } catch (e) {
      j = { error: e instanceof Error ? e.message : String(e) };
    }
    const total = Date.now() - inicio;
    if (!j || j.error || !j.lectura) {
      console.log(`  ✘ cartilla ${id} (${caso.estilo}): ${status} ${j?.error ?? "sin respuesta"} · ${total} ms`);
      resultados.push({ id, estilo: caso.estilo, error: j?.error ?? `HTTP ${status}`, msTotal: total });
      continue;
    }
    const c = calificar(caso, j.lectura);
    resultados.push({ id, estilo: caso.estilo, msIA: j.ms, msTotal: total, ...c, esCartilla: j.lectura.es_cartilla, peso: j.lectura.peso_kg ?? null });
    console.log(`  · cartilla ${id} (${caso.estilo}): IA ${j.ms} ms (total ${total} ms) · registros ${c.encontrados}/${c.esperados}${c.deMas ? ` (+${c.deMas} de más)` : ""} · fechas ${c.fechas}/${c.esperados} · próximas ${c.proximas}/${c.esperados} · lotes ${c.lotes}/${c.lotesEsperados} · tipo ${c.tipos}/${c.esperados}`);
    for (const d of c.detalle) if (!d.leido || !d.okFecha || !d.okProx) console.log(`      ${d.leido ? "~" : "✘"} ${d.esperado} → ${d.leido ?? "no leído"}${d.leido && !d.okFecha ? " (fecha mal)" : ""}${d.leido && !d.okProx ? " (próxima mal)" : ""}`);
  }
} finally {
  await S.from("mascotas").delete().eq("id", mascota.id);
  const { data: restos } = await S.storage.from("app-mascotas").list(`${duenoId}/${mascota.id}/cartilla`);
  if (restos?.length) await S.storage.from("app-mascotas").remove(restos.map((f) => `${duenoId}/${mascota.id}/cartilla/${f.name}`));
}

const ok = resultados.filter((r) => !r.error);
const suma = (k) => ok.reduce((a, r) => a + (r[k] ?? 0), 0);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)} %` : "—");
console.log("\nRESUMEN");
console.log(`  leídas ${ok.length}/${resultados.length} · tiempo de la IA: promedio ${ok.length ? Math.round(suma("msIA") / ok.length) : 0} ms, máximo ${Math.max(0, ...ok.map((r) => r.msIA ?? 0))} ms · de punta a punta promedio ${ok.length ? Math.round(suma("msTotal") / ok.length) : 0} ms`);
console.log(`  registros encontrados ${suma("encontrados")}/${suma("esperados")} (${pct(suma("encontrados"), suma("esperados"))}) · de más ${suma("deMas")}`);
console.log(`  fecha de aplicación exacta ${suma("fechas")}/${suma("esperados")} (${pct(suma("fechas"), suma("esperados"))}) · próxima dosis exacta ${suma("proximas")}/${suma("esperados")} (${pct(suma("proximas"), suma("esperados"))}) · lote exacto ${suma("lotes")}/${suma("lotesEsperados")} (${pct(suma("lotes"), suma("lotesEsperados"))}) · tipo ${suma("tipos")}/${suma("esperados")}`);
fs.writeFileSync(path.join(dir, "resultados.json"), JSON.stringify(resultados, null, 1));
console.log(`  detalle en ${path.join(dir, "resultados.json")}`);
