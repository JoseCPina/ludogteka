// Estimados de consulta y cirugía de Veterinaria, Fase 3 (SOLO DESARROLLO, en Huellitas;
// nunca Ludogteka). Migración 20261016000300.
//
//   node scripts/auditoria/estimados-dev.mjs
//
// 1. Quién crea estimados.
// 2. Borrador: validaciones y totales (mínimo y máximo).
// 3. Enviar: contenido congelado, hash, liga con token; versiones.
// 4. Aceptar por la liga: cargos en la cuenta de siempre (sin tocar cobros), nada se repite.
// 5. Aceptar en mostrador y cuenta de una mascota hospitalizada.
// 6. Rechazar, cancelar, vencer.
// 7. Lecturas, «Necesita atención», aislamiento, módulo apagado y llave anónima.
import crypto from "node:crypto";
import { B, SB, LUDOGTEKA, datos, rpc, get, personas, dar, quitar, fijarModulo, hoy, sumaDias, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";

const P = await personas();
const MARCA = `est-${String(Date.now()).slice(-6)}`;
const nuevoPerro = async (nombre, extra = {}) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${MARCA}`, ...extra }).select("id").single();
  if (r.error) throw new Error(`perro: ${r.error.message}`);
  return r.data.id;
};
const token = () => { const t = crypto.randomBytes(32).toString("hex"); return { t, h: crypto.createHash("sha256").update(t).digest("hex") }; };
const totales = async (reserva) => {
  const c = (await rpc(P.admin, "cuenta_totales_reserva", { p_reserva_id: reserva })).cuerpo;
  return Array.isArray(c) ? c[0] : c;
};
const PERMISOS = ["crear_estimados", "atender_consultas", "hospitalizar", "firmar_expediente"];
const limpiar = async () => { for (const p of PERMISOS) { await quitar(P.admin, P.recConId, p); await quitar(P.admin, P.recSinId, p); } };
const FIRMA = `data:image/png;base64,${"iVBORw0KGgo".repeat(40)}`;
const medicosCreados = [];

const lineas = (extra = []) => [
  { tipo: "servicio", descripcion: "Consulta de cirugía", cantidad: 1, unidad: "pieza", precio_min: 400, precio_max: 600 },
  { tipo: "procedimiento", descripcion: "Ovariohisterectomía", cantidad: 1, precio_min: 1800, precio_max: 2500 },
  { tipo: "insumo", descripcion: "Sutura", cantidad: 2, unidad: "pieza", precio_min: 60, precio_max: 90 },
  ...extra,
];
const guardar = (token, perro, extra = {}) =>
  rpc(token, "vet_estimado_guardar", { p_id: null, p_perro: perro, p_consulta: null, p_cita: null, p_tipo: "cirugia", p_titulo: `Esterilización ${MARCA}`, p_notas: "Incluye anestesia", p_vigente_hasta: null, p_medico: null, p_lineas: lineas(), ...extra });

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  await limpiar();
  const hoyB = await hoy(P.admin);
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
  comprobar(med.ok, `admin designa a la recepcionista como médico (${med.mensaje})`);
  medicosCreados.push(med.cuerpo);
  const perro = await nuevoPerro("Presupin");
  const cobrosAntes = (await SB.from("cobros").select("id", { count: "exact", head: true })).count;

  seccion("1. Quién crea estimados");
  for (const [quien, t] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["la llave anónima", null]]) {
    comprobar(!(await guardar(t, perro)).ok, `${quien} no crea estimados`);
  }
  await dar(P.admin, P.recSinId, "crear_estimados");
  const e1 = await guardar(P.recSin, perro);
  comprobar(e1.ok, `con «Crear estimados» sí (${e1.mensaje})`);
  const id1 = e1.cuerpo;

  seccion("2. Borrador");
  let e = (await SB.from("vet_estimados").select("*").eq("id", id1).single()).data;
  comprobar(e.estado === "borrador" && e.version === 1 && e.grupo_id === id1 && e.tipo === "cirugia", "nace borrador, versión 1");
  comprobar(Number(e.total_min) === 400 + 1800 + 120 && Number(e.total_max) === 600 + 2500 + 180, `los totales salen de las líneas (mín ${e.total_min}, máx ${e.total_max})`);
  comprobar(e.vigente_hasta === sumaDias(hoyB, 15), "sin vigencia, dura 15 días");
  comprobar((await SB.from("vet_estimado_lineas").select("id").eq("estimado_id", id1)).data.length === 3, "con sus tres líneas");
  comprobar(!(await guardar(P.recSin, perro, { p_lineas: [] })).ok, "sin líneas se rechaza");
  comprobar(!(await guardar(P.recSin, perro, { p_lineas: lineas([{ tipo: "servicio", descripcion: "Mal", cantidad: 1, precio_min: 500, precio_max: 100 }]) })).ok, "un mínimo mayor al máximo se rechaza");
  comprobar(!(await guardar(P.recSin, perro, { p_lineas: lineas([{ tipo: "servicio", descripcion: "Cero", cantidad: 0, precio_min: 5, precio_max: 6 }]) })).ok, "cantidad cero se rechaza");
  comprobar(!(await guardar(P.recSin, perro, { p_lineas: lineas([{ tipo: "raro", descripcion: "x", cantidad: 1, precio_min: 5, precio_max: 6 }]) })).ok, "un tipo de línea inválido se rechaza");
  comprobar(!(await guardar(P.recSin, perro, { p_lineas: lineas([{ tipo: "insumo", descripcion: "x", cantidad: 1, precio_min: 5, precio_max: 6, insumo_id: crypto.randomUUID() }]) })).ok, "un insumo que no existe se rechaza");
  comprobar(!(await guardar(P.recSin, perro, { p_vigente_hasta: sumaDias(hoyB, -1) })).ok, "una vigencia pasada se rechaza");
  comprobar(!(await guardar(P.recSin, perro, { p_titulo: "  " })).ok, "sin título se rechaza");
  comprobar(!(await guardar(P.recSin, perro, { p_tipo: "otro" })).ok, "solo consulta o cirugía");
  comprobar(!(await guardar(P.recSin, perro, { p_consulta: crypto.randomUUID() })).ok, "la consulta tiene que ser de esa mascota");
  const reg = await rpc(P.recSin, "vet_estimado_guardar", { p_id: id1, p_perro: perro, p_consulta: null, p_cita: null, p_tipo: "cirugia", p_titulo: `Esterilización ${MARCA}`, p_notas: "Incluye anestesia", p_vigente_hasta: sumaDias(hoyB, 20), p_medico: null, p_lineas: lineas([{ tipo: "procedimiento", descripcion: "Hospitalización 1 noche", cantidad: 1, precio_min: 500, precio_max: 500 }]) });
  comprobar(reg.ok, `editar el borrador reemplaza sus líneas (${reg.mensaje})`);
  e = (await SB.from("vet_estimados").select("total_min, total_max").eq("id", id1).single()).data;
  comprobar(Number(e.total_min) === 2820 && Number(e.total_max) === 3780, "y recalcula los totales");
  const insumoB = (await SB.from("insumos").select("id").eq("negocio_id", B).is("deleted_at", null).limit(1).single()).data;
  const insumoLud = (await SB.from("insumos").select("id").eq("negocio_id", LUDOGTEKA).is("deleted_at", null).limit(1).maybeSingle()).data;
  if (insumoLud) comprobar(!(await guardar(P.recSin, perro, { p_lineas: lineas([{ tipo: "insumo", descripcion: "Ajeno", cantidad: 1, precio_min: 5, precio_max: 6, insumo_id: insumoLud.id }]) })).ok, "un insumo de OTRO negocio se rechaza");

  seccion("3. Enviar, congelar y versionar");
  const tk1 = token();
  comprobar(!(await rpc(P.recSin, "vet_estimado_enviar", { p_id: id1, p_token_hash: "malo" })).ok, "un token mal formado se rechaza");
  comprobar(!(await rpc(P.estetica, "vet_estimado_enviar", { p_id: id1, p_token_hash: tk1.h })).ok, "quien no crea estimados no los envía");
  const env = await rpc(P.recSin, "vet_estimado_enviar", { p_id: id1, p_token_hash: tk1.h });
  comprobar(env.ok && /^[0-9a-f]{64}$/.test(env.cuerpo.hash), `se envía y queda su hash (${env.mensaje})`);
  e = (await SB.from("vet_estimados").select("estado, token_hash, enviado_at, hash_contenido").eq("id", id1).single()).data;
  comprobar(e.estado === "enviado" && e.token_hash === tk1.h && e.enviado_at, "queda enviado con el hash del token (nunca el token)");
  comprobar(!(await guardar(P.recSin, perro, { p_id: id1 })).ok, "un estimado enviado ya no se edita");
  comprobar(!!(await SB.from("vet_estimado_lineas").update({ precio_min: 1 }).eq("estimado_id", id1)).error, "ni sus líneas, ni con la llave de servidor");
  comprobar(!!(await SB.from("vet_estimado_lineas").delete().eq("estimado_id", id1)).error, "ni se borran");
  comprobar(!!(await SB.from("vet_estimados").update({ titulo: "otro" }).eq("id", id1)).error, "ni su título");
  comprobar(!!(await SB.from("vet_estimados").delete().eq("id", id1)).error, "ni el estimado se borra");
  const pub0 = await SB.rpc("estimado_publico", { p_token_hash: tk1.h });
  comprobar(!pub0.error && pub0.data?.estado === "enviado" && pub0.data.integro === true && pub0.data.lineas.length === 4, "la liga lo enseña íntegro, con sus líneas");
  const txtPub = JSON.stringify(pub0.data);
  comprobar(!/token|hash_contenido|negocio_id|created_by/.test(txtPub), "sin datos internos");
  comprobar(pub0.data.total_min === 2820 && pub0.data.total_max === 3780, "con el mínimo y el máximo");
  comprobar(!(await rpc(P.admin, "estimado_publico", { p_token_hash: tk1.h })).ok, "la liga solo la resuelve el servidor (ni admin la lee por la API)");
  comprobar(!(await rpc(null, "estimado_publico", { p_token_hash: tk1.h })).ok, "ni la llave anónima");
  comprobar((await SB.rpc("estimado_publico", { p_token_hash: "0".repeat(64) })).data === null, "un token que no existe no devuelve nada");
  // Versión nueva: reemplaza y apaga la liga.
  const v2 = await rpc(P.recSin, "vet_estimado_nueva_version", { p_id: id1 });
  comprobar(v2.ok, `se hace una versión nueva (${v2.mensaje})`);
  const id2 = v2.cuerpo;
  const filas = (await SB.from("vet_estimados").select("id, version, estado, grupo_id, token_hash").eq("grupo_id", id1).order("version")).data;
  comprobar(filas.length === 2 && filas[0].estado === "reemplazado" && filas[0].token_hash === null && filas[1].estado === "borrador" && filas[1].version === 2, "la anterior queda reemplazada, sin liga; la nueva es borrador v2");
  comprobar((await SB.rpc("estimado_publico", { p_token_hash: tk1.h })).data === null, "la liga vieja ya no sirve");
  comprobar((await SB.from("vet_estimado_lineas").select("id").eq("estimado_id", id2)).data.length === 4, "la nueva trae las líneas copiadas");
  comprobar(!(await rpc(P.recSin, "vet_estimado_nueva_version", { p_id: id1 })).ok, "una versión reemplazada no se vuelve a versionar");
  comprobar(!(await rpc(P.recSin, "vet_estimado_nueva_version", { p_id: id2 })).ok, "ni un borrador (se edita directo)");
  await rpc(P.recSin, "vet_estimado_guardar", { p_id: id2, p_perro: perro, p_consulta: null, p_cita: null, p_tipo: "cirugia", p_titulo: `Esterilización ${MARCA}`, p_notas: null, p_vigente_hasta: sumaDias(hoyB, 20), p_medico: null, p_lineas: lineas() });

  seccion("4. Aceptar por la liga");
  const tk2 = token();
  const env2 = await rpc(P.recSin, "vet_estimado_enviar", { p_id: id2, p_token_hash: tk2.h });
  comprobar(env2.ok, "se envía la versión 2");
  const acepta = (h, nombre = "Rosa Pérez", firma = FIRMA) => SB.rpc("estimado_aceptar_publico", { p_token_hash: h, p_nombre: nombre, p_firma: firma, p_ip: "203.0.113.9", p_ua: "Prueba/1.0" });
  comprobar(!!(await acepta(tk2.h, "ab")).error, "sin nombre completo no se acepta");
  comprobar(!!(await acepta(tk2.h, "Rosa Pérez", "")).error, "sin firma no se acepta");
  comprobar(!!(await acepta(tk2.h, "Rosa Pérez", "data:text/html;base64,AAAA" + "A".repeat(300))).error, "una firma que no es imagen se rechaza");
  comprobar(!!(await acepta("f".repeat(64))).error, "una liga que no existe no acepta");
  comprobar(!(await rpc(P.admin, "estimado_aceptar_publico", { p_token_hash: tk2.h, p_nombre: "Rosa Pérez", p_firma: FIRMA, p_ip: null, p_ua: null })).ok, "el admin no acepta por el dueño usando la liga");
  comprobar(!(await rpc(null, "estimado_aceptar_publico", { p_token_hash: tk2.h, p_nombre: "Rosa Pérez", p_firma: FIRMA, p_ip: null, p_ua: null })).ok, "ni la llave anónima");
  const insumoMov0 = insumoB ? (await SB.from("movimientos_inventario").select("id", { count: "exact", head: true })).count : 0;
  const ok = await acepta(tk2.h);
  comprobar(!ok.error, `el dueño acepta (${ok.error?.message ?? ""})`);
  const reserva = ok.data?.reserva_id;
  e = (await SB.from("vet_estimados").select("*").eq("id", id2).single()).data;
  comprobar(e.estado === "aceptado" && e.aceptado_via === "liga" && e.aceptado_nombre === "Rosa Pérez" && e.aceptado_ip === "203.0.113.9" && e.firma_png === FIRMA && e.reserva_id === reserva, "queda aceptado con nombre, firma, IP y navegador");
  const cargos = (await SB.from("cargos_aplicados").select("id, precio, descripcion, reserva_id, perro_id, cancelado").eq("reserva_id", reserva)).data;
  comprobar(cargos.length === 3 && cargos.every((c) => c.perro_id === perro && !c.cancelado), "se crean tres cargos en la cuenta de la mascota (los de la versión aceptada)");
  comprobar(cargos.some((c) => /2 × Sutura/.test(c.descripcion) && Number(c.precio) === 120), "la cantidad va en la descripción y el importe es cantidad × mínimo");
  const t = await totales(reserva);
  comprobar(Number(t.total_cuenta) === 400 + 1800 + 120 && Number(t.saldo) === 2320, `la cuenta de siempre suma el MÍNIMO (${t.total_cuenta})`);
  comprobar((await SB.from("vet_estimado_lineas").select("cargo_id").eq("estimado_id", id2)).data.every((l) => l.cargo_id), "cada línea guarda su cargo");
  const abiertas = await rpc(P.admin, "cuentas_abiertas", { p_dias: 30 });
  comprobar(abiertas.ok && abiertas.cuerpo.some((c) => c.reserva_id === reserva), "la cuenta aparece en Caja para cobrarse");
  const serv = (await SB.from("servicios").select("clave, monto_libre, categoria").eq("negocio_id", B).like("clave", "vet_est_%")).data;
  comprobar(serv.length === 3 && serv.every((s) => s.monto_libre && s.categoria === "cargo"), "los conceptos son de monto libre (servicio, procedimiento e insumo)");
  comprobar(!(await acepta(tk2.h)).error === false, "aceptar dos veces no repite los cargos");
  comprobar((await SB.from("cargos_aplicados").select("id").eq("reserva_id", reserva)).data.length === 3, "(siguen siendo tres)");
  comprobar(!!(await SB.rpc("estimado_rechazar_publico", { p_token_hash: tk2.h, p_motivo: "ya" })).error, "uno aceptado no se rechaza");
  comprobar(!(await rpc(P.recSin, "vet_estimado_nueva_version", { p_id: id2 })).ok, "uno aceptado no se versiona: para agregar algo se hace otro");
  comprobar(!(await rpc(P.recSin, "vet_estimado_cancelar", { p_id: id2, p_motivo: "ya no" })).ok, "ni se cancela");
  comprobar(!!(await SB.from("vet_estimados").update({ estado: "borrador" }).eq("id", id2)).error, "ni se regresa a borrador");
  const pubA = await SB.rpc("estimado_publico", { p_token_hash: tk2.h });
  comprobar(pubA.data?.estado === "aceptado" && pubA.data.aceptado_nombre === "Rosa Pérez", "la liga ahora muestra que ya fue aceptado");
  comprobar((insumoB ? (await SB.from("movimientos_inventario").select("id", { count: "exact", head: true })).count : 0) === insumoMov0, "aceptar un insumo no mueve el inventario");

  seccion("5. Mostrador y mascota hospitalizada");
  const perroH = await nuevoPerro("Internado");
  const hosp = await rpc(P.recCon, "hospitalizar_ingresar", { p_perro_id: perroH, p_medico_id: null, p_motivo: "Cirugía de urgencia", p_ubicacion: null, p_deposito: 0, p_precio_dia: null });
  comprobar(hosp.ok, `se hospitaliza una mascota (${hosp.mensaje})`);
  const eh = await guardar(P.recSin, perroH, { p_titulo: `Cirugía ${MARCA}` });
  comprobar(!(await rpc(P.recSin, "vet_estimado_aceptar_mostrador", { p_id: eh.cuerpo, p_nombre: "ab", p_firma: null })).ok, "en mostrador también pide el nombre");
  comprobar(!(await rpc(P.estetica, "vet_estimado_aceptar_mostrador", { p_id: eh.cuerpo, p_nombre: "Luis Gómez", p_firma: null })).ok, "quien no crea estimados no registra la aceptación");
  const am = await rpc(P.recSin, "vet_estimado_aceptar_mostrador", { p_id: eh.cuerpo, p_nombre: "Luis Gómez", p_firma: null });
  comprobar(am.ok, `se registra la aceptación en mostrador, directo desde borrador (${am.mensaje})`);
  comprobar(am.cuerpo.reserva_id === hosp.cuerpo.reserva_id, "los cargos van a la cuenta de la hospitalización (una sola cuenta de la mascota)");
  e = (await SB.from("vet_estimados").select("estado, aceptado_via, aceptado_por, firma_png").eq("id", eh.cuerpo).single()).data;
  comprobar(e.estado === "aceptado" && e.aceptado_via === "mostrador" && e.aceptado_por && e.firma_png === null, "queda quién lo registró y la vía");
  const tH = await totales(hosp.cuerpo.reserva_id);
  comprobar(Number(tH.total_cuenta) >= 2320, `la cuenta de la hospitalización suma los cargos (${tH.total_cuenta})`);

  seccion("6. Rechazar, cancelar y vencer");
  const er = await guardar(P.recSin, perro, { p_titulo: `Rechazable ${MARCA}` });
  const tkR = token();
  await rpc(P.recSin, "vet_estimado_enviar", { p_id: er.cuerpo, p_token_hash: tkR.h });
  const rech = await SB.rpc("estimado_rechazar_publico", { p_token_hash: tkR.h, p_motivo: "Está caro" });
  comprobar(!rech.error, "el dueño lo rechaza con su motivo");
  comprobar((await SB.from("vet_estimados").select("estado, rechazo_motivo").eq("id", er.cuerpo).single()).data.estado === "rechazado", "queda rechazado");
  comprobar(!!(await acepta(tkR.h)).error, "uno rechazado ya no se acepta");
  comprobar((await rpc(P.recSin, "vet_estimado_nueva_version", { p_id: er.cuerpo })).ok, "pero de uno rechazado se puede hacer una versión nueva");
  const ec = await guardar(P.recSin, perro, { p_titulo: `Cancelable ${MARCA}` });
  comprobar(!(await rpc(P.recSin, "vet_estimado_cancelar", { p_id: ec.cuerpo, p_motivo: "x" })).ok, "cancelar pide motivo");
  const tkC = token();
  await rpc(P.recSin, "vet_estimado_enviar", { p_id: ec.cuerpo, p_token_hash: tkC.h });
  comprobar((await rpc(P.recSin, "vet_estimado_cancelar", { p_id: ec.cuerpo, p_motivo: "Se decidió otra cirugía" })).ok, "se cancela un enviado con motivo");
  comprobar((await SB.rpc("estimado_publico", { p_token_hash: tkC.h })).data === null, "y su liga deja de servir");
  const ev = await guardar(P.recSin, perro, { p_titulo: `Vencible ${MARCA}` });
  await SB.from("vet_estimados").update({ vigente_hasta: sumaDias(hoyB, -2) }).eq("id", ev.cuerpo);
  const enviadoViejo = await rpc(P.recSin, "vet_estimado_enviar", { p_id: ev.cuerpo, p_token_hash: token().h });
  comprobar(!enviadoViejo.ok && /vigencia/i.test(enviadoViejo.mensaje), "no se envía uno con la vigencia pasada");
  const lista = await rpc(P.recSin, "vet_estimados_lista", { p_estado: null });
  comprobar(lista.ok && lista.cuerpo.find((x) => x.id === ev.cuerpo)?.vencido === true, "la lista marca los vencidos");
  comprobar(!(await rpc(P.recSin, "vet_estimado_aceptar_mostrador", { p_id: ev.cuerpo, p_nombre: "Rosa Pérez", p_firma: null })).ok, "y no se acepta en mostrador");
  const sinImportes = await guardar(P.recSin, perro, { p_titulo: "Gratis", p_lineas: [{ tipo: "servicio", descripcion: "Cortesía", cantidad: 1, precio_min: 0, precio_max: 0 }] });
  comprobar(!(await rpc(P.recSin, "vet_estimado_enviar", { p_id: sinImportes.cuerpo, p_token_hash: token().h })).ok, "uno sin importes no se envía");

  seccion("7. Lecturas, atención, aislamiento y llave anónima");
  const det = await rpc(P.recSin, "vet_estimado_detalle", { p_id: id2 });
  comprobar(det.ok && det.cuerpo.estimado.estado === "aceptado" && det.cuerpo.integro === true && det.cuerpo.versiones.length === 2 && det.cuerpo.tiene_firma, "el detalle trae versiones, firma y que está íntegro");
  comprobar(!/token_hash/.test(JSON.stringify(det.cuerpo)), "pero nunca el hash del token");
  comprobar((await SB.from("vet_lecturas").select("id").eq("perro_id", perro).eq("recurso", "estimado")).data.length >= 1, "la lectura del estimado queda anotada");
  comprobar(!(await rpc(P.cliente, "vet_estimado_detalle", { p_id: id2 })).ok, "el cliente no ve estimados");
  comprobar(!(await rpc(P.estetica, "vet_estimado_detalle", { p_id: id2 })).ok, "estética sin designación ni permiso no ve estimados");
  const de = await rpc(P.recSin, "vet_estimados_de_mascota", { p_perro: perro });
  comprobar(de.ok && de.cuerpo.length >= 4, "la mascota lista sus estimados");
  await quitar(P.admin, P.recSinId, "crear_estimados");
  comprobar((await rpc(P.recSin, "vet_estimados_lista", { p_estado: null })).cuerpo.length === 0, "sin el permiso la lista sale vacía");
  comprobar(!(await rpc(P.recSin, "vet_estimado_detalle", { p_id: id2 })).ok, "y el detalle se niega");
  // «Necesita atención»: un enviado sin respuesta de más de tres días.
  const ea = await guardar(P.admin, perro, { p_titulo: `Sin respuesta ${MARCA}` });
  await rpc(P.admin, "vet_estimado_enviar", { p_id: ea.cuerpo, p_token_hash: token().h });
  const viejo = await SB.from("vet_estimados").update({ enviado_at: new Date(Date.now() - 5 * 86400000).toISOString() }).eq("id", ea.cuerpo);
  comprobar(!viejo.error, "(se envejece el envío para la prueba de atención)");
  const at = await rpc(P.admin, "veterinaria_atencion");
  comprobar(at.ok && at.cuerpo.estimados_sin_respuesta >= 1 && at.cuerpo.estimado_mas_viejo, `«Necesita atención» avisa de estimados sin respuesta (${at.cuerpo?.estimados_sin_respuesta})`);
  comprobar((await rpc(P.recSin, "veterinaria_atencion")).cuerpo.estimados_sin_respuesta === 0, "y solo a quien crea estimados");
  comprobar((await SB.from("cobros").select("id", { count: "exact", head: true })).count === cobrosAntes, "en todo esto no se creó ningún cobro: los cargos se cobran en Caja");
  comprobar(!(await rpc(P.admin, "vet_estimado_detalle", { p_id: id2 }, LUDOGTEKA)).ok, "con el encabezado de otro negocio nada se abre");
  await fijarModulo("veterinaria", false);
  comprobar(!(await guardar(P.admin, perro)).ok, "con el módulo apagado no se crean estimados");
  comprobar(!!(await SB.rpc("estimado_publico", { p_token_hash: tk2.h })).error === false && (await SB.rpc("estimado_publico", { p_token_hash: tk2.h })).data === null, "ni la liga sirve");
  await fijarModulo("veterinaria", true);
  for (const fn of ["vet_estimado_guardar", "vet_estimado_enviar", "vet_estimado_nueva_version", "vet_estimado_cancelar", "vet_estimado_aceptar_mostrador", "vet_estimado_detalle", "vet_estimados_lista", "vet_estimados_de_mascota"]) {
    comprobar(!(await rpc(null, fn, {})).ok, `la llave anónima no ejecuta ${fn}`);
  }
  comprobar(!(await rpc(P.admin, "vet_estimado_aceptar_interno", { p_id: id2, p_via: "mostrador", p_nombre: "xxx", p_firma: null, p_ip: null, p_ua: null })).ok, "la función interna de aceptar no se llama desde la API");
  comprobar(!(await rpc(P.admin, "vet_estimado_poner_lineas", { p_id: id2, p_lineas: [] })).ok, "ni la de poner líneas");
} finally {
  await limpiar();
  for (const m of medicosCreados) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
}
terminar();
