// Uso (SOLO DESARROLLO), con la app compilada y prendida (npm run build && npm run start -- -p 3001):
//
//   node scripts/auditoria/reportes-desglose-dev.mjs          (SOLO=base salta Excel y pantalla)
//
// Cada cifra de /reportes se puede tocar y abre las operaciones que la forman. Esta auditoría, en Huellitas
// (negocio de prueba en America/Tijuana; nunca Ludogteka), comprueba que CADA desglose suma EXACTO lo que dice
// su tarjeta:
//   1. Siembra ventas de mostrador con cobros en cada método, propina, devolución, retiro y efectivo agregado.
//   2. Para dos periodos (todo y solo hoy) compara cada tarjeta contra el total de su desglose: cobros, propinas
//      y devoluciones por método, retiros, efectivo agregado, bonos, descuentos, las cuatro cifras de ventas de
//      mostrador, el ingreso de estética (y por servicio) y las cinco cifras de operación.
//   3. Paginado: la suma de todas las páginas = el total, sin filas repetidas ni perdidas; orden y búsqueda.
//   4. Permisos: recepción sin «Reportes financieros» y la llave anónima no ven nada.
//   5. Excel: el archivo trae todas las filas y el mismo total.
//   6. Pantalla a 390 y 1280 px: se toca la tarjeta, el pie cuadra con la tarjeta y no hay desborde.
import { createClient } from "@supabase/supabase-js";
import http from "node:http";
import ExcelJS from "exceljs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const PUERTO = 3001;
const BASE = `http://huellitas.localhost:${PUERTO}`;

const { data: hu } = await A.from("negocios").select("id, zona_horaria").eq("slug", "huellitas").single();
const H = hu.id;
const jwt = async (profileId) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(profileId)}`, "x-negocio-id": H } },
  });
const miembros = async (rol) => (await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", rol).is("deleted_at", null).order("created_at")).data.map((m) => m.profile_id);
const [idAdmin] = await miembros("admin");
const [idRecep] = await miembros("recepcion");
const adminJ = await jwt(idAdmin);
const recJ = await jwt(idRecep);
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });

const hoyH = (await adminJ.rpc("fecha_negocio")).data;
const TODO = ["2020-01-01", "2099-12-31"];
const HOY = [hoyH, hoyH];
const sufijo = String(Date.now()).slice(-6);

// ── 1. Siembra ─────────────────────────────────────────────────────────────
console.log("── 1. Siembra: ventas con cobros en cada método");
const sinPermiso = await recJ.rpc("reporte_desglose", { p_tarjeta: "cobros:efectivo", p_desde: TODO[0], p_hasta: TODO[1] });
const recTienePermiso = !sinPermiso.error;
let turno = (await SB.from("turnos_caja").select("id").eq("negocio_id", H).eq("estado", "abierto").maybeSingle()).data;
if (!turno) {
  const { error } = await recJ.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba desglose", abierto_por: idRecep, estado: "abierto" });
  if (error) throw new Error(`abrir turno: ${error.message}`);
  turno = (await SB.from("turnos_caja").select("id").eq("negocio_id", H).eq("estado", "abierto").single()).data;
}
const { data: cli } = await SB.from("clientes").select("id").eq("negocio_id", H).eq("publico_general", false).is("deleted_at", null).limit(1);
const venta = async (concepto, precio, cliente = cli[0].id) => {
  const { data, error } = await recJ.rpc("crear_venta_mostrador", { p_cliente_id: cliente, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba desglose" });
  if (error) throw new Error(`venta: ${error.message}`);
  return data;
};
const cobrar = async (reserva, metodos) => {
  const { data, error } = await recJ.rpc("registrar_cobro", { p_reserva_id: reserva, p_notas: "prueba desglose", p_metodos: metodos });
  if (error) throw new Error(`cobro: ${error.message}`);
  return data;
};
const v1 = await venta(`Desglose baño ${sufijo}`, 350);
const c1 = await cobrar(v1, [{ metodo: "efectivo", monto: 350, propina: 20 }]);
const v2 = await venta(`Desglose paseo ${sufijo}`, 120, null);
await cobrar(v2, [{ metodo: "transferencia", monto: 120, propina: 0 }]);
const v3 = await venta(`Desglose hotel ${sufijo}`, 600);
await cobrar(v3, [{ metodo: "tarjeta_manual", monto: 600, propina: 15, folio: `DES-${sufijo}`, motivo: "sin_senal" }]);
const v4 = await venta(`Desglose pendiente ${sufijo}`, 80); // sin cobrar
const dev = await adminJ.rpc("registrar_devolucion", { p_cobro_id: c1, p_motivo: "prueba desglose", p_metodos: [{ metodo: "efectivo", monto: 50 }] });
if (dev.error) hallazgo(`no se pudo devolver: ${dev.error.message}`); else bien("siembra: efectivo con propina, transferencia, tarjeta manual, devolución parcial y una cuenta sin cobrar");
const ret = await recJ.rpc("registrar_retiro", { p_monto: 30, p_motivo: `Retiro desglose ${sufijo}` });
if (ret.error) hallazgo(`retiro: ${ret.error.message}`);
const ag = await recJ.rpc("registrar_efectivo_agregado", { p_monto: 40, p_origen: "cambio", p_nota: `Desglose ${sufijo}` });
if (ag.error) console.log(`  · efectivo agregado no sembrado (${ag.error.message.slice(0, 60)}): se compara con lo que haya`);

// ── 2. Cada tarjeta contra su desglose ─────────────────────────────────────
const num = (x) => Math.round(Number(x ?? 0) * 100) / 100;
const desglose = async (cli2, tarjeta, [d, h], extra = {}) => {
  const r = await cli2.rpc("reporte_desglose", { p_tarjeta: tarjeta, p_desde: d, p_hasta: h, p_limite: 25, p_desplazamiento: 0, ...extra });
  if (r.error) throw new Error(`${tarjeta}: ${r.error.message}`);
  return r.data;
};
const unica = async (nombre, args) => { const r = await adminJ.rpc(nombre, args).single(); if (r.error) throw new Error(`${nombre}: ${r.error.message}`); return r.data; };
const METODOS = ["efectivo", "terminal", "transferencia", "tarjeta_manual"];
if (process.env.SOLO !== "pantalla") {
  let comparadas = 0;
  let distintasDeCero = 0;
  for (const [nombre, [d, h]] of [["todo", TODO], ["hoy", HOY]]) {
    console.log(`── 2. Tarjeta = desglose (${nombre}: ${d} → ${h})`);
    const args = { p_desde: d, p_hasta: h };
    const fin = await unica("reporte_financiero_periodo", args);
    const ven = await unica("reporte_ventas_mostrador_periodo", args);
    const cos = await unica("reporte_costos_periodo", args);
    const ope = await unica("reporte_operativo_periodo", args);
    const margen = (await adminJ.rpc("reporte_margen_por_servicio_periodo", args)).data ?? [];
    const pares = [];
    for (const m of METODOS) {
      pares.push([`cobros:${m}`, fin[`cobros_${m}`]], [`propinas:${m}`, fin[`propinas_${m}`]], [`devoluciones:${m}`, fin[`devoluciones_${m}`]]);
    }
    pares.push(
      ["retiros", fin.retiros_efectivo], ["efectivo_agregado", fin.efectivo_agregado], ["bonos_vendidos", fin.bonos_vendidos],
      ["bonos_consumidos", fin.bonos_consumidos], ["descuentos", fin.descuentos_otorgados],
      ["ventas_vendido", ven.total_vendido], ["ventas_productos", ven.productos], ["ventas_conceptos", ven.conceptos], ["ventas_cobrado", ven.cobrado],
      ["estetica_ingreso", cos.ingreso_estetica],
      ["op_guarderia", ope.dias_guarderia], ["op_hotel", ope.noches_hotel], ["op_estetica", ope.citas_estetica_finalizadas],
      ["op_canceladas", ope.estancias_canceladas], ["op_no_llego", ope.citas_no_llego],
    );
    for (const s of margen) pares.push([`estetica_servicio:${s.servicio_id}`, s.ingreso]);
    for (const [tarjeta, esperado] of pares) {
      const dg = await desglose(adminJ, tarjeta, [d, h]);
      comparadas++;
      if (num(esperado) !== 0) distintasDeCero++;
      // El margen por servicio también muestra la cuenta de citas.
      comprobar(num(dg.total) === num(esperado), `${tarjeta}: tarjeta ${num(esperado)} = desglose ${num(dg.total)} (${dg.total_filas_tarjeta} operaciones)`);
    }
    for (const s of margen) {
      const dg = await desglose(adminJ, `estetica_servicio:${s.servicio_id}`, [d, h]);
      comprobar(Number(dg.total_filas_tarjeta) === Number(s.citas_finalizadas), `citas de ${s.servicio_nombre}: ${s.citas_finalizadas} = ${dg.total_filas_tarjeta} filas`);
    }
  }
  comprobar(distintasDeCero >= 8, `la siembra dejó ${distintasDeCero} tarjetas con cifra distinta de cero (de ${comparadas} comparaciones)`);

  // ── 3. Paginado, orden y búsqueda ──────────────────────────────────────────
  console.log("── 3. Paginado, orden y búsqueda");
  for (const tarjeta of ["cobros:efectivo", "ventas_vendido", "ventas_cobrado"]) {
    const total = await desglose(adminJ, tarjeta, TODO, { p_limite: null });
    const ids = new Set(total.filas.map((f) => f.id));
    comprobar(ids.size === total.filas.length && total.filas.length === Number(total.total_filas), `${tarjeta}: sin límite trae todas (${total.filas.length}) sin repetir`);
    const vistos = new Set();
    let suma = 0;
    for (let off = 0; off < Number(total.total_filas); off += 100) {
      const pg = await desglose(adminJ, tarjeta, TODO, { p_limite: 100, p_desplazamiento: off, p_orden: "monto", p_dir: "asc" });
      for (const f of pg.filas) { vistos.add(f.id); suma += Number(f.monto); }
    }
    comprobar(vistos.size === Number(total.total_filas) && num(suma) === num(total.total), `${tarjeta}: páginas de 100 ordenadas por monto = ${vistos.size} filas, suma ${num(suma)} = ${num(total.total)}`);
    const asc = await desglose(adminJ, tarjeta, TODO, { p_orden: "monto", p_dir: "asc", p_limite: 100 });
    const montos = asc.filas.map((f) => Number(f.monto));
    comprobar(montos.every((m, i) => i === 0 || montos[i - 1] <= m), `${tarjeta}: ordenado por monto ascendente`);
  }
  const busca = await desglose(adminJ, "ventas_vendido", TODO, { p_buscar: `Desglose paseo ${sufijo}`, p_limite: 100 });
  comprobar(busca.filas.length === 1 && num(busca.total_filtrado) === 120 && num(busca.total) >= 120 && busca.filas[0].concepto.includes(`paseo ${sufijo}`),
    "la búsqueda por concepto deja una fila de $120 y el total de la tarjeta no cambia");
  const buscaMetodo = await desglose(adminJ, "ventas_cobrado", TODO, { p_buscar: "transferencia", p_limite: 100 });
  comprobar(buscaMetodo.filas.every((f) => /transferencia/.test(f.metodo)) && buscaMetodo.filas.length >= 1, "la búsqueda por método funciona");
  const fila = busca.filas[0];
  comprobar(fila && fila.href === `/caja/cobrar/${v2}` && fila.usuario !== "", "la fila trae su liga a la cuenta y quién la registró");
  const conCliente = await desglose(adminJ, "ventas_vendido", TODO, { p_buscar: `Desglose baño ${sufijo}`, p_limite: 5 });
  comprobar(conCliente.filas[0]?.cliente && conCliente.filas[0].metodo.includes("efectivo"), "la fila trae cliente y método de la cuenta");
  // Hora local del negocio: la fecha viene como instante y la pantalla la pinta en su zona (se revisa en el paso 6).
  const cuentaSinCobrar = await desglose(adminJ, "ventas_cobrado", TODO, { p_buscar: `Desglose pendiente ${sufijo}` });
  comprobar(Number(cuentaSinCobrar.total_filtrado) === 0, "una cuenta sin cobrar no suma en «Cobrado (neto)»");
  void v4;
  const raro = await adminJ.rpc("reporte_desglose", { p_tarjeta: "cualquier_cosa", p_desde: TODO[0], p_hasta: TODO[1] });
  comprobar(!!raro.error, "una tarjeta que no existe se rechaza");
  const inyeccion = await adminJ.rpc("reporte_desglose", { p_tarjeta: "cobros:efectivo", p_desde: TODO[0], p_hasta: TODO[1], p_orden: "monto; drop table cobros", p_buscar: "%'; --" });
  comprobar(!inyeccion.error && inyeccion.data.filas.length === 0, "orden y búsqueda raros no rompen nada (el orden cae a fecha; % y ' se buscan literales)");


}

// ── 4. Permisos ─────────────────────────────────────────────────────────────
console.log("── 4. Permisos");
if (!recTienePermiso) bien("recepción sin «Reportes financieros» no ve el desglose"); else console.log("  · recepción tiene el permiso en Huellitas: no se comprueba el rechazo");
const rAnon = await anon.rpc("reporte_desglose", { p_tarjeta: "cobros:efectivo", p_desde: TODO[0], p_hasta: TODO[1] });
comprobar(!!rAnon.error, "la llave anónima no ve nada");
const infoAnon = await anon.rpc("reporte_cuentas_info", { p_ids: [v1] });
const infoAdmin = await adminJ.rpc("reporte_cuentas_info", { p_ids: [v1] });
comprobar(!!infoAnon.error && !!infoAdmin.error, "el ayudante de cuentas no se ejecuta desde la API (ni anónima ni con sesión)");
const ajeno = await A.from("negocios").select("id").neq("id", H).limit(1).single();
const otro = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(idAdmin)}`, "x-negocio-id": ajeno.data.id } } });
const cruce = await otro.rpc("reporte_desglose", { p_tarjeta: "ventas_vendido", p_desde: TODO[0], p_hasta: TODO[1], p_limite: 200 });
comprobar(!!cruce.error || (cruce.data.filas ?? []).every((f) => !String(f.concepto).includes(sufijo)), "con el encabezado de otro negocio no se ven las ventas de Huellitas");

if (process.env.SOLO === "base") {
  console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos (solo base)");
  process.exit(hallazgos.length ? 1 : 0);
}

// ── 5. Excel ────────────────────────────────────────────────────────────────
async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cl = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cl.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
console.log("── 5. Excel");
const cookies = await cookiesDe(idAdmin);
const cabecera = { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; ") };
// Node no resuelve *.localhost y fetch no deja fijar Host: se va a 127.0.0.1 con http.request y el Host del negocio.
const pedir = (ruta, cabeceras) => new Promise((ok, mal) => {
  const req = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: "GET", headers: { ...cabeceras, Host: `huellitas.localhost:${PUERTO}` }, timeout: 60000 }, (res) => {
    const trozos = [];
    res.on("data", (t) => trozos.push(t));
    res.on("end", () => ok({ status: res.statusCode, cuerpo: Buffer.concat(trozos) }));
  });
  req.on("timeout", () => req.destroy(new Error("tope de espera")));
  req.on("error", mal);
  req.end();
});
for (const tarjeta of ["cobros:efectivo", "ventas_vendido"]) {
  const esperado = await desglose(adminJ, tarjeta, TODO, { p_limite: null });
  const r = await pedir(`/api/reportes/desglose/excel?t=${encodeURIComponent(tarjeta)}&desde=${TODO[0]}&hasta=${TODO[1]}`, cabecera);
  if (r.status !== 200) { hallazgo(`Excel de ${tarjeta}: HTTP ${r.status}`); continue; }
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(r.cuerpo);
  const hoja = libro.worksheets[0];
  const filas = [];
  hoja.eachRow((row, n) => { if (n > 4) filas.push(row.values); });
  const datos = filas.slice(0, -1);
  const pie = filas[filas.length - 1];
  comprobar(datos.length === esperado.filas.length, `Excel de ${tarjeta}: ${datos.length} filas = ${esperado.filas.length}`);
  comprobar(num(pie[8]) === num(esperado.total), `Excel de ${tarjeta}: total ${num(pie[8])} = tarjeta ${num(esperado.total)}`);
}
const sinSesion = await pedir(`/api/reportes/desglose/excel?t=cobros:efectivo&desde=${TODO[0]}&hasta=${TODO[1]}`, {});
comprobar(sinSesion.status !== 200, `el Excel sin sesión no se entrega (HTTP ${sinSesion.status})`);

// ── 6. Pantalla ─────────────────────────────────────────────────────────────
console.log("── 6. Pantalla a 390 y 1280 px");
const nav = await abrirNavegador();
try {
  for (const [ancho, alto] of [[390, 844], [1280, 800]]) {
    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto } });
    await ctx.addCookies(cookies);
    const pg = await ctx.newPage();
    await pg.goto(`${BASE}/reportes?desde=${TODO[0]}&hasta=${TODO[1]}`, { waitUntil: "domcontentloaded" });
    const tarjeta = pg.locator('a[data-desglose-enlace][aria-label="Ver los conceptos libres"]');
    await tarjeta.waitFor({ timeout: 60000 });
    const valorTarjeta = (await tarjeta.innerText()).match(/\$[\d,]+\.\d{2}/)?.[0];
    await tarjeta.click();
    await pg.waitForSelector("[data-desglose-resumen]", { timeout: 60000 });
    const totalTarjeta = (await pg.locator("[data-desglose-total-tarjeta]").innerText()).trim();
    comprobar(totalTarjeta === valorTarjeta, `${ancho}px: la tarjeta dice ${valorTarjeta} y el desglose ${totalTarjeta}`);
    const pie = ancho >= 640 ? (await pg.locator("[data-desglose-pie]").innerText()).trim() : (await pg.locator("ul li").last().innerText()).replace(/.*:\s*/, "").trim();
    comprobar(pie === valorTarjeta, `${ancho}px: el total del pie (${pie}) cuadra con la tarjeta`);
    const desborde = await pg.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    comprobar(desborde <= 1, `${ancho}px: la página no se desborda a lo ancho (${desborde}px)`);
    const hora = await pg.locator("[data-desglose-fila]").first().innerText();
    comprobar(/\d{2}\/\d{2}\/\d{4}|\d{1,2} \w+ \d{4}|\d{4}-\d{2}-\d{2}/.test(hora) || /\d{1,2}:\d{2}/.test(hora), `${ancho}px: las filas traen fecha y hora`);
    await pg.fill("#q", `paseo ${sufijo}`);
    await pg.press("#q", "Enter");
    await pg.waitForFunction(() => document.querySelectorAll("[data-desglose-fila]").length >= 1 && !!document.querySelector("[data-desglose-total-filtrado]"), null, { timeout: 60000 });
    const filtrado = (await pg.locator("[data-desglose-total-filtrado]").innerText()).trim();
    comprobar(/120\.00/.test(filtrado), `${ancho}px: la búsqueda deja $120.00 (${filtrado})`);
    const abrir = pg.locator('[data-desglose-fila] a:visible:text-matches("Abrir")').first();
    const destino = await abrir.getAttribute("href");
    comprobar(/^\/caja\/cobrar\/[0-9a-f-]{36}$/.test(destino ?? ""), `${ancho}px: «Abrir» apunta a la cuenta (${destino})`);
    const cuenta = await pedir(destino, cabecera);
    comprobar(cuenta.status === 200, `${ancho}px: la cuenta de «Abrir» responde (HTTP ${cuenta.status})`);
    await ctx.close();
  }
} finally {
  await nav.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
