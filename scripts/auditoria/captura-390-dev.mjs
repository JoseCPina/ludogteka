// Captura de una pantalla del panel a 390 px, en Huellitas (desarrollo), con la app compilada en :3001.
//   node scripts/auditoria/captura-390-dev.mjs <rol> <ruta> <archivo.png> [--tocar "texto de un control"] [--completa]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const [rol, ruta, salida] = process.argv.slice(2);
const opcion = (n) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : null);
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const CUENTAS = { admin: datos.adminB, recepcion: datos.recepcionB, estetica: datos.esteticaB };
const REF = new globalThis.URL(URL).hostname.split(".")[0];

const { data: u } = await A.auth.admin.getUserById(CUENTAS[rol]);
const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (error) throw error;
const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
const trozos = valor.match(/.{1,3180}/g);
const nombre = `sb-${REF}-auth-token`;
const galletas = (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await ctx.addCookies(galletas);
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  await p.goto(`http://huellitas.localhost:3001${ruta}`, { waitUntil: "load", timeout: 120000 });
  await p.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  const tocar = opcion("--tocar");
  if (tocar) {
    await p.getByText(tocar, { exact: false }).first().click();
    await p.waitForTimeout(800);
  }
  await p.screenshot({ path: salida, fullPage: process.argv.includes("--completa") });
  const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
  console.log(`✔ ${salida} · ancho del contenido ${ancho} px · ${p.url()}`);
} finally {
  await nav.close();
}
process.exit(0);
