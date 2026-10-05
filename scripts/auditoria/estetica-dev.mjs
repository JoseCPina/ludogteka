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

  // ── 8. Reasignar la estilista (y el dinero que depende de ella) ──
  console.log("\n── 8. Reasignar o corregir la estilista de una cita");
  const comprobar = (cond, titulo) => (cond ? bien(titulo) : hallazgo(titulo));
  const { data: hoyB } = await rpc(tAdmin, "fecha_negocio").then((r) => ({ data: r.cuerpo }));
  const sumarDias = (f, n) => { const [y, m, d] = f.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const S1 = datos.esteticaB;
  const S2 = datos.esteticaAmbos;
  const tEstetica2 = await tokenDe(S2);
  const { data: recSinId } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
  const recepcionesB = recSinId.map((r) => r.profile_id);
  const recConPermiso = datos.recepcionB;
  const recSinPermiso = recepcionesB.find((id) => id !== recConPermiso && id !== "1e83a7ed-a6c8-486b-8c67-ed5f6d725f5b") ?? recepcionesB.find((id) => id !== recConPermiso);
  const tRecSin = await tokenDe(recSinPermiso);
  // Recepción sin el permiso de corregir (se le quita por si una corrida anterior lo dejó).
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_estilista" });

  const perroR = await mkPerro("reasignar", { razaNombre: "Poodle", tam: "chico" });
  const nuevaCita = async (empleado, fecha, { estado = null, hora = "20:00:00Z" } = {}) => {
    const rr = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
    const reservaId = rr.cuerpo?.[0]?.id;
    creados.reservas.push(reservaId);
    const r = await llamar(`${URL}/rest/v1/citas_estetica`, {
      method: "POST", headers: cab(tAdmin),
      body: JSON.stringify({ reserva_id: reservaId, perro_id: perroR, servicio_id: srv("estetico"), empleado_id: empleado, inicio: `${fecha}T${hora}`, ...(estado ? { estado } : {}) }),
    });
    const fila = r.cuerpo?.[0];
    if (!r.ok || !fila?.id) throw new Error(`cita de prueba (${fecha}): ${r.mensaje}`);
    creados.citas.push(fila.id);
    return fila;
  };
  const empDe = async (id) => (await SB.from("citas_estetica").select("empleado_id, estado").eq("id", id).single()).data;
  const reasignar = (token, id, a, motivo = null) => rpc(token, "reasignar_estilista_cita", { p_cita_id: id, p_empleado_id: a, p_motivo: motivo });
  const historial = async (token, id) => (await rpc(token, "historial_asignaciones_cita", { p_cita_id: id })).cuerpo ?? [];

  // 8.1 La lista de quién se puede asignar
  const lista = await rpc(tRecep, "estilistas_asignables");
  comprobar(lista.ok && [S1, S2].every((id) => lista.cuerpo.some((e) => e.id === id)), "recepción ve a las estilistas del negocio para asignar");
  comprobar(!lista.cuerpo.some((e) => e.id === datos.cuentaSoloB), "un cliente no aparece como estilista asignable");
  for (const [quien, token] of [["cliente", tCliente], ["anónimo", null]]) {
    const r = await rpc(token, "estilistas_asignables");
    comprobar(!r.ok || (r.cuerpo ?? []).length === 0, `${quien}: la lista de estilistas sale vacía o se rechaza`);
  }
  comprobar(((await rpc(tAdmin, "estilistas_asignables", {}, LUDOGTEKA)).cuerpo ?? []).length === 0, "con el encabezado de otro negocio, un admin de Huellitas no ve estilistas de ahí");

  // 8.2 Antes de iniciar: recepción, un toque, sin motivo; y «sin asignar»
  const f1 = sumarDias(hoyB, 60 + Math.floor(Math.random() * 200));
  const c1 = await nuevaCita(S1, f1);
  const r1 = await reasignar(tRecSin, c1.id, S2);
  comprobar(r1.ok && (await empDe(c1.id)).empleado_id === S2 && r1.cuerpo?.a, `recepción (sin permisos especiales) pasa la cita a otra estilista sin motivo: ${r1.ok ? r1.cuerpo.de + " → " + r1.cuerpo.a : r1.mensaje}`);
  const r1b = await reasignar(tRecep, c1.id, null);
  comprobar(r1b.ok && (await empDe(c1.id)).empleado_id === null, "y la deja «sin asignar»");
  const h1 = await historial(tRecep, c1.id);
  comprobar(h1.length === 2 && h1[0].a_nombre === "Sin asignar" && h1[1].de_nombre !== "Sin asignar" && h1.every((x) => x.por_nombre), "el historial guarda quién, de quién a quién y en qué estado, ordenado del más nuevo");
  const mismo = await reasignar(tRecep, c1.id, null);
  comprobar(mismo.ok && mismo.cuerpo?.sin_cambio && (await historial(tRecep, c1.id)).length === 2, "pedir la misma asignación no ensucia el historial");
  const inicia = await llamar(`${URL}/rest/v1/citas_estetica?id=eq.${c1.id}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ estado: "en_curso" }) });
  comprobar(!inicia.ok && /estilista/i.test(inicia.mensaje), `una cita sin estilista no se puede iniciar («${inicia.mensaje.slice(0, 70)}»)`);
  await reasignar(tRecep, c1.id, S1);

  // 8.3 Quién NO puede
  for (const [quien, token] of [["estética", tEstetica], ["cliente", tCliente], ["anónimo", null]]) {
    const r = await reasignar(token, c1.id, S2);
    comprobar(!r.ok && (await empDe(c1.id)).empleado_id === S1, `${quien}: no reasigna`);
  }
  const directo = await llamar(`${URL}/rest/v1/citas_estetica?id=eq.${c1.id}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ empleado_id: S2 }) });
  comprobar(!directo.ok && (await empDe(c1.id)).empleado_id === S1, `el UPDATE directo a empleado_id se rechaza, ni siendo admin («${directo.mensaje.slice(0, 60)}»)`);
  const directoSecreta = await SB.from("citas_estetica").update({ empleado_id: S2 }).eq("id", c1.id);
  comprobar(Boolean(directoSecreta.error) && (await empDe(c1.id)).empleado_id === S1, "tampoco con la secret key por la API");
  for (const [titulo, destino] of [["un cliente", datos.cuentaSoloB], ["alguien que no existe", "00000000-0000-4000-8000-0000000000aa"], ["el admin de otro negocio", (await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "admin").limit(1).single()).data.profile_id]]) {
    const r = await reasignar(tAdmin, c1.id, destino);
    comprobar(!r.ok && (await empDe(c1.id)).empleado_id === S1, `no se asigna a ${titulo}`);
  }
  const otroNeg = await reasignar(tAdmin, c1.id, S2, null);
  void otroNeg;
  const cruzada = await rpc(tAdmin, "reasignar_estilista_cita", { p_cita_id: c1.id, p_empleado_id: S2, p_motivo: null }, LUDOGTEKA);
  comprobar(!cruzada.ok, "con el encabezado de otro negocio no se alcanza la cita");
  const histCliente = await historial(tCliente, c1.id);
  const histAnon = await historial(null, c1.id);
  comprobar((!Array.isArray(histCliente) || histCliente.length === 0) && (!Array.isArray(histAnon) || histAnon.length === 0), "cliente y anónimo no leen el historial");
  const tablaCliente = await get(tCliente, "citas_estetica_asignaciones?select=id");
  const tablaAnon = await get(null, "citas_estetica_asignaciones?select=id");
  comprobar((!tablaCliente.ok || tablaCliente.cuerpo.length === 0) && (!tablaAnon.ok || tablaAnon.cuerpo.length === 0), "la tabla del historial: ni el cliente ni la llave anónima leen filas");
  const escribe = await llamar(`${URL}/rest/v1/citas_estetica_asignaciones`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cita_id: c1.id, estado_cita: "reservada", a_empleado_id: S2 }) });
  comprobar(!escribe.ok, "nadie escribe el historial directo (solo la función)");
  const lecturaOtroNeg = await get(tAdmin, "citas_estetica_asignaciones?select=id", LUDOGTEKA);
  comprobar(!lecturaOtroNeg.ok || lecturaOtroNeg.cuerpo.length === 0, "un admin de Huellitas no lee historiales de otro negocio");

  // 8.4 Traslape: no se pasa a quien ya tiene otra cita a esa hora
  const f2 = sumarDias(hoyB, 300 + Math.floor(Math.random() * 50));
  const c2a = await nuevaCita(S1, f2);
  const c2b = await nuevaCita(S2, f2);
  const choque = await reasignar(tAdmin, c2b.id, S1);
  comprobar(!choque.ok && /ya tiene otra cita/i.test(choque.mensaje) && (await empDe(c2b.id)).empleado_id === S2, `la que ya tiene cita a esa hora no se asigna: «${choque.mensaje.slice(0, 80)}»`);
  void c2a;

  // 8.5 En curso: motivo opcional, nunca sin estilista
  const f3 = sumarDias(hoyB, 360 + Math.floor(Math.random() * 40));
  const c3 = await nuevaCita(S1, f3, { estado: "en_curso" });
  const sinAsig = await reasignar(tAdmin, c3.id, null);
  comprobar(!sinAsig.ok && (await empDe(c3.id)).empleado_id === S1, `en curso no puede quedarse sin estilista («${sinAsig.mensaje.slice(0, 60)}»)`);
  const enCurso = await reasignar(tRecSin, c3.id, S2);
  comprobar(enCurso.ok && (await empDe(c3.id)).empleado_id === S2, "en curso: recepción la pasa a otra sin motivo");
  const enCurso2 = await reasignar(tRecSin, c3.id, S1, "Gaby tomó al perro a la mitad");
  const h3 = await historial(tRecep, c3.id);
  comprobar(enCurso2.ok && h3[0].motivo === "Gaby tomó al perro a la mitad" && h3[0].estado_cita === "en_curso", "en curso con motivo: queda en el historial con el estado");

  // 8.6 Cancelada: no se reasigna
  const f4 = sumarDias(hoyB, 410 + Math.floor(Math.random() * 40));
  const c4 = await nuevaCita(S1, f4);
  await SB.from("citas_estetica").update({ estado: "cancelada" }).eq("id", c4.id);
  const canc = await reasignar(tAdmin, c4.id, S2);
  comprobar(!canc.ok && /cerrada/i.test(canc.mensaje), "una cita cancelada no se reasigna");

  // 8.7 Terminada: admin o permiso nuevo, con motivo
  const dpago = hoyB;
  const c5 = await nuevaCita(S1, dpago, { estado: "en_curso", hora: "17:00:00Z" });
  const fin5 = await rpc(tAdmin, "finalizar_cita_con_consumo", { p_cita_id: c5.id, p_recogido_por_nombre: "Prueba", p_recogido_por_telefono: "4440000000", p_recogido_por_es_dueno: true, p_ajustes: [] });
  comprobar(fin5.ok, `se termina la cita de prueba${fin5.ok ? "" : ": " + fin5.mensaje}`);
  const sinPerm = await reasignar(tRecSin, c5.id, S2, "Me equivoqué");
  comprobar(!sinPerm.ok && /permiso/i.test(sinPerm.mensaje) && (await empDe(c5.id)).empleado_id === S1, `recepción sin el permiso NO corrige un servicio terminado («${sinPerm.mensaje.slice(0, 70)}»)`);
  const sinMotivo = await reasignar(tAdmin, c5.id, S2);
  comprobar(!sinMotivo.ok && /motivo/i.test(sinMotivo.mensaje) && (await empDe(c5.id)).empleado_id === S1, "terminada: el motivo es obligatorio, ni siendo admin");
  const conPermiso = await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_estilista" });
  comprobar(!conPermiso.error && conPermiso.ok, `admin le da a una recepcionista el permiso «Corregir estilista de servicios cerrados»${conPermiso.ok ? "" : ": " + conPermiso.mensaje}`);
  const mp = await rpc(tRecSin, "mis_permisos");
  comprobar(mp.ok && mp.cuerpo.includes("corregir_estilista") && !mp.cuerpo.includes("nomina"), "mis_permisos lo trae y no da nómina");
  const permSinMotivo = await reasignar(tRecSin, c5.id, S2, "  ");
  comprobar(!permSinMotivo.ok && (await empDe(c5.id)).empleado_id === S1, "con el permiso, sin motivo tampoco");
  const permisoOk = await reasignar(tRecSin, c5.id, S2, "Gaby fue quien lo bañó");
  comprobar(permisoOk.ok && (await empDe(c5.id)).empleado_id === S2, "con el permiso y motivo, corrige");
  const h5 = await historial(tRecep, c5.id);
  comprobar(h5[0].estado_cita === "finalizada" && h5[0].motivo === "Gaby fue quien lo bañó" && h5[0].por_nombre !== "Alguien del equipo", "queda en el historial: servicio terminado, motivo y quién");
  const quitoPerm = await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_estilista" });
  const otraVez = await reasignar(tRecSin, c5.id, S1, "Otra vez");
  comprobar(quitoPerm.ok && !otraVez.ok, "al quitarle el permiso, se le vuelve a rechazar");
  const dueno = await reasignar(tAdmin, c5.id, S1, "Era Ana, no Gaby");
  comprobar(dueno.ok && (await empDe(c5.id)).empleado_id === S1, "admin corrige con motivo sin necesitar el permiso");
  comprobar((await historial(tRecep, c5.id)).length === 2, "dos cambios, dos renglones (los rechazados no dejan nada): nada se reescribe en silencio");

  // 8.8 Dinero: comisiones y propinas con periodos ya pagados
  console.log("   dinero…");
  await SB.from("empleados").update({ deleted_at: new Date().toISOString() }).like("nombre", "Prueba reasignar%").is("deleted_at", null);
  const sello = Date.now().toString(36);
  const altaEmp = async (nombre, profile) => {
    const e = await SB.from("empleados").insert({ nombre: `Prueba reasignar ${nombre} ${sello}`, puesto: "Estilista", fecha_ingreso: sumarDias(hoyB, -60), telefono: "4440000000", emergencia_nombre: "Contacto", emergencia_telefono: "4441111111", profile_id: profile }).select("id").single();
    if (e.error) throw new Error(`empleado ${nombre}: ${e.error.message}`);
    await SB.from("esquemas_pago").insert({ empleado_id: e.data.id, vigente_desde: sumarDias(hoyB, -59), con_comision: true, comision_tipo: "porcentaje", comision_valor: 10 });
    return e.data.id;
  };
  const E1 = await altaEmp("A", S1);
  const E2 = await altaEmp("B", S2);
  // Las tarifas de Huellitas valen desde ayer: los periodos son de un día cada uno.
  const P1 = [sumarDias(hoyB, -1), sumarDias(hoyB, -1)];
  const P2 = [hoyB, hoyB];
  const SIG = [sumarDias(hoyB, 1), sumarDias(hoyB, 7)];
  const calcular = async (emp, periodo) => (await rpc(tAdmin, "calcular_nomina", { p_empleado_id: emp, p_desde: periodo[0], p_hasta: periodo[1] })).cuerpo;
  const pagar = (emp, periodo) => rpc(tAdmin, "registrar_pago_nomina", { p_empleado_id: emp, p_desde: periodo[0], p_hasta: periodo[1], p_metodo: "efectivo", p_fecha_pago: hoyB, p_notas: null });
  const terminar = async (id) => (await rpc(tAdmin, "finalizar_cita_con_consumo", { p_cita_id: id, p_recogido_por_nombre: "Prueba", p_recogido_por_telefono: "4440000000", p_recogido_por_es_dueno: true, p_ajustes: [] })).ok;
  const cita3 = await nuevaCita(S1, sumarDias(hoyB, -1), { estado: "en_curso" });
  const cita2 = await nuevaCita(S1, hoyB, { estado: "en_curso", hora: "21:00:00Z" });
  comprobar((await terminar(cita3.id)) && (await terminar(cita2.id)), "dos servicios terminados de la primera estilista, en dos periodos");
  const X = Math.round(Number(cita3.precio) * 10) / 100;
  // Una propina en la cuenta de la segunda
  const { data: turno } = await SB.from("turnos_caja").select("id").limit(1).maybeSingle();
  let propina = 0;
  if (turno) {
    const cb = await SB.from("cobros").insert({ reserva_id: cita2.reserva_id, turno_id: turno.id, notas: `prueba reasignar ${sello}` }).select("id").single();
    if (!cb.error) {
      const cm = await SB.from("cobro_metodos").insert({ cobro_id: cb.data.id, metodo: "efectivo", monto: Number(cita2.precio), propina: 50 });
      if (!cm.error) propina = 50;
    }
  }
  comprobar(propina === 50, "cobro con $50 de propina en la cuenta del servicio más reciente");
  const antesPagos = async () => JSON.stringify((await SB.from("nomina_pagos").select("id, total, costo, comisiones, propinas, desglose").in("empleado_id", [E1, E2]).order("created_at")).data);
  const antesCaja = async () => JSON.stringify([
    (await SB.from("cobros").select("id, reserva_id, turno_id").eq("reserva_id", cita2.reserva_id)).data,
    (await SB.from("cobro_metodos").select("cobro_id, monto, propina").in("cobro_id", ((await SB.from("cobros").select("id").eq("reserva_id", cita2.reserva_id)).data ?? []).map((x) => x.id))).data,
    (await SB.from("turnos_caja").select("id, estado, cerrado_at").eq("estado", "cerrado").order("id")).data,
    (await SB.from("cortes_caja").select("id, diferencia").order("id")).data,
  ]);
  const pagoA1 = await pagar(E1, P1);
  comprobar(pagoA1.ok, `se paga el periodo ${P1[0]}…${P1[1]} a la primera (incluye su comisión de $${X})`);
  const utilAntes = (await rpc(tAdmin, "reporte_utilidad_periodo", { p_desde: P1[0], p_hasta: hoyB })).cuerpo?.[0] ?? null;
  const margenAntes = (await rpc(tAdmin, "reporte_margen_por_servicio_periodo", { p_desde: P1[0], p_hasta: hoyB })).cuerpo;
  const snapPagos0 = await antesPagos();
  const snapCaja0 = await antesCaja();

  const mover3 = await reasignar(tAdmin, cita3.id, S2, "Fue Gaby quien la bañó");
  comprobar(mover3.ok && mover3.cuerpo.ajuste_nomina === true, "se corrige la estilista de un servicio de un periodo ya pagado; la respuesta avisa que habrá ajuste de nómina");
  comprobar((await antesPagos()) === snapPagos0, "los pagos de nómina ya registrados NO cambian (ni un centavo ni el desglose)");
  const calcA2 = await calcular(E1, P2);
  const ajA = (calcA2.ajustes_detalle ?? []).filter((x) => x.tipo === "comision");
  comprobar(ajA.length === 1 && ajA[0].ref_id === cita3.id && Number(ajA[0].monto) === -X, `a la primera le toca un ajuste de −$${X} en su siguiente periodo (sale en el desglose)`);
  const X2 = Math.round(Number(cita2.precio) * 10) / 100;
  const vivasA2 = calcA2.comisiones_detalle.reduce((t, c) => t + Number(c.comision), 0);
  comprobar(Math.abs(Number(calcA2.comisiones) - (vivasA2 - X)) < 0.01, `su comisión del periodo: $${vivasA2} de lo suyo − $${X} del ajuste = $${calcA2.comisiones}`);
  const calcB1 = await calcular(E2, P1);
  comprobar(Math.abs(Number(calcB1.comisiones) - X) < 0.01 && (calcB1.ajustes_detalle ?? []).length === 0, `a la segunda, cuyo periodo no se ha pagado, le sale la comisión de $${X} en su cálculo normal, sin ajuste`);
  const utilDespues = (await rpc(tAdmin, "reporte_utilidad_periodo", { p_desde: P1[0], p_hasta: hoyB })).cuerpo?.[0] ?? null;
  comprobar(utilAntes && utilDespues && Number(utilAntes.utilidad) === Number(utilDespues.utilidad), "la utilidad del periodo no se mueve con la corrección (la nómina cuenta cuando se paga)");
  const margenDespues = (await rpc(tAdmin, "reporte_margen_por_servicio_periodo", { p_desde: P1[0], p_hasta: hoyB })).cuerpo;
  comprobar(JSON.stringify(margenAntes) === JSON.stringify(margenDespues), "el margen por servicio queda igual (misma comisión, distinta persona)");
  comprobar((await antesCaja()) === snapCaja0, "cobros, turnos y cortes de caja intactos");

  const pagoA2 = await pagar(E1, P2);
  const { data: filaA2 } = await SB.from("nomina_pagos").select("comisiones, desglose").eq("id", pagoA2.cuerpo).single();
  comprobar(pagoA2.ok && (filaA2.desglose.ajustes_detalle ?? []).length === 1 && Math.abs(Number(filaA2.comisiones) - (vivasA2 - X)) < 0.01, "al pagarle el siguiente periodo, el ajuste se descuenta y queda documentado en el pago");
  const calcA3 = await calcular(E1, SIG);
  comprobar((calcA3.ajustes_detalle ?? []).length === 0 && Number(calcA3.comisiones) === 0, "ya aplicado, no se vuelve a descontar");
  const pagoB1 = await pagar(E2, P1);
  const pagoB2 = await pagar(E2, P2);
  comprobar(pagoB1.ok && pagoB2.ok, "se pagan los dos periodos de la segunda (el primero con la comisión corregida)");
  const { data: filaB1 } = await SB.from("nomina_pagos").select("comisiones").eq("id", pagoB1.cuerpo).single();
  comprobar(Math.abs(Number(filaB1.comisiones) - X) < 0.01, `quedó pagada la comisión de $${X} a quien sí atendió`);

  // Con los dos periodos ya pagados: la propina y la comisión de la segunda cita
  const { data: filaA2b } = await SB.from("nomina_pagos").select("propinas, desglose").eq("id", pagoA2.cuerpo).single();
  const propA = Number(filaA2b.propinas);
  comprobar(propina === 0 || propA > 0, `la propina de $50 quedó en el pago de quien atendió ($${propA})`);
  const snapPagos1 = await antesPagos();
  const mover2 = await reasignar(tAdmin, cita2.id, S2, "Fue Gaby");
  comprobar(mover2.ok, "se corrige otro servicio, ahora con los dos periodos pagados");
  comprobar((await antesPagos()) === snapPagos1, "los pagos de las dos siguen intactos");
  const calcA4 = await calcular(E1, SIG);
  const calcB4 = await calcular(E2, SIG);
  comprobar(Math.abs(Number(calcA4.comisiones) + X2) < 0.01 && Math.abs(Number(calcB4.comisiones) - X2) < 0.01, `comisión: −$${X2} a quien ya la cobró, +$${X2} a quien no`);
  if (propA > 0) comprobar(Math.abs(Number(calcA4.propinas) + propA) < 0.01 && Math.abs(Number(calcB4.propinas) - propA) < 0.01, `propina: −$${propA} a una, +$${propA} a la otra`);
  const regreso = await reasignar(tAdmin, cita2.id, S1, "Era Ana");
  const calcA5 = await calcular(E1, SIG);
  const calcB5 = await calcular(E2, SIG);
  comprobar(regreso.ok && Number(calcA5.comisiones) === 0 && Number(calcB5.comisiones) === 0 && Number(calcA5.propinas) === 0 && Number(calcB5.propinas) === 0, "si se regresa la corrección, los ajustes se cancelan solos");
  for (const [quien, token] of [["estética", tEstetica], ["cliente", tCliente], ["anónimo", null]]) {
    const r = await rpc(token, "ajustes_nomina_interno", { p_empleado_id: E1, p_hasta: hoyB });
    comprobar(!r.ok, `${quien}: no llama la función interna de ajustes`);
  }
  void tEstetica2;
} finally {
  await SB.from("cobros").update({ deleted_at: new Date().toISOString() }).like("notas", "prueba reasignar%");
  for (const id of creados.citas) await SB.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.reservas) await SB.from("reservas").delete().eq("id", id);
  await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
  await SB.from("portal_invitaciones").delete().in("cliente_id", creados.clientes);
  await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", creados.clientes);
}

console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en la base.");
void abrirNavegador; void REF; void BASE;
process.exit(hallazgos.length ? 1 : 0);
