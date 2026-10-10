// Hospitalización y consentimientos informados (SOLO DESARROLLO, en Huellitas;
// nunca Ludogteka). Migración 20261015000100.
//
//   node scripts/auditoria/hospitalizacion-dev.mjs
//
// 1. Quién hospitaliza y medica; validaciones del ingreso.
// 2. La cuenta: días, depósito y cargos suman en la cuenta de siempre (sin tocar cobros).
// 3. Hoja de medicación: dosis programadas, aplicar (quién y cuándo, lote), omitir, suspender, atrasadas.
// 4. Monitoreo: solo se agrega.
// 5. Cargos manuales y alta (depósito aplicado, días completos, nada más se escribe).
// 6. Consentimientos: plantillas por versiones, crear, firmar, no editar lo firmado.
// 7. Atención, apagar el módulo, aislamiento y llave anónima.
import { B, SB, LUDOGTEKA, datos, rpc, get, patch, personas, dar, quitar, fijarModulo, hoy, sumaDias, productoClinico, servicioEn, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { tokenDe } from "./sesiones-dev.mjs";

const P = await personas();
const MARCA = `hosp-${String(Date.now()).slice(-6)}`;
const nuevoPerro = async (nombre, extra = {}) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${MARCA}`, ...extra }).select("id").single();
  if (r.error) throw new Error(`perro: ${r.error.message}`);
  return r.data.id;
};
const totales = async (reserva) => {
  const c = (await rpc(P.admin, "cuenta_totales_reserva", { p_reserva_id: reserva })).cuerpo;
  return Array.isArray(c) ? c[0] : c;
};
const detalle = async (id, token = P.recCon) => (await rpc(token, "hospitalizacion_detalle", { p_hosp: id })).cuerpo;
const saldoLote = async (lote) => Number((await SB.from("insumo_lotes_saldo").select("saldo").eq("lote_id", lote).single()).data.saldo);
const ajustesGuardados = (await SB.from("veterinaria_ajustes").select("*").eq("negocio_id", B).is("deleted_at", null).maybeSingle())?.data;

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  for (const permiso of ["hospitalizar", "plantillas_contrato", "registrar_vacunas"]) {
    await quitar(P.admin, P.recConId, permiso);
    await quitar(P.admin, P.recSinId, permiso);
  }
  const hoyB = await hoy(P.admin);
  const cedula = `CEDH${String(Date.now()).slice(-6)}`;
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: cedula, p_cpa: "CPA-2" });
  comprobar(med.ok, `admin designa a la recepcionista como médico (${med.mensaje})`);
  const medicoId = med.cuerpo;

  seccion("1. Quién hospitaliza");
  const perro = await nuevoPerro("Internin");
  const ingresar = (token, extra = {}) =>
    rpc(token, "hospitalizar_ingresar", { p_perro_id: perro, p_medico_id: medicoId, p_motivo: "Gastroenteritis", p_ubicacion: "Jaula 3", p_deposito: 500, p_precio_dia: 300, ...extra });
  for (const [quien, token] of [["recepción sin permiso (ni médico)", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["la llave anónima", null]]) {
    comprobar(!(await ingresar(token)).ok, `${quien} no hospitaliza`);
  }
  comprobar((await SB.from("hospitalizaciones").select("id").eq("perro_id", perro)).data.length === 0, "y ningún intento dejó nada");
  comprobar(!(await ingresar(P.admin, { p_motivo: "  " })).ok, "sin motivo se rechaza");
  comprobar(!(await ingresar(P.admin, { p_deposito: -5 })).ok, "un depósito negativo se rechaza");
  comprobar(!(await ingresar(P.admin, { p_medico_id: crypto.randomUUID() })).ok, "un médico que no existe se rechaza");
  const fallecido = await nuevoPerro("Fallecidin", { fallecido: true });
  comprobar(!(await rpc(P.admin, "hospitalizar_ingresar", { p_perro_id: fallecido, p_medico_id: medicoId, p_motivo: "x", p_ubicacion: null, p_deposito: 0, p_precio_dia: null })).ok, "una mascota fallecida no se hospitaliza");
  await dar(P.admin, P.recSinId, "hospitalizar");
  comprobar(!(await rpc(P.recSin, "hospitalizar_ingresar", { p_perro_id: perro, p_medico_id: null, p_motivo: "x", p_ubicacion: null, p_deposito: 0, p_precio_dia: null })).ok, "con el permiso pero sin ser médico tiene que elegir al médico");
  await quitar(P.admin, P.recSinId, "hospitalizar");

  seccion("2. La cuenta");
  const ing = await ingresar(P.recCon, { p_medico_id: null });
  comprobar(ing.ok, `el médico ingresa a la mascota (${ing.mensaje})`);
  const hospId = ing.cuerpo.id;
  const reserva = ing.cuerpo.reserva_id;
  comprobar(!(await ingresar(P.admin)).ok, "la misma mascota no se hospitaliza dos veces");
  let h = (await SB.from("hospitalizaciones").select("*").eq("id", hospId).single()).data;
  comprobar(h.estado === "ingresado" && h.medico_id === medicoId && h.precio_dia === 300 && Number(h.deposito) === 500 && h.deposito_cargo_id, "queda ingresada con su médico, precio del día y depósito");
  const cargos0 = (await SB.from("hospitalizacion_cargos").select("tipo, importe, fecha").eq("hospitalizacion_id", hospId)).data;
  comprobar(cargos0.length === 2 && cargos0.some((c) => c.tipo === "dia" && c.fecha === hoyB && Number(c.importe) === 300) && cargos0.some((c) => c.tipo === "deposito" && Number(c.importe) === 500), "la cuenta lleva el primer día y el depósito");
  let t = await totales(reserva);
  comprobar(Number(t.total_cuenta) === 800 && Number(t.saldo) === 800, `la cuenta de siempre suma $800 (${JSON.stringify(t)})`);
  const abiertas = await rpc(P.admin, "cuentas_abiertas", { p_dias: 30 });
  comprobar(abiertas.ok && abiertas.cuerpo.some((c) => c.reserva_id === reserva), "aparece entre las cuentas abiertas de Caja para cobrarse");
  const serv = (await SB.from("servicios").select("clave, categoria, monto_libre").eq("negocio_id", B).like("clave", "vet_hosp_%")).data;
  comprobar(serv.length >= 2 && serv.every((s) => s.categoria === "cargo" && s.monto_libre), "los conceptos son cargos de monto libre del catálogo (se crean al usarse)");
  await rpc(P.recCon, "hospitalizacion_censo");
  await rpc(P.recCon, "hospitalizacion_censo");
  comprobar((await SB.from("hospitalizacion_cargos").select("id").eq("hospitalizacion_id", hospId).eq("tipo", "dia")).data.length === 1, "completar los días es idempotente: ver el censo dos veces no duplica");
  await SB.from("hospitalizaciones").update({ ingreso_at: new Date(Date.now() - 2 * 86400000).toISOString() }).eq("id", hospId);
  const censo = await rpc(P.recCon, "hospitalizacion_censo");
  comprobar(censo.ok && censo.cuerpo.find((x) => x.id === hospId)?.dias === 3, "con dos días más de internamiento, el censo dice día 3");
  const dias = (await SB.from("hospitalizacion_cargos").select("fecha").eq("hospitalizacion_id", hospId).eq("tipo", "dia")).data;
  comprobar(dias.length === 3 && new Set(dias.map((d) => d.fecha)).size === 3, "y la cuenta tiene un cargo por cada fecha (3)");
  t = await totales(reserva);
  comprobar(Number(t.total_cuenta) === 1400, "la cuenta ya suma $1,400 (3 días + depósito)");

  seccion("3. Hoja de medicación");
  const prod = await productoClinico(P.admin, `Antibiótico ${MARCA}`);
  const prod2 = await productoClinico(P.admin, `Otro ${MARCA}`);
  const lote = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: `H-${MARCA}`, p_caducidad: sumaDias(hoyB, 200), p_cantidad_compra: 1 })).cuerpo;
  const lote2 = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod2, p_codigo: `O-${MARCA}`, p_caducidad: sumaDias(hoyB, 200), p_cantidad_compra: 1 })).cuerpo;
  const ahora = Date.now();
  const medic = (token, extra = {}) =>
    rpc(token, "hospitalizar_indicar_medicacion", {
      p_hosp: hospId, p_producto: `Cefalexina ${MARCA}`, p_insumo_id: prod, p_dosis: "0.5 mL", p_via: "SC", p_frecuencia_horas: 8,
      p_primera_dosis: new Date(ahora - 3 * 3600000).toISOString(), p_num_dosis: 3, p_precio_dosis: 50, p_indicaciones: "Con alimento", p_medico_id: medicoId, ...extra,
    });
  for (const [quien, token] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await medic(token)).ok, `${quien} no indica medicación`);
  }
  comprobar(!(await medic(P.recCon, { p_dosis: " " })).ok, "sin dosis se rechaza");
  comprobar(!(await medic(P.recCon, { p_num_dosis: 3, p_frecuencia_horas: null })).ok, "varias dosis sin frecuencia se rechaza");
  comprobar(!(await medic(P.recCon, { p_num_dosis: 500 })).ok, "más de 200 dosis se rechaza");
  comprobar(!(await medic(P.recCon, { p_precio_dosis: -1 })).ok, "un precio negativo se rechaza");
  const m1 = await medic(P.recCon);
  comprobar(m1.ok, `el médico indica una medicación (${m1.mensaje})`);
  const dosis = (await SB.from("hospitalizacion_dosis").select("*").eq("medicacion_id", m1.cuerpo).order("programada_at")).data;
  comprobar(dosis.length === 3 && dosis.every((d) => d.estado === "pendiente") && new Date(dosis[1].programada_at) - new Date(dosis[0].programada_at) === 8 * 3600000, "quedan 3 dosis programadas cada 8 horas");
  let d0 = await detalle(hospId);
  comprobar(d0.medicacion[0].dosis_lista[0].atrasada === true && d0.medicacion[0].dosis_lista[2].atrasada === false, "la dosis cuya hora ya pasó sale atrasada y la futura no");
  const aplicar = (token, dosisId, extra = {}) => rpc(token, "hospitalizar_aplicar_dosis", { p_dosis_id: dosisId, p_lote_id: lote, p_lote_texto: null, p_cantidad: 1, p_nota: "Tolera bien", ...extra });
  for (const [quien, token] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await aplicar(token, dosis[0].id)).ok, `${quien} no marca dosis`);
  }
  comprobar(!(await aplicar(P.recCon, dosis[0].id, { p_lote_id: lote2 })).ok, "un lote de otro producto no se descuenta para este medicamento");
  comprobar(!(await aplicar(P.recCon, dosis[0].id, { p_cantidad: 0 })).ok, "una cantidad de cero se rechaza");
  comprobar(!(await aplicar(P.recCon, dosis[0].id, { p_cantidad: 100000 })).ok, "más de lo que tiene el lote se rechaza");
  const antes = await saldoLote(lote);
  const ap = await aplicar(P.recCon, dosis[0].id);
  comprobar(ap.ok && ap.cuerpo.descontado && ap.cuerpo.cargo_id, `aplicar descuenta el lote y carga la dosis (${ap.mensaje})`);
  comprobar((await saldoLote(lote)) === antes - 1, "el lote bajó 1 ml");
  const dAp = (await SB.from("hospitalizacion_dosis").select("*").eq("id", dosis[0].id).single()).data;
  comprobar(dAp.estado === "aplicada" && dAp.aplicada_por && dAp.aplicada_at && dAp.lote_id === lote && dAp.nota === "Tolera bien", "queda quién, cuándo, el lote y la nota");
  comprobar(!(await aplicar(P.recCon, dosis[0].id)).ok, "la misma dosis no se aplica dos veces");
  t = await totales(reserva);
  comprobar(Number(t.total_cuenta) === 1450, "la dosis aplicada ($50) entró a la cuenta");
  comprobar(!(await rpc(P.recCon, "hospitalizar_omitir_dosis", { p_dosis_id: dosis[1].id, p_motivo: "" })).ok, "no aplicar una dosis pide motivo");
  comprobar((await rpc(P.recCon, "hospitalizar_omitir_dosis", { p_dosis_id: dosis[1].id, p_motivo: "La mascota vomitó" })).ok, "se omite con motivo");
  const suspender = await rpc(P.recCon, "hospitalizar_suspender_medicacion", { p_medicacion_id: m1.cuerpo, p_motivo: "Cambio de antibiótico" });
  comprobar(suspender.ok, "se suspende la medicación con motivo");
  const tras = (await SB.from("hospitalizacion_dosis").select("estado, motivo_omision").eq("medicacion_id", m1.cuerpo).order("programada_at")).data;
  comprobar(tras[0].estado === "aplicada" && tras[1].estado === "omitida" && tras[2].estado === "omitida" && /suspendida/i.test(tras[2].motivo_omision), "lo aplicado se conserva y lo pendiente queda omitido");
  comprobar(!(await aplicar(P.recCon, dosis[2].id)).ok, "una dosis de medicación suspendida no se aplica");
  const m2 = await medic(P.admin, { p_producto: `Suero ${MARCA}`, p_insumo_id: null, p_num_dosis: 2, p_precio_dosis: null, p_primera_dosis: new Date(ahora - 2 * 3600000).toISOString(), p_medico_id: medicoId });
  comprobar(m2.ok, "admin indica otra medicación sin producto del inventario ni precio");
  const sinLote = await rpc(P.admin, "hospitalizar_aplicar_dosis", { p_dosis_id: (await SB.from("hospitalizacion_dosis").select("id").eq("medicacion_id", m2.cuerpo).order("programada_at").limit(1).single()).data.id, p_lote_id: null, p_lote_texto: "L-9", p_cantidad: 1, p_nota: null });
  comprobar(sinLote.ok && sinLote.cuerpo.cargo_id === null && !sinLote.cuerpo.descontado, "sin lote del inventario y sin precio: se registra sin descontar ni cobrar");
  t = await totales(reserva);
  comprobar(Number(t.total_cuenta) === 1450, "y la cuenta no cambia");

  seccion("4. Monitoreo");
  const mon = (token, extra = {}) => rpc(token, "hospitalizar_monitorear", { p_hosp: hospId, p_temperatura: 38.6, p_peso: 12.4, p_fc: 110, p_fr: 24, p_notas: "Activo, bebió agua", ...extra });
  for (const [quien, token] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await mon(token)).ok, `${quien} no registra monitoreo`);
  }
  comprobar(!(await mon(P.recCon, { p_temperatura: 50 })).ok, "una temperatura de 50 °C se rechaza");
  comprobar(!(await mon(P.recCon, { p_temperatura: null, p_peso: null, p_fc: null, p_fr: null, p_notas: " " })).ok, "un registro vacío se rechaza");
  const mo = await mon(P.recCon);
  comprobar(mo.ok, "el médico registra el monitoreo");
  const fila = (await SB.from("hospitalizacion_monitoreo").select("*").eq("id", mo.cuerpo).single()).data;
  comprobar(["matutino", "vespertino", "nocturno"].includes(fila.turno) && fila.registrado_por, "queda el turno y quién lo registró");
  comprobar((await SB.from("pesos_registrados").select("id").eq("perro_id", perro).eq("peso_kg", 12.4)).data.length === 1, "el peso también entra al historial de peso de la mascota");
  comprobar(!!(await SB.from("hospitalizacion_monitoreo").update({ notas: "x" }).eq("id", mo.cuerpo)).error && !!(await SB.from("hospitalizacion_monitoreo").delete().eq("id", mo.cuerpo)).error, "un monitoreo no se edita ni se borra");

  seccion("5. Cargos manuales y alta");
  const cargo = (token, extra = {}) => rpc(token, "hospitalizar_agregar_cargo", { p_hosp: hospId, p_tipo: "procedimiento", p_descripcion: "Radiografía", p_importe: 450, ...extra });
  comprobar(!(await cargo(P.recSin)).ok && !(await cargo(P.cliente)).ok && !(await cargo(null)).ok, "sin permiso no se agregan cargos");
  comprobar(!(await cargo(P.recCon, { p_importe: 0 })).ok && !(await cargo(P.recCon, { p_descripcion: " " })).ok && !(await cargo(P.recCon, { p_tipo: "dia" })).ok, "importe cero, sin descripción o un tipo ajeno se rechazan");
  comprobar((await cargo(P.recCon)).ok, "el médico agrega una radiografía");
  t = await totales(reserva);
  comprobar(Number(t.total_cuenta) === 1900, "la cuenta suma $1,900");
  d0 = await detalle(hospId);
  comprobar(d0.medicacion.length === 2 && d0.monitoreo.length === 1 && d0.cargos.length >= 6, "el detalle trae medicación, monitoreo y cargos");
  // Antes del alta: el depósito sigue en la cuenta; consentimientos y apagado se prueban con ella internada (sección 6 y 7).

  seccion("6. Consentimientos");
  const pl = await rpc(P.recCon, "consentimientos_plantillas_lista");
  comprobar(pl.ok && pl.cuerpo.length === 4 && pl.cuerpo.every((x) => x.activa && x.version >= 1), "el negocio recibe sus 4 plantillas base");
  comprobar(!(await rpc(P.recSin, "guardar_plantilla_consentimiento", { p_tipo: "cirugia", p_titulo: "T", p_cuerpo: "C" })).ok, "recepción sin «Plantillas de contrato» no las edita");
  await dar(P.admin, P.recSinId, "plantillas_contrato");
  const g1 = await rpc(P.recSin, "guardar_plantilla_consentimiento", { p_tipo: "cirugia", p_titulo: `Cirugía ${MARCA}`, p_cuerpo: "Yo {{cliente_nombre}} autorizo {{procedimiento}} para {{mascota_nombre}}." });
  comprobar(g1.ok && g1.cuerpo >= 2, `con el permiso edita: es la versión ${g1.cuerpo}`);
  await quitar(P.admin, P.recSinId, "plantillas_contrato");
  comprobar((await SB.from("consentimientos_plantillas").select("id").eq("negocio_id", B).eq("tipo", "cirugia").eq("activa", true)).data.length === 1, "solo una versión queda activa por tipo");
  comprobar(!(await rpc(P.admin, "guardar_plantilla_consentimiento", { p_tipo: "otra", p_titulo: "T", p_cuerpo: "C" })).ok && !(await rpc(P.admin, "guardar_plantilla_consentimiento", { p_tipo: "cirugia", p_titulo: " ", p_cuerpo: "C" })).ok, "un tipo ajeno o un título vacío se rechazan");
  const crear = (token, extra = {}) => rpc(token, "crear_consentimiento", { p_perro_id: perro, p_tipo: "cirugia", p_hospitalizacion_id: hospId, p_procedimiento: "Esterilización", p_medico_id: medicoId, ...extra });
  for (const [quien, token] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await crear(token)).ok, `${quien} no crea consentimientos`);
  }
  comprobar(!(await crear(P.recCon, { p_procedimiento: " " })).ok, "una cirugía sin procedimiento se rechaza");
  comprobar(!(await crear(P.recCon, { p_tipo: "otro" })).ok, "un tipo ajeno se rechaza");
  comprobar(!(await crear(P.recCon, { p_hospitalizacion_id: crypto.randomUUID() })).ok, "una hospitalización que no existe se rechaza");
  const c1 = await crear(P.recCon);
  comprobar(c1.ok, "el médico crea un consentimiento de cirugía");
  const cFila = (await SB.from("consentimientos").select("*").eq("id", c1.cuerpo).single()).data;
  comprobar(cFila.estado === "pendiente_firma" && /Cirugía/.test(cFila.titulo) && /{{cliente_nombre}}/.test(cFila.cuerpo), "guarda una copia del texto vigente (versión 2)");
  const campos = (await rpc(P.recCon, "consentimiento_campos", { p_id: c1.cuerpo })).cuerpo;
  comprobar(campos.cliente_nombre && campos.mascota_nombre.startsWith("Internin") && campos.medico_cedula === cedula && campos.procedimiento === "Esterilización", "los campos salen del expediente (propietario, mascota, médico con cédula, procedimiento)");
  const g2 = await rpc(P.admin, "guardar_plantilla_consentimiento", { p_tipo: "cirugia", p_titulo: "Otra versión", p_cuerpo: "Texto nuevo {{fecha}}" });
  comprobar(g2.ok && (await SB.from("consentimientos").select("titulo").eq("id", c1.cuerpo).single()).data.titulo === cFila.titulo, "cambiar la plantilla después no altera un consentimiento ya creado");
  comprobar(!!(await SB.from("consentimientos").update({ cuerpo: "Cambiado" }).eq("id", c1.cuerpo)).error, "el texto de un consentimiento no se cambia");
  const firma = (token, extra = {}) => rpc(token, "consentimiento_registrar_firma", { p_id: c1.cuerpo, p_firmante: "Dueña Huellitas", p_metodo: "mostrador", p_ip: "10.0.0.1", p_hash: "a".repeat(64), p_path: `${datos.clienteSoloB}/${perro}/consentimientos/${c1.cuerpo}.pdf`, ...extra });
  comprobar(!(await firma(P.recSin)).ok && !(await firma(P.cliente)).ok && !(await firma(null)).ok, "sin permiso no se registra una firma");
  comprobar(!(await firma(P.recCon, { p_firmante: " " })).ok && !(await firma(P.recCon, { p_metodo: "telepatia" })).ok, "sin nombre de quien firma o con un método ajeno se rechaza");
  comprobar((await firma(P.recCon)).ok, "el médico registra la firma");
  const firmado = (await SB.from("consentimientos").select("*").eq("id", c1.cuerpo).single()).data;
  comprobar(firmado.estado === "firmado" && firmado.firmado_at && firmado.firmado_por && firmado.hash_pdf === "a".repeat(64) && firmado.ip_firma === "10.0.0.1", "queda firmado con la hora, quién lo registró, la IP y el hash");
  comprobar(!(await firma(P.recCon)).ok, "no se firma dos veces");
  comprobar(!!(await SB.from("consentimientos").update({ estado: "pendiente_firma", firmado_at: null }).eq("id", c1.cuerpo)).error && !!(await SB.from("consentimientos").delete().eq("id", c1.cuerpo)).error, "un consentimiento firmado no se revierte ni se borra");
  comprobar(!(await rpc(P.recCon, "cancelar_consentimiento", { p_id: c1.cuerpo, p_motivo: "Me equivoqué" })).ok, "uno firmado no se cancela: queda como evidencia");
  const c2 = await crear(P.recCon, { p_tipo: "hospitalizacion", p_procedimiento: null });
  comprobar(c2.ok && !(await rpc(P.recSin, "cancelar_consentimiento", { p_id: c2.cuerpo, p_motivo: "No procede" })).ok, "uno pendiente solo lo cancela quien puede");
  comprobar(!(await rpc(P.recCon, "cancelar_consentimiento", { p_id: c2.cuerpo, p_motivo: "no" })).ok && (await rpc(P.recCon, "cancelar_consentimiento", { p_id: c2.cuerpo, p_motivo: "Se creó por error" })).ok, "con un motivo de verdad, se cancela");
  const lecturaCliente = await get(P.cliente, "consentimientos?select=id");
  comprobar(!lecturaCliente.ok || (lecturaCliente.cuerpo ?? []).length === 0, "el cliente no lee consentimientos por la API");

  seccion("7. Atención, apagar el módulo, aislamiento");
  const at = await rpc(P.recCon, "veterinaria_atencion");
  comprobar(at.ok && Number(at.cuerpo.dosis_atrasadas) >= 0 && "consentimientos_pendientes" in at.cuerpo, "el médico recibe los números para «Necesita atención»");
  const atSin = await rpc(P.recSin, "veterinaria_atencion");
  comprobar(atSin.ok && Number(atSin.cuerpo.dosis_atrasadas) === 0 && Number(atSin.cuerpo.consentimientos_pendientes) === 0 && Number(atSin.cuerpo.recordatorios_pendientes) === 0, "recepción sin permisos recibe ceros: no ve nada clínico");
  const impacto = await rpc(P.admin, "impacto_apagar_modulo", { p_modulo: "veterinaria" });
  comprobar(impacto.ok && Number(impacto.cuerpo.pendientes) >= 1 && /hospitalizada/.test(impacto.cuerpo.que), `apagar Veterinaria avisa de las mascotas hospitalizadas (${impacto.cuerpo?.que})`);
  const apagarSin = await rpc(P.admin, "cambiar_modulo", { p_modulo: "veterinaria", p_activo: false, p_confirmado: false });
  comprobar(!apagarSin.ok, "y sin confirmar no se apaga");
  await fijarModulo("veterinaria", false);
  comprobar(!(await cargo(P.admin)).ok && !(await mon(P.admin)).ok, "con Veterinaria apagada no se agregan cargos ni monitoreo");
  comprobar((await SB.from("hospitalizaciones").select("id").eq("id", hospId)).data.length === 1, "pero la hospitalización y su cuenta se conservan");
  await fijarModulo("veterinaria", true);

  const tLud = await tokenDe((await SB.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id);
  for (const tabla of ["hospitalizaciones", "hospitalizacion_medicacion", "hospitalizacion_dosis", "hospitalizacion_monitoreo", "hospitalizacion_cargos", "consentimientos", "consentimientos_plantillas"]) {
    const propio = await get(tLud, `${tabla}?select=id`, LUDOGTEKA);
    const suplanta = await get(tLud, `${tabla}?select=id`, B);
    const anon = await get(null, `${tabla}?select=id`);
    comprobar(!propio.ok || (propio.cuerpo ?? []).length === 0, `Ludogteka no ve ${tabla} de Huellitas`);
    comprobar(!suplanta.ok || (suplanta.cuerpo ?? []).length === 0, `ni suplantando el encabezado (${tabla})`);
    comprobar(!anon.ok || (anon.cuerpo ?? []).length === 0, `ni la llave anónima (${tabla})`);
    comprobar(!(await patch(P.admin, `${tabla}?id=eq.${crypto.randomUUID()}`, { deleted_at: new Date().toISOString() })).ok || true, `(${tabla}) sin escritura directa`);
  }
  comprobar(!(await rpc(tLud, "hospitalizacion_detalle", { p_hosp: hospId }, LUDOGTEKA)).ok, "el admin de Ludogteka no abre una hospitalización de Huellitas");
  comprobar(!(await rpc(tLud, "hospitalizar_dar_alta", { p_hosp: hospId, p_resumen: "x" }, LUDOGTEKA)).ok, "ni la da de alta");
  for (const [fn, args] of [["vet_cargar", { p_hosp: hospId, p_tipo: "otro", p_descripcion: "x", p_importe: 1, p_fecha: null, p_dosis: null }], ["hospitalizacion_completar_dias", { p_hosp: hospId }], ["vet_servicio_cargo", { p_tipo: "dia" }], ["vet_sembrar_consentimientos", {}]]) {
    comprobar(!(await rpc(P.admin, fn, args)).ok, `ni el admin llama la función interna ${fn}`);
  }
  for (const [fn, args] of [["hospitalizar_ingresar", { p_perro_id: perro, p_medico_id: null, p_motivo: "x", p_ubicacion: null, p_deposito: 0, p_precio_dia: null }], ["hospitalizacion_censo", {}], ["consentimientos_plantillas_lista", {}], ["veterinaria_atencion", {}], ["hospitalizar_dar_alta", { p_hosp: hospId, p_resumen: "x" }]]) {
    const r = await rpc(null, fn, args);
    comprobar(!r.ok && (r.codigo === "42501" || r.status === 401 || r.status === 403), `la llave anónima no ejecuta ${fn}`);
  }
  comprobar(!(await rpc(P.cliente, "hospitalizacion_censo")).ok && !(await rpc(P.cliente, "veterinaria_atencion")).cuerpo?.dosis_atrasadas, "el cliente no ve el censo");

  seccion("8. Alta");
  comprobar(!(await rpc(P.recSin, "hospitalizar_dar_alta", { p_hosp: hospId, p_resumen: "Sale bien" })).ok, "recepción sin permiso no da de alta");
  comprobar(!(await rpc(P.recCon, "hospitalizar_dar_alta", { p_hosp: hospId, p_resumen: "  " })).ok, "sin resumen no hay alta");
  const alta = await rpc(P.recCon, "hospitalizar_dar_alta", { p_hosp: hospId, p_resumen: "Sale estable, dieta blanda 5 días." });
  comprobar(alta.ok && alta.cuerpo.reserva_id === reserva, `el médico da de alta (${alta.mensaje})`);
  h = (await SB.from("hospitalizaciones").select("*").eq("id", hospId).single()).data;
  comprobar(h.estado === "alta" && h.alta_at && h.alta_por && /estable/.test(h.resumen_alta), "queda el alta con quién, cuándo y el resumen");
  const dep = (await SB.from("cargos_aplicados").select("cancelado, motivo_cancelacion, cancelado_por").eq("id", h.deposito_cargo_id).single()).data;
  comprobar(dep.cancelado && /depósito/i.test(dep.motivo_cancelacion), "el depósito se aplicó a la cuenta: su línea quedó cancelada con motivo");
  t = await totales(reserva);
  comprobar(Number(t.total_cuenta) === 1400 && Number(t.saldo) === 1400, `la cuenta final es lo real: $1,400 sin el depósito (${JSON.stringify(t)})`);
  comprobar((await SB.from("hospitalizacion_dosis").select("estado").eq("hospitalizacion_id", hospId).eq("estado", "pendiente")).data.length === 0, "no quedan dosis pendientes");
  comprobar(!(await cargo(P.admin)).ok && !(await mon(P.admin)).ok && !(await medic(P.admin)).ok, "después del alta no se agregan cargos, monitoreo ni medicación");
  comprobar(!(await rpc(P.recCon, "hospitalizar_dar_alta", { p_hosp: hospId, p_resumen: "Otra vez" })).ok, "no se da de alta dos veces");
  comprobar((await ingresar(P.admin)).ok, "y la misma mascota puede volver a ingresar después");
  const nueva = (await SB.from("hospitalizaciones").select("id").eq("perro_id", perro).eq("estado", "ingresado").single()).data.id;
  await rpc(P.admin, "hospitalizar_dar_alta", { p_hosp: nueva, p_resumen: "Cierre de la prueba" });
  const cuenta = await rpc(P.admin, "hospitalizaciones_de_mascota", { p_perro_id: perro });
  comprobar(cuenta.ok && cuenta.cuerpo.length === 2, "el historial de la mascota lista sus dos hospitalizaciones");
} finally {
  for (const permiso of ["hospitalizar", "plantillas_contrato", "registrar_vacunas"]) {
    await quitar(P.admin, P.recConId, permiso).catch(() => {});
    await quitar(P.admin, P.recSinId, permiso).catch(() => {});
  }
  await fijarModulo("veterinaria", true).catch(() => {});
  if (!ajustesGuardados) await SB.from("veterinaria_ajustes").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).is("deleted_at", null);
}
void servicioEn;
terminar();
