// Nada flotante tapa un botón en el celular (QA N26, 17 de octubre de 2026). SOLO DESARROLLO, en Huellitas, con
// `npm run build && npm run start -- -p 3001`.
//   node scripts/auditoria/flotantes-celular-dev.mjs
//
// El botón flotante «Instalar la app» tapaba «Crear cliente», «Agendar cita», «Emitir receta», «Vía de
// administración» y el texto de descuentos en Caja, y no se podía cerrar. Esta prueba, a 393 × 852 px:
//  1. recorre las pantallas con formulario o botón final y, para cada botón, campo y enlace de la pantalla, lo lleva
//     al centro y pregunta qué hay en ese punto: si es otra cosa (algo fijo o pegado encima), es hallazgo;
//  2. revisa el aviso de instalar: sale en el flujo (no flota), se cierra y no vuelve; «Instalar la app» sigue en el
//     menú; con la app instalada no sale ninguno de los dos.
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const BASE = "http://huellitas.localhost:3001";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
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

// Lo que el navegador ofrece para instalar (Chrome lo manda solo cuando cumple sus reglas; aquí se simula).
const SIMULAR_INSTALABLE = () => {
  setTimeout(() => {
    const e = new Event("beforeinstallprompt", { cancelable: true });
    e.prompt = async () => {};
    e.userChoice = Promise.resolve({ outcome: "dismissed" });
    window.dispatchEvent(e);
  }, 300);
};
const COMO_INSTALADA = () => {
  const original = window.matchMedia.bind(window);
  window.matchMedia = (q) => (q.includes("display-mode: standalone") ? { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false } : original(q));
};

// ¿Qué tapa a cada control? Se lleva al centro y se pregunta qué elemento está en su punto medio.
async function tapados(p) {
  return p.evaluate(async () => {
    const espera = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const controles = [...document.querySelectorAll("main button, main input:not([type=hidden]), main select, main textarea, main a[href]")].filter((el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 4 && r.height > 4 && s.visibility !== "hidden" && s.display !== "none" && !el.closest("[hidden], details:not([open])");
    });
    const malos = [];
    for (const el of controles.slice(0, 160)) {
      el.scrollIntoView({ block: "center", inline: "nearest" });
      await espera();
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 1), window.innerWidth - 2);
      const y = Math.min(Math.max(r.top + r.height / 2, 1), window.innerHeight - 2);
      const arriba = document.elementFromPoint(x, y);
      if (!arriba || arriba === el || el.contains(arriba) || arriba.contains(el) || (el.labels && [...el.labels].some((l) => l.contains(arriba)))) continue;
      // Solo cuenta lo fijo o pegado (lo flotante); un elemento que se encime en el flujo es otro problema.
      let n = arriba;
      let flota = null;
      while (n && n !== document.body) {
        const pos = getComputedStyle(n).position;
        if (pos === "fixed" || pos === "sticky") { flota = n; break; }
        n = n.parentElement;
      }
      if (!flota || flota.contains(el)) continue;
      const nombre = (el.innerText || el.getAttribute("aria-label") || el.getAttribute("name") || el.getAttribute("placeholder") || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
      const quien = (flota.getAttribute("data-testid") || flota.innerText || flota.className || flota.tagName).toString().trim().replace(/\s+/g, " ").slice(0, 60);
      malos.push(`«${nombre}» tapado por «${quien}»`);
    }
    return { revisados: Math.min(controles.length, 160), malos };
  });
}

const cuentas = [];
const nav = await abrirNavegador();
try {
  const { data: perro } = await SH.from("perros").select("id, cliente_id").eq("negocio_id", H).is("deleted_at", null).order("created_at").limit(1).single();
  const { data: cli } = await SH.from("clientes").select("id").eq("negocio_id", H).eq("publico_general", false).is("deleted_at", null).order("created_at").limit(1).single();
  const v = await adminJ.rpc("crear_venta_mostrador", { p_cliente_id: cli.id, p_lineas: [{ concepto: "ZZFLOTANTES concepto", precio: 300, cantidad: 1 }], p_notas: "ZZFLOTANTES" });
  if (v.error) throw new Error(v.error.message);
  cuentas.push(v.data);

  const RUTAS = [
    "/clientes/nuevo", "/estetica/nueva", "/guarderia/nueva", "/hotel/nueva", "/guarderia/series/nueva", "/hotel/series/nueva",
    `/caja/cobrar/${v.data}`, "/caja/venta", "/caja/cargo", "/caja/pases", "/caja/turno", "/caja",
    "/empleados/nuevo", "/servicios/nuevo", "/inventario/nuevo", "/inventario/equipo/nuevo", "/inventario/proveedores/nuevo",
    "/ayuda/tickets/nuevo", "/admin/perfil", "/admin/politicas", "/admin",
    "/veterinaria/agenda/nueva", `/veterinaria/recetas/nueva?perro=${perro.id}`, "/veterinaria/recetas/sitpv/nuevo", "/veterinaria/certificados/nuevo",
    "/veterinaria/estimados/nuevo", "/veterinaria/inventario/nuevo", "/veterinaria/ajustes",
    `/perros/${perro.id}`, `/clientes/${perro.cliente_id}`,
  ];

  console.log("1. A 393 px, con el aviso de instalar visible: nada flotante tapa un control");
  const ctx = await nav.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await ctx.addCookies(await cookies());
  await ctx.addInitScript(SIMULAR_INSTALABLE);
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  // Control de la prueba: un botón flotante puesto a propósito abajo TIENE que salir como hallazgo.
  await p.goto(`${BASE}/clientes/nuevo`, { waitUntil: "networkidle", timeout: 120000 });
  await p.evaluate(() => {
    const d = document.createElement("div");
    d.textContent = "Botón flotante de control";
    d.style.cssText = "position:fixed;left:16px;bottom:16px;width:220px;height:60px;z-index:50;background:#000";
    document.body.appendChild(d);
  });
  const control = await tapados(p);
  if (control.malos.length) bien(`control: la prueba sí detecta un flotante que tapa (${control.malos[0]})`);
  else hallazgo("control: un botón flotante puesto a propósito no se detectó (la prueba no sirve)");
  for (const ruta of RUTAS) {
    try {
      const r = await p.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 120000 });
      if (!r || r.status() >= 400) { console.log(`  · ${ruta}: ${r?.status()} (sin revisar)`); continue; }
      await p.waitForTimeout(400);
      const { revisados, malos } = await tapados(p);
      if (malos.length) hallazgo(`${ruta}: ${malos.slice(0, 4).join("; ")}${malos.length > 4 ? ` y ${malos.length - 4} más` : ""}`);
      else bien(`${ruta}: ${revisados} controles, ninguno tapado`);
    } catch (e) {
      hallazgo(`${ruta}: no se pudo revisar (${e instanceof Error ? e.message.split("\n")[0] : e})`);
    }
  }

  console.log("2. El aviso de instalar");
  await p.evaluate(() => localStorage.removeItem("peludesk_aviso_instalar_cerrado"));
  await p.goto(`${BASE}/clientes/nuevo`, { waitUntil: "networkidle" });
  const aviso = p.locator("[data-aviso-instalar]");
  await aviso.waitFor({ timeout: 10000 }).catch(() => hallazgo("el aviso de instalar no salió con el navegador ofreciendo instalar"));
  if (await aviso.count()) {
    const pos = await aviso.evaluate((el) => { let n = el; while (n) { const s = getComputedStyle(n).position; if (s === "fixed" || s === "sticky") return s; n = n.parentElement; } return "flujo"; });
    if (pos !== "flujo") hallazgo(`el aviso de instalar flota (${pos})`); else bien("el aviso de instalar va en el flujo de la página (no tapa nada)");
    await p.locator("[data-cerrar-aviso-instalar]").click();
    if (await aviso.count()) hallazgo("el aviso no se cerró"); else bien("se cierra");
    await p.reload({ waitUntil: "networkidle" });
    await p.waitForTimeout(800);
    if (await aviso.count()) hallazgo("el aviso volvió después de cerrarlo"); else bien("y no vuelve a salir (recuerda que se cerró)");
  }
  await p.locator("button[aria-controls='menu-lateral-staff']").click();
  const menu = p.locator("#menu-lateral-staff [data-instalar-menu]");
  if (await menu.count()) bien("«Instalar la app» sigue en el menú"); else hallazgo("«Instalar la app» no está en el menú");
  if (await menu.count()) {
    await menu.click();
    bien("el botón del menú abre el aviso del navegador o dice cómo instalarla");
  }
  if (await p.locator("[data-testid='instalar-app']").count()) hallazgo("sigue existiendo el botón flotante «Instalar la app»");
  await ctx.close();

  console.log("3. Con la app ya instalada");
  const ctx2 = await nav.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  await ctx2.addCookies(await cookies());
  await ctx2.addInitScript(COMO_INSTALADA);
  await ctx2.addInitScript(SIMULAR_INSTALABLE);
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle", timeout: 120000 });
  await p2.waitForTimeout(800);
  await p2.locator("button[aria-controls='menu-lateral-staff']").click();
  const hay = (await p2.locator("[data-aviso-instalar]").count()) + (await p2.locator("[data-instalar-menu]").count());
  if (hay) hallazgo("con la app instalada todavía se ofrece instalarla"); else bien("instalada: ni aviso ni opción en el menú");
  await ctx2.close();
} finally {
  await nav.close();
  for (const c of cuentas) await adminJ.rpc("cancelar_cuenta", { p_reserva_id: c, p_motivo: "error_captura", p_motivo_texto: "ZZFLOTANTES", p_cancelar_cita: false }).then(() => {}, () => {});
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
