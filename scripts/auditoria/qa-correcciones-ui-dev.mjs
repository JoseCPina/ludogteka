// Correcciones de las dos QA, EN PANTALLA (SOLO DESARROLLO). Con el servidor compilado en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/qa-correcciones-ui-dev.mjs
//
// 3. El reel de Ludogteka no pide NADA a Instagram sin consentimiento de marketing (y con él, sí).
// 4. Evaluación de comportamiento: el aviso sale al elegir la mascota, con enlace y excepción.
// 5. «Precios sin capturar» solo de los módulos prendidos.
// 6. Portal: las consultas como resumen (motivo, diagnóstico, indicaciones), sin personal.
// 7. Los avisos nativos de validación salen en español.
// 9. El campo trampa del registro está fuera del árbol de accesibilidad.
// 1. La consulta veterinaria: cargos antes de firmar y la cuenta en Caja después.
import { createClient } from "@supabase/supabase-js";
import { B, SB, A, URL, env, datos, rpc, personas, dar, quitar, fijarModulo, hoy, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const REF = new globalThis.URL(URL).hostname.split(".")[0];
const sufijo = String(Date.now()).slice(-6);
const P = await personas();

async function cookiesDe(profileId, host) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: host, path: "/" }));
}
const nav = await abrirNavegador();
const abrir = async (profileId, ancho = 1100) => {
  const c = await nav.newContext({ viewport: { width: ancho, height: 900 } });
  if (profileId) await c.addCookies(await cookiesDe(profileId, "huellitas.localhost"));
  const p = await c.newPage();
  p.setDefaultTimeout(45000);
  p.on("dialog", (d) => d.accept());
  return { c, p };
};
const texto = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const esperarTexto = async (p, re, ms = 25000) => {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (re.test(await texto(p))) return true;
    await p.waitForTimeout(400);
  }
  return false;
};

const PLAT = "http://plataforma.localhost:3001";
const medicosCreados = [];
const limpieza = [];
try {
  // ── 7 y 9: registro ──────────────────────────────────────────────
  seccion("7 y 9. Registro: validaciones en español y campo trampa");
  {
    const c = await nav.newContext({ viewport: { width: 390, height: 844 }, locale: "en-US" });
    const p = await c.newPage();
    await p.goto(`${PLAT}/registro`, { waitUntil: "domcontentloaded" });
    await p.locator('button[type="submit"]').last().click();
    await p.waitForTimeout(500);
    const msgs = await p.evaluate(() => [...document.querySelectorAll("input:invalid, select:invalid, textarea:invalid")].map((e) => e.validationMessage));
    comprobar(msgs.length > 0 && msgs.every((m) => /[ñáéíóú]|Completa|Elige|Marca|Escribe|Usa|valor|formato|Revisa/.test(m) && !/Please|fill out|select an item/i.test(m)), `con el navegador en inglés, los avisos salen en español (${msgs.slice(0, 3).join(" | ")})`);
    await p.fill('input[name="telefono"]', "123");
    await p.fill('input[name="password"]', "abc");
    await p.locator('button[type="submit"]').last().click();
    await p.waitForTimeout(400);
    const pw = await p.evaluate(() => document.querySelector('input[name="password"]')?.validationMessage ?? "");
    comprobar(/al menos 8|Usa al menos/i.test(pw) && !/Please/i.test(pw), `una contraseña corta avisa en español (${pw})`);
    await p.fill('input[name="password"]', "abcdefgh1");
    await p.waitForTimeout(200);
    const despues = await p.evaluate(() => document.querySelector('input[name="password"]')?.validationMessage ?? "");
    comprobar(despues === "", "al corregir el campo el aviso se quita (no queda trabado)");
    const t = await p.evaluate(() => {
      const el = document.querySelector('input[name="sitio_web"]');
      return { aria: el?.getAttribute("aria-hidden"), tab: el?.getAttribute("tabindex"), auto: el?.getAttribute("autocomplete"), cont: el?.closest("[aria-hidden]")?.getAttribute("aria-hidden"), inert: el?.closest("[inert]") != null };
    });
    comprobar(t.aria === "true" && t.tab === "-1" && t.auto === "off" && t.cont === "true" && t.inert, `el campo trampa: aria-hidden, tabindex -1, autocomplete off e inerte (${JSON.stringify(t)})`);
    const snap = JSON.stringify(await p.accessibility?.snapshot?.().catch(() => null));
    comprobar(!/Sitio web/.test(snap ?? ""), "y no aparece en el árbol de accesibilidad");
    await c.close();
  }

  // ── 3: reel ───────────────────────────────────────────────────────
  seccion("3. Reel de Ludogteka y consentimiento");
  for (const acepta of [false, true]) {
    const c = await nav.newContext({ viewport: { width: 1100, height: 900 } });
    const p = await c.newPage();
    const pidioInstagram = [];
    await c.route(/instagram\.com|cdninstagram|facebook\.(com|net)/, (r) => { pidioInstagram.push(r.request().url()); return r.fulfill({ status: 200, contentType: "application/javascript", body: "" }); });
    await p.goto(PLAT + "/", { waitUntil: "domcontentloaded" });
    await p.getByRole("button", { name: acepta ? "Aceptar" : "Rechazar", exact: true }).first().click({ timeout: 30000 }).catch(() => {});
    const boton = p.getByRole("button", { name: /reel de Ludogteka/i }).first();
    for (let i = 0; i < 30 && (await boton.count()) === 0; i++) { await p.mouse.wheel(0, 900); await p.waitForTimeout(400); }
    await boton.scrollIntoViewIfNeeded();
    await boton.click();
    await p.waitForTimeout(2500);
    if (acepta) {
      comprobar(pidioInstagram.some((u) => /embed\.js/.test(u)), "con marketing aceptado se pide el embed de Instagram");
    } else {
      comprobar(pidioInstagram.length === 0, `sin consentimiento NO se pide nada a Instagram (${pidioInstagram.length} peticiones)`);
      const t = await texto(p);
      comprobar(/cookies de marketing/i.test(t) && (await p.getByRole("link", { name: /Ver en Instagram/i }).count()) > 0, "se ve el respaldo: portada y «Ver en Instagram»");
    }
    await c.close();
  }

  // ── 5: precios de módulos apagados ───────────────────────────────
  seccion("5. Precios sin capturar solo de los módulos prendidos");
  const nombreEst = `QA Estética ${sufijo}`;
  const ins = await SB.from("servicios").insert({ negocio_id: B, clave: `qa_est_${sufijo}`, nombre: nombreEst, categoria: "estetica", unidad: "sesion", duracion_minutos: 30, orden: 9990 }).select("id").single();
  if (ins.error) throw new Error(`servicio de prueba: ${ins.error.message}`);
  limpieza.push(async () => { await SB.from("servicios").update({ deleted_at: new Date().toISOString() }).eq("id", ins.data.id); });
  {
    const { c, p } = await abrir(datos.adminB);
    await fijarModulo("estetica", true);
    await p.goto("http://huellitas.localhost:3001/admin", { waitUntil: "domcontentloaded" });
    comprobar(await esperarTexto(p, new RegExp(nombreEst)), "con Estética prendida, el servicio sin precio sale en «Precios sin capturar»");
    await p.goto("http://huellitas.localhost:3001/bienvenida", { waitUntil: "domcontentloaded" });
    const bien1 = await texto(p);
    comprobar(/Servicios y precios/.test(bien1) && !/Servicios y precios\s*Listo/.test(bien1), "y el paso «Servicios y precios» de la bienvenida queda pendiente");
    await fijarModulo("estetica", false);
    await p.goto("http://huellitas.localhost:3001/admin", { waitUntil: "domcontentloaded" });
    await esperarTexto(p, /Panel de admin|Administración/);
    const adm = await texto(p);
    comprobar(!new RegExp(nombreEst).test(adm), "con Estética apagada ese servicio ya no aparece como pendiente");
    await fijarModulo("estetica", true);
    await c.close();
  }

  // ── 4: evaluación de comportamiento ──────────────────────────────
  seccion("4. Evaluación de comportamiento al elegir la mascota");
  {
    const cli = await SB.from("clientes").insert({ negocio_id: B, nombre: `Dueña Sin Evaluación ${sufijo}`, telefono: `81${String(Date.now()).slice(-8)}` }).select("id").single();
    const pe = await SB.from("perros").insert({ negocio_id: B, cliente_id: cli.data.id, nombre: `Sineval ${sufijo}` }).select("id").single();
    limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", pe.data.id); await SB.from("clientes").update({ deleted_at: new Date().toISOString() }).eq("id", cli.data.id); });
    for (const [quien, id, esperaExcepcion] of [["admin", datos.adminB, true], ["recepción sin permiso", P.recSinId, false]]) {
      const { c, p } = await abrir(id);
      await p.goto(`http://huellitas.localhost:3001/guarderia/nueva?cliente=${cli.data.id}`, { waitUntil: "domcontentloaded" });
      // QA S16 (N68): un cliente con un solo perro ya lo trae escogido; volver a tocarlo lo quitaría.
      await p.getByText(`Sineval ${sufijo}`).first().waitFor({ timeout: 30000 });
      const casilla = p.locator("label", { hasText: `Sineval ${sufijo}` }).locator('input[type="checkbox"]').first();
      if (!(await casilla.count()) || !(await casilla.isChecked())) await p.getByText(`Sineval ${sufijo}`).first().click({ timeout: 30000 });
      comprobar(await esperarTexto(p, /no tiene evaluación de comportamiento/, 15000), `${quien}: el aviso sale al elegir la mascota, antes de «Crear reserva»`);
      comprobar((await p.getByRole("link", { name: /Completar la evaluación/ }).count()) > 0, `${quien}: con enlace para completar la evaluación`);
      const hayExc = (await p.getByText(/Reservar sin evaluación/).count()) > 0;
      comprobar(hayExc === esperaExcepcion, `${quien}: ${esperaExcepcion ? "ve" : "no ve"} la excepción con motivo`);
      comprobar(await p.getByRole("button", { name: "Crear reserva" }).isDisabled(), `${quien}: «Crear reserva» está deshabilitado mientras no haya evaluación o excepción`);
      if (esperaExcepcion) {
        await p.getByText(/Reservar sin evaluación/).first().click();
        await p.getByLabel("Motivo de la excepción").first().fill("Se evalúa hoy al llegar");
        comprobar(!(await p.getByRole("button", { name: "Crear reserva" }).isDisabled()), "con la excepción y su motivo ya se puede crear");
      }
      await c.close();
    }
  }

  // ── 1 y 6: consulta, cargos y portal ─────────────────────────────
  seccion("1 y 6. La consulta cobra a Caja; el portal ve un resumen");
  {
    await fijarModulo("veterinaria", true);
    await fijarModulo("inventario", true);
    await rpc(P.admin, "vet_asegurar_servicios");
    const sGen = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "vet_consulta_general").single()).data.id;
    await SB.from("tarifas").update({ deleted_at: new Date().toISOString() }).eq("servicio_id", sGen).is("deleted_at", null);
    await SB.from("tarifas").insert({ negocio_id: B, servicio_id: sGen, precio: 450, no_aplica: false, cantidad_desde: 1, cantidad_hasta: null, vigencia_desde: "2026-01-01" });
    const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
    medicosCreados.push(med.cuerpo);
    const perro = (await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `Cobrin UI ${sufijo}`, especie: "perro" }).select("id").single()).data.id;
    limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perro); });
    const ini = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: med.cuerpo });
    await rpc(P.recCon, "vet_consulta_guardar", { p_id: ini.cuerpo, p_datos: { motivo: "Comezón en las orejas", anamnesis: "NOTA-INTERNA-ANAMNESIS", plan: "Limpieza diaria", tratamiento: "Gotas 5 días", notas_internas: "SECRETO-DEL-EQUIPO", diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Otitis externa", tipo: "definitivo", nota: "" }] } });
    const { c, p } = await abrir(P.recConId);
    await p.goto(`http://huellitas.localhost:3001/veterinaria/consulta/${ini.cuerpo}`, { waitUntil: "domcontentloaded" });
    comprobar(await esperarTexto(p, /Cargos de esta consulta/), "antes de firmar se ve el recuadro «Cargos de esta consulta»");
    const t1 = await texto(p);
    comprobar(/Consulta general/.test(t1) && /\$450/.test(t1), "con la consulta general y su precio ($450)");
    await p.getByRole("button", { name: "Firmar la consulta" }).click();
    await p.locator("[data-confirmar-firma]").getByRole("button", { name: "Sí, firmar" }).click({ timeout: 3000 }).catch(() => {});
    comprobar(await esperarTexto(p, /Cobro de esta consulta/), "al firmar aparece «Cobro de esta consulta»");
    comprobar((await p.getByRole("link", { name: /Abrir la cuenta en Caja/ }).count()) > 0, "con el enlace a la cuenta en Caja");
    const cargo = (await SB.from("vet_consulta_cargos").select("cargo_id, estado").eq("consulta_id", ini.cuerpo).eq("negocio_id", B)).data;
    comprobar(cargo.length === 1 && cargo[0].estado === "cobrado", "el cargo quedó en la cuenta");
    await c.close();

    const dueno = await abrir(datos.cuentaSoloB);
    await dueno.p.goto(`http://huellitas.localhost:3001/portal/perros/${perro}`, { waitUntil: "domcontentloaded" });
    comprobar(await esperarTexto(dueno.p, /Consultas veterinarias/), "el dueño ve «Consultas veterinarias» en su portal");
    const tp = await texto(dueno.p);
    comprobar(/Motivo:\s*Comezón en las orejas/.test(tp) && /Diagnóstico:\s*Otitis externa/.test(tp) && /Indicaciones:\s*Limpieza diaria/.test(tp) && /Gotas 5 días/.test(tp), "como resumen: motivo, diagnóstico e indicaciones");
    comprobar(!/NOTA-INTERNA|SECRETO-DEL-EQUIPO|UQA\d+|cédula/i.test(tp), "sin notas internas ni datos del personal");
    comprobar(!/\$450|Consulta general/.test(tp), "ni montos del cobro");
    await dueno.c.close();
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const f of limpieza) await f().catch(() => {});
  for (const m of medicosCreados) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
  await quitar(P.admin, P.recSinId, "atender_consultas");
  await nav.close();
  void dar; void hoy;
  terminar();
}
