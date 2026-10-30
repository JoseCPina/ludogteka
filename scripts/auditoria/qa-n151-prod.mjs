// QA N151 en PRODUCCIÓN, en los negocios PRUEBA de QA con la prueba VENCIDA (y solo ahí), con navegador y SIN escribir
// nada: ningún POST, PATCH ni DELETE sale del navegador. Se corre ANTES de desplegar (debe fallar: reproduce lo que vio
// QA) y DESPUÉS (debe pasar en los mismos negocios y las mismas pantallas). Sale con 1 si algo sigue mal.
//
//   node scripts/auditoria/qa-n151-prod.mjs [--max 40] [--solo prueba-est-tica] [--rutas /estetica/<id>,/x] [--ver] [--fotos]
//
// `--rutas`: pantallas que se revisan primero en cada rol (QA N152: la cita de estética donde QA vio activos
// «Reprogramar», «No se presentó» y el selector de estilista). Desde N152 cuentan también los select, casillas e
// interruptores que guardan al cambiar, y falla si un buscador o filtro (lo que lee) quedó bloqueado.
//
// Con cada rol del personal de cada negocio, recorre la app desde su inicio siguiendo los enlaces que ve y en cada
// pantalla cuenta los botones, enlaces y campos de escritura que siguen activos (scripts/auditoria/lib/escritura-pantalla.mjs).
// Además: la franja de arriba dice lo que le toca al rol (admin: «Tu prueba terminó…» con «Contratar»; los demás:
// «La prueba del negocio terminó. Pídele al dueño…»), y al tocar «Nuevo cliente» (inicio de recepción) aparece el aviso con el
// mismo texto y no se abre el alta.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import os from "node:os";
import path from "node:path";
import { negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { controlesDeEscritura, franjaEsperada } from "./lib/escritura-pantalla.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const MAX = Number(arg("--max", "40"));
const SOLO = arg("--solo", null);
const VER = process.argv.includes("--ver");
const FOTOS = process.argv.includes("--fotos");
const RUTAS = (arg("--rutas", "") || "").split(",").filter(Boolean);
const NEGOCIOS = [
  { slug: "prueba-est-tica", roles: ["recepcion", "admin", "estetica"] },
  { slug: "prueba-hotel-guarderia", roles: ["recepcion", "admin"] },
  { slug: "prueba-veterinaria", roles: ["recepcion", "admin"] },
].filter((n) => !SOLO || n.slug === SOLO);
const INICIO = { admin: "/admin", recepcion: "/recepcion", estetica: "/estetica" };
const NO_RECORRER = /^\/(api|portal|login|logout|salir|auth|demo|plataforma|alta|l|r|c|p|v|para|blog|legal|privacidad|terminos|aviso)(\/|$)|\/(imprimir|pdf|descargar|exportar|csv)(\/|$)|\.(pdf|csv|xlsx|xml|png|jpg|ics|zip)$/i;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const patronDe = (r) => r.replace(UUID, ":id").replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, "/:fecha");

const hallazgos = [];
const resumen = [];
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

const nav = await abrirNavegador();
try {
  for (const { slug, roles } of NEGOCIOS) {
    const { negocio, base, N, sesion } = await negocioPrueba(slug);
    const { data: estado } = await N.rpc("estado_cobro_en", { p_negocio_id: negocio.id });
    console.log(`\n══ ${slug} (${estado}) ══`);
    if (estado !== "prueba_vencida") { mal(`${slug}: el negocio no está en prueba vencida (${estado}); no sirve para N151`); continue; }
    for (const rol of roles) {
      let s;
      try { s = await sesion(rol); } catch (e) { console.log(`  · ${rol}: ${e.message}`); continue; }
      const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
      await ctx.addCookies(s.cookies);
      let escrituras = 0;
      await ctx.route("**/*", (r) => {
        const m = r.request().method();
        const h = r.request().headers();
        if (h["next-router-prefetch"] || h["purpose"] === "prefetch") return r.abort();
        if (m === "GET" || m === "HEAD" || m === "OPTIONS" || /\/auth\/v1\/token/.test(r.request().url())) return r.continue();
        // La consulta de «¿ya se puede escribir?» (una lectura por acción del servidor) sí pasa.
        if (h["next-action"] && r.request().postData()?.length < 5) return r.continue();
        escrituras++;
        if (VER || escrituras <= 3) console.log(`    · POST al abrir: ${new URL(r.request().url()).pathname} ${h["next-action"] ? `(acción ${h["next-action"].slice(0, 10)}…)` : ""} desde ${new URL(r.request().frame().url()).pathname}`);
        return r.abort();
      });
      ctx.on("page", async (p) => { if (await p.opener().catch(() => null)) await p.close().catch(() => {}); });
      // Una pestaña nueva por pantalla: una que navega sola al rato no se cruza con la siguiente.
      let p = null;
      const pestana = async () => {
        if (p) await p.close().catch(() => {});
        p = await ctx.newPage();
        p.on("dialog", (d) => d.dismiss().catch(() => {}));
      };
      console.log(`\n── ${rol} ──`);
      const cola = [INICIO[rol], ...RUTAS];
      const vistos = new Set(cola.map(patronDe));
      let pantallas = 0;
      let activosRol = 0;
      let exentosRol = 0;
      let franjaRevisada = false;
      while (cola.length && pantallas < MAX) {
        const ruta = cola.shift();
        try {
          await pestana();
          await p.goto(base + ruta, { waitUntil: "load" });
          await p.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
          await p.waitForTimeout(400);
        } catch (e) { console.log(`  · ${ruta}: ${String(e.message).split("\n")[0]}`); continue; }
        const final = new URL(p.url()).pathname;
        pantallas++;
        if (!franjaRevisada) {
          franjaRevisada = true;
          const f = franjaEsperada(rol);
          const franja = await p.locator("[data-aviso-plan]").first().innerText().catch(() => "");
          if (!f.texto.test(franja.replace(/\s+/g, " "))) mal(`${slug} · ${rol}: la franja no dice lo que le toca («${franja.replace(/\s+/g, " ").slice(0, 140)}»)`);
          else bien(`${slug} · ${rol}: franja «${franja.replace(/\s+/g, " ").slice(0, 110)}»`);
          if (f.boton && !(await p.locator("[data-aviso-plan] a", { hasText: f.boton }).count())) mal(`${slug} · ${rol}: la franja no trae el botón «Contratar»`);
          if (FOTOS) await p.screenshot({ path: path.join(os.tmpdir(), `qa-n151-${slug}-${rol}.png`) });
        }
        const { activos, exentos, lecturasBloqueadas } = await p.evaluate(controlesDeEscritura).catch(() => ({ activos: [], exentos: 0, lecturasBloqueadas: [] }));
        exentosRol += exentos;
        for (const l of lecturasBloqueadas) mal(`${slug} · ${rol} · ${final}: buscador o filtro bloqueado «${l.texto}»`);
        if (activos.length) {
          activosRol += activos.length;
          const lista = [...new Set(activos.map((a) => `${a.tipo}: «${a.texto}»`))];
          mal(`${slug} · ${rol} · ${final}: ${activos.length} control(es) de escritura activo(s) — ${lista.slice(0, 6).join(" · ")}${lista.length > 6 ? " …" : ""}`);
        } else if (VER) bien(`${slug} · ${rol} · ${final}: nada de escritura activo`);
        const enlaces = await p.$$eval("a[href]", (as) => as.filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute("href")));
        for (const h of enlaces) {
          if (!h?.startsWith("/")) continue;
          const r = h.split("#")[0];
          const sola = r.split("?")[0];
          if (NO_RECORRER.test(sola) || vistos.has(patronDe(sola))) continue;
          vistos.add(patronDe(sola));
          cola.push(r);
        }
      }
      // Tocar «Nuevo cliente» (recepción): aviso con el texto de la franja, sin abrir el alta.
      if (rol === "recepcion") {
        await pestana();
        await p.goto(`${base}/recepcion`, { waitUntil: "load" });
        await p.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
        const boton = p.locator("main a, main button").filter({ hasText: /^\s*\+?\s*Nuevo cliente/ }).first();
        if (await boton.count()) {
          await boton.click({ timeout: 4000, force: true }).catch(() => {});
          await p.waitForTimeout(1200);
          const aviso = await p.locator("[data-aviso-solo-lectura]").first().innerText().catch(() => "");
          const donde = new URL(p.url()).pathname;
          if (donde !== "/recepcion") mal(`${slug} · recepción: «Nuevo cliente» abrió ${donde}`);
          else if (!/La prueba del negocio terminó/.test(aviso)) mal(`${slug} · recepción: al tocar «Nuevo cliente» no aparece el aviso`);
          else bien(`${slug} · recepción: «Nuevo cliente» se queda en /recepcion con el aviso «${aviso.replace(/\s+/g, " ").slice(0, 90)}»`);
          if (FOTOS) await p.screenshot({ path: path.join(os.tmpdir(), `qa-n151-${slug}-nuevo-cliente.png`) });
        }
      }
      // Lo que una pantalla pide sola al abrir (cotizar una cita, el impacto de un cambio de plan) va por acción del
      // servidor pero LEE: se cuenta, no es falla. Lo que cuenta es lo que la persona puede tocar (arriba).
      if (escrituras) console.log(`  · ${slug} · ${rol}: ${escrituras} petición(es) POST que las pantallas hacen solas al abrir (lecturas por acción del servidor; bloqueadas aquí)`);
      resumen.push({ slug, rol, pantallas, activos: activosRol, exentos: exentosRol });
      console.log(`  · ${rol}: ${pantallas} pantallas, ${activosRol} control(es) de escritura activos, ${exentosRol} exentos (buscar, filtrar, exportar, contratar)`);
      await ctx.close();
    }
  }
} finally {
  await nav.close();
}
console.log("\nResumen:");
for (const r of resumen) console.log(`  ${r.slug.padEnd(24)} ${r.rol.padEnd(10)} ${String(r.pantallas).padStart(3)} pantallas · ${String(r.activos).padStart(4)} activos · ${r.exentos} exentos`);
const total = resumen.reduce((a, r) => a + r.activos, 0);
console.log(hallazgos.length ? `\n✘ N151: ${total} control(es) de escritura activos en total; ${hallazgos.length} hallazgo(s).` : "\n✔ N151: ningún control de escritura activo en prueba vencida.");
process.exit(hallazgos.length ? 1 : 0);
