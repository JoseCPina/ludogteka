// Agendar estética con un mestizo, a 390 px (celular) — SOLO DESARROLLO, en
// Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/mestizo-ui-dev.mjs
//
// 1. Osito (mestizo, chico, pelo largo): un solo aviso, el precio $390, y
//    avanza hasta la cita y su cuenta con $390.
// 2. Un mestizo sin pelaje: UN aviso con el selector ahí mismo; al guardar se
//    recalcula y se puede agendar (sin salir de la pantalla).
// 3. Celda sin precio: UN aviso «Esta combinación no tiene precio…» con los dos
//    botones; con la excepción (grupo y motivo) sale el precio y se agenda.
// 4. Servicios y precios: la matriz Mestizo / sin raza (talla × pelaje) con
//    las celdas «Calculado» y el botón para confirmarlas.
// 5. El formulario del perro pide talla y pelaje cuando la raza es Mestizo.
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
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
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
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar(w <= 392, `${donde}: sin desborde a 390 px (${w}px)`);
};

const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const talla = (c) => tallas.find((t) => t.clave === c).id;
const pelaje = (c) => pelajes.find((t) => t.clave === c).id;
const { data: razas } = await A.from("razas").select("id, nombre");
const razaMestizo = razas.find((r) => r.nombre === "Mestizo").id;
const { data: grupoMestizo } = await SB.from("grupos_raza").select("id").eq("clave", "mestizo").single();
const { data: serv } = await SB.from("servicios").select("id, clave").eq("categoria", "estetica").is("deleted_at", null);
const srv = (c) => serv.find((s) => s.clave === `estetica_${c}`).id;
const { data: cliente } = await SB.from("clientes").select("id, nombre").eq("id", datos.clienteSoloB).single();
const creados = [];
const mkPerro = async (nombre, t, p) => {
  const { data, error } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `${nombre} ${sufijo}`, raza: "Mestizo", raza_id: razaMestizo, tamano_id: t ? talla(t) : null, pelaje_id: p ? pelaje(p) : null }).select("id").single();
  if (error) throw new Error(error.message);
  creados.push(data.id);
  return `${nombre} ${sufijo}`;
};
await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("perro_id", (await SB.from("perros").select("id").like("nombre", "ZZUI%")).data?.map((p) => p.id) ?? []);

const nav = await abrirNavegador();
const ctxAdmin = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxAdmin.addCookies(await cookiesDe(datos.adminB));
const pa = await ctxAdmin.newPage();

// Elige al cliente de prueba en /estetica/nueva y luego al perro.
async function abrirAgendar(nombrePerro) {
  await pa.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
  await pa.locator("input:visible").first().fill(nombrePerro);
  await pa.waitForTimeout(800);
  await pa.getByText(nombrePerro).first().click();
  await pa.waitForTimeout(500);
  await pa.getByLabel("Perro").selectOption({ label: nombrePerro });
}
const hora = () => {
  const f = new Date(Date.now() + (90 + Math.floor(Math.random() * 400)) * 86400000);
  const pad = (x) => String(x).padStart(2, "0");
  return `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}T${pad(10 + Math.floor(Math.random() * 8))}:${pad(Math.floor(Math.random() * 6) * 10)}`;
};

try {
  // ── 1. Osito ──
  console.log("1. Osito: mestizo, chico, pelo largo");
  const osito = await mkPerro("ZZUI Osito", "chico", "largo");
  await abrirAgendar(osito);
  await pa.locator("[data-aviso-precio=ok]").waitFor({ timeout: 15000 });
  const avisos = await pa.locator("[data-aviso-precio]").count();
  const txt = await pa.locator("[data-aviso-precio]").innerText();
  comprobar(avisos === 1 && /\$390\.00/.test(txt), `un solo aviso, con el precio: «${txt}»`);
  const cuerpo = await pa.locator("body").innerText();
  comprobar(!/no cobra automático|todavía no tiene grupo|callejón/i.test(cuerpo), "ya no salen los avisos de «no cobra automático»");
  await sinDesborde(pa, "agendar con Osito");
  await pa.getByLabel("Empleado").selectOption({ index: 1 });
  await pa.getByLabel("Fecha y hora").fill(hora());
  await pa.getByRole("button", { name: "Agendar cita" }).click();
  await pa.waitForURL(/\/estetica\/[0-9a-f-]{36}/, { timeout: 30000 });
  const detalle = await pa.locator("body").innerText();
  comprobar(/390/.test(detalle), "la cita se agenda y su detalle dice $390");
  const citaId = pa.url().split("/").pop();
  const { data: citaO } = await SB.from("citas_estetica").select("precio, reserva_id").eq("id", citaId).single();
  comprobar(Number(citaO.precio) === 390, "la cita guardó $390");
  await pa.goto(`${BASE}/caja/cobrar/${citaO.reserva_id}`, { waitUntil: "networkidle" });
  comprobar(/390/.test(await pa.locator("body").innerText()), "y llega al cobro con $390 por cobrar");

  // ── 2. Sin pelaje ──
  console.log("2. Mestizo sin pelaje: el selector ahí mismo");
  const sinPelo = await mkPerro("ZZUI Sinpelo", "mediano", null);
  await abrirAgendar(sinPelo);
  await pa.locator("[data-aviso-precio=faltan-datos]").waitFor({ timeout: 15000 });
  const t2 = await pa.locator("[data-aviso-precio]").innerText();
  comprobar((await pa.locator("[data-aviso-precio]").count()) === 1 && /falta el pelaje/.test(t2), `un solo aviso que dice qué falta («${t2.split("\n")[0]}»)`);
  comprobar((await pa.getByLabel("Pelaje").locator("option").allInnerTexts()).join("|") === "Elige el pelaje|Corto|Medio|Largo", "el selector ofrece corto, medio y largo");
  await sinDesborde(pa, "aviso de pelaje faltante");
  const botonDesactivado = await pa.getByRole("button", { name: "Agendar cita" }).isDisabled();
  comprobar(botonDesactivado, "«Agendar cita» espera a que haya precio");
  await pa.getByLabel("Pelaje").selectOption({ label: "Medio" });
  await pa.getByRole("button", { name: "Guardar en su expediente y calcular" }).click();
  await pa.locator("[data-aviso-precio=ok]").waitFor({ timeout: 15000 });
  comprobar(/\$470\.00/.test(await pa.locator("[data-aviso-precio]").innerText()), "al guardar se recalcula en el momento: mediano de pelo medio $470");
  const { data: pg } = await SB.from("perros").select("pelaje_id").eq("nombre", sinPelo).single();
  comprobar(pg.pelaje_id === pelaje("medio"), "y el pelaje quedó en su expediente");
  await pa.getByLabel("Empleado").selectOption({ index: 1 });
  await pa.getByLabel("Fecha y hora").fill(hora());
  await pa.getByRole("button", { name: "Agendar cita" }).click();
  await pa.waitForURL(/\/estetica\/[0-9a-f-]{36}/, { timeout: 30000 });
  bien("se agenda sin salir de la pantalla");

  // ── 3. Celda vacía + excepción ──
  console.log("3. Combinación sin precio: un aviso, dos salidas");
  const vacio = await mkPerro("ZZUI Vacio", "chico", "medio");
  const { data: filas } = await SB.from("tarifas").select("id").eq("servicio_id", srv("expres")).eq("grupo_raza_id", grupoMestizo.id).eq("tamano_id", talla("chico")).eq("pelaje_id", pelaje("medio")).is("deleted_at", null);
  await SB.from("tarifas").update({ deleted_at: new Date().toISOString() }).in("id", filas.map((f) => f.id));
  try {
    await abrirAgendar(vacio);
    await pa.getByLabel("Servicio").selectOption({ label: "Baño exprés" });
    await pa.locator("[data-aviso-precio=sin_precio]").waitFor({ timeout: 15000 });
    const t3 = await pa.locator("[data-aviso-precio]").innerText();
    comprobar((await pa.locator("[data-aviso-precio]").count()) === 1 && /Esta combinación no tiene precio/.test(t3) && /Servicios y precios/.test(t3) && /excepción con motivo/.test(t3), `un solo aviso, el texto pedido («${t3.split("\n")[0]}»)`);
    const href = await pa.getByRole("link", { name: "Agregar el precio en Servicios y precios" }).getAttribute("href");
    comprobar(/^\/servicios\/.+\/tarifas$/.test(href ?? ""), "el botón lleva a la matriz de ese servicio");
    await sinDesborde(pa, "aviso de combinación sin precio");
    await pa.getByRole("button", { name: "Registrar excepción con motivo" }).click();
    await pa.getByLabel("Grupo de precio").selectOption({ label: "Poodle, maltés y similares" });
    await pa.getByLabel("Motivo de la excepción").fill("Mientras capturamos el precio");
    await pa.locator("[data-aviso-precio=ok]").waitFor({ timeout: 15000 });
    comprobar(/\$190\.00/.test(await pa.locator("[data-aviso-precio]").innerText()), "con la excepción sale el precio ($190) y se puede agendar");
    await pa.getByLabel("Empleado").selectOption({ index: 1 });
    await pa.getByLabel("Fecha y hora").fill(hora());
    await pa.getByRole("button", { name: "Agendar cita" }).click();
    await pa.waitForURL(/\/estetica\/[0-9a-f-]{36}/, { timeout: 30000 });
    const id3 = pa.url().split("/").pop();
    const { data: c3 } = await SB.from("citas_estetica").select("precio, excepcion_grupo_motivo").eq("id", id3).single();
    comprobar(Number(c3.precio) === 190 && c3.excepcion_grupo_motivo === "Mientras capturamos el precio", "la cita queda con la excepción y su motivo");
  } finally {
    await SB.from("tarifas").update({ deleted_at: null }).in("id", filas.map((f) => f.id));
  }

  // ── 4. Servicios y precios ──
  console.log("4. Servicios y precios: la matriz del mestizo");
  await SB.from("tarifas").update({ calculado: true }).eq("grupo_raza_id", grupoMestizo.id).in("pelaje_id", [pelaje("medio"), pelaje("largo")]).is("deleted_at", null);
  await pa.goto(`${BASE}/servicios/${srv("estetico")}/tarifas`, { waitUntil: "networkidle" });
  const t4 = await pa.locator("body").innerText();
  comprobar(/Mestizo \/ sin raza/.test(t4) && /pelo corto/.test(t4) && /pelo medio/.test(t4) && /pelo largo/.test(t4), "la matriz trae Mestizo / sin raza con pelo corto, medio y largo por talla");
  comprobar((await pa.locator("[data-celda-calculada]").count()) === 6, `las 6 celdas de medio y largo (baño) salen «Calculado» (${await pa.locator("[data-celda-calculada]").count()})`);
  comprobar((await pa.locator("[data-precios-calculados]").count()) === 1, "hay un aviso con el botón para confirmarlas");
  await sinDesborde(pa, "matriz de tarifas del baño");
  await pa.getByRole("button", { name: "Confirmar los precios calculados" }).click();
  await pa.waitForTimeout(2500);
  const { data: quedan } = await SB.from("tarifas_vigentes").select("calculado").eq("servicio_id", srv("estetico")).eq("grupo_raza_id", grupoMestizo.id).eq("calculado", true);
  comprobar((quedan ?? []).length === 0, "al confirmarlas quedan como del negocio");
  await pa.reload({ waitUntil: "networkidle" });
  comprobar((await pa.locator("[data-celda-calculada]").count()) === 0, "y la marca desaparece");

  // ── 5. Formulario del perro ──
  console.log("5. Formulario del perro");
  await pa.goto(`${BASE}/clientes/${cliente.id}/perros/nuevo`, { waitUntil: "networkidle" });
  await pa.getByLabel("Nombre del perro").fill(`ZZUI Form ${sufijo}`);
  await pa.getByLabel("Raza").first().fill("Mestizo");
  await pa.waitForTimeout(600);
  await pa.getByText("Mestizo", { exact: true }).first().click().catch(() => {});
  await pa.waitForTimeout(500);
  comprobar((await pa.locator("[data-pide-talla-pelaje]").count()) === 1, "con raza Mestizo el formulario explica que se piden talla y pelaje");
  comprobar((await pa.getByLabel("Tamaño (obligatorio)").count()) === 1 && (await pa.getByLabel("Pelaje (obligatorio)").count()) === 1, "y los marca obligatorios");
  await sinDesborde(pa, "formulario del perro mestizo");
} catch (e) {
  hallazgo(`la prueba tronó: ${e.message}`);
} finally {
  await nav.close();
  if (creados.length) {
    await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("perro_id", creados);
    await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados);
  }
  await SB.from("tarifas").update({ calculado: true }).eq("grupo_raza_id", grupoMestizo.id).in("pelaje_id", [pelaje("medio"), pelaje("largo")]).is("deleted_at", null);
}
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en pantalla.");
process.exit(hallazgos.length ? 1 : 0);
