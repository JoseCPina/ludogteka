// Estética en pantalla, a 390 px (celular) — SOLO DESARROLLO, en Huellitas.
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/estetica-ui-dev.mjs
//
// 1. Alta corta por link de estética: sin dirección, vacunas, correo,
//    contraseña ni contrato; sin talla gigante; con el estimado del baño;
//    termina sin cuenta; sin desbordar el ancho.
// 2. Alta corta en el mostrador (viniendo de agendar): nombre y WhatsApp; el
//    perro con nombre, raza, tamaño y pelaje.
// 3. Cita: servicios (los tres baños), nota del costo, recargo manual (con
//    motivo), y el detalle de la cita muestra el recargo.
// 4. Invitar al portal: enlace de un solo uso en la ficha, su activación
//    (escoge contraseña y entra al portal) y que el mismo enlace ya no sirve;
//    vencido, de otro negocio y falso.
// 10. N19: invitar personal pide el nombre (pantalla y servidor).
// 9. Ausencia aprobada: la cita que ya tenía la estilista sale marcada en la
//    agenda («Estilista ausente»), la lista de «Aprobadas y resueltas» deja
//    reasignarla con «Pasarla a» + «Reasignar», y la marca desaparece.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";
import { claveAleatoria } from "../lib/clave.mjs";
const CLAVE_PRUEBA = claveAleatoria(); // la clave de las cuentas que esta prueba da de alta por pantalla: se genera al correr, no vive en el código

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const BASE_L = "http://ludogteka.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);
const TEL = `44${sufijo.padStart(8, "2")}`;
const TEL2 = `44${sufijo.padStart(8, "3")}`;
const TEL3 = `44${sufijo.padStart(8, "4")}`;

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
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) hallazgo(`${donde}: la página se desborda a ${w}px en un celular de 390`);
};

const { data: recId } = await A.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
const recepJ = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(recId)}`, "x-negocio-id": B } } });

const nav = await abrirNavegador();
const ctxAdmin = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxAdmin.addCookies(await cookiesDe(datos.adminB));
const admin = await ctxAdmin.newPage();
const creados = { clientes: [], citas: [], reservas: [], cuentas: [], perros: [] };

try {
  // ── 1. Link de estética ──
  console.log("1. Alta corta por link (celular)");
  const { data: inv, error } = await recepJ.rpc("crear_invitacion_cliente", { p_nombre_referencia: `Estética ${sufijo}`, p_telefono: TEL, p_dias_vigencia: 7, p_tipo: "estetica", p_cliente_id: null });
  if (error) throw new Error(error.message);
  const token = (Array.isArray(inv) ? inv[0] : inv).token;
  const ctxDueno = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const dueno = await ctxDueno.newPage();
  await dueno.goto(`${BASE}/alta/${token}`, { waitUntil: "networkidle" });
  const t1 = (await dueno.locator("body").innerText()).toLowerCase();
  for (const prohibido of ["dirección", "correo", "contraseña", "vacuna", "contrato"]) if (t1.includes(prohibido) && !(prohibido === "dirección" && t1.includes("pasen por mi perro"))) hallazgo(`el link de estética menciona «${prohibido}» en el primer paso: …${t1.slice(Math.max(0, t1.indexOf(prohibido) - 80), t1.indexOf(prohibido) + 80).replace(/\n/g, " ")}…`);
  await dueno.getByLabel("Tu nombre completo").fill(`Dueña ${sufijo}`);
  await dueno.getByLabel("Tu teléfono").fill(TEL);
  await sinDesborde(dueno, "alta por link, paso 1");
  await dueno.getByRole("button", { name: "Siguiente" }).click();
  await dueno.getByLabel("¿Cómo se llama?").fill(`Poodle ${sufijo}`);
  await dueno.getByLabel("¿De qué raza es?").fill("Poodle");
  await dueno.waitForTimeout(500);
  await dueno.getByText("Poodle", { exact: true }).first().click();
  await dueno.waitForTimeout(300);
  const t2 = (await dueno.locator("body").innerText()).toLowerCase();
  for (const prohibido of ["veterinario", "emergencia", "alimentación", "sexo", "fecha de nacimiento", "vacuna"]) if (t2.includes(prohibido)) hallazgo(`el paso del perro en estética pide «${prohibido}»`);
  const opcionesTalla = await dueno.getByLabel("Tamaño").locator("option").allInnerTexts();
  if (opcionesTalla.some((o) => /gigante/i.test(o))) hallazgo(`el tamaño ofrece gigante: ${opcionesTalla.join(", ")}`);
  else bien(`tamaños: ${opcionesTalla.filter(Boolean).join(", ")} (sin gigante)`);
  await dueno.getByLabel("Tamaño").selectOption({ index: 1 });
  await dueno.getByLabel("Pelaje").selectOption({ label: "Medio" });
  await dueno.waitForTimeout(500);
  const cuerpo = await dueno.locator("body").innerText();
  if (process.env.DEPURAR) console.log(cuerpo);
  if (!/\$\s?390/.test(cuerpo)) hallazgo("el alta de estética no enseña el precio del baño del poodle ($390)");
  else bien("el alta enseña el precio del baño según su raza ($390)");
  if (!/puede aumentar según el tipo de pelo/i.test(cuerpo)) hallazgo("falta la nota «el costo puede aumentar según el tipo de pelo y el cuidado previo»");
  else bien("la nota del costo aparece");
  await sinDesborde(dueno, "alta por link, paso 2");
  await dueno.screenshot({ path: path.join(os.tmpdir(), "estetica-alta-corta.png"), fullPage: true });
  await dueno.getByRole("button", { name: /Terminar|Enviar|Listo|Guardar/ }).first().click();
  await dueno.waitForTimeout(4000);
  const final = (await dueno.locator("body").innerText()).toLowerCase();
  if (/error|revisa esto/.test(final)) hallazgo(`el alta corta terminó con un error: ${final.slice(0, 200)}`);
  const { data: cli } = await SB.from("clientes").select("id, direccion, email").eq("telefono", TEL).is("deleted_at", null).maybeSingle();
  if (!cli) hallazgo("el alta corta no creó el cliente");
  else {
    creados.clientes.push(cli.id);
    const { data: memb } = await SB.from("membresias").select("id").eq("cliente_id", cli.id);
    if (memb?.length) hallazgo("el alta corta creó una cuenta (no debía)");
    else bien("el alta corta no crea cuenta, ni pide dirección, correo ni contraseña");
    const { data: cts } = await SB.from("contratos").select("id").eq("cliente_id", cli.id);
    if (cts?.length) hallazgo("el alta de estética generó un contrato");
    else bien("sin contrato");
  }

  // ── 2. Mostrador ──
  console.log("\n2. Alta corta en el mostrador (celular)");
  await admin.goto(`${BASE}/clientes/nuevo?volver=${encodeURIComponent("/estetica/nueva")}`, { waitUntil: "networkidle" });
  const tm = (await admin.locator("body").innerText()).toLowerCase();
  for (const prohibido of ["correo", "dirección", "contraseña"]) if (tm.includes(prohibido)) hallazgo(`el alta de mostrador (estética) pide «${prohibido}»`);
  await admin.getByLabel("Nombre del dueño").fill(`Mostrador ${sufijo}`);
  await admin.getByLabel("WhatsApp").fill(TEL2);
  await sinDesborde(admin, "alta de mostrador");
  await admin.getByRole("button", { name: /Crear cliente/ }).click();
  await admin.waitForURL(/perros\/nuevo/, { timeout: 30_000 });
  const tp = (await admin.locator("body").innerText()).toLowerCase();
  for (const prohibido of ["veterinario", "alimentación", "emergencia", "vacuna"]) if (tp.includes(prohibido)) hallazgo(`el perro de mostrador (estética) pide «${prohibido}»`);
  await admin.getByLabel("Nombre del perro").fill(`Mostrador perro ${sufijo}`);
  await sinDesborde(admin, "perro de mostrador");
  bien("el alta de mostrador de estética es corta (dueño: nombre y WhatsApp; perro: nombre, raza, tamaño y pelaje)");
  const { data: cli2 } = await SB.from("clientes").select("id").eq("telefono", TEL2).is("deleted_at", null).maybeSingle();
  if (cli2) creados.clientes.push(cli2.id);

  // ── 2b. N68: un cliente con un solo perro lo trae ya escogido ──
  console.log("\n2b. N68: un solo perro → ya escogido al agendar");
  {
    const { data: talla1 } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
    const { data: pelo1 } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
    const { data: razaP1 } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
    const { data: cliUno } = await SB.from("clientes").insert({ nombre: `Uno solo ${sufijo}`, telefono: `44271${String(Date.now()).slice(-5)}` }).select("id").single();
    creados.clientes.push(cliUno.id);
    const { data: perroUno } = await SB.from("perros").insert({ cliente_id: cliUno.id, nombre: `Único ${sufijo}`, raza: "Poodle", raza_id: razaP1.id, tamano_id: talla1.id, pelaje_id: pelo1.id }).select("id").single();
    await admin.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
    await admin.locator("input:visible").first().fill(`Uno solo ${sufijo}`);
    await admin.waitForTimeout(800);
    await admin.getByText(`Uno solo ${sufijo}`).first().click();
    await admin.waitForTimeout(800);
    if ((await admin.getByLabel("Perro").inputValue()) !== perroUno.id) hallazgo("con un solo perro, no quedó escogido");
    else bien("con un solo perro, ya viene escogido (sin pasos de más)");
    await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", perroUno.id);
  }

  // ── 3. Cita ──
  console.log("\n3. Cita: baños, nota y recargo (celular)");
  const { data: talla } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: pelo } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
  const { data: razaP } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
  const { data: perroC } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ cita ${sufijo}`, raza: "Poodle", raza_id: razaP.id, tamano_id: talla.id, pelaje_id: pelo.id }).select("id").single();
  creados.perros = [perroC.id];
  await admin.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
  await admin.locator("input:visible").first().fill(`ZZ cita ${sufijo}`);
  await admin.waitForTimeout(800);
  await admin.getByText(`ZZ cita ${sufijo}`).first().click();
  await admin.waitForTimeout(500);
  // QA S16 (N68): con varios perros, el botón deshabilitado dice qué falta.
  if (!/Elige el perro/.test(await admin.locator("[data-motivo-agendar]").innerText().catch(() => ""))) hallazgo("«Agendar cita» deshabilitado no dice que falta elegir el perro");
  else bien("«Agendar cita» deshabilitado dice «Elige el perro.»");
  await admin.getByLabel("Perro").selectOption({ label: `ZZ cita ${sufijo}` });
  const opciones = await admin.getByLabel("Servicio").locator("option").allInnerTexts();
  const baños = opciones.filter((o) => /Baño/.test(o));
  if (baños.length !== 3) hallazgo(`la agenda debía ofrecer tres baños y ofrece: ${opciones.join(" | ")}`);
  else bien(`servicios: ${baños.join(" · ")}`);
  const ta = await admin.locator("body").innerText();
  if (!ta.includes("El costo puede aumentar según el tipo de pelo y el cuidado previo")) hallazgo("la agenda no muestra la nota del costo");
  else bien("la nota «el costo puede aumentar…» aparece al agendar");
  await sinDesborde(admin, "agendar cita");
  await admin.getByLabel("Servicio").selectOption({ label: baños.find((o) => /completo/i.test(o)) });
  await admin.getByLabel("Empleado").selectOption({ index: 1 });
  await admin.getByLabel("Recargo manual (opcional)").fill("40");
  await admin.getByRole("button", { name: "Agendar cita" }).click();
  await admin.waitForTimeout(1500);
  if (!(await admin.locator("body").innerText()).includes("necesita un motivo")) hallazgo("un recargo sin motivo no se frena en la pantalla");
  await admin.getByLabel("Motivo del recargo").fill("Nudos y cuidado previo");
  const f = new Date(Date.now() + (60 + Math.floor(Math.random() * 300)) * 86400000);
  const pad = (x) => String(x).padStart(2, "0");
  await admin.getByLabel("Fecha y hora").fill(`${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}T10:00`);
  await admin.getByRole("button", { name: "Agendar cita" }).click();
  // Se espera a que la cita exista (la base responde en 0.3–0.6 s por viaje y la acción hace varios).
  for (let i = 0; i < 40; i++) {
    const { count } = await SB.from("citas_estetica").select("id", { count: "exact", head: true }).eq("perro_id", perroC.id).is("deleted_at", null);
    if (count) break;
    await admin.waitForTimeout(500);
  }
  await admin.waitForTimeout(1000);
  const { data: citaUi } = await SB.from("citas_estetica").select("id, reserva_id, precio, precio_base, recargo, recargo_motivo, recargo_por").eq("perro_id", perroC.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!citaUi) hallazgo(`la cita con recargo no se agendó: ${(await admin.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 700)}`);
  else {
    creados.citas.push(citaUi.id); creados.reservas.push(citaUi.reserva_id);
    // N30 (QA externa, 18 de octubre de 2026): al agendar hay una confirmación VISIBLE (junto al botón y la caja de
    // citas agendadas a la vista) y un mismo perro con otra cita ese día pide confirmar antes de duplicarla.
    {
      const caja = admin.locator("[data-citas-agendadas]");
      const visible = await caja.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= window.innerHeight + 4; }).catch(() => false);
      if (!visible) hallazgo("N30: la confirmación «Cita agendada» no queda a la vista tras agendar");
      else bien("N30: la caja de «Cita agendada» queda a la vista");
      const estado = await admin.getByRole("status").filter({ hasText: /Cita agendada:/ }).count();
      if (estado === 0) hallazgo("N30: junto al botón no sale «Cita agendada: …»");
      else bien("N30: junto al botón sale «Cita agendada: perro, servicio, fecha y hora»");
      if (!(await caja.getByRole("link", { name: new RegExp(`ZZ cita ${sufijo}`) }).count())) hallazgo("N30: la confirmación no lleva a la cita creada");
      // Mismo perro, mismo día, otra hora.
      await admin.getByLabel("Perro").selectOption({ label: `ZZ cita ${sufijo}` });
      await admin.getByLabel("Fecha y hora").fill(`${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}T15:00`);
      await admin.getByRole("button", { name: "Agendar cita" }).click();
      const dup = admin.locator("[data-cita-duplicada]");
      await dup.waitFor({ timeout: 30_000 }).catch(() => {});
      const textoDup = (await dup.innerText().catch(() => "")).replace(/\s+/g, " ");
      if (!/ya tiene una cita ese día: .* a las .*¿Agendar otra de todos modos\?/.test(textoDup)) hallazgo(`N30: no avisa que el perro ya tiene cita ese día («${textoDup.slice(0, 160)}»)`);
      else bien("N30: avisa «ya tiene una cita ese día» con el servicio y la hora, antes de crear otra");
      // N38 (QA S13): la hora termina en «a.m.»/«p.m.» y no se le pega otro punto.
      const textoEstado = (await admin.getByRole("status").filter({ hasText: /Cita agendada:/ }).first().innerText().catch(() => "")).replace(/\s+/g, " ");
      if (/\.\./.test(textoDup) || /\.\./.test(textoEstado)) hallazgo(`N38: hay puntos dobles («${textoDup.slice(0, 120)}» / «${textoEstado.slice(0, 80)}»)`);
      else bien("N38: ni el aviso de cita duplicada ni «Cita agendada» llevan puntos dobles");
      const cuantas = async () => ((await SB.from("citas_estetica").select("id").eq("perro_id", perroC.id).is("deleted_at", null).not("estado", "in", "(cancelada,no_llego)")).data ?? []).length;
      if ((await cuantas()) !== 1) hallazgo("N30: se creó una segunda cita sin confirmar");
      else bien("N30: mientras no se confirma, sigue habiendo UNA sola cita");
      await admin.getByRole("button", { name: "No agendar" }).click();
      await admin.waitForTimeout(500);
      if ((await cuantas()) !== 1) hallazgo("N30: «No agendar» creó una cita");
      await admin.getByRole("button", { name: "Agendar cita" }).click();
      await dup.waitFor({ timeout: 30_000 });
      await admin.locator("[data-agendar-de-todos-modos]").click();
      for (let i = 0; i < 40 && (await cuantas()) < 2; i++) await admin.waitForTimeout(500);
      const dos = await cuantas();
      if (dos !== 2) hallazgo(`N30: con «Agendar otra de todos modos» debía haber 2 citas y hay ${dos}`);
      else bien("N30: con «Agendar otra de todos modos» se crea la segunda");
      const extra = (await SB.from("citas_estetica").select("id, reserva_id").eq("perro_id", perroC.id).neq("id", citaUi.id).is("deleted_at", null)).data ?? [];
      for (const x of extra) { creados.citas.push(x.id); creados.reservas.push(x.reserva_id); }
    }
    // Agenda de Estética a 393 px (QA S13): ningún botón de la barra se parte en dos renglones ni se sale de la
    // pantalla, y «Reprogramar» no queda como una columna angosta.
    {
      const p393 = await admin.context().newPage();
      await p393.setViewportSize({ width: 393, height: 852 });
      await p393.goto(`${BASE}/estetica?vista=dia&fecha=${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}`, { waitUntil: "networkidle" });
      const medidas = await p393.locator("[data-barra-agenda] button").evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); const lh = parseFloat(getComputedStyle(b).lineHeight) || 24; return { t: (b.getAttribute("aria-label") || b.textContent || "").trim(), alto: r.height, renglones: Math.round((b.scrollHeight - 0) / lh), izq: r.left, der: r.right }; }));
      const partidos = medidas.filter((m) => m.alto > 52 || m.izq < 0 || m.der > 393);
      if (!medidas.length) hallazgo("agenda 393 px: no encontré la barra de botones");
      else if (partidos.length) hallazgo(`agenda 393 px: botones partidos o fuera de la pantalla: ${partidos.map((m) => `${m.t} (${Math.round(m.alto)} px)`).join(", ")}`);
      else bien(`agenda 393 px: ${medidas.length} botones en una línea cada uno y dentro de la pantalla`);
      const anterior = await p393.getByRole("link", { name: "Anterior" }).count();
      if (!anterior) hallazgo("agenda 393 px: «Anterior» no tiene nombre accesible");
      else bien("agenda 393 px: «Anterior» y «Siguiente» conservan su nombre para lectores de pantalla");
      const rep = p393.locator("[data-reprogramar-agenda]").first();
      if (await rep.count()) {
        const r = await rep.boundingBox();
        if (!r || r.height > 44 || r.width < 90) hallazgo(`agenda 393 px: «Reprogramar» queda angosto (${Math.round(r?.width ?? 0)}×${Math.round(r?.height ?? 0)} px)`);
        else bien(`agenda 393 px: «Reprogramar» en un renglón (${Math.round(r.width)}×${Math.round(r.height)} px)`);
      } else hallazgo("agenda 393 px: no hay «Reprogramar» para revisar");
      const ancho393 = await p393.evaluate(() => document.documentElement.scrollWidth);
      if (ancho393 > 395) hallazgo(`agenda de estética 393 px: la página se desborda a ${ancho393}px`); else bien("agenda de estética 393 px: sin desborde");
      await p393.close();
    }
    if (Number(citaUi.precio) !== 430 || Number(citaUi.recargo) !== 40 || citaUi.recargo_por !== datos.adminB) hallazgo(`la cita no quedó $390 + $40 con quien lo hizo: ${JSON.stringify(citaUi)}`);
    else bien("cita desde la pantalla: $390 + recargo $40 = $430, con motivo y quién");
    await admin.goto(`${BASE}/estetica/${citaUi.id}`, { waitUntil: "networkidle" });
    const det = await admin.locator("body").innerText();
    if (!/Nudos y cuidado previo/.test(det) || !/\$?\s?430/.test(det)) hallazgo("el detalle de la cita no muestra el recargo con su motivo y el total");
    else bien("el detalle de la cita muestra el recargo, su motivo y el total");
    await sinDesborde(admin, "detalle de la cita");
    if (!det.includes("El costo puede aumentar")) hallazgo("el detalle de la cita no tiene la nota del costo");
  }

  // ── 4. Invitar al portal ──
  console.log("\n4. Invitar al portal");
  const { data: nuevoCli } = await SB.from("clientes").insert({ nombre: `Invitada ${sufijo}`, telefono: TEL3 }).select("id").single();
  creados.clientes.push(nuevoCli.id);
  await admin.goto(`${BASE}/clientes/${nuevoCli.id}`, { waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "Invitar al portal" }).click();
  const campo = admin.getByLabel("Enlace de invitación");
  await campo.waitFor({ timeout: 20_000 });
  const url = await campo.inputValue();
  if (!/\/activar\/[A-Za-z0-9_-]{43}$/.test(url)) hallazgo(`el enlace no tiene la forma esperada: ${url}`);
  else bien("la ficha genera el enlace (token de 32 bytes) y lo muestra con «copiar»");
  // QA S16 (N65): el botón enseña el mensaje antes de abrir WhatsApp.
  await admin.getByRole("button", { name: "Invitar al portal" }).last().click();
  await admin.locator("[data-vista-mensaje]").waitFor({ timeout: 10000 });
  if (!(await admin.locator("[data-vista-mensaje]").innerText()).includes("/activar/")) hallazgo("la vista previa del mensaje no trae el link");
  if (!(await admin.locator("[data-abrir-whatsapp]").getAttribute("href"))?.startsWith("https://wa.me/52")) hallazgo("el botón de WhatsApp no apunta a wa.me");
  await sinDesborde(admin, "ficha con la invitación");
  const tokenInv = url.split("/activar/")[1];
  const ctxInv = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const inv1 = await ctxInv.newPage();
  await inv1.goto(`${BASE}/activar/${tokenInv}`, { waitUntil: "networkidle" });
  if (!(await inv1.locator("body").innerText()).includes(`Invitada ${sufijo}`)) hallazgo("el enlace no saluda al cliente por su nombre");
  await sinDesborde(inv1, "activar");
  // Contraseñas distintas / cortas.
  await inv1.getByLabel("Escoge tu contraseña").fill(CLAVE_PRUEBA);
  await inv1.getByLabel("Repítela").fill(claveAleatoria());
  await inv1.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await inv1.waitForTimeout(500);
  if (!(await inv1.locator("body").innerText()).includes("no coinciden")) hallazgo("contraseñas distintas no se avisan");
  await inv1.getByLabel("Repítela").fill(CLAVE_PRUEBA);
  await inv1.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await inv1.waitForURL(/\/portal/, { timeout: 40_000 }).catch(() => {});
  if (!/\/portal/.test(inv1.url())) hallazgo(`activar no llevó al portal: ${inv1.url()} · ${(await inv1.locator("body").innerText()).slice(0, 200)}`);
  else bien("el cliente escoge su contraseña y entra a su portal");
  const { data: m } = await SB.from("membresias").select("id, rol").eq("cliente_id", nuevoCli.id);
  if (m?.length !== 1 || m[0].rol !== "cliente") hallazgo(`la membresía quedó mal: ${JSON.stringify(m)}`);
  const { data: usada } = await SB.from("portal_invitaciones").select("usada_at").eq("cliente_id", nuevoCli.id);
  if (!usada?.[0]?.usada_at) hallazgo("la invitación no quedó marcada como usada");
  const { data: u } = await A.rpc("usuario_por_email", { p_email: `t${TEL3}@telefono.ludogteka.mx` });
  if (u) creados.cuentas.push(u);
  // Reusar.
  const ctxOtro = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const inv2 = await ctxOtro.newPage();
  await inv2.goto(`${BASE}/activar/${tokenInv}`, { waitUntil: "networkidle" });
  if (!/ya se usó/i.test(await inv2.locator("body").innerText())) hallazgo("un enlace ya usado no dice que ya se usó");
  else bien("el mismo enlace, otra vez: «ya se usó»");
  // Falso.
  await inv2.goto(`${BASE}/activar/${"x".repeat(43)}`, { waitUntil: "networkidle" });
  if (!/no existe/i.test(await inv2.locator("body").innerText())) hallazgo("un enlace falso no dice que no existe");
  // De otro negocio: el token de Huellitas abierto en Ludogteka no existe.
  await inv2.goto(`${BASE_L}/activar/${tokenInv}`, { waitUntil: "networkidle" });
  if (!/no existe|ya se usó/i.test(await inv2.locator("body").innerText())) hallazgo("el enlace de otro negocio abrió algo");
  // Vencido.
  const { data: cli4 } = await SB.from("clientes").insert({ nombre: `Vencida ${sufijo}`, telefono: `44${sufijo.padStart(8, "5")}` }).select("id").single();
  creados.clientes.push(cli4.id);
  await admin.goto(`${BASE}/clientes/${cli4.id}`, { waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "Invitar al portal" }).click();
  const url4 = await admin.getByLabel("Enlace de invitación").inputValue();
  await SB.from("portal_invitaciones").update({ expira_at: new Date(Date.now() - 1000).toISOString() }).eq("cliente_id", cli4.id);
  await inv2.goto(`${BASE}${new globalThis.URL(url4).pathname}`, { waitUntil: "networkidle" });
  if (!/venció/i.test(await inv2.locator("body").innerText())) hallazgo("un enlace vencido no dice que venció");
  else bien("enlace vencido: «venció»; falso: «no existe»; de otro negocio: no abre nada");
  // Dos aperturas a la vez: solo una activa.
  const { data: cli5 } = await SB.from("clientes").insert({ nombre: `Carrera ${sufijo}`, telefono: `44${sufijo.padStart(8, "6")}` }).select("id").single();
  creados.clientes.push(cli5.id);
  await admin.goto(`${BASE}/clientes/${cli5.id}`, { waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "Invitar al portal" }).click();
  const url5 = await admin.getByLabel("Enlace de invitación").inputValue();
  const [pa, pb] = await Promise.all([ctxOtro.newPage(), (await nav.newContext()).newPage()]);
  for (const p of [pa, pb]) {
    await p.goto(`${BASE}${new globalThis.URL(url5).pathname}`, { waitUntil: "networkidle" });
    await p.getByLabel("Escoge tu contraseña").fill(CLAVE_PRUEBA);
    await p.getByLabel("Repítela").fill(CLAVE_PRUEBA);
  }
  await Promise.all([pa.getByRole("button", { name: "Abrir mi cuenta" }).click(), pb.getByRole("button", { name: "Abrir mi cuenta" }).click()]);
  await Promise.all([pa.waitForTimeout(8000), pb.waitForTimeout(8000)]);
  const { data: mm } = await SB.from("membresias").select("id").eq("cliente_id", cli5.id);
  if (mm?.length !== 1) hallazgo(`dos aperturas a la vez dejaron ${mm?.length} membresías`);
  else bien("dos aperturas a la vez: una sola cuenta");
  const { data: u5 } = await A.rpc("usuario_por_email", { p_email: `t44${sufijo.padStart(8, "6")}@telefono.ludogteka.mx` });
  if (u5) creados.cuentas.push(u5);

  // ── 5. Reasignar la estilista (celular) ──
  console.log("\n5. Reasignar la estilista: tablero del día y detalle de la cita (celular)");
  const S1 = datos.esteticaB;
  const S2 = datos.esteticaAmbos;
  const { data: hoyData } = await SB.rpc("fecha_negocio");
  const { data: razaPoodle } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
  const { data: tallaCh } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
  const { data: peloMed } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
  const { data: perroR } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ reasig ${sufijo}`, raza: "Poodle", raza_id: razaPoodle.id, tamano_id: tallaCh.id, pelaje_id: peloMed.id }).select("id").single();
  creados.perros.push(perroR.id);
  const { data: servEst } = await SB.from("servicios").select("id").eq("clave", "estetica_estetico").single();
  const { data: reservaR } = await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
  creados.reservas.push(reservaR.id);
  const { data: citaR, error: errCitaR } = await SB.from("citas_estetica").insert({ reserva_id: reservaR.id, perro_id: perroR.id, servicio_id: servEst.id, empleado_id: S1, inicio: `${hoyData}T20:00:00Z` }).select("id").single();
  if (errCitaR) throw new Error(`cita de hoy: ${errCitaR.message}`);
  creados.citas.push(citaR.id);
  const empleadoDe = async () => (await SB.from("citas_estetica").select("empleado_id, estado").eq("id", citaR.id).single()).data;
  // Espera a que la base tenga la estilista esperada (hasta 25 s): con el servidor lento un
  // «waitForTimeout(1500)» leía la base antes de que la acción terminara.
  const esperarEmpleado = async (esperado) => {
    for (let i = 0; i < 50; i++) {
      if ((await empleadoDe()).empleado_id === esperado) return true;
      await new Promise((r) => setTimeout(r, 500));
    }
    return false;
  };

  const ctxRec = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctxRec.addCookies(await cookiesDe(datos.recepcionB));
  const recep = await ctxRec.newPage();
  await recep.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  const lista = recep.getByLabel(`Estilista de ZZ reasig ${sufijo}`);
  if (!(await lista.count())) hallazgo("el tablero del día no trae el selector de estilista para recepción");
  else {
    bien("el tablero del día trae el selector de estilista en cada cita que no ha empezado");
    await sinDesborde(recep, "tablero del día con selector");
    const caja = await lista.boundingBox();
    if (caja && caja.height < 44) hallazgo(`el selector del tablero mide ${Math.round(caja.height)}px de alto: poco para el dedo`);
    await lista.selectOption(S2);
    await recep.locator("[data-estilista-aviso]").first().waitFor({ timeout: 25000 }).catch(() => {});
    await esperarEmpleado(S2);
    const aviso = (await recep.locator("[data-estilista-aviso]").allInnerTexts()).join(" | ");
    if (!/Quedó con .* \(antes: .*\)/.test(aviso) || (await empleadoDe()).empleado_id !== S2) hallazgo(`el tablero no confirmó el cambio a la otra estilista o no se guardó («${aviso.slice(0, 120)}»)`);
    else bien(`un toque en el tablero: ${aviso.split("|")[0].trim()}`);
    await lista.selectOption("");
    await esperarEmpleado(null);
    if ((await empleadoDe()).empleado_id !== null) hallazgo("«Sin asignar» desde el tablero no dejó la cita sin estilista");
    else bien("«Sin asignar» desde el tablero");
    await lista.selectOption(S1);
    await esperarEmpleado(S1);
  }

  // Detalle de la cita (recepción): selector, historial y confirmación
  await recep.goto(`${BASE}/estetica/${citaR.id}`, { waitUntil: "networkidle" });
  await sinDesborde(recep, "detalle de la cita con selector");
  const selDetalle = recep.getByLabel("Estilista", { exact: true });
  if (!(await selDetalle.count())) hallazgo("el detalle de la cita no trae la lista «Estilista»");
  else {
    await selDetalle.selectOption(S2);
    await recep.locator("[data-estilista-aviso]").first().waitFor({ timeout: 25000 }).catch(() => {});
    await recep.waitForFunction(() => /historial de estilista/i.test(document.body.innerText), null, { timeout: 25000 }).catch(() => {});
    const cuerpo = await recep.locator("body").innerText();
    if (!/Quedó con/.test(cuerpo) || !/historial de estilista/i.test(cuerpo)) hallazgo("el detalle no confirma con quién quedó ni muestra el historial");
    else bien("detalle: confirma con quién quedó y muestra «Historial de estilista»");
    await sinDesborde(recep, "detalle de la cita tras reasignar");
  }

  // En curso: «Cambiar estilista» con motivo opcional
  await SB.from("citas_estetica").update({ estado: "en_curso" }).eq("id", citaR.id);
  await recep.goto(`${BASE}/estetica/${citaR.id}`, { waitUntil: "networkidle" });
  await recep.getByRole("button", { name: "Cambiar estilista" }).click();
  await recep.getByLabel("Pasar a").selectOption(S1);
  await recep.getByLabel("Motivo (opcional)").fill("Tomó al perro a la mitad");
  await recep.getByRole("button", { name: "Cambiar estilista" }).last().click();
  await recep.locator("[data-estilista-aviso]").first().waitFor({ timeout: 25000 }).catch(() => {});
  await esperarEmpleado(S1);
  const aviso2 = (await recep.locator("[data-estilista-aviso]").allInnerTexts()).join(" ");
  if (!/Quedó con/.test(aviso2) || (await empleadoDe()).empleado_id !== S1) hallazgo(`en curso: no confirmó o no se guardó («${aviso2.slice(0, 100)}»)`);
  else bien("en curso: «Cambiar estilista» con motivo opcional, con confirmación");
  await sinDesborde(recep, "formulario de cambio en curso");

  // Terminada: recepción sin permiso solo ve quién fue; admin corrige con motivo
  const adminJ = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(datos.adminB)}`, "x-negocio-id": B } } });
  await adminJ.rpc("revocar_permiso", { p_profile_id: datos.recepcionB, p_permiso: "corregir_estilista" });
  const fin = await adminJ.rpc("finalizar_cita_con_consumo", { p_cita_id: citaR.id, p_recogido_por_nombre: "Prueba", p_recogido_por_telefono: "4440000000", p_recogido_por_es_dueno: true, p_ajustes: [] });
  if (fin.error) hallazgo(`no se pudo terminar la cita de prueba: ${fin.error.message}`);
  await recep.goto(`${BASE}/estetica/${citaR.id}`, { waitUntil: "networkidle" });
  if (await recep.getByRole("button", { name: "Corregir estilista" }).count()) hallazgo("recepción sin el permiso ve el botón «Corregir estilista» en un servicio terminado");
  else bien("terminada: recepción sin el permiso solo ve quién fue (sin botón de corregir)");
  await admin.goto(`${BASE}/estetica/${citaR.id}`, { waitUntil: "networkidle" });
  await admin.getByRole("button", { name: "Corregir estilista" }).click();
  await admin.getByLabel("Pasar a").selectOption(S2);
  await admin.getByRole("button", { name: "Corregir estilista" }).last().click();
  await admin.waitForTimeout(1200);
  if (!/Escribe el motivo/.test(await admin.locator("body").innerText()) || (await empleadoDe()).empleado_id !== S1) hallazgo("terminada: sin motivo la pantalla debía frenar la corrección");
  else bien("terminada: sin motivo no deja corregir");
  await admin.getByLabel("Motivo de la corrección (obligatorio)").fill("Fue otra estilista");
  await admin.getByRole("button", { name: "Corregir estilista" }).last().click();
  await admin.locator("[data-estilista-aviso]").first().waitFor({ timeout: 25000 }).catch(() => {});
  await admin.waitForFunction(() => /Fue otra estilista/.test(document.body.innerText), null, { timeout: 25000 }).catch(() => {});
  const txtAdmin = await admin.locator("body").innerText();
  if ((await empleadoDe()).empleado_id !== S2 || !/Fue otra estilista/.test(txtAdmin)) hallazgo("terminada: el admin no pudo corregir con motivo o no se ve en el historial");
  else bien("terminada: el admin corrige con motivo y queda en el historial de la cita");
  await sinDesborde(admin, "detalle de la cita terminada");
  await ctxRec.close();

  // ── 9. Ausencia aprobada: marca en la agenda y reasignación desde Ausencias ──
  console.log("9. Ausencia aprobada y citas por reasignar (celular)");
  const ADM = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(datos.adminB)}`, "x-negocio-id": B } } });
  const { data: hoyB } = await ADM.rpc("fecha_negocio");
  const sumar = (f, n) => { const [y, m, d] = f.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
  const fecha = sumar(hoyB, 260 + Math.floor(Math.random() * 60));
  let emp = (await SB.from("empleados").select("id").eq("profile_id", S1).is("deleted_at", null).maybeSingle()).data?.id;
  if (!emp) {
    const e = await SB.from("empleados").insert({ nombre: `Prueba ausencia ui ${sufijo}`, puesto: "Estilista", fecha_ingreso: sumar(hoyB, -60), telefono: "4440000000", emergencia_nombre: "Contacto", emergencia_telefono: "4441111111", profile_id: S1 }).select("id").single();
    if (e.error) throw new Error(`empleado: ${e.error.message}`);
    emp = e.data.id;
    creados.empleadosUi = [emp];
  }
  const { data: tl } = await A.from("tamanos_categoria").select("id, clave");
  const { data: pl } = await A.from("tipos_pelaje").select("id, clave");
  const { data: rz } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
  const { data: sv } = await SB.from("servicios").select("id").eq("clave", "estetica_estetico").is("deleted_at", null).single();
  const perroAus = (await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ aus ui ${sufijo}`, raza: "Poodle", raza_id: rz.id, tamano_id: tl.find((t) => t.clave === "chico").id, pelaje_id: pl.find((t) => t.clave === "medio").id }).select("id").single()).data.id;
  creados.perros.push(perroAus);
  const reserva = (await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data.id;
  creados.reservas.push(reserva);
  const citaAus = await SB.from("citas_estetica").insert({ reserva_id: reserva, perro_id: perroAus, servicio_id: sv.id, empleado_id: S1, inicio: `${fecha}T20:00:00Z` }).select("id").single();
  if (citaAus.error) throw new Error(`cita: ${citaAus.error.message}`);
  creados.citas.push(citaAus.data.id);
  const pedida = await ADM.rpc("solicitar_ausencia", { p_empleado_id: emp, p_tipo: "dia_personal", p_desde: fecha, p_hasta: fecha, p_motivo: "prueba ui" });
  if (pedida.error) throw new Error(`ausencia: ${pedida.error.message}`);
  creados.ausenciasUi = [pedida.data];
  const aprobada = await ADM.rpc("resolver_ausencia", { p_ausencia_id: pedida.data, p_aprobar: true, p_motivo: null });
  if (aprobada.error) throw new Error(`aprobar: ${aprobada.error.message}`);

  await admin.goto(`${BASE}/estetica?vista=dia&fecha=${fecha}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await admin.locator("[data-cita-en-ausencia]").first().waitFor({ timeout: 45000 }).catch(() => {});
  const marcada = await admin.locator("[data-cita-en-ausencia]").count();
  if (marcada < 1 || !(await admin.locator("body").innerText()).includes("Estilista ausente")) hallazgo("agenda: la cita de la estilista ausente no sale marcada");
  else bien("agenda: la cita de la estilista ausente sale marcada («Estilista ausente»)");
  await sinDesborde(admin, "agenda con una cita marcada");

  await admin.goto(`${BASE}/empleados/ausencias`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const bloque = admin.locator("[data-citas-por-reasignar]").first();
  await bloque.waitFor({ timeout: 45000 }).catch(() => {});
  if ((await bloque.count()) === 0) hallazgo("Ausencias: no sale el recuadro con las citas por reasignar");
  else {
    bien("Ausencias: la ausencia aprobada trae el recuadro con la cita por reasignar");
    await sinDesborde(admin, "Ausencias con citas por reasignar");
    await bloque.locator("select").first().selectOption(S2);
    await bloque.getByRole("button", { name: "Reasignar" }).first().click();
    await admin.waitForFunction(() => document.querySelectorAll("[data-cita-por-reasignar]").length === 0 || /Quedó con/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => {});
    const nuevo = (await SB.from("citas_estetica").select("empleado_id").eq("id", citaAus.data.id).single()).data?.empleado_id;
    if (nuevo !== S2) hallazgo("Ausencias: «Reasignar» no pasó la cita a la otra estilista");
    else bien("Ausencias: «Reasignar» pasa la cita a otra estilista");
  }
  await admin.goto(`${BASE}/estetica?vista=dia&fecha=${fecha}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await admin.waitForTimeout(1500);
  if ((await admin.locator("[data-cita-en-ausencia]").count()) !== 0) hallazgo("agenda: la marca sigue después de reasignar");
  else bien("agenda: la marca desaparece al reasignar");

  console.log("10. Invitar personal pide el nombre");
  await admin.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 90000 });
  const campoNombre = admin.getByLabel("Nombre completo").first();
  await campoNombre.waitFor({ timeout: 45000 }).catch(() => {});
  if ((await campoNombre.count()) === 0) hallazgo("Administración: «Invitar personal» no pide el nombre");
  else if (!(await campoNombre.evaluate((e) => e.required))) hallazgo("el nombre de «Invitar personal» no es obligatorio");
  else bien("«Invitar personal» pide el nombre completo (obligatorio)");
  const sinNombre = await admin.evaluate(async (correo) => {
    const r = await fetch("/api/staff/invite", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: correo, rol: "estetica" }) });
    return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
  }, `sin.nombre.${sufijo}@prueba.invalid`);
  const cuerpoSin = sinNombre.cuerpo;
  if (sinNombre.status !== 400 || !/nombre/i.test(String(cuerpoSin.error))) hallazgo(`el servidor aceptó invitar sin nombre (${sinNombre.status} ${JSON.stringify(cuerpoSin).slice(0, 80)})`);
  else bien("el servidor rechaza invitar sin nombre (400)");

  // ── 11. QA S14: N44 (la estilista ve el choque real) y el check-in de una cita de otro día ──
  console.log("\n11. N44: choque real para la estilista; check-in de otra fecha pide confirmar (celular)");
  {
    const S1e = datos.esteticaB;
    const { data: zona } = await SB.rpc("zona_negocio");
    const { data: tallaN } = await A.from("tamanos_categoria").select("id").eq("clave", "chico").single();
    const { data: peloN } = await A.from("tipos_pelaje").select("id").eq("clave", "medio").single();
    const { data: razaN } = await A.from("razas").select("id").eq("nombre", "Poodle").single();
    const nuevoPerro = async (n) => {
      const { data } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ ${n} ${sufijo}`, raza: "Poodle", raza_id: razaN.id, tamano_id: tallaN.id, pelaje_id: peloN.id }).select("id").single();
      creados.perros.push(data.id);
      return data.id;
    };
    const { data: servN } = await SB.from("servicios").select("id").eq("clave", "estetica_estetico").single();
    const ocupado = await nuevoPerro("ocupado");
    const intento = await nuevoPerro("intento");
    // Una cita ya puesta en la agenda de la estilista (la «ocupó» el admin), lejos en el futuro.
    const inicioUtc = new Date(Date.now() + (90 + Math.floor(Math.random() * 200)) * 86400000);
    inicioUtc.setUTCMinutes(0, 0, 0);
    inicioUtc.setUTCHours(20);
    const { data: resO } = await SB.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single();
    creados.reservas.push(resO.id);
    const { data: citaO, error: eO } = await SB.from("citas_estetica").insert({ reserva_id: resO.id, perro_id: ocupado, servicio_id: servN.id, empleado_id: S1e, inicio: inicioUtc.toISOString() }).select("id").single();
    if (eO) hallazgo(`N44: no se pudo poner la cita que ocupa el horario (${eO.message})`);
    else {
      creados.citas.push(citaO.id);
      const partes = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(inicioUtc).map((x) => [x.type, x.value]));
      const local = `${partes.year}-${partes.month}-${partes.day}T${partes.hour}:${partes.minute}`;
      const ctxE = await nav.newContext({ viewport: { width: 390, height: 844 } });
      await ctxE.addCookies(await cookiesDe(S1e));
      const est = await ctxE.newPage();
      await est.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
      await est.locator("input:visible").first().fill(`ZZ intento ${sufijo}`);
      await est.waitForTimeout(800);
      await est.getByText(`ZZ intento ${sufijo}`).first().click();
      await est.waitForTimeout(500);
      await est.getByLabel("Perro").selectOption({ label: `ZZ intento ${sufijo}` });
      const servOpc = await est.getByLabel("Servicio").locator("option").allInnerTexts();
      await est.getByLabel("Servicio").selectOption({ label: servOpc.find((o) => /completo/i.test(o)) ?? servOpc[1] });
      await est.getByLabel("Fecha y hora").fill(local);
      await est.getByRole("button", { name: "Agendar cita" }).click();
      // La ayuda fija del campo («Solo puedes agendar en tu propia agenda.») no cuenta: se espera la respuesta.
      await est.waitForFunction(() => /Ya tienes a|No pudimos|Solo puedes agendar en tu propia agenda:/.test(document.body.innerText), null, { timeout: 45000 }).catch(() => {});
      const texto = (await est.locator("body").innerText()).replace(/\s+/g, " ");
      const hhmm = `${partes.hour}:${partes.minute}`;
      if (!texto.includes(`Ya tienes a ZZ ocupado ${sufijo} a las ${hhmm}`)) hallazgo(`N44: la estilista no ve el choque real («${(texto.match(/(Ya tienes|No pudimos)[^.]*\./) ?? ["sin respuesta"])[0]}»)`);
      else bien(`N44: la estilista ve «Ya tienes a ZZ ocupado ${sufijo} a las ${hhmm}…»`);
      if (/No pudimos crear la reserva/.test(texto)) hallazgo("N44: sigue saliendo «No pudimos crear la reserva para esta cita»");
      const erroresPermiso = await est.locator('[role="alert"]').filter({ hasText: "Solo puedes agendar en tu propia agenda" }).count();
      if (erroresPermiso) hallazgo("N44: sale el aviso de permiso aunque el problema es el horario");
      else bien("N44: el aviso de permiso no sale (solo la ayuda del campo)");
      const { count: dobles } = await SB.from("citas_estetica").select("id", { count: "exact", head: true }).eq("perro_id", intento).is("deleted_at", null);
      if (dobles) hallazgo("N44: se creó la cita encimada");
      const { count: huerfanas } = await SB.from("reservas").select("id", { count: "exact", head: true }).eq("cliente_id", datos.clienteSoloB).gte("created_at", new Date(Date.now() - 120000).toISOString()).is("deleted_at", null);
      bien(`N44: ninguna cita encimada; cuentas nuevas en 2 min: ${huerfanas} (la de la prueba)`);
      // Libre: la estilista sí agenda en su propia agenda.
      const otraHora = new Date(inicioUtc.getTime() + 3 * 3600000);
      const p2 = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: zona, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(otraHora).map((x) => [x.type, x.value]));
      await est.getByLabel("Fecha y hora").fill(`${p2.year}-${p2.month}-${p2.day}T${p2.hour}:${p2.minute}`);
      await est.getByRole("button", { name: "Agendar cita" }).click();
      let nueva = null;
      for (let i = 0; i < 60 && !nueva; i++) {
        nueva = (await SB.from("citas_estetica").select("id, reserva_id").eq("perro_id", intento).is("deleted_at", null).maybeSingle()).data;
        if (!nueva) await est.waitForTimeout(500);
      }
      if (!nueva) hallazgo(`N44: la estilista no pudo agendar en un horario libre de su agenda («${(await est.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 200)}»)`);
      else {
        creados.citas.push(nueva.id); creados.reservas.push(nueva.reserva_id);
        bien("N44: en un horario libre, la estilista agenda en su propia agenda");
      }

      // Check-in de una cita de OTRO día: pide confirmar.
      await admin.goto(`${BASE}/estetica/${citaO.id}`, { waitUntil: "networkidle" });
      await admin.getByRole("button", { name: "Iniciar cita" }).click();
      const campoEntrega = admin.locator("#cita-entrega-nombre");
      if (await campoEntrega.count()) await campoEntrega.fill("Prueba");
      await admin.locator("[data-confirmar-inicio]").click();
      await admin.locator("[data-checkin-otro-dia]").waitFor({ timeout: 30000 }).catch(() => {});
      const avisoDia = (await admin.locator("[data-checkin-otro-dia]").innerText().catch(() => "")).replace(/\s+/g, " ");
      const { data: sigue } = await SB.from("citas_estetica").select("estado").eq("id", citaO.id).single();
      if (!avisoDia || sigue.estado !== "reservada") hallazgo(`check-in de otro día: no pidió confirmar (estado ${sigue.estado}, aviso «${avisoDia}»)`);
      else bien(`check-in de otro día: pide confirmar («${avisoDia.slice(0, 90)}») y no la recibe todavía`);
      if (!/Sí, recibirla de todos modos/.test(await admin.locator("[data-confirmar-inicio]").innerText())) hallazgo("check-in de otro día: el botón no dice «Sí, recibirla de todos modos»");
      await admin.locator("[data-confirmar-inicio]").click();
      let recibida = false;
      for (let i = 0; i < 50 && !recibida; i++) {
        recibida = (await SB.from("citas_estetica").select("estado").eq("id", citaO.id).single()).data.estado === "en_curso";
        if (!recibida) await admin.waitForTimeout(500);
      }
      if (!recibida) hallazgo("check-in de otro día: al confirmar no la recibió");
      else bien("check-in de otro día: con la confirmación sí la recibe");
      await sinDesborde(admin, "check-in de otro día");
      await ctxE.close();
    }
  }
} catch (e) {
  hallazgo(`la prueba tronó: ${e.message}`);
} finally {
  await nav.close();
  for (const id of creados.citas) await SB.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.ausenciasUi ?? []) await SB.from("ausencias").delete().eq("id", id);
  if (creados.empleadosUi?.length) await SB.from("empleados").update({ deleted_at: new Date().toISOString() }).in("id", creados.empleadosUi);
  for (const id of creados.reservas) await SB.from("reservas").delete().eq("id", id);
  if (creados.perros.length) await SB.from("perros").update({ deleted_at: new Date().toISOString() }).in("id", creados.perros);
  for (const c of creados.clientes) {
    const { data: perros } = await SB.from("perros").select("id").eq("cliente_id", c);
    for (const p of perros ?? []) { await SB.from("contratos").delete().eq("perro_id", p.id); }
    await SB.from("portal_invitaciones").delete().eq("cliente_id", c);
    await SB.from("invitaciones_cliente").delete().eq("cliente_id", c);
    await SB.from("membresias").delete().eq("cliente_id", c);
    await SB.from("perros").delete().eq("cliente_id", c);
    await SB.from("vinculacion_eventos").delete().eq("cliente_id", c);
    await SB.from("clientes").delete().eq("id", c);
  }
  await SB.from("invitaciones_cliente").delete().eq("telefono", TEL);
  for (const u of creados.cuentas) { await SB.from("vinculacion_eventos").delete().eq("profile_id", u); await A.auth.admin.deleteUser(u); }
}
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en pantalla.");
process.exit(hallazgos.length ? 1 : 0);
