// N125 — check-in, check-out y reserva fuera del horario del negocio (SOLO DESARROLLO, Huellitas).
//
//   node scripts/auditoria/fuera-horario-dev.mjs            (por la API, con el JWT real del personal)
//   AUDITORIA_UI=1 node scripts/auditoria/fuera-horario-dev.mjs   (además la pantalla, con `next start` en el 3001)
//
// 1. Reserva de hotel con entrada en un día que el negocio no abre: sin confirmar la base la rechaza (hint
//    `dia_cerrado`); confirmada se guarda y queda anotado qué se confirmó. Cambiarla a otro día cerrado vuelve a pedir
//    la confirmación.
// 2. Check-in de guardería hoy a una hora fuera del horario (o en día cerrado): sin confirmar, «El negocio está cerrado
//    hoy; ¿registrar de todos modos?» (o «… a esta hora …»), hint `fuera_horario`, y NO entra; confirmado entra y queda
//    anotado (columna + registro_ediciones, la bitácora).
// 3. Check-out igual. 4. Dentro del horario no se pregunta nada (si hoy abre). 5. La llave anónima no llama la función.
// 6. (AUDITORIA_UI) Si AHORA es fuera de horario, la pantalla de check-in enseña la pregunta y «Registrar la entrada de
//    todos modos».
// Deja todo dado de baja al terminar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const comprobar = (c, t) => { if (c) console.log(`  ✔ ${t}`); else { hallazgos.push(t); console.log(`  ✘ ${t}`); } };
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const como = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const admin = await como(datos.adminB);
const sufijo = String(Date.now()).slice(-6);

const { data: neg } = await SB.from("negocios").select("zona_horaria").eq("id", B).single();
const ZONA = neg.zona_horaria;
const fechaLocal = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
// Un instante de hoy a la hora local dada (la zona del negocio, con su horario de verano).
function instanteLocal(fecha, hora) {
  const guess = new Date(`${fecha}T${hora}:00Z`);
  const partes = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: ZONA, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(guess).map((p) => [p.type, p.value]));
  const comoLocal = Date.UTC(+partes.year, +partes.month - 1, +partes.day, +partes.hour, +partes.minute);
  return new Date(guess.getTime() - (comoLocal - guess.getTime())).toISOString();
}
const sumarDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const HOY = fechaLocal(new Date());
const horario = async (f) => (await SB.rpc("resolver_cupo_configuracion", { p_fecha: f })).data?.[0] ?? null;
const hoyH = await horario(HOY);
const hoyAbre = Boolean(hoyH?.hora_apertura && hoyH?.hora_cierre);
let cerrado = null;
for (let i = 1; i <= 14 && !cerrado; i++) {
  const f = sumarDias(HOY, i);
  const h = await horario(f);
  if (h?.estado === "configurado" && !h.hora_apertura) cerrado = f;
}
const { data: servicios } = await SB.from("servicios").select("id, categoria, unidad").eq("negocio_id", B).in("categoria", ["hotel", "guarderia"]).is("deleted_at", null);
const HOTEL = servicios.find((s) => s.categoria === "hotel")?.id;
const GUARDE = servicios.find((s) => s.categoria === "guarderia" && s.unidad === "dia")?.id;
// Su propio perro, con talla y pelaje (lo que piden la guardería y el hotel para cotizar), dado de baja al terminar.
// El catálogo de razas es por especie (QA S39): «Mestizo» existe de perro y de gato, se toma el de perro.
const { data: mestizo } = await A.from("razas").select("id").eq("nombre", "Mestizo").eq("especie", "perro").maybeSingle();
const { data: tam } = await A.from("tamanos_categoria").select("id").is("deleted_at", null).order("orden").limit(1).single();
const { data: pel } = await A.from("tipos_pelaje").select("id").is("deleted_at", null).order("orden").limit(1).single();
if (!tam || !pel) throw new Error("No encontré una talla y un pelaje en el catálogo.");

const creadas = { reservas: [], estancias: [], perros: [] };
const { data: perro, error: ePerro } = await SB.from("perros").insert({
  negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ Horario ${sufijo}`, especie: "perro",
  raza: "Mestizo", raza_id: mestizo?.id ?? null, tamano_id: tam.id, pelaje_id: pel.id,
}).select("id").single();
if (ePerro) throw new Error(`perro de prueba: ${ePerro.message}`);
creadas.perros.push(perro.id);

async function estancia(servicio, entrada, salida, extra = {}) {
  const { data: r } = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB, notas: `ZZ horario ${sufijo}` }).select("id").single();
  creadas.reservas.push(r.id);
  const res = await admin.from("estancias").insert({
    reserva_id: r.id, perro_id: perro.id, servicio_id: servicio, fecha_entrada: entrada, fecha_salida: salida,
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Auditoría de horario",
    bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Auditoría de horario", ...extra,
  }).select("id, dia_cerrado_confirmado").single();
  if (res.data) creadas.estancias.push(res.data.id);
  return res;
}

try {
  console.log(`Hoy ${HOY} (${ZONA}): ${hoyAbre ? `abre de ${hoyH.hora_apertura} a ${hoyH.hora_cierre}` : "no abre"}; próximo día cerrado: ${cerrado ?? "ninguno"}`);

  console.log("1. Reserva de hotel con entrada en día cerrado");
  if (!cerrado) {
    comprobar(false, "Huellitas no tiene un día cerrado en las próximas dos semanas: no se puede probar la reserva");
  } else {
    const sin = await estancia(HOTEL, cerrado, sumarDias(cerrado, 1));
    comprobar(sin.error?.hint === "dia_cerrado" && /no recibe perros/.test(sin.error.message), `sin confirmar se rechaza (${sin.error?.hint}: ${sin.error?.message})`);
    const con = await estancia(HOTEL, cerrado, sumarDias(cerrado, 1), { dia_cerrado_confirmado: "confirmado" });
    comprobar(!con.error && /^Con el negocio cerrado: entrada el /.test(con.data?.dia_cerrado_confirmado ?? ""), `confirmada se guarda y queda anotado («${con.data?.dia_cerrado_confirmado ?? con.error?.message}»)`);
    if (con.data) {
      let otro = null;
      for (let i = 1; i <= 21 && !otro; i++) { const f = sumarDias(cerrado, i); const h = await horario(f); if (h?.estado === "configurado" && !h.hora_apertura) otro = f; }
      if (otro) {
        const mover = await admin.from("estancias").update({ fecha_entrada: otro, fecha_salida: sumarDias(otro, 1) }).eq("id", con.data.id);
        comprobar(mover.error?.hint === "dia_cerrado", `moverla a otro día cerrado sin confirmar se rechaza (${mover.error?.message ?? "entró"})`);
      }
      const nota = await admin.from("estancias").update({ dia_cerrado_confirmado: "algo inventado" }).eq("id", con.data.id).select("dia_cerrado_confirmado").single();
      comprobar(/^Con el negocio cerrado/.test(nota.data?.dia_cerrado_confirmado ?? ""), "la anotación no se escribe a mano");
    }
  }

  console.log("2. Check-in fuera del horario");
  const extraHoy = hoyAbre ? {} : { dia_cerrado_confirmado: "confirmado" };
  const g = await estancia(GUARDE, HOY, sumarDias(HOY, 1), extraHoy);
  comprobar(!g.error, `guardería de hoy creada${hoyAbre ? "" : " (hoy no abre: con la confirmación)"} ${g.error?.message ?? ""}`);
  const madrugada = instanteLocal(HOY, "00:30");
  const entrar = (extra) => admin.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Auditoría", hora_entrada_real: madrugada, ...extra }).eq("id", g.data.id).select("estado, checkin_fuera_horario").single();
  const e1 = await entrar({});
  const esperado = hoyAbre ? /^El negocio está cerrado a esta hora \(hoy abre de \d\d:\d\d a \d\d:\d\d\); ¿registrar de todos modos\?$/ : /^El negocio está cerrado hoy; ¿registrar de todos modos\?$/;
  comprobar(e1.error?.hint === "fuera_horario" && esperado.test(e1.error.message), `sin confirmar pregunta: «${e1.error?.message ?? "entró sin preguntar"}»`);
  const { data: sigue } = await SB.from("estancias").select("estado").eq("id", g.data.id).single();
  comprobar(sigue.estado !== "en_curso", `y no entra (${sigue.estado})`);
  const e2 = await entrar({ checkin_fuera_horario: "confirmado" });
  comprobar(!e2.error && e2.data?.estado === "en_curso" && /00:30|no abre ese día/.test(e2.data?.checkin_fuera_horario ?? ""), `confirmado entra y queda anotado («${e2.data?.checkin_fuera_horario ?? e2.error?.message}»)`);
  const { data: bit } = await SB.from("registro_ediciones").select("cambios, profile_id").eq("tabla", "estancias").eq("registro_id", g.data.id).order("ultimo_at", { ascending: false }).limit(1);
  comprobar(bit?.[0]?.profile_id === datos.adminB && JSON.stringify(bit?.[0]?.cambios ?? {}).includes("checkin_fuera_horario"), "la bitácora (registro_ediciones) anota quién lo hizo");

  const directo = await estancia(GUARDE, HOY, sumarDias(HOY, 1), { ...extraHoy, estado: "en_curso", entregado_por_nombre: "Auditoría", hora_entrada_real: madrugada });
  comprobar(directo.error?.hint === "fuera_horario", `darla de alta ya «en curso» por la API también pregunta (${directo.error?.message ?? "entró"})`);

  console.log("3. Check-out fuera del horario");
  const noche = instanteLocal(HOY, "23:50");
  const salir = (extra) => admin.from("estancias").update({ estado: "finalizada", recogido_por_nombre: "Auditoría", recogido_por_es_dueno: true, hora_salida_real: noche, ...extra }).eq("id", g.data.id).select("estado, checkout_fuera_horario, checkin_fuera_horario").single();
  const s1 = await salir({});
  comprobar(s1.error?.hint === "fuera_horario" && esperado.test(s1.error.message), `sin confirmar pregunta: «${s1.error?.message ?? "salió sin preguntar"}»`);
  const s2 = await salir({ checkout_fuera_horario: "confirmado" });
  comprobar(!s2.error && s2.data?.estado === "finalizada" && /23:50|no abre ese día/.test(s2.data?.checkout_fuera_horario ?? ""), `confirmado sale y queda anotado («${s2.data?.checkout_fuera_horario ?? s2.error?.message}»)`);
  comprobar(Boolean(s2.data?.checkin_fuera_horario), "la anotación del check-in se conserva");

  console.log("4. Dentro del horario no se pregunta");
  if (hoyAbre) {
    const g2 = await estancia(GUARDE, HOY, sumarDias(HOY, 1));
    const [h, m] = hoyH.hora_apertura.split(":").map(Number);
    const dentro = instanteLocal(HOY, `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    const r = await admin.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Auditoría", hora_entrada_real: dentro }).eq("id", g2.data.id).select("checkin_fuera_horario").single();
    comprobar(!r.error && r.data?.checkin_fuera_horario === null, `entra sin pregunta ${r.error?.message ?? ""}`);
  }
  // La hora fuera de rango, contra el próximo día que abre (la misma función que usa el trigger).
  let abierto = null;
  for (let i = 1; i <= 7 && !abierto; i++) { const f = sumarDias(HOY, i); const h = await horario(f); if (h?.hora_apertura) abierto = { f, h }; }
  if (abierto) {
    const [h, m] = abierto.h.hora_apertura.split(":").map(Number);
    const antes = instanteLocal(abierto.f, `${String(h - 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    const dentro = instanteLocal(abierto.f, `${String(h + 1).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    const fa = (await admin.rpc("fuera_de_horario", { p_momento: antes })).data;
    const fd = (await admin.rpc("fuera_de_horario", { p_momento: dentro })).data;
    const pq = (await admin.rpc("pregunta_fuera_de_horario", { p_momento: antes })).data;
    comprobar(/fuera del horario de/.test(fa ?? "") && fd === null, `${abierto.f}: una hora antes de abrir está fuera («${fa}»), una después no (${fd})`);
    comprobar(/^El negocio está cerrado a esta hora \(hoy abre de \d\d:\d\d a \d\d:\d\d\); ¿registrar de todos modos\?$/.test(pq ?? ""), `y la pregunta dice el horario: «${pq}»`);
  }

  console.log("5. La llave anónima");
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
  const fa = await anon.rpc("fuera_de_horario", { p_momento: new Date().toISOString() });
  comprobar(Boolean(fa.error), `no llama fuera_de_horario (${fa.error?.code ?? "entró"})`);

  if (process.env.AUDITORIA_UI === "1") {
    console.log("6. La pantalla de check-in (si ahora es fuera de horario)");
    const { data: ahora } = await admin.rpc("fuera_de_horario", { p_momento: new Date().toISOString() });
    if (!ahora) {
      console.log("  · ahora es dentro del horario: la pantalla no pregunta (se prueba fuera de horario)");
    } else {
      const { abrirNavegador } = await import("../lib/navegador.mjs");
      const g3 = await estancia(GUARDE, HOY, sumarDias(HOY, 1), extraHoy);
      const { data: u } = await A.auth.admin.getUserById(datos.recepcionB);
      const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
      const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
      const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
      const trozos = valor.match(/.{1,3180}/g);
      const galletas = (n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, i) => [`${n}.${i}`, t]));
      const nav = await abrirNavegador();
      try {
        const ctx = await nav.newContext({ viewport: { width: 390, height: 900 } });
        await ctx.addCookies(galletas(`sb-${REF}-auth-token`).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" })));
        const p = await ctx.newPage();
        p.setDefaultTimeout(60000);
        await p.goto(`${BASE}/reservas/estancias/${g3.data.id}/checkin`, { waitUntil: "networkidle", timeout: 120000 });
        await p.locator("#checkin-entrega-quien").selectOption({ index: 1 });
        await p.locator("[data-confirmar-checkin]").click();
        const aviso = await p.locator("[data-aviso-fuera-horario]").textContent({ timeout: 30000 }).catch(() => null);
        comprobar(/^El negocio está cerrado/.test(aviso ?? ""), `la pantalla pregunta: «${aviso}»`);
        await p.locator("[data-confirmar-fuera-horario]").click();
        const anotado = await p.locator("[data-checkin-fuera-horario]").textContent({ timeout: 30000 }).catch(() => null);
        comprobar(/Entró fuera del horario/.test(anotado ?? ""), `confirmado, registra y lo dice: «${anotado}»`);
        await ctx.close();
      } finally {
        await nav.close();
      }
    }
  }
} finally {
  const ahora = new Date().toISOString();
  if (creadas.estancias.length) await SB.from("estancias").update({ deleted_at: ahora }).in("id", creadas.estancias);
  if (creadas.reservas.length) await SB.from("reservas").update({ deleted_at: ahora }).in("id", creadas.reservas);
  if (creadas.perros.length) await SB.from("perros").update({ deleted_at: ahora }).in("id", creadas.perros);
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
