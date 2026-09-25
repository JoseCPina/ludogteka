// Empleados: asistencia, ausencias y nómina, contra la base directa, con
// JWT real de cada rol (DESARROLLO). Uso: node scripts/auditoria/empleados.mjs
// Crea datos de prueba en desarrollo (empleados "Prueba nómina …", una
// cita y un cobro con propina); nunca correr contra producción.
import { createClient } from "@supabase/supabase-js";
import { A, NEGOCIO, URL, env, tokenDe } from "./sesiones-dev.mjs";

const conToken = (t) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { headers: { Authorization: `Bearer ${t}` } },
});
// PeluDesk: el rol es la membresía en el negocio auditado (NEGOCIO).
const perfil = async (rol, salto = 0) => {
  const { data } = await A.from("membresias").select("id:profile_id, created_at, profiles(nombre_completo)").eq("negocio_id", NEGOCIO).eq("rol", rol).is("deleted_at", null).order("created_at").range(salto, salto).single();
  return data ? { id: data.id, nombre_completo: data.profiles?.nombre_completo ?? null } : null;
};
const [rec, est, adm] = [await perfil("recepcion"), await perfil("estetica"), await perfil("admin")];
const REC = conToken(await tokenDe(rec.id));
const EST = conToken(await tokenDe(est.id));
const ADM = conToken(await tokenDe(adm.id));
const ANON = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const fallas = [];
const ok = (cond, texto) => { console.log(`${cond ? "  ✔" : "  ✘"} ${texto}`); if (!cond) fallas.push(texto); };
const sello = Date.now().toString(36);
const { data: hoy } = await A.rpc("fecha_negocio");
const sumar = (f, d) => { const [y, m, dd] = f.split("-").map(Number); const x = new Date(Date.UTC(y, m - 1, dd + d)); return x.toISOString().slice(0, 10); };
const dow = new Date(`${hoy}T12:00:00Z`).getUTCDay();
const horaLocal = (desplazaMin) => {
  const t = new Date(Date.now() + desplazaMin * 60000);
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hour12: false }).format(t);
  return s;
};
const revocarTodo = async () => { for (const p of ["nomina", "inventario_costos", "reportes_financieros", "personal"]) await ADM.rpc("revocar_permiso", { p_profile_id: rec.id, p_permiso: p }); };
await revocarTodo();

// Limpieza de corridas anteriores: libera las cuentas ligadas.
await A.from("empleados").update({ deleted_at: new Date().toISOString() }).like("nombre", "Prueba nómina%").is("deleted_at", null);
await A.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).like("notas", "prueba nómina%").is("deleted_at", null);
await A.from("cobros").update({ deleted_at: new Date().toISOString() }).like("notas", "prueba nómina%").is("deleted_at", null);
for (const id of [rec.id, est.id]) await A.from("empleados").update({ deleted_at: new Date().toISOString() }).eq("profile_id", id).is("deleted_at", null);

console.log("── Alta de empleados (admin)");
const alta = async (nombre, puesto, profile_id) => {
  const r = await ADM.from("empleados").insert({ nombre, puesto, fecha_ingreso: sumar(hoy, -30), telefono: "4440000000", emergencia_nombre: "Contacto", emergencia_telefono: "4441111111", profile_id }).select("id").single();
  if (r.error) throw new Error(`${nombre}: ${r.error.message}`);
  return r.data.id;
};
const E1 = await alta(`Prueba nómina estilista ${sello}`, "Estilista", est.id);
const E2 = await alta(`Prueba nómina limpieza ${sello}`, "Limpieza", null);
const E3 = await alta(`Prueba nómina recepción ${sello}`, "Recepción", rec.id);
ok(Boolean(E1 && E2 && E3), "admin da de alta 3 empleados (dos con cuenta, uno sin)");
const cli = await perfil("cliente");
const ligaCliente = await ADM.from("empleados").insert({ nombre: `Prueba nómina cliente ${sello}`, puesto: "x", fecha_ingreso: hoy, profile_id: cli.id }).select("id");
ok(Boolean(ligaCliente.error), "no se puede ligar una cuenta de cliente a un empleado");

// Horario de hoy: E1 entraba hace una hora (llegará tarde); E2, dentro de
// una hora (llegará a tiempo). E2 además trabaja todos los días, con el
// horario puesto desde hace 10 días (para medir faltas pasadas).
const h = (desde, hasta) => ({ dia_semana: dow, hora_entrada: desde, hora_salida: hasta });
const entradaE1 = horaLocal(-60) < "22:00" ? horaLocal(-60) : "00:00";
let r = await ADM.rpc("guardar_horario_empleado", { p_empleado_id: E1, p_dias: [h(entradaE1, "23:59")] });
ok(!r.error, `horario de E1 guardado${r.error ? ` (${r.error.message})` : ""}`);
const entradaE2 = horaLocal(60) > horaLocal(0) ? horaLocal(60) : "23:30";
r = await ADM.rpc("guardar_horario_empleado", { p_empleado_id: E2, p_dias: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ dia_semana: d, hora_entrada: entradaE2, hora_salida: "23:59" })) });
await A.from("empleados_horario").update({ created_at: `${sumar(hoy, -10)}T12:00:00Z` }).eq("empleado_id", E2).is("deleted_at", null);
const horRec = await REC.rpc("guardar_horario_empleado", { p_empleado_id: E2, p_dias: [] });
ok(Boolean(horRec.error), "recepción sin «Nómina» no cambia horarios");

console.log("\n── Recepción sin permisos extra");
const { data: empRec } = await REC.from("empleados").select("id");
ok((empRec ?? []).some((e) => e.id === E1) && (empRec ?? []).some((e) => e.id === E2), "ve a los empleados (para registrarles asistencia)");
const altaRec = await REC.from("empleados").insert({ nombre: "No debe", puesto: "x", fecha_ingreso: hoy }).select("id");
ok(Boolean(altaRec.error) || (altaRec.data ?? []).length === 0, "no da de alta empleados");
const entE2 = await REC.rpc("registrar_entrada", { p_empleado_id: E2 });
ok(!entE2.error, `registra la entrada de quien NO tiene cuenta${entE2.error ? ` (${entE2.error.message})` : ""}`);
const { data: asisE2 } = await A.from("asistencias").select("entrada_capturada_por, entrada_origen").eq("empleado_id", E2).eq("fecha", hoy).is("deleted_at", null).single();
ok(asisE2?.entrada_capturada_por === rec.id && asisE2?.entrada_origen === "recepcion", "el registro dice quién lo capturó (recepción)");
const entE1Rec = await REC.rpc("registrar_entrada", { p_empleado_id: E1 });
ok(Boolean(entE1Rec.error), `no registra por quien SÍ tiene cuenta (${entE1Rec.error?.message?.slice(0, 60)})`);
for (const t of ["esquemas_pago", "adelantos", "nomina_pagos", "comisiones_servicio"]) {
  const x = await REC.from(t).select("id");
  ok((x.data ?? []).length === 0, `no lee ${t}`);
}
const calcRec = await REC.rpc("calcular_nomina", { p_empleado_id: E2, p_desde: sumar(hoy, -6), p_hasta: hoy });
ok(Boolean(calcRec.error), "no calcula nómina");
const corrRec = await REC.rpc("corregir_asistencia", { p_empleado_id: E2, p_fecha: hoy, p_entrada: "08:00", p_salida: null, p_motivo: "x" });
ok(Boolean(corrRec.error), "no corrige asistencia (solo admin)");
const adelRec = await REC.rpc("registrar_adelanto", { p_empleado_id: E2, p_monto: 10, p_fecha: hoy, p_metodo: "efectivo", p_motivo: null });
ok(Boolean(adelRec.error), "no registra adelantos");

console.log("\n── Estética (empleado con cuenta)");
const { data: empEst } = await EST.from("empleados").select("id");
ok((empEst ?? []).length === 1 && empEst[0].id === E1, `solo ve su propio registro de empleado (${(empEst ?? []).length})`);
const entE1 = await EST.rpc("registrar_entrada");
ok(!entE1.error, `registra su propia entrada${entE1.error ? ` (${entE1.error.message})` : ""}`);
const { data: asisE1 } = await A.from("asistencias").select("entrada_capturada_por, entrada_origen").eq("empleado_id", E1).eq("fecha", hoy).is("deleted_at", null).single();
ok(asisE1?.entrada_origen === "propio" && asisE1?.entrada_capturada_por === est.id, "queda como registro propio, capturado por ella");
const dos = await EST.rpc("registrar_entrada");
ok(Boolean(dos.error), `no registra dos entradas el mismo día (${dos.error?.message})`);
const porOtro = await EST.rpc("registrar_entrada", { p_empleado_id: E2 });
ok(Boolean(porOtro.error), "no registra la asistencia de otra persona");
const todos = await EST.rpc("asistencia_periodo", { p_desde: hoy, p_hasta: hoy });
ok(Boolean(todos.error), "no ve la asistencia de todos");
const suya = await EST.rpc("asistencia_periodo", { p_desde: hoy, p_hasta: hoy, p_empleado_id: E1 });
ok(!suya.error && suya.data?.[0]?.estado === "retardo", `ve la suya: hoy = ${suya.data?.[0]?.estado} (${suya.data?.[0]?.minutos_retardo} min tarde)`);
const ajena = await EST.rpc("asistencia_periodo", { p_desde: hoy, p_hasta: hoy, p_empleado_id: E2 });
ok(Boolean(ajena.error), "no ve la de otro empleado");
const salE1 = await EST.rpc("registrar_salida");
ok(!salE1.error, "registra su salida");

console.log("\n── Retardos y faltas contra el horario (hora del negocio)");
const { data: diasE2 } = await ADM.rpc("asistencia_periodo", { p_desde: sumar(hoy, -5), p_hasta: hoy, p_empleado_id: E2 });
const est2 = (diasE2 ?? []).map((d) => `${d.fecha.slice(5)}:${d.estado}`).join(" ");
ok((diasE2 ?? []).filter((d) => d.estado === "falta").length === 5 && diasE2.at(-1).estado === "a_tiempo", `E2: 5 faltas y hoy a tiempo → ${est2}`);

console.log("\n── Corrección (admin) con rastro");
const corr = await ADM.rpc("corregir_asistencia", { p_empleado_id: E2, p_fecha: sumar(hoy, -1), p_entrada: "09:00", p_salida: "17:00", p_motivo: "Olvidó registrar, confirmado con recepción" });
ok(!corr.error, `admin captura un día que faltaba${corr.error ? ` (${corr.error.message})` : ""}`);
const { data: asisAyer } = await A.from("asistencias").select("id, entrada_at, corregida").eq("empleado_id", E2).eq("fecha", sumar(hoy, -1)).is("deleted_at", null).single();
const corr2 = await ADM.rpc("corregir_asistencia", { p_empleado_id: E2, p_fecha: sumar(hoy, -1), p_entrada: "09:30", p_salida: "17:00", p_motivo: "Llegó 9:30" });
const { data: rastro } = await A.from("asistencia_correcciones").select("entrada_anterior, entrada_nueva, motivo").eq("asistencia_id", asisAyer.id).order("created_at");
ok(!corr2.error && rastro?.length === 2 && rastro[1].entrada_anterior === asisAyer.entrada_at, "la segunda corrección guarda el valor original y el motivo");
const sinMotivo = await ADM.rpc("corregir_asistencia", { p_empleado_id: E2, p_fecha: sumar(hoy, -2), p_entrada: "09:00", p_salida: null, p_motivo: " " });
ok(Boolean(sinMotivo.error), "sin motivo no corrige");

console.log("\n── Ausencias y saldo de vacaciones");
const sol = await EST.rpc("solicitar_ausencia", { p_empleado_id: null, p_tipo: "vacaciones", p_desde: sumar(hoy, 7), p_hasta: sumar(hoy, 8), p_motivo: "Viaje" });
ok(!sol.error, `la estilista pide vacaciones${sol.error ? ` (${sol.error.message})` : ""}`);
const solOtro = await EST.rpc("solicitar_ausencia", { p_empleado_id: E2, p_tipo: "dia_personal", p_desde: sumar(hoy, 3), p_hasta: sumar(hoy, 3), p_motivo: null });
ok(Boolean(solOtro.error), "no pide ausencias por otra persona");
const solRec = await REC.rpc("solicitar_ausencia", { p_empleado_id: E2, p_tipo: "incapacidad", p_desde: sumar(hoy, 2), p_hasta: sumar(hoy, 3), p_motivo: "IMSS" });
ok(!solRec.error, "recepción pide una ausencia por quien no tiene cuenta");
const aprEst = await EST.rpc("resolver_ausencia", { p_ausencia_id: sol.data, p_aprobar: true, p_motivo: null });
ok(Boolean(aprEst.error), "estética no aprueba");
const sinSaldo = await ADM.rpc("resolver_ausencia", { p_ausencia_id: sol.data, p_aprobar: true, p_motivo: null });
ok(Boolean(sinSaldo.error), `sin saldo no se aprueban vacaciones (${sinSaldo.error?.message?.slice(0, 50)})`);
await ADM.rpc("ajustar_vacaciones", { p_empleado_id: E1, p_dias: 12, p_tipo: "asignacion", p_motivo: "Primer año" });
const apr = await ADM.rpc("resolver_ausencia", { p_ausencia_id: sol.data, p_aprobar: true, p_motivo: null });
const { data: saldo } = await EST.rpc("saldo_vacaciones", { p_empleado_id: E1 });
const { data: ausSol } = await A.from("ausencias").select("dias").eq("id", sol.data).single();
ok(!apr.error && Number(saldo) === 12 - Number(ausSol.dias), `admin aprueba y el saldo baja 12 − ${ausSol.dias} (días que le tocaba trabajar) = ${saldo}`);
const { data: saldoAjeno } = await EST.rpc("saldo_vacaciones", { p_empleado_id: E2 });
ok(saldoAjeno === null, "no ve el saldo de otro");
const rech = await ADM.rpc("resolver_ausencia", { p_ausencia_id: solRec.data, p_aprobar: false, p_motivo: "" });
ok(Boolean(rech.error), "rechazar pide motivo");

console.log("\n── Nómina: esquema, comisión, propina y adelanto");
const { data: servEst } = await A.from("servicios_cotizables").select("id").eq("categoria", "estetica");
const { data: tamanos } = await A.from("tamanos_categoria").select("id");
const { data: vieja } = await A.from("citas_estetica").select("reserva_id, perro_id, pelaje_id").not("tamano_id", "is", null).limit(1).single();
let cita = null;
for (const sv of servEst ?? []) for (const t of tamanos ?? []) {
  if (cita) break;
  for (const hora of ["14:00", "15:30", "17:00", "12:30"]) {
    if (cita) break;
    const inicio = new Date(`${hoy}T${hora}:00-06:00`).toISOString();
    const fin = new Date(new Date(inicio).getTime() + 3600000).toISOString();
    const x = await A.from("citas_estetica").insert({ ...vieja, empleado_id: est.id, servicio_id: sv.id, tamano_id: t.id, inicio, fin, precio: 400, estado: "en_curso", notas: `prueba nómina ${sello}` }).select("id, servicio_id, reserva_id").single();
    if (!x.error) cita = x.data;
  }
}
ok(Boolean(cita), "cita de prueba de la estilista, hoy");
const fin = await ADM.rpc("finalizar_cita_con_consumo", { p_cita_id: cita.id, p_recogido_por_nombre: "Prueba", p_recogido_por_telefono: "4440000000", p_recogido_por_es_dueno: true });
ok(!fin.error, `se finaliza${fin.error ? ` (${fin.error.message})` : ""}`);
const { data: turno } = await A.from("turnos_caja").select("id").limit(1).single();
const { data: cobro } = await A.from("cobros").insert({ reserva_id: cita.reserva_id, turno_id: turno.id, notas: `prueba nómina ${sello}` }).select("id").single();
await A.from("cobro_metodos").insert({ cobro_id: cobro.id, metodo: "efectivo", monto: 400, propina: 60 });
const { data: otras } = await A.from("citas_estetica").select("precio, empleado_id").eq("reserva_id", cita.reserva_id).is("deleted_at", null).not("estado", "in", "(cancelada,no_llego)");
const totalReserva = otras.reduce((s, c) => s + Number(c.precio), 0);
const miaReserva = otras.filter((c) => c.empleado_id === est.id).reduce((s, c) => s + Number(c.precio), 0);
const propinaEsperada = Math.round(60 * miaReserva / totalReserva * 100) / 100;

const esq = await ADM.from("esquemas_pago").insert({ empleado_id: E1, vigente_desde: sumar(hoy, -30), pago_por_dia: 300, con_comision: true, comision_tipo: "porcentaje", comision_valor: 10 }).select("id");
ok(!esq.error, "admin captura el esquema: $300 por día + 10% de comisión");
const regla = await ADM.from("comisiones_servicio").insert({ servicio_id: cita.servicio_id, empleado_id: E1, tipo: "monto", valor: 55 }).select("id");
ok(!regla.error, "regla propia del servicio para ella: $55 fijo");
await ADM.from("esquemas_pago").insert({ empleado_id: E2, vigente_desde: sumar(hoy, -30), sueldo_monto: 1400, sueldo_periodicidad: "semanal" });
const adel = await ADM.rpc("registrar_adelanto", { p_empleado_id: E1, p_monto: 100, p_fecha: hoy, p_metodo: "efectivo", p_motivo: "Pasaje" });
ok(!adel.error, "adelanto de $100");

const desde = sumar(hoy, -6);
// Comisión esperada: todas las citas finalizadas de su cuenta en el
// periodo; la del servicio con regla propia a $55, las demás al 10%.
const { data: citasSuyas } = await A.from("citas_estetica").select("servicio_id, precio, inicio").eq("empleado_id", est.id).eq("estado", "finalizada").is("deleted_at", null).gte("inicio", `${desde}T06:00:00Z`).lte("inicio", `${sumar(hoy, 1)}T06:00:00Z`);
const comisionEsperada = Math.round(citasSuyas.reduce((t, c) => t + (c.servicio_id === cita.servicio_id ? 55 : Number(c.precio) * 0.1), 0) * 100) / 100;
const { data: calc, error: eCalc } = await ADM.rpc("calcular_nomina", { p_empleado_id: E1, p_desde: desde, p_hasta: hoy });
ok(!eCalc, `calcula el periodo${eCalc ? ` (${eCalc.message})` : ""}`);
if (calc) {
  console.log("     desglose:", JSON.stringify({ dias: calc.dias, pago_dias: calc.pago_dias, comisiones: calc.comisiones, propinas: calc.propinas, adelantos: calc.adelantos, total: calc.total, costo: calc.costo, avisos: calc.avisos }));
  ok(Number(calc.comisiones) === comisionEsperada, `comisión sale sola de las ${citasSuyas.length} citas que atendió (regla del servicio $55, las demás 10%): $${calc.comisiones}`);
  ok(Number(calc.propinas) === propinaEsperada, `propina atribuida a quien atendió: $${calc.propinas} (esperada $${propinaEsperada})`);
  ok(Number(calc.adelantos) === 100, "el adelanto se descuenta");
  ok(Number(calc.pago_dias) === 300 * calc.dias.trabajados, `pago por día: ${calc.dias.trabajados} × $300 = $${calc.pago_dias}`);
  ok(Math.abs(Number(calc.total) - (Number(calc.pago_dias) + comisionEsperada + propinaEsperada - 100)) < 0.01, `total = días + comisión + propina − adelanto = $${calc.total}`);
}
const { data: calc2 } = await ADM.rpc("calcular_nomina", { p_empleado_id: E2, p_desde: desde, p_hasta: hoy });
ok(calc2 && Number(calc2.sueldo) === 1400 && calc2.dias.faltas === 5 && Number(calc2.descuento_faltas) === calc2.dias.faltas * 200, `sueldo semanal $1400 con ${calc2?.dias?.faltas} faltas descontadas ($${calc2?.descuento_faltas})`);

const pago = await ADM.rpc("registrar_pago_nomina", { p_empleado_id: E1, p_desde: desde, p_hasta: hoy, p_metodo: "efectivo", p_fecha_pago: hoy, p_notas: null });
ok(!pago.error, `admin lo marca pagado${pago.error ? ` (${pago.error.message})` : ""}`);
const { data: adelDesp } = await A.from("adelantos").select("pago_id").eq("id", adel.data).single();
ok(adelDesp.pago_id === pago.data, "el adelanto queda ligado al pago que lo descontó");
const doble = await ADM.rpc("registrar_pago_nomina", { p_empleado_id: E1, p_desde: hoy, p_hasta: hoy, p_metodo: "efectivo", p_fecha_pago: hoy, p_notas: null });
ok(Boolean(doble.error), "no se paga dos veces el mismo día");
const futuro = await ADM.rpc("registrar_pago_nomina", { p_empleado_id: E3, p_desde: hoy, p_hasta: sumar(hoy, 1), p_metodo: "efectivo", p_fecha_pago: hoy, p_notas: null });
ok(Boolean(futuro.error), `no se paga un periodo que no ha terminado (${futuro.error?.message?.slice(0, 45)})`);
await ADM.from("esquemas_pago").insert({ empleado_id: E3, vigente_desde: sumar(hoy, -60), sueldo_monto: 3000, sueldo_periodicidad: "quincenal" });
const { data: calcIngreso } = await ADM.rpc("calcular_nomina", { p_empleado_id: E3, p_desde: sumar(hoy, -44), p_hasta: sumar(hoy, -30) });
ok(calcIngreso && Number(calcIngreso.sueldo) === 200 && calcIngreso.avisos.some((a) => a.includes("entró")),
  `el sueldo cuenta desde su ingreso: 1 día de 15 = $${calcIngreso?.sueldo}`);
const borrar = await ADM.from("nomina_pagos").delete().eq("id", pago.data).select("id");
const editar = await ADM.from("nomina_pagos").update({ total: 1 }).eq("id", pago.data).select("id");
ok((borrar.data ?? []).length === 0 && (editar.data ?? []).length === 0, "un pago no se borra ni se edita, ni siendo admin");
const rev = await ADM.rpc("revertir_pago_nomina", { p_pago_id: pago.data, p_motivo: "Se capturó mal el método" });
const { data: reverso } = await A.from("nomina_pagos").select("total, costo, tipo").eq("reverso_de", pago.data).single();
const { data: adelLibre } = await A.from("adelantos").select("pago_id").eq("id", adel.data).single();
ok(!rev.error && Number(reverso.total) === -Number(calc.total) && adelLibre.pago_id === null, "se corrige con movimiento inverso y el adelanto vuelve a quedar pendiente");
const pago2 = await ADM.rpc("registrar_pago_nomina", { p_empleado_id: E1, p_desde: desde, p_hasta: hoy, p_metodo: "transferencia", p_fecha_pago: hoy, p_notas: "Correcto" });
ok(!pago2.error, "después del reverso, el periodo se vuelve a pagar");
await ADM.rpc("registrar_pago_nomina", { p_empleado_id: E2, p_desde: desde, p_hasta: hoy, p_metodo: "efectivo", p_fecha_pago: hoy, p_notas: null });

console.log("\n── Cada quien ve lo suyo");
const { data: pagosEst } = await EST.from("nomina_pagos").select("empleado_id");
ok((pagosEst ?? []).length === 3 && pagosEst.every((p) => p.empleado_id === E1), `la estilista ve sus 3 movimientos de pago y ninguno ajeno (${(pagosEst ?? []).length})`);
const { data: adelEst } = await EST.from("adelantos").select("empleado_id");
ok((adelEst ?? []).every((a) => a.empleado_id === E1) && (adelEst ?? []).length === 1, "ve su adelanto y ninguno ajeno");
const esqEst = await EST.from("esquemas_pago").select("id");
ok((esqEst.data ?? []).length === 0, "no lee esquemas de pago (ni el suyo)");
const { data: pagosRecSin } = await REC.from("nomina_pagos").select("id");
ok((pagosRecSin ?? []).length === 0, "recepción (empleada, sin pagos propios) no ve pagos de nadie");

console.log("\n── Permisos: «Costos de inventario» NO da nómina; «Nómina» sí");
await ADM.rpc("otorgar_permiso", { p_profile_id: rec.id, p_permiso: "inventario_costos" });
const conCostos = await REC.rpc("calcular_nomina", { p_empleado_id: E2, p_desde: desde, p_hasta: hoy });
const pagosCostos = await REC.from("nomina_pagos").select("id");
ok(Boolean(conCostos.error) && (pagosCostos.data ?? []).length === 0, "con «Costos y compras de inventario» sigue sin ver nómina");
await ADM.rpc("otorgar_permiso", { p_profile_id: rec.id, p_permiso: "nomina" });
const conNomina = await REC.rpc("calcular_nomina", { p_empleado_id: E2, p_desde: desde, p_hasta: hoy });
const pagosNomina = await REC.from("nomina_pagos").select("id");
ok(!conNomina.error && (pagosNomina.data ?? []).length >= 4, `con «Nómina» calcula y ve los pagos (${(pagosNomina.data ?? []).length})`);
const corrNom = await REC.rpc("corregir_asistencia", { p_empleado_id: E2, p_fecha: sumar(hoy, -2), p_entrada: "09:00", p_salida: null, p_motivo: "x" });
ok(Boolean(corrNom.error), "con «Nómina» tampoco corrige asistencia (solo admin)");
await revocarTodo();
const quitado = await REC.rpc("calcular_nomina", { p_empleado_id: E2, p_desde: desde, p_hasta: hoy });
ok(Boolean(quitado.error), "al quitarle «Nómina», se le vuelve a rechazar");

console.log("\n── Reportes: la nómina resta en la utilidad; la comisión en el margen");
const { data: util } = await ADM.rpc("reporte_utilidad_periodo", { p_desde: desde, p_hasta: hoy }).single();
const { data: pagosPeriodo } = await A.from("nomina_pagos").select("costo").gte("fecha_pago", desde).lte("fecha_pago", hoy).is("deleted_at", null);
const costoNomina = Math.round(pagosPeriodo.reduce((s, p) => s + Number(p.costo), 0) * 100) / 100;
ok(util && Number(util.nomina_costo) === costoNomina && Math.abs(Number(util.utilidad) - (Number(util.ingreso_reconocido) - Number(util.costo_insumos) - costoNomina - Number(util.gastos_local))) < 0.01,
  `utilidad = ingreso ${util?.ingreso_reconocido} − insumos ${util?.costo_insumos} − nómina ${util?.nomina_costo} − gastos ${util?.gastos_local} = ${util?.utilidad}`);
const { data: margen } = await ADM.rpc("reporte_margen_por_servicio_periodo", { p_desde: hoy, p_hasta: hoy });
const fila = (margen ?? []).find((m) => m.servicio_id === cita.servicio_id);
ok(fila && Number(fila.comision) >= 55 && Number(fila.margen_con_comision) === Number(fila.margen) - Number(fila.comision), `margen del servicio con comisión: ${fila?.margen} − ${fila?.comision} = ${fila?.margen_con_comision}`);
const utilRec = await REC.rpc("reporte_utilidad_periodo", { p_desde: desde, p_hasta: hoy });
ok(Boolean(utilRec.error), "recepción sin «Reportes financieros» no ve la utilidad");

console.log("\n── Llave anónima pelada");
for (const [fn, args] of [
  ["registrar_entrada", {}], ["registrar_salida", {}], ["asistencia_periodo", { p_desde: hoy, p_hasta: hoy }],
  ["calcular_nomina", { p_empleado_id: E1, p_desde: hoy, p_hasta: hoy }], ["registrar_pago_nomina", { p_empleado_id: E1, p_desde: hoy, p_hasta: hoy, p_metodo: "efectivo", p_fecha_pago: hoy, p_notas: null }],
  ["solicitar_ausencia", { p_empleado_id: E1, p_tipo: "vacaciones", p_desde: hoy, p_hasta: hoy, p_motivo: null }], ["saldo_vacaciones", { p_empleado_id: E1 }],
  ["registrar_adelanto", { p_empleado_id: E1, p_monto: 1, p_fecha: hoy, p_metodo: "efectivo", p_motivo: null }], ["reporte_utilidad_periodo", { p_desde: hoy, p_hasta: hoy }],
  ["cuentas_para_empleado", {}], ["corregir_asistencia", { p_empleado_id: E1, p_fecha: hoy, p_entrada: null, p_salida: null, p_motivo: "x" }],
  ["comision_de_cita", { p_cita_id: cita.id }], ["calcular_nomina_interno", { p_empleado_id: E1, p_desde: hoy, p_hasta: hoy }], ["dias_asistencia_interno", { p_empleado_id: E1, p_desde: hoy, p_hasta: hoy }],
]) {
  const x = await ANON.rpc(fn, args);
  ok(Boolean(x.error) && ["42501", "PGRST202"].includes(x.error.code) === true || (x.error?.code ?? "").startsWith("42"), `${fn}: ${x.error?.code ?? "¡respondió!"}`);
}
for (const fn of ["comision_de_cita", "calcular_nomina_interno", "dias_asistencia_interno"]) {
  const x = await ADM.rpc(fn, fn === "comision_de_cita" ? { p_cita_id: cita.id } : { p_empleado_id: E1, p_desde: hoy, p_hasta: hoy });
  ok(Boolean(x.error), `${fn} es interna: ni admin la llama directo (${x.error?.code})`);
}
for (const t of ["empleados", "empleados_horario", "asistencias", "asistencia_correcciones", "ausencias", "vacaciones_movimientos", "esquemas_pago", "comisiones_servicio", "adelantos", "nomina_pagos"]) {
  const x = await ANON.from(t).select("id");
  ok((x.data ?? []).length === 0, `${t}: 0 filas para anónimo`);
}

// Los datos de prueba se quedan (se dan de baja en la próxima corrida); la
// cita de prueba se da de baja ya para no ensuciar la agenda.
await A.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).eq("id", cita.id);

console.log(`\n${fallas.length === 0 ? "TODO BIEN" : `FALLAS: ${fallas.length}`}`);
for (const f of fallas) console.log("  -", f);
if (fallas.length) process.exit(1);
