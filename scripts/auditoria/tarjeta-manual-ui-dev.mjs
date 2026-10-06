// «Tarjeta (registro manual)» en pantalla, a 390 px (celular) — SOLO DESARROLLO,
// en Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/tarjeta-manual-ui-dev.mjs
//
// 1. Con Mercado Pago elegido, «Registrar cobro» no ofrece «Terminal»; ofrece
//    Efectivo, Transferencia y «Tarjeta (registro manual)» y dice por qué.
// 2. Sin folio o sin motivo la pantalla frena y el aviso sale junto al botón;
//    con ellos se registra y la cuenta muestra «Sin verificar» con el folio.
// 3. Un folio repetido se frena con el aviso en el mismo formulario.
// 4. Admin: Caja → Conciliación lista la tarjeta con folio y motivo, y
//    «Revisado con voucher» / «Marcar como no recibida» funcionan; recepción
//    no ve la lista ni los botones.
// 5. «Necesita atención» (admin) avisa de las tarjetas por revisar.
// 6. El turno, el reporte y Administración → Cobro con terminal (tope) la
//    muestran, sin desborde a 390 px.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
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
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar(w <= 392, `${donde}: sin desborde a 390 px (${w}px)`);
};

const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recId = recepciones[0].profile_id;
const admin = await comoPersona(datos.adminB);
const nuevaReserva = async () => (await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data.id;

const nav = await abrirNavegador();
const ctxAdmin = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxAdmin.addCookies(await cookiesDe(datos.adminB));
const pa = await ctxAdmin.newPage();
const ctxRec = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxRec.addCookies(await cookiesDe(recId));
const pr = await ctxRec.newPage();

const folio1 = `UI-${sufijo}A`;
const folio2 = `UI-${sufijo}B`;
let reserva1;
let reserva2;
try {
  await admin.rpc("elegir_proveedor_cobro", { p_proveedor: "mercadopago" });
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) {
    const t = await (await comoPersona(recId)).from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba ui tarjeta manual" }).select("id").single();
    turno = t.data;
  }
  reserva1 = await nuevaReserva();
  reserva2 = await nuevaReserva();

  // ── 1. Qué ofrece el selector ──
  console.log("1. Registrar cobro con Mercado Pago elegido");
  await pr.goto(`${BASE}/caja/cobrar/${reserva1}`, { waitUntil: "networkidle" });
  const opciones = await pr.getByLabel("Método").first().locator("option").allInnerTexts();
  comprobar(JSON.stringify(opciones.map((o) => o.trim())) === JSON.stringify(["Efectivo", "Transferencia", "Tarjeta (registro manual)"]), `el selector trae Efectivo, Transferencia, Tarjeta (registro manual), sin Terminal (${opciones.join(" | ")})`);
  const aviso = await pr.locator("[data-terminal-bloqueada]").innerText();
  comprobar(/Cobrar con terminal/.test(aviso) && /Tarjeta \(registro manual\)/.test(aviso) && /efectivo y transferencia/.test(aviso), `el aviso dice qué usar («${aviso.slice(0, 120)}…»)`);
  await sinDesborde(pr, "Registrar cobro");

  // ── 2. Registrar ──
  console.log("2. Registrar una tarjeta manual");
  await pr.getByLabel("Método").first().selectOption("tarjeta_manual");
  await pr.getByLabel("Monto").first().fill("300");
  await pr.locator("[data-tarjeta-manual]").waitFor();
  await sinDesborde(pr, "formulario de tarjeta manual abierto");
  await pr.getByRole("button", { name: "Registrar cobro" }).click();
  await pr.waitForTimeout(500);
  const sinFolio = await pr.locator("[role=alert]").allInnerTexts();
  comprobar(sinFolio.some((t) => /folio/i.test(t)), `sin folio la pantalla frena, con el aviso junto al botón («${sinFolio.join(" | ").slice(0, 100)}»)`);
  await pr.getByLabel("Folio o autorización del voucher").fill(folio1);
  await pr.getByRole("button", { name: "Registrar cobro" }).click();
  await pr.waitForTimeout(500);
  comprobar((await pr.locator("[role=alert]").allInnerTexts()).some((t) => /por qué no se cobró/i.test(t)), "sin motivo también frena");
  await pr.getByLabel("¿Por qué no se cobró con la terminal vinculada?").selectOption("sin_senal");
  await pr.getByLabel("Últimos 4 dígitos (opcional)").fill("4242abc");
  const ult4 = await pr.getByLabel("Últimos 4 dígitos (opcional)").inputValue();
  comprobar(ult4 === "4242", "los últimos 4 solo aceptan números y cuatro (nunca la tarjeta completa)");
  await pr.getByLabel("Banco (opcional)").fill("BBVA");
  await pr.getByRole("button", { name: "Registrar cobro" }).click();
  await pr.locator("[data-tarjeta-manual-cobro]").first().waitFor({ timeout: 12000 }).catch(() => {});
  const tarjeta = await pr.locator("[data-tarjeta-manual-cobro]").first().innerText().catch(() => "");
  comprobar(/Sin verificar/.test(tarjeta) && new RegExp(folio1).test(tarjeta) && /\$300\.00/.test(tarjeta) && /Sin señal/.test(tarjeta), `la cuenta la muestra «Sin verificar» con folio, monto y motivo («${tarjeta.replace(/\n/g, " ").slice(0, 140)}»)`);
  comprobar((await pr.locator("[data-tarjeta-manual-cobro]").getByRole("button").count()) === 0, "recepción NO ve «Revisado con voucher» ni «Marcar como no recibida»");
  await sinDesborde(pr, "cuenta con la tarjeta registrada");

  // ── 3. Folio repetido ──
  console.log("3. Folio repetido");
  await pr.goto(`${BASE}/caja/cobrar/${reserva2}`, { waitUntil: "networkidle" });
  await pr.getByLabel("Método").first().selectOption("tarjeta_manual");
  await pr.getByLabel("Monto").first().fill("120");
  await pr.getByLabel("Folio o autorización del voucher").fill(folio1.toLowerCase());
  await pr.getByLabel("¿Por qué no se cobró con la terminal vinculada?").selectOption("otro");
  await pr.getByLabel("Cuéntanos el motivo").fill("La terminal de otra sucursal");
  await pr.getByRole("button", { name: "Registrar cobro" }).click();
  await pr.waitForTimeout(1500);
  const dup = (await pr.locator("[role=alert]").allInnerTexts()).join(" | ");
  comprobar(/ya está registrado/.test(dup), `el folio repetido se frena con aviso junto al botón («${dup.slice(0, 100)}»)`);
  await pr.getByLabel("Folio o autorización del voucher").fill(folio2);
  await pr.getByRole("button", { name: "Registrar cobro" }).click();
  await pr.locator("[data-tarjeta-manual-cobro]").first().waitFor({ timeout: 12000 }).catch(() => {});
  comprobar(/Otro: La terminal de otra sucursal/.test(await pr.locator("[data-tarjeta-manual-cobro]").first().innerText().catch(() => "")), "con otro folio y motivo «Otro» se registra");

  // ── 4. Conciliación ──
  console.log("4. Conciliación");
  await pr.goto(`${BASE}/caja/conciliacion`, { waitUntil: "networkidle" });
  comprobar((await pr.locator("[data-tarjetas-manuales]").count()) === 0, "recepción no ve la lista de tarjetas manuales");
  await pa.goto(`${BASE}/caja/conciliacion`, { waitUntil: "networkidle" });
  const seccion = await pa.locator("[data-tarjetas-manuales]").innerText();
  comprobar(seccion.includes(folio1) && seccion.includes(folio2) && /Sin señal/.test(seccion) && /La terminal de otra sucursal/.test(seccion), "admin: la lista trae folio y motivo de cada una");
  await sinDesborde(pa, "Conciliación con tarjetas por revisar");
  const filaUno = pa.locator("[data-tarjeta-por-revisar]", { hasText: folio1 });
  await filaUno.getByRole("button", { name: "Revisado con voucher" }).click();
  await filaUno.getByLabel("Nota (opcional)").fill("Voucher a la vista");
  await filaUno.getByRole("button", { name: "Guardar como revisada" }).click();
  await pa.waitForTimeout(2500);
  const hecho = (await SB.from("tarjetas_manuales").select("estado, nota_revision").eq("folio", folio1).single()).data;
  comprobar(hecho.estado === "revisada" && hecho.nota_revision === "Voucher a la vista", "«Revisado con voucher» (con nota) la deja revisada");
  await pa.reload({ waitUntil: "networkidle" });
  const filaDos = pa.locator("[data-tarjeta-por-revisar]", { hasText: folio2 });
  await filaDos.getByRole("button", { name: "Marcar como no recibida" }).click();
  await filaDos.getByRole("button", { name: "Marcar como no recibida" }).last().click();
  await pa.waitForTimeout(600);
  comprobar(/Escribe el motivo/.test(await filaDos.innerText()), "«Marcar como no recibida» exige el motivo");
  await filaDos.getByLabel("Motivo (obligatorio)").fill("El banco no la acreditó");
  await filaDos.getByRole("button", { name: "Marcar como no recibida" }).last().click();
  await pa.waitForTimeout(2500);
  const noRec = (await SB.from("tarjetas_manuales").select("estado").eq("folio", folio2).single()).data;
  comprobar(noRec.estado === "no_recibida", "queda marcada como no recibida");
  await pa.reload({ waitUntil: "networkidle" });
  comprobar(/Ya revisadas/.test(await pa.locator("[data-tarjetas-manuales]").innerText()), "las revisadas pasan al historial");

  // ── 5. Necesita atención ──
  console.log("5. Necesita atención");
  const reserva3 = await nuevaReserva();
  const r3 = await (await comoPersona(recId)).rpc("registrar_cobro", { p_reserva_id: reserva3, p_notas: "prueba ui tarjeta manual", p_metodos: [{ metodo: "tarjeta_manual", monto: 2600, propina: 0, folio: `UI-${sufijo}C`, motivo: "terminal_no_responde" }] });
  if (r3.error) throw new Error(r3.error.message);
  await pa.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  const cuerpo = await pa.locator("body").innerText();
  comprobar(/tarjetas? registradas? a mano esperan? revisión/.test(cuerpo) && /pas(ó|aron) el tope de alerta/.test(cuerpo), "«Necesita atención» avisa de la tarjeta por revisar y de la que pasó el tope");
  comprobar(/muchas tarjetas a mano con la terminal conectada/.test(cuerpo) || (await SB.from("tarjetas_manuales").select("id", { count: "exact", head: true }).gte("created_at", new Date(Date.now() - 36e5).toISOString())).count <= 3, "y del patrón si hay más de 3 hoy");
  await pr.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  comprobar(!/tarjeta registrada a mano espera revisión|tarjetas registradas a mano esperan/.test(await pr.locator("body").innerText()), "recepción no ve ese aviso (trae montos)");
  await sinDesborde(pa, "tablero con los avisos");

  // ── 6. Turno, reporte y tope ──
  console.log("6. Turno, reporte y tope");
  await pa.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  const turnoTxt = await pa.locator("body").innerText();
  comprobar(/Tarjeta manual \(sin verificar\)/i.test(turnoTxt) && /Total con tarjeta/.test(turnoTxt), "el turno muestra la línea «Tarjeta manual (sin verificar)» y el total de tarjeta explícito");
  await sinDesborde(pa, "Caja → Turno");
  await pa.goto(`${BASE}/reportes`, { waitUntil: "networkidle" });
  const rep = await pa.locator("body").innerText();
  comprobar(/Tarjeta manual \(sin verificar\)/i.test(rep) && /Total con tarjeta/.test(rep), "el reporte financiero la separa de la terminal y suma el total aparte");
  await sinDesborde(pa, "Reportes");
  await pa.goto(`${BASE}/admin/pagos`, { waitUntil: "networkidle" });
  await pa.getByLabel("Tope de alerta por cobro (MXN)").fill("1500");
  await pa.getByRole("button", { name: "Guardar tope" }).click();
  await pa.waitForTimeout(2000);
  comprobar(/Tope guardado/.test(await pa.locator("body").innerText()), "el admin guarda el tope y el aviso sale junto al botón");
  comprobar(Number((await SB.from("tarjeta_manual_ajustes").select("tope_alerta").single()).data.tope_alerta) === 1500, "el tope quedó en $1,500");
  await sinDesborde(pa, "Administración → Cobro con terminal");
} catch (e) {
  hallazgo(`la prueba tronó: ${e.message}`);
} finally {
  await nav.close();
  await admin.rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  await admin.rpc("guardar_tope_tarjeta_manual", { p_tope: 2000 });
}
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en pantalla.");
process.exit(hallazgos.length ? 1 : 0);
