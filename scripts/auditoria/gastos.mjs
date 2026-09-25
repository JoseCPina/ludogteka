// Gastos del local, contra la base directa, con JWT real de cada rol
// (DESARROLLO). Uso: node scripts/auditoria/gastos.mjs
// Crea gastos "Prueba gastos …" en desarrollo; nunca correr contra producción.
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
const sumar = (f, d) => { const [y, m, dd] = f.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + d)).toISOString().slice(0, 10); };
const mes = (f, n = 0) => { const [y, m] = f.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 10); };
const finMes = (f) => sumar(mes(f, 1), -1);
const PERMISOS = ["gastos", "inventario_costos", "nomina", "reportes_financieros"];
const quitar = async () => { for (const p of PERMISOS) await ADM.rpc("revocar_permiso", { p_profile_id: rec.id, p_permiso: p }); };
await quitar();

// Lo de corridas anteriores se cancela por la función (así su retiro, si
// salió del cajón, deja de contar en el turno abierto).
const { data: viejos } = await A.from("gastos").select("id").like("concepto", "Prueba gastos%").neq("estado", "cancelado").eq("tipo", "gasto");
for (const g of viejos ?? []) await ADM.rpc("cancelar_gasto", { p_gasto_id: g.id, p_motivo: "Limpieza de la prueba anterior" });
await A.from("gastos_recurrentes").update({ activo: false }).like("concepto", "Prueba gastos%");

const { data: categorias } = await A.from("categorias_gasto").select("id, clave, nombre").is("deleted_at", null).order("orden");
const cat = (clave) => categorias.find((c) => c.clave === clave).id;
ok(categorias.length >= 11 && ["renta", "luz", "agua", "gas", "internet_telefono", "mantenimiento_local", "camioneta", "publicidad", "comisiones", "papeleria", "otros"].every((c) => categorias.some((x) => x.clave === c)),
  `categorías iniciales: ${categorias.map((c) => c.nombre).join(", ")}`);

const registrar = (cliente, extra = {}) => cliente.rpc("registrar_gasto", {
  p_concepto: `Prueba gastos ${sello}`, p_categoria_id: cat("papeleria"), p_monto: 100, p_fecha_pago: hoy, p_metodo: "transferencia",
  p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: null, ...extra,
});

console.log("\n── Sin el permiso «Gastos» (ni con «Costos de inventario» ni con «Nómina»)");
for (const [quien, cliente] of [["recepción sin permisos", REC], ["estética", EST]]) {
  const r = await registrar(cliente);
  const g = await cliente.from("gastos").select("id");
  const c = await cliente.from("categorias_gasto").select("id");
  const p = await cliente.rpc("gastos_por_atender");
  ok(Boolean(r.error) && (g.data ?? []).length === 0 && (c.data ?? []).length === 0 && Boolean(p.error), `${quien}: no registra, no lee gastos ni categorías, no ve pendientes`);
}
for (const p of ["inventario_costos", "nomina"]) {
  await ADM.rpc("otorgar_permiso", { p_profile_id: rec.id, p_permiso: p });
  const r = await registrar(REC);
  const g = await REC.from("gastos").select("id");
  ok(Boolean(r.error) && (g.data ?? []).length === 0, `con «${p}» sigue sin acceso a gastos`);
}
await quitar();
await ADM.rpc("otorgar_permiso", { p_profile_id: rec.id, p_permiso: "gastos" });
const conPermiso = await registrar(REC, { p_concepto: `Prueba gastos recepción ${sello}` });
ok(!conPermiso.error, `con «Gastos», recepción registra${conPermiso.error ? ` (${conPermiso.error.message})` : ""}`);
const catRec = await REC.from("categorias_gasto").update({ nombre: "Hackeada" }).eq("id", cat("otros")).select("id");
ok((catRec.data ?? []).length === 0, "con «Gastos» no edita categorías (solo admin)");
const directo = await REC.from("gastos").insert({ estado: "pagado", concepto: "x", categoria_id: cat("otros"), monto: 1, fecha_pago: hoy, metodo: "otro", periodo_desde: hoy, periodo_hasta: hoy }).select("id");
ok(Boolean(directo.error) || (directo.data ?? []).length === 0, "nadie inserta gastos directo (solo por la función)");
const utilRec = await REC.rpc("reporte_utilidad_periodo", { p_desde: mes(hoy), p_hasta: finMes(hoy) });
ok(Boolean(utilRec.error), "«Gastos» no da la utilidad completa (eso es «Reportes financieros»)");

console.log("\n── Periodo que cubre: se reparte entre los meses");
const mesSig = mes(hoy, 1);
const bimestral = await ADM.rpc("registrar_gasto", {
  p_concepto: `Prueba gastos luz ${sello}`, p_categoria_id: cat("luz"), p_monto: 1200, p_fecha_pago: hoy, p_metodo: "domiciliado",
  p_proveedor_id: null, p_periodo_desde: mes(hoy), p_periodo_hasta: finMes(mesSig), p_comprobante_path: null, p_notas: null,
});
ok(!bimestral.error, "admin registra la luz bimestral ($1,200, cubre este mes y el siguiente)");
const antesLuz = async (desde, hasta) => {
  const { data } = await ADM.rpc("gastos_por_categoria_periodo", { p_desde: desde, p_hasta: hasta });
  return Number(data.find((c) => c.categoria_id === cat("luz"))?.monto ?? 0);
};
const luzEsteMes = await antesLuz(mes(hoy), finMes(hoy));
const luzSiguiente = await antesLuz(mesSig, finMes(mesSig));
const diasEste = (Date.parse(finMes(hoy)) - Date.parse(mes(hoy))) / 864e5 + 1;
const diasTotal = (Date.parse(finMes(mesSig)) - Date.parse(mes(hoy))) / 864e5 + 1;
const esperadoEste = Math.round(1200 * diasEste / diasTotal * 100) / 100;
const { data: otrasLuz } = await A.from("gastos").select("monto, periodo_desde, periodo_hasta").eq("categoria_id", cat("luz")).eq("estado", "pagado").neq("id", bimestral.data);
ok((otrasLuz ?? []).length > 0 || Math.abs(luzEsteMes - esperadoEste) < 0.02, `este mes se carga ${luzEsteMes} de 1,200 (esperado ${esperadoEste}, por días), el siguiente ${luzSiguiente}`);
ok(Math.abs(luzEsteMes + luzSiguiente - 1200) < 0.02 || (otrasLuz ?? []).length > 0, "entre los dos meses suman el gasto completo");

console.log("\n── Efectivo del cajón: genera el retiro en el turno abierto");
const { data: turno } = await A.from("turnos_caja").select("id").eq("estado", "abierto").is("deleted_at", null).maybeSingle();
if (!turno) {
  const sinTurno = await registrar(ADM, { p_metodo: "efectivo_caja" });
  ok(Boolean(sinTurno.error) && /turno/.test(sinTurno.error.message), `sin turno abierto lo dice: ${sinTurno.error?.message}`);
} else {
  const cajon = await registrar(ADM, { p_concepto: `Prueba gastos cajón ${sello}`, p_monto: 75.5, p_metodo: "efectivo_caja" });
  const { data: g } = await A.from("gastos").select("movimiento_caja_id").eq("id", cajon.data).single();
  const { data: movs } = await ADM.rpc("movimientos_turno", { p_turno_id: turno.id });
  ok(Boolean(g.movimiento_caja_id) && (movs ?? []).some((m) => m.id === g.movimiento_caja_id && Number(m.monto) === -75.5), "el gasto crea su retiro de $75.50 en el turno abierto");
  const cancel = await ADM.rpc("cancelar_gasto", { p_gasto_id: cajon.data, p_motivo: "Capturado por error" });
  const { data: movs2 } = await ADM.rpc("movimientos_turno", { p_turno_id: turno.id });
  ok(!cancel.error && !(movs2 ?? []).some((m) => m.id === g.movimiento_caja_id), `al cancelarlo con el turno abierto, su retiro deja de contar (${cancel.data})`);
  // Sin turno: se cierra en falso el turno un momento (solo desarrollo) y se restaura.
  const { data: original } = await A.from("turnos_caja").select("cerrado_at, cerrado_por").eq("id", turno.id).single();
  const cierre = await A.from("turnos_caja").update({ estado: "cerrado", cerrado_at: new Date().toISOString(), cerrado_por: adm.id }).eq("id", turno.id).select("id");
  if (cierre.error) throw new Error("no se pudo simular el turno cerrado: " + cierre.error.message);
  const sinTurno = await registrar(ADM, { p_metodo: "efectivo_caja" });
  await A.from("turnos_caja").update({ estado: "abierto", cerrado_at: original.cerrado_at, cerrado_por: original.cerrado_por }).eq("id", turno.id);
  ok(Boolean(sinTurno.error) && /turno/.test(sinTurno.error.message), `sin turno abierto lo dice: «${sinTurno.error?.message?.slice(0, 60)}…»`);
}

console.log("\n── Nunca se borra: se cancela o se corrige");
const aCorregir = await registrar(ADM, { p_concepto: `Prueba gastos corregir ${sello}`, p_monto: 500 });
const corr = await ADM.rpc("corregir_gasto", { p_gasto_id: aCorregir.data, p_monto_correcto: 450, p_motivo: "El ticket decía 450" });
const { data: ajuste } = await A.from("gastos").select("tipo, monto, ajuste_de").eq("id", corr.data).single();
ok(!corr.error && ajuste.tipo === "ajuste" && Number(ajuste.monto) === -50 && ajuste.ajuste_de === aCorregir.data, "corregir crea un ajuste de −$50 ligado al original");
const borrar = await ADM.from("gastos").delete().eq("id", aCorregir.data).select("id");
const editar = await ADM.from("gastos").update({ monto: 1 }).eq("id", aCorregir.data).select("id");
ok((borrar.data ?? []).length === 0 && (editar.data ?? []).length === 0, "ni admin borra ni edita un gasto directo");
const sinMotivo = await ADM.rpc("cancelar_gasto", { p_gasto_id: aCorregir.data, p_motivo: " " });
ok(Boolean(sinMotivo.error), "cancelar pide motivo");
await ADM.rpc("cancelar_gasto", { p_gasto_id: aCorregir.data, p_motivo: "Prueba" });
const { data: ajusteDesp } = await A.from("gastos").select("estado").eq("id", corr.data).single();
ok(ajusteDesp.estado === "cancelado", "cancelar el original cancela también sus ajustes");

console.log("\n── Recurrentes: lo esperado de cada periodo, y el aviso");
const venc = sumar(hoy, -3);
const plantilla = await ADM.from("gastos_recurrentes").insert({
  concepto: `Prueba gastos renta ${sello}`, categoria_id: cat("renta"), monto_estimado: 8000, cada_meses: 1,
  dia: Number(venc.slice(8, 10)), proxima_fecha: venc,
}).select("id").single();
ok(!plantilla.error, "plantilla de renta mensual");
const { data: pendientes } = await ADM.rpc("gastos_por_atender");
const esperado = (pendientes ?? []).find((p) => p.recurrente_id === plantilla.data.id);
ok(esperado && esperado.vencido && esperado.dias === 3, `genera el gasto esperado y avisa que venció hace ${esperado?.dias} días`);
const { data: pendientes2 } = await ADM.rpc("gastos_por_atender");
ok((pendientes2 ?? []).filter((p) => p.recurrente_id === plantilla.data.id).length === 1, "no lo duplica al volver a consultar");
const pagar = await ADM.rpc("pagar_gasto_esperado", { p_gasto_id: esperado.id, p_monto: 8250, p_fecha_pago: hoy, p_metodo: "transferencia", p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: "Subió la renta" });
const { data: pagado } = await A.from("gastos").select("estado, monto, monto_estimado").eq("id", esperado.id).single();
ok(!pagar.error && pagado.estado === "pagado" && Number(pagado.monto) === 8250 && Number(pagado.monto_estimado) === 8000, "se marca pagado con su monto real ($8,250, esperado $8,000)");
await ADM.from("gastos_recurrentes").update({ activo: false }).eq("id", plantilla.data.id);

console.log("\n── Utilidad: resta los gastos del local");
const { data: util } = await ADM.rpc("reporte_utilidad_periodo", { p_desde: mes(hoy), p_hasta: finMes(hoy) }).single();
const { data: porCat } = await ADM.rpc("gastos_por_categoria_periodo", { p_desde: mes(hoy), p_hasta: finMes(hoy) });
const sumaCat = Math.round(porCat.reduce((s, c) => s + Number(c.monto), 0) * 100) / 100;
ok(util && Math.abs(Number(util.gastos_local) - sumaCat) < 0.05, `gastos del local del mes = suma por categoría (${util?.gastos_local} / ${sumaCat})`);
ok(util && Math.abs(Number(util.utilidad) - (Number(util.ingreso_reconocido) - Number(util.costo_insumos) - Number(util.nomina_costo) - Number(util.gastos_local))) < 0.01,
  `utilidad = ${util?.ingreso_reconocido} − ${util?.costo_insumos} − ${util?.nomina_costo} − ${util?.gastos_local} = ${util?.utilidad}`);

console.log("\n── Comisión de Mercado Pago, sola (solo el servidor)");
const { data: reservaCualquiera } = await A.from("reservas").select("id").limit(1).single();
const { data: orden } = await A.from("mp_ordenes").insert({ tipo: "link", reserva_id: reservaCualquiera.id, monto: 100, simulado: true }).select("id").single();
ok(Boolean(orden), "orden de Mercado Pago de prueba (simulada)");
if (orden) {
  await A.from("gastos").update({ mp_orden_id: null }).eq("mp_orden_id", orden.id);
  const r1 = await A.rpc("registrar_comision_mercadopago", { p_orden_id: orden.id, p_monto: 12.34, p_detalle: "prueba" });
  const r2 = await A.rpc("registrar_comision_mercadopago", { p_orden_id: orden.id, p_monto: 12.34, p_detalle: "prueba" });
  const { data: com } = await A.from("gastos").select("categoria_id, monto, metodo").eq("mp_orden_id", orden.id).single();
  ok(r1.data === true && r2.data === false && com.categoria_id === cat("comisiones") && com.metodo === "retenido", "la comisión entra una sola vez por orden, como «retenido», en Comisiones");
  const rAdm = await ADM.rpc("registrar_comision_mercadopago", { p_orden_id: orden.id, p_monto: 1, p_detalle: null });
  ok(Boolean(rAdm.error), "ni admin la registra a mano por esa puerta");
  await A.from("gastos").update({ mp_orden_id: null, estado: "cancelado", motivo_cancelacion: "prueba" }).eq("mp_orden_id", orden.id);
  await A.from("mp_ordenes").update({ deleted_at: new Date().toISOString() }).eq("id", orden.id);
}

console.log("\n── Llave anónima pelada");
for (const [fn, args] of [
  ["registrar_gasto", { p_concepto: "x", p_categoria_id: cat("otros"), p_monto: 1, p_fecha_pago: hoy, p_metodo: "otro", p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: null }],
  ["cancelar_gasto", { p_gasto_id: bimestral.data, p_motivo: "x" }], ["corregir_gasto", { p_gasto_id: bimestral.data, p_monto_correcto: 1, p_motivo: "x" }],
  ["pagar_gasto_esperado", { p_gasto_id: bimestral.data, p_monto: 1, p_fecha_pago: hoy, p_metodo: "otro", p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: null }],
  ["gastos_por_atender", {}], ["gastos_por_categoria_periodo", { p_desde: hoy, p_hasta: hoy }], ["reporte_utilidad_periodo", { p_desde: hoy, p_hasta: hoy }],
  ["registrar_comision_mercadopago", { p_orden_id: bimestral.data, p_monto: 1, p_detalle: null }], ["generar_gastos_esperados", {}], ["retiro_de_gasto", { p_monto: 1, p_concepto: "x" }],
  ["adjuntar_comprobante_gasto", { p_gasto_id: bimestral.data, p_path: "gastos/x" }],
]) {
  const x = await ANON.rpc(fn, args);
  ok(x.error?.code === "42501", `${fn}: ${x.error?.code ?? "¡respondió!"}`);
}
for (const fn of ["generar_gastos_esperados", "retiro_de_gasto"]) {
  const x = await ADM.rpc(fn, fn === "retiro_de_gasto" ? { p_monto: 1, p_concepto: "x" } : {});
  ok(Boolean(x.error), `${fn} es interna: ni admin la llama directo`);
}
for (const t of ["gastos", "categorias_gasto", "gastos_recurrentes"]) {
  const x = await ANON.from(t).select("id");
  ok((x.data ?? []).length === 0, `${t}: 0 filas para anónimo`);
}
await quitar();

console.log(`\n${fallas.length === 0 ? "TODO BIEN" : `FALLAS: ${fallas.length}`}`);
for (const f of fallas) console.log("  -", f);
if (fallas.length) process.exit(1);
