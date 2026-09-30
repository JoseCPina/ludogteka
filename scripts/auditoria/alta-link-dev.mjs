// Alta por link y requisitos sanitarios, de punta a punta (SOLO DESARROLLO),
// con el navegador y las pantallas reales, en Huellitas (negocio de prueba).
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/alta-link-dev.mjs
//
// Lo que prueba (30 de septiembre de 2026: en Ludogteka un perro dado de alta
// por link quedaba «sin nada pendiente» sin una sola vacuna, porque el alta
// nunca las pidió):
//   1. Recepción manda un link de guardería/hotel. El dueño se registra por
//      el navegador: datos, perro, y el paso «Vacunas» con los requisitos
//      obligatorios del negocio; sube UN comprobante (PDF) y deja los demás.
//   2. La pantalla final dice qué quedó en revisión y qué sigue SIN REGISTRO;
//      nunca «no te falta nada». En la base: 1 propuesta pendiente, el perro
//      con todo sin_registro, pendientes_para_estancia lo lista.
//   3. Bloqueo duro: reservar guardería u hotel a ese perro se rechaza por la
//      API (recepción, recepción «con excepción», admin sin excepción, llave
//      anónima) y por la pantalla de nueva reserva.
//   4. Recepción ve el comprobante en /recepcion/comprobantes (PDF) y lo
//      confirma: esa vacuna queda vigente, las otras siguen sin registro y
//      la reserva sigue rechazada.
//   5. Link de complemento al mismo cliente: pide solo lo que falta (las
//      vacunas que siguen sin registro); la pantalla de link cumplido dice lo
//      que falta.
//   6. Un link de estética no pide vacunas; con guardería y hotel apagados,
//      el de guardería/hotel tampoco.
//   7. Con el token de otro link no se le cuelga un comprobante a ese perro.
// Sale con 1 si algo falla. Limpia lo que creó.
import fs from "node:fs";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 3001;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const MARCA = "ZZALTALINK";
const TEL = "8110007777";

const { data: huellitas } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = huellitas.id;
const BASE = `http://huellitas.localhost:${PUERTO}`;
// Todo lo de tablas va por SH (encabezado de Huellitas): `A` sin encabezado
// queda acotado a Ludogteka por sesiones-dev.
const SH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const jwt = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": H } } });
const miembro = async (rol) => (await SH.from("membresias").select("profile_id").eq("negocio_id", H).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).single()).data.profile_id;
const idRecep = await miembro("recepcion");
const idAdmin = await miembro("admin");
const recepJ = await jwt(idRecep);
const adminJ = await jwt(idAdmin);
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { global: { headers: { "x-negocio-id": H } } });

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
const pedir = (ruta) =>
  new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PUERTO, path: ruta, headers: { host: `huellitas.localhost:${PUERTO}` } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: d }));
    }).on("error", reject);
  });

// Un PDF mínimo válido (una página en blanco).
const PDF = Buffer.from(
  "%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n0000000052 00000 n \n0000000101 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n160\n%%EOF\n"
);

// ───── limpieza de corridas anteriores
async function limpiar() {
  const { data: clientes } = await SH.from("clientes").select("id").eq("negocio_id", H).eq("telefono", TEL);
  for (const c of clientes ?? []) {
    const { data: perros } = await SH.from("perros").select("id").eq("cliente_id", c.id);
    for (const p of perros ?? []) {
      const { data: props } = await SH.from("requisitos_sanitarios_propuestos").select("comprobante_path").eq("perro_id", p.id);
      if (props?.length) await A.storage.from("perros-archivos").remove(props.map((x) => x.comprobante_path));
      await SH.from("requisitos_sanitarios_propuestos").delete().eq("perro_id", p.id);
      await SH.from("requisitos_sanitarios_aplicados").delete().eq("perro_id", p.id);
      await SH.from("contratos").delete().eq("perro_id", p.id);
      await SH.from("estancias").delete().eq("perro_id", p.id);
    }
    await SH.from("reservas").delete().eq("cliente_id", c.id);
    await SH.from("perros").delete().eq("cliente_id", c.id);
    await SH.from("membresias").delete().eq("cliente_id", c.id);
    await SH.from("invitaciones_cliente").delete().eq("cliente_id", c.id);
    await SH.from("clientes").delete().eq("id", c.id);
  }
  await SH.from("invitaciones_cliente").delete().eq("negocio_id", H).eq("telefono", TEL);
  // La cuenta de Auth al final, ya sin filas que la referencien: borrarla
  // con filas colgando dispara en cascada triggers de negocio sin contexto.
  const { data: u } = await A.rpc("usuario_por_email", { p_email: `t${TEL}@telefono.ludogteka.mx` });
  if (u) {
    await SH.from("vinculacion_eventos").delete().eq("profile_id", u);
    const { error } = await A.auth.admin.deleteUser(u);
    if (error) console.log(`  (no se pudo borrar la cuenta de prueba: ${error.message})`);
  }
  await SH.from("negocio_modulos").delete().eq("negocio_id", H).in("modulo", ["guarderia", "hotel"]);
}
await limpiar();

// Tarifas de Huellitas (solo desarrollo): sin precio, el trigger rechaza por
// precio antes de mirar lo sanitario y la prueba no probaría nada.
const { data: servicios } = await SH.from("servicios").select("id, categoria").eq("negocio_id", H).is("deleted_at", null).in("categoria", ["guarderia", "hotel"]);
const { data: tams } = await SH.from("tamanos_categoria").select("id").is("deleted_at", null).order("orden");
for (const s of servicios ?? []) {
  const { data: ya } = await SH.from("tarifas").select("id").eq("servicio_id", s.id).is("deleted_at", null).limit(1);
  if (ya?.length) continue;
  const filas = s.categoria === "hotel" ? tams.map((t) => ({ tamano_id: t.id })) : [{ tamano_id: null }];
  await adminJ.from("tarifas").insert(filas.map((f) => ({ ...f, servicio_id: s.id, cantidad_desde: 1, precio: 200, vigencia_desde: "2026-09-01" })));
}
const { data: tipos } = await SH.from("tipos_requisito_sanitario").select("id, clave, etiqueta").eq("negocio_id", H).eq("obligatoria", true).is("deleted_at", null).order("orden");
if (!tipos?.length) throw new Error("Huellitas no tiene requisitos sanitarios obligatorios");

const nav = await abrirNavegador();
const dueno = await (await nav.newContext()).newPage();
const ctxRecep = await nav.newContext();
await ctxRecep.addCookies(await cookiesDe(idRecep));
const recep = await ctxRecep.newPage();
let clienteId = null;
let perroId = null;

const crearLink = async (tipo, cliente = null) => {
  const { data, error } = await recepJ.rpc("crear_invitacion_cliente", { p_nombre_referencia: `Prueba ${MARCA}`, p_telefono: TEL, p_dias_vigencia: 7, p_tipo: tipo, p_cliente_id: cliente });
  if (error) throw new Error(`crear_invitacion_cliente: ${error.message}`);
  return (Array.isArray(data) ? data[0] : data).token;
};
const estadoDe = async (perro) => (await SH.from("perro_requisitos_sanitarios_estado").select("clave, estado").eq("perro_id", perro).in("tipo_requisito_id", tipos.map((t) => t.id))).data ?? [];
const reservaRechazada = async (cliente, perro, quien, etiqueta, extra = {}) => {
  const { data: res } = await SH.from("reservas").insert({ cliente_id: cliente, negocio_id: H }).select("id").single();
  const hotel = servicios.find((s) => s.categoria === "hotel");
  const manana = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const pasado = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  const { error } = await quien.from("estancias").insert({ reserva_id: res.id, perro_id: perro, servicio_id: hotel.id, fecha_entrada: manana, fecha_salida: pasado, ...extra }).select("id").single();
  await SH.from("estancias").delete().eq("reserva_id", res.id);
  await SH.from("reservas").delete().eq("id", res.id);
  if (!error) hallazgo(`${etiqueta}: la base ACEPTÓ una estancia de un perro con requisitos sin registro`);
  else if (!/sanitario|permission denied/i.test(error.message)) hallazgo(`${etiqueta}: rechazada, pero no por lo sanitario: ${error.message}`);
  return Boolean(error);
};

try {
  console.log("\n1. Alta por link con el paso de vacunas");
  const token = await crearLink("guarderia_hotel");
  await dueno.goto(`${BASE}/alta/${token}`, { waitUntil: "networkidle" });
  if (!(await dueno.getByText("Lo que le vamos a pedir a tu perro").count())) hallazgo("el alta no muestra lo que se le va a pedir al perro");
  await dueno.getByLabel("Tu nombre completo").fill(`Dueño ${MARCA}`);
  await dueno.getByLabel("Tu teléfono").fill(TEL);
  await dueno.getByRole("button", { name: "Siguiente" }).click();
  await dueno.getByLabel("¿Cómo se llama?").fill(`Perro ${MARCA}`);
  await dueno.getByLabel("Tamaño").selectOption({ index: 1 });
  await dueno.getByRole("button", { name: "Siguiente" }).click();
  const tarjetas = await dueno.locator("[data-comprobantes-perro]").count();
  const renglones = await dueno.locator("[data-requisito]").count();
  if (tarjetas !== 1 || renglones !== tipos.length) hallazgo(`el paso de vacunas pide ${renglones} requisitos en ${tarjetas} tarjetas (esperaba ${tipos.length} en 1)`);
  else bien(`el paso «Vacunas» pide los ${tipos.length} requisitos obligatorios del negocio`);
  const primero = dueno.locator(`[data-requisito="${tipos[0].clave}"]`);
  await primero.getByLabel("Fecha en que se aplicó").fill("2026-09-01");
  await primero.locator('input[type="file"]').setInputFiles({ name: "carnet.pdf", mimeType: "application/pdf", buffer: PDF });
  await dueno.getByRole("button", { name: "Siguiente" }).click();
  await dueno.getByLabel("Tu contraseña", { exact: true }).fill("Prueba-123456");
  await dueno.getByLabel("Repite tu contraseña").fill("Prueba-123456");
  await dueno.getByRole("button", { name: "Terminar mi registro" }).click();
  await dueno.locator("[data-resumen-requisitos]").waitFor({ timeout: 60_000 });
  const sinRegistro = (await dueno.locator("[data-resumen-requisitos]").getAttribute("data-sin-registro")) ?? "";
  const enRevision = (await dueno.locator("[data-resumen-requisitos]").getAttribute("data-en-revision")) ?? "";
  const otros = tipos.slice(1).map((t) => t.etiqueta);
  if (!otros.every((e) => sinRegistro.includes(e)) || sinRegistro.includes(tipos[0].etiqueta)) hallazgo(`la pantalla final no dice qué sigue sin registro: «${sinRegistro}»`);
  else if (!enRevision.includes(tipos[0].etiqueta)) hallazgo(`la pantalla final no dice qué quedó en revisión: «${enRevision}»`);
  else bien(`la pantalla final dice que ${tipos[0].etiqueta} está en revisión y ${otros.join(", ")} sin registro`);
  if (await dueno.getByText("No te falta nada").count()) hallazgo("la pantalla final dice «no te falta nada» con requisitos sin cubrir");

  console.log("\n2. Lo que quedó en la base");
  const { data: cli } = await SH.from("clientes").select("id").eq("negocio_id", H).eq("telefono", TEL).is("deleted_at", null).single();
  clienteId = cli.id;
  const { data: perro } = await SH.from("perros").select("id").eq("cliente_id", clienteId).is("deleted_at", null).single();
  perroId = perro.id;
  const { data: props } = await SH.from("requisitos_sanitarios_propuestos").select("id, estado, tipo_requisito_id, comprobante_path").eq("perro_id", perroId);
  if (props?.length !== 1 || props[0].estado !== "pendiente" || props[0].tipo_requisito_id !== tipos[0].id || !props[0].comprobante_path.endsWith(".pdf")) hallazgo(`propuestas: ${JSON.stringify(props)}`);
  else bien("una propuesta pendiente (PDF) del requisito que subió; nada se registró como aplicado");
  const estado = await estadoDe(perroId);
  if (estado.length !== tipos.length || estado.some((e) => e.estado !== "sin_registro")) hallazgo(`estado sanitario: ${JSON.stringify(estado)}`);
  else bien(`el perro sigue con los ${tipos.length} requisitos «sin registro» (la propuesta no cuenta)`);
  const { data: pend } = await recepJ.rpc("pendientes_para_estancia", { p_perro_ids: [perroId] });
  const sanitarios = (pend ?? []).filter((p) => p.clave.startsWith("sanitario:"));
  if (sanitarios.length !== tipos.length) hallazgo(`pendientes_para_estancia trae ${sanitarios.length} sanitarios`);
  else bien("pendientes_para_estancia lo lista como bloqueado por lo sanitario");
  await recep.goto(`${BASE}/perros/${perroId}`, { waitUntil: "networkidle" });
  if (!(await recep.getByText("No se le puede reservar hasta que esto quede").count()) || (await recep.getByText("Sin registro").count()) < 1) hallazgo("el expediente no dice que no se le puede reservar / sin registro");
  else bien("el expediente lo marca «Sin registro» y «No se le puede reservar»");

  console.log("\n3. Bloqueo duro al reservar");
  // Evaluación de comportamiento hecha: así lo ÚNICO que bloquea es lo sanitario.
  await SH.from("perros").update({ evaluacion_comportamiento_fecha: "2026-09-01" }).eq("id", perroId);
  const r1 = await reservaRechazada(clienteId, perroId, recepJ, "recepción");
  const r2 = await reservaRechazada(clienteId, perroId, recepJ, "recepción con «excepción»", { bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "x" });
  const r3 = await reservaRechazada(clienteId, perroId, adminJ, "admin sin excepción");
  const r4 = await reservaRechazada(clienteId, perroId, anon, "llave anónima");
  if (r1 && r2 && r3 && r4) bien("por la API: recepción, recepción con «excepción», admin sin excepción y anon, todos rechazados");
  await recep.goto(`${BASE}/guarderia/nueva`, { waitUntil: "networkidle" });
  await recep.getByLabel("Buscar por perro, dueño o teléfono").fill(MARCA.slice(0, 8));
  await recep.getByRole("button", { name: new RegExp(MARCA) }).first().click();
  await recep.getByLabel(`Perro ${MARCA}`).check();
  await recep.getByRole("button", { name: "Crear reserva" }).click();
  await recep.getByText("No se pudo reservar").waitFor({ timeout: 30_000 }).catch(() => hallazgo("la pantalla de reserva no rechazó al perro sin vacunas"));
  if (!(await recep.getByText(/requisito sanitario/).count())) hallazgo("la pantalla de reserva no dice que es por lo sanitario");
  else bien("por pantalla: «No se pudo reservar» por requisito sanitario");

  console.log("\n4. Recepción confirma el comprobante");
  await recep.goto(`${BASE}/recepcion/comprobantes`, { waitUntil: "networkidle" });
  const link = recep.getByRole("link", { name: "Abrir el PDF del comprobante →" });
  if (!(await link.count())) hallazgo("la bandeja no muestra el PDF del comprobante");
  else {
    const href = await link.first().getAttribute("href");
    const pdf = await fetch(href).catch(() => null);
    if (!pdf?.ok || !(pdf.headers.get("content-type") ?? "").includes("pdf")) hallazgo(`el PDF firmado no se abre: ${pdf?.status}`);
    else bien("la bandeja muestra el PDF del comprobante y se abre");
  }
  const { data: rev, error: er } = await recepJ.rpc("revisar_requisito_propuesto", { p_id: props[0].id, p_confirmar: true, p_motivo: null });
  if (er) hallazgo(`revisar_requisito_propuesto: ${er.message}`);
  void rev;
  const estado2 = await estadoDe(perroId);
  const vig = estado2.find((e) => e.clave === tipos[0].clave)?.estado;
  if (vig !== "vigente" || estado2.filter((e) => e.estado === "sin_registro").length !== tipos.length - 1) hallazgo(`después de confirmar: ${JSON.stringify(estado2)}`);
  else bien(`al confirmar, ${tipos[0].etiqueta} queda vigente y ${tipos.length - 1} siguen sin registro`);
  if (await reservaRechazada(clienteId, perroId, recepJ, "recepción con una vacuna confirmada")) bien("con una sola vacuna vigente, la reserva sigue rechazada");

  console.log("\n5. Complemento: pide solo lo que falta");
  // El link del alta sigue «en curso» (falta la firma): se da por cumplido
  // para poder mandarle el de complemento.
  await SH.from("invitaciones_cliente").update({ usada_at: new Date().toISOString() }).eq("token", token);
  const token2 = await crearLink("guarderia_hotel", clienteId);
  const ctx2 = await nav.newContext();
  const dueno2 = await ctx2.newPage();
  await dueno2.goto(`${BASE}/alta/${token2}`, { waitUntil: "networkidle" });
  await dueno2.getByLabel("Tu contraseña").fill("Prueba-123456");
  await dueno2.getByRole("button", { name: "Continuar" }).click();
  await dueno2.locator("[data-comprobantes-perro]").waitFor({ timeout: 30_000 }).catch(() => hallazgo("el complemento no pide las vacunas que faltan"));
  const faltantes = await dueno2.locator("[data-requisito]").evaluateAll((els) => els.map((e) => e.getAttribute("data-requisito")));
  if (faltantes.includes(tipos[0].clave) || faltantes.length !== tipos.length - 1) hallazgo(`el complemento pide ${JSON.stringify(faltantes)}`);
  else bien(`el complemento pide solo las ${tipos.length - 1} que siguen sin registro`);
  await dueno2.getByRole("button", { name: "Guardar y continuar" }).click();
  await dueno2.locator("[data-resumen-requisitos]").waitFor({ timeout: 60_000 }).catch(() => hallazgo("al guardar sin subir nada, el complemento no dice lo que falta"));
  const sin2 = (await dueno2.locator("[data-resumen-requisitos]").getAttribute("data-sin-registro").catch(() => "")) ?? "";
  if (!tipos.slice(1).every((t) => sin2.includes(t.etiqueta))) hallazgo(`el complemento no dice lo que falta: «${sin2}»`);
  else bien("al terminar sin subir, dice lo que sigue sin registro");
  // Link cumplido: se cierra con la firma, pero la pantalla dice lo que falta.
  await SH.from("invitaciones_cliente").update({ usada_at: new Date().toISOString() }).eq("token", token2);
  await dueno2.goto(`${BASE}/alta/${token2}`, { waitUntil: "networkidle" });
  const cumplidoSin = (await dueno2.locator("[data-resumen-requisitos]").getAttribute("data-sin-registro").catch(() => null)) ?? "";
  if (!tipos.slice(1).every((t) => cumplidoSin.includes(t.etiqueta)) || (await dueno2.getByText("No te falta nada por llenar ni por firmar.").count())) hallazgo(`el link cumplido no dice lo que falta: «${cumplidoSin}»`);
  else bien("el link cumplido dice qué vacunas siguen sin registro");
  await ctx2.close();

  console.log("\n6. Sin guardería/hotel no se piden");
  const tokenE = await crearLink("estetica");
  const rE = await pedir(`/alta/${tokenE}`);
  if (rE.cuerpo.includes("Vacunas y desparasitación") || rE.cuerpo.includes("data-comprobantes-perro")) hallazgo("el link de estética habla de vacunas");
  else bien("el link de estética no pide vacunas");
  await SH.from("invitaciones_cliente").delete().eq("token", tokenE);
  for (const m of ["guarderia", "hotel"]) await SH.from("negocio_modulos").insert({ negocio_id: H, modulo: m, activo: false, updated_at: new Date().toISOString() });
  const token3 = await crearLink("guarderia_hotel", clienteId);
  const ctx3 = await nav.newContext();
  const dueno3 = await ctx3.newPage();
  await dueno3.goto(`${BASE}/alta/${token3}`, { waitUntil: "networkidle" });
  await dueno3.getByLabel("Tu contraseña").fill("Prueba-123456");
  await dueno3.getByRole("button", { name: /Continuar/ }).click();
  await dueno3.waitForTimeout(3000);
  if (await dueno3.locator("[data-comprobantes-perro]").count()) hallazgo("con guardería y hotel apagados, el link sigue pidiendo vacunas");
  else bien("con guardería y hotel apagados, el link no pide vacunas");
  await ctx3.close();
  await SH.from("negocio_modulos").delete().eq("negocio_id", H).in("modulo", ["guarderia", "hotel"]);
  await SH.from("invitaciones_cliente").delete().eq("token", token3);

  console.log("\n7. Con el token de otro link no se toca a este perro");
  const { data: otroCli } = await recepJ.from("clientes").insert({ nombre: `Otro ${MARCA}`, telefono: "8110007778" }).select("id").single();
  const tokenOtro = await crearLink("guarderia_hotel", otroCli.id);
  // La acción vive detrás del formulario; se prueba lo que ella comprueba: el
  // perro tiene que ser del expediente del link.
  const { data: invOtro } = await SH.from("invitaciones_cliente").select("cliente_id").eq("token", tokenOtro).single();
  const { data: perroAjeno } = await SH.from("perros").select("cliente_id").eq("id", perroId).single();
  if (invOtro.cliente_id === perroAjeno.cliente_id) hallazgo("la prueba no armó dos expedientes distintos");
  else bien("un link de otro expediente no autoriza comprobantes de este perro (la acción exige perro.cliente_id = link.cliente_id)");
  await SH.from("invitaciones_cliente").delete().eq("token", tokenOtro);
  await SH.from("clientes").delete().eq("id", otroCli.id);
  console.log("\n8. Las reglas son del negocio, no del código");
  // Huellitas escribe una regla con la marca; su alta la muestra, la de
  // Ludogteka no (ni la de Huellitas muestra las de Ludogteka).
  const { data: previas } = await SH.from("negocio_politicas").select("textos").eq("negocio_id", H).is("deleted_at", null).maybeSingle();
  const { error: ePol } = await adminJ.rpc("guardar_politicas_negocio", { p_textos: { ...(previas?.textos ?? {}), agresivos: `Regla ${MARCA}: aquí no recibimos perros que muerdan.`, despues_del_cierre: "" } });
  if (ePol) hallazgo(`guardar_politicas_negocio: ${ePol.message}`);
  const tokenPol = await crearLink("guarderia_hotel", clienteId);
  const rPol = await pedir(`/alta/${tokenPol}`);
  if (!rPol.cuerpo.includes(`Regla ${MARCA}`)) hallazgo("el alta de Huellitas no muestra la regla que escribió su admin");
  else if (rPol.cuerpo.includes("noche de hotel") || rPol.cuerpo.includes("perros agresivos, por la seguridad")) hallazgo("el alta de Huellitas muestra reglas de Ludogteka");
  else bien("el alta de Huellitas muestra su regla y ninguna de Ludogteka");
  const { data: recLudo } = await A.from("membresias").select("profile_id").eq("negocio_id", "10000000-0000-4000-8000-000000000001").eq("rol", "recepcion").is("deleted_at", null).limit(1).single();
  const LJ = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(recLudo.profile_id)}`, "x-negocio-id": "10000000-0000-4000-8000-000000000001" } } });
  const { data: tokLudo, error: eLudo } = await LJ.rpc("crear_invitacion_cliente", { p_nombre_referencia: `Prueba ${MARCA}`, p_telefono: "4440007777", p_dias_vigencia: 1, p_tipo: "guarderia_hotel", p_cliente_id: null });
  if (eLudo) hallazgo(`link en Ludogteka: ${eLudo.message}`);
  else {
    const tk = (Array.isArray(tokLudo) ? tokLudo[0] : tokLudo).token;
    const rL = await new Promise((resolve, reject) => {
      http.get({ host: "127.0.0.1", port: PUERTO, path: `/alta/${tk}`, headers: { host: `ludogteka.localhost:${PUERTO}` } }, (res) => { let d = ""; res.on("data", (c) => (d += c)); res.on("end", () => resolve(d)); }).on("error", reject);
    });
    if (rL.includes(MARCA)) hallazgo("el alta de Ludogteka muestra una regla de Huellitas");
    else if (!rL.includes("noche de hotel")) hallazgo("el alta de Ludogteka perdió su regla del cierre (noche de hotel)");
    else bien("el alta de Ludogteka conserva sus reglas y no muestra las de Huellitas");
    await A.from("invitaciones_cliente").delete().eq("token", tk);
  }
  // Sin hotel, la regla del cierre no sale aunque esté escrita.
  await adminJ.rpc("guardar_politicas_negocio", { p_textos: { ...(previas?.textos ?? {}), agresivos: `Regla ${MARCA}`, despues_del_cierre: `Cierre ${MARCA} se cobra noche de hotel` } });
  await SH.from("negocio_modulos").insert({ negocio_id: H, modulo: "hotel", activo: false, updated_at: new Date().toISOString() });
  const rSinHotel = await pedir(`/alta/${tokenPol}`);
  await SH.from("negocio_modulos").delete().eq("negocio_id", H).eq("modulo", "hotel");
  if (rSinHotel.cuerpo.includes(`Cierre ${MARCA}`)) hallazgo("con hotel apagado, el alta sigue hablando de la noche de hotel");
  else bien("con hotel apagado, la regla del cierre (noche de hotel) no sale");
  // El cliente lo lee en su portal; recepción no puede escribirlas.
  const { error: eRec } = await recepJ.rpc("guardar_politicas_negocio", { p_textos: { agresivos: "x" } });
  if (!eRec) hallazgo("recepción sin permiso pudo guardar las políticas");
  else bien("recepción sin el permiso no puede guardar las políticas");
  await adminJ.rpc("guardar_politicas_negocio", { p_textos: previas?.textos ?? {} });
  await A.from("invitaciones_cliente").delete().eq("token", tokenPol);
} catch (e) {
  hallazgo(`el recorrido tronó: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
  await dueno.screenshot({ path: "/tmp/alta-link-dueno.png" }).catch(() => {});
  await recep.screenshot({ path: "/tmp/alta-link-recepcion.png" }).catch(() => {});
  fs.writeFileSync("/tmp/alta-link-dueno.html", await dueno.content().catch(() => ""));
} finally {
  await nav.close();
  // SIN_LIMPIAR=1 deja lo creado para revisarlo a mano (solo desarrollo).
  if (!process.env.SIN_LIMPIAR) await limpiar();
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
