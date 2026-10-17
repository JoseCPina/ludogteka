// Estética: una ausencia aprobada bloquea la agenda (SOLO DESARROLLO, Huellitas; nunca Ludogteka).
// Con el servidor prendido en el 3001 si se quiere ver la pantalla (esta auditoría es de base, JWT reales).
//
//   node scripts/auditoria/estetica-ausencias-dev.mjs
//
// 1. Ausencia de día completo: la estilista ausente no recibe citas ese día (agendar, reasignar, reprogramar);
//    el día anterior y el siguiente sí; otra estilista sí; antes de aprobar (solicitada) no bloquea.
// 2. Ausencia de medio día: solo bloquea las horas de la ausencia.
// 3. Al aprobar con una cita existente: la aprobación no se detiene, la lista de citas afectadas la trae,
//    y la cita sigue marcada hasta reasignarla (citas_en_ausencia).
// 4. Reasignar la cita a otra persona la saca de la lista; a la ausente se le rechaza.
// 5. Cancelar la ausencia libera la agenda.
// 6. Quién ve qué: recepción y admin la lista; el cliente y la llave anónima nada; otro negocio nada.
// 7. Las citas que ya existían siguen pudiendo cambiar de estado (la regla solo mira quién, cuándo y cuánto).
// 8. Pedir una ausencia de medio día: horas completas, un solo día, fin después del inicio, 0.5 día.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { todas, contar } from "../lib/paginar.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const cab = (token, negocio = B) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-negocio-id": negocio, "Content-Type": "application/json", Prefer: "return=representation" });
const llamar = async (url, opciones) => {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : "") };
};
const rpc = (token, fn, args = {}, negocio = B) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(args) });
const get = (token, ruta, negocio = B) => llamar(`${URL}/rest/v1/${ruta}`, { headers: cab(token, negocio) });
const sha = (t) => createHash("sha256").update(t).digest("hex");

const tAdmin = await tokenDe(datos.adminB);
const { data: recId } = await A.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
const tRecep = await tokenDe(recId);
const tEstetica = await tokenDe(datos.esteticaB);
const tCliente = await tokenDe(datos.cuentaSoloB);

const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const talla = (c) => tallas.find((t) => t.clave === c).id;
const { data: pelajes } = await A.from("tipos_pelaje").select("id, clave");
const pelaje = (c) => pelajes.find((t) => t.clave === c).id;
const { data: servicios } = await SB.from("servicios").select("id, clave").eq("categoria", "estetica").is("deleted_at", null);
const srv = (c) => servicios.find((s) => s.clave === `estetica_${c}`).id;
const { data: razas } = await A.from("razas").select("id, nombre, es_desconocida");
const raza = (n) => razas.find((r) => r.nombre === n)?.id;


const creados = { perros: [], citas: [], reservas: [], empleados: [], ausencias: [] };
const sufijo = String(Date.now()).slice(-6);
const comprobar = (cond, titulo) => (cond ? bien(titulo) : hallazgo(titulo));
const sumarDias = (f, n) => { const [y, m, d] = f.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const { data: hoyB } = await rpc(tAdmin, "fecha_negocio").then((r) => ({ data: r.cuerpo }));
const S1 = datos.esteticaB;
const S2 = datos.esteticaAmbos;

const { data: perroData, error: errPerro } = await SB.from("perros").insert({
  cliente_id: datos.clienteSoloB, nombre: `ZZ ausencia ${sufijo}`, raza: "Poodle", raza_id: raza("Poodle"), tamano_id: talla("chico"), pelaje_id: pelaje("medio"),
}).select("id").single();
if (errPerro) throw new Error(`perro de prueba: ${errPerro.message}`);
const perro = perroData.id;
creados.perros.push(perro);

const nuevaCita = async (token, empleado, inicio, extra = {}) => {
  const rr = await llamar(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
  const reservaId = rr.cuerpo?.[0]?.id;
  creados.reservas.push(reservaId);
  const r = await llamar(`${URL}/rest/v1/citas_estetica`, {
    method: "POST", headers: cab(token),
    body: JSON.stringify({ reserva_id: reservaId, perro_id: perro, servicio_id: srv("estetico"), empleado_id: empleado, inicio, ...extra }),
  });
  const fila = r.cuerpo?.[0];
  if (r.ok && fila?.id) creados.citas.push(fila.id);
  return { ok: r.ok, mensaje: r.mensaje, fila };
};
const empleadoDeCita = async (id) => (await SB.from("citas_estetica").select("empleado_id").eq("id", id).single()).data?.empleado_id;

try {
  // Los empleados (la ausencia es del empleado; la cita, de su cuenta).
  await SB.from("empleados").update({ deleted_at: new Date().toISOString() }).like("nombre", "Prueba ausencia%").is("deleted_at", null);
  const altaEmp = async (nombre, profile) => {
    // Una persona solo puede tener un empleado vivo: si otra corrida lo dejó, se usa ese (y no se borra).
    const previo = await SB.from("empleados").select("id").eq("profile_id", profile).is("deleted_at", null).maybeSingle();
    if (previo.data) return previo.data.id;
    const e = await SB.from("empleados").insert({ nombre: `Prueba ausencia ${nombre} ${sufijo}`, puesto: "Estilista", fecha_ingreso: sumarDias(hoyB, -60), telefono: "4440000000", emergencia_nombre: "Contacto", emergencia_telefono: "4441111111", profile_id: profile }).select("id").single();
    if (e.error) throw new Error(`empleado ${nombre}: ${e.error.message}`);
    creados.empleados.push(e.data.id);
    return e.data.id;
  };
  const E1 = await altaEmp("uno", S1);
  const E2 = await altaEmp("dos", S2);
  const pedir = (token, emp, tipo, desde, hasta, extra = {}) => rpc(token, "solicitar_ausencia", { p_empleado_id: emp, p_tipo: tipo, p_desde: desde, p_hasta: hasta, p_motivo: "prueba", ...extra });
  const aprobar = (id) => rpc(tAdmin, "resolver_ausencia", { p_ausencia_id: id, p_aprobar: true, p_motivo: null });
  const idDe = (r) => (typeof r.cuerpo === "string" ? r.cuerpo : null);

  const base = 200 + Math.floor(Math.random() * 100);
  const fA = sumarDias(hoyB, base);        // día completo
  const fAntes = sumarDias(fA, -1);
  const fDespues = sumarDias(fA, 1);
  const fM = sumarDias(hoyB, base + 10);   // medio día
  const mediodia = (f) => `${f}T20:00:00Z`; // 12:00–13:00 locales
  const manana = (f) => `${f}T17:00:00Z`;   // 09:00–10:00 locales (Tijuana, con o sin horario de verano: 09:00 o 10:00)
  const tarde = (f) => `${f}T23:00:00Z`;    // 15:00–16:00 locales

  console.log("── 1. Día completo");
  // Una cita que ya existía en el día, antes de aprobar.
  const existente = await nuevaCita(tAdmin, S1, mediodia(fA));
  comprobar(existente.ok, `se agenda una cita de la estilista ese día antes de la ausencia${existente.ok ? "" : ": " + existente.mensaje}`);
  const antesCita = await nuevaCita(tAdmin, S1, mediodia(fAntes));
  const despuesCita = await nuevaCita(tAdmin, S1, mediodia(fDespues));
  comprobar(antesCita.ok && despuesCita.ok, "citas del día anterior y del siguiente (para mover después)");

  const a1 = await pedir(tAdmin, E1, "dia_personal", fA, fA);
  comprobar(a1.ok && idDe(a1), `se pide la ausencia de día completo${a1.ok ? "" : ": " + a1.mensaje}`);
  creados.ausencias.push(idDe(a1));
  const aunSolicitada = await nuevaCita(tAdmin, S1, `${fA}T15:30:00Z`);
  comprobar(aunSolicitada.ok, "mientras solo está solicitada NO bloquea la agenda");
  if (aunSolicitada.ok) await SB.from("citas_estetica").update({ estado: "cancelada" }).eq("id", aunSolicitada.fila.id);

  const aprobada = await aprobar(idDe(a1));
  comprobar(aprobada.ok, `aprobar NO se detiene porque la persona ya tiene una cita ese día${aprobada.ok ? "" : ": " + aprobada.mensaje}`);

  const rechazada = await nuevaCita(tAdmin, S1, tarde(fA));
  comprobar(!rechazada.ok && /ausencia aprobada/i.test(rechazada.mensaje), `ya no se le agenda una cita ese día («${rechazada.mensaje.slice(0, 90)}»)`);
  const rechazadaRec = await nuevaCita(tRecep, S1, manana(fA));
  comprobar(!rechazadaRec.ok, "tampoco recepción");
  const otraEstilista = await nuevaCita(tAdmin, S2, tarde(fA));
  comprobar(otraEstilista.ok, "otra estilista sí recibe citas ese día");
  comprobar((await nuevaCita(tAdmin, S1, mediodia(fAntes).replace("20:00", "22:30"))).ok, "el día anterior sí (misma estilista)");
  comprobar((await nuevaCita(tAdmin, S1, tarde(fDespues))).ok, "el día siguiente sí (misma estilista)");

  // Reprogramar: mover al día de la ausencia
  const mover = await rpc(tAdmin, "reprogramar_cita_estetica", { p_cita_id: antesCita.fila.id, p_inicio: `${fA}T16:30:00Z`, p_motivo: "prueba" });
  comprobar(!mover.ok && /ausencia aprobada/i.test(mover.mensaje), `mover una cita de ella al día de la ausencia se rechaza («${mover.mensaje.slice(0, 80)}»)`);
  comprobar(new Date((await SB.from("citas_estetica").select("inicio").eq("id", antesCita.fila.id).single()).data.inicio).toISOString().slice(0, 10) === fAntes, "y la cita no se movió");
  // Reasignar a ella una cita de otra persona ese día
  const deOtra = otraEstilista.fila;
  const pasar = await rpc(tAdmin, "reasignar_estilista_cita", { p_cita_id: deOtra.id, p_empleado_id: S1, p_motivo: null });
  comprobar(!pasar.ok && /ausencia aprobada/i.test(pasar.mensaje) && (await empleadoDeCita(deOtra.id)) === S2, "pasarle a la ausente la cita de otra persona se rechaza");

  console.log("── 3/4. La cita que ya existía queda marcada hasta reasignarla");
  const afectadas = await rpc(tAdmin, "citas_afectadas_por_ausencia", { p_ausencia_id: idDe(a1) });
  comprobar(afectadas.ok && afectadas.cuerpo.length === 1 && afectadas.cuerpo[0].cita_id === existente.fila.id, `la lista de citas afectadas trae la cita existente (${afectadas.ok ? afectadas.cuerpo.length : afectadas.mensaje})`);
  const enAus = await rpc(tAdmin, "citas_en_ausencia");
  comprobar(enAus.ok && enAus.cuerpo.some((c) => c.cita_id === existente.fila.id), "citas_en_ausencia la marca (agenda e Inicio)");
  comprobar(enAus.ok && !enAus.cuerpo.some((c) => c.cita_id === antesCita.fila.id || c.cita_id === despuesCita.fila.id), "las citas de los días vecinos no se marcan");
  // Una cita que ya existía puede cambiar de estado sin que la regla estorbe.
  const conf = await SB.from("citas_estetica").update({ estado: "confirmada" }).eq("id", existente.fila.id);
  comprobar(!conf.error, `cambiar de estado una cita que ya existía en el día de la ausencia no se bloquea${conf.error ? ": " + conf.error.message : ""}`);

  console.log("── 6. Quién ve qué");
  for (const [quien, token] of [["recepción", tRecep], ["estética", tEstetica]]) {
    const r = await rpc(token, "citas_en_ausencia");
    comprobar(r.ok && r.cuerpo.some((c) => c.cita_id === existente.fila.id), `${quien} ve la marca`);
  }
  const lista = await rpc(tRecep, "citas_afectadas_por_ausencia", { p_ausencia_id: idDe(a1) });
  comprobar(lista.ok && lista.cuerpo.length === 1, "recepción ve la lista para reasignar");
  const listaEst = await rpc(tEstetica, "citas_afectadas_por_ausencia", { p_ausencia_id: idDe(a1) });
  comprobar(!listaEst.ok || listaEst.cuerpo.length === 0, "estética no ve la lista de reasignación");
  for (const [quien, token] of [["el cliente", tCliente], ["la llave anónima", null]]) {
    const a = await rpc(token, "citas_en_ausencia");
    const b = await rpc(token, "citas_afectadas_por_ausencia", { p_ausencia_id: idDe(a1) });
    const c = await rpc(token, "estilistas_ausentes", { p_inicio: `${fA}T00:00:00Z`, p_fin: `${fA}T23:59:00Z` });
    comprobar((!a.ok || a.cuerpo.length === 0) && (!b.ok || b.cuerpo.length === 0) && (!c.ok || c.cuerpo.length === 0), `${quien} no ve nada de esto`);
  }
  const otroNeg = await rpc(tAdmin, "citas_en_ausencia", {}, LUDOGTEKA);
  comprobar(!otroNeg.ok || otroNeg.cuerpo.length === 0, "con el encabezado de otro negocio no se alcanza");
  const rechazaRec = await rpc(tRecep, "resolver_ausencia", { p_ausencia_id: idDe(a1), p_aprobar: true, p_motivo: null });
  comprobar(!rechazaRec.ok, "recepción no aprueba (solo admin)");
  const ausentes = await rpc(tRecep, "estilistas_ausentes", { p_inicio: tarde(fA), p_fin: `${fA}T23:59:00Z` });
  comprobar(ausentes.ok && ausentes.cuerpo.some((x) => x.profile_id === S1) && !ausentes.cuerpo.some((x) => x.profile_id === S2), "estilistas_ausentes dice quién no está disponible (para no ofrecerla al agendar)");

  console.log("── 4. Reasignar");
  const aLaAusente = await rpc(tAdmin, "reasignar_estilista_cita", { p_cita_id: existente.fila.id, p_empleado_id: S1, p_motivo: null });
  comprobar(aLaAusente.ok && aLaAusente.cuerpo?.sin_cambio, "reasignarle a la misma persona no cambia nada");
  const reas = await rpc(tAdmin, "reasignar_estilista_cita", { p_cita_id: existente.fila.id, p_empleado_id: S2, p_motivo: "Ausencia aprobada de la estilista" });
  comprobar(reas.ok && (await empleadoDeCita(existente.fila.id)) === S2, `se reasigna a otra estilista${reas.ok ? "" : ": " + reas.mensaje}`);
  const enAus2 = await rpc(tAdmin, "citas_en_ausencia");
  comprobar(enAus2.ok && !enAus2.cuerpo.some((c) => c.cita_id === existente.fila.id), "ya no aparece marcada");
  const afect2 = await rpc(tAdmin, "citas_afectadas_por_ausencia", { p_ausencia_id: idDe(a1) });
  comprobar(afect2.ok && afect2.cuerpo.length === 0, "ni en la lista de la ausencia");

  console.log("── 5. Cancelar la ausencia libera la agenda");
  const canc = await rpc(tAdmin, "cancelar_ausencia", { p_ausencia_id: idDe(a1), p_motivo: "prueba" });
  comprobar(canc.ok, `se cancela la ausencia aprobada${canc.ok ? "" : ": " + canc.mensaje}`);
  const libre = await nuevaCita(tAdmin, S1, `${fA}T21:30:00Z`);
  comprobar(libre.ok, `la estilista vuelve a recibir citas ese día${libre.ok ? "" : ": " + libre.mensaje}`);

  console.log("── 2. Medio día");
  const m1 = await pedir(tAdmin, E1, "dia_personal", fM, fM, { p_hora_desde: "09:00", p_hora_hasta: "13:00" });
  comprobar(m1.ok && idDe(m1), `se pide una ausencia de 09:00 a 13:00${m1.ok ? "" : ": " + m1.mensaje}`);
  creados.ausencias.push(idDe(m1));
  const filaM = (await SB.from("ausencias").select("dias, hora_desde, hora_hasta").eq("id", idDe(m1)).single()).data;
  comprobar(Number(filaM?.dias) === 0.5 && filaM.hora_desde?.startsWith("09:00"), "cuenta medio día");
  comprobar((await aprobar(idDe(m1))).ok, "se aprueba");
  const am = await nuevaCita(tAdmin, S1, manana(fM));
  comprobar(!am.ok && /ausencia aprobada/i.test(am.mensaje), `en la mañana (dentro de las horas) se rechaza («${am.mensaje.slice(0, 100)}»)`);
  const pm = await nuevaCita(tAdmin, S1, tarde(fM));
  comprobar(pm.ok, `en la tarde (fuera de las horas) se agenda${pm.ok ? "" : ": " + pm.mensaje}`);
  const ausM = await rpc(tRecep, "estilistas_ausentes", { p_inicio: tarde(fM), p_fin: `${fM}T23:59:00Z` });
  comprobar(ausM.ok && !ausM.cuerpo.some((x) => x.profile_id === S1), "para la tarde no figura como ausente");
  const ausM2 = await rpc(tRecep, "estilistas_ausentes", { p_inicio: manana(fM), p_fin: `${fM}T18:00:00Z` });
  comprobar(ausM2.ok && ausM2.cuerpo.some((x) => x.profile_id === S1), "para la mañana sí");
  await rpc(tAdmin, "cancelar_ausencia", { p_ausencia_id: idDe(m1), p_motivo: "prueba" });

  console.log("── 8. Validaciones de la ausencia de medio día");
  const fV = sumarDias(hoyB, base + 20);
  const v1 = await pedir(tAdmin, E2, "dia_personal", fV, fV, { p_hora_desde: "09:00" });
  comprobar(!v1.ok && /hora de inicio y la de fin/i.test(v1.mensaje), "una sola hora se rechaza");
  const v2 = await pedir(tAdmin, E2, "dia_personal", fV, sumarDias(fV, 1), { p_hora_desde: "09:00", p_hora_hasta: "13:00" });
  comprobar(!v2.ok && /un solo día/i.test(v2.mensaje), "por horas solo un día");
  const v3 = await pedir(tAdmin, E2, "dia_personal", fV, fV, { p_hora_desde: "13:00", p_hora_hasta: "09:00" });
  comprobar(!v3.ok && /después/i.test(v3.mensaje), "el fin tiene que ser después del inicio");
  const v4 = await pedir(tAdmin, E2, "dia_personal", fV, fV, { p_hora_desde: "09:00", p_hora_hasta: "11:00" });
  const v5 = await pedir(tAdmin, E2, "dia_personal", fV, fV, { p_hora_desde: "13:00", p_hora_hasta: "15:00" });
  const v6 = await pedir(tAdmin, E2, "dia_personal", fV, fV, { p_hora_desde: "10:00", p_hora_hasta: "14:00" });
  comprobar(v4.ok && v5.ok && !v6.ok, "dos medios días del mismo día no se cruzan, y uno que se cruza se rechaza");
  for (const r of [v4, v5]) if (r.ok) creados.ausencias.push(idDe(r));
  const v7 = await pedir(tAdmin, E2, "dia_personal", fV, fV);
  comprobar(!v7.ok, "un día completo sobre horas ya pedidas se rechaza");
  const sinAdmin = await pedir(tCliente, E2, "dia_personal", sumarDias(fV, 3), sumarDias(fV, 3));
  comprobar(!sinAdmin.ok, `un cliente no pide ausencias${sinAdmin.ok ? " (respondió " + JSON.stringify(sinAdmin.cuerpo).slice(0, 80) + ")" : ""}`);
  if (sinAdmin.ok && idDe(sinAdmin)) creados.ausencias.push(idDe(sinAdmin));
  // Un guardia contra NULL: quien no es empleado (mi_empleado_id() NULL) tampoco cancela la solicitud de otro.
  const sol = await pedir(tAdmin, E2, "dia_personal", sumarDias(fV, 5), sumarDias(fV, 5));
  if (sol.ok) creados.ausencias.push(idDe(sol));
  const cancelaAjena = await rpc(tCliente, "cancelar_ausencia", { p_ausencia_id: idDe(sol), p_motivo: "prueba" });
  comprobar(!cancelaAjena.ok, "un cliente no cancela la solicitud de otro");
  const recepSinFicha = await pedir(tRecep, E1, "dia_personal", sumarDias(fV, 6), sumarDias(fV, 6));
  comprobar(!recepSinFicha.ok, `recepción no pide por quien tiene cuenta en la app${recepSinFicha.ok ? "" : ""}`);
  if (recepSinFicha.ok && idDe(recepSinFicha)) creados.ausencias.push(idDe(recepSinFicha));
} finally {
  for (const id of creados.citas) await SB.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.reservas) await SB.from("reservas").delete().eq("id", id);
  for (const id of creados.ausencias) await SB.from("vacaciones_movimientos").delete().eq("ausencia_id", id);
  for (const id of creados.ausencias) await SB.from("ausencias").delete().eq("id", id);
  await SB.from("empleados").update({ deleted_at: new Date().toISOString() }).in("id", creados.empleados);
  await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
}

console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en la base.");
void LUDOGTEKA; void REF; void BASE; void fs; void execFileSync; void randomBytes; void sha; void get; void todas; void contar; void abrirNavegador;
process.exit(hallazgos.length ? 1 : 0);
