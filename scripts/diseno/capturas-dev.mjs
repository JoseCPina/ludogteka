// Capturas de pantallas del panel en DESARROLLO (Huellitas, app compilada en el 3001) a 1440 y 390 px, para revisar un
// cambio de diseño (docs/diseno/DESIGN.md). Sesión por enlace mágico, como las auditorías; no escribe nada.
//   node scripts/diseno/capturas-dev.mjs --rol admin --rutas /admin,/clientes [--salida <carpeta>] [--menu]
// --menu: en 390 px, además, abre «Más» y fotografía el menú.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env } from "../auditoria/sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const arg = (n, d) => (process.argv.includes(n) ? process.argv[process.argv.indexOf(n) + 1] : d);
const rol = arg("--rol", "admin");
const rutas = arg("--rutas", "/admin").split(",");
const salida = arg("--salida", path.join(os.tmpdir(), "peludesk-capturas-dev"));
const conMenu = process.argv.includes("--menu");
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
fs.mkdirSync(salida, { recursive: true });

const { data: h } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const SH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": h.id } } });
const persona = (await SH.from("membresias").select("profile_id").eq("negocio_id", h.id).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).single()).data.profile_id;
const { data: u } = await A.auth.admin.getUserById(persona);
const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
const trozos = valor.match(/.{1,3180}/g);
const gal = (n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, i) => [`${n}.${i}`, t]));
const cookies = [...gal(`sb-${REF}-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));

const nav = await abrirNavegador();
try {
  for (const ancho of [1440, 390]) {
    const ctx = await nav.newContext({ viewport: { width: ancho, height: ancho === 390 ? 844 : 900 }, deviceScaleFactor: ancho === 390 ? 2 : 1, isMobile: ancho === 390, hasTouch: ancho === 390 });
    await ctx.addCookies(cookies);
    const p = await ctx.newPage();
    for (const ruta of rutas) {
      await p.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 120000 });
      await p.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
      await p.waitForTimeout(800);
      const nombre = `${rol}__${ruta.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "inicio"}__${ancho}.jpg`;
      const alto = ancho === 1440 ? Math.min(await p.evaluate(() => document.documentElement.scrollHeight), 2200) : 844;
      await p.screenshot({ path: path.join(salida, nombre), type: "jpeg", quality: 70, fullPage: ancho === 1440, clip: { x: 0, y: 0, width: ancho, height: alto } });
      console.log(`  ${nombre}`);
      if (conMenu && ancho === 390 && ruta === rutas[0]) {
        await p.locator("button[aria-controls=menu-lateral-staff]").click();
        await p.waitForTimeout(400);
        await p.screenshot({ path: path.join(salida, `${rol}__menu__390.jpg`), type: "jpeg", quality: 70 });
        await p.locator("[data-cerrar-menu]").click();
      }
    }
    await ctx.close();
  }
} finally {
  await nav.close();
}
console.log(`listo: ${salida}`);
