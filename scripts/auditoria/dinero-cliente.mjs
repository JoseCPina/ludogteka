// Uso: node scripts/auditoria/dinero-cliente.mjs  (contra DESARROLLO, lee .env.local)
// Sale con código 1 si algún cliente alcanza un monto, cualquier fila de
// lo que es solo del staff (SOLO_STAFF / RPC_SOLO_STAFF), o si alguien del
// personal sin el permiso de costos alcanza un costo.
// Verificación final: con el JWT real de CADA cliente de desarrollo, tabla
// por tabla y vista por vista de la API REST, ¿alcanza alguna columna de
// dinero con valor? Y las RPC que tocan dinero, con sus propios ids.
import { A, NEGOCIO, URL, env, tokenDe } from "./sesiones-dev.mjs";

const DINERO = /precio|monto|costo|total|importe|pagad|saldo|descuento|tarifa|pago|efectivo|retiro|fondo|arqueo|diferencia|ingreso|margen|valor|subtotal|comision|tope|reconoc|adeudo|propina|cobrado/i;
// Columnas cuyo nombre suena a dinero pero no lo son (revisadas a mano).
const NO_ES_DINERO = new Set([
  "servicios.monto_libre", "servicios_cotizables.monto_libre", // sí/no: el importe se captura al aplicar
  "perros.tope_gasto_autorizado", // lo autoriza el propio dueño y va en su contrato: le corresponde
  // Los precios de los planes de PeluDesk: públicos a propósito (la landing
  // de peludesk.mx los muestra). No son dinero de ningún negocio.
  "planes.precio_mensual", "planes.precio_anual",
]);

// Del negocio, no del cliente: ningún cliente debe recibir UNA sola fila,
// con o sin columnas de dinero (23 de septiembre de 2026).
const SOLO_STAFF = [
  // Con dinero
  "estancias", "citas_estetica", "cargos_aplicados", "cobros", "cobro_metodos", "bonos_clientes",
  "bonos_clientes_estado", "movimientos_bono", "descuentos_aplicados", "devoluciones",
  "devolucion_metodos", "mp_ordenes", "mp_ordenes_estado", "reservas", "tarifas", "tarifas_dia_semana",
  "tarifas_vigentes", "turnos_caja", "cortes_caja", "corte_metodos", "movimientos_caja",
  "compras_insumos", "insumos", "insumos_costos", "movimientos_inventario",
  // Empleados: asistencia, ausencias y nómina (24 de septiembre de 2026)
  "empleados", "empleados_horario", "asistencias", "asistencia_correcciones", "ausencias",
  "vacaciones_movimientos", "esquemas_pago", "comisiones_servicio", "adelantos", "nomina_pagos",
  // Gastos del local (25 de septiembre de 2026)
  "gastos", "categorias_gasto", "gastos_recurrentes",
  // Inventario de equipo y áreas
  "equipos", "equipos_estado", "equipo_eventos", "areas_inventario",
  // Catálogos internos y operación de la casa
  "categorias_insumo", "unidades_medida", "catalogo_descuentos", "cupo_configuracion",
  "llegadas_hoy", "quienes_estan_adentro",
  // Permisos del personal: el cliente no tiene ninguno y no ve los de nadie.
  "permisos_staff",
  // La suscripción del negocio a PeluDesk (28 de septiembre de 2026): solo su admin.
  "suscripciones", "pagos_suscripcion",
  // Lo de Stripe de la plataforma: ni el negocio lo ve.
  "planes_precios_stripe", "eventos_stripe",
  // Integraciones por negocio (28 de septiembre de 2026): con qué cobra,
  // sus intentos de OAuth y su consumo de Google Maps.
  "integraciones_cobro", "integraciones_oauth", "maps_consultas",
  // Reembolsos con el proveedor y venta de mostrador (29 de septiembre de 2026).
  "reembolsos_cobro", "ventas_mostrador",
  // Soporte: tickets y conversaciones con el asistente son del personal.
  "soporte_tickets", "soporte_ticket_mensajes", "soporte_conversaciones", "soporte_mensajes_asistente",
  // Reporte de comportamiento, fotos y videos, galerías y ligas (1 de octubre de 2026).
  "reporte_config", "reporte_secciones", "reporte_opciones", "reportes_guarderia", "reportes_guarderia_versiones",
  "media_perro", "galerias_perro", "galeria_items", "enlaces_cliente",
  // Razas: propuestas de razas nuevas y asignaciones en bloque (3 de octubre de 2026).
  "razas_propuestas", "razas_propuestas_perros", "razas_normalizaciones", "razas_normalizacion_perros",
  // Historial de quién atendió cada cita de estética (5 de octubre de 2026).
  "citas_estetica_asignaciones", "citas_estetica_correcciones",
  // Correcciones de cobros («no recibido») y conciliación con Mercado Pago (5 de octubre de 2026).
  "cobro_correcciones", "conciliacion_terminal",
  // Tarjeta (registro manual): folios, revisión y tope (8 de octubre de 2026).
  "tarjetas_manuales", "tarjetas_manuales_eventos", "tarjeta_manual_ajustes", "cobros_grupo", "cobros_grupo_eventos",
  // Bitácora de precios: confirmar precios calculados (9 de octubre de 2026).
  "tarifas_eventos",
  // Facturación CFDI (14 de octubre de 2026)
  "cfdi_config_negocio", "cfdi_datos_fiscales", "cfdi_clases", "cfdi_insumo_fiscal", "cfdi_servicio_fiscal", "cfdi_facturas", "cfdi_conceptos", "cfdi_factura_cobros", "cfdi_eventos",
];
// RPC que un cliente con sesión no debe poder llamar (tienen que rechazarlo).
const RPC_SOLO_STAFF = ["mi_cobro", "plataforma_cobros", "calendario_ocupacion", "insumos_sin_costo", "asistencia_periodo", "calcular_nomina", "reporte_utilidad_periodo", "cuentas_para_empleado", "gastos_por_atender", "gastos_por_categoria_periodo", "maps_consumo_mes", "plataforma_maps_consumo", "elegir_proveedor_cobro", "reporte_ventas_mostrador_periodo", "cliente_publico_general", "crear_venta_mostrador", "preparar_reembolso", "crear_ticket", "plataforma_tickets", "reporte_guardar", "reporte_asegurar_plantilla", "reporte_registrar_tarjeta", "reporte_crear_enlace", "media_preparar", "media_confirmar", "media_quitar", "galeria_crear", "plataforma_almacenamiento_reportes", "razas_fuera_de_catalogo", "razas_sin_grupo", "razas_asignaciones_recientes", "razas_asignar_texto", "razas_revertir_normalizacion", "razas_proponer", "asignar_grupo_raza", "plataforma_razas_propuestas", "plataforma_resolver_propuesta", "plataforma_agregar_raza", "reasignar_estilista_cita", "ajustes_nomina_interno", "corregir_servicio_cita", "cotizar_correccion_servicio", "cobro_marcar_no_recibido", "conciliacion_sincronizar", "conciliacion_dar_por_revisada", "tarjeta_manual_revisar", "tarjeta_manual_no_recibida", "guardar_tope_tarjeta_manual", "plataforma_tarjetas_manuales_patron", "cotizar_cita_estetica", "confirmar_tarifas_calculadas", "plataforma_revertir_carga_tarifas", "registrar_cobro_grupo", "plataforma_saldos_centavos", "plataforma_corregir_saldos_centavos", "plataforma_revertir_saldos_centavos", "cfdi_preparar_cobros", "cfdi_preparar_global", "cfdi_global_periodos", "cfdi_iniciar_timbrado", "cfdi_descartar", "cfdi_iniciar_cancelacion", "cfdi_guardar_config", "cfdi_guardar_datos_fiscales", "cfdi_guardar_clase", "cfdi_guardar_insumo", "cfdi_guardar_servicio", "cfdi_guardar_enlace", "cfdi_registrar_envio", "cfdi_timbres_mes", "plataforma_cfdi_tope", "plataforma_cfdi_uso"];

const spec = await (await fetch(URL + "/rest/v1/", { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } })).json();
const relaciones = Object.keys(spec.definitions).sort();
const { data: clientes } = await A.from("membresias").select("id:profile_id, cliente_id").eq("negocio_id", NEGOCIO).eq("rol", "cliente").not("cliente_id", "is", null).is("deleted_at", null);

const hallazgos = [];
let consultas = 0;
const columnasDinero = new Map();
for (const rel of relaciones) {
  const cols = Object.keys(spec.definitions[rel].properties).filter((c) => DINERO.test(c));
  if (cols.length) columnasDinero.set(rel, cols);
}
const alcanzablesPorCliente = new Map(); // rel -> filas totales vistas

const { data: empleadoFila } = await A.from("empleados").select("id").is("deleted_at", null).limit(1).maybeSingle();
const empleadoCualquiera = empleadoFila?.id ?? null;
for (const cli of clientes) {
  const token = await tokenDe(cli.id);
  for (const rel of relaciones) {
    const r = await fetch(`${URL}/rest/v1/${rel}?select=*&limit=500`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` } });
    consultas++;
    const filas = await r.json().catch(() => null);
    if (!Array.isArray(filas)) continue;
    alcanzablesPorCliente.set(rel, (alcanzablesPorCliente.get(rel) ?? 0) + filas.length);
    for (const col of columnasDinero.get(rel) ?? []) {
      if (NO_ES_DINERO.has(`${rel}.${col}`)) continue;
      const conValor = filas.filter((f) => f[col] !== null && f[col] !== undefined).length;
      if (conValor) hallazgos.push(`${rel}.${col}: ${conValor} filas con valor (cliente ${cli.cliente_id.slice(0, 8)})`);
    }
  }
}

// RPC con dinero, con los ids propios de cada cliente.
const { data: turno } = await A.from("turnos_caja").select("id").limit(1).maybeSingle();
const { data: tarifa } = await A.from("tarifas").select("servicio_id, tamano_id").is("deleted_at", null).limit(1).single();
const { data: insumo } = await A.from("insumos").select("id").limit(1).maybeSingle();
// Sin datos reales, un uuid cualquiera: con un id vacío PostgREST responde
// 404 (firma no encontrada) y la función ni se llega a llamar.
const ID_VACIO = "00000000-0000-0000-0000-000000000001";
const rpcDinero = new Map();
let llamadas = 0;
for (const cli of clientes) {
  const token = await tokenDe(cli.id);
  const { data: reservas } = await A.from("reservas").select("id").eq("cliente_id", cli.cliente_id).limit(3);
  const { data: perros } = await A.from("perros").select("id").eq("cliente_id", cli.cliente_id);
  const ids = (perros ?? []).map((p) => p.id);
  const { data: est } = ids.length ? await A.from("estancias").select("id").in("perro_id", ids).limit(1).maybeSingle() : { data: null };
  const sondas = [
    ...(reservas ?? []).flatMap((r) => [["cuenta_lineas_reserva", { p_reserva_id: r.id }], ["cuenta_totales_reserva", { p_reserva_id: r.id }]]),
    ["cuentas_abiertas", { p_dias: 400 }],
    ["movimientos_turno", { p_turno_id: turno?.id ?? ID_VACIO }],
    ["resumen_turno", { p_turno_id: turno?.id ?? ID_VACIO }],
    ["cobertura_bono_de_item", { p_item_tipo: "estancia", p_item_id: est?.id ?? ID_VACIO }],
    ["costo_promedio_base_insumo", { p_insumo_id: insumo?.id ?? ID_VACIO, p_hasta: "2026-09-23" }],
    ["existencia_actual_insumo", { p_insumo_id: insumo?.id ?? ID_VACIO }],
    ["resolver_precio", { p_servicio_id: tarifa.servicio_id, p_tamano_id: tarifa.tamano_id, p_pelaje_id: null, p_cantidad: 1, p_fecha: "2026-09-23" }],
    ["resolver_tope_descuento_recepcion", {}],
    ["reporte_financiero_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["reporte_costos_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["reporte_margen_por_servicio_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["reporte_operativo_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["reporte_estado_operativo_actual", {}],
    ["listar_cuentas", {}],
    ["mis_visitas", {}],
    ["calendario_ocupacion", { p_desde: "2026-09-01", p_hasta: "2026-09-30" }],
    ["insumos_sin_costo", {}],
    ["asistencia_periodo", { p_desde: "2026-09-01", p_hasta: "2026-09-30" }],
    ["calcular_nomina", { p_empleado_id: empleadoCualquiera ?? ID_VACIO, p_desde: "2026-09-01", p_hasta: "2026-09-15" }],
    ["reporte_utilidad_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["cuentas_para_empleado", {}],
    ["saldo_vacaciones", { p_empleado_id: empleadoCualquiera ?? ID_VACIO }],
    ["gastos_por_atender", {}],
    ["gastos_por_categoria_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["mi_cobro", {}],
    ["plataforma_cobros", {}],
    ["estado_cobro", {}],
    ["reporte_ventas_mostrador_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["cliente_publico_general", {}],
    ["crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ concepto: "x", precio: 1, cantidad: 1 }], p_notas: null }],
    ["preparar_reembolso", { p_cobro_id: ID_VACIO, p_monto: 1, p_motivo: "x" }],
    ["crear_ticket", { p_asunto: "x", p_descripcion: "y", p_pantalla: null, p_navegador: null, p_conversacion_id: null, p_sin_documentar: false }],
    ["plataforma_tickets", { p_estado: null }],
    ["reembolsos_por_atender", {}],
    ["mis_tickets_con_respuesta", {}],
    // Reasignar la estilista y su historial: el cliente ni llama ni ve nada.
    ["reasignar_estilista_cita", { p_cita_id: ID_VACIO, p_empleado_id: null, p_motivo: null }],
    ["ajustes_nomina_interno", { p_empleado_id: ID_VACIO, p_hasta: "2026-12-31", p_cita_id: null }],
    ["historial_asignaciones_cita", { p_cita_id: ID_VACIO }],
    ["estilistas_asignables", {}],
    // Corregir el servicio de una cita: precios y cuentas, solo del personal con el permiso.
    ["corregir_servicio_cita", { p_cita_id: ID_VACIO, p_servicio_id: ID_VACIO, p_motivo: "x" }],
    ["cotizar_correccion_servicio", { p_cita_id: ID_VACIO, p_servicio_id: ID_VACIO }],
    // Lecturas del personal: a un cliente le responden VACÍO (filtran por is_staff), nunca con dinero.
    ["ordenes_abiertas_de_reservas", { p_reservas: [ID_VACIO] }],
    ["ajustes_servicio_por_atender", {}],
    ["historial_correcciones_servicio_cita", { p_cita_id: ID_VACIO }],
    // Cobros con terminal verificados: marcar como no recibido y conciliar son del servidor / del admin.
    ["cobro_marcar_no_recibido", { p_cobro_id: ID_VACIO, p_motivo: "x", p_actor: ID_VACIO, p_evidencia: {} }],
    ["conciliacion_sincronizar", { p_hallazgos: [], p_desde: "2026-01-01T00:00:00Z", p_hasta: "2026-01-02T00:00:00Z" }],
    ["conciliacion_dar_por_revisada", { p_id: ID_VACIO, p_nota: "revisada" }],
    ["terminal_manual_bloqueada", {}],
    // Tarjeta (registro manual): la revisión, el tope y el patrón son del admin / la plataforma.
    ["tarjeta_manual_revisar", { p_tarjeta_id: ID_VACIO, p_nota: "x" }],
    ["tarjeta_manual_no_recibida", { p_tarjeta_id: ID_VACIO, p_motivo: "no llegó nunca" }],
    ["guardar_tope_tarjeta_manual", { p_tope: 100 }],
    ["plataforma_tarjetas_manuales_patron", {}],
    // A un cliente le responden VACÍO / sin visible: filtran por admin.
    ["tarjetas_manuales_por_revisar", { p_historial: true }],
    ["tarjetas_manuales_atencion", {}],
    ["tarjeta_manual_tope", {}],
    // Precio de estética: cotizar es del personal; confirmar y revertir precios, de admin / plataforma.
    ["cotizar_cita_estetica", { p_perro_id: ID_VACIO, p_servicio_id: ID_VACIO }],
    ["confirmar_tarifas_calculadas", { p_grupo_id: ID_VACIO }],
    ["plataforma_revertir_carga_tarifas", { p_evento_id: ID_VACIO }],
    // Cobro agrupado: cobrar y la corrección de centavos son del personal / la plataforma; el detalle le responde VACÍO a un cliente.
    ["registrar_cobro_grupo", { p_partes: [], p_notas: "x", p_metodos: [] }],
    ["plataforma_saldos_centavos", { p_negocio_id: ID_VACIO }],
    ["plataforma_corregir_saldos_centavos", { p_negocio_id: ID_VACIO, p_reservas: [], p_motivo: "prueba" }],
    ["plataforma_revertir_saldos_centavos", { p_evento_id: ID_VACIO }],
    ["cobro_grupo_detalle", { p_grupo_id: ID_VACIO }],
    ["cobro_grupos_de_reserva", { p_reserva_id: ID_VACIO }],
    ["cfdi_preparar_cobros", { p_cobro_ids: [ID_VACIO], p_receptor: null, p_sustituye: null }],
    ["cfdi_preparar_global", { p_desde: "2026-01-01", p_hasta: "2026-01-31" }],
    ["cfdi_global_periodos", {}],
    ["cfdi_iniciar_timbrado", { p_factura_id: ID_VACIO }],
    ["cfdi_descartar", { p_factura_id: ID_VACIO }],
    ["cfdi_iniciar_cancelacion", { p_factura_id: ID_VACIO, p_motivo: "02", p_sustituta: null }],
    ["cfdi_guardar_config", { p: {} }],
    ["cfdi_guardar_datos_fiscales", { p_cliente_id: ID_VACIO, p: {} }],
    ["cfdi_guardar_clase", { p_clase: "estetica", p_tratamiento: "tasa", p_tasa: 0.16, p_clave_prod_serv: "", p_clave_unidad: "", p_unidad: "" }],
    ["cfdi_guardar_insumo", { p_insumo_id: ID_VACIO, p_de_patente: true, p_clase: "otro_producto" }],
    ["cfdi_guardar_servicio", { p_servicio_id: ID_VACIO, p_clase: null }],
    ["cfdi_guardar_enlace", { p_factura_id: ID_VACIO, p_hash: "0".repeat(64), p_dias: 30 }],
    ["cfdi_registrar_envio", { p_factura_id: ID_VACIO, p_canal: "correo" }],
    ["cfdi_timbres_mes", {}],
    ["plataforma_cfdi_tope", { p_negocio_id: ID_VACIO, p_tope: 1, p_aviso_pct: 80, p_motivo: "prueba" }],
    ["plataforma_cfdi_uso", {}],
  ];
  for (const [fn, args] of sondas) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    llamadas++;
    const cuerpo = await r.json().catch(() => null);
    let veredicto = r.ok ? "sin dinero" : `rechazada ${r.status}`;
    if (r.status === 404) {
      veredicto = "NO SE PROBÓ (404)";
      hallazgos.push(`rpc ${fn}: respondió 404, la llamada no llegó a la función (revisa los parámetros del script)`);
    }
    if (r.ok && RPC_SOLO_STAFF.includes(fn)) {
      veredicto = "RESPONDE A UN CLIENTE";
      hallazgos.push(`rpc ${fn}: solo staff, pero le respondió al cliente ${cli.cliente_id.slice(0, 8)}`);
    }
    if (r.ok) {
      const claves = new Set();
      const ver = (x) => { if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) { if (DINERO.test(k) && v !== null && Number(v) !== 0) claves.add(`${k}=${v}`); ver(v); } };
      ver(cuerpo);
      if (claves.size) { veredicto = "DINERO"; hallazgos.push(`rpc ${fn}: ${[...claves].slice(0, 3).join(",")} (cliente ${cli.cliente_id.slice(0, 8)})`); }
      if (fn === "costo_promedio_base_insumo" && typeof cuerpo === "number" && cuerpo !== 0) { veredicto = "DINERO"; hallazgos.push(`rpc ${fn}: ${cuerpo} (cliente ${cli.cliente_id.slice(0, 8)})`); }
    }
    const prev = rpcDinero.get(fn) ?? {};
    prev[veredicto] = (prev[veredicto] ?? 0) + 1;
    rpcDinero.set(fn, prev);
  }
}

console.log(`clientes con JWT real: ${clientes.length}`);
console.log(`relaciones REST: ${relaciones.length} (con columnas de nombre de dinero: ${columnasDinero.size})`);
console.log(`consultas REST hechas: ${consultas} | llamadas RPC: ${llamadas}`);
console.log("\nrelaciones que algún cliente todavía lee (filas vistas en total):");
console.log([...alcanzablesPorCliente].filter(([, n]) => n > 0).map(([r, n]) => `${r}(${n})${columnasDinero.has(r) ? "*" : ""}`).join(", "));
console.log("\nRPC:");
for (const [fn, v] of rpcDinero) console.log(" ", fn.padEnd(36), JSON.stringify(v));
// ── Personal sin el permiso de costos (24 de septiembre de 2026) ──────
// Recepción sin «Costos y compras de inventario» y estética no alcanzan
// ningún costo: ni las compras, ni el costo promedio de un insumo, ni los
// reportes de costos y margen (salvo que tengan «Reportes financieros»).
// Control positivo: tiene que haber compras con costo en la base; si no,
// la prueba no demostraría nada.
const { count: comprasTotales } = await A.from("compras_insumos").select("id", { count: "exact", head: true });
if (!comprasTotales) hallazgos.push("costos: no hay ninguna compra de insumos en desarrollo; corre scripts/auditoria/permisos-staff.mjs (crea una) y repite");
const { data: insumosIds } = await A.from("insumos").select("id").limit(20);
const { data: staffSinCostos } = await A.from("membresias").select("id:profile_id, rol").eq("negocio_id", NEGOCIO).in("rol", ["recepcion", "estetica"]).is("deleted_at", null);
const { data: permisosVigentes } = await A.from("permisos_staff").select("profile_id, permiso").is("revocado_at", null).is("deleted_at", null);
const permisosDe = (id) => new Set((permisosVigentes ?? []).filter((x) => x.profile_id === id).map((x) => x.permiso));
let staffRevisado = 0;
for (const persona of staffSinCostos ?? []) {
  const suyos = permisosDe(persona.id);
  if (persona.rol === "recepcion" && suyos.has("inventario_costos")) continue;
  staffRevisado++;
  const token = await tokenDe(persona.id);
  const h = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const quien = `${persona.rol} ${persona.nombre_completo ?? persona.id.slice(0, 8)}`;
  const compras = await (await fetch(`${URL}/rest/v1/compras_insumos?select=*`, { headers: h })).json();
  if (!Array.isArray(compras) || compras.length > 0) hallazgos.push(`costos: ${quien} lee ${Array.isArray(compras) ? compras.length : "?"} compras sin el permiso`);
  const referencias = await (await fetch(`${URL}/rest/v1/insumos_costos?select=*`, { headers: h })).json();
  if (!Array.isArray(referencias) || referencias.length > 0) hallazgos.push(`costos: ${quien} lee ${Array.isArray(referencias) ? referencias.length : "?"} costos de referencia sin el permiso`);
  const sinCosto = await fetch(`${URL}/rest/v1/rpc/insumos_sin_costo`, { method: "POST", headers: h, body: "{}" });
  if (sinCosto.ok) hallazgos.push(`costos: ${quien} ve la lista de consumibles sin costo sin el permiso`);
  for (const ins of insumosIds ?? []) {
    const r = await fetch(`${URL}/rest/v1/rpc/costo_promedio_base_insumo`, { method: "POST", headers: h, body: JSON.stringify({ p_insumo_id: ins.id }) });
    const v = await r.json().catch(() => null);
    if (r.ok && v !== null) hallazgos.push(`costos: ${quien} obtiene el costo promedio de un insumo (${v}) sin el permiso`);
  }
  if (!suyos.has("reportes_financieros")) {
    for (const fn of ["reporte_costos_periodo", "reporte_margen_por_servicio_periodo"]) {
      const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify({ p_desde: "2026-01-01", p_hasta: "2027-12-31" }) });
      if (r.ok) hallazgos.push(`costos: ${quien} puede llamar ${fn} sin permiso`);
    }
  }
}
console.log(`\npersonal sin permiso de costos revisado: ${staffRevisado} (compras con costo en la base: ${comprasTotales ?? 0})`);

// ── Personal sin el permiso de nómina (24 de septiembre de 2026) ──────
// Recepción sin «Nómina» (aunque tenga «Costos y compras de inventario») y
// estética no alcanzan sueldos, comisiones ni pagos de nadie más: solo los
// suyos si son empleados. Control positivo: tiene que haber pagos de
// nómina en la base; si no, esto no demostraría nada.
const { data: pagosNomina } = await A.from("nomina_pagos").select("id, empleado_id");
const { count: esquemasTotales } = await A.from("esquemas_pago").select("id", { count: "exact", head: true });
if (!pagosNomina?.length || !esquemasTotales) hallazgos.push("nómina: no hay pagos ni esquemas en desarrollo; corre scripts/auditoria/empleados.mjs (los crea) y repite");
const { data: empleadosCuenta } = await A.from("empleados").select("id, profile_id").is("deleted_at", null).not("profile_id", "is", null);
const empleadoDe = new Map((empleadosCuenta ?? []).map((e) => [e.profile_id, e.id]));
let staffSinNomina = 0;
for (const persona of staffSinCostos ?? []) {
  if (persona.rol === "recepcion" && permisosDe(persona.id).has("nomina")) continue;
  staffSinNomina++;
  const token = await tokenDe(persona.id);
  const h = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const quien = `${persona.rol} ${persona.nombre_completo ?? persona.id.slice(0, 8)}`;
  const propio = empleadoDe.get(persona.id) ?? null;
  for (const t of ["esquemas_pago", "comisiones_servicio"]) {
    const filas = await (await fetch(`${URL}/rest/v1/${t}?select=id`, { headers: h })).json();
    if (!Array.isArray(filas) || filas.length > 0) hallazgos.push(`nómina: ${quien} lee ${Array.isArray(filas) ? filas.length : "?"} filas de ${t} sin el permiso`);
  }
  for (const t of ["nomina_pagos", "adelantos", "vacaciones_movimientos"]) {
    const filas = await (await fetch(`${URL}/rest/v1/${t}?select=empleado_id`, { headers: h })).json();
    const ajenas = Array.isArray(filas) ? filas.filter((f) => f.empleado_id !== propio).length : "?";
    if (ajenas !== 0) hallazgos.push(`nómina: ${quien} lee ${ajenas} filas AJENAS de ${t}`);
  }
  for (const [fn, args] of [
    ["calcular_nomina", { p_empleado_id: pagosNomina?.[0]?.empleado_id ?? ID_VACIO, p_desde: "2026-09-01", p_hasta: "2026-09-15" }],
    ["registrar_pago_nomina", { p_empleado_id: pagosNomina?.[0]?.empleado_id ?? ID_VACIO, p_desde: "2020-01-01", p_hasta: "2020-01-01", p_metodo: "efectivo", p_fecha_pago: "2020-01-01", p_notas: null }],
    ["registrar_adelanto", { p_empleado_id: pagosNomina?.[0]?.empleado_id ?? ID_VACIO, p_monto: 1, p_fecha: "2020-01-01", p_metodo: "efectivo", p_motivo: null }],
    ["cuentas_para_empleado", {}],
  ]) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(args) });
    if (r.ok) hallazgos.push(`nómina: ${quien} puede llamar ${fn} sin el permiso`);
    if (r.status === 404) hallazgos.push(`nómina: ${fn} respondió 404 (revisa los parámetros del script)`);
  }
  if (!permisosDe(persona.id).has("reportes_financieros")) {
    const r = await fetch(`${URL}/rest/v1/rpc/reporte_utilidad_periodo`, { method: "POST", headers: h, body: JSON.stringify({ p_desde: "2026-01-01", p_hasta: "2027-12-31" }) });
    if (r.ok) hallazgos.push(`nómina: ${quien} ve la utilidad (con la nómina) sin «Reportes financieros»`);
  }
}
console.log(`personal sin permiso de nómina revisado: ${staffSinNomina} (pagos de nómina en la base: ${pagosNomina?.length ?? 0})`);

// ── Personal sin el permiso de gastos (25 de septiembre de 2026) ──────
// Recepción sin «Gastos» (aunque tenga «Costos de inventario» o «Nómina») y
// estética no leen gastos, categorías ni recurrentes, ni registran nada.
// Control positivo: tiene que haber gastos en la base.
const { count: gastosTotales } = await A.from("gastos").select("id", { count: "exact", head: true });
if (!gastosTotales) hallazgos.push("gastos: no hay gastos en desarrollo; corre scripts/auditoria/gastos.mjs (los crea) y repite");
const { data: unGasto } = await A.from("gastos").select("id").limit(1).maybeSingle();
let staffSinGastos = 0;
for (const persona of staffSinCostos ?? []) {
  if (persona.rol === "recepcion" && permisosDe(persona.id).has("gastos")) continue;
  staffSinGastos++;
  const token = await tokenDe(persona.id);
  const h = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const quien = `${persona.rol} ${persona.nombre_completo ?? persona.id.slice(0, 8)}`;
  for (const t of ["gastos", "categorias_gasto", "gastos_recurrentes"]) {
    const filas = await (await fetch(`${URL}/rest/v1/${t}?select=id`, { headers: h })).json();
    if (!Array.isArray(filas) || filas.length > 0) hallazgos.push(`gastos: ${quien} lee ${Array.isArray(filas) ? filas.length : "?"} filas de ${t} sin el permiso`);
  }
  for (const [fn, args] of [
    ["gastos_por_atender", {}],
    ["registrar_gasto", { p_concepto: "x", p_categoria_id: ID_VACIO, p_monto: 1, p_fecha_pago: "2020-01-01", p_metodo: "otro", p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: null }],
    ["cancelar_gasto", { p_gasto_id: unGasto?.id ?? ID_VACIO, p_motivo: "x" }],
    ["corregir_gasto", { p_gasto_id: unGasto?.id ?? ID_VACIO, p_monto_correcto: 1, p_motivo: "x" }],
  ]) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: h, body: JSON.stringify(args) });
    if (r.ok) hallazgos.push(`gastos: ${quien} puede llamar ${fn} sin el permiso`);
    if (r.status === 404) hallazgos.push(`gastos: ${fn} respondió 404 (revisa los parámetros del script)`);
  }
  if (!permisosDe(persona.id).has("reportes_financieros")) {
    const r = await fetch(`${URL}/rest/v1/rpc/gastos_por_categoria_periodo`, { method: "POST", headers: h, body: JSON.stringify({ p_desde: "2026-01-01", p_hasta: "2027-12-31" }) });
    if (r.ok) hallazgos.push(`gastos: ${quien} ve los gastos por categoría sin «Gastos» ni «Reportes financieros»`);
  }
}
console.log(`personal sin permiso de gastos revisado: ${staffSinGastos} (gastos en la base: ${gastosTotales ?? 0})`);

for (const rel of SOLO_STAFF) {
  if (!relaciones.includes(rel)) hallazgos.push(`${rel}: está en SOLO_STAFF pero la API ya no la expone (¿se renombró?)`);
  else if ((alcanzablesPorCliente.get(rel) ?? 0) > 0) hallazgos.push(`${rel}: solo staff, pero algún cliente lee ${alcanzablesPorCliente.get(rel)} filas`);
}
console.log(`\nsolo staff revisadas: ${SOLO_STAFF.length} relaciones y ${RPC_SOLO_STAFF.length} RPC`);
console.log(`\nHALLAZGOS: ${hallazgos.length}`);
for (const h of [...new Set(hallazgos)].slice(0, 40)) console.log("  ", h);
if (hallazgos.length) process.exit(1);
