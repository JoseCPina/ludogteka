// B20 (QA externa, 15 de octubre de 2026): un instante se muestra y se compara en la zona del NEGOCIO, nunca en
// UTC. SOLO DESARROLLO, Huellitas (America/Tijuana, UTC-7 en octubre), con el servidor en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/fechas-utc-dev.mjs
//
// 1. Escáner estático (scripts/auditoria/lib/fechas-utc-escaner.mjs): ninguna fecha de un instante tomada en UTC.
// 2. El formateador: 18:00, 18:30, 23:59 locales siguen siendo el MISMO día local (en UTC ya son el siguiente).
// 3. Pantallas con una cita de estética de las 18:30 a las 23:59 locales: la ficha, el historial de reprogramación
//    y la agenda del día dicen el día local, nunca el siguiente.
// 5. Cobros, recibo de cobro junto, corte de caja, reporte por día, estancia (check-in y check-out) y portal con datos
//    entre las 18:00 y las 23:59 locales (sección 4 del código), y la zona de México centro (UTC-6 todo el año).
// 4. La base: fecha_negocio() de esos instantes es el día local.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { escanear } from "./lib/fechas-utc-escaner.mjs";
import { formatearDiaDeInstante, fechaLocalDeInstante, formatearDiaSemana, formatearFechaCalendario } from "../../src/lib/formato.ts";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const ZONA = "America/Tijuana";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);

console.log("── 1. Escáner estático");
const h = escanear();
for (const x of h) console.log(`    ${x.archivo}:${x.linea} [${x.regla}]`);
comprobar(h.length === 0, `ninguna fecha de un instante tomada en UTC (${h.length} hallazgos)`);

const hoyLocal = (await SB.rpc("fecha_negocio")).data;
const suma = (base, dias) => new Date(new Date(`${base}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const D = suma(hoyLocal, 200 + (Date.now() % 100));
const sig = suma(D, 1);

console.log("── 2. El formateador y la base");
for (const hora of ["18:00", "18:30", "20:30", "23:59"]) {
  const iso = new Date(`${D}T${hora}:00-07:00`).toISOString();
  comprobar(iso.slice(0, 10) === sig, `${hora} locales ya es el ${sig} en UTC (${iso})`);
  comprobar(fechaLocalDeInstante(iso, ZONA) === D, `${hora} locales: fechaLocalDeInstante da ${D}`);
  const esperado = formatearDiaDeInstante(`${D}T12:00:00-07:00`, ZONA);
  comprobar(formatearDiaDeInstante(iso, ZONA) === esperado, `${hora} locales: formatearDiaDeInstante da «${esperado}»`);
  const { data } = await SB.rpc("fecha_negocio", { p_ts: iso });
  comprobar(data === D, `${hora} locales: fecha_negocio() de la base da ${D}`);
}


console.log("── 2b. México centro (UTC-6 todo el año, sin horario de verano)");
for (const [iso, esperado] of [["2026-10-16T00:30:00Z", "2026-10-15"], ["2027-04-16T00:30:00Z", "2027-04-15"], ["2026-07-16T05:59:00Z", "2026-07-15"], ["2027-01-16T05:59:00Z", "2027-01-15"], ["2027-04-16T06:00:00Z", "2027-04-16"]]) {
  comprobar(fechaLocalDeInstante(iso, "America/Mexico_City") === esperado, `${iso} en America/Mexico_City es el ${esperado}`);
  const { data } = await SB.rpc("fecha_negocio", { p_ts: iso });
  void data;
}
for (const [fecha, off] of [["2026-10-15", "-06:00"], ["2027-04-15", "-06:00"], ["2026-07-15", "-06:00"], ["2027-01-15", "-06:00"]]) {
  const iso = new Date(`${fecha}T18:30:00${off}`).toISOString();
  comprobar(fechaLocalDeInstante(iso, "America/Mexico_City") === fecha, `las 18:30 locales del ${fecha} (UTC-6) siguen siendo ese día en Node`);
}

console.log("── 3. Pantallas");
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
const admin = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(datos.adminB)}`, "x-negocio-id": B } } });
const { data: tallas } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
const { data: pel } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
const { data: raza } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
const { data: srv } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "estetica_estetico").is("deleted_at", null).single();
const creados = { perros: [], reservas: [], citas: [], clientes: [] };
const nav = await abrirNavegador();
try {
  const { data: perro, error: eP } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ utc ${sufijo}`, raza: "Poodle", raza_id: raza.id, tamano_id: tallas.id, pelaje_id: pel.id }).select("id, nombre").single();
  if (eP) throw new Error(`perro: ${eP.message}`);
  creados.perros.push(perro.id);
  const rr = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
  creados.reservas.push(rr.data.id);
  const cita = await admin.from("citas_estetica").insert({ reserva_id: rr.data.id, perro_id: perro.id, servicio_id: srv.id, empleado_id: datos.esteticaB, inicio: `${D}T18:30:00-07:00` }).select("id, inicio, fin").single();
  if (cita.error) throw new Error(`cita: ${cita.error.message}`);
  creados.citas.push(cita.data.id);

  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(await cookiesDe(datos.adminB));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  const etiquetaD = formatearDiaDeInstante(`${D}T12:00:00-07:00`, ZONA);
  const etiquetaSig = formatearDiaDeInstante(`${sig}T12:00:00-07:00`, ZONA);
  await p.goto(`${BASE}/estetica/${cita.data.id}`, { waitUntil: "networkidle", timeout: 120000 });
  const encabezado = (await p.locator("h1 + p").first().innerText()).replace(/\s+/g, " ");
  comprobar(encabezado.includes(etiquetaD) && !encabezado.includes(etiquetaSig), `la ficha dice el día local «${etiquetaD}» (${encabezado.slice(0, 60)})`);
  comprobar(/06:30|6:30/.test(encabezado), "la ficha dice la hora local 6:30 p.m.");

  // Reprogramar a las 23:30 locales: el historial muestra el día local de antes y de después.
  const nuevo = `${D}T23:30:00-07:00`;
  const rep = await admin.rpc("reprogramar_cita_estetica", { p_cita_id: cita.data.id, p_inicio: nuevo, p_motivo: "Prueba de zona" });
  comprobar(!rep.error, `reprogramar a las 23:30 locales (${rep.error?.message ?? "ok"})`);
  await p.goto(`${BASE}/estetica/${cita.data.id}`, { waitUntil: "networkidle", timeout: 120000 });
  const cuerpo = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  comprobar(!cuerpo.includes(etiquetaSig), `ninguna parte de la ficha (historial incluido) dice el día siguiente «${etiquetaSig}»`);

  await p.goto(`${BASE}/estetica?fecha=${D}`, { waitUntil: "networkidle", timeout: 120000 });
  const agenda = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  comprobar(agenda.includes(perro.nombre), "la agenda del día local trae la cita de las 23:30");
  await p.goto(`${BASE}/estetica?fecha=${sig}`, { waitUntil: "networkidle", timeout: 120000 });
  const agendaSig = (await p.locator("main").innerText()).replace(/\s+/g, " ");
  comprobar(!agendaSig.includes(perro.nombre), "la agenda del día siguiente NO la trae");
  await ctx.close();

  // ── 4. Cobros, corte, recibo, reporte, estancias y portal entre las 18:00 y las 23:59 locales ──
  console.log("── 4. Cobros, corte de caja, recibo, reporte, estancia y portal");
  const rec = await (async () => {
    const { data: recs } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
    return { id: recs[0].profile_id, cli: await (async () => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(recs[0].profile_id)}`, "x-negocio-id": B } } }))() };
  })();
  const adminCli = admin;
  await adminCli.rpc("elegir_proveedor_cobro", { p_proveedor: "manual" });
  let { data: turno } = await SB.from("turnos_caja").select("id").eq("estado", "abierto").maybeSingle();
  if (!turno) turno = (await rec.cli.from("turnos_caja").insert({ fondo_inicial: 100, notas_apertura: "prueba zona" }).select("id").single()).data;
  const tel = `55${String(Date.now()).slice(-8)}`;
  const cliente = (await SB.from("clientes").insert({ nombre: `ZZ zona ${sufijo}`, telefono: tel }).select("id").single()).data;
  creados.clientes = [cliente.id];
  const cuenta = async (precio, concepto) => (await rec.cli.rpc("crear_venta_mostrador", { p_cliente_id: cliente.id, p_lineas: [{ concepto, precio, cantidad: 1 }], p_notas: "prueba zona" })).data;
  const tardes = [["18:05", "1805"], ["22:30", "2230"], ["23:59", "2359"]];
  // 4a. Un cobro suelto por cada hora tardía: la pantalla de cobro, el movimiento del turno y el reporte dicen el día local.
  const cuentas = [];
  for (const [hora] of tardes) {
    const r = await cuenta(50, `Zona ${hora} ${sufijo}`);
    const c = await rec.cli.rpc("registrar_cobro", { p_reserva_id: r, p_notas: "", p_metodos: [{ metodo: "efectivo", monto: 50 }] });
    comprobar(!c.error, `cobro de ${hora} registrado (${c.error?.message ?? "ok"})`);
    const t = new Date(`${D}T${hora}:00-07:00`).toISOString();
    const up = await SB.from("cobros").update({ created_at: t }).eq("reserva_id", r);
    comprobar(!up.error, `cobro de ${hora} fechado a las ${hora} locales del ${D}`);
    cuentas.push({ r, hora });
  }
  const repD = await adminCli.rpc("reporte_financiero_periodo", { p_desde: D, p_hasta: D });
  const repSig = await adminCli.rpc("reporte_financiero_periodo", { p_desde: sig, p_hasta: sig });
  const fila = (x) => (Array.isArray(x.data) ? x.data[0] : x.data) ?? {};
  comprobar(Number(fila(repD).cobros_efectivo) === 150, `el reporte por día del ${D} suma los 3 cobros tardíos (${fila(repD).cobros_efectivo})`);
  comprobar(Number(fila(repSig).cobros_efectivo ?? 0) === 0, `el reporte del ${sig} (día UTC) no suma ninguno (${fila(repSig).cobros_efectivo ?? 0})`);
  const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.addCookies(await cookiesDe(rec.id));
  const pr = await ctx2.newPage();
  pr.setDefaultTimeout(60000);
  const texto = async (ruta) => { await pr.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 120000 }); return (await pr.locator("body").innerText()).replace(/\s+/g, " "); };
  for (const { r, hora } of cuentas) {
    const t = await texto(`/caja/cobrar/${r}`);
    comprobar(t.includes(etiquetaD) && !t.includes(etiquetaSig), `la cuenta cobrada a las ${hora} muestra el cobro del ${etiquetaD}, no del ${etiquetaSig}`);
  }
  const tTurno = await texto("/caja/turno");
  comprobar(tTurno.includes(etiquetaD) && !tTurno.includes(etiquetaSig), `los movimientos del turno dicen ${etiquetaD}, no ${etiquetaSig}`);
  // 4b. Recibo del cobro junto a las 23:59 locales.
  const j1 = await cuenta(30, `Junto A ${sufijo}`);
  const j2 = await cuenta(20, `Junto B ${sufijo}`);
  const g = await rec.cli.rpc("registrar_cobro_grupo", { p_partes: [{ reserva_id: j1, monto: 30 }, { reserva_id: j2, monto: 20 }], p_notas: "", p_metodos: [{ metodo: "efectivo", monto: 50 }] });
  comprobar(!g.error, `cobro junto registrado (${g.error?.message ?? "ok"})`);
  const grupoId = g.data?.grupo_id ?? g.data?.[0]?.grupo_id ?? g.data;
  const tg = new Date(`${D}T23:59:00-07:00`).toISOString();
  await SB.from("cobros_grupo").update({ created_at: tg }).eq("id", grupoId);
  await SB.from("cobros").update({ created_at: tg }).in("reserva_id", [j1, j2]);
  const tRec = await texto(`/caja/recibo-junto/${grupoId}`);
  comprobar(tRec.includes(etiquetaD) && !tRec.includes(etiquetaSig), `el recibo del cobro junto de las 23:59 dice ${etiquetaD}`);
  // 4c. Estancia: check-in a las 18:40 y check-out a las 23:50 locales.
  const pe = (await SB.from("perros").insert({ negocio_id: B, cliente_id: cliente.id, nombre: `ZZ zonaest ${sufijo}`, tamano_id: tallas.id }).select("id").single()).data;
  creados.perros.push(pe.id);
  const { data: gDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
  const rr2 = await admin.from("reservas").insert({ cliente_id: cliente.id }).select("id").single();
  creados.reservas.push(rr2.data.id);
  const dEst = (() => { let d = suma(D, 3); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 2) d = suma(d, 1); return d; })();
  const est = await admin.from("estancias").insert({ reserva_id: rr2.data.id, perro_id: pe.id, servicio_id: gDia.id, fecha_entrada: dEst, fecha_salida: suma(dEst, 1), estado: "reservada", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba zona", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba zona" }).select("id").single();
  comprobar(!est.error, `estancia creada (${est.error?.message ?? "ok"})`);
  const entra = new Date(`${dEst}T18:40:00-07:00`).toISOString();
  const sale = new Date(`${dEst}T23:50:00-07:00`).toISOString();
  const e1 = await SB.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba", hora_entrada_real: entra }).eq("id", est.data.id);
  const tIn = await texto(`/reservas/estancias/${est.data.id}/checkin`);
  const dEstL = formatearDiaDeInstante(`${dEst}T12:00:00-07:00`, ZONA);
  const dEstSig = formatearDiaDeInstante(`${suma(dEst, 1)}T12:00:00-07:00`, ZONA);
  comprobar(!e1.error && tIn.includes(dEstL) && /06:40/.test(tIn), `el check-in de las 18:40 dice ${dEstL} y 06:40 p.m.`);
  const e2 = await SB.from("estancias").update({ estado: "finalizada", recogido_por_nombre: "Prueba", recogido_por_es_dueno: true, hora_salida_real: sale }).eq("id", est.data.id);
  const tOut = await texto(`/reservas/estancias/${est.data.id}/checkout`);
  const salio = tOut.match(/Este perro ya salió el ([^.]*)\./)?.[1] ?? "";
  comprobar(!e2.error && salio.trim() === dEstL, `el check-out de las 23:50 dice «ya salió el ${dEstL}» (dice «${salio}»)`);
  comprobar(salio.trim() !== dEstSig, "y no el día siguiente");
  // 4d. Corte de caja: el turno abierto el D a las 18:05 y cerrado a las 23:55 locales.
  const cerrar = (e, t, tr) => admin.rpc("cerrar_turno", { p_turno_id: turno.id, p_conteo_efectivo: e, p_conteo_terminal: t, p_conteo_transferencia: tr, p_explicacion_diferencias: null, p_notas_cierre: "prueba zona" });
  const c1 = await cerrar(0, 0, 0);
  const r1 = Array.isArray(c1.data) ? c1.data[0] : c1.data;
  let c1e = c1.error;
  if (r1 && !r1.cerrado) c1e = (await cerrar(r1.esperado_efectivo, r1.esperado_terminal, r1.esperado_transferencia)).error;
  const cerrado = (await SB.from("turnos_caja").select("estado").eq("id", turno.id).single()).data;
  comprobar(cerrado?.estado === "cerrado", `el turno se cierra (${c1e?.message ?? cerrado?.estado})`);
  await SB.from("turnos_caja").update({ abierto_at: new Date(`${D}T18:05:00-07:00`).toISOString() }).eq("id", turno.id);
  const cierraAt = new Date(`${D}T23:55:00-07:00`).toISOString();
  await SB.from("turnos_caja").update({ cerrado_at: cierraAt }).eq("id", turno.id);
  const tCorte = await texto("/caja/turno");
  const lineaCorte = tCorte.match(new RegExp(`${etiquetaD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} – ${etiquetaD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  comprobar(Boolean(lineaCorte), `el historial de cortes dice «${etiquetaD} – ${etiquetaD}» (abrió 18:05, cerró 23:55 locales)`);
  if (!lineaCorte) console.log("    cortes:", tCorte.slice(tCorte.indexOf("Historial"), tCorte.indexOf("Historial") + 500));
  comprobar(!tCorte.includes(`${etiquetaD} – ${etiquetaSig}`) && !tCorte.includes(`${etiquetaSig} – ${etiquetaSig}`), "y no corre el cierre al día siguiente");
  await ctx2.close();
  // 4e. Portal: el dueño ve su cita de las 23:30 locales (ya reprogramada) en su día.
  const cuentaPortal = datos.cuentaSoloB;
  const ctx3 = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx3.addCookies(await cookiesDe(cuentaPortal));
  const pp = await ctx3.newPage();
  pp.setDefaultTimeout(60000);
  // Una cita de las 23:30 locales de ayer (Historial del portal: las próximas se recortan a 12 y Huellitas junta muchas).
  const ayer = suma(hoyLocal, -1);
  const mov = await SB.from("citas_estetica").update({ inicio: new Date(`${ayer}T23:30:00-07:00`).toISOString(), fin: new Date(`${ayer}T23:59:00-07:00`).toISOString() }).eq("id", cita.data.id);
  comprobar(!mov.error, `la cita pasa a las 23:30 de ayer (${mov.error?.message ?? "ok"})`);
  const etDiaP = `${formatearDiaSemana(ayer)} ${formatearFechaCalendario(ayer)}`;
  const etDiaPS = `${formatearDiaSemana(hoyLocal)} ${formatearFechaCalendario(hoyLocal)}`;
  await pp.goto(`${BASE}/portal`, { waitUntil: "networkidle", timeout: 120000 });
  const tPortal = (await pp.locator("body").innerText()).replace(/\s+/g, " ");
  const bajo = tPortal.toLowerCase();
  const k = bajo.indexOf(`${etDiaP.toLowerCase()} · 11:30`);
  const ventana = k >= 0 ? tPortal.slice(k, k + 60) : "";
  comprobar(k >= 0 && !bajo.includes(`${etDiaPS.toLowerCase()} · 11:30`), `el portal muestra la cita de las 23:30 como «${etDiaP} · 11:30 p.m.» y no como «${etDiaPS}» → ${ventana}`);
  if (k < 0) console.log('    portal:', [...tPortal.matchAll(/.{0,40}Est[eé]tica.{0,80}/g)].slice(-3).map((m) => m[0]).join(' | '), '| total', tPortal.length);
  await ctx3.close();
} finally {
  await nav.close();
  if (creados.citas.length) await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("id", creados.citas);
  if (creados.clientes.length) await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", creados.clientes);
  if (creados.perros.length) await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
