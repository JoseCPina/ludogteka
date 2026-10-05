// Ayuda para escribir guiones: abre una pantalla del demo con una cuenta y
// lista lo que se ve (títulos, botones, enlaces, campos). SOLO desarrollo.
//   node scripts/tutoriales/explorar.mjs <rol> <ruta> [--texto]
import fs from "node:fs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { conectar } from "./lib/db.mjs";
import { cookiesDe } from "./lib/sesion.mjs";

const [rol, ruta] = process.argv.slice(2);
const conTexto = process.argv.includes("--texto");
const c = conectar(false);
const anon = fs.readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 1920, height: 1080 }, locale: "es-MX" });
await ctx.addCookies(await cookiesDe(c, rol, "patitasyco.localhost", anon));
const pag = await ctx.newPage();
await pag.goto(`http://patitasyco.localhost:3001${ruta}`, { waitUntil: "networkidle" });
const r = await pag.evaluate(() => {
  const vis = (e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 && getComputedStyle(e).visibility !== "hidden"; };
  const t = (e) => (e.innerText || e.value || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 90);
  return {
    url: location.pathname + location.search,
    titulos: [...document.querySelectorAll("h1,h2,h3")].filter(vis).map(t),
    botones: [...document.querySelectorAll("button,[role=button],input[type=submit]")].filter(vis).map(t).filter(Boolean),
    enlaces: [...document.querySelectorAll("a[href]")].filter(vis).map((a) => `${t(a)} → ${a.getAttribute("href")}`),
    campos: [...document.querySelectorAll("input,select,textarea")].filter(vis).map((e) => `${e.tagName.toLowerCase()}${e.type ? ":" + e.type : ""} «${(e.labels?.[0]?.innerText || e.placeholder || e.name || "").trim().slice(0, 60)}»${e.tagName === "SELECT" ? " [" + [...e.options].slice(0, 8).map((o) => o.text).join(" | ") + "]" : ""}`),
    texto: document.body.innerText.slice(0, 2500),
  };
});
console.log(`URL: ${r.url}\n\nTÍTULOS:\n  ${r.titulos.join("\n  ")}\n\nBOTONES:\n  ${[...new Set(r.botones)].join("\n  ")}\n\nENLACES:\n  ${r.enlaces.join("\n  ")}\n\nCAMPOS:\n  ${r.campos.join("\n  ")}`);
if (conTexto) console.log(`\nTEXTO:\n${r.texto}`);
await nav.close();
