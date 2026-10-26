// QA S36 en PRODUCCIÓN, en los mismos negocios PRUEBA que reportó QA (y solo ahí), con navegador y SIN escribir nada:
// reproduce N128 (agendar en un día cerrado), N129 (acciones de cobro en una cuenta pagada) y N131 (el cupo de un día
// futuro con la salida anticipada) y dice lo que se ve. Antes del arreglo sirve para anotar por qué falla; después del
// despliegue, para verificarlo en el mismo negocio. Sale con 1 si alguno sigue mal. N132 (salida anticipada) dice qué se
// cobró en las salidas anticipadas ya registradas y si existe la política del negocio.
//
//   node scripts/auditoria/qa-s36-prod.mjs [--fotos] [--escribir]
//
// --escribir (solo después de desplegar): N132 con el flujo real en el negocio PRUEBA de hotel (una estancia de 2
// noches desde hoy, check-in y check-out hoy en la pantalla). Sin él, todo es lectura.
//
// Sesiones por enlace mágico (scripts/lib/prod.mjs); las llaves se leen al vuelo y nunca se imprimen.
import os from "node:os";
import path from "node:path";
import { comoPersona, negocioPrueba } from "../lib/prod.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const FOTOS = process.argv.includes("--fotos");
const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const ver = (t) => console.log(`    · ${t}`);
const texto = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const foto = async (p, nombre) => {
  if (!FOTOS) return;
  const ruta = path.join(os.tmpdir(), `qa-s36-${nombre}.png`);
  await p.screenshot({ path: ruta, fullPage: true });
  ver(`foto: ${ruta}`);
};
const sumarDias = (f, n) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const EST = await negocioPrueba("prueba-qa-onboarding-estetica-s16");
const HOT = await negocioPrueba("prueba-qa-onboarding-hotel-s16");
const nav = await abrirNavegador();
async function pagina(neg, rol) {
  const s = await neg.sesion(rol);
  const c = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await c.addCookies(s.cookies);
  const p = await c.newPage();
  p.setDefaultNavigationTimeout(60000);
  return { p, api: comoPersona(s.token, neg.negocio.id) };
}
const hoyDe = (zona) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date());

/** El siguiente día cerrado (desde mañana) según el horario del negocio. */
async function siguienteCerrado(api, desde) {
  for (let i = 1; i <= 14; i++) {
    const f = sumarDias(desde, i);
    const { data } = await api.rpc("resolver_cupo_configuracion", { p_fecha: f });
    const fila = Array.isArray(data) ? data[0] : data;
    if (fila?.estado === "configurado" && fila.hora_apertura == null) return f;
  }
  return null;
}

// ── N128 · Estética: Agendar desde la vista Día de un día cerrado
console.log("\nN128 · agendar en un día cerrado");
{
  const { p, api } = await pagina(EST, "admin");
  const hoy = hoyDe(EST.negocio.zona_horaria);
  const cerrado = await siguienteCerrado(api, hoy);
  ver(`${EST.negocio.slug}: siguiente día cerrado ${cerrado}`);
  await p.goto(`${EST.base}/estetica?vista=dia&fecha=${cerrado}`);
  const href = await p.locator("[data-agendar-fecha]").first().getAttribute("href");
  ver(`«Agendar» lleva a ${href}`);
  // El campo de fecha y hora sale cuando ya hay cliente: llega elegido por ?cliente= (uno con mascota del negocio).
  const { data: perro } = await EST.N.from("perros").select("cliente_id").eq("negocio_id", EST.negocio.id).is("deleted_at", null).eq("fallecido", false).limit(1).single();
  await p.goto(`${EST.base}${href}&cliente=${perro.cliente_id}`);
  await p.waitForSelector("input[type=datetime-local]", { timeout: 30000 });
  const valores = await p.locator("input[type=date], input[type=datetime-local], input[type=time]").evaluateAll((xs) => xs.map((x) => `${x.type}=${x.value}`));
  ver(`el formulario abre con: ${valores.join(", ")}`);
  const cuerpo = await texto(p);
  const aviso = await p.locator("[data-aviso-horario]").first().innerText().catch(() => "");
  ver(`aviso: ${aviso.replace(/\s+/g, " ") || "(ninguno)"}`);
  const enElDia = valores.some((v) => v.includes(cerrado));
  const conAviso = /Fuera de horario: el negocio está cerrado ese día/.test(cuerpo);
  const conPropuesta = /Te propongo el \S+ \d+ a las \d{2}:\d{2}/.test(cuerpo);
  if (enElDia && conAviso && conPropuesta) bien(`Estética abre en el ${cerrado} con «Fuera de horario: el negocio está cerrado ese día» y «${cuerpo.match(/Te propongo el \S+ \d+ a las \d{2}:\d{2}/)[0]}»`);
  else mal(`Estética: abre en el día cerrado ${enElDia ? "sí" : "NO"}, aviso ${conAviso ? "sí" : "NO"}, propuesta visible ${conPropuesta ? "sí" : "NO"}`);
  await foto(p, "n128-estetica");
  await p.context().close();
}
{
  const { p, api } = await pagina(HOT, "admin");
  const hoy = hoyDe(HOT.negocio.zona_horaria);
  const cerrado = await siguienteCerrado(api, hoy);
  ver(`${HOT.negocio.slug}: siguiente día cerrado ${cerrado}`);
  if (!cerrado) mal("Hotel: no encontré un día cerrado en el horario para probar");
  else {
    await p.goto(`${HOT.base}/hotel/nueva?fecha=${cerrado}`);
    await p.waitForLoadState("networkidle").catch(() => {});
    const cuerpo = await texto(p);
    const conAviso = /Fuera de horario: el negocio está cerrado ese día/.test(cuerpo);
    const conPropuesta = /Te propongo el \S+ \d+/.test(cuerpo);
    ver(`aviso al abrir: ${conAviso ? "sí" : "no"}; propuesta: ${conPropuesta ? cuerpo.match(/Te propongo el [^.]+/)[0] : "no"}`);
    if (conAviso && conPropuesta) bien(`Hotel abre en el ${cerrado} con el aviso y la propuesta`);
    else mal(`Hotel: al abrir en el día cerrado ${cerrado}, aviso ${conAviso ? "sí" : "NO"}, propuesta ${conPropuesta ? "sí" : "NO"}`);
    await foto(p, "n128-hotel");
  }
  await p.context().close();
}

// ── N129 · Cuenta pagada con acciones de cobro
console.log("\nN129 · cuenta pagada");
const PROHIBIDAS = ["Cobrar con terminal", "Mandar link de pago", "Aplicar descuento", "Corregir precio", "Registrar cobro"];
for (const neg of [EST, HOT]) {
  const { p } = await pagina(neg, "admin");
  const { data: cobros } = await neg.N.from("cobros").select("reserva_id").eq("negocio_id", neg.negocio.id).is("anulado_at", null).order("created_at", { ascending: false }).limit(15);
  let revisada = null;
  for (const id of [...new Set((cobros ?? []).map((c) => c.reserva_id))]) {
    await p.goto(`${neg.base}/reservas/${id}/cobrar`);
    await p.waitForLoadState("networkidle").catch(() => {});
    // Saldo $0 (con o sin turno abierto: sin turno la pantalla no pinta «Cuenta pagada» y pide abrirlo).
    if (!/Saldo: \$0\.00/.test(await texto(p))) continue;
    revisada = id;
    const visibles = [];
    for (const t of PROHIBIDAS) if (await p.getByRole("button", { name: t }).filter({ visible: true }).count()) visibles.push(t);
    for (const t of PROHIBIDAS) if (await p.getByText(t, { exact: true }).filter({ visible: true }).count() && !visibles.includes(t)) visibles.push(t);
    ver(`${neg.base}/reservas/${id}/cobrar → saldo $0.00, «Cuenta pagada» ${(await p.locator("[data-cuenta-pagada]").count()) ? "sí" : "NO"}, «Abrir turno» ${(await p.getByRole("button", { name: "Abrir turno" }).count()) ? "SÍ" : "no"}; acciones visibles: ${visibles.join(", ") || "ninguna"}`);
    if (visibles.length) mal(`${neg.negocio.slug}: la cuenta pagada muestra ${visibles.join(", ")}`);
    else bien(`${neg.negocio.slug}: la cuenta pagada no muestra acciones de cobro ni de precio`);
    const verCobros = await p.getByText(/Ver cobros|Cobros de esta reserva/i).filter({ visible: true }).count();
    ver(`«Ver cobros»/historial visible: ${verCobros ? "sí" : "no"}`);
    await foto(p, `n129-${neg.negocio.slug}`);
    break;
  }
  if (!revisada) mal(`${neg.negocio.slug}: no encontré una cuenta pagada para revisar`);
  await p.context().close();
}

// ── N131 · Cupo por presencia: S33 entró el 25 (reserva del 26) y salió el 26 (salida prevista el 27)
console.log("\nN131 · entrada y salida anticipadas y el cupo");
const zonaH = HOT.negocio.zona_horaria;
const diaReal = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: zonaH }).format(new Date(iso));
{
  const { p, api } = await pagina(HOT, "admin");
  const hoy = hoyDe(zonaH);
  const { data: todas } = await HOT.N.from("estancias").select("id, estado, fecha_entrada, fecha_salida, hora_entrada_real, hora_salida_real, perros(nombre), servicios(categoria)").eq("negocio_id", HOT.negocio.id).is("deleted_at", null).not("estado", "in", "(cancelada,no_llego)").order("id").limit(1000);
  const anticipadas = (todas ?? []).filter((e) => (e.hora_entrada_real && diaReal(e.hora_entrada_real) < e.fecha_entrada) || (e.hora_salida_real && diaReal(e.hora_salida_real) < e.fecha_salida));
  for (const e of anticipadas.slice(0, 8)) ver(`${e.perros?.nombre}: reserva ${e.fecha_entrada}→${e.fecha_salida}, entró ${e.hora_entrada_real ? diaReal(e.hora_entrada_real) : "—"}, salió ${e.hora_salida_real ? diaReal(e.hora_salida_real) : "—"} (${e.estado})`);
  const desde = sumarDias(hoy, -2), hasta = sumarDias(hoy, 3);
  const { data: cal, error } = await api.rpc("calendario_ocupacion", { p_desde: desde, p_hasta: hasta });
  if (error) ver(`calendario_ocupacion: ${error.message}`);
  // La regla: desde su entrada (la real si entró antes) y, con check-out, nunca después de su salida real.
  const cuenta = (e, d) => {
    const entro = e.hora_entrada_real ? diaReal(e.hora_entrada_real) : null;
    const salio = e.hora_salida_real ? diaReal(e.hora_salida_real) : null;
    if (e.fecha_entrada > d && !(entro && entro <= d)) return false;
    if (d < hoy) return Boolean(entro) && entro <= d && (!salio || salio >= d);
    if (d === hoy) return (Boolean(entro) && !salio && e.estado !== "finalizada") || (!entro && ["reservada", "confirmada"].includes(e.estado) && e.fecha_entrada === d && e.fecha_salida > d);
    return e.fecha_salida > d && ((["reservada", "confirmada"].includes(e.estado) && e.fecha_entrada >= hoy) || (Boolean(entro) && !salio && e.estado !== "finalizada"));
  };
  for (const d of cal ?? []) {
    const esperado = (todas ?? []).filter((e) => cuenta(e, d.fecha));
    const nombres = esperado.map((e) => e.perros?.nombre).join(", ") || "nadie";
    if (d.ocupado_diurno === esperado.length) bien(`${d.fecha}: ${d.ocupado_diurno}/${d.cupo_diurno} de día, ${d.ocupado_nocturno}/${d.cupo_nocturno} de noche (${nombres})`);
    else mal(`${d.fecha}: el cupo cuenta ${d.ocupado_diurno} y según la regla son ${esperado.length} (${nombres})`);
  }
  for (const e of anticipadas.filter((x) => x.hora_entrada_real && diaReal(x.hora_entrada_real) < x.fecha_entrada && diaReal(x.hora_entrada_real) >= desde)) {
    const f = diaReal(e.hora_entrada_real);
    await p.goto(`${HOT.base}/reservas/calendario?fecha=${f}&dia=${f}`);
    await p.waitForLoadState("networkidle").catch(() => {});
    const enPanel = (await p.locator(`[data-lista=dia] [data-reserva="${e.id}"]`).count()) === 1;
    if (enPanel) bien(`${HOT.base}/reservas/calendario?dia=${f}: ${e.perros?.nombre} sale en el panel del día que entró (antes de su reserva)`);
    else mal(`${HOT.base}/reservas/calendario?dia=${f}: ${e.perros?.nombre} entró ese día y no sale en su panel`);
    await foto(p, `n131-${f}`);
  }
  await p.context().close();
}

// ── N132 · Salida anticipada y cobro
console.log("\nN132 · salida anticipada y cobro");
{
  const { p, api } = await pagina(HOT, "admin");
  // Las salidas anticipadas de hotel ya registradas: qué se cobró y si la cuenta dice algo.
  const { data: fin } = await HOT.N.from("estancias").select("id, reserva_id, fecha_entrada, fecha_salida, hora_entrada_real, hora_salida_real, perros(nombre), servicios(categoria)").eq("negocio_id", HOT.negocio.id).eq("estado", "finalizada").is("deleted_at", null).not("hora_salida_real", "is", null).order("hora_salida_real", { ascending: false }).limit(20);
  for (const e of (fin ?? []).filter((x) => x.servicios?.categoria === "hotel")) {
    const inicio = [e.fecha_entrada, diaReal(e.hora_entrada_real)].sort()[0];
    const usadas = Math.max(1, (new Date(`${diaReal(e.hora_salida_real)}T12:00:00Z`) - new Date(`${inicio}T12:00:00Z`)) / 86400000);
    const reservadas = (new Date(`${e.fecha_salida}T12:00:00Z`) - new Date(`${e.fecha_entrada}T12:00:00Z`)) / 86400000;
    if (usadas >= reservadas) continue;
    const { data: t } = await api.rpc("cuenta_totales_reserva", { p_reserva_id: e.reserva_id });
    const { count } = await HOT.N.from("cuenta_ajustes_precio").select("id", { count: "exact", head: true }).eq("linea_id", e.id).is("deleted_at", null);
    ver(`${e.perros?.nombre}: ${reservadas} noche(s) reservada(s), usó ${usadas}; cuenta $${t?.[0]?.total_cuenta} (${count ? "ajustada" : "sin ajuste: se cobró completa sin aviso"})`);
  }
  await p.goto(`${HOT.base}/admin/hotel`);
  await p.waitForLoadState("networkidle").catch(() => {});
  const conPolitica = (await p.locator("[data-cobrar-estancia-completa]").count()) === 1;
  if (conPolitica) bien(`${HOT.base}/admin/hotel: Configuración de hotel con «Cobrar la estancia completa aunque salga antes» (${(await p.locator("[data-cobrar-estancia-completa]").isChecked()) ? "marcada" : "sin marcar: ajusta a lo usado"})`);
  else mal(`${HOT.base}/admin/hotel: no existe la política de salida anticipada`);
  await foto(p, "n132-politica");

  // Con --escribir (solo después de desplegar): el flujo real en este negocio PRUEBA. Una estancia de 2 noches desde hoy,
  // check-in ahora y check-out hoy en la pantalla: antes de confirmar debe decir «Sale 1 noche antes…» (la noche de hoy se cobra).
  if (process.argv.includes("--escribir") && conPolitica) {
    const { data: modelo } = await HOT.N.from("perros").select("cliente_id, tamano_id").eq("negocio_id", HOT.negocio.id).ilike("nombre", "PRUEBA QA S33%").is("deleted_at", null).limit(1).single();
    const { data: hotelSrv } = await HOT.N.from("servicios").select("id").eq("negocio_id", HOT.negocio.id).eq("categoria", "hotel").eq("unidad", "noche").is("deleted_at", null).limit(1).single();
    const { data: perro, error: ePerro } = await api.from("perros").insert({ cliente_id: modelo.cliente_id, nombre: "PRUEBA QA S36 Perro Salida", especie: "perro", tamano_id: modelo.tamano_id }).select("id").single();
    if (ePerro) mal(`no se pudo dar de alta el perro de prueba: ${ePerro.message}`);
    else {
      const hoy = hoyDe(zonaH);
      const r = (await api.from("reservas").insert({ cliente_id: modelo.cliente_id, notas: "QA S36 · verificación de salida anticipada" }).select("id").single()).data;
      const e = await api.from("estancias").insert({ reserva_id: r.id, perro_id: perro.id, servicio_id: hotelSrv.id, fecha_entrada: hoy, fecha_salida: sumarDias(hoy, 2), dia_cerrado_confirmado: "confirmado", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "QA S36", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "QA S36" }).select("id").single();
      if (e.error) mal(`no se pudo reservar: ${e.error.message}`);
      else {
        const ci = await api.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "QA S36", hora_entrada_real: new Date().toISOString(), checkin_fuera_horario: "confirmado" }).eq("id", e.data.id);
        if (ci.error) mal(`check-in: ${ci.error.message}`);
        const antes = Number((await api.rpc("cuenta_totales_reserva", { p_reserva_id: r.id })).data?.[0]?.total_cuenta);
        await p.goto(`${HOT.base}/reservas/estancias/${e.data.id}/checkout`);
        await p.waitForLoadState("networkidle").catch(() => {});
        const aviso = (await p.locator("[data-salida-anticipada]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
        ver(`${HOT.base}/reservas/estancias/${e.data.id}/checkout → antes de confirmar: «${aviso}»`);
        await foto(p, "n132-checkout-antes");
        await p.locator("#checkout-recoge-nombre").fill("QA S36");
        await p.getByRole("button", { name: "Sí, es el dueño" }).click();
        await p.getByRole("button", { name: "Confirmar salida" }).click();
        const fuera = await p.locator("[data-confirmar-fuera-horario]").waitFor({ timeout: 5000 }).then(() => true).catch(() => false);
        if (fuera) await p.locator("[data-confirmar-fuera-horario]").click();
        await p.waitForTimeout(4000);
        await p.waitForLoadState("networkidle").catch(() => {});
        const despues = Number((await api.rpc("cuenta_totales_reserva", { p_reserva_id: r.id })).data?.[0]?.total_cuenta);
        const { data: aj } = await HOT.N.from("cuenta_ajustes_precio").select("motivo, concepto").eq("linea_id", e.data.id).is("deleted_at", null);
        const tras = (await p.locator("[data-salida-anticipada-aplicada]").first().innerText().catch(() => "")).replace(/\s+/g, " ");
        ver(`después de confirmar: «${tras}»`);
        await foto(p, "n132-checkout-despues");
        const politicaCompleta = /política del negocio/.test(aviso);
        if (politicaCompleta ? despues === antes : /Sale d+ noches? antes: la cuenta baja de/.test(aviso) && despues < antes && aj?.[0]?.motivo === "Salida anticipada")
          bien(`N132: «${aviso.replace(/^.*?(Sale|Se cobra)/, "$1")}»; cuenta $${antes} → $${despues}${aj?.length ? `, «${aj[0].concepto}» con motivo «${aj[0].motivo}»` : ""}`);
        else mal(`N132: aviso «${aviso}», cuenta $${antes} → $${despues}, ajuste ${JSON.stringify(aj)}`);
      }
    }
  }
  await p.context().close();
}

await nav.close();
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exitCode = hallazgos.length ? 1 : 0;
