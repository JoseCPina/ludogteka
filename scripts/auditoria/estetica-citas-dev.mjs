// Citas de estética: reprogramar, cancelar / «no se presentó», eliminar (con
// historial), y la tarifa «Cliente de guardería» (SOLO DESARROLLO, Huellitas).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/estetica-citas-dev.mjs
//
// 1. Reprogramar: solo reservada/confirmada, sin cobro, sin empalmes con la
//    estilista, sin fecha pasada; el precio NO se vuelve a cotizar; queda en el
//    historial; el UPDATE directo a la fecha se rechaza (la llave de servicio, no).
// 2. Cancelar y «no se presentó»: el motivo de la cancelación es obligatorio, el
//    horario se libera, una cita con cobro pasa primero por la anulación.
// 3. Eliminar: permiso «Eliminar citas», no se borra la fila, no en curso/terminada.
// 4. Historial con nombres, del más nuevo al más viejo.
// 5. Tarifa de guardería: apagada por omisión; con ella, un perro de guardería paga
//    el precio del exprés como TARIFA (no descuento), quitarla/ponerla pide el
//    permiso de excepciones y motivo, el precio se congela, y la cuenta lo dice.
// 6. Quién no puede (estética de otra cita, cliente, anónimo, otro negocio).
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

const tAdmin = await tokenDe(datos.adminB);
const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
if (recepciones.length < 2) throw new Error("Huellitas necesita al menos dos recepcionistas (corre negocio-prueba-dev.mjs).");
const idRecepA = recepciones[0].profile_id;
const idRecepB = recepciones[1].profile_id;
const tRecA = await tokenDe(idRecepA);
const tRecB = await tokenDe(idRecepB);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);
const hoy = (await rpc(tAdmin, "fecha_negocio")).cuerpo;
const suma = (dias) => new Date(new Date(`${hoy}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);

const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const { data: razas } = await A.from("razas").select("id, nombre");
const talla = (c) => tallas.find((t) => t.clave === c).id;
const pelaje = (c) => pelajes.find((t) => t.clave === c).id;
const { data: servicios } = await SB.from("servicios").select("id, clave").eq("categoria", "estetica").is("deleted_at", null);
const srv = (c) => servicios.find((s) => s.clave === `estetica_${c}`).id;

const sufijo = String(Date.now()).slice(-6);
const creados = { perros: [], reservas: [], citas: [] };
const mkPerro = async (nombre) => {
  const { data, error } = await SB.from("perros").insert({
    cliente_id: datos.clienteSoloB, nombre: `ZZ citas ${nombre} ${sufijo}`, raza: "Poodle", raza_id: razas.find((r) => r.nombre === "Poodle").id,
    tamano_id: talla("chico"), pelaje_id: pelaje("medio"),
  }).select("id").single();
  if (error) throw new Error(`perro ${nombre}: ${error.message}`);
  creados.perros.push(data.id);
  return data.id;
};
let contadorDia = 700 + Math.floor(Math.random() * 400);
const nuevaReserva = async () => {
  const rr = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
  const id = rr.cuerpo?.[0]?.id;
  if (!id) throw new Error(`reserva: ${rr.mensaje}`);
  creados.reservas.push(id);
  return id;
};
// Una cita en un día lejano (sin empalmes entre corridas) a la hora dada.
const nuevaCita = async (token, perro, servicio, { dia = (contadorDia += 7), hora = "10:00", empleado = datos.esteticaB, extra = {} } = {}) => {
  const reserva = await nuevaReserva();
  const r = await llamar(`${URL}/rest/v1/citas_estetica`, {
    method: "POST", headers: cab(token),
    body: JSON.stringify({ reserva_id: reserva, perro_id: perro, servicio_id: srv(servicio), empleado_id: empleado, inicio: `${suma(dia)}T${hora}:00-06:00`, ...extra }),
  });
  const fila = r.cuerpo?.[0];
  if (r.ok && fila?.id) creados.citas.push(fila.id);
  else if (!extra.tarifa_guarderia_modo) console.log(`    (la cita de prueba no se creó: ${r.mensaje})`);
  return { ok: r.ok, mensaje: r.mensaje, fila, reserva, dia };
};
const fila = async (id) => (await SB.from("citas_estetica").select("*").eq("id", id).single()).data;
const cambios = async (id) => (await SB.from("citas_estetica_cambios").select("*").eq("cita_id", id).order("created_at")).data ?? [];
const dar = (profile, permiso) => rpc(tAdmin, "otorgar_permiso", { p_profile_id: profile, p_permiso: permiso });
const quitar = (profile, permiso) => rpc(tAdmin, "revocar_permiso", { p_profile_id: profile, p_permiso: permiso });
const turnoAbierto = async () => (await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;

try {
  for (const p of ["eliminar_citas", "excepciones_reserva", "tarifas", "anular_cobros"]) { await dar(idRecepB, p); await quitar(idRecepB, p); await dar(idRecepA, p); await quitar(idRecepA, p); }
  if (!(await turnoAbierto())) {
    const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRecA), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: "prueba citas" }) });
    if (!t.ok) throw new Error(`abrir turno: ${t.mensaje}`);
  }
  // Estado limpio: tarifa apagada.
  await rpc(tAdmin, "guardar_tarifa_guarderia", { p_activa: false, p_servicio_tarifa: null, p_servicios: [], p_dias: 60 });

  const poodle = await mkPerro("poodle");

  // ── 1. Reprogramar ──
  console.log("── 1. Reprogramar");
  const c1 = await nuevaCita(tRecA, poodle, "estetico");
  comprobar(c1.ok && Number(c1.fila.precio) === 390, `cita de prueba a $390 (${c1.mensaje || "ok"})`);
  const f1 = suma(c1.dia + 3);
  const r1 = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: c1.fila.id, p_inicio: `${f1}T12:00:00-06:00`, p_motivo: "La clienta pidió otro día" });
  comprobar(r1.ok, `recepción la reprograma (${r1.mensaje || "ok"})`);
  const d1 = await fila(c1.fila.id);
  comprobar(new Date(d1.inicio).toISOString() === new Date(`${f1}T12:00:00-06:00`).toISOString() && new Date(d1.fin) > new Date(d1.inicio), "la hora cambia y el fin se recalcula");
  comprobar(Number(d1.precio) === 390, "el precio NO se vuelve a cotizar");
  const h1 = await cambios(c1.fila.id);
  comprobar(h1.length === 1 && h1[0].tipo === "reprogramacion" && h1[0].hecha_por === idRecepA && /otro día/.test(h1[0].motivo) && h1[0].inicio_antes !== h1[0].inicio_despues,
    "queda en el historial: antes, después, motivo y quién");
  comprobar(r1.cuerpo?.cliente_telefono && r1.cuerpo?.perro_nombre, "devuelve el teléfono del cliente para avisarle por WhatsApp");
  const mismo = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: c1.fila.id, p_inicio: `${f1}T12:00:00-06:00` });
  comprobar(!mismo.ok && /misma|ya es/i.test(mismo.mensaje), "la misma fecha y hora se rechaza");
  const pasado = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: c1.fila.id, p_inicio: `${suma(-2)}T10:00:00-06:00` });
  comprobar(!pasado.ok && /ya pasó/.test(pasado.mensaje), "una fecha que ya pasó se rechaza");
  const directo = await llamar(`${URL}/rest/v1/citas_estetica?id=eq.${c1.fila.id}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ inicio: `${suma(c1.dia + 5)}T09:00:00-06:00` }) });
  comprobar(!directo.ok && /Reprogramar/.test(directo.mensaje), `el UPDATE directo a la fecha se rechaza («${directo.mensaje.slice(0, 70)}»)`);
  const servicio = await SB.from("citas_estetica").update({ notas: "nota por llave de servicio" }).eq("id", c1.fila.id);
  comprobar(!servicio.error, "las notas y demás campos siguen editables");

  // Empalme con otra cita de la misma estilista.
  const c2 = await nuevaCita(tRecA, await mkPerro("empalme"), "estetico", { dia: c1.dia + 3, hora: "18:00" });
  const empalme = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: c2.fila.id, p_inicio: `${f1}T12:30:00-06:00` });
  comprobar(!empalme.ok && /empalma/.test(empalme.mensaje), `un empalme con la estilista se rechaza con un mensaje claro («${empalme.mensaje.slice(0, 80)}»)`);
  const sinEmpalme = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: c2.fila.id, p_inicio: `${f1}T16:30:00-06:00` });
  comprobar(sinEmpalme.ok, "y a otra hora libre sí");

  // Estado y cobro.
  const c3 = await nuevaCita(tRecA, await mkPerro("enCurso"), "estetico");
  await SB.from("citas_estetica").update({ estado: "en_curso" }).eq("id", c3.fila.id);
  const enCurso = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: c3.fila.id, p_inicio: `${suma(c3.dia + 2)}T10:00:00-06:00` });
  comprobar(!enCurso.ok && /todavía no empieza/.test(enCurso.mensaje), "una cita en curso no se reprograma");
  const c4 = await nuevaCita(tRecA, await mkPerro("cobrada"), "estetico");
  const cobro = await rpc(tRecA, "registrar_cobro", { p_reserva_id: c4.reserva, p_notas: "prueba citas", p_metodos: [{ metodo: "efectivo", monto: 390, propina: 0 }] });
  comprobar(cobro.ok, `cobro de la cita (${cobro.mensaje || "ok"})`);
  const conCobro = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: c4.fila.id, p_inicio: `${suma(c4.dia + 2)}T10:00:00-06:00` });
  comprobar(!conCobro.ok && /cobro/.test(conCobro.mensaje) && /Anula el cobro/.test(conCobro.mensaje), "una cita COBRADA no se reprograma: pide anular el cobro primero");
  const cancelaCobrada = await rpc(tRecA, "cancelar_cita_estetica", { p_cita_id: c4.fila.id, p_motivo: "ya no viene" });
  comprobar(!cancelaCobrada.ok && /Anula el cobro/.test(cancelaCobrada.mensaje), "ni se cancela");
  await dar(idRecepA, "anular_cobros");
  const anula = await rpc(tRecA, "anular_cobro", { p_cobro_id: cobro.cuerpo, p_motivo: "Se cobró antes de tiempo" });
  comprobar(anula.ok, `se anula el cobro (${anula.mensaje || "ok"})`);
  const tras = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: c4.fila.id, p_inicio: `${suma(c4.dia + 2)}T10:00:00-06:00` });
  comprobar(tras.ok, "con el cobro anulado, ya se reprograma");
  await quitar(idRecepA, "anular_cobros");

  // ── 2. Cancelar y «no se presentó» ──
  console.log("── 2. Cancelar y «no se presentó»");
  const c5 = await nuevaCita(tRecA, await mkPerro("cancela"), "estetico", { hora: "11:00" });
  const sinMotivo = await rpc(tRecA, "cancelar_cita_estetica", { p_cita_id: c5.fila.id, p_motivo: "" });
  comprobar(!sinMotivo.ok && /motivo/i.test(sinMotivo.mensaje), "cancelar pide el motivo");
  const cancela = await rpc(tRecA, "cancelar_cita_estetica", { p_cita_id: c5.fila.id, p_motivo: "La clienta se enfermó" });
  comprobar(cancela.ok && (await fila(c5.fila.id)).estado === "cancelada", `cancelada con motivo (${cancela.mensaje || "ok"})`);
  const h5 = await cambios(c5.fila.id);
  comprobar(h5.length === 1 && h5[0].tipo === "cancelacion" && h5[0].estado_antes === "reservada" && h5[0].estado_despues === "cancelada" && /enfermó/.test(h5[0].motivo), "queda en el historial como cancelación");
  const libre = await nuevaCita(tRecA, await mkPerro("libre"), "estetico", { dia: c5.dia, hora: "11:00" });
  comprobar(libre.ok, "el horario queda libre para otra cita");
  const directoCancel = await llamar(`${URL}/rest/v1/citas_estetica?id=eq.${libre.fila.id}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ estado: "cancelada" }) });
  comprobar(!directoCancel.ok && /Cancelar cita/.test(directoCancel.mensaje), "cancelar con un UPDATE directo se rechaza");
  const otra = await rpc(tRecA, "cancelar_cita_estetica", { p_cita_id: c5.fila.id, p_motivo: "otra vez" });
  comprobar(!otra.ok, "una cita ya cancelada no se cancela de nuevo");
  const nl = await rpc(tRecA, "cancelar_cita_estetica", { p_cita_id: libre.fila.id, p_motivo: null, p_no_llego: true });
  comprobar(nl.ok && (await fila(libre.fila.id)).estado === "no_llego", "«no se presentó» no pide motivo y es otro estado");
  const hnl = await cambios(libre.fila.id);
  comprobar(hnl.length === 1 && hnl[0].tipo === "no_llego", "y queda en el historial como «no llegó», distinto de la cancelación");
  const reservaAntes = (await SB.from("reservas").select("id").eq("id", c5.reserva)).data.length;
  comprobar(reservaAntes === 1, "no se borra nada físicamente");

  // ── 3. Eliminar ──
  console.log("── 3. Eliminar una cita");
  const c6 = await nuevaCita(tRecA, await mkPerro("elimina"), "estetico", { hora: "13:00" });
  const sinPermiso = await rpc(tRecB, "eliminar_cita_estetica", { p_cita_id: c6.fila.id, p_motivo: "Se capturó dos veces" });
  comprobar(!sinPermiso.ok && /permiso/i.test(sinPermiso.mensaje), "recepción sin el permiso «Eliminar citas» no elimina");
  await dar(idRecepA, "eliminar_citas");
  comprobar(((await rpc(tRecA, "mis_permisos")).cuerpo ?? []).includes("eliminar_citas"), "con el permiso, mis_permisos() lo trae");
  const sinMot = await rpc(tRecA, "eliminar_cita_estetica", { p_cita_id: c6.fila.id, p_motivo: "ab" });
  comprobar(!sinMot.ok && /motivo/i.test(sinMot.mensaje), "pide el motivo");
  const elimina = await rpc(tRecA, "eliminar_cita_estetica", { p_cita_id: c6.fila.id, p_motivo: "Se capturó dos veces" });
  comprobar(elimina.ok, `elimina (${elimina.mensaje || "ok"})`);
  const d6 = await fila(c6.fila.id);
  comprobar(d6 && d6.deleted_at, "la fila NO se borra: queda con deleted_at");
  const h6 = await cambios(c6.fila.id);
  comprobar(h6.length === 1 && h6[0].tipo === "eliminacion" && /dos veces/.test(h6[0].motivo), "queda en el historial como eliminación");
  const reutil = await nuevaCita(tRecA, await mkPerro("reusa"), "estetico", { dia: c6.dia, hora: "13:00" });
  comprobar(reutil.ok, "el horario se libera");
  const elimCurso = await rpc(tRecA, "eliminar_cita_estetica", { p_cita_id: c3.fila.id, p_motivo: "estaba en curso" });
  comprobar(!elimCurso.ok && /ya empezó/.test(elimCurso.mensaje), "una cita en curso no se elimina");
  const elimCobro = await (async () => {
    const c = await nuevaCita(tRecA, await mkPerro("elimCobro"), "estetico");
    await rpc(tRecA, "registrar_cobro", { p_reserva_id: c.reserva, p_notas: "prueba citas", p_metodos: [{ metodo: "efectivo", monto: 390, propina: 0 }] });
    return rpc(tRecA, "eliminar_cita_estetica", { p_cita_id: c.fila.id, p_motivo: "con cobro de prueba" });
  })();
  comprobar(!elimCobro.ok && /Anula el cobro/.test(elimCobro.mensaje), "una cita con cobro pasa primero por la anulación");
  const directoDel = await llamar(`${URL}/rest/v1/citas_estetica?id=eq.${reutil.fila.id}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ deleted_at: new Date().toISOString() }) });
  comprobar(!directoDel.ok && /Eliminar cita/.test(directoDel.mensaje), "la baja con un UPDATE directo se rechaza");
  await quitar(idRecepA, "eliminar_citas");

  // ── 4. Historial ──
  console.log("── 4. Historial con nombres");
  const hist = await rpc(tRecA, "historial_cambios_cita", { p_cita_id: c1.fila.id });
  comprobar(hist.ok && hist.cuerpo.length === 1 && hist.cuerpo[0].tipo === "reprogramacion" && hist.cuerpo[0].por_nombre, "historial_cambios_cita trae el cambio con el nombre de quien lo hizo");
  const mutar = await SB.from("citas_estetica_cambios").update({ motivo: "reescrito" }).eq("cita_id", c1.fila.id);
  const borrar = await SB.from("citas_estetica_cambios").delete().eq("cita_id", c1.fila.id);
  comprobar(mutar.error && borrar.error, "el historial es inmutable (ni siquiera la llave de servicio lo edita o borra)");

  // ── 5. Tarifa «Cliente de guardería» ──
  console.log("── 5. Tarifa de cliente de guardería");
  const guardaSin = await rpc(tRecB, "guardar_tarifa_guarderia", { p_activa: true, p_servicio_tarifa: srv("expres"), p_servicios: [srv("estetico")], p_dias: 60 });
  comprobar(!guardaSin.ok && /permiso/i.test(guardaSin.mensaje), "sin «Precios y tarifas» no se configura");
  const mal = await rpc(tAdmin, "guardar_tarifa_guarderia", { p_activa: true, p_servicio_tarifa: null, p_servicios: [srv("estetico")], p_dias: 60 });
  comprobar(!mal.ok, "activarla sin elegir el servicio equivalente se rechaza");
  const malGuard = await rpc(tAdmin, "guardar_tarifa_guarderia", { p_activa: true, p_servicio_tarifa: srv("expres"), p_servicios: [], p_dias: 60 });
  comprobar(!malGuard.ok, "activarla sin ningún servicio al que aplique se rechaza");

  const perroG = await mkPerro("guarderia");
  const perroN = await mkPerro("sin guarderia");
  // Un pase vigente (day pass) hace al perro «cliente de guardería».
  const { data: guarderiaDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
  let { data: catalogo } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "aud_pase_10").is("deleted_at", null).maybeSingle();
  if (!catalogo) {
    const ins = await SB.from("servicios").insert({
      negocio_id: B, clave: "aud_pase_10", nombre: "Pase 10 días (prueba)", categoria: "bono", unidad: "dia", depende_grupo_raza: false, depende_tamano: false,
      depende_pelaje: false, depende_cantidad: false, servicio_incluido_id: guarderiaDia.id, ilimitado: false, monto_libre: false, cantidad_incluida: 10, vigencia_dias: 30, orden: 99,
    }).select("id").single();
    if (ins.error) throw new Error(`servicio de pase: ${ins.error.message}`);
    catalogo = ins.data;
    await SB.from("tarifas").insert({ negocio_id: B, servicio_id: catalogo.id, precio: 800, no_aplica: false, cantidad_desde: 1, cantidad_hasta: null, vigencia_desde: suma(-30) });
  }

  // Apagada: nadie la tiene.
  const apagada = await nuevaCita(tAdmin, perroG, "estetico");
  comprobar(apagada.ok && Number(apagada.fila.precio) === 390 && apagada.fila.tarifa_guarderia === false, "con la tarifa APAGADA (por omisión) todos pagan el precio normal");

  const act = await rpc(tAdmin, "guardar_tarifa_guarderia", { p_activa: true, p_servicio_tarifa: srv("expres"), p_servicios: [srv("estetico"), srv("rapado")], p_dias: 60 });
  comprobar(act.ok, `admin la activa: exprés para baño estético y rapado (${act.mensaje || "ok"})`);
  const sinPase = await nuevaCita(tAdmin, perroN, "estetico");
  comprobar(sinPase.ok && Number(sinPase.fila.precio) === 390 && !sinPase.fila.tarifa_guarderia, "un perro SIN guardería sigue pagando $390");
  const cot0 = (await rpc(tAdmin, "cotizar_cita_estetica", { p_perro_id: perroN, p_servicio_id: srv("estetico"), p_pelo_maltratado: false, p_grupo_excepcion_id: null })).cuerpo;
  comprobar(cot0?.estado === "ok" && Number(cot0.precio) === 390 && cot0.tarifa_guarderia === false && cot0.tarifa_guarderia_elegible === false && cot0.tarifa_guarderia_aplicable === true,
    "la cotización dice que no es de guardería pero que se podría poner a mano");

  // Compra de un pase para el perro de guardería.
  const turno = await turnoAbierto();
  const compra = await rpc(tRecA, "comprar_bono", { p_perro_id: perroG, p_servicio_id: catalogo.id, p_notas: "prueba tarifa guardería", p_metodos: [{ metodo: "efectivo", monto: 800, propina: 0 }] });
  comprobar(compra.ok && turno, `pase vigente para el perro de guardería (${compra.mensaje || "ok"})`);
  const cot1 = (await rpc(tAdmin, "cotizar_cita_estetica", { p_perro_id: perroG, p_servicio_id: srv("estetico"), p_pelo_maltratado: false, p_grupo_excepcion_id: null })).cuerpo;
  comprobar(cot1?.estado === "ok" && Number(cot1.precio) === 190 && cot1.tarifa_guarderia === true && Number(cot1.precio_normal) === 390 && cot1.tarifa_guarderia_origen === "auto" && /xpr/i.test(cot1.servicio_tarifa_nombre),
    "la cotización PROPONE $190 (el exprés) y dice el precio normal ($390) y de dónde sale");
  const g1 = await nuevaCita(tRecA, perroG, "estetico");
  comprobar(g1.ok && Number(g1.fila.precio) === 190 && g1.fila.tarifa_guarderia === true && g1.fila.servicio_id === srv("estetico") && g1.fila.tarifa_guarderia_servicio_id === srv("expres") && g1.fila.tarifa_guarderia_modo === "auto",
    `la cita queda con la TARIFA: $190, sigue siendo baño estético, guarda el servicio equivalente (${g1.mensaje || "ok"})`);
  comprobar(Number(g1.fila.precio_base) === 190, "precio_base = $190 (es una tarifa, no un descuento)");
  const desc = await SB.from("descuentos_aplicados").select("id").eq("reserva_id", g1.reserva);
  comprobar((desc.data ?? []).length === 0, "no se generó ningún descuento");
  const lineas = (await rpc(tAdmin, "cuenta_lineas_reserva", { p_reserva_id: g1.reserva })).cuerpo ?? [];
  comprobar(lineas.some((l) => /tarifa cliente de guardería/.test(l.descripcion) && Number(l.total) === 190), "la cuenta lo dice en la línea y cobra $190");
  const g2 = await nuevaCita(tRecA, perroG, "rapado");
  comprobar(g2.ok && Number(g2.fila.precio) === 190 && g2.fila.tarifa_guarderia, "el rapado también entra (320 → 190)");
  const g3 = await nuevaCita(tRecA, perroG, "expres");
  comprobar(g3.ok && Number(g3.fila.precio) === 190 && g3.fila.tarifa_guarderia === false, "el exprés mismo no se marca como tarifa");

  // Quitarla: permiso + motivo.
  const quitaSin = await rpc(tRecB, "cambiar_tarifa_guarderia_cita", { p_cita_id: g1.fila.id, p_modo: "no", p_motivo: "el dueño no la quiere" });
  comprobar(!quitaSin.ok && /excepciones/i.test(quitaSin.mensaje), "quitar la tarifa sin el permiso de excepciones se rechaza");
  const quitaSinMotivo = await rpc(tAdmin, "cambiar_tarifa_guarderia_cita", { p_cita_id: g1.fila.id, p_modo: "no", p_motivo: "" });
  comprobar(!quitaSinMotivo.ok && /motivo/i.test(quitaSinMotivo.mensaje), "quitarla pide motivo");
  // Reprogramar no re-cotiza: congela la tarifa.
  const repro = await rpc(tRecA, "reprogramar_cita_estetica", { p_cita_id: g1.fila.id, p_inicio: `${suma(g1.dia + 4)}T15:00:00-06:00` });
  comprobar(repro.ok && Number((await fila(g1.fila.id)).precio) === 190, "reprogramar conserva la tarifa");
  await dar(idRecepB, "excepciones_reserva");
  const quita = await rpc(tRecB, "cambiar_tarifa_guarderia_cita", { p_cita_id: g1.fila.id, p_modo: "no", p_motivo: "El dueño prefiere el baño completo" });
  comprobar(quita.ok && Number((await fila(g1.fila.id)).precio) === 390 && (await fila(g1.fila.id)).tarifa_guarderia === false, `con el permiso la quita: vuelve a $390 (${quita.mensaje || "ok"})`);
  const hq = (await cambios(g1.fila.id)).filter((x) => x.tipo === "tarifa_guarderia");
  comprobar(hq.length === 1 && hq[0].detalle?.precio_antes === 190 && hq[0].detalle?.precio_despues === 390 && /prefiere/.test(hq[0].motivo), "queda en el historial con el antes y el después");
  const reponer = await rpc(tRecB, "cambiar_tarifa_guarderia_cita", { p_cita_id: g1.fila.id, p_modo: "auto", p_motivo: null });
  comprobar(reponer.ok && Number((await fila(g1.fila.id)).precio) === 190, "volver a «automática» la restablece ($190)");
  // Poner a mano a un perro sin guardería.
  const manualSin = await rpc(tRecA, "cambiar_tarifa_guarderia_cita", { p_cita_id: sinPase.fila.id, p_modo: "si", p_motivo: null });
  comprobar(!manualSin.ok, "ponerla a mano sin el permiso de excepciones se rechaza");
  const manual = await rpc(tRecB, "cambiar_tarifa_guarderia_cita", { p_cita_id: sinPase.fila.id, p_modo: "si", p_motivo: null });
  comprobar(manual.ok && Number((await fila(sinPase.fila.id)).precio) === 190 && (await fila(sinPase.fila.id)).tarifa_guarderia, "con el permiso se puede poner a mano a quien no es de guardería ($190)");
  // Crear la cita ya sin tarifa (modo no) o con ella a mano.
  const creaNoSin = await nuevaCita(tRecA, perroG, "estetico", { extra: { tarifa_guarderia_modo: "no", tarifa_guarderia_motivo: "sin tarifa" } });
  comprobar(!creaNoSin.ok && /excepciones/i.test(creaNoSin.mensaje), "agendar con la tarifa quitada sin el permiso se rechaza");
  const creaNo = await nuevaCita(tAdmin, perroG, "estetico", { extra: { tarifa_guarderia_modo: "no", tarifa_guarderia_motivo: "El dueño la rechazó" } });
  comprobar(creaNo.ok && Number(creaNo.fila.precio) === 390, "admin agenda con la tarifa quitada: $390");
  // Con cobro, no se cambia.
  const gc = await nuevaCita(tRecA, perroG, "estetico");
  await rpc(tRecA, "registrar_cobro", { p_reserva_id: gc.reserva, p_notas: "prueba citas", p_metodos: [{ metodo: "efectivo", monto: 190, propina: 0 }] });
  const cambiaCobro = await rpc(tAdmin, "cambiar_tarifa_guarderia_cita", { p_cita_id: gc.fila.id, p_modo: "no", p_motivo: "ya cobrada" });
  comprobar(!cambiaCobro.ok && /Anula el cobro/.test(cambiaCobro.mensaje), "con un cobro hecho, la tarifa no se cambia sin anular el cobro");
  // Se congela: apagarla no toca lo agendado.
  await rpc(tAdmin, "guardar_tarifa_guarderia", { p_activa: false, p_servicio_tarifa: srv("expres"), p_servicios: [srv("estetico"), srv("rapado")], p_dias: 60 });
  comprobar(Number((await fila(g2.fila.id)).precio) === 190, "apagar la tarifa no cambia las citas ya agendadas");
  const despues = await nuevaCita(tAdmin, perroG, "estetico");
  comprobar(despues.ok && Number(despues.fila.precio) === 390 && !despues.fila.tarifa_guarderia, "y las nuevas pagan el precio normal");

  // ── 6. Quién no puede ──
  console.log("── 6. Quién no puede");
  const cX = await nuevaCita(tAdmin, await mkPerro("aislamiento"), "estetico");
  const otraEsteticaPerfil = (await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "estetica").is("deleted_at", null)).data ?? [];
  const eProp = await rpc(tEstetica, "reprogramar_cita_estetica", { p_cita_id: cX.fila.id, p_inicio: `${suma(cX.dia + 2)}T10:00:00-06:00` });
  comprobar(eProp.ok, "la estilista de la cita puede reprogramar la suya");
  const cY = await nuevaCita(tAdmin, await mkPerro("ajena"), "estetico", { empleado: idRecepA === datos.esteticaB ? datos.adminB : datos.adminB });
  const eAjena = await rpc(tEstetica, "reprogramar_cita_estetica", { p_cita_id: cY.fila.id, p_inicio: `${suma(cY.dia + 2)}T10:00:00-06:00` });
  comprobar(!eAjena.ok, "pero no la de otra persona");
  for (const [quien, token] of [["cliente", tCliente], ["anónimo", null]]) {
    const a = await rpc(token, "reprogramar_cita_estetica", { p_cita_id: cX.fila.id, p_inicio: `${suma(cX.dia + 3)}T10:00:00-06:00` });
    const b = await rpc(token, "cancelar_cita_estetica", { p_cita_id: cX.fila.id, p_motivo: "intento" });
    const c = await rpc(token, "eliminar_cita_estetica", { p_cita_id: cX.fila.id, p_motivo: "intento" });
    const d = await rpc(token, "cambiar_tarifa_guarderia_cita", { p_cita_id: cX.fila.id, p_modo: "no", p_motivo: "intento" });
    const e = await rpc(token, "guardar_tarifa_guarderia", { p_activa: false, p_servicio_tarifa: null, p_servicios: [], p_dias: 60 });
    const f = await rpc(token, "historial_cambios_cita", { p_cita_id: cX.fila.id });
    comprobar(!a.ok && !b.ok && !c.ok && !d.ok && !e.ok && (!f.ok || (f.cuerpo ?? []).length === 0), `${quien}: no reprograma, cancela, elimina, cambia la tarifa ni lee el historial`);
  }
  const rutaLeer = await llamar(`${URL}/rest/v1/citas_estetica_cambios?select=id`, { headers: cab(tCliente) });
  const rutaLeer2 = await llamar(`${URL}/rest/v1/tarifa_guarderia_config?select=id`, { headers: cab(tCliente) });
  comprobar((rutaLeer.cuerpo ?? []).length === 0 && (rutaLeer2.cuerpo ?? []).length === 0, "el cliente no lee el historial de citas ni la configuración de la tarifa");
  const otroNeg = await rpc(tAdmin, "cancelar_cita_estetica", { p_cita_id: cX.fila.id, p_motivo: "otro negocio" }, LUDOGTEKA);
  comprobar(!otroNeg.ok, "con el encabezado de otro negocio no se alcanza la cita");
  const frontera = await A.rpc("auditoria_frontera");
  comprobar(!frontera.error && (frontera.data ?? []).length === 0, "auditoria_frontera() vacía");
} finally {
  for (const p of ["eliminar_citas", "excepciones_reserva", "tarifas", "anular_cobros"]) { await quitar(idRecepA, p); await quitar(idRecepB, p); }
  await rpc(tAdmin, "guardar_tarifa_guarderia", { p_activa: false, p_servicio_tarifa: null, p_servicios: [], p_dias: 60 });
  if (creados.citas.length) await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("id", creados.citas).is("deleted_at", null);
}

console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
