// Expediente clínico de Veterinaria, Fase 3 (SOLO DESARROLLO, en Huellitas; nunca
// Ludogteka). Migraciones 20261016000000 a 20261016000200.
//
//   node scripts/auditoria/expediente-dev.mjs
//
// 0. Acceso a la zona (médico de cualquier rol, permisos, cliente, anónimo).
// 1. Agenda clínica: tipos, empalme por médico, urgencia, reprogramar, estados.
// 2. Plantillas por tipo de consulta.
// 3. Consulta SOAP: borrador, autoguardado, firma (solo el médico), inmutabilidad, adenda, anulación.
// 4. Portal del dueño (opción por negocio) y notas internas.
// 5. Catálogo de diagnósticos: búsqueda, ampliar por negocio, solo la plataforma edita.
// 6. Resultados de laboratorio y adjuntos.
// 7. Lecturas, línea de tiempo y que las tablas no se lean directo.
// 8. Aislamiento entre negocios, módulo apagado y llave anónima.
import { B, SB, LUDOGTEKA, datos, rpc, get, post, patch, borrar, personas, dar, quitar, fijarModulo, hoy, sumaDias, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";

const P = await personas();
const MARCA = `exp-${String(Date.now()).slice(-6)}`;
const nuevoPerro = async (nombre, extra = {}) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${MARCA}`, ...extra }).select("id").single();
  if (r.error) throw new Error(`perro: ${r.error.message}`);
  return r.data.id;
};
const PERMISOS = ["atender_consultas", "firmar_expediente", "crear_estimados", "registrar_vacunas", "emitir_certificados", "hospitalizar", "lotes_clinicos", "editar_ficha_clinica", "configuracion_negocio"];
const limpiarPermisos = async () => {
  for (const p of PERMISOS) {
    await quitar(P.admin, P.recConId, p);
    await quitar(P.admin, P.recSinId, p);
  }
};
const ajustesGuardados = (await SB.from("veterinaria_ajustes").select("*").eq("negocio_id", B).is("deleted_at", null).maybeSingle())?.data;
const medicosCreados = [];
// Una hora futura única por prueba (cada cita en su día para no chocar con corridas anteriores).
let desfase = 20 + Math.floor(Math.random() * 300);
const dia = () => { desfase += 1; return sumaDias(new Date().toISOString().slice(0, 10), desfase); };
const a = (fecha, hhmm) => `${fecha}T${hhmm}:00-07:00`;

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  await limpiarPermisos();
  const hoyB = await hoy(P.admin);

  // Médicos: la recepcionista «con» y la persona de estética.
  const cedA = `CEDX${String(Date.now()).slice(-6)}`;
  const m1 = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: cedA, p_cpa: "CPA-9" });
  const m2 = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: datos.esteticaB, p_cedula: `${cedA}9`, p_cpa: null });
  comprobar(m1.ok && m2.ok, `admin designa a dos médicos (uno con rol de recepción y otro de estética) (${m1.mensaje} ${m2.mensaje})`);
  const medA = m1.cuerpo;
  const medE = m2.cuerpo;
  medicosCreados.push(medA, medE);

  seccion("0. Acceso a la zona");
  const acc = async (t) => (await rpc(t, "acceso_veterinaria")).cuerpo;
  comprobar((await acc(P.admin)) === true, "admin entra");
  comprobar((await acc(P.recCon)) === true, "el médico (rol recepción) entra por su designación");
  comprobar((await acc(P.estetica)) === true, "el médico con rol de ESTÉTICA entra por su designación (antes no podía)");
  comprobar((await acc(P.recSin)) === false, "recepción sin permiso ni designación: la función dice que no (la zona la abre su rol)");
  await dar(P.admin, P.recSinId, "lotes_clinicos");
  comprobar((await acc(P.recSin)) === true, "con un permiso del módulo (lotes_clinicos) entra");
  await quitar(P.admin, P.recSinId, "lotes_clinicos");
  comprobar((await acc(P.cliente)) !== true, "el cliente no entra");
  comprobar(!(await rpc(null, "acceso_veterinaria")).ok, "la llave anónima no puede ni preguntar");
  // El médico de estética hace lo clínico con su designación (la base valida SU permiso en cada función).
  const perroAcc = await nuevoPerro("Accesin");
  const hospE = await rpc(P.estetica, "hospitalizar_ingresar", { p_perro_id: perroAcc, p_medico_id: null, p_motivo: "Prueba de acceso", p_ubicacion: null, p_deposito: 0, p_precio_dia: null });
  comprobar(hospE.ok, `el médico de estética hospitaliza con su designación (${hospE.mensaje})`);
  if (hospE.ok) await rpc(P.estetica, "hospitalizar_dar_alta", { p_hosp: hospE.cuerpo.id, p_resumen: "ok" });
  comprobar(!(await rpc(P.recSin, "hospitalizar_ingresar", { p_perro_id: perroAcc, p_medico_id: medA, p_motivo: "x", p_ubicacion: null, p_deposito: 0, p_precio_dia: null })).ok, "pero quien solo entra por rol no hospitaliza");

  seccion("1. Agenda clínica");
  const tipos = await rpc(P.recSin, "vet_tipos_cita_lista");
  comprobar(tipos.ok && tipos.cuerpo.length === 5 && ["consulta", "vacuna", "cirugia", "seguimiento", "urgencia"].every((c) => tipos.cuerpo.some((t) => t.clave === c)), "los cinco tipos de cita existen (se siembran solos)");
  comprobar(tipos.cuerpo.find((t) => t.clave === "cirugia")?.duracion_min === 90, "con la duración de cada tipo (cirugía 90 min)");
  comprobar(!(await rpc(P.recSin, "guardar_tipo_cita", { p_clave: "vacuna", p_nombre: "Vacuna", p_duracion_min: 20, p_activo: true })).ok, "recepción sin «Configuración» no cambia la duración");
  comprobar((await rpc(P.admin, "guardar_tipo_cita", { p_clave: "vacuna", p_nombre: "Vacuna", p_duracion_min: 20, p_activo: true })).ok, "admin sí");
  await rpc(P.admin, "guardar_tipo_cita", { p_clave: "vacuna", p_nombre: "Vacuna", p_duracion_min: 15, p_activo: true });
  comprobar(!(await rpc(P.admin, "guardar_tipo_cita", { p_clave: "consulta", p_nombre: "Consulta", p_duracion_min: 2, p_activo: true })).ok, "una duración de 2 minutos se rechaza");

  const perro = await nuevoPerro("Agendin");
  const d1 = dia();
  const agendar = (token, extra = {}) =>
    rpc(token, "vet_agendar_cita", { p_perro: perro, p_tipo: "consulta", p_medico: medA, p_inicia: a(d1, "10:00"), p_duracion_min: null, p_motivo: "Revisión", ...extra });
  comprobar(!(await agendar(P.cliente)).ok, "el cliente no agenda");
  comprobar(!(await agendar(null)).ok, "la llave anónima no agenda");
  const porEst = await agendar(P.estetica, { p_medico: medE, p_inicia: a(d1, "16:00") });
  comprobar(porEst.ok, `el médico con rol de estética agenda con su designación (${porEst.mensaje})`);
  const c1 = await agendar(P.recSin);
  comprobar(c1.ok && c1.cuerpo.empalmada === false, `recepción (sin permisos clínicos) agenda una consulta (${c1.mensaje})`);
  const c1id = c1.cuerpo?.id;
  const fila = (await SB.from("vet_citas").select("inicia_at, termina_at, estado, tipo_clave").eq("id", c1id).single()).data;
  comprobar(fila && (new Date(fila.termina_at) - new Date(fila.inicia_at)) / 60000 === 30 && fila.estado === "programada", "dura 30 min (la de su tipo) y queda programada");
  const choque = await agendar(P.recSin, { p_inicia: a(d1, "10:15") });
  comprobar(!choque.ok && /ya tiene una cita/.test(choque.mensaje), `el mismo médico no se empalma (${choque.mensaje})`);
  comprobar((await agendar(P.recSin, { p_inicia: a(d1, "10:30") })).ok, "pegada, justo al terminar la anterior, sí cabe");
  const otroMed = await agendar(P.recSin, { p_inicia: a(d1, "10:00"), p_medico: medE });
  comprobar(otroMed.ok, `otro médico a la misma hora sí (${otroMed.mensaje})`);
  const urg = await agendar(P.recSin, { p_tipo: "urgencia", p_inicia: a(d1, "10:10") });
  comprobar(urg.ok && urg.cuerpo.empalmada === true, "una urgencia entra aunque se empalme y lo avisa");
  comprobar(!(await agendar(P.recSin, { p_inicia: a(d1, "11:00"), p_medico: crypto.randomUUID() })).ok, "un médico que no existe se rechaza");
  comprobar(!(await agendar(P.recSin, { p_inicia: a(sumaDias(hoyB, -5), "10:00") })).ok, "una hora que ya pasó se rechaza");
  comprobar(!(await agendar(P.recSin, { p_inicia: a(d1, "12:00"), p_duracion_min: 1000 })).ok, "una duración absurda se rechaza");
  const ex = await SB.from("vet_citas").insert({ negocio_id: B, perro_id: perro, cliente_id: datos.clienteSoloB, tipo_id: fila ? (await SB.from("vet_tipos_cita").select("id").eq("negocio_id", B).eq("clave", "consulta").single()).data.id : null, tipo_clave: "consulta", medico_id: medA, inicia_at: a(d1, "10:05"), termina_at: a(d1, "10:20") });
  comprobar(!!ex.error, "la base misma rechaza un empalme del mismo médico aunque se salten las funciones (restricción de exclusión)");
  const agenda = await rpc(P.recSin, "vet_agenda", { p_desde: d1, p_hasta: d1, p_medico: null });
  comprobar(agenda.ok && agenda.cuerpo.length >= 4 && agenda.cuerpo.every((c) => c.mascota && c.medico), "la agenda trae mascota, dueño y médico por nombre");
  comprobar((await rpc(P.recSin, "vet_agenda", { p_desde: d1, p_hasta: d1, p_medico: medE })).cuerpo.every((c) => c.medico_id === medE), "y se filtra por médico");
  comprobar((await rpc(P.cliente, "vet_agenda", { p_desde: d1, p_hasta: d1, p_medico: null })).cuerpo?.length === 0, "el cliente ve una agenda vacía");
  comprobar(!(await rpc(P.recSin, "vet_agenda", { p_desde: d1, p_hasta: sumaDias(d1, 60), p_medico: null })).ok, "un rango de más de 45 días se rechaza");
  // Reprogramar y estados.
  comprobar(!(await rpc(P.recSin, "vet_reprogramar_cita", { p_id: c1id, p_inicia: a(d1, "10:45"), p_medico: null, p_duracion_min: null })).ok, "mover la cita encima de otra del mismo médico se rechaza");
  comprobar((await rpc(P.recSin, "vet_reprogramar_cita", { p_id: c1id, p_inicia: a(d1, "14:00"), p_medico: null, p_duracion_min: 45 })).ok, "moverla a una hora libre funciona");
  comprobar(!(await rpc(P.recSin, "vet_cita_estado", { p_id: c1id, p_estado: "finalizada", p_motivo: null })).ok, "una cita programada no pasa directo a finalizada");
  comprobar(!(await rpc(P.recSin, "vet_cita_estado", { p_id: c1id, p_estado: "cancelada", p_motivo: " " })).ok, "cancelar pide el motivo");
  comprobar((await rpc(P.recSin, "vet_cita_estado", { p_id: c1id, p_estado: "confirmada", p_motivo: null })).ok, "se confirma");
  comprobar((await rpc(P.recSin, "vet_cita_estado", { p_id: c1id, p_estado: "cancelada", p_motivo: "El dueño no puede" })).ok, "se cancela con motivo");
  comprobar(!(await rpc(P.recSin, "vet_reprogramar_cita", { p_id: c1id, p_inicia: a(d1, "15:00"), p_medico: null, p_duracion_min: null })).ok, "una cita cancelada ya no se mueve");

  seccion("2. Plantillas por tipo de consulta");
  const pl = await rpc(P.recSin, "vet_plantillas_consulta");
  comprobar(pl.ok && Object.keys(pl.cuerpo).length === 5 && pl.cuerpo.consulta.version >= 1 && /Evolución/.test(pl.cuerpo.seguimiento.texto.anamnesis), "hay una plantilla neutra por tipo");
  comprobar(!(await rpc(P.recSin, "guardar_plantilla_consulta", { p_tipo: "consulta", p_texto: { anamnesis: "x" } })).ok, "recepción sin «Configuración» no la edita");
  const v0 = pl.cuerpo.consulta.version;
  const gp = await rpc(P.admin, "guardar_plantilla_consulta", { p_tipo: "consulta", p_texto: { anamnesis: `Mi anamnesis ${MARCA}`, examen_fisico: "EF", hallazgos: "", plan: "PL", tratamiento: "TX" } });
  comprobar(gp.ok && gp.cuerpo === v0 + 1, "admin guarda una versión nueva (queda la historia)");
  comprobar(!(await rpc(P.admin, "guardar_plantilla_consulta", { p_tipo: "consulta", p_texto: { anamnesis: "x".repeat(5000) } })).ok, "un texto de 5,000 caracteres se rechaza");

  seccion("3. La consulta (SOAP)");
  const perroC = await nuevoPerro("Consultin");
  const iniciar = (token, extra = {}) => rpc(token, "vet_consulta_iniciar", { p_perro: perroC, p_cita: null, p_tipo: "consulta", p_medico: medA, ...extra });
  for (const [quien, token] of [["recepción sin permiso", P.recSin], ["el cliente", P.cliente], ["la llave anónima", null]]) comprobar(!(await iniciar(token)).ok, `${quien} no abre una consulta`);
  await dar(P.admin, P.recSinId, "atender_consultas");
  const ini = await iniciar(P.recSin);
  comprobar(ini.ok, `con «Atender consultas» abre un borrador (${ini.mensaje})`);
  const cId = ini.cuerpo;
  let c = (await SB.from("vet_consultas").select("*").eq("id", cId).single()).data;
  comprobar(c.estado === "borrador" && c.medico_id === medA && /Mi anamnesis/.test(c.anamnesis ?? ""), "nace con la plantilla vigente del tipo");
  const g1 = await rpc(P.recSin, "vet_consulta_guardar", { p_id: cId, p_datos: { motivo: "Vómito desde ayer", peso_kg: 12.4, temperatura_c: 39.1, frecuencia_cardiaca: 110, frecuencia_respiratoria: 24, condicion_corporal: 5, mucosas: "Rosadas", tllc_seg: 1.5 } });
  comprobar(g1.ok, `el autoguardado funciona (${g1.mensaje})`);
  c = (await SB.from("vet_consultas").select("*").eq("id", cId).single()).data;
  comprobar(c.motivo === "Vómito desde ayer" && Number(c.peso_kg) === 12.4 && c.condicion_corporal === 5 && c.borrador_guardado_at, "guarda motivo, signos vitales y la hora del autoguardado");
  comprobar(/Mi anamnesis/.test(c.anamnesis ?? ""), "y solo cambia lo que viene (la anamnesis sigue)");
  comprobar(!(await rpc(P.recSin, "vet_consulta_guardar", { p_id: cId, p_datos: { temperatura_c: 60 } })).ok, "una temperatura de 60 °C se rechaza");
  comprobar(!(await rpc(P.recSin, "vet_consulta_guardar", { p_id: cId, p_datos: { condicion_corporal: 12 } })).ok, "una condición corporal de 12 se rechaza");
  comprobar(!(await rpc(P.recSin, "vet_consulta_guardar", { p_id: cId, p_datos: { diagnosticos: [{ nombre: "x", tipo: "raro", origen: "libre" }] } })).ok, "un diagnóstico sin tipo válido se rechaza");
  comprobar(!(await rpc(P.recSin, "vet_consulta_guardar", { p_id: cId, p_datos: { motivo: "m".repeat(9000) } })).ok, "un texto de 9,000 caracteres se rechaza");
  const dxCat = (await rpc(P.recSin, "vet_buscar_diagnosticos", { p_q: "gastroenteritis", p_especie: "perro", p_limite: 5 })).cuerpo;
  const dx = [{ ref_id: dxCat[0]?.id ?? null, origen: "catalogo", nombre: dxCat[0]?.nombre ?? "Gastroenteritis aguda", tipo: "presuntivo", nota: "" }];
  comprobar((await rpc(P.recSin, "vet_consulta_guardar", { p_id: cId, p_datos: { diagnosticos: dx, plan: "Dieta blanda", tratamiento: "Omeprazol", notas_internas: "El dueño llegó tarde" } })).ok, "guarda diagnósticos, plan, tratamiento y notas internas");

  // Firma.
  comprobar(!(await rpc(P.recSin, "vet_consulta_firmar", { p_id: cId })).ok, "quien solo atiende (no es médico) no firma");
  comprobar(!(await rpc(P.admin, "vet_consulta_firmar", { p_id: cId })).ok, "admin no firma si no es médico designado");
  comprobar(!(await rpc(P.estetica, "vet_consulta_firmar", { p_id: cId })).ok, "otro médico no firma una consulta a cargo de su colega");
  const sinMotivo = (await iniciar(P.recCon)).cuerpo;
  comprobar(!(await rpc(P.recCon, "vet_consulta_firmar", { p_id: sinMotivo })).ok, "sin motivo no se firma");
  await rpc(P.recCon, "vet_consulta_guardar", { p_id: sinMotivo, p_datos: { motivo: "Revisión" } });
  const sinDx = await rpc(P.recCon, "vet_consulta_firmar", { p_id: sinMotivo });
  comprobar(!sinDx.ok && /diagnóstico/.test(sinDx.mensaje), "una consulta sin diagnóstico no se firma");
  await rpc(P.recCon, "vet_consulta_descartar", { p_id: sinMotivo });
  comprobar((await SB.from("vet_consultas").select("deleted_at").eq("id", sinMotivo).single()).data.deleted_at, "un borrador se descarta");

  const firma = await rpc(P.recCon, "vet_consulta_firmar", { p_id: cId });
  comprobar(firma.ok && firma.cuerpo.cedula === cedA && /^[0-9a-f]{64}$/.test(firma.cuerpo.firma_hash), `el médico a cargo firma con su cédula (${firma.mensaje})`);
  c = (await SB.from("vet_consultas").select("*").eq("id", cId).single()).data;
  comprobar(c.estado === "firmada" && c.firma_cedula === cedA && c.firma_cpa === "CPA-9" && c.firma_nombre, "la firma guarda médico, cédula y CPA");
  const peso = (await SB.from("pesos_registrados").select("peso_kg, notas").eq("perro_id", perroC)).data;
  comprobar(peso.length === 1 && Number(peso[0].peso_kg) === 12.4, "el peso de la consulta entra al historial de pesos");
  comprobar(!(await rpc(P.recSin, "vet_consulta_guardar", { p_id: cId, p_datos: { motivo: "cambio" } })).ok, "una consulta firmada ya no se autoguarda");
  const upd = await SB.from("vet_consultas").update({ motivo: "cambio por debajo" }).eq("id", cId);
  comprobar(!!upd.error, "ni siquiera con la llave de servidor se edita (trigger)");
  const del = await SB.from("vet_consultas").delete().eq("id", cId);
  comprobar(!!del.error, "ni se borra");
  const upd2 = await SB.from("vet_consultas").update({ deleted_at: new Date().toISOString() }).eq("id", cId);
  comprobar(!!upd2.error, "ni se da de baja");
  comprobar(!(await rpc(P.recCon, "vet_consulta_firmar", { p_id: cId })).ok, "no se firma dos veces");
  comprobar(!(await rpc(P.recCon, "vet_consulta_descartar", { p_id: cId })).ok, "una firmada no se descarta");
  // Adenda.
  comprobar(!(await rpc(P.recSin, "vet_consulta_adenda", { p_id: cId, p_texto: "Agrego" })).ok, "quien no es médico no agrega adenda");
  comprobar(!(await rpc(P.recCon, "vet_consulta_adenda", { p_id: cId, p_texto: " " })).ok, "una adenda vacía se rechaza");
  const ad = await rpc(P.estetica, "vet_consulta_adenda", { p_id: cId, p_texto: `Resultado de laboratorio recibido ${MARCA}` });
  comprobar(ad.ok, `otro médico designado puede agregar una adenda firmada (${ad.mensaje})`);
  const adRow = (await SB.from("vet_consulta_adendas").select("*").eq("id", ad.cuerpo).single()).data;
  comprobar(adRow?.firma_cedula === `${cedA}9`, "con su propia cédula");
  comprobar(!!(await SB.from("vet_consulta_adendas").update({ texto: "x" }).eq("id", ad.cuerpo)).error, "la adenda no se edita");
  const det = await rpc(P.recSin, "vet_consulta_detalle", { p_id: cId });
  comprobar(det.ok && det.cuerpo.adendas.length === 1 && det.cuerpo.consulta.notas_internas === "El dueño llegó tarde" && det.cuerpo.medico.cedula === cedA, "el detalle trae adendas, notas internas (al equipo) y la cédula visible");
  await quitar(P.admin, P.recSinId, "atender_consultas");
  comprobar(!(await rpc(P.recSin, "vet_consulta_detalle", { p_id: cId })).ok, "sin «Atender consultas» ya no se lee el expediente");

  // Cita enlazada.
  const dc = dia();
  const citaC = (await rpc(P.recCon, "vet_agendar_cita", { p_perro: perroC, p_tipo: "seguimiento", p_medico: medA, p_inicia: a(dc, "09:00"), p_duracion_min: null, p_motivo: "Seguimiento" })).cuerpo.id;
  const ic = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: null, p_cita: citaC, p_tipo: null, p_medico: null });
  comprobar(ic.ok, `iniciar desde la cita (${ic.mensaje})`);
  comprobar((await SB.from("vet_citas").select("estado, consulta_id").eq("id", citaC).single()).data.estado === "en_curso", "la cita pasa a «en curso»");
  comprobar(!(await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: null, p_cita: citaC, p_tipo: null, p_medico: null })).ok, "una cita no abre dos consultas");
  await rpc(P.recCon, "vet_consulta_guardar", { p_id: ic.cuerpo, p_datos: { motivo: "Seguimiento de gastroenteritis", examen_fisico: "Bien" } });
  comprobar((await rpc(P.recCon, "vet_consulta_firmar", { p_id: ic.cuerpo })).ok, "un seguimiento sin diagnóstico sí se firma");
  comprobar((await SB.from("vet_citas").select("estado").eq("id", citaC).single()).data.estado === "finalizada", "y la cita queda finalizada");
  // Anulación.
  comprobar(!(await rpc(P.recCon, "vet_consulta_anular", { p_id: ic.cuerpo, p_motivo: "x" })).ok, "anular pide un motivo de verdad");
  comprobar(!(await rpc(P.estetica, "vet_consulta_anular", { p_id: ic.cuerpo, p_motivo: "Error de captura grave" })).ok, "otro médico (no admin) no anula una firma ajena");
  comprobar((await rpc(P.recCon, "vet_consulta_anular", { p_id: ic.cuerpo, p_motivo: "Capturada en la mascota equivocada" })).ok, "el médico que firmó la anula con motivo");
  const anulada = (await SB.from("vet_consultas").select("estado, anulada_motivo, motivo").eq("id", ic.cuerpo).single()).data;
  comprobar(anulada.estado === "anulada" && anulada.motivo === "Seguimiento de gastroenteritis", "queda anulada y su contenido intacto");
  comprobar(!(await rpc(P.admin, "vet_consulta_anular", { p_id: ic.cuerpo, p_motivo: "Otra vez, por si acaso" })).ok, "no se anula dos veces");

  seccion("4. Portal del dueño");
  const mx = () => rpc(P.cliente, "mi_expediente", { p_perro: perroC });
  comprobar((await SB.from("veterinaria_ajustes").select("portal_expediente").eq("negocio_id", B).maybeSingle()).data?.portal_expediente !== true, "la opción del portal viene apagada");
  let mi = await mx();
  comprobar(mi.ok && mi.cuerpo?.habilitado === false && mi.cuerpo.consultas.length === 0, "apagada, el dueño no ve nada del expediente");
  comprobar(!(await rpc(P.recSin, "guardar_veterinaria_portal", { p_expediente: true })).ok, "recepción sin «Configuración» no la prende");
  await dar(P.admin, P.recSinId, "configuracion_negocio");
  comprobar((await rpc(P.recSin, "guardar_veterinaria_portal", { p_expediente: true })).ok, "con «Configuración» sí");
  await quitar(P.admin, P.recSinId, "configuracion_negocio");
  mi = await mx();
  const txt = JSON.stringify(mi.cuerpo);
  comprobar(mi.cuerpo?.habilitado === true && mi.cuerpo.consultas.length === 1, "prendida, ve su consulta firmada (la anulada no aparece)");
  comprobar(/Dieta blanda/.test(txt) && !/llegó tarde/.test(txt) && !/Omeprazol/.test(txt) && !/firma_hash|notas_internas|cedula/.test(txt), "con el plan y sin notas internas, tratamiento ni datos de firma");
  comprobar(mi.cuerpo.consultas[0].diagnostico === "", "el diagnóstico presuntivo no sale: solo el definitivo");
  const otroPerro = await nuevoPerro("Ajeno");
  comprobar(!(await rpc(null, "mi_expediente", { p_perro: perroC })).ok, "la llave anónima no ve el portal");
  await rpc(P.admin, "guardar_veterinaria_portal", { p_expediente: false });

  seccion("5. Catálogo de diagnósticos");
  const total = (await SB.from("vet_diagnosticos").select("id", { count: "exact", head: true })).count;
  comprobar(total >= 150, `el catálogo trae ${total} diagnósticos precargados`);
  await dar(P.admin, P.recSinId, "atender_consultas");
  const bus = async (q, especie = null) => (await rpc(P.recSin, "vet_buscar_diagnosticos", { p_q: q, p_especie: especie, p_limite: 8 })).cuerpo ?? [];
  comprobar((await bus("tos de perrera")).some((d) => /Traqueobronquitis/.test(d.nombre)), "«tos de perrera» encuentra la traqueobronquitis (sinónimo)");
  comprobar((await bus("dermatitis atopica")).some((d) => d.nombre === "Dermatitis atópica"), "busca sin acentos");
  comprobar((await bus("otitis"))[0]?.nombre === "Otitis externa" || (await bus("otitis")).some((d) => /Otitis/.test(d.nombre)), "«otitis» trae las otitis");
  comprobar((await bus("FLUTD", "gato")).some((d) => /tracto urinario inferior/.test(d.nombre)), "las siglas (FLUTD) también");
  comprobar(!(await bus("parvovirosis canina", "gato")).some((d) => d.nombre === "Parvovirosis canina"), "filtra por especie (la parvovirosis canina no sale para gatos)");
  comprobar((await bus("gastroenterit"))[0]?.nombre === "Gastroenteritis aguda", "escribir a medias funciona");
  comprobar((await bus("x")).length === 0, "una sola letra no busca");
  const propio = `Síndrome de prueba ${MARCA}`;
  comprobar((await rpc(P.recSin, "vet_agregar_diagnostico_negocio", { p_nombre: propio, p_categoria: "Otros", p_especies: ["perro"], p_sinonimos: ["sp prueba"] })).ok, "el negocio amplía el catálogo con un diagnóstico propio");
  comprobar((await bus("sp prueba")).some((d) => d.origen === "negocio"), "y lo encuentra por su sinónimo");
  comprobar(!(await rpc(P.recSin, "vet_agregar_diagnostico_negocio", { p_nombre: propio, p_categoria: "Otros", p_especies: ["perro"], p_sinonimos: [] })).ok, "no lo repite");
  comprobar(!(await rpc(P.recSin, "vet_agregar_diagnostico_negocio", { p_nombre: "Otitis externa", p_categoria: "x", p_especies: ["perro"], p_sinonimos: [] })).ok, "ni duplica uno del catálogo general");
  await quitar(P.admin, P.recSinId, "atender_consultas");
  comprobar((await rpc(P.recSin, "vet_buscar_diagnosticos", { p_q: "otitis", p_especie: null, p_limite: 5 })).cuerpo.length === 0, "quien no atiende consultas no busca diagnósticos");
  comprobar(!(await rpc(P.admin, "plataforma_guardar_diagnostico", { p_id: null, p_nombre: "Hackeado", p_categoria: "x", p_especies: ["perro"], p_sinonimos: [] })).ok, "ni el admin de un negocio edita el catálogo general");
  comprobar(!(await rpc(P.admin, "plataforma_baja_diagnostico", { p_id: crypto.randomUUID() })).ok, "ni da de baja");
  comprobar(!(await rpc(P.admin, "plataforma_diagnosticos_de_negocios")).ok, "ni lee los de otros negocios");
  comprobar(!(await rpc(null, "plataforma_guardar_diagnostico", { p_id: null, p_nombre: "Anon", p_categoria: "x", p_especies: ["perro"], p_sinonimos: [] })).ok, "la llave anónima tampoco");
  const insDx = await post(P.admin, "vet_diagnosticos", { nombre: "Directo", categoria: "x" });
  comprobar(!insDx.ok, "y por la API directa nadie escribe en el catálogo general");
  const sinNegocio = await SB.from("vet_diagnosticos_negocio").select("id, negocio_id").eq("nombre", propio);
  comprobar(sinNegocio.data?.length === 1 && sinNegocio.data[0].negocio_id === B, "el diagnóstico propio quedó en SU negocio");

  seccion("6. Resultados de laboratorio y adjuntos");
  await dar(P.admin, P.recSinId, "atender_consultas");
  const param = [
    { nombre: "Hematocrito", valor: "38", unidad: "%", rango: "37 - 55" },
    { nombre: "Leucocitos", valor: "21,5", unidad: "x10³/µL", rango: "6 - 17" },
    { nombre: "Plaquetas", valor: "120", unidad: "x10³/µL", rango: "200 - 500" },
    { nombre: "Observación", valor: "Lipemia leve" },
  ];
  const lab = await rpc(P.recSin, "vet_capturar_resultado", { p_perro: perroC, p_consulta: cId, p_estudio: "Biometría hemática", p_fecha: hoyB, p_laboratorio: "Lab X", p_parametros: param, p_notas: null });
  comprobar(lab.ok, `captura un resultado (${lab.mensaje})`);
  const lr = (await SB.from("vet_resultados_lab").select("parametros").eq("id", lab.cuerpo).single()).data.parametros;
  comprobar(lr[0].bandera === "normal" && lr[1].bandera === "alto" && lr[2].bandera === "bajo" && lr[3].bandera === null, "las banderas salen solas (normal, alto, bajo, sin rango)");
  comprobar(!(await rpc(P.recSin, "vet_capturar_resultado", { p_perro: perroC, p_consulta: null, p_estudio: "x", p_fecha: sumaDias(hoyB, 3), p_laboratorio: null, p_parametros: param, p_notas: null })).ok, "una fecha futura se rechaza");
  comprobar(!(await rpc(P.recSin, "vet_capturar_resultado", { p_perro: perroC, p_consulta: null, p_estudio: "x", p_fecha: hoyB, p_laboratorio: null, p_parametros: [], p_notas: null })).ok, "sin parámetros se rechaza");
  comprobar(!(await rpc(P.recSin, "vet_capturar_resultado", { p_perro: otroPerro, p_consulta: cId, p_estudio: "x", p_fecha: hoyB, p_laboratorio: null, p_parametros: param, p_notas: null })).ok, "la consulta tiene que ser de esa mascota");
  comprobar(!!(await SB.from("vet_resultados_lab").update({ estudio: "cambiado" }).eq("id", lab.cuerpo)).error, "un resultado no se edita");
  comprobar(!(await rpc(P.recSin, "vet_anular_resultado", { p_id: lab.cuerpo, p_motivo: "x" })).ok, "anular pide motivo");
  const labB = await rpc(P.recSin, "vet_capturar_resultado", { p_perro: perroC, p_consulta: null, p_estudio: "Química", p_fecha: hoyB, p_laboratorio: null, p_parametros: [{ nombre: "Glucosa", valor: "90", unidad: "mg/dL", rango: "70-120" }], p_notas: null });
  comprobar((await rpc(P.recSin, "vet_anular_resultado", { p_id: labB.cuerpo, p_motivo: "Capturado en otra mascota" })).ok, "se anula con motivo");
  const rutaOk = `${B}/${perroC}/${MARCA}-estudio.pdf`;
  const reg = (extra = {}) => rpc(P.recSin, "vet_registrar_adjunto", { p_perro: perroC, p_consulta: cId, p_ruta: rutaOk, p_nombre: "estudio.pdf", p_mime: "application/pdf", p_bytes: 20000, p_descripcion: "Radiografía", ...extra });
  const adj = await reg();
  comprobar(adj.ok, `registra un adjunto (${adj.mensaje})`);
  comprobar(!(await reg({ p_ruta: `${LUDOGTEKA}/${perroC}/x.pdf` })).ok, "una ruta de otro negocio se rechaza");
  comprobar(!(await reg({ p_ruta: `${B}/${otroPerro}/x.pdf` })).ok, "una ruta de otra mascota se rechaza");
  comprobar(!(await reg({ p_ruta: `${B}/${perroC}/${MARCA}-2.exe`, p_mime: "application/x-msdownload" })).ok, "un ejecutable se rechaza");
  comprobar(!(await reg({ p_ruta: `${B}/${perroC}/${MARCA}-3.pdf`, p_bytes: 20_000_000 })).ok, "uno de 20 MB se rechaza");
  comprobar(!(await rpc(P.cliente, "vet_registrar_adjunto", { p_perro: perroC, p_consulta: null, p_ruta: `${B}/${perroC}/c.pdf`, p_nombre: "c", p_mime: "application/pdf", p_bytes: 10, p_descripcion: null })).ok, "el cliente no adjunta");
  const leer = await rpc(P.recSin, "vet_adjunto_para_leer", { p_id: adj.cuerpo });
  comprobar(leer.ok && leer.cuerpo.ruta === rutaOk, "se pide la ruta para firmarla (y queda la lectura)");
  comprobar(!(await rpc(P.recSin, "vet_anular_adjunto", { p_id: adj.cuerpo, p_motivo: "ab" })).ok, "anular un adjunto pide motivo");

  seccion("7. Lecturas, línea de tiempo y tablas cerradas");
  await rpc(P.admin, "registrar_vacuna", { p_perro_id: perroC, p_biologico: `Quíntuple ${MARCA}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: "L-1", p_laboratorio: null, p_fecha: hoyB, p_proxima: null, p_medico_id: medA, p_dosis: null, p_notas: null, p_descontar: true });
  const linea = await rpc(P.recSin, "vet_linea_tiempo", { p_perro: perroC });
  const tipos2 = new Set((linea.cuerpo ?? []).map((e) => e.tipo));
  comprobar(linea.ok && ["consulta", "peso", "adjunto", "laboratorio"].every((t) => tipos2.has(t)), `la línea de tiempo junta consultas, pesos, adjuntos y laboratorio (${[...tipos2].join(", ")})`);
  const cuando = (linea.cuerpo ?? []).map((e) => new Date(e.cuando).getTime());
  comprobar(cuando.every((v, i) => i === 0 || cuando[i - 1] >= v), "va de lo más nuevo a lo más viejo");
  comprobar(!(await rpc(P.recCon, "vet_linea_tiempo", { p_perro: crypto.randomUUID() })).ok, "una mascota que no existe se rechaza");
  await quitar(P.admin, P.recSinId, "atender_consultas");
  comprobar(!(await rpc(P.recSin, "vet_linea_tiempo", { p_perro: perroC })).ok, "sin permiso no se ve la línea de tiempo");
  const lect = (await SB.from("vet_lecturas").select("recurso, profile_id").eq("perro_id", perroC)).data;
  comprobar(lect.some((l) => l.recurso === "consulta") && lect.some((l) => l.recurso === "linea_tiempo") && lect.some((l) => l.recurso === "adjunto"), "las lecturas quedan anotadas (consulta, línea de tiempo y adjunto)");
  const n0 = lect.filter((l) => l.recurso === "linea_tiempo").length;
  await dar(P.admin, P.recSinId, "atender_consultas");
  await rpc(P.recSin, "vet_linea_tiempo", { p_perro: perroC });
  await rpc(P.recSin, "vet_linea_tiempo", { p_perro: perroC });
  const n1 = (await SB.from("vet_lecturas").select("id").eq("perro_id", perroC).eq("recurso", "linea_tiempo")).data.length;
  comprobar(n1 - n0 <= 0, "abrir lo mismo dos veces seguidas no llena el registro (una por 5 minutos)");
  await quitar(P.admin, P.recSinId, "atender_consultas");
  const ll = await rpc(P.admin, "vet_lecturas_lista", { p_perro: perroC, p_limite: 50 });
  comprobar(ll.ok && ll.cuerpo.length >= 3 && ll.cuerpo.every((x) => x.persona), "admin ve quién abrió qué y cuándo");
  comprobar(!(await rpc(P.recSin, "vet_lecturas_lista", { p_perro: perroC, p_limite: 50 })).ok, "recepción no ve el registro");
  comprobar(!(await rpc(P.cliente, "vet_lecturas_lista", { p_perro: perroC, p_limite: 50 })).ok, "el cliente tampoco");
  comprobar(!!(await SB.from("vet_lecturas").update({ recurso: "expediente" }).eq("perro_id", perroC)).error, "el registro de lecturas no se edita");
  comprobar(!!(await SB.from("vet_lecturas").delete().eq("perro_id", perroC)).error, "ni se borra");
  for (const t of ["vet_consultas", "vet_consulta_adendas", "vet_resultados_lab", "vet_adjuntos", "vet_lecturas", "vet_citas", "vet_estimados", "vet_estimado_lineas"]) {
    const r = await get(P.admin, `${t}?select=id&limit=3`);
    comprobar(r.ok && Array.isArray(r.cuerpo) && r.cuerpo.length === 0, `la tabla ${t} no se lee directo por la API (ni admin): solo por funciones`);
    comprobar(!(await post(P.admin, t, { negocio_id: B })).ok, `ni se escribe directo en ${t}`);
  }
  comprobar(!(await rpc(P.recCon, "vet_consulta_detalle", { p_id: cId }, LUDOGTEKA)).ok, "con el encabezado de otro negocio nada se abre");

  seccion("8. Aislamiento, módulo apagado y llave anónima");
  const noB = await rpc(P.admin, "vet_agenda", { p_desde: d1, p_hasta: d1, p_medico: null }, LUDOGTEKA);
  comprobar(!noB.ok || (noB.cuerpo ?? []).length === 0, "el admin de Huellitas no ve la agenda de Ludogteka");
  const imp = await rpc(P.admin, "impacto_apagar_modulo", { p_modulo: "veterinaria" });
  comprobar(imp.ok && /cita\(s\) veterinaria/.test(JSON.stringify(imp.cuerpo)), `apagar Veterinaria avisa de las citas por venir (${JSON.stringify(imp.cuerpo).slice(0, 140)})`);
  await fijarModulo("veterinaria", false);
  comprobar(!(await agendar(P.recSin, { p_inicia: a(dia(), "09:00") })).ok, "con el módulo apagado no se agenda");
  comprobar((await rpc(P.recSin, "vet_agenda", { p_desde: d1, p_hasta: d1, p_medico: null })).cuerpo?.length === 0, "ni se ve la agenda");
  comprobar((await acc(P.admin)) === false, "ni la zona abre");
  await fijarModulo("veterinaria", true);
  for (const fn of ["vet_agendar_cita", "vet_consulta_iniciar", "vet_consulta_firmar", "vet_buscar_diagnosticos", "vet_linea_tiempo", "vet_capturar_resultado", "vet_registrar_adjunto", "vet_agenda", "vet_plantillas_consulta", "vet_medicos_lista"]) {
    comprobar(!(await rpc(null, fn, {})).ok, `la llave anónima no ejecuta ${fn}`);
  }
  const medicos = await rpc(P.recSin, "vet_medicos_lista");
  comprobar(medicos.ok && medicos.cuerpo.length >= 2 && medicos.cuerpo.every((m) => m.nombre && m.cedula), "recepción ve a los médicos con su cédula (sin leer profiles)");
  const cl = await rpc(P.cliente, "vet_medicos_lista");
  comprobar((cl.cuerpo ?? []).length === 0, "el cliente no ve la lista de médicos");
} finally {
  // Restaurar: ajustes, permisos y los médicos de prueba.
  await limpiarPermisos();
  if (ajustesGuardados) await SB.from("veterinaria_ajustes").update({ portal_expediente: ajustesGuardados.portal_expediente ?? false }).eq("id", ajustesGuardados.id);
  else await SB.from("veterinaria_ajustes").update({ portal_expediente: false }).eq("negocio_id", B);
  for (const m of medicosCreados) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
}
terminar();
