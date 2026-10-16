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
// 4. La base: fecha_negocio() de esos instantes es el día local.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { escanear } from "./lib/fechas-utc-escaner.mjs";
import { formatearDiaDeInstante, fechaLocalDeInstante } from "../../src/lib/formato.ts";

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
const creados = { perros: [], reservas: [], citas: [] };
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
} finally {
  await nav.close();
  if (creados.citas.length) await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).in("id", creados.citas);
  if (creados.perros.length) await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
