// Anular y corregir cobros SIN descuentos, corregir el precio de una cuenta y
// agregar efectivo al turno (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs   (si Huellitas no existe)
//   node scripts/auditoria/caja-correcciones-dev.mjs
//
// 1. Permisos: los cuatro nuevos son de admin; recepción los tiene apagados.
// 2. Anular (turno abierto): motivo obligatorio, la fila NO se borra, el cobro
//    sale de los totales del turno y del reporte, la cuenta vuelve a quedar por
//    cobrar, queda el historial con el valor anterior; no se anula dos veces ni
//    se devuelve un cobro anulado. Efectivo, transferencia y tarjeta manual.
// 3. Editar monto: sin descuento (el reporte de descuentos no se mueve), con valor
//    anterior/nuevo/quién, y las reglas que lo cuidan (saldo, menos de un peso,
//    devoluciones, más que la cuenta).
// 4. Lo que NO se corrige aquí: Mercado Pago, Clip y «terminal» a mano.
// 5. Turno cerrado: solo con el permiso extra; el corte ya cerrado no cambia y el
//    ajuste cae en el turno abierto.
// 6. Cobro junto: una parte o todo; el total y el folio quedan coherentes.
// 7. Efectivo agregado: permiso, esperado del corte, no es venta, se cancela.
// 8. Corregir el precio de una cuenta: sin descuento.
// 9. Aislamiento: otro negocio, estética, cliente y la llave anónima.
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (cond, titulo) => (cond ? bien(titulo) : hallazgo(titulo));
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";

const { data: huellitas } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = huellitas.id;
const jwt = async (profileId, negocio = H) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(profileId)}`, "x-negocio-id": negocio } },
  });
const miembros = async (rol) => (await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", rol).is("deleted_at", null).order("created_at")).data.map((m) => m.profile_id);
const [idAdmin] = await miembros("admin");
const recepciones = await miembros("recepcion");
if (recepciones.length < 2) throw new Error("Huellitas necesita al menos dos recepcionistas (corre negocio-prueba-dev.mjs).");
const [idRecepA, idRecepB] = recepciones;
const [idEstetica] = await miembros("estetica");
const idCliente = (await miembros("cliente"))[0];
const adminJ = await jwt(idAdmin);
const recA = await jwt(idRecepA);
const recB = await jwt(idRecepB);
const esteticaJ = idEstetica ? await jwt(idEstetica) : null;
const clienteJ = idCliente ? await jwt(idCliente) : null;
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });

const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } }); // secret key: solo para leer estado y limpiar
const { data: clientesH } = await SB.from("clientes").select("id").eq("negocio_id", H).eq("publico_general", false).is("deleted_at", null).limit(2);
const clienteId = clientesH[0].id;
const sufijo = String(Date.now()).slice(-6);
let n = 0;
const folio = (p = "COR") => `${p}-${sufijo}${String(++n).padStart(2, "0")}`;

const turnoAbierto = async () => (await SB.from("turnos_caja").select("id, fondo_inicial").eq("negocio_id", H).eq("estado", "abierto").maybeSingle()).data;
async function cerrarConLoEsperado(turnoId) {
  const { data: f1, error } = await adminJ.rpc("cerrar_turno", { p_turno_id: turnoId, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: "prueba correcciones" });
  if (error) throw new Error(`cerrar_turno: ${error.message}`);
  const r1 = Array.isArray(f1) ? f1[0] : f1;
  if (r1.cerrado) return r1;
  const { data: f2, error: e2 } = await adminJ.rpc("cerrar_turno", { p_turno_id: turnoId, p_conteo_efectivo: Math.max(r1.esperado_efectivo, 0), p_conteo_terminal: Math.max(r1.esperado_terminal, 0), p_conteo_transferencia: Math.max(r1.esperado_transferencia, 0), p_explicacion_diferencias: "prueba correcciones", p_notas_cierre: "prueba correcciones" });
  if (e2) throw new Error(`cerrar_turno 2: ${e2.message}`);
  return Array.isArray(f2) ? f2[0] : f2;
}
const abrirTurno = async (fondo = 100) => {
  const { error } = await recA.from("turnos_caja").insert({ fondo_inicial: fondo, notas_apertura: "prueba correcciones", abierto_por: idRecepA, estado: "abierto" });
  if (error) throw new Error(`abrir turno: ${error.message}`);
  return turnoAbierto();
};
const resumen = async (turnoId) => (await adminJ.rpc("resumen_turno", { p_turno_id: turnoId })).data ?? [];
const neto = (res, metodo) => res.filter((r) => r.metodo === metodo).reduce((a, r) => a + Number(r.cobrado) + Number(r.propinas) - Number(r.devuelto), 0);
const saldo = async (reservaId) => Number((await adminJ.rpc("cuenta_totales_reserva", { p_reserva_id: reservaId })).data?.[0]?.saldo ?? NaN);
const descuentosDe = async (reservaId) => (await SB.from("descuentos_aplicados").select("id").eq("negocio_id", H).eq("reserva_id", reservaId)).data?.length ?? 0;
const nuevaCuenta = async (precio, concepto = "Prueba corrección") => {
  const { data, error } = await recA.rpc("crear_venta_mostrador", { p_cliente_id: clienteId, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba correcciones" });
  if (error) throw new Error(`crear_venta_mostrador: ${error.message}`);
  return data;
};
const cobrar = async (reserva, metodos, cliente = recA) => {
  const { data, error } = await cliente.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: "prueba correcciones", p_metodos: metodos });
  if (error) throw new Error(`registrar_cobro: ${error.message}`);
  return data;
};
const cobroFila = async (id) => (await SB.from("cobros").select("*").eq("id", id).single()).data;
const metodosDe = async (cobroId) => (await SB.from("cobro_metodos").select("metodo, monto, propina, ajuste_id, turno_efecto_id, fecha_efecto").eq("cobro_id", cobroId).order("created_at")).data ?? [];
const correccionesDe = async (cobroId) => (await SB.from("cobro_correcciones").select("*").eq("cobro_id", cobroId).order("created_at")).data ?? [];
const reporteHoy = async () => {
  const hoy = (await adminJ.rpc("fecha_negocio")).data;
  const { data, error } = await adminJ.rpc("reporte_financiero_periodo", { p_desde: hoy, p_hasta: hoy });
  if (error) throw new Error(`reporte: ${error.message}`);
  return data[0];
};
const dar = (profile, permiso) => adminJ.rpc("otorgar_permiso", { p_profile_id: profile, p_permiso: permiso });
const quitar = (profile, permiso) => adminJ.rpc("revocar_permiso", { p_profile_id: profile, p_permiso: permiso });
const PERMISOS = ["anular_cobros", "editar_monto_cobros", "corregir_turnos_cerrados", "agregar_efectivo"];

try {
  await adminJ.rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  for (const p of PERMISOS) { await dar(idRecepA, p); await quitar(idRecepA, p); await dar(idRecepB, p); await quitar(idRecepB, p); }
  let turno = await turnoAbierto();
  if (!turno) turno = await abrirTurno(100);
  comprobar(Boolean(turno?.id), "hay un turno abierto");

  // ── 1. Permisos ──
  console.log("── 1. Permisos");
  const mpAdmin = (await adminJ.rpc("mis_permisos")).data ?? [];
  comprobar(PERMISOS.every((p) => mpAdmin.includes(p)), "admin tiene los cuatro permisos nuevos");
  const mpRec = (await recA.rpc("mis_permisos")).data ?? [];
  comprobar(PERMISOS.every((p) => !mpRec.includes(p)), "recepción los tiene apagados por omisión");

  const cuentaPrueba = await nuevaCuenta(400);
  const cobroPrueba = await cobrar(cuentaPrueba, [{ metodo: "efectivo", monto: 400, propina: 0 }]);
  const sinPermiso = await recA.rpc("anular_cobro", { p_cobro_id: cobroPrueba, p_motivo: "intento sin permiso" });
  comprobar(sinPermiso.error && /permiso/i.test(sinPermiso.error.message), "recepción sin el permiso no anula");
  const sinPermisoEditar = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroPrueba, p_metodo: "efectivo", p_monto_nuevo: 300, p_motivo: "intento sin permiso" });
  comprobar(sinPermisoEditar.error && /permiso/i.test(sinPermisoEditar.error.message), "recepción sin el permiso no edita el monto");
  await dar(idRecepA, "anular_cobros");
  await dar(idRecepA, "editar_monto_cobros");
  comprobar(((await recA.rpc("mis_permisos")).data ?? []).includes("anular_cobros"), "al darle el permiso, mis_permisos() lo trae");

  // ── 2. Anular (turno abierto) ──
  console.log("── 2. Anular un cobro (turno abierto)");
  const resAntes = await resumen(turno.id);
  const efectivoAntes = neto(resAntes, "efectivo");
  const repAntes = await reporteHoy();
  comprobar(await saldo(cuentaPrueba) === 0, "la cuenta de $400 quedó pagada");
  const sinMotivo = await recA.rpc("anular_cobro", { p_cobro_id: cobroPrueba, p_motivo: "ab" });
  comprobar(sinMotivo.error && /motivo/i.test(sinMotivo.error.message), "el motivo es obligatorio");
  const ok = await recA.rpc("anular_cobro", { p_cobro_id: cobroPrueba, p_motivo: "Se cobró a la cuenta equivocada" });
  comprobar(!ok.error, `anula (${ok.error?.message ?? "ok"})`);
  const cobroDespues = await cobroFila(cobroPrueba);
  comprobar(cobroDespues && !cobroDespues.deleted_at && cobroDespues.anulado_at && cobroDespues.anulado_por === idRecepA && /equivocada/.test(cobroDespues.anulacion_motivo), "la fila NO se borra: queda anulada con motivo, quién y cuándo");
  const mets = await metodosDe(cobroPrueba);
  comprobar(mets.length === 2 && Number(mets[0].monto) === 400 && Number(mets[1].monto) === -400 && mets[1].ajuste_id, "el original queda intacto y se agrega el renglón compensatorio (−400)");
  const corr = await correccionesDe(cobroPrueba);
  comprobar(corr.length === 1 && corr[0].tipo === "anulacion" && corr[0].hecha_por === idRecepA && corr[0].estado_anterior?.metodos?.[0]?.monto === 400, "el historial guarda el valor anterior, quién y cuándo");
  const resDespues = await resumen(turno.id);
  comprobar(neto(resDespues, "efectivo") === efectivoAntes - 400, "el cobro sale de los totales del turno (efectivo baja exactamente lo anulado)");
  const repDespues = await reporteHoy();
  comprobar(Number(repDespues.cobros_efectivo) === Number(repAntes.cobros_efectivo) - 400, "…y sale del reporte financiero (ingreso real, no descuento)");
  comprobar(Number(repDespues.descuentos_otorgados) === Number(repAntes.descuentos_otorgados), "el reporte de descuentos no se mueve");
  comprobar(await saldo(cuentaPrueba) === 400, "la cuenta vuelve a quedar por cobrar ($400)");
  const abiertas = (await adminJ.rpc("cuentas_abiertas", { p_dias: 30 })).data ?? [];
  comprobar(abiertas.some((c) => c.reserva_id === cuentaPrueba && Number(c.saldo) === 400), "reaparece en las cuentas abiertas de Caja");
  const movs = (await adminJ.rpc("movimientos_turno", { p_turno_id: turno.id })).data ?? [];
  comprobar(movs.some((m) => m.ajuste_tipo === "anulacion" && Number(m.monto) === -400) && movs.some((m) => m.ajuste_tipo === "original_anulado"), "Movimientos del turno muestra el cobro original y su anulación");
  const otra = await recA.rpc("anular_cobro", { p_cobro_id: cobroPrueba, p_motivo: "otra vez por error" });
  comprobar(otra.error && /ya está anulado/.test(otra.error.message), "no se anula dos veces");
  const dev = await adminJ.rpc("registrar_devolucion", { p_cobro_id: cobroPrueba, p_motivo: "intento", p_metodos: [{ metodo: "efectivo", monto: 10 }] });
  comprobar(dev.error, "un cobro anulado no se devuelve");
  // Se puede volver a cobrar la cuenta.
  const recobro = await cobrar(cuentaPrueba, [{ metodo: "efectivo", monto: 400, propina: 0 }]);
  comprobar(recobro && await saldo(cuentaPrueba) === 0, "la cuenta se vuelve a cobrar bien después de anular");

  // Transferencia y tarjeta manual.
  const cuentaT = await nuevaCuenta(250);
  const cobroT = await cobrar(cuentaT, [{ metodo: "transferencia", monto: 250, propina: 20 }]);
  const resT0 = await resumen(turno.id);
  const anT = await recA.rpc("anular_cobro", { p_cobro_id: cobroT, p_motivo: "Transferencia que nunca llegó" });
  comprobar(!anT.error, `anula una transferencia con propina (${anT.error?.message ?? "ok"})`);
  comprobar(neto(await resumen(turno.id), "transferencia") === neto(resT0, "transferencia") - 270, "monto y propina salen del turno");
  const cuentaM = await nuevaCuenta(300);
  const f1 = folio();
  const cobroM = await cobrar(cuentaM, [{ metodo: "tarjeta_manual", monto: 300, propina: 0, folio: f1, motivo: "sin_senal" }]);
  const tarj = (await SB.from("tarjetas_manuales").select("id, estado").eq("cobro_id", cobroM).single()).data;
  const anM = await recA.rpc("anular_cobro", { p_cobro_id: cobroM, p_motivo: "Voucher de otra venta" });
  comprobar(!anM.error, `anula una tarjeta manual (${anM.error?.message ?? "ok"})`);
  const tarj2 = (await SB.from("tarjetas_manuales").select("estado").eq("id", tarj.id).single()).data;
  comprobar(tarj2.estado === "anulada", "su registro de tarjeta manual queda «anulada» (ya no está por revisar)");
  const porRevisar = (await adminJ.rpc("tarjetas_manuales_por_revisar")).data ?? [];
  comprobar(!JSON.stringify(porRevisar).includes(tarj.id), "ya no sale en «Tarjetas manuales por revisar»");
  const evT = (await SB.from("tarjetas_manuales_eventos").select("tipo").eq("tarjeta_id", tarj.id)).data ?? [];
  comprobar(evT.some((e) => e.tipo === "anulada"), "deja el evento «anulada»");
  const f1Otra = await nuevaCuenta(100);
  const reusar = await recA.rpc("registrar_cobro", { p_reserva_id: f1Otra, p_notas: "folio reusado", p_metodos: [{ metodo: "tarjeta_manual", monto: 100, folio: f1, motivo: "sin_senal" }] });
  comprobar(reusar.error, "el folio de un cobro anulado sigue sin poder repetirse (el voucher existe)");

  // ── 3. Editar monto ──
  console.log("── 3. Editar el monto de un cobro (sin descuento)");
  const cuentaE = await nuevaCuenta(400);
  const cobroE = await cobrar(cuentaE, [{ metodo: "transferencia", monto: 300, propina: 0 }]);
  comprobar(await saldo(cuentaE) === 100, "cuenta de $400 con $300 capturados: debe $100 (antes se «arreglaba» con un descuento)");
  const repE0 = await reporteHoy();
  const sinMotivoE = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroE, p_metodo: "transferencia", p_monto_nuevo: 400, p_motivo: "x" });
  comprobar(sinMotivoE.error && /motivo/i.test(sinMotivoE.error.message), "el motivo es obligatorio");
  const igual = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroE, p_metodo: "transferencia", p_monto_nuevo: 300, p_motivo: "mismo monto de prueba" });
  comprobar(igual.error, "no se edita al mismo monto");
  const metodoMal = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroE, p_metodo: "terminal", p_monto_nuevo: 400, p_motivo: "método que no aplica" });
  comprobar(metodoMal.error, "solo efectivo, transferencia o tarjeta manual");
  const masQueCuenta = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroE, p_metodo: "transferencia", p_monto_nuevo: 450, p_motivo: "más que la cuenta" });
  comprobar(masQueCuenta.error && /a favor/.test(masQueCuenta.error.message), "no deja más cobrado que la cuenta (saldo a favor)");
  const casiTodo = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroE, p_metodo: "transferencia", p_monto_nuevo: 399.5, p_motivo: "deja medio peso" });
  comprobar(casiTodo.error && /menos de un peso/.test(casiTodo.error.message), "no deja a la cuenta debiendo menos de un peso");
  const edit = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroE, p_metodo: "transferencia", p_monto_nuevo: 400, p_motivo: "Estaban cobrados $400 y se capturó $300" });
  comprobar(!edit.error, `corrige $300 → $400 (${edit.error?.message ?? "ok"})`);
  comprobar(await saldo(cuentaE) === 0, "la cuenta queda pagada sin descuento");
  comprobar(await descuentosDe(cuentaE) === 0, "no se generó ningún descuento");
  const repE1 = await reporteHoy();
  comprobar(Number(repE1.cobros_transferencia) === Number(repE0.cobros_transferencia) + 100, "el reporte muestra el valor corregido como lo cobrado");
  comprobar(Number(repE1.descuentos_otorgados) === Number(repE0.descuentos_otorgados), "el reporte de descuentos no se mueve");
  const corrE = await correccionesDe(cobroE);
  comprobar(corrE.length === 1 && corrE[0].tipo === "edicion_monto" && corrE[0].estado_anterior?.monto === 300 && corrE[0].evidencia?.monto_nuevo === 400 && corrE[0].hecha_por === idRecepA,
    "el historial guarda el monto anterior, el nuevo, quién y cuándo");
  const metsE = await metodosDe(cobroE);
  comprobar(metsE.length === 2 && Number(metsE[0].monto) === 300 && Number(metsE[1].monto) === 100, "el renglón original queda tal cual y la diferencia va aparte");
  const bajar = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroE, p_metodo: "transferencia", p_monto_nuevo: 350, p_motivo: "Eran $350, bajar el monto" });
  comprobar(!bajar.error && await saldo(cuentaE) === 50, "también se puede bajar (la cuenta vuelve a deber $50)");
  const tarjE = await nuevaCuenta(500);
  const f2 = folio();
  const cobroTE = await cobrar(tarjE, [{ metodo: "tarjeta_manual", monto: 400, propina: 0, folio: f2, motivo: "sin_senal" }]);
  const edT = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroTE, p_metodo: "tarjeta_manual", p_monto_nuevo: 500, p_motivo: "El voucher dice 500" });
  const tarjEdit = (await SB.from("tarjetas_manuales").select("monto").eq("cobro_id", cobroTE).single()).data;
  comprobar(!edT.error && Number(tarjEdit.monto) === 500, "corregir una tarjeta manual actualiza el monto del voucher registrado");

  // ── 4. Lo que no se corrige aquí ──
  console.log("── 4. Mercado Pago, Clip y «terminal» a mano");
  const cuentaMP = await nuevaCuenta(200);
  const cMP = (await SB.from("cobros").insert({ negocio_id: H, reserva_id: cuentaMP, turno_id: turno.id, origen: "mercadopago_link", notas: "prueba" }).select("id").single()).data.id;
  await SB.from("cobro_metodos").insert({ negocio_id: H, cobro_id: cMP, metodo: "transferencia", monto: 200, propina: 0 });
  const anMP = await adminJ.rpc("anular_cobro", { p_cobro_id: cMP, p_motivo: "intento con Mercado Pago" });
  comprobar(anMP.error && /Mercado Pago/.test(anMP.error.message) && /Devolver con Mercado Pago/.test(anMP.error.message), "un cobro de Mercado Pago no se anula: guía a «Devolver con Mercado Pago»");
  const edMP = await adminJ.rpc("editar_monto_cobro", { p_cobro_id: cMP, p_metodo: "transferencia", p_monto_nuevo: 100, p_motivo: "intento con Mercado Pago" });
  comprobar(edMP.error, "ni se edita su monto");
  const cClip = (await SB.from("cobros").insert({ negocio_id: H, reserva_id: cuentaMP, turno_id: turno.id, origen: "clip_terminal", notas: "prueba" }).select("id").single()).data.id;
  await SB.from("cobro_metodos").insert({ negocio_id: H, cobro_id: cClip, metodo: "terminal", monto: 10, propina: 0 });
  const anClip = await adminJ.rpc("anular_cobro", { p_cobro_id: cClip, p_motivo: "intento con Clip" });
  comprobar(anClip.error && /Clip/.test(anClip.error.message), "un cobro de Clip tampoco: se devuelve en Clip");
  const cMan = (await SB.from("cobros").insert({ negocio_id: H, reserva_id: cuentaMP, turno_id: turno.id, origen: "manual", notas: "prueba" }).select("id").single()).data.id;
  await SB.from("cobro_metodos").insert({ negocio_id: H, cobro_id: cMan, metodo: "terminal", monto: 10, propina: 0 });
  const anTer = await adminJ.rpc("anular_cobro", { p_cobro_id: cMan, p_motivo: "terminal a mano" });
  comprobar(anTer.error && /Terminal/.test(anTer.error.message), "un renglón «Terminal» capturado a mano tampoco");

  // ── 5. Devoluciones previas ──
  console.log("── 5. Con devoluciones ya hechas");
  const cuentaD = await nuevaCuenta(400);
  const cobroD = await cobrar(cuentaD, [{ metodo: "efectivo", monto: 400, propina: 0 }]);
  const devD = await adminJ.rpc("registrar_devolucion", { p_cobro_id: cobroD, p_motivo: "devolución parcial de prueba", p_metodos: [{ metodo: "efectivo", monto: 100 }] });
  comprobar(!devD.error, `devolución previa de $100 (${devD.error?.message ?? "ok"})`);
  const anD = await recA.rpc("anular_cobro", { p_cobro_id: cobroD, p_motivo: "con devolución previa" });
  comprobar(anD.error && /devoluciones/.test(anD.error.message), "con devoluciones, no se anula");
  const bajoDev = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroD, p_metodo: "efectivo", p_monto_nuevo: 90, p_motivo: "por debajo de lo devuelto" });
  comprobar(bajoDev.error && /devoluciones/.test(bajoDev.error.message), "no se baja por debajo de lo ya devuelto");
  const okDev = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroD, p_metodo: "efectivo", p_monto_nuevo: 350, p_motivo: "se cobraron 350 reales" });
  comprobar(!okDev.error, `sí se edita sobre lo devuelto (${okDev.error?.message ?? "ok"})`);

  // ── 6. Cobro junto ──
  console.log("── 6. Cobro junto");
  const gA = await nuevaCuenta(200, "Junto A");
  const gB = await nuevaCuenta(300, "Junto B");
  const fg = folio("GRP");
  const { data: grupo, error: eg } = await recA.rpc("registrar_cobro_grupo", { p_partes: [{ reserva_id: gA, monto: 200 }, { reserva_id: gB, monto: 300 }], p_notas: "prueba grupo", p_metodos: [{ metodo: "tarjeta_manual", monto: 500, propina: 0, folio: fg, motivo: "sin_senal" }] });
  if (eg) throw new Error(`cobro junto: ${eg.message}`);
  const gid = grupo.grupo_id;
  const cobrosG = (await SB.from("cobros").select("id, reserva_id, anulado_at").eq("grupo_id", gid).order("grupo_orden")).data;
  const tarjG = (await SB.from("tarjetas_manuales").select("id, monto, partes, estado").eq("grupo_id", gid).single()).data;
  comprobar(cobrosG.length === 2 && Number(tarjG.monto) === 500, "cobro junto de $500 con un folio");
  const anParte = await recA.rpc("anular_cobro", { p_cobro_id: cobrosG[0].id, p_motivo: "una cuenta no era de esta clienta" });
  comprobar(!anParte.error, `anula UNA parte (${anParte.error?.message ?? "ok"})`);
  const grupoDesp = (await SB.from("cobros_grupo").select("monto_total").eq("id", gid).single()).data;
  const tarjG2 = (await SB.from("tarjetas_manuales").select("monto, partes, estado").eq("grupo_id", gid).single()).data;
  comprobar(Number(grupoDesp.monto_total) === 300, "el total del recibo se recalcula ($300)");
  comprobar(Number(tarjG2.monto) === 300 && tarjG2.partes.length === 1 && tarjG2.estado === "por_revisar", "el folio sigue por la parte que quedó ($300, una cuenta)");
  const det = (await adminJ.rpc("cobro_grupo_detalle", { p_grupo_id: gid })).data;
  const d1 = Array.isArray(det) ? det[0] : det;
  comprobar(d1.cuentas.some((c) => c.anulado === true) && d1.cuentas.some((c) => c.anulado === false) && d1.anulado === false && Number(d1.total) === 300, "el detalle del recibo marca la parte anulada");
  const evG = (await SB.from("cobros_grupo_eventos").select("tipo").eq("grupo_id", gid)).data ?? [];
  comprobar(evG.some((e) => e.tipo === "anulado"), "queda el evento del grupo");
  const anResto = await recA.rpc("anular_cobro_grupo", { p_grupo_id: gid, p_motivo: "se anula el resto del cobro junto" });
  comprobar(!anResto.error, `anula el resto con «anular el cobro junto» (${anResto.error?.message ?? "ok"})`);
  const tarjG3 = (await SB.from("tarjetas_manuales").select("estado").eq("grupo_id", gid).single()).data;
  const det2 = (await adminJ.rpc("cobro_grupo_detalle", { p_grupo_id: gid })).data;
  const d2 = Array.isArray(det2) ? det2[0] : det2;
  comprobar(tarjG3.estado === "anulada" && d2.anulado === true && Number(d2.total) === 0, "sin partes vivas: el folio queda anulado y el recibo, anulado");
  comprobar(await saldo(gA) === 200 && await saldo(gB) === 300, "las dos cuentas vuelven a quedar por cobrar");
  const otraVez = await recA.rpc("anular_cobro_grupo", { p_grupo_id: gid, p_motivo: "otra vez" });
  comprobar(otraVez.error, "un cobro junto ya anulado no se anula de nuevo");
  // Todo el grupo de una vez
  const gC = await nuevaCuenta(100, "Junto C");
  const gD = await nuevaCuenta(100, "Junto D");
  const { data: grupo2 } = await recA.rpc("registrar_cobro_grupo", { p_partes: [{ reserva_id: gC, monto: 100 }, { reserva_id: gD, monto: 100 }], p_notas: "prueba grupo 2", p_metodos: [{ metodo: "efectivo", monto: 200, propina: 0 }] });
  const resG0 = neto(await resumen(turno.id), "efectivo");
  const anTodo = await recA.rpc("anular_cobro_grupo", { p_grupo_id: grupo2.grupo_id, p_motivo: "cobro junto equivocado" });
  comprobar(!anTodo.error && neto(await resumen(turno.id), "efectivo") === resG0 - 200, "anular el cobro junto completo saca los $200 del turno");

  // ── 7. Turno cerrado ──
  console.log("── 7. Cobros de un turno ya cerrado");
  const cuentaC = await nuevaCuenta(400);
  const cobroC = await cobrar(cuentaC, [{ metodo: "efectivo", monto: 400, propina: 0 }]);
  const turnoViejo = turno.id;
  const resViejo0 = await resumen(turnoViejo);
  await cerrarConLoEsperado(turnoViejo);
  const corteViejo = (await SB.from("cortes_caja").select("id, corte_metodos(metodo, esperado, conteo)").eq("turno_id", turnoViejo).single()).data;
  const turnoNuevo = await abrirTurno(100);
  const sinExtra = await recA.rpc("anular_cobro", { p_cobro_id: cobroC, p_motivo: "cobro de un turno cerrado" });
  comprobar(sinExtra.error && /turnos cerrados/.test(sinExtra.error.message), "sin «Corregir cobros de turnos cerrados», no se anula un cobro de un turno cerrado");
  await dar(idRecepA, "corregir_turnos_cerrados");
  const resNuevo0 = await resumen(turnoNuevo.id);
  const anC = await recA.rpc("anular_cobro", { p_cobro_id: cobroC, p_motivo: "cobro de un turno cerrado" });
  comprobar(!anC.error, `con el permiso extra, anula (${anC.error?.message ?? "ok"})`);
  comprobar(anC.data?.turno_del_cobro_cerrado === true && anC.data?.turno_efecto_id === turnoNuevo.id, "el ajuste cae en el turno ABIERTO");
  const metsC = await metodosDe(cobroC);
  comprobar(metsC.length === 2 && metsC[1].turno_efecto_id === turnoNuevo.id && metsC[1].fecha_efecto, "el renglón compensatorio apunta al turno abierto y a la fecha de hoy");
  const resViejo1 = await resumen(turnoViejo);
  comprobar(neto(resViejo1, "efectivo") === neto(resViejo0, "efectivo"), "el turno cerrado no cambia (su corte sigue igual)");
  const corteViejo2 = (await SB.from("cortes_caja").select("id, corte_metodos(metodo, esperado, conteo)").eq("turno_id", turnoViejo).single()).data;
  comprobar(JSON.stringify(corteViejo2) === JSON.stringify(corteViejo), "el corte guardado no se tocó");
  comprobar(neto(await resumen(turnoNuevo.id), "efectivo") === neto(resNuevo0, "efectivo") - 400, "el turno abierto muestra el ajuste (−$400 en efectivo)");
  const movsN = (await adminJ.rpc("movimientos_turno", { p_turno_id: turnoNuevo.id })).data ?? [];
  comprobar(movsN.some((m) => m.ajuste_tipo === "anulacion" && Number(m.monto) === -400), "…y lo lista en Movimientos del turno como ajuste");
  comprobar(await saldo(cuentaC) === 400, "la cuenta vuelve a quedar por cobrar");
  // Editar en turno cerrado
  const cuentaC2 = await nuevaCuenta(300);
  const cobroC2 = await cobrar(cuentaC2, [{ metodo: "efectivo", monto: 200, propina: 0 }]);
  await cerrarConLoEsperado(turnoNuevo.id);
  const turno3 = await abrirTurno(100);
  const edC = await recA.rpc("editar_monto_cobro", { p_cobro_id: cobroC2, p_metodo: "efectivo", p_monto_nuevo: 300, p_motivo: "Eran $300 reales" });
  comprobar(!edC.error && edC.data?.turno_efecto_id === turno3.id, "editar un monto de un turno cerrado cae en el turno abierto");
  // Sin turno abierto
  const turno3Id = turno3.id;
  turno = turno3;

  // ── 8. Corregir el precio de una cuenta ──
  console.log("── 8. Corregir el precio de una cuenta (sin descuento)");
  const cuentaP = await nuevaCuenta(400, "Servicio con precio mal");
  const lineaP = (await SB.from("ventas_mostrador").select("id").eq("negocio_id", H).eq("reserva_id", cuentaP).single()).data.id;
  const cobroP = await cobrar(cuentaP, [{ metodo: "efectivo", monto: 300, propina: 0 }]);
  comprobar(cobroP && await saldo(cuentaP) === 100, "cuenta de $400, cobrados $300: debe $100");
  const sinP = await recB.rpc("corregir_precio_cuenta", { p_reserva_id: cuentaP, p_linea_tipo: "venta", p_linea_id: lineaP, p_precio_nuevo: 300, p_motivo: "era de $300" });
  comprobar(sinP.error && /permiso/i.test(sinP.error.message), "sin el permiso «Editar monto de cobros» no se corrige el precio");
  const sinMot = await recA.rpc("corregir_precio_cuenta", { p_reserva_id: cuentaP, p_linea_tipo: "venta", p_linea_id: lineaP, p_precio_nuevo: 300, p_motivo: "x" });
  comprobar(sinMot.error && /motivo/i.test(sinMot.error.message), "el motivo es obligatorio");
  const repP0 = await reporteHoy();
  const okP = await recA.rpc("corregir_precio_cuenta", { p_reserva_id: cuentaP, p_linea_tipo: "venta", p_linea_id: lineaP, p_precio_nuevo: 300, p_motivo: "El servicio costaba $300" });
  comprobar(!okP.error, `corrige $400 → $300 (${okP.error?.message ?? "ok"})`);
  comprobar(await saldo(cuentaP) === 0, "la cuenta queda pagada");
  comprobar(await descuentosDe(cuentaP) === 0, "sin generar un descuento");
  const repP1 = await reporteHoy();
  comprobar(Number(repP1.descuentos_otorgados) === Number(repP0.descuentos_otorgados), "el reporte de descuentos no se mueve");
  const ajP = (await SB.from("cuenta_ajustes_precio").select("*").eq("reserva_id", cuentaP)).data ?? [];
  comprobar(ajP.length === 1 && Number(ajP[0].precio_antes) === 400 && Number(ajP[0].precio_despues) === 300 && ajP[0].hecha_por === idRecepA, "queda el historial: precio antes, después, quién y cuándo");
  const lineasP = (await adminJ.rpc("cuenta_lineas_reserva", { p_reserva_id: cuentaP })).data ?? [];
  comprobar(lineasP.some((l) => l.tipo === "ajuste" && Number(l.total) === -100), "la cuenta lo muestra como un renglón firmado");
  const abiertasP = (await adminJ.rpc("cuentas_abiertas", { p_dias: 30 })).data ?? [];
  comprobar(!abiertasP.some((c) => c.reserva_id === cuentaP), "la cuenta ya no sale por cobrar");
  const casi = await recA.rpc("corregir_precio_cuenta", { p_reserva_id: cuentaP, p_linea_tipo: "venta", p_linea_id: lineaP, p_precio_nuevo: 300.4, p_motivo: "deja menos de un peso" });
  comprobar(casi.error && /menos de un peso/.test(casi.error.message), "no deja la cuenta debiendo menos de un peso");

  // ── 9. Efectivo agregado ──
  console.log("── 9. Agregar efectivo al turno");
  const sinEfectivo = await recA.rpc("registrar_efectivo_agregado", { p_monto: 100, p_origen: "cambio", p_nota: null });
  comprobar(sinEfectivo.error && /permiso/i.test(sinEfectivo.error.message), "sin «Agregar efectivo a caja» no se agrega");
  await dar(idRecepA, "agregar_efectivo");
  const rep9a = await reporteHoy();
  const res9 = neto(await resumen(turno.id), "efectivo");
  for (const [m, o, nota, esperado] of [[0, "cambio", null, /mayor a cero/], [50, "xxx", null, /de dónde/], [50, "otro", "", /nota/]]) {
    const r = await recA.rpc("registrar_efectivo_agregado", { p_monto: m, p_origen: o, p_nota: nota });
    comprobar(r.error && esperado.test(r.error.message), `rechaza monto ${m} / origen ${o}`);
  }
  const ef1 = await recA.rpc("registrar_efectivo_agregado", { p_monto: 150, p_origen: "cambio", p_nota: "Cambio de la caja de al lado" });
  const ef2 = await recA.rpc("registrar_efectivo_agregado", { p_monto: 50, p_origen: "prestamo_caja", p_nota: null });
  comprobar(!ef1.error && !ef2.error, "agrega efectivo (cambio $150, préstamo $50)");
  const mov9 = (await SB.from("movimientos_caja").select("id, tipo, origen_ingreso, nota, created_by").eq("id", ef1.data).single()).data;
  comprobar(mov9.tipo === "ingreso" && mov9.origen_ingreso === "cambio" && mov9.nota?.includes("Cambio") && mov9.created_by === idRecepA, "queda con origen, nota y quién lo registró");
  comprobar(neto(await resumen(turno.id), "efectivo") === res9, "no es un cobro: el efectivo cobrado del turno no cambia");
  const movs9 = (await adminJ.rpc("movimientos_turno", { p_turno_id: turno.id })).data ?? [];
  comprobar(movs9.filter((m) => m.tipo === "ingreso_efectivo").length === 2 && movs9.find((m) => m.id === ef1.data)?.monto === 150, "aparece en Movimientos del turno como ingreso de efectivo");
  const rep9b = await reporteHoy();
  comprobar(Number(rep9b.efectivo_agregado) === Number(rep9a.efectivo_agregado) + 200, "el reporte lo muestra aparte (efectivo agregado, $200)");
  comprobar(Number(rep9b.ingreso_caja_neto) === Number(rep9a.ingreso_caja_neto) && Number(rep9b.ingreso_reconocido) === Number(rep9a.ingreso_reconocido), "…y NO es ingreso: ni el neto de caja ni el ingreso reconocido se mueven");
  comprobar(Number(rep9b.retiros_efectivo) === Number(rep9a.retiros_efectivo), "no se cuenta como retiro");
  const cancelRetiro = await recA.rpc("cancelar_retiro", { p_id: ef2.data, p_motivo: "intento por la puerta de retiros" });
  comprobar(cancelRetiro.error && /efectivo agregado/.test(cancelRetiro.error.message), "cancelar_retiro no toca efectivo agregado");
  // Esperado del corte: fondo + cobros − retiros + agregados. Un retiro de $20 para ver los dos lados.
  const ret = await recA.rpc("registrar_retiro", { p_monto: 20, p_motivo: "retiro de prueba" });
  comprobar(!ret.error, "un retiro de $20 en el mismo turno");
  const cierre = await adminJ.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: "prueba" });
  const c1 = Array.isArray(cierre.data) ? cierre.data[0] : cierre.data;
  const efTurno = neto(await resumen(turno.id), "efectivo");
  const esperadoEfectivo = Number((await SB.from("turnos_caja").select("fondo_inicial").eq("id", turno.id).single()).data.fondo_inicial) + efTurno + 150 + 50 - 20;
  comprobar(c1 && c1.cerrado === false && Number(c1.esperado_efectivo) === esperadoEfectivo, `el esperado de efectivo = fondo + cobros + agregados − retiros (${c1?.esperado_efectivo} vs ${esperadoEfectivo})`);
  const canc = await recA.rpc("cancelar_efectivo_agregado", { p_id: ef2.data, p_motivo: "Se registró de más" });
  comprobar(!canc.error, "se cancela con motivo (como un retiro)");
  const movCanc = (await SB.from("movimientos_caja").select("deleted_at, cancelado_por, motivo_cancelacion").eq("id", ef2.data).single()).data;
  comprobar(movCanc.deleted_at && movCanc.cancelado_por === idRecepA && /de más/.test(movCanc.motivo_cancelacion), "la fila no se borra: queda cancelada con motivo y quién");
  const cierre2 = await adminJ.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: "prueba" });
  const c2 = Array.isArray(cierre2.data) ? cierre2.data[0] : cierre2.data;
  comprobar(Number(c2.esperado_efectivo) === esperadoEfectivo - 50, "un efectivo cancelado deja de contar en el esperado");
  const repetida = await recA.rpc("cancelar_efectivo_agregado", { p_id: ef2.data, p_motivo: "otra vez" });
  comprobar(repetida.error, "no se cancela dos veces");
  const sinCambioB = await recB.rpc("cancelar_efectivo_agregado", { p_id: ef1.data, p_motivo: "sin permiso" });
  comprobar(sinCambioB.error, "sin el permiso tampoco se cancela");
  // Corte del turno: se cierra bien (esperado negativo no truena).
  const cerrado9 = await cerrarConLoEsperado(turno.id);
  comprobar(cerrado9.cerrado === true, "el turno se cierra con el esperado correcto");
  const turno4 = await abrirTurno(100);
  turno = turno4;

  // ── 10. Aislamiento ──
  console.log("── 10. Quién no puede");
  const cuentaX = await nuevaCuenta(100);
  const cobroX = await cobrar(cuentaX, [{ metodo: "efectivo", monto: 100, propina: 0 }]);
  const otroNegocio = await jwt(idAdmin, LUDOGTEKA);
  const aOtro = await otroNegocio.rpc("anular_cobro", { p_cobro_id: cobroX, p_motivo: "desde otro negocio" });
  comprobar(aOtro.error, "con el encabezado de otro negocio no se alcanza el cobro");
  const adminLudo = (await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "admin").is("deleted_at", null).limit(1)).data?.[0];
  if (adminLudo) {
    const ludoJ = await jwt(adminLudo.profile_id, H);
    const aLudo = await ludoJ.rpc("anular_cobro", { p_cobro_id: cobroX, p_motivo: "admin de otro negocio" });
    comprobar(aLudo.error, "un admin de OTRO negocio no anula un cobro de Huellitas");
  }
  if (esteticaJ) {
    const r = await esteticaJ.rpc("anular_cobro", { p_cobro_id: cobroX, p_motivo: "estética no puede" });
    const r2 = await esteticaJ.rpc("registrar_efectivo_agregado", { p_monto: 10, p_origen: "cambio", p_nota: null });
    comprobar(r.error && r2.error, "estética no anula ni agrega efectivo");
  }
  if (clienteJ) {
    const r = await clienteJ.rpc("anular_cobro", { p_cobro_id: cobroX, p_motivo: "cliente no puede" });
    const l = await clienteJ.from("cobro_correcciones").select("id");
    const l2 = await clienteJ.from("cuenta_ajustes_precio").select("id");
    comprobar(r.error && (l.data ?? []).length === 0 && (l2.data ?? []).length === 0, "el cliente no anula ni lee correcciones ni ajustes de precio");
  }
  const rutas = [["anular_cobro", { p_cobro_id: cobroX, p_motivo: "anónimo" }], ["anular_cobro_grupo", { p_grupo_id: cobroX, p_motivo: "anónimo" }], ["editar_monto_cobro", { p_cobro_id: cobroX, p_metodo: "efectivo", p_monto_nuevo: 5, p_motivo: "anónimo" }],
    ["corregir_precio_cuenta", { p_reserva_id: cuentaX, p_linea_tipo: "venta", p_linea_id: cobroX, p_precio_nuevo: 5, p_motivo: "anónimo" }], ["registrar_efectivo_agregado", { p_monto: 5, p_origen: "cambio", p_nota: null }],
    ["cancelar_efectivo_agregado", { p_id: cobroX, p_motivo: "anónimo" }], ["cobro_correccion_validar", { p_cobro_id: cobroX, p_permiso: "anular_cobros", p_acepta_devoluciones: false }], ["cobro_grupo_recalcular", { p_grupo_id: cobroX, p_tipo: "anulado", p_detalle: {} }]];
  for (const [fn, args] of rutas) {
    const r = await anon.rpc(fn, args);
    comprobar(r.error, `la llave anónima no ejecuta ${fn}`);
  }
  for (const fn of ["cobro_correccion_validar", "cobro_grupo_recalcular"]) {
    const args = fn === "cobro_correccion_validar" ? { p_cobro_id: cobroX, p_permiso: "anular_cobros", p_acepta_devoluciones: false } : { p_grupo_id: cobroX, p_tipo: "anulado", p_detalle: {} };
    const r = await adminJ.rpc(fn, args);
    comprobar(r.error, `ni siquiera un admin con sesión llama a la interna ${fn}`);
  }
  const frontera = await A.rpc("auditoria_frontera");
  comprobar(!frontera.error && (frontera.data ?? []).length === 0, "auditoria_frontera() vacía");
} finally {
  // Deja a Huellitas con un turno abierto y sin permisos sueltos.
  for (const p of PERMISOS) { await quitar(idRecepA, p); await quitar(idRecepB, p); }
}

console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
