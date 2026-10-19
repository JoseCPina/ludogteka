// Audiencias personalizadas de Meta con la base de prospectos (desarrollo, sin red a Meta).
//   node --experimental-strip-types scripts/auditoria/meta-audiencias-dev.mjs
// Levanta un doble de la Graph API en el 4463 que guarda cada audiencia y sus filas, y corre la sincronización de
// verdad (src/lib/meta-ads/sincronizar.ts) contra la base de desarrollo con la llave de servicio:
//   1. hash: teléfono «52»+10 dígitos y correo en minúsculas, SHA-256; lo que llega a Meta son solo hashes;
//   2. quién entra: por giro, mixtos en hotel y guardería, visitaron, en prueba, pagando; nunca descartados, bajas,
//      excluidos por WhatsApp ni los que pagan en las de prospectos;
//   3. altas, bajas y cambios: la segunda corrida sin cambios no manda nada; un descartado o una baja sale de todo;
//   4. BAJA por WhatsApp (prospecto_baja_whatsapp) solo con la llave de servicio;
//   5. errores: un 500 no registra miembros (la siguiente corrida reintenta); condiciones sin aceptar quedan con
//      el texto exacto y no se insiste con las demás;
//   6. acceso: anon y una sesión del personal no leen las tablas ni llaman las funciones;
//   8. pantalla (necesita `npm run build`; SIN_PANTALLA=1 lo salta): levanta `next start` en el 3008 con el doble, la
//      tarea sin secreto da 401 y con él sincroniza; /plataforma/prospectos enseña la sección «Meta» a 390 y 1280 px
//      y la ficha da de baja de publicidad.
// Al terminar deja las audiencias de desarrollo como estaban (sin ids de Meta ni miembros) y borra sus prospectos.
import http from "node:http";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL as SUPA, env, tokenDe } from "./sesiones-dev.mjs";
import { crearApiMeta } from "../../src/lib/meta-ads/api.ts";
import { sincronizarAudiencias, telefonoParaMeta, correoParaMeta, armarDeseados } from "../../src/lib/meta-ads/sincronizar.ts";

if (!SUPA.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const ok = (c, si, no = si) => { if (c) console.log(`  ✔ ${si}`); else { hallazgos.push(no); console.log(`  ✘ ${no}`); } };
const seccion = (t) => console.log(`\n── ${t}`);
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const sufijo = String(Date.now()).slice(-6);
const CIUDAD = `Pruebalandia Meta ${sufijo}`;
const TOKEN = "token-de-prueba-meta";

// ── Doble de la Graph API ───────────────────────────────────────────────────────────────────────────────────────
const aud = new Map(); // id → { name, filas: Map("tel|correo" → true), source }
const llamadas = [];
const modo = { terminos: false, falla500: false };
let siguiente = 1;
const TEXTO_TERMINOS = "You need to accept the Custom Audience Terms of Service before you can create or edit an audience.";
const doble = http.createServer(async (req, res) => {
  const u = new globalThis.URL(req.url, "http://x");
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const p = new URLSearchParams(req.method === "GET" ? u.search : cuerpo);
  const ruta = u.pathname.replace(/^\/v[0-9.]+\//, "");
  llamadas.push({ metodo: req.method, ruta, params: Object.fromEntries(p) });
  const json = (st, o) => { res.writeHead(st, { "content-type": "application/json" }); res.end(JSON.stringify(o)); };
  if (p.get("access_token") !== TOKEN) return json(400, { error: { message: "Invalid OAuth access token.", code: 190 } });
  if (/^act_[0-9]+\/customaudiences$/.test(ruta) && req.method === "GET") return json(200, { data: [...aud.entries()].map(([id, a]) => ({ id, name: a.name })) });
  if (/^act_[0-9]+\/customaudiences$/.test(ruta) && req.method === "POST") {
    if (modo.terminos) return json(400, { error: { message: TEXTO_TERMINOS, code: 200, error_subcode: 1870090, type: "OAuthException" } });
    const id = `9000${siguiente++}`;
    aud.set(id, { name: p.get("name"), source: p.get("customer_file_source"), subtype: p.get("subtype"), filas: new Map() });
    return json(200, { id });
  }
  const m = ruta.match(/^([0-9]+)\/users$/);
  if (m) {
    const a = aud.get(m[1]);
    if (!a) return json(400, { error: { message: "Unsupported request", code: 100 } });
    if (modo.falla500) return json(500, { error: { message: "An unexpected error has occurred.", code: 2 } });
    const pl = JSON.parse(p.get("payload"));
    let invalidos = 0;
    for (const fila of pl.data) {
      if (!fila.every((v) => v === "" || /^[0-9a-f]{64}$/.test(v)) || fila.every((v) => v === "")) { invalidos++; continue; }
      const k = fila.join("|");
      if (req.method === "DELETE") a.filas.delete(k); else a.filas.set(k, pl.schema.join(","));
    }
    return json(200, { audience_id: m[1], session_id: "1", num_received: pl.data.length, num_invalid_entries: invalidos });
  }
  const g = ruta.match(/^([0-9]+)$/);
  if (g && aud.has(g[1])) {
    const n = aud.get(g[1]).filas.size;
    return json(200, { id: g[1], name: aud.get(g[1]).name, approximate_count_lower_bound: n, approximate_count_upper_bound: n, operation_status: { code: 200 }, delivery_status: { code: 300 } });
  }
  json(404, { error: { message: "no existe", code: 803 } });
});
await new Promise((r) => doble.listen(4463, "127.0.0.1", r));
const api = crearApiMeta({ token: TOKEN, cuenta: "1234567890", url: "http://127.0.0.1:4463" });
const audPorNombre = (n) => [...aud.values()].find((a) => a.name === n);
const tiene = (n, fila) => Boolean(audPorNombre(n)?.filas.has(fila.join("|")));

// ── Datos de prueba ─────────────────────────────────────────────────────────────────────────────────────────────
const tel = (i) => `44${sufijo}${String(i).padStart(2, "0")}`.slice(0, 10);
const creados = [];
async function prospecto(o) {
  const { data, error } = await A.from("prospectos").insert({ ciudad: CIUDAD, fuente: "manual", ...o, nombre: `${o.nombre} ${sufijo}` }).select("id").single();
  if (error) throw new Error(`prospecto ${o.nombre}: ${error.message}`);
  creados.push(data.id);
  return data.id;
}
const fila = (t, c) => [t ? sha(`52${t}`) : "", c ? sha(c.trim().toLowerCase()) : ""];
let exclusionId = null;
const exclusionIdExtra = [];
const corridasCreadas = [];

async function limpiar() {
  const { data: ids } = await A.from("meta_audiencias").select("id");
  for (const a of ids ?? []) await A.from("meta_audiencias_miembros").delete().eq("audiencia_id", a.id);
  await A.from("meta_audiencias").update({ audience_id: null, miembros: 0, coincidencias_min: null, coincidencias_max: null, estado_meta: null, ultima_sync_at: null, ultimo_error: null }).neq("clave", "");
  for (const c of corridasCreadas) await A.from("meta_audiencias_corridas").delete().eq("id", c);
  for (const id of creados) {
    await A.from("prospectos_eventos").delete().eq("prospecto_id", id);
    await A.from("prospectos").delete().eq("id", id);
  }
  if (exclusionId) await A.from("seguimiento_pruebas_exclusiones").delete().eq("id", exclusionId);
}

async function correr() {
  const r = await sincronizarAudiencias({ db: A, api, origen: "script" });
  if (r.corridaId) corridasCreadas.push(r.corridaId);
  return r;
}

try {
  await limpiar();
  seccion("1. Normalización y hash");
  ok(telefonoParaMeta("(444) 123-4567") === "524441234567", "10 dígitos con signos → 52 + 10");
  ok(telefonoParaMeta("+52 1 444 123 4567") === "524441234567", "con el 1 de celular → 52 + 10");
  ok(telefonoParaMeta("12345") === null, "un número corto no se manda");
  ok(correoParaMeta("  Hola@Ejemplo.MX ") === "hola@ejemplo.mx", "correo sin espacios y en minúsculas");
  ok(correoParaMeta("no es correo") === null, "lo que no es correo no se manda");

  const P = {
    vet: await prospecto({ nombre: "Vet Meta", giro: "veterinaria", telefono: tel(1), correo: `  Vet.${sufijo}@Ejemplo.MX ` }),
    est: await prospecto({ nombre: "Estética Meta", giro: "estetica", whatsapp: `+52 1 ${tel(2)}` }),
    gua: await prospecto({ nombre: "Guardería Meta", giro: "guarderia", telefono: tel(3) }),
    mix: await prospecto({ nombre: "Mixto Meta", giro: "mixto", telefono: tel(4), etapa: "caliente" }),
    des: await prospecto({ nombre: "Descartado Meta", giro: "veterinaria", telefono: tel(5), etapa: "descartado", descarte_tipo: "no_es_del_giro" }),
    pag: await prospecto({ nombre: "Pagando Meta", giro: "estetica", telefono: tel(6), etapa: "pagando" }),
    baj: await prospecto({ nombre: "Baja Meta", giro: "hotel", telefono: tel(7), publicidad_baja_at: new Date().toISOString(), publicidad_baja_motivo: "Prueba" }),
    exc: await prospecto({ nombre: "Excluido Meta", giro: "hotel", telefono: tel(8) }),
    pru: await prospecto({ nombre: "En prueba Meta", giro: "veterinaria", telefono: tel(9), etapa: "en_prueba" }),
    sin: await prospecto({ nombre: "Sin contacto Meta", giro: "veterinaria" }),
  };
  await A.from("prospectos").update({ visitas: 2 }).eq("id", P.gua);
  const { data: ex, error: eex } = await A.from("seguimiento_pruebas_exclusiones").insert({ telefono: tel(8), motivo: "baja" }).select("id").single();
  if (eex) throw new Error(`exclusión: ${eex.message}`);
  exclusionId = ex.id;

  seccion("2. Primera corrida: quién entra en cada audiencia");
  const r1 = await correr();
  ok(r1.estado === "ok", `la corrida termina bien (${r1.estado}${r1.errores.length ? ": " + r1.errores.join(" · ") : ""})`);
  ok(aud.size === 7, `se crean las 7 audiencias (${aud.size})`);
  ok([...aud.values()].every((a) => a.source === "BOTH_USER_AND_PARTNER_PROVIDED" && a.subtype === "CUSTOM"), "lista de clientes con origen «de socios/propios» (BOTH_USER_AND_PARTNER_PROVIDED)");
  const crea = llamadas.filter((l) => /customaudiences$/.test(l.ruta) && l.metodo === "POST").map((l) => l.params.name).sort();
  ok(JSON.stringify(crea) === JSON.stringify(["PeluDesk · En prueba", "PeluDesk · Estéticas", "PeluDesk · Hotel y guardería", "PeluDesk · Pagando", "PeluDesk · Prospectos", "PeluDesk · Veterinarias", "PeluDesk · Visitaron su página"].sort()), `con los nombres pedidos (${crea.join(", ")})`);
  const envios = llamadas.filter((l) => /\/users$/.test(l.ruta));
  const todo = envios.map((l) => l.params.payload).join(" ");
  ok(!todo.includes(tel(1)) && !todo.includes(`vet.${sufijo}`), "a Meta no llega ningún teléfono ni correo en claro");
  ok(envios.every((l) => JSON.parse(l.params.payload).schema.join(",") === "PHONE,EMAIL"), "esquema de varias llaves PHONE + EMAIL");
  const fVet = fila(tel(1), `vet.${sufijo}@ejemplo.mx`);
  ok(tiene("PeluDesk · Prospectos", fVet) && tiene("PeluDesk · Veterinarias", fVet), "la veterinaria con teléfono y correo: sha256(52+tel) y sha256(correo en minúsculas)");
  ok(tiene("PeluDesk · Estéticas", fila(tel(2), null)), "la estética entra por su WhatsApp (+52 1 … normalizado)");
  ok(tiene("PeluDesk · Hotel y guardería", fila(tel(3), null)) && tiene("PeluDesk · Hotel y guardería", fila(tel(4), null)), "guardería y mixto en «Hotel y guardería»");
  ok(tiene("PeluDesk · Visitaron su página", fila(tel(3), null)) && tiene("PeluDesk · Visitaron su página", fila(tel(4), null)) && !tiene("PeluDesk · Visitaron su página", fVet), "«Visitaron»: el que abrió su página y el caliente, no los demás");
  const enProspectos = (t) => [...(audPorNombre("PeluDesk · Prospectos")?.filas.keys() ?? [])].some((k) => k.startsWith(sha(`52${t}`)));
  ok(!enProspectos(tel(5)), "un descartado no entra");
  ok(!enProspectos(tel(7)), "una baja de publicidad no entra");
  ok(!enProspectos(tel(8)), "un teléfono que escribió BAJA (exclusión) no entra");
  ok(!enProspectos(tel(6)) && tiene("PeluDesk · Pagando", fila(tel(6), null)), "el que paga no va en Prospectos y sí en «Pagando»");
  ok(tiene("PeluDesk · En prueba", fila(tel(9), null)), "el prospecto en prueba va en «En prueba»");
  const { data: filaAud } = await A.from("meta_audiencias").select("clave, miembros, coincidencias_min, ultima_sync_at, audience_id").eq("clave", "prospectos").single();
  ok(filaAud.audience_id && filaAud.ultima_sync_at && filaAud.miembros === audPorNombre("PeluDesk · Prospectos").filas.size, `la audiencia guarda id, última sincronización y enviados (${filaAud.miembros})`);
  ok(filaAud.coincidencias_min === filaAud.miembros, "y las coincidencias que reporta Meta");
  const { data: corr } = await A.from("meta_audiencias_corridas").select("estado, resumen").eq("id", r1.corridaId).single();
  ok(corr.estado === "ok" && Number(corr.resumen?.prospectos?.altas) > 0, "la corrida queda registrada con sus altas");

  seccion("3. Sin cambios no se manda nada; altas, bajas y cambios");
  const antes = llamadas.length;
  const r2 = await correr();
  ok(r2.estado === "ok" && llamadas.slice(antes).every((l) => !/\/users$/.test(l.ruta)), "la segunda corrida sin cambios no manda filas a Meta");
  await A.from("prospectos").update({ etapa: "descartado", descarte_tipo: "no_le_interesa" }).eq("id", P.vet);
  await A.from("prospectos").update({ correo: `nuevo.${sufijo}@ejemplo.mx` }).eq("id", P.est);
  await A.from("prospectos").update({ publicidad_baja_at: new Date().toISOString() }).eq("id", P.gua);
  const nuevo = await prospecto({ nombre: "Nuevo Meta", giro: "estetica", telefono: tel(10) });
  const r3 = await correr();
  ok(r3.estado === "ok", "la tercera corrida termina bien");
  ok(!tiene("PeluDesk · Prospectos", fVet) && !tiene("PeluDesk · Veterinarias", fVet), "el que se descartó sale de Prospectos y de Veterinarias");
  ok(!tiene("PeluDesk · Estéticas", fila(tel(2), null)) && tiene("PeluDesk · Estéticas", fila(tel(2), `nuevo.${sufijo}@ejemplo.mx`)), "un cambio de correo quita la fila vieja y pone la nueva");
  ok(!tiene("PeluDesk · Visitaron su página", fila(tel(3), null)) && !tiene("PeluDesk · Hotel y guardería", fila(tel(3), null)), "la baja de publicidad sale de todas las audiencias");
  ok(tiene("PeluDesk · Estéticas", fila(tel(10), null)), "el prospecto nuevo entra");
  ok(r3.resumen.prospectos.bajas >= 2 && r3.resumen.prospectos.altas >= 1 && r3.resumen.esteticas.cambios >= 1, `el resumen dice altas, bajas y cambios (${JSON.stringify(r3.resumen.prospectos)})`);
  void nuevo;

  seccion("4. BAJA por WhatsApp");
  const anon = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const ra = await anon.rpc("prospecto_baja_whatsapp", { p_telefono: tel(4) });
  ok(Boolean(ra.error), "la llave anónima no puede dar de baja a nadie");
  const rb = await A.rpc("prospecto_baja_whatsapp", { p_telefono: `+52 1 ${tel(4)}` });
  ok(!rb.error && rb.data >= 1, `con la llave de servicio da de baja al prospecto de ese teléfono (${rb.data})`);
  const { data: exc2 } = await A.from("seguimiento_pruebas_exclusiones").select("id").eq("telefono", tel(4)).maybeSingle();
  if (exc2) exclusionIdExtra.push(exc2.id);
  ok(Boolean(exc2), "y el teléfono queda en la lista de exclusiones");
  await correr();
  ok(!tiene("PeluDesk · Hotel y guardería", fila(tel(4), null)) && !tiene("PeluDesk · Visitaron su página", fila(tel(4), null)), "en la siguiente corrida sale de todas las audiencias");

  seccion("5. Errores de Meta");
  await A.from("prospectos").update({ publicidad_baja_at: null }).eq("id", P.gua);
  modo.falla500 = true;
  const r5 = await correr();
  ok(r5.estado !== "ok" && r5.errores.length > 0, `un 500 de Meta queda como error de la corrida (${r5.estado})`);
  const { count: sinRegistrar } = await A.from("meta_audiencias_miembros").select("id", { count: "exact", head: true }).eq("miembro", `prospecto:${P.gua}`).is("deleted_at", null);
  ok(sinRegistrar === 0, "lo que Meta no aceptó no se da por enviado");
  modo.falla500 = false;
  const r6 = await correr();
  ok(r6.estado === "ok" && tiene("PeluDesk · Visitaron su página", fila(tel(3), null)), "la siguiente corrida lo reintenta y entra");
  await A.from("meta_audiencias").update({ audience_id: null }).eq("clave", "veterinarias");
  aud.forEach((a, id) => { if (a.name === "PeluDesk · Veterinarias") aud.delete(id); });
  modo.terminos = true;
  const r7 = await correr();
  const { data: errVet } = await A.from("meta_audiencias").select("ultimo_error").eq("clave", "veterinarias").single();
  ok(errVet.ultimo_error?.includes(TEXTO_TERMINOS), `condiciones sin aceptar: queda el texto exacto de Meta («${errVet.ultimo_error}»)`);
  ok(r7.errores.some((e) => e.includes(TEXTO_TERMINOS)), "y la corrida lo reporta");
  modo.terminos = false;

  seccion("6. Acceso");
  for (const t of ["meta_audiencias", "meta_audiencias_miembros", "meta_audiencias_corridas"]) {
    const { data } = await anon.from(t).select("id").limit(1);
    ok((data ?? []).length === 0, `anon no lee ${t}`);
  }
  const { data: staff } = await A.from("membresias").select("profile_id").eq("rol", "admin").is("deleted_at", null).limit(1).single();
  const jwt = await tokenDe(staff.profile_id);
  const comoAdmin = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${jwt}` } } });
  const { data: leidas } = await comoAdmin.from("meta_audiencias_miembros").select("id").limit(1);
  ok((leidas ?? []).length === 0, "el admin de un negocio no lee los miembros");
  const ins = await comoAdmin.from("meta_audiencias_corridas").insert({ origen: "manual" });
  ok(Boolean(ins.error), "ni puede escribir una corrida");
  ok(Boolean((await comoAdmin.rpc("meta_audiencias_negocios")).error) && Boolean((await anon.rpc("meta_audiencias_negocios")).error), "meta_audiencias_negocios solo con la llave de servicio");

  seccion("7. Reglas puras");
  const d = armarDeseados({ prospectos: [{ id: "00000000-0000-4000-8000-000000000001", giro: "mixto", etapa: "nuevo", telefono: "4440000001", whatsapp: null, whatsapp_bot: null, correo: null, visitas: 0, negocio_cliente_id: "00000000-0000-4000-8000-0000000000aa", publicidad_baja_at: null }], negocios: [{ negocio_id: "00000000-0000-4000-8000-0000000000aa", tipo: "pagando", telefonos: ["4440000099"], correos: ["dueno@ejemplo.mx"] }], telefonosExcluidos: new Set() });
  ok(d.prospectos.length === 0 && d.pagando.length === 1, "un prospecto ligado a un negocio que paga no va en las de prospectos");

  if (process.env.SIN_PANTALLA !== "1") {
    seccion("8. Tarea diaria y pantalla");
    const PUERTO = 3008;
    const srv = spawn("npx", ["next", "start", "-p", String(PUERTO)], {
      env: { ...process.env, CRON_SECRET: "cron-de-prueba", META_ADS_API_URL: "http://127.0.0.1:4463", META_ADS_TOKEN: TOKEN, META_AD_ACCOUNT_ID: "1234567890" },
      stdio: "ignore",
      detached: true,
    });
    try {
      const pedir = (ruta, headers = {}) => new Promise((res, rej) => {
        const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, headers: { host: `plataforma.localhost:${PUERTO}`, ...headers } }, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res({ status: r.statusCode, cuerpo: b })); });
        q.on("error", rej);
        q.end();
      });
      for (let i = 0; i < 60; i++) { try { await pedir("/"); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
      ok((await pedir("/api/cron/meta-audiencias")).status === 401, "la tarea sin CRON_SECRET da 401");
      const rc = await pedir("/api/cron/meta-audiencias", { authorization: "Bearer cron-de-prueba" });
      let jc = {};
      try { jc = JSON.parse(rc.cuerpo); } catch { /* sin JSON */ }
      if (jc.corridaId) corridasCreadas.push(jc.corridaId);
      ok(rc.status === 200 && jc.estado === "ok", `con el secreto, la tarea sincroniza (${rc.status} ${jc.estado ?? rc.cuerpo.slice(0, 120)})`);

      const REF = new globalThis.URL(SUPA).hostname.split(".")[0];
      const { data: pa } = await A.from("plataforma_admins").select("profile_id").limit(1);
      const { data: u } = await A.auth.admin.getUserById(pa[0].profile_id);
      const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
      const cli = createClient(SUPA, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data: ses } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
      const valor = "base64-" + Buffer.from(JSON.stringify(ses.session)).toString("base64url");
      const trozos = valor.match(/.{1,3180}/g);
      const galletas = trozos.length === 1 ? [[`sb-${REF}-auth-token`, valor]] : trozos.map((t, i) => [`sb-${REF}-auth-token.${i}`, t]);
      const nav = await abrirNavegador();
      try {
        for (const ancho of [390, 1280]) {
          const ctx = await nav.newContext({ viewport: { width: ancho, height: 900 } });
          await ctx.addCookies(galletas.map(([name, value]) => ({ name, value, domain: "plataforma.localhost", path: "/" })));
          const pg = await ctx.newPage();
          await pg.goto(`http://plataforma.localhost:${PUERTO}/plataforma/prospectos`);
          await pg.waitForSelector("[data-meta]");
          ok((await pg.locator("[data-meta] [data-audiencia]").count()) === 7, `${ancho} px: la sección «Meta» enseña las 7 audiencias`);
          const env1 = await pg.locator('[data-audiencia="prospectos"] [data-enviados]').innerText();
          ok(Number(env1.replace(/\D/g, "")) > 0, `${ancho} px: con su tamaño enviado (${env1})`);
          ok((await pg.locator("[data-corridas-meta] li").count()) > 0, `${ancho} px: y las últimas corridas`);
          ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), `${ancho} px: sin desbordar a lo ancho`);
          if (ancho === 1280) {
            await pg.getByRole("button", { name: "Sincronizar ahora" }).click();
            await pg.getByText(/Audiencias sincronizadas|Sincronizado con errores|Ya hay una sincronización/).first().waitFor({ timeout: 90000 });
            ok(await pg.getByText("Audiencias sincronizadas").first().isVisible().catch(() => false), "«Sincronizar ahora» sincroniza desde la pantalla");
            const { data: ultimas } = await A.from("meta_audiencias_corridas").select("id").eq("origen", "manual").order("inicio_at", { ascending: false }).limit(1);
            if (ultimas?.[0]) corridasCreadas.push(ultimas[0].id);
            await pg.goto(`http://plataforma.localhost:${PUERTO}/plataforma/prospectos/${P.est}`);
            await pg.waitForSelector("[data-publicidad]");
            await pg.getByRole("button", { name: "Pidió baja de publicidad" }).click();
            await pg.locator("[data-publicidad-baja]").waitFor({ timeout: 30000 }).catch(() => {});
            const { data: pb } = await A.from("prospectos").select("publicidad_baja_at").eq("id", P.est).single();
            ok(Boolean(pb.publicidad_baja_at), "en la ficha, «Pidió baja de publicidad» lo saca de la publicidad");
          }
          await ctx.close();
        }
      } finally {
        await nav.close();
      }
    } finally {
      try { process.kill(-srv.pid); } catch { /* ya terminó */ }
    }
  }
} catch (e) {
  hallazgos.push(e.message);
  console.error(e);
} finally {
  await limpiar().catch((e) => console.error("limpieza", e.message));
  for (const id of exclusionIdExtra) await A.from("seguimiento_pruebas_exclusiones").delete().eq("id", id);
  doble.close();
}
if (hallazgos.length) { console.log(`\n${hallazgos.length} hallazgo(s)`); process.exit(1); }
console.log("\nSin hallazgos.");
