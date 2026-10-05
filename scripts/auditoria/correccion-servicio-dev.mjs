// Corregir el servicio de una cita (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/estetica/cargar-tarifas.mjs --negocio huellitas --tabla scripts/estetica/tablas/ludogteka.json --aplicar
//   node scripts/auditoria/correccion-servicio-dev.mjs
//
// 1. Causa de «El servicio de esta cita no existe»: un servicio dado de baja
//    ya no impide cancelar o cerrar una cita vieja; la cita guarda el nombre
//    con el que se registró; mover su fecha con un servicio retirado se
//    rechaza diciendo qué hacer.
// 2. Quién puede: admin, y recepción solo con el permiso «Corregir servicio de
//    citas»; estética, cliente y anónimo no; otro negocio no alcanza la cita;
//    el UPDATE directo a servicio_id se rechaza.
// 3. Abierta (sin cobro): vista previa sin cambiar nada, motivo obligatorio,
//    una sola línea en la cuenta (nada duplicado), historial.
// 4. Cerrada y cobrada con MÁS y con MENOS: cobro adicional / saldo a favor,
//    el cobro original intacto, el aviso de «Necesita atención» que se resuelve
//    solo al cobrar o devolver.
// 5. Terminal en cola o link abierto: la base rechaza hasta cancelarlo; un
//    cobro por confirmar bloquea siempre; un pago ya aprobado por Mercado
//    Pago no se toca y su devolución sigue siendo «Devolver con Mercado Pago».
// 6. Inventario (regresa lo del servicio anterior, consume lo del nuevo) y
//    nómina (el pago ya hecho no cambia; la diferencia sale como ajuste).
// 7. Historial inmutable y aislado entre negocios.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (cond, titulo) => (cond ? bien(titulo) : hallazgo(titulo));
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

const tAdmin = await tokenDe(datos.adminB);
const { data: recId } = await A.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
const tRecep = await tokenDe(recId);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);
const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recSinPermiso = recepciones.map((r) => r.profile_id).find((id) => id !== datos.recepcionB) ?? recId;
const tRecSin = await tokenDe(recSinPermiso);

const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const talla = (c) => tallas.find((t) => t.clave === c).id;
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const pelaje = (c) => pelajes.find((t) => t.clave === c).id;
const { data: servicios } = await SB.from("servicios").select("id, clave, nombre").eq("categoria", "estetica").is("deleted_at", null);
const srv = (c) => servicios.find((s) => s.clave === `estetica_${c}`).id;
const { data: razas } = await A.from("razas").select("id, nombre");
const raza = (n) => razas.find((r) => r.nombre === n)?.id;
const { data: hoyB } = await rpc(tAdmin, "fecha_negocio").then((r) => ({ data: r.cuerpo }));
const sumarDias = (f, n) => { const [y, m, d] = f.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

const creados = { perros: [], citas: [], reservas: [], ordenes: [], cobros: [], recetas: [] };
const sufijo = String(Date.now()).slice(-6);
const mkPerro = async (nombre, { porTalla = false } = {}) => {
  const { data, error } = await SB.from("perros").insert({
    cliente_id: datos.clienteSoloB, nombre: `ZZ corr ${nombre} ${sufijo}`, raza: porTalla ? "" : "Poodle", raza_id: porTalla ? null : raza("Poodle"),
    tamano_id: talla("chico"), pelaje_id: pelaje(porTalla ? "corto" : "medio"),
  }).select("id").single();
  if (error) throw new Error(`perro de prueba ${nombre}: ${error.message}`);
  creados.perros.push(data.id);
  return data.id;
};
let dia = 1000 + Math.floor(Math.random() * 20000);
const nuevaCita = async (perro, servicio, { fecha = null, estado = null, empleado = datos.esteticaB, hora = null } = {}) => {
  const rr = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
  const reservaId = rr.cuerpo?.[0]?.id;
  creados.reservas.push(reservaId);
  const f = fecha ?? sumarDias(hoyB, dia++);
  let r;
  for (let intento = 0; intento < 8; intento++) {
    const h = hora && intento === 0 ? hora : `${String(10 + Math.floor(Math.random() * 12)).padStart(2, "0")}:${String(Math.floor(Math.random() * 6) * 10).padStart(2, "0")}:00${fecha ? "Z" : "-06:00"}`;
    r = await llamar(`${URL}/rest/v1/citas_estetica`, {
      method: "POST", headers: cab(tAdmin),
      body: JSON.stringify({ reserva_id: reservaId, perro_id: perro, servicio_id: srv(servicio), empleado_id: empleado, inicio: `${f}T${h}`, ...(estado ? { estado } : {}) }),
    });
    if (r.ok || !/traslape/.test(r.mensaje)) break;
  }
  const fila = r.cuerpo?.[0];
  if (!r.ok || !fila?.id) throw new Error(`cita de prueba: ${r.mensaje}`);
  creados.citas.push(fila.id);
  return fila;
};
const cita = async (id) => (await SB.from("citas_estetica").select("*").eq("id", id).single()).data;
const cotizar = (token, id, servicio, extra = {}) => rpc(token, "cotizar_correccion_servicio", { p_cita_id: id, p_servicio_id: srv(servicio), ...extra });
const corregir = (token, id, servicio, motivo = "Se capturó otro servicio", extra = {}) => rpc(token, "corregir_servicio_cita", { p_cita_id: id, p_servicio_id: srv(servicio), p_motivo: motivo, ...extra });
const historial = async (token, id) => (await rpc(token, "historial_correcciones_servicio_cita", { p_cita_id: id })).cuerpo ?? [];
const lineas = async (reservaId) => (await SB.rpc("cuenta_lineas_reserva", { p_reserva_id: reservaId })).data ?? [];
const saldo = async (reservaId) => Number((await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: reservaId })).cuerpo?.[0]?.saldo ?? NaN);
const terminar = async (id) => (await rpc(tAdmin, "finalizar_cita_con_consumo", { p_cita_id: id, p_recogido_por_nombre: "Prueba", p_recogido_por_telefono: "4440000000", p_recogido_por_es_dueno: true, p_ajustes: [] })).ok;
const cobrar = (reservaId, monto, notas = "prueba corregir servicio") => rpc(tRecep, "registrar_cobro", { p_reserva_id: reservaId, p_notas: notas, p_metodos: [{ metodo: "efectivo", monto }] });
const pendientes = async (token = tRecep) => (await rpc(token, "ajustes_servicio_por_atender")).cuerpo ?? [];

try {
  // Restos de una corrida anterior: las citas de los perros «ZZ corr» pasan a canceladas (liberan la hora).
  const { data: viejos } = await SB.from("perros").select("id").like("nombre", "ZZ corr%");
  if (viejos?.length) await SB.from("citas_estetica").update({ estado: "cancelada" }).in("perro_id", viejos.map((p) => p.id)).in("estado", ["reservada", "confirmada"]);
  // Turno abierto en Huellitas para poder cobrar.
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) {
    const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRecep), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: "prueba corregir servicio" }) });
    turno = t.cuerpo?.[0];
  }
  comprobar(Boolean(turno), "hay un turno abierto para cobrar");
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_servicio" });

  // ── 1. Servicio dado de baja ──
  console.log("── 1. Una cita no queda atrapada por un servicio dado de baja");
  const perro = await mkPerro("base");
  const c1 = await nuevaCita(perro, "expres");
  comprobar(c1.servicio_nombre && /xpr/i.test(c1.servicio_nombre), `la cita guarda el nombre del servicio con el que se registró («${c1.servicio_nombre}»)`);
  const idExpres = srv("expres");
  await SB.from("servicios").update({ deleted_at: new Date().toISOString() }).eq("id", idExpres);
  try {
    const inicia = await llamar(`${URL}/rest/v1/citas_estetica?id=eq.${c1.id}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ estado: "en_curso" }) });
    comprobar(inicia.ok, `con el servicio dado de baja, la cita se puede iniciar («${inicia.mensaje.slice(0, 70)}»)`);
    comprobar(await terminar(c1.id), "y terminar");
    const mover = await llamar(`${URL}/rest/v1/citas_estetica?id=eq.${c1.id}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ inicio: `${sumarDias(hoyB, 650)}T10:00:00-06:00` }) });
    comprobar(!mover.ok && /Corregir servicio|ya no se ofrece/i.test(mover.mensaje), `moverle la fecha con el servicio retirado se rechaza diciendo qué hacer («${mover.mensaje.slice(0, 90)}»)`);
    const nuevaConRetirado = await llamar(`${URL}/rest/v1/citas_estetica`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ reserva_id: c1.reserva_id, perro_id: perro, servicio_id: idExpres, empleado_id: datos.esteticaB, inicio: `${sumarDias(hoyB, 700)}T10:00:00-06:00` }) });
    comprobar(!nuevaConRetirado.ok, "una cita NUEVA con un servicio retirado se sigue rechazando");
    const c1d = await cita(c1.id);
    comprobar(c1d.estado === "finalizada" && Number(c1d.precio) === Number(c1.precio), "y el precio con el que se registró no se movió");
    const fixed = await corregir(tAdmin, c1.id, "estetico", "El servicio retirado se cambia por el vigente");
    comprobar(fixed.ok && (await cita(c1.id)).servicio_nombre !== c1.servicio_nombre, `corregir el servicio de una cita con servicio retirado funciona${fixed.ok ? "" : ": " + fixed.mensaje}`);
  } finally {
    await SB.from("servicios").update({ deleted_at: null }).eq("id", idExpres);
  }

  // ── 2. Quién puede ──
  console.log("── 2. Permiso «Corregir servicio de citas»");
  const perro2 = await mkPerro("permiso");
  const c2 = await nuevaCita(perro2, "estetico");
  for (const [quien, token] of [["recepción sin el permiso", tRecSin], ["estética", tEstetica], ["cliente", tCliente], ["anónimo", null]]) {
    const q = await cotizar(token, c2.id, "rapado");
    const r = await corregir(token, c2.id, "rapado");
    comprobar(!q.ok && !r.ok && (await cita(c2.id)).servicio_id === srv("estetico"), `${quien}: no cotiza ni corrige`);
  }
  const directo = await llamar(`${URL}/rest/v1/citas_estetica?id=eq.${c2.id}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ servicio_id: srv("rapado") }) });
  comprobar(!directo.ok && (await cita(c2.id)).servicio_id === srv("estetico"), `el UPDATE directo a servicio_id se rechaza, ni siendo admin («${directo.mensaje.slice(0, 70)}»)`);
  const directoSecreta = await SB.from("citas_estetica").update({ servicio_id: srv("rapado") }).eq("id", c2.id);
  comprobar(Boolean(directoSecreta.error) && (await cita(c2.id)).servicio_id === srv("estetico"), "tampoco con la secret key por la API");
  const cruzada = await rpc(tAdmin, "corregir_servicio_cita", { p_cita_id: c2.id, p_servicio_id: srv("rapado"), p_motivo: "x" }, LUDOGTEKA);
  comprobar(!cruzada.ok && (await cita(c2.id)).servicio_id === srv("estetico"), "con el encabezado de otro negocio no se alcanza la cita");
  const mp0 = await rpc(tRecSin, "mis_permisos");
  comprobar(mp0.ok && !mp0.cuerpo.includes("corregir_servicio"), "recepción no trae el permiso por omisión");
  const otorga = await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_servicio" });
  comprobar(otorga.ok, `admin le da el permiso a una recepcionista${otorga.ok ? "" : ": " + otorga.mensaje}`);
  const mp1 = await rpc(tRecSin, "mis_permisos");
  comprobar(mp1.ok && mp1.cuerpo.includes("corregir_servicio") && !mp1.cuerpo.includes("nomina") && !mp1.cuerpo.includes("corregir_estilista"), "mis_permisos lo trae, sin dar otros");

  // ── 3. Cita abierta, sin cobro ──
  console.log("── 3. Cita abierta: vista previa, motivo, una sola línea");
  const antes = await cita(c2.id);
  const q = await cotizar(tRecSin, c2.id, "rapado");
  comprobar(q.ok && q.cuerpo.ok && Number(q.cuerpo.precio_actual) === 390 && Number(q.cuerpo.precio_nuevo) === 320 && Number(q.cuerpo.diferencia) === -70, `la vista previa dice $390 → $320 (−$70)${q.ok ? "" : ": " + q.mensaje}`);
  const despuesQ = await cita(c2.id);
  comprobar(despuesQ.servicio_id === antes.servicio_id && Number(despuesQ.precio) === Number(antes.precio) && despuesQ.updated_at === antes.updated_at, "la vista previa NO cambia nada de la cita");
  comprobar((await historial(tAdmin, c2.id)).length === 0, "ni deja historial");
  const sinMotivo = await corregir(tRecSin, c2.id, "rapado", "   ");
  comprobar(!sinMotivo.ok && /motivo/i.test(sinMotivo.mensaje) && (await cita(c2.id)).servicio_id === srv("estetico"), "el motivo es obligatorio");
  const mismo = await corregir(tRecSin, c2.id, "estetico");
  comprobar(!mismo.ok && /mismo servicio/i.test(mismo.mensaje), "el mismo servicio se rechaza");
  const caduco = await corregir(tRecSin, c2.id, "rapado", "Cambio", { p_precio_esperado: 999 });
  comprobar(!caduco.ok && /precio cambió/i.test(caduco.mensaje) && (await cita(c2.id)).servicio_id === srv("estetico"), "si el precio ya no es el que viste, no cambia nada");
  const ok2 = await corregir(tRecSin, c2.id, "rapado", "Era rapado, no baño completo", { p_precio_esperado: 320 });
  comprobar(ok2.ok && ok2.cuerpo.tipo_ajuste === "ninguno" && Number(ok2.cuerpo.precio_nuevo) === 320, `con el permiso corrige: $390 → $320, sin cobro de por medio${ok2.ok ? "" : ": " + ok2.mensaje}`);
  const c2d = await cita(c2.id);
  comprobar(c2d.servicio_id === srv("rapado") && Number(c2d.precio) === 320 && /rapado/i.test(c2d.servicio_nombre), "la cita quedó con el servicio, el precio y el nombre nuevos");
  const l2 = (await lineas(c2.reserva_id)).filter((l) => l.tipo === "estetica");
  comprobar(l2.length === 1 && Number(l2[0].total) === 320, "la cuenta tiene UNA línea de la cita, por $320 (nada duplicado)");
  const h2 = await historial(tRecep, c2.id);
  comprobar(h2.length === 1 && h2[0].servicio_anterior !== h2[0].servicio_nuevo && Number(h2[0].precio_anterior) === 390 && Number(h2[0].precio_nuevo) === 320 && h2[0].motivo === "Era rapado, no baño completo" && h2[0].por_nombre !== "Alguien del equipo" && h2[0].estado_cita === "reservada", "el historial guarda servicio y precio anterior y nuevo, motivo, quién y el estado");
  const perroCorto = await mkPerro("pelocorto");
  await SB.from("perros").update({ pelaje_id: pelaje("corto") }).eq("id", perroCorto);
  const cPelo = await nuevaCita(perroCorto, "estetico");
  const qPelo = await cotizar(tAdmin, cPelo.id, "rapado");
  comprobar(qPelo.ok && !qPelo.cuerpo.ok && /pelaje|pelo/i.test(qPelo.cuerpo.error ?? ""), `respeta las reglas de pelaje: «${(qPelo.cuerpo?.error ?? qPelo.mensaje).slice(0, 80)}…»`);
  const cCancelada = await nuevaCita(perro2, "estetico", { estado: "cancelada" }).catch(() => null);
  if (cCancelada) comprobar(!(await corregir(tAdmin, cCancelada.id, "rapado")).ok, "una cita cancelada no se corrige");

  // ── 4. Cerrada y cobrada: más y menos ──
  console.log("── 4. Cerrada y cobrada: cobro adicional y saldo a favor");
  const perro3 = await mkPerro("mas");
  const c3 = await nuevaCita(perro3, "expres", { estado: "en_curso" });
  comprobar(await terminar(c3.id), "se termina una cita de exprés ($190)");
  const cob3 = await cobrar(c3.reserva_id, 190);
  comprobar(cob3.ok && (await saldo(c3.reserva_id)) === 0, `se cobra completa${cob3.ok ? "" : ": " + cob3.mensaje}`);
  const huella = async (cobroId) => JSON.stringify((await SB.from("cobro_metodos").select("id, metodo, monto, propina, cobro_id").eq("cobro_id", cobroId)).data);
  const cobroOrig = await huella(cob3.cuerpo);
  const q3 = await cotizar(tRecSin, c3.id, "estetico");
  comprobar(q3.ok && q3.cuerpo.ok && Number(q3.cuerpo.diferencia) === 200 && q3.cuerpo.tipo_ajuste === "cobro_adicional" && Number(q3.cuerpo.saldo_despues) === 200, `la vista previa: +$200, queda un cobro adicional de $200${q3.ok ? "" : ": " + q3.mensaje}`);
  comprobar(!(await corregir(tRecSin, c3.id, "estetico", "")).ok, "cerrada: sin motivo no se corrige");
  const m3 = await corregir(tRecSin, c3.id, "estetico", "Se bañó completo, no exprés", { p_precio_esperado: 390 });
  comprobar(m3.ok && m3.cuerpo.tipo_ajuste === "cobro_adicional" && Number(m3.cuerpo.saldo_despues) === 200, `cerrada y cobrada, más cara: queda saldo por cobrar de $200${m3.ok ? "" : ": " + m3.mensaje}`);
  comprobar((await huella(cob3.cuerpo)) === cobroOrig, "el cobro original NO se tocó (mismo monto, mismo método)");
  const p3 = (await pendientes()).find((x) => x.cita_id === c3.id);
  comprobar(p3 && p3.tipo_ajuste === "cobro_adicional" && Number(p3.saldo) === 200 && p3.servicio_anterior && p3.servicio_nuevo, "sale en «Necesita atención» (ajustes pendientes) como cobro adicional");
  const lc3 = (await lineas(c3.reserva_id)).filter((l) => l.tipo === "estetica");
  comprobar(lc3.length === 1 && Number(lc3[0].total) === 390, "la cuenta tiene una sola línea por $390; nada de dos cobros");
  const cobra2 = await cobrar(c3.reserva_id, 200, "prueba corregir servicio (adicional)");
  comprobar(cobra2.ok && (await saldo(c3.reserva_id)) === 0, "se cobra el adicional con el cobro normal de siempre");
  comprobar(!(await pendientes()).some((x) => x.cita_id === c3.id), "y el aviso desaparece solo");
  const h3 = await historial(tRecep, c3.id);
  comprobar(h3[0]?.estado_cita === "finalizada" && Number(h3[0].diferencia) === 200 && h3[0].tipo_ajuste === "cobro_adicional", "el historial dice «terminada», +$200 y cobro adicional");
  const turnoOrig = (await SB.from("cobros").select("turno_id").eq("id", cob3.cuerpo).single()).data.turno_id;
  comprobar(Boolean(turnoOrig), "cada cobro entra al turno en el que se hizo (el original conserva el suyo)");

  const perro4 = await mkPerro("menos");
  const c4 = await nuevaCita(perro4, "estetico", { estado: "en_curso" });
  comprobar(await terminar(c4.id), "se termina una cita de baño completo ($390)");
  const cob4 = await cobrar(c4.reserva_id, 390);
  comprobar(cob4.ok, "se cobra completa");
  const m4 = await corregir(tAdmin, c4.id, "expres", "Era exprés");
  comprobar(m4.ok && m4.cuerpo.tipo_ajuste === "saldo_a_favor" && Number(m4.cuerpo.saldo_despues) === -200, `cerrada y cobrada, más barata: $200 de saldo a favor${m4.ok ? "" : ": " + m4.mensaje}`);
  const p4 = (await pendientes()).find((x) => x.cita_id === c4.id);
  comprobar(p4 && p4.tipo_ajuste === "saldo_a_favor" && Number(p4.saldo) === -200, "sale en ajustes pendientes como saldo a favor por devolver");
  const dev = await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cob4.cuerpo, p_motivo: "Corrección de servicio", p_metodos: [{ metodo: "efectivo", monto: 200 }] });
  comprobar(dev.ok && (await saldo(c4.reserva_id)) === 0, `admin devuelve los $200 con la devolución de siempre${dev.ok ? "" : ": " + dev.mensaje}`);
  comprobar(!(await pendientes()).some((x) => x.cita_id === c4.id), "y el aviso desaparece solo");
  for (const [quien, token] of [["cliente", tCliente], ["anónimo", null]]) {
    const r = await rpc(token, "ajustes_servicio_por_atender");
    comprobar(!r.ok || (r.cuerpo ?? []).length === 0, `${quien}: no ve los ajustes pendientes`);
  }

  // ── 5. Cobros en curso y pagos de Mercado Pago ──
  console.log("── 5. Terminal en cola, link abierto, por confirmar y pago aprobado");
  const perro5 = await mkPerro("ordenes");
  const c5 = await nuevaCita(perro5, "estetico");
  const orden = async (tipo, estado, reservaId = c5.reserva_id, extra = {}) => {
    const { data, error } = await SB.from("mp_ordenes").insert({
      negocio_id: B, proveedor: "mercadopago", tipo, reserva_id: reservaId, monto: 390, descripcion: "prueba corregir servicio", estado, simulado: true,
      expira_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), ...extra,
    }).select("id").single();
    if (error) throw new Error(`orden: ${error.message}`);
    creados.ordenes.push(data.id);
    return data.id;
  };
  const oT = await orden("point", "en_terminal");
  const qT = await cotizar(tAdmin, c5.id, "rapado");
  comprobar(qT.ok && Array.isArray(qT.cuerpo.ordenes_abiertas) && qT.cuerpo.ordenes_abiertas.some((o) => o.id === oT), "la vista previa lista el cobro en la terminal que hay que cancelar");
  const rT = await corregir(tAdmin, c5.id, "rapado");
  comprobar(!rT.ok && /terminal/i.test(rT.mensaje) && (await cita(c5.id)).servicio_id === srv("estetico"), `con un cobro en la terminal la base NO corrige («${rT.mensaje.slice(0, 80)}»)`);
  await SB.from("mp_ordenes").update({ estado: "cancelada", detalle_error: "Cancelado por corrección de servicio" }).eq("id", oT);
  const oL = await orden("link", "creada");
  const rL = await corregir(tAdmin, c5.id, "rapado");
  comprobar(!rL.ok && /link/i.test(rL.mensaje), "con un link de pago abierto tampoco");
  await SB.from("mp_ordenes").update({ expira_at: new Date(Date.now() - 3600_000).toISOString() }).eq("id", oL);
  const oC = await orden("point", "por_confirmar");
  const rC = await corregir(tAdmin, c5.id, "rapado");
  comprobar(!rC.ok && /por confirmar/i.test(rC.mensaje), "un cobro por confirmar bloquea hasta revisarlo con el proveedor");
  const qC = await cotizar(tAdmin, c5.id, "rapado");
  comprobar(qC.ok && !qC.cuerpo.ok && (qC.cuerpo.bloqueos ?? []).some((b) => /por confirmar/i.test(b)), `y la vista previa lo avisa${qC.ok ? "" : ": " + qC.mensaje} ${JSON.stringify(qC.cuerpo?.bloqueos)}`);
  await SB.from("mp_ordenes").update({ estado: "cancelada" }).eq("id", oC);
  const r6 = await corregir(tAdmin, c5.id, "rapado", "Era rapado", { p_ordenes_canceladas: [{ id: oT, tipo: "point" }, { id: oC, tipo: "point" }] });
  comprobar(r6.ok, `cancelada la orden, la corrección pasa${r6.ok ? "" : ": " + r6.mensaje}`);
  comprobar((await historial(tAdmin, c5.id)).length === 1, "y queda en el historial");
  const { data: kRow } = await SB.from("citas_estetica_correcciones").select("ordenes_canceladas").eq("cita_id", c5.id).single();
  comprobar(Array.isArray(kRow.ordenes_canceladas) && kRow.ordenes_canceladas.length === 2, "con las órdenes que se cancelaron");

  // Pago aprobado por Mercado Pago: no se toca; su devolución es la integrada.
  const perro6 = await mkPerro("mp");
  const c6 = await nuevaCita(perro6, "estetico", { estado: "en_curso" });
  await terminar(c6.id);
  const cobMp = await SB.from("cobros").insert({ reserva_id: c6.reserva_id, turno_id: turno.id, notas: "prueba corregir servicio MP", origen: "mercadopago_point" }).select("id").single();
  if (cobMp.error) throw new Error(`cobro MP: ${cobMp.error.message}`);
  creados.cobros.push(cobMp.data.id);
  await SB.from("cobro_metodos").insert({ cobro_id: cobMp.data.id, metodo: "terminal", monto: 390, propina: 0 });
  const oPag = await orden("point", "pagada", c6.reserva_id, { cobro_id: cobMp.data.id });
  const m6 = await corregir(tAdmin, c6.id, "expres", "Era exprés");
  comprobar(m6.ok && m6.cuerpo.tipo_ajuste === "saldo_a_favor", `una orden ya pagada no bloquea, y deja saldo a favor${m6.ok ? "" : ": " + m6.mensaje}`);
  const ordenIntacta = (await SB.from("mp_ordenes").select("estado, cobro_id, monto").eq("id", oPag).single()).data;
  comprobar(ordenIntacta.estado === "pagada" && ordenIntacta.cobro_id === cobMp.data.id && Number(ordenIntacta.monto) === 390, "la orden pagada y su cobro quedan exactamente igual");
  const devMp = await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cobMp.data.id, p_motivo: "x", p_metodos: [{ metodo: "terminal", monto: 200 }] });
  comprobar(!devMp.ok && /Devolver con Mercado Pago/i.test(devMp.mensaje), "la devolución de un cobro de Mercado Pago solo va por «Devolver con Mercado Pago»");

  // ── 6. Inventario y nómina ──
  console.log("── 6. Inventario y nómina");
  const { data: insumo } = await SB.from("insumos").select("id, unidad_consumo_id").not("unidad_consumo_id", "is", null).is("deleted_at", null).limit(1).maybeSingle();
  if (insumo) {
    const mkReceta = async (servicio, cantidad) => {
      const { data, error } = await SB.from("recetas_consumo").insert({ servicio_id: srv(servicio), tamano_id: talla("chico"), insumo_id: insumo.id, cantidad_consumo: cantidad }).select("id").single();
      if (!error) creados.recetas.push(data.id);
      return !error;
    };
    if ((await mkReceta("expres", 2)) && (await mkReceta("estetico", 5))) {
      // Un perro cuyo precio depende de la talla (grupo «Por talla»): solo ahí la cita lleva talla y se aplica la receta.
      const perro7 = await mkPerro("inventario", { porTalla: true });
      const c7 = await nuevaCita(perro7, "expres", { estado: "en_curso" });
      await terminar(c7.id);
      const consumoDe = async () => (await SB.from("movimientos_inventario").select("tipo, cantidad_base, insumo_id, motivo").eq("cita_estetica_id", c7.id).is("deleted_at", null)).data ?? [];
      const antesInv = await consumoDe();
      comprobar(antesInv.length === 1 && antesInv[0].tipo === "salida_consumo", "el servicio terminado consumió su receta");
      const m7 = await corregir(tAdmin, c7.id, "estetico", "Era baño completo");
      const despuesInv = await consumoDe();
      comprobar(m7.ok && despuesInv.length === 3 && despuesInv.some((m) => m.tipo === "ajuste_positivo" && Number(m.cantidad_base) === Number(antesInv[0].cantidad_base)) && despuesInv.filter((m) => m.tipo === "salida_consumo").length === 2, `regresa lo del servicio anterior (ajuste) y consume lo del nuevo; lo ya registrado no se reescribe${m7.ok ? "" : ": " + m7.mensaje}`);
      comprobar(m7.ok && m7.cuerpo.inventario?.regresados === 1 && m7.cuerpo.inventario?.consumidos === 1, "la respuesta cuenta lo que movió");
      await corregir(tAdmin, c7.id, "expres", "Era exprés otra vez");
      const neto = (await consumoDe()).reduce((t, m) => t + (m.tipo === "salida_consumo" ? 1 : m.tipo === "ajuste_positivo" ? -1 : 0) * Number(m.cantidad_base), 0);
      comprobar(neto >= 0, "una segunda corrección tampoco deja el inventario en negativo");
    } else console.log("  · (no se pudo armar la receta de prueba: se omite la parte de inventario)");
  } else console.log("  · (Huellitas no tiene insumos con unidad de consumo: se omite la parte de inventario)");

  // Nómina: el pago ya registrado no cambia; la diferencia sale como ajuste.
  const S2 = datos.esteticaAmbos;
  await SB.from("empleados").update({ deleted_at: new Date().toISOString() }).eq("profile_id", S2).like("nombre", "Prueba%").is("deleted_at", null);
  const e = await SB.from("empleados").insert({ nombre: `Prueba corregir A ${sufijo}`, puesto: "Estilista", fecha_ingreso: sumarDias(hoyB, -60), telefono: "4440000000", emergencia_nombre: "Contacto", emergencia_telefono: "4441111111", profile_id: S2 }).select("id").single();
  if (e.error) throw new Error(`empleado: ${e.error.message}`);
  const E1 = e.data.id;
  await SB.from("esquemas_pago").insert({ empleado_id: E1, vigente_desde: sumarDias(hoyB, -59), con_comision: true, comision_tipo: "porcentaje", comision_valor: 10 });
  const P1 = [sumarDias(hoyB, -1), sumarDias(hoyB, -1)];
  const SIG = [sumarDias(hoyB, 1), sumarDias(hoyB, 7)];
  const perro8 = await mkPerro("nomina");
  const c8 = await nuevaCita(perro8, "estetico", { fecha: sumarDias(hoyB, -1), hora: `${String(10 + Math.floor(Math.random() * 12)).padStart(2, "0")}:${String(Math.floor(Math.random() * 6) * 10).padStart(2, "0")}:00Z`, estado: "en_curso", empleado: S2 });
  comprobar(await terminar(c8.id), "se termina un servicio de ayer ($390) de una estilista con 10 % de comisión");
  const pago = await rpc(tAdmin, "registrar_pago_nomina", { p_empleado_id: E1, p_desde: P1[0], p_hasta: P1[1], p_metodo: "efectivo", p_fecha_pago: hoyB, p_notas: null });
  comprobar(pago.ok, `se paga el periodo de ayer${pago.ok ? "" : ": " + pago.mensaje}`);
  const pagos = async () => JSON.stringify((await SB.from("nomina_pagos").select("id, total, comisiones, desglose").eq("empleado_id", E1)).data);
  const pagoAntes = await pagos();
  const m8 = await corregir(tAdmin, c8.id, "expres", "Era exprés");
  comprobar(m8.ok && m8.cuerpo.ajuste_nomina === true, `la respuesta avisa que habrá ajuste de nómina${m8.ok ? "" : ": " + m8.mensaje}`);
  comprobar((await pagos()) === pagoAntes, "el pago de nómina ya registrado NO cambia");
  const calc = (await rpc(tAdmin, "calcular_nomina", { p_empleado_id: E1, p_desde: SIG[0], p_hasta: SIG[1] })).cuerpo;
  const aj = (calc.ajustes_detalle ?? []).filter((x) => x.tipo === "comision");
  comprobar(aj.length === 1 && aj[0].ref_id === c8.id && Math.abs(Number(aj[0].monto) + 20) < 0.01, `en su siguiente periodo sale un ajuste de −$20 (10 % de la diferencia de $200)${aj.length ? " (" + aj[0].monto + ")" : ""}`);

  // ── 7. Historial inmutable y aislado ──
  console.log("── 7. Historial inmutable y aislado entre negocios");
  const { data: filas } = await SB.from("citas_estetica_correcciones").select("id").eq("cita_id", c2.id).limit(1);
  const upd = await SB.from("citas_estetica_correcciones").update({ motivo: "reescrito" }).eq("id", filas[0].id);
  comprobar(Boolean(upd.error), "el historial no se edita, ni con la secret key");
  const baja = await SB.from("citas_estetica_correcciones").update({ deleted_at: new Date().toISOString() }).eq("id", filas[0].id);
  comprobar(Boolean(baja.error), "ni se da de baja");
  for (const [quien, token] of [["cliente", tCliente], ["anónimo", null]]) {
    const t = await get(token, "citas_estetica_correcciones?select=id");
    comprobar(!t.ok || t.cuerpo.length === 0, `${quien}: la tabla del historial sale vacía`);
    const h = await rpc(token, "historial_correcciones_servicio_cita", { p_cita_id: c2.id });
    comprobar(!h.ok || (h.cuerpo ?? []).length === 0, `${quien}: la función del historial no devuelve nada`);
  }
  const escribe = await llamar(`${URL}/rest/v1/citas_estetica_correcciones`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cita_id: c2.id, servicio_nuevo_id: srv("rapado"), servicio_anterior_nombre: "a", servicio_nuevo_nombre: "b", precio_anterior: 1, precio_nuevo: 2, diferencia: 1, estado_cita: "reservada", motivo: "x", tipo_ajuste: "ninguno" }) });
  comprobar(!escribe.ok, "nadie escribe el historial directo (solo la función)");
  const otro = await get(tAdmin, "citas_estetica_correcciones?select=id", LUDOGTEKA);
  comprobar(!otro.ok || otro.cuerpo.length === 0, "un admin de Huellitas no lee historiales de otro negocio");
  const hOtro = await rpc(tAdmin, "historial_correcciones_servicio_cita", { p_cita_id: c2.id }, LUDOGTEKA);
  comprobar(!hOtro.ok || (hOtro.cuerpo ?? []).length === 0, "ni por la función");
  for (const fn of ["corregir_servicio_cita", "cotizar_correccion_servicio", "ordenes_abiertas_de_reservas", "ajustes_servicio_por_atender", "historial_correcciones_servicio_cita"]) {
    const r = await llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, "Content-Type": "application/json" }, body: "{}" });
    comprobar(!r.ok, `la llave anónima pelada no ejecuta ${fn}`);
  }
  const rev = await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "corregir_servicio" });
  const otraVez = await corregir(tRecSin, c2.id, "estetico", "Otra vez");
  comprobar(rev.ok && !otraVez.ok, "al quitarle el permiso, se le vuelve a rechazar");
} finally {
  await SB.from("servicios").update({ deleted_at: null }).eq("clave", "estetica_expres");
  await SB.from("cobros").update({ deleted_at: new Date().toISOString() }).like("notas", "prueba corregir servicio%");
  for (const id of creados.ordenes) await SB.from("mp_ordenes").delete().eq("id", id);
  for (const id of creados.recetas) await SB.from("recetas_consumo").delete().eq("id", id);
  await SB.from("empleados").update({ deleted_at: new Date().toISOString() }).like("nombre", "Prueba corregir%").is("deleted_at", null);
  await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
}

console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
