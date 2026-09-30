// Turno de caja: retiros visibles y cancelables, y quién cierra el turno
// (SOLO DESARROLLO), por la API y por la pantalla real, en Huellitas.
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/caja-turno-dev.mjs
//
// Lo que reportó Ludogteka el 30 de septiembre de 2026: la admin abrió el
// turno con su cuenta, en el mostrador se trabaja con la de recepción, y
// desde ahí «los retiros no se registraban» (se guardaban, pero recepción
// no veía los de un turno que no abrió) y «no puedo cerrar el turno
// porque yo no lo inicié».
//   1. Admin abre el turno. Recepción registra un retiro: lo ve por la API
//      y en /caja/turno (con quién y cuánto), y también lo ve admin.
//   2. Recepción NO puede cerrar ese turno (la base lo rechaza); la
//      pantalla se lo dice con el nombre de quien lo abrió y no le enseña
//      «Cerrar turno». Sí puede seguir registrando retiros.
//   3. Recepción registra el mismo retiro dos veces y cancela el duplicado
//      desde la pantalla (con motivo): queda tachado, no suma, y la base
//      lo tiene con deleted_at, quién y motivo. No puede cancelar el de
//      otra persona; admin sí. El retiro de un gasto no se cancela aquí.
//   4. Admin cierra el turno con el conteo ciego: lo esperado descuenta
//      solo los retiros vivos; queda cerrado_por = admin.
//   5. Recepción abre su propio turno, registra un retiro y lo cierra ella.
//   6. Anon y estética no leen ni escriben movimientos_caja.
// Sale con 1 si algo falla. Deja Huellitas con un turno abierto (las otras
// pruebas lo usan).
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 3001;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const MARCA = "ZZCAJA";

const { data: huellitas } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = huellitas.id;
const BASE = `http://huellitas.localhost:${PUERTO}`;
// Tablas por SH (encabezado de Huellitas): `A` sin encabezado queda acotado a Ludogteka.
const SH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const jwt = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": H } } });
const miembros = async (rol) => (await A.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", rol).is("deleted_at", null).order("created_at")).data.map((m) => m.profile_id);
const [idAdmin] = await miembros("admin");
const [idRecep, idRecep2] = await miembros("recepcion");
const [idEstetica] = await miembros("estetica");
const adminJ = await jwt(idAdmin);
const recepJ = await jwt(idRecep);
const recep2J = idRecep2 ? await jwt(idRecep2) : null;
const esteticaJ = await jwt(idEstetica);
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { "x-negocio-id": H } } });
const nombreDe = async (id) => (await A.from("profiles").select("nombre_completo").eq("id", id).single()).data?.nombre_completo ?? "otra persona";

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

const turnoAbierto = async () => (await SH.from("turnos_caja").select("id, abierto_por").eq("negocio_id", H).eq("estado", "abierto").maybeSingle()).data;
// El cierre ciego en dos fases: con 0 la base revela lo esperado; con eso exacto, cierra.
async function cerrarConLoEsperado(quien, turnoId) {
  const { data: f1, error } = await quien.rpc("cerrar_turno", { p_turno_id: turnoId, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: MARCA });
  if (error) return { error };
  const r1 = Array.isArray(f1) ? f1[0] : f1;
  if (r1.cerrado) return { cerrado: true, esperado: r1 };
  const { data: f2, error: e2 } = await quien.rpc("cerrar_turno", { p_turno_id: turnoId, p_conteo_efectivo: r1.esperado_efectivo, p_conteo_terminal: r1.esperado_terminal, p_conteo_transferencia: r1.esperado_transferencia, p_explicacion_diferencias: null, p_notas_cierre: MARCA });
  if (e2) return { error: e2 };
  return { cerrado: (Array.isArray(f2) ? f2[0] : f2).cerrado, esperado: r1 };
}
const abrir = async (quien, fondo) => {
  const { error } = await quien.from("turnos_caja").insert({ fondo_inicial: fondo, notas_apertura: MARCA });
  if (error) throw new Error(`abrir turno: ${error.message}`);
  return turnoAbierto();
};

// Lo que hubiera abierto se cierra con lo esperado (por admin) para arrancar limpio.
const previo = await turnoAbierto();
if (previo) {
  const r = await cerrarConLoEsperado(adminJ, previo.id);
  if (r.error) throw new Error(`no se pudo cerrar el turno previo: ${r.error.message}`);
}

const nav = await abrirNavegador();
const ctxRecep = await nav.newContext();
await ctxRecep.addCookies(await cookiesDe(idRecep));
const recep = await ctxRecep.newPage();
const ctxAdmin = await nav.newContext();
await ctxAdmin.addCookies(await cookiesDe(idAdmin));
const admin = await ctxAdmin.newPage();

try {
  console.log("\n1. Admin abre el turno; recepción registra un retiro y lo ve");
  const turno = await abrir(adminJ, 500);
  if (turno.abierto_por !== idAdmin) hallazgo("el turno no quedó abierto por admin");
  const { data: retiro1, error: e1 } = await recepJ.rpc("registrar_retiro", { p_monto: 159, p_motivo: `Aurrerá jabón ${MARCA}` });
  if (e1) hallazgo(`recepción no pudo registrar el retiro: ${e1.message}`);
  const { data: veRec } = await recepJ.from("movimientos_caja").select("id").eq("turno_id", turno.id);
  const { data: veAdm } = await adminJ.from("movimientos_caja").select("id").eq("turno_id", turno.id);
  if ((veRec ?? []).length !== 1 || (veAdm ?? []).length !== 1) hallazgo(`por la API: recepción ve ${veRec?.length}, admin ve ${veAdm?.length} (esperaba 1 y 1)`);
  else bien("por la API, recepción y admin ven el retiro del turno que abrió admin");
  await recep.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  const filas = await recep.locator('[data-retiro="vivo"]').allInnerTexts();
  const nombreRecep = await nombreDe(idRecep);
  if (filas.length !== 1 || !filas[0].includes(MARCA) || !filas[0].includes("159") || !filas[0].includes(nombreRecep.split(" ")[0])) hallazgo(`la pantalla de recepción no enseña el retiro: ${JSON.stringify(filas)}`);
  else bien("en /caja/turno recepción ve su retiro con monto y quién lo registró");
  if (!(await recep.getByText(/Retiros de este turno — total \$159\.00/).count())) hallazgo("el total de retiros no es $159.00");

  console.log("\n2. Recepción no cierra el turno de admin, y la pantalla lo dice");
  const c = await recepJ.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: null });
  if (!c.error || !/abriste/.test(c.error.message)) hallazgo(`la base dejó a recepción cerrar el turno de admin: ${c.error?.message ?? "sin error"}`);
  else bien("la base rechaza que recepción cierre el turno de admin");
  const nombreAdmin = await nombreDe(idAdmin);
  const aviso = await recep.locator("[data-turno-ajeno]").innerText().catch(() => "");
  if (!aviso.includes(nombreAdmin) || !/un admin/.test(aviso)) hallazgo(`la pantalla no dice quién lo abrió ni quién puede cerrarlo: «${aviso}»`);
  else if (await recep.getByRole("button", { name: "Cerrar turno" }).count()) hallazgo("recepción sigue viendo «Cerrar turno» en un turno ajeno");
  else bien(`la pantalla dice «lo abrió ${nombreAdmin}… solo ${nombreAdmin} o un admin» y no enseña «Cerrar turno»`);

  console.log("\n3. Retiro duplicado: se cancela desde la pantalla");
  await recep.getByRole("button", { name: "Registrar retiro" }).click();
  await recep.getByLabel("Monto").fill("159");
  await recep.getByLabel("Motivo").fill(`Aurrerá jabón ${MARCA} (otra vez)`);
  await recep.getByRole("button", { name: "Confirmar retiro" }).click();
  await recep.locator('[data-retiro="vivo"]').nth(1).waitFor({ timeout: 20_000 });
  const { data: dup } = await SH.from("movimientos_caja").select("id, created_by").eq("turno_id", turno.id).is("deleted_at", null).order("created_at");
  if (dup?.length !== 2) hallazgo(`después del segundo retiro hay ${dup?.length} vivos`);
  else bien("el segundo retiro se guardó y se ve (ahora hay dos vivos)");
  await recep.locator('[data-retiro="vivo"]').nth(1).getByRole("button", { name: "Cancelar este retiro…" }).click();
  await recep.getByLabel("¿Por qué se cancela?").fill("Se registró dos veces");
  await recep.getByRole("button", { name: "Cancelar retiro" }).click();
  await recep.locator('[data-retiro="cancelado"]').waitFor({ timeout: 20_000 });
  const { data: cancelado } = await SH.from("movimientos_caja").select("deleted_at, cancelado_por, motivo_cancelacion").eq("id", dup[1].id).single();
  if (!cancelado.deleted_at || cancelado.cancelado_por !== idRecep || cancelado.motivo_cancelacion !== "Se registró dos veces") hallazgo(`el retiro cancelado quedó mal: ${JSON.stringify(cancelado)}`);
  else bien("el duplicado quedó cancelado con motivo y quién; se ve tachado");
  if (!(await recep.getByText(/Retiros de este turno — total \$159\.00/).count())) hallazgo("el total sigue contando el retiro cancelado");
  else bien("el total vuelve a $159.00 (el cancelado no suma)");
  // Otro retiro de admin: recepción no lo cancela, admin sí.
  const { data: deAdmin } = await adminJ.rpc("registrar_retiro", { p_monto: 20, p_motivo: `Cambio ${MARCA}` });
  const { error: eAjeno } = await recepJ.rpc("cancelar_retiro", { p_id: deAdmin, p_motivo: "x" });
  if (!eAjeno) hallazgo("recepción canceló un retiro que registró admin");
  const { error: eAdm } = await adminJ.rpc("cancelar_retiro", { p_id: deAdmin, p_motivo: "Prueba" });
  if (eAdm) hallazgo(`admin no pudo cancelar un retiro de otro: ${eAdm.message}`);
  const { error: eDos } = await adminJ.rpc("cancelar_retiro", { p_id: deAdmin, p_motivo: "Otra vez" });
  if (!eDos) hallazgo("se pudo cancelar dos veces el mismo retiro");
  if (eAjeno && !eAdm && eDos) bien("recepción no cancela retiros ajenos; admin cualquiera; no se cancela dos veces");
  // El retiro de un gasto pagado del cajón no se cancela aquí.
  const { data: cat } = await SH.from("categorias_gasto").select("id").eq("negocio_id", H).is("deleted_at", null).limit(1).single();
  const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Monterrey" });
  const { data: gastoId, error: eG } = await adminJ.rpc("registrar_gasto", { p_concepto: `Gasto ${MARCA}`, p_categoria_id: cat.id, p_monto: 30, p_fecha_pago: hoy, p_metodo: "efectivo_caja", p_proveedor_id: null, p_periodo_desde: null, p_periodo_hasta: null, p_comprobante_path: null, p_notas: null });
  if (eG) hallazgo(`registrar_gasto del cajón: ${eG.message}`);
  else {
    const { data: g } = await SH.from("gastos").select("movimiento_caja_id").eq("id", gastoId).single();
    const { error: eRetGasto } = await adminJ.rpc("cancelar_retiro", { p_id: g.movimiento_caja_id, p_motivo: "x" });
    if (!eRetGasto || !/Gastos/.test(eRetGasto.message)) hallazgo(`el retiro de un gasto se pudo cancelar desde caja: ${eRetGasto?.message ?? "sin error"}`);
    else bien("el retiro de un gasto del cajón manda a cancelar el gasto en Gastos");
    await adminJ.rpc("cancelar_gasto", { p_gasto_id: gastoId, p_motivo: "Prueba" });
  }

  console.log("\n4. Admin cierra el turno con el conteo ciego");
  await admin.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  if (!(await admin.getByRole("button", { name: "Cerrar turno" }).count())) hallazgo("admin no ve «Cerrar turno» en un turno que abrió (él mismo)");
  const r = await cerrarConLoEsperado(adminJ, turno.id);
  if (r.error || !r.cerrado) hallazgo(`admin no pudo cerrar: ${r.error?.message ?? "no cerró"}`);
  else {
    // Fondo 500 − retiros vivos (159; el duplicado y el de $20 están cancelados; el del gasto se quitó al cancelar el gasto).
    if (Number(r.esperado.esperado_efectivo) !== 500 - 159) hallazgo(`lo esperado en efectivo fue ${r.esperado.esperado_efectivo}, no ${500 - 159}: cuenta retiros cancelados`);
    else bien(`el corte esperaba $${500 - 159} en efectivo: solo descuenta los retiros vivos`);
    const { data: t } = await SH.from("turnos_caja").select("estado, cerrado_por").eq("id", turno.id).single();
    if (t.estado !== "cerrado" || t.cerrado_por !== idAdmin) hallazgo(`turno: ${JSON.stringify(t)}`);
    else bien("quedó cerrado y registrado que lo cerró admin");
  }

  console.log("\n5. Recepción abre el suyo, registra un retiro y lo cierra");
  const mio = await abrir(recepJ, 300);
  await recepJ.rpc("registrar_retiro", { p_monto: 50, p_motivo: `Propio ${MARCA}` });
  await recep.goto(`${BASE}/caja/turno`, { waitUntil: "networkidle" });
  if (await recep.locator("[data-turno-ajeno]").count()) hallazgo("en su propio turno recepción ve el aviso de turno ajeno");
  if (!(await recep.getByRole("button", { name: "Cerrar turno" }).count())) hallazgo("recepción no ve «Cerrar turno» en su propio turno");
  const r5 = await cerrarConLoEsperado(recepJ, mio.id);
  if (r5.error || !r5.cerrado || Number(r5.esperado.esperado_efectivo) !== 250) hallazgo(`recepción no cerró su turno: ${r5.error?.message ?? JSON.stringify(r5.esperado)}`);
  else bien("recepción cierra su propio turno; esperado $250 (300 − 50)");
  if (recep2J) {
    const otro = await abrir(recepJ, 100);
    const c2 = await recep2J.rpc("cerrar_turno", { p_turno_id: otro.id, p_conteo_efectivo: 0, p_conteo_terminal: 0, p_conteo_transferencia: 0, p_explicacion_diferencias: null, p_notas_cierre: null });
    if (!c2.error) hallazgo("otra recepcionista cerró el turno de su compañera");
    else bien("otra recepcionista no cierra el turno de su compañera");
    await cerrarConLoEsperado(recepJ, otro.id);
  }

  console.log("\n6. Anon y estética no tocan la caja");
  const final = await abrir(adminJ, 200);
  const { data: vAnon } = await anon.from("movimientos_caja").select("id").eq("turno_id", final.id);
  const { error: rAnon } = await anon.rpc("registrar_retiro", { p_monto: 1, p_motivo: "x" });
  const { data: vEst } = await esteticaJ.from("movimientos_caja").select("id").eq("turno_id", final.id);
  const { error: rEst } = await esteticaJ.rpc("registrar_retiro", { p_monto: 1, p_motivo: "x" });
  const { error: cEst } = await esteticaJ.rpc("cancelar_retiro", { p_id: retiro1, p_motivo: "x" });
  if ((vAnon ?? []).length || !rAnon || (vEst ?? []).length || !rEst || !cEst) hallazgo(`anon/estética: leen ${vAnon?.length}/${vEst?.length}, registran ${!rAnon}/${!rEst}, cancelan ${!cEst}`);
  else bien("anon y estética no leen, no registran ni cancelan retiros");
} catch (e) {
  hallazgo(`el recorrido tronó: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  await recep.screenshot({ path: "/tmp/caja-turno-recepcion.png" }).catch(() => {});
} finally {
  await nav.close();
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
