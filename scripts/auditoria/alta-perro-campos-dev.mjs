// N14, N15 y N16 (QA externa, cierre del 16 de octubre de 2026) — SOLO DESARROLLO, Huellitas, con el servidor en el 3001.
//
//   node scripts/auditoria/alta-perro-campos-dev.mjs
//
// N14. «Solo estética · vacunas no requeridas» solo sale cuando el negocio da estética y el perro de verdad solo viene a
//      estética; en Hotel/Guardería un perro nuevo muestra lo que le falta; sin guardería ni hotel (Veterinaria) no sale.
// N15. «Generar otro enlace» con la cuenta ya activada en otra ventana: se oculta el enlace usado y sale «ya tiene cuenta».
// N16. El alta exige raza (o Mestizo) y, con Estética y una raza que no fija el precio sola, tamaño y pelaje: por el
//      formulario del personal (servidor), por el link de alta (alta-link-dev lo cubre de punta a punta) y por el importador
//      (importador-dev, sección A10); aquí además la regla pura y la función de la base, que tienen que coincidir.
// Sugerencia: el portal no muestra los títulos vacíos de la plantilla de consulta.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";
import { faltantesAltaPerro } from "../../src/lib/perros/alta-requisitos.ts";
import { aplicanRequisitosDe } from "../../src/lib/perros/alta-requisitos.ts";
import { sinTitulosVacios } from "../../src/lib/veterinaria/portal-texto.ts";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const seccion = (t) => console.log(`── ${t}`);
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);
const como = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });

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

// Los módulos de la prueba se restauran siempre.
const MODS = ["estetica", "guarderia", "hotel"];
const originales = {};
for (const m of MODS) {
  const r = await SB.from("negocio_modulos").select("activo").eq("negocio_id", B).eq("modulo", m).is("deleted_at", null).maybeSingle();
  originales[m] = r.data ? r.data.activo : true;
}
const fijar = async (m, activo) => {
  const r = await SB.from("negocio_modulos").select("id").eq("negocio_id", B).eq("modulo", m).is("deleted_at", null).maybeSingle();
  if (r.data) await SB.from("negocio_modulos").update({ activo }).eq("id", r.data.id);
  else await SB.from("negocio_modulos").insert({ negocio_id: B, modulo: m, activo });
};
const restaurar = async () => { for (const m of MODS) await fijar(m, originales[m]).catch(() => {}); };

const creados = { clientes: [], perros: [] };
const nav = await abrirNavegador();
try {
  for (const m of MODS) await fijar(m, true);

  seccion("1. La regla pura y la de la base coinciden (N16)");
  const { data: tamanos } = await A.from("tamanos_categoria").select("id").eq("clave", "grande").single();
  const { data: pelajes } = await A.from("tipos_pelaje").select("id").eq("clave", "corto").single();
  const admin = await como(datos.adminB);
  const casos = [
    ["sin nada", { raza: null, raza_id: null, tamano_id: null, pelaje_id: null }, ["raza"]],
    ["raza escrita sin talla ni pelaje", { raza: "Algo raro", raza_id: null, tamano_id: null, pelaje_id: null }, ["tamaño", "pelaje"]],
    ["raza escrita completa", { raza: "Algo raro", raza_id: null, tamano_id: tamanos.id, pelaje_id: pelajes.id }, []],
  ];
  for (const [nombre, c, esperado] of casos) {
    const ts = faltantesAltaPerro(c, ["estetica"], []);
    const { data: bd } = await admin.rpc("perro_faltantes_alta", { p_raza: c.raza, p_raza_id: c.raza_id, p_tamano_id: c.tamano_id, p_pelaje_id: c.pelaje_id });
    const ok = esperado.every((e) => ts.some((x) => x.startsWith(e))) && ts.length === esperado.length && (bd ?? []).length === esperado.length;
    comprobar(ok, `${nombre}: TypeScript ${JSON.stringify(ts)} y base ${JSON.stringify(bd)}`);
  }
  comprobar(faltantesAltaPerro({ raza: null, tamano_id: null, pelaje_id: null }, ["veterinaria"], []).length === 0, "solo Veterinaria: no se exige nada");
  const anon = await fetch(`${URL}/rest/v1/rpc/perro_faltantes_alta`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json", "x-negocio-id": B }, body: "{}" });
  comprobar(anon.status >= 400, `la llave anónima no ejecuta la función (${anon.status})`);
  comprobar(aplicanRequisitosDe({ modulos: ["hotel"], usaGuarderiaHotel: false, tieneCitasEstetica: false }) === true, "Hotel, perro nuevo: se muestran los requisitos");
  comprobar(aplicanRequisitosDe({ modulos: ["estetica", "hotel"], usaGuarderiaHotel: false, tieneCitasEstetica: true }) === false, "con estética y citas, sin estancias: «solo estética»");
  comprobar(aplicanRequisitosDe({ modulos: ["estetica", "hotel"], usaGuarderiaHotel: false, tieneCitasEstetica: false }) === true, "con estética pero sin citas ni estancias: se muestran los requisitos");
  comprobar(aplicanRequisitosDe({ modulos: ["veterinaria"], usaGuarderiaHotel: false, tieneCitasEstetica: false }) === false, "Veterinaria sola: no hay requisitos de guardería/hotel (ni aviso)");

  seccion("2. Formulario del personal: el servidor exige la raza, el tamaño y el pelaje (N16)");
  const { data: cli } = await SB.from("clientes").insert({ negocio_id: B, nombre: `ZZ Alta ${sufijo}`, telefono: `44${sufijo}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}` }).select("id").single();
  creados.clientes.push(cli.id);
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(await cookiesDe(datos.recepcionB));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  await p.goto(`${BASE}/clientes/${cli.id}/perros/nuevo`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar((await p.getByText("Raza (obligatoria)").count()) > 0, "la etiqueta dice «Raza (obligatoria)»");
  await p.getByLabel("Nombre del perro").fill(`ZZ Sin Datos ${sufijo}`);
  await p.getByRole("button", { name: "Guardar perro" }).click();
  const rechazo = await p.getByText(/le falta: raza/).first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  comprobar(rechazo, "sin raza: el servidor rechaza y dice qué falta");
  const guardado = await SB.from("perros").select("id").eq("cliente_id", cli.id).like("nombre", "ZZ Sin Datos%").is("deleted_at", null);
  comprobar((guardado.data ?? []).length === 0, "y no se guardó el perro");

  // Mestizo: el formulario pide tamaño y pelaje (obligatorios en pantalla); el servidor los vuelve a exigir (sección 1 y A10 del importador).
  await p.getByLabel(/^Raza/).fill("Mestizo");
  await p.waitForTimeout(800);
  await p.getByRole("option", { name: /^Mestizo/ }).first().click().catch(async () => { await p.getByText("Mestizo", { exact: true }).first().click(); });
  console.log("    raza oculta:", await p.locator('input[name="raza"]').inputValue().catch(() => "—"), "| id:", await p.locator('input[name="raza_id"]').inputValue().catch(() => "—"));
  comprobar((await p.getByLabel("Tamaño (obligatorio)").count()) === 1 && (await p.getByLabel("Pelaje (obligatorio)").count()) === 1, "con «Mestizo» el formulario marca tamaño y pelaje como obligatorios");
  await p.getByLabel(/^Tamaño/).selectOption({ index: 1 });
  await p.getByLabel(/^Pelaje/).selectOption({ index: 1 });
  console.log("    tamaño/pelaje:", await p.getByLabel(/^Tamaño/).inputValue(), await p.getByLabel(/^Pelaje/).inputValue());
  await p.getByRole("button", { name: "Guardar perro" }).click();
  await p.waitForURL(/\/perros\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(() => {});
  if (!/\/perros\/[0-9a-f-]{36}/.test(p.url())) console.log("    texto:", ((await p.locator("[role=alert], .text-coral-oscuro").allInnerTexts()).join(" | ") || (await p.locator("main").innerText()).slice(0, 400)).replace(/\s+/g, " "));
  const perroNuevoId = p.url().match(/\/perros\/([0-9a-f-]{36})/)?.[1];
  comprobar(Boolean(perroNuevoId), `completo: se guarda (${p.url()})`);
  if (perroNuevoId) creados.perros.push(perroNuevoId);

  seccion("3. N14: lo que dice el expediente de un perro nuevo en un negocio con Estética y Hotel");
  if (perroNuevoId) {
    const t = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    comprobar(!/Viene solo a estética/.test(t) && !/Solo estética · vacunas no requeridas/.test(t), "el expediente NO dice «solo a estética» de un perro sin citas ni estancias");
    comprobar(/Requisitos para guardería y hotel/.test(t), "y muestra el bloque «Requisitos para guardería y hotel»");
    await p.goto(`${BASE}/clientes/${cli.id}`, { waitUntil: "networkidle", timeout: 120000 });
    const tc = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    comprobar(!/Solo estética · vacunas no requeridas/.test(tc), "la ficha del cliente tampoco lo dice");
  }

  // Un perro que de verdad solo viene a estética: con citas y sin estancias.
  const { data: conCitas } = await SB.from("citas_estetica").select("perro_id").eq("negocio_id", B).is("deleted_at", null).neq("estado", "cancelada").limit(200);
  const idsCitas = [...new Set((conCitas ?? []).map((c) => c.perro_id))];
  const { data: conEst } = idsCitas.length ? await SB.from("perros_con_guarderia_hotel").select("perro_id").in("perro_id", idsCitas) : { data: [] };
  const usan = new Set((conEst ?? []).map((x) => x.perro_id));
  const soloEst = idsCitas.find((id) => !usan.has(id));
  if (!soloEst) console.log("    (Huellitas no tiene un perro con citas de estética y sin estancias: se salta el caso positivo)");
  else {
    await p.goto(`${BASE}/perros/${soloEst}`, { waitUntil: "networkidle", timeout: 120000 });
    const ts = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    comprobar(/Solo estética · vacunas no requeridas/.test(ts) || /Viene solo a estética/.test(ts), "un perro que de verdad solo viene a estética SÍ muestra el aviso");
  }

  seccion("4. N14: Veterinaria sin guardería ni hotel — ni aviso ni requisitos de estancia");
  await fijar("guarderia", false); await fijar("hotel", false);
  await p.goto(`${BASE}/clientes/${cli.id}`, { waitUntil: "networkidle", timeout: 120000 });
  const tv = (await p.locator("body").innerText()).replace(/\s+/g, " ");
  comprobar(!/Solo estética/.test(tv) && !/vacunas no requeridas/.test(tv), "la ficha del cliente no dice «Solo estética»");
  if (perroNuevoId) {
    await p.goto(`${BASE}/perros/${perroNuevoId}`, { waitUntil: "networkidle", timeout: 120000 });
    const tp = (await p.locator("body").innerText()).replace(/\s+/g, " ");
    comprobar(!/Viene solo a estética/.test(tp) && !/Solo estética/.test(tp), "el expediente tampoco");
  }
  await fijar("estetica", false);
  await p.goto(`${BASE}/clientes/${cli.id}/perros/nuevo`, { waitUntil: "networkidle", timeout: 120000 });
  await p.getByLabel("Nombre del perro").fill(`ZZ Vet ${sufijo}`);
  await p.getByRole("button", { name: "Guardar perro" }).click();
  await p.waitForURL(/\/perros\/[0-9a-f-]{36}/, { timeout: 60000 }).catch(() => {});
  const vetId = p.url().match(/\/perros\/([0-9a-f-]{36})/)?.[1];
  comprobar(Boolean(vetId), "sin Estética, guardería ni hotel: se puede guardar un perro sin raza (no se exige)");
  if (vetId) creados.perros.push(vetId);
  for (const m of MODS) await fijar(m, true);

  seccion("5. N15: «Generar otro enlace» con la cuenta ya activada en otra ventana");
  const { data: cli2 } = await SB.from("clientes").insert({ negocio_id: B, nombre: `ZZ Portal ${sufijo}`, telefono: `45${sufijo}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}` }).select("id").single();
  creados.clientes.push(cli2.id);
  const adminCtx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await adminCtx.addCookies(await cookiesDe(datos.adminB));
  const pa = await adminCtx.newPage();
  pa.setDefaultTimeout(60000);
  await pa.goto(`${BASE}/clientes/${cli2.id}`, { waitUntil: "networkidle", timeout: 120000 });
  await pa.getByRole("button", { name: "Invitar al portal" }).click();
  const campo = pa.locator("#invitar-portal input[readonly]").first();
  await campo.waitFor({ timeout: 30000 });
  const enlace = await campo.inputValue();
  comprobar(/\/activar\//.test(enlace), `se genera el enlace (${enlace.slice(0, 40)}…)`);
  // La otra ventana: el dueño activa su cuenta con ese enlace.
  const duenoCtx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pd = await duenoCtx.newPage();
  pd.setDefaultTimeout(60000);
  const clave = claveAleatoria();
  await pd.goto(`${BASE}${new globalThis.URL(enlace).pathname}`, { waitUntil: "networkidle", timeout: 120000 });
  await pd.getByLabel("Escoge tu contraseña").fill(clave);
  await pd.getByLabel("Repítela").fill(clave);
  await pd.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await pd.waitForURL(/\/portal/, { timeout: 60000 }).catch(() => {});
  comprobar(/\/portal/.test(pd.url()), `el dueño activa su cuenta (${pd.url()})`);
  // Vuelve a la ventana del personal, que no se enteró.
  await pa.getByRole("button", { name: "Generar otro enlace" }).click();
  const activa = await pa.getByText("Este cliente ya tiene cuenta activa").waitFor({ timeout: 30000 }).then(() => true).catch(() => false);
  comprobar(activa, "sale el estado «ya tiene cuenta activa»");
  comprobar((await pa.locator("#invitar-portal input[readonly]").count()) === 0, "el enlace usado ya no se muestra");
  comprobar((await pa.getByRole("button", { name: "Copiar" }).count()) === 0 && (await pa.getByText("Mandar por WhatsApp").count()) === 0, "ni su botón de copiar ni «Mandar por WhatsApp»");
  comprobar((await pa.getByText(/Vence el/).count()) === 0, "ni la fecha de vencimiento");
  comprobar((await pa.getByRole("button", { name: "Generar otro enlace" }).count()) === 0, "ni el botón de generar otro");

  seccion("6. Portal: los títulos vacíos de la plantilla no se muestran");
  comprobar(sinTitulosVacios("Estudios solicitados:\nSeguimiento / próxima revisión:\nRecomendaciones al propietario:") === "", "todo vacío: no queda nada");
  comprobar(sinTitulosVacios("Estudios solicitados:\nSeguimiento / próxima revisión: en 7 días\nRecomendaciones al propietario:") === "Seguimiento / próxima revisión: en 7 días", "solo queda lo que se llenó");
  comprobar(sinTitulosVacios("Tratamiento:\nAmoxicilina 1 tableta cada 12 h") === "Tratamiento:\nAmoxicilina 1 tableta cada 12 h", "un título con sus renglones se conserva");
  await ctx.close(); await adminCtx.close(); await duenoCtx.close();
} finally {
  await nav.close();
  await restaurar();
  const ahora = new Date().toISOString();
  if (creados.perros.length) await SB.from("perros").update({ deleted_at: ahora }).in("id", creados.perros);
  if (creados.clientes.length) {
    await SB.from("perros").update({ deleted_at: ahora }).in("cliente_id", creados.clientes);
    await SB.from("clientes").update({ deleted_at: ahora }).in("id", creados.clientes);
  }
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
