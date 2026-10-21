// Campaña de clic a WhatsApp de PeluDesk (desarrollo, sin red a Meta).
//   node --experimental-strip-types scripts/auditoria/meta-campanas-dev.mjs
// Levanta un doble de la Graph API en el 4464 (audiencias, similares, campañas, conjuntos, imágenes, creativos,
// anuncios, estado e insights) y un servidor de imágenes con public/peludesk/anuncios, y corre el motor de verdad
// (src/lib/meta-ads/campanas.ts) contra la base de desarrollo con la llave de servicio:
//   1. similares: se crean de su lista (1 %, 1 % y 2 %, México) y un similar que ya existe con el mismo nombre se
//      adopta (no se duplica);
//   2. campaña de Interacción (OUTCOME_ENGAGEMENT) y 4 conjuntos a 100 MXN al día, optimizados a conversaciones de
//      WhatsApp, México, 25–60, con sus audiencias (lista + similar; hotel con intereses) y las exclusiones (pagando,
//      en prueba y bajas) en TODOS; 12 anuncios (agenda, cobro, portal); TODO en PAUSADO;
//   3. cada creativo: imagen cuadrada y vertical por ubicación, el texto del giro con «Prueba gratis, sin tarjeta.»,
//      botón de WhatsApp y el mensaje prellenado del giro;
//   4. segunda corrida: no crea nada nuevo; lee estado e insights (gasto, conversaciones y costo por conversación);
//   5. un error (página sin WhatsApp) queda en la fila y la siguiente corrida lo reintenta;
//   6. retargeting: no se activa con menos de 100; con 100 o más se activa UNA vez (conjunto y anuncios);
//   7. acceso: anon y el admin de un negocio no leen meta_campanas.
// Al terminar deja meta_campanas vacía y las audiencias de desarrollo sin ids de Meta.
import { limpiarAlTerminar } from "../lib/limpieza-dev.mjs";
limpiarAlTerminar({ bitacoras: ["meta_campanas"] }); // al terminar (también si falla) borra lo que esta corrida creó
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL as SUPA, env, tokenDe } from "./sesiones-dev.mjs";
import { crearApiMeta } from "../../src/lib/meta-ads/api.ts";
import { asegurarCampanas, leerInsights } from "../../src/lib/meta-ads/campanas.ts";

if (!SUPA.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const ok = (c, si, no = si) => { if (c) console.log(`  ✔ ${si}`); else { hallazgos.push(no); console.log(`  ✘ ${no}`); } };
const seccion = (t) => console.log(`\n── ${t}`);
const TOKEN = "token-de-prueba-campanas";
const IMAGENES = path.resolve("public/peludesk/anuncios");

// ── Doble de la Graph API ───────────────────────────────────────────────────────────────────────────────────────
const objetos = new Map(); // id → { tipo, ...params }
const llamadas = [];
const modo = { sinWhatsApp: false };
let siguiente = 1;
const nuevoId = () => `7700${siguiente++}`;
const doble = http.createServer(async (req, res) => {
  const u = new globalThis.URL(req.url, "http://x");
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const json = (st, o) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (u.pathname.startsWith("/img/")) {
    const f = path.join(IMAGENES, path.basename(u.pathname));
    if (!fs.existsSync(f)) return json(404, {});
    res.writeHead(200, { "content-type": "image/jpeg" });
    return res.end(fs.readFileSync(f));
  }
  const p = new URLSearchParams(req.method === "GET" ? u.search : cuerpo);
  const ruta = u.pathname.replace(/^\/v[0-9.]+\//, "");
  llamadas.push({ metodo: req.method, ruta, params: Object.fromEntries([...p].filter(([k]) => k !== "bytes")) });
  if (p.get("access_token") !== TOKEN) return json(400, { error: { message: "Invalid OAuth access token.", code: 190 } });
  const borde = ruta.match(/^act_[0-9]+\/(customaudiences|campaigns|adsets|adcreatives|ads|adimages)$/)?.[1];
  if (borde && req.method === "GET") {
    const tipo = { customaudiences: "audiencia", campaigns: "campana", adsets: "conjunto", adcreatives: "creativo", ads: "anuncio" }[borde];
    return json(200, { data: [...objetos].filter(([, o]) => o.tipo === tipo).map(([id, o]) => ({ id, name: o.name })) });
  }
  if (borde && req.method === "POST") {
    if (borde === "adimages") {
      if (!p.get("bytes")) return json(400, { error: { message: "falta bytes", code: 100 } });
      const hash = `hash${siguiente++}`;
      return json(200, { images: { bytes: { hash, url: `https://x/${hash}.jpg` } } });
    }
    if (borde === "adsets" && modo.sinWhatsApp) {
      return json(400, { error: { message: "Invalid parameter", code: 100, error_subcode: 2446886, error_user_title: "Número de WhatsApp no conectado", error_user_msg: "Conecta un número de WhatsApp a tu página." } });
    }
    const id = nuevoId();
    const tipo = { customaudiences: "audiencia", campaigns: "campana", adsets: "conjunto", adcreatives: "creativo", ads: "anuncio" }[borde];
    objetos.set(id, { tipo, ...Object.fromEntries(p), effective_status: p.get("status") ?? "ACTIVE" });
    return json(200, { id });
  }
  const ins = ruta.match(/^([0-9]+)\/insights$/);
  if (ins) return json(200, { data: [{ spend: "123.45", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "5" }], cost_per_action_type: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "24.69" }] }] });
  const g = ruta.match(/^([0-9]+)$/);
  if (g && objetos.has(g[1])) {
    const o = objetos.get(g[1]);
    if (req.method === "POST") {
      if (p.get("status")) o.effective_status = p.get("status");
      return json(200, { success: true });
    }
    if (o.tipo === "audiencia") return json(200, { id: g[1], name: o.name, approximate_count_lower_bound: 1000, approximate_count_upper_bound: 1200, operation_status: { code: 200 }, delivery_status: { code: 200 } });
    return json(200, { id: g[1], effective_status: o.effective_status, daily_budget: o.daily_budget });
  }
  json(404, { error: { message: "no existe", code: 803 } });
});
await new Promise((r) => doble.listen(4464, "127.0.0.1", r));
const api = crearApiMeta({ token: TOKEN, cuenta: "1234567890", url: "http://127.0.0.1:4464" });
const correr = () => asegurarCampanas({ db: A, api, urlImagenes: "http://127.0.0.1:4464/img" });
const de = (tipo) => [...objetos].filter(([, o]) => o.tipo === tipo);
const postsA = (borde) => llamadas.filter((l) => l.metodo === "POST" && l.ruta.endsWith(`/${borde}`));

async function limpiar() {
  await A.from("meta_campanas").delete().neq("clave", "");
  await A.from("meta_audiencias").update({ audience_id: null, coincidencias_min: null, coincidencias_max: null, estado_meta: null, ultima_sync_at: null, ultimo_error: null, miembros: 0 }).neq("clave", "");
}

try {
  await limpiar();
  // Las listas ya existen en Meta (las crea la sincronización); un similar ya estaba creado a mano con su nombre.
  const listas = ["prospectos", "veterinarias", "esteticas", "hotel_guarderia", "visitaron", "en_prueba", "pagando", "bajas"];
  const idLista = {};
  for (const clave of listas) {
    const id = nuevoId();
    objetos.set(id, { tipo: "audiencia", name: `Lista ${clave}` });
    idLista[clave] = id;
    await A.from("meta_audiencias").update({ audience_id: id, miembros: clave === "visitaron" ? 40 : 500, coincidencias_min: 1000 }).eq("clave", clave);
  }
  const yaExiste = nuevoId();
  objetos.set(yaExiste, { tipo: "audiencia", name: "PeluDesk · Similar 1 % Veterinarias" });

  seccion("1. Similares, campaña, conjuntos y anuncios (página sin WhatsApp primero)");
  modo.sinWhatsApp = true;
  const r0 = await correr();
  ok(r0.errores.some((e) => e.includes("Conecta un número de WhatsApp")), "sin el número de WhatsApp en la página, el conjunto queda con el texto de Meta");
  const { data: errConj } = await A.from("meta_campanas").select("estado, ultimo_error").eq("clave", "conjunto:veterinarias").single();
  ok(errConj.estado === "error" && errConj.ultimo_error.includes("WhatsApp"), "y la fila del conjunto guarda el error (se ve en la pantalla)");
  modo.sinWhatsApp = false;

  const similares = postsA("customaudiences").map((l) => l.params);
  ok(similares.length === 2 && similares.every((s) => s.subtype === "LOOKALIKE"), `se crean 2 similares (el de Veterinarias ya existía y se adopta) (${similares.length})`);
  const spec = (n) => JSON.parse(similares.find((s) => s.name === n)?.lookalike_spec ?? "{}");
  ok(spec("PeluDesk · Similar 1 % Estéticas").ratio === 0.01 && spec("PeluDesk · Similar 2 % Prospectos").ratio === 0.02 && spec("PeluDesk · Similar 2 % Prospectos").country === "MX", "Estéticas 1 % y Prospectos 2 %, en México");
  ok(similares.find((s) => s.name === "PeluDesk · Similar 2 % Prospectos")?.origin_audience_id === idLista.prospectos, "cada similar sale de su lista");
  const { data: simVet } = await A.from("meta_audiencias").select("audience_id, coincidencias_min").eq("clave", "similar_veterinarias").single();
  ok(simVet.audience_id === yaExiste && simVet.coincidencias_min === 1000, "el similar que ya existía queda ligado con su tamaño");

  seccion("2. Reintento: la siguiente corrida crea los conjuntos");
  const r1 = await correr();
  ok(r1.errores.length === 0, `sin errores (${r1.errores.join(" · ")})`);
  const camp = postsA("campaigns");
  ok(camp.length === 1 && camp[0].params.objective === "OUTCOME_ENGAGEMENT" && camp[0].params.status === "PAUSED" && camp[0].params.name === "PeluDesk · WhatsApp · Prospección", "una campaña de Interacción, en PAUSADO, con su nombre");
  const conj = postsA("adsets").map((l) => l.params);
  ok(conj.length === 8, `4 intentos fallidos sin WhatsApp y 4 conjuntos creados al reintentar (${conj.length})`);
  const conjCreados = de("conjunto").map(([, o]) => o);
  ok(conjCreados.length === 4 && conjCreados.every((c) => c.status === "PAUSED" && c.daily_budget === "10000" && c.optimization_goal === "CONVERSATIONS" && c.destination_type === "WHATSAPP"), "4 conjuntos en PAUSADO, 100 MXN al día, conversaciones de WhatsApp");
  const tg = (n) => JSON.parse(conjCreados.find((c) => c.name === n)?.targeting ?? "{}");
  const ids = (l) => (l ?? []).map((x) => x.id).sort();
  const excl = [idLista.pagando, idLista.en_prueba, idLista.bajas].sort();
  ok(conjCreados.every((c) => JSON.stringify(ids(JSON.parse(c.targeting).excluded_custom_audiences)) === JSON.stringify(excl)), "todos excluyen Pagando, En prueba y Bajas");
  ok(conjCreados.every((c) => { const t = JSON.parse(c.targeting); return t.age_min === 25 && t.age_max === 60 && t.geo_locations.countries[0] === "MX" && !t.publisher_platforms; }), "México, 25 a 60 años, ubicaciones automáticas");
  const { data: simEst } = await A.from("meta_audiencias").select("audience_id").eq("clave", "similar_esteticas").single();
  const { data: simPro } = await A.from("meta_audiencias").select("audience_id").eq("clave", "similar_prospectos").single();
  ok(JSON.stringify(ids(tg("PeluDesk · WhatsApp · Veterinarias").custom_audiences)) === JSON.stringify([idLista.veterinarias, yaExiste].sort()), "Veterinarias: lista + similar 1 %");
  ok(JSON.stringify(ids(tg("PeluDesk · WhatsApp · Estéticas").custom_audiences)) === JSON.stringify([idLista.esteticas, simEst.audience_id].sort()), "Estéticas: lista + similar 1 %");
  const th = tg("PeluDesk · WhatsApp · Hotel y guardería");
  ok(JSON.stringify(ids(th.custom_audiences)) === JSON.stringify([idLista.hotel_guarderia, simPro.audience_id].sort()) && th.flexible_spec?.[0]?.interests?.length === 3, "Hotel y guardería: lista + similar 2 % Prospectos, con 3 intereses");
  ok(JSON.stringify(ids(tg("PeluDesk · WhatsApp · Visitaron su página").custom_audiences)) === JSON.stringify([idLista.visitaron]), "Retargeting: «Visitaron su página»");
  const promo = JSON.parse(conjCreados[0].promoted_object);
  ok(promo.page_id && promo.whats_app_business_phone_number_id && promo.whatsapp_phone_number === "5215649160742", "promovido: la página y el número del bot (+52 56 4916 0742)");
  ok(postsA("adimages").length === 24, `24 imágenes subidas (${postsA("adimages").length})`);
  const creativos = de("creativo").map(([, o]) => o);
  ok(creativos.length === 12, `12 creativos (${creativos.length})`);
  const cv = creativos.find((c) => c.name.includes("Veterinarias") && c.name.includes("agenda"));
  const feed = JSON.parse(cv.asset_feed_spec);
  ok(feed.images.length === 2 && feed.images.map((i) => i.adlabels[0].name).sort().join() === "cuadrada,vertical" && feed.asset_customization_rules.length === 2, "cada creativo: imagen cuadrada (feed) y vertical (historias y reels)");
  ok(feed.bodies[0].text.startsWith("Tus clientes agendan y reciben recordatorios por WhatsApp.") && feed.bodies[0].text.endsWith("Prueba gratis, sin tarjeta."), "el texto del giro y «Prueba gratis, sin tarjeta.»");
  ok(feed.call_to_action_types[0] === "WHATSAPP_MESSAGE", "botón «Enviar mensaje» de WhatsApp");
  const bienvenida = JSON.parse(feed.additional_data.page_welcome_message);
  ok(bienvenida.text_format.message.autofill_message.content === "Hola, vi su anuncio y quiero probar PeluDesk para mi veterinaria", "mensaje prellenado del giro (veterinaria)");
  const ce = creativos.find((c) => c.name.includes("Estéticas") && c.name.includes("cobro"));
  ok(JSON.parse(JSON.parse(ce.asset_feed_spec).additional_data.page_welcome_message).text_format.message.autofill_message.content.endsWith("para mi estética"), "y el de estéticas dice «para mi estética»");
  const anuncios = de("anuncio").map(([, o]) => o);
  ok(anuncios.length === 12 && anuncios.every((a) => a.status === "PAUSED"), `12 anuncios en PAUSADO (${anuncios.length})`);

  seccion("3. Segunda corrida: no duplica y lee los últimos 7 días");
  const antes = objetos.size;
  const subidas = postsA("adimages").length;
  const r2 = await correr();
  ok(objetos.size === antes && postsA("adimages").length === subidas && r2.creados.length === 0, "no crea nada nuevo");
  const { data: filaCamp } = await A.from("meta_campanas").select("estado_meta, gasto_7d, conversaciones_7d, costo_conversacion, insights_at").eq("clave", "campana:prospeccion").single();
  ok(filaCamp.estado_meta === "PAUSED" && Number(filaCamp.gasto_7d) === 123.45 && filaCamp.conversaciones_7d === 5 && Number(filaCamp.costo_conversacion) === 24.69 && filaCamp.insights_at, "la campaña guarda estado, gasto, conversaciones y costo por conversación");
  const { data: filaConj } = await A.from("meta_campanas").select("presupuesto_diario").eq("clave", "conjunto:veterinarias").single();
  ok(Number(filaConj.presupuesto_diario) === 100, "y el conjunto su presupuesto diario (100)");
  const li = leerInsights({ data: [{ spend: "50", actions: [{ action_type: "onsite_conversion.messaging_conversation_started_7d", value: "4" }] }] });
  ok(li.costo === 12.5, "sin costo por acción de Meta, el costo se calcula (gasto ÷ conversaciones)");

  seccion("4. Retargeting: se activa solo al llegar a 100");
  const retId = (await A.from("meta_campanas").select("meta_id").eq("clave", "conjunto:retargeting").single()).data.meta_id;
  ok(objetos.get(retId).effective_status === "PAUSED", "con 40 en la lista sigue en pausa");
  await A.from("meta_audiencias").update({ miembros: 120, coincidencias_min: 1000 }).eq("clave", "visitaron");
  const r3 = await correr();
  ok(r3.activados.length === 1 && objetos.get(retId).effective_status === "ACTIVE", "con 120 se activa el conjunto");
  const anunciosRet = de("anuncio").filter(([, o]) => o.adset_id === retId);
  ok(anunciosRet.length === 3 && anunciosRet.every(([, o]) => o.effective_status === "ACTIVE"), "y sus 3 anuncios");
  ok(de("conjunto").filter(([id]) => id !== retId).every(([, o]) => o.effective_status === "PAUSED"), "los demás conjuntos siguen en pausa");
  objetos.get(retId).effective_status = "PAUSED"; // alguien lo pausó en Ads Manager
  const r4 = await correr();
  ok(r4.activados.length === 0 && objetos.get(retId).effective_status === "PAUSED", "se activa UNA sola vez: si lo pausan en Ads Manager, la tarea no lo vuelve a prender");

  seccion("5. Acceso");
  const anon = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  ok(((await anon.from("meta_campanas").select("id").limit(1)).data ?? []).length === 0, "anon no lee meta_campanas");
  const { data: staff } = await A.from("membresias").select("profile_id").eq("rol", "admin").is("deleted_at", null).limit(1).single();
  const jwt = await tokenDe(staff.profile_id);
  const comoAdmin = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  ok(((await comoAdmin.from("meta_campanas").select("id").limit(1)).data ?? []).length === 0, "el admin de un negocio no lee meta_campanas");
  ok(Boolean((await comoAdmin.from("meta_campanas").insert({ clave: "campana:x", tipo: "campana", nombre: "x" })).error), "ni escribe");
  ok(Boolean((await comoAdmin.rpc("prospecto_registrar_anuncio", { p_telefono: "4440000000", p_nombre: "x", p_ad_id: "1", p_ctwa_clid: "x", p_texto: "x" })).error), "ni registra prospectos de anuncio");
  const todo = llamadas.map((l) => JSON.stringify(l.params)).join(" ");
  ok(!todo.includes(env.SUPABASE_SERVICE_ROLE_KEY ?? "nada-que-buscar"), "a Meta no llega ninguna llave de la base");
} catch (e) {
  hallazgos.push(e.message);
  console.error(e);
} finally {
  await limpiar().catch((e) => console.error("limpieza", e.message));
  doble.close();
}
if (hallazgos.length) { console.log(`\n${hallazgos.length} hallazgo(s)`); process.exit(1); }
console.log("\nSin hallazgos.");
