// «Movimientos de este turno» a 390 px (SOLO DESARROLLO, Huellitas, con `next start` en el 3001):
// la tabla pasa a tarjetas y Método y Monto se leen completos (sin recortes ni desborde).
//   node scripts/auditoria/turno-tabla-celular-dev.mjs   → deja capturas en la carpeta temporal
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const BASE = "http://huellitas.localhost:3001";
let fallos = 0;
const comprobar = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) fallos++; };

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const nombre = `sb-${REF}-auth-token`;
  const trozos = valor.match(/.{1,3180}/g);
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(await cookiesDe(datos.adminB));
  const pa = await ctx.newPage();
  await pa.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  const seccion = pa.locator("section, div").filter({ has: pa.getByRole("heading", { name: /Movimientos de este turno/i }) }).last();
  const hay = await pa.getByRole("heading", { name: /Movimientos de este turno/i }).count();
  comprobar(hay > 0, "la sección «Movimientos de este turno» existe (hay un turno abierto)");
  if (hay) {
    await pa.getByRole("heading", { name: /Movimientos de este turno/i }).scrollIntoViewIfNeeded();
    const ancho = await pa.evaluate(() => document.documentElement.scrollWidth);
    comprobar(ancho <= 392, `sin desborde horizontal de la página (${ancho}px)`);
    // Cada elemento con «Método» o con un monto ($) dentro de la sección debe verse completo.
    const recortados = await pa.evaluate(() => {
      // La tabla de movimientos (la única con la columna «Cliente / motivo»), no el historial de turnos.
      const tabla = [...document.querySelectorAll("table")].find((t) => /Cliente \/ motivo/.test(t.textContent ?? ""));
      const raiz = tabla?.parentElement;
      if (!raiz) return { malos: ["no encontré la tabla de movimientos"], conMetodo: 0, conMonto: 0 };
      const malos = [];
      let conMetodo = 0, conMonto = 0;
      for (const el of raiz.querySelectorAll("*")) {
        if (el.children.length && el.tagName !== "TD") continue;
        const t = (el.textContent ?? "").trim();
        if (!t) continue;
        if (el.tagName === "TD" && /^(Método)?\s*(Efectivo|Terminal|Transferencia|Tarjeta manual)/i.test(t)) conMetodo++;
        if (el.tagName === "TD" && /^[−-]?\$[\d,]+\.\d{2}/.test(t)) conMonto++;
        const r = el.getBoundingClientRect();
        if (el.scrollWidth > el.clientWidth + 1 || r.right > innerWidth + 1 || r.left < -1) malos.push(`${t.slice(0, 40)} (${Math.round(r.left)}–${Math.round(r.right)})`);
      }
      return { malos, conMetodo, conMonto };
    });
    comprobar(Array.isArray(recortados.malos) && recortados.malos.length === 0, `Método y Monto sin recortes ni fuera de pantalla (${JSON.stringify(recortados.malos ?? recortados)})`);
    comprobar(recortados.conMetodo > 0 && recortados.conMonto > 0, `se leen ${recortados.conMetodo} métodos y ${recortados.conMonto} montos completos`);
    const caja = pa.locator("table", { hasText: "Cliente / motivo" }).locator("xpath=..");
    const destino = path.join(os.tmpdir(), "turno-movimientos-390.png");
    await caja.first().scrollIntoViewIfNeeded();
    await pa.screenshot({ path: destino });
    console.log(`  captura: ${destino}`);
  }
} finally {
  await nav.close();
}
process.exit(fallos ? 1 : 0);
