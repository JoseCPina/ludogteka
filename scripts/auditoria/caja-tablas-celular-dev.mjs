// Tablas de Caja y Reportes en celular (SOLO DESARROLLO), en Huellitas, con el servidor en el 3001.
//   node scripts/auditoria/caja-tablas-celular-dev.mjs
// El historial de turnos cerrados y la tabla de diferencias del cierre recortaban «Esperado» y «Diferencia» a 390 px.
// Ahora cada fila de esas tablas (y las de Reportes) es una tarjeta con todas sus cifras, sin desborde horizontal.
// Comprueba a 390 y 1280 px, con diferencias positiva, negativa y en cero. Deja Huellitas sin turno abierto.
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const MARCA = "ZZTABLAS";
const BASE = "http://huellitas.localhost:3001";
const { data: h } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = h.id;
const SH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const idAdmin = (await SH.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1).single()).data.profile_id;
const adminJ = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(idAdmin)}`, "x-negocio-id": H } } });

async function cookies() {
  const { data: u } = await A.auth.admin.getUserById(idAdmin);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const gal = (n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, i) => [`${n}.${i}`, t]));
  return [...gal(`sb-${REF}-auth-token`), ...gal(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const abierto = async () => (await SH.from("turnos_caja").select("id").eq("negocio_id", H).eq("estado", "abierto").maybeSingle()).data;
async function cerrar(id, efectivo, explicacion) {
  const r = await adminJ.rpc("cerrar_turno", { p_turno_id: id, p_conteo_efectivo: efectivo, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: explicacion, p_notas_cierre: MARCA });
  if (r.error) throw new Error(r.error.message);
  return Array.isArray(r.data) ? r.data[0] : r.data;
}
async function cerrarConLoEsperado(id) {
  const r1 = await cerrar(id, 0, null);
  if (r1.cerrado) return;
  const r2 = await cerrar(id, r1.esperado_efectivo, null);
  if (!r2.cerrado) throw new Error("no cerró");
}

// Un chequeo común: nada se sale de la pantalla y las tarjetas muestran todas sus cifras.
async function revisar(p, nombre, ancho) {
  const r = await p.evaluate((w) => {
    const sobra = document.documentElement.scrollWidth - window.innerWidth;
    const tablas = [...document.querySelectorAll("table.tabla-tarjetas")].map((t) => {
      const filas = [...t.querySelectorAll("tbody tr")];
      const fuera = [...t.querySelectorAll("tbody td")].filter((td) => td.getBoundingClientRect().right > window.innerWidth + 1).length;
      const etiquetas = new Set([...t.querySelectorAll("tbody td")].map((td) => td.getAttribute("data-label")).filter(Boolean));
      const thead = getComputedStyle(t.querySelector("thead")).display;
      const celdasConEtiqueta = [...t.querySelectorAll("tbody td")].filter((td) => !td.matches(":first-child") && !td.getAttribute("data-label")).length;
      const sinCargar = t.scrollWidth - t.clientWidth;
      return { filas: filas.length, fuera, etiquetas: [...etiquetas], thead, celdasSinEtiqueta: celdasConEtiqueta, sobraTabla: sinCargar, contenedor: t.parentElement.scrollWidth - t.parentElement.clientWidth };
    });
    return { sobra, tablas, w };
  }, ancho);
  if (r.sobra > 1) hallazgo(`${nombre} a ${ancho} px: la página se desborda ${r.sobra} px`);
  for (const [i, t] of r.tablas.entries()) {
    if (t.fuera) hallazgo(`${nombre} a ${ancho} px, tabla ${i + 1}: ${t.fuera} celdas fuera de la pantalla`);
    if (t.celdasSinEtiqueta) hallazgo(`${nombre}, tabla ${i + 1}: ${t.celdasSinEtiqueta} celdas sin data-label`);
    if (ancho < 640 && (t.thead !== "none" || t.contenedor > 1)) hallazgo(`${nombre} a ${ancho} px, tabla ${i + 1}: encabezado ${t.thead}, contenedor desborda ${t.contenedor}`);
  }
  bien(`${nombre} a ${ancho} px: ${r.tablas.length} tabla(s) como tarjetas, sin desborde`);
  return r;
}

const nav = await abrirNavegador();
try {
  const previo = await abierto();
  if (previo) await cerrarConLoEsperado(previo.id);

  console.log("1. Tres turnos cerrados: diferencia positiva, negativa y en cero");
  for (const [fondo, dif] of [[100, 75], [100, -40], [100, 0]]) {
    const { error } = await adminJ.from("turnos_caja").insert({ fondo_inicial: fondo, notas_apertura: MARCA });
    if (error) throw new Error(error.message);
    const t = await abierto();
    const r = await cerrar(t.id, fondo + dif, dif === 0 ? null : `${MARCA} diferencia`);
    if (!r.cerrado) { const r2 = await cerrar(t.id, fondo + dif, `${MARCA} diferencia`); if (!r2.cerrado) throw new Error("no cerró"); }
  }
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(await cookies());
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  for (const ancho of [390, 1280]) {
    await p.setViewportSize({ width: ancho, height: 900 });
    await p.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle", timeout: 120000 });
    const r = await revisar(p, "Historial de turnos", ancho);
    const hist = await p.locator("table.tabla-tarjetas").first().evaluate((t) => t.closest("li").innerText);
    if (!r.tablas.length) hallazgo(`el historial no trae tabla a ${ancho} px`);
    const cifras = await p.locator("li", { has: p.locator("table.tabla-tarjetas") }).first().locator("td").allInnerTexts();
    const texto = cifras.join(" | ");
    if (!/\$0\.00/.test(texto)) hallazgo(`${ancho} px: no se ven las cifras (${texto.slice(0, 120)})`);
    if (ancho === 390) {
      const etiquetas = await p.locator("li table.tabla-tarjetas td").first().evaluate((el) => [...el.closest("tbody").querySelectorAll("td")].map((c) => c.getAttribute("data-label")).filter(Boolean));
      for (const e of ["Contado", "Esperado", "Diferencia"]) if (!etiquetas.includes(e)) hallazgo(`falta la etiqueta ${e}`);
      // Las diferencias de los tres turnos (+, − y 0) están en pantalla.
      const todo = (await p.locator("ul li table.tabla-tarjetas tbody td[data-label='Diferencia']").allInnerTexts()).join(" ");
      for (const v of ["+$75.00", "$0.00"]) if (!todo.includes(v)) hallazgo(`no se ve la diferencia ${v} (${todo.slice(0, 160)})`);
      if (!/-\$40\.00|−\$40\.00/.test(todo)) hallazgo(`no se ve la diferencia negativa (${todo.slice(0, 160)})`);
      await p.screenshot({ path: "/tmp/claude-0/-home-user-ludogteka/e86365ff-dff3-529f-8c45-6d8bb214cae7/scratchpad/historial-390.png", fullPage: false });
    }
    void hist;
  }

  console.log("2. Tabla de diferencias al cerrar un turno (con diferencia)");
  const ins = await adminJ.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: MARCA });
  if (ins.error) throw new Error(`abrir turno: ${ins.error.message}`);
  for (const ancho of [390, 1280]) {
    if (ancho === 1280) { // el primer intento ya envió el conteo: se vuelve a empezar la pantalla
      await p.reload({ waitUntil: "networkidle" });
    }
    await p.setViewportSize({ width: ancho, height: 900 });
    await p.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle", timeout: 120000 });
    await p.getByRole("button", { name: /Cerrar turno/ }).first().click();
    await p.getByLabel("Efectivo contado").fill("37");
    await p.getByLabel(/^Terminal/).fill("0");
    await p.getByLabel("Transferencia").fill("0");
    await p.getByRole("button", { name: "Enviar conteo" }).click();
    await p.getByText("Hay diferencia contra lo que esperaba el sistema").waitFor({ timeout: 45000 }).catch(async () => hallazgo(`${ancho} px: no salió la tabla de diferencias · ${(await p.locator("main").innerText()).replace(/\s+/g, " ").slice(0, 300)}`));
    await revisar(p, "Cierre con diferencia", ancho);
    if (ancho === 390) await p.screenshot({ path: "/tmp/claude-0/-home-user-ludogteka/e86365ff-dff3-529f-8c45-6d8bb214cae7/scratchpad/cierre-390.png" });
  }

  console.log("3. Reportes");
  for (const ancho of [390, 1280]) {
    await p.setViewportSize({ width: ancho, height: 900 });
    await p.goto(`${BASE}/reportes?desde=2026-01-01&hasta=2026-12-31`, { waitUntil: "networkidle", timeout: 120000 });
    const r = await revisar(p, "Reportes", ancho);
    if (r.tablas.length < 2) hallazgo(`Reportes a ${ancho} px solo trae ${r.tablas.length} tabla(s) con tarjetas`);
  }
  await ctx.close();
} finally {
  await nav.close();
  const t = await abierto();
  if (t) await cerrarConLoEsperado(t.id).catch(() => {});
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
