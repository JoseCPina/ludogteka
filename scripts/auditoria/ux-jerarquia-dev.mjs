// Botones y enlaces del sistema, que se distinguen a simple vista (UX, 1 de noviembre de 2026) — SOLO DESARROLLO, en
// Huellitas, con `next start` en el 3001.
//
//   node scripts/auditoria/ux-jerarquia-dev.mjs [--roles admin,recepcion,estetica,encargada,medico] [--max 160]
//        [--rutas /recepcion,/hotel] [--json archivo]
//
// Con los perfiles de permisos-pantalla-dev (estética, recepción, encargada con permisos de administrar, médico y
// admin; todos los módulos prendidos mientras corre) recorre el panel desde el inicio de cada rol siguiendo sus
// enlaces (ninguna escritura sale del navegador) y en cada pantalla falla si un control VISIBLE:
//   · está fuera del sistema: un <button> o <a> sin `data-ui` (lo ponen <Button>, <Alternar>, <Enlace>,
//     <EnlacePestana>, <EnlacePrecarga> y el menú; docs/ux-respuesta.md);
//   · es un botón que envía un formulario de escritura y no tiene tope (`data-tope`: su
//     espera pasa por `cargando`);
//   · es un enlace interno que navega sin estado pendiente (sin la marca de <EnlacePrecarga>);
//   · mide menos de 44 × 44 px (un enlace dentro de un renglón de texto, `data-en-texto`, está exento: WCAG 2.5.8);
//   · su texto contrasta menos de 4.5:1 con su fondo (los deshabilitados están exentos).
// Sale con 1 si encuentra algo. La corrida completa (todos los roles, sin --rutas) deja su sello para `npm run desplegar`.
import fs from "node:fs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { BASE, CUENTAS, INICIO, arg, candadoDeEscrituras, cookiesDe, dejarComoEstaba, encolar, enlacesInternos, patronDe, prepararPerfiles, sellar } from "./lib/panel-dev.mjs";

const TODOS = ["admin", "recepcion", "estetica", "encargada", "medico"];
const ROLES = arg("--roles", TODOS.join(",")).split(",");
const RUTAS = arg("--rutas", null)?.split(",") ?? null;
const MAX = Number(arg("--max", "160"));
const SALIDA = arg("--json", null);

/** En el navegador: los controles visibles que rompen alguna regla. */
function revisarControles() {
  const malos = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05;
  };
  const texto = (el) => (el.innerText || el.getAttribute("aria-label") || el.title || el.getAttribute("href") || "").trim().replace(/\s+/g, " ").slice(0, 50);
  // Contraste (WCAG): luminancia relativa de dos colores rgb(a).
  // Cualquier color CSS (rgb, oklab, color-mix de Tailwind v4…) a [r, g, b, a] en sRGB, pintándolo en un lienzo de 1 px.
  const lienzo = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  const rgb = (c) => {
    lienzo.clearRect(0, 0, 1, 1);
    lienzo.fillStyle = "rgba(0,0,0,0)";
    lienzo.fillStyle = c;
    lienzo.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = lienzo.getImageData(0, 0, 1, 1).data;
    return [r, g, b, a / 255];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const fondoDe = (el) => {
    // El primer fondo opaco hacia arriba; las capas semitransparentes se mezclan sobre él.
    const capas = [];
    for (let n = el; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none" && !capas.length) return null; // sobre una imagen o degradado: no se juzga
      const c = rgb(s.backgroundColor);
      const a = c.length > 3 ? c[3] : 1;
      if (a > 0) capas.push([c[0], c[1], c[2], a]);
      if (a >= 1) break;
    }
    let base = [255, 255, 255];
    for (const [r, g, b, a] of capas.reverse()) base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    return base;
  };
  const contraste = (el) => {
    const s = getComputedStyle(el);
    const c = rgb(s.color);
    const fondo = fondoDe(el);
    if (!fondo || c.length < 3) return null;
    const a = c.length > 3 ? c[3] : 1;
    const color = [c[0] * a + fondo[0] * (1 - a), c[1] * a + fondo[1] * (1 - a), c[2] * a + fondo[2] * (1 - a)];
    const [l1, l2] = [lum(color), lum(fondo)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  for (const el of document.querySelectorAll("button, a[href]")) {
    if (!visible(el)) continue;
    if (el.closest("[data-sin-auditoria-ux], iframe, video")) continue;
    const t = texto(el);
    const tipo = el.tagName === "A" ? "enlace" : "botón";
    if (!el.hasAttribute("data-ui")) malos.push({ regla: "fuera del sistema", tipo, t });
    if (el.tagName === "BUTTON") {
      const form = el.form;
      const envia = form && (el.type || "submit") === "submit" && (form.getAttribute("method") || "").toLowerCase() !== "get" && form.getAttribute("role") !== "search";
      // Un botón que solo ABRE un formulario (lleva data-escritura por el bloqueo de solo lectura) no espera a nadie: el
      // tope es de lo que envía. Los onClick que llaman al servidor los revisa la estática botones-con-tope.mjs.
      if (envia && !el.hasAttribute("data-tope") && !el.disabled) malos.push({ regla: "botón de acción sin tope", tipo, t });
    } else {
      const href = el.getAttribute("href") || "";
      const interno = href.startsWith("/") && !href.startsWith("//") && !href.startsWith("/api/") && (!el.target || el.target === "_self") && !el.hasAttribute("download");
      if (interno && !el.querySelector("[data-marca-pendiente]")) malos.push({ regla: "enlace sin estado pendiente", tipo, t });
    }
    const r = el.getBoundingClientRect();
    if (!el.hasAttribute("data-en-texto") && (r.height < 43.5 || r.width < 43.5)) malos.push({ regla: "área táctil menor a 44 px", tipo, t, detalle: `${Math.round(r.width)}×${Math.round(r.height)}` });
    // El contraste de un logotipo (la firma «Hecho con PeluDesk») está exento (WCAG 1.4.3).
    if (!el.disabled && el.getAttribute("aria-disabled") !== "true" && el.getAttribute("data-ui") !== "marca" && (el.innerText || "").trim()) {
      // El contraste se mide en el texto: el control y sus hijos con texto propio.
      // Lo decorativo (aria-hidden: una flecha «›», un ícono) no es texto que se lea.
      const conTexto = [el, ...el.querySelectorAll("*")].filter((n) => !n.closest("[aria-hidden=true]") && [...n.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()) && visible(n));
      for (const n of conTexto.slice(0, 4)) {
        const c = contraste(n);
        if (c !== null && c < 4.5) {
          malos.push({ regla: "contraste menor a 4.5:1", tipo, t, detalle: `${c.toFixed(2)}:1` });
          break;
        }
      }
    }
  }
  return malos;
}

const nav = await abrirNavegador();
await prepararPerfiles(ROLES);
const hallazgos = [];
const porRegla = {};
const resumen = {};
try {
  for (const rol of ROLES) {
    if (!CUENTAS[rol]) { console.log(`\n── ${rol}: sin cuenta en Huellitas, se salta ──`); continue; }
    console.log(`\n── ${rol} ──`);
    const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(await cookiesDe(CUENTAS[rol]));
    await candadoDeEscrituras(ctx);
    const cola = RUTAS ? [...RUTAS] : [INICIO[rol]];
    const vistos = new Set(cola.map(patronDe));
    const yaDichos = new Set();
    let pantallas = 0, controles = 0, malas = 0;
    let p = null;
    while (cola.length && pantallas < MAX) {
      const ruta = cola.shift();
      try {
        if (p) await p.close().catch(() => {});
        p = await ctx.newPage();
        p.on("dialog", (d) => d.dismiss().catch(() => {}));
        await p.goto(BASE + ruta, { waitUntil: "load" });
        await p.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
        await p.waitForTimeout(250);
      } catch (e) { console.log(`  · ${ruta}: ${String(e.message).split("\n")[0]}`); continue; }
      pantallas++;
      const final = new URL(p.url()).pathname;
      if (!RUTAS) encolar(await enlacesInternos(p), cola, vistos);
      controles += await p.locator("button:visible, a[href]:visible").count().catch(() => 0);
      const malos = await p.evaluate(revisarControles).catch(() => []);
      let nuevos = 0;
      for (const m of malos) {
        const clave = `${m.regla} | ${m.tipo} | ${m.t}`;
        if (yaDichos.has(clave)) continue; // el mismo control en todas las pantallas (menú, encabezado) se dice una vez
        yaDichos.add(clave);
        nuevos++;
        porRegla[m.regla] = (porRegla[m.regla] ?? 0) + 1;
        const h = `${rol} · ${final} · ${m.regla}: ${m.tipo} «${m.t}»${m.detalle ? ` (${m.detalle})` : ""}`;
        hallazgos.push(h);
        console.log(`  ✘ ${h}`);
      }
      if (nuevos) malas++;
    }
    resumen[rol] = { pantallas, controles, malas };
    console.log(`  · ${rol}: ${pantallas} pantallas, ${controles} controles revisados, ${malas} con algo fuera de regla`);
    await ctx.close();
  }
} finally {
  await nav.close();
  await dejarComoEstaba();
}
if (SALIDA) fs.writeFileSync(SALIDA, JSON.stringify({ hallazgos, porRegla, resumen }, null, 2));
console.log("\nPor rol:");
for (const [rol, r] of Object.entries(resumen)) console.log(`  ${rol.padEnd(10)} ${String(r.pantallas).padStart(4)} pantallas · ${r.controles} controles · ${r.malas} con hallazgos`);
if (Object.keys(porRegla).length) {
  console.log("\nPor regla:");
  for (const [regla, n] of Object.entries(porRegla)) console.log(`  ${regla.padEnd(32)} ${n}`);
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s) de jerarquía.` : "\n✔ Todo botón y enlace del panel es del sistema, con tope, estado pendiente, 44 px y contraste AA.");
// Sello por rol: cada rol que recorrió su panel completo sin hallazgos (scripts/auditoria/lib/sello-pantalla.mjs).
const limpios = Object.entries(resumen).filter(([, r]) => r.malas === 0 && r.pantallas > 0).map(([rol]) => rol);
if (!RUTAS && limpios.length) sellar("ux-jerarquia-dev", limpios);
process.exit(hallazgos.length ? 1 : 0);
