// QA S27 (23 de octubre de 2026) — SOLO DESARROLLO, Huellitas, con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/qa-s27-dev.mjs
//
//   1. Tiempos de punta a punta (clic en guardar → la pantalla dice que quedó) de los formularios de cliente, perro y
//      cita de estética, 3 veces cada uno. El tiempo en la base sale de scripts/db/medir-dev.mjs; esto mide la app.
//   2. N116: «Agendar» desde la vista de día manda ?fecha= y el formulario abre en ese día.
//   3. /reservas/estancias/<id> lleva a la reserva (antes 404).
//   4. 390 px: el nombre del negocio usa el ancho que sobra del encabezado; la Ocupación de Hotel no desborda.
//   5. Vet: «Nuevo cliente y su mascota» manda a /clientes/nuevo con regreso a Veterinaria.
// Lo que crea (clientes, perros, citas «ZZ S27 …») se da de baja al terminar.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
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
const creados = { clientes: [], perros: [], citas: [] };

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
// Espera a que la página hidrate: los botones nacen deshabilitados con data-hidratado="no".
const hidratada = (p) => p.waitForFunction(() => !document.querySelector('[data-hidratado="no"]'), null, { timeout: 120000 }).catch(() => {});
const ir = async (p, r) => { const res = await p.goto(`${BASE}${r}`, { waitUntil: "networkidle", timeout: 180000 }); await hidratada(p); return res; };
const ms = (t0) => Math.round(performance.now() - t0);
const tiempos = {};
const anotar = (k, v) => (tiempos[k] ??= []).push(v);

const navegador = await abrirNavegador();
try {
  const ctx = await navegador.newContext();
  await ctx.addCookies(await cookiesDe(datos.adminB));
  const p = await ctx.newPage();

  console.log("── 1. Tiempos de guardado (ms, clic → confirmación)");
  for (let i = 0; i < 3; i++) {
    // Cliente nuevo → su ficha.
    await ir(p, "/clientes/nuevo");
    await p.locator('input[name="nombre"]').fill(`ZZ S27 cliente ${sufijo}-${i}`);
    await p.locator('input[name="telefono"]').fill(`55${sufijo}${i}${String(Math.floor(Math.random() * 10))}`.slice(0, 10).padEnd(10, "7"));
    let t0 = performance.now();
    await p.getByRole("button", { name: /^Crear cliente/ }).click();
    await p.waitForURL(/\/clientes\/[0-9a-f-]{36}/, { timeout: 120000 });
    anotar("cliente nuevo", ms(t0));
    const clienteId = p.url().match(/clientes\/([0-9a-f-]{36})/)[1];
    creados.clientes.push(clienteId);
    await p.waitForLoadState("networkidle");
    await hidratada(p);

    // Editar cliente (en su ficha).
    const nombre = p.locator('form input[name="nombre"]').first();
    await nombre.fill(`ZZ S27 cliente ${sufijo}-${i} editado`);
    t0 = performance.now();
    await p.getByRole("button", { name: "Guardar cambios" }).first().click();
    await p.getByText("Cambios guardados").first().waitFor({ timeout: 120000 });
    anotar("cliente editar", ms(t0));

    // Perro nuevo → su ficha.
    await ir(p, `/clientes/${clienteId}/perros/nuevo`);
    await p.locator('input[name="nombre"]').fill(`ZZ S27 perro ${sufijo}-${i}`);
    const raza = p.locator("[data-selector-raza] input[placeholder^=\"Escribe la raza\"]").first();
    await raza.fill("Labrador");
    await p.locator('[data-selector-raza] [role="option"]').first().click();
    for (const sel of ['select[name="tamano_id"]', 'select[name="pelaje_id"]']) {
      const s = p.locator(sel);
      if ((await s.count()) && !(await s.inputValue())) await s.selectOption({ index: 1 });
    }
    t0 = performance.now();
    await p.getByRole("button", { name: /^Guardar perro/ }).click();
    await p.waitForURL(/\/perros\/[0-9a-f-]{36}/, { timeout: 120000 });
    anotar("perro nuevo", ms(t0));
    const perroId = p.url().match(/perros\/([0-9a-f-]{36})/)[1];
    creados.perros.push(perroId);
    await p.waitForLoadState("networkidle");
    await hidratada(p);

    // Editar perro (en su ficha).
    await p.locator('input[name="nombre"]').first().fill(`ZZ S27 perro ${sufijo}-${i} b`);
    t0 = performance.now();
    await p.getByRole("button", { name: "Guardar cambios" }).first().click();
    await p.getByText("Cambios guardados").first().waitFor({ timeout: 120000 });
    anotar("perro editar", ms(t0));

    // Cita de estética de ese perro (el cliente llega elegido por ?cliente=).
    await ir(p, `/estetica/nueva?cliente=${clienteId}`);
    const boton = p.getByRole("button", { name: "Agendar cita" });
    await p.waitForFunction(() => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Agendar cita" && !b.disabled), null, { timeout: 120000 }).catch(() => {});
    if (await boton.isDisabled()) {
      hallazgo(`cita ${i + 1}: «Agendar cita» sigue deshabilitado (${(await p.locator("[data-motivo-no-agendar], form").first().innerText()).slice(0, 120)})`);
      continue;
    }
    t0 = performance.now();
    await boton.click();
    await p.getByText(/Cita agendada/).first().waitFor({ timeout: 120000 });
    anotar("cita nueva", ms(t0));
  }
  for (const [k, v] of Object.entries(tiempos)) console.log(`  ${k.padEnd(16)} ${v.join(" / ")}`);

  console.log("── 2. N116: «Agendar» desde la vista de día abre ese día");
  const { data: hoy } = await SB.rpc("fecha_negocio");
  const dia = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 3 * 86400000).toISOString().slice(0, 10);
  await ir(p, `/estetica?vista=dia&fecha=${dia}`);
  const href = await p.locator('a[href^="/estetica/nueva"]').first().getAttribute("href");
  comprobar(href === `/estetica/nueva?fecha=${dia}`, `el botón lleva ?fecha=${dia} (lleva ${href})`);
  // El campo de fecha y hora sale cuando ya hay cliente: llega elegido por ?cliente=.
  await ir(p, `/estetica/nueva?fecha=${dia}&cliente=${datos.clienteSoloB}`);
  const valor = await p.locator('input[type="datetime-local"]').first().inputValue();
  comprobar(valor.startsWith(dia), `el formulario abre el ${dia} (abre ${valor})`);

  console.log("── 3. /reservas/estancias/<id> lleva a su reserva");
  const { data: est } = await SB.from("estancias").select("id, reserva_id").eq("negocio_id", B).is("deleted_at", null).limit(1).maybeSingle();
  if (est) {
    const r = await p.goto(`${BASE}/reservas/estancias/${est.id}`, { waitUntil: "networkidle", timeout: 120000 });
    comprobar(r?.status() !== 404 && p.url().endsWith(`/reservas/${est.reserva_id}`), `redirige a /reservas/${est.reserva_id} (quedó en ${p.url()}, ${r?.status()})`);
  }

  console.log("── 4. 390 px");
  await p.setViewportSize({ width: 390, height: 844 });
  await ir(p, "/estetica");
  // Con el nombre largo del negocio de la QA («PRUEBA QA Onboarding Vet S16»), cuánto se alcanza a ver.
  const enc = await p.evaluate(() => {
    const n = document.querySelector("header [data-nombre-negocio]");
    if (n) n.textContent = "PRUEBA QA Onboarding Vet S16";
    return n ? { visible: n.clientWidth, completo: n.scrollWidth, texto: n.textContent } : null;
  });
  if (enc) {
    console.log(`  nombre «${enc.texto}»: ${enc.visible}px visibles de ${enc.completo}px`);
    comprobar(enc.visible >= 140, `el nombre usa el ancho que sobra (${enc.visible}px; con «PRU…» eran ~40px)`);
  } else console.log("  (el negocio tiene logo de imagen o de texto: no hay nombre que truncar)");
  await ir(p, "/hotel");
  const hotel = await p.evaluate(() => ({ ancho: document.documentElement.scrollWidth, movil: Boolean(document.querySelector("[data-ocupacion-movil]")?.getBoundingClientRect().height) }));
  comprobar(hotel.ancho <= 390 && hotel.movil, `Hotel sin desborde (${hotel.ancho}px) y Ocupación apilada`);

  console.log("── 5. Vet: nuevo cliente y su mascota");
  await p.setViewportSize({ width: 1280, height: 900 });
  await ir(p, "/veterinaria/agenda/nueva");
  const vet = p.locator("[data-nuevo-cliente-vet]");
  if (await vet.count()) comprobar((await vet.getAttribute("href")) === `/clientes/nuevo?volver=${encodeURIComponent("/veterinaria/agenda/nueva")}`, "el enlace regresa a la agenda clínica");
  else console.log("  (Huellitas sin Veterinaria)");
} finally {
  await navegador.close();
  // Baja de lo creado.
  const ahora = new Date().toISOString();
  const { data: citas } = await SB.from("citas_estetica").select("id, reserva_id").in("perro_id", creados.perros.length ? creados.perros : ["00000000-0000-0000-0000-000000000000"]);
  for (const c of citas ?? []) {
    await SB.from("citas_estetica").update({ deleted_at: ahora }).eq("id", c.id);
    await SB.rpc("borrar_reserva_vacia", { p_reserva_id: c.reserva_id }).then(() => {}, () => {});
  }
  if (creados.perros.length) await SB.from("perros").update({ deleted_at: ahora }).in("id", creados.perros);
  if (creados.clientes.length) await SB.from("clientes").update({ deleted_at: ahora }).in("id", creados.clientes);
  console.log(`  (baja de ${creados.clientes.length} clientes, ${creados.perros.length} perros y ${citas?.length ?? 0} citas de prueba)`);
}
console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
