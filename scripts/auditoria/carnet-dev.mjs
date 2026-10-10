// Carnet, recordatorios, carnet verificable y certificados de salud
// (SOLO DESARROLLO, en Huellitas; nunca Ludogteka). Migración 20261015000000.
//
//   node scripts/auditoria/carnet-dev.mjs
//
// 1. Quién registra vacunas y desparasitaciones: médico veterinario, admin o permiso; nadie más.
// 2. Validaciones (fechas, próxima dosis, lote, producto) y el descuento del lote.
// 3. Un registro no se edita ni se borra: se anula con motivo.
// 4. «El carnet reemplaza al comprobante» (por negocio) y su reversa al anular.
// 5. Recordatorios: se generan una vez, no si ya se renovó, apagado por mascota, lista y envío solo para el servidor.
// 6. Carnet verificable: solo lo que debe verse; revocar; nada con JWT.
// 7. Certificados: emitir, no editar, anular.
// 8. Portal del dueño, aislamiento entre negocios, módulo apagado, llave anónima.
import { B, SB, LUDOGTEKA, datos, rpc, get, post, patch, personas, dar, quitar, fijarModulo, hoy, sumaDias, productoClinico, servicioEn, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { createHash, randomBytes } from "node:crypto";
import { tokenDe } from "./sesiones-dev.mjs";

const P = await personas();
const MARCA = `carnet-${String(Date.now()).slice(-6)}`;
const hashDe = (t) => createHash("sha256").update(t).digest("hex");
const nuevoPerro = async (nombre, extra = {}) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${MARCA}`, ...extra }).select("id").single();
  if (r.error) throw new Error(`perro: ${r.error.message}`);
  return r.data.id;
};
const saldoLote = async (lote) => Number((await SB.from("insumo_lotes_saldo").select("saldo").eq("lote_id", lote).single()).data.saldo);
const ajustesGuardados = (await SB.from("veterinaria_ajustes").select("*").eq("negocio_id", B).is("deleted_at", null).maybeSingle()).data;

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  for (const permiso of ["registrar_vacunas", "emitir_certificados", "hospitalizar", "configuracion_negocio"]) {
    await quitar(P.admin, P.recConId, permiso);
    await quitar(P.admin, P.recSinId, permiso);
  }
  const hoyB = await hoy(P.admin);

  // El médico de la prueba es la recepcionista «recCon».
  const cedula = `CED${String(Date.now()).slice(-7)}`;
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: cedula, p_cpa: "CPA-1" });
  comprobar(med.ok, `admin designa a la recepcionista como médico veterinario (${med.mensaje})`);
  const medicoId = med.cuerpo;

  const perro = await nuevoPerro("Carnetin", { especie: "perro" });

  seccion("1. Quién registra");
  const vac = (token, extra = {}) =>
    rpc(token, "registrar_vacuna", {
      p_perro_id: perro, p_biologico: `Rabia ${MARCA}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: "Lab X",
      p_fecha: hoyB, p_proxima: sumaDias(hoyB, 365), p_medico_id: medicoId, p_dosis: "1 mL", p_notas: null, p_descontar: true, ...extra,
    });
  for (const [quien, token] of [["recepción sin permiso (ni médico)", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["la llave anónima", null]]) {
    const r = await vac(token);
    comprobar(!r.ok, `${quien} no registra vacunas${r.codigo ? ` (${r.codigo})` : ""}`);
  }
  comprobar((await SB.from("carnet_vacunas").select("id").eq("perro_id", perro)).data.length === 0, "y ningún intento no autorizado dejó nada");
  const rAdmin = await vac(P.admin);
  comprobar(rAdmin.ok, `admin registra una vacuna (${rAdmin.mensaje})`);
  const vId = rAdmin.cuerpo?.id;
  const vFila = (await SB.from("carnet_vacunas").select("*").eq("id", vId).single()).data;
  comprobar(vFila.vigente_hasta === sumaDias(hoyB, 365) && vFila.medico_id === medicoId && vFila.biologico === `Rabia ${MARCA}`, "queda con vigencia = próxima dosis, el médico y el biológico");
  const rMed = await vac(P.recCon, { p_medico_id: null, p_biologico: `Parvo ${MARCA}`, p_proxima: null });
  comprobar(rMed.ok, `el médico veterinario registra sin escoger médico: se toma él mismo (${rMed.mensaje})`);
  const vMed = (await SB.from("carnet_vacunas").select("*").eq("id", rMed.cuerpo.id).single()).data;
  comprobar(vMed.medico_id === medicoId && vMed.vigente_hasta > sumaDias(hoyB, 360) && vMed.vigente_hasta < sumaDias(hoyB, 370), "sin próxima dosis vale 12 meses");
  await dar(P.admin, P.recSinId, "registrar_vacunas");
  const sinMedico = await vac(P.recSin, { p_medico_id: null });
  comprobar(!sinMedico.ok && /médico/i.test(sinMedico.mensaje), `con el permiso pero sin ser médico, tiene que elegir al médico («${sinMedico.mensaje.slice(0, 50)}»)`);
  const conMedico = await vac(P.recSin, { p_biologico: `Bordetella ${MARCA}` });
  comprobar(conMedico.ok, "con el permiso y eligiendo médico, registra");
  const medicoAjeno = await vac(P.recSin, { p_medico_id: crypto.randomUUID() });
  comprobar(!medicoAjeno.ok, "un médico que no existe se rechaza");
  await quitar(P.admin, P.recSinId, "registrar_vacunas");
  comprobar(!(await vac(P.recSin)).ok, "al quitarle el permiso, deja de poder");

  seccion("2. Validaciones y lote");
  comprobar(!(await vac(P.admin, { p_fecha: sumaDias(hoyB, 2) })).ok, "una aplicación con fecha futura se rechaza");
  comprobar(!(await vac(P.admin, { p_fecha: "1980-01-01" })).ok, "y una de 1980");
  comprobar(!(await vac(P.admin, { p_proxima: hoyB })).ok, "la próxima dosis no puede ser el mismo día");
  comprobar(!(await vac(P.admin, { p_proxima: sumaDias(hoyB, -3) })).ok, "ni anterior");
  comprobar(!(await vac(P.admin, { p_biologico: "   " })).ok, "una vacuna sin nombre se rechaza");
  comprobar(!(await vac(P.admin, { p_tipo_requisito_id: crypto.randomUUID() })).ok, "un requisito que no existe se rechaza");
  const prod = await productoClinico(P.admin, `Vacuna ${MARCA}`);
  const prod2 = await productoClinico(P.admin, `Otra ${MARCA}`);
  const l1 = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod, p_codigo: `V-${MARCA}`, p_caducidad: sumaDias(hoyB, 200), p_cantidad_compra: 1 })).cuerpo;
  const l2 = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prod2, p_codigo: `O-${MARCA}`, p_caducidad: sumaDias(hoyB, 200), p_cantidad_compra: 1 })).cuerpo;
  const antes = await saldoLote(l1);
  const conLote = await vac(P.admin, { p_insumo_id: prod, p_lote_id: l1, p_biologico: null });
  comprobar(conLote.ok, `con producto y lote del inventario (${conLote.mensaje})`);
  const vLote = (await SB.from("carnet_vacunas").select("*").eq("id", conLote.cuerpo.id).single()).data;
  comprobar(vLote.biologico === `Vacuna ${MARCA}` && vLote.lote_texto === `V-${MARCA}` && vLote.lote_movimiento_id, "toma el nombre del producto, el código del lote y deja el movimiento");
  comprobar((await saldoLote(l1)) === antes - 1, "y descuenta una dosis del lote");
  const sinDescontar = await vac(P.admin, { p_insumo_id: prod, p_lote_id: l1, p_descontar: false });
  comprobar(sinDescontar.ok && (await saldoLote(l1)) === antes - 1, "con «no descontar» el saldo no se mueve");
  comprobar(!(await vac(P.admin, { p_insumo_id: prod, p_lote_id: l2 })).ok, "un lote de otro producto se rechaza");
  comprobar(!(await vac(P.admin, { p_lote_id: crypto.randomUUID() })).ok, "un lote que no existe se rechaza");
  const caducado = (await SB.from("insumo_lotes").insert({ negocio_id: B, insumo_id: prod, codigo: `X-${MARCA}`, fecha_caducidad: sumaDias(hoyB, -10) }).select("id").single()).data?.id;
  if (caducado) comprobar(!(await vac(P.admin, { p_insumo_id: prod, p_lote_id: caducado })).ok, "un lote caducado antes de la aplicación se rechaza");
  const des = await rpc(P.recCon, "registrar_desparasitacion", { p_perro_id: perro, p_tipo: "externa", p_producto: `Pipeta ${MARCA}`, p_insumo_id: null, p_lote_id: null, p_lote_texto: "LT-9", p_dosis: "1", p_fecha: hoyB, p_proxima: sumaDias(hoyB, 30), p_medico_id: null, p_notas: null, p_descontar: true });
  comprobar(des.ok, `el médico registra una desparasitación (${des.mensaje})`);
  comprobar(!(await rpc(P.recCon, "registrar_desparasitacion", { p_perro_id: perro, p_tipo: "rara", p_producto: "x", p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_dosis: null, p_fecha: hoyB, p_proxima: null, p_medico_id: null, p_notas: null, p_descontar: true })).ok, "un tipo de desparasitación inválido se rechaza");
  comprobar(!(await rpc(P.recSin, "registrar_desparasitacion", { p_perro_id: perro, p_tipo: "interna", p_producto: "x", p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_dosis: null, p_fecha: hoyB, p_proxima: null, p_medico_id: null, p_notas: null, p_descontar: true })).ok, "recepción sin permiso no registra desparasitaciones");

  seccion("3. Un registro no se edita ni se borra");
  const edit = await SB.from("carnet_vacunas").update({ biologico: "Cambiada" }).eq("id", vId);
  comprobar(!!edit.error && /no se edita/i.test(edit.error.message), `ni con la llave de servidor se edita («${edit.error?.message?.slice(0, 50)}»)`);
  const del = await SB.from("carnet_vacunas").delete().eq("id", vId);
  comprobar(!!del.error, "ni se borra");
  comprobar(!(await patch(P.admin, `carnet_vacunas?id=eq.${vId}`, { biologico: "x" })).ok, "ni por la API con el JWT del admin");
  comprobar(!(await post(P.admin, "carnet_vacunas", { perro_id: perro, biologico: "x", fecha_aplicacion: hoyB, vigente_hasta: hoyB, medico_id: medicoId })).ok, "ni se inserta directo: se escribe solo por las funciones");
  comprobar(!(await rpc(P.recCon, "anular_registro_carnet", { p_tipo: "vacuna", p_id: vId, p_motivo: "no" })).ok, "anular sin un motivo de verdad se rechaza");
  comprobar(!(await rpc(P.recSin, "anular_registro_carnet", { p_tipo: "vacuna", p_id: vId, p_motivo: "Se capturó mal la fecha" })).ok, "recepción sin permiso no anula");
  const anula = await rpc(P.recCon, "anular_registro_carnet", { p_tipo: "vacuna", p_id: vId, p_motivo: "Se capturó mal la fecha" });
  comprobar(anula.ok, "el médico anula con motivo");
  const anulada = (await SB.from("carnet_vacunas").select("anulada_at, anulada_por, anulada_motivo").eq("id", vId).single()).data;
  comprobar(anulada.anulada_at && anulada.anulada_por && anulada.anulada_motivo === "Se capturó mal la fecha", "queda quién, cuándo y por qué");
  comprobar(!(await rpc(P.recCon, "anular_registro_carnet", { p_tipo: "vacuna", p_id: vId, p_motivo: "Otra vez lo anulo" })).ok, "no se anula dos veces");
  const carnet = (await rpc(P.recCon, "carnet_de_mascota", { p_perro_id: perro })).cuerpo;
  comprobar(carnet.vacunas.find((v) => v.id === vId)?.estado === "anulada", "el carnet la muestra como anulada");
  comprobar(!(await rpc(P.cliente, "carnet_de_mascota", { p_perro_id: perro })).ok && !(await rpc(null, "carnet_de_mascota", { p_perro_id: perro })).ok, "el carnet completo no se lee con la sesión del dueño ni anónima");

  seccion("4. El carnet reemplaza al comprobante");
  const tipo = (await SB.from("tipos_requisito_sanitario").select("id, vigencia_meses").eq("negocio_id", B).eq("clave", "antirrabica").is("deleted_at", null).single()).data;
  const perro2 = await nuevoPerro("Comprobantin");
  const aplicadas = async (p) => (await SB.from("requisitos_sanitarios_aplicados").select("id, deleted_at, detalle").eq("perro_id", p).eq("tipo_requisito_id", tipo.id)).data ?? [];
  comprobar(!(await rpc(P.recSin, "guardar_veterinaria_ajustes", { p_recordatorios_activos: false, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: true, p_precio_dia: null })).ok, "recepción sin «Configuración del negocio» no cambia los ajustes");
  await rpc(P.admin, "guardar_veterinaria_ajustes", { p_recordatorios_activos: false, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: false, p_precio_dia: null });
  const apagado = await rpc(P.admin, "registrar_vacuna", { p_perro_id: perro2, p_biologico: "Antirrábica", p_tipo_requisito_id: tipo.id, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: hoyB, p_proxima: null, p_medico_id: medicoId, p_dosis: null, p_notas: null, p_descontar: true });
  comprobar(apagado.ok && (await aplicadas(perro2)).length === 0, "con la opción apagada, la vacuna del carnet NO cubre el requisito");
  await rpc(P.admin, "anular_registro_carnet", { p_tipo: "vacuna", p_id: apagado.cuerpo.id, p_motivo: "Prueba con la opción apagada" });
  await rpc(P.admin, "guardar_veterinaria_ajustes", { p_recordatorios_activos: false, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: true, p_precio_dia: null });
  const prendido = await rpc(P.admin, "registrar_vacuna", { p_perro_id: perro2, p_biologico: "Antirrábica", p_tipo_requisito_id: tipo.id, p_insumo_id: null, p_lote_id: null, p_lote_texto: "R-77", p_laboratorio: null, p_fecha: hoyB, p_proxima: null, p_medico_id: medicoId, p_dosis: null, p_notas: null, p_descontar: true });
  const ap = await aplicadas(perro2);
  comprobar(prendido.ok && ap.length === 1 && /Carnet/.test(ap[0].detalle), "con la opción prendida, la vacuna crea la aplicación del requisito");
  const estado = (await SB.from("perro_requisitos_sanitarios_estado").select("estado").eq("perro_id", perro2).eq("tipo_requisito_id", tipo.id).single()).data;
  comprobar(estado.estado === "vigente", "y el check-in lo ve vigente sin que nadie suba el documento");
  await rpc(P.admin, "anular_registro_carnet", { p_tipo: "vacuna", p_id: prendido.cuerpo.id, p_motivo: "Se aplicó otra marca" });
  const ap2 = await aplicadas(perro2);
  comprobar(ap2.every((x) => x.deleted_at) && (await SB.from("perro_requisitos_sanitarios_estado").select("estado").eq("perro_id", perro2).eq("tipo_requisito_id", tipo.id).single()).data.estado === "sin_registro", "al anular la vacuna, el requisito vuelve a quedar sin registro");
  await rpc(P.admin, "guardar_veterinaria_ajustes", { p_recordatorios_activos: false, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: false, p_precio_dia: null });

  seccion("5. Recordatorios de próxima dosis");
  const perro3 = await nuevoPerro("Recordin");
  const reg = (extra) => rpc(P.admin, "registrar_vacuna", { p_perro_id: perro3, p_biologico: `Quíntuple ${MARCA}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: sumaDias(hoyB, -30), p_proxima: sumaDias(hoyB, 3), p_medico_id: medicoId, p_dosis: null, p_notas: null, p_descontar: true, ...extra });
  const lejos = await reg({ p_biologico: `Lejana ${MARCA}`, p_proxima: sumaDias(hoyB, 40) });
  const cerca = await reg({});
  comprobar(lejos.ok && cerca.ok, "se registran una vacuna con próxima dosis cercana y otra lejana");
  const gen1 = await rpc(P.admin, "carnet_generar_recordatorios");
  void gen1;
  const filas = (await SB.from("carnet_recordatorios").select("*").eq("perro_id", perro3)).data;
  comprobar(gen1.ok && filas.length === 1 && filas[0].origen_id === cerca.cuerpo.id && filas[0].estado === "pendiente", "solo la que cae dentro de los 7 días entra a la cola");
  const gen2 = await rpc(P.admin, "carnet_generar_recordatorios");
  comprobar(gen2.ok && gen2.cuerpo === 0 && (await SB.from("carnet_recordatorios").select("id").eq("perro_id", perro3)).data.length === 1, "generar otra vez no duplica");
  await rpc(P.admin, "guardar_veterinaria_ajustes", { p_recordatorios_activos: false, p_dias_anticipacion: 60, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: false, p_precio_dia: null });
  await rpc(P.admin, "carnet_generar_recordatorios");
  comprobar((await SB.from("carnet_recordatorios").select("id").eq("perro_id", perro3)).data.length === 2, "con 60 días de anticipación entra también la lejana");
  await rpc(P.admin, "guardar_veterinaria_ajustes", { p_recordatorios_activos: false, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: false, p_precio_dia: null });
  // Una dosis ya renovada no se recuerda
  const perro4 = await nuevoPerro("Renovadin");
  const v1 = await rpc(P.admin, "registrar_vacuna", { p_perro_id: perro4, p_biologico: `Rabia ${MARCA}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: sumaDias(hoyB, -360), p_proxima: sumaDias(hoyB, 5), p_medico_id: medicoId, p_dosis: null, p_notas: null, p_descontar: true });
  await rpc(P.admin, "registrar_vacuna", { p_perro_id: perro4, p_biologico: `RABIA ${MARCA}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: hoyB, p_proxima: sumaDias(hoyB, 360), p_medico_id: medicoId, p_dosis: null, p_notas: null, p_descontar: true });
  await rpc(P.admin, "carnet_generar_recordatorios");
  comprobar(v1.ok && (await SB.from("carnet_recordatorios").select("id").eq("perro_id", perro4)).data.length === 0, "una dosis que ya se renovó (aunque cambie la mayúscula) no se recuerda");
  // Apagado por mascota
  const perro5 = await nuevoPerro("Apagadin");
  await rpc(P.admin, "registrar_vacuna", { p_perro_id: perro5, p_biologico: `Rabia ${MARCA}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: sumaDias(hoyB, -300), p_proxima: sumaDias(hoyB, 2), p_medico_id: medicoId, p_dosis: null, p_notas: null, p_descontar: true });
  comprobar(!(await rpc(P.recSin, "carnet_recordatorios_mascota", { p_perro_id: perro5, p_apagados: true })).ok, "recepción sin permiso no apaga los recordatorios de una mascota");
  comprobar((await rpc(P.admin, "carnet_recordatorios_mascota", { p_perro_id: perro5, p_apagados: true })).ok, "admin los apaga para una mascota");
  await rpc(P.admin, "carnet_generar_recordatorios");
  comprobar((await SB.from("carnet_recordatorios").select("id").eq("perro_id", perro5)).data.length === 0, "esa mascota no entra a la cola");
  // Lista y marcar
  const lista = await rpc(P.recCon, "carnet_recordatorios_lista");
  comprobar(lista.ok && lista.cuerpo.some((f) => f.id === filas[0].id && f.cliente_telefono !== undefined), "el médico ve la lista con el teléfono del dueño");
  comprobar((await rpc(P.recSin, "carnet_recordatorios_lista")).cuerpo?.length === 0, "recepción sin permiso recibe la lista vacía (no ve teléfonos)");
  comprobar(!(await rpc(P.cliente, "carnet_recordatorios_lista")).ok && !(await rpc(null, "carnet_recordatorios_lista")).ok, "ni el cliente ni la llave anónima la piden");
  comprobar(!(await rpc(P.recSin, "carnet_recordatorio_marcar", { p_id: filas[0].id, p_estado: "manual" })).ok, "recepción sin permiso no marca un recordatorio");
  comprobar(!(await rpc(P.recCon, "carnet_recordatorio_marcar", { p_id: filas[0].id, p_estado: "enviado" })).ok, "«enviado» solo lo pone el servidor, no una persona");
  comprobar((await rpc(P.recCon, "carnet_recordatorio_marcar", { p_id: filas[0].id, p_estado: "manual", p_nota: "Le mandé WhatsApp" })).ok, "el médico lo marca como mandado a mano");
  comprobar(!(await rpc(P.recCon, "carnet_recordatorio_marcar", { p_id: filas[0].id, p_estado: "omitido" })).ok, "uno ya resuelto no se vuelve a marcar");
  // El envío es del servidor
  for (const fn of ["carnet_recordatorios_para_enviar", "carnet_negocios_con_recordatorios"]) {
    for (const [quien, token] of [["admin", P.admin], ["médico", P.recCon], ["anónimo", null]]) {
      comprobar(!(await rpc(token, fn, fn === "carnet_recordatorios_para_enviar" ? { p_limite: 5 } : {})).ok, `${quien} no ejecuta ${fn}`);
    }
  }
  await rpc(P.admin, "guardar_veterinaria_ajustes", { p_recordatorios_activos: true, p_dias_anticipacion: 60, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: false, p_precio_dia: null });
  const sbB = SB;
  const aEnviar = await sbB.rpc("carnet_recordatorios_para_enviar", { p_limite: 10 });
  const mia = (aEnviar.data ?? []).find((f) => f.perro_nombre.startsWith("Recordin"));
  comprobar(!aEnviar.error && mia && mia.cliente_telefono !== undefined && mia.negocio_nombre, `el servidor recibe lo que toca mandar (${aEnviar.error?.message ?? (aEnviar.data ?? []).length + " filas"})`);
  const segunda = await sbB.rpc("carnet_recordatorios_para_enviar", { p_limite: 10 });
  comprobar(!(segunda.data ?? []).some((f) => f.id === mia?.id), "y la misma fila no se vuelve a entregar a otra corrida");
  const res = await sbB.rpc("carnet_recordatorio_resultado", { p_id: mia.id, p_ok: true, p_error: null, p_wa_id: "wamid.PRUEBA" });
  const enviado = (await SB.from("carnet_recordatorios").select("estado, wa_message_id, enviado_at, intentos").eq("id", mia.id).single()).data;
  comprobar(!res.error && enviado.estado === "enviado" && enviado.wa_message_id === "wamid.PRUEBA" && enviado.enviado_at, "el resultado queda anotado");
  await rpc(P.admin, "guardar_veterinaria_ajustes", { p_recordatorios_activos: false, p_dias_anticipacion: 7, p_certificado_vigencia_dias: 30, p_carnet_reemplaza_comprobante: false, p_precio_dia: null });
  const sinAuto = await sbB.rpc("carnet_recordatorios_para_enviar", { p_limite: 10 });
  comprobar(!sinAuto.error && (sinAuto.data ?? []).length === 0, "con el envío automático apagado, el servidor no recibe nada");

  seccion("6. Carnet verificable");
  const token = randomBytes(32).toString("base64url");
  comprobar(!(await rpc(P.recSin, "carnet_registrar_enlace", { p_perro_id: perro, p_token_hash: hashDe(token) })).ok, "recepción sin permiso no genera enlaces");
  comprobar(!(await rpc(P.recCon, "carnet_registrar_enlace", { p_perro_id: perro, p_token_hash: "no-es-un-hash" })).ok, "un hash mal formado se rechaza");
  const en1 = await rpc(P.recCon, "carnet_registrar_enlace", { p_perro_id: perro, p_token_hash: hashDe(token) });
  comprobar(en1.ok, "el médico genera el enlace");
  const pub = await SB.rpc("carnet_publico", { p_token_hash: hashDe(token) });
  const claves = Object.keys(pub.data ?? {}).sort().join(",");
  comprobar(!pub.error && claves === "consultado,dueno,especie,mascota,negocio,vacunas", `lo público trae solo mascota, especie, dueño, negocio, fecha y vacunas (${claves})`);
  const vac0 = (pub.data?.vacunas ?? [])[0] ?? {};
  comprobar(Object.keys(vac0).sort().join(",") === "biologico,fecha_aplicacion,vigente_hasta", "cada vacuna trae solo biológico, fecha y vigencia: sin lote, médico, laboratorio ni notas");
  const vigentesEnBase = (await SB.from("carnet_vacunas").select("id").eq("perro_id", perro).is("anulada_at", null).gte("vigente_hasta", hoyB)).data.length;
  comprobar((pub.data?.vacunas ?? []).length === vigentesEnBase && vigentesEnBase > 0, `solo las vacunas vigentes y no anuladas (${vigentesEnBase})`);
  comprobar(JSON.stringify(pub.data).includes("Carnetin") && !/\$|precio|cobro|telefono/i.test(JSON.stringify(pub.data)), "y nada de dinero ni teléfonos");
  for (const [quien, tk] of [["admin", P.admin], ["cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await rpc(tk, "carnet_publico", { p_token_hash: hashDe(token) })).ok, `${quien} no llama carnet_publico: solo el servidor`);
  }
  comprobar((await SB.rpc("carnet_publico", { p_token_hash: hashDe("otro-token") })).data === null, "un token que no existe da nada");
  const ajena = await servicioEn(LUDOGTEKA).rpc("carnet_publico", { p_token_hash: hashDe(token) });
  comprobar(ajena.data === null, "el mismo token en el dominio de otro negocio no abre nada");
  const hashLeido = await get(P.admin, `carnet_enlaces?select=token_hash&perro_id=eq.${perro}`);
  comprobar(!hashLeido.ok, "el hash del token no se lee por la API");
  const idsLeido = await get(P.admin, `carnet_enlaces?select=id,revocado_at&perro_id=eq.${perro}`);
  comprobar(idsLeido.ok && idsLeido.cuerpo.length === 1, "pero el personal sí sabe si hay un enlace vigente");
  const token2 = randomBytes(32).toString("base64url");
  await rpc(P.recCon, "carnet_registrar_enlace", { p_perro_id: perro, p_token_hash: hashDe(token2) });
  comprobar((await SB.rpc("carnet_publico", { p_token_hash: hashDe(token) })).data === null && (await SB.rpc("carnet_publico", { p_token_hash: hashDe(token2) })).data !== null, "generar uno nuevo desactiva el anterior");
  await rpc(P.recCon, "carnet_revocar_enlace", { p_perro_id: perro });
  comprobar((await SB.rpc("carnet_publico", { p_token_hash: hashDe(token2) })).data === null, "revocarlo lo apaga");

  seccion("7. Certificados de salud");
  const cert = (token, extra = {}) =>
    rpc(token, "emitir_certificado", { p_perro_id: perro, p_medico_id: null, p_motivo: "viaje", p_destino: "Guadalajara", p_exploracion: "Sin hallazgos. Mucosas rosadas, hidratado.", p_observaciones: null, p_dias_vigencia: null, ...extra });
  for (const [quien, tk] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["anónimo", null]]) {
    comprobar(!(await cert(tk, { p_medico_id: medicoId })).ok, `${quien} no emite certificados`);
  }
  comprobar(!(await cert(P.recCon, { p_exploracion: "  " })).ok, "sin exploración se rechaza");
  comprobar(!(await cert(P.recCon, { p_motivo: "chiste" })).ok, "un motivo inválido se rechaza");
  comprobar(!(await cert(P.recCon, { p_dias_vigencia: 999 })).ok, "una vigencia de 999 días se rechaza");
  const c1 = await cert(P.recCon);
  comprobar(c1.ok && c1.cuerpo.numero >= 1, `el médico emite un certificado (${c1.mensaje})`);
  const c1f = (await SB.from("certificados_salud").select("*").eq("id", c1.cuerpo.id).single()).data;
  comprobar(c1f.medico_id === medicoId && c1f.snapshot.medico.cedula === cedula && c1f.snapshot.mascota.nombre.startsWith("Carnetin") && c1f.snapshot.establecimiento.nombre, "lleva el médico con su cédula, la mascota y el establecimiento");
  comprobar(c1f.vigente_hasta === sumaDias(hoyB, 30), "vigencia de 30 días (el ajuste del negocio)");
  comprobar(Array.isArray(c1f.snapshot.vacunas) && c1f.snapshot.vacunas.length === vigentesEnBase && c1f.snapshot.vacunas.every((v) => v.vigente_hasta >= hoyB), "la foto trae solo las vacunas vigentes de ese día");
  const c2 = await cert(P.admin, { p_medico_id: medicoId, p_dias_vigencia: 10 });
  comprobar(c2.ok && c2.cuerpo.numero === c1.cuerpo.numero + 1, "el siguiente certificado lleva el número siguiente");
  comprobar(!(await cert(P.admin)).ok, "un admin que no es médico tiene que elegir al médico que firma");
  const editC = await SB.from("certificados_salud").update({ exploracion: "Cambiado" }).eq("id", c1.cuerpo.id);
  comprobar(!!editC.error, "un certificado no se edita");
  comprobar(!!(await SB.from("certificados_salud").delete().eq("id", c1.cuerpo.id)).error, "ni se borra");
  comprobar(!(await rpc(P.recSin, "anular_certificado", { p_id: c2.cuerpo.id, p_motivo: "Error al capturar" })).ok, "recepción sin permiso no anula");
  comprobar(!(await rpc(P.admin, "anular_certificado", { p_id: c2.cuerpo.id, p_motivo: "x" })).ok, "anular pide un motivo");
  comprobar((await rpc(P.admin, "anular_certificado", { p_id: c2.cuerpo.id, p_motivo: "Error al capturar" })).ok, "admin lo anula con motivo");
  const c2f = (await SB.from("certificados_salud").select("estado, anulado_motivo, anulado_por").eq("id", c2.cuerpo.id).single()).data;
  comprobar(c2f.estado === "anulado" && c2f.anulado_motivo === "Error al capturar" && c2f.anulado_por, "queda anulado con quién y por qué");
  comprobar(!(await rpc(P.admin, "anular_certificado", { p_id: c2.cuerpo.id, p_motivo: "Otra vez más" })).ok, "no se anula dos veces");
  const fallecido = await nuevoPerro("Fallecidin", { fallecido: true });
  comprobar(!(await rpc(P.recCon, "emitir_certificado", { p_perro_id: fallecido, p_medico_id: null, p_motivo: "general", p_destino: null, p_exploracion: "x", p_observaciones: null, p_dias_vigencia: null })).ok, "a una mascota fallecida no se le emite certificado");
  comprobar((await get(P.recSin, "certificados_salud?select=id")).cuerpo?.length >= 1 && !(await get(P.cliente, "certificados_salud?select=id")).cuerpo?.length, "el personal lee los certificados; el cliente no");

  seccion("8. Portal del dueño, otros negocios, módulo apagado, llave anónima");
  const mi = await rpc(P.cliente, "mi_carnet", { p_perro_id: perro });
  comprobar(mi.ok && mi.cuerpo && Object.keys(mi.cuerpo).sort().join(",") === "desparasitaciones,vacunas", "el dueño ve su carnet (vacunas y desparasitaciones)");
  const textoMi = JSON.stringify(mi.cuerpo);
  comprobar(!/notas|medico|cedula|lote|anulada|laboratorio/i.test(textoMi), "sin notas, médico, lote ni anuladas");
  comprobar((mi.cuerpo.vacunas ?? []).length === (await SB.from("carnet_vacunas").select("id").eq("perro_id", perro).is("anulada_at", null)).data.length, "las vacunas anuladas no salen en su portal");
  const perroAjeno = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteAmbosB, nombre: `Ajenito ${MARCA}` }).select("id").single()).data.id;
  comprobar((await rpc(P.cliente, "mi_carnet", { p_perro_id: perroAjeno })).cuerpo === null, "el carnet de la mascota de otro dueño no se ve (nulo)");
  comprobar(!(await rpc(null, "mi_carnet", { p_perro_id: perro })).ok, "la llave anónima no llama mi_carnet");
  comprobar((await rpc(P.recCon, "mi_carnet", { p_perro_id: perro })).cuerpo === null, "ni el personal (no es dueño)");

  const tLud = await tokenDe((await SB.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "admin").is("deleted_at", null).limit(1).single()).data.profile_id);
  for (const t of ["carnet_vacunas", "carnet_desparasitaciones", "carnet_recordatorios", "carnet_enlaces", "certificados_salud", "carnet_mascota", "veterinaria_ajustes"]) {
    const propio = await get(tLud, `${t}?select=id`, LUDOGTEKA);
    const suplanta = await get(tLud, `${t}?select=id`, B);
    const anon = await get(null, `${t}?select=id`);
    comprobar((propio.cuerpo ?? []).length === 0 || !propio.ok, `Ludogteka no ve ${t} de Huellitas`);
    comprobar(!suplanta.ok || (suplanta.cuerpo ?? []).length === 0, `ni suplantando el encabezado (${t})`);
    comprobar(!anon.ok || (anon.cuerpo ?? []).length === 0, `ni la llave anónima (${t})`);
  }
  for (const fn of ["vet_puede", "registrar_vacuna", "registrar_desparasitacion", "emitir_certificado", "carnet_de_mascota", "carnet_registrar_enlace", "guardar_veterinaria_ajustes", "veterinaria_ajustes_actuales", "vet_mi_medico"]) {
    const argsDe = {
      vet_puede: { p_permiso: "registrar_vacunas" },
      registrar_vacuna: { p_perro_id: perro, p_biologico: "x", p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: null, p_fecha: hoyB, p_proxima: null, p_medico_id: null, p_dosis: null, p_notas: null, p_descontar: true },
      registrar_desparasitacion: { p_perro_id: perro, p_tipo: "interna", p_producto: "x", p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_dosis: null, p_fecha: hoyB, p_proxima: null, p_medico_id: null, p_notas: null, p_descontar: true },
      emitir_certificado: { p_perro_id: perro, p_medico_id: null, p_motivo: "general", p_destino: null, p_exploracion: "x", p_observaciones: null, p_dias_vigencia: null },
      carnet_de_mascota: { p_perro_id: perro },
      carnet_registrar_enlace: { p_perro_id: perro, p_token_hash: hashDe("x") },
      guardar_veterinaria_ajustes: { p_recordatorios_activos: false, p_dias_anticipacion: 1, p_certificado_vigencia_dias: 1, p_carnet_reemplaza_comprobante: false, p_precio_dia: null },
      veterinaria_ajustes_actuales: {},
      vet_mi_medico: {},
    };
    const r = await rpc(null, fn, argsDe[fn]);
    comprobar(!r.ok && (r.codigo === "42501" || r.status === 401 || r.status === 403), `la llave anónima no ejecuta ${fn}`);
  }
  for (const fn of ["vet_medico_firma", "vet_descontar_lote"]) {
    const r = await rpc(P.admin, fn, fn === "vet_medico_firma" ? { p_medico_id: null, p_obligatorio: false } : { p_lote_id: l1, p_cantidad_consumo: 1, p_motivo: "x" });
    comprobar(!r.ok, `ni el admin llama la función interna ${fn}`);
  }

  await fijarModulo("veterinaria", false);
  comprobar(!(await vac(P.admin)).ok, "con Veterinaria apagada no se registran vacunas");
  comprobar((await rpc(P.cliente, "mi_carnet", { p_perro_id: perro })).cuerpo === null, "ni el portal enseña el carnet");
  comprobar((await SB.rpc("carnet_publico", { p_token_hash: hashDe(token2) })).data === null, "ni el enlace público");
  comprobar((await SB.from("carnet_vacunas").select("id").eq("perro_id", perro)).data.length > 0, "pero lo capturado se conserva");
  await fijarModulo("veterinaria", true);
  comprobar((await rpc(P.recCon, "carnet_de_mascota", { p_perro_id: perro })).cuerpo.vacunas.length > 0, "al prenderla otra vez, todo sigue ahí");
} finally {
  // Se deja Huellitas como estaba.
  for (const permiso of ["registrar_vacunas", "emitir_certificados", "hospitalizar", "configuracion_negocio"]) {
    await quitar(P.admin, P.recConId, permiso).catch(() => {});
    await quitar(P.admin, P.recSinId, permiso).catch(() => {});
  }
  await fijarModulo("veterinaria", true).catch(() => {});
  if (ajustesGuardados) {
    await SB.from("veterinaria_ajustes").update({
      recordatorios_activos: ajustesGuardados.recordatorios_activos, dias_anticipacion: ajustesGuardados.dias_anticipacion,
      certificado_vigencia_dias: ajustesGuardados.certificado_vigencia_dias, carnet_reemplaza_comprobante: ajustesGuardados.carnet_reemplaza_comprobante,
      hospitalizacion_precio_dia: ajustesGuardados.hospitalizacion_precio_dia,
    }).eq("id", ajustesGuardados.id);
  } else {
    await SB.from("veterinaria_ajustes").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).is("deleted_at", null);
  }
}

terminar();
