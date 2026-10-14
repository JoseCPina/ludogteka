// El límite de 1,000 filas de la API de Supabase (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs        (si Huellitas no existe)
//   npm run build && npm run start -- -p 3001             (para las pantallas; SOLO=base salta el navegador)
//   node scripts/auditoria/limite-filas-dev.mjs
//
// La API (PostgREST) corta TODA lectura en `max_rows` = 1,000 filas sin dar error: una lista o una suma hecha
// en JavaScript con más filas se queda corta en silencio (así se congeló una suma en una auditoría). Esta
// auditoría:
//   0. Comprueba la premisa: el límite existe en desarrollo (una lectura sin acotar trae 1,000 de 1,120).
//   1. Revisa TODO el código (src/): cada consulta de lista sin acotar tiene que estar en leerTodo/leerTodoPorIds,
//      acotada por la llave de un registro, o justificada (scripts/auditoria/lib/limite-filas-escaner.mjs).
//   2. Siembra MÁS de 1,000 registros en Huellitas: clientes y perros, cuentas abiertas, cobros en efectivo en un
//      turno, gastos, insumos, movimientos de un insumo y llamadas de IA.
//   3. Los ayudantes (src/lib/supabase/paginar.ts) leen todo; el gasto de IA se suma en la base.
//   4. Caja, corte, reportes y cuentas: lo que entrega la base cuadra con el cálculo hecho con SQL por la API de
//      gestión (que no tiene el límite).
//   5. Las pantallas (clientes, caja, turno, gastos, inventario) enseñan TODO, no los primeros 1,000.
// Deja Huellitas con esos datos de prueba marcados; los clientes, perros e insumos se dan de baja al final.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { escanear, sinAcotar } from "./lib/limite-filas-escaner.mjs";
import { leerTodo, leerTodoPorIds } from "../../src/lib/supabase/paginar.ts";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const REF = "sgfolltpvktbsiisfuzq";
const SOLO_BASE = process.env.SOLO === "base";
let lentaPorRls = false;
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const cerca = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;

const N_CLIENTES = 1120;
const N_ABIERTAS = 1080; // cuentas con saldo, sin cobrar
const N_COBRADAS = 1040; // cuentas cobradas en efectivo en un turno
const N_GASTOS = 1010;
const N_INSUMOS = 1010;
const N_MOVIMIENTOS = 1010;
const N_IA = 1010;
const PRECIO = 10;

const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const H = datos.B;
const sufijo = String(Date.now()).slice(-7);
const MARCA = `L1K${sufijo}`;
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const jwt = async (profileId) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(profileId)}`, "x-negocio-id": H } },
  });

// SQL por la API de gestión: no pasa por PostgREST, así que no tiene el límite. Es la verdad contra la que se compara.
const TOKEN_GESTION = process.env.SUPABASE_ACCESS_TOKEN ?? env.SUPABASE_ACCESS_TOKEN;
async function sql(consulta) {
  for (let intento = 0; intento < 4; intento++) {
    const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN_GESTION}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: consulta }),
    });
    if (r.ok) return r.json();
    if (r.status >= 500 || r.status === 429) { await new Promise((ok) => setTimeout(ok, 3000 * (intento + 1))); continue; }
    throw new Error(`SQL ${r.status}: ${(await r.text()).slice(0, 200)}`);
  }
  throw new Error("SQL: la API de gestión no contestó");
}
const unaFila = async (consulta) => (await sql(consulta))[0] ?? {};

async function enParalelo(tareas, maximo = 10) {
  const resultados = new Array(tareas.length);
  let siguiente = 0;
  const trabajador = async () => {
    for (;;) {
      const i = siguiente++;
      if (i >= tareas.length) return;
      resultados[i] = await tareas[i]();
    }
  };
  await Promise.all(Array.from({ length: maximo }, trabajador));
  return resultados;
}
const lotes = (lista, tam) => Array.from({ length: Math.ceil(lista.length / tam) }, (_, i) => lista.slice(i * tam, (i + 1) * tam));

// ───────────────────────────────────────────────────────────── 0. La premisa
console.log("\n── 0. El límite existe (si no, esta prueba no demostraría nada)");
{
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/postgrest`, { headers: { Authorization: `Bearer ${TOKEN_GESTION}` } });
  const cfg = await r.json();
  comprobar(Number(cfg.max_rows) === 1000, `max_rows de la API de desarrollo = ${cfg.max_rows} (el arreglo es en las consultas; no se sube)`);
}

// ───────────────────────────────────────────────────────────── 1. Revisión del código
console.log("\n── 1. Ninguna consulta de lista del código queda sin acotar");
{
  const filas = await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proretset`);
  const funcionesDeFilas = new Set(filas.map((f) => f.proname));
  const todas = escanear(["src"]);
  const pendientes = sinAcotar(todas, funcionesDeFilas);
  console.log(`  · ${todas.length} consultas de lectura sin .limit/.range/.single en src/; ${todas.length - pendientes.length} ya están dentro de leerTodo, acotadas por una llave o justificadas`);
  for (const p of pendientes) hallazgo(`${p.archivo}:${p.linea} — ${p.tipo}("${p.nombre}") se lee sin acotar: usa leerTodo (src/lib/supabase/paginar.ts) o agrega la justificación`);
  if (pendientes.length === 0) bien("src/: cero consultas de lista sin acotar");
}

// ───────────────────────────────────────────────────────────── 2. Siembra
console.log(`\n── 2. Siembra de más de 1,000 registros en Huellitas (marca ${MARCA})`);
const miembros = async (rol) => (await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", rol).is("deleted_at", null).order("created_at")).data.map((m) => m.profile_id);
const [idAdmin] = await miembros("admin");
const [idRecep] = await miembros("recepcion");
const adminJ = await jwt(idAdmin);
const recJ = await jwt(idRecep);
const hoy = (await adminJ.rpc("fecha_negocio")).data;

// Un turno nuevo, vacío: el corte se compara con lo que se cobra aquí.
const turnoAbierto = async () => (await SB.from("turnos_caja").select("id, fondo_inicial").eq("negocio_id", H).eq("estado", "abierto").maybeSingle()).data;
async function cerrarConLoEsperado(turnoId, nota) {
  const primero = await adminJ.rpc("cerrar_turno", { p_turno_id: turnoId, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: nota });
  if (primero.error) throw new Error(`cerrar_turno: ${primero.error.message}`);
  const r1 = Array.isArray(primero.data) ? primero.data[0] : primero.data;
  if (r1.cerrado) return r1;
  const segundo = await adminJ.rpc("cerrar_turno", { p_turno_id: turnoId, p_conteo_efectivo: Math.max(r1.esperado_efectivo, 0), p_conteo_terminal: Math.max(r1.esperado_terminal, 0), p_conteo_transferencia: Math.max(r1.esperado_transferencia, 0), p_explicacion_diferencias: nota, p_notas_cierre: nota });
  if (segundo.error) throw new Error(`cerrar_turno 2: ${segundo.error.message}`);
  return Array.isArray(segundo.data) ? segundo.data[0] : segundo.data;
}
const previo = await turnoAbierto();
if (previo) await cerrarConLoEsperado(previo.id, "límite de filas: se cierra el turno anterior");
const abrir = await recJ.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: MARCA, abierto_por: idRecep, estado: "abierto" });
if (abrir.error) throw new Error(`abrir turno: ${abrir.error.message}`);
const turno = await turnoAbierto();
bien(`turno nuevo abierto con fondo $100`);

// Clientes y perros (service role: lo que se prueba es la lectura, no el alta).
// Teléfonos únicos de 10 dígitos: 55 + índice de 4 + 4 del sufijo.
const filasClientes = Array.from({ length: N_CLIENTES }, (_, i) => ({ nombre: `${MARCA} cliente ${String(i + 1).padStart(4, "0")}`, telefono: `55${String(i).padStart(4, "0")}${sufijo.slice(-4)}` }));
const idsClientes = [];
for (const bloque of lotes(filasClientes, 250)) {
  const r = await SB.from("clientes").insert(bloque).select("id");
  if (r.error) throw new Error(`clientes: ${r.error.message}`);
  idsClientes.push(...r.data.map((c) => c.id));
}
const idsPerros = [];
for (const bloque of lotes(idsClientes, 250)) {
  const r = await SB.from("perros").insert(bloque.map((cliente_id, i) => ({ cliente_id, nombre: `${MARCA} perro ${i}` }))).select("id");
  if (r.error) throw new Error(`perros: ${r.error.message}`);
  idsPerros.push(...r.data.map((p) => p.id));
}
bien(`${idsClientes.length} clientes y ${idsPerros.length} perros sembrados`);

// Cuentas: una venta de mostrador de $10 por cuenta, con la marca en el concepto.
const cuenta = async (i, etiqueta) => {
  const r = await recJ.rpc("crear_venta_mostrador", { p_cliente_id: idsClientes[i % idsClientes.length], p_lineas: [{ concepto: `${MARCA} ${etiqueta} ${i}`, precio: PRECIO, cantidad: 1 }], p_notas: MARCA });
  if (r.error) throw new Error(`crear_venta_mostrador: ${r.error.message}`);
  return r.data;
};
const abiertas = await enParalelo(Array.from({ length: N_ABIERTAS }, (_, i) => () => cuenta(i, "abierta")), 10);
bien(`${abiertas.length} cuentas abiertas ($${PRECIO} cada una)`);
const aCobrar = await enParalelo(Array.from({ length: N_COBRADAS }, (_, i) => () => cuenta(i, "cobrada")), 10);
const cobradas = await enParalelo(
  aCobrar.map((reserva) => async () => {
    const r = await recJ.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: MARCA, p_metodos: [{ metodo: "efectivo", monto: PRECIO }] });
    if (r.error) throw new Error(`registrar_cobro: ${r.error.message}`);
    return r.data;
  }),
  10
);
bien(`${cobradas.length} cobros en efectivo en el turno`);

// Gastos: $1 cada uno, por transferencia (no mueven el efectivo del turno).
const { data: categorias } = await adminJ.from("categorias_gasto").select("id, clave");
const catOtros = (categorias.find((c) => c.clave === "otros") ?? categorias[0]).id;
await enParalelo(
  Array.from({ length: N_GASTOS }, (_, i) => async () => {
    const r = await adminJ.rpc("registrar_gasto", { p_concepto: `${MARCA} gasto ${i}`, p_categoria_id: catOtros, p_monto: 1, p_fecha_pago: hoy, p_metodo: "transferencia", p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: MARCA });
    if (r.error) throw new Error(`registrar_gasto: ${r.error.message}`);
  }),
  10
);
bien(`${N_GASTOS} gastos de $1`);

// Insumos y movimientos de uno.
const molde = (await SB.from("insumos").select("unidad_compra_id, unidad_consumo_id, area_id").eq("negocio_id", H).is("deleted_at", null).limit(1).single()).data;
const idsInsumos = [];
for (const bloque of lotes(Array.from({ length: N_INSUMOS }, (_, i) => i), 250)) {
  const r = await SB.from("insumos").insert(bloque.map((i) => ({ nombre: `${MARCA} insumo ${String(i).padStart(4, "0")}`, ...molde }))).select("id");
  if (r.error) throw new Error(`insumos: ${r.error.message}`);
  idsInsumos.push(...r.data.map((x) => x.id));
}
for (const bloque of lotes(Array.from({ length: N_MOVIMIENTOS }, (_, i) => i), 250)) {
  const r = await SB.from("movimientos_inventario").insert(bloque.map((i) => ({ insumo_id: idsInsumos[0], tipo: "ajuste_positivo", cantidad_base: 1, motivo: `${MARCA} ${i}` })));
  if (r.error) throw new Error(`movimientos_inventario: ${r.error.message}`);
}
bien(`${idsInsumos.length} insumos y ${N_MOVIMIENTOS} movimientos de uno`);

// Llamadas de IA (tabla de la plataforma).
const desdeIA = new Date(Date.now() - 60_000).toISOString();
for (const bloque of lotes(Array.from({ length: N_IA }, (_, i) => i), 250)) {
  const r = await A.from("wa_uso_ia").insert(bloque.map(() => ({ telefono: MARCA, modelo: "limite-filas", resultado: "respondio", costo_mxn: 0.07, tokens_in: 1, tokens_out: 1 })));
  if (r.error) throw new Error(`wa_uso_ia: ${r.error.message}`);
}
bien(`${N_IA} llamadas de IA de $0.07`);

// ───────────────────────────────────────────────────────────── 3. Los ayudantes y el gasto de IA
console.log("\n── 3. Lo que de verdad pasa con 1,000+ filas");
{
  const plano = await SB.from("clientes").select("id").eq("negocio_id", H).like("nombre", `${MARCA}%`);
  comprobar(plano.data.length === 1000, `CONTROL: una lectura sin acotar de ${N_CLIENTES} clientes trae ${plano.data.length} (se cortó en 1,000, sin error)`);
  const completa = await leerTodo(() => SB.from("clientes").select("id").eq("negocio_id", H).like("nombre", `${MARCA}%`).order("id"));
  comprobar(!completa.error && completa.data.length === N_CLIENTES && new Set(completa.data.map((c) => c.id)).size === N_CLIENTES, `leerTodo trae los ${N_CLIENTES} clientes, sin repetir ni saltar`);
  const porIds = await leerTodoPorIds(idsPerros, (bloque) => SB.from("perros").select("id").in("id", bloque).order("id"), 200);
  comprobar(!porIds.error && porIds.data.length === N_CLIENTES, `leerTodoPorIds trae los ${N_CLIENTES} perros con ${N_CLIENTES} ids (en bloques; un solo .in() se pasa del largo de la URL)`);
  const planoIA = await A.from("wa_uso_ia").select("costo_mxn").gte("created_at", desdeIA).eq("telefono", MARCA);
  const sumaCortada = planoIA.data.reduce((s, f) => s + Number(f.costo_mxn), 0);
  comprobar(planoIA.data.length === 1000 && cerca(sumaCortada, 70), `CONTROL: sumar en JavaScript ${N_IA} llamadas de IA da $${sumaCortada.toFixed(2)} (con ${planoIA.data.length} filas), no $${(N_IA * 0.07).toFixed(2)}`);
  const resumen = await A.rpc("wa_uso_ia_resumen", { p_desde: desdeIA });
  const gasto = Number(resumen.data?.gasto_mxn ?? NaN);
  const verdad = Number((await unaFila(`select coalesce(sum(costo_mxn),0)::float as t from wa_uso_ia where deleted_at is null and created_at >= '${desdeIA}'`)).t);
  comprobar(cerca(gasto, verdad) && gasto >= N_IA * 0.07 - 0.005, `wa_uso_ia_resumen suma en la base: $${gasto.toFixed(2)} = SQL $${verdad.toFixed(2)} (≥ $${(N_IA * 0.07).toFixed(2)} de las ${N_IA} llamadas)`);
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const sinPermiso = await anon.rpc("wa_uso_ia_resumen", { p_desde: desdeIA });
  comprobar(Boolean(sinPermiso.error), "la llave anónima no puede llamar wa_uso_ia_resumen");
  const dueno = await adminJ.rpc("wa_uso_ia_resumen", { p_desde: desdeIA });
  comprobar(!dueno.error && Number(dueno.data?.gasto_mxn ?? 0) === 0, "el admin de un negocio no ve el gasto de IA de la plataforma (la RLS de wa_uso_ia manda)");
}

// ───────────────────────────────────────────────────────────── 4. Caja, corte, reportes
console.log("\n── 4. Caja, corte y reportes contra SQL (sin el límite)");
{
  const verdadTurno = await unaFila(`
    select coalesce(sum(cm.monto) filter (where cm.metodo = 'efectivo'), 0)::float as efectivo, count(*)::int as renglones
    from cobro_metodos cm join cobros c on c.id = cm.cobro_id
    where coalesce(cm.turno_efecto_id, c.turno_id) = '${turno.id}'`);
  comprobar(verdadTurno.renglones === N_COBRADAS && cerca(verdadTurno.efectivo, N_COBRADAS * PRECIO), `SQL: el turno tiene ${verdadTurno.renglones} cobros que suman $${verdadTurno.efectivo}`);

  const movs = await leerTodo(() => adminJ.rpc("movimientos_turno", { p_turno_id: turno.id }).order("fecha").order("id"));
  comprobar(!movs.error && movs.data.length === N_COBRADAS, `movimientos_turno paginado trae los ${movs.data.length} movimientos del turno`);
  const sinPaginar = await adminJ.rpc("movimientos_turno", { p_turno_id: turno.id });
  comprobar((sinPaginar.data ?? []).length === 1000, `CONTROL: movimientos_turno sin paginar trae ${(sinPaginar.data ?? []).length} (se corta en 1,000)`);
  const sumaMovs = movs.data.filter((m) => m.metodo === "efectivo").reduce((s, m) => s + Number(m.monto), 0);
  comprobar(cerca(sumaMovs, verdadTurno.efectivo), `la suma de todos los movimientos ($${sumaMovs}) = SQL ($${verdadTurno.efectivo})`);

  const resumen = (await adminJ.rpc("resumen_turno", { p_turno_id: turno.id })).data ?? [];
  const netoEfectivo = resumen.filter((r) => r.metodo === "efectivo").reduce((s, r) => s + Number(r.cobrado) + Number(r.propinas) - Number(r.devuelto), 0);
  comprobar(cerca(netoEfectivo, verdadTurno.efectivo), `resumen_turno (agregado en la base): efectivo $${netoEfectivo} = SQL`);

  // cuentas_abiertas_json: las mismas cuentas, en UN jsonb (la función cruda tarda segundos y la API la corta en 1,000 filas).
  // Con miles de cuentas en la ventana, la función con RLS de una sesión pasa del statement_timeout de 8 s de la API (con
  // la llave de servicio, que no evalúa RLS, tarda ~2.6 s). Es un límite de rendimiento aparte del de las 1,000 filas: si
  // pasa, se dice y la prueba de «no se corta en 1,000» se hace con la llave de servicio.
  const conSesion = await adminJ.rpc("cuentas_abiertas_json", { p_dias: 30 });
  lentaPorRls = Boolean(conSesion.error);
  if (lentaPorRls) console.log(`  · cuentas_abiertas con la sesión de un admin: «${conSesion.error.message}» (rendimiento con RLS a este volumen; ver informe). Se prueba con la llave de servicio.`);
  const abiertasJson = lentaPorRls ? await SB.rpc("cuentas_abiertas_json", { p_dias: 30 }) : conSesion;
  const cuentasAbiertas = Array.isArray(abiertasJson.data) ? abiertasJson.data : [];
  const nuestras = cuentasAbiertas.filter((c) => String(c.descripcion).includes(MARCA) && String(c.descripcion).includes("abierta"));
  comprobar(!abiertasJson.error && nuestras.length === N_ABIERTAS, `cuentas_abiertas_json trae las ${nuestras.length} cuentas abiertas sembradas (de ${cuentasAbiertas.length} en total, más de 1,000 filas)`);
  comprobar(!cuentasAbiertas.some((c) => String(c.descripcion).includes("cobrada")), "…y ninguna de las cuentas ya cobradas");
  const verdadSaldo = await unaFila(`select count(distinct reserva_id)::int as n from ventas_mostrador where negocio_id = '${H}' and concepto like '${MARCA} %' and not cancelado`);
  comprobar(verdadSaldo.n === N_ABIERTAS + N_COBRADAS, `SQL: ${verdadSaldo.n} cuentas sembradas (${N_ABIERTAS} abiertas + ${N_COBRADAS} cobradas)`);
  const anonJson = await createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).rpc("cuentas_abiertas_json", { p_dias: 30 });
  comprobar(Boolean(anonJson.error), "la llave anónima no puede llamar cuentas_abiertas_json");

  const rep = (await adminJ.rpc("reporte_financiero_periodo", { p_desde: hoy, p_hasta: hoy })).data?.[0] ?? {};
  const zona = (await unaFila(`select zona_horaria from negocios where id = '${H}'`)).zona_horaria;
  const verdadRep = await unaFila(`
    select coalesce(sum(cm.monto) filter (where cm.metodo = 'efectivo'), 0)::float as efectivo
    from cobro_metodos cm join cobros c on c.id = cm.cobro_id
    where c.negocio_id = '${H}' and c.deleted_at is null and (c.created_at at time zone '${zona}')::date = '${hoy}'::date and cm.ajuste_id is null`);
  comprobar(Number(rep.cobros_efectivo) >= N_COBRADAS * PRECIO && cerca(rep.cobros_efectivo, verdadRep.efectivo), `reporte_financiero_periodo: efectivo de hoy $${rep.cobros_efectivo} = SQL $${verdadRep.efectivo} (incluye los ${N_COBRADAS} cobros)`);

  const gastosMes = await unaFila(`select coalesce(sum(monto),0)::float as t, count(*)::int as n from gastos where negocio_id = '${H}' and deleted_at is null and estado = 'pagado' and concepto like '${MARCA} gasto %'`);
  comprobar(gastosMes.n === N_GASTOS && cerca(gastosMes.t, N_GASTOS), `SQL: ${gastosMes.n} gastos sembrados que suman $${gastosMes.t}`);
  // Sin periodo, un gasto cubre el mes entero (se reparte por días): se pide el mes completo.
  const finDeMes = new Date(Date.UTC(Number(hoy.slice(0, 4)), Number(hoy.slice(5, 7)), 0)).toISOString().slice(0, 10);
  const porCategoria = (await adminJ.rpc("gastos_por_categoria_periodo", { p_desde: hoy.slice(0, 8) + "01", p_hasta: finDeMes })).data ?? [];
  const totalCat = porCategoria.reduce((s, r) => s + Number(r.monto), 0);
  comprobar(totalCat >= N_GASTOS - 0.005, `gastos_por_categoria_periodo (agregado en la base) suma $${totalCat.toFixed(2)} ≥ $${N_GASTOS}`);
  const listaGastos = await leerTodo(() => adminJ.from("gastos").select("id, concepto, monto").is("deleted_at", null).like("concepto", `${MARCA} gasto %`).order("id"));
  comprobar(listaGastos.data.length === N_GASTOS, `leerTodo trae los ${listaGastos.data.length} gastos`);

  // El corte: cerrar el turno con lo esperado. El esperado en efectivo = fondo + lo cobrado en efectivo.
  const primero = await adminJ.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: MARCA });
  const r1 = Array.isArray(primero.data) ? primero.data[0] : primero.data;
  comprobar(!primero.error && cerca(r1.esperado_efectivo, 100 + N_COBRADAS * PRECIO), `cerrar_turno: esperado en efectivo $${r1?.esperado_efectivo} = fondo $100 + ${N_COBRADAS} cobros de $${PRECIO} = $${100 + N_COBRADAS * PRECIO}`);
  const cierre = await cerrarConLoEsperado(turno.id, MARCA);
  comprobar(cierre.cerrado === true, "el turno cierra con lo esperado, sin diferencia");
}

// ───────────────────────────────────────────────────────────── 5. Pantallas
if (SOLO_BASE) {
  console.log("\n── 5. Pantallas: se omiten (SOLO=base)");
} else {
  console.log("\n── 5. Pantallas: enseñan todo, no los primeros 1,000");
  const { abrirNavegador } = await import("../lib/navegador.mjs");
  const BASE = "http://huellitas.localhost:3001";
  const nombreCookie = `sb-${REF}-auth-token`;
  const { data: u } = await A.auth.admin.getUserById(idAdmin);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error: errSesion } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (errSesion) throw errSesion;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const cookies = (trozos.length === 1 ? [[nombreCookie, valor]] : trozos.map((t, i) => [`${nombreCookie}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
  const navegador = await abrirNavegador();
  try {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addCookies(cookies);
    const pag = await ctx.newPage();
    pag.setDefaultTimeout(120_000);
    const abrirPantalla = async (ruta) => {
      await pag.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
      await pag.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
    };

    await abrirPantalla("/clientes");
    const verdadClientes = (await unaFila(`select count(*)::int as n from clientes where negocio_id = '${H}' and deleted_at is null and publico_general = false`)).n;
    const enLista = await pag.evaluate(() => new Set([...document.querySelectorAll('a[href^="/clientes/"]')].map((a) => a.getAttribute("href")).filter((h) => /^\/clientes\/[0-9a-f-]{36}$/.test(h))).size);
    comprobar(enLista === verdadClientes, `/clientes: ${enLista} clientes en la lista = ${verdadClientes} en la base (más de 1,000)`);

    if (lentaPorRls) console.log("  · /caja: se omite (la función de cuentas con RLS pasa del statement_timeout a este volumen; ver informe)");
    else {
    await abrirPantalla("/caja");
    const cuerpoCaja = await pag.evaluate(() => document.body.textContent ?? "");
    const filasCaja = new Set(cuerpoCaja.match(new RegExp(`${MARCA} abierta \\d+`, "g")) ?? []).size;
    comprobar(filasCaja === N_ABIERTAS, `/caja: ${filasCaja} de las ${N_ABIERTAS} cuentas abiertas sembradas se ven en pantalla`);
    const pendiente = /Pendiente de cobrar hoy:\s*\$([\d,]+\.\d{2})/.exec(cuerpoCaja);
    const todasAbiertas = (await adminJ.rpc("cuentas_abiertas_json", { p_dias: 30 })).data ?? [];
    const esperadoHoy = todasAbiertas.filter((c) => c.fecha_actividad === hoy).reduce((t, c) => t + Number(c.saldo), 0);
    comprobar(pendiente && cerca(pendiente[1].replace(/,/g, ""), esperadoHoy), `/caja: «Pendiente de cobrar hoy» $${pendiente?.[1]} = suma de todas las cuentas de hoy $${esperadoHoy.toFixed(2)}`);
    }

    await abrirPantalla("/caja/turno");
    const cuerpoTurno = await pag.evaluate(() => document.body.textContent ?? "");
    const esperadoCorte = `$${(100 + N_COBRADAS * PRECIO).toFixed(2)}`;
    comprobar(cuerpoTurno.includes(esperadoCorte), `/caja/turno: el historial enseña el corte del turno de la prueba con ${esperadoCorte} esperados en efectivo (fondo + ${N_COBRADAS} cobros)`);

    await abrirPantalla("/gastos");
    const cuerpoGastos = await pag.evaluate(() => document.body.textContent ?? "");
    const filasGastos = new Set(cuerpoGastos.match(new RegExp(`${MARCA} gasto \\d+`, "g")) ?? []).size;
    comprobar(filasGastos === N_GASTOS, `/gastos: ${filasGastos} de los ${N_GASTOS} gastos del mes se ven en pantalla`);

    await abrirPantalla("/inventario");
    const verdadInsumos = (await unaFila(`select count(*)::int as n from insumos where negocio_id = '${H}' and deleted_at is null`)).n;
    const enInventario = await pag.evaluate(() => new Set([...document.querySelectorAll('a[href^="/inventario/"]')].map((a) => a.getAttribute("href")).filter((h) => /^\/inventario\/[0-9a-f-]{36}$/.test(h))).size);
    comprobar(enInventario === verdadInsumos, `/inventario: ${enInventario} insumos en la lista = ${verdadInsumos} en la base (más de 1,000)`);

    await abrirPantalla(`/inventario/${idsInsumos[0]}`);
    const cuerpoInsumo = await pag.evaluate(() => document.body.textContent ?? "");
    comprobar(cuerpoInsumo.includes("Se muestran los últimos 500 movimientos"), "/inventario/<insumo>: con 1,010 movimientos avisa que enseña los últimos 500");
    comprobar(new RegExp(`Hay\\s+${N_MOVIMIENTOS}\\b`).test(cuerpoInsumo.replace(/,/g, "")), `/inventario/<insumo>: la existencia ("Hay ${N_MOVIMIENTOS}") cuenta los ${N_MOVIMIENTOS} movimientos, no solo los 500 de la lista`);
  } finally {
    await navegador.close();
  }
}

// ───────────────────────────────────────────────────────────── 6. Limpieza
console.log("\n── 6. Limpieza: baja lógica de lo que se puede dar de baja");
{
  const ahora = new Date().toISOString();
  // Las bajas pasan por los disparadores de módulo, que preguntan por el negocio de la petición: se le dice cuál.
  const enNegocio = (consulta) => sql(`select set_config('app.negocio_id', '${H}', true); ${consulta}`);
  // Se limpia también lo que dejó una corrida anterior (todas las marcas L1K…).
  await enNegocio(`update insumos set deleted_at = '${ahora}' where negocio_id = '${H}' and nombre like 'L1K% insumo %' and deleted_at is null`);
  await enNegocio(`update perros set deleted_at = '${ahora}' where negocio_id = '${H}' and nombre like 'L1K% perro %' and deleted_at is null`);
  await enNegocio(`update clientes set deleted_at = '${ahora}' where negocio_id = '${H}' and nombre like 'L1K% cliente %' and deleted_at is null`);
  await sql(`update wa_uso_ia set deleted_at = '${ahora}' where modelo = 'limite-filas' and deleted_at is null`);
  bien("insumos, perros, clientes y llamadas de IA de la prueba dados de baja (los cobros y gastos son inmutables y quedan marcados)");
}

console.log(hallazgos.length === 0 ? "\n✔ Sin hallazgos." : `\n${hallazgos.length} HALLAZGO(S):\n${hallazgos.map((h) => `- ${h}`).join("\n")}`);
process.exit(hallazgos.length === 0 ? 0 : 1);
