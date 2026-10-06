// «Tarjeta (registro manual)» (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/tarjeta-manual-dev.mjs
//
// 1. Registro válido (con y sin repartir en otro método, con propina) y todo lo
//    que lo rechaza: sin folio, folio corto, sin motivo, «otro» sin texto,
//    últimos 4 que no son 4 números, folio duplicado (aunque cambien espacios,
//    guiones o mayúsculas), sin permiso, estética, cliente y anónimo.
// 2. Es una línea APARTE: el turno, el corte y el reporte la separan de
//    «terminal» y de los demás; el total de tarjeta se suma explícito.
// 3. Tope de alerta: sobre el tope se registra igual y sube a «Necesita
//    atención»; solo admin cambia el tope.
// 4. Revisión: «Revisado con voucher» y «Marcar como no recibida» (solo admin,
//    con motivo, una sola vez); la devolución cae en el turno ABIERTO y un corte
//    ya cerrado no cambia; el original no se borra; cada paso deja un evento.
// 5. Devolución manual de una tarjeta manual (no usa el reembolso integrado).
// 6. «Terminal» sigue bloqueado a mano con Mercado Pago elegido; la tarjeta
//    manual sigue disponible.
// 7. Alerta de patrón (más de 3 al día / más del 30 % del turno), solo con
//    proveedor integrado; la función de la plataforma solo la llama la plataforma.
// 8. Aislamiento: otro negocio no ve ni toca nada; el cliente no lee las tablas.
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
const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
if (recepciones.length < 2) throw new Error("Huellitas necesita al menos dos recepcionistas (corre negocio-prueba-dev.mjs).");
const recConPermiso = recepciones[0].profile_id;
const recSinPermiso = recepciones[1].profile_id;
const tRec = await tokenDe(recConPermiso);
const tRecSin = await tokenDe(recSinPermiso);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);
const hoyB = (await rpc(tAdmin, "fecha_negocio")).cuerpo;

const sufijo = String(Date.now()).slice(-6);
let n = 0;
const folio = (p = "AUT") => `${p}-${sufijo}${String(++n).padStart(2, "0")}`;
const creadas = { reservas: [] };
const nuevaReserva = async () => {
  const r = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
  const id = r.cuerpo?.[0]?.id;
  if (!id) throw new Error(`reserva de prueba: ${r.mensaje}`);
  creadas.reservas.push(id);
  return id;
};
const tm = (extra = {}) => ({ metodo: "tarjeta_manual", monto: 100, propina: 0, folio: folio(), motivo: "sin_senal", ...extra });
const cobrar = (token, reserva, metodos, notas = "prueba tarjeta manual") => rpc(token, "registrar_cobro", { p_reserva_id: reserva, p_notas: notas, p_metodos: metodos });
const turnoAbierto = async () => (await SB.from("turnos_caja").select("id, fondo_inicial").eq("estado", "abierto").maybeSingle()).data;
const tarjeta = async (id) => (await SB.from("tarjetas_manuales").select("*").eq("id", id).single()).data;
const porCobro = async (cobroId) => (await SB.from("tarjetas_manuales").select("*").eq("cobro_id", cobroId)).data ?? [];
const eventos = async (tarjetaId) => (await SB.from("tarjetas_manuales_eventos").select("tipo, actor").eq("tarjeta_id", tarjetaId)).data ?? [];
const saldo = async (reservaId) => Number((await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: reservaId })).cuerpo?.[0]?.saldo ?? NaN);
const resumen = async (turnoId) => (await rpc(tAdmin, "resumen_turno", { p_turno_id: turnoId })).cuerpo ?? [];
const fila = (res, metodo, origen = "manual") => res.find((r) => r.metodo === metodo && r.origen === origen);

try {
  // Estado limpio: proveedor «solo manual», sin turno abierto de corridas anteriores, tope por omisión.
  await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "manual" });
  await rpc(tAdmin, "guardar_tope_tarjeta_manual", { p_tope: 2000 });
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "tarjeta_manual" });
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "tarjeta_manual" });
  let turno = await turnoAbierto();
  if (!turno) {
    const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: "prueba tarjeta manual" }) });
    turno = t.cuerpo?.[0];
  }
  comprobar(Boolean(turno?.id), "hay un turno abierto para cobrar");
  const sumaTerminal = (res) => res.filter((r) => r.metodo === "terminal").reduce((a, r) => a + Number(r.cobrado) - Number(r.devuelto) + Number(r.propinas), 0);
  const terminalAntes = sumaTerminal(await resumen(turno.id));

  // ── 1. Registro ──
  console.log("── 1. Registro válido y lo que lo rechaza");
  const { data: permisos } = await SB.from("permisos_staff").select("profile_id, revocado_at").eq("permiso", "tarjeta_manual").eq("negocio_id", B);
  comprobar(recepciones.every((r) => permisos.some((p) => p.profile_id === r.profile_id)), "toda la recepción de Huellitas tiene el permiso por omisión (sembrado)");
  const misPermisos = (await rpc(tRec, "mis_permisos")).cuerpo ?? [];
  comprobar(misPermisos.includes("tarjeta_manual"), "mis_permisos() lo trae a la recepcionista");
  comprobar(((await rpc(tAdmin, "mis_permisos")).cuerpo ?? []).includes("tarjeta_manual"), "y a admin");

  const r1 = await nuevaReserva();
  const f1 = folio("VOU");
  const ok1 = await cobrar(tRec, r1, [tm({ monto: 350, folio: f1, ultimos4: "4242", banco: "BBVA" })]);
  comprobar(ok1.ok, `registro válido de $350 con folio, últimos 4 y banco (${ok1.mensaje || "ok"})`);
  const cobro1 = ok1.cuerpo;
  const t1 = (await porCobro(cobro1))[0];
  comprobar(t1 && t1.estado === "por_revisar" && t1.folio === f1 && t1.motivo === "sin_senal" && t1.ultimos4 === "4242" && t1.banco === "BBVA" && t1.turno_id === turno.id && t1.created_by === recConPermiso,
    "queda con folio, motivo, últimos 4, banco, turno y quién lo registró, «por revisar» (sin verificar)");
  comprobar(!t1 || !JSON.stringify(t1).match(/\b\d{13,19}\b/), "nunca guarda un número de tarjeta completo");
  comprobar(await saldo(r1) === -350, "cuenta como pagado desde que se registra (saldo −350 en una cuenta sin cargos)");
  const ev1 = await eventos(t1.id);
  comprobar(ev1.some((e) => e.tipo === "registrada" && e.actor === recConPermiso), "deja el evento «registrada» con quién");

  // Sin folio / folio corto / sin motivo / «otro» sin texto / últimos 4 mal.
  const malos = [
    ["sin folio", tm({ folio: "" }), /folio/i],
    ["folio de 3 caracteres", tm({ folio: "A-1" }), /4 caracteres/],
    ["sin motivo", tm({ motivo: "" }), /por qué no se cobró/i],
    ["motivo fuera de la lista", tm({ motivo: "porque_si" }), /por qué no se cobró/i],
    ["«otro» sin texto", tm({ motivo: "otro" }), /Otro|motivo/i],
    ["últimos 4 que no son 4 números", tm({ ultimos4: "42" }), /4 números|tarjeta completa/i],
    ["la tarjeta completa en los últimos 4", tm({ ultimos4: "4242424242424242" }), /4 números|tarjeta completa/i],
  ];
  for (const [que, linea, patron] of malos) {
    const rm = await nuevaReserva();
    const r = await cobrar(tRec, rm, [linea]);
    comprobar(!r.ok && patron.test(r.mensaje), `${que} no se guarda («${r.mensaje.slice(0, 80)}»)`);
    const cobros = (await SB.from("cobros").select("id").eq("reserva_id", rm)).data ?? [];
    comprobar(cobros.length === 0, `${que}: no queda ni el cobro a medias`);
  }
  const rOtro = await nuevaReserva();
  const okOtro = await cobrar(tRec, rOtro, [tm({ motivo: "otro", motivo_texto: "La terminal de otra sucursal" })]);
  comprobar(okOtro.ok, "«Otro» con texto sí se guarda");

  // Folio duplicado (misma clave aunque cambie la forma de escribirla).
  const rd = await nuevaReserva();
  const dup = await cobrar(tRec, rd, [tm({ folio: f1.toLowerCase().replace("-", " ") })]);
  comprobar(!dup.ok && /ya está registrado/.test(dup.mensaje), `folio duplicado se bloquea con aviso aunque cambien mayúsculas o guiones («${dup.mensaje.slice(0, 70)}»)`);
  const dup2 = await cobrar(tRec, rd, [tm({ folio: "ZZ-" + sufijo + "77" }), tm({ folio: "zz " + sufijo + "77" })]);
  comprobar(!dup2.ok && /ya está registrado/.test(dup2.mensaje), "dos líneas con el mismo folio en el mismo cobro también se bloquean");

  // Repartir en otro método y propina.
  const rm2 = await nuevaReserva();
  const mixto = await cobrar(tRec, rm2, [{ metodo: "efectivo", monto: 200, propina: 0 }, tm({ monto: 300, propina: 30 })]);
  comprobar(mixto.ok, "se puede repartir entre efectivo y tarjeta manual, con propina");
  const cmix = await SB.from("cobro_metodos").select("metodo, monto, propina").eq("cobro_id", mixto.cuerpo);
  comprobar(cmix.data?.length === 2 && cmix.data.some((m) => m.metodo === "tarjeta_manual" && Number(m.propina) === 30), "el cobro mixto guarda cada método por separado");

  // Sin permiso, estética, cliente, anónimo.
  const rs = await nuevaReserva();
  const sinPermiso = await cobrar(tRecSin, rs, [tm()]);
  comprobar(!sinPermiso.ok && /permiso/i.test(sinPermiso.mensaje), `recepción sin el permiso no puede («${sinPermiso.mensaje.slice(0, 70)}»)`);
  const efectivoSin = await cobrar(tRecSin, rs, [{ metodo: "efectivo", monto: 10, propina: 0 }]);
  comprobar(efectivoSin.ok, "pero esa misma persona sigue cobrando en efectivo");
  comprobar(!((await rpc(tRecSin, "mis_permisos")).cuerpo ?? []).includes("tarjeta_manual"), "y mis_permisos() ya no se lo trae");
  for (const [quien, tok] of [["estética", tEstetica], ["cliente", tCliente], ["anónimo", null]]) {
    const r = await cobrar(tok, rs, [tm()]);
    comprobar(!r.ok, `${quien} no puede registrar una tarjeta manual`);
  }
  // Volver a dar el permiso a esa persona y re-sembrar: un trigger no lo regresa solo.
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "tarjeta_manual" });
  comprobar(((await rpc(tRecSin, "mis_permisos")).cuerpo ?? []).includes("tarjeta_manual"), "el admin se lo puede volver a dar");
  await rpc(tAdmin, "revocar_permiso", { p_profile_id: recSinPermiso, p_permiso: "tarjeta_manual" });

  // ── 2. Línea aparte ──
  console.log("── 2. Línea aparte en turno, corte y reporte");
  const res = await resumen(turno.id);
  const filaTm = fila(res, "tarjeta_manual");
  comprobar(Boolean(filaTm) && Number(filaTm.cobrado) >= 350 + 100 + 300, `resumen_turno trae «tarjeta_manual» como línea propia (cobrado $${filaTm?.cobrado})`);
  comprobar(sumaTerminal(res) === terminalAntes, "y «terminal» no se mezcla (no cambió con las tarjetas manuales)");
  const rep = await rpc(tAdmin, "reporte_financiero_periodo", { p_desde: hoyB, p_hasta: hoyB });
  const filaRep = rep.cuerpo?.[0];
  comprobar(filaRep && Number(filaRep.cobros_tarjeta_manual) >= 750 && Number(filaRep.cobros_tarjeta_manual) !== Number(filaRep.cobros_terminal), `el reporte financiero separa «Tarjeta manual (sin verificar)» ($${filaRep?.cobros_tarjeta_manual}) de «Terminal» ($${filaRep?.cobros_terminal})`);
  const movs = (await rpc(tAdmin, "movimientos_turno", { p_turno_id: turno.id })).cuerpo ?? [];
  comprobar(movs.some((m) => m.metodo === "tarjeta_manual"), "movimientos_turno lo lista con su método");

  // ── 3. Tope de alerta ──
  console.log("── 3. Tope de alerta");
  const rt = await nuevaReserva();
  const sobre = await cobrar(tRec, rt, [tm({ monto: 2500 })]);
  comprobar(sobre.ok, "sobre el tope ($2,500 > $2,000) se registra igual (la recepción no se bloquea)");
  const tSobre = (await porCobro(sobre.cuerpo))[0];
  comprobar(tSobre?.sobre_tope === true && Number(tSobre.tope_aplicado) === 2000, "queda marcada «sobre el tope» con el tope que regía");
  comprobar((await eventos(tSobre.id)).some((e) => e.tipo === "sobre_tope"), "y deja el evento «sobre_tope»");
  const aten = (await rpc(tAdmin, "tarjetas_manuales_atencion")).cuerpo;
  comprobar(aten?.visible && aten.sobre_tope >= 1 && aten.por_revisar >= 1, `«Necesita atención» (admin): ${aten?.por_revisar} por revisar, ${aten?.sobre_tope} sobre el tope`);
  comprobar((await rpc(tRec, "tarjetas_manuales_atencion")).cuerpo?.visible === false, "recepción no ve ese aviso (trae montos)");
  const cambia = await rpc(tRec, "guardar_tope_tarjeta_manual", { p_tope: 99999 });
  comprobar(!cambia.ok, "recepción no cambia el tope");
  const cambiaAdm = await rpc(tAdmin, "guardar_tope_tarjeta_manual", { p_tope: 500 });
  comprobar(cambiaAdm.ok, "admin sí cambia el tope");
  const rt2 = await nuevaReserva();
  const conNuevoTope = await cobrar(tRec, rt2, [tm({ monto: 600 })]);
  comprobar((await porCobro(conNuevoTope.cuerpo))[0]?.sobre_tope === true, "con el tope en $500, un cobro de $600 queda marcado");
  await rpc(tAdmin, "guardar_tope_tarjeta_manual", { p_tope: 2000 });
  comprobar(!(await rpc(tAdmin, "guardar_tope_tarjeta_manual", { p_tope: 0 })).ok, "un tope de cero se rechaza");

  // ── 4. Revisión ──
  console.log("── 4. Revisión del admin");
  const lista = (await rpc(tAdmin, "tarjetas_manuales_por_revisar")).cuerpo ?? [];
  const enLista = lista.find((x) => x.id === t1.id);
  comprobar(enLista && enLista.folio === f1 && enLista.motivo === "sin_senal" && enLista.cliente_nombre, "la lista trae folio, motivo, cliente y quién la registró");
  comprobar(((await rpc(tRec, "tarjetas_manuales_por_revisar")).cuerpo ?? []).length === 0, "recepción no ve la lista");
  comprobar(((await rpc(tEstetica, "tarjetas_manuales_por_revisar")).cuerpo ?? []).length === 0, "estética no ve la lista");
  for (const [quien, tok] of [["recepción", tRec], ["estética", tEstetica], ["cliente", tCliente], ["anónimo", null]]) {
    const a = await rpc(tok, "tarjeta_manual_revisar", { p_tarjeta_id: t1.id, p_nota: "x" });
    const b = await rpc(tok, "tarjeta_manual_no_recibida", { p_tarjeta_id: t1.id, p_motivo: "no apareció en el banco" });
    comprobar(!a.ok && !b.ok, `${quien} no puede revisar ni marcar como no recibida`);
  }
  const rev = await rpc(tAdmin, "tarjeta_manual_revisar", { p_tarjeta_id: t1.id, p_nota: "Voucher a la vista" });
  comprobar(rev.ok, "admin: «Revisado con voucher» (con nota)");
  const t1b = await tarjeta(t1.id);
  comprobar(t1b.estado === "revisada" && t1b.revisada_por === datos.adminB && t1b.nota_revision === "Voucher a la vista", "queda revisada, con quién y la nota");
  comprobar(!(await rpc(tAdmin, "tarjeta_manual_revisar", { p_tarjeta_id: t1.id, p_nota: "" })).ok, "no se revisa dos veces");
  comprobar(!(await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: t1.id, p_motivo: "ahora sí no llegó" })).ok, "una ya revisada con voucher no se marca como no recibida");
  comprobar((await eventos(t1.id)).some((e) => e.tipo === "revisada"), "deja el evento «revisada»");

  // Marcar no recibida, con el cobro en el turno ABIERTO.
  const rn = await nuevaReserva();
  const cn = await cobrar(tRec, rn, [tm({ monto: 420 })]);
  const tn = (await porCobro(cn.cuerpo))[0];
  const sinMotivo = await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tn.id, p_motivo: "no" });
  comprobar(!sinMotivo.ok && /motivo/i.test(sinMotivo.mensaje), "marcar como no recibida exige un motivo");
  const antes = await saldo(rn);
  const nr = await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tn.id, p_motivo: "El banco no la acreditó" });
  comprobar(nr.ok && nr.cuerpo?.monto === 420, `admin la marca como no recibida (${nr.mensaje || "ok"})`);
  const tnb = await tarjeta(tn.id);
  comprobar(tnb.estado === "no_recibida" && tnb.correccion_id, "queda «no recibida» con su corrección");
  comprobar(await saldo(rn) === antes + 420, "la cuenta recupera su saldo (la devolución entra aparte)");
  const cobroOriginal = (await SB.from("cobros").select("id, deleted_at").eq("id", cn.cuerpo).single()).data;
  const metOriginal = (await SB.from("cobro_metodos").select("monto").eq("cobro_id", cn.cuerpo)).data;
  comprobar(cobroOriginal && !cobroOriginal.deleted_at && Number(metOriginal[0].monto) === 420, "el cobro original NO se borra ni se edita");
  const dev = (await SB.from("devoluciones").select("id, origen, turno_id").eq("cobro_id", cn.cuerpo)).data ?? [];
  comprobar(dev.length === 1 && dev[0].origen === "manual" && dev[0].turno_id === turno.id, "la devolución es un movimiento aparte (devolución manual) en el turno abierto");
  const corr = (await SB.from("cobro_correcciones").select("tipo, motivo, turno_cobro_id, turno_efecto_id").eq("cobro_id", cn.cuerpo)).data ?? [];
  comprobar(corr.length === 1 && corr[0].tipo === "tarjeta_manual_no_recibida", "y queda la corrección con el estado anterior");
  comprobar((await eventos(tn.id)).some((e) => e.tipo === "no_recibida"), "deja el evento «no_recibida»");
  comprobar(!(await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tn.id, p_motivo: "otra vez por favor" })).ok, "no se marca dos veces");
  // El mismo folio ya se puede capturar de nuevo (el de una «no recibida» no cuenta).
  const reuso = await cobrar(tRec, await nuevaReserva(), [tm({ folio: tn.folio })]);
  comprobar(reuso.ok, "el folio de una tarjeta «no recibida» se puede volver a capturar");
  const fRes = fila(await resumen(turno.id), "tarjeta_manual");
  comprobar(Number(fRes.devuelto) >= 420, `en el turno la devolución se ve en la línea de tarjeta manual (devuelto $${fRes.devuelto})`);

  // ── Turno cerrado: el ajuste va al turno abierto y el corte cerrado no cambia ──
  console.log("── 4b. Cobro registrado en un turno que ya se cerró");
  const rc = await nuevaReserva();
  const cc = await cobrar(tRec, rc, [tm({ monto: 777 })]);
  const tc = (await porCobro(cc.cuerpo))[0];
  const turnoViejo = turno.id;
  let cierre = await rpc(tAdmin, "cerrar_turno", { p_turno_id: turnoViejo, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: "prueba de tarjeta manual", p_notas_cierre: "prueba" });
  comprobar(cierre.ok && cierre.cuerpo?.[0]?.cerrado === true, `se cierra el turno (${cierre.mensaje || "ok"})`);
  const corteId = cierre.cuerpo?.[0]?.corte_id;
  const corteFilas = async () => (await SB.from("corte_metodos").select("metodo, conteo, esperado, diferencia").eq("corte_id", corteId).order("metodo")).data ?? [];
  const antesCorte = await corteFilas();
  const cmTm = antesCorte.find((c) => c.metodo === "tarjeta_manual");
  comprobar(antesCorte.length === 4 && cmTm && Number(cmTm.esperado) >= 777 && Number(cmTm.diferencia) === 0, `el corte guarda «tarjeta manual» como línea aparte (esperado $${cmTm?.esperado}, sin diferencia propia)`);
  comprobar(Number(antesCorte.find((c) => c.metodo === "terminal").esperado) === terminalAntes, "y «terminal» no se mezcla en el corte (su esperado es el de antes)");
  const sinTurno = await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tc.id, p_motivo: "No llegó al banco" });
  comprobar(!sinTurno.ok && /turno de caja abierto/i.test(sinTurno.mensaje), "sin turno abierto la corrección se rechaza (no toca el cerrado)");
  const nuevo = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: "prueba tarjeta manual 2" }) });
  const turnoNuevo = nuevo.cuerpo?.[0]?.id;
  comprobar(Boolean(turnoNuevo), "se abre otro turno");
  const nrc = await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tc.id, p_motivo: "No llegó al banco" });
  comprobar(nrc.ok && nrc.cuerpo?.turno_del_cobro_cerrado === true && nrc.cuerpo?.turno_efecto_id === turnoNuevo, "con turno abierto, el ajuste cae en el turno ABIERTO y avisa que el cobro era de un turno cerrado");
  const despuesCorte = await corteFilas();
  comprobar(JSON.stringify(antesCorte) === JSON.stringify(despuesCorte), "el corte ya cerrado NO cambia");
  const turnoCerrado = (await SB.from("turnos_caja").select("estado").eq("id", turnoViejo).single()).data;
  comprobar(turnoCerrado.estado === "cerrado", "el turno viejo sigue cerrado");
  turno = { id: turnoNuevo };

  // ── 5. Devolución manual ──
  console.log("── 5. Devolución manual de una tarjeta manual");
  const rv = await nuevaReserva();
  const cv = await cobrar(tRec, rv, [tm({ monto: 250 })]);
  const dManual = await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cv.cuerpo, p_motivo: "El cliente canceló", p_metodos: [{ metodo: "tarjeta_manual", monto: 100 }] });
  comprobar(dManual.ok, `una devolución manual en método «tarjeta manual» sí entra (${dManual.mensaje || "ok"})`);
  const tvLista = ((await rpc(tAdmin, "tarjetas_manuales_por_revisar")).cuerpo ?? []).find((x) => x.cobro_id === cv.cuerpo);
  comprobar(tvLista && Number(tvLista.devuelto) === 100, "y se ve en la conciliación («devuelto $100»)");
  const dDemas = await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cv.cuerpo, p_motivo: "otra", p_metodos: [{ metodo: "tarjeta_manual", monto: 200 }] });
  comprobar(!dDemas.ok, "no se devuelve por tarjeta manual más de lo que se pasó por tarjeta manual");
  const dTerm = await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cv.cuerpo, p_motivo: "otra", p_metodos: [{ metodo: "tarjeta_manual", monto: 150 }] });
  comprobar(dTerm.ok, "lo que queda sí se puede devolver (150)");
  const rMarcaConDev = await nuevaReserva();
  const cMarca = await cobrar(tRec, rMarcaConDev, [tm({ monto: 80 })]);
  await rpc(tAdmin, "registrar_devolucion", { p_cobro_id: cMarca.cuerpo, p_motivo: "parcial", p_metodos: [{ metodo: "tarjeta_manual", monto: 20 }] });
  const tMarca = (await porCobro(cMarca.cuerpo))[0];
  comprobar(!(await rpc(tAdmin, "tarjeta_manual_no_recibida", { p_tarjeta_id: tMarca.id, p_motivo: "no llegó nunca" })).ok, "un cobro que ya tiene devoluciones no se marca como no recibido");
  comprobar(!(await rpc(tRec, "registrar_devolucion", { p_cobro_id: cv.cuerpo, p_motivo: "x", p_metodos: [{ metodo: "tarjeta_manual", monto: 1 }] })).ok, "recepción no devuelve (sigue siendo de admin)");

  // ── 6. «Terminal» sigue bloqueado con proveedor ──
  console.log("── 6. «Terminal» a mano con Mercado Pago elegido");
  const eleg = await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "mercadopago" });
  comprobar(eleg.ok, "se elige Mercado Pago como proveedor");
  const bloq = await rpc(tRec, "terminal_manual_bloqueada");
  comprobar(bloq.cuerpo === true, "terminal_manual_bloqueada() = true");
  const rb = await nuevaReserva();
  const term = await cobrar(tRec, rb, [{ metodo: "terminal", monto: 50, propina: 0 }]);
  comprobar(!term.ok && /Tarjeta \(registro manual\)/.test(term.mensaje), `«terminal» a mano se rechaza y el mensaje manda a la tarjeta manual («${term.mensaje.slice(0, 60)}…»)`);
  const tarjetaConMp = await cobrar(tRec, rb, [tm({ monto: 50 })]);
  comprobar(tarjetaConMp.ok, "«Tarjeta (registro manual)» sigue disponible con Mercado Pago conectado");
  const efectivoConMp = await cobrar(tRec, rb, [{ metodo: "efectivo", monto: 10, propina: 0 }, { metodo: "transferencia", monto: 10, propina: 0 }]);
  comprobar(efectivoConMp.ok, "efectivo y transferencia siguen a mano");

  // ── 7. Alerta de patrón ──
  console.log("── 7. Alerta de patrón");
  let at = (await rpc(tAdmin, "tarjetas_manuales_atencion")).cuerpo;
  comprobar(at.integrado === true, "con proveedor integrado la alerta de patrón aplica");
  comprobar(at.patron_por_dia === true && at.manuales_hoy > 3, `más de 3 tarjetas manuales hoy → alerta por día (${at.manuales_hoy} hoy)`);
  comprobar(at.patron_por_turno === true && at.pct_turno > 30, `más del 30 % de las tarjetas del turno → alerta por turno (${at.pct_manuales} de ${at.pct_total}, ${at.pct_turno} %)`);
  const pl = await rpc(tAdmin, "plataforma_tarjetas_manuales_patron");
  comprobar(!pl.ok, "un admin de negocio no llama la función de la plataforma");
  const plRec = await rpc(tRec, "plataforma_tarjetas_manuales_patron");
  comprobar(!plRec.ok, "ni recepción");
  const plAnon = await rpc(null, "plataforma_tarjetas_manuales_patron");
  comprobar(!plAnon.ok, "ni la llave anónima");
  const plSrv = await SB.rpc("plataforma_tarjetas_manuales_patron");
  comprobar(!plSrv.error && (plSrv.data ?? []).some((x) => x.negocio_id === B), `la plataforma (servidor) ve a Huellitas en la lista (${(plSrv.data ?? []).length} negocio/s)`);
  const hEnPlat = (plSrv.data ?? []).find((x) => x.negocio_id === B);
  comprobar(hEnPlat && hEnPlat.manuales_hoy > 3 && hEnPlat.proveedor === "mercadopago", "con su proveedor y cuántas lleva hoy");
  await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "manual" });
  at = (await rpc(tAdmin, "tarjetas_manuales_atencion")).cuerpo;
  comprobar(at.patron_por_dia === false && at.patron_por_turno === false, "en «solo manual» el patrón NO avisa (la tarjeta manual es lo normal)");
  const plSrv2 = await SB.rpc("plataforma_tarjetas_manuales_patron");
  comprobar(!(plSrv2.data ?? []).some((x) => x.negocio_id === B), "y la plataforma tampoco lo lista");

  // ── 8. Aislamiento ──
  console.log("── 8. Otro negocio, cliente y anónimo");
  const tLudo = await tokenDe((await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id);
  const verLudo = await get(tLudo, "tarjetas_manuales?select=id", LUDOGTEKA);
  comprobar(verLudo.ok && verLudo.cuerpo.length === 0, "Ludogteka no ve ninguna tarjeta manual de Huellitas");
  const cruzado = await get(tLudo, `tarjetas_manuales?select=id&id=eq.${t1.id}`, B);
  comprobar(!cruzado.ok || (cruzado.cuerpo ?? []).length === 0, "con el encabezado de Huellitas, un admin de Ludogteka tampoco la lee (no es miembro)");
  const revCruz = await rpc(tLudo, "tarjeta_manual_revisar", { p_tarjeta_id: tn.id, p_nota: "x" }, LUDOGTEKA);
  comprobar(!revCruz.ok, "ni la revisa desde su negocio");
  const noRecCruz = await rpc(tLudo, "tarjeta_manual_no_recibida", { p_tarjeta_id: tc.id, p_motivo: "intento cruzado" }, LUDOGTEKA);
  comprobar(!noRecCruz.ok, "ni la marca como no recibida");
  for (const tabla of ["tarjetas_manuales", "tarjetas_manuales_eventos", "tarjeta_manual_ajustes"]) {
    const c = await get(tCliente, `${tabla}?select=id`);
    comprobar(!c.ok || (c.cuerpo ?? []).length === 0, `el cliente no lee ${tabla}`);
    const a = await get(null, `${tabla}?select=id`);
    comprobar(!a.ok || (a.cuerpo ?? []).length === 0, `la llave anónima no lee ${tabla}`);
    const e = await get(tEstetica, `${tabla}?select=id`);
    comprobar(!e.ok || (e.cuerpo ?? []).length === 0, `estética no lee ${tabla}`);
    const w = await llamar(`${URL}/rest/v1/${tabla}`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ negocio_id: B }) });
    comprobar(!w.ok, `recepción no escribe ${tabla} directo (solo por funciones)`);
  }
  const { data: fr } = await SB.rpc("auditoria_frontera");
  comprobar((fr ?? []).length === 0, "auditoria_frontera() vacía");
} finally {
  // Limpieza: proveedor «solo manual», tope por omisión, permisos como estaban.
  await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "manual" });
  await rpc(tAdmin, "guardar_tope_tarjeta_manual", { p_tope: 2000 });
  await rpc(tAdmin, "otorgar_permiso", { p_profile_id: recSinPermiso, p_permiso: "tarjeta_manual" });
}

console.log(`\n${hallazgos.length ? `✘ ${hallazgos.length} hallazgo(s)` : "✔ tarjeta manual: sin hallazgos"}`);
process.exit(hallazgos.length ? 1 : 0);
