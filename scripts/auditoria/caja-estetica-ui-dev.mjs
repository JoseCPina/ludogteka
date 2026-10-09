// Anular y corregir cobros, agregar efectivo, y las citas de estética (reprogramar,
// cancelar, otro perrito, tarifa de guardería) EN PANTALLA, a 390 px (celular)
// — SOLO DESARROLLO, en Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/caja-estetica-ui-dev.mjs
//
// Caja: «Anular cobro» y «Corregir monto» en la cuenta, «Corregir precio» en la
// línea, «Agregar efectivo» en el turno, anular un cobro junto desde su recibo.
// Estética: «Agregar otro perrito de este cliente» (alta corta, su propia cita y
// «Cobrar las 2 cuentas juntas»), «Reprogramar» (con el aviso por WhatsApp),
// «Cancelar cita», «No se presentó», y Administración → Tarifa de guardería.
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
const texto = async (pag, sel) => (await pag.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ");

const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recId = recepciones[0].profile_id;
const admin = await comoPersona(datos.adminB);
const { data: clienteRow } = await SB.from("clientes").select("id, nombre").eq("id", datos.clienteSoloB).single();

const nav = await abrirNavegador();
const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctx.addCookies(await cookiesDe(datos.adminB));
const pa = await ctx.newPage();
pa.on("dialog", (d) => d.accept());

const creados = { citas: [], perros: [] };
try {
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) {
    const t = await (await comoPersona(recId)).from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba ui correcciones" }).select("id").single();
    turno = t.data;
  }
  const nuevaCuenta = async (precio, concepto) => (await admin.rpc("crear_venta_mostrador", { p_cliente_id: clienteRow.id, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba ui" })).data;

  // ── 1. Anular y corregir en la cuenta ──
  console.log("1. Cuenta: anular, corregir monto y corregir precio");
  const r1 = await nuevaCuenta(400, `UI anular ${sufijo}`);
  await admin.rpc("registrar_cobro", { p_reserva_id: r1, p_notas: "prueba ui", p_metodos: [{ metodo: "efectivo", monto: 400, propina: 0 }] });
  await pa.goto(`${BASE}/caja/cobrar/${r1}`, { waitUntil: "networkidle" });
  comprobar((await pa.getByRole("button", { name: "Corregir monto" }).count()) === 1 && (await pa.getByRole("button", { name: "Anular cobro" }).count()) === 1, "el cobro trae «Corregir monto» y «Anular cobro»");
  comprobar((await pa.getByRole("button", { name: "Corregir precio" }).count()) >= 1, "la línea trae «Corregir precio»");
  await sinDesborde(pa, "cuenta cobrada");
  await pa.getByRole("button", { name: "Anular cobro" }).first().click();
  await pa.getByLabel("Motivo (obligatorio)").fill("x");
  await pa.locator("[data-correccion-cobro]").getByRole("button", { name: "Anular cobro" }).click();
  await pa.waitForTimeout(600);
  comprobar(/motivo/i.test(await texto(pa, "[data-correccion-cobro] [role=alert]")), "sin un motivo de verdad, frena con el aviso junto al botón");
  await pa.getByLabel("Motivo (obligatorio)").fill("Se cobró a la cuenta equivocada");
  await pa.locator("[data-correccion-cobro]").getByRole("button", { name: "Anular cobro" }).click();
  await pa.locator("[data-cobro-anulado='si']").waitFor({ timeout: 12000 }).catch(() => {});
  const tarjetaAnulada = await texto(pa, "[data-cobro-anulado='si']");
  comprobar(/Anulado/.test(tarjetaAnulada) && /equivocada/.test(tarjetaAnulada), `el cobro queda marcado como anulado con su motivo («${tarjetaAnulada.slice(0, 120)}»)`);
  comprobar(/Saldo: \$400\.00/.test(await texto(pa, "body")), "la cuenta vuelve a deber $400");
  await sinDesborde(pa, "cuenta con el cobro anulado");

  const r2 = await nuevaCuenta(400, `UI monto ${sufijo}`);
  await admin.rpc("registrar_cobro", { p_reserva_id: r2, p_notas: "prueba ui", p_metodos: [{ metodo: "transferencia", monto: 300, propina: 0 }] });
  await pa.goto(`${BASE}/caja/cobrar/${r2}`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Corregir monto" }).click();
  await pa.getByLabel(/Monto correcto/).fill("400");
  await pa.getByLabel("Motivo (obligatorio)").fill("Eran $400 reales");
  await pa.getByRole("button", { name: "Guardar corrección" }).click();
  await pa.locator("[data-correcciones-historial]").waitFor({ timeout: 12000 }).catch(() => {});
  const hist = await texto(pa, "[data-correcciones-historial]");
  comprobar(/Monto corregido/.test(hist) && /\$300\.00 a \$400\.00/.test(hist), `el historial muestra el monto anterior y el nuevo («${hist.slice(0, 120)}»)`);
  comprobar(/Saldo: \$0\.00/.test(await texto(pa, "body")) && /Descuento: \$0\.00/.test(await texto(pa, "body")), "la cuenta queda pagada sin descuento");

  const r3 = await nuevaCuenta(400, `UI precio ${sufijo}`);
  await admin.rpc("registrar_cobro", { p_reserva_id: r3, p_notas: "prueba ui", p_metodos: [{ metodo: "efectivo", monto: 300, propina: 0 }] });
  await pa.goto(`${BASE}/caja/cobrar/${r3}`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Corregir precio" }).first().click();
  await pa.getByLabel("Precio correcto de la línea").fill("300");
  await pa.getByLabel("Motivo (obligatorio)").fill("El servicio costaba $300");
  await pa.getByRole("button", { name: "Guardar precio" }).click();
  await pa.waitForTimeout(1500);
  comprobar(/no es un descuento|Precio corregido/i.test(await texto(pa, "[data-corregir-precio]")), "«Corregir precio» confirma que no es un descuento");
  await pa.goto(`${BASE}/caja/cobrar/${r3}`, { waitUntil: "networkidle" });
  const cuerpo = await texto(pa, "body");
  comprobar(/Corrección de precio/.test(cuerpo) && /Saldo: \$0\.00/.test(cuerpo) && /Descuento: \$0\.00/.test(cuerpo), "la cuenta muestra la corrección como un renglón, el saldo en cero y el descuento en cero");

  // ── 2. Turno: agregar efectivo ──
  console.log("2. Turno: agregar efectivo");
  await pa.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Agregar efectivo", exact: true }).click();
  await pa.getByLabel("Monto").first().fill("80");
  await pa.locator("[data-form-efectivo]").getByLabel("Nota (opcional)").fill("Cambio de la caja de al lado");
  await sinDesborde(pa, "formulario de efectivo agregado");
  await pa.getByRole("button", { name: "Confirmar efectivo agregado" }).click();
  await pa.locator("[data-efectivo-agregado] [data-ingreso='vivo']").first().waitFor({ timeout: 12000 }).catch(() => {});
  const ing = await texto(pa, "[data-efectivo-agregado]");
  comprobar(/Cambio/.test(ing) && /\$80\.00/.test(ing), `aparece en «Efectivo agregado a este turno» («${ing.slice(0, 100)}»)`);
  const movs = await texto(pa, "table");
  comprobar(/Efectivo agregado/.test(movs), "y en Movimientos del turno");
  await pa.getByRole("button", { name: "Cancelar este efectivo agregado…" }).first().click();
  await pa.getByLabel("¿Por qué se cancela?").last().fill("Se registró de más");
  await pa.getByRole("button", { name: "Cancelar efectivo agregado" }).click();
  await pa.locator("[data-ingreso='cancelado']").first().waitFor({ timeout: 12000 }).catch(() => {});
  comprobar(/Cancelado/.test(await texto(pa, "[data-efectivo-agregado]")), "se cancela con motivo y queda tachado");
  await sinDesborde(pa, "turno con efectivo agregado");

  // ── 3. Recibo de un cobro junto ──
  console.log("3. Cobro junto: anular desde el recibo");
  const gA = await nuevaCuenta(100, `UI junto A ${sufijo}`);
  const gB = await nuevaCuenta(150, `UI junto B ${sufijo}`);
  const { data: grupo } = await admin.rpc("registrar_cobro_grupo", { p_partes: [{ reserva_id: gA, monto: 100 }, { reserva_id: gB, monto: 150 }], p_notas: "prueba ui", p_metodos: [{ metodo: "efectivo", monto: 250, propina: 0 }] });
  await pa.goto(`${BASE}/caja/recibo-junto/${grupo.grupo_id}`, { waitUntil: "networkidle" });
  comprobar((await pa.getByRole("button", { name: "Anular el cobro junto completo" }).count()) === 1, "el recibo ofrece «Anular el cobro junto completo»");
  await pa.getByRole("button", { name: /Anular solo:/ }).first().click();
  await pa.getByLabel("Motivo (obligatorio)").fill("Una cuenta no era de esta clienta");
  await pa.locator("[data-correcciones-recibo]").getByRole("button", { name: "Anular", exact: true }).click();
  await pa.waitForTimeout(1800);
  await pa.goto(`${BASE}/caja/recibo-junto/${grupo.grupo_id}`, { waitUntil: "networkidle" });
  const recibo = await texto(pa, "[data-recibo-junto]");
  console.log("   RECIBO:", recibo.slice(0,600)); comprobar(/Una parte de este cobro junto se anuló/.test(recibo) && /Anulado — Una cuenta no era/i.test(recibo) && /Correcciones/i.test(recibo), "el recibo marca la parte anulada y lista la corrección");
  await pa.getByRole("button", { name: "Anular el cobro junto completo" }).click();
  await pa.getByLabel("Motivo (obligatorio)").fill("Se anula el resto");
  await pa.locator("[data-correcciones-recibo]").getByRole("button", { name: "Anular", exact: true }).click();
  await pa.waitForTimeout(1800);
  await pa.goto(`${BASE}/caja/recibo-junto/${grupo.grupo_id}`, { waitUntil: "networkidle" });
  comprobar(/Cobro junto ANULADO/.test(await texto(pa, "[data-recibo-junto]")), "con todo anulado, el recibo dice «Cobro junto ANULADO»");
  await sinDesborde(pa, "recibo anulado");

  // ── 4. Estética: otro perrito del mismo dueño ──
  console.log("4. Estética: agendar y agregar otro perrito");
  const { data: razas } = await A.from("razas").select("id, nombre");
  const { data: tallas } = await A.from("tamanos_categoria").select("id, clave, etiqueta");
  const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave, etiqueta");
  const existente = (await SB.from("perros").insert({
    cliente_id: clienteRow.id, nombre: `UI primero ${sufijo}`, raza: "Poodle", raza_id: razas.find((r) => r.nombre === "Poodle").id,
    tamano_id: tallas.find((t) => t.clave === "chico").id, pelaje_id: pelajes.find((p) => p.clave === "medio").id,
  }).select("id").single()).data;
  creados.perros.push(existente.id);
  const diaLejano = new Date(Date.now() + (900 + Math.floor(Math.random() * 300)) * 86_400_000).toISOString().slice(0, 10);
  await pa.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
  await pa.getByPlaceholder(/ej\. Motita/).fill(clienteRow.nombre.slice(0, 6));
  await pa.getByText(clienteRow.nombre).first().click();
  await pa.getByLabel("Perro", { exact: true }).selectOption(existente.id);
  await pa.getByLabel("Fecha y hora").fill(`${diaLejano}T10:00`);
  await pa.locator("[data-aviso-precio='ok']").waitFor({ timeout: 12000 });
  await sinDesborde(pa, "agendar con el primer perrito");
  await pa.getByRole("button", { name: "Agendar cita", exact: true }).click();
  await pa.locator("[data-citas-agendadas]").waitFor({ timeout: 15000 });
  comprobar(/Cita agendada/.test(await texto(pa, "[data-citas-agendadas]")), "la primera cita se agenda y se queda en la pantalla");
  await pa.locator("[data-agregar-otro-perrito]").click();
  await pa.locator("[data-agregar-perrito]").click();
  comprobar(!/veterinario|emergencia|contrato|vacuna/i.test(await texto(pa, "[data-nuevo-perrito]")), "el alta del otro perrito NO pide nada de hotel ni guardería (veterinario, emergencia, contrato, vacunas)");
  await pa.getByLabel("Nombre del perrito").fill(`UI segundo ${sufijo}`);
  await pa.locator("[data-nuevo-perrito]").getByRole("combobox").first().fill("Poodle");
  await pa.getByRole("option", { name: /Poodle/ }).first().click();
  await pa.getByLabel("Tamaño").selectOption({ label: "Chico" }).catch(() => pa.getByLabel("Tamaño").selectOption(tallas.find((t) => t.clave === "chico").id));
  await pa.getByLabel("Pelaje").selectOption(pelajes.find((p) => p.clave === "medio").id);
  await sinDesborde(pa, "alta corta del otro perrito");
  await pa.getByRole("button", { name: "Guardar y agendarle su cita" }).click();
  await pa.locator("[data-aviso-precio='ok']").waitFor({ timeout: 15000 });
  const horaSiguiente = await pa.getByLabel("Fecha y hora").inputValue();
  comprobar(horaSiguiente.startsWith(diaLejano) && horaSiguiente > `${diaLejano}T10:00`, `la hora propuesta para el segundo perrito va después del primero (${horaSiguiente})`);
  await pa.getByRole("button", { name: "Agendar cita", exact: true }).click();
  await pa.locator("[data-cobrar-juntas]").waitFor({ timeout: 15000 });
  const panel = await texto(pa, "[data-citas-agendadas]");
  comprobar(/2 citas agendadas/.test(panel) && /su propia cuenta/.test(panel) && /Cobrar las 2 cuentas juntas/.test(panel), `dos citas, cada una con su cuenta, y el atajo para cobrarlas juntas («${panel.slice(0, 140)}»)`);
  const enlace = await pa.locator("[data-cobrar-juntas]").getAttribute("href");
  const { data: citasNuevas } = await SB.from("citas_estetica").select("id, reserva_id, perro_id").in("perro_id", [existente.id]).is("deleted_at", null);
  for (const c of citasNuevas ?? []) creados.citas.push(c.id);
  const { data: perroNuevo } = await SB.from("perros").select("id, tamano_id, pelaje_id").eq("cliente_id", clienteRow.id).like("nombre", `UI segundo ${sufijo}`).single();
  creados.perros.push(perroNuevo.id);
  const { data: citaNueva } = await SB.from("citas_estetica").select("id, reserva_id").eq("perro_id", perroNuevo.id).is("deleted_at", null).single();
  creados.citas.push(citaNueva.id);
  comprobar(perroNuevo.tamano_id && perroNuevo.pelaje_id, "el perrito nuevo quedó con tamaño y pelaje");
  comprobar(enlace?.includes("/caja/cobrar-junto?cuentas=") && enlace.includes(citaNueva.reserva_id), "el enlace de cobro junto lleva las dos cuentas");
  await pa.goto(`${BASE}${enlace}`, { waitUntil: "networkidle" });
  comprobar(/Total junto|Cobrar varias cuentas juntas/.test(await texto(pa, "body")) && !/Faltan cuentas/.test(await texto(pa, "body")), "Caja agrupa las cuentas de los dos perritos del mismo dueño");
  await sinDesborde(pa, "cobrar varias cuentas juntas");

  // ── 5. Estética: reprogramar, cancelar, no se presentó ──
  console.log("5. Estética: reprogramar, cancelar y «no se presentó»");
  const citaA = citaNueva.id;
  await pa.goto(`${BASE}/estetica?vista=semana&fecha=${diaLejano}`, { waitUntil: "networkidle" });
  console.log("   AGENDA:", (await texto(pa,"main")).slice(0,500), pa.url()); comprobar((await pa.locator("[data-reprogramar-agenda]").count()) >= 1, "la agenda trae el atajo «Reprogramar» en cada cita");
  await pa.goto(`${BASE}/estetica/${citaA}?reprogramar=1`, { waitUntil: "networkidle" });
  await pa.locator("[data-reprogramar]").waitFor({ timeout: 8000 });
  const nuevoDia = new Date(new Date(`${diaLejano}T12:00:00Z`).getTime() + 2 * 86_400_000).toISOString().slice(0, 10);
  await pa.getByLabel("Nueva fecha y hora").fill(`${nuevoDia}T16:00`);
  await pa.getByLabel("Motivo (opcional)").fill("La clienta pidió otro día");
  await sinDesborde(pa, "reprogramar");
  await pa.getByRole("button", { name: "Guardar la nueva hora" }).click();
  await pa.locator("[data-avisar-cliente]").waitFor({ timeout: 12000 }).catch(() => {});
  const wa = await pa.locator("[data-avisar-cliente]").getAttribute("href").catch(() => null);
  comprobar(wa && wa.startsWith("https://wa.me/52") && /movimos/.test(decodeURIComponent(wa)), "después de reprogramar, deja listo el WhatsApp al cliente con el mensaje");
  await pa.goto(`${BASE}/estetica/${citaA}`, { waitUntil: "networkidle" });
  comprobar(/Historial de cambios/i.test(await texto(pa, "[data-historial-agenda]")) && /Reprogramada/i.test(await texto(pa, "[data-historial-agenda]")), "el detalle muestra el historial de cambios");
  await pa.getByRole("button", { name: "Cancelar cita" }).click();
  await pa.getByLabel("Motivo de la cancelación").fill("La clienta se enfermó");
  await pa.getByRole("button", { name: "Sí, cancelar la cita" }).click();
  await pa.waitForTimeout(1500);
  comprobar(/cancelada/i.test(await texto(pa, "body")), "se cancela con motivo");
  const citaB = (await SB.from("citas_estetica").select("id").eq("perro_id", existente.id).is("deleted_at", null).order("created_at").limit(1).single()).data.id;
  await pa.goto(`${BASE}/estetica/${citaB}`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "No se presentó" }).click();
  comprobar(/distinto de cancelar/.test(await texto(pa, "body")), "«No se presentó» es otro paso, y lo explica");
  await pa.getByRole("button", { name: "Sí, no se presentó" }).click();
  await pa.waitForTimeout(1500);
  comprobar(/no llegó/i.test(await texto(pa, "body")), "queda como «no llegó»");
  comprobar((await pa.getByRole("button", { name: "Eliminar cita" }).count()) === 1, "admin ve «Eliminar cita»");

  // ── 6. Tarifa de guardería (Administración) ──
  console.log("6. Administración → Tarifa de guardería");
  await pa.goto(`${BASE}/admin/tarifa-guarderia`, { waitUntil: "networkidle" });
  comprobar(/Tarifa para clientes de guardería/.test(await texto(pa, "h1")), "la pantalla existe en Administración");
  await sinDesborde(pa, "Tarifa de guardería");
} finally {
  if (creados.citas.length) await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("id", creados.citas).is("deleted_at", null);
  await nav.close();
}

console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
