// «Cancelar cuenta» EN PANTALLA, a 390 px (celular) y 1280 px (escritorio) — SOLO
// DESARROLLO, en Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/cancelar-cuenta-ui-dev.mjs
//
// Caja: «Por cobrar» (hoy y días anteriores) separado de «Próximas»; el botón «Cancelar
// cuenta» en la lista y dentro de la cuenta (solo con el permiso); motivo obligatorio;
// «Otro» pide texto; la cuenta cancelada sale de la lista, la cuenta muestra el aviso y
// la ficha del cliente la lista; sin el permiso no hay botón.
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
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });

const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recSinPermiso = recepciones[1].profile_id;
const admin = await comoPersona(datos.adminB);
const hoy = (await admin.rpc("fecha_negocio")).data;
const suma = (dias) => new Date(new Date(`${hoy}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const { data: razas } = await A.from("razas").select("id, nombre");
const { data: servicios } = await SB.from("servicios").select("id, clave").eq("categoria", "estetica").is("deleted_at", null);

const nav = await abrirNavegador();
const creados = { citas: [] };
try {
  const { data: perro } = await SB.from("perros").insert({
    cliente_id: datos.clienteSoloB, nombre: `ZZ UI cancelar ${sufijo}`, raza: "Poodle", raza_id: razas.find((r) => r.nombre === "Poodle").id,
    tamano_id: tallas.find((t) => t.clave === "chico").id, pelaje_id: pelajes.find((t) => t.clave === "medio").id,
  }).select("id").single();
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) {
    const t = await (await comoPersona(recepciones[0].profile_id)).from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba ui cancelar" }).select("id").single();
    turno = t.data;
  }

  for (const [nombreVista, ancho, alto] of [["celular", 390, 844], ["escritorio", 1280, 900]]) {
    console.log(`── ${nombreVista} (${ancho} px)`);
    const venta = async (precio, concepto) => (await admin.rpc("crear_venta_mostrador", { p_cliente_id: datos.clienteSoloB, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba ui cancelar" })).data;
    const etiqueta = `UI ${nombreVista} ${sufijo}`;
    const hoyCuenta = await venta(111, `${etiqueta} hoy`);
    const lista2 = await venta(222, `${etiqueta} detalle`);
    const vieja = await venta(333, `${etiqueta} vieja`);
    await SB.from("reservas").update({ created_at: new Date(Date.now() - 4 * 86400000).toISOString() }).eq("id", vieja);
    // Una cita dentro de 6 días (cuenta «Próxima»).
    const { data: rr } = await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
    const inicio = `${suma(6 + (ancho === 390 ? 0 : 1))}T${ancho === 390 ? "10" : "12"}:00:00-06:00`;
    const { data: cita, error: errCita } = await SB.from("citas_estetica").insert({
      reserva_id: rr.id, perro_id: perro.id, servicio_id: servicios.find((s) => s.clave === "estetica_estetico").id, empleado_id: datos.esteticaB, inicio,
    }).select("id").single();
    if (errCita) throw new Error(`cita: ${errCita.message}`);
    creados.citas.push(cita.id);

    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto } });
    await ctx.addCookies(await cookiesDe(datos.adminB));
    const pa = await ctx.newPage();
    pa.setDefaultTimeout(60000);
    await pa.goto(`${BASE}/caja`, { waitUntil: "networkidle", timeout: 120000 });
    const sec = async (sel) => (await pa.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ");
    const w = await pa.evaluate(() => document.documentElement.scrollWidth);
    comprobar(w <= ancho + 2, `Caja sin desborde (${w}px)`);
    comprobar((await sec("[data-seccion-por-cobrar]")).includes(`${etiqueta} hoy`) || (await pa.locator(`[data-cuenta-fila="${hoyCuenta}"]`).count()) === 1, "la cuenta de hoy está en «Por cobrar»");
    comprobar((await pa.locator(`[data-seccion-por-cobrar] [data-cuenta-fila="${vieja}"]`).count()) === 1 && (await pa.locator(`[data-seccion-vencidas] [data-cuenta-fila="${vieja}"]`).count()) === 1, "la de hace 4 días está en «Días anteriores», dentro de «Por cobrar»");
    comprobar((await pa.locator(`[data-seccion-proximas] [data-cuenta-fila="${rr.id}"]`).count()) === 1 && (await pa.locator(`[data-seccion-por-cobrar] [data-cuenta-fila="${rr.id}"]`).count()) === 0, "la cita de dentro de 6 días está en «Próximas» y no en «Por cobrar»");

    // Cancelar desde la lista.
    const fila = pa.locator(`[data-cuenta-fila="${hoyCuenta}"]`);
    await fila.getByRole("button", { name: "Cancelar cuenta" }).click();
    const hoja = pa.locator(`[data-cancelar-cuenta="${hoyCuenta}"]`);
    await hoja.waitFor();
    await hoja.locator("[data-cancelar-cuenta-motivo]").waitFor();
    await hoja.getByRole("button", { name: "Cancelar la cuenta" }).click();
    await pa.waitForTimeout(500);
    comprobar(/Escoge el motivo/.test(await sec(`[data-cancelar-cuenta="${hoyCuenta}"]`)), "sin motivo, frena con el aviso junto al botón");
    await hoja.locator("[data-cancelar-cuenta-motivo]").selectOption("otro");
    await hoja.getByRole("button", { name: "Cancelar la cuenta" }).click();
    await pa.waitForTimeout(500);
    comprobar(/Otro/.test(await sec(`[data-cancelar-cuenta="${hoyCuenta}"]`)) && /escribe el motivo/i.test(await sec(`[data-cancelar-cuenta="${hoyCuenta}"]`)), "«Otro» sin texto también frena");
    await hoja.locator("[data-cancelar-cuenta-motivo]").selectOption("no_se_presento");
    await hoja.getByRole("button", { name: "Cancelar la cuenta" }).click();
    await hoja.getByText("Cuenta cancelada").waitFor({ timeout: 90000 }).catch(() => {});
    comprobar(/Cuenta cancelada/.test(await sec(`[data-cancelar-cuenta="${hoyCuenta}"]`)), "confirma «Cuenta cancelada» junto al botón");
    await pa.goto(`${BASE}/caja`, { waitUntil: "networkidle", timeout: 120000 });
    comprobar((await pa.locator(`[data-cuenta-fila="${hoyCuenta}"]`).count()) === 0, "la cuenta cancelada ya no sale en Caja");
    const { data: fCan } = await SB.from("cuentas_canceladas").select("motivo").eq("reserva_id", hoyCuenta).maybeSingle();
    comprobar(fCan?.motivo === "no_se_presento", "quedó en la base con su motivo");

    // Cancelar desde el detalle de la cuenta (con la cita ligada).
    await pa.goto(`${BASE}/caja/cobrar/${rr.id}`, { waitUntil: "networkidle", timeout: 120000 });
    await pa.getByRole("button", { name: "Cancelar cuenta" }).click();
    const hoja2 = pa.locator(`[data-cancelar-cuenta="${rr.id}"]`);
    await hoja2.locator("[data-cancelar-cuenta-motivo]").waitFor();
    comprobar((await hoja2.locator("[data-cancelar-cuenta-cita]").count()) === 1, "una cuenta con cita que no empieza ofrece cancelarla también");
    const w2 = await pa.evaluate(() => document.documentElement.scrollWidth);
    comprobar(w2 <= ancho + 2, `la cuenta con la hoja abierta no se desborda (${w2}px)`);
    await hoja2.locator("[data-cancelar-cuenta-motivo]").selectOption("no_se_presento");
    await hoja2.getByRole("button", { name: "Cancelar la cuenta" }).click();
    await hoja2.getByText("Cuenta cancelada").waitFor({ timeout: 90000 }).catch(() => {});
    await pa.reload({ waitUntil: "networkidle" });
    comprobar(/Esta cuenta está cancelada/.test(await sec("[data-cuenta-cancelada]").then(() => pa.locator("body").innerText())) && (await pa.locator("[data-cuenta-cancelada]").count()) === 1, "la cuenta muestra «Esta cuenta está cancelada» con su motivo");
    comprobar((await pa.getByRole("button", { name: "Registrar cobro" }).count()) === 0, "y ya no ofrece cobrar");
    const { data: citaFila } = await SB.from("citas_estetica").select("estado").eq("id", cita.id).single();
    comprobar(citaFila?.estado === "no_llego", "«No se presentó» dejó la cita en «No llegó»");

    // Historial del cliente.
    await pa.goto(`${BASE}/clientes/${datos.clienteSoloB}`, { waitUntil: "networkidle", timeout: 120000 });
    comprobar((await pa.locator("[data-cuentas-canceladas]").count()) === 1 && /No se presentó/.test(await sec("[data-cuentas-canceladas]")), "la ficha del cliente lista las cuentas canceladas con el motivo");

    // Sin permiso no hay botón.
    const ctx2 = await nav.newContext({ viewport: { width: ancho, height: alto } });
    await ctx2.addCookies(await cookiesDe(recSinPermiso));
    const pr = await ctx2.newPage();
    pr.setDefaultTimeout(60000);
    await pr.goto(`${BASE}/caja`, { waitUntil: "networkidle", timeout: 120000 });
    { await pr.locator(`[data-cuenta-fila="${lista2}"]`).waitFor().catch(() => {}); const nf = await pr.locator(`[data-cuenta-fila="${lista2}"]`).count(); const nb = await pr.getByRole("button", { name: "Cancelar cuenta" }).count(); comprobar(nf === 1 && nb === 0, `recepción sin el permiso ve la cuenta pero no el botón (fila ${nf}, botones ${nb})`); }
    await pr.goto(`${BASE}/caja/cobrar/${lista2}`, { waitUntil: "networkidle", timeout: 120000 });
    comprobar((await pr.getByRole("button", { name: "Cancelar cuenta" }).count()) === 0, "ni dentro de la cuenta");
    // Limpieza de lo que dejó esta vista.
    for (const id of [lista2, vieja]) await admin.rpc("cancelar_cuenta", { p_reserva_id: id, p_motivo: "error_captura", p_motivo_texto: "limpieza de la prueba", p_cancelar_cita: false });
    await ctx.close();
    await ctx2.close();
  }
} finally {
  if (creados.citas.length) await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("id", creados.citas).is("deleted_at", null);
  await nav.close();
}
console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
