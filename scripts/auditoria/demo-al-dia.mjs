// El demo al día (QA S31 y su seguimiento, 24 de octubre de 2026) — SOLO LECTURA, no escribe nada.
//
//   node scripts/auditoria/demo-al-dia.mjs          desarrollo (.env.local)
//   node scripts/auditoria/demo-al-dia.mjs --prod   producción (llaves leídas al vuelo del CLI, nunca impresas)
//
// Comprueba que el demo (plan 'demo') se ve como un negocio operando:
//   1. Ninguna reserva de un día pasado sin check-in, y nadie adentro con la salida vencida.
//   2. Ninguna cuenta de estancias ya terminada (salida antes de hoy) con saldo: cada una está cobrada.
//   3. Ningún turno de caja de un día anterior abierto, y los turnos con cobros del demo cerrados con diferencia $0.
//      El de hoy sigue el horario: en horario, abierto desde la apertura; fuera de horario, ninguno abierto, y el de
//      hoy cerrado a la hora de cierre.
//   4. Los cobros que hizo demo_cobrar_cuentas: en efectivo y ~1 de cada 10 con terminal, fechados a su salida.
//   5. Las cuentas del demo siguen en solo lectura.
//   6. Los negocios «PRUEBA …» de QA no tienen ningún cobro de esas cuentas (no cobran nada).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const PROD = process.argv.includes("--prod");
function llaves() {
  if (PROD) {
    const keys = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", "xdsxjhytggpsgrmfuuff", "-o", "json"], { encoding: "utf8" }));
    return { url: "https://xdsxjhytggpsgrmfuuff.supabase.co", secreta: keys.find((k) => k.name === "service_role" && String(k.api_key).startsWith("eyJ"))?.api_key };
  }
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  if (!env.NEXT_PUBLIC_SUPABASE_URL.includes("sgfolltpvktbsiisfuzq")) throw new Error(".env.local no apunta a desarrollo.");
  return { url: env.NEXT_PUBLIC_SUPABASE_URL, secreta: env.SUPABASE_SECRET_KEY };
}
const { url, secreta } = llaves();
const cliente = (negocio) => createClient(url, secreta, { auth: { persistSession: false }, global: { headers: negocio ? { "x-negocio-id": negocio } : {} } });
const S = cliente(null);
const hallazgos = [];
const comprobar = (c, t) => { if (c) console.log(`  ✔ ${t}`); else { hallazgos.push(t); console.log(`  ✘ ${t}`); } };
const exigir = (r, que) => { if (r.error) throw new Error(`${que}: ${r.error.message}`); return r.data; };
// Todas las filas, de 1,000 en 1,000, con orden por llave única.
async function todas(q) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const parte = exigir(await q().range(desde, desde + 999), "lectura");
    filas.push(...parte);
    if (parte.length < 1000) return filas;
  }
}

const negocios = exigir(await S.from("negocios").select("id, slug, nombre, plan, zona_horaria").order("slug"), "negocios");
const demos = negocios.filter((n) => n.plan === "demo");
const pruebasQA = negocios.filter((n) => n.plan === "prueba" && /^PRUEBA /i.test(n.nombre));
console.log(`${PROD ? "PRODUCCIÓN" : "desarrollo"} · demos: ${demos.map((d) => d.slug).join(", ") || "ninguno"}`);

for (const n of demos) {
  const N = cliente(n.id);
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: n.zona_horaria || "America/Mexico_City" }).format(new Date());
  const diaLocal = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: n.zona_horaria || "America/Mexico_City" }).format(new Date(iso));
  console.log(`\n── ${n.slug} (hoy ${hoy})`);
  // Su horario (la configuración vigente hoy) y la hora del negocio: el cron corre cada 15 minutos, así que todo lo que
  // «ya tocó» se juzga con 20 minutos de margen.
  const zona = n.zona_horaria || "America/Mexico_City";
  const [conf] = exigir(await N.from("cupo_configuracion").select("id").eq("negocio_id", n.id).lte("vigencia_desde", hoy).is("deleted_at", null).order("vigencia_desde", { ascending: false }).limit(1), "configuración");
  const horario = conf ? exigir(await N.from("horario_semana").select("dia_semana, hora_apertura, hora_cierre").eq("cupo_configuracion_id", conf.id).is("deleted_at", null).order("dia_semana"), "horario") : [];
  const desfase = (fecha) => { const d = new Date(`${fecha}T12:00:00Z`); const local = new Date(d.toLocaleString("en-US", { timeZone: zona })); const utc = new Date(d.toLocaleString("en-US", { timeZone: "UTC" })); return utc - local; };
  const instante = (fecha, hora) => new Date(new Date(`${fecha}T${hora}Z`).getTime() + desfase(fecha));
  const horarioDe = (fecha) => { const h = horario.find((x) => x.dia_semana === new Date(`${fecha}T12:00:00Z`).getUTCDay()); return h?.hora_apertura ? { abre: instante(fecha, h.hora_apertura), cierra: instante(fecha, h.hora_cierre) } : null; };
  const ahora = new Date();
  const MARGEN = 20 * 60_000;
  const hHoy = horarioDe(hoy);
  const estancias = await todas(() => N.from("estancias").select("id, reserva_id, estado, fecha_entrada, fecha_salida, hora_entrada_real, hora_salida_real, servicios(categoria)").eq("negocio_id", n.id).is("deleted_at", null).order("id"));
  const cat = (e) => (Array.isArray(e.servicios) ? e.servicios[0] : e.servicios)?.categoria;
  const atrasadas = estancias.filter((e) => ["reservada", "confirmada"].includes(e.estado) && !e.hora_entrada_real && e.fecha_entrada < hoy);
  // Hoy también: la salida de hotel de hoy ya pasó las 12:00, o la guardería de hoy ya pasó el cierre.
  const vencidas = estancias.filter((e) => e.estado === "en_curso" && (cat(e) === "hotel"
    ? e.fecha_salida < hoy || (e.fecha_salida === hoy && ahora - instante(hoy, "12:00:00") > MARGEN)
    : e.fecha_entrada < hoy || (e.fecha_entrada === hoy && hHoy && ahora - hHoy.cierra > MARGEN)));
  comprobar(atrasadas.length === 0 && vencidas.length === 0, `sin llegadas atrasadas (${atrasadas.length}) ni adentro con la salida vencida (${vencidas.length})`);

  // Cuentas de estancias ya terminadas.
  const porReserva = new Map();
  for (const e of estancias) porReserva.set(e.reserva_id, [...(porReserva.get(e.reserva_id) ?? []), e]);
  const terminadas = [...porReserva.entries()].filter(([, es]) =>
    es.every((e) => ["finalizada", "no_llego", "cancelada"].includes(e.estado)) && es.some((e) => e.estado === "finalizada")
    && ahora - new Date(es.filter((e) => e.hora_salida_real).map((e) => e.hora_salida_real).sort().at(-1)) > 5 * 60_000 + MARGEN);
  let conSaldo = 0;
  const saldos = new Map();
  const ejemplos = [];
  for (const [reserva] of terminadas) {
    const [t] = exigir(await N.rpc("cuenta_totales_reserva", { p_reserva_id: reserva }), "totales") ?? [];
    saldos.set(reserva, { total: Number(t?.total_cuenta ?? 0), bono: Number(t?.total_bono ?? 0), saldo: Number(t?.saldo ?? 0) });
    if (Number(t?.saldo ?? 0) > 0) { conSaldo++; if (ejemplos.length < 3) ejemplos.push(`${reserva.slice(0, 8)} debe $${t.saldo}`); }
  }
  comprobar(conSaldo === 0, `${terminadas.length} cuentas de estancias terminadas: ninguna en «Debe» (${conSaldo}${ejemplos.length ? `: ${ejemplos.join(", ")}` : ""})`);

  // Turnos.
  const turnos = await todas(() => N.from("turnos_caja").select("id, estado, abierto_at, cerrado_at").eq("negocio_id", n.id).order("id"));
  const viejosAbiertos = turnos.filter((t) => t.estado === "abierto" && diaLocal(t.abierto_at) < hoy);
  comprobar(viejosAbiertos.length === 0, `ningún turno de un día anterior abierto (${viejosAbiertos.length})`);
  // El turno de hoy sigue el horario: abierto desde la apertura mientras dura el día, cerrado a la hora de cierre.
  const abiertos = turnos.filter((t) => t.estado === "abierto");
  const deHoy = turnos.filter((t) => diaLocal(t.abierto_at) === hoy);
  const hora = (d) => new Intl.DateTimeFormat("es-MX", { timeZone: zona, hour: "2-digit", minute: "2-digit" }).format(new Date(d));
  if (hHoy && ahora - hHoy.abre > MARGEN && hHoy.cierra - ahora > 0) {
    comprobar(abiertos.length === 1 && deHoy.length === 1 && new Date(abiertos[0].abierto_at).getTime() === hHoy.abre.getTime(),
      `en horario (${hora(hHoy.abre)}–${hora(hHoy.cierra)}): el turno de hoy abierto desde la apertura (${abiertos.map((t) => hora(t.abierto_at)).join(", ") || "ninguno abierto"})`);
  } else if (!hHoy || ahora < hHoy.abre || ahora - hHoy.cierra > MARGEN) {
    comprobar(abiertos.length === 0, `fuera de horario${hHoy ? ` (${hora(hHoy.abre)}–${hora(hHoy.cierra)})` : " (hoy no abre)"}: ningún turno abierto (${abiertos.length})`);
    if (hHoy && ahora > hHoy.cierra) {
      const malCerrados = deHoy.filter((t) => t.estado !== "cerrado" || new Date(t.cerrado_at).getTime() !== hHoy.cierra.getTime());
      comprobar(malCerrados.length === 0, `el turno de hoy (${deHoy.length}) cerrado a la hora de cierre`);
    }
  } else {
    console.log("  · a minutos de abrir o cerrar: el turno de hoy no se juzga");
  }

  // Los cobros de esas cuentas: método, fecha y su turno cerrado con diferencia $0.
  const reservasTerminadas = terminadas.map(([r]) => r);
  const cobros = [];
  for (let i = 0; i < reservasTerminadas.length; i += 100) {
    cobros.push(...exigir(await N.from("cobros").select("id, reserva_id, turno_id, created_at, cobro_metodos(metodo, monto)").eq("negocio_id", n.id).in("reserva_id", reservasTerminadas.slice(i, i + 100)).order("id"), "cobros"));
  }
  const salida = new Map(terminadas.map(([r, es]) => [r, es.map((e) => e.hora_salida_real).filter(Boolean).sort().at(-1)]));
  // Los check-outs de estancias_poner_al_dia: hotel a las 12:00 en punto; guardería a las horas reservadas (u 8 h) de
  // su entrada. sembrar-demo los hace a otras horas (12:10, 17:00 + minutos), así que no se confunden.
  const horaLocal = (iso) => new Intl.DateTimeFormat("en-GB", { timeZone: n.zona_horaria || "America/Mexico_City", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(iso));
  const automatica = (e) => e.estado === "finalizada" && e.hora_salida_real && (cat(e) === "hotel"
    ? horaLocal(e.hora_salida_real) === "12:00:00"
    : [4, 8].some((h) => new Date(e.hora_salida_real) - new Date(e.hora_entrada_real) === h * 3600_000)
      || new Date(e.hora_salida_real).getTime() === (horarioDe(e.fecha_entrada)?.cierra.getTime() ?? 0) - 15 * 60_000);
  const reservasAuto = new Set(terminadas.filter(([, es]) => es.some(automatica)).map(([r]) => r));
  // Y su cobro: el de demo_cobrar_cuentas, a los 5 minutos de la salida.
  const automaticos = cobros.filter((c) => reservasAuto.has(c.reserva_id) && Math.abs(new Date(c.created_at) - new Date(salida.get(c.reserva_id)) - 5 * 60_000) < 1000);
  // Las que no tienen cobro no debían nada (se pagaron con pase, o su cuenta quedó en $0).
  const conCobro = new Set(automaticos.map((c) => c.reserva_id));
  const sinCobro = [...reservasAuto].filter((r) => !conCobro.has(r));
  const sinCobroConSaldo = sinCobro.filter((r) => (saldos.get(r)?.saldo ?? 0) > 0);
  const conPase = sinCobro.filter((r) => (saldos.get(r)?.bono ?? 0) > 0).length;
  comprobar(sinCobroConSaldo.length === 0, `${reservasAuto.size} cuentas con check-out automático: ${conCobro.size} cobradas a los 5 min de la salida y ${sinCobro.length} sin saldo que cobrar (${conPase} con pase)`);
  const metodos = automaticos.flatMap((c) => c.cobro_metodos.map((m) => m.metodo));
  const terminal = metodos.filter((m) => m === "terminal").length;
  const efectivo = metodos.filter((m) => m === "efectivo").length;
  comprobar(metodos.length === efectivo + terminal, `cobros automáticos: ${automaticos.length} (${efectivo} en efectivo, ${terminal} con terminal; ningún otro método)`);
  if (automaticos.length >= 10) comprobar(terminal > 0 && terminal <= Math.ceil(automaticos.length * 0.3), `~1 de cada 10 con terminal (${terminal} de ${automaticos.length})`);
  const turnosDeCobros = [...new Set(automaticos.map((c) => c.turno_id))];
  if (turnosDeCobros.length) {
    const cortes = exigir(await N.from("cortes_caja").select("turno_id, corte_metodos(metodo, diferencia)").in("turno_id", turnosDeCobros).order("id"), "cortes");
    const conDif = cortes.filter((c) => c.corte_metodos.some((m) => Number(m.diferencia) !== 0));
    const sinCorte = turnosDeCobros.filter((t) => !cortes.some((c) => c.turno_id === t) && turnos.find((x) => x.id === t)?.estado !== "abierto");
    comprobar(conDif.length === 0 && sinCorte.length === 0, `sus ${turnosDeCobros.length} turnos cerrados con diferencia $0 (con diferencia: ${conDif.length}, sin corte: ${sinCorte.length})`);
    const fueraDeDia = automaticos.filter((c) => { const t = turnos.find((x) => x.id === c.turno_id); return t && diaLocal(t.abierto_at) !== diaLocal(c.created_at); });
    comprobar(fueraDeDia.length === 0, `cada cobro está en el turno de su día (${fueraDeDia.length} fuera)`);
  }

  // ── Estética y Veterinaria (20261202001000): cada cita atendida a su hora, cobrada, y la agenda de los próximos días.
  // Una cuenta terminada sin cobro solo puede esperar si ahora no hay turno abierto (se cobra en el siguiente).
  const hayTurnoAbierto = abiertos.length > 0;
  const desde30 = new Date(ahora - 30 * 86400_000).toISOString();
  const hasta7 = new Date(ahora.getTime() + 8 * 86400_000).toISOString();
  const cobrosDe = async (reservas) => {
    const pagadas = new Set();
    for (let i = 0; i < reservas.length; i += 100) {
      for (const c of exigir(await N.from("cobros").select("reserva_id").eq("negocio_id", n.id).in("reserva_id", reservas.slice(i, i + 100)).order("id"), "cobros")) pagadas.add(c.reserva_id);
    }
    return pagadas;
  };
  const sinCobrar = async (reservas) => {
    const pagadas = await cobrosDe(reservas);
    const deben = [];
    for (const r of reservas.filter((x) => !pagadas.has(x))) {
      const [t] = exigir(await N.rpc("cuenta_totales_reserva", { p_reserva_id: r }), "totales") ?? [];
      if (Number(t?.saldo ?? 0) > 0) deben.push(r);
    }
    return deben;
  };
  // Los días con horario de los próximos 6 (hoy, si todavía no cierra).
  const proximosDias = [];
  for (let k = 0; k <= 6; k++) {
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(ahora.getTime() + k * 86400_000));
    const hd = horarioDe(f);
    if (hd && !(k === 0 && ahora >= hd.cierra)) proximosDias.push(f);
  }

  console.log("  · estética");
  const citas = await todas(() => N.from("citas_estetica").select("id, reserva_id, estado, inicio, fin, recogido_por_nombre").eq("negocio_id", n.id).is("deleted_at", null).gte("inicio", desde30).lt("inicio", hasta7).order("id"));
  const sinAtender = citas.filter((c) => ["reservada", "confirmada"].includes(c.estado) && ahora - new Date(c.inicio) > 15 * 60_000 + MARGEN);
  const sinTerminar = citas.filter((c) => c.estado === "en_curso" && ahora - new Date(c.fin) > MARGEN);
  comprobar(sinAtender.length === 0 && sinTerminar.length === 0, `citas atendidas a su hora: ninguna pasada sin iniciar (${sinAtender.length}) ni en curso después de su fin (${sinTerminar.length})`);
  const recientes = citas.filter((c) => c.inicio >= "2026-10-25" && new Date(c.inicio) < ahora - MARGEN);
  const noVino = recientes.filter((c) => c.estado === "no_llego").length;
  if (recientes.length >= 10) comprobar(noVino <= Math.ceil(recientes.length * 0.3), `«No se presentó» ~1 de cada 10 (${noVino} de ${recientes.length})`);
  const terminadasEst = citas.filter((c) => c.estado === "finalizada" && ahora - new Date(c.fin) > 5 * 60_000 + MARGEN);
  comprobar(terminadasEst.every((c) => c.recogido_por_nombre), `cada cita finalizada dice quién recogió (${terminadasEst.filter((c) => !c.recogido_por_nombre).length} sin)`);
  const debenEst = await sinCobrar([...new Set(terminadasEst.map((c) => c.reserva_id))]);
  comprobar(debenEst.length === 0 || !hayTurnoAbierto, `${terminadasEst.length} citas finalizadas cobradas (${debenEst.length} sin cobrar${debenEst.length && !hayTurnoAbierto ? ", esperan al siguiente turno" : ""})`);
  const diasSinEst = proximosDias.filter((f) => !citas.some((c) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(new Date(c.inicio)) === f));
  comprobar(diasSinEst.length === 0, `agenda de estética en los próximos ${proximosDias.length} días con horario (sin citas: ${diasSinEst.join(", ") || "ninguno"})`);

  console.log("  · veterinaria");
  const vcitas = await todas(() => N.from("vet_citas").select("id, perro_id, estado, inicia_at, termina_at, consulta_id, motivo").eq("negocio_id", n.id).is("deleted_at", null).gte("inicia_at", desde30).lt("inicia_at", hasta7).order("id"));
  const vSinAtender = vcitas.filter((c) => ["programada", "confirmada"].includes(c.estado) && ahora - new Date(c.inicia_at) > MARGEN);
  const vSinFirmar = vcitas.filter((c) => c.estado === "en_curso" && ahora - new Date(c.termina_at) > MARGEN);
  comprobar(vSinAtender.length === 0 && vSinFirmar.length === 0, `citas clínicas atendidas a su hora: ninguna pasada sin abrir (${vSinAtender.length}) ni en curso después de su fin (${vSinFirmar.length})`);
  const consultas = await todas(() => N.from("vet_consultas").select("id, perro_id, cita_id, estado, atendida_at, firmada_at, motivo, diagnosticos, plan, tratamiento").eq("negocio_id", n.id).is("deleted_at", null).order("id"));
  const porId = new Map(consultas.map((c) => [c.id, c]));
  const atendidas = vcitas.filter((c) => c.estado === "finalizada" && c.inicia_at >= "2026-10-25");
  const malas = atendidas.filter((c) => {
    const co = porId.get(c.consulta_id);
    return !co || co.estado !== "firmada" || !co.motivo || !(co.diagnosticos?.length > 0) || !co.plan || !co.tratamiento
      || new Date(co.atendida_at).getTime() !== new Date(c.inicia_at).getTime()
      || new Date(co.firmada_at) < new Date(c.termina_at) || diaLocal(co.firmada_at) !== diaLocal(c.inicia_at);
  });
  comprobar(malas.length === 0, `${atendidas.length} citas clínicas atendidas por el demo: cada una con su consulta firmada ese día (motivo, diagnóstico, plan y tratamiento; atendida a la hora de la cita) (${malas.length} mal)`);
  const idsGen = new Set(atendidas.map((c) => c.consulta_id));
  const recetas = await todas(() => N.from("vet_recetas").select("id, consulta_id, perro_id, fecha_emision").eq("negocio_id", n.id).is("deleted_at", null).order("id"));
  const vacunas = await todas(() => N.from("carnet_vacunas").select("id, consulta_id, perro_id, fecha_aplicacion").eq("negocio_id", n.id).is("deleted_at", null).is("anulada_at", null).order("id"));
  const recGen = recetas.filter((r) => idsGen.has(r.consulta_id));
  const vacGen = vacunas.filter((v) => idsGen.has(v.consulta_id));
  const incoherentes = [...recGen.map((r) => [r.fecha_emision, r.perro_id, porId.get(r.consulta_id)]), ...vacGen.map((v) => [v.fecha_aplicacion, v.perro_id, porId.get(v.consulta_id)])]
    .filter(([f, perro, co]) => f !== diaLocal(co.atendida_at) || perro !== co.perro_id);
  comprobar(incoherentes.length === 0, `recetas (${recGen.length}) y vacunas (${vacGen.length}) del día y de la mascota de su consulta (${incoherentes.length} no)`);
  if (atendidas.length >= 9) {
    comprobar(vacGen.length <= Math.ceil(atendidas.length * 0.5), `vacuna en ~1 de cada 4 consultas (${vacGen.length} de ${atendidas.length})`);
    comprobar(recGen.length >= 1 && recGen.length <= Math.ceil(atendidas.length * 0.6), `receta en ~1 de cada 3 consultas (${recGen.length} de ${atendidas.length})`);
  }
  // Historial coherente: nada firmado antes de atenderse ni en el futuro, y las consultas del demo separadas 21 días por mascota.
  const alReves = consultas.filter((c) => c.estado === "firmada" && (new Date(c.firmada_at) < new Date(c.atendida_at) || new Date(c.atendida_at) > ahora));
  const porMascota = new Map();
  for (const c of consultas.filter((x) => idsGen.has(x.id))) porMascota.set(c.perro_id, [...(porMascota.get(c.perro_id) ?? []), new Date(c.atendida_at)]);
  const pegadas = [...porMascota.values()].filter((fs) => fs.sort((a, b) => a - b).some((f, i) => i > 0 && f - fs[i - 1] < 21 * 86400_000)).length;
  comprobar(alReves.length === 0 && pegadas === 0, `expedientes coherentes: ninguna firmada antes de atenderse o en el futuro (${alReves.length}), ninguna mascota con dos consultas del demo a menos de 21 días (${pegadas})`);
  const reservasVet = [];
  for (let i = 0; i < atendidas.length; i += 100) {
    const ids = atendidas.slice(i, i + 100).map((c) => c.consulta_id);
    const cargos = exigir(await N.from("vet_consulta_cargos").select("consulta_id, cargo_id, cargos_aplicados(reserva_id)").in("consulta_id", ids).not("cargo_id", "is", null).is("deleted_at", null).order("id"), "cargos");
    for (const x of cargos) { const ca = Array.isArray(x.cargos_aplicados) ? x.cargos_aplicados[0] : x.cargos_aplicados; if (ca?.reserva_id) reservasVet.push({ reserva: ca.reserva_id, fin: vcitas.find((c) => c.consulta_id === x.consulta_id)?.termina_at }); }
  }
  const listas = [...new Set(reservasVet.filter((x) => ahora - new Date(x.fin) > 5 * 60_000 + MARGEN).map((x) => x.reserva))];
  const debenVet = await sinCobrar(listas);
  comprobar(debenVet.length === 0 || !hayTurnoAbierto, `${listas.length} cuentas de consultas cobradas (${debenVet.length} sin cobrar${debenVet.length && !hayTurnoAbierto ? ", esperan al siguiente turno" : ""})`);
  // Y cada cobro de una consulta, en el turno del día de la consulta (el que se abrió ese día), no en uno de otro día.
  const cobrosVet = [];
  for (let i = 0; i < listas.length; i += 100) cobrosVet.push(...exigir(await N.from("cobros").select("id, reserva_id, turno_id, created_at, anulado_at").eq("negocio_id", n.id).in("reserva_id", listas.slice(i, i + 100)).is("anulado_at", null).order("id"), "cobros vet"));
  const finDe = new Map(reservasVet.map((x) => [x.reserva, x.fin]));
  const vetFuera = cobrosVet.filter((c) => { const t = turnos.find((x) => x.id === c.turno_id); return !t || diaLocal(t.abierto_at) !== diaLocal(finDe.get(c.reserva_id) ?? c.created_at); });
  comprobar(vetFuera.length === 0, `${cobrosVet.length} cobros de consultas, cada uno en el turno del día de su consulta (${vetFuera.length} fuera)`);
  const diasSinVet = proximosDias.filter((f) => !vcitas.some((c) => diaLocal(c.inicia_at) === f));
  comprobar(diasSinVet.length === 0, `agenda clínica en los próximos ${proximosDias.length} días con horario (sin citas: ${diasSinVet.join(", ") || "ninguno"})`);

  // Solo lectura: las cuentas sembradas (las gemelas del corredor de tutoriales y de la clínica demo escriben a propósito).
  const mem = exigir(await N.from("membresias").select("profile_id, solo_lectura").eq("negocio_id", n.id).is("deleted_at", null).order("id"), "membresías");
  let abiertas = 0;
  for (const m of mem.filter((x) => !x.solo_lectura)) {
    const correo = (await S.auth.admin.getUserById(m.profile_id)).data?.user?.email ?? "";
    if (!/^(tutoriales\.|demo\.mvz)/.test(correo)) abiertas++;
  }
  comprobar(abiertas === 0, `las cuentas sembradas del demo siguen en solo lectura (${abiertas} abiertas)`);
}

if (pruebasQA.length) {
  console.log("\n── negocios PRUEBA de QA: no cobran nada");
  for (const n of pruebasQA) {
    const N = cliente(n.id);
    const desde = new Date(Date.now() - 3 * 86400_000).toISOString();
    const recientes = exigir(await N.from("cobros").select("id, created_at, created_by, anulado_at").eq("negocio_id", n.id).gte("updated_at", desde).order("id"), "cobros");
    // Un cobro viejo que se anuló estos días también cambia su updated_at: anularlo no es cobrar hacia atrás.
    const automaticos = recientes.filter((c) => new Date(c.created_at) < new Date(desde) && !(c.anulado_at && new Date(c.anulado_at) >= new Date(desde)));
    comprobar(automaticos.length === 0, `${n.slug}: ningún cobro fechado hacia atrás (${automaticos.length})`);
  }
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exitCode = hallazgos.length ? 1 : 0;
