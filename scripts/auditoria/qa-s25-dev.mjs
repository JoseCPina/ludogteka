// QA S25 (22 de octubre de 2026) — SOLO DESARROLLO, Huellitas, con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/qa-s25-dev.mjs
//
//   1. N114: las recetas emitidas (y las anuladas, como anuladas) salen en la línea de tiempo del expediente con
//      número, médico y medicamentos, y con enlace a la receta; vienen de la tabla (también las que ya existían).
//   2. N115: en una reserva de hotel cancelada, el desglose de abajo dice Base $0.00 (no se cobra; era …) y Total
//      sin la base, más lo cobrado y lo devuelto de la cuenta.
//   3. Portal sin hotel, guardería ni Veterinaria: la ficha del perro no enseña veterinario, autorización médica,
//      tope de gasto ni alimentación, y guardar NO borra lo que ya estaba. Con los módulos, sí los enseña.
//   4. Portal a 393 px: los campos ocupan el ancho, no hay desplazamiento horizontal y enfocar un campo no lo deja
//      bajo la barra fija. En Caja, «Cancelar cuenta» es texto, no un botón grande.
//   5. El motivo de cancelar se guarda completo aunque el estado de React no haya recibido la última palabra
//      (se escribe en el campo sin evento, como un teclado que todavía compone) y se confirma con Enter o el botón.
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
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const ir = (p, r) => p.goto(`${BASE}${r}`, { waitUntil: "networkidle", timeout: 120000 });
// Escribe en el campo SIN evento de input (React no se entera), como un teclado que todavía compone la palabra.
const escribirSinEvento = (loc, texto) => loc.evaluate((el, t) => { el.value = t; }, texto);

const admin = await comoPersona(datos.adminB);
const hoy = (await admin.rpc("fecha_negocio")).data;
const suma = (base, dias) => new Date(new Date(`${base}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const lunesLejano = () => { let d = suma(hoy, 200 + Math.floor(Math.random() * 300)); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = suma(d, 1); return d; };
const { data: hotel } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").is("deleted_at", null).limit(1).single();
const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
const mkPerro = async (n) => {
  const { data, error } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ s25 ${n} ${sufijo}`, tamano_id: talla.id }).select("id").single();
  if (error) throw new Error(`perro: ${error.message}`);
  return data.id;
};
const mkHotel = async (perro) => {
  const D = lunesLejano();
  const rr = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
  const e = await admin.from("estancias").insert({
    reserva_id: rr.data.id, perro_id: perro, servicio_id: hotel.id, fecha_entrada: D, fecha_salida: suma(D, 2), estado: "reservada",
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba S25", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba S25",
  }).select("id").single();
  if (e.error) throw new Error(`estancia: ${e.error.message}`);
  return { reserva: rr.data.id, estancia: e.data.id };
};

const { data: modulosAntes } = await SB.from("negocio_modulos").select("modulo, activo").eq("negocio_id", B).in("modulo", ["guarderia", "hotel", "veterinaria"]);
const restaurarModulos = async () => {
  for (const m of modulosAntes ?? []) await SB.from("negocio_modulos").update({ activo: m.activo }).eq("negocio_id", B).eq("modulo", m.modulo);
};

const nav = await abrirNavegador();
try {
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(await cookiesDe(datos.adminB));
  const pa = await ctx.newPage();

  // ─────────────────────────────────────────────────────────────── 1
  console.log("── 1. N114: recetas en la línea de tiempo");
  const { data: conRecetas } = await SB.from("vet_recetas").select("perro_id").eq("negocio_id", B).is("deleted_at", null).limit(1).single();
  const perroVet = conRecetas.perro_id;
  const { data: recetas } = await SB.from("vet_recetas").select("id, numero, estado, snapshot").eq("negocio_id", B).eq("perro_id", perroVet).is("deleted_at", null);
  const linea = (await admin.rpc("vet_linea_tiempo", { p_perro: perroVet })).data ?? [];
  const deRecetas = linea.filter((e) => e.tipo === "receta");
  comprobar(deRecetas.length === recetas.length, `las ${recetas.length} recetas de la mascota salen en la línea de tiempo (${deRecetas.length})`);
  const una = recetas.find((r) => r.estado === "emitida");
  const ev = deRecetas.find((e) => e.ref_id === una?.id);
  comprobar(ev?.titulo === `Receta N.º ${una?.numero}` && ev?.medico === una?.snapshot?.medico?.nombre && ev?.detalle.length > 0, `con número, médico y medicamentos (${ev?.titulo} · ${ev?.medico} · ${ev?.detalle})`);
  const anulada = recetas.find((r) => r.estado === "anulada");
  if (anulada) comprobar(deRecetas.find((e) => e.ref_id === anulada.id)?.estado === "anulada", "una receta anulada sale como anulada");
  await ir(pa, `/veterinaria/expediente/${perroVet}`);
  const enlace = pa.locator(`a[href="/veterinaria/recetas/${una.id}"]`).first();
  comprobar(await enlace.isVisible(), "en el expediente la receta enlaza a su página");
  comprobar((await enlace.textContent())?.includes(`Receta N.º ${una.numero}`), "con su número");

  // ─────────────────────────────────────────────────────────────── 2
  console.log("── 2. N115: desglose de una reserva de hotel cancelada");
  const turno = (await SB.from("turnos_caja").select("id").eq("negocio_id", B).eq("estado", "abierto").maybeSingle()).data;
  if (!turno) await admin.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba S25" });
  await admin.rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  const h1 = await mkHotel(await mkPerro("hotel"));
  const { data: est } = await SB.from("estancias").select("precio_unitario").eq("id", h1.estancia).single();
  const base = Number(est.precio_unitario) * 2;
  const cob = await admin.rpc("registrar_cobro", { p_reserva_id: h1.reserva, p_notas: "anticipo S25", p_metodos: [{ metodo: "efectivo", monto: 100, propina: 0 }] });
  if (cob.error) throw new Error(`cobro: ${cob.error.message}`);
  const cobroId = (await SB.from("cobros").select("id").eq("reserva_id", h1.reserva).single()).data.id;
  await admin.from("estancias").update({ estado: "cancelada" }).eq("id", h1.estancia);
  await admin.rpc("registrar_devolucion", { p_cobro_id: cobroId, p_motivo: "cancelada S25", p_metodos: [{ metodo: "efectivo", monto: 100 }] });
  await ir(pa, `/reservas/${h1.reserva}`);
  const des = pa.locator('[data-desglose-estancia="cancelada"]');
  const texto = (await des.innerText()).replace(/\s+/g, " ");
  const era = `$${base.toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  comprobar(/Base: \$0\.00/.test(texto) && texto.includes(`no se cobra; era ${era}`), `Base $0.00 (no se cobra; era ${era}) — «${texto}»`);
  comprobar(/Total: \$0\.00/.test(texto), "Total $0.00");
  comprobar(/Cobrado en la cuenta: \$100\.00/.test(texto) && /Devuelto: \$100\.00/.test(texto), "con lo cobrado y lo devuelto");
  comprobar(!/Total: \$\d[\d,]*\.\d\d/.test(texto.replace("Total: $0.00", "")), "ya no dice el total con la base");

  // ─────────────────────────────────────────────────────────────── 5 (reserva)
  console.log("── 5. El motivo se guarda completo (sin evento de input, con Enter y con el botón)");
  const motivoLargo = `PRUEBA QA S25 motivo completo ${sufijo}`;
  const h2 = await mkHotel(await mkPerro("motivo"));
  await ir(pa, `/reservas/${h2.reserva}`);
  await pa.getByRole("button", { name: "Cancelar", exact: true }).click();
  const t1 = pa.locator('textarea[name="motivo_cancelacion"]');
  await t1.pressSequentially("PRUEBA QA");
  await escribirSinEvento(t1, motivoLargo);
  await t1.press("Enter");
  await pa.waitForFunction(async () => true);
  for (let i = 0; i < 30; i++) { const { data } = await SB.from("estancias").select("estado").eq("id", h2.estancia).single(); if (data.estado === "cancelada") break; await new Promise((r) => setTimeout(r, 1000)); }
  const { data: e2 } = await SB.from("estancias").select("estado, motivo_cancelacion").eq("id", h2.estancia).single();
  comprobar(e2.estado === "cancelada" && e2.motivo_cancelacion === motivoLargo, `estancia cancelada con Enter, motivo completo («${e2.motivo_cancelacion}»)`);

  const h3 = await mkHotel(await mkPerro("toda"));
  await ir(pa, `/reservas/${h3.reserva}`);
  await pa.getByRole("button", { name: /Cancelar toda la reserva/ }).click();
  const t2 = pa.locator('textarea[name="motivo_cancelacion"]').first();
  await t2.pressSequentially("PRUEBA QA");
  await escribirSinEvento(t2, motivoLargo);
  await pa.getByRole("button", { name: /Sí, cancelar todo/ }).click();
  for (let i = 0; i < 30; i++) { const { data } = await SB.from("estancias").select("estado").eq("id", h3.estancia).single(); if (data.estado === "cancelada") break; await new Promise((r) => setTimeout(r, 1000)); }
  const { data: e3 } = await SB.from("estancias").select("motivo_cancelacion").eq("id", h3.estancia).single();
  comprobar(e3.motivo_cancelacion === motivoLargo, `«Cancelar toda la reserva» con el botón guarda el motivo completo («${e3.motivo_cancelacion}»)`);

  // ─────────────────────────────────────────────────────────────── 3 y 4
  console.log("── 3. Portal: campos de cuidado según módulos");
  const valores = { veterinario_nombre: `Dr. S25 ${sufijo}`, autorizacion_medica_notas: `Autorizo S25 ${sufijo}`, tope_gasto_autorizado: 1234, alimentacion_notas: `Croquetas S25 ${sufijo}` };
  await SB.from("perros").update(valores).eq("id", datos.perroSoloB);
  const ctxD = await nav.newContext({ viewport: { width: 393, height: 852 } });
  await ctxD.addCookies(await cookiesDe(datos.cuentaSoloB));
  const pd = await ctxD.newPage();
  await ir(pd, `/portal/perros/${datos.perroSoloB}`);
  comprobar(await pd.getByLabel("Veterinario de cabecera").isVisible(), "con hotel/guardería/Veterinaria se ve «Veterinario de cabecera»");

  console.log("── 4. Portal a 393 px");
  const medidas = await pd.evaluate(() => {
    const form = document.querySelector('input[name="contacto_emergencia_nombre"]')?.closest("form");
    const anchoForm = form?.getBoundingClientRect().width ?? 0;
    const campos = [...(form?.querySelectorAll("input:not([type=hidden]), textarea") ?? [])].map((c) => c.getBoundingClientRect().width);
    return { anchoForm, minimo: Math.min(...campos), desborda: document.documentElement.scrollWidth > window.innerWidth + 1 };
  });
  comprobar(medidas.minimo >= medidas.anchoForm - 2, `cada campo ocupa el ancho del formulario (${Math.round(medidas.minimo)} de ${Math.round(medidas.anchoForm)} px)`);
  comprobar(!medidas.desborda, "sin desplazamiento horizontal");
  let tapados = 0;
  for (const nombre of ["contacto_emergencia_nombre", "veterinario_telefono", "tope_gasto_autorizado", "alimentacion_notas"]) {
    await pd.evaluate(() => window.scrollTo(0, 0));
    const c = pd.locator(`[name="${nombre}"]`);
    await c.focus();
    await pd.waitForTimeout(250);
    const r = await pd.evaluate((n) => { const el = document.querySelector(`[name="${n}"]`); const barra = document.querySelector("[data-portal-shell] > header, [data-portal-shell] .sticky"); return { top: el.getBoundingClientRect().top, barra: barra ? barra.getBoundingClientRect().bottom : 0, x: window.scrollX }; }, nombre);
    if (r.top < r.barra || r.x !== 0) tapados++;
  }
  comprobar(tapados === 0, "al enfocar cada campo queda a la vista, debajo de la barra fija y sin moverse de lado");

  console.log("── 3b. Sin hotel, guardería ni Veterinaria");
  await SB.from("negocio_modulos").update({ activo: false }).eq("negocio_id", B).in("modulo", ["guarderia", "hotel", "veterinaria"]);
  await ir(pd, `/portal/perros/${datos.perroSoloB}`);
  for (const etiqueta of ["Veterinario de cabecera", "Autorización médica", "Tope de gasto autorizado (opcional)", "Notas de alimentación"]) {
    comprobar((await pd.getByLabel(etiqueta, { exact: true }).count()) === 0, `no se ve «${etiqueta}»`);
  }
  comprobar(await pd.getByLabel("Contacto de emergencia").isVisible(), "el contacto de emergencia sí");
  await pd.getByLabel("Contacto de emergencia").fill(`Contacto S25 ${sufijo}`);
  await pd.getByRole("button", { name: "Guardar cambios" }).last().click();
  await pd.getByText("Cambios guardados").first().waitFor({ timeout: 30000 }).catch(() => {});
  const { data: tras } = await SB.from("perros").select("contacto_emergencia_nombre, veterinario_nombre, autorizacion_medica_notas, tope_gasto_autorizado, alimentacion_notas").eq("id", datos.perroSoloB).single();
  comprobar(tras.contacto_emergencia_nombre === `Contacto S25 ${sufijo}`, "guardó el contacto");
  comprobar(tras.veterinario_nombre === valores.veterinario_nombre && tras.autorizacion_medica_notas === valores.autorizacion_medica_notas && Number(tras.tope_gasto_autorizado) === 1234 && tras.alimentacion_notas === valores.alimentacion_notas, "y conservó lo que no se mostró");
  await restaurarModulos();

  console.log("── 4b. Caja: «Cancelar cuenta» es texto");
  const ctxC = await nav.newContext({ viewport: { width: 393, height: 852 } });
  await ctxC.addCookies(await cookiesDe(datos.adminB));
  const pc = await ctxC.newPage();
  const venta = await admin.rpc("crear_venta_mostrador", { p_cliente_id: datos.clienteSoloB, p_lineas: [{ concepto: `Prueba S25 ${sufijo}`, precio: 50, cantidad: 1 }], p_notas: "S25" });
  await ir(pc, `/caja/cobrar/${venta.data}`);
  const boton = pc.locator(`[data-cancelar-cuenta-abrir="${venta.data}"]`).first();
  const estilo = await boton.evaluate((el) => { const c = getComputedStyle(el); return { fondo: c.backgroundColor, borde: c.borderTopWidth, alto: el.getBoundingClientRect().height }; });
  comprobar(/rgba\(0, 0, 0, 0\)|transparent/.test(estilo.fondo) && estilo.borde === "0px" && estilo.alto < 48, `sin fondo ni borde, ${Math.round(estilo.alto)} px de alto`);

  console.log("── 5b. Cancelar cuenta con el motivo escrito");
  await boton.click();
  const t3 = pc.locator("[data-cancelar-cuenta-texto]");
  await t3.waitFor();
  await t3.pressSequentially("PRUEBA QA");
  await escribirSinEvento(t3, motivoLargo);
  await t3.press("Enter");
  let fila = null;
  for (let i = 0; i < 30 && !fila; i++) { fila = (await SB.from("cuentas_canceladas").select("motivo, motivo_texto").eq("reserva_id", venta.data).maybeSingle()).data; if (!fila) await new Promise((r) => setTimeout(r, 1000)); }
  comprobar(fila?.motivo_texto === motivoLargo, `la cuenta se canceló con Enter y el motivo completo («${fila?.motivo_texto}»)`);
} finally {
  await restaurarModulos().catch(() => {});
  await nav.close();
}

console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
