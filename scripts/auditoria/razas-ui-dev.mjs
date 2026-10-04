// Las pantallas de razas, con el navegador (SOLO DESARROLLO, en Huellitas).
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/razas-ui-dev.mjs
//
// 1. /perros/razas: los textos fuera del catálogo salen juntos, con su
//    conteo; «Es una raza nueva» manda la propuesta y el renglón avisa que
//    está pendiente.
// 2. /plataforma/catalogos (sesión de plataforma): la bandeja muestra la
//    propuesta y «Aprobar como raza nueva» la aprueba.
// 3. /perros/razas avisa «1 raza nueva sin grupo de precio»;
//    /perros/razas/grupos asigna el grupo y la raza deja de aparecer.
// 4. /estetica/nueva: el perro de esa raza muestra el recuadro «todavía no
//    tiene grupo de precio» (con una raza más sin grupo).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const BASE = "http://huellitas.localhost:3001";
const BASE_PLAT = "http://plataforma.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

async function cookiesDe(profileId, dominio) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}

const sufijo = String(Date.now()).slice(-5);
const NOMBRE = `Calupoh UI ${sufijo}`;
const { data: tallas } = await A.from("tamanos_categoria").select("id").eq("clave", "grande").single();
const creados = [];
for (const texto of [NOMBRE, NOMBRE.toLowerCase(), `perro ${NOMBRE}`]) {
  const { data } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ ui ${creados.length + 1}`, raza: texto, raza_id: null, tamano_id: tallas.id }).select("id").single();
  creados.push(data.id);
}
const { data: plataformaId } = await A.rpc("usuario_por_email", { p_email: "plataforma@peludesk.prueba" });

const nav = await abrirNavegador();
const ctx = await nav.newContext();
await ctx.addCookies(await cookiesDe(datos.adminB, "huellitas.localhost"));
const pag = await ctx.newPage();
const ctxP = await nav.newContext();
await ctxP.addCookies(await cookiesDe(plataformaId, "plataforma.localhost"));
const plat = await ctxP.newPage();
let razaId = null;

try {
  console.log("1. /perros/razas: agrupar y proponer");
  await pag.goto(`${BASE}/perros/razas`, { waitUntil: "networkidle" });
  const cuerpo = await pag.locator("body").innerText();
  if (!cuerpo.includes("Textos de raza fuera del catálogo")) hallazgo("no sale la sección «Textos de raza fuera del catálogo»");
  const tarjeta = pag.locator("li", { hasText: "3 perros" }).filter({ hasText: NOMBRE.toLowerCase().replace(/^./, (c) => c.toUpperCase()) }).first();
  if ((await tarjeta.count()) === 0) hallazgo("las tres escrituras de la misma raza no salen en un solo renglón de 3 perros");
  else bien("tres escrituras («Calupoh…», «calupoh…», «perro Calupoh…») salen en un solo renglón de 3 perros");
  await tarjeta.getByRole("button", { name: "Es una raza nueva" }).click();
  await tarjeta.getByLabel("Otras formas de escribirla (separadas por coma)").fill(`Calupo UI ${sufijo}`);
  await tarjeta.getByLabel("Talla típica").selectOption({ label: "Grande" });
  await tarjeta.getByRole("button", { name: "Enviar propuesta" }).click();
  await pag.waitForTimeout(2500);
  await pag.reload({ waitUntil: "networkidle" });
  if (!(await pag.locator("body").innerText()).includes("Propuesta enviada a la plataforma")) hallazgo("después de proponer, el renglón no dice que la propuesta está pendiente");
  else bien("«Es una raza nueva» manda la propuesta y el renglón avisa que está pendiente");

  console.log("\n2. /plataforma/catalogos: la bandeja");
  await plat.goto(`${BASE_PLAT}/plataforma/catalogos`, { waitUntil: "networkidle" });
  const caja = plat.locator("li").filter({ hasText: new RegExp(NOMBRE, "i") }).first();
  if ((await caja.count()) === 0) hallazgo("la bandeja de la plataforma no muestra la propuesta");
  else {
    const t = await caja.innerText();
    if (!t.includes("Huellitas") || !t.includes("3 perro") || !t.includes("Grande")) hallazgo(`la propuesta no muestra negocio, perros y talla: ${t.slice(0, 160)}`);
    else bien("la bandeja muestra la propuesta con su negocio, sus 3 perros y la talla");
    await caja.getByRole("button", { name: "Aprobar como raza nueva" }).click();
    await plat.waitForTimeout(3500);
    console.log("    tras aprobar:", (await plat.locator("body").innerText()).replace(/\s+/g, " ").match(/Listo:[^.]*\.|No se pudo[^.]*\.|Ya existe[^.]*\./)?.[0] ?? "(sin mensaje visible)");
  }
  const { data: razaNueva } = await A.from("razas").select("id, nombre").ilike("nombre", NOMBRE).maybeSingle();
  razaId = razaNueva?.id ?? null;
  if (!razaId) hallazgo("aprobar desde la pantalla no creó la raza");
  else bien("«Aprobar como raza nueva» la agrega al catálogo y liga a los perros");

  console.log("\n3. Grupo de precio");
  await pag.goto(`${BASE}/perros/razas`, { waitUntil: "networkidle" });
  const aviso = (await pag.locator("body").innerText()).toLowerCase();
  if (!/raza nueva sin grupo de precio|razas nuevas sin grupo de precio/.test(aviso) || !aviso.includes(NOMBRE.toLowerCase())) hallazgo("/perros/razas no avisa de la raza sin grupo");
  await pag.goto(`${BASE}/perros/razas/grupos`, { waitUntil: "networkidle" });
  const fila = pag.locator("li").filter({ hasText: new RegExp(NOMBRE, "i") }).first();
  if ((await fila.count()) === 0) hallazgo("/perros/razas/grupos no lista la raza");
  else {
    if (!(await fila.innerText()).match(/grande/i)) hallazgo("la fila no trae la talla típica del catálogo como guía");
    await fila.getByLabel("Grupo de precio").selectOption({ index: 1 });
    await fila.getByRole("button", { name: "Guardar grupo" }).click();
    await pag.waitForTimeout(2500);
    await pag.reload({ waitUntil: "networkidle" });
    if ((await pag.locator("li").filter({ hasText: new RegExp(NOMBRE, "i") }).count()) !== 0) hallazgo("después de guardar, la raza sigue sin grupo");
    else bien("asignar el grupo la saca de «sin grupo de precio»");
  }

  console.log("\n4. Cita de estética con una raza sin grupo");
  // Una raza más, sin grupo, con un perro.
  const { data: otra } = await A.from("razas").insert({ nombre: `SinGrupo UI ${sufijo}` }).select("id").single();
  const { data: perroSG } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ sin grupo ${sufijo}`, raza: `SinGrupo UI ${sufijo}`, raza_id: otra.id, tamano_id: tallas.id }).select("id").single();
  creados.push(perroSG.id);
  await pag.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
  const buscador = pag.locator("input:visible").first();
  await buscador.fill("ZZ sin grupo");
  await pag.waitForTimeout(800);
  await pag.getByText(`ZZ sin grupo ${sufijo}`).first().click();
  await pag.waitForTimeout(500);
  await pag.getByLabel("Perro").selectOption({ label: `ZZ sin grupo ${sufijo}` });
  const panel = await pag.locator("body").innerText();
  if (!panel.includes("todavía no tiene grupo de precio") || !panel.includes("Asignarlo a la raza") || !panel.includes("Solo para esta cita")) hallazgo("el perro de una raza sin grupo no muestra el recuadro de asignar grupo o excepción");
  else bien("al elegir el perro sale «todavía no tiene grupo de precio» con asignar el grupo y la excepción");
  await pag.getByRole("button", { name: "Agendar cita" }).click();
  await pag.waitForTimeout(1200);
  if (!(await pag.locator("body").innerText()).includes("Asígnaselo arriba")) hallazgo("agendar sin grupo ni excepción no explica qué hacer");
  else bien("agendar sin asignar el grupo ni hacer excepción se detiene y dice qué hacer");
  await A.from("razas").delete().eq("id", otra.id).then(() => {}, () => {});
} finally {
  await nav.close();
  await SB.from("razas_propuestas_perros").delete().in("perro_id", creados);
  await SB.from("perros").update({ deleted_at: new Date().toISOString(), raza_id: null }).in("id", creados);
  await SB.from("razas_propuestas").update({ raza_id: null }).eq("negocio_id", B).not("raza_id", "is", null);
  const { data: restos } = await A.from("razas").select("id").or(`nombre.ilike.%UI ${sufijo},nombre.ilike.SinGrupo UI ${sufijo}`);
  for (const r of restos ?? []) {
    await SB.from("razas_grupo").delete().eq("raza_id", r.id);
    await A.from("razas").delete().eq("id", r.id);
  }
  await SB.from("razas_propuestas").delete().ilike("nombre", `%UI ${sufijo}`);
  void tokenDe;
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
