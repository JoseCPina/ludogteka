// QA S49 y R61b en PRODUCCIÓN, con navegador y SIN escribir nada (ningún POST, PATCH ni DELETE sale del navegador,
// salvo la pregunta «¿ya se puede escribir?» del bloqueo, que lee). Nunca en Ludogteka. Sale con 1 si algo falla.
//
//   node scripts/auditoria/qa-s49-prod.mjs [--max 25] [--fotos]
//
//  N152 · prueba-est-tica, la cita que vio QA (/estetica/b3b76b98-…) con Recepción y Estilista: «Reprogramar»,
//         «No se presentó», «Iniciar cita», «Cancelar cita» y el selector «Estilista» bloqueados desde que abre;
//         tocar «Reprogramar» enseña el aviso y NO abre su formulario. El selector de estilista del inicio de
//         Recepción, bloqueado.
//  N153 · En la misma cita, «Confirmación», «Recordatorio» y «Listo para recoger» siguen abiertos (data-sin-bloqueo)
//         y tocarlos enseña el mensaje sin pedir nada al servidor.
//  N154 · En los tres negocios PRUEBA, con Recepción y Admin a 390 px: nada más ancho que la pantalla, ningún scroll
//         horizontal escondido y toda tabla en tarjetas (scripts/auditoria/lib/ancho-pantalla.mjs). /clientes en
//         tarjetas con el teléfono en un renglón.
//  Notas · El menú lateral se cierra con su botón «Cerrar»; en Caja el nombre del servicio de una cuenta no se corta.
//  Vet   · En la clínica demo (no es un negocio de cliente), una consulta en borrador trae «Emitir receta» y la receta
//         abre ligada a esa consulta con el medicamento prellenado del Tratamiento.
import os from "node:os";
import path from "node:path";
import { negocioPrueba, servicioSinNegocio, servicioEn, sesionDe, SLUG_CLINICA, DOMINIO_CLINICA, BASE_CLINICA, LUDOGTEKA_ID } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { desbordesDePantalla } from "./lib/ancho-pantalla.mjs";

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const MAX = Number(arg("--max", "25"));
const FOTOS = process.argv.includes("--fotos");
// `--solo vet`: solo la parte de Veterinaria.
const SOLO = arg("--solo", null);
const CITA = "/estetica/b3b76b98-4aa4-4731-9220-883358429db1";
const foto = (p, nombre) => (FOTOS ? p.screenshot({ path: path.join(os.tmpdir(), `qa-s49-${nombre}.png`), fullPage: false }).catch(() => {}) : null);
const hallazgos = [];
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const patronDe = (r) => r.replace(UUID, ":id").replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, "/:fecha");
const NO_RECORRER = /^\/(api|portal|login|logout|salir|auth|demo|plataforma|alta|l|r|c|p|v|para|blog|legal|privacidad|terminos|aviso|ayuda)(\/|$)|\/(imprimir|pdf|descargar|exportar|csv)(\/|$)|\.(pdf|csv|xlsx|xml|png|jpg|ics|zip)$/i;

const nav = await abrirNavegador();
/** Contexto de solo lectura: cuenta lo que intentó escribir. */
async function contexto(cookies, viewport) {
  const ctx = await nav.newContext(viewport.width < 500 ? { viewport, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport });
  await ctx.addCookies(cookies);
  const c = { ctx, escrituras: 0 };
  await ctx.route("**/*", (r) => {
    const req = r.request();
    const h = req.headers();
    if (h["next-router-prefetch"] || h["purpose"] === "prefetch") return r.abort();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method()) || /\/auth\/v1\/token/.test(req.url())) return r.continue();
    if (h["next-action"] && (req.postData() ?? "").length < 5) return r.continue();
    c.escrituras++;
    return r.abort();
  });
  ctx.on("page", async (p) => { if (await p.opener().catch(() => null)) await p.close().catch(() => {}); });
  return c;
}
async function abrir(ctx, url) {
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.dismiss().catch(() => {}));
  await p.goto(url, { waitUntil: "load" });
  await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(500);
  return p;
}
const bloqueado = (loc) => loc.evaluate((el) => el.getAttribute("aria-disabled") === "true" || el.disabled).catch(() => null);

try {
  // ── N152 y N153 ──────────────────────────────────────────────────────────────────────────────────────────────
  if (SOLO !== "vet") {
  console.log("\n══ N152 / N153 · prueba-est-tica ══");
  const est = await negocioPrueba("prueba-est-tica");
  for (const rol of ["recepcion", "estetica"]) {
    const { ctx, ...c } = await contexto((await est.sesion(rol)).cookies, { width: 1280, height: 900 });
    const cuenta = c;
    const p = await abrir(ctx, est.base + CITA);
    for (const texto of ["Reprogramar", "No se presentó", "Iniciar cita", "Cancelar cita"]) {
      const b = p.locator("main button", { hasText: new RegExp(`^\\s*${texto}\\s*$`) }).first();
      if (!(await b.count())) { console.log(`  · ${rol}: «${texto}» no está en la cita (su estado no lo ofrece)`); continue; }
      if (await bloqueado(b)) bien(`${rol}: «${texto}» bloqueado desde que abre la cita`); else mal(`${rol}: «${texto}» sigue activo`);
    }
    const sel = p.locator("main select").filter({ has: p.locator("option") });
    const estilista = p.locator("[data-estilista] select").first();
    if (await estilista.count()) {
      if (await bloqueado(estilista)) bien(`${rol}: el selector «Estilista» de la cita está bloqueado`); else mal(`${rol}: el selector «Estilista» de la cita sigue activo`);
    } else if (rol === "recepcion") console.log(`  · ${rol}: la cita no trae selector de estilista (${await sel.count()} select en pantalla)`);
    const repro = p.locator("main button", { hasText: /^\s*Reprogramar\s*$/ }).first();
    if (await repro.count()) {
      await repro.click({ force: true });
      await p.waitForTimeout(900);
      const aviso = (await p.locator("[data-aviso-solo-lectura]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
      const abierto = await p.locator("[data-reprogramar]").count();
      if (abierto) mal(`${rol}: tocar «Reprogramar» abrió su formulario`);
      else if (!/La prueba del negocio terminó/.test(aviso)) mal(`${rol}: tocar «Reprogramar» no enseñó el aviso`);
      else bien(`${rol}: tocar «Reprogramar» no abre el formulario y avisa «${aviso.slice(0, 80)}…»`);
      await foto(p, `n152-${rol}-cita`);
    }
    // N153: los avisos por WhatsApp siguen abiertos y no escriben.
    const antes = cuenta.escrituras;
    for (const titulo of ["Confirmación", "Recordatorio", "Listo para recoger"]) {
      const b = p.locator(`[data-avisos-whatsapp] button[data-aviso="${titulo}"]`).first();
      if (!(await b.count())) {
        if (rol === "recepcion") mal(`${rol}: no encontré el aviso «${titulo}»`);
        else console.log(`  · ${rol}: la cita no le enseña el aviso «${titulo}» (no ve el teléfono del cliente)`);
        continue;
      }
      const libre = await b.evaluate((el) => Boolean(el.closest("[data-sin-bloqueo]")) && el.getAttribute("aria-disabled") !== "true");
      await b.click();
      await p.waitForTimeout(500);
      const vista = await p.locator("[data-vista-mensaje]").isVisible().catch(() => false);
      if (libre && vista) bien(`${rol}: «${titulo}» abierto en solo lectura: enseña el mensaje con «Abrir WhatsApp»`);
      else mal(`${rol}: «${titulo}» ${libre ? "no enseñó el mensaje" : "quedó bloqueado"}`);
      await b.click();
    }
    await p.waitForTimeout(600);
    if (cuenta.escrituras === antes) bien(`${rol}: tocar los tres avisos no pidió nada al servidor`); else mal(`${rol}: los avisos intentaron escribir (${cuenta.escrituras - antes})`);
    if (rol === "recepcion") {
      const ini = await abrir(ctx, `${est.base}/recepcion`);
      const s = ini.locator("[data-estilista] select");
      const n = await s.count();
      let activos = 0;
      for (let i = 0; i < n; i++) if (!(await bloqueado(s.nth(i)))) activos++;
      if (!n) console.log("  · recepción: el inicio no trae selectores de estilista hoy");
      else if (activos) mal(`recepción: ${activos} de ${n} selector(es) de estilista del inicio siguen activos`);
      else bien(`recepción: los ${n} selector(es) «Estilista» del inicio están bloqueados`);
      await foto(ini, "n152-recepcion-inicio");
    }
    await ctx.close();
  }

  // ── N154 y notas de móvil, a 390 px ──────────────────────────────────────────────────────────────────────────
  for (const slug of ["prueba-est-tica", "prueba-hotel-guarderia", "prueba-veterinaria"]) {
    console.log(`\n══ N154 · ${slug} a 390 px ══`);
    const n = await negocioPrueba(slug);
    for (const rol of ["recepcion", "admin"]) {
      let s;
      try { s = await n.sesion(rol); } catch (e) { console.log(`  · ${e.message}`); continue; }
      const { ctx } = await contexto(s.cookies, { width: 390, height: 844 });
      const inicio = rol === "admin" ? "/admin" : "/recepcion";
      // El menú lateral, con su botón «Cerrar».
      const p0 = await abrir(ctx, n.base + inicio);
      await p0.locator("header button[aria-controls=menu-lateral-staff]").click().catch(() => {});
      await p0.waitForTimeout(300);
      const cerrar = p0.locator("[data-cerrar-menu]");
      if (await cerrar.isVisible().catch(() => false)) {
        if (slug === "prueba-est-tica" && rol === "recepcion") await foto(p0, "menu-abierto");
        await cerrar.click();
        await p0.waitForTimeout(300);
        if (await p0.locator("#menu-lateral-staff").isVisible().catch(() => false)) mal(`${slug} · ${rol}: «Cerrar» no cierra el menú`);
        else bien(`${slug} · ${rol}: el menú lateral se cierra con «Cerrar»`);
      } else mal(`${slug} · ${rol}: el menú lateral no trae «Cerrar» visible`);
      await p0.close();
      const cola = [inicio, "/clientes", "/caja"];
      const vistos = new Set(cola.map(patronDe));
      let pantallas = 0;
      let tablas = 0;
      let malas = 0;
      while (cola.length && pantallas < MAX) {
        const ruta = cola.shift();
        let p;
        try { p = await abrir(ctx, n.base + ruta); } catch (e) { console.log(`  · ${ruta}: ${String(e.message).split("\n")[0]}`); continue; }
        pantallas++;
        const final = new URL(p.url()).pathname;
        const desbordes = await p.evaluate(desbordesDePantalla).catch(() => []);
        const sinTarjetas = await p.$$eval("main table", (ts) => ts.filter((t) => t.getBoundingClientRect().width > 2 && (!t.classList.contains("tabla-tarjetas") || (t.tHead && getComputedStyle(t.tHead).display !== "none"))).length).catch(() => 0);
        tablas += await p.locator("main table").count();
        if (desbordes.length || sinTarjetas) {
          malas++;
          mal(`${slug} · ${rol} · ${final}: ${[...desbordes.map((d) => `${d.tipo} — ${d.detalle}`), ...(sinTarjetas ? [`${sinTarjetas} tabla(s) sin tarjetas`] : [])].slice(0, 3).join(" | ")}`);
        }
        if (final === "/clientes") {
          const fila = p.locator("main table tbody tr").first();
          if (await fila.count()) {
            const info = await fila.evaluate((tr) => {
              const tel = [...tr.cells].find((c) => /tel/i.test(c.getAttribute("data-label") || ""));
              const r = tel ? tel.getBoundingClientRect() : null;
              const linea = tel ? parseFloat(getComputedStyle(tel).lineHeight) || 20 : 0;
              return { bloque: getComputedStyle(tr).display, ancho: Math.round(tr.getBoundingClientRect().width), etiquetas: [...tr.cells].map((c) => c.getAttribute("data-label")).filter(Boolean), telAlto: r ? Math.round(r.height) : null, linea };
            });
            const pantalla = await p.evaluate(() => document.documentElement.clientWidth);
            if (info.bloque === "block" && info.ancho <= pantalla && info.etiquetas.length) bien(`${slug} · ${rol}: /clientes en tarjetas (${info.ancho} px en ${pantalla}; datos: ${info.etiquetas.join(", ")}${info.telAlto ? `; teléfono de ${info.telAlto} px de alto` : ""})`);
            else mal(`${slug} · ${rol}: /clientes no se ve en tarjetas (${JSON.stringify(info)})`);
            if (slug === "prueba-est-tica" && rol === "recepcion") await foto(p, "n154-clientes-390");
          }
        }
        if (final === "/caja") {
          const d = p.locator("[data-cuenta-descripcion]").first();
          if (await d.count()) {
            const corte = await d.evaluate((el) => { const s = getComputedStyle(el); return s.textOverflow === "ellipsis" || s.whiteSpace === "nowrap"; });
            if (corte) mal(`${slug} · ${rol}: en Caja el servicio de la cuenta se corta con «…»`); else bien(`${slug} · ${rol}: en Caja el servicio de la cuenta se parte en renglones («${(await d.innerText()).slice(0, 60)}»)`);
            if (slug === "prueba-est-tica" && rol === "recepcion") await foto(p, "notas-caja-390");
          }
        }
        const enlaces = await p.$$eval("a[href]", (as) => as.filter((a) => a.getBoundingClientRect().width > 0).map((a) => a.getAttribute("href"))).catch(() => []);
        for (const h of enlaces) {
          if (!h?.startsWith("/")) continue;
          const r = h.split("#")[0];
          const sola = r.split("?")[0];
          if (NO_RECORRER.test(sola) || vistos.has(patronDe(sola))) continue;
          vistos.add(patronDe(sola));
          cola.push(r);
        }
        await p.close();
      }
      console.log(`  · ${slug} · ${rol}: ${pantallas} pantallas a 390 px, ${tablas} tablas, ${malas} con desborde`);
      await ctx.close();
    }
  }

  }

  // ── Vet: «Emitir receta» en la consulta abierta (clínica demo) ───────────────────────────────────────────────
  console.log("\n══ Vet · clínica demo ══");
  const S = servicioSinNegocio();
  const { data: clinica } = await S.from("negocios").select("id").eq("slug", SLUG_CLINICA).single();
  if (!clinica || clinica.id === LUDOGTEKA_ID) throw new Error("No encontré la clínica demo.");
  const C = servicioEn(clinica.id);
  const { data: borradores } = await C.from("vet_consultas").select("id, perro_id, medico_id, tratamiento").eq("negocio_id", clinica.id).eq("estado", "borrador").is("deleted_at", null).order("updated_at", { ascending: false }).limit(5);
  // El texto guía de la plantilla («Medicamento · dosis · vía…») no cuenta como tratamiento (no se prellena).
  const real = (t) => (t ?? "").replace(/^Medicamento · dosis · vía · frecuencia · duración:?/m, "").trim();
  const consulta = (borradores ?? []).find((b) => real(b.tratamiento)) ?? borradores?.[0];
  if (!consulta) mal("la clínica demo no tiene ninguna consulta en borrador para probar");
  else {
    const { data: medico } = await C.from("medicos_veterinarios").select("profile_id").eq("id", consulta.medico_id).single();
    const { ctx } = await contexto((await sesionDe(medico.profile_id, DOMINIO_CLINICA)).cookies, { width: 1280, height: 900 });
    const p = await abrir(ctx, `${BASE_CLINICA}/veterinaria/consulta/${consulta.id}`);
    const boton = p.locator("[data-emitir-receta]").first();
    if (!(await boton.isVisible().catch(() => false))) mal("la consulta en borrador no trae «Emitir receta»");
    else {
      bien("la consulta en borrador trae «Emitir receta»");
      await foto(p, "vet-borrador-emitir-receta");
      await boton.click();
      await p.waitForURL(/\/veterinaria\/recetas\/nueva/, { timeout: 15000 }).catch(() => {});
      if (!/\/veterinaria\/recetas\/nueva/.test(p.url())) {
        console.log("  · el clic no navegó (el guardado está bloqueado en esta prueba): se abre la receta directo");
        await p.goto(`${BASE_CLINICA}/veterinaria/recetas/nueva?perro=${consulta.perro_id}&consulta=${consulta.id}`, { waitUntil: "load" });
      }
      await p.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
      const elegida = await p.locator("a.border-morado", { hasText: /abierta/ }).count();
      const nombreMed = await p.getByLabel("Medicamento", { exact: true }).first().inputValue().catch(() => "");
      const medicamento = nombreMed.trim() ? [nombreMed.trim()] : [];
      if (elegida) bien(`la receta abre ligada a la consulta abierta («· abierta» seleccionada)${medicamento.length ? `, prellenada con «${medicamento[0].slice(0, 60)}» desde el Tratamiento` : real(consulta.tratamiento) ? "" : " (esa consulta no tiene Tratamiento todavía)"}`);
      else mal("la receta no quedó ligada a la consulta abierta");
      if (real(consulta.tratamiento) && !medicamento.length) mal("la consulta tiene Tratamiento y la receta no salió prellenada");
      await foto(p, "vet-receta-desde-borrador");
    }
    await ctx.close();
  }
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n✘ QA S49: ${hallazgos.length} hallazgo(s).` : "\n✔ QA S49: todo en orden en producción.");
process.exit(hallazgos.length ? 1 : 0);
