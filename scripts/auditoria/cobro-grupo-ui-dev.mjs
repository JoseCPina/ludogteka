// Cobro agrupado en pantalla, a 390 px (celular) — SOLO DESARROLLO, en Huellitas.
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/cobro-grupo-ui-dev.mjs
//
// 1. Caja agrupa las cuentas de la misma persona con su total junto y «Cobrar
//    todo junto»; las casillas juntan solo cuentas de la misma persona (las de
//    otra se bloquean) y la barra dice cuántas y cuánto suman.
// 2. La pantalla de cobro junto: total, desglose por cuenta, un método; al
//    registrar sale el recibo único con el desglose.
// 3. Pago parcial: «Total que paga hoy» reparte de la más antigua a la más nueva
//    y lo que falta queda como saldo; un resto de menos de un peso se frena.
// 4. Tarjeta (registro manual): un solo folio para el grupo, el aviso sale junto
//    al botón sin folio, y cada cuenta dice «Cobrado junto con: …».
// 5. Admin: Conciliación lista la tarjeta como «cobro junto · 2 cuentas».
// 6. Sin desborde horizontal a 390 px en ninguna pantalla.
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
const rec = await comoPersona(recId);
let n = 0;
const nuevoCliente = async (nombre) => {
  const tel = `55${String(Date.now()).slice(-7)}${n++ % 10}`.slice(0, 10);
  const r = await SB.from("clientes").insert({ nombre: `${nombre} ${sufijo}`, telefono: tel }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  return r.data.id;
};
const cuenta = async (clienteId, precio, concepto) => {
  const r = await rec.rpc("crear_venta_mostrador", { p_cliente_id: clienteId, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba ui cobro agrupado" });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const saldo = async (id) => Number((await rec.rpc("cuenta_totales_reserva", { p_reserva_id: id })).data?.[0]?.saldo);

const nav = await abrirNavegador();
const ctxRec = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxRec.addCookies(await cookiesDe(recId));
const pr = await ctxRec.newPage();
const ctxAdmin = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxAdmin.addCookies(await cookiesDe(datos.adminB));
const pa = await ctxAdmin.newPage();

try {
  await (await comoPersona(datos.adminB)).rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) turno = (await rec.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba ui cobro agrupado" }).select("id").single()).data;
  const victoria = await nuevoCliente("Victoria");
  const otra = await nuevoCliente("Otra clienta");
  const a1 = await cuenta(victoria, 320, `Baño rapado ${sufijo}`);
  const a2 = await cuenta(victoria, 35, `Guardería 1 hr ${sufijo}`);
  const o1 = await cuenta(otra, 80, `Cargo de otra ${sufijo}`);

  // ── 1. Caja ──
  console.log("1. Caja agrupa por persona");
  await pr.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  const grupo = pr.locator(`[data-grupo-cliente="${victoria}"]`);
  comprobar((await grupo.count()) === 1, "las dos cuentas de la misma persona salen en un solo recuadro");
  const txt = await grupo.innerText();
  comprobar(/2 cuentas/.test(txt) && /\$355\.00/.test(txt), `con su total junto («${txt.replace(/\n/g, " ").slice(0, 100)}…»)`);
  comprobar((await grupo.locator("[data-cobrar-todo-junto]").count()) === 1, "y el botón «Cobrar todo junto»");
  comprobar((await pr.locator(`[data-grupo-cliente="${otra}"]`).count()) === 0, "una cuenta sola de otra persona no forma recuadro");
  await sinDesborde(pr, "Caja con cuentas agrupadas");
  await pr.locator(`[data-cuenta-fila="${a1}"] [data-cuenta-casilla]`).check();
  const casillaOtra = pr.locator(`[data-cuenta-fila="${o1}"] [data-cuenta-casilla]`);
  comprobar(await casillaOtra.isDisabled(), "con una cuenta marcada, la casilla de OTRA persona se bloquea (nunca se mezclan)");
  comprobar(/1 cuenta marcada/.test(await pr.locator("[data-seleccion-junto]").innerText()) && (await pr.locator("[data-cobrar-seleccion]").count()) === 0, "la barra dice 1 cuenta marcada y pide marcar otra");
  await pr.locator(`[data-cuenta-fila="${a2}"] [data-cuenta-casilla]`).check();
  const barra = await pr.locator("[data-seleccion-junto]").innerText();
  comprobar(/2 cuentas marcadas/.test(barra) && /\$355\.00/.test(barra), `con 2 marcadas la barra suma $355.00 («${barra.replace(/\n/g, " ").slice(0, 90)}»)`);
  await sinDesborde(pr, "Caja con la barra de selección");

  // ── 2. Cobro junto ──
  console.log("2. Cobro junto en efectivo");
  await pr.locator("[data-cobrar-seleccion]").click();
  await pr.waitForURL(/cobrar-junto/);
  await pr.locator("[data-cobro-junto]").waitFor();
  comprobar((await pr.locator("[data-cuenta-junto]").count()) === 2, "la pantalla trae las dos cuentas con su desglose");
  comprobar((await pr.locator("[data-total-junto]").inputValue()) === "355.00", "el total que paga hoy es $355.00");
  await sinDesborde(pr, "Cobrar varias cuentas juntas");
  await pr.getByRole("button", { name: /Registrar cobro de \$355\.00/ }).click();
  await pr.locator("[data-recibo-junto]").waitFor({ timeout: 15000 });
  const recibo = await pr.locator("[data-recibo-junto]").innerText();
  comprobar(recibo.includes(`Baño rapado ${sufijo}`) && recibo.includes(`Guardería 1 hr ${sufijo}`) && /\$355\.00/.test(recibo), "el recibo único trae el desglose y el total");
  await sinDesborde(pr, "Recibo del cobro junto");
  comprobar((await saldo(a1)) === 0 && (await saldo(a2)) === 0, "las dos cuentas quedaron en cero");
  await pr.goto(`${BASE}/caja/cobrar/${a2}`, { waitUntil: "networkidle" });
  const junto = await pr.locator("[data-cobrado-junto]").first().innerText();
  comprobar(/Cobrado junto con/.test(junto) && junto.includes(`Baño rapado ${sufijo}`), `la cuenta dice con quién se cobró («${junto.replace(/\n/g, " ").slice(0, 110)}…»)`);
  await sinDesborde(pr, "Cuenta cobrada junto");

  // ── 3. Parcial y centavos ──
  console.log("3. Pago parcial");
  const p1 = await cuenta(victoria, 200, `Cuenta A ${sufijo}`);
  const p2 = await cuenta(victoria, 100, `Cuenta B ${sufijo}`);
  await pr.goto(`${BASE}/caja/cobrar-junto?cuentas=${p1},${p2}`, { waitUntil: "networkidle" });
  await pr.locator("[data-total-junto]").fill("250");
  const montos = await pr.locator("[data-monto-cuenta]").evaluateAll((els) => els.map((e) => e.value));
  comprobar(montos[0] === "200.00" && montos[1] === "50.00", `pagar $250 se aplica de la más antigua a la más nueva (${montos.join(" / ")})`);
  await pr.locator("[data-monto-cuenta]").nth(1).fill("99.5");
  await pr.locator("[data-monto-cuenta]").nth(0).fill("200");
  await pr.getByRole("button", { name: /Registrar cobro de/ }).click();
  await pr.waitForTimeout(800);
  const aviso = (await pr.locator("[role=alert]").allInnerTexts()).join(" | ");
  comprobar(/menos de un peso/i.test(aviso), `un resto de menos de un peso se frena junto al botón («${aviso.slice(0, 90)}»)`);
  await pr.locator("[data-monto-cuenta]").nth(1).fill("50");
  await pr.getByRole("button", { name: /Registrar cobro de \$250\.00/ }).click();
  await pr.locator("[data-recibo-junto]").waitFor({ timeout: 15000 });
  comprobar((await saldo(p1)) === 0 && (await saldo(p2)) === 50, "queda saldo $50 en la cuenta más nueva");

  // ── 4. Tarjeta manual con un folio ──
  console.log("4. Tarjeta (registro manual): un folio");
  const t1 = await cuenta(victoria, 320, `Tarjeta A ${sufijo}`);
  const t2 = await cuenta(victoria, 35, `Tarjeta B ${sufijo}`);
  await pr.goto(`${BASE}/caja/cobrar-junto?cuentas=${t1},${t2}`, { waitUntil: "networkidle" });
  await pr.getByLabel("Método").first().selectOption("tarjeta_manual");
  await pr.locator("[data-tarjeta-manual]").waitFor();
  await sinDesborde(pr, "Cobro junto con tarjeta manual");
  await pr.getByRole("button", { name: /Registrar cobro de/ }).click();
  await pr.waitForTimeout(500);
  comprobar((await pr.locator("[role=alert]").allInnerTexts()).some((t) => /folio/i.test(t)), "sin folio frena con el aviso junto al botón");
  const folio = `UIG-${sufijo}`;
  await pr.getByLabel("Folio o autorización del voucher").fill(folio);
  await pr.getByLabel("¿Por qué no se cobró con la terminal vinculada?").selectOption("sin_senal");
  await pr.getByRole("button", { name: /Registrar cobro de/ }).click();
  await pr.locator("[data-recibo-junto]").waitFor({ timeout: 15000 });
  comprobar(new RegExp(folio).test(await pr.locator("[data-recibo-junto]").innerText()), "el recibo lleva el folio único del voucher");
  const { count } = await SB.from("tarjetas_manuales").select("id", { count: "exact", head: true }).eq("folio", folio);
  comprobar(count === 1, "en la base hay UN solo registro con ese folio");
  await pr.goto(`${BASE}/caja/cobrar/${t1}`, { waitUntil: "networkidle" });
  comprobar(/Cobrado junto con/.test(await pr.locator("[data-cobrado-junto]").first().innerText()) && new RegExp(folio).test(await pr.locator("[data-tarjeta-manual-cobro]").first().innerText()), "cada cuenta muestra el folio y «Cobrado junto con»");

  // ── 5. Conciliación (admin) ──
  console.log("5. Conciliación");
  await pa.goto(`${BASE}/caja/conciliacion`, { waitUntil: "networkidle" });
  const fila = pa.locator("[data-tarjeta-por-revisar]", { hasText: folio });
  comprobar(/cobro junto · 2 cuentas/.test(await fila.innerText()) && /\$355\.00/.test(await fila.innerText()), "el admin ve la tarjeta como «cobro junto · 2 cuentas» por $355.00");
  await sinDesborde(pa, "Conciliación con un cobro junto");
  await fila.getByRole("button", { name: "Marcar como no recibida" }).click();
  comprobar(/2 cuentas/.test(await fila.innerText()), "al marcarla avisa que afecta a las 2 cuentas");
  await fila.getByLabel("Motivo (obligatorio)").fill("El banco no la acreditó");
  await fila.getByRole("button", { name: "Marcar como no recibida" }).last().click();
  await pa.waitForTimeout(2500);
  comprobar((await saldo(t1)) === 320 && (await saldo(t2)) === 35, "queda no recibida y las dos cuentas vuelven a deber lo suyo");
  await pa.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  comprobar((await pa.locator("[data-movimiento-junto]").count()) > 0, "el turno marca los movimientos de un cobro junto");
  await sinDesborde(pa, "Caja → Turno");
} catch (e) {
  hallazgo(`la prueba tronó: ${e.message}`);
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en pantalla.");
process.exit(hallazgos.length ? 1 : 0);
