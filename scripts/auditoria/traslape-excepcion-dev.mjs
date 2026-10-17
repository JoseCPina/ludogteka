// B21 y excepción sanitaria (QA externa, 15 de octubre de 2026) — SOLO DESARROLLO, Huellitas, con el servidor
// en el 3001.
//
//   node scripts/auditoria/traslape-excepcion-dev.mjs
//
// 1. Una guardería FINALIZADA no impide otra visita el mismo día; una reservada o en curso sí (23P01).
// 2. estancia_que_choca dice con cuál choca (mascota, módulo, fechas, estado) y el mensaje lleva al día correcto;
//    la llave anónima y un cliente no la ejecutan.
// 3. El panel del día del calendario muestra también las finalizadas y las canceladas, con su estado.
// 4. El rechazo por vacunas (mensaje real de la base) se reconoce como bloqueo sanitario, dice que también puede
//    autorizar quien tiene «Excepciones al reservar», y esa persona (recepción con el permiso) ve el control.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { mensajeTraslapeConDetalle } from "../../src/lib/reservas/traslape.ts";
import { tipoDeBloqueo } from "../../src/lib/reservas/bloqueos.ts";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);
const como = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

const admin = await como(datos.adminB);
const hoy = (await admin.rpc("fecha_negocio")).data;
const suma = (base, dias) => new Date(new Date(`${base}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
let D = suma(hoy, 300 + Math.floor(Math.random() * 200));
while (dow(D) !== 2) D = suma(D, 1); // martes: guardería abre
const { data: gDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
const { data: chico } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
const creados = { estancias: [], reservas: [], perros: [] };
const EXC = { bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" };
const mkPerro = async (n) => {
  const { data, error } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ tras ${n} ${sufijo}`, tamano_id: chico.id }).select("id, nombre").single();
  if (error) throw new Error(error.message);
  creados.perros.push(data.id);
  return data;
};
const reserva = async () => { const r = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single(); creados.reservas.push(r.data.id); return r.data.id; };
const estancia = async (perro, entrada, salida, extra = EXC) => {
  const r = await admin.from("estancias").insert({ reserva_id: await reserva(), perro_id: perro.id, servicio_id: gDia.id, fecha_entrada: entrada, fecha_salida: salida, estado: "reservada", ...extra }).select("id").single();
  if (r.data?.id) creados.estancias.push(r.data.id);
  return r;
};

const nav = await abrirNavegador();
try {
  console.log("── 1. Una finalizada no impide otra visita");
  const nina = await mkPerro("nina");
  const e1 = await estancia(nina, D, suma(D, 1));
  comprobar(!e1.error, `guardería del día creada (${e1.error?.message ?? "ok"})`);
  const choca = await estancia(nina, D, suma(D, 1));
  comprobar(choca.error?.code === "23P01", "una reservada del mismo día SÍ choca (23P01)");
  // Finalizada por la vía de siempre: check-in y check-out.
  const ci = await SB.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba" }).eq("id", e1.data.id);
  const choca2 = await estancia(nina, D, suma(D, 1));
  comprobar(choca2.error?.code === "23P01", "una en curso SÍ choca");
  const fin = await SB.from("estancias").update({ estado: "finalizada", recogido_por_nombre: "Prueba", recogido_por_es_dueno: true }).eq("id", e1.data.id);
  comprobar(!ci.error && !fin.error, `la estancia pasa a finalizada (${ci.error?.message ?? fin.error?.message ?? "ok"})`);
  const e2 = await estancia(nina, D, suma(D, 1));
  comprobar(!e2.error, `con la primera FINALIZADA se puede reservar otra visita el mismo día (${e2.error?.message ?? "ok"})`);

  console.log("── 2. Con qué reserva choca");
  const r = await admin.rpc("estancia_que_choca", { p_perro: nina.id, p_entrada: D, p_salida: suma(D, 1) });
  const c = r.data;
  comprobar(c && c.estancia_id === e2.data.id && c.estado === "reservada" && c.modulo === "guarderia" && c.perro === nina.nombre, "devuelve la reserva viva (no la finalizada)");
  const msg = c ? mensajeTraslapeConDetalle(c) : "";
  comprobar(msg.includes(nina.nombre) && msg.includes("guardería") && msg.includes("(reservada)") && msg.endsWith(`/reservas/calendario?dia=${D}.`) && msg.includes(`/reservas/${c.reserva_id}`), `el mensaje dice mascota, módulo, estado y el día (${msg.slice(0, 90)}…)`);
  const sinChoque = await admin.rpc("estancia_que_choca", { p_perro: nina.id, p_entrada: suma(D, 5), p_salida: suma(D, 6) });
  comprobar(sinChoque.data === null, "sin conflicto devuelve nada");
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
  const ra = await anon.rpc("estancia_que_choca", { p_perro: nina.id, p_entrada: D, p_salida: suma(D, 1) });
  comprobar(Boolean(ra.error), "la llave anónima no la ejecuta");
  const cli = await como(datos.cuentaSoloB);
  const rc = await cli.rpc("estancia_que_choca", { p_perro: nina.id, p_entrada: D, p_salida: suma(D, 1) });
  comprobar(Boolean(rc.error), "un cliente no la ejecuta");

  console.log("── 3. El panel del día muestra todas, con su estado");
  const luna = await mkPerro("luna");
  const e3 = await estancia(luna, D, suma(D, 1));
  const canc = await admin.from("estancias").update({ estado: "cancelada" }).eq("id", e3.data.id);
  comprobar(!canc.error, `se cancela una reserva (${canc.error?.message ?? "ok"})`);
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(await cookiesDe(datos.adminB));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  await p.goto(`${BASE}/reservas/calendario?dia=${D}&fecha=${D}`, { waitUntil: "networkidle", timeout: 120000 });
  const dia = (await p.locator("[data-lista=dia]").innerText()).replace(/\s+/g, " ");
  comprobar(dia.includes(nina.nombre) && /Finalizada/.test(dia) && /Reservada/.test(dia), "el día trae la finalizada y la reservada de la misma mascota");
  comprobar(dia.includes(luna.nombre) && /Cancelada/.test(dia), "el día trae la cancelada con su estado");
  if (!/Cancelada/.test(dia)) console.log("    panel:", dia.slice(0, 500), (await SB.from("estancias").select("estado, deleted_at").eq("id", e3.data.id).single()).data);
  if (!(dia.includes(luna.nombre))) console.log("    panel:", dia.slice(0, 400), "| estado en base:", (await SB.from("estancias").select("estado").eq("id", e3.data.id).single()).data);

  console.log("── 4. Excepción sanitaria");
  // Un perro sin vacunas, sin excepción: el mensaje real de la base.
  const sinVacunas = await mkPerro("sinvac");
  const bloq = await estancia(sinVacunas, suma(D, 14), suma(D, 15), { bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" });
  if (!bloq.error) {
    console.log("    (Huellitas no exige vacunas obligatorias; se prueba con el texto de la base)");
  } else {
    console.log(`    mensaje: ${bloq.error.message}`);
    comprobar(tipoDeBloqueo(bloq.error.message) === "sanitario", "el rechazo real se reconoce como bloqueo sanitario");
    comprobar(/Excepciones al reservar/.test(bloq.error.message), "el mensaje dice que también puede autorizar quien tiene «Excepciones al reservar»");
  }
  comprobar(tipoDeBloqueo("Falta Bordetella vigente de Nina. Un admin puede autorizar una excepción con motivo.") === "sanitario", "el texto sin la palabra «sanitario» (Falta … vigente de …) se reconoce");
  comprobar(tipoDeBloqueo("Faltan Rabia, Bordetella vigentes de Nina. Un admin, o quien tenga el permiso «Excepciones al reservar», puede autorizar una excepción con motivo.") === "sanitario", "varios faltantes también");
  comprobar(tipoDeBloqueo("Este perro no tiene evaluación previa de comportamiento. Márcala en su expediente, o un admin puede autorizar una excepción con motivo.") === "comportamiento", "el de comportamiento sigue siendo de comportamiento");
  comprobar(tipoDeBloqueo("Este perro está en celo.") === null, "celo no ofrece excepción");
  await ctx.close();

  console.log("── 5. El traslape cruza módulos (N10): hotel ↔ guardería del mismo perro");
  const { data: hotelSrv } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").is("deleted_at", null).limit(1).maybeSingle();
  if (!hotelSrv) console.log("    (Huellitas no tiene servicio de hotel: se salta)");
  else {
    const bruno = await mkPerro("bruno");
    const entH = suma(D, 30), salH = suma(D, 33);
    const rH = await admin.from("estancias").insert({ reserva_id: await reserva(), perro_id: bruno.id, servicio_id: hotelSrv.id, fecha_entrada: entH, fecha_salida: salH, estado: "reservada", ...EXC }).select("id").single();
    if (rH.data?.id) creados.estancias.push(rH.data.id);
    if (rH.error) console.log(`    (no se pudo crear el hotel: ${rH.error.message})`);
    else {
      const g = await admin.from("estancias").insert({ reserva_id: await reserva(), perro_id: bruno.id, servicio_id: gDia.id, fecha_entrada: suma(D, 31), fecha_salida: suma(D, 32), estado: "reservada", ...EXC }).select("id").single();
      comprobar(g.error?.code === "23P01", `guardería dentro de unas noches de hotel del mismo perro se rechaza (${g.error?.code ?? "sin error"})`);
      const q = await admin.rpc("estancia_que_choca", { p_perro: bruno.id, p_entrada: suma(D, 31), p_salida: suma(D, 32) });
      const m = q.data ? mensajeTraslapeConDetalle(q.data) : "";
      comprobar(q.data?.modulo === "hotel" && m.includes("reserva de hotel") && m.includes("/reservas/calendario?dia="), `el aviso dice «reserva de hotel» y lleva al calendario (${m.slice(0, 80)}…)`);
      comprobar(Boolean(q.data?.reserva_id) && m.includes(`/reservas/${q.data.reserva_id}`) && m.endsWith("."), `el aviso lleva a la reserva que choca (/reservas/<id>) y termina con punto («…${m.slice(-40)}»)`);
      const otroPerro = await mkPerro("otro");
      const g2 = await admin.from("estancias").insert({ reserva_id: await reserva(), perro_id: otroPerro.id, servicio_id: gDia.id, fecha_entrada: suma(D, 31), fecha_salida: suma(D, 32), estado: "reservada", ...EXC }).select("id").single();
      if (g2.data?.id) creados.estancias.push(g2.data.id);
      comprobar(!g2.error, `otro perro sí puede reservar guardería esos días (${g2.error?.message ?? "ok"})`);
      // Un perro hospedado (en curso) no puede tener guardería ese día aunque se salte la reserva.
      const ci = await SB.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba" }).eq("id", rH.data.id);
      const g3 = await admin.from("estancias").insert({ reserva_id: await reserva(), perro_id: bruno.id, servicio_id: gDia.id, fecha_entrada: suma(D, 32), fecha_salida: suma(D, 33), estado: "reservada", ...EXC }).select("id").single();
      comprobar(!ci.error && g3.error?.code === "23P01", "con el hotel EN CURSO la guardería tampoco entra");
    }
  }
} finally {
  await nav.close();
  if (creados.estancias.length) await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).in("id", creados.estancias);
  if (creados.perros.length) await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
