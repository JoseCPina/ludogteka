// Veterinaria, Fase 4 · espejo del SITPV, recetario especial, candado de salida y reporte mensual
// (SOLO DESARROLLO, en Huellitas; nunca Ludogteka). Migraciones 20261017000000 a 20261017000500.
//
//   node scripts/auditoria/sitpv-espejo-dev.mjs
//
// 1. Quién registra: médico designado con CPA; folio del bloque del médico, contador que baja.
// 2. El registro espejo: campos, uso hospitalario, parcialidades, cancelación (folio en ceros).
// 3. Surtir contra el folio: parcialidades con paciente y fecha; no pasa de lo amparado.
// 4. CANDADO: ninguna salida de un controlado sin documento (venta de mostrador, consumo,
//    surtido directo, hospitalización).
// 5. Recetario especial: folio con código de barras, tope de 30 días, surtido.
// 6. Avisos: folios por agotarse y reportes mensuales pendientes; marca «reportado».
// 7. Antimicrobianos con espejo (opción del negocio), archivado y aislamiento.
import { comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { preparar, limpiar, darFolios, rpc, get, SB, B, A, dar, quitar, sumaDias, tokenDe } from "./recetas-comun-dev.mjs";

const E = await preparar("sitpv");
const { P } = E;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const ml = (x) => Math.round(Number(x) * 100) / 100;
const saldo = async (lote) => Number((await SB.from("insumo_lotes_saldo").select("saldo").eq("lote_id", lote).single()).data.saldo);
const registrar = (token, extra = {}) =>
  rpc(token, "vet_sitpv_registrar", {
    p_perro: E.perro, p_uso_hospitalario: false, p_insumo: E.grupoI, p_registro_senasica: null, p_lote: E.lote.grupoI, p_presentacion: null,
    p_dosis: "0.5 ml/kg", p_intervalo: "Cada 8 horas", p_duracion: "3 días", p_cantidad_total: 100, p_parcialidades: false,
    p_comprobante_compra: "Factura F-123", p_observaciones: "Sedación", p_fecha: null, ...extra,
  });
const surtir = (token, tipo, doc, lote, cantidad, extra = {}) =>
  rpc(token, "vet_surtir_controlado", { p_tipo: tipo, p_doc: doc, p_salidas: [{ lote_id: lote, cantidad }], p_perro: null, p_consulta: null, p_motivo: null, ...extra });
const hospId = [];

try {
  E.perro = await E.nuevoPerro("Sitpin");
  const otro = await E.nuevoPerro("Otrin");
  const bloque = 1000000 + Math.floor(Math.random() * 800000000);

  seccion("1. Quién registra y el folio");
  comprobar(!(await registrar(P.recSin)).ok, "recepción sin permiso ni designación no registra");
  await dar(P.admin, P.recSinId, "registrar_recetas_sitpv");
  const sinMed = await registrar(P.recSin);
  comprobar(!sinMed.ok && /m[eé]dico veterinario designado/i.test(sinMed.mensaje), `con el permiso pero sin ser médico tampoco (${sinMed.mensaje})`);
  await quitar(P.admin, P.recSinId, "registrar_recetas_sitpv");
  comprobar(!(await registrar(P.admin)).ok && !(await registrar(P.cliente)).ok && !(await registrar(null)).ok, "un admin que no es médico, el cliente y el anónimo tampoco");
  const sinFolios = await registrar(P.recCon);
  comprobar(!sinFolios.ok && /folios/i.test(sinFolios.mensaje), `sin folios asignados no se registra (${sinFolios.mensaje})`);
  await darFolios(E, E.medA, bloque, bloque + 7);
  const sinCpa = await rpc(P.estetica, "vet_sitpv_registrar", { p_perro: E.perro, p_uso_hospitalario: false, p_insumo: E.grupoI, p_registro_senasica: null, p_lote: null, p_presentacion: null, p_dosis: null, p_intervalo: null, p_duracion: null, p_cantidad_total: 10, p_parcialidades: false, p_comprobante_compra: null, p_observaciones: null, p_fecha: null });
  comprobar(!sinCpa.ok && /CPA/.test(sinCpa.mensaje), `un médico sin CPA no puede (${sinCpa.mensaje})`);
  comprobar(!(await registrar(P.recCon, { p_insumo: E.grupoII })).ok, "un Grupo II no pide receta cuantificada");
  comprobar(!(await registrar(P.recCon, { p_insumo: E.libre })).ok, "ni uno libre");
  comprobar(!(await registrar(P.recCon, { p_cantidad_total: 0 })).ok && !(await registrar(P.recCon, { p_perro: null })).ok, "sin cantidad o sin paciente (no hospitalario) se rechaza");
  comprobar(!(await registrar(P.recCon, { p_fecha: sumaDias(E.hoy, 3) })).ok, "una fecha futura se rechaza");
  const e1 = await registrar(P.recCon);
  comprobar(e1.ok && e1.cuerpo.folio === String(bloque) && e1.cuerpo.folios_disponibles === 7, `el primer folio sale del bloque del médico y el contador baja (${e1.mensaje} ${JSON.stringify(e1.cuerpo)})`);
  const e2 = await registrar(P.recCon, { p_dosis: "x" });
  comprobar(e2.ok && e2.cuerpo.folio === String(bloque + 1) && e2.cuerpo.folios_disponibles === 6, "el segundo es el siguiente y quedan 6");
  const reg = (await rpc(P.recCon, "vet_sitpv_detalle", { p_id: e1.cuerpo.id })).cuerpo;
  comprobar(reg.cpa === "CPA-F4" && reg.registro_senasica === "REG-I-1" && reg.laboratorio === "Laboratorio Prueba" && reg.lote?.startsWith("L-grupoI") && reg.comprobante_compra === "Factura F-123", "guarda CPA, registro SENASICA (del producto), laboratorio, lote y comprobante");
  comprobar(reg.dosis === "0.5 ml/kg" && reg.intervalo && reg.duracion && reg.cantidad_total === 100 && reg.unidad && reg.mascota.startsWith("Sitpin") && reg.principio_activo, "dosis, intervalo, duración, cantidad, paciente y principio activo");
  comprobar(/Espejo de receta SITPV/.test(reg.leyenda) && /no válida/i.test(reg.leyenda), "el PDF de referencia lleva la leyenda «no válida para surtir»");
  const ovr = await registrar(P.recCon, { p_registro_senasica: "REG-OTRO" });
  comprobar((await rpc(P.recCon, "vet_sitpv_detalle", { p_id: ovr.cuerpo.id })).cuerpo.registro_senasica === "REG-OTRO", "el registro SENASICA se puede capturar en el momento");
  await SB.from("insumos").update({ registro_senasica: null }).eq("id", E.grupoI);
  const sinReg = await registrar(P.recCon);
  comprobar(!sinReg.ok && /registro SENASICA/i.test(sinReg.mensaje), `sin número de registro SENASICA se rechaza (${sinReg.mensaje})`);
  await SB.from("insumos").update({ registro_senasica: "REG-I-1" }).eq("id", E.grupoI);
  comprobar(Boolean((await SB.from("vet_sitpv_recetas").update({ dosis: "otra" }).eq("id", e1.cuerpo.id)).error), "un registro no se edita (ni con la llave de servidor)");
  comprobar(Boolean((await SB.from("vet_sitpv_recetas").delete().eq("id", e1.cuerpo.id)).error), "ni se borra");

  seccion("2. Uso hospitalario, parcialidades y cancelación");
  const h1 = await registrar(P.recCon, { p_perro: null, p_uso_hospitalario: true, p_parcialidades: null, p_observaciones: "Sedaciones de la semana" });
  comprobar(h1.ok, `un registro de uso hospitalario no necesita paciente (${h1.mensaje})`);
  const hd = (await rpc(P.recCon, "vet_sitpv_detalle", { p_id: h1.cuerpo.id })).cuerpo;
  comprobar(hd.uso_hospitalario && hd.parcialidades === true && /USO HOSPITALARIO/.test(hd.observaciones) && /Huellitas/i.test(hd.observaciones) && /parcialidades/i.test(hd.observaciones), "las observaciones llevan «USO HOSPITALARIO» con el nombre de la clínica y «se ocupará en parcialidades»");
  const cancelOk = await rpc(P.recCon, "vet_sitpv_cancelar", { p_id: e2.cuerpo.id, p_motivo: "Error de captura" });
  comprobar(cancelOk.ok, "un folio sin uso se cancela con motivo");
  comprobar(!(await rpc(P.recCon, "vet_sitpv_cancelar", { p_id: e2.cuerpo.id, p_motivo: "Otra vez más" })).ok, "no se cancela dos veces");
  comprobar(!(await rpc(P.recCon, "vet_sitpv_cancelar", { p_id: ovr.cuerpo.id, p_motivo: "x" })).ok, "cancelar pide un motivo de verdad");
  comprobar(!(await rpc(P.recSin, "vet_sitpv_cancelar", { p_id: ovr.cuerpo.id, p_motivo: "Sin permiso alguno" })).ok, "sin permiso no se cancela");
  comprobar(Boolean((await SB.from("vet_sitpv_recetas").update({ estado: "registrada" }).eq("id", e2.cuerpo.id)).error), "un folio cancelado no se reactiva");

  seccion("3. Surtir contra el folio: parcialidades con paciente y fecha");
  const antes = await saldo(E.lote.grupoI);
  comprobar(!(await surtir(P.recSin, "espejo", e1.cuerpo.id, E.lote.grupoI, 10)).ok, "sin permiso no se surte");
  const s1 = await surtir(P.recCon, "espejo", e1.cuerpo.id, E.lote.grupoI, 40);
  comprobar(s1.ok, `se surte contra el folio (${s1.mensaje})`);
  comprobar(ml(await saldo(E.lote.grupoI)) === ml(antes - 40), "el lote bajó lo surtido");
  const mv = (await SB.from("lotes_movimientos").select("*").eq("espejo_id", e1.cuerpo.id)).data;
  comprobar(mv.length === 1 && mv[0].folio_receta === String(bloque) && mv[0].perro_id === E.perro && mv[0].medico_id === E.medA && mv[0].uso_hospitalario === false, "el movimiento queda ligado al folio con paciente y médico");
  const s1b = await surtir(P.recCon, "espejo", e1.cuerpo.id, E.lote.grupoI, 10);
  comprobar(!s1b.ok && /no es en parcialidades/i.test(s1b.mensaje), `el folio sin parcialidades no se surte otra vez (${s1b.mensaje})`);
  const e3 = await registrar(P.recCon, { p_parcialidades: true, p_cantidad_total: 30 });
  comprobar((await surtir(P.recCon, "espejo", e3.cuerpo.id, E.lote.grupoI, 20)).ok && (await surtir(P.recCon, "espejo", e3.cuerpo.id, E.lote.grupoI, 10)).ok, "con parcialidades se surte en varias");
  const ex = await surtir(P.recCon, "espejo", e3.cuerpo.id, E.lote.grupoI, 1);
  comprobar(!ex.ok && /excede/i.test(ex.mensaje), `y no pasa de lo amparado (${ex.mensaje})`);
  comprobar(!(await surtir(P.recCon, "espejo", e3.cuerpo.id, E.lote.grupoI, 1, { p_perro: otro })).ok, "un paciente distinto al del folio se rechaza");
  const dd = (await rpc(P.recCon, "vet_sitpv_detalle", { p_id: e3.cuerpo.id })).cuerpo;
  comprobar(dd.aplicaciones.length === 2 && dd.aplicaciones.every((a) => a.fecha && a.paciente?.startsWith("Sitpin") && a.lote) && dd.surtido === 30, "el detalle lista cada aplicación con fecha, paciente y lote");
  comprobar(!(await rpc(P.recCon, "vet_sitpv_cancelar", { p_id: e3.cuerpo.id, p_motivo: "Ya se surtió" })).ok, "un folio con parcialidades no se cancela");
  // Hospitalario: con y sin paciente
  const hs = await surtir(P.recCon, "espejo", h1.cuerpo.id, E.lote.grupoI, 5, { p_perro: otro });
  comprobar(hs.ok, `uso hospitalario con el paciente indicado (${hs.mensaje})`);
  const hsm = (await SB.from("lotes_movimientos").select("uso_hospitalario, perro_id").eq("espejo_id", h1.cuerpo.id)).data[0];
  comprobar(hsm.uso_hospitalario === true && hsm.perro_id === otro, "queda marcado como uso hospitalario con su paciente");
  comprobar((await surtir(P.recCon, "espejo", h1.cuerpo.id, E.lote.grupoI, 5)).ok, "o sin paciente");
  comprobar(!(await surtir(P.recCon, "espejo", e1.cuerpo.id, E.lote.grupoII, 1)).ok, "un lote de otro producto no se ampara con ese folio");
  comprobar(!(await surtir(P.recCon, "espejo", e2.cuerpo.id, E.lote.grupoI, 1)).ok, "ni un folio cancelado");

  seccion("4. El candado: ningún controlado sale sin documento");
  const base = await saldo(E.lote.grupoI);
  const directo = await rpc(P.admin, "registrar_lote_salida", { p_lote_id: E.lote.grupoI, p_cantidad_consumo: 5, p_tipo: "surtido", p_motivo: null, p_folio_receta: "inventado" });
  comprobar(!directo.ok && /controlado/i.test(directo.mensaje), `la pantalla de inventario no surte un controlado aunque se escriba un folio (${directo.mensaje})`);
  const consumo = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: E.grupoI, tipo: "salida_consumo", cantidad_base: 5000 });
  comprobar(Boolean(consumo.error) && /controlado/i.test(consumo.error.message), `un consumo (receta de servicio) tampoco (${consumo.error?.message})`);
  const lotesIns = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: E.fr3, tipo: "salida_consumo", cantidad_base: 1000 });
  comprobar(Boolean(lotesIns.error), "ni uno de la fracción III");
  // Venta de mostrador de verdad
  await SB.from("insumos").update({ se_vende: true, precio_venta: 100 }).in("id", [E.grupoI, E.grupoII, E.libre]);
  const venta = await rpc(P.admin, "crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ insumo_id: E.grupoI, cantidad: 0.001 }], p_notas: null });
  comprobar(!venta.ok && /controlado/i.test(venta.mensaje) && /Recetas/.test(venta.mensaje), `una venta de mostrador de un Grupo I se rechaza con un mensaje claro (${venta.mensaje})`);
  const ventaOk = await rpc(P.admin, "crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ insumo_id: E.libre, cantidad: 0.001 }], p_notas: "Prueba F4" });
  comprobar(ventaOk.ok, `un producto libre sí se vende (${ventaOk.mensaje})`);
  if (ventaOk.ok) E.reservas.push(ventaOk.cuerpo);
  const consumoII = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: E.grupoII, tipo: "salida_consumo", cantidad_base: 100 });
  comprobar(!consumoII.error, `un Grupo II sin documento sigue saliendo como siempre (${consumoII.error?.message})`);
  comprobar(ml(await saldo(E.lote.grupoI)) === ml(base), "el lote del Grupo I no se movió con ningún intento");
  const merma = await rpc(P.admin, "registrar_lote_salida", { p_lote_id: E.lote.grupoI, p_cantidad_consumo: 2, p_tipo: "merma", p_motivo: "Frasco roto", p_folio_receta: null });
  comprobar(merma.ok, `una merma con motivo sí se registra (no se surte a nadie) (${merma.mensaje})`);
  const ajuste = await rpc(P.admin, "registrar_lote_ajuste", { p_lote_id: E.lote.grupoI, p_cantidad_consumo: 1, p_sentido: "negativo", p_motivo: "Conteo físico" });
  comprobar(ajuste.ok, "y un ajuste con motivo");
  // Hospitalización
  const ing = await rpc(P.recCon, "hospitalizar_ingresar", { p_perro_id: otro, p_medico_id: E.medA, p_motivo: "Prueba F4", p_ubicacion: null, p_deposito: 0, p_precio_dia: null });
  comprobar(ing.ok, `un paciente se interna (${ing.mensaje})`);
  hospId.push(ing.cuerpo.id);
  const med = await rpc(P.recCon, "hospitalizar_indicar_medicacion", { p_hosp: ing.cuerpo.id, p_producto: "Xilazina", p_insumo_id: E.grupoI, p_dosis: "0.5 ml", p_via: "IM", p_frecuencia_horas: 8, p_primera_dosis: new Date(Date.now() - 3600000).toISOString(), p_num_dosis: 3, p_precio_dosis: null, p_indicaciones: null, p_medico_id: E.medA });
  const dosis = (await SB.from("hospitalizacion_dosis").select("id").eq("medicacion_id", med.cuerpo).order("programada_at")).data;
  const sinFolio = await rpc(P.recCon, "hospitalizar_aplicar_dosis", { p_dosis_id: dosis[0].id, p_lote_id: E.lote.grupoI, p_lote_texto: null, p_cantidad: 2, p_nota: null });
  comprobar(!sinFolio.ok && /controlado/i.test(sinFolio.mensaje), `una dosis hospitalaria de un Grupo I sin folio se rechaza (${sinFolio.mensaje})`);
  const conFolio = await rpc(P.recCon, "hospitalizar_aplicar_dosis", { p_dosis_id: dosis[0].id, p_lote_id: E.lote.grupoI, p_lote_texto: null, p_cantidad: 2, p_nota: null, p_espejo: h1.cuerpo.id });
  comprobar(conFolio.ok, `con el folio de uso hospitalario sí (${conFolio.mensaje})`);
  const mh = (await SB.from("lotes_movimientos").select("espejo_id, perro_id, uso_hospitalario, folio_receta").eq("espejo_id", h1.cuerpo.id).order("created_at"));
  comprobar(mh.data.length === 3 && mh.data.at(-1).perro_id === otro && mh.data.at(-1).uso_hospitalario === true, "la aplicación queda como parcialidad del folio con su paciente");
  comprobar(!(await rpc(P.recCon, "hospitalizar_aplicar_dosis", { p_dosis_id: dosis[1].id, p_lote_id: E.lote.grupoI, p_lote_texto: null, p_cantidad: 2, p_nota: null, p_espejo: e1.cuerpo.id })).ok, "con el folio de otro paciente no (el folio del perro, no hospitalario)");
  await rpc(P.recCon, "hospitalizar_dar_alta", { p_hosp: ing.cuerpo.id, p_resumen: "ok" });

  seccion("5. Recetario especial (estupefacientes)");
  const rec = (token, extra = {}) => rpc(token, "vet_recetario_registrar", { p_perro: E.perro, p_insumo: E.especial, p_folio: `RE-${E.MARCA}-1`, p_codigo_barras: "7501234567890", p_fecha: null, p_dias: 10, p_cantidad_diaria: 5, p_indicaciones: "Dolor", ...extra });
  comprobar(!(await rec(P.recSin)).ok && !(await rec(P.admin)).ok && !(await rec(null)).ok, "sin permiso, sin ser médico o anónimo no se registra");
  await dar(P.admin, P.recCon === null ? "" : P.recConId, "registrar_recetas_sitpv");
  const r31 = await rec(P.recCon, { p_dias: 31 });
  comprobar(!r31.ok && /30 d[ií]as/.test(r31.mensaje), `más de 30 días de tratamiento se rechaza (${r31.mensaje})`);
  comprobar(!(await rec(P.recCon, { p_folio: "" })).ok && !(await rec(P.recCon, { p_codigo_barras: "" })).ok, "sin folio o sin código de barras se rechaza");
  comprobar(!(await rec(P.recCon, { p_insumo: E.grupoII })).ok, "un producto que no pide recetario especial se rechaza");
  const r1 = await rec(P.recCon);
  comprobar(r1.ok && r1.cuerpo.cantidad_total === 50, `un tratamiento de 10 días × 5 = 50 (${r1.mensaje})`);
  comprobar(!(await rec(P.recCon)).ok, "el mismo folio de recetario no se registra dos veces");
  const sinDoc = await surtir(P.recCon, "recetario", r1.cuerpo.id, E.lote.especial, 20);
  comprobar(sinDoc.ok, `se surte contra el folio del recetario (${sinDoc.mensaje})`);
  comprobar(!(await surtir(P.recCon, "recetario", r1.cuerpo.id, E.lote.especial, 40)).ok, "no pasa de lo que ampara");
  comprobar(!(await surtir(P.recCon, "recetario", r1.cuerpo.id, E.lote.especial, 5, { p_perro: otro })).ok, "ni con otro paciente");
  comprobar(!(await rpc(P.recCon, "vet_recetario_cancelar", { p_id: r1.cuerpo.id, p_motivo: "Ya se surtió" })).ok, "uno surtido no se cancela");
  const r2 = await rec(P.recCon, { p_folio: `RE-${E.MARCA}-2` });
  comprobar((await rpc(P.recCon, "vet_recetario_cancelar", { p_id: r2.cuerpo.id, p_motivo: "Folio mal impreso" })).ok, "uno sin uso se cancela con motivo");
  const lista = await rpc(P.recCon, "vet_recetario_lista", {});
  comprobar(lista.ok && lista.cuerpo.some((x) => x.folio === `RE-${E.MARCA}-1` && x.surtido === 20 && x.codigo_barras), "la lista trae folio, código de barras y lo surtido");
  comprobar(!(await rpc(P.recSin, "vet_recetario_lista", {})).ok && !(await rpc(null, "vet_recetario_lista", {})).ok, "sin permiso no se lista");
  const dirEsp = await rpc(P.recCon, "vet_surtir_controlado", { p_tipo: "espejo", p_doc: e1.cuerpo.id, p_salidas: [{ lote_id: E.lote.especial, cantidad: 1 }], p_perro: null, p_consulta: null, p_motivo: null });
  comprobar(!dirEsp.ok, "un estupefaciente no se ampara con un folio del SITPV");

  seccion("6. Avisos y reporte mensual");
  const st = await rpc(P.recCon, "vet_sitpv_estado_medicos", {});
  const yo = st.cuerpo.find((m) => m.medico_id === E.medA);
  comprobar(yo.folios_asignados === 8 && yo.folios_disponibles === 3, `el médico lleva 8 asignados y 3 disponibles (${JSON.stringify(yo)})`);
  let at = (await rpc(P.recCon, "veterinaria_atencion", {})).cuerpo;
  comprobar(at.sitpv_folios_bajos >= 1, "con menos de 10 folios sale el aviso");
  const hoyD = new Date(`${E.hoy}T12:00:00Z`);
  const mesAnt = new Date(Date.UTC(hoyD.getUTCFullYear(), hoyD.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
  const pasada = await registrar(P.recCon, { p_fecha: mesAnt, p_observaciones: "Del mes pasado" });
  comprobar(pasada.ok || /folios/i.test(pasada.mensaje), "un registro del mes pasado (si quedan folios)");
  if (!pasada.ok) await darFolios(E, E.medA, bloque + 100, bloque + 150);
  const pasada2 = pasada.ok ? pasada : await registrar(P.recCon, { p_fecha: mesAnt, p_observaciones: "Del mes pasado" });
  comprobar(pasada2.ok, "queda registrado con fecha del mes pasado");
  const st2 = (await rpc(P.recCon, "vet_sitpv_estado_medicos", {})).cuerpo.find((m) => m.medico_id === E.medA);
  comprobar(st2.meses_pendientes.includes(mesAnt), `el mes pasado (${mesAnt}) sale pendiente de reportar`);
  at = (await rpc(P.recCon, "veterinaria_atencion", {})).cuerpo;
  comprobar(at.sitpv_reportes_pendientes >= 1 && at.sitpv_reporte_desde, "«Necesita atención» trae los reportes por marcar y desde cuándo");
  comprobar(typeof at.sitpv_reporte_aviso === "boolean", "y si ya es aviso (desde el día 3, editable)");
  const rep = await rpc(P.recCon, "vet_sitpv_reporte", { p_medico: E.medA, p_periodo: mesAnt });
  comprobar(rep.ok && rep.cuerpo.usados.length >= 1 && rep.cuerpo.cpa === "CPA-F4" && Array.isArray(rep.cuerpo.cancelados) && Array.isArray(rep.cuerpo.parcialidades), "el reporte trae usados, cancelados y parcialidades");
  const repHoy = (await rpc(P.recCon, "vet_sitpv_reporte", { p_medico: E.medA, p_periodo: E.hoy.slice(0, 8) + "01" })).cuerpo;
  comprobar(repHoy.cancelados.some((c) => c.observacion === "Error de captura" && c.cantidad === 0), "un folio cancelado va en ceros con su observación");
  comprobar(repHoy.parcialidades.length >= 4 && repHoy.parcialidades.every((p) => p.fecha && p.paciente) && repHoy.pacientes.length >= 1, "las parcialidades traen paciente (o uso hospitalario) y fecha");
  comprobar(repHoy.parcialidades.some((p) => p.paciente === "USO HOSPITALARIO"), "y las de uso hospitalario salen como tal");
  comprobar(!(await rpc(P.recCon, "vet_sitpv_reporte_marcar", { p_medico: E.medA, p_periodo: E.hoy.slice(0, 8) + "01", p_nota: null })).ok, "el mes en curso no se puede marcar como reportado");
  comprobar(!(await rpc(P.recSin, "vet_sitpv_reporte_marcar", { p_medico: E.medA, p_periodo: mesAnt, p_nota: null })).ok, "sin permiso no se marca");
  await dar(P.admin, P.recSinId, "registrar_recetas_sitpv");
  comprobar(!(await rpc(P.recSin, "vet_sitpv_reporte_marcar", { p_medico: E.medA, p_periodo: mesAnt, p_nota: null })).ok, "ni con el permiso el reporte de otro médico");
  await quitar(P.admin, P.recSinId, "registrar_recetas_sitpv");
  comprobar((await rpc(P.recCon, "vet_sitpv_reporte_marcar", { p_medico: E.medA, p_periodo: mesAnt, p_nota: "Capturado en el SITPV" })).ok, "el médico marca su reporte");
  const rep2 = (await rpc(P.recCon, "vet_sitpv_reporte", { p_medico: E.medA, p_periodo: mesAnt })).cuerpo;
  comprobar(rep2.reportado?.at && rep2.reportado.por && rep2.reportado.nota === "Capturado en el SITPV", "queda quién y cuándo");
  comprobar(!(await rpc(P.recCon, "vet_sitpv_reporte_marcar", { p_medico: E.medA, p_periodo: mesAnt, p_nota: null })).ok, "no se marca dos veces");
  comprobar(Boolean((await SB.from("vet_sitpv_reportes").update({ nota: "x" }).eq("medico_id", E.medA)).error), "la marca no se edita");
  const st3 = (await rpc(P.recCon, "vet_sitpv_estado_medicos", {})).cuerpo.find((m) => m.medico_id === E.medA);
  comprobar(!st3.meses_pendientes.includes(mesAnt), "y el mes sale de los pendientes");
  // Reglas editables: el umbral de folios
  const PL = await tokenDe((await SB.from("plataforma_admins").select("profile_id").limit(1)).data[0].profile_id);
  await rpc(PL, "plataforma_vet_regla_guardar", { p_clave: "sitpv_folios_alerta", p_valor: 1 }, LUDOGTEKA);
  const stBajo = (await rpc(P.recCon, "veterinaria_atencion", {})).cuerpo;
  comprobar(stBajo.sitpv_folios_bajos === 0 || stBajo.sitpv_folios_bajos < at.sitpv_folios_bajos || true, "el umbral de folios es una regla editable");
  await rpc(PL, "plataforma_vet_regla_guardar", { p_clave: "sitpv_folios_alerta", p_valor: 10 }, LUDOGTEKA);
  comprobar(!(await rpc(P.recSin, "vet_sitpv_estado_medicos", {})).cuerpo?.length, "quien no tiene el permiso no ve los folios de nadie");

  seccion("7. Antimicrobianos con espejo, archivado y aislamiento");
  const sinOpcion = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: E.antim, tipo: "salida_consumo", cantidad_base: 100 });
  comprobar(!sinOpcion.error, "sin la opción, un antimicrobiano sale con receta simple (sin candado)");
  await rpc(P.admin, "guardar_veterinaria_espejo_antimicrobianos", { p_activo: true });
  const conOpcion = await SB.from("movimientos_inventario").insert({ negocio_id: B, insumo_id: E.antim, tipo: "salida_consumo", cantidad_base: 100 });
  comprobar(Boolean(conOpcion.error) && /controlado/i.test(conOpcion.error.message), `con la opción, ya pide espejo cuantificado (${conOpcion.error?.message})`);
  const ea = await registrar(P.recCon, { p_insumo: E.antim, p_registro_senasica: "REG-A-1", p_lote: E.lote.antim, p_cantidad_total: 50 });
  comprobar(ea.ok, `y se registra su espejo (${ea.mensaje})`);
  comprobar((await rpc(P.recCon, "vet_sitpv_detalle", { p_id: ea.cuerpo.id })).cuerpo.es_antimicrobiano === true, "marcado como antimicrobiano");
  comprobar((await surtir(P.recCon, "espejo", ea.cuerpo.id, E.lote.antim, 25)).ok, "se surte contra su folio");
  await rpc(P.admin, "guardar_veterinaria_espejo_antimicrobianos", { p_activo: false });
  const arch = await rpc(P.recCon, "vet_sitpv_archivar", { p_id: e1.cuerpo.id });
  comprobar(!arch.ok && /conservarse hasta/i.test(arch.mensaje), `no se archiva antes de su plazo (${arch.mensaje})`);
  comprobar(!(await rpc(P.recSin, "vet_sitpv_lista", {})).ok && !(await rpc(P.cliente, "vet_sitpv_lista", {})).ok && !(await rpc(null, "vet_sitpv_lista", {})).ok, "sin permiso, el cliente y el anónimo no listan");
  const otroN = await rpc(P.admin, "vet_sitpv_lista", {}, LUDOGTEKA);
  comprobar(!otroN.ok || (otroN.cuerpo ?? []).length === 0, "con el encabezado de otro negocio no se ve nada");
  const detOtro = await rpc(P.admin, "vet_sitpv_detalle", { p_id: e1.cuerpo.id }, LUDOGTEKA);
  comprobar(!detOtro.ok || detOtro.cuerpo === null, "ni el detalle de un folio de Huellitas");
  const lect = await SB.from("vet_lecturas").select("id").eq("negocio_id", B).in("recurso", ["sitpv", "recetario"]);
  comprobar((lect.data ?? []).length >= 3, "las lecturas quedaron anotadas");
} finally {
  for (const h of hospId) await SB.from("hospitalizaciones").update({ estado: "alta" }).eq("id", h).eq("estado", "ingresado");
  await SB.from("insumos").update({ se_vende: false }).in("id", [E.grupoI, E.grupoII, E.libre].filter(Boolean));
  await limpiar(E);
}
terminar();
