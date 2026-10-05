// Corregir el servicio de una cita en pantalla, a 390 px (celular) — SOLO
// DESARROLLO, en Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/correccion-servicio-ui-dev.mjs
//
// 1. Recepción SIN el permiso no ve «Corregir servicio»; con él, sí.
// 2. Cita abierta: escoger el servicio calcula el precio (antes → ahora y
//    diferencia), el motivo es obligatorio, queda en «Historial de servicio».
// 3. Cita terminada y cobrada, más cara: el resumen dice «cobro adicional»;
//    después sale en «Necesita atención» y en Caja → Ajustes por corrección.
// 4. Cobro en la terminal esperando: el resumen avisa que se cancela y, al
//    confirmar, la orden queda cancelada y el servicio corregido.
// 5. Una cita vieja con el servicio dado de baja se abre mostrando el
//    servicio con el que se registró, sin «no existe».
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

const { data: recId } = await A.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recSinPermiso = recepciones.map((r) => r.profile_id).find((id) => id !== datos.recepcionB) ?? recId;
const admin = await comoPersona(datos.adminB);
const recep = await comoPersona(recSinPermiso);

const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const { data: razas } = await A.from("razas").select("id, nombre");
const { data: servicios } = await SB.from("servicios").select("id, clave, nombre").eq("categoria", "estetica").is("deleted_at", null);
const srv = (c) => servicios.find((s) => s.clave === `estetica_${c}`);
const { data: hoyB } = await admin.rpc("fecha_negocio");
const sumar = (f, n) => { const [y, m, d] = f.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const creados = { citas: [], reservas: [], perros: [], ordenes: [] };
let dia = 3000 + Math.floor(Math.random() * 20000);

const mkPerro = async (nombre) => {
  const { data, error } = await SB.from("perros").insert({
    cliente_id: datos.clienteSoloB, nombre: `ZZ corrui ${nombre} ${sufijo}`, raza: "Poodle", raza_id: razas.find((r) => r.nombre === "Poodle").id,
    tamano_id: tallas.find((t) => t.clave === "chico").id, pelaje_id: pelajes.find((p) => p.clave === "medio").id,
  }).select("id, nombre").single();
  if (error) throw new Error(`perro: ${error.message}`);
  creados.perros.push(data.id);
  return data;
};
const mkCita = async (perro, servicio, { estado = null, fecha = null } = {}) => {
  const rr = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
  creados.reservas.push(rr.data.id);
  for (let i = 0; i < 8; i++) {
    const hora = `${String(10 + Math.floor(Math.random() * 12)).padStart(2, "0")}:${String(Math.floor(Math.random() * 6) * 10).padStart(2, "0")}:00Z`;
    const r = await admin.from("citas_estetica").insert({ reserva_id: rr.data.id, perro_id: perro.id, servicio_id: servicio.id, empleado_id: datos.esteticaB, inicio: `${fecha ?? sumar(hoyB, dia++)}T${hora}`, ...(estado ? { estado } : {}) }).select("id, reserva_id, precio").single();
    if (!r.error) { creados.citas.push(r.data.id); return r.data; }
    if (!/traslape/.test(r.error.message)) throw new Error(`cita: ${r.error.message}`);
  }
  throw new Error("cita: sin hora libre");
};

const nav = await abrirNavegador();
const ctxAdmin = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxAdmin.addCookies(await cookiesDe(datos.adminB));
const pa = await ctxAdmin.newPage();
const ctxRec = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxRec.addCookies(await cookiesDe(recSinPermiso));
const pr = await ctxRec.newPage();

try {
  await admin.rpc("revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_servicio" });

  // ── 1. Permiso ──
  console.log("1. Quién ve «Corregir servicio»");
  const perro1 = await mkPerro("permiso");
  const c1 = await mkCita(perro1, srv("estetico"));
  await pr.goto(`${BASE}/estetica/${c1.id}`, { waitUntil: "networkidle" });
  comprobar((await pr.getByRole("button", { name: "Corregir servicio" }).count()) === 0, "recepción SIN el permiso no ve el botón «Corregir servicio»");
  await admin.rpc("otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_servicio" });
  await pr.goto(`${BASE}/estetica/${c1.id}`, { waitUntil: "networkidle" });
  comprobar((await pr.getByRole("button", { name: "Corregir servicio" }).count()) === 1, "con el permiso, sí lo ve");
  await sinDesborde(pr, "detalle de la cita con el botón");

  // ── 2. Cita abierta ──
  console.log("2. Cita abierta");
  await pr.getByRole("button", { name: "Corregir servicio" }).click();
  await sinDesborde(pr, "formulario abierto");
  await pr.getByLabel("Servicio correcto").selectOption(srv("rapado").id);
  await pr.locator("[data-correccion-resumen]").waitFor({ timeout: 10000 });
  const resumen = await pr.locator("[data-correccion-resumen]").innerText();
  comprobar(/\$390\.00\s*→\s*\$320\.00/.test(resumen) && /−\$70\.00/.test(resumen), `el resumen dice $390.00 → $320.00 (−$70.00): «${resumen.replace(/\n/g, " | ").slice(0, 140)}»`);
  await sinDesborde(pr, "formulario con el resumen");
  await pr.getByRole("button", { name: "Confirmar corrección" }).click();
  await pr.waitForTimeout(800);
  comprobar(/Escribe el motivo/.test(await pr.locator("body").innerText()) && (await SB.from("citas_estetica").select("servicio_id").eq("id", c1.id).single()).data.servicio_id === srv("estetico").id, "sin motivo, la pantalla frena la corrección");
  await pr.getByLabel("Motivo de la corrección (obligatorio)").fill("Era rapado, no baño completo");
  await pr.getByRole("button", { name: "Confirmar corrección" }).click();
  await pr.locator("[data-correccion-servicio]").waitFor({ timeout: 12000 }).catch(() => {});
  const ok = await pr.locator("[data-correccion-servicio]").innerText().catch(() => "");
  comprobar(/Servicio corregido/.test(ok) && /\$390\.00/.test(ok) && /\$320\.00/.test(ok), `confirma «Servicio corregido» con el antes y el ahora («${ok.replace(/\n/g, " ").slice(0, 120)}»)`);
  await pr.goto(`${BASE}/estetica/${c1.id}`, { waitUntil: "networkidle" });
  const detalle = await pr.locator("body").innerText();
  comprobar(/historial de servicio/i.test(detalle) && /Era rapado, no baño completo/.test(detalle) && /\$390\.00 → \$320\.00/.test(detalle), `el detalle muestra «Historial de servicio» con el motivo y los precios («${detalle.slice(-700).replace(/\n/g, " | ")}»)`);
  await sinDesborde(pr, "detalle con el historial");

  // ── 3. Terminada y cobrada, más cara ──
  console.log("3. Terminada y cobrada: cobro adicional");
  const perro3 = await mkPerro("mas");
  const c3 = await mkCita(perro3, srv("expres"), { estado: "en_curso" });
  const fin = await admin.rpc("finalizar_cita_con_consumo", { p_cita_id: c3.id, p_recogido_por_nombre: "Prueba", p_recogido_por_telefono: "4440000000", p_recogido_por_es_dueno: true, p_ajustes: [] });
  if (fin.error) throw new Error(`terminar: ${fin.error.message}`);
  const cob = await (await comoPersona(datos.recepcionB)).rpc("registrar_cobro", { p_reserva_id: c3.reserva_id, p_notas: "prueba corrui", p_metodos: [{ metodo: "efectivo", monto: 190 }] });
  if (cob.error) throw new Error(`cobrar: ${cob.error.message}`);
  await pa.goto(`${BASE}/estetica/${c3.id}`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Corregir servicio" }).click();
  await pa.getByLabel("Servicio correcto").selectOption(srv("estetico").id);
  await pa.locator("[data-correccion-resumen]").waitFor({ timeout: 10000 });
  const resumen3 = await pa.locator("[data-correccion-resumen]").innerText();
  comprobar(/cobro adicional/i.test(resumen3) && /\$200\.00/.test(resumen3) && /Ya se pagó \$190\.00/.test(resumen3) && /inventario/i.test(resumen3), `el resumen de una cita terminada y cobrada: cobro adicional de $200, ya se pagó $190 e inventario («${resumen3.replace(/\n/g, " | ").slice(0, 200)}»)`);
  await pa.getByLabel("Motivo de la corrección (obligatorio)").fill("Se bañó completo");
  await pa.getByRole("button", { name: "Confirmar corrección" }).click();
  await pa.locator("[data-correccion-servicio]").waitFor({ timeout: 12000 }).catch(() => {});
  const ok3 = await pa.locator("[data-correccion-servicio]").innerText().catch(() => "");
  comprobar(/cobro adicional/i.test(ok3) && /\$200\.00/.test(ok3), `la confirmación dice qué queda en la cuenta («${ok3.replace(/\n/g, " ").slice(0, 140)}»)`);
  await pa.goto(`${BASE}/caja/ajustes-servicio`, { waitUntil: "networkidle" });
  const ajustes = await pa.locator("body").innerText();
  comprobar(/Falta cobrar \$200\.00/.test(ajustes) && /Baño exprés/.test(ajustes) && !/no existe/i.test(ajustes), "Caja → Ajustes por corrección de servicio lista el cobro adicional");
  await sinDesborde(pa, "Ajustes por corrección de servicio");
  await pa.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  const tablero = await pa.locator("body").innerText();
  comprobar(/servicio corregido dejó un cobro adicional|servicios corregidos con ajuste/i.test(tablero), "«Necesita atención» avisa del cobro adicional pendiente");
  await sinDesborde(pa, "tablero con el aviso");

  // ── 4. Cobro en la terminal esperando ──
  console.log("4. Cobro en la terminal esperando");
  const perro4 = await mkPerro("terminal");
  const c4 = await mkCita(perro4, srv("estetico"));
  const o = await SB.from("mp_ordenes").insert({ negocio_id: B, proveedor: "mercadopago", tipo: "point", reserva_id: c4.reserva_id, monto: 390, descripcion: "prueba corrui", estado: "en_terminal", simulado: true }).select("id").single();
  if (o.error) throw new Error(`orden: ${o.error.message}`);
  creados.ordenes.push(o.data.id);
  await pa.goto(`${BASE}/estetica/${c4.id}`, { waitUntil: "networkidle" });
  await pa.getByRole("button", { name: "Corregir servicio" }).click();
  await pa.getByLabel("Servicio correcto").selectOption(srv("rapado").id);
  await pa.locator("[data-correccion-resumen]").waitFor({ timeout: 10000 });
  comprobar(/se cancelará/i.test(await pa.locator("[data-correccion-resumen]").innerText()), "el resumen avisa que el cobro en la terminal se cancelará antes");
  await pa.getByLabel("Motivo de la corrección (obligatorio)").fill("Era rapado");
  await pa.getByRole("button", { name: "Confirmar corrección" }).click();
  await pa.locator("[data-correccion-servicio]").waitFor({ timeout: 15000 }).catch(() => {});
  const ok4 = await pa.locator("[data-correccion-servicio]").innerText().catch(() => "");
  const ordenDespues = (await SB.from("mp_ordenes").select("estado, detalle_error").eq("id", o.data.id).single()).data;
  comprobar(/Servicio corregido/.test(ok4) && /Se cancelaron 1 cobro/.test(ok4) && ordenDespues.estado === "cancelada" && /corrección de servicio/i.test(ordenDespues.detalle_error ?? ""), `la orden quedó cancelada y el servicio corregido («${ok4.replace(/\n/g, " ").slice(0, 120)}»)`);

  // ── 5. Servicio retirado ──
  console.log("5. Cita con servicio dado de baja");
  const perro5 = await mkPerro("retirado");
  const c5 = await mkCita(perro5, srv("expres"));
  await SB.from("servicios").update({ deleted_at: new Date().toISOString() }).eq("id", srv("expres").id);
  try {
    await pa.goto(`${BASE}/estetica/${c5.id}`, { waitUntil: "networkidle" });
    const t5 = await pa.locator("body").innerText();
    comprobar(/Baño exprés/.test(t5) && !/no existe/i.test(t5), "la cita abre mostrando el servicio con el que se registró, sin «no existe»");
    // Cancelar (dos toques: botón y confirmación) no truena con el servicio retirado.
    await pa.getByRole("button", { name: "Cancelar", exact: true }).first().click();
    await pa.waitForTimeout(500);
    const confirma = pa.getByRole("button", { name: /^(Sí, cancelar|Confirmar cancelación|Cancelar cita)/ });
    if (await confirma.count()) await confirma.first().click();
    await pa.waitForTimeout(2000);
    const est = (await SB.from("citas_estetica").select("estado").eq("id", c5.id).single()).data.estado;
    comprobar(est === "cancelada", `cancelar una cita con el servicio dado de baja funciona (estado ${est})`);
  } finally {
    await SB.from("servicios").update({ deleted_at: null }).eq("id", srv("expres").id);
  }
} catch (e) {
  hallazgo(`la prueba tronó: ${e.message}`);
} finally {
  await nav.close();
  await SB.from("servicios").update({ deleted_at: null }).eq("clave", "estetica_expres");
  await admin.rpc("revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_servicio" });
  await SB.from("cobros").update({ deleted_at: new Date().toISOString() }).like("notas", "prueba corrui%");
  for (const id of creados.ordenes) await SB.from("mp_ordenes").delete().eq("id", id);
  await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
}
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en pantalla.");
process.exit(hallazgos.length ? 1 : 0);
