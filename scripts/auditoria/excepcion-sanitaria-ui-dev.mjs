// Casilla «Autorizar excepción» del bloqueo por vacunas, en pantalla (QA externa, 15 de octubre de 2026).
// SOLO DESARROLLO, Huellitas, 390 px, con `next start` en el 3001.
//
//   node scripts/auditoria/excepcion-sanitaria-ui-dev.mjs
//
// Una mascota evaluada pero SIN vacunas se reserva en Guardería → Nueva reserva:
//   - admin: ve el motivo del rechazo, la casilla, escribe el motivo y reintenta: queda «Reservado».
//   - recepción SIN «Excepciones al reservar»: ve el rechazo y NO ve la casilla.
//   - recepción CON el permiso: ve la casilla y puede reservar con excepción.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? console.log(`  ✔ ${t}`) : hallazgo(t));
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
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}

const admin = await como(datos.adminB);
const { data: recs } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recId = recs[0].profile_id;
const hoy = (await admin.rpc("fecha_negocio")).data;
const suma = (base, d) => new Date(new Date(`${base}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
let D = suma(hoy, 400 + Math.floor(Math.random() * 100));
while (new Date(`${D}T12:00:00Z`).getUTCDay() !== 3) D = suma(D, 1); // miércoles: guardería abre
const { data: chico } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
const creados = { perros: [], clientes: [], estancias: [] };
const nombreCliente = `ZZ Excep ${sufijo}`;
const cliente = (await SB.from("clientes").insert({ nombre: nombreCliente, telefono: `55${String(Date.now()).slice(-8)}` }).select("id").single()).data;
creados.clientes.push(cliente.id);
const mkPerro = async (n) => {
  const p = (await SB.from("perros").insert({ negocio_id: B, cliente_id: cliente.id, nombre: `ZZ ${n} ${sufijo}`, tamano_id: chico.id }).select("id, nombre").single()).data;
  creados.perros.push(p.id);
  const ev = await admin.rpc("marcar_evaluacion_comportamiento", { p_perro_id: p.id, p_fecha: hoy, p_notas: "prueba excepción" });
  if (ev.error) throw new Error(ev.error.message);
  return p;
};
const permiso = (fn, id) => admin.rpc(fn, { p_profile_id: id, p_permiso: "excepciones_reserva" });

const nav = await abrirNavegador();
async function reservar(profileId, perro, { conExcepcion }) {
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.addCookies(await cookiesDe(profileId));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);
  await p.goto(`${BASE}/guarderia/nueva`, { waitUntil: "networkidle", timeout: 120000 });
  await p.locator("input[type=text], input[type=search], input:not([type])").first().fill(nombreCliente);
  await p.getByText(nombreCliente).first().click();
  await p.getByLabel(perro.nombre).check();
  await p.getByLabel("Fecha").fill(D);
  await p.getByRole("button", { name: /Crear reserva/ }).click();
  await p.getByText(/No se pudo reservar|Reservado/).first().waitFor();
  const rechazo = (await p.locator("li").filter({ hasText: perro.nombre }).first().innerText()).replace(/\s+/g, " ");
  const casilla = await p.getByLabel(/Autorizar excepción/).count();
  let reservado = false;
  if (conExcepcion && casilla) {
    await p.getByLabel(/Autorizar excepción/).check();
    await p.getByLabel("Motivo de la excepción").fill("Prueba de pantalla: el dueño trae el carnet mañana");
    const boton = p.getByRole("button", { name: /Reintentar con excepción|Reintentando/ });
    await boton.click();
    await p.getByText(/Reservado|No se pudo reservar/).first().waitFor({ timeout: 60000 }).catch(() => {});
    await p.waitForTimeout(4000);
    const despues = (await p.locator("li").filter({ hasText: perro.nombre }).first().innerText()).replace(/\s+/g, " ");
    reservado = /— Reservado/.test(despues);
    if (!reservado) console.log("    tras reintentar:", despues.slice(0, 300));
  }
  await ctx.close();
  return { rechazo, casilla, reservado };
}

try {
  await permiso("revocar_permiso", recId);

  console.log("── Admin");
  const pA = await mkPerro("admin");
  const rA = await reservar(datos.adminB, pA, { conExcepcion: true });
  comprobar(/Faltan?\b/.test(rA.rechazo) && /excepción con motivo/.test(rA.rechazo), `el rechazo dice qué vacunas faltan y cómo se autoriza (${rA.rechazo.slice(0, 110)}…)`);
  comprobar(rA.casilla === 1, "ve la casilla «Autorizar excepción»");
  comprobar(rA.reservado, "con motivo y «Reintentar con excepción» queda Reservado");
  const eA = (await SB.from("estancias").select("id, bloqueo_sanitario_superado, motivo_excepcion_sanitaria").eq("perro_id", pA.id).is("deleted_at", null)).data ?? [];
  comprobar(eA.length === 1 && eA[0].bloqueo_sanitario_superado && /carnet/.test(eA[0].motivo_excepcion_sanitaria), "la estancia guarda la excepción y su motivo");
  creados.estancias.push(...eA.map((e) => e.id));

  console.log("── Recepción SIN «Excepciones al reservar»");
  const pB = await mkPerro("sinpermiso");
  const rB = await reservar(recId, pB, { conExcepcion: false });
  comprobar(/Faltan?\b/.test(rB.rechazo), `ve el rechazo (${rB.rechazo.slice(0, 80)}…)`);
  comprobar(rB.casilla === 0, "NO ve la casilla de excepción");
  comprobar(((await SB.from("estancias").select("id").eq("perro_id", pB.id).is("deleted_at", null)).data ?? []).length === 0, "y no quedó reservado");

  console.log("── Recepción CON «Excepciones al reservar»");
  const dar = await permiso("otorgar_permiso", recId);
  comprobar(!dar.error, `permiso otorgado (${dar.error?.message ?? "ok"})`);
  const pC = await mkPerro("conpermiso");
  const rC = await reservar(recId, pC, { conExcepcion: true });
  comprobar(rC.casilla === 1, "ve la casilla «Autorizar excepción»");
  comprobar(rC.reservado, "reserva con excepción y motivo");
  const eC = (await SB.from("estancias").select("id").eq("perro_id", pC.id).is("deleted_at", null)).data ?? [];
  creados.estancias.push(...eC.map((e) => e.id));
} finally {
  await permiso("revocar_permiso", recId);
  await nav.close();
  if (creados.estancias.length) await admin.from("estancias").update({ estado: "cancelada" }).in("id", creados.estancias);
  if (creados.estancias.length) await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).in("id", creados.estancias);
  if (creados.perros.length) await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
  if (creados.clientes.length) await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).in("id", creados.clientes);
}
if (hallazgos.length) { console.log(`\n${hallazgos.length} hallazgo(s)`); process.exit(1); }
console.log("\n✔ Sin hallazgos");
