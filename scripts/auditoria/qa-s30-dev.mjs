// QA R41 / S30 (24 de octubre de 2026) — SOLO DESARROLLO, Huellitas, con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/qa-s30-dev.mjs
//
//   1. N121: «Agendar» en la vista Semana de Estética y de la agenda clínica lleva ?fecha= (el primer día de la semana
//      que se ve; hoy si esa semana ya empezó), y el formulario abre en ese día. «Anterior» se queda en Semana.
//   2. Vet: «Nuevo cliente» sigue a la alta de su mascota (antes se quedaba en la ficha con «Agregar perro»).
//   3. 390 px: con el nombre de negocio de la QA («PRUEBA QA Onboarding Hotel S16») el encabezado de Hotel lo enseña
//      completo (dos renglones) y sigue midiendo 64 px.
//   4. Caja: «Enviar conteo» pinta el cierre con la respuesta y «Abrir turno» con doble clic abre UN turno y lo pinta
//      al momento (tiempos de clic → pantalla). Huellitas termina con un turno abierto, como estaba.
// La N122 (ocupación) está en reservas-calendario-dev.mjs; el texto de «guardar encima» en concurrencia-dev.mjs (3b).
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
const creados = { clientes: [] };

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
const hidratada = (p) => p.waitForFunction(() => !document.querySelector('[data-hidratado="no"]'), null, { timeout: 120000 }).catch(() => {});
const ir = async (p, r) => { const res = await p.goto(`${BASE}${r}`, { waitUntil: "networkidle", timeout: 180000 }); await hidratada(p); return res; };
const ms = (t0) => Math.round(performance.now() - t0);
const suma = (base, dias) => new Date(new Date(`${base}T12:00:00Z`).getTime() + dias * 86400000).toISOString().slice(0, 10);
const lunes = (d) => { const dow = new Date(`${d}T12:00:00Z`).getUTCDay(); return suma(d, -((dow + 6) % 7)); };

const { data: hoy } = await SB.rpc("fecha_negocio");
const navegador = await abrirNavegador();
try {
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(await cookiesDe(datos.adminB));
  const p = await ctx.newPage();

  console.log("── 1. N121: «Agendar» desde la vista Semana");
  const futura = suma(hoy, 17);
  for (const [nombre, ruta, form] of [["Estética", "/estetica", "/estetica/nueva"], ["Agenda clínica", "/veterinaria/agenda", "/veterinaria/agenda/nueva"]]) {
    await ir(p, `${ruta}?vista=semana&fecha=${futura}`);
    const f1 = await p.locator("[data-agendar-fecha]").first().getAttribute("data-agendar-fecha");
    comprobar(f1 === lunes(futura), `${nombre}, semana futura: «Agendar» lleva el primer día de la semana (${f1}; esperado ${lunes(futura)})`);
    const href = await p.locator("[data-agendar-fecha]").first().getAttribute("href");
    comprobar(href === `${form}?fecha=${lunes(futura)}`, `${nombre}: el enlace es ${href}`);
    await ir(p, `${ruta}?vista=semana&fecha=${hoy}`);
    const f2 = await p.locator("[data-agendar-fecha]").first().getAttribute("data-agendar-fecha");
    comprobar(f2 === hoy, `${nombre}, esta semana: lleva hoy (${f2})`);
  }
  // El formulario de Estética abre en ese día.
  // El campo de fecha y hora sale cuando ya hay cliente: llega elegido por ?cliente=.
  await ir(p, `/estetica/nueva?fecha=${lunes(futura)}&cliente=${datos.clienteSoloB}`);
  const valorFecha = await p.locator('input[type="datetime-local"]').first().inputValue().catch(() => "");
  comprobar(valorFecha.startsWith(lunes(futura)), `/estetica/nueva abre en ${lunes(futura)} (${valorFecha})`);
  // «Anterior» en Semana se queda en Semana.
  await ir(p, `/estetica?vista=semana&fecha=${futura}`);
  const anterior = await p.locator('a[aria-label="Anterior"]').first().getAttribute("href");
  comprobar(anterior?.includes("vista=semana"), `Estética: «Anterior» se queda en la vista Semana (${anterior})`);

  console.log("── 2. Vet: el alta del cliente sigue a la de su mascota");
  await ir(p, "/clientes/nuevo");
  const boton = p.getByRole("button", { name: "Crear cliente y seguir con su mascota" });
  comprobar((await boton.count()) === 1, "con Veterinaria el botón dice «Crear cliente y seguir con su mascota»");
  await p.locator('input[name="nombre"]').fill(`ZZ S30 cliente ${sufijo}`);
  await p.locator('input[name="telefono"]').fill(`57${String(Date.now()).slice(-8)}`);
  await boton.click();
  await p.waitForURL(/\/clientes\/[0-9a-f-]{36}\/perros\/nuevo\?alta=1/, { timeout: 120000 }).catch(() => {});
  const m = p.url().match(/clientes\/([0-9a-f-]{36})/);
  if (m) creados.clientes.push(m[1]);
  comprobar(/\/perros\/nuevo\?alta=1/.test(p.url()), `después de crearlo abre el alta de su mascota (${p.url().replace(BASE, "")})`);
  const aviso = (await p.locator('[role="status"], [role="alert"], .rounded-lg').filter({ hasText: "quedó registrado" }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
  comprobar(aviso.includes(`ZZ S30 cliente ${sufijo} quedó registrado`) && aviso.includes("Seguir sin registrar mascota"), `y dice que el cliente quedó registrado, con «Seguir sin registrar mascota» («${aviso.slice(0, 120)}»)`);

  console.log("── 2b. QA S31: «Nuevo cliente → Capturarlo yo» desde Hotel, Guardería y Estética sigue con el perro");
  for (const ruta of ["/hotel", "/guarderia", "/estetica"]) {
    await ir(p, ruta);
    await p.getByRole("button", { name: "Nuevo cliente" }).first().click();
    const href = await p.getByRole("link", { name: "Capturarlo yo" }).first().getAttribute("href").catch(() => null);
    comprobar(href === "/clientes/nuevo?seguir=perro", `${ruta}: «Capturarlo yo» lleva al alta que sigue con su perro (${href})`);
  }
  await ir(p, "/clientes/nuevo?seguir=perro");
  const botonModulo = p.getByRole("button", { name: /Crear cliente y seguir con su (perro|mascota)/ });
  comprobar((await botonModulo.count()) === 1, "el alta desde un módulo dice «Crear cliente y seguir con su …»");
  await p.locator('input[name="nombre"]').fill(`ZZ S31 cliente ${sufijo}`);
  await p.locator('input[name="telefono"]').fill(`58${String(Date.now()).slice(-8)}`);
  await botonModulo.click();
  await p.waitForURL(/\/clientes\/[0-9a-f-]{36}\/perros\/nuevo\?alta=1/, { timeout: 120000 }).catch(() => {});
  const m2 = p.url().match(/clientes\/([0-9a-f-]{36})/);
  if (m2) creados.clientes.push(m2[1]);
  await p.locator("[data-seguir-sin-perro]").waitFor({ timeout: 60000 }).catch(() => {});
  comprobar(/\/perros\/nuevo\?alta=1/.test(p.url()) && (await p.locator("[data-seguir-sin-perro]").count()) === 1, `después de crearlo abre el alta de su perro, con «Seguir sin registrar …» (${p.url().replace(BASE, "")})`);

  console.log("── 3. 390 px: el nombre largo del negocio en el encabezado de Hotel");
  // El nombre del negocio llega en caché por dominio: se pone el de la QA en el mismo elemento y se mide cómo lo acomoda.
  const LARGO = "PRUEBA QA Onboarding Hotel S16";
  {
    const ctxM = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    await ctxM.addCookies(await cookiesDe(datos.adminB));
    const pm = await ctxM.newPage();
    for (const ruta of ["/hotel", "/veterinaria", "/estetica"]) {
      await ir(pm, ruta);
      const r = await pm.locator("[data-nombre-negocio]").first().evaluate((el, largo) => { el.textContent = largo; return {
        texto: el.textContent, recortado: el.scrollHeight > el.clientHeight + 1 || el.scrollWidth > el.clientWidth + 1,
        alto: el.closest("header")?.getBoundingClientRect().height ?? 0, ancho: document.documentElement.scrollWidth,
      }; }, LARGO);
      comprobar(r.texto === LARGO && !r.recortado, `${ruta}: el nombre se ve completo («${r.texto}», ${r.recortado ? "recortado" : "sin recortar"})`);
      comprobar(Math.round(r.alto) === 64 && r.ancho <= 392, `${ruta}: el encabezado sigue en 64 px y sin desborde (${Math.round(r.alto)} px, ancho ${r.ancho})`);
    }
    await ctxM.close();
  }

  console.log("── 4. Caja: cerrar y abrir turno");
  const abiertos = async () => (await SB.from("turnos_caja").select("id, clave_apertura").eq("negocio_id", B).eq("estado", "abierto")).data ?? [];
  const inicioCaja = Date.now() - 2000;
  if ((await abiertos()).length === 1) {
    await ir(p, "/caja/turno");
    await p.getByRole("button", { name: "Cerrar turno" }).click();
    await p.getByLabel("Efectivo contado").fill("0");
    await p.getByLabel("Terminal (reporte del lote)").fill("0");
    await p.getByLabel("Transferencia").fill("0");
    let t0 = performance.now();
    await p.getByRole("button", { name: "Enviar conteo" }).click();
    await Promise.race([p.locator("[data-turno-cerrado]").waitFor({ timeout: 60000 }), p.getByLabel("Explicación de la diferencia").waitFor({ timeout: 60000 })]).catch(() => {});
    const tConteo = ms(t0);
    if (await p.getByLabel("Explicación de la diferencia").isVisible().catch(() => false)) {
      await p.getByLabel("Explicación de la diferencia").fill(`Prueba QA S30 ${sufijo}`);
      t0 = performance.now();
      await p.getByRole("button", { name: "Confirmar cierre" }).click();
      await p.locator("[data-turno-cerrado]").waitFor({ timeout: 60000 }).catch(() => {});
      console.log(`  · «Enviar conteo» reveló la diferencia en ${tConteo} ms; «Confirmar cierre» pintó el cierre en ${ms(t0)} ms`);
      comprobar(ms(t0) < 3000, `el cierre se pinta con la respuesta (${ms(t0)} ms)`);
    } else {
      console.log(`  · «Enviar conteo» pintó el cierre en ${tConteo} ms`);
      comprobar(tConteo < 3000, `el cierre se pinta con la respuesta (${tConteo} ms)`);
    }
    comprobar(await p.locator("[data-turno-cerrado]").isVisible().catch(() => false), "dice «Turno cerrado» sin esperar a que se recargue la pantalla");
    await p.locator("[data-abrir-turno]").waitFor({ timeout: 120000 });
    await hidratada(p);
    await p.getByLabel("Fondo inicial").fill("150");
    t0 = performance.now();
    await p.locator("[data-abrir-turno]").dblclick();
    await p.locator("[data-turno-recien-abierto]").waitFor({ timeout: 60000 }).catch(() => {});
    const tAbrir = ms(t0);
    console.log(`  · «Abrir turno» (doble clic) pintó el turno en ${tAbrir} ms`);
    comprobar(await p.locator("[data-turno-recien-abierto]").isVisible().catch(() => false), "«Turno abierto» con su fondo, al momento");
    const ahora = await abiertos();
    comprobar(ahora.length === 1 && Boolean(ahora[0].clave_apertura), `el doble clic dejó UN turno abierto, con su clave (${ahora.length})`);
    // Entre el inicio de la prueba y ahora (otras auditorías dejan turnos con fechas simuladas en el futuro).
    const { data: nuevos = [] } = await SB.from("turnos_caja").select("id").eq("negocio_id", B)
      .gte("abierto_at", new Date(inicioCaja).toISOString()).lte("abierto_at", new Date(Date.now() + 60_000).toISOString());
    comprobar(nuevos.length === 1, `y una sola apertura desde que empezó la prueba (${nuevos.length})`);
    // La misma clave otra vez (un reintento después del tope) no abre otro: el índice la rechaza y la acción devuelve ese turno.
    const otra = await SB.from("turnos_caja").insert({ negocio_id: B, fondo_inicial: 1, abierto_por: datos.adminB, clave_apertura: ahora[0].clave_apertura });
    comprobar(otra.error?.code === "23505", `la misma clave no abre un segundo turno (${otra.error?.code ?? "entró"})`);
  } else hallazgo("Huellitas no tiene exactamente un turno abierto: se salta la caja.");
} finally {
  for (const id of creados.clientes) await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  await navegador.close();
}

console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
