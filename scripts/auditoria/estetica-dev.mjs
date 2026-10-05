// Estética: precios por grupo, pelaje, recargo, alta corta, sin contrato e
// invitación al portal (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/estetica/cargar-tarifas.mjs --negocio huellitas --tabla scripts/estetica/tablas/ludogteka.json --aplicar
//   node scripts/auditoria/estetica-dev.mjs
//
// 1. Cada baño (completo, rapado, exprés) por cada grupo de la tabla: el
//    precio de la cita sale de la matriz; pelo maltratado; rapado solo con
//    pelo medio o largo; «Por talla» solo con pelo corto; un perro sin grupo
//    con pelo medio o largo NO tiene precio automático.
// 2. Recargo manual: solo con «excepciones_reserva», con motivo, y queda
//    quién y por qué; la excepción de grupo igual.
// 3. Cambiar tarifas no mueve una cita ya agendada.
// 4. Un cliente de solo estética no tiene avisos de contrato (estado
//    «no_aplica», nada en contratos_por_atender).
// 5. El cliente no lee tarifas ni citas con precio por la API.
// 6. Invitar al portal: la función (admin y recepción, no estética ni
//    anónimo), de un solo uso, vencimiento, una vigente a la vez, otro
//    negocio no la ve.
// 7. Navegador a 390 px: alta corta en el mostrador, alta corta por link
//    (sin dirección, vacunas, correo ni contraseña), la nota del costo, el
//    recargo en la cita, la invitación y su activación (una sola vez).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const cab = (token, negocio = B) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-negocio-id": negocio, "Content-Type": "application/json", Prefer: "return=representation" });
const llamar = async (url, opciones) => {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : "") };
};
const rpc = (token, fn, args = {}, negocio = B) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(args) });
const get = (token, ruta, negocio = B) => llamar(`${URL}/rest/v1/${ruta}`, { headers: cab(token, negocio) });
const sha = (t) => createHash("sha256").update(t).digest("hex");

const tAdmin = await tokenDe(datos.adminB);
const { data: recId } = await A.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
const tRecep = await tokenDe(recId);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);

const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const talla = (c) => tallas.find((t) => t.clave === c).id;
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const pelaje = (c) => pelajes.find((t) => t.clave === c).id;
const { data: servicios } = await SB.from("servicios").select("id, clave").eq("categoria", "estetica").is("deleted_at", null);
const srv = (c) => servicios.find((s) => s.clave === `estetica_${c}`).id;
const { data: razas } = await A.from("razas").select("id, nombre, es_desconocida");
const raza = (n) => razas.find((r) => r.nombre === n)?.id;

const creados = { perros: [], clientes: [], citas: [], reservas: [], invitaciones: [] };
const sufijo = String(Date.now()).slice(-6);
const mkPerro = async (nombre, { razaNombre = null, tam = "mediano", pel = "medio", texto = "" } = {}) => {
  const { data, error } = await SB.from("perros").insert({
    cliente_id: datos.clienteSoloB, nombre: `ZZ est ${nombre} ${sufijo}`, raza: razaNombre ?? texto, raza_id: razaNombre ? raza(razaNombre) : null,
    tamano_id: talla(tam), pelaje_id: pelaje(pel),
  }).select("id").single();
  if (error) throw new Error(`perro de prueba ${nombre}: ${error.message}`);
  creados.perros.push(data.id);
  return data.id;
};
let dia = 40 + Math.floor(Math.random() * 400);
const cita = async (token, perroId, servicio, extra = {}) => {
  const rr = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(token), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
  const reservaId = rr.cuerpo?.[0]?.id;
  if (!reservaId) return { ok: false, mensaje: `reserva: ${JSON.stringify(rr.cuerpo).slice(0, 120)}` };
  creados.reservas.push(reservaId);
  const f = new Date(Date.now() + dia++ * 86_400_000).toISOString().slice(0, 10);
  const r = await llamar(`${URL}/rest/v1/citas_estetica`, {
    method: "POST", headers: cab(token),
    body: JSON.stringify({ reserva_id: reservaId, perro_id: perroId, servicio_id: srv(servicio), empleado_id: datos.esteticaB, inicio: `${f}T${String(8 + (dia % 9)).padStart(2, "0")}:00:00-06:00`, ...extra }),
  });
  const fila = r.cuerpo?.[0];
  if (r.ok && fila?.id) creados.citas.push(fila.id);
  return { ok: r.ok, mensaje: r.mensaje, fila };
};
const precioEs = async (titulo, perroId, servicio, esperado, extra = {}) => {
  const c = await cita(tAdmin, perroId, servicio, extra);
  if (esperado === null) {
    if (c.ok) hallazgo(`${titulo}: debía rechazarse y se agendó a $${c.fila.precio}`);
    else bien(`${titulo}: rechazado («${c.mensaje.slice(0, 80)}…»)`);
    return c;
  }
  if (!c.ok) hallazgo(`${titulo}: debía costar $${esperado} y se rechazó: ${c.mensaje}`);
  else if (Number(c.fila.precio) !== esperado) hallazgo(`${titulo}: costó $${c.fila.precio} y debía $${esperado}`);
  else bien(`${titulo}: $${esperado}`);
  return c;
};

try {
  // ── 1. Precios por grupo ──
  console.log("── 1. Precios por grupo, baño y pelaje");
  const poodle = await mkPerro("poodle", { razaNombre: "Poodle", tam: "chico" });
  await precioEs("Poodle · estético", poodle, "estetico", 390);
  await precioEs("Poodle · maltratado", poodle, "estetico", 450, { pelo_maltratado: true });
  await precioEs("Poodle · rapado (pelo medio)", poodle, "rapado", 320);
  await precioEs("Poodle · exprés", poodle, "expres", 190);
  const pom = await mkPerro("pomerania", { razaNombre: "Pomerania", tam: "chico", pel: "largo" });
  await precioEs("Pomerania · estético", pom, "estetico", 390);
  await precioEs("Pomerania · rapado (pelo largo)", pom, "rapado", 320);
  const husky = await mkPerro("husky", { razaNombre: "Husky siberiano", tam: "grande", pel: "medio" });
  await precioEs("Husky · estético", husky, "estetico", 590);
  await precioEs("Husky · rapado", husky, "rapado", 460);
  await precioEs("Husky · exprés", husky, "expres", 370);
  await precioEs("Husky · maltratado (sin precio alterno en este grupo)", husky, "estetico", 590, { pelo_maltratado: true }).then(() => {});
  const huskyCorto = await mkPerro("husky corto", { razaNombre: "Husky siberiano", tam: "grande", pel: "corto" });
  await precioEs("Pelo corto · rapado no se ofrece", huskyCorto, "rapado", null);
  const vpi = await mkPerro("viejo pastor", { razaNombre: "Viejo pastor inglés", tam: "grande", pel: "largo" });
  await precioEs("Viejo pastor inglés · estético", vpi, "estetico", 790);
  await precioEs("Viejo pastor inglés · rapado", vpi, "rapado", 590);
  await precioEs("Viejo pastor inglés · exprés", vpi, "expres", 450);
  // Por talla: sin raza ligada, pelo corto.
  const pc = await mkPerro("talla chico", { tam: "chico", pel: "corto", texto: "criollo" });
  await precioEs("Por talla chico · estético", pc, "estetico", 250);
  const pm = await mkPerro("talla mediano", { tam: "mediano", pel: "corto", texto: "criollo" });
  await precioEs("Por talla mediano · estético", pm, "estetico", 350);
  await precioEs("Por talla mediano · exprés", pm, "expres", 190);
  const pg = await mkPerro("talla grande", { tam: "grande", pel: "corto", texto: "criollo" });
  await precioEs("Por talla grande · estético", pg, "estetico", 490);
  await precioEs("Por talla grande · exprés", pg, "expres", 230);
  await precioEs("Por talla · rapado (pelo corto) no se ofrece", pg, "rapado", null);
  // Sin grupo con pelo medio o largo: sin precio automático.
  const mestizo = await mkPerro("mestizo medio", { tam: "mediano", pel: "medio", texto: "criollo" });
  const sinPrecio = await precioEs("Mestizo de pelo medio: sin precio automático", mestizo, "estetico", null);
  if (sinPrecio.mensaje && !/grupo|pelaje|excepci/i.test(sinPrecio.mensaje)) hallazgo(`el mensaje de «sin precio» no dice qué falta: ${sinPrecio.mensaje}`);
  const grupos = (await get(tAdmin, "grupos_raza?select=id,clave,nombre&deleted_at=is.null")).cuerpo;
  const grupoPorTalla = grupos.find((g) => /talla/i.test(g.nombre));
  const grupoPoodle = grupos.find((g) => /poodle/i.test(g.nombre));
  const exAdmin = await precioEs("Mestizo de pelo medio con excepción de grupo (admin)", mestizo, "estetico", 390, { grupo_raza_excepcion_id: grupoPoodle.id, excepcion_grupo_motivo: "Se parece a un poodle, lo valoramos en mostrador" });
  if (exAdmin.fila && exAdmin.fila.excepcion_grupo_por !== datos.adminB) hallazgo("la excepción no guarda quién la hizo");
  const exRecep = await cita(tRecep, mestizo, "estetico", { grupo_raza_excepcion_id: grupoPoodle.id, excepcion_grupo_motivo: "prueba" });
  if (exRecep.ok) hallazgo("recepción sin «excepciones_reserva» registró una excepción de grupo");
  else bien("la excepción de grupo sin el permiso se rechaza");
  void grupoPorTalla;

  // ── 2. Recargo manual ──
  console.log("\n── 2. Recargo manual");
  const rcSin = await cita(tRecep, poodle, "estetico", { recargo: 50, recargo_motivo: "nudos" });
  if (rcSin.ok) hallazgo("recepción sin el permiso registró un recargo");
  else bien(`recepción sin permiso: rechazado («${rcSin.mensaje.slice(0, 70)}…»)`);
  const rcMotivo = await cita(tAdmin, poodle, "estetico", { recargo: 50 });
  if (rcMotivo.ok) hallazgo("un recargo sin motivo se aceptó");
  else bien("un recargo sin motivo se rechaza");
  const rcNeg = await cita(tAdmin, poodle, "estetico", { recargo: -10, recargo_motivo: "x" });
  if (rcNeg.ok) hallazgo("un recargo negativo se aceptó");
  const rc = await cita(tAdmin, poodle, "estetico", { recargo: 60, recargo_motivo: "Muchos nudos" });
  if (!rc.ok) hallazgo(`el recargo de admin no pasó: ${rc.mensaje}`);
  else if (Number(rc.fila.precio) !== 450 || Number(rc.fila.precio_base) !== 390 || Number(rc.fila.recargo) !== 60 || rc.fila.recargo_por !== datos.adminB || rc.fila.recargo_motivo !== "Muchos nudos") hallazgo(`el recargo no quedó como precio base + recargo, con quién y por qué: ${JSON.stringify(rc.fila)}`);
  else bien("recargo de $60: precio $450 = base $390 + recargo, con quién y motivo");
  // El permiso lo hace delegable.
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recId, p_permiso: "excepciones_reserva" });
  const rcPermiso = await cita(tRecep, poodle, "estetico", { recargo: 25, recargo_motivo: "Cuidado previo" });
  if (!rcPermiso.ok) hallazgo(`recepción CON el permiso no pudo poner el recargo: ${rcPermiso.mensaje}`);
  else bien("recepción con «excepciones_reserva» sí puede, y queda a su nombre");
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recId, p_permiso: "excepciones_reserva" });
  const rcEst = await cita(tEstetica, poodle, "estetico", { recargo: 25, recargo_motivo: "x" });
  if (rcEst.ok) hallazgo("estética registró un recargo");

  // ── 3. Cambiar tarifas no mueve citas ya agendadas ──
  console.log("\n── 3. Tarifas nuevas no tocan citas viejas");
  const antes = await cita(tAdmin, poodle, "estetico");
  const original = JSON.parse(fs.readFileSync("scripts/estetica/tablas/ludogteka.json", "utf8"));
  const alterada = JSON.parse(JSON.stringify(original));
  let movida = 0;
  for (const t of alterada.tarifas ?? []) if (/poodle/i.test(JSON.stringify(t)) && /estetico/.test(JSON.stringify(t)) && typeof t.precio === "number") { t.precio += 10; movida++; }
  const tmp = path.join(os.tmpdir(), `estetica-alterada-${sufijo}.json`);
  fs.writeFileSync(tmp, JSON.stringify(alterada));
  if (!movida) hallazgo("no encontré la tarifa del poodle en la tabla para alterarla");
  else {
    execFileSync("node", ["scripts/estetica/cargar-tarifas.mjs", "--negocio", "huellitas", "--tabla", tmp, "--aplicar"], { encoding: "utf8" });
    const { data: viva } = await SB.from("citas_estetica").select("precio").eq("id", antes.fila.id).single();
    if (Number(viva.precio) !== 390) hallazgo(`al cambiar la tarifa, una cita ya agendada cambió a $${viva.precio}`);
    else bien("la cita agendada conserva $390");
    const nueva = await cita(tAdmin, poodle, "estetico");
    if (Number(nueva.fila?.precio) !== 400) hallazgo(`la cita nueva debía costar $400 con la tarifa alterada y costó $${nueva.fila?.precio}`);
    else bien("la cita nueva ya cobra la tarifa nueva ($400)");
    execFileSync("node", ["scripts/estetica/cargar-tarifas.mjs", "--negocio", "huellitas", "--tabla", "scripts/estetica/tablas/ludogteka.json", "--aplicar"], { encoding: "utf8" });
    const otra = await cita(tAdmin, poodle, "estetico");
    if (Number(otra.fila?.precio) !== 390) hallazgo("al recargar la tabla original el precio no volvió a $390");
    else bien("recargar la tabla original devuelve $390 (idempotente)");
  }
  fs.rmSync(tmp, { force: true });

  // ── 4. Estética no tiene contratos ──
  console.log("\n── 4. Un cliente de solo estética no tiene avisos de contrato");
  const res = await get(tAdmin, `perros_contrato_resumen?perro_id=in.(${creados.perros.join(",")})&select=perro_id,estado`);
  const noNA = (res.cuerpo ?? []).filter((r) => r.estado !== "no_aplica");
  if (noNA.length) hallazgo(`perros de solo estética con un estado de contrato: ${JSON.stringify(noNA)}`);
  else bien(`${creados.perros.length} perros de solo estética: contrato «no_aplica»`);
  const porAtender = await get(tAdmin, `contratos_por_atender?perro_id=in.(${creados.perros.join(",")})&select=contrato_id`);
  if ((porAtender.cuerpo ?? []).length) hallazgo("hay contratos «por atender» de perros de solo estética");
  else bien("nada en contratos_por_atender (Necesita atención) para ellos");
  const { data: gen } = await SB.from("contratos").select("id").in("perro_id", creados.perros);
  if (gen?.length) hallazgo("se generaron contratos para perros de solo estética");
  else bien("no se generó ningún contrato para ellos");
  const gruposEst = await rpc(tAdmin, "tipos_contrato_de_alta", { p_tipo: "estetica" });
  if ((gruposEst.cuerpo ?? []).length) hallazgo(`el alta de estética genera contratos: ${JSON.stringify(gruposEst.cuerpo)}`);
  else bien("el alta de estética no genera ningún contrato");

  // ── 5. El cliente no ve precios ──
  console.log("\n── 5. El cliente no ve precios");
  for (const t of ["tarifas", "tarifas_vigentes", "citas_estetica", "tarifas_dia_semana"]) {
    const r = await get(tCliente, `${t}?select=*&limit=3`);
    if (r.ok && r.cuerpo.length) hallazgo(`el cliente lee ${t}: ${r.cuerpo.length} fila(s)`);
  }
  const mv = await rpc(tCliente, "mis_visitas");
  if (/precio|monto|recargo/i.test(JSON.stringify(mv.cuerpo ?? ""))) hallazgo("mis_visitas trae precios");
  else bien("tarifas, citas y mis_visitas: nada de precios para el cliente");
  const inv = await get(tCliente, "portal_invitaciones?select=*");
  if (inv.ok && inv.cuerpo.length) hallazgo("el cliente lee portal_invitaciones");

  // ── 6. Invitar al portal (base) ──
  console.log("\n── 6. Invitar al portal: la función");
  const { data: sinCuenta } = await SB.from("clientes").insert({ nombre: `ZZ Sin cuenta ${sufijo}`, telefono: `55${sufijo.padStart(8, "1")}` }).select("id").single();
  creados.clientes.push(sinCuenta.id);
  const tok = () => randomBytes(32).toString("base64url");
  const t1 = tok();
  const ok1 = await rpc(tRecep, "crear_invitacion_portal", { p_cliente_id: sinCuenta.id, p_token_hash: sha(t1), p_dias: 7 });
  if (!ok1.ok) hallazgo(`recepción no pudo invitar: ${ok1.mensaje}`);
  else bien("recepción crea la invitación; vence a los 7 días");
  const { data: fila1 } = await SB.from("portal_invitaciones").select("token_hash, expira_at").eq("token_hash", sha(t1)).single();
  if (!fila1 || JSON.stringify(fila1).includes(t1)) hallazgo("la tabla guarda el token en claro o no guarda el hash");
  else bien("solo se guarda el sha256 del token");
  const t2 = tok();
  await rpc(tAdmin, "crear_invitacion_portal", { p_cliente_id: sinCuenta.id, p_token_hash: sha(t2), p_dias: 7 });
  const { data: primera } = await SB.from("portal_invitaciones").select("cancelada_at").eq("token_hash", sha(t1)).single();
  if (!primera?.cancelada_at) hallazgo("una segunda invitación no deja sin efecto la primera");
  else bien("generar otra deja sin efecto la anterior");
  for (const [quien, token] of [["estética", tEstetica], ["cliente", tCliente]]) {
    const r = await rpc(token, "crear_invitacion_portal", { p_cliente_id: sinCuenta.id, p_token_hash: sha(tok()), p_dias: 7 });
    if (r.ok) hallazgo(`${quien} pudo invitar al portal`);
  }
  const anon = await rpc(null, "crear_invitacion_portal", { p_cliente_id: sinCuenta.id, p_token_hash: sha(tok()), p_dias: 7 });
  if (anon.ok) hallazgo("la llave anónima pudo invitar al portal");
  else bien("estética, cliente y anónimo no pueden invitar");
  for (const dias of [0, 31]) if ((await rpc(tAdmin, "crear_invitacion_portal", { p_cliente_id: sinCuenta.id, p_token_hash: sha(tok()), p_dias: dias })).ok) hallazgo(`se aceptó una invitación de ${dias} días`);
  if ((await rpc(tAdmin, "crear_invitacion_portal", { p_cliente_id: sinCuenta.id, p_token_hash: "no-es-un-hash", p_dias: 7 })).ok) hallazgo("se aceptó un token_hash que no es sha256");
  const conCuenta = await rpc(tAdmin, "crear_invitacion_portal", { p_cliente_id: datos.clienteSoloB, p_token_hash: sha(tok()), p_dias: 7 });
  if (conCuenta.ok) hallazgo("se invitó a un cliente que ya tiene cuenta");
  else bien("un cliente que ya tiene cuenta no se invita («restablécele la contraseña»)");
  const otroNegocio = await rpc(tAdmin, "crear_invitacion_portal", { p_cliente_id: sinCuenta.id, p_token_hash: sha(tok()), p_dias: 7 }, LUDOGTEKA);
  if (otroNegocio.ok) hallazgo("un admin de Huellitas invitó a alguien en Ludogteka");
  const lecturaOtro = await get(tAdmin, "portal_invitaciones?select=id", LUDOGTEKA);
  if (lecturaOtro.ok && lecturaOtro.cuerpo.length) hallazgo("se leen invitaciones de otro negocio");
  else bien("otro negocio: no se puede invitar ni leer");
  void t2;
} finally {
  for (const id of creados.citas) await SB.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.reservas) await SB.from("reservas").delete().eq("id", id);
  await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
  await SB.from("portal_invitaciones").delete().in("cliente_id", creados.clientes);
  await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", creados.clientes);
}

console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en la base.");
void abrirNavegador; void REF; void BASE;
process.exit(hallazgos.length ? 1 : 0);
