// Nada más ancho que el celular (QA N154, S49) — SOLO DESARROLLO, en Huellitas, con `next start` en el 3001.
//
//   node scripts/auditoria/celular-390-dev.mjs [--roles admin,recepcion,estetica,medico] [--max 120] [--ver]
//
// «medico»: un médico veterinario designado mientras corre (scripts/auditoria/lib/medico-dev.mjs); se quita al terminar.
//
// Con cada rol del personal, a 390 × 844 px (celular, táctil), recorre la app desde su inicio siguiendo los enlaces
// que ve (ninguna escritura sale del navegador) y en cada pantalla falla si:
//   · la página o algún contenedor es más ancho que la pantalla, o hay un scroll horizontal que no se anuncia
//     (scripts/auditoria/lib/ancho-pantalla.mjs);
//   · una tabla se ve como tabla (con su encabezado) en vez de tarjetas (<TablaResponsiva>), o una tarjeta trae un
//     dato sin el nombre de su columna.
// Además, una vez por rol: el menú lateral abre con un botón «Cerrar» visible que lo cierra.
// Sale con 1 si algo falla.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { desbordesDePantalla } from "./lib/ancho-pantalla.mjs";
import { designarMedicoTemporal, quitarMedicoTemporal } from "./lib/medico-dev.mjs";
import { sellar } from "./lib/sello-pantalla.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const ROLES = arg("--roles", "admin,recepcion,estetica,medico").split(",");
const MAX = Number(arg("--max", "120"));
const VER = process.argv.includes("--ver");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const CUENTAS = { admin: datos.adminB, recepcion: datos.recepcionB, estetica: datos.esteticaB, medico: datos.esteticaAmbos };
const INICIO = { admin: "/admin", recepcion: "/recepcion", estetica: "/estetica", medico: "/veterinaria" };
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const patronDe = (r) => r.replace(/^\/ayuda\/(videos\/)?(?!tickets$|videos$|pedir-ayuda$)[a-z0-9-]+$/, "/ayuda/$1:articulo").replace(UUID, ":id").replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, "/:fecha").replace(/\/\d+(?=\/|$)/g, "/:n");
const NO_RECORRER = /^\/(api|portal|login|logout|salir|auth|demo|plataforma|alta|l|r|c|p|v|para|blog|legal|privacidad|terminos|aviso)(\/|$)|\/(imprimir|pdf|descargar|exportar|csv)(\/|$)|\.(pdf|csv|xlsx|xml|png|jpg|ics|zip)$|\/xml$/i;

const hallazgos = [];
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

// Con la base de desarrollo estrangulada, Auth a veces no contesta (usuario nulo, enlace sin token): se reintenta.
async function cookiesDe(profileId) {
  for (let intento = 1; ; intento++) {
    try {
      return await cookiesDeUnaVez(profileId);
    } catch (e) {
      if (intento >= 5) throw e;
      console.log(`  · no se pudo abrir la sesión (${String(e.message).slice(0, 60)}); reintento ${intento + 1} de 5 en 30 s`);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }
}
async function cookiesDeUnaVez(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, i) => [`${n}.${i}`, t]));
  return galletas(`sb-${REF}-auth-token`).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

/** En el navegador: tablas que se ven como tabla, o tarjetas con datos sin su nombre. */
function tablasEnCelular() {
  const malas = [];
  for (const t of document.querySelectorAll("main table")) {
    const r = t.getBoundingClientRect();
    if (r.width < 2) continue;
    const enc = t.tHead;
    if (!t.classList.contains("tabla-tarjetas") || (enc && getComputedStyle(enc).display !== "none")) {
      malas.push(`tabla sin tarjetas: «${(t.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60)}»`);
      continue;
    }
    // Con encabezado, cada dato (no la primera celda) lleva su nombre.
    const nombres = enc ? [...(enc.rows[enc.rows.length - 1]?.cells ?? [])].map((c) => (c.textContent || "").trim()) : [];
    for (const fila of t.tBodies[0]?.rows ?? []) {
      [...fila.cells].forEach((c, i) => {
        if (i === 0 || c.colSpan > 1 || !nombres[i] || !(c.textContent || "").trim()) return;
        if (!c.getAttribute("data-label")) malas.push(`dato sin nombre en la tarjeta (columna «${nombres[i]}»)`);
      });
      break;
    }
  }
  return [...new Set(malas)];
}

const nav = await abrirNavegador();
const porRol = {};
if (ROLES.includes("medico")) await designarMedicoTemporal({ B: datos.B, adminId: datos.adminB, profileId: CUENTAS.medico });
for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, async () => { await quitarMedicoTemporal(); process.exit(130); });
try {
  for (const rol of ROLES) {
    console.log(`\n── ${rol} ──`);
    const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await ctx.addCookies(await cookiesDe(CUENTAS[rol]));
    await ctx.route("**/*", (r) => {
      const req = r.request();
      const h = req.headers();
      if (h["next-router-prefetch"] || h["purpose"] === "prefetch") return r.abort();
      if (["GET", "HEAD", "OPTIONS"].includes(req.method()) || /\/auth\/v1\/token/.test(req.url())) return r.continue();
      return r.abort();
    });
    let p = null;
    const pestana = async () => {
      if (p) await p.close().catch(() => {});
      p = await ctx.newPage();
      p.on("dialog", (d) => d.dismiss().catch(() => {}));
    };
    // El menú lateral: se abre y se cierra con su botón «Cerrar».
    await pestana();
    await p.goto(BASE + INICIO[rol], { waitUntil: "load" });
    await p.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    await p.locator("header button[aria-controls=menu-lateral-staff]").click();
    const cerrar = p.locator("[data-cerrar-menu]");
    if (!(await cerrar.isVisible().catch(() => false))) mal(`${rol}: el menú lateral no trae un botón «Cerrar» visible`);
    else {
      await cerrar.click();
      await p.waitForTimeout(300);
      if (await p.locator("#menu-lateral-staff").isVisible().catch(() => false)) mal(`${rol}: «Cerrar» no cierra el menú`);
      else bien(`${rol}: el menú lateral se cierra con su botón «Cerrar»`);
    }

    const cola = [INICIO[rol]];
    const vistos = new Set(cola.map(patronDe));
    let pantallas = 0;
    let malas = 0;
    let tablas = 0;
    while (cola.length && pantallas < MAX) {
      const ruta = cola.shift();
      try {
        await pestana();
        await p.goto(BASE + ruta, { waitUntil: "load" });
        await p.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
        await p.waitForTimeout(250);
      } catch (e) { console.log(`  · ${ruta}: ${String(e.message).split("\n")[0]}`); continue; }
      pantallas++;
      const final = new globalThis.URL(p.url()).pathname;
      const desbordes = await p.evaluate(desbordesDePantalla).catch(() => []);
      const enTablas = await p.evaluate(tablasEnCelular).catch(() => []);
      tablas += await p.locator("main table").count();
      if (desbordes.length || enTablas.length) {
        malas++;
        mal(`${rol} · ${final}: ${[...desbordes.map((d) => `${d.tipo} — ${d.detalle}`), ...enTablas].slice(0, 4).join(" | ")}`);
      } else if (VER) bien(`${rol} · ${final}`);
      const enlaces = await p.$$eval("a[href]", (as) => as.filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute("href"))).catch(() => []);
      for (const h of enlaces) {
        if (!h?.startsWith("/")) continue;
        const r = h.split("#")[0];
        const sola = r.split("?")[0];
        if (NO_RECORRER.test(sola) || vistos.has(patronDe(sola))) continue;
        vistos.add(patronDe(sola));
        cola.push(r);
      }
    }
    porRol[rol] = { pantallas, malas, tablas };
    console.log(`  · ${rol}: ${pantallas} pantallas a 390 px, ${tablas} tablas vistas, ${malas} con algo más ancho que la pantalla`);
    await ctx.close();
  }
} finally {
  await nav.close();
  await quitarMedicoTemporal();
}
console.log("\nPor rol:");
for (const [rol, r] of Object.entries(porRol)) console.log(`  ${rol.padEnd(10)} ${String(r.pantallas).padStart(4)} pantallas · ${r.tablas} tablas · ${r.malas} con desborde`);
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s) a 390 px.` : "\n✔ A 390 px nada es más ancho que la pantalla, toda tabla es tarjetas y el menú se cierra con su botón.");
// La corrida completa deja su sello para `npm run desplegar` (scripts/auditoria/lib/sello-pantalla.mjs).
if (!hallazgos.length && ["admin", "recepcion", "estetica", "medico"].every((r) => ROLES.includes(r))) sellar("celular-390-dev", { porRol });
process.exit(hallazgos.length ? 1 : 0);
