// Uso: node scripts/auditoria/dinero-cliente.mjs  (contra DESARROLLO, lee .env.local)
// Sale con código 1 si algún cliente alcanza un monto, cualquier fila de
// lo que es solo del staff (SOLO_STAFF / RPC_SOLO_STAFF), o si alguien del
// personal sin el permiso de costos alcanza un costo.
// Verificación final: con el JWT real de CADA cliente de desarrollo, tabla
// por tabla y vista por vista de la API REST, ¿alcanza alguna columna de
// dinero con valor? Y las RPC que tocan dinero, con sus propios ids.
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

const DINERO = /precio|monto|costo|total|importe|pagad|saldo|descuento|tarifa|pago|efectivo|retiro|fondo|arqueo|diferencia|ingreso|margen|valor|subtotal|comision|tope|reconoc|adeudo|propina|cobrado/i;
// Columnas cuyo nombre suena a dinero pero no lo son (revisadas a mano).
const NO_ES_DINERO = new Set([
  "servicios.monto_libre", "servicios_cotizables.monto_libre", // sí/no: el importe se captura al aplicar
  "perros.tope_gasto_autorizado", // lo autoriza el propio dueño y va en su contrato: le corresponde
]);

// Del negocio, no del cliente: ningún cliente debe recibir UNA sola fila,
// con o sin columnas de dinero (23 de septiembre de 2026).
const SOLO_STAFF = [
  // Con dinero
  "estancias", "citas_estetica", "cargos_aplicados", "cobros", "cobro_metodos", "bonos_clientes",
  "bonos_clientes_estado", "movimientos_bono", "descuentos_aplicados", "devoluciones",
  "devolucion_metodos", "mp_ordenes", "mp_ordenes_estado", "reservas", "tarifas", "tarifas_dia_semana",
  "tarifas_vigentes", "turnos_caja", "cortes_caja", "corte_metodos", "movimientos_caja",
  "compras_insumos", "insumos", "movimientos_inventario",
  // Catálogos internos y operación de la casa
  "categorias_insumo", "unidades_medida", "catalogo_descuentos", "cupo_configuracion",
  "llegadas_hoy", "quienes_estan_adentro",
  // Permisos del personal: el cliente no tiene ninguno y no ve los de nadie.
  "permisos_staff",
];
// RPC que un cliente con sesión no debe poder llamar (tienen que rechazarlo).
const RPC_SOLO_STAFF = ["calendario_ocupacion"];

const spec = await (await fetch(URL + "/rest/v1/", { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } })).json();
const relaciones = Object.keys(spec.definitions).sort();
const { data: clientes } = await A.from("profiles").select("id, cliente_id").eq("rol", "cliente").not("cliente_id", "is", null);

const hallazgos = [];
let consultas = 0;
const columnasDinero = new Map();
for (const rel of relaciones) {
  const cols = Object.keys(spec.definitions[rel].properties).filter((c) => DINERO.test(c));
  if (cols.length) columnasDinero.set(rel, cols);
}
const alcanzablesPorCliente = new Map(); // rel -> filas totales vistas

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
const { data: staffSinCostos } = await A.from("profiles").select("id, rol, nombre_completo").in("rol", ["recepcion", "estetica"]).is("deleted_at", null);
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

for (const rel of SOLO_STAFF) {
  if (!relaciones.includes(rel)) hallazgos.push(`${rel}: está en SOLO_STAFF pero la API ya no la expone (¿se renombró?)`);
  else if ((alcanzablesPorCliente.get(rel) ?? 0) > 0) hallazgos.push(`${rel}: solo staff, pero algún cliente lee ${alcanzablesPorCliente.get(rel)} filas`);
}
console.log(`\nsolo staff revisadas: ${SOLO_STAFF.length} relaciones y ${RPC_SOLO_STAFF.length} RPC`);
console.log(`\nHALLAZGOS: ${hallazgos.length}`);
for (const h of [...new Set(hallazgos)].slice(0, 40)) console.log("  ", h);
if (hallazgos.length) process.exit(1);
