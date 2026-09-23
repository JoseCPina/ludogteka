// Uso: node scripts/auditoria/dinero-cliente.mjs  (contra DESARROLLO, lee .env.local)
// Sale con código 1 si algún cliente alcanza un monto.
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
    ["movimientos_turno", { p_turno_id: turno?.id }],
    ["resumen_turno", { p_turno_id: turno?.id }],
    ["cobertura_bono_de_item", { p_item_tipo: "estancia", p_item_id: est?.id }],
    ["costo_promedio_base_insumo", { p_insumo_id: insumo?.id, p_hasta: "2026-09-23" }],
    ["existencia_actual_insumo", { p_insumo_id: insumo?.id }],
    ["resolver_precio", { p_servicio_id: tarifa.servicio_id, p_tamano_id: tarifa.tamano_id, p_pelaje_id: null, p_cantidad: 1, p_fecha: "2026-09-23" }],
    ["resolver_tope_descuento_recepcion", {}],
    ["reporte_financiero_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["reporte_costos_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["reporte_margen_por_servicio_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["reporte_operativo_periodo", { p_desde: "2026-01-01", p_hasta: "2027-12-31" }],
    ["reporte_estado_operativo_actual", {}],
    ["listar_cuentas", {}],
    ["mis_visitas", {}],
  ];
  for (const [fn, args] of sondas) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    llamadas++;
    const cuerpo = await r.json().catch(() => null);
    let veredicto = r.ok ? "sin dinero" : `rechazada ${r.status}`;
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
console.log(`\nHALLAZGOS DE DINERO ALCANZABLE: ${hallazgos.length}`);
for (const h of [...new Set(hallazgos)].slice(0, 40)) console.log("  ", h);
if (hallazgos.length) process.exit(1);
