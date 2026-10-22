// Calendario de reservas de guardería y hotel + cancelar la cuenta cancela la reserva (QA externa B16 y B17)
// — SOLO DESARROLLO, en Huellitas, a 390 y 1280 px. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/reservas-calendario-dev.mjs
//
// 1. /reservas/calendario existe (antes daba 404): semana y mes, la ocupación de cada día coincide con la
//    base (calendario_ocupacion), sin desborde en celular.
// 2. Al tocar un día salen sus reservas (mascota, cliente, estado, cuenta).
// 3. La lista de próximas reservas filtra por módulo, estado y fecha; abre, mueve y cancela.
// 4. Una cuenta cancelada sin cancelar la reserva se ve (Cuenta cancelada + reserva abierta) y, cancelándola
//    junto con la cuenta, la reserva sale de la ocupación.
// 5. El mensaje de traslape lleva el enlace al calendario en la fecha que choca.
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
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);

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
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });

const admin = await comoPersona(datos.adminB);
const hoy = (await admin.rpc("fecha_negocio")).data;
const suma = (base, dias) => new Date(new Date(`${base}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const dow = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const { data: gDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
const { data: hNoche } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "hotel").is("deleted_at", null).limit(1).single();

// Un lunes lejano con cupo (otras auditorías dejan estancias en Huellitas).
let D = suma(hoy, 120 + Math.floor(Math.random() * 150));
while (dow(D) !== 1) D = suma(D, 1);
const creados = { estancias: [], reservas: [], perros: [] };
const { data: tallaChico } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
const mkPerro = async (n) => {
  const { data, error } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `ZZ cal ${n} ${sufijo}`, tamano_id: tallaChico.id }).select("id, nombre").single();
  if (error) throw new Error(`perro: ${error.message}`);
  creados.perros.push(data.id);
  return data;
};
const mkEstancia = async (perro, servicio, entrada, salida) => {
  const rr = await admin.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
  creados.reservas.push(rr.data.id);
  const e = await admin.from("estancias").insert({
    reserva_id: rr.data.id, perro_id: perro.id, servicio_id: servicio, fecha_entrada: entrada, fecha_salida: salida, estado: "reservada",
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba calendario", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba calendario",
  }).select("id").single();
  if (e.error) throw new Error(`estancia: ${e.error.message}`);
  creados.estancias.push(e.data.id);
  return { id: e.data.id, reserva: rr.data.id };
};
const estado = async (id) => (await SB.from("estancias").select("estado, fecha_entrada, fecha_salida").eq("id", id).single()).data;
const ocupado = async (dia) => Number(((await admin.rpc("calendario_ocupacion", { p_desde: dia, p_hasta: dia })).data ?? [])[0]?.ocupado_diurno ?? NaN);

const nav = await abrirNavegador();
try {
  const pG = await mkPerro("guarderia");
  const pH = await mkPerro("hotel");
  const eG = await mkEstancia(pG, gDia.id, D, suma(D, 1));
  const eH = await mkEstancia(pH, hNoche.id, D, suma(D, 3));

  console.log("── 5. Traslape: el mensaje lleva el enlace al calendario");
  const choque = await admin.from("estancias").insert({
    reserva_id: eG.reserva, perro_id: pG.id, servicio_id: gDia.id, fecha_entrada: D, fecha_salida: suma(D, 1),
    bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba calendario", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba calendario",
  });
  comprobar(choque.error?.code === "23P01", "la base rechaza la reserva que se traslapa (23P01)");
  const { mensajeTraslape } = await import("../../src/lib/reservas/traslape.ts");
  // El texto cierra con punto (frase completa); el enlace es la ruta justo antes del punto final, que TextoConEnlaces deja fuera.
  const terminaEn = (texto, ruta) => texto.endsWith(` ${ruta}.`);
  comprobar(terminaEn(mensajeTraslape(D), `/reservas/calendario?dia=${D}`) && terminaEn(mensajeTraslape(), "/reservas/calendario") && terminaEn(mensajeTraslape("x; drop"), "/reservas/calendario"), "el mensaje termina con el enlace al calendario en esa fecha (y solo con fechas válidas)");
  // La pantalla: el enlace del mensaje abre el calendario en ese día.
  {
    const ctxT = await nav.newContext({ viewport: { width: 390, height: 844 } });
    await ctxT.addCookies(await cookiesDe(datos.adminB));
    const pt = await ctxT.newPage();
    pt.setDefaultTimeout(60000);
    await pt.goto(`${BASE}/reservas/calendario?dia=${D}`, { waitUntil: "networkidle", timeout: 120000 });
    comprobar((await pt.locator("[data-lista=dia]").count()) === 1 && (await pt.locator(`[data-dia="${D}"][aria-current="date"]`).count()) === 1, "el enlace con ?dia= abre el calendario con ese día marcado y sus reservas");
    await ctxT.close();
  }

  for (const [nombreVista, ancho, alto] of [["celular", 390, 844], ["escritorio", 1280, 900]]) {
    console.log(`── ${nombreVista} (${ancho} px)`);
    const ctx = await nav.newContext({ viewport: { width: ancho, height: alto } });
    await ctx.addCookies(await cookiesDe(datos.adminB));
    const pa = await ctx.newPage();
    pa.setDefaultTimeout(60000);
    const ir = (ruta) => pa.goto(`${BASE}${ruta}`, { waitUntil: "networkidle", timeout: 120000 });
    const texto = async (sel) => (await pa.locator(sel).first().innerText().catch(() => "")).replace(/\s+/g, " ");

    // ── 1. Semana y mes ──
    const resp = await ir(`/reservas/calendario?fecha=${D}`);
    comprobar(resp.status() === 200, "/reservas/calendario abre (antes daba 404)");
    comprobar(/Calendario de reservas/.test(await pa.locator("h1").innerText()), "tiene su título");
    comprobar((await pa.locator("[data-calendario-grid] [data-dia]").count()) === 7, "la semana tiene 7 días");
    const lunes = await pa.locator(`[data-dia="${D}"]`).getAttribute("aria-label");
    const esperado = await ocupado(D);
    comprobar(new RegExp(`: ${esperado} de `).test(lunes ?? ""), `la ocupación del día coincide con la base (${lunes})`);
    comprobar((await pa.evaluate(() => document.documentElement.scrollWidth)) <= ancho + 2, "la semana no se desborda");
    comprobar((await pa.getByRole("link", { name: "Calendario" }).count()) >= 1 || ancho < 700, "el menú trae «Calendario»");
    await ir(`/reservas/calendario?vista=mes&fecha=${D}`);
    const celdas = await pa.locator("[data-calendario-grid] [data-dia]").count();
    comprobar(celdas >= 28 && celdas <= 42 && celdas % 7 === 0, `el mes tiene semanas completas (${celdas} días)`);
    comprobar((await pa.evaluate(() => document.documentElement.scrollWidth)) <= ancho + 2, "el mes no se desborda");

    // ── 2. Un día ──
    await ir(`/reservas/calendario?fecha=${D}`);
    await pa.locator(`[data-dia="${D}"]`).click();
    await pa.waitForURL(new RegExp(`dia=${D}`));
    await pa.locator("[data-lista=dia]").waitFor();
    const dia = await texto("[data-lista=dia]");
    comprobar(dia.includes(pG.nombre) && dia.includes(pH.nombre) && /Reservada/.test(dia) && /Cuenta:/.test(dia), "al tocar el día salen las reservas con mascota, estado y cuenta");

    // ── 3. Próximas, filtros y acciones ──
    await ir(`/reservas/calendario?desde=${D}&modulo=hotel`);
    const hotel = await texto("[data-lista=proximas]");
    comprobar(hotel.includes(pH.nombre) && !hotel.includes(pG.nombre), "el filtro de módulo deja solo hotel");
    await ir(`/reservas/calendario?desde=${D}&modulo=guarderia&estado=reservada`);
    const guard = await texto("[data-lista=proximas]");
    comprobar(guard.includes(pG.nombre) && !guard.includes(pH.nombre), "el filtro de guardería deja solo guardería");
    await ir(`/reservas/calendario?desde=${suma(D, 5)}&modulo=hotel`);
    comprobar(!(await texto("body")).includes(pH.nombre), "el filtro de fecha oculta lo anterior");

    await ir(`/reservas/calendario?desde=${D}&modulo=guarderia`);
    const fila = pa.locator(`[data-reserva="${eG.id}"]`);
    comprobar((await fila.getByRole("link", { name: "Abrir" }).getAttribute("href")) === `/reservas/${eG.reserva}`, "«Abrir» lleva a la reserva");
    await fila.getByRole("button", { name: "Mover fechas" }).click();
    const nueva = suma(D, 1);
    await fila.locator('input[type="date"]').fill(nueva);
    await fila.getByRole("button", { name: "Guardar fechas" }).click();
    await fila.getByText("Fechas cambiadas").waitFor({ timeout: 90000 }).catch(() => {});
    const movida = await estado(eG.id);
    comprobar(movida.fecha_entrada === nueva, `«Mover fechas» cambia la reserva (${movida.fecha_entrada})`);
    await fila.getByRole("button", { name: "Cancelar" }).first().click();
    await fila.getByRole("button", { name: "Sí, cancelarla" }).click();
    await fila.getByText("Reserva cancelada").waitFor({ timeout: 90000 }).catch(() => {});
    comprobar((await estado(eG.id)).estado === "cancelada", "«Cancelar» cancela la reserva desde la lista");

    // Para la vuelta siguiente: otra guardería en D.
    if (nombreVista === "celular") {
      const otra = await mkEstancia(pG, gDia.id, D, suma(D, 1));
      eG.id = otra.id; eG.reserva = otra.reserva;
    }
    await ctx.close();
  }

  console.log("── 4. Cuenta cancelada y reserva");
  const pC = await mkPerro("cuenta");
  const tRec = await tokenDe(datos.adminB);
  void tRec;
  // Una reserva con saldo: la guardería de un día con precio.
  const sinCancelar = await mkEstancia(pC, gDia.id, suma(D, 7), suma(D, 8));
  const r1 = await admin.rpc("cancelar_cuenta", { p_reserva_id: sinCancelar.reserva, p_motivo: "cita_cancelada", p_motivo_texto: null, p_cancelar_cita: false });
  comprobar(!r1.error, `la cuenta se cancela sin tocar la reserva (${r1.error?.message ?? "ok"})`);
  comprobar((await estado(sinCancelar.id)).estado === "reservada", "…y la reserva sigue abierta (el estado que se veía en la QA)");
  const ctx2 = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.addCookies(await cookiesDe(datos.adminB));
  const p2 = await ctx2.newPage();
  p2.setDefaultTimeout(60000);
  await p2.goto(`${BASE}/reservas/calendario?desde=${suma(D, 7)}&modulo=guarderia`, { waitUntil: "networkidle", timeout: 120000 });
  comprobar(/Cuenta cancelada/.test((await p2.locator(`[data-reserva="${sinCancelar.id}"]`).innerText()).replace(/\s+/g, " ")), "el calendario la muestra: «Cuenta cancelada» con la reserva todavía abierta");
  await ctx2.close();
  const juntas = await mkEstancia(pC, hNoche.id, suma(D, 14), suma(D, 16));
  const antes = await ocupado(suma(D, 14));
  const r2 = await admin.rpc("cancelar_cuenta", { p_reserva_id: juntas.reserva, p_motivo: "cita_cancelada", p_motivo_texto: null, p_cancelar_cita: true });
  comprobar(!r2.error && (await estado(juntas.id)).estado === "cancelada", `cancelar la cuenta con la casilla cancela la reserva (${r2.error?.message ?? "ok"})`);
  comprobar((await ocupado(suma(D, 14))) === antes - 1, "y libera el cupo de ese día");
} finally {
  if (creados.estancias.length) await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).in("id", creados.estancias).is("deleted_at", null);
  await nav.close();
}

console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
