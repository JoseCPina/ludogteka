// Servicios extra · Parte B: pantallas reales en el navegador (SOLO DESARROLLO, Huellitas).
// Lo corre servicios-extra-dev.mjs después de su parte de base; también solo:
//
//   node scripts/auditoria/servicios-extra-ui-dev.mjs     (necesita `npm run build`)
//
// Levanta `next start` en el 3007 y prueba: el catálogo (crear un servicio, un traslado con
// su zona y un paquete), agregar y programar desde el check-in, la tarea en el tablero que se
// marca hecha (el cargo entra a la cuenta), la hoja de traslados con el aviso de WhatsApp, cancelar,
// el reporte, y quién ve qué (permiso de agregar, permiso de catálogo, menú).
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { slugDePrueba, hostDe, datosDelNegocio, negocioPorSlug } from "./lib/negocio-prueba.mjs";
const SLUG = slugDePrueba();
const HOST = hostDe(SLUG);

const PUERTO = 3007;
const BASE = `http://${HOST}:${PUERTO}`;
const REF = new globalThis.URL(URL).hostname.split(".")[0];

export async function correrUi({ comprobar, datos, hoy }) {
  const B = datos.B;
  const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
  const cab = (t) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${t}`, "x-negocio-id": B, "Content-Type": "application/json", Prefer: "return=representation" });
  const MARCA = `UI${String(Date.now()).slice(-5)}`;
  const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
  const recId = recepciones[0].profile_id;
  const recSinId = recepciones[1].profile_id;
  const tAdmin = await tokenDe(datos.adminB);

  console.log("\n══ PARTE B · servidor real + navegador");
  const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
    env: { ...process.env, PELUDESK_URL_DESARROLLO: `http://{slug}.localhost:${PUERTO}` },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let bitacora = "";
  servidor.stdout.on("data", (d) => (bitacora += d));
  servidor.stderr.on("data", (d) => (bitacora += d));
  process.on("exit", () => { try { servidor.kill(); } catch { /* ya cerró */ } });
  const pedir = (ruta) => new Promise((resolve, reject) => {
    const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: "GET", headers: { host: `${HOST}:${PUERTO}` } }, (r) => { r.resume(); r.on("end", () => resolve({ status: r.statusCode })); });
    q.on("error", reject);
    q.end();
  });
  const esperarHasta = async (fn, ms = 20000, paso = 400) => { const t = Date.now(); for (;;) { const r = await fn(); if (r) return r; if (Date.now() - t > ms) return null; await new Promise((x) => setTimeout(x, paso)); } };
  async function cookiesDe(profileId) {
    const { data: u } = await A.auth.admin.getUserById(profileId);
    const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
    const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: ses, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (error) throw error;
    const valor = "base64-" + Buffer.from(JSON.stringify(ses.session)).toString("base64url");
    const trozos = valor.match(/.{1,3180}/g);
    const nombre = `sb-${REF}-auth-token`;
    return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: HOST, path: "/" }));
  }

  let nav;
  const rec = (token, fn, args) => fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token), body: JSON.stringify(args) }).then((r) => r.json().catch(() => null));
  try {
    const listo = await esperarHasta(async () => (await pedir("/login").catch(() => null))?.status === 200, 60000, 1000);
    comprobar(listo, "el servidor de la prueba arrancó (necesita `npm run build`)");
    if (!listo) throw new Error("sin servidor:\n" + bitacora.slice(-1500));
    // recepción con el permiso de agregar; la otra sin él ni el de catálogo
    await rec(tAdmin, "otorgar_permiso", { p_profile_id: recId, p_permiso: "agregar_servicios_extra" });
    await rec(tAdmin, "otorgar_permiso", { p_profile_id: recSinId, p_permiso: "agregar_servicios_extra" });
    await rec(tAdmin, "revocar_permiso", { p_profile_id: recSinId, p_permiso: "agregar_servicios_extra" });
    await rec(tAdmin, "revocar_permiso", { p_profile_id: recId, p_permiso: "editar_catalogo_extras" });

    nav = await abrirNavegador();
    const ctxA = await nav.newContext();
    await ctxA.addCookies(await cookiesDe(datos.adminB));
    const admin = await ctxA.newPage();
    admin.setDefaultNavigationTimeout(90000);
    const ve = (pag, re, ms = 30000) => pag.getByText(re).first().waitFor({ timeout: ms }).then(() => true).catch(() => false);

    // ── B1. Catálogo ──
    console.log("── B1. Catálogo (admin)");
    await admin.goto(`${BASE}/extras/catalogo`, { waitUntil: "networkidle" });
    comprobar(await ve(admin, /Catálogo de servicios extra/), "admin abre el catálogo");
    comprobar((await admin.getByRole("link", { name: "Servicios extra", exact: true }).count()) > 0, "…y ve «Servicios extra» en el menú");
    const nomPaseo = `Paseo ${MARCA}`;
    await admin.getByRole("button", { name: "+ Otro servicio" }).click();
    let form = admin.locator("[data-extra-form]").first();
    await form.getByLabel("Nombre", { exact: true }).fill(nomPaseo);
    await form.getByLabel(/^Precio/).fill("85");
    await form.getByLabel("Clave del SAT (opcional)").fill("93151601");
    await form.getByRole("button", { name: "Crear servicio extra" }).click();
    const paseo = await esperarHasta(async () => (await SB.from("servicios_extra").select("*").eq("negocio_id", B).eq("nombre", nomPaseo).maybeSingle()).data, 30000, 700);
    comprobar(paseo && Number(paseo.precio) === 85 && paseo.clave_prod_serv === "93151601", "crea un servicio extra desde la pantalla (precio 85, clave SAT)");
    comprobar(await admin.locator(`input[value="${nomPaseo}"]`).first().waitFor({ timeout: 30000 }).then(() => true).catch(() => false), "…y aparece en la lista");
    // traslado con su zona
    const nomTras = `Traslado ${MARCA}`;
    await admin.getByRole("button", { name: "+ Otro servicio" }).click();
    form = admin.locator("[data-extra-form]").first();
    await form.getByLabel("Nombre", { exact: true }).fill(nomTras);
    await form.getByLabel("Tipo").selectOption("traslado");
    await form.getByLabel("Se cobra").selectOption("viaje");
    await form.getByRole("button", { name: "Crear servicio extra" }).click();
    const tras = await esperarHasta(async () => (await SB.from("servicios_extra").select("*").eq("negocio_id", B).eq("nombre", nomTras).maybeSingle()).data, 30000, 700);
    comprobar(tras && tras.tipo === "traslado" && tras.unidad === "viaje", "crea un traslado desde la pantalla");
    await esperarHasta(async () => (await admin.getByText("Zonas y precio por zona").count()) > 0, 30000);
    const tarjetaTras = admin.locator("div.rounded-lg.border", { has: admin.locator(`input[value="${nomTras}"]`) }).first();
    const zf = tarjetaTras.locator("[data-zona-form]").last();
    await zf.getByLabel("Zona nueva").fill("Centro");
    await zf.getByLabel("Hasta (km)").fill("6");
    await zf.getByLabel("Precio").fill("120");
    await zf.getByRole("button", { name: "Agregar zona" }).click();
    const zona = await esperarHasta(async () => (await SB.from("servicios_extra_zonas").select("*").eq("extra_id", tras.id).eq("nombre", "Centro").maybeSingle()).data, 30000, 700);
    comprobar(zona && Number(zona.precio) === 120 && Number(zona.km_hasta) === 6, "agrega la zona «Centro» a 120 desde la pantalla");
    // paquete del paseo
    const tarjetaPaseo = admin.locator("div.rounded-lg.border", { has: admin.locator(`input[value="${nomPaseo}"]`) }).first();
    await tarjetaPaseo.getByRole("button", { name: "Venderlo también como paquete de sesiones" }).click();
    const pf = tarjetaPaseo.locator("[data-paquete-form]");
    await pf.getByLabel("Sesiones").fill("3");
    await pf.getByLabel("Precio del paquete").fill("200");
    await pf.getByRole("button", { name: "Guardar paquete" }).click();
    const conPaq = await esperarHasta(async () => { const r = (await SB.from("servicios_extra").select("paquete_servicio_id").eq("id", paseo.id).single()).data; return r?.paquete_servicio_id ? r : null; }, 30000, 700);
    comprobar(Boolean(conPaq), "crea el paquete de 3 paseos desde la pantalla");
    const rCat = await (async () => {
      const ctx = await nav.newContext();
      await ctx.addCookies(await cookiesDe(recId));
      return ctx;
    })();
    const pr = await rCat.newPage();
    pr.setDefaultNavigationTimeout(90000);
    await pr.goto(`${BASE}/extras/catalogo`, { waitUntil: "networkidle" });
    comprobar(!new globalThis.URL(pr.url()).pathname.startsWith("/extras/catalogo"), `recepción sin «Editar catálogo» no entra al catálogo (${new globalThis.URL(pr.url()).pathname})`);

    // ── B2. Agregar y programar desde el check-in ──
    console.log("── B2. Agregar y programar desde el check-in");
    const { data: guarderiaDia } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
    const { data: perro } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Rocky ${MARCA}` }).select("id, cliente_id").single();
    await SB.from("clientes").update({ direccion: "Calle Prueba 10, Centro" }).eq("id", perro.cliente_id);
    const mas = (b, d) => new Date(new Date(`${b}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
    const dom = (d) => new Date(`${d}T12:00:00Z`).getUTCDay() === 0;
    let d0 = hoy;
    while ([0, 1, 2].some((i) => dom(mas(d0, i)))) d0 = mas(d0, 1);
    const reserva = (await (await fetch(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ cliente_id: perro.cliente_id }) })).json())[0];
    const estR = await (await fetch(`${URL}/rest/v1/estancias`, { method: "POST", headers: cab(tAdmin), body: JSON.stringify({ reserva_id: reserva.id, perro_id: perro.id, servicio_id: guarderiaDia.id, fecha_entrada: d0, fecha_salida: mas(d0, 2), estado: "reservada", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: MARCA, bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: MARCA }) })).json();
    const estancia = estR[0]?.id;
    comprobar(Boolean(estancia), `se armó una estancia de prueba (${estR.message ?? "ok"})`);
    const ctxRec = rCat;
    const ppag = pr;
    await ppag.goto(`${BASE}/reservas/estancias/${estancia}/checkin`, { waitUntil: "networkidle" });
    comprobar(await ve(ppag, /Servicios extra/), "recepción ve la sección «Servicios extra» en el check-in");
    await ppag.getByLabel("Servicio extra").selectOption(paseo.id);
    await ppag.getByLabel("Hora (opcional)").fill("10:00");
    await ppag.getByLabel(/Repetir cada día hasta/).fill(mas(d0, 2));
    await ppag.getByRole("button", { name: "Programar" }).click();
    comprobar(await ve(ppag, /Programado: 3 días/), "programa un paseo diario a las 10:00 los 3 días de la estancia");
    const progs = (await SB.from("servicios_extra_aplicados").select("id, estado, hora, fecha").eq("estancia_id", estancia).order("fecha")).data;
    comprobar(progs.length === 3 && progs.every((p) => p.estado === "pendiente" && p.hora.startsWith("10:00")), "quedan 3 filas pendientes a las 10:00");
    // traslado
    await ppag.getByLabel("Servicio extra").selectOption(tras.id);
    await ppag.getByLabel("Zona").selectOption(zona.id);
    await ppag.getByLabel("Hora (opcional)").fill("17:30");
    await ppag.getByLabel(/Repetir cada día hasta/).fill("");
    await ppag.getByRole("button", { name: "Programar" }).click();
    comprobar(await ve(ppag, /Programado: saldrá en el tablero/), "programa un traslado a domicilio con zona");
    const tFila = (await SB.from("servicios_extra_aplicados").select("*").eq("estancia_id", estancia).eq("extra_id", tras.id).single()).data;
    comprobar(Number(tFila.precio_unitario) === 120 && tFila.direccion === "Calle Prueba 10, Centro" && tFila.sentido === "entregar", "el traslado toma el precio de la zona y la dirección de la ficha del cliente");
    // ya se hizo
    await ppag.getByLabel("Servicio extra").selectOption(paseo.id);
    await ppag.getByLabel("¿Qué pasó?").selectOption("hecho");
    await ppag.getByLabel("Cantidad").fill("2");
    await ppag.getByRole("button", { name: "Registrar y cobrar en la cuenta" }).click();
    comprobar(await ve(ppag, /Registrado: el cargo ya está en la cuenta/), "registra un servicio que ya se hizo: entra a la cuenta");
    const cargoYa = (await SB.from("cargos_aplicados").select("precio, cantidad").eq("estancia_id", estancia)).data;
    comprobar(cargoYa.length === 1 && Number(cargoYa[0].precio) === 85 && cargoYa[0].cantidad === 2, "el cargo es 85 × 2");
    // sin permiso
    const ctxSin = await nav.newContext();
    await ctxSin.addCookies(await cookiesDe(recSinId));
    const psin = await ctxSin.newPage();
    psin.setDefaultNavigationTimeout(90000);
    await psin.goto(`${BASE}/reservas/estancias/${estancia}/checkin`, { waitUntil: "networkidle" });
    comprobar(await ve(psin, /necesitas el permiso «Agregar servicios extra»/), "recepción sin el permiso ve el aviso y no el formulario");
    comprobar((await psin.getByRole("button", { name: "Programar" }).count()) === 0, "…sin botón para programar");

    // ── B3. Tablero del día ──
    console.log("── B3. Tablero del día y hoja de traslados");
    // Una estancia puede no cubrir hoy (domingos, fines de semana): la fila del día se arma directo.
    const { data: delDia } = await SB.from("servicios_extra_aplicados").insert({
      negocio_id: B, extra_id: paseo.id, estancia_id: estancia, perro_id: perro.id, fecha: hoy, hora: "09:15", cantidad: 1, precio_unitario: 85,
    }).select("id").single();
    const { data: trasDia } = await SB.from("servicios_extra_aplicados").insert({
      negocio_id: B, extra_id: tras.id, estancia_id: estancia, perro_id: perro.id, fecha: hoy, hora: "18:00", cantidad: 1, zona_id: zona.id,
      precio_unitario: 120, direccion: "Calle Prueba 10, Centro", sentido: "entregar",
    }).select("id").single();
    await ppag.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
    comprobar(await ve(ppag, /Servicios extra de hoy/), "el tablero de recepción muestra «Servicios extra de hoy»");
    const li = ppag.locator(`[data-extra-id="${delDia.id}"]`);
    comprobar((await li.count()) === 1, "…con la tarea del paseo de las 09:15");
    await li.getByRole("button", { name: "Marcar hecho" }).click();
    comprobar(await ve(ppag, /el cargo entró a la cuenta/), "recepción la marca hecha desde el tablero");
    const hecha = (await SB.from("servicios_extra_aplicados").select("estado, cargo_id, hecho_por").eq("id", delDia.id).single()).data;
    comprobar(hecha.estado === "hecho" && hecha.cargo_id && hecha.hecho_por === recId, "queda hecha por quien la marcó y con su cargo");
    // hoja de traslados
    await ppag.goto(`${BASE}/extras`, { waitUntil: "networkidle" });
    comprobar(await ve(ppag, /Hoja del día: dirección, horario y estado/), "la página de servicios extra trae la hoja de traslados");
    const lt = ppag.locator(`[data-extra-id="${trasDia.id}"]`);
    comprobar((await lt.count()) === 1 && (await lt.innerText()).includes("Calle Prueba 10"), "el traslado muestra su dirección");
    await lt.getByRole("button", { name: "Salió el traslado" }).click();
    comprobar(await esperarHasta(async () => (await SB.from("servicios_extra_aplicados").select("estado").eq("id", trasDia.id).single()).data.estado === "en_camino", 30000, 600), "«Salió el traslado» lo pasa a «en camino»");
    await ppag.reload({ waitUntil: "networkidle" });
    const lt2 = ppag.locator(`[data-extra-id="${trasDia.id}"]`);
    const [popup] = await Promise.all([
      ctxRec.waitForEvent("page", { timeout: 30000 }).catch(() => null),
      lt2.getByRole("button", { name: /Avisar por WhatsApp/ }).click(),
    ]);
    const urlWa = popup ? popup.url() : "";
    comprobar(/^https:\/\/wa\.me\/52\d{10}\?text=/.test(urlWa) || /api\.whatsapp\.com|web\.whatsapp/.test(urlWa), `se abre el aviso de WhatsApp al dueño (${urlWa.slice(0, 40)}…)`);
    if (popup) {
      const texto = decodeURIComponent(urlWa.split("+").join(" "));
      comprobar(/Estamos en camino/.test(texto) || /Estamos en camino/.test(await popup.content().catch(() => "")), "…con el mensaje de que el traslado va en camino");
      await popup.close().catch(() => {});
    }
    comprobar(await esperarHasta(async () => (await SB.from("servicios_extra_aplicados").select("aviso_whatsapp_at").eq("id", trasDia.id).single()).data.aviso_whatsapp_at, 20000, 600), "queda anotado que se avisó");
    await ppag.reload({ waitUntil: "networkidle" });
    await ppag.locator(`[data-extra-id="${trasDia.id}"]`).getByRole("button", { name: "Marcar entregado" }).click();
    comprobar(await esperarHasta(async () => (await SB.from("servicios_extra_aplicados").select("estado, cargo_id").eq("id", trasDia.id).single()).data.estado === "hecho", 30000, 600), "«Marcar entregado» cierra el traslado y su cargo entra");
    // cancelar uno programado
    const aCancelar = progs[1].id;
    await ppag.goto(`${BASE}/extras?fecha=${progs[1].fecha}`, { waitUntil: "networkidle" });
    const lc = ppag.locator(`[data-extra-id="${aCancelar}"]`);
    await lc.getByRole("button", { name: "Cancelar", exact: true }).click();
    await lc.getByLabel("Motivo").fill("El dueño lo recogió antes");
    await lc.getByRole("button", { name: "Confirmar cancelación" }).click();
    comprobar(await esperarHasta(async () => (await SB.from("servicios_extra_aplicados").select("estado").eq("id", aCancelar).single()).data.estado === "cancelado", 30000, 600), "cancela un servicio programado con su motivo");

    // ── B4. Que no se dupliquen caminos de cobro ──
    console.log("── B4. Cargos sueltos y reporte");
    await ppag.goto(`${BASE}/caja/cargo`, { waitUntil: "networkidle" });
    const opciones = await ppag.locator("select option").allInnerTexts();
    comprobar(!opciones.some((o) => o.includes(nomPaseo) || o.includes(nomTras)), "el cargo suelto de Caja no ofrece los servicios extra (se agregan a una estancia)");
    await admin.goto(`${BASE}/reportes?desde=${hoy}&hasta=${hoy}`, { waitUntil: "networkidle" });
    comprobar(await ve(admin, /Servicios extra de Hotel y guardería/), "el reporte muestra «Servicios extra de Hotel y guardería»");
    const textoRep = await admin.locator("[data-reporte-extras]").innerText().catch(() => "");
    comprobar(textoRep.includes(nomPaseo) && textoRep.includes(nomTras), "…con ingresos por servicio");
    await admin.goto(`${BASE}/extras`, { waitUntil: "networkidle" });
    comprobar((await admin.getByRole("link", { name: "Catálogo de servicios extra" }).count()) > 0, "admin ve el acceso al catálogo en la página de servicios extra");
    await ctxA.close();
    await rCat.close();
    await ctxSin.close();
  } finally {
    await rec(tAdmin, "otorgar_permiso", { p_profile_id: recSinId, p_permiso: "agregar_servicios_extra" });
    if (nav) await nav.close().catch(() => {});
    try { servidor.kill(); } catch { /* ya cerró */ }
  }
}

// Solo: node scripts/auditoria/servicios-extra-ui-dev.mjs
if (process.argv[1] && process.argv[1].endsWith("servicios-extra-ui-dev.mjs")) {
  const datos = datosDelNegocio(SLUG);
  const bad = [];
  const comprobar = (c, t) => { console.log(`  ${c ? "✔" : "✘"} ${t}`); if (!c) bad.push(t); };
  const tAdmin = await tokenDe(datos.adminB);
  const hoy = await (await fetch(`${URL}/rest/v1/rpc/fecha_negocio`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${tAdmin}`, "x-negocio-id": datos.B, "Content-Type": "application/json" }, body: "{}" })).json();
  await correrUi({ comprobar, datos, hoy });
  console.log(bad.length ? `\n${bad.length} HALLAZGO(S):\n- ${bad.join("\n- ")}` : "\nSin hallazgos.");
  process.exit(bad.length ? 1 : 0);
}
