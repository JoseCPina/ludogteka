// Ningún botón ni enlace lleva a una página que la persona no puede abrir (QA N127) — SOLO DESARROLLO, en Huellitas,
// con `next start` en el 3001.
//
//   node scripts/auditoria/permisos-pantalla-dev.mjs [--roles admin,recepcion,estetica] [--max 220] [--botones 20] [--sin-botones] [--ver]
//
// Entra con cada rol del personal (estética, recepción con sus permisos de siempre, una «encargada» de recepción con
// los permisos de administrar, un médico veterinario designado, y admin) y recorre la app desde su
// menú siguiendo los enlaces que ve. En cada pantalla:
//   1. revisa cada enlace visible (uno por destino): si la página de destino lo regresa (al inicio de su rol, a la
//      página de arriba, a «módulo apagado», a /sin-acceso o a /login), responde 401/403 o solo dice «No tienes
//      acceso», es un hallazgo;
//   2. aprieta cada botón visible (con TODA escritura bloqueada: ningún POST, PATCH ni DELETE sale del navegador,
//      así que ninguna acción de servidor ni llamada a la base se ejecuta) y, si el botón navega, revisa a dónde
//      llegó; si abre un diálogo o un menú, revisa los enlaces que aparecen.
// Lo que una acción de servidor respondería no se puede ver sin ejecutarla: eso lo cubre la base (RLS y guardias).
//
// Perfil «prueba vencida» (QA N151, `--perfil prueba-vencida`): pone a Huellitas con la prueba vencida mientras corre
// (y la deja como estaba) y, además de lo anterior, en cada pantalla falla si encuentra un botón, enlace o campo de
// ESCRITURA activo (definición propia: scripts/auditoria/lib/escritura-pantalla.mjs), si la franja de arriba no dice
// lo que le toca al rol, o si apretar un botón que no está marcado `data-sin-bloqueo` intenta escribir. QA N152: también
// falla si un select, casilla o interruptor que guarda al cambiar queda activo, si apretar un botón activo ABRE un
// formulario (aparecen campos para llenar), o si un buscador o filtro (lo que lee) quedó bloqueado.
//
// Prende un momento todos los módulos de Huellitas para recorrer Empleados, Reportes, Gastos y Contratos, y los deja
// como estaban al terminar. Sale con 1 si encuentra algo. Con `--json <archivo>` deja el detalle.
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { camposDeEscrituraVisibles, controlesDeEscritura, franjaEsperada } from "./lib/escritura-pantalla.mjs";
import { designarMedicoTemporal, quitarMedicoTemporal } from "./lib/medico-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const ROLES = arg("--roles", "estetica,recepcion,encargada,medico,admin").split(",");
const MAX_PANTALLAS = Number(arg("--max", "220"));
const MAX_BOTONES = Number(arg("--botones", "20"));
const CON_BOTONES = !process.argv.includes("--sin-botones");
const SALIDA_JSON = arg("--json", null);
const PRUEBA_VENCIDA = arg("--perfil", "") === "prueba-vencida";

const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
// «encargada»: otra persona de recepción con los permisos de administrar (se los da esta corrida y se los quita al
// terminar), para ver lo que recepción alcanza dentro de Administración.
const { data: otraRecepcion } = await SB.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").neq("profile_id", datos.recepcionB).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
// «medico»: un médico veterinario designado (la cuenta de estética que está en los dos negocios; scripts/auditoria/lib/medico-dev.mjs).
const CUENTAS = { admin: datos.adminB, recepcion: datos.recepcionB, estetica: datos.esteticaB, encargada: otraRecepcion?.profile_id, medico: datos.esteticaAmbos };
const INICIO = { admin: "/admin", recepcion: "/recepcion", estetica: "/estetica", encargada: "/recepcion", medico: "/veterinaria" };
const PERMISOS_ENCARGADA = ["personal", "configuracion_negocio", "tarifas", "reportes_financieros", "nomina", "gastos", "inventario_costos"];

// ── Módulos: todos prendidos mientras corre, y de regreso como estaban ──────────────────────────────────────────
// Lo de antes queda en un archivo: si una corrida se corta a la fuerza, la siguiente lo restaura primero.
const ESTADO = path.join(os.tmpdir(), "peludesk-permisos-pantalla-modulos.json");
let antes;
if (fs.existsSync(ESTADO)) {
  antes = JSON.parse(fs.readFileSync(ESTADO, "utf8"));
  console.log("  · una corrida anterior no terminó: se usan los módulos que había antes de ella");
} else {
  antes = (await SB.from("negocio_modulos").select("id, modulo, activo").eq("negocio_id", B).is("deleted_at", null)).data ?? [];
  fs.writeFileSync(ESTADO, JSON.stringify(antes));
}
// Los permisos que esta corrida le da a la encargada (los que ya tenía no se tocan).
const ESTADO_PERMISOS = path.join(os.tmpdir(), "peludesk-permisos-pantalla-permisos.json");
let permisosDados = fs.existsSync(ESTADO_PERMISOS) ? JSON.parse(fs.readFileSync(ESTADO_PERMISOS, "utf8")) : [];
async function quitarPermisos() {
  if (permisosDados.length) await SB.from("permisos_staff").update({ deleted_at: new Date().toISOString() }).in("id", permisosDados);
  permisosDados = [];
  fs.rmSync(ESTADO_PERMISOS, { force: true });
}
await quitarPermisos();
if (ROLES.includes("encargada")) {
  if (!CUENTAS.encargada) throw new Error("Huellitas no tiene una segunda persona de recepción para la encargada.");
  const { data: ya } = await SB.from("permisos_staff").select("permiso").eq("negocio_id", B).eq("profile_id", CUENTAS.encargada).is("revocado_at", null).is("deleted_at", null);
  const faltan = PERMISOS_ENCARGADA.filter((p) => !(ya ?? []).some((x) => x.permiso === p));
  if (faltan.length) {
    const r = await SB.from("permisos_staff").insert(faltan.map((permiso) => ({ negocio_id: B, profile_id: CUENTAS.encargada, permiso }))).select("id");
    if (r.error) throw new Error(`permisos de la encargada: ${r.error.message}`);
    permisosDados = r.data.map((x) => x.id);
    fs.writeFileSync(ESTADO_PERMISOS, JSON.stringify(permisosDados));
  }
}
const { data: catalogo } = await SB.from("modulos").select("clave");
const TODOS = (catalogo ?? []).map((m) => m.clave);
// Perfil prueba vencida: el plan y el fin de la prueba de Huellitas, guardados para dejarlos como estaban.
const ESTADO_PRUEBA = path.join(os.tmpdir(), "peludesk-permisos-pantalla-prueba.json");
async function restaurarPrueba() {
  if (!fs.existsSync(ESTADO_PRUEBA)) return;
  const n = JSON.parse(fs.readFileSync(ESTADO_PRUEBA, "utf8"));
  const r = await SB.from("negocios").update({ plan: n.plan, prueba_termina_at: n.prueba_termina_at }).eq("id", B);
  if (r.error) throw new Error(`no se pudo devolver el plan de Huellitas: ${r.error.message}`);
  fs.rmSync(ESTADO_PRUEBA, { force: true });
  console.log("  · plan de Huellitas como estaba");
}
await restaurarPrueba();
// El médico se designa con el negocio escribible (antes de vencer la prueba).
if (ROLES.includes("medico")) await designarMedicoTemporal({ B, adminId: datos.adminB, profileId: CUENTAS.medico });
if (PRUEBA_VENCIDA) {
  const { data: n } = await SB.from("negocios").select("plan, prueba_termina_at").eq("id", B).single();
  fs.writeFileSync(ESTADO_PRUEBA, JSON.stringify(n));
  const r = await SB.from("negocios").update({ plan: "prueba", prueba_termina_at: new Date(Date.now() - 86_400_000).toISOString() }).eq("id", B);
  if (r.error) throw new Error(`no se pudo vencer la prueba de Huellitas: ${r.error.message}`);
  const { data: estado } = await SB.rpc("estado_cobro_en", { p_negocio_id: B });
  if (estado !== "prueba_vencida") { await restaurarPrueba(); throw new Error(`Huellitas no quedó en prueba vencida (${estado}).`); }
  console.log("  · Huellitas con la prueba vencida mientras corre");
}

let restaurado = false;
async function restaurarModulos() {
  if (restaurado) return;
  restaurado = true;
  await restaurarPrueba();
  await quitarMedicoTemporal();
  const tenia = new Map((antes ?? []).map((m) => [m.modulo, m]));
  for (const clave of TODOS) {
    const m = tenia.get(clave);
    if (m) await SB.from("negocio_modulos").update({ activo: m.activo }).eq("id", m.id);
    else await SB.from("negocio_modulos").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).eq("modulo", clave).is("deleted_at", null);
  }
  fs.rmSync(ESTADO, { force: true });
  await quitarPermisos();
  console.log("  · módulos y permisos de Huellitas como estaban");
}
for (const senal of ["SIGINT", "SIGTERM"]) process.on(senal, async () => { await restaurarModulos(); process.exit(130); });
for (const clave of TODOS) {
  const m = (antes ?? []).find((x) => x.modulo === clave);
  const r = m ? await SB.from("negocio_modulos").update({ activo: true }).eq("id", m.id) : await SB.from("negocio_modulos").insert({ negocio_id: B, modulo: clave, activo: true });
  if (r.error) console.log(`  · no se pudo prender ${clave}: ${r.error.message}`);
}

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

// ── Reglas del recorrido ────────────────────────────────────────────────────────────────────────────────────────
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
// Los artículos y videos de ayuda comparten pantalla (y sus links pasan todos por EnlaceOTexto): uno de cada uno.
const patronDe = (ruta) => ruta.replace(/^\/ayuda\/(videos\/)?(?!tickets$|videos$|pedir-ayuda$)[a-z0-9-]+$/, "/ayuda/$1:articulo").replace(UUID, ":id").replace(/\/\d{4}-\d{2}-\d{2}(?=\/|$)/g, "/:fecha").replace(/\/\d+(?=\/|$)/g, "/:n");
// Lo que no se recorre: fuera del personal, descargas, impresiones y lo que cierra la sesión.
const NO_RECORRER = /^\/(api|portal|login|logout|salir|auth|demo|plataforma|alta|l|r|c|p|v|para|blog|legal|privacidad|terminos|aviso)(\/|$)|\/(imprimir|pdf|descargar|exportar|csv)(\/|$)|\.(pdf|csv|xlsx|xml|png|jpg|ics|zip)$|\/xml$/i;
// Cámara, micrófono y archivos abren ventanas del sistema que se quedan esperando: no se aprietan.
const BOTON_PROHIBIDO = /cerrar sesi[oó]n|^salir$|cambiar de negocio|instalar|imprimir|descargar|exportar|foto|video|galer[ií]a|c[aá]mara|subir|archivo|dictar|grabar|micr[oó]fono/i;
// QA S53 (N155): pantallas que abren un formulario por parámetro de la URL (se recorren también con él puesto).
const VARIANTES_EDICION = [
  [/^\/estetica\/[0-9a-f-]{36}$/i, "reprogramar=1"],
  [/^\/veterinaria\/recetas\/especial$/, "nuevo=1"],
];
const destinoMalo = (rol, origen, destino) => {
  if (["/login", "/sin-acceso", "/modulo-apagado"].includes(destino)) return true;
  if (REDIRECCIONES_LEGITIMAS.some((r) => r.test(origen))) return false;
  if (destino === INICIO[rol] && origen !== INICIO[rol] && !origen.startsWith(`${INICIO[rol]}?`)) return true;
  // Regresar a la página de arriba (/empleados/nomina → /empleados) es el guardia de una página que no le toca.
  return destino !== "/" && origen.startsWith(`${destino}/`);
};
// Páginas que llevan a otra por diseño, para todos los roles.
const REDIRECCIONES_LEGITIMAS = [/^\/admin\/configuracion(\?|$)/, /^\/reservas\/estancias\/[^/]+$/, /^\/veterinaria\/expediente\?/];

// Se pide desde Node, sin seguir la redirección: basta con ver a dónde manda (Location). Una página que responde 200
// se lee hasta 20 s buscando «No tienes acceso» (sin esperar a que termine de pintarse lo demás).
// Node no resuelve *.localhost: se va a 127.0.0.1 con el Host del negocio.
function pedir(ruta, cookie) {
  const u = new globalThis.URL(BASE + ruta);
  return new Promise((resolver) => {
    let listo = false;
    const fin = (v) => { if (!listo) { listo = true; resolver(v); } };
    const req = http.request(
      { host: "127.0.0.1", port: u.port, path: u.pathname + u.search, method: "GET", headers: { host: u.host, cookie, accept: "text/html" } },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          return fin({ status, final: new globalThis.URL(res.headers.location ?? "/", BASE).pathname, html: false });
        }
        let cuerpo = "";
        res.setEncoding("utf8");
        res.on("data", (c) => {
          cuerpo += c;
          if (cuerpo.includes("No tienes acceso")) { fin({ status, final: u.pathname, html: true }); req.destroy(); }
        });
        res.on("end", () => fin({ status, final: u.pathname, html: false }));
        res.on("error", () => fin({ status, final: u.pathname, html: false }));
      }
    );
    req.setTimeout(20_000, () => { fin({ status: 0, final: "", html: false, error: "tope" }); req.destroy(); });
    req.on("error", (e) => fin({ status: 0, final: "", html: false, error: String(e) }));
    req.end();
  });
}

const hallazgos = [];
const porRol = {};
const avisos = [];

const cerrarConTope = (promesa) => Promise.race([promesa.catch(() => {}), new Promise((r) => setTimeout(r, 10_000))]);

async function recorrer(rol) {
  // Un navegador por rol. Si una pantalla lo deja colgado (con un solo proceso de render se cuelgan todas las
  // pestañas), se cierra y se abre otro con sesión nueva.
  let nav = null;
  let ctx = null;
  let bloqueadas = 0;
  async function arrancar() {
    if (nav) await cerrarConTope(nav.close());
    pagina = null;
    nav = await abrirNavegador();
    ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(await cookiesDe(CUENTAS[rol]));
    // Ninguna escritura sale del navegador: ni acciones de servidor ni llamadas a la base.
    await ctx.route("**/*", (r) => {
      const m = r.request().method();
      // Next precarga cada enlace visible: cientos por pantalla, que saturan al servidor. Se cortan.
      const h = r.request().headers();
      if (h["next-router-prefetch"] || h["purpose"] === "prefetch") return r.abort();
      if (m === "GET" || m === "HEAD" || m === "OPTIONS") return r.continue();
      // La sesión se renueva por POST a Auth: eso no escribe datos del negocio.
      if (/\/auth\/v1\/token/.test(r.request().url())) return r.continue();
      // La pregunta «¿ya se puede escribir?» del bloqueo (acción del servidor sin argumentos) es una lectura.
      if (PRUEBA_VENCIDA && h["next-action"] && (r.request().postData() ?? "").length < 5) return r.continue();
      bloqueadas++;
      return r.abort();
    });
    // Lo que un botón abra en otra pestaña se cierra.
    ctx.on("page", async (p) => { if (await p.opener().catch(() => null)) await p.close().catch(() => {}); });
    await pestanaNueva();
  }
  // Una pestaña nueva por pantalla: una navegación que un botón dejó pendiente no alcanza a la siguiente.
  let pagina = null;
  async function pestanaNueva() {
    if (pagina) await cerrarConTope(pagina.close());
    pagina = await ctx.newPage();
    pagina.on("dialog", (d) => d.dismiss().catch(() => {}));
  }
  // QA S53 (N156): el médico se recorre con Estética APAGADA (así vive una clínica; la corrida la vuelve a prender al
  // terminar con él, y la restauración final la deja como estaba).
  if (rol === "medico") {
    const r = await SB.from("negocio_modulos").update({ activo: false }).eq("negocio_id", B).eq("modulo", "estetica").is("deleted_at", null);
    if (r.error) throw new Error(`no se pudo apagar Estética para el médico: ${r.error.message}`);
  }
  await arrancar();

  const malos = new Map(); // clave → hallazgo (uno por pantalla + botón + destino)
  let exentosEscritura = 0;
  const reportarEscritura = (pantalla, motivo) => {
    const clave = `${patronDe(pantalla)} | escritura | ${motivo}`;
    if (malos.has(clave)) return;
    const h = { rol, pantalla, boton: motivo, destino: "", motivo: "prueba vencida" };
    malos.set(clave, h);
    hallazgos.push(h);
    console.log(`  ✘ [${rol}] ${pantalla} · ${motivo}`);
  };
  const reportar = (pantalla, etiqueta, destino, motivo) => {
    const clave = `${patronDe(pantalla)} | ${etiqueta} | ${patronDe(destino)}`;
    if (malos.has(clave)) return;
    const h = { rol, pantalla, boton: etiqueta, destino, motivo };
    malos.set(clave, h);
    hallazgos.push(h);
    console.log(`  ✘ [${rol}] ${pantalla} · «${etiqueta}» → ${destino}: ${motivo}`);
  };

  // Un destino se juzga una vez por patrón (todas las fichas de cliente se comportan igual).
  const juicio = new Map();
  async function juzgar(href) {
    const ruta = href.split("#")[0];
    const llave = patronDe(ruta.split("?")[0]) + (ruta.includes("?") ? "?" : "");
    if (juicio.has(llave)) return juicio.get(llave);
    const promesa = juzgarAhora(ruta);
    juicio.set(llave, promesa);
    return promesa;
  }
  async function juzgarAhora(ruta) {
    const cookie = (await ctx.cookies(BASE)).map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await pedir(ruta, cookie);
    const origen = ruta.split("?")[0];
    let motivo = null;
    if (r.status === 401 || r.status === 403) motivo = `responde ${r.status}`;
    else if (r.final && r.final !== origen && destinoMalo(rol, ruta, r.final)) motivo = `lo regresa a ${r.final}`;
    else if (r.html) motivo = "la página solo dice «No tienes acceso»";
    if (r.status === 404) avisos.push(`[${rol}] ${ruta} responde 404`);
    if (r.status >= 500) avisos.push(`[${rol}] ${ruta} responde ${r.status}`);
    return motivo;
  }

  const enlacesVisibles = () =>
    pagina.$$eval("a[href]", (as) =>
      as
        .filter((a) => { const r = a.getBoundingClientRect(); const s = getComputedStyle(a); return r.width > 0 && r.height > 0 && s.visibility !== "hidden"; })
        .map((a) => ({ href: a.getAttribute("href"), texto: (a.innerText || a.getAttribute("aria-label") || a.title || "").trim().replace(/\s+/g, " ").slice(0, 60) }))
        .filter((e) => e.href && e.href.startsWith("/"))
    );

  // Los destinos nuevos se piden de seis en seis (cada uno es una pantalla que el servidor pinta).
  async function juzgarVarios(hrefs) {
    const pendientes = [...new Set(hrefs)];
    for (let i = 0; i < pendientes.length; i += 6) await Promise.all(pendientes.slice(i, i + 6).map((h) => juzgar(h)));
  }

  async function revisarEnlaces(pantalla, cola, vistos) {
    const enlaces = (await enlacesVisibles()).filter((e) => !NO_RECORRER.test(e.href.split("#")[0].split("?")[0]));
    await juzgarVarios(enlaces.map((e) => e.href.split("#")[0]));
    for (const e of enlaces) {
      const ruta = e.href.split("#")[0];
      if (NO_RECORRER.test(ruta.split("?")[0])) continue;
      const motivo = await juzgar(ruta);
      if (motivo) reportar(pantalla, e.texto || "(enlace)", ruta, motivo);
      else if (cola && !vistos.has(patronDe(ruta.split("?")[0]))) {
        vistos.add(patronDe(ruta.split("?")[0]));
        cola.push(ruta);
      }
    }
  }

  async function abrir(ruta) {
    await pestanaNueva();
    await pagina.goto(`${BASE}${ruta}`, { waitUntil: "load" });
    // Que termine de hidratarse antes de apretar nada (con tope: hay pantallas que preguntan cada pocos segundos).
    await pagina.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  }

  let franjaVista = false;
  async function revisarEscritura(ruta) {
    if (!franjaVista) {
      franjaVista = true;
      const f = franjaEsperada(rol === "encargada" ? "recepcion" : rol);
      const franja = (await pagina.locator("[data-aviso-plan]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
      if (!f.texto.test(franja)) reportarEscritura(ruta, `la franja no dice lo que le toca («${franja.slice(0, 120)}»)`);
      else if (f.boton && !(await pagina.locator("[data-aviso-plan] a", { hasText: f.boton }).count())) reportarEscritura(ruta, "la franja no trae «Contratar»");
    }
    const { activos, exentos, lecturasBloqueadas } = await pagina.evaluate(controlesDeEscritura);
    exentosEscritura += exentos;
    for (const a of activos) reportarEscritura(ruta, `${a.tipo} activo: «${a.texto}»`);
    for (const l of lecturasBloqueadas) reportarEscritura(ruta, `buscador o filtro bloqueado (leer tiene que seguir): «${l.texto}»`);
  }

  async function apretarBotones(ruta) {
    const etiquetas = await pagina.$$eval("button, [role=button]", (bs) =>
      bs
        .filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !b.disabled && b.getAttribute("aria-disabled") !== "true" && !b.closest("[data-nav-staff]") && !b.closest("nav"); })
        .map((b) => (b.innerText || b.getAttribute("aria-label") || b.title || "").trim().replace(/\s+/g, " ").slice(0, 60))
    );
    // Los días de un calendario y los números de una lista son el mismo botón repetido.
    const unicas = [...new Set(etiquetas)].filter((t) => t && !BOTON_PROHIBIDO.test(t) && !/^[\d\s:./-]+$/.test(t)).slice(0, MAX_BOTONES);
    for (const etiqueta of unicas) {
      if (process.argv.includes("--ver")) console.log(`      · ${etiqueta}`);
      const boton = pagina.locator("button:visible, [role=button]:visible").filter({ hasText: etiqueta }).first();
      if (!(await boton.count())) continue;
      const antesUrl = pagina.url();
      const antesEscrituras = bloqueadas;
      const sinBloqueo = PRUEBA_VENCIDA && (await boton.evaluate((b) => Boolean(b.closest("[data-sin-bloqueo]"))).catch(() => false));
      const antesEnlaces = new Set((await enlacesVisibles()).map((e) => e.href));
      const antesCampos = PRUEBA_VENCIDA && !sinBloqueo ? await pagina.evaluate(camposDeEscrituraVisibles).catch(() => 0) : 0;
      try {
        await boton.click({ timeout: 4000, noWaitAfter: true });
      } catch {
        continue;
      }
      await pagina.waitForTimeout(600);
      await pagina.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
      // La Ayuda (tickets de soporte) queda abierta a propósito: la base deja escribir un ticket en solo lectura.
      if (PRUEBA_VENCIDA && !sinBloqueo && !ruta.startsWith("/ayuda") && bloqueadas > antesEscrituras) reportarEscritura(ruta, `botón activo que intentó escribir: «${etiqueta}»`);
      // QA N152: un botón activo que, sin cambiar de página, deja a la vista campos para llenar abrió un formulario.
      if (PRUEBA_VENCIDA && !sinBloqueo && !ruta.startsWith("/ayuda") && pagina.url() === antesUrl) {
        const despues = await pagina.evaluate(camposDeEscrituraVisibles).catch(() => 0);
        if (despues > antesCampos) reportarEscritura(ruta, `botón activo que abre un formulario: «${etiqueta}»`);
      }
      if (pagina.url() !== antesUrl) await pagina.waitForLoadState("load", { timeout: 20000 }).catch(() => {});
      const ahora = new globalThis.URL(pagina.url());
      if (pagina.url() !== antesUrl) {
        if (ahora.origin === BASE) {
          const destino = ahora.pathname;
          if (destinoMalo(rol, ruta, destino)) reportar(ruta, etiqueta, destino, `al apretarlo lo regresa a ${destino}`);
          else {
            const motivo = await juzgar(destino + ahora.search);
            if (motivo) reportar(ruta, etiqueta, destino, motivo);
          }
        }
        await abrir(ruta);
        continue;
      }
      // Lo que apareció al apretarlo (un diálogo, un menú, un panel): sus enlaces también cuentan.
      const nuevos = (await enlacesVisibles()).filter((e) => !antesEnlaces.has(e.href) && !NO_RECORRER.test(e.href.split("#")[0].split("?")[0]));
      if (process.argv.includes("--ver") && nuevos.length) console.log(`        aparecen: ${nuevos.map((e) => e.href).join(" ")}`);
      await juzgarVarios(nuevos.map((e) => e.href.split("#")[0]));
      for (const e of nuevos) {
        const destino = e.href.split("#")[0];
        if (NO_RECORRER.test(destino.split("?")[0])) continue;
        const motivo = await juzgar(destino);
        if (motivo) reportar(ruta, `${etiqueta} → ${e.texto || "(enlace)"}`, destino, motivo);
      }
      // Un diálogo tapa lo demás: se cierra con Escape y, si sigue, se vuelve a abrir la pantalla.
      if (await pagina.$("[role=dialog]:visible, [role=menu]:visible")) {
        await pagina.keyboard.press("Escape").catch(() => {});
        await pagina.waitForTimeout(200);
        if (await pagina.$("[role=dialog]:visible, [role=menu]:visible")) await abrir(ruta);
      }
    }
  }

  // QA S53 (N156): el médico ve su zona (etiqueta «Médico veterinario», sin el aviso de Estética apagada, sin enlaces
  // a un módulo apagado) en TODAS las pantallas; se recorre con Estética apagada, que es como vive una clínica.
  async function revisarMedico(ruta) {
    // El encabezado lo pinta el layout; con la base lenta puede no estar aún: se espera (hasta 30 s) antes de leerlo, y
    // si nunca aparece es que la pantalla no cargó (aviso), no que la etiqueta esté mal.
    const hayEncabezado = await pagina.locator("[data-etiqueta-rol]").first().waitFor({ state: "attached", timeout: 30_000 }).then(() => true).catch(() => false);
    if (!hayEncabezado) {
      avisos.push(`[medico] ${ruta}: la pantalla no terminó de cargar en 30 s (no se juzga su etiqueta)`);
      return;
    }
    const v = await pagina.evaluate(() => {
      const etiqueta = (document.querySelector("[data-etiqueta-rol]")?.textContent ?? "").trim();
      const aviso = (document.querySelector("[data-modulo-apagado-aviso]")?.textContent ?? "").trim();
      const nav = [...document.querySelectorAll("[data-nav-staff] a[href], nav a[href]")].map((a) => a.getAttribute("href") ?? "").filter((h) => /^\/estetica(\/|$|\?)/.test(h));
      return { etiqueta, aviso, nav };
    }).catch(() => null);
    if (!v) return;
    if (v.aviso) reportarMedico(ruta, `aviso de un módulo apagado: «${v.aviso.slice(0, 80)}»`);
    if (!/^m[eé]dico veterinari[oa]$/i.test(v.etiqueta)) reportarMedico(ruta, `la etiqueta bajo el nombre dice «${v.etiqueta}» (le toca «Médico veterinario»)`);
    if (v.nav.length) reportarMedico(ruta, `el menú enlaza a Estética, que está apagada: ${v.nav.slice(0, 3).join(", ")}`);
  }
  const reportarMedico = (pantalla, motivo) => {
    const clave = `${patronDe(pantalla)} | medico | ${motivo}`;
    if (malos.has(clave)) return;
    const h = { rol, pantalla, boton: motivo, destino: "", motivo: "zona del médico" };
    malos.set(clave, h);
    hallazgos.push(h);
    console.log(`  ✘ [${rol}] ${pantalla} · ${motivo}`);
  };

  const cola = [arg("--desde", INICIO[rol])];
  const vistos = new Set([patronDe(cola[0].split("?")[0])]);
  let pantallas = 0;
  const reintentadas = new Set();
  while (cola.length && pantallas < MAX_PANTALLAS) {
    const ruta = cola.shift();
    pantallas++;
    const t0 = Date.now();
    if (process.argv.includes("--ver")) console.log(`    ${ruta}`);
    // QA S53 (N155): una pantalla que abre un formulario por parámetro de la URL se recorre TAMBIÉN así (con la prueba
    // vencida, ese formulario tiene que salir deshabilitado entero).
    for (const [patron, parametros] of VARIANTES_EDICION) {
      const sola = ruta.split("?")[0];
      if (!ruta.includes("?") && patron.test(sola) && !vistos.has(`${patronDe(sola)}?${parametros}`)) {
        vistos.add(`${patronDe(sola)}?${parametros}`);
        cola.unshift(`${sola}?${parametros}`);
      }
    }
    try {
      // Ninguna pantalla se queda con el recorrido más de tres minutos.
      let tope;
      await Promise.race([
        (async () => {
          await abrir(ruta);
          const final = new globalThis.URL(pagina.url()).pathname;
          if (final !== ruta.split("?")[0] && destinoMalo(rol, ruta, final)) return; // ya se reportó desde quien la enlaza
          if (process.argv.includes("--ver")) console.log(`      abierta en ${Math.round((Date.now() - t0) / 1000)} s`);
          if (PRUEBA_VENCIDA) await revisarEscritura(ruta);
          if (rol === "medico") await revisarMedico(ruta);
          await revisarEnlaces(ruta, cola, vistos);
          if (process.argv.includes("--ver")) console.log(`      enlaces en ${Math.round((Date.now() - t0) / 1000)} s`);
          if (CON_BOTONES) await apretarBotones(ruta);
        })(),
        new Promise((_, rechazar) => { tope = setTimeout(() => rechazar(new Error("más de 3 minutos en la pantalla")), 180_000); }),
      ]).finally(() => clearTimeout(tope));
      if (process.argv.includes("--ver")) console.log(`      (${Math.round((Date.now() - t0) / 1000)} s)`);
    } catch (e) {
      const texto = String(e.message ?? e).split("\n")[0];
      avisos.push(`[${rol}] ${ruta}: ${texto}`);
      if (process.argv.includes("--ver")) console.log(`      ! ${texto}`);
      if (/3 minutos|closed|crash/i.test(texto)) await arrancar();
      // La pantalla cambió su dirección sola al abrir (filtros, vista por omisión): se repite una vez.
      if (/Execution context was destroyed|interrupted by another navigation/.test(texto) && !reintentadas.has(ruta)) {
        reintentadas.add(ruta);
        pantallas--;
        cola.unshift(ruta);
      }
    }
  }
  if (rol === "medico") await SB.from("negocio_modulos").update({ activo: true }).eq("negocio_id", B).eq("modulo", "estetica").is("deleted_at", null);
  porRol[rol] = { pantallas, hallazgos: malos.size, escriturasBloqueadas: bloqueadas, sinRecorrer: cola.length, exentosEscritura };
  if (PRUEBA_VENCIDA) console.log(`  · ${rol}: ${exentosEscritura} control(es) marcados «sin bloqueo» (buscar, exportar, contratar)`);
  console.log(`  · ${rol}: ${pantallas} pantallas, ${malos.size} botón(es) o enlace(s) que no le tocan, ${bloqueadas} escrituras bloqueadas${cola.length ? `, ${cola.length} sin recorrer (tope --max)` : ""}`);
  await cerrarConTope(nav.close());
}

try {
  for (const rol of ROLES) {
    console.log(`\n── ${rol} ──`);
    await recorrer(rol);
  }
} finally {
  await restaurarModulos();
}

if (avisos.length) {
  console.log(`\nAvisos (no cuentan como falla): ${avisos.length}`);
  for (const a of [...new Set(avisos)].slice(0, 40)) console.log(`  · ${a}`);
}
console.log("\nPor rol:");
for (const [rol, r] of Object.entries(porRol)) console.log(`  ${rol.padEnd(10)} ${String(r.pantallas).padStart(4)} pantallas · ${r.hallazgos} hallazgo(s)`);
if (SALIDA_JSON) fs.writeFileSync(SALIDA_JSON, JSON.stringify({ porRol, hallazgos, avisos }, null, 1));
if (PRUEBA_VENCIDA) {
  const escritura = hallazgos.filter((h) => h.motivo === "prueba vencida").length;
  console.log(escritura ? `\n✘ Prueba vencida: ${escritura} botón(es), enlace(s) o campo(s) de escritura activos.` : "\n✔ Prueba vencida: ningún botón, enlace ni campo de escritura activo; la franja dice lo que le toca a cada rol.");
}
if (ROLES.includes("medico")) {
  const zona = hallazgos.filter((h) => h.motivo === "zona del médico").length;
  console.log(zona ? `\n✘ Médico: ${zona} pantalla(s) con etiqueta, aviso o enlace de un módulo que no le toca o está apagado.` : "\n✔ Médico: en todas sus pantallas la etiqueta es «Médico veterinario», sin aviso ni enlaces de Estética apagada.");
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} botón(es) o enlace(s) llevan a una página que ese rol no puede abrir.` : "\n✔ Ningún botón ni enlace lleva a una página que el rol no pueda abrir.");
process.exit(hallazgos.length ? 1 : 0);
