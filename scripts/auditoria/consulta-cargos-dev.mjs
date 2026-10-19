// Cobro de la consulta veterinaria (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
// Migración 20261027000000.
//
//   node scripts/auditoria/consulta-cargos-dev.mjs
//
// 1. Catálogo base en Servicios y precios (se siembra al prender el módulo).
// 2. La propuesta de cargos: tipo de consulta, vacunas, medicamentos, procedimientos; quién ve, quita y ajusta.
// 3. Firmar pasa los cargos a la cuenta (Caja) y es idempotente.
// 4. Sin precio no se firma: se pone el precio en el momento (con o sin precio de catálogo) o se marca «Sin cobro» con motivo.
// 4b. Una vacuna va al carnet (lote y fecha), no como «otro procedimiento».
// 5. Mascota hospitalizada: los cargos van a la cuenta de la hospitalización.
// 6. Estimado aceptado de la consulta: nada se cobra dos veces.
// 7. Anular: se cancela lo que no tiene cobros.
// 8. Aislamiento, módulo apagado y llave anónima.
import { B, SB, LUDOGTEKA, datos, rpc, get, personas, dar, quitar, fijarModulo, hoy, sumaDias as sumaDiasV, productoClinico, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";

const P = await personas();
const MARCA = `ccg-${String(Date.now()).slice(-6)}`;
const nuevoPerro = async (nombre) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${MARCA}`, especie: "perro" }).select("id").single();
  if (r.error) throw new Error(`perro: ${r.error.message}`);
  return r.data.id;
};
const PERMISOS = ["atender_consultas", "firmar_expediente", "ajustar_cargos_consulta", "hospitalizar", "crear_estimados", "registrar_vacunas"];
const limpiar = async () => { for (const p of PERMISOS) { await quitar(P.admin, P.recConId, p); await quitar(P.admin, P.recSinId, p); } };
const medicosCreados = [];
const precioDe = async (clave, precio) => {
  const s = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", clave).is("deleted_at", null).single()).data;
  await SB.from("tarifas").update({ deleted_at: new Date().toISOString() }).eq("servicio_id", s.id).is("deleted_at", null);
  if (precio != null) {
    const r = await SB.from("tarifas").insert({ negocio_id: B, servicio_id: s.id, precio, no_aplica: false, cantidad_desde: 1, cantidad_hasta: null, vigencia_desde: "2026-01-01" });
    if (r.error) throw new Error(`tarifa ${clave}: ${r.error.message}`);
  }
};
const totales = async (reserva) => {
  const c = (await rpc(P.admin, "cuenta_totales_reserva", { p_reserva_id: reserva })).cuerpo;
  return Array.isArray(c) ? c[0] : c;
};
const lineas = async (token, consulta) => (await rpc(token, "vet_consulta_cargos", { p_consulta: consulta })).cuerpo;
const ajustesGuardados = (await SB.from("veterinaria_ajustes").select("*").eq("negocio_id", B).is("deleted_at", null).maybeSingle())?.data;
const guardarDx = (token, id, extra = {}) =>
  rpc(token, "vet_consulta_guardar", { p_id: id, p_datos: { motivo: "Revisión", diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Otitis", tipo: "presuntivo", nota: "" }], ...extra } });

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  await limpiar();
  const hoyB = await hoy(P.admin);
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
  comprobar(med.ok, `admin designa a la recepcionista como médico (${med.mensaje})`);
  const medico = med.cuerpo;
  medicosCreados.push(medico);

  seccion("1. Catálogo base");
  await rpc(P.admin, "vet_asegurar_servicios");
  const base = (await SB.from("servicios").select("clave, categoria, nombre").eq("negocio_id", B).like("clave", "vet_%").is("deleted_at", null)).data;
  for (const k of ["vet_consulta_general", "vet_consulta_urgencia", "vet_revision_seguimiento", "vet_aplicacion_vacuna"]) {
    comprobar(base.some((s) => s.clave === k && s.categoria === "veterinaria"), `existe «${k}» en la categoría veterinaria`);
  }
  comprobar(!(await rpc(P.recSin, "vet_asegurar_servicios")).cuerpo, "recepción sin permisos no siembra nada (no es un error)");
  await precioDe("vet_consulta_general", 450);
  await precioDe("vet_consulta_urgencia", null);
  await precioDe("vet_aplicacion_vacuna", 120);
  const vacuna = await productoClinico(P.admin, `Vacuna cargo ${MARCA}`);
  await SB.from("insumos").update({ se_vende: true, precio_venta: 100 }).eq("id", vacuna);
  const antibiotico = await productoClinico(P.admin, `Antibiótico ${MARCA}`);
  await SB.from("insumos").update({ se_vende: true, precio_venta: 1000 }).eq("id", antibiotico);
  const { data: um } = await SB.from("insumos").select("unidad_consumo_id, unidad_compra_id").eq("id", antibiotico).single();
  const { data: eqs } = await SB.from("unidades_medida").select("id, equivalencia_en_base").in("id", [um.unidad_consumo_id, um.unidad_compra_id]);
  const eq = (id) => Number(eqs.find((u) => u.id === id).equivalencia_en_base);
  const porMl = Math.round((1000 * eq(um.unidad_consumo_id)) / eq(um.unidad_compra_id) * 100) / 100;

  seccion("2. La propuesta");
  const perro = await nuevoPerro("Cobrin");
  await dar(P.admin, P.recSinId, "atender_consultas");
  const ini = await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: medico });
  comprobar(ini.ok, `abre la consulta (${ini.mensaje})`);
  const c1 = ini.cuerpo;
  for (const [q, t] of [["el cliente", P.cliente], ["la llave anónima", null], ["estética sin permiso", P.estetica]]) {
    comprobar(!(await rpc(t, "vet_consulta_cargos", { p_consulta: c1 })).ok, `${q} no ve los cargos`);
  }
  // Una vacuna aplicada hoy a esta mascota.
  const vac = await rpc(P.admin, "registrar_vacuna", { p_perro_id: perro, p_biologico: `Rabia ${MARCA}`, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: null, p_laboratorio: "Lab", p_fecha: hoyB, p_proxima: null, p_medico_id: medico, p_dosis: "1 mL", p_notas: null, p_descontar: false });
  comprobar(vac.ok, `se registra una vacuna del día (${vac.mensaje})`);
  let d = await lineas(P.recSin, c1);
  const base1 = d.lineas.find((l) => l.origen === "catalogo");
  comprobar(base1 && Number(base1.precio_unitario) === 450 && base1.estado === "propuesto", "la consulta general trae el precio del catálogo ($450)");
  const v1 = d.lineas.find((l) => l.tipo === "vacuna");
  comprobar(v1 && Number(v1.precio_unitario) === 120, "la vacuna aplicada hoy entra con el precio de la aplicación ($120)");
  comprobar((await lineas(P.recSin, c1)).lineas.length === d.lineas.length, "leer otra vez no duplica nada");
  // Procedimiento del catálogo y medicamento del inventario.
  const proc = await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c1, p_tipo: "procedimiento", p_concepto: `Limpieza de oídos ${MARCA}`, p_cantidad: 1, p_precio: 80, p_servicio: null, p_insumo: null });
  comprobar(proc.ok, `quien atiende agrega un procedimiento a mano (${proc.mensaje})`);
  const medic = await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c1, p_tipo: "medicamento", p_concepto: null, p_cantidad: 5, p_precio: null, p_servicio: null, p_insumo: antibiotico });
  comprobar(medic.ok, `agrega un medicamento del inventario (${medic.mensaje})`);
  d = await lineas(P.recSin, c1);
  const lm = d.lineas.find((l) => l.insumo_id === undefined && l.tipo === "medicamento");
  comprobar(lm && Math.abs(Number(lm.precio_unitario) - porMl) < 0.01, `el medicamento toma el precio del inventario por unidad de consumo ($${porMl})`);
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c1, p_tipo: "medicamento", p_concepto: "x", p_cantidad: 0, p_precio: 1, p_servicio: null, p_insumo: null })).ok, "cantidad cero se rechaza");
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c1, p_tipo: "consulta", p_concepto: "x", p_cantidad: 1, p_precio: 1, p_servicio: null, p_insumo: null })).ok, "el tipo de consulta no se agrega a mano");
  // Quitar y ajustar según permisos.
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_quitar", { p_id: base1.id, p_motivo: "cortesía" })).ok, "sin «Quitar o ajustar cargos» no se quita un cargo del catálogo");
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_ajustar", { p_id: base1.id, p_cantidad: 1, p_precio: 300, p_motivo: "descuento" })).ok, "ni se ajusta su precio");
  comprobar((await rpc(P.recSin, "vet_consulta_cargo_quitar", { p_id: proc.cuerpo, p_motivo: "me equivoqué" })).ok, "pero sí quita lo que él mismo agregó a mano");
  await dar(P.admin, P.recSinId, "ajustar_cargos_consulta");
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_quitar", { p_id: base1.id, p_motivo: "" })).ok, "quitar pide motivo");
  const aj = await rpc(P.recSin, "vet_consulta_cargo_ajustar", { p_id: base1.id, p_cantidad: 1, p_precio: 400, p_motivo: "Cliente frecuente" });
  comprobar(aj.ok, `con el permiso ajusta el precio ($400) (${aj.mensaje})`);
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_ajustar", { p_id: base1.id, p_cantidad: 1, p_precio: -5, p_motivo: "x" })).ok, "un precio negativo se rechaza");
  await quitar(P.admin, P.recSinId, "ajustar_cargos_consulta");
  await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: v1.id, p_motivo: "La aplicó otra clínica" });
  d = await lineas(P.recSin, c1);
  comprobar(d.lineas.find((l) => l.id === v1.id).estado === "quitado", "el médico quita la vacuna (lo permite ser médico designado)");
  const restaura = await rpc(P.recCon, "vet_consulta_cargo_restaurar", { p_id: v1.id });
  comprobar(restaura.ok, "y la puede restaurar");
  const esperado = 400 + 120 + 5 * porMl;
  d = await lineas(P.recSin, c1);
  comprobar(Math.abs(Number(d.total) - esperado) < 0.02, `el total del resumen es $${esperado.toFixed(2)} (${d.total})`);

  seccion("3. Firmar pasa los cargos a Caja");
  await guardarDx(P.recSin, c1);
  const firma = await rpc(P.recCon, "vet_consulta_firmar", { p_id: c1 });
  comprobar(firma.ok, `el médico firma (${firma.mensaje})`);
  const cobro = firma.cuerpo?.cobro;
  comprobar(cobro && cobro.reserva_id && cobro.cargos === 3 && Math.abs(Number(cobro.total) - esperado) < 0.02, `la firma crea la cuenta con 3 cargos por $${esperado.toFixed(2)} (${JSON.stringify(cobro)})`);
  const cuenta = cobro?.reserva_id;
  const cargos = (await SB.from("cargos_aplicados").select("precio, descripcion, cancelado, perro_id").eq("reserva_id", cuenta)).data ?? [];
  comprobar(cargos.length === 3 && cargos.every((x) => x.perro_id === perro && !x.cancelado), "los cargos están en la cuenta de la mascota");
  const tot = await totales(cuenta);
  comprobar(Math.abs(Number(tot?.total ?? tot?.total_cuenta ?? 0) - esperado) < 0.02, `Caja ve la cuenta por $${esperado.toFixed(2)} (${JSON.stringify(tot)})`);
  d = await lineas(P.recSin, c1);
  comprobar(d.reserva_id === cuenta && d.lineas.filter((l) => l.estado === "cobrado").length === 3, "la consulta firmada muestra sus 3 líneas como cobradas y la cuenta");
  const mov = (await SB.from("movimientos_inventario").select("cantidad_base").eq("insumo_id", antibiotico).eq("tipo", "salida_consumo")).data ?? [];
  comprobar(mov.length <= 1, "el medicamento a mano descuenta inventario una sola vez como máximo (avisa si no hay existencia)");
  const otra = await rpc(P.recCon, "vet_consulta_cobrar_pendientes", { p_consulta: c1 });
  comprobar(otra.ok && Number(otra.cuerpo.cargos) === 0, "pasar a Caja otra vez no duplica nada");
  comprobar((await SB.from("cargos_aplicados").select("id").eq("reserva_id", cuenta)).data.length === 3, "la cuenta sigue con 3 cargos");
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c1, p_tipo: "procedimiento", p_concepto: "x", p_cantidad: 1, p_precio: 1, p_servicio: null, p_insumo: null })).ok, "una consulta firmada ya no admite cargos");
  comprobar(!(await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: base1.id, p_motivo: "tarde" })).ok, "ni quitar líneas");

  seccion("4. Sin precio: se pide en el momento y sin precio no se firma");
  const perro2 = await nuevoPerro("Sinprecio");
  const c2 = (await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perro2, p_cita: null, p_tipo: "urgencia", p_medico: medico })).cuerpo;
  d = await lineas(P.recSin, c2);
  comprobar(d.sin_precio === 1 && d.lineas[0].precio_unitario === null, "la urgencia sin precio capturado se marca «sin precio»");
  await guardarDx(P.recSin, c2);
  const f2 = await rpc(P.recCon, "vet_consulta_firmar", { p_id: c2 });
  comprobar(!f2.ok && /Falta el precio/.test(f2.mensaje ?? ""), `sin precio la consulta NO se firma y dice cuál falta (${f2.mensaje})`);
  const lineaSin = d.lineas[0].id;
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_precio", { p_id: lineaSin, p_precio: 0, p_guardar_catalogo: false })).ok, "un precio de cero se rechaza (para no cobrar existe «Sin cobro»)");
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_precio", { p_id: lineaSin, p_precio: 700, p_guardar_catalogo: true })).ok, "guardarlo como precio de catálogo exige admin o «Precios y tarifas»");
  comprobar(!(await rpc(P.cliente, "vet_consulta_cargo_precio", { p_id: lineaSin, p_precio: 700, p_guardar_catalogo: false })).ok && !(await rpc(null, "vet_consulta_cargo_precio", { p_id: lineaSin, p_precio: 700, p_guardar_catalogo: false })).ok, "ni el cliente ni la llave anónima ponen precio");
  const pr = await rpc(P.recSin, "vet_consulta_cargo_precio", { p_id: lineaSin, p_precio: 700, p_guardar_catalogo: false });
  comprobar(pr.ok, `quien atiende pone el precio de esta consulta ($700) (${pr.mensaje})`);
  d = await lineas(P.recSin, c2);
  comprobar(d.sin_precio === 0 && Number(d.lineas[0].precio_unitario) === 700, "la línea queda con $700 y ya no hay cargos sin precio");
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_precio", { p_id: lineaSin, p_precio: 800, p_guardar_catalogo: false })).ok, "una línea que ya tiene precio no se vuelve a fijar por aquí");
  const f2b = await rpc(P.recCon, "vet_consulta_firmar", { p_id: c2 });
  comprobar(f2b.ok && f2b.cuerpo.cobro.cargos === 1 && Number(f2b.cuerpo.cobro.total) === 700, `con precio se firma y pasa a Caja $700 (${f2b.mensaje})`);
  const cat0 = (await SB.from("tarifas_vigentes").select("precio").eq("servicio_id", (await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "vet_consulta_urgencia").single()).data.id)).data ?? [];
  comprobar(cat0.length === 0, "usar el precio solo en esta consulta NO toca el catálogo");

  // Guardarlo como precio de catálogo (admin): las próximas consultas ya lo traen.
  const perro2b = await nuevoPerro("Catalogo");
  const c2b = (await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perro2b, p_cita: null, p_tipo: "urgencia", p_medico: medico })).cuerpo;
  d = await lineas(P.recSin, c2b);
  const prc = await rpc(P.admin, "vet_consulta_cargo_precio", { p_id: d.lineas[0].id, p_precio: 900, p_guardar_catalogo: true });
  comprobar(prc.ok, `admin lo guarda además como precio de catálogo (${prc.mensaje})`);
  const perro2c = await nuevoPerro("Catalogo2");
  const c2c = (await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perro2c, p_cita: null, p_tipo: "urgencia", p_medico: medico })).cuerpo;
  d = await lineas(P.recSin, c2c);
  comprobar(d.sin_precio === 0 && Number(d.lineas[0].precio_unitario) === 900, "la siguiente urgencia ya trae $900 del catálogo");
  await precioDe("vet_consulta_urgencia", null);

  // «Sin cobro» con motivo: la única forma de firmar sin precio.
  const perro2d = await nuevoPerro("Cortesia");
  const c2d = (await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perro2d, p_cita: null, p_tipo: "urgencia", p_medico: medico })).cuerpo;
  d = await lineas(P.recSin, c2d);
  await guardarDx(P.recSin, c2d);
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_quitar", { p_id: d.lineas[0].id, p_motivo: "Sin cobro: cortesía" })).ok, "«Sin cobro» lo marca el médico (o quien puede ajustar cargos), no cualquiera");
  comprobar(!(await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: d.lineas[0].id, p_motivo: "" })).ok, "y pide su motivo");
  comprobar((await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: d.lineas[0].id, p_motivo: "Sin cobro: seguimiento incluido" })).ok, "el médico la marca «Sin cobro» con su motivo");
  const f2d = await rpc(P.recCon, "vet_consulta_firmar", { p_id: c2d });
  comprobar(f2d.ok && f2d.cuerpo.cobro.cargos === 0 && !f2d.cuerpo.cobro.reserva_id, `con «Sin cobro» se firma y no se crea cuenta con importes vacíos (${f2d.mensaje})`);

  seccion("4b. Una vacuna va al carnet, no como «otro procedimiento»");
  const perroV = await nuevoPerro("Vacunada");
  const cV = (await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perroV, p_cita: null, p_tipo: "consulta", p_medico: medico })).cuerpo;
  const libre = await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: cV, p_tipo: "procedimiento", p_concepto: "Vacuna antirrábica", p_cantidad: 1, p_precio: 150, p_servicio: null, p_insumo: null });
  comprobar(!libre.ok && /Aplicar vacuna/.test(libre.mensaje ?? ""), `una vacuna escrita como procedimiento se rechaza y manda a «Aplicar vacuna» (${libre.mensaje})`);
  comprobar((await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: cV, p_tipo: "procedimiento", p_concepto: "Prueba rápida de parvovirus", p_cantidad: 1, p_precio: 300, p_servicio: null, p_insumo: null })).ok, "pero una prueba de diagnóstico con ese nombre sí es un procedimiento");
  comprobar((await rpc(P.admin, "vet_es_vacuna", { p_nombre: "Quíntuple canina" })).cuerpo === true && (await rpc(P.admin, "vet_es_vacuna", { p_nombre: "Desparasitación con vacunación" })).cuerpo === false, "el reconocedor entiende «Quíntuple» y no confunde una desparasitación");
  comprobar(!(await rpc(null, "vet_es_vacuna", { p_nombre: "vacuna" })).ok, "la llave anónima no puede preguntar");
  // Un producto clasificado como vacuna, con lote, se registra como vacuna aplicada.
  const prodVac = await productoClinico(P.admin, `Vacuna carnet ${MARCA}`);
  await SB.from("insumos").update({ tipo_clinico: "vacuna", se_vende: true, precio_venta: 100 }).eq("id", prodVac);
  const sinLote = await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: cV, p_tipo: "medicamento", p_concepto: null, p_cantidad: 1, p_precio: null, p_servicio: null, p_insumo: prodVac });
  comprobar(!sinLote.ok && /lote/.test(sinLote.mensaje ?? ""), `sin un lote con existencia no se registra a ciegas (${sinLote.mensaje})`);
  await dar(P.admin, P.recSinId, "registrar_vacunas");
  const loteV = (await rpc(P.admin, "registrar_lote_entrada", { p_insumo_id: prodVac, p_codigo: `VC-${MARCA}`, p_caducidad: sumaDiasV(hoyB, 200), p_cantidad_compra: 1 })).cuerpo;
  const conLote = await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: cV, p_tipo: "medicamento", p_concepto: null, p_cantidad: 1, p_precio: null, p_servicio: null, p_insumo: prodVac });
  comprobar(conLote.ok, `con lote, el producto-vacuna se registra como vacuna aplicada (${conLote.mensaje})`);
  const enCarnet = (await SB.from("carnet_vacunas").select("lote_id, fecha_aplicacion, insumo_id").eq("perro_id", perroV).is("anulada_at", null)).data ?? [];
  comprobar(enCarnet.length === 1 && enCarnet[0].lote_id === loteV && enCarnet[0].fecha_aplicacion === hoyB, "queda en el carnet con su lote y la fecha de hoy");
  d = await lineas(P.recSin, cV);
  comprobar(d.lineas.filter((l) => l.tipo === "vacuna").length === 1 && !d.lineas.some((l) => l.tipo === "medicamento" && l.concepto.includes("Vacuna carnet")), "y en el cobro es UNA línea de vacuna (no un medicamento aparte)");
  await quitar(P.admin, P.recSinId, "registrar_vacunas");
  const otraV = await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: cV, p_tipo: "medicamento", p_concepto: null, p_cantidad: 1, p_precio: null, p_servicio: null, p_insumo: prodVac });
  comprobar(!otraV.ok, "quien no puede registrar vacunas no la mete por esta puerta");

  seccion("5. Mascota hospitalizada");
  const perro3 = await nuevoPerro("Internado");
  await dar(P.admin, P.recSinId, "hospitalizar");
  const hosp = await rpc(P.admin, "hospitalizar_ingresar", { p_perro_id: perro3, p_medico_id: medico, p_motivo: "Deshidratación", p_ubicacion: "Jaula 1", p_deposito: 0, p_precio_dia: 300 });
  comprobar(hosp.ok, `se hospitaliza (${hosp.mensaje})`);
  const reservaHosp = (await SB.from("hospitalizaciones").select("reserva_id").eq("perro_id", perro3).single()).data.reserva_id;
  const c3 = (await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perro3, p_cita: null, p_tipo: "consulta", p_medico: medico })).cuerpo;
  await guardarDx(P.recSin, c3);
  const f3 = await rpc(P.recCon, "vet_consulta_firmar", { p_id: c3 });
  comprobar(f3.ok && f3.cuerpo.cobro.reserva_id === reservaHosp, "la consulta de un hospitalizado se suma a la cuenta de su hospitalización");

  seccion("6. Estimado aceptado de la consulta");
  const perro4 = await nuevoPerro("Cotizado");
  await dar(P.admin, P.recSinId, "crear_estimados");
  const c4 = (await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perro4, p_cita: null, p_tipo: "consulta", p_medico: medico })).cuerpo;
  const est = await rpc(P.recSin, "vet_estimado_guardar", { p_id: null, p_perro: perro4, p_consulta: c4, p_cita: null, p_tipo: "cirugia", p_titulo: `Cirugía ${MARCA}`, p_notas: null, p_vigente_hasta: null, p_medico: null,
    p_lineas: [{ tipo: "procedimiento", descripcion: "Ovariohisterectomía", cantidad: 1, unidad: "pieza", precio_min: 1800, precio_max: 2500 }, { tipo: "insumo", descripcion: "Sutura", cantidad: 2, unidad: "pieza", precio_min: 60, precio_max: 90 }] });
  comprobar(est.ok, `se arma un estimado ligado a la consulta (${est.mensaje})`);
  const acepta = await rpc(P.recSin, "vet_estimado_aceptar_mostrador", { p_id: est.cuerpo, p_nombre: "Rosa Pérez", p_firma: null });
  comprobar(acepta.ok, `el dueño acepta en mostrador (${acepta.mensaje})`);
  const reservaEst = acepta.cuerpo?.reserva_id;
  await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c4, p_tipo: "procedimiento", p_concepto: `Ovariohisterectomía ${MARCA}`, p_cantidad: 1, p_precio: 1800, p_servicio: null, p_insumo: null });
  await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c4, p_tipo: "medicamento", p_concepto: null, p_cantidad: 1, p_precio: null, p_servicio: null, p_insumo: antibiotico });
  d = await lineas(P.recSin, c4);
  const cub = d.lineas.filter((l) => l.estado === "cubierto");
  comprobar(cub.length === 2 && cub.every((l) => l.cubierto_por === "estimado"), "el procedimiento y el medicamento ya van en el estimado: no se vuelven a cobrar");
  const cons = d.lineas.find((l) => l.origen === "catalogo");
  comprobar(cons.estado === "propuesto", "pero la consulta general (no cotizada como tal) sí se cobra");
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargo_restaurar", { p_id: cub[0].id })).ok, "restaurar un cubierto pide el permiso de ajustar");
  await guardarDx(P.recSin, c4);
  const f4 = await rpc(P.recCon, "vet_consulta_firmar", { p_id: c4 });
  comprobar(f4.ok && f4.cuerpo.cobro.reserva_id === reservaEst && f4.cuerpo.cobro.cargos === 1, "al firmar, solo la consulta general se suma a la cuenta del estimado");
  const enCuenta = (await SB.from("cargos_aplicados").select("precio, descripcion").eq("reserva_id", reservaEst).eq("cancelado", false)).data;
  comprobar(enCuenta.length === 3, `la cuenta del estimado tiene 3 cargos (2 del estimado + la consulta), sin duplicados (${enCuenta.length})`);

  seccion("6b. Estimado aceptado DESPUÉS de firmar la consulta");
  const perro5 = await nuevoPerro("Despues");
  const c5 = (await rpc(P.recSin, "vet_consulta_iniciar", { p_perro: perro5, p_cita: null, p_tipo: "consulta", p_medico: medico })).cuerpo;
  await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c5, p_tipo: "procedimiento", p_concepto: `Sutura ${MARCA}`, p_cantidad: 1, p_precio: 1800, p_servicio: null, p_insumo: null });
  await rpc(P.recSin, "vet_consulta_cargo_agregar", { p_consulta: c5, p_tipo: "medicamento", p_concepto: null, p_cantidad: 1, p_precio: null, p_servicio: null, p_insumo: antibiotico });
  await guardarDx(P.recSin, c5);
  const f5 = await rpc(P.recCon, "vet_consulta_firmar", { p_id: c5 });
  comprobar(f5.ok && f5.cuerpo.cobro.cargos === 3, `la consulta firmada manda 3 cargos a Caja: consulta, procedimiento y medicamento (${f5.mensaje ?? f5.cuerpo?.cobro?.cargos})`);
  const reserva5 = f5.cuerpo?.cobro?.reserva_id;
  const vivos = async (r) => (await SB.from("cargos_aplicados").select("precio, cantidad, descripcion").eq("reserva_id", r).eq("cancelado", false)).data ?? [];
  const suma = (filas) => Math.round(filas.reduce((t, c) => t + Number(c.precio) * Number(c.cantidad), 0) * 100) / 100;
  comprobar(suma(await vivos(reserva5)) === Math.round((450 + 1800 + porMl) * 100) / 100, `la cuenta antes del estimado suma consulta + procedimiento + medicamento ($${450 + 1800 + porMl})`);
  const est5 = await rpc(P.recSin, "vet_estimado_guardar", { p_id: null, p_perro: perro5, p_consulta: c5, p_cita: null, p_tipo: "cirugia", p_titulo: `Cirugía tardía ${MARCA}`, p_notas: null, p_vigente_hasta: null, p_medico: null,
    p_lineas: [{ tipo: "procedimiento", descripcion: "Sutura y cirugía", cantidad: 1, unidad: "pieza", precio_min: 2000, precio_max: 2500 }] });
  comprobar(est5.ok, `se arma un estimado de la consulta ya firmada (${est5.mensaje})`);
  const acepta5 = await rpc(P.recSin, "vet_estimado_aceptar_mostrador", { p_id: est5.cuerpo, p_nombre: "Rosa Pérez", p_firma: null });
  comprobar(acepta5.ok && acepta5.cuerpo.reserva_id === reserva5, `el estimado entra a la MISMA cuenta que la consulta (${acepta5.mensaje})`);
  comprobar(acepta5.cuerpo?.compensados === 1 && Number(acepta5.cuerpo?.compensado_total) === 1800, "compensa 1 cargo ($1,800): el procedimiento que el estimado ya cubre");
  const despues5 = await vivos(reserva5);
  comprobar(suma(despues5) === Math.round((450 + porMl + 2000) * 100) / 100, `la cuenta queda en consulta + medicamento + estimado, sin cobrar el procedimiento dos veces ($${450 + porMl + 2000})`);
  const comps = (await SB.from("vet_estimado_compensaciones").select("tipo, concepto, importe, cuenta_con_cobros, motivo").eq("estimado_id", est5.cuerpo).is("deleted_at", null)).data ?? [];
  comprobar(comps.length === 1 && comps[0].tipo === "procedimiento" && Number(comps[0].importe) === 1800 && comps[0].cuenta_con_cobros === false, "queda el registro de lo compensado (qué, cuánto y si la cuenta ya tenía cobros)");
  d = await lineas(P.recSin, c5);
  comprobar(d.lineas.find((l) => l.tipo === "procedimiento")?.estado === "cubierto" && d.lineas.find((l) => l.tipo === "procedimiento")?.cubierto_por === "estimado", "la línea de la consulta pasa a «cubierto por estimado»");
  comprobar(d.lineas.find((l) => l.tipo === "medicamento")?.estado === "cobrado", "lo que el estimado no cotizó (el medicamento) sigue cobrado");
  comprobar(!(await get(P.admin, "vet_estimado_compensaciones?select=id")).ok || (await get(P.admin, "vet_estimado_compensaciones?select=id")).cuerpo.length === 0, "la tabla de compensaciones no se lee directo por la API");
  const anulaAntes = await rpc(P.recCon, "vet_consulta_anular", { p_id: c5, p_motivo: "Prueba de anulación después del estimado" });
  comprobar(anulaAntes.ok, "anular la consulta no toca lo que ya cubrió el estimado");
  const tras = await vivos(reserva5);
  comprobar(tras.some((c) => Number(c.precio) === 2000), "el cargo del estimado sigue en la cuenta");

  seccion("7. Anular");
  const anula = await rpc(P.recCon, "vet_consulta_anular", { p_id: c4, p_motivo: "Se capturó en la mascota equivocada" });
  comprobar(anula.ok, `el médico anula la consulta (${anula.mensaje})`);
  const dsp = await SB.from("cargos_aplicados").select("precio, cancelado").eq("reserva_id", reservaEst);
  comprobar(dsp.data.filter((x) => x.cancelado).length === 1, "se cancela el cargo de la consulta (la cuenta no tenía cobros); los del estimado no se tocan");

  seccion("8. Aislamiento y módulo apagado");
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargos", { p_consulta: c1 }, LUDOGTEKA)).ok, "con el encabezado de otro negocio no se ve nada");
  comprobar(!(await get(P.admin, "vet_consulta_cargos?select=id")).ok || (await get(P.admin, "vet_consulta_cargos?select=id")).cuerpo.length === 0, "la tabla no se lee directo por la API");
  comprobar(!(await get(null, "vet_consulta_cargos?select=id")).ok || (await get(null, "vet_consulta_cargos?select=id")).cuerpo.length === 0, "ni con la llave anónima");
  await fijarModulo("veterinaria", false);
  comprobar(!(await rpc(P.recSin, "vet_consulta_cargos", { p_consulta: c1 })).ok, "con Veterinaria apagada no se abre");
  await fijarModulo("veterinaria", true);
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await limpiar();
  if (ajustesGuardados) await SB.from("veterinaria_ajustes").update({ hospitalizacion_precio_dia: ajustesGuardados.hospitalizacion_precio_dia }).eq("id", ajustesGuardados.id);
  for (const m of medicosCreados) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
  await fijarModulo("veterinaria", true);
  terminar();
}
