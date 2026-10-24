// El demo al día (QA S31 y su seguimiento, 24 de octubre de 2026) — SOLO LECTURA, no escribe nada.
//
//   node scripts/auditoria/demo-al-dia.mjs          desarrollo (.env.local)
//   node scripts/auditoria/demo-al-dia.mjs --prod   producción (llaves leídas al vuelo del CLI, nunca impresas)
//
// Comprueba que el demo (plan 'demo') se ve como un negocio operando:
//   1. Ninguna reserva de un día pasado sin check-in, y nadie adentro con la salida vencida.
//   2. Ninguna cuenta de estancias ya terminada (salida antes de hoy) con saldo: cada una está cobrada.
//   3. Ningún turno de caja de un día anterior abierto, y los turnos con cobros del demo cerrados con diferencia $0.
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
  const estancias = await todas(() => N.from("estancias").select("id, reserva_id, estado, fecha_entrada, fecha_salida, hora_entrada_real, hora_salida_real, servicios(categoria)").eq("negocio_id", n.id).is("deleted_at", null).order("id"));
  const cat = (e) => (Array.isArray(e.servicios) ? e.servicios[0] : e.servicios)?.categoria;
  const atrasadas = estancias.filter((e) => ["reservada", "confirmada"].includes(e.estado) && !e.hora_entrada_real && e.fecha_entrada < hoy);
  const vencidas = estancias.filter((e) => e.estado === "en_curso" && (cat(e) === "hotel" ? e.fecha_salida < hoy : e.fecha_entrada < hoy));
  comprobar(atrasadas.length === 0 && vencidas.length === 0, `sin llegadas atrasadas (${atrasadas.length}) ni adentro con la salida vencida (${vencidas.length})`);

  // Cuentas de estancias ya terminadas.
  const porReserva = new Map();
  for (const e of estancias) porReserva.set(e.reserva_id, [...(porReserva.get(e.reserva_id) ?? []), e]);
  const terminadas = [...porReserva.entries()].filter(([, es]) =>
    es.every((e) => ["finalizada", "no_llego", "cancelada"].includes(e.estado)) && es.some((e) => e.estado === "finalizada")
    && diaLocal(es.filter((e) => e.hora_salida_real).map((e) => e.hora_salida_real).sort().at(-1)) < hoy);
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
    : [4, 8].some((h) => new Date(e.hora_salida_real) - new Date(e.hora_entrada_real) === h * 3600_000));
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
    const recientes = exigir(await N.from("cobros").select("id, created_at, created_by").eq("negocio_id", n.id).gte("updated_at", desde).order("id"), "cobros");
    const automaticos = recientes.filter((c) => new Date(c.created_at) < new Date(desde));
    comprobar(automaticos.length === 0, `${n.slug}: ningún cobro fechado hacia atrás (${automaticos.length})`);
  }
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exitCode = hallazgos.length ? 1 : 0;
