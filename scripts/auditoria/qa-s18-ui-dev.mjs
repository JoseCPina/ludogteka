// QA S18 del 20 de octubre de 2026, EN PANTALLA (SOLO DESARROLLO, Huellitas). Con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/qa-s18-ui-dev.mjs
//
// N94. «Descartar borrador» confirma en la pantalla y regresa al expediente con «Borrador descartado».
// N52. La confirmación de cancelar una cita de estética dice servicio, mascota, día y hora.
// N92. A 393 px el nombre del negocio va en un renglón y el encabezado mide 64 px.
// N70. «Servicios extra» lista lo que se cobra aparte; la tarifa por kilómetro dice cómo se cobra.
import { createClient } from "@supabase/supabase-js";
import { B, SB, A, URL, env, datos, rpc, personas, dar, quitar, fijarModulo, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
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
const comoAdmin = async () => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${P.admin}`, "x-negocio-id": B } } });
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
const BASE = "http://huellitas.localhost:3001";
const medicosCreados = [];
const limpieza = [];
const servicioId = async (clave) => (await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", clave).is("deleted_at", null).single()).data.id;
const quitarPrecio = async (clave) => {
  const id = await servicioId(clave);
  await SB.from("tarifas").update({ deleted_at: new Date().toISOString() }).eq("servicio_id", id).is("deleted_at", null);
};
const nuevoPerro = async (nombre) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${sufijo}`, especie: "perro" }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", r.data.id); });
  return r.data.id;
};

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
  medicosCreados.push(med.cuerpo);

  seccion("N94. Descartar borrador");
  {
    const perro = await nuevoPerro("S18 desc");
    const ini = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: med.cuerpo });
    const { c, p } = await abrir(P.recConId, 393);
    await p.goto(`${BASE}/veterinaria/consulta/${ini.cuerpo}`, { waitUntil: "networkidle" });
    await p.locator("[data-descartar-borrador]").click();
    await p.locator("[data-confirmar-descarte]").waitFor();
    comprobar((await p.locator("[data-confirmar-descarte]").innerText()).includes("¿Descartar este borrador?"), "pide confirmar EN la pantalla (sin window.confirm)");
    await p.getByRole("button", { name: "Sí, descartar" }).click();
    await p.waitForURL(/\/veterinaria\/expediente\/.+aviso=descartado/, { timeout: 45000 }).catch(() => {});
    comprobar(/aviso=descartado/.test(p.url()) && (await esperarTexto(p, /Borrador descartado/)), `regresa al expediente con «Borrador descartado» (${p.url()})`);
    const fila = (await SB.from("vet_consultas").select("deleted_at").eq("id", ini.cuerpo).single()).data;
    comprobar(Boolean(fila?.deleted_at), "y el borrador quedó dado de baja");
    await c.close();
  }

  seccion("N52. Cancelar una cita de estética dice qué se cancela");
  {
    const srvE = (await SB.from("servicios").select("id, nombre").eq("negocio_id", B).eq("categoria", "estetica").eq("clave", "estetica_expres").is("deleted_at", null).single()).data;
    const perroW = await nuevoPerro("S18 canc");
    const tam = (await SB.from("tamanos_categoria").select("id").is("deleted_at", null).order("orden").limit(1).single()).data?.id ?? null;
    const pel = (await SB.from("tipos_pelaje").select("id").eq("clave", "corto").maybeSingle()).data?.id ?? null;
    await SB.from("perros").update({ tamano_id: tam, pelaje_id: pel }).eq("id", perroW);
    const rr = (await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    const dia = new Date(Date.now() + 47 * 86400000).toISOString().slice(0, 10);
    const cita = await SB.from("citas_estetica").insert({ reserva_id: rr.id, perro_id: perroW, servicio_id: srvE.id, empleado_id: datos.esteticaB, inicio: `${dia}T18:00:00-06:00` }).select("id").single();
    if (cita.error) comprobar(false, `no se pudo armar la cita de prueba: ${cita.error.message}`);
    else {
      limpieza.push(async () => { await SB.from("citas_estetica").update({ deleted_at: new Date().toISOString() }).eq("id", cita.data.id); });
      const { c, p } = await abrir(datos.adminB, 393);
      await p.goto(`${BASE}/estetica/${cita.data.id}`, { waitUntil: "networkidle" });
      await p.getByRole("button", { name: /^Cancelar( la)? cita$/ }).first().click();
      const ok = await esperarTexto(p, new RegExp(`¿Cancelar ${srvE.nombre} de S18 canc ${sufijo}, \\d+ \\w+\\.? \\d{1,2}:\\d{2} [ap]\\.m\\.\\?`));
      comprobar(ok, "la confirmación dice servicio, mascota, día y hora");
      await c.close();
    }
  }

  seccion("N92. Encabezado a 393 px");
  {
    const { c, p } = await abrir(datos.adminB, 393);
    await p.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
    const alto = await p.locator("header").first().evaluate((h) => h.getBoundingClientRect().height);
    const nombre = p.locator("header [data-nombre-negocio]").first();
    const datosNombre = (await nombre.count()) ? await nombre.evaluate((n) => ({ alto: n.getBoundingClientRect().height, linea: parseFloat(getComputedStyle(n).lineHeight) || 24, title: n.parentElement?.getAttribute("title") })) : null;
    comprobar(Math.round(alto) === 64, `el encabezado mide 64 px (${alto})`);
    comprobar(!datosNombre || (datosNombre.alto <= datosNombre.linea * 1.5 && Boolean(datosNombre.title)), `el nombre del negocio va en un renglón con el nombre completo en title (${JSON.stringify(datosNombre)})`);
    await c.close();
  }

  seccion("N70. Servicios extra y tarifas por kilómetro");
  {
    const { c, p } = await abrir(datos.adminB, 1100);
    await p.goto(`${BASE}/extras`, { waitUntil: "networkidle" });
    comprobar((await p.locator("[data-cobrables]").count()) === 1 && (await p.locator("[data-cobrable]").count()) >= 1, "«Servicios extra» lista lo que se cobra aparte");
    const km = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("unidad", "km").is("deleted_at", null).limit(1).maybeSingle()).data;
    if (km) {
      await p.goto(`${BASE}/servicios/${km.id}/tarifas`, { waitUntil: "networkidle" });
      comprobar((await p.locator("[data-como-se-cobra]").count()) === 1 && /por kilómetro/.test(await p.locator("[data-como-se-cobra]").innerText()), "las tarifas por kilómetro dicen cómo se cobra");
    }
    await c.close();
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const f of limpieza) await f().catch(() => {});
  for (const m of medicosCreados) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
  await nav.close();
  void dar; void quitar; void comoAdmin;
  terminar();
}
