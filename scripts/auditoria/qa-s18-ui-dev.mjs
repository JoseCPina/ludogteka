// QA S18 del 20 de octubre de 2026, EN PANTALLA (SOLO DESARROLLO, Huellitas). Con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/qa-s18-ui-dev.mjs
//
// N94. «Descartar borrador» confirma en la pantalla y regresa al expediente con «Borrador descartado».
// N52. La confirmación de cancelar una cita de estética dice servicio, mascota, día y hora.
// N92. A 393 px el nombre del negocio va en un renglón y el encabezado mide 64 px.
// N70. «Servicios extra» lista lo que se cobra aparte; la tarifa por kilómetro dice cómo se cobra.
// S19. «Quitar» una vacuna nacida en el borrador; descartar dice qué vacuna se anula, regresa la cita a Confirmada y navega
//      a la agenda; «Agendar cita» confirma; «Emitir receta» en la consulta firmada; el encabezado de /caja/cobrar dice «Caja».
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

  seccion("S19. Ciclo del borrador en pantalla");
  {
    const perro = await nuevoPerro("S19 ciclo");
    const cuando = new Date(Date.now() + (60 + Math.floor(Math.random() * 200)) * 86400000);
    cuando.setUTCHours(16, 0, 0, 0);
    const cita = await rpc(P.admin, "vet_agendar_cita", { p_perro: perro, p_tipo: "consulta", p_medico: med.cuerpo, p_inicia: cuando.toISOString(), p_duracion_min: 30, p_motivo: null });
    await rpc(P.admin, "vet_cita_estado", { p_id: cita.cuerpo?.id, p_estado: "confirmada", p_motivo: null });
    const ini = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: cita.cuerpo?.id, p_tipo: "consulta", p_medico: med.cuerpo });
    const vac = (nombre) => rpc(P.recCon, "vet_consulta_registrar_vacuna", { p_consulta: ini.cuerpo, p_biologico: nombre, p_tipo_requisito_id: null, p_insumo_id: null, p_lote_id: null, p_lote_texto: "PRUEBA-L", p_laboratorio: null, p_fecha: new Date().toISOString().slice(0, 10), p_proxima: null, p_medico_id: med.cuerpo, p_dosis: null, p_notas: null, p_descontar: false });
    const v1 = await vac(`Quitar ${sufijo}`);
    const v2 = await vac(`Rabia ${sufijo}`);
    comprobar(v1.ok && v2.ok, `dos vacunas aplicadas desde la consulta (${v1.mensaje ?? ""} ${v2.mensaje ?? ""})`);
    const { c, p } = await abrir(P.recConId, 393);
    await p.goto(`${BASE}/veterinaria/consulta/${ini.cuerpo}`, { waitUntil: "networkidle" });
    const fila1 = p.locator("[data-vacuna-consulta]", { hasText: `Quitar ${sufijo}` });
    comprobar((await fila1.locator("[data-quitar-boton]").count()) === 1, "cada vacuna aplicada en el borrador trae «Quitar»");
    await fila1.locator("[data-quitar-boton]").click();
    await fila1.locator("[data-quitar-si]").click();
    await p.waitForFunction((t) => !document.body.innerText.includes(t), `Quitar ${sufijo}`, { timeout: 30000 }).catch(() => {});
    const anulada = (await SB.from("carnet_vacunas").select("anulada_at").eq("id", v1.cuerpo?.id).single()).data;
    comprobar(!(await texto(p)).includes(`Quitar ${sufijo}`) && Boolean(anulada?.anulada_at), "«Quitar» la anula en el carnet y sale de la consulta");
    await p.locator("[data-descartar-borrador]").click();
    const conf = await p.locator("[data-texto-descarte]").innerText();
    comprobar(conf.includes(`Se pierde lo que escribiste y se anula la vacuna Rabia ${sufijo}`), `la confirmación dice qué vacuna se anula («${conf}»)`);
    await p.getByRole("button", { name: "Sí, descartar" }).click();
    await p.waitForURL(/\/veterinaria\/agenda\?fecha=.+aviso=descartado/, { timeout: 45000 }).catch(() => {});
    comprobar(/\/veterinaria\/agenda\?fecha=.+aviso=descartado/.test(p.url()) && (await esperarTexto(p, /Borrador descartado/)), `después de la respuesta navega a la agenda de ese día (${p.url()})`);
    const v2f = (await SB.from("carnet_vacunas").select("anulada_at").eq("id", v2.cuerpo?.id).single()).data;
    const citaF = (await SB.from("vet_citas").select("estado").eq("id", cita.cuerpo?.id).single()).data;
    comprobar(Boolean(v2f?.anulada_at) && citaF?.estado === "confirmada", `la vacuna del borrador quedó anulada y la cita volvió a Confirmada (${citaF?.estado})`);
    await rpc(P.admin, "vet_cita_estado", { p_id: cita.cuerpo?.id, p_estado: "cancelada", p_motivo: "Fin de la prueba" });
    // «Agendar cita» confirma al guardar.
    await p.goto(`${BASE}/veterinaria/agenda/nueva?perro=${perro}`, { waitUntil: "networkidle" });
    const fechaA = new Date(Date.now() + (300 + Math.floor(Math.random() * 50)) * 86400000).toISOString().slice(0, 10);
    await p.locator('input[name="fecha"]').fill(fechaA);
    await p.locator('input[name="hora"]').fill("11:30");
    const selPerro = p.locator('select[name="perro_id"], input[name="perro_id"]');
    if ((await selPerro.count()) && (await selPerro.first().evaluate((e) => e.tagName)) === "SELECT") await selPerro.first().selectOption(perro).catch(() => {});
    await p.getByRole("button", { name: "Agendar cita" }).click();
    comprobar(await esperarTexto(p, /Cita agendada/), "«Agendar cita» confirma «Cita agendada»");
    const agendada = (await SB.from("vet_citas").select("id").eq("perro_id", perro).neq("estado", "cancelada").order("created_at", { ascending: false }).limit(1)).data?.[0];
    if (agendada) await rpc(P.admin, "vet_cita_estado", { p_id: agendada.id, p_estado: "cancelada", p_motivo: "Fin de la prueba" });
    await c.close();
  }
  {
    // «Emitir receta» en una consulta firmada.
    await dar(P.admin, P.recConId, "emitir_recetas");
    const perro = await nuevoPerro("S19 receta");
    const ini = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: med.cuerpo });
    await rpc(P.recCon, "vet_consulta_guardar", { p_id: ini.cuerpo, p_datos: { motivo: "Receta", diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Otitis", tipo: "presuntivo", nota: "" }] } });
    const lineas = (await rpc(P.recCon, "vet_consulta_cargos", { p_consulta: ini.cuerpo })).cuerpo?.lineas ?? [];
    for (const l of lineas) await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: l.id, p_motivo: "Sin cobro: prueba" });
    const f = await rpc(P.recCon, "vet_consulta_firmar", { p_id: ini.cuerpo });
    const { c, p } = await abrir(P.recConId, 393);
    await p.goto(`${BASE}/veterinaria/consulta/${ini.cuerpo}`, { waitUntil: "networkidle" });
    const boton = p.locator("[data-emitir-receta]");
    comprobar(f.ok && (await boton.count()) === 1 && ((await boton.getAttribute("href")) ?? "").includes(`consulta=${ini.cuerpo}`), "la consulta firmada trae «Emitir receta» hacia la receta de esa consulta");
    await c.close();
    await quitar(P.admin, P.recConId, "emitir_recetas");
  }
  {
    // El encabezado de /caja/cobrar dice «Caja».
    const { data: r } = await SB.from("reservas").select("id").eq("negocio_id", B).order("created_at", { ascending: false }).limit(1).single();
    const { c, p } = await abrir(P.adminId ?? datos.adminB, 1280);
    await p.goto(`${BASE}/caja/cobrar/${r.id}`, { waitUntil: "networkidle" });
    const cab = await p.locator("header").first().innerText();
    comprobar(/\bCaja\b/.test(cab) && !/\/\s*Inicio/.test(cab), `el encabezado de una cuenta dice «Caja» («${cab.replace(/\s+/g, " ").slice(0, 80)}»)`);
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
