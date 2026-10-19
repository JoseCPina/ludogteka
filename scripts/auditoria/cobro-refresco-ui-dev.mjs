// La pantalla de cobro con la base lenta — SOLO DESARROLLO, en Huellitas, con `next start` en el 3001.
//
//   node scripts/auditoria/cobro-refresco-ui-dev.mjs
//
// Retrasa 3 s el refresco de la página (las peticiones _rsc) para reproducir la base lenta y comprueba que,
// al registrar un cobro: el botón sigue ocupado y no admite un segundo clic, el resumen enseña de inmediato
// «Cobrado» y «Saldo $0.00» con «Cuenta pagada», nunca queda el formulario con el monto de antes, y se
// registra UN solo cobro. Lo mismo en el cobro junto (el botón sigue ocupado hasta que abre el recibo).
// Secciones 4 a 6 (QA externa del 18 de octubre de 2026, N28 y N29): dos sesiones a la vez sobre la misma cuenta
// piden confirmación; y una cuenta movida desde otra sesión (anulación, cobro) se pone al día sola y avisa.
// Secciones 7c, 7d, 11 y 12 (QA S15, 19 de octubre): tras F5 o desde otra ventana de la misma cuenta pide confirmar;
// anular o registrar cambia el resumen al momento; el encabezado de la reserva y «Cancelar cuenta» se ponen al día.
// Secciones 7 y 8 (QA S13, 18 de octubre): pide confirmar aunque la pantalla ya enseñe el cobro de otra persona,
// no pregunta el segundo cobro propio, y «Actualizando saldo…» deshabilitado y sin aviso viejo.
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
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });

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
  const r = await rec.rpc("crear_venta_mostrador", { p_cliente_id: clienteId, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba refresco cobro" });
  if (r.error) throw new Error(r.error.message);
  return r.data;
};
const cobros = async (id) => (await SB.from("cobros").select("id").eq("reserva_id", id)).data?.length ?? 0;

const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies(await cookiesDe(recId));
// Base lenta: el refresco de la página tarda 3 s.
await ctx.route((u) => u.searchParams.has("_rsc"), async (ruta) => {
  await new Promise((r) => setTimeout(r, 3000));
  await ruta.continue();
});
const p = await ctx.newPage();

try {
  await (await comoPersona(datos.adminB)).rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) turno = (await rec.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba refresco cobro" }).select("id").single()).data;

  console.log("1. Cobro de una cuenta con el refresco lento");
  const cli = await nuevoCliente("Refresco");
  const c1 = await cuenta(cli, 220, `Baño ${sufijo}`);
  await p.goto(`${BASE}/caja/cobrar/${c1}`, { waitUntil: "networkidle" });
  const boton = p.getByRole("button", { name: /Registrar cobro|Cobrando|Actualizando/ });
  await boton.first().click();
  await p.getByText("Cobro registrado.").first().waitFor({ timeout: 20000 });
  const t0 = await p.locator("body").innerText();
  comprobar(/Cobrado:\s*\$220\.00/.test(t0), "al terminar de guardar ya dice «Cobrado: $220.00» (sin esperar el refresco)");
  comprobar(/Saldo:\s*\$0\.00/.test(t0), "y «Saldo: $0.00»");
  // N1 (QA externa, 16 de octubre de 2026): la lista «Cobros de esta reserva» enseña el cobro nuevo de inmediato.
  comprobar(!/Todavía no hay ningún cobro/.test(t0) && (await p.locator("[data-cobro-provisional], [data-cobro-id]").count()) > 0, "la lista «Cobros de esta reserva» ya enseña el cobro nuevo (sin esperar el refresco)");
  comprobar(/Cuenta pagada|No hay saldo por cobrar/i.test(t0) || (await p.getByText("Registrar cobro", { exact: true }).count()) === 0, "sin el formulario de cobrar ni el monto de antes");
  comprobar(await p.getByRole("button", { name: /Registrar cobro/ }).count() === 0 || await p.getByRole("button", { name: /Registrar cobro/ }).first().isDisabled(), "no hay un botón «Registrar cobro» activo para un segundo clic");
  await p.waitForTimeout(5000);
  const t1 = await p.locator("body").innerText();
  comprobar(/Cobrado:\s*\$220\.00/.test(t1) && /Saldo:\s*\$0\.00/.test(t1), "ya refrescada la página, el servidor dice lo mismo");
  comprobar((await cobros(c1)) === 1, "un solo cobro en la base");

  console.log("2. Cobro junto: el botón no se reactiva al pasar al recibo");
  const dos = await nuevoCliente("Junto");
  const j1 = await cuenta(dos, 100, `Cargo A ${sufijo}`);
  const j2 = await cuenta(dos, 50, `Cargo B ${sufijo}`);
  await p.goto(`${BASE}/caja/cobrar-junto?cuentas=${j1},${j2}`, { waitUntil: "networkidle" });
  const bj = p.locator("[data-registrar-junto]");
  await bj.click();
  await p.waitForTimeout(400);
  comprobar(await bj.count() === 0 || (await bj.isDisabled()), "tras guardar, el botón sigue deshabilitado mientras abre el recibo");
  await p.waitForURL(/recibo-junto/, { timeout: 30000 });
  comprobar(((await SB.from("cobros_grupo").select("id").eq("cliente_id", dos)).data ?? []).length === 1, "un solo cobro agrupado en la base");

  // N-sugerencia (QA 17 de octubre): con el servidor rápido (1 a 2.5 s de confirmación), el botón enseña que
  // está procesando y un doble clic en el mismo instante no manda dos cobros.
  console.log("3. Doble clic rápido: un solo cobro, y el botón dice que procesa");
  const pRapida = await ctx.newPage();
  await pRapida.unroute?.("**/*").catch(() => {});
  const tres = await nuevoCliente("Doble clic");
  const c3 = await cuenta(tres, 130, `Baño doble ${sufijo}`);
  await pRapida.goto(`${BASE}/caja/cobrar/${c3}`, { waitUntil: "networkidle" });
  const b3 = pRapida.getByRole("button", { name: /Registrar cobro|Cobrando|Actualizando/ }).first();
  await b3.dblclick({ delay: 0 });
  const textoBoton = await pRapida.getByRole("button", { name: /Cobrando|Actualizando/ }).first().innerText().catch(() => "");
  comprobar(/Cobrando|Actualizando/.test(textoBoton) || (await pRapida.getByText("Cobro registrado.").count()) > 0, `el botón muestra que está procesando («${textoBoton.trim()}») o ya terminó`);
  await pRapida.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });
  await pRapida.waitForTimeout(4000);
  comprobar((await cobros(c3)) === 1, "un doble clic deja UN solo cobro en la base");

  // ── N28 (QA externa, 18 de octubre de 2026): dos personas cobran la misma cuenta casi a la vez ──
  console.log("4. Dos sesiones a la vez (admin y recepción) sobre la misma cuenta: el segundo cobro pide confirmación");
  const admB = await comoPersona(datos.adminB);
  const ctxR = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctxR.addCookies(await cookiesDe(recId));
  const ctxA = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctxA.addCookies(await cookiesDe(datos.adminB));
  // Mientras se arma la escena, las acciones del servidor de la pantalla de recepción no salen (ni el sondeo de la
  // cuenta ni nada): así la pantalla queda con lo que sabía al abrirse, como en la carrera real de 54 ms.
  let bloquear = false;
  await ctxR.route("**/*", async (ruta) => {
    if (bloquear && ruta.request().method() === "POST" && ruta.request().headers()["next-action"]) return ruta.abort();
    return ruta.continue();
  });
  const cuatro = await nuevoCliente("Simultaneo");
  const c4 = await cuenta(cuatro, 900, `Hotel simultaneo ${sufijo}`);
  const pR = await ctxR.newPage();
  const pA = await ctxA.newPage();
  await Promise.all([pR.goto(`${BASE}/caja/cobrar/${c4}`, { waitUntil: "networkidle" }), pA.goto(`${BASE}/caja/cobrar/${c4}`, { waitUntil: "networkidle" })]);
  bloquear = true;
  await pA.getByLabel("Monto").first().fill("10");
  await pA.getByRole("button", { name: "Registrar cobro" }).first().click();
  await pA.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });
  // Recepción, con la pantalla de antes (saldo $900), cobra $10 más.
  await pR.getByLabel("Monto").first().fill("10");
  bloquear = false;
  await pR.getByRole("button", { name: "Registrar cobro" }).first().click();
  const caja4 = pR.locator("[data-confirmar-cobro]");
  await caja4.waitFor({ timeout: 30000 });
  const texto4 = await caja4.innerText();
  comprobar(/Se acaba de registrar otro cobro de \$10\.00 por .+ hace \d+ s\. El saldo ahora es \$890\.00\. ¿Registrar de todos modos\?/.test(texto4), `el aviso dice el monto, quién, hace cuánto y el saldo («${texto4.replace(/\s+/g, " ").slice(0, 160)}»)`);
  comprobar(!/—/.test(texto4.split("¿")[0]), "y el autor no sale como «—»");
  comprobar((await cobros(c4)) === 1, "mientras nadie confirma, solo está el cobro de la primera sesión");
  await pR.locator("[data-registrar-de-todos-modos]").click();
  await pR.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });
  comprobar((await cobros(c4)) === 2, "al confirmar «Registrar de todos modos» se registra el segundo cobro");

  console.log("5. N29: se anula un cobro desde otra sesión y la pantalla de cobro se actualiza sola");
  const cinco = await nuevoCliente("Refresco vivo");
  const c5 = await cuenta(cinco, 300, `Baño vivo ${sufijo}`);
  const r5 = await admB.rpc("registrar_cobro", { p_reserva_id: c5, p_notas: "prueba", p_metodos: [{ metodo: "efectivo", monto: 100, propina: 0 }] });
  if (r5.error) throw new Error(r5.error.message);
  const pV = await ctxR.newPage();
  await pV.goto(`${BASE}/caja/cobrar/${c5}`, { waitUntil: "networkidle" });
  comprobar(/Saldo:\s*\$200\.00/.test(await pV.locator("body").innerText()), "abre con saldo $200.00");
  comprobar((await pV.getByLabel("Monto").first().inputValue()) === "200.00", "y el monto viene con $200.00");
  const an = await admB.rpc("anular_cobro", { p_cobro_id: r5.data, p_motivo: "prueba de refresco" });
  if (an.error) throw new Error(an.error.message);
  const aviso5 = pV.locator("[data-saldo-cambio]");
  await aviso5.waitFor({ timeout: 40000 });
  await pV.waitForFunction(() => /Saldo:\s*\$300\.00/.test(document.body.innerText), null, { timeout: 30000 });
  comprobar(/antes era \$200\.00 y ahora es \$300\.00/.test(await aviso5.innerText()), "avisa «El saldo cambió»: antes $200.00, ahora $300.00");
  comprobar((await pV.getByLabel("Monto").first().inputValue()) === "300.00", "el monto prellenado se pone al día ($300.00)");
  // Con un monto escrito a mano que ya no corresponde, el aviso lo dice.
  await pV.getByLabel("Monto").first().fill("50");
  const r5b = await admB.rpc("registrar_cobro", { p_reserva_id: c5, p_notas: "prueba", p_metodos: [{ metodo: "efectivo", monto: 120, propina: 0 }] });
  if (r5b.error) throw new Error(r5b.error.message);
  await pV.waitForFunction(() => /ahora es \$180\.00/.test(document.querySelector("[data-saldo-cambio]")?.textContent ?? ""), null, { timeout: 40000 });
  comprobar(/ya no corresponde/.test(await pV.locator("[data-saldo-cambio]").innerText()), "con el monto escrito a mano ($50), avisa que ya no corresponde");
  comprobar((await pV.getByLabel("Monto").first().inputValue()) === "50", "y NO le borra lo que escribió");
  // N39/N41 (QA del 18 de octubre de 2026): el aviso usa las cifras vivas y desaparece cuando ya no aplica.
  comprobar(/revísalo/.test(await pV.locator("[data-saldo-cambio]").innerText()), "«revísalo» lleva acento");
  await pV.getByLabel("Monto").first().fill("180");
  await pV.waitForTimeout(300);
  comprobar((await pV.locator("[data-saldo-cambio]").count()) === 0, "al escribir el saldo vivo ($180), el aviso desaparece");
  await pV.getByLabel("Monto").first().fill("50");
  await pV.locator("[data-saldo-cambio]").waitFor({ timeout: 5000 });
  await pV.getByRole("button", { name: "Registrar cobro" }).first().click();
  const conf5 = pV.locator("[data-confirmar-cobro]");
  await Promise.race([conf5.waitFor({ timeout: 30000 }), pV.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 })]);
  if (await conf5.count()) await pV.locator("[data-registrar-de-todos-modos]").click();
  await pV.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });
  await pV.waitForTimeout(1500);
  comprobar((await pV.locator("[data-saldo-cambio]").count()) === 0, "N41: después de «Cobro registrado.» ya no queda el aviso «El saldo cambió»");

  console.log("6. N28 en el cobro junto");
  const seis = await nuevoCliente("Junto simultaneo");
  const k1 = await cuenta(seis, 100, `Cargo K1 ${sufijo}`);
  const k2 = await cuenta(seis, 60, `Cargo K2 ${sufijo}`);
  const pJ = await ctxR.newPage();
  await pJ.goto(`${BASE}/caja/cobrar-junto?cuentas=${k1},${k2}`, { waitUntil: "networkidle" });
  bloquear = true;
  const r6 = await admB.rpc("registrar_cobro", { p_reserva_id: k1, p_notas: "prueba", p_metodos: [{ metodo: "efectivo", monto: 10, propina: 0 }] });
  if (r6.error) throw new Error(r6.error.message);
  // Las cuentas ya no tienen el saldo de la pantalla: se ajusta el monto de la primera para que el cobro sea válido.
  const campos = pJ.locator("[data-cuenta-junto] input[type=number]");
  await campos.first().fill("90");
  bloquear = false;
  await pJ.locator("[data-registrar-junto]").click();
  const caja6 = pJ.locator("[data-confirmar-cobro]");
  await caja6.waitFor({ timeout: 30000 });
  comprobar(/Se acaba de registrar otro cobro de \$10\.00/.test(await caja6.innerText()), "el cobro junto también avisa del cobro que entró a una de sus cuentas");
  comprobar(((await SB.from("cobros_grupo").select("id").eq("cliente_id", seis)).data ?? []).length === 0, "y no registró nada todavía");

  console.log("7. N28-A: la pantalla de recepción ya enseña el cobro del admin y aun así se pide confirmar");
  const siete = await nuevoCliente("Ya visto");
  const c7 = await cuenta(siete, 900, `Hotel visto ${sufijo}`);
  const pW = await ctxR.newPage();
  await pW.goto(`${BASE}/caja/cobrar/${c7}`, { waitUntil: "networkidle" });
  const r7 = await admB.rpc("registrar_cobro", { p_reserva_id: c7, p_notas: "prueba", p_metodos: [{ metodo: "efectivo", monto: 10, propina: 0 }] });
  if (r7.error) throw new Error(r7.error.message);
  await pW.waitForFunction(() => /Saldo:\s*\$890\.00/.test(document.body.innerText), null, { timeout: 40000 });
  comprobar(true, "la pantalla de recepción se actualizó sola con el cobro del admin ($890.00)");
  await pW.getByLabel("Monto").first().fill("10");
  await pW.getByRole("button", { name: "Registrar cobro" }).first().click();
  const caja7 = pW.locator("[data-confirmar-cobro]");
  const pidio = await caja7.waitFor({ timeout: 20000 }).then(() => true, () => false);
  comprobar(pidio && /Se acaba de registrar otro cobro de \$10\.00/.test(await caja7.innerText().catch(() => "")), "aunque ya lo enseñaba, pide confirmar porque otra persona cobró hace menos de 2 minutos");
  comprobar((await cobros(c7)) === 1, "y no registró nada sin confirmar");
  if (pidio) await pW.locator("[data-registrar-de-todos-modos]").click();
  await pW.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });

  // QA S15 (19 de octubre de 2026): recepción recarga con F5 (o entra de nuevo a Cobrar) DESPUÉS del cobro del admin;
  // la pantalla nace sabiendo ese cobro y aun así el servidor tiene que pedir confirmación.
  console.log("7c. N28 tras F5: recepción abre Cobrar después del cobro del admin y aun así se pide confirmar");
  for (const via of ["F5", "entrar de nuevo"]) {
    const cF = await nuevoCliente(`Tras ${via}`);
    const cuF = await cuenta(cF, 700, `Hotel ${via} ${sufijo}`);
    const pF = await ctxR.newPage();
    await pF.goto(`${BASE}/caja/cobrar/${cuF}`, { waitUntil: "networkidle" });
    const rF = await admB.rpc("registrar_cobro", { p_reserva_id: cuF, p_notas: "prueba", p_metodos: [{ metodo: "efectivo", monto: 10, propina: 0 }] });
    if (rF.error) throw new Error(rF.error.message);
    if (via === "F5") await pF.reload({ waitUntil: "networkidle" });
    else await pF.goto(`${BASE}/caja/cobrar/${cuF}`, { waitUntil: "networkidle" });
    comprobar(/Saldo:\s*\$690\.00/.test(await pF.locator("body").innerText()), `(${via}) la pantalla nace con el cobro del admin ($690.00)`);
    await pF.getByLabel("Monto").first().fill("10");
    await pF.getByRole("button", { name: "Registrar cobro" }).first().click();
    const cajaF = pF.locator("[data-confirmar-cobro]");
    const pidioF = await cajaF.waitFor({ timeout: 20000 }).then(() => true, () => false);
    comprobar(pidioF && /Se acaba de registrar otro cobro de \$10\.00 por .+ hace/.test(await cajaF.innerText().catch(() => "")), `(${via}) pide confirmar el cobro del admin de hace segundos`);
    comprobar((await cobros(cuF)) === 1, `(${via}) y no registró nada sin confirmar`);
    if (pidioF) {
      await pF.locator("[data-registrar-de-todos-modos]").click();
      await pF.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });
      comprobar((await cobros(cuF)) === 2, `(${via}) al confirmar sí se registra`);
    }
    await pF.close();
  }

  console.log("7b. Un segundo cobro de la MISMA persona, que ya vio el suyo, no pregunta");
  const ocho = await nuevoCliente("Misma persona");
  const c8 = await cuenta(ocho, 300, `Baño misma ${sufijo}`);
  const pM = await ctxR.newPage();
  await pM.goto(`${BASE}/caja/cobrar/${c8}`, { waitUntil: "networkidle" });
  await pM.getByLabel("Monto").first().fill("100");
  await pM.getByRole("button", { name: "Registrar cobro" }).first().click();
  await pM.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });
  await pM.waitForFunction(() => /Saldo:\s*\$200\.00/.test(document.body.innerText), null, { timeout: 30000 });
  await pM.getByLabel("Monto").first().fill("50");
  await pM.getByRole("button", { name: "Registrar cobro" }).first().click();
  await pM.waitForFunction(() => /Saldo:\s*\$150\.00/.test(document.body.innerText), null, { timeout: 30000 }).catch(() => {});
  comprobar((await pM.locator("[data-confirmar-cobro]").count()) === 0 && (await cobros(c8)) === 2, "el segundo cobro propio entra sin pregunta");

  console.log("8. N28-B/N39: mientras se actualiza, el botón dice «Actualizando saldo…», está deshabilitado y no hay aviso con cifras viejas");
  const ctxL = await nav.newContext({ viewport: { width: 393, height: 852 } });
  await ctxL.addCookies(await cookiesDe(recId));
  let lento = false;
  await ctxL.route((u) => u.searchParams.has("_rsc"), async (ruta) => {
    if (lento) await new Promise((r) => setTimeout(r, 6000));
    await ruta.continue();
  });
  const nueve = await nuevoCliente("Actualizando");
  const c9 = await cuenta(nueve, 880, `Hotel actualizando ${sufijo}`);
  const pL = await ctxL.newPage();
  await pL.goto(`${BASE}/caja/cobrar/${c9}`, { waitUntil: "networkidle" });
  lento = true;
  const r9 = await admB.rpc("registrar_cobro", { p_reserva_id: c9, p_notas: "prueba", p_metodos: [{ metodo: "efectivo", monto: 10, propina: 0 }] });
  if (r9.error) throw new Error(r9.error.message);
  const bActualizando = pL.getByRole("button", { name: /Actualizando saldo/ }).first();
  const vioActualizando = await bActualizando.waitFor({ timeout: 40000 }).then(() => true, () => false);
  comprobar(vioActualizando, "el botón cambia a «Actualizando saldo…»");
  if (vioActualizando) {
    comprobar(await bActualizando.isDisabled(), "y se ve deshabilitado");
    comprobar((await pL.locator("[data-saldo-cambio]").count()) === 0, "durante la actualización no se enseña el aviso con cifras de antes");
  }
  await pL.getByRole("button", { name: "Registrar cobro" }).first().waitFor({ timeout: 30000 });
  comprobar(await pL.getByRole("button", { name: "Registrar cobro" }).first().isEnabled(), "al terminar queda listo («Registrar cobro» activo)");
  const t9 = await pL.locator("[data-saldo-cambio]").innerText().catch(() => "");
  comprobar(/antes era \$880\.00 y ahora es \$870\.00/.test(t9), `el aviso enseña el saldo anterior y el actual reales («${t9.slice(0, 90)}»)`);
  comprobar((await pL.getByLabel("Monto").first().inputValue()) === "870.00", "y el monto se puso al día ($870.00)");

  console.log("9. QA S14: «Cobro registrado» se va al anular el cobro");
  const diez = await nuevoCliente("Anulado");
  const c10 = await cuenta(diez, 150, `Baño anulado ${sufijo}`);
  const pAn = await ctxL.newPage();
  lento = false;
  await pAn.goto(`${BASE}/caja/cobrar/${c10}`, { waitUntil: "networkidle" });
  await pAn.getByRole("button", { name: "Registrar cobro" }).first().click();
  const ok9 = await pAn.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 }).then(() => true, () => false);
  if (!ok9) {
    hallazgo(`sección 9: no salió «Cobro registrado.» (pantalla: «${(await pAn.locator("main").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 600)}»)`);
    throw new Error("sección 9");
  }
  comprobar(await pAn.getByText("Cobro registrado.").first().isVisible(), "sale «Cobro registrado.»");
  const { data: cob10 } = await SB.from("cobros").select("id").eq("reserva_id", c10).order("created_at", { ascending: false }).limit(1).single();
  const an10 = await admB.rpc("anular_cobro", { p_cobro_id: cob10.id, p_motivo: "prueba QA S14" });
  if (an10.error) hallazgo(`no se pudo anular el cobro de prueba (${an10.error.message})`);
  await pAn.getByRole("button", { name: "Registrar cobro" }).first().waitFor({ timeout: 40000 }).catch(() => {});
  comprobar((await pAn.getByText("Cobro registrado.").count()) === 0, "tras anular, «Cobro registrado.» ya no se ve");
  comprobar(await pAn.getByRole("button", { name: "Registrar cobro" }).first().isVisible().catch(() => false), "y la cuenta vuelve a pedir el cobro");

  console.log("10. QA S14: una reserva cancelada sin saldo no ofrece «Cobrar»");
  const { data: hotelS } = await SB.from("servicios").select("id").eq("clave", "hotel_noche").is("deleted_at", null).maybeSingle();
  if (!hotelS) hallazgo("Huellitas no tiene hotel_noche");
  else {
    const dia = (d) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);
    // Entrada en lunes o martes: ni la entrada ni la salida caen en un día en que el negocio no abre.
    let base = 300 + (Number(sufijo) % 100) * 3;
    while (![1, 2].includes(new Date(Date.now() + base * 86400000).getUTCDay())) base++;
    const { data: resC, error: erc } = await admB.from("reservas").insert({ cliente_id: datos.clienteSoloB, notas: `Cancelada ${sufijo}` }).select("id").single();
    if (erc) throw new Error(erc.message);
    const { data: estC, error: eec } = await admB.from("estancias").insert({
      reserva_id: resC.id, perro_id: datos.perroSoloB, servicio_id: hotelS.id, fecha_entrada: dia(base), fecha_salida: dia(base + 1),
      bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba",
    }).select("id").single();
    if (eec) throw new Error(eec.message);
    const can = await admB.from("estancias").update({ estado: "cancelada" }).eq("id", estC.id);
    if (can.error) hallazgo(`no se pudo cancelar la estancia de prueba (${can.error.message})`);
    const pC = await ctxL.newPage();
    await pC.goto(`${BASE}/reservas/${resC.id}`, { waitUntil: "networkidle" });
    const txt = await pC.locator("[data-reserva-cancelada-cuenta]").innerText().catch(() => "");
    comprobar(/no hay nada por cobrar/.test(txt), `la reserva cancelada lo dice («${txt}»)`);
    comprobar((await pC.locator("[data-cobrar-reserva]").count()) === 0, "y no ofrece «Cobrar»");
    // Con un cargo que sí se hizo, se ve claro qué se debe.
    const { data: cargoS } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "cargo").eq("monto_libre", true).is("deleted_at", null).limit(1).maybeSingle();
    if (cargoS) {
      const cr = await admB.from("cargos_aplicados").insert({ reserva_id: resC.id, servicio_id: cargoS.id, cantidad: 1, precio: 75, descripcion: "Comida que sí se dio" });
      if (cr.error) console.log(`  · (no se pudo agregar el cargo de prueba: ${cr.error.message})`);
      else {
        await pC.reload({ waitUntil: "networkidle" });
        const txt2 = await pC.locator("[data-reserva-cancelada-cuenta]").innerText().catch(() => "");
        comprobar(/todavía debe \$75\.00/.test(txt2), `con saldo, dice qué se debe («${txt2.slice(0, 100)}»)`);
        comprobar(/Cobrar \$75\.00/.test(await pC.locator("[data-cobrar-reserva]").innerText().catch(() => "")), "y el botón dice «Cobrar $75.00»");
      }
    }
  }

  // ── QA S15 (19 de octubre de 2026) ──
  console.log("7d. N28 con la MISMA cuenta en otra ventana: la segunda ventana, recargada, también pide confirmar");
  {
    const ctxR2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctxR2.addCookies(await cookiesDe(recId));
    const cM = await nuevoCliente("Otra ventana");
    const cuM = await cuenta(cM, 500, `Hotel otra ventana ${sufijo}`);
    const v1 = await ctxR.newPage();
    const v2 = await ctxR2.newPage();
    await Promise.all([v1.goto(`${BASE}/caja/cobrar/${cuM}`, { waitUntil: "networkidle" }), v2.goto(`${BASE}/caja/cobrar/${cuM}`, { waitUntil: "networkidle" })]);
    await v1.getByLabel("Monto").first().fill("10");
    await v1.getByRole("button", { name: "Registrar cobro" }).first().click();
    await v1.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 });
    await v2.reload({ waitUntil: "networkidle" });
    await v2.getByLabel("Monto").first().fill("10");
    await v2.getByRole("button", { name: "Registrar cobro" }).first().click();
    const cajaM = v2.locator("[data-confirmar-cobro]");
    const pidioM = await cajaM.waitFor({ timeout: 20000 }).then(() => true, () => false);
    comprobar(pidioM && /con tu cuenta desde otra ventana/.test(await cajaM.innerText().catch(() => "")), "la otra ventana (misma persona, tras F5) pide confirmar y dice que fue con su cuenta desde otra ventana");
    comprobar((await cobros(cuM)) === 1, "y no registró nada sin confirmar");
    await ctxR2.close();
  }

  console.log("11. N45: al anular un cobro, Cobrado y Saldo cambian de inmediato y el cobro sale «Anulado» (con el refresco lento)");
  {
    const ctxAd = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctxAd.addCookies(await cookiesDe(datos.adminB));
    let lentoAd = false;
    await ctxAd.route((u) => u.searchParams.has("_rsc"), async (ruta) => {
      if (lentoAd) await new Promise((r) => setTimeout(r, 8000));
      await ruta.continue();
    });
    const cA = await nuevoCliente("Anular rapido");
    const cuA = await cuenta(cA, 430, `Hotel anular ${sufijo}`);
    const rA = await admB.rpc("registrar_cobro", { p_reserva_id: cuA, p_notas: "prueba", p_metodos: [{ metodo: "efectivo", monto: 430, propina: 0 }] });
    if (rA.error) throw new Error(rA.error.message);
    const pA2 = await ctxAd.newPage();
    await pA2.goto(`${BASE}/caja/cobrar/${cuA}`, { waitUntil: "networkidle" });
    comprobar(/Saldo:\s*\$0\.00/.test(await pA2.locator("body").innerText()), "abre pagada (Saldo $0.00)");
    lentoAd = true;
    const tarjeta = pA2.locator(`[data-cobro-id="${rA.data}"]`);
    await tarjeta.getByRole("button", { name: "Anular cobro" }).click();
    await tarjeta.getByLabel("Motivo (obligatorio)").fill("Prueba QA S15 anular");
    const t0 = Date.now();
    await tarjeta.getByRole("button", { name: "Anular cobro" }).click();
    await pA2.waitForFunction(() => /Saldo:\s*\$430\.00/.test(document.body.innerText), null, { timeout: 7000 }).catch(() => {});
    const ms = Date.now() - t0;
    const txtA = await pA2.locator("body").innerText();
    comprobar(/Saldo:\s*\$430\.00/.test(txtA) && ms < 7000, `el saldo sube a $430.00 sin esperar el refresco (${ms} ms, con el refresco tardando 8 s)`);
    comprobar(/Cobrado:\s*\$0\.00/.test(txtA), "y «Cobrado» baja a $0.00 al momento");
    comprobar((await pA2.locator(`[data-cobro-id="${rA.data}"][data-cobro-anulado="si"]`).count()) === 1, "el cobro se marca «Anulado» al momento");
    // Registrar: el resumen también sale de la respuesta (se espera a que termine el refresco de la anulación).
    await pA2.getByRole("button", { name: "Registrar cobro" }).first().waitFor({ timeout: 40000 });
    await pA2.getByLabel("Monto").first().fill("100");
    const t1 = Date.now();
    await pA2.getByRole("button", { name: "Registrar cobro" }).first().click();
    const conf = pA2.locator("[data-confirmar-cobro]");
    await Promise.race([conf.waitFor({ timeout: 30000 }), pA2.getByText("Cobro registrado.").first().waitFor({ timeout: 30000 })]).catch(() => {});
    if (await conf.count()) await pA2.locator("[data-registrar-de-todos-modos]").click();
    await pA2.waitForFunction(() => /Saldo:\s*\$330\.00/.test(document.body.innerText), null, { timeout: 7000 }).catch(() => {});
    comprobar(/Saldo:\s*\$330\.00/.test(await pA2.locator("body").innerText()), `al registrar $100 el saldo queda en $330.00 sin esperar el refresco (${Date.now() - t1} ms, con el refresco tardando 8 s)`);
    lentoAd = false;
    await ctxAd.close();
  }

  console.log("12. El encabezado de la reserva (saldo) y la tarjeta «Cancelar cuenta» se ponen al día solos");
  {
    const cE = await nuevoCliente("Encabezado");
    const cuE = await cuenta(cE, 880, `Hotel encabezado ${sufijo}`);
    const rE1 = await admB.rpc("registrar_cobro", { p_reserva_id: cuE, p_notas: "prueba", p_metodos: [{ metodo: "efectivo", monto: 450, propina: 0 }] });
    if (rE1.error) throw new Error(rE1.error.message);
    const ctxAd2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctxAd2.addCookies(await cookiesDe(datos.adminB));
    const pE = await ctxAd2.newPage();
    await pE.goto(`${BASE}/reservas/${cuE}`, { waitUntil: "networkidle" });
    comprobar((await pE.locator("[data-saldo-reserva]").getAttribute("data-saldo-reserva")) === "430.00", "el encabezado abre con Saldo $430.00");
    const pE2 = await ctxAd2.newPage();
    await pE2.goto(`${BASE}/caja/cobrar/${cuE}`, { waitUntil: "networkidle" });
    const an = await admB.rpc("anular_cobro", { p_cobro_id: rE1.data, p_motivo: "prueba encabezado" });
    if (an.error) throw new Error(an.error.message);
    await pE.waitForFunction(() => document.querySelector("[data-saldo-reserva]")?.getAttribute("data-saldo-reserva") === "880.00", null, { timeout: 40000 }).catch(() => {});
    comprobar((await pE.locator("[data-saldo-reserva]").getAttribute("data-saldo-reserva")) === "880.00", "el encabezado de la reserva pasa solo a $880.00 (sin recargar)");
    await pE2.waitForFunction(() => /Saldo:\s*\$880\.00/.test(document.body.innerText), null, { timeout: 40000 }).catch(() => {});
    await pE2.getByRole("button", { name: "Cancelar cuenta" }).first().click();
    const tCancel = await pE2.locator("[data-cancelar-cuenta] p").first().innerText().catch(() => "");
    comprobar(/\$880\.00 por cobrar/.test(tCancel), `y en Cobrar, la tarjeta «Cancelar cuenta» dice lo mismo que el resumen («${tCancel}»)`);
    await ctxAd2.close();
  }
} finally {
  await nav.close();
}
if (hallazgos.length) { console.log(`\n${hallazgos.length} hallazgo(s)`); process.exit(1); }
console.log("\nSin hallazgos.");
