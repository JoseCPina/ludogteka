// Cancelar una cuenta por cobrar (SOLO DESARROLLO, Huellitas / patitas-pruebas-b).
//   node scripts/auditoria/cancelar-cuenta-dev.mjs
// 1. Permiso «cancelar_cuentas»: admin lo tiene; recepción no por omisión; con él, sí;
//    estética, cliente y anónimo no.
// 2. Motivo: obligatorio y de la lista; «Otro» pide texto.
// 3. Cobros parciales: no se cancela (manda a anular); tras anular el cobro, sí. Una
//    cuenta ya pagada o en cero no se cancela. Cobro en curso en terminal / link: no.
// 4. Cita ligada: una cita que no empieza se cancela en el mismo paso («No se
//    presentó» la deja «no llegó»); sin pedirlo se queda; una en curso no se cancela.
// 5. Cortesía sobre un servicio ya realizado: solo admin.
// 6. Reportes: la cuenta sale de cuentas_abiertas() y de los pendientes; el dinero
//    cobrado (reporte financiero) no se mueve; no se borra: queda con motivo, quién y
//    cuándo, visible en el historial del cliente.
// 7. Una cuenta cancelada no admite cobros ni cargos; no se cancela dos veces; la fila
//    es inmutable (ni UPDATE ni DELETE, ni con la llave de servidor).
// 8. Aislamiento: otro negocio, cliente (no lee nada) y llave anónima.
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
const idRecConPermiso = recepciones[0].profile_id;
const idRecSinPermiso = recepciones[1].profile_id;
const tRec = await tokenDe(idRecConPermiso);
const tRecSin = await tokenDe(idRecSinPermiso);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);
const hoy = (await rpc(tAdmin, "fecha_negocio")).cuerpo;
const suma = (dias) => new Date(new Date(`${hoy}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const dar = (profile, permiso) => rpc(tAdmin, "otorgar_permiso", { p_profile_id: profile, p_permiso: permiso });
const quitar = (profile, permiso) => rpc(tAdmin, "revocar_permiso", { p_profile_id: profile, p_permiso: permiso });

const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const { data: razas } = await A.from("razas").select("id, nombre");
const { data: servicios } = await SB.from("servicios").select("id, clave").eq("categoria", "estetica").is("deleted_at", null);
const srv = (c) => servicios.find((s) => s.clave === `estetica_${c}`).id;
const sufijo = String(Date.now()).slice(-6);
const creados = { perros: [], reservas: [], citas: [], ordenes: [] };

const mkPerro = async (nombre) => {
  const { data, error } = await SB.from("perros").insert({
    cliente_id: datos.clienteSoloB, nombre: `ZZ cancelar ${nombre} ${sufijo}`, raza: "Poodle", raza_id: razas.find((r) => r.nombre === "Poodle").id,
    tamano_id: tallas.find((t) => t.clave === "chico").id, pelaje_id: pelajes.find((t) => t.clave === "medio").id,
  }).select("id").single();
  if (error) throw new Error(`perro ${nombre}: ${error.message}`);
  creados.perros.push(data.id);
  return data.id;
};
let contadorDia = 1200 + Math.floor(Math.random() * 300);
// Una cita futura de estética con su propia cuenta; devuelve { cita, reserva }.
const nuevaCita = async (perro) => {
  const rr = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
  const reserva = rr.cuerpo?.[0]?.id;
  if (!reserva) throw new Error(`reserva: ${rr.mensaje}`);
  creados.reservas.push(reserva);
  const r = await llamar(`${URL}/rest/v1/citas_estetica`, {
    method: "POST", headers: cab(tAdmin),
    body: JSON.stringify({ reserva_id: reserva, perro_id: perro, servicio_id: srv("estetico"), empleado_id: datos.esteticaB, inicio: `${suma((contadorDia += 7))}T10:00:00-06:00` }),
  });
  const cita = r.cuerpo?.[0]?.id;
  if (!cita) throw new Error(`cita: ${r.mensaje}`);
  creados.citas.push(cita);
  return { cita, reserva };
};
const ventaCuenta = async (precio) => {
  const r = await rpc(tAdmin, "crear_venta_mostrador", { p_cliente_id: datos.clienteSoloB, p_lineas: [{ concepto: "Prueba cancelar cuenta", precio, cantidad: 1 }], p_notas: "prueba cancelar cuenta" });
  if (!r.ok) throw new Error(`venta: ${r.mensaje}`);
  creados.reservas.push(r.cuerpo);
  return r.cuerpo;
};
const saldo = async (id) => Number((await rpc(tAdmin, "cuenta_totales_reserva", { p_reserva_id: id })).cuerpo?.[0]?.saldo ?? NaN);
const abiertas = async () => (await rpc(tAdmin, "cuentas_abiertas", { p_dias: 30 })).cuerpo ?? [];
const enAbiertas = async (id) => (await abiertas()).some((c) => c.reserva_id === id);
const filaCancelada = async (id) => (await SB.from("cuentas_canceladas").select("*").eq("reserva_id", id).maybeSingle()).data;
const cancelar = (token, id, motivo, texto = null, cita = false) => rpc(token, "cancelar_cuenta", { p_reserva_id: id, p_motivo: motivo, p_motivo_texto: texto, p_cancelar_cita: cita });
const citaFila = async (id) => (await SB.from("citas_estetica").select("estado").eq("id", id).single()).data;
const reporteHoy = async () => (await rpc(tAdmin, "reporte_financiero_periodo", { p_desde: hoy, p_hasta: hoy })).cuerpo?.[0];

try {
  await rpc(tAdmin, "elegir_proveedor_cobro", { p_proveedor: "manual" });
  for (const p of ["cancelar_cuentas", "anular_cobros"]) { await dar(idRecConPermiso, p); await quitar(idRecConPermiso, p); await dar(idRecSinPermiso, p); await quitar(idRecSinPermiso, p); }
  let turno = (await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle()).data;
  if (!turno) {
    const t = await llamar(`${URL}/rest/v1/turnos_caja`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ fondo_inicial: 100, notas_apertura: "prueba cancelar cuenta" }) });
    if (!t.ok) throw new Error(`abrir turno: ${t.mensaje}`);
  }

  // ── 1. Permisos ──
  console.log("── 1. Permisos");
  const mpAdmin = (await rpc(tAdmin, "mis_permisos")).cuerpo ?? [];
  comprobar(mpAdmin.includes("cancelar_cuentas"), "admin tiene «cancelar_cuentas»");
  const { data: cat } = await SB.from("permisos_catalogo").select("clave, etiqueta").eq("clave", "cancelar_cuentas").maybeSingle();
  comprobar(cat?.etiqueta === "Cancelar cuentas", "el catálogo de permisos lo trae como «Cancelar cuentas»");
  const mpRec = (await rpc(tRec, "mis_permisos")).cuerpo ?? [];
  comprobar(!mpRec.includes("cancelar_cuentas"), "recepción lo tiene apagado por omisión");
  const v1 = await ventaCuenta(190);
  const sinPermiso = await cancelar(tRec, v1, "error_captura");
  comprobar(!sinPermiso.ok && /permiso/i.test(sinPermiso.mensaje), `recepción sin el permiso no cancela («${sinPermiso.mensaje.slice(0, 60)}»)`);
  comprobar(!(await filaCancelada(v1)) && (await enAbiertas(v1)), "y la cuenta sigue por cobrar");
  const sinPermiso2 = await cancelar(tRecSin, v1, "error_captura");
  comprobar(!sinPermiso2.ok, "la otra recepcionista sin el permiso tampoco");
  for (const [quien, token] of [["estética", tEstetica], ["cliente", tCliente], ["anónimo", null]]) {
    const r = await cancelar(token, v1, "error_captura");
    comprobar(!r.ok && !(await filaCancelada(v1)), `${quien} no cancela`);
  }
  await dar(idRecConPermiso, "cancelar_cuentas");
  comprobar(((await rpc(tRec, "mis_permisos")).cuerpo ?? []).includes("cancelar_cuentas"), "al darle el permiso, mis_permisos() lo trae");

  // ── 2. Motivo ──
  console.log("── 2. Motivo");
  const m0 = await cancelar(tRec, v1, null);
  comprobar(!m0.ok && /motivo/i.test(m0.mensaje), `sin motivo no se cancela («${m0.mensaje.slice(0, 60)}»)`);
  const m1 = await cancelar(tRec, v1, "porque si");
  comprobar(!m1.ok, "un motivo fuera de la lista no se acepta");
  const m2 = await cancelar(tRec, v1, "otro", "  ab ");
  comprobar(!m2.ok && /otro/i.test(m2.mensaje), "«Otro» sin texto suficiente no se acepta");
  comprobar(!(await filaCancelada(v1)), "ninguno dejó la cuenta cancelada");
  const directo = await llamar(`${URL}/rest/v1/cuentas_canceladas`, { method: "POST", headers: cab(tRec), body: JSON.stringify({ reserva_id: v1, cliente_id: datos.clienteSoloB, motivo: "otro", saldo_cancelado: 1, total_cuenta: 1 }) });
  comprobar(!directo.ok, "el INSERT directo a la tabla se rechaza (solo por la función)");

  // ── 3. Cobros ──
  console.log("── 3. Cobros parciales y cobros en curso");
  const vParcial = await ventaCuenta(200);
  const cobro = await rpc(tRec, "registrar_cobro", { p_reserva_id: vParcial, p_notas: "parcial", p_metodos: [{ metodo: "efectivo", monto: 50, propina: 0 }] });
  comprobar(cobro.ok && (await saldo(vParcial)) === 150, "cobro parcial de $50: saldo $150");
  const cp = await cancelar(tRec, vParcial, "error_captura");
  comprobar(!cp.ok && /cobro/i.test(cp.mensaje) && /anula/i.test(cp.mensaje), `con cobros no se cancela y manda a anular («${cp.mensaje.slice(0, 70)}»)`);
  comprobar(!(await filaCancelada(vParcial)), "la cuenta con cobros sigue abierta");
  await dar(idRecConPermiso, "anular_cobros");
  const an = await rpc(tRec, "anular_cobro", { p_cobro_id: cobro.cuerpo, p_motivo: "prueba: se anula antes de cancelar" });
  comprobar(an.ok && (await saldo(vParcial)) === 200, `se anula el cobro y la cuenta vuelve a $200 (${an.mensaje || "ok"})`);
  const cp2 = await cancelar(tRec, vParcial, "error_captura", "ya sin cobros");
  comprobar(cp2.ok, `anulado el cobro, la cuenta se cancela (${cp2.mensaje || "ok"})`);
  const vPagada = await ventaCuenta(80);
  await rpc(tRec, "registrar_cobro", { p_reserva_id: vPagada, p_notas: "pagada", p_metodos: [{ metodo: "efectivo", monto: 80, propina: 0 }] });
  const cpag = await cancelar(tRec, vPagada, "error_captura");
  comprobar(!cpag.ok, `una cuenta ya pagada no se cancela («${cpag.mensaje.slice(0, 60)}»)`);
  const vOrden = await ventaCuenta(120);
  const { data: orden, error: errOrden } = await SB.from("mp_ordenes").insert({
    negocio_id: B, proveedor: "mercadopago", tipo: "point", reserva_id: vOrden, monto: 120, descripcion: "prueba cancelar cuenta", estado: "en_terminal", simulado: true,
    expira_at: new Date(Date.now() + 86_400_000).toISOString(),
  }).select("id").single();
  if (errOrden) throw new Error(`orden: ${errOrden.message}`);
  creados.ordenes.push(orden.id);
  const co = await cancelar(tRec, vOrden, "error_captura");
  comprobar(!co.ok && /en curso|terminal/i.test(co.mensaje), `con un cobro en la terminal no se cancela («${co.mensaje.slice(0, 60)}»)`);
  await SB.from("mp_ordenes").update({ estado: "cancelada" }).eq("id", orden.id);
  const co2 = await cancelar(tRec, vOrden, "cita_cancelada");
  comprobar(co2.ok, "resuelta la orden, sí se cancela");

  // ── 4. Cita ligada ──
  console.log("── 4. Cita ligada");
  const perro = await mkPerro("cita");
  const cA = await nuevaCita(perro);
  const infoA = await rpc(tRec, "cuenta_para_cancelar", { p_reserva_id: cA.reserva });
  comprobar(infoA.ok && infoA.cuerpo.citas_pendientes.length === 1 && infoA.cuerpo.servicio_realizado === false, "la hoja ve la cita que no empieza y que el servicio no se ha realizado");
  const rA = await cancelar(tRec, cA.reserva, "cita_cancelada", null, true);
  comprobar(rA.ok && (await citaFila(cA.cita)).estado === "cancelada", `«Cita cancelada» + cancelar la cita: queda cancelada (${rA.mensaje || "ok"})`);
  const filaA = await filaCancelada(cA.reserva);
  comprobar(filaA?.citas_canceladas?.includes(cA.cita), "la cuenta registra qué cita se canceló");
  const cB = await nuevaCita(perro);
  const rB = await cancelar(tRec, cB.reserva, "no_se_presento", null, true);
  comprobar(rB.ok && (await citaFila(cB.cita)).estado === "no_llego", "«No se presentó» marca la cita como «No llegó»");
  const cC = await nuevaCita(perro);
  const rC = await cancelar(tRec, cC.reserva, "error_captura", "captura doble", false);
  comprobar(rC.ok && (await citaFila(cC.cita)).estado === "reservada", "sin pedirlo, la cita se queda como estaba");
  const cD = await nuevaCita(perro);
  await SB.from("citas_estetica").update({ estado: "en_curso" }).eq("id", cD.cita);
  const infoD = await rpc(tRec, "cuenta_para_cancelar", { p_reserva_id: cD.reserva });
  comprobar(infoD.cuerpo?.servicio_realizado === true && infoD.cuerpo.citas_pendientes.length === 0, "una cita en curso cuenta como servicio realizado y no se ofrece cancelarla");
  const rD = await cancelar(tRec, cD.reserva, "otro", "el dueño no pagó nada", true);
  comprobar(rD.ok && (await citaFila(cD.cita)).estado === "en_curso", "la cita en curso no se cancela desde aquí (la cuenta sí)");
  comprobar((await filaCancelada(cD.reserva))?.citas_no_canceladas?.includes(cD.cita), "y queda anotado que esa cita no se canceló");

  // ── 5. Cortesía ──
  console.log("── 5. Cortesía sobre un servicio realizado");
  const cE = await nuevaCita(perro);
  await SB.from("citas_estetica").update({ estado: "finalizada" }).eq("id", cE.cita);
  const e1 = await cancelar(tRec, cE.reserva, "cortesia");
  comprobar(!e1.ok && /admin/i.test(e1.mensaje) && !(await filaCancelada(cE.reserva)), `recepción con permiso no da cortesía de un servicio hecho («${e1.mensaje.slice(0, 60)}»)`);
  const e2 = await cancelar(tAdmin, cE.reserva, "cortesia", "cortesía de la casa");
  comprobar(e2.ok && (await filaCancelada(cE.reserva))?.servicio_realizado === true, "admin sí");
  const cF = await nuevaCita(perro);
  const e3 = await cancelar(tRec, cF.reserva, "cortesia", null, true);
  comprobar(e3.ok, "cortesía de una cita que no se ha hecho: recepción con permiso sí puede");
  const vVenta = await ventaCuenta(60);
  const e4 = await cancelar(tRec, vVenta, "cortesia");
  comprobar(!e4.ok, "una venta de mostrador ya entregada cuenta como realizada: cortesía solo admin");
  await cancelar(tAdmin, vVenta, "cortesia");

  // ── 6. Reportes e historial ──
  console.log("── 6. Reportes e historial");
  const vR = await ventaCuenta(333);
  const antesR = await reporteHoy();
  comprobar(await enAbiertas(vR), "antes: la cuenta está en cuentas_abiertas()");
  const rr = await cancelar(tRec, vR, "no_se_presento");
  comprobar(rr.ok && Number(rr.cuerpo.saldo_cancelado) === 333, "se cancela y devuelve el saldo cancelado ($333)");
  comprobar(!(await enAbiertas(vR)), "después: ya no está en cuentas_abiertas() (lista, tablero y saldos)");
  const despuesR = await reporteHoy();
  comprobar(JSON.stringify(antesR) === JSON.stringify(despuesR), "el reporte financiero no se mueve (cancelar no es cobrar ni devolver)");
  const fR = await filaCancelada(vR);
  comprobar(fR && fR.motivo === "no_se_presento" && fR.cancelada_por === idRecConPermiso && fR.created_at && fR.deleted_at === null, "la fila guarda motivo, quién y cuándo y no se borra");
  const hist = await rpc(tRec, "cuentas_canceladas_de_cliente", { p_cliente_id: datos.clienteSoloB });
  const hRow = (hist.cuerpo ?? []).find((h) => h.reserva_id === vR);
  comprobar(hist.ok && hRow && hRow.motivo === "no_se_presento" && hRow.por_nombre && Number(hRow.saldo_cancelado) === 333, "el historial del cliente la muestra con el nombre de quien la canceló");
  const para = await rpc(tRec, "cuenta_para_cancelar", { p_reserva_id: vR });
  comprobar(para.ok && para.cuerpo?.cancelada?.motivo === "no_se_presento", "la pantalla de la cuenta sabe que está cancelada");
  const pend = await rpc(tRec, "ajustes_servicio_por_atender");
  comprobar(pend.ok && !(pend.cuerpo ?? []).some((p) => p.reserva_id === vR), "tampoco sale en los pendientes de «Necesita atención»");
  const reserva = await get(tAdmin, `reservas?id=eq.${vR}&select=id,deleted_at`);
  comprobar(reserva.cuerpo?.[0]?.id === vR && reserva.cuerpo[0].deleted_at === null, "la reserva sigue existiendo (nada de DELETE)");

  // ── 7. Después de cancelada ──
  console.log("── 7. Cuenta cancelada");
  const post = await rpc(tAdmin, "registrar_cobro", { p_reserva_id: vR, p_notas: "intento", p_metodos: [{ metodo: "efectivo", monto: 10, propina: 0 }] });
  comprobar(!post.ok, `no admite cobros («${post.mensaje.slice(0, 60)}»)`);
  const carg = await llamar(`${URL}/rest/v1/cargos_aplicados`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ reserva_id: vR, servicio_id: servicios[0].id, cantidad: 1, precio: 10 }) });
  comprobar(!carg.ok && /cancelada/i.test(carg.mensaje), `ni cargos nuevos («${carg.mensaje.slice(0, 60)}»)`);
  const otra = await cancelar(tAdmin, vR, "error_captura");
  comprobar(!otra.ok && /ya está cancelada|saldo/i.test(otra.mensaje), "no se cancela dos veces");
  const upd = await SB.from("cuentas_canceladas").update({ motivo_texto: "cambiado" }).eq("reserva_id", vR);
  const del = await SB.from("cuentas_canceladas").delete().eq("reserva_id", vR);
  comprobar(upd.error && del.error && (await filaCancelada(vR))?.motivo_texto === null, "la fila es inmutable: ni UPDATE ni DELETE, ni con la llave de servidor");
  const updRec = await llamar(`${URL}/rest/v1/cuentas_canceladas?reserva_id=eq.${vR}`, { method: "PATCH", headers: cab(tAdmin), body: JSON.stringify({ motivo_texto: "x" }) });
  comprobar(!updRec.ok || (updRec.cuerpo ?? []).length === 0, "ni admin por la API");

  // ── 8. Aislamiento ──
  console.log("── 8. Aislamiento");
  const clienteLee = await get(tCliente, "cuentas_canceladas?select=id");
  comprobar((clienteLee.cuerpo ?? []).length === 0, "el cliente no lee cuentas canceladas");
  const clienteInfo = await rpc(tCliente, "cuenta_para_cancelar", { p_reserva_id: vR });
  const clienteHist = await rpc(tCliente, "cuentas_canceladas_de_cliente", { p_cliente_id: datos.clienteSoloB });
  comprobar((clienteInfo.cuerpo ?? null) === null && (clienteHist.cuerpo ?? []).length === 0, "ni por las funciones de la pantalla");
  const estLee = await get(tEstetica, "cuentas_canceladas?select=id");
  comprobar((estLee.cuerpo ?? []).length === 0, "estética tampoco lee el dinero de cuentas canceladas");
  const anonLee = await get(null, "cuentas_canceladas?select=id");
  comprobar(!anonLee.ok || (anonLee.cuerpo ?? []).length === 0, "la llave anónima no lee nada");
  const anonFn = await rpc(null, "cancelar_cuenta", { p_reserva_id: vR, p_motivo: "error_captura" });
  comprobar(!anonFn.ok, "la llave anónima no ejecuta la función");
  const vOtro = await ventaCuenta(45);
  const otroNeg = await cancelar(tAdmin, vOtro, "error_captura", null, false);
  comprobar(otroNeg.ok, "(control) en su negocio sí");
  const vOtro2 = await ventaCuenta(46);
  const cruzado = await rpc(tAdmin, "cancelar_cuenta", { p_reserva_id: vOtro2, p_motivo: "error_captura" }, LUDOGTEKA);
  comprobar(!cruzado.ok && !(await filaCancelada(vOtro2)), "con el encabezado de otro negocio no se alcanza la cuenta");
  const ludoLee = await SB.from("cuentas_canceladas").select("id").eq("negocio_id", LUDOGTEKA);
  comprobar((ludoLee.data ?? []).length === 0, "Ludogteka no tiene cuentas canceladas por esta prueba");
  const frontera = await A.rpc("auditoria_frontera");
  comprobar(!frontera.error && (frontera.data ?? []).length === 0, "auditoria_frontera() vacía");
} finally {
  for (const p of ["cancelar_cuentas", "anular_cobros"]) { await quitar(idRecConPermiso, p); await quitar(idRecSinPermiso, p); }
  if (creados.ordenes.length) await SB.from("mp_ordenes").update({ estado: "cancelada" }).in("id", creados.ordenes);
  if (creados.citas.length) await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("id", creados.citas).is("deleted_at", null);
}

console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
