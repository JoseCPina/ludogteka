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
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
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
  await admin.waitForTimeout(3500);
  const { data: citaUi } = await SB.from("citas_estetica").select("id, reserva_id, precio, precio_base, recargo, recargo_motivo, recargo_por").eq("perro_id", perroC.id).is("deleted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!citaUi) hallazgo(`la cita con recargo no se agendó: ${(await admin.locator("body").innerText()).slice(0, 200)}`);
  else {
    creados.citas.push(citaUi.id); creados.reservas.push(citaUi.reserva_id);
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
  if (!(await admin.getByRole("link", { name: "Mandar por WhatsApp" }).getAttribute("href"))?.startsWith("https://wa.me/52")) hallazgo("el botón de WhatsApp no apunta a wa.me");
  await sinDesborde(admin, "ficha con la invitación");
  const tokenInv = url.split("/activar/")[1];
  const ctxInv = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const inv1 = await ctxInv.newPage();
  await inv1.goto(`${BASE}/activar/${tokenInv}`, { waitUntil: "networkidle" });
  if (!(await inv1.locator("body").innerText()).includes(`Invitada ${sufijo}`)) hallazgo("el enlace no saluda al cliente por su nombre");
  await sinDesborde(inv1, "activar");
  // Contraseñas distintas / cortas.
  await inv1.getByLabel("Escoge tu contraseña").fill("Prueba-123456");
  await inv1.getByLabel("Repítela").fill("otra-cosa-123");
  await inv1.getByRole("button", { name: "Abrir mi cuenta" }).click();
  await inv1.waitForTimeout(500);
  if (!(await inv1.locator("body").innerText()).includes("no coinciden")) hallazgo("contraseñas distintas no se avisan");
  await inv1.getByLabel("Repítela").fill("Prueba-123456");
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
    await p.getByLabel("Escoge tu contraseña").fill("Prueba-123456");
    await p.getByLabel("Repítela").fill("Prueba-123456");
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
    await recep.locator("[data-estilista-aviso]").first().waitFor({ timeout: 8000 }).catch(() => {});
    const aviso = (await recep.locator("[data-estilista-aviso]").allInnerTexts()).join(" | ");
    if (!/Quedó con .* \(antes: .*\)/.test(aviso) || (await empleadoDe()).empleado_id !== S2) hallazgo(`el tablero no confirmó el cambio a la otra estilista o no se guardó («${aviso.slice(0, 120)}»)`);
    else bien(`un toque en el tablero: ${aviso.split("|")[0].trim()}`);
    await lista.selectOption("");
    await recep.waitForTimeout(1500);
    if ((await empleadoDe()).empleado_id !== null) hallazgo("«Sin asignar» desde el tablero no dejó la cita sin estilista");
    else bien("«Sin asignar» desde el tablero");
    await lista.selectOption(S1);
    await recep.waitForTimeout(1500);
  }

  // Detalle de la cita (recepción): selector, historial y confirmación
  await recep.goto(`${BASE}/estetica/${citaR.id}`, { waitUntil: "networkidle" });
  await sinDesborde(recep, "detalle de la cita con selector");
  const selDetalle = recep.getByLabel("Estilista", { exact: true });
  if (!(await selDetalle.count())) hallazgo("el detalle de la cita no trae la lista «Estilista»");
  else {
    await selDetalle.selectOption(S2);
    await recep.locator("[data-estilista-aviso]").first().waitFor({ timeout: 8000 }).catch(() => {});
    await recep.waitForFunction(() => /historial de estilista/i.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
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
  await recep.locator("[data-estilista-aviso]").first().waitFor({ timeout: 8000 }).catch(() => {});
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
  await admin.locator("[data-estilista-aviso]").first().waitFor({ timeout: 8000 }).catch(() => {});
  await admin.waitForFunction(() => /Fue otra estilista/.test(document.body.innerText), null, { timeout: 8000 }).catch(() => {});
  const txtAdmin = await admin.locator("body").innerText();
  if ((await empleadoDe()).empleado_id !== S2 || !/Fue otra estilista/.test(txtAdmin)) hallazgo("terminada: el admin no pudo corregir con motivo o no se ve en el historial");
  else bien("terminada: el admin corrige con motivo y queda en el historial de la cita");
  await sinDesborde(admin, "detalle de la cita terminada");
  await ctxRec.close();
} catch (e) {
  hallazgo(`la prueba tronó: ${e.message}`);
} finally {
  await nav.close();
  for (const id of creados.citas) await SB.from("citas_estetica").delete().eq("id", id);
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
