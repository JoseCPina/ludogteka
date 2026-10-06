// Uso (SOLO DESARROLLO), con el servidor prendido (npm run build && npm run start -- -p 3001):
//
//   node scripts/auditoria/venta-mostrador-dev.mjs
//
// Venta rápida en Caja, con el navegador y las pantallas reales, en
// Huellitas (negocio de prueba; nunca en Ludogteka), puesto en plan
// «prueba» para que la terminal y el link cobren en simulación:
//   1. Un producto del inventario se marca «Se vende en mostrador» con su
//      precio (admin, en su ficha).
//   2. Se cierra el turno que hubiera y se abre uno nuevo con fondo conocido.
//   3. Venta sin cliente (Público en general) de 2 productos → cobro en
//      efectivo con propina. El inventario baja 2 y no sale en la lista de
//      clientes.
//   4. Venta con cliente de un concepto libre → cobro en la terminal
//      (simulada). La cuenta queda en el expediente de ese cliente.
//   5. Venta sin cliente de un producto + un concepto → link de pago
//      (simulado) pagado.
//   6. El turno las marca «venta de mostrador», el reporte las separa de
//      los servicios, y el corte cuadra con cero diferencia en los tres
//      métodos. Se abre otro turno al final (las demás pruebas lo usan).
//   7. Reglas de la base: el precio de un producto es el del catálogo (lo
//      que mande la pantalla se ignora), no se vende más de lo que hay, el
//      cliente no puede vender, y un renglón ya cobrado no se cancela.
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 3001;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

const { data: huellitas } = await A.from("negocios").select("id, slug, plan").eq("slug", "huellitas").single();
const H = huellitas.id;
const planOriginal = huellitas.plan;
const BASE = `http://huellitas.localhost:${PUERTO}`;
const miembro = async (rol) => (await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).single()).data.profile_id;
const jwt = async (profileId) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(profileId)}`, "x-negocio-id": H } },
  });
const idAdmin = await miembro("admin");
const idRecep = await miembro("recepcion");
const adminJ = await jwt(idAdmin);
const recepJ = await jwt(idRecep);

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

const turnoAbierto = async () => (await A.from("turnos_caja").select("id, fondo_inicial, abierto_por").eq("negocio_id", H).eq("estado", "abierto").maybeSingle()).data;
async function cerrarConLoEsperado(turnoId, notas) {
  // Fase 1 con conteo 0: la base revela lo esperado; fase 2 con eso exacto.
  const { data: f1, error } = await adminJ.rpc("cerrar_turno", { p_turno_id: turnoId, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: notas });
  if (error) throw error;
  const r1 = Array.isArray(f1) ? f1[0] : f1;
  if (r1.cerrado) return r1;
  const { data: f2, error: e2 } = await adminJ.rpc("cerrar_turno", { p_turno_id: turnoId, p_conteo_efectivo: r1.esperado_efectivo, p_conteo_terminal: r1.esperado_terminal, p_conteo_transferencia: r1.esperado_transferencia, p_explicacion_diferencias: null, p_notas_cierre: notas });
  if (e2) throw e2;
  return Array.isArray(f2) ? f2[0] : f2;
}
const abrirTurno = async (fondo) => {
  const { error } = await recepJ.from("turnos_caja").insert({ fondo_inicial: fondo, notas_apertura: "Prueba de venta de mostrador", abierto_por: idRecep, estado: "abierto" });
  if (error) throw error;
  return turnoAbierto();
};

// El producto de prueba: se crea sin marcar y con 5 piezas.
const { data: area } = await A.from("areas_inventario").select("id").eq("negocio_id", H).is("deleted_at", null).limit(1).single();
const { data: pieza } = await A.from("unidades_medida").select("id").eq("clave", "pieza").single();
const nombreProducto = `Collar de prueba ${Date.now().toString().slice(-5)}`;
const { data: producto, error: eProd } = await A.from("insumos")
  .insert({ negocio_id: H, nombre: nombreProducto, area_id: area.id, unidad_compra_id: pieza.id, unidad_consumo_id: pieza.id, stock_minimo: 0, existencia_inicial: 5, updated_at: new Date().toISOString() })
  .select("id")
  .single();
if (eProd) throw eProd;
const existencia = async () => Number((await A.from("insumos_existencia_actual").select("existencia_actual").eq("insumo_id", producto.id).single()).data.existencia_actual);

await A.from("negocios").update({ plan: "prueba", prueba_termina_at: new Date(Date.now() + 10 * 86400000).toISOString() }).eq("id", H);
// La terminal y el link cobran en simulación solo con un proveedor elegido (otras pruebas lo dejan en «solo manual»).
await adminJ.rpc("elegir_proveedor_cobro", { p_proveedor: "mercadopago" });
const nav = await abrirNavegador();
const ctxAdmin = await nav.newContext();
await ctxAdmin.addCookies(await cookiesDe(idAdmin));
const admin = await ctxAdmin.newPage();
const ctxRecep = await nav.newContext();
await ctxRecep.addCookies(await cookiesDe(idRecep));
const recep = await ctxRecep.newPage();

async function armarVenta({ cliente, productos = [], conceptos = [] }) {
  await recep.goto(`${BASE}/caja/venta`, { waitUntil: "networkidle" });
  if (cliente) {
    await recep.getByRole("button", { name: "Escoger cliente" }).click();
    await recep.getByLabel("Buscar por perro, dueño o teléfono").fill(cliente.nombre.slice(0, 6));
    await recep.getByText(cliente.nombre).first().click();
  }
  for (const [id, cantidad] of productos) {
    await recep.getByLabel("Producto del inventario").selectOption(id);
    await recep.getByRole("button", { name: "Agregar producto" }).click();
    if (cantidad !== 1) await recep.locator("[data-renglon-venta]").last().getByLabel("Cantidad").fill(String(cantidad));
  }
  for (const [concepto, precio] of conceptos) {
    await recep.getByRole("button", { name: "Agregar concepto libre" }).click();
    const r = recep.locator("[data-renglon-venta]").last();
    await r.getByLabel("Concepto").fill(concepto);
    await r.getByLabel("Precio").fill(String(precio));
  }
  await recep.getByRole("button", { name: /^Cobrar \$/ }).click();
  await recep.waitForURL(/\/caja\/cobrar\//, { timeout: 30_000 });
  return recep.url().split("/caja/cobrar/")[1].split("?")[0];
}
const cobrosDe = async (reservaId) => (await A.from("cobros").select("id, origen, cobro_metodos(metodo, monto, propina)").eq("negocio_id", H).eq("reserva_id", reservaId)).data ?? [];
const saldoDe = async (reservaId) => Number((await adminJ.rpc("cuenta_totales_reserva", { p_reserva_id: reservaId }).single()).data.saldo);

let turno;
try {
  console.log("\n1. Producto a la venta");
  await admin.goto(`${BASE}/inventario/${producto.id}`, { waitUntil: "networkidle" });
  await admin.getByLabel("Se vende en mostrador").check();
  await admin.getByLabel(/Precio de venta al público/).fill("120");
  await admin.getByRole("button", { name: "Guardar cambios", exact: true }).click();
  await admin.getByText("Cambios guardados").first().waitFor({ timeout: 20_000 });
  const { data: p1 } = await A.from("insumos").select("se_vende, precio_venta").eq("negocio_id", H).eq("id", producto.id).single();
  if (!p1.se_vende || Number(p1.precio_venta) !== 120) hallazgo(`el producto no quedó a la venta: ${JSON.stringify(p1)}`);
  else bien(`«${nombreProducto}» a la venta en $120 por pieza, 5 en existencia`);

  console.log("\n2. Turno limpio");
  const previo = await turnoAbierto();
  if (previo) await cerrarConLoEsperado(previo.id, "Cierre para la prueba de venta de mostrador");
  turno = await abrirTurno(500);
  bien(`turno nuevo con fondo $500`);

  console.log("\n3. Sin cliente, 2 productos, efectivo con propina");
  const vA = await armarVenta({ productos: [[producto.id, 2]] });
  const { data: rA } = await A.from("reservas").select("cliente_id, notas, clientes(nombre, publico_general)").eq("negocio_id", H).eq("id", vA).single();
  if (!rA.clientes.publico_general || rA.clientes.nombre !== "Público en general") hallazgo(`la venta sin cliente no quedó en Público en general: ${JSON.stringify(rA)}`);
  else bien(`cuenta de «Público en general» (${rA.notas})`);
  if ((await existencia()) !== 3) hallazgo(`el inventario no bajó a 3: ${await existencia()}`);
  else bien("el inventario bajó de 5 a 3 (salida por venta)");
  if ((await saldoDe(vA)) !== 240) hallazgo(`el saldo no es $240: ${await saldoDe(vA)}`);
  const formCobro = recep.locator("div", { has: recep.locator("p", { hasText: /^Registrar cobro$/ }) }).last();
  await formCobro.getByLabel("Monto", { exact: true }).fill("240");
  await formCobro.getByLabel("Propina").fill("10");
  await recep.getByRole("button", { name: "Registrar cobro" }).click();
  await recep.waitForLoadState("networkidle");
  await recep.waitForTimeout(1500);
  const cA = await cobrosDe(vA);
  if (cA.length !== 1 || cA[0].cobro_metodos[0].metodo !== "efectivo" || Number(cA[0].cobro_metodos[0].propina) !== 10) hallazgo(`el cobro en efectivo no quedó: ${JSON.stringify(cA)}`);
  else bien("cobrado en efectivo, $240 + $10 de propina");
  await recep.goto(`${BASE}/clientes`, { waitUntil: "networkidle" });
  if (await recep.getByText("Público en general").count()) hallazgo("«Público en general» sale en la lista de clientes");
  else bien("«Público en general» no sale en la lista de clientes");

  console.log("\n4. Con cliente, concepto libre, terminal");
  const { data: clienteReal } = await A.from("clientes").select("id, nombre").eq("negocio_id", H).eq("publico_general", false).is("deleted_at", null).order("created_at").limit(1).single();
  const vB = await armarVenta({ cliente: clienteReal, conceptos: [["Moño de regalo", 35.5]] });
  const { data: rB } = await A.from("reservas").select("cliente_id").eq("negocio_id", H).eq("id", vB).single();
  if (rB.cliente_id !== clienteReal.id) hallazgo("la venta con cliente no quedó en su cuenta");
  else bien(`la venta quedó en la cuenta de ${clienteReal.nombre}`);
  const panel = recep.locator("[data-cobro-integrado]");
  await panel.getByRole("button", { name: "Cobrar con terminal" }).click();
  await panel.getByLabel("Monto", { exact: true }).fill("35.50");
  await panel.getByRole("button", { name: "Mandar a la terminal" }).click();
  await recep.getByText(/Pago confirmado|No se pudo completar/).first().waitFor({ timeout: 60_000 });
  const cB = await cobrosDe(vB);
  if (cB.length !== 1 || cB[0].origen !== "mercadopago_point") hallazgo(`el cobro en terminal no quedó: ${JSON.stringify(cB)}`);
  else bien("cobrado en la terminal (simulada), origen mercadopago_point");

  console.log("\n5. Sin cliente, producto + concepto, link de pago");
  const vC = await armarVenta({ productos: [[producto.id, 1]], conceptos: [["Envoltura", 15]] });
  if ((await saldoDe(vC)) !== 135) hallazgo(`el saldo del link no es $135: ${await saldoDe(vC)}`);
  const panelC = recep.locator("[data-cobro-integrado]");
  await panelC.getByRole("button", { name: "Mandar link de pago" }).click();
  await panelC.getByLabel("Monto", { exact: true }).fill("135");
  await panelC.getByLabel("Concepto").fill("Venta de mostrador");
  await panelC.getByRole("button", { name: "Generar link" }).click();
  await recep.getByText(/Link listo/).waitFor({ timeout: 30_000 });
  const { data: ordenC } = await A.from("mp_ordenes").select("id, url_pago").eq("negocio_id", H).eq("reserva_id", vC).eq("tipo", "link").single();
  const pagina = await ctxRecep.newPage();
  await pagina.goto(ordenC.url_pago.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  await pagina.close();
  const cC = await cobrosDe(vC);
  if (cC.length !== 1 || cC[0].origen !== "mercadopago_link" || cC[0].cobro_metodos[0].metodo !== "transferencia") hallazgo(`el cobro por link no quedó: ${JSON.stringify(cC)}`);
  else bien("pagado por link (simulado), método transferencia");
  if ((await existencia()) !== 2) hallazgo(`el inventario no quedó en 2: ${await existencia()}`);
  else bien("inventario: 2 piezas");

  console.log("\n6. Turno, reporte y corte");
  const { data: movs } = await recepJ.rpc("movimientos_turno", { p_turno_id: turno.id });
  const ventas = (movs ?? []).filter((m) => m.tipo === "venta_mostrador");
  if (ventas.length !== 3) hallazgo(`el turno no marca las 3 ventas como venta de mostrador: ${JSON.stringify(movs)}`);
  else bien("el turno marca las 3 ventas como «venta de mostrador»");
  await recep.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  const linea = await recep.locator("[data-ventas-mostrador]").innerText().catch(() => "");
  if (!linea.includes("$410.50")) hallazgo(`la pantalla del turno no separa las ventas de mostrador: «${linea}»`);
  else bien(`la pantalla del turno las separa: «${linea}»`);
  const hoy = (await adminJ.rpc("fecha_negocio")).data;
  const { data: rep, error: eRep } = await adminJ.rpc("reporte_ventas_mostrador_periodo", { p_desde: hoy, p_hasta: hoy }).single();
  if (eRep || Number(rep.total_vendido) < 410.5 || Number(rep.productos) < 360) hallazgo(`el reporte de ventas no cuadra: ${JSON.stringify(rep ?? eRep)}`);
  else bien(`reporte: ventas $${rep.total_vendido} (productos $${rep.productos}, conceptos $${rep.conceptos})`);
  const { data: repRecep } = await recepJ.rpc("reporte_ventas_mostrador_periodo", { p_desde: hoy, p_hasta: hoy });
  if (repRecep) hallazgo("recepción sin permiso leyó el reporte de ventas");
  // El corte: se espera fondo + efectivo + propina, terminal y transferencia.
  const esperado = { efectivo: 500 + 240 + 10, terminal: 35.5, transferencia: 135 };
  const { data: corte, error: eCorte } = await recepJ.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: esperado.efectivo, p_conteo_terminal: esperado.terminal, p_conteo_transferencia: esperado.transferencia, p_explicacion_diferencias: null, p_notas_cierre: "Corte de la prueba" });
  const c = Array.isArray(corte) ? corte[0] : corte;
  if (eCorte || !c?.cerrado || Number(c.diferencia_efectivo) || Number(c.diferencia_terminal) || Number(c.diferencia_transferencia)) hallazgo(`el corte no cuadró: ${JSON.stringify(c ?? eCorte)}`);
  else bien(`el corte cuadra: efectivo $${c.esperado_efectivo}, terminal $${c.esperado_terminal}, transferencia $${c.esperado_transferencia}, sin diferencias`);
  turno = await abrirTurno(0);

  console.log("\n7. Reglas de la base");
  const { data: vPrecio, error: ePrecio } = await recepJ.rpc("crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ insumo_id: producto.id, cantidad: 1, precio: 1 }], p_notas: "precio inventado" });
  if (ePrecio) hallazgo(`no se pudo crear la venta del precio: ${ePrecio.message}`);
  else {
    const t = Number((await adminJ.rpc("cuenta_totales_reserva", { p_reserva_id: vPrecio }).single()).data.total_cuenta);
    if (t !== 120) hallazgo(`el precio mandado desde fuera cambió el del catálogo: $${t}`);
    else bien("un precio mandado desde fuera se ignora: el producto cuesta lo del catálogo ($120)");
    const { error: eCanc } = await recepJ.rpc("cancelar_venta_mostrador", { p_venta_id: (await A.from("ventas_mostrador").select("id").eq("negocio_id", H).eq("reserva_id", vPrecio).single()).data.id, p_motivo: "Prueba" });
    if (eCanc || (await existencia()) !== 2) hallazgo(`cancelar un renglón sin cobrar no regresó el inventario: ${eCanc?.message} ${await existencia()}`);
    else bien("cancelar un renglón sin cobrar lo regresa al inventario (ajuste, nada se borra)");
  }
  const { error: eMas } = await recepJ.rpc("crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ insumo_id: producto.id, cantidad: 50 }], p_notas: null });
  if (!eMas || (await existencia()) !== 2) hallazgo("se pudo vender más de lo que hay");
  else bien(`no se vende más de lo que hay («${eMas.message.slice(0, 70)}…»)`);
  const { data: ventaA } = await A.from("ventas_mostrador").select("id").eq("negocio_id", H).eq("reserva_id", vA).limit(1).single();
  const { error: eCobrada } = await recepJ.rpc("cancelar_venta_mostrador", { p_venta_id: ventaA.id, p_motivo: "ya cobrada" });
  if (!eCobrada) hallazgo("se canceló un renglón ya cobrado");
  else bien("un renglón ya cobrado no se cancela (primero la devolución)");
  const { data: mCliente } = await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", "cliente").is("deleted_at", null).limit(1).maybeSingle();
  if (mCliente) {
    const clienteJ = await jwt(mCliente.profile_id);
    const { error: eCli } = await clienteJ.rpc("crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ concepto: "x", precio: 1, cantidad: 1 }], p_notas: null });
    const { data: leidas } = await clienteJ.from("ventas_mostrador").select("id");
    if (!eCli || (leidas ?? []).length) hallazgo("un cliente pudo vender o leer ventas");
    else bien("un cliente no vende ni lee ventas");
  }
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
  const { error: eAnon } = await anon.rpc("crear_venta_mostrador", { p_cliente_id: null, p_lineas: [{ concepto: "x", precio: 1, cantidad: 1 }], p_notas: null });
  const { error: eAnonPub } = await anon.rpc("cliente_publico_general");
  if (!eAnon || !eAnonPub) hallazgo("la llave anónima pudo vender o crear el público general");
  else bien("la llave anónima no vende ni crea el público general");
  const { error: eEditar } = await adminJ.from("clientes").update({ nombre: "Otro" }).eq("publico_general", true);
  const { data: pg } = await A.from("clientes").select("nombre").eq("negocio_id", H).eq("publico_general", true).single();
  if (pg.nombre !== "Público en general") hallazgo(`se pudo renombrar al público general (${eEditar?.message})`);
  else bien("«Público en general» no se edita");
} catch (e) {
  hallazgo(`el recorrido tronó: ${e instanceof Error ? e.message.split("\n")[0] : (e?.message ?? JSON.stringify(e))}`);
  await recep.screenshot({ path: "/tmp/venta-recepcion.png" }).catch(() => {});
  await admin.screenshot({ path: "/tmp/venta-admin.png" }).catch(() => {});
} finally {
  await adminJ.rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  await A.from("negocios").update({ plan: planOriginal }).eq("id", H);
  if (!(await turnoAbierto())) await abrirTurno(0).catch(() => {});
  await A.from("insumos").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", H).eq("id", producto.id);
  await nav.close();
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
