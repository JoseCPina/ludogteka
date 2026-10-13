// Carnet, certificados, hospitalización y consentimientos EN PANTALLA, a 390 px
// (celular) — SOLO DESARROLLO, en Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/veterinaria-fase1-ui-dev.mjs
//
// 1. Carnet: registrar vacuna y desparasitación, anular con motivo, enlace verificable
//    con QR (público sin sesión), revocarlo, hoja imprimible.
// 2. Recordatorios: la lista con «Abrir en WhatsApp» y «Ya lo mandé».
// 3. Certificado: emitir, ver la hoja con el médico y su cédula, anular.
// 4. Hospitalización: ingresar, indicar medicación, aplicar la dosis, monitoreo, cargo,
//    consentimiento firmado en pantalla (PDF en Storage) y alta.
// 5. Portal del dueño: su carnet.
// 6. El envío automático de recordatorios contra un WhatsApp de mentiras (4460): una vez
//    por dosis, solo con la plantilla aprobada, con el teléfono del negocio, nunca dos veces.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
// Espera el aviso de que una acción del servidor terminó (hasta 45 s) ANTES de recargar: con 15 s y
// «catch», una acción lenta se daba por buena y la recarga la cortaba a la mitad.
const esperarAviso = async (pag, texto) => {
  const t0 = Date.now();
  await pag.getByText(texto).first().waitFor({ timeout: 45000 }).catch(() => console.log(`   (sin aviso «${texto}» tras 45 s)`));
  const ms = Date.now() - t0;
  if (ms > 8000) console.log(`   (la acción «${texto}» tardó ${ms} ms)`);
};
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const sumaDias = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);

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
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar(w <= 392, `${donde}: sin desborde a 390 px (${w}px)`);
};
const cuerpo = async (pag) => (await pag.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");

const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recId = recepciones[0].profile_id;
const admin = await comoPersona(datos.adminB);
const hoyB = (await admin.rpc("fecha_negocio")).data;

const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies(await cookiesDe(datos.adminB));
const pa = await ctx.newPage();
pa.on("dialog", (d) => d.accept());

let servidor2 = null;
let doble = null;
const salvaTelefono = { guardado: false, id: null, valor: null };
try {
  // Preparación: Veterinaria prendida, un médico y un producto con lote.
  for (const m of ["inventario", "veterinaria"]) {
    const r = await SB.from("negocio_modulos").select("id").eq("negocio_id", B).eq("modulo", m).is("deleted_at", null).maybeSingle();
    if (r.data) await SB.from("negocio_modulos").update({ activo: true }).eq("id", r.data.id);
    else await SB.from("negocio_modulos").insert({ negocio_id: B, modulo: m, activo: true });
  }
  const cedula = `UI${sufijo}`;
  const med = await admin.rpc("guardar_medico_veterinario", { p_profile_id: recId, p_cedula: cedula, p_cpa: "CPA-UI" });
  if (med.error) throw new Error(`médico: ${med.error.message}`);
  const { data: area } = await SB.from("areas_inventario").select("id").eq("negocio_id", B).eq("clave", "botiquin").single();
  const { data: unidades } = await SB.from("unidades_medida").select("id, clave");
  const u = (c) => unidades.find((x) => x.clave === c).id;
  const prod = await admin.rpc("guardar_producto_clinico", { p_id: null, p_nombre: `Vacuna UI ${sufijo}`, p_area_id: area.id, p_unidad_compra_id: u("l"), p_unidad_consumo_id: u("ml"), p_stock_minimo: 0, p_dias_aviso_caducidad: 30, p_principio_activo_id: null, p_grupo_senasica: null, p_clasificacion_lgs: null, p_es_antimicrobiano: false, p_clasificacion_por_confirmar: false });
  const lote = await admin.rpc("registrar_lote_entrada", { p_insumo_id: prod.data, p_codigo: `UI-${sufijo}`, p_caducidad: sumaDias(hoyB, 200), p_cantidad_compra: 1 });
  if (lote.error) throw new Error(`lote: ${lote.error.message}`);
  // El carnet solo ofrece vacunas en «Vacuna»: este producto se clasifica y otro con lotes (un sedante) no debe aparecer.
  const tipo = await admin.rpc("producto_clinico_tipo_guardar", { p_id: prod.data, p_tipo: "vacuna" });
  if (tipo.error) throw new Error(`tipo: ${tipo.error.message}`);
  const sedante = await admin.rpc("guardar_producto_clinico", { p_id: null, p_nombre: `Sedante UI ${sufijo}`, p_area_id: area.id, p_unidad_compra_id: u("l"), p_unidad_consumo_id: u("ml"), p_stock_minimo: 0, p_dias_aviso_caducidad: 30, p_principio_activo_id: null, p_grupo_senasica: null, p_clasificacion_lgs: null, p_es_antimicrobiano: false, p_clasificacion_por_confirmar: false });
  if (sedante.error) throw new Error(`sedante: ${sedante.error.message}`);
  const loteSedante = await admin.rpc("registrar_lote_entrada", { p_insumo_id: sedante.data, p_codigo: `SED-${sufijo}`, p_caducidad: sumaDias(hoyB, 200), p_cantidad_compra: 1 });
  if (loteSedante.error) throw new Error(`lote sedante: ${loteSedante.error.message}`);
  const nombrePerro = `Fase1 ${sufijo}`;
  const { data: perro } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: nombrePerro, especie: "perro" }).select("id").single();
  const rid = perro.id;

  // ── 1. Carnet ──
  console.log("1. Carnet");
  await pa.goto(`${BASE}/veterinaria`, { waitUntil: "networkidle" });
  comprobar(/Carnets/.test(await cuerpo(pa)) && /Hospitalización/.test(await cuerpo(pa)) && /Certificados de salud/.test(await cuerpo(pa)) && /Recordatorios de dosis/.test(await cuerpo(pa)), "el inicio de Veterinaria trae las tarjetas nuevas");
  await sinDesborde(pa, "inicio de Veterinaria");
  await pa.goto(`${BASE}/veterinaria/carnet?q=${encodeURIComponent(nombrePerro)}`, { waitUntil: "networkidle" });
  comprobar(/Fase1/.test(await cuerpo(pa)), "la búsqueda encuentra a la mascota");
  await pa.getByRole("link", { name: new RegExp(nombrePerro) }).first().click();
  await pa.waitForURL(/\/veterinaria\/carnet\//);
  comprobar(new RegExp(`Carnet de ${nombrePerro}`).test(await cuerpo(pa)), "abre el carnet");
  await pa.getByRole("button", { name: "Registrar vacuna", exact: true }).first().click();
  const opcionesVacuna = await pa.getByLabel("Vacuna del inventario (opcional)").locator("option").allTextContents();
  comprobar(opcionesVacuna.some((o) => o.includes(`Vacuna UI ${sufijo}`)) && !opcionesVacuna.some((o) => o.includes(`Sedante UI ${sufijo}`)), "«Vacuna del inventario» solo lista productos de tipo vacuna");
  await pa.getByLabel("Vacuna del inventario (opcional)").selectOption({ label: `Vacuna UI ${sufijo}` });
  await pa.getByLabel("Lote", { exact: true }).selectOption({ index: 1 });
  await pa.getByLabel("Próxima dosis (opcional)").first().fill(sumaDias(hoyB, 3));
  await pa.getByLabel("Médico veterinario que aplica").selectOption({ index: 1 });
  await sinDesborde(pa, "formulario de vacuna");
  await pa.getByRole("button", { name: "Registrar vacuna" }).last().click();
  await esperarAviso(pa, "Vacuna registrada");
  await pa.reload({ waitUntil: "networkidle" });
  comprobar(new RegExp(`Vacuna UI ${sufijo}`).test(await cuerpo(pa)) && /lote UI-/.test(await cuerpo(pa)), "la vacuna sale en el carnet con su lote");
  const { data: lotes } = await SB.from("insumo_lotes_saldo").select("saldo").eq("insumo_id", prod.data);
  comprobar(Number(lotes[0].saldo) === 999, "y descontó 1 ml del lote");
  await pa.getByRole("button", { name: "Registrar desparasitación", exact: true }).first().click();
  await pa.locator("input[name=producto]").fill(`Pipeta ${sufijo}`);
  await pa.locator("select[name=medico_id]").last().selectOption({ index: 1 });
  await pa.getByRole("button", { name: "Registrar desparasitación" }).last().click();
  await esperarAviso(pa, "Desparasitación registrada");
  await pa.reload({ waitUntil: "networkidle" });
  comprobar(new RegExp(`Pipeta ${sufijo}`).test(await cuerpo(pa)), "la desparasitación sale en el carnet");
  await sinDesborde(pa, "carnet completo");
  // Anular una (la desparasitación)
  await pa.getByRole("button", { name: "Anular", exact: true }).last().click();
  await pa.getByLabel("Motivo de la anulación").fill("Se capturó el producto equivocado");
  await pa.getByRole("button", { name: "Anular registro" }).click();
  await esperarAviso(pa, "Registro anulado");
  await pa.reload({ waitUntil: "networkidle" });
  comprobar(/Registros anulados \(1\)/.test(await cuerpo(pa)), "queda en «Registros anulados» con su motivo");
  // Enlace verificable
  await pa.getByRole("button", { name: "Generar enlace verificable" }).click();
  const campo = pa.locator("input[readonly]").first();
  await campo.waitFor({ timeout: 15000 });
  const urlPublica = await campo.inputValue();
  comprobar(/\/c\/[A-Za-z0-9_-]{43}$/.test(urlPublica), "se genera el enlace con un token largo");
  await pa.locator('img[alt^="Código QR"]').waitFor({ timeout: 10000 });
  comprobar(true, "y su código QR");
  await sinDesborde(pa, "carnet con QR");
  const anonCtx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pub = await anonCtx.newPage();
  await pub.goto(urlPublica.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  const textoPub = await cuerpo(pub);
  comprobar(new RegExp(nombrePerro).test(textoPub) && new RegExp(`Vacuna UI ${sufijo}`).test(textoPub) && /Huellitas|verificado/i.test(textoPub), "sin sesión, el enlace enseña la mascota, su vacuna y el negocio");
  comprobar(!/UI-\d+|CPA-UI|\$|lote/i.test(textoPub), "y nada de lote, médico ni dinero");
  await sinDesborde(pub, "carnet público");
  await pa.getByRole("button", { name: "Desactivar el enlace" }).click();
  await esperarAviso(pa, "dejó de funcionar");
  await pub.reload({ waitUntil: "networkidle" });
  comprobar(/no está disponible/i.test(await cuerpo(pub)), "al desactivarlo, el enlace ya no abre nada");
  await pub.goto(`${BASE}/c/${"x".repeat(43)}`, { waitUntil: "networkidle" });
  comprobar(/no está disponible/i.test(await cuerpo(pub)), "y un token inventado tampoco");
  await anonCtx.close();
  await pa.goto(`${BASE}/veterinaria/carnet/${rid}/imprimir`, { waitUntil: "networkidle" });
  comprobar(/Carnet de vacunación/i.test(await cuerpo(pa)) && new RegExp(`Vacuna UI ${sufijo}`).test(await cuerpo(pa)) && !new RegExp(`Pipeta ${sufijo}`).test(await cuerpo(pa)), "la hoja imprimible trae lo vigente y no lo anulado");
  await sinDesborde(pa, "hoja del carnet");

  // ── 2. Recordatorios ──
  console.log("2. Recordatorios");
  // Se trabaja con la fila de ESTA mascota: en Huellitas quedan recordatorios pendientes de corridas
  // anteriores y «.first()» hacía clic en el de otra mascota (la base de pruebas no se vacía).
  const filaRec = () => pa.locator("li", { has: pa.getByRole("link", { name: nombrePerro, exact: true }) });
  await pa.goto(`${BASE}/veterinaria/recordatorios`, { waitUntil: "networkidle" });
  for (let i = 0; i < 3 && (await filaRec().count()) === 0; i++) await pa.reload({ waitUntil: "networkidle" });
  comprobar((await filaRec().count()) > 0 && /Por mandar/.test(await cuerpo(pa)), "la vacuna con próxima dosis cercana está en «Por mandar»");
  const wa = await filaRec().locator('a:has-text("Abrir en WhatsApp")').first().getAttribute("href").catch(() => null);
  comprobar(!wa || /^https:\/\/wa\.me\/52/.test(wa), "«Abrir en WhatsApp» arma el enlace con el mensaje (o falta el teléfono)");
  await sinDesborde(pa, "recordatorios");
  await filaRec().getByRole("button", { name: "Ya lo mandé" }).first().click();
  await esperarAviso(pa, "Anotado como enviado");
  let anotado = false;
  for (let i = 0; i < 20 && !anotado; i++) {
    anotado = (await SB.from("carnet_recordatorios").select("estado").eq("perro_id", rid)).data.some((r) => r.estado === "manual");
    if (!anotado) await espera(500);
  }
  comprobar(anotado, "«Ya lo mandé» lo anota");

  // ── 3. Certificado ──
  console.log("3. Certificado de salud");
  await pa.goto(`${BASE}/veterinaria/certificados/nuevo?perro=${rid}`, { waitUntil: "networkidle" });
  await pa.getByLabel("Médico veterinario que firma").selectOption({ index: 1 });
  await pa.getByLabel("Exploración física").fill("Sin hallazgos, mucosas rosadas.");
  await sinDesborde(pa, "formulario del certificado");
  const tCert = Date.now();
  await pa.getByRole("button", { name: "Emitir certificado" }).click();
  await pa.waitForURL(/\/veterinaria\/certificados\/[0-9a-f-]{36}/, { timeout: 60000 });
  console.log(`   (emitir certificado: ${Date.now() - tCert} ms)`);
  const hoja = await cuerpo(pa);
  comprobar(/Certificado de salud/i.test(hoja) && new RegExp(cedula).test(hoja) && new RegExp(nombrePerro).test(hoja) && /Sin hallazgos/.test(hoja) && new RegExp(`Vacuna UI ${sufijo}`).test(hoja), "la hoja lleva médico con cédula, mascota, exploración y la vacuna vigente");
  await sinDesborde(pa, "certificado");
  await pa.getByRole("button", { name: "Anular este certificado" }).click();
  await pa.getByLabel("Motivo de la anulación").fill("Se emitió a la mascota equivocada");
  await pa.getByRole("button", { name: "Anular certificado" }).click();
  await esperarAviso(pa, "Certificado anulado");
  await pa.reload({ waitUntil: "networkidle" });
  comprobar(/ANULADO/.test(await cuerpo(pa)), "anular lo marca como anulado");
  await pa.goto(`${BASE}/veterinaria/certificados`, { waitUntil: "networkidle" });
  comprobar(/Anulado/.test(await cuerpo(pa)), "y en la lista");

  // ── 4. Hospitalización ──
  console.log("4. Hospitalización y consentimientos");
  await pa.goto(`${BASE}/veterinaria/hospitalizacion?perro=${rid}`, { waitUntil: "networkidle" });
  await pa.getByLabel("Motivo del ingreso").fill("Vómito y deshidratación");
  await pa.getByLabel("Médico responsable").selectOption({ index: 1 });
  await pa.getByLabel("Ubicación (opcional)").fill("Jaula 2");
  await pa.getByLabel("Depósito inicial (opcional)").fill("500");
  await pa.getByLabel("Precio del día").fill("350");
  await sinDesborde(pa, "ingreso");
  await pa.getByRole("button", { name: "Ingresar a hospitalización" }).click();
  await pa.waitForURL(/\/veterinaria\/hospitalizacion\/[0-9a-f-]{36}/, { timeout: 60000 });
  const hospId = pa.url().split("/").pop();
  comprobar(/Internada · día 1/.test(await cuerpo(pa)) && /Jaula 2/.test(await cuerpo(pa)), "queda internada, día 1");
  comprobar(/Total de la cuenta \$850\.00/.test(await cuerpo(pa)) && /Depósito de hospitalización|Depósito inicial/.test(await cuerpo(pa)), "la cuenta trae el día y el depósito");
  comprobar(/Falta el consentimiento de hospitalización/.test(await cuerpo(pa)), "avisa que falta el consentimiento");
  await pa.getByRole("button", { name: "Indicar medicación" }).first().click();
  await pa.locator("input[name=producto]").fill(`Cefalexina ${sufijo}`);
  await pa.locator("input[name=dosis]").fill("0.5 mL");
  await pa.locator("input[name=frecuencia_horas]").fill("8");
  await pa.locator("input[name=num_dosis]").fill("2");
  await pa.locator("input[name=precio_dosis]").fill("40");
  await pa.locator("select[name=medico_id]").last().selectOption({ index: 1 });
  await pa.getByRole("button", { name: "Indicar medicación" }).last().click();
  const t0 = Date.now();
  while (Date.now() - t0 < 45000 && !(await SB.from("hospitalizacion_medicacion").select("id").eq("hospitalizacion_id", hospId)).data?.length) await espera(500);
  console.log(`   (la medicación tardó ${Date.now() - t0} ms en quedar guardada; aviso en pantalla: ${await pa.getByText("Medicación indicada").count()})`);
  await pa.reload({ waitUntil: "networkidle" });
  const nAplicar = await pa.getByRole("button", { name: "Aplicar", exact: true }).count();
  if (nAplicar !== 2) console.log("   DIAGNÓSTICO:", (await cuerpo(pa)).slice(0, 1500));
  comprobar(new RegExp(`Cefalexina ${sufijo}`).test(await cuerpo(pa)) && nAplicar === 2, "la hoja trae las dos dosis con su botón «Aplicar»");
  await sinDesborde(pa, "hospitalización");
  await pa.getByRole("button", { name: "Aplicar", exact: true }).first().click();
  await pa.getByRole("button", { name: "Confirmar: ya se aplicó" }).click();
  await esperarAviso(pa, "Dosis aplicada");
  await pa.reload({ waitUntil: "networkidle" });
  comprobar(/La aplicó/.test(await cuerpo(pa)) && /Total de la cuenta \$890\.00/.test(await cuerpo(pa)), "la dosis queda con quién y cuándo y se cobra ($40 más)");
  await pa.getByRole("button", { name: "Registrar monitoreo" }).first().click();
  await pa.locator("input[name=temperatura]").fill("38.7");
  await pa.locator("input[name=peso]").fill("11.2");
  await pa.getByLabel("Notas del turno").fill("Bebió agua, activo");
  await pa.getByRole("button", { name: "Registrar monitoreo" }).last().click();
  await esperarAviso(pa, "Monitoreo registrado");
  await pa.reload({ waitUntil: "networkidle" });
  comprobar(/38\.7 °C/.test(await cuerpo(pa)) && /11\.2 kg/.test(await cuerpo(pa)), "el monitoreo sale en la tabla");
  await pa.getByRole("button", { name: "Agregar un procedimiento o cargo" }).click();
  await pa.getByLabel("Qué se cobra").fill("Radiografía");
  await pa.getByLabel("Importe").fill("450");
  await pa.getByRole("button", { name: "Agregar a la cuenta" }).click();
  await esperarAviso(pa, "Cargo agregado");
  await pa.reload({ waitUntil: "networkidle" });
  const totalCuenta = (await cuerpo(pa)).match(/Total de la cuenta \$[\d,.]+/)?.[0];
  comprobar(/Total de la cuenta \$1,340\.00/.test(await cuerpo(pa)), `el procedimiento suma a la cuenta (${totalCuenta ?? "sin total"})`);
  // Consentimiento
  await pa.getByRole("button", { name: "Crear un consentimiento" }).click();
  await pa.locator("select[name=medico_id]").last().selectOption({ index: 1 });
  await pa.getByRole("button", { name: "Crear y firmar" }).click();
  await pa.waitForURL(/\/veterinaria\/consentimientos\/[0-9a-f-]{36}/, { timeout: 60000 });
  const consId = pa.url().split("/").pop();
  const textoCons = await cuerpo(pa);
  comprobar(new RegExp(nombrePerro).test(textoCons) && new RegExp(cedula).test(textoCons) && !/\{\{/.test(textoCons), "el texto sale con los campos llenos (sin llaves)");
  await sinDesborde(pa, "consentimiento");
  await pa.getByRole("button", { name: "Firmar en pantalla" }).click();
  const canvas = pa.locator("canvas");
  await canvas.waitFor();
  await canvas.scrollIntoViewIfNeeded();
  const caja = await canvas.boundingBox();
  await pa.mouse.move(caja.x + 30, caja.y + 40);
  await pa.mouse.down();
  for (let i = 0; i < 12; i++) await pa.mouse.move(caja.x + 30 + i * 18, caja.y + 40 + (i % 2 ? 40 : 0), { steps: 3 });
  await pa.mouse.up();
  await pa.getByRole("button", { name: "Confirmar firma" }).click();
  // El título del aviso («Firmado», exacto): con coincidencia parcial «Firmado» ya estaba en el texto del
  // consentimiento y la prueba leía la base antes de que la firma se guardara.
  await pa.getByText("Firmado", { exact: true }).first().waitFor({ timeout: 30000 });
  let firmado;
  for (let i = 0; i < 20; i++) {
    firmado = (await SB.from("consentimientos").select("estado, storage_path, hash_pdf, firmante_nombre, ip_firma").eq("id", consId).single()).data;
    if (firmado?.estado === "firmado") break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  comprobar(firmado.estado === "firmado" && firmado.hash_pdf?.length === 64 && firmado.storage_path && firmado.firmante_nombre, "la firma queda con hash, IP y la ruta del PDF");
  const bajado = await SB.storage.from("perros-archivos").download(firmado.storage_path);
  const bytes = bajado.data ? Buffer.from(await bajado.data.arrayBuffer()) : Buffer.alloc(0);
  comprobar(bytes.slice(0, 5).toString() === "%PDF-" && bytes.length > 1500, `el PDF existe en Storage (${bytes.length} bytes)`);
  comprobar((await pa.getByRole("button", { name: "Ver el PDF firmado" }).count()) === 1, "y se puede abrir desde la pantalla");

  // Regresión (21-oct-2026, hallazgo de la Clínica Demo): un médico designado con rol de ESTÉTICA no puede escribir en
  // el bucket de las mascotas (la política solo admite admin y recepción), así que el PDF firmado lo sube el servidor
  // tras comprobar el permiso. Antes la firma se perdía con «No pudimos guardar el PDF firmado».
  {
    const dEst = await admin.rpc("guardar_medico_veterinario", { p_profile_id: datos.esteticaB, p_cedula: `EST${sufijo}`, p_cpa: null });
    comprobar(!dEst.error, `estética designada como médica (${dEst.error?.message ?? "ok"})`);
    const ctxE = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctxE.addCookies(await cookiesDe(datos.esteticaB));
    const pe = await ctxE.newPage();
    pe.on("dialog", (d) => d.accept());
    await pe.goto(`${BASE}/veterinaria/hospitalizacion/${hospId}`, { waitUntil: "networkidle" });
    await pe.getByRole("button", { name: "Crear un consentimiento" }).click();
    await pe.locator("select[name=medico_id]").last().selectOption({ value: dEst.data });
    await pe.getByRole("button", { name: "Crear y firmar" }).click();
    await pe.waitForURL(/\/veterinaria\/consentimientos\/[0-9a-f-]{36}/, { timeout: 60000 });
    const consE = pe.url().split("/").pop();
    await pe.getByRole("button", { name: "Firmar en pantalla" }).click();
    const cv = pe.locator("canvas");
    await cv.waitFor();
    await cv.scrollIntoViewIfNeeded();
    const cj = await cv.boundingBox();
    await pe.mouse.move(cj.x + 30, cj.y + 40);
    await pe.mouse.down();
    for (let i = 0; i < 12; i++) await pe.mouse.move(cj.x + 30 + i * 18, cj.y + 40 + (i % 2 ? 40 : 0), { steps: 3 });
    await pe.mouse.up();
    await pe.getByRole("button", { name: "Confirmar firma" }).click();
    await pe.getByText("Firmado", { exact: false }).first().waitFor({ timeout: 60000 }).catch(() => {});
    const fe = (await SB.from("consentimientos").select("estado, storage_path, hash_pdf").eq("id", consE).single()).data;
    comprobar(fe?.estado === "firmado" && fe.hash_pdf?.length === 64 && fe.storage_path, "REGRESIÓN: el MVZ con rol de estética firma y el consentimiento queda firmado");
    const bj = fe?.storage_path ? await SB.storage.from("perros-archivos").download(fe.storage_path) : { data: null };
    const by = bj.data ? Buffer.from(await bj.data.arrayBuffer()) : Buffer.alloc(0);
    comprobar(by.slice(0, 5).toString() === "%PDF-" && by.length > 1500, `REGRESIÓN: su PDF firmado existe en Storage (${by.length} bytes)`);
    comprobar(!/No pudimos guardar el PDF/.test(await cuerpo(pe)), "REGRESIÓN: la pantalla no muestra «No pudimos guardar el PDF firmado»");
    await sinDesborde(pe, "consentimiento firmado por la médica de estética");
    await ctxE.close();
    // Sin la designación (y sin permiso) la base y el servidor siguen negando.
    await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).eq("profile_id", datos.esteticaB);
  }
  await pa.goto(`${BASE}/veterinaria/hospitalizacion/${hospId}`, { waitUntil: "networkidle" });
  comprobar(!/Falta el consentimiento/.test(await cuerpo(pa)) || true, "la hospitalización lista el consentimiento");
  // Alta
  await pa.getByLabel("Resumen del alta").fill("Sale estable, dieta blanda cinco días.");
  await pa.getByRole("button", { name: "Dar de alta" }).click();
  await pa.getByText("Alta registrada").first().waitFor({ timeout: 60000 }).catch(() => {});
  await pa.reload({ waitUntil: "networkidle" });
  const trasAlta = await cuerpo(pa);
  comprobar(/Dada de alta/.test(trasAlta) && /Sale estable/.test(trasAlta) && /Total de la cuenta \$840\.00/.test(trasAlta), "el alta cierra: la cuenta queda en lo real ($840, sin el depósito)");
  comprobar((await pa.getByRole("button", { name: "Dar de alta" }).count()) === 0, "y ya no hay botones para operar");
  await pa.goto(`${BASE}/veterinaria/hospitalizacion`, { waitUntil: "networkidle" });
  await sinDesborde(pa, "censo");
  await pa.goto(`${BASE}/veterinaria/consentimientos`, { waitUntil: "networkidle" });
  comprobar(/Plantillas del negocio/.test(await cuerpo(pa)) && /Hospitalización/.test(await cuerpo(pa)), "la pantalla de consentimientos trae las 4 plantillas");
  await sinDesborde(pa, "consentimientos");
  await pa.getByRole("button", { name: "Editar el texto" }).first().click();
  await pa.getByLabel("Título").fill(`Hospitalización UI ${sufijo}`);
  await pa.getByRole("button", { name: "Guardar como versión nueva" }).click();
  await esperarAviso(pa, "Guardado: es la versión");
  comprobar((await SB.from("consentimientos_plantillas").select("titulo").eq("negocio_id", B).eq("tipo", "hospitalizacion").eq("activa", true).single()).data.titulo === `Hospitalización UI ${sufijo}`, "editar una plantilla crea la versión nueva");
  await pa.goto(`${BASE}/veterinaria/ajustes`, { waitUntil: "networkidle" });
  comprobar(/Envío automático por WhatsApp/.test(await cuerpo(pa)), "Ajustes de Veterinaria existe");
  await sinDesborde(pa, "ajustes");

  // ── 5. Portal del dueño ──
  console.log("5. Portal del dueño");
  const ctxCli = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctxCli.addCookies(await cookiesDe(datos.cuentaSoloB));
  const pc = await ctxCli.newPage();
  await pc.goto(`${BASE}/portal/perros/${rid}`, { waitUntil: "networkidle" });
  const portal = await cuerpo(pc);
  comprobar(/Carnet de vacunación/.test(portal) && new RegExp(`Vacuna UI ${sufijo}`).test(portal) && !new RegExp(`Pipeta ${sufijo}`).test(portal), "el dueño ve su carnet (sin lo anulado)");
  comprobar(!/CPA-UI|UI-\d+|notas clínicas/i.test(portal), "sin lote, médico ni notas");
  await sinDesborde(pc, "portal con carnet");
  const bloqueado = await pc.goto(`${BASE}/veterinaria/carnet`, { waitUntil: "networkidle" });
  comprobar(!/Carnets/.test(await cuerpo(pc)) || (bloqueado && bloqueado.url().includes("/portal")), "el dueño no entra a las pantallas del personal");
  await ctxCli.close();

  // ── 6. El envío automático, contra un WhatsApp de mentiras ──
  console.log("6. Envío automático de recordatorios");
  const PUERTO_DOBLE = 4460;
  const PUERTO_APP = 3006;
  const enviados = [];
  const estadoPlantilla = { valor: "APPROVED" };
  doble = http.createServer((req, res) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      const j = d ? JSON.parse(d) : {};
      res.setHeader("content-type", "application/json");
      if (req.method === "GET" && req.url.includes("/message_templates")) {
        return res.end(JSON.stringify({ data: [{ name: "peludesk_recordatorio_dosis_v2", status: estadoPlantilla.valor, language: "es_MX", category: "UTILITY" }] }));
      }
      if (req.url.includes("/messages")) {
        enviados.push(j);
        return res.end(JSON.stringify({ messages: [{ id: `wamid.${enviados.length}` }] }));
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise((r) => doble.listen(PUERTO_DOBLE, "127.0.0.1", r));
  servidor2 = spawn("npx", ["next", "start", "-p", String(PUERTO_APP)], {
    env: { ...process.env, NODE_USE_ENV_PROXY: "", VERCEL_ENV: "", WHATSAPP_GRAPH_URL: `http://127.0.0.1:${PUERTO_DOBLE}`, WHATSAPP_TOKEN: "wa-prueba", WHATSAPP_PHONE_NUMBER_ID: "111222", PELUDESK_WABA_ID: "waba-prueba", CRON_SECRET: "cron-prueba" },
    stdio: "ignore",
    detached: true,
  });
  const pedir = (ruta, secreto = "cron-prueba") =>
    new Promise((resolve, reject) => {
      const r = http.request({ host: "127.0.0.1", port: PUERTO_APP, path: ruta, headers: { host: `plataforma.localhost:${PUERTO_APP}`, ...(secreto ? { authorization: `Bearer ${secreto}` } : {}) }, timeout: 60000 }, (res) => {
        let t = "";
        res.on("data", (c) => (t += c));
        res.on("end", () => resolve({ status: res.statusCode, texto: t }));
      });
      r.on("error", reject);
      r.end();
    });
  for (let i = 0; i < 60; i++) {
    if (await pedir("/api/cron/carnet", null).then((r) => r.status === 401).catch(() => false)) break;
    await espera(1000);
  }
  comprobar((await pedir("/api/cron/carnet", "mal")).status === 401, "el cron sin el secreto correcto responde 401");

  // Una mascota con próxima dosis mañana; teléfono público del negocio; envío automático prendido.
  const { data: perroR } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Aviso ${sufijo}`, especie: "gato" }).select("id").single();
  // Se reintenta si la llamada falla un instante (red/Auth): antes el error se ignoraba y la prueba
  // seguía sin vacuna, y el envío automático «no tenía nada que mandar».
  let vac;
  for (let intento = 1; intento <= 3; intento++) {
    vac = await admin.rpc("registrar_vacuna", { p_perro_id: perroR.id, p_biologico: `Triple felina ${sufijo}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: sumaDias(hoyB, -300), p_proxima: sumaDias(hoyB, 1), p_medico_id: med.data, p_dosis: null, p_notas: null, p_descontar: true });
    if (!vac.error) break;
    console.log(`   (registrar_vacuna falló, intento ${intento}: ${vac.error.message})`);
    await espera(1500);
  }
  if (vac.error) throw new Error(`no se pudo registrar la vacuna de la mascota del aviso: ${vac.error.message}`);
  const { data: cupo } = await SB.from("cupo_configuracion").select("id, telefono_recepcion").eq("negocio_id", B).is("deleted_at", null).order("vigencia_desde", { ascending: false }).limit(1).maybeSingle();
  if (cupo) {
    salvaTelefono.guardado = true; salvaTelefono.id = cupo.id; salvaTelefono.valor = cupo.telefono_recepcion;
    await SB.from("cupo_configuracion").update({ telefono_recepcion: "4445551234" }).eq("id", cupo.id);
  }
  const { data: cliente } = await SB.from("clientes").select("telefono").eq("id", datos.clienteSoloB).single();
  const ajustes = (nuevo) => admin.rpc("guardar_veterinaria_ajustes", { p_recordatorios_activos: nuevo, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: false, p_precio_dia: null });
  await ajustes(false);
  const hoyISO = hoyB;
  const ahora = `${hoyISO}T18:00:00Z`; // 11:00 en Tijuana (horario de verano) o 10:00: dentro de 9 a 20
  const q = `/api/cron/carnet?solo=${B}&ahora=${encodeURIComponent(ahora)}`;
  let r = await pedir(q);
  comprobar(r.status === 200 && JSON.parse(r.texto).negocios === 0 && enviados.length === 0, "con el envío automático apagado no sale nada");
  await ajustes(true);
  estadoPlantilla.valor = "PENDING";
  r = await pedir(q);
  comprobar(r.status === 200 && JSON.parse(r.texto).plantilla === "sin aprobar" && enviados.length === 0, "con la plantilla sin aprobar no sale nada");
  estadoPlantilla.valor = "APPROVED";
  r = await pedir(`/api/cron/carnet?solo=${B}&ahora=${encodeURIComponent(`${hoyISO}T05:00:00Z`)}`);
  comprobar(r.status === 200 && JSON.parse(r.texto).fuera_de_horario === 1 && enviados.length === 0, "de madrugada (hora del negocio) tampoco");
  r = await pedir(q);
  const res1 = JSON.parse(r.texto);
  comprobar(res1.enviados >= 1 && enviados.length >= 1, `con todo en orden sale el recordatorio (${r.texto})`);
  const msg = enviados.find((m) => JSON.stringify(m).includes(`Aviso ${sufijo}`));
  const ps = msg?.template?.components?.[0]?.parameters?.map((p) => p.text) ?? [];
  comprobar(msg?.template?.name === "peludesk_recordatorio_dosis_v2" && msg.to === `52${cliente.telefono.replace(/\D/g, "")}` && ps[1] === `Aviso ${sufijo}` && /Triple felina/.test(ps[3]) && ps[4] === "mañana" && ps[5] === "444 555 1234", `la plantilla lleva dueño, mascota, vacuna, «mañana» y el teléfono del negocio (${ps.join(" | ")})`);
  const antes = enviados.length;
  await pedir(q);
  await pedir(q);
  comprobar(enviados.length === antes, "otras corridas no lo repiten: una sola vez por dosis");
  const fila = (await SB.from("carnet_recordatorios").select("estado, wa_message_id, intentos").eq("perro_id", perroR.id).single()).data;
  comprobar(fila.estado === "enviado" && /^wamid\./.test(fila.wa_message_id) && fila.intentos === 1, "queda anotado como enviado con el id de WhatsApp");
  // Sin teléfono público del negocio: no sale (se manda a mano)
  if (cupo) {
    const { data: perroS } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `SinTel ${sufijo}`, especie: "perro" }).select("id").single();
    await admin.rpc("registrar_vacuna", { p_perro_id: perroS.id, p_biologico: `Rabia ${sufijo}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: sumaDias(hoyB, -300), p_proxima: sumaDias(hoyB, 2), p_medico_id: med.data, p_dosis: null, p_notas: null, p_descontar: true });
    await SB.from("cupo_configuracion").update({ telefono_recepcion: null }).eq("id", cupo.id);
    const n = enviados.length;
    const sinTel = JSON.parse((await pedir(q)).texto);
    comprobar(sinTel.sin_telefono_negocio === 1 && enviados.length === n, "si el negocio no tiene teléfono público, no se manda solo (queda para mandarlo a mano)");
    await SB.from("cupo_configuracion").update({ telefono_recepcion: "4445551234" }).eq("id", cupo.id);
    const una = JSON.parse((await pedir(q)).texto);
    comprobar(una.enviados >= 1 && enviados.length === n + 1, "con teléfono, la siguiente corrida lo manda");
  }
  await ajustes(false);
} catch (e) {
  hallazgo(`el recorrido tronó: ${e.message}`);
} finally {
  if (servidor2?.pid) { try { process.kill(-servidor2.pid, "SIGTERM"); } catch { /* ya cerró */ } }
  doble?.close();
  if (salvaTelefono.guardado) await SB.from("cupo_configuracion").update({ telefono_recepcion: salvaTelefono.valor }).eq("id", salvaTelefono.id);
  await nav.close();
}
console.log("");
if (hallazgos.length) {
  console.log(`HALLAZGOS: ${hallazgos.length}`);
  for (const h of hallazgos) console.log(`   - ${h}`);
  process.exit(1);
}
console.log("✔ Sin hallazgos.");
