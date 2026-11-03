// App para dueños · Fase 3 · PANTALLAS de punta a punta (SOLO DESARROLLO, Huellitas). docs/app-duenos/FASE-3.md
//
// Con la app compilada y prendida (npm run build && npm run start -- -p 3001):
//
//   node scripts/auditoria/app-duenos-f3-pantallas-dev.mjs [--capturas <carpeta>]
//
// Un dueño de Huellitas con cuenta (C1), en un celular de 390 px, en app.localhost, hace lo de la Fase 3 TOCANDO:
//   1. Su mascota nueva sale en la app; «Dónde la conocen» abre su pestaña de Huellitas con «Pedir cita» y «Reservar».
//   2. Pedir cita: servicio → día → hora libre → «Pedir la cita»; la pantalla dice el precio y quién la atiende, y la
//      base tiene la cita reservada con ese precio y esa persona.
//   3. «Te toca» del inicio la cuenta; en Mis visitas, «Confirmar que vamos» la deja confirmada (pantalla y base).
//   4. Reservar guardería: servicio → día → «Ver si hay lugar» (cupo por día) → «Reservar»; si Huellitas pide contrato de
//      alta, se lee y se firma con el dedo ahí mismo (contrato firmado en la base, con su PDF).
//   5. Pagos: la cuenta de la cita sale con su saldo (el precio de la cita); Pases abre.
//   6. Opinar: con la cita finalizada, «¿Cómo te fue?» → 5 estrellas y una línea → la reseña queda; y sale en la página
//      pública de Huellitas («verificadas por PeluDesk»).
//   7. Ninguna pantalla desborda a 390 px. Con --capturas, guarda una captura por paso.
// Lo que crea se borra al terminar (perro, reservas, cita, estancia, contrato y su PDF, reseña).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = Number(process.env.PUERTO_APP ?? 3001);
const BASE_APP = `http://app.localhost:${PUERTO}`;
const BASE_NEGOCIO = `http://huellitas.localhost:${PUERTO}`;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const i = process.argv.indexOf("--capturas");
const CAPTURAS = i > 0 ? process.argv[i + 1] : null;
if (CAPTURAS) fs.mkdirSync(CAPTURAS, { recursive: true });

const hallazgos = [];
const bien = (t) => console.log(`  ✔ ${t}`);
const mal = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const comprobar = (c, t) => (c ? bien(t) : mal(t));
const seccion = (t) => console.log(`\n── ${t}`);
const sufijo = `F3P-${Date.now().toString(36).slice(-5)}`;
const suma = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);

const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const H = datos.B;
const S = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const enNegocio = (token) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": H } } });
const sinNegocio = (token) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${token}` } } });
const hoyH = (await S.rpc("fecha_negocio")).data;

// Un dueño con cuenta y pocas mascotas (app_mis_vinculos se pagina).
const { data: miembros } = await S.from("membresias").select("profile_id, cliente_id").eq("negocio_id", H).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).order("created_at").limit(40);
let C1 = null;
for (const m of miembros ?? []) {
  const { data: c } = await S.from("clientes").select("id, nombre").eq("id", m.cliente_id).is("deleted_at", null).maybeSingle();
  const { count } = await S.from("perros").select("id", { count: "exact", head: true }).eq("cliente_id", m.cliente_id).is("deleted_at", null);
  if (c && (count ?? 0) <= 5) { C1 = { ...m, nombre: c.nombre }; break; }
}
if (!C1) throw new Error("Huellitas necesita un cliente con cuenta (negocio-prueba-dev.mjs).");
const t1 = await tokenDe(C1.profile_id);
const c1 = enNegocio(t1);
await A.from("duenos").upsert([{ id: C1.profile_id, updated_at: new Date().toISOString() }], { onConflict: "id", ignoreDuplicates: true });
console.log(`Huellitas ${H.slice(0, 8)} · dueño ${C1.nombre} · hoy ${hoyH}`);

async function cookiesDe(profileId, dominio) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, k) => [`${nombre}.${k}`, t]));
  return galletas(`sb-${REF}-portal-auth-token`).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}

const creados = { perro: null, reservas: [], citas: [], estancias: [], contratos: [], resenas: [], pdfs: [] };
const nav = await abrirNavegador();
try {
  // ── Escenario: un perro nuevo de C1 en Huellitas, en regla para guardería ──────────────────────────────────────
  const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: pelo } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
  const { data: raza } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
  const nombre = `Luna ${sufijo}`;
  const { data: perro, error: eP } = await S.from("perros").insert({ negocio_id: H, cliente_id: C1.cliente_id, nombre, raza: "Poodle", raza_id: raza?.id, tamano_id: talla?.id, pelaje_id: pelo?.id }).select("id").single();
  if (eP) throw new Error(`perro: ${eP.message}`);
  creados.perro = perro.id;
  const adm = enNegocio(await tokenDe(datos.adminB));
  await adm.rpc("marcar_evaluacion_comportamiento", { p_perro_id: perro.id, p_fecha: hoyH, p_notas: "prueba F3 pantallas" });
  const { data: tipos } = await S.from("tipos_requisito_sanitario").select("id").eq("negocio_id", H).is("deleted_at", null);
  for (const t of tipos ?? []) await S.from("requisitos_sanitarios_aplicados").insert({ negocio_id: H, perro_id: perro.id, tipo_requisito_id: t.id, fecha_aplicacion: suma(hoyH, -3), detalle: "Prueba F3 pantallas" });
  const { data: vinculos } = await sinNegocio(t1).rpc("app_mis_vinculos");
  const mascotaId = (vinculos ?? []).find((v) => v.perro_id === perro.id)?.mascota_id;
  if (!mascotaId) throw new Error("el perro nuevo no salió en app_mis_vinculos");
  const { data: servicios } = await S.from("servicios").select("id, nombre, categoria, unidad").eq("negocio_id", H).is("deleted_at", null);
  const estetica = (servicios ?? []).find((s) => s.categoria === "estetica" && /ba[ñn]o/i.test(s.nombre)) ?? (servicios ?? []).find((s) => s.categoria === "estetica");
  const guarderia = (servicios ?? []).find((s) => s.categoria === "guarderia" && s.unidad !== "hora" && s.unidad !== "noche") ?? (servicios ?? []).find((s) => s.categoria === "guarderia" && s.unidad !== "noche");
  // El primer día (de los 14 que enseña la pantalla) con horas libres.
  let diaCita = null;
  for (let d = 1; d < 14 && !diaCita; d++) {
    const { data } = await c1.rpc("portal_horas_disponibles", { p_servicio: estetica.id, p_fecha: suma(hoyH, d) });
    if (data?.abre && (data.horas ?? []).length > 1) diaCita = suma(hoyH, d);
  }
  if (!diaCita) throw new Error("ningún día de las próximas dos semanas tiene horas libres en Huellitas");

  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await ctx.addCookies(await cookiesDe(C1.profile_id, "app.localhost"));
  const p = await ctx.newPage();
  // Un error de JavaScript en la página es un hallazgo (una pantalla que truena en el navegador no enseña su paso).
  p.on("pageerror", (e) => mal(`error de JavaScript en ${p.url()}: ${e.message.slice(0, 160)}`));
  const esperar = async (sel, que) => {
    try {
      await p.waitForSelector(sel, { timeout: 20_000 });
    } catch {
      if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, `falla-${que}.jpg`), type: "jpeg", quality: 70, fullPage: true }).catch(() => {});
      throw new Error(`no apareció ${que} (${sel}) en ${p.url()}`);
    }
  };
  let paso = 0;
  const foto = async (que) => {
    paso += 1;
    if (CAPTURAS) await p.screenshot({ path: path.join(CAPTURAS, `${String(paso).padStart(2, "0")}-${que}.jpg`), type: "jpeg", quality: 82, fullPage: true });
  };
  const ancho = async (que) => {
    const a = await p.evaluate(() => ({ s: document.documentElement.scrollWidth, w: window.innerWidth }));
    comprobar(a.s <= a.w + 1, `${que}: sin desborde a 390 px (${a.s} ≤ ${a.w})`);
  };

  // ── 1. Su mascota y su pestaña del negocio ──────────────────────────────────────────────────────────────────────
  seccion("1. Mascota y su pestaña de Huellitas");
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}`, { waitUntil: "networkidle" });
  const vinc = p.locator("[data-vinculo]").first();
  comprobar((await vinc.count()) > 0, "la ficha de la mascota tiene «Dónde la conocen» con Huellitas");
  await foto("ficha-mascota");
  await vinc.click();
  await p.waitForURL(/\/negocio\//, { timeout: 20_000 });
  await p.waitForLoadState("networkidle");
  comprobar((await p.locator("[data-ir-pedir-cita]").count()) > 0 && (await p.locator("[data-ir-reservar]").count()) > 0, "su pestaña de Huellitas ofrece «Pedir cita» y «Reservar»");
  await ancho("pestaña del negocio");
  await foto("pestana-negocio");

  // ── 2. Pedir cita tocando ──────────────────────────────────────────────────────────────────────────────────────
  seccion("2. Pedir cita");
  await p.locator("[data-ir-pedir-cita]").click();
  await esperar("[data-pedir-cita]", "el flujo de pedir cita");
  await p.locator(`[data-servicio-cita="${estetica.id}"]`).click();
  await foto("cita-servicio");
  await p.locator(`[data-dia="${diaCita}"]`).click();
  await p.waitForSelector("[data-horas-cita] [data-hora]", { timeout: 20_000 });
  const primera = p.locator("[data-horas-cita] [data-hora]").first();
  const inicio = await primera.getAttribute("data-hora");
  await primera.click();
  await ancho("pedir cita");
  await foto("cita-dia-hora");
  await p.locator("[data-pedir-la-cita]").click();
  await p.waitForSelector("[data-cita-pedida], [data-error-cita]", { timeout: 30_000 });
  const okCita = await p.locator("[data-cita-pedida]").count();
  comprobar(okCita > 0, `la pantalla dice «¡Listo! La cita… quedó apartada»${okCita ? "" : ` (error: ${await p.locator("[data-error-cita]").innerText()})`}`);
  const atiende = okCita ? await p.locator("[data-atiende]").innerText().catch(() => "") : "";
  const precioTxt = okCita ? await p.locator("[data-precio]").innerText().catch(() => "") : "";
  comprobar(/La atiende \S/.test(atiende) && /\$\d/.test(precioTxt), `y enseña quién la atiende y el precio («${atiende}» · «${precioTxt}»)`);
  await foto("cita-lista");
  const { data: cita } = await S.from("citas_estetica").select("id, reserva_id, estado, precio, empleado_id, inicio").eq("perro_id", perro.id).is("deleted_at", null).maybeSingle();
  if (cita) { creados.citas.push(cita.id); creados.reservas.push(cita.reserva_id); }
  comprobar(cita?.estado === "reservada" && Number(cita?.precio) > 0 && Boolean(cita?.empleado_id) && new Date(cita.inicio).getTime() === new Date(inicio).getTime(), `en la base: cita reservada a esa hora, con precio ${cita?.precio} y quien la atiende`);
  comprobar(precioTxt.includes(Number(cita?.precio ?? -1).toFixed(2)), "el precio de la pantalla es el de la base");

  // ── 3. «Te toca» y confirmar en un toque ───────────────────────────────────────────────────────────────────────
  seccion("3. Te toca y confirmar");
  await p.goto(`${BASE_APP}/`, { waitUntil: "networkidle" });
  comprobar((await p.locator('[data-pendiente="confirmar"]').count()) > 0, "el inicio dice «visita por confirmar» en «Te toca»");
  await ancho("inicio");
  await foto("inicio-te-toca");
  await p.locator('[data-pendiente="confirmar"]').click();
  await p.waitForSelector(`[data-confirmar-visita="${cita?.id}"]`, { timeout: 20_000 });
  await foto("visitas-por-confirmar");
  await p.locator(`[data-confirmar-visita="${cita?.id}"]`).click();
  await p.waitForSelector(`[data-visita="${cita?.id}"][data-estado="confirmada"]`, { timeout: 20_000 }).catch(() => null);
  const estPantalla = await p.locator(`[data-visita="${cita?.id}"]`).getAttribute("data-estado");
  const { data: citaConf } = await S.from("citas_estetica").select("estado").eq("id", cita?.id).maybeSingle();
  comprobar(estPantalla === "confirmada" && citaConf?.estado === "confirmada", `«Confirmar que vamos»: pantalla ${estPantalla}, base ${citaConf?.estado}`);
  await ancho("mis visitas");
  await foto("visita-confirmada");
  // Un rechazo de la base se le dice al dueño con SU texto (no «No pudimos hablar con el proveedor de cobro»): otra cita
  // el mismo día para la misma mascota.
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}/cita?negocio=${H}`, { waitUntil: "networkidle" });
  await esperar("[data-pedir-cita]", "el flujo de pedir cita (segunda)");
  await p.locator(`[data-servicio-cita="${estetica.id}"]`).click();
  await p.locator(`[data-dia="${diaCita}"]`).click();
  await esperar("[data-horas-cita] [data-hora]", "las horas del día");
  await p.locator("[data-horas-cita] [data-hora]").last().click();
  await p.locator("[data-pedir-la-cita]").click();
  await p.waitForSelector("[data-error-cita], [data-cita-pedida]", { timeout: 30_000 }).catch(() => null);
  const rechazo = await p.locator("[data-error-cita]").innerText().catch(() => "");
  comprobar(/ya tiene una cita ese día/i.test(rechazo), `otra cita el mismo día: la pantalla dice el motivo de la base («${rechazo || "sin error: ¿se creó?"}»)`);
  const { data: dobles } = await S.from("citas_estetica").select("id, reserva_id").eq("perro_id", perro.id).is("deleted_at", null);
  for (const d of dobles ?? []) if (d.id !== cita?.id) { creados.citas.push(d.id); creados.reservas.push(d.reserva_id); }
  await foto("cita-rechazo-mismo-dia");

  // ── 4. Reservar guardería tocando (y el contrato, si lo pide) ─────────────────────────────────────────────────
  seccion("4. Reservar guardería");
  let D = suma(hoyH, 30 + Math.floor(Math.random() * 20));
  while (new Date(`${D}T12:00:00Z`).getUTCDay() !== 3) D = suma(D, 1);
  await p.goto(`${BASE_APP}/mascotas/${mascotaId}/reservar?negocio=${H}`, { waitUntil: "networkidle" });
  await p.locator(`[data-servicio-reserva="${guarderia.id}"]`).click();
  await p.locator("[data-entrada]").fill(D);
  await foto("reservar-fecha");
  await p.locator("[data-ver-cupo]").click();
  await p.waitForSelector("[data-cupo], [data-error-reserva]", { timeout: 20_000 });
  comprobar((await p.locator(`[data-dia-cupo="${D}"]`).count()) > 0, `el cupo del ${D} sale por día`);
  await ancho("reservar");
  await foto("reservar-cupo");
  const hayBoton = await p.locator("[data-reservar-ya]").count();
  comprobar(hayBoton > 0, "hay lugar y sale «Reservar»");
  if (hayBoton) {
    await p.locator("[data-reservar-ya]").click();
    await p.waitForSelector("[data-reserva-hecha], [data-error-reserva]", { timeout: 30_000 });
    const okRes = await p.locator("[data-reserva-hecha]").count();
    comprobar(okRes > 0, `la pantalla dice «¡Reservado!»${okRes ? "" : ` (error: ${await p.locator("[data-error-reserva]").innerText()})`}`);
    const { data: est } = await S.from("estancias").select("id, reserva_id, estado, fecha_entrada").eq("perro_id", perro.id).is("deleted_at", null).maybeSingle();
    if (est) { creados.estancias.push(est.id); creados.reservas.push(est.reserva_id); }
    comprobar(est?.estado === "reservada" && est?.fecha_entrada === D, `en la base: estancia reservada el ${est?.fecha_entrada}`);
    await foto("reserva-hecha");
    const { data: pendientes } = await S.from("contratos").select("id, estado").eq("perro_id", perro.id).is("deleted_at", null);
    for (const c of pendientes ?? []) creados.contratos.push(c.id);
    const porFirmar = p.locator("[data-firmar-contrato]").first();
    if (await porFirmar.count()) {
      await p.waitForSelector("[data-texto-contrato]", { timeout: 20_000 });
      const textoContrato = await p.locator("[data-texto-contrato]").innerText();
      comprobar(textoContrato.includes(nombre) && !/{{/.test(textoContrato), `el contrato de alta se lee ahí mismo, con sus datos llenos («${textoContrato.slice(0, 60)}»)`);
      const lienzo = p.locator("[data-firmar-contrato] canvas").first();
      await lienzo.scrollIntoViewIfNeeded();
      const b = await lienzo.boundingBox();
      await p.mouse.move(b.x + 30, b.y + b.height / 2);
      await p.mouse.down();
      for (let k = 1; k <= 12; k++) await p.mouse.move(b.x + 30 + k * 18, b.y + b.height / 2 + (k % 2 ? -18 : 18));
      await p.mouse.up();
      await foto("contrato-firma");
      await p.locator("[data-firmar-contrato] [data-firmar]").first().click();
      await p.waitForSelector("[data-contrato-firmado]", { timeout: 40_000 }).catch(() => null);
      const { data: firmados } = await S.from("contratos").select("id, estado, storage_path").eq("perro_id", perro.id).is("deleted_at", null);
      const firmado = (firmados ?? []).find((c) => c.estado === "firmado_digital");
      if (firmado?.storage_path) creados.pdfs.push(firmado.storage_path);
      comprobar((await p.locator("[data-contrato-firmado]").count()) > 0 && Boolean(firmado?.storage_path), `firmado con el dedo: pantalla «Firmaste…», base firmado_digital con su PDF`);
      await foto("contrato-firmado");
    } else bien("Huellitas no pide contrato de alta para guardería: no hay nada que firmar (correcto)");
  }

  // ── 5. Pagos y pases ───────────────────────────────────────────────────────────────────────────────────────────
  seccion("5. Pagos y pases");
  await p.goto(`${BASE_APP}/pagos`, { waitUntil: "networkidle" });
  const pago = p.locator(`[data-pago="${cita?.reserva_id}"]`);
  const saldo = (await pago.count()) ? await pago.locator("[data-saldo]").innerText() : "";
  comprobar(saldo.includes(Number(cita?.precio ?? -1).toFixed(2)), `«Por pagar» trae la cuenta de la cita con su saldo (${saldo || "no sale"})`);
  comprobar((await pago.locator("[data-pagar]").count()) > 0, "con el botón «Pagar $…»");
  await ancho("pagos");
  await foto("pagos");
  const rPases = await p.goto(`${BASE_APP}/pases`, { waitUntil: "networkidle" });
  comprobar(rPases?.status() === 200, `Pases abre (${rPases?.status()})`);
  await ancho("pases");

  // ── 6. Opinar sobre la visita terminada y la página pública ──────────────────────────────────────────────────
  seccion("6. Opinar y la página pública");
  await S.from("citas_estetica").update({ estado: "en_curso" }).eq("id", cita?.id);
  await S.from("citas_estetica").update({ estado: "finalizada" }).eq("id", cita?.id);
  await p.goto(`${BASE_APP}/visitas`, { waitUntil: "networkidle" });
  await p.locator(`[data-opinar="${cita?.id}"]`).click();
  await p.locator(`[data-form-opinar="${cita?.id}"] [data-estrella="5"]`).click();
  const texto = `Le quedó precioso el corte ${sufijo}`;
  await p.locator(`[data-form-opinar="${cita?.id}"] textarea`).fill(texto);
  await foto("opinar");
  await p.locator(`[data-form-opinar="${cita?.id}"] [data-mandar-opinion]`).click();
  await p.waitForSelector(`[data-visita="${cita?.id}"] [data-calificada]`, { timeout: 20_000 }).catch(() => null);
  const { data: resena } = await S.from("resenas").select("id, estrellas, texto").eq("origen_id", cita?.id).maybeSingle();
  if (resena) creados.resenas.push(resena.id);
  comprobar((await p.locator(`[data-visita="${cita?.id}"] [data-calificada]`).count()) > 0 && resena?.estrellas === 5 && resena?.texto === texto, `la reseña quedó (pantalla «Gracias…», base ${resena?.estrellas ?? "sin"} estrellas)`);
  await foto("opinion-enviada");
  const html = await (await fetch(`${BASE_NEGOCIO}/`)).text();
  comprobar(html.includes(sufijo) && /verificadas por PeluDesk/.test(html), "la reseña sale en la página pública de Huellitas, «verificadas por PeluDesk»");
} finally {
  await nav.close().catch(() => {});
  const ahora = new Date().toISOString();
  for (const id of creados.resenas) await S.from("resenas").delete().eq("id", id);
  if (creados.pdfs.length) await A.storage.from("perros-archivos").remove(creados.pdfs);
  for (const id of creados.contratos) await S.from("contratos").delete().eq("id", id);
  for (const id of creados.citas) await S.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.estancias) await S.from("estancias").delete().eq("id", id);
  for (const id of creados.reservas) await S.from("reservas").delete().eq("id", id);
  if (creados.perro) {
    await S.from("requisitos_sanitarios_aplicados").delete().eq("perro_id", creados.perro);
    await S.from("perros_evaluaciones").delete().eq("perro_id", creados.perro);
    await S.from("perros").update({ deleted_at: ahora }).eq("id", creados.perro);
  }
}
console.log(hallazgos.length ? `\n✘ App para dueños · Fase 3 (pantallas): ${hallazgos.length} hallazgo(s).` : "\n✔ App para dueños · Fase 3 (pantallas): todo en orden.");
process.exit(hallazgos.length ? 1 : 0);
