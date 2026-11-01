// Todo lo que se toca responde en el instante (UX, 1 de noviembre de 2026) — SOLO DESARROLLO, en Huellitas, con
// `next start` en el 3001.
//
//   node scripts/auditoria/ux-respuesta-dev.mjs [--roles admin,recepcion,estetica,encargada,medico] [--max 30]
//        [--enlaces 2] [--botones 3] [--rutas /recepcion,/hotel] [--medir] [--json archivo]
//
// Con cada rol del personal recorre el panel desde su inicio y en cada pantalla:
//   · ENLACES (uno por destino, el menú lateral una vez por rol): la respuesta de la navegación se retiene 1.2 s en el
//     navegador y se toca el enlace DOS veces (80 ms entre toques, en el mismo punto, como un dedo). Falla si antes de
//     100 ms no hay estado pendiente (el enlace con `aria-busy`/`data-pendiente` o la barra de arriba), si salen dos
//     navegaciones al mismo destino, o si la barra de progreso sigue visible 1.5 s después de llegar.
//   · ACCIONES (botones de envío de un formulario que no es de búsqueda, o con `data-escritura`): la escritura se
//     retiene 3.5 s y se corta (NADA llega al servidor ni a la base) y se toca dos veces. Falla si antes de 100 ms el
//     botón no está ocupado (`aria-busy` o deshabilitado con su giro), si salen dos envíos, o si a los 3.3 s no dice
//     «Sigue trabajando…». Un botón que no manda nada al tocarlo (abre algo, o le faltan datos al formulario) no es
//     una acción y no se cuenta.
// --medir: sin retener nada (los tiempos reales del servidor de desarrollo) mide el tiempo entre el toque y el primer
// cambio visible de cada enlace y acción (por omisión en /recepcion y /hotel con recepción) y no falla: es la cifra de
// «antes y después» de docs/ux-respuesta.md.
// Sale con 1 si encuentra algo. La corrida completa (todos los roles, sin --rutas) deja su sello para `npm run desplegar`.
import fs from "node:fs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { BASE, CUENTAS, INICIO, NO_RECORRER, arg, candadoDeEscrituras, cookiesDe, dejarComoEstaba, encolar, enlacesInternos, patronDe, prepararPerfiles, sellar } from "./lib/panel-dev.mjs";

const MEDIR = process.argv.includes("--medir");
// --un-toque: un solo toque (para comparar cuántas peticiones hace una navegación normal).
const UN_TOQUE = process.argv.includes("--un-toque");
const ROLES = arg("--roles", MEDIR ? "recepcion" : "admin,recepcion,estetica,encargada,medico").split(",");
const RUTAS = arg("--rutas", MEDIR ? "/recepcion,/hotel" : null)?.split(",") ?? null;
// 30 pantallas por rol: los enlaces y botones se prueban una vez por destino y por texto, así que pasadas las primeras
// pantallas casi todo lo que aparece ya se probó (y cada despliegue exige esta corrida completa).
const MAX = Number(arg("--max", "30"));
const MAX_ENLACES = Number(arg("--enlaces", MEDIR ? "50" : "2"));
const MAX_BOTONES = Number(arg("--botones", MEDIR ? "50" : "3"));
const SALIDA = arg("--json", null);
const RETENER_NAV = MEDIR ? 0 : 1200;
const RETENER_ACCION = 3500;
const LIMITE_MS = 100;
const BOTON_PROHIBIDO = /cerrar sesi[oó]n|^salir$|cambiar de negocio|instalar|imprimir|descargar|exportar|foto|video|galer[ií]a|c[aá]mara|subir|archivo|dictar|grabar|micr[oó]fono|copiar/i;

const hallazgos = [];
const avisos = [];
const medidas = [];
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

// En la página: desde el toque (pointerdown) se vigila el DOM y se anota el primer momento en que el control tocado
// cambia de forma visible. Para un enlace también cuenta la barra de arriba y que la página ya haya cambiado.
const INSTRUMENTO = () => {
  const ux = (window.__ux = { t0: 0, t: {}, objetivo: null, url0: "" });
  const ocupado = (el) => {
    if (!el) return false;
    if (el.getAttribute("aria-busy") === "true" || el.getAttribute("data-pendiente") === "si") return true;
    if (el.querySelector?.("[aria-busy=true], [data-cargando=si], .animate-spin")) return true;
    if (el.tagName === "BUTTON" && el.disabled) return true;
    return false;
  };
  const revisar = () => {
    if (!ux.t0 || !ux.objetivo) return;
    const ahora = performance.now() - ux.t0;
    const o = ux.objetivo;
    if (ux.t.control === undefined && (ocupado(o) || (!o.isConnected && o.tagName === "BUTTON"))) ux.t.control = ahora;
    if (ux.t.texto === undefined && o.isConnected && (o.innerText || "") !== ux.texto0) ux.t.texto = ahora;
    const barra = document.querySelector("[data-barra-navegacion][data-activa=si]");
    if (ux.t.barra === undefined && barra) ux.t.barra = ahora;
    if (ux.t.url === undefined && location.pathname + location.search !== ux.url0) ux.t.url = ahora;
  };
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (ux.t0) return; // el segundo toque no reinicia el reloj
      const o = e.target.closest?.("a, button");
      if (!o) return;
      ux.t0 = performance.now();
      ux.objetivo = o;
      ux.texto0 = o.innerText || "";
      ux.url0 = location.pathname + location.search;
    },
    true
  );
  new MutationObserver(revisar).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
  const cuadro = () => { revisar(); requestAnimationFrame(cuadro); };
  requestAnimationFrame(cuadro);
  // La barra se apaga sola; se anota también cuándo.
  ux.barraVisible = () => !!document.querySelector("[data-barra-navegacion][data-activa=si]");
};

async function tocarDosVeces(p, el) {
  await el.scrollIntoViewIfNeeded().catch(() => {});
  const caja = await el.boundingBox();
  if (!caja) return false;
  const x = caja.x + caja.width / 2;
  const y = caja.y + caja.height / 2;
  await p.mouse.click(x, y);
  if (UN_TOQUE) return true;
  await espera(80);
  await p.mouse.click(x, y);
  return true;
}
const tiempos = (p) => p.evaluate(() => ({ ...window.__ux.t, textoFinal: (window.__ux.objetivo?.innerText || "").trim() })).catch(() => ({}));
const ms = (v) => (v === undefined ? "nunca" : `${Math.round(v)} ms`);

const nav = await abrirNavegador();
await prepararPerfiles(ROLES);
const resumen = {};
try {
  for (const rol of ROLES) {
    if (!CUENTAS[rol]) { console.log(`\n── ${rol}: sin cuenta en Huellitas, se salta ──`); continue; }
    console.log(`\n── ${rol} ──`);
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(await cookiesDe(CUENTAS[rol]));
    await ctx.addInitScript(INSTRUMENTO);
    // Lo que se pide durante una prueba: navegaciones (RSC) y escrituras, con la hora a la que salieron.
    let registro = [];
    await candadoDeEscrituras(ctx, {
      retenerNavegacion: async (req) => { registro.push({ tipo: "nav", url: req.url(), t: Date.now() }); if (RETENER_NAV) await espera(RETENER_NAV); },
      alEscribir: async (req) => { registro.push({ tipo: "escritura", url: req.url(), t: Date.now() }); await espera(RETENER_ACCION); },
    });
    ctx.on("page", async (q) => { if (await q.opener().catch(() => null)) await q.close().catch(() => {}); });
    let p = null;
    const abrir = async (ruta) => {
      if (p) await p.close().catch(() => {});
      p = await ctx.newPage();
      p.on("dialog", (d) => d.dismiss().catch(() => {}));
      await p.goto(BASE + ruta, { waitUntil: "load" });
      await p.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await p.waitForTimeout(200);
      registro = [];
    };

    const cola = RUTAS ? [...RUTAS] : [INICIO[rol]];
    const vistos = new Set(cola.map(patronDe));
    const destinosProbados = new Set();
    const botonesProbados = new Set();
    let pantallas = 0, enlacesN = 0, accionesN = 0, menuProbado = false;
    while (cola.length && pantallas < MAX) {
      const ruta = cola.shift();
      try { await abrir(ruta); } catch (e) { console.log(`  · ${ruta}: ${String(e.message).split("\n")[0]}`); continue; }
      pantallas++;
      const aqui = new URL(p.url()).pathname;
      if (!RUTAS) encolar(await enlacesInternos(p), cola, vistos);

      // ── Acciones ──
      const candidatos = await p.$$eval("button", (bs, prohibido) => {
        const re = new RegExp(prohibido, "i");
        return bs.map((b, i) => {
          const r = b.getBoundingClientRect();
          const form = b.form;
          const envia = form && (b.type || "submit") === "submit" && (form.getAttribute("method") || "").toLowerCase() !== "get" && form.getAttribute("role") !== "search";
          const accion = envia || b.hasAttribute("data-escritura") || b.hasAttribute("data-tope");
          const texto = (b.innerText || b.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 50);
          return { i, texto, ok: accion && r.width > 0 && r.height > 0 && !b.disabled && b.getAttribute("aria-disabled") !== "true" && !re.test(texto) && !b.closest("[data-sin-bloqueo]") };
        }).filter((b) => b.ok);
      }, BOTON_PROHIBIDO.source).catch(() => []);
      let probados = 0;
      for (const c of candidatos) {
        if (probados >= MAX_BOTONES) break;
        const clave = `${patronDe(aqui)} | ${c.texto}`;
        if (botonesProbados.has(clave)) continue;
        botonesProbados.add(clave);
        const el = p.locator("button").nth(c.i);
        // Si la acción anterior movió los botones de lugar, este ya no es el mismo: se salta.
        const textoAhora = ((await el.innerText().catch(() => "")) || (await el.getAttribute("aria-label").catch(() => "")) || "").trim().replace(/s+/g, " ").slice(0, 50);
        if (textoAhora !== c.texto) continue;
        await p.evaluate(() => { window.__ux.t0 = 0; window.__ux.t = {}; });
        registro = [];
        if (!(await tocarDosVeces(p, el).catch(() => false))) continue;
        await espera(1000);
        const escrituras = registro.filter((x) => x.tipo === "escritura");
        if (!escrituras.length) continue; // no mandó nada: no es una acción (o le faltan datos)
        probados++;
        accionesN++;
        let t = await tiempos(p);
        await espera(Math.max(0, 3300 - 1080));
        const tarde = (await el.innerText().catch(() => "")) || "";
        const medida = { rol, pantalla: aqui, tipo: "accion", control: c.texto, primerCambio: Math.min(t.control ?? Infinity, t.texto ?? Infinity), ocupado: t.control };
        medidas.push(medida);
        console.log(`  · ${aqui} · «${c.texto}»: ocupado en ${ms(t.control)}, ${escrituras.length} envío(s)`);
        if (!MEDIR) {
          if (t.control === undefined || t.control > LIMITE_MS) mal(`${rol} · ${aqui} · «${c.texto}»: el botón no se ve ocupado antes de ${LIMITE_MS} ms (${ms(t.control)})`);
          if (escrituras.length > 1) mal(`${rol} · ${aqui} · «${c.texto}»: el doble toque mandó ${escrituras.length} envíos`);
          if (!/sigue trabajando/i.test(tarde) && (await el.isVisible().catch(() => false))) mal(`${rol} · ${aqui} · «${c.texto}»: a los 3 s no dice «Sigue trabajando…» (dice «${tarde.trim().slice(0, 40)}»)`);
        }
        await espera(RETENER_ACCION - 2000);
        // La acción cortada deja su error junto al botón; los demás botones de la pantalla se siguen probando ahí mismo
        // (recargar después de cada una triplicaba lo que tarda la corrida). Solo si la pantalla cambió se vuelve a abrir.
        if (new URL(p.url()).pathname !== aqui) await abrir(ruta).catch(() => {});
      }

      // ── Enlaces ──
      const enlaces = await p.$$eval("a[href]", (as) =>
        as
          .map((a, i) => { const r = a.getBoundingClientRect(); return { i, href: a.getAttribute("href") || "", menu: !!a.closest("#menu-lateral-staff, aside, nav"), texto: (a.innerText || a.getAttribute("aria-label") || "").trim().replace(/s+/g, " ").slice(0, 40), visible: r.width > 0 && r.height > 0, externo: a.target === "_blank" || a.hasAttribute("download") }; })
          .filter((e) => e.visible && !e.externo && e.href.startsWith("/") && e.href.split("#")[0] !== location.pathname + location.search && e.href.split("#")[0] !== location.pathname)
      ).catch(() => []);
      const lista = [];
      const elegir = (cuales, tope) => {
        let n = 0;
        for (const e of cuales) {
          if (n >= tope) break;
          const dest = e.href.split("#")[0].split("?")[0];
          if (NO_RECORRER.test(dest) || destinosProbados.has(patronDe(dest))) continue;
          destinosProbados.add(patronDe(dest));
          n++;
          lista.push(e);
        }
      };
      // El menú lateral, tres entradas una vez por rol; de la pantalla, las de destinos que no se han probado.
      if (!menuProbado && !RUTAS) { elegir(enlaces.filter((e) => e.menu), 3); menuProbado = true; }
      elegir(enlaces.filter((e) => !e.menu), MAX_ENLACES);
      for (const e of lista) {
        const dest = e.href.split("#")[0];
        const enCurso = new URL(p.url()).pathname + new URL(p.url()).search;
        if (enCurso !== ruta && new URL(p.url()).pathname !== aqui) await abrir(ruta).catch(() => {});
        await p.evaluate(() => { window.__ux.t0 = 0; window.__ux.t = {}; });
        registro = [];
        const el = p.locator("a[href]").nth(e.i);
        if ((await el.getAttribute("href").catch(() => null)) !== e.href) continue;
        if (!(await tocarDosVeces(p, el).catch(() => false))) continue;
        enlacesN++;
        // Llegó: la URL cambió (o se agotan 30 s: en desarrollo hay pantallas de más de 10 s).
        await p.waitForFunction(() => window.__ux.t.url !== undefined, null, { timeout: 30_000 }).catch(() => {});
        let t = await tiempos(p);
        const pendiente = Math.min(t.control ?? Infinity, t.barra ?? Infinity);
        const primerCambio = Math.min(pendiente, t.url ?? Infinity);
        const destPath = new URL(dest, BASE).pathname;
        const navs = registro.filter((x) => x.tipo === "nav" && new URL(x.url).pathname === destPath).length;
        await espera(1500);
        const barraColgada = await p.evaluate(() => window.__ux.barraVisible()).catch(() => false);
        medidas.push({ rol, pantalla: aqui, tipo: e.menu ? "menu" : "enlace", control: `${e.texto} → ${dest}`, primerCambio, pendiente: pendiente === Infinity ? undefined : pendiente, llego: t.url });
        console.log(`  · ${aqui} · «${e.texto}» → ${dest}: pendiente en ${ms(pendiente === Infinity ? undefined : pendiente)}, llegó en ${ms(t.url)}, ${navs} navegación(es)`);
        if (!MEDIR) {
          if (!(pendiente <= LIMITE_MS)) mal(`${rol} · ${aqui} · enlace «${e.texto}» → ${dest}: sin estado pendiente antes de ${LIMITE_MS} ms (${ms(pendiente === Infinity ? undefined : pendiente)})`);
          if (navs > 1) mal(`${rol} · ${aqui} · enlace «${e.texto}» → ${dest}: el doble toque disparó ${navs} navegaciones`);
          if (t.url === undefined) avisos.push(`${rol} · ${aqui} · «${e.texto}» → ${dest}: no llegó en 30 s (servidor de desarrollo lento; la barra sigue con razón)`);
          else if (barraColgada) mal(`${rol} · ${aqui} · enlace «${e.texto}» → ${dest}: la barra de progreso se quedó visible después de llegar`);
        }
      }
    }
    resumen[rol] = { pantallas, enlaces: enlacesN, acciones: accionesN };
    console.log(`  · ${rol}: ${pantallas} pantallas, ${enlacesN} enlaces y ${accionesN} acciones tocadas dos veces`);
    await ctx.close();
  }
} finally {
  await nav.close();
  await dejarComoEstaba();
}

const mediana = (xs) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? Math.round(v[Math.floor(v.length / 2)]) : null; };
const maximo = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? Math.round(Math.max(...v)) : null; };
console.log("\nTiempo entre el toque y el primer cambio visible (mediana / máximo):");
for (const pantalla of [...new Set(medidas.map((m) => m.pantalla))]) {
  for (const tipo of ["accion", "enlace", "menu"]) {
    const xs = medidas.filter((m) => m.pantalla === pantalla && m.tipo === tipo).map((m) => m.primerCambio);
    if (xs.length) console.log(`  ${pantalla.padEnd(22)} ${tipo.padEnd(7)} ${String(xs.length).padStart(3)} · ${mediana(xs)} ms / ${maximo(xs)} ms`);
  }
}
if (SALIDA) fs.writeFileSync(SALIDA, JSON.stringify({ medidas, hallazgos, resumen }, null, 2));
console.log("\nPor rol:");
for (const [rol, r] of Object.entries(resumen)) console.log(`  ${rol.padEnd(10)} ${String(r.pantallas).padStart(4)} pantallas · ${r.enlaces} enlaces · ${r.acciones} acciones`);
if (avisos.length) console.log("\nAvisos (no fallan):\n" + avisos.map((a) => `  · ${a}`).join("\n"));
if (MEDIR) process.exit(0);
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s) de respuesta.` : "\n✔ Cada enlace y acción tocados responden antes de 100 ms y el doble toque no duplica.");
if (!hallazgos.length && !RUTAS && ["admin", "recepcion", "estetica", "encargada", "medico"].every((r) => ROLES.includes(r))) sellar("ux-respuesta-dev", { resumen });
process.exit(hallazgos.length ? 1 : 0);
