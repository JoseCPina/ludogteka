// N126 — SOLO DESARROLLO, Huellitas, con el servidor en el 3001.
//   node --experimental-strip-types scripts/auditoria/talla-raza-dev.mjs
// «Nuevo perro»: escoger la raza (Mestizo, o una con talla y pelaje típicos) nunca borra ni cambia el tamaño ni el
// pelaje que ya se capturaron; los típicos de la raza solo llenan un campo vacío.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { tallaYPelajeAlElegirRaza } from "../../src/lib/perros/talla-sugerida.ts";
import { campoNombreDelPerro } from "../lib/alta-mascota.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const comprobar = (c, t) => { if (c) console.log(`  ✔ ${t}`); else { hallazgos.push(t); console.log(`  ✘ ${t}`); } };
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

console.log("0. La regla pura (perro-form y el «otro perrito» de Estética la usan)");
const LAB = { tamano_tipico_id: "grande", pelaje_tipico_id: "corto" };
const r1 = tallaYPelajeAlElegirRaza(LAB, { tamanoId: "", pelajeId: "" });
comprobar(r1.tamanoId === "grande" && r1.pelajeId === "corto", "campos vacíos: se llenan con los típicos");
const r2 = tallaYPelajeAlElegirRaza(LAB, { tamanoId: "chico", pelajeId: "" });
comprobar(r2.tamanoId === "chico" && r2.pelajeId === "corto", "un tamaño capturado no se pisa; el pelaje vacío sí se sugiere");
const r3 = tallaYPelajeAlElegirRaza({ tamano_tipico_id: null, pelaje_tipico_id: null }, { tamanoId: "chico", pelajeId: "largo" });
comprobar(r3.tamanoId === "chico" && r3.pelajeId === "largo", "Mestizo (sin típicos) no borra nada");
const r4 = tallaYPelajeAlElegirRaza(undefined, { tamanoId: "chico", pelajeId: "" });
comprobar(r4.tamanoId === "chico" && r4.pelajeId === "", "raza escrita a mano (fuera del catálogo): no toca nada");

const { data: cli, error } = await SB.from("clientes").insert({ nombre: `ZZ Talla ${sufijo}`, telefono: `67${sufijo}00`.slice(0, 10) }).select("id").single();
if (error) throw error;
// Una raza del catálogo con talla y pelaje típicos (para ver que no pisa lo capturado).
const { data: conTipicos } = await A.from("razas").select("id, nombre, tamano_tipico_id, pelaje_tipico_id").not("tamano_tipico_id", "is", null).not("pelaje_tipico_id", "is", null).is("deleted_at", null).order("nombre").limit(1);
const tipica = conTipicos?.[0];

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 900 } });
  await ctx.addCookies(await cookiesDe(datos.recepcionB));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  const elegirRaza = async (nombre) => {
    const cambiar = p.getByRole("button", { name: "Cambiar", exact: true });
    if (await cambiar.count()) await cambiar.first().click();
    await p.getByLabel(/^Raza/).fill(nombre);
    await p.waitForTimeout(800);
    await p.getByRole("option", { name: new RegExp(`^${nombre}`) }).first().click().catch(async () => { await p.getByText(nombre, { exact: true }).first().click(); });
    await p.waitForTimeout(400);
  };
  const tam = () => p.locator('select[name="tamano_id"]').inputValue();
  const pel = () => p.locator('select[name="pelaje_id"]').inputValue();
  const abrir = async () => {
    await SB.from("formulario_borradores").delete().eq("negocio_id", B).eq("formulario", "mascota_nueva");
    await p.goto(`${BASE}/clientes/${cli.id}/perros/nuevo`, { waitUntil: "networkidle", timeout: 120000 });
    await (await campoNombreDelPerro(p)).fill(`ZZ Talla ${sufijo}`);
  };
  const opciones = await (async () => { await abrir(); return p.locator('select[name="tamano_id"] option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean)); })();
  const pelajes = await p.locator('select[name="pelaje_id"] option').evaluateAll((os) => os.map((o) => o.value).filter(Boolean));

  console.log("1. Tamaño y pelaje primero, luego «Mestizo»");
  await p.locator('select[name="tamano_id"]').selectOption(opciones[1]);
  await p.locator('select[name="pelaje_id"]').selectOption(pelajes[1]);
  await elegirRaza("Mestizo");
  comprobar((await tam()) === opciones[1], `el tamaño capturado se queda (${await tam() || "vacío"})`);
  comprobar((await pel()) === pelajes[1], `el pelaje capturado se queda (${await pel() || "vacío"})`);

  if (tipica) {
    console.log(`2. Tamaño y pelaje distintos a los típicos, luego «${tipica.nombre}»`);
    await abrir();
    const otraT = opciones.find((o) => o !== tipica.tamano_tipico_id);
    const otroP = pelajes.find((o) => o !== tipica.pelaje_tipico_id);
    await p.locator('select[name="tamano_id"]').selectOption(otraT);
    await p.locator('select[name="pelaje_id"]').selectOption(otroP);
    await elegirRaza(tipica.nombre);
    comprobar((await tam()) === otraT && (await pel()) === otroP, "la raza con típicos no pisa lo capturado");

    console.log(`3. Vacíos: «${tipica.nombre}» los sugiere; luego «Mestizo» no los borra`);
    await abrir();
    await elegirRaza(tipica.nombre);
    comprobar((await tam()) === tipica.tamano_tipico_id && (await pel()) === tipica.pelaje_tipico_id, "con los campos vacíos se llenan los típicos");
    await elegirRaza("Mestizo");
    comprobar((await tam()) === tipica.tamano_tipico_id && (await pel()) === tipica.pelaje_tipico_id, "cambiar a «Mestizo» no los borra");
  }

  console.log("4. Tamaño puesto, «Mestizo», y el borrador recargado");
  await abrir();
  await p.locator('select[name="tamano_id"]').selectOption(opciones[2] ?? opciones[0]);
  await elegirRaza("Mestizo");
  await p.waitForTimeout(3000);
  comprobar((await tam()) === (opciones[2] ?? opciones[0]), `sigue el tamaño después de esperar el autoguardado (${await tam() || "vacío"})`);

  console.log("5. Tamaño y pelaje, «Guardar» sin raza (el servidor la pide), y luego «Mestizo»");
  await abrir();
  await p.locator('select[name="tamano_id"]').selectOption(opciones[1]);
  await p.locator('select[name="pelaje_id"]').selectOption(pelajes[1]);
  await p.getByRole("button", { name: "Guardar perro" }).click();
  await p.getByText(/le falta: raza|Escribe la raza del perro/).first().waitFor({ timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(500);
  comprobar((await tam()) === opciones[1] && (await pel()) === pelajes[1], `el intento fallido no borra tamaño ni pelaje (${await tam() || "vacío"} / ${await pel() || "vacío"})`);
  await elegirRaza("Mestizo");
  comprobar((await tam()) === opciones[1] && (await pel()) === pelajes[1], `y al escoger «Mestizo» siguen (${await tam() || "vacío"} / ${await pel() || "vacío"})`);

  console.log("6. «No sé / mestizo» y elegir con el teclado (flechas y Enter)");
  await abrir();
  await p.locator('select[name="tamano_id"]').selectOption(opciones[1]);
  await p.locator('select[name="pelaje_id"]').selectOption(pelajes[1]);
  await elegirRaza("No sé / mestizo");
  comprobar((await tam()) === opciones[1] && (await pel()) === pelajes[1], `«No sé / mestizo» no los borra (${await tam() || "vacío"} / ${await pel() || "vacío"})`);
  await abrir();
  await p.locator('select[name="tamano_id"]').selectOption(opciones[1]);
  await p.locator('select[name="pelaje_id"]').selectOption(pelajes[1]);
  await p.getByLabel(/^Raza/).click();
  await p.getByLabel(/^Raza/).pressSequentially("mestizo", { delay: 60 });
  await p.waitForTimeout(600);
  await p.keyboard.press("Enter");
  await p.waitForTimeout(600);
  comprobar((await tam()) === opciones[1] && (await pel()) === pelajes[1], `con Enter tampoco (${await tam() || "vacío"} / ${await pel() || "vacío"})`);
  await ctx.close();
} finally {
  await nav.close();
  await SB.from("formulario_borradores").delete().eq("negocio_id", B).eq("formulario", "mascota_nueva");
  await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", cli.id);
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
