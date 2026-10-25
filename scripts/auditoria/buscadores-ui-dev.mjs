// Los buscadores de clientes eligen la fila que se APRETÓ aunque la lista cambie (QA N33) — SOLO DESARROLLO,
// en Huellitas, con `next start` en el 3001.
//
//   node scripts/auditoria/buscadores-ui-dev.mjs
//
// Dos clientes con nombres casi iguales («Qa R8 Buscador», «Qa S9 Buscador»). Se aprieta la fila del segundo y,
// ANTES de soltar, la lista cambia (se amplía la búsqueda y el primero pasa a ocupar el lugar del segundo): el clic
// tiene que elegir al cliente apretado, nunca al que quedó debajo del puntero. Se prueba con el buscador que elige
// en la misma pantalla (Nueva reserva de Hotel y Guardería, Agendar de Estética) y con el que navega (Pases, Cargo
// suelto de Caja), con ratón y con teclado.
// 6. N124: en Caja («¿A quién le cobras?») todos los términos deben coincidir: «S32 Est» trae a «Qa S32 Est» y no a
// «QA R23c Cliente Est» aunque su teléfono tenga 32. La regla pura: scripts/auditoria/busqueda-clientes.mjs.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? console.log(`  ✔ ${t}`) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);

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

const nuevoCliente = async (nombre, i, telefono) => {
  const tel = telefono ?? `66${String(Date.now()).slice(-7)}${i}`.slice(0, 10);
  const r = await SB.from("clientes").insert({ nombre, telefono: tel }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  return r.data.id;
};
const R8 = await nuevoCliente(`Qa R8 Buscador ${sufijo}`, 1);
const S9 = await nuevoCliente(`Qa S9 Buscador ${sufijo}`, 2);
// N124: el teléfono de R23c lleva el 32 de «S32».
const S32 = await nuevoCliente(`Qa S32 Est ${sufijo}`, 3);
const R23 = await nuevoCliente(`QA R23c Cliente Est ${sufijo}`, 4, `6632${sufijo}`.slice(0, 10));

const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(await cookiesDe(datos.adminB));
const p = await ctx.newPage();

// Cambia el texto del buscador sin pasar por el teclado (el ratón sigue apretado).
const escribir = (texto) =>
  p.evaluate((t) => {
    const campo = document.querySelector('input[type="search"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(campo, t);
    campo.dispatchEvent(new Event("input", { bubbles: true }));
  }, texto);

/** Aprieta la fila del segundo cliente, cambia la lista y suelta. Devuelve el texto de la página al terminar. */
async function apretarYCambiar(url, esperar) {
  await p.goto(`${BASE}${url}`, { waitUntil: "networkidle" });
  const campo = p.locator('input[type="search"]').first();
  await campo.fill(`S9 Buscador ${sufijo}`);
  const fila = p.locator(`[data-cliente-id="${S9}"]`);
  await fila.waitFor();
  const caja = await fila.boundingBox();
  await p.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
  await p.mouse.down();
  // Con el ratón apretado, la búsqueda se amplía: R8 pasa a la primera fila, justo bajo el puntero.
  await escribir(`Buscador ${sufijo}`);
  await p.locator(`[data-cliente-id="${R8}"]`).waitFor();
  await p.waitForTimeout(150);
  await p.mouse.up();
  await esperar();
}

try {
  console.log("1. Nueva reserva de Hotel: la lista cambia entre apretar y soltar");
  await apretarYCambiar("/hotel/nueva", async () => {
    await p.waitForFunction((n) => document.body.innerText.includes(n), `Qa S9 Buscador ${sufijo}`, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(500);
  });
  let texto = await p.locator("body").innerText();
  comprobar(/Cliente/.test(texto) && texto.includes(`Qa S9 Buscador ${sufijo}`), "elige a «Qa S9» (el apretado)");
  comprobar(!new RegExp(`Cliente\\s*\\n?\\s*Qa R8 Buscador ${sufijo}`).test(texto), "y no a «Qa R8» (el que quedó bajo el puntero)");

  console.log("2. Agendar de Estética (el mismo componente)");
  await apretarYCambiar("/estetica/nueva", async () => { await p.waitForTimeout(800); });
  texto = await p.locator("body").innerText();
  comprobar(new RegExp(`Cliente\\s*\\n?\\s*Qa S9 Buscador ${sufijo}`).test(texto), "queda elegido «Qa S9»");

  console.log("3. Pases de Caja (el buscador que navega)");
  await apretarYCambiar("/caja/pases", async () => { await p.waitForURL(/cliente=/, { timeout: 15000 }).catch(() => {}); });
  comprobar(p.url().includes(`cliente=${S9}`), `navega al cliente apretado (${p.url().split("?")[1] ?? "sin parámetro"})`);

  console.log("4. Cargo suelto de Caja (también navega)");
  await apretarYCambiar("/caja/cargo", async () => { await p.waitForURL(/cliente=/, { timeout: 15000 }).catch(() => {}); });
  comprobar(p.url().includes(`cliente=${S9}`), `navega al cliente apretado (${p.url().split("?")[1] ?? "sin parámetro"})`);

  console.log("5. Clic normal y teclado siguen funcionando");
  await p.goto(`${BASE}/caja/pases`, { waitUntil: "networkidle" });
  await p.locator('input[type="search"]').first().fill(`Buscador ${sufijo}`);
  await p.locator(`[data-cliente-id="${R8}"]`).locator("a, button").first().click();
  await p.waitForURL(/cliente=/, { timeout: 15000 });
  comprobar(p.url().includes(`cliente=${R8}`), "un clic normal elige la fila clicada");
  await p.goto(`${BASE}/caja/pases`, { waitUntil: "networkidle" });
  await p.locator('input[type="search"]').first().fill(`S9 Buscador ${sufijo}`);
  await p.locator(`[data-cliente-id="${S9}"]`).locator("a, button").first().focus();
  await p.keyboard.press("Enter");
  await p.waitForURL(/cliente=/, { timeout: 15000 });
  comprobar(p.url().includes(`cliente=${S9}`), "con teclado (Enter) elige la fila enfocada");

  console.log("6. Caja, «¿A quién le cobras?»: todos los términos deben coincidir (N124)");
  await p.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  const campoCaja = p.locator('input[type="search"]').first();
  await campoCaja.fill("S32 Est");
  await p.locator(`[data-cliente-id="${S32}"]`).waitFor({ timeout: 15000 }).catch(() => {});
  comprobar(await p.locator(`[data-cliente-id="${S32}"]`).count() === 1, "«S32 Est» trae a «Qa S32 Est»");
  comprobar(await p.locator(`[data-cliente-id="${R23}"]`).count() === 0, "y NO a «QA R23c Cliente Est» (su teléfono tiene 32)");
  await campoCaja.fill(`Est ${sufijo}`);
  await p.locator(`[data-cliente-id="${R23}"]`).waitFor({ timeout: 15000 }).catch(() => {});
  comprobar(await p.locator(`[data-cliente-id="${R23}"]`).count() === 1 && await p.locator(`[data-cliente-id="${S32}"]`).count() === 1, "«Est» solo trae a los dos");
  await campoCaja.fill(`6632${sufijo}`.slice(0, 10));
  await p.locator(`[data-cliente-id="${R23}"]`).waitFor({ timeout: 15000 }).catch(() => {});
  comprobar(await p.locator(`[data-cliente-id="${R23}"]`).count() === 1 && await p.locator(`[data-cliente-id="${S32}"]`).count() === 0, "un número busca en el teléfono");
} finally {
  await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", [R8, S9, S32, R23]);
  await nav.close();
}
if (hallazgos.length) { console.log(`\n${hallazgos.length} hallazgo(s)`); process.exit(1); }
console.log("\nSin hallazgos.");
