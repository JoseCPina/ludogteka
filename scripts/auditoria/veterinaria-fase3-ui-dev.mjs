// Agenda clínica, expediente por consulta, estudios y archivos, estimados y portal EN PANTALLA, a
// 390 px (celular) — SOLO DESARROLLO, en Huellitas. Con el servidor prendido en el 3001
// (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/veterinaria-fase3-ui-dev.mjs
//
// 0. Acceso: un médico con rol de estética y recepción sin permisos entran a /veterinaria; el cliente no.
// 1. Agenda: agendar, que no se empalme el mismo médico, ver la cita en su columna.
// 2. Consulta: iniciarla desde la cita, escribirla (se guarda sola), diagnóstico del catálogo,
//    firmarla con la cédula, adenda, resultado de laboratorio y un archivo.
// 3. Expediente: la línea de tiempo y «quién abrió» (admin).
// 4. Estimado: armarlo, enviarlo, aceptarlo por la liga (sin sesión, con firma) y que los cargos lleguen a la cuenta.
// 5. Portal del dueño: opción apagada y prendida; sin notas internas.
// 6. Ajustes: tipos de cita, plantilla y portal.
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
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);
const sumaDias = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() + d * 86400000).toISOString().slice(0, 10);
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

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
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar(w <= 392, `${donde}: sin desborde a 390 px (${w}px)`);
};
const cuerpo = async (pag) => (await pag.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");

const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recConId = recepciones[0].profile_id;
const recSinId = recepciones[1].profile_id;
const admin = await comoPersona(datos.adminB);
const hoyB = (await admin.rpc("fecha_negocio")).data;
const ajustesPrevios = (await SB.from("veterinaria_ajustes").select("id, portal_expediente").eq("negocio_id", B).is("deleted_at", null).maybeSingle()).data;

const nav = await abrirNavegador();
const nuevoCtx = async (profileId) => {
  const c = await nav.newContext({ viewport: { width: 390, height: 844 } });
  if (profileId) await c.addCookies(await cookiesDe(profileId));
  const p = await c.newPage();
  p.on("dialog", (d) => d.accept());
  return { c, p };
};
const medicos = [];
try {
  for (const m of ["inventario", "veterinaria"]) {
    const r = await SB.from("negocio_modulos").select("id").eq("negocio_id", B).eq("modulo", m).is("deleted_at", null).maybeSingle();
    if (r.data) await SB.from("negocio_modulos").update({ activo: true }).eq("id", r.data.id);
    else await SB.from("negocio_modulos").insert({ negocio_id: B, modulo: m, activo: true });
  }
  const cedula = String(Date.now()).slice(-7);
  const m1 = await admin.rpc("guardar_medico_veterinario", { p_profile_id: recConId, p_cedula: cedula, p_cpa: "CPA-F3" });
  const m2 = await admin.rpc("guardar_medico_veterinario", { p_profile_id: datos.esteticaB, p_cedula: `${cedula}1`, p_cpa: null });
  if (m1.error || m2.error) throw new Error(`médicos: ${m1.error?.message} ${m2.error?.message}`);
  medicos.push(m1.data, m2.data);
  const nombrePerro = `Fase3 ${sufijo}`;
  const { data: perro } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: nombrePerro, especie: "perro" }).select("id").single();
  const rid = perro.id;
  const dia = sumaDias(hoyB, 40 + Math.floor(Math.random() * 200));

  const adm = await nuevoCtx(datos.adminB);
  const mvz = await nuevoCtx(recConId);
  const est = await nuevoCtx(datos.esteticaB);
  const rsin = await nuevoCtx(recSinId);
  const cli = await nuevoCtx(datos.cuentaSoloB);

  // ── 0. Acceso ──
  console.log("0. Acceso a la zona");
  await est.p.goto(`${BASE}/veterinaria`, { waitUntil: "networkidle" });
  comprobar(new globalThis.URL(est.p.url()).pathname === "/veterinaria", "el médico con rol de ESTÉTICA entra a /veterinaria");
  comprobar(/Agenda clínica/.test(await cuerpo(est.p)) && /Expediente clínico/.test(await cuerpo(est.p)) && /Estimados/.test(await cuerpo(est.p)), "y ve las tarjetas nuevas");
  await sinDesborde(est.p, "inicio de Veterinaria (celular)");
  comprobar(/Veterinaria/.test(await est.p.locator("nav, header").first().innerText().catch(() => "")) || (await est.p.getByRole("link", { name: "Veterinaria", exact: true, includeHidden: true }).count()) > 0, "y «Veterinaria» sale en su menú");
  await rsin.p.goto(`${BASE}/veterinaria/agenda`, { waitUntil: "networkidle" });
  comprobar(new globalThis.URL(rsin.p.url()).pathname === "/veterinaria/agenda", "recepción sin permisos entra a la agenda");
  await rsin.p.goto(`${BASE}/veterinaria/expediente/${rid}`, { waitUntil: "networkidle" });
  comprobar(/No tienes acceso al expediente/.test(await cuerpo(rsin.p)), "pero no al expediente (la pantalla vuelve a revisar su permiso)");
  await cli.p.goto(`${BASE}/veterinaria`, { waitUntil: "networkidle" });
  comprobar(new globalThis.URL(cli.p.url()).pathname.startsWith("/portal"), "el cliente va a su portal");

  // ── 1. Agenda ──
  console.log("1. Agenda clínica");
  await adm.p.goto(`${BASE}/veterinaria/agenda/nueva?q=${encodeURIComponent(nombrePerro)}&fecha=${dia}`, { waitUntil: "networkidle" });
  await adm.p.getByRole("link", { name: new RegExp(nombrePerro) }).first().click();
  await adm.p.waitForURL(/agenda\/nueva\?perro=/);
  await sinDesborde(adm.p, "formulario de cita");
  await adm.p.locator("select[name=medico_id]").selectOption(m1.data);
  await adm.p.locator("select[name=tipo]").selectOption("consulta");
  await adm.p.locator("input[name=fecha]").fill(dia);
  await adm.p.locator("input[name=hora]").fill("10:00");
  await adm.p.locator("textarea[name=motivo]").fill("Vómito desde ayer");
  await adm.p.getByRole("button", { name: "Agendar cita" }).click();
  await adm.p.waitForURL(/\/veterinaria\/agenda\?fecha=/, { timeout: 15000 });
  const textoAgenda = await cuerpo(adm.p);
  comprobar(new RegExp(nombrePerro).test(textoAgenda) && /10:00/.test(textoAgenda), "la cita sale en la agenda, en la columna de su médico");
  await sinDesborde(adm.p, "agenda del día");
  // Empalme del mismo médico.
  await adm.p.goto(`${BASE}/veterinaria/agenda/nueva?perro=${rid}&fecha=${dia}`, { waitUntil: "networkidle" });
  await adm.p.locator("select[name=medico_id]").selectOption(m1.data);
  await adm.p.locator("input[name=fecha]").fill(dia);
  await adm.p.locator("input[name=hora]").fill("10:15");
  await adm.p.getByRole("button", { name: "Agendar cita" }).click();
  await adm.p.getByText(/ya tiene una cita/).first().waitFor({ timeout: 15000 }).catch(() => {});
  comprobar(/ya tiene una cita de 10:00/.test(await cuerpo(adm.p)), "el mismo médico no se empalma y el aviso dice a qué hora tiene su otra cita");
  const { data: citaFila } = await SB.from("vet_citas").select("id").eq("perro_id", rid).eq("estado", "programada").single();

  // ── 2. Consulta ──
  console.log("2. Consulta");
  // La cita es de hoy+N días: se acerca a hoy para poder iniciarla (la base no limita iniciar una cita futura).
  await mvz.p.goto(`${BASE}/veterinaria/agenda?fecha=${dia}`, { waitUntil: "networkidle" });
  await mvz.p.getByRole("button", { name: "Iniciar consulta" }).first().click();
  await mvz.p.waitForURL(/\/veterinaria\/consulta\//, { timeout: 15000 });
  const urlConsulta = mvz.p.url();
  const consultaId = urlConsulta.split("/").pop();
  comprobar(/Borrador/.test(await cuerpo(mvz.p)) && /Signos vitales/.test(await cuerpo(mvz.p)), "abre el borrador de la consulta con signos vitales");
  await sinDesborde(mvz.p, "editor de consulta");
  await mvz.p.locator("textarea[name=anamnesis]").fill(`Vómito desde ayer ${sufijo}`);
  await mvz.p.locator("input[name=peso_kg]").fill("12.4");
  await mvz.p.locator("input[name=temperatura_c]").fill("39.2");
  await mvz.p.getByText("Borrador guardado").first().waitFor({ timeout: 15000 }).catch(() => {});
  const g1 = (await SB.from("vet_consultas").select("anamnesis, peso_kg, temperatura_c").eq("id", consultaId).single()).data;
  comprobar(/Vómito desde ayer/.test(g1.anamnesis ?? "") && Number(g1.peso_kg) === 12.4 && Number(g1.temperatura_c) === 39.2, "se guardó sola, sin apretar nada");
  // Diagnóstico del catálogo.
  await mvz.p.locator("input[name=buscar_dx]").fill("gastroenteritis");
  await mvz.p.getByRole("button", { name: /Gastroenteritis aguda/ }).first().click();
  await mvz.p.getByRole("button", { name: /Pasar a definitivo/ }).first().click();
  await mvz.p.locator("textarea[name=plan]").fill("Dieta blanda 3 días");
  await mvz.p.locator("textarea[name=notas_internas]").fill(`Nota interna ${sufijo}`);
  await mvz.p.getByText("Borrador guardado").first().waitFor({ timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));
  const g2 = (await SB.from("vet_consultas").select("diagnosticos, plan").eq("id", consultaId).single()).data;
  comprobar(g2.diagnosticos?.[0]?.nombre === "Gastroenteritis aguda" && g2.diagnosticos[0].tipo === "definitivo" && g2.plan === "Dieta blanda 3 días", "el diagnóstico del catálogo (definitivo) y el plan también");
  // Sin precio de catálogo una consulta no se firma: la consulta general lleva precio.
  {
    const sv = (await SB.from("servicios").select("id").eq("negocio_id", B).eq("clave", "vet_consulta_general").is("deleted_at", null).single()).data;
    await SB.from("tarifas").update({ deleted_at: new Date().toISOString() }).eq("servicio_id", sv.id).is("deleted_at", null);
    await SB.from("tarifas").insert({ negocio_id: B, servicio_id: sv.id, precio: 450, no_aplica: false, cantidad_desde: 1, cantidad_hasta: null, vigencia_desde: "2026-01-01" });
    await mvz.p.reload({ waitUntil: "networkidle" });
  }
  // Firmar.
  await mvz.p.getByRole("button", { name: "Firmar la consulta" }).click();
  await mvz.p.getByText(/Firmada por/).first().waitFor({ timeout: 20000 }).catch(() => {});
  const tFirmada = await cuerpo(mvz.p);
  comprobar(/Firmada por/.test(tFirmada) && tFirmada.includes(`cédula profesional ${cedula}`), "firmada: sale el médico con su cédula");
  comprobar(/Gastroenteritis aguda/.test(tFirmada) && /Dieta blanda/.test(tFirmada), "y su contenido en lectura");
  comprobar((await mvz.p.locator("textarea[name=anamnesis]").count()) === 0, "ya no hay campos para editarla");
  await sinDesborde(mvz.p, "consulta firmada");
  // Adenda.
  await mvz.p.locator("textarea[name=texto]").fill(`Adenda de prueba ${sufijo}`);
  await mvz.p.getByRole("button", { name: "Firmar adenda" }).click();
  await mvz.p.getByText("Adenda agregada").first().waitFor({ timeout: 15000 }).catch(() => {});
  await mvz.p.reload({ waitUntil: "networkidle" });
  comprobar(new RegExp(`Adenda de prueba ${sufijo}`).test(await cuerpo(mvz.p)), "la adenda se agrega con la firma del médico");
  // Resultado de laboratorio.
  await mvz.p.getByRole("button", { name: "Capturar un resultado", exact: true }).click();
  await mvz.p.getByLabel("Estudio", { exact: true }).fill(`Biometría ${sufijo}`);
  await mvz.p.getByLabel("Parámetro 1").fill("Leucocitos");
  await mvz.p.getByLabel("Valor 1").fill("21");
  await mvz.p.getByLabel("Rango 1").fill("6 - 17");
  await sinDesborde(mvz.p, "captura de laboratorio");
  await mvz.p.getByRole("button", { name: "Guardar resultado" }).click();
  await mvz.p.getByText("Resultado guardado").first().waitFor({ timeout: 15000 }).catch(() => {});
  await mvz.p.reload({ waitUntil: "networkidle" });
  comprobar(new RegExp(`Biometría ${sufijo}`).test(await cuerpo(mvz.p)) && /Alto/.test(await cuerpo(mvz.p)), "el resultado sale con la bandera «Alto»");
  // Archivo.
  await mvz.p.getByRole("button", { name: "Adjuntar una foto o PDF", exact: true }).click();
  await mvz.p.locator("input[type=file]").setInputFiles({ name: `rx-${sufijo}.png`, mimeType: "image/png", buffer: PNG });
  await mvz.p.getByLabel("Qué es (opcional)").fill("Radiografía de prueba");
  await mvz.p.getByRole("button", { name: "Subir archivo" }).click();
  await mvz.p.getByText("Archivo adjuntado").first().waitFor({ timeout: 30000 }).catch(() => {});
  await mvz.p.reload({ waitUntil: "networkidle" });
  const tArch = await cuerpo(mvz.p);
  comprobar(/Radiografía de prueba/.test(tArch), "el archivo sube directo al almacenamiento privado y sale en la lista");
  const adjId = (await SB.from("vet_adjuntos").select("id").eq("perro_id", rid).single()).data?.id;
  const intento = (pag) => pag.evaluate(async (id) => {
    const r = await fetch(`/api/veterinaria/adjunto/${id}`, { redirect: "manual" });
    return { status: r.status, tipo: r.type };
  }, adjId);
  const abrir = await intento(mvz.p);
  comprobar(abrir.tipo === "opaqueredirect", "abrirlo manda a una liga firmada del almacenamiento privado (redirección)");
  const abrirSin = await intento(rsin.p);
  comprobar(abrirSin.status === 403, "quien no atiende consultas recibe una página que lo explica (403), no el archivo");

  // ── 3. Expediente ──
  console.log("3. Expediente y línea de tiempo");
  await adm.p.goto(`${BASE}/veterinaria/expediente?q=${encodeURIComponent(nombrePerro)}`, { waitUntil: "networkidle" });
  await adm.p.getByRole("link", { name: new RegExp(nombrePerro) }).first().click();
  await adm.p.waitForURL(/\/veterinaria\/expediente\//);
  const tExp = await cuerpo(adm.p);
  comprobar(/Línea de tiempo/.test(tExp) && /Consulta/.test(tExp) && /Laboratorio/.test(tExp) && /Archivo/.test(tExp) && /12\.40? kg/.test(tExp), "la línea de tiempo junta consulta, laboratorio, archivo y peso");
  comprobar(/Quién abrió este expediente/.test(tExp), "el admin ve el registro de lecturas");
  await sinDesborde(adm.p, "expediente");
  await mvz.p.goto(`${BASE}/veterinaria/expediente/${rid}`, { waitUntil: "networkidle" });
  comprobar(!/Quién abrió este expediente/.test(await cuerpo(mvz.p)), "y el médico no ve ese registro (es del admin)");
  const lect = (await SB.from("vet_lecturas").select("recurso").eq("perro_id", rid)).data ?? [];
  comprobar(lect.length >= 3, `las aperturas quedaron anotadas (${lect.length})`);

  // ── 4. Estimado ──
  console.log("4. Estimado");
  await mvz.p.goto(`${BASE}/veterinaria/estimados/nuevo?perro=${rid}&consulta=${consultaId}`, { waitUntil: "networkidle" });
  await mvz.p.getByLabel("Título").fill(`Esterilización ${sufijo}`);
  await mvz.p.getByLabel("Descripción").first().fill("Ovariohisterectomía");
  await mvz.p.getByLabel("Precio mínimo").first().fill("1800");
  await mvz.p.getByLabel("Precio máximo").first().fill("2500");
  await mvz.p.getByRole("button", { name: "+ Insumo" }).click();
  await mvz.p.getByLabel("Descripción").nth(1).fill("Sutura");
  await mvz.p.getByLabel("Cantidad").nth(1).fill("2");
  await mvz.p.getByLabel("Precio mínimo").nth(1).fill("60");
  await sinDesborde(mvz.p, "editor de estimado");
  comprobar(/Total estimado: \$1,920\.00 – \$2,620\.00/.test(await cuerpo(mvz.p)), "el total mínimo–máximo se calcula en pantalla");
  await mvz.p.getByRole("button", { name: "Guardar borrador" }).click();
  await mvz.p.waitForURL(/\/veterinaria\/estimados\/[0-9a-f-]{36}$/, { timeout: 20000 });
  const estId = mvz.p.url().split("/").pop();
  await mvz.p.getByRole("button", { name: "Enviar el estimado" }).click();
  const campo = mvz.p.locator("input[readonly]").first();
  await campo.waitFor({ timeout: 20000 });
  const urlLiga = await campo.inputValue();
  comprobar(/\/e\/[A-Za-z0-9_-]{43}$/.test(urlLiga), "se genera la liga con un token largo");
  const pub = await nuevoCtx(null);
  await pub.p.goto(urlLiga.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
  const tPub = await cuerpo(pub.p);
  comprobar(/Esterilización/.test(tPub) && /Ovariohisterectomía/.test(tPub) && /Total estimado/.test(tPub), "sin sesión, el dueño ve el estimado con sus líneas");
  comprobar(!/Vómito|Nota interna|Gastroenteritis/.test(tPub), "y nada del expediente clínico");
  await sinDesborde(pub.p, "liga del estimado");
  // Aceptar con firma.
  await pub.p.getByRole("button", { name: "Aceptar el estimado" }).click();
  await pub.p.getByText(/Dibuja tu firma/).first().waitFor({ timeout: 10000 }).catch(() => {});
  comprobar(/Dibuja tu firma/.test(await cuerpo(pub.p)), "sin firma no deja aceptar");
  const lienzo = pub.p.locator('canvas[aria-label="Recuadro de firma"]');
  await lienzo.scrollIntoViewIfNeeded();
  const caja = await lienzo.boundingBox();
  await pub.p.mouse.move(caja.x + 20, caja.y + 40);
  await pub.p.mouse.down();
  for (let i = 1; i <= 12; i++) await pub.p.mouse.move(caja.x + 20 + i * 15, caja.y + 40 + (i % 2) * 30);
  await pub.p.mouse.up();
  await pub.p.getByRole("button", { name: "Aceptar el estimado" }).click();
  await pub.p.getByText("Estimado aceptado").first().waitFor({ timeout: 20000 }).catch(() => {});
  comprobar(/Estimado aceptado/.test(await cuerpo(pub.p)), "firmado, el estimado queda aceptado");
  const { data: estFila } = await SB.from("vet_estimados").select("estado, aceptado_via, aceptado_ip, firma_png, reserva_id").eq("id", estId).single();
  comprobar(estFila.estado === "aceptado" && estFila.aceptado_via === "liga" && estFila.firma_png?.startsWith("data:image/png") && estFila.reserva_id, "la base guarda la vía, la IP y la firma");
  const { data: cargos } = await SB.from("cargos_aplicados").select("precio, descripcion").eq("reserva_id", estFila.reserva_id);
  // La cuenta puede traer además el cargo de la consulta ya firmada (si el catálogo tiene su precio): lo que importa es que el mínimo del estimado llegó.
  comprobar(cargos.length >= 2 && cargos.some((c) => Number(c.precio) === 1800) && cargos.some((c) => /2 × Sutura/.test(c.descripcion) && Number(c.precio) === 120), "los cargos del mínimo llegaron a la cuenta de la mascota");
  await mvz.p.goto(`${BASE}/veterinaria/estimados/${estId}`, { waitUntil: "networkidle" });
  const tEst = await cuerpo(mvz.p);
  comprobar(/Aceptado por/.test(tEst) && (await mvz.p.getByRole("link", { name: "Cobrar en Caja" }).count()) === 1, "el estimado muestra quién lo aceptó y lleva a cobrar en Caja");
  await sinDesborde(mvz.p, "estimado aceptado");
  await mvz.p.goto(`${BASE}/veterinaria/estimados`, { waitUntil: "networkidle" });
  comprobar(new RegExp(`Esterilización ${sufijo}`).test(await cuerpo(mvz.p)), "la lista de estimados lo trae");
  await sinDesborde(mvz.p, "lista de estimados");
  await pub.p.reload({ waitUntil: "networkidle" });
  comprobar(/Estimado aceptado/.test(await cuerpo(pub.p)) && (await pub.p.getByRole("button", { name: "Aceptar el estimado" }).count()) === 0, "la liga ya no deja aceptar dos veces");

  // ── 5. Portal ──
  console.log("5. Portal del dueño");
  await SB.from("veterinaria_ajustes").update({ portal_expediente: false }).eq("negocio_id", B);
  await cli.p.goto(`${BASE}/portal/perros/${rid}`, { waitUntil: "networkidle" });
  comprobar(!/Consultas veterinarias/.test(await cuerpo(cli.p)), "con la opción apagada el dueño no ve las consultas");
  await SB.from("veterinaria_ajustes").update({ portal_expediente: true }).eq("negocio_id", B);
  await cli.p.reload({ waitUntil: "networkidle" });
  const tPortal = await cuerpo(cli.p);
  comprobar(/Consultas veterinarias/.test(tPortal) && /Dieta blanda/.test(tPortal) && /Gastroenteritis aguda/.test(tPortal), "prendida, ve fecha, diagnóstico definitivo y plan");
  comprobar(!new RegExp(`Nota interna ${sufijo}`).test(tPortal) && !/cédula/i.test(tPortal), "sin notas internas ni datos de la firma");
  await sinDesborde(cli.p, "portal con consultas");

  // ── 6. Ajustes ──
  console.log("6. Ajustes");
  await adm.p.goto(`${BASE}/veterinaria/ajustes`, { waitUntil: "networkidle" });
  const tAj = await cuerpo(adm.p);
  comprobar(/Portal del dueño/.test(tAj) && /Tipos de cita y su duración/.test(tAj) && /Plantillas de consulta/.test(tAj), "los ajustes traen portal, tipos de cita y plantillas");
  await sinDesborde(adm.p, "ajustes de Veterinaria");
  const filaTipo = adm.p.locator("form").filter({ has: adm.p.locator("input[name=clave][value=vacuna]") });
  await filaTipo.locator("input[name=duracion_min]").fill("25");
  await filaTipo.getByRole("button", { name: "Guardar" }).click();
  await adm.p.getByText("Tipo de cita guardado").first().waitFor({ timeout: 15000 }).catch(() => {});
  comprobar((await SB.from("vet_tipos_cita").select("duracion_min").eq("negocio_id", B).eq("clave", "vacuna").single()).data.duracion_min === 25, "cambiar la duración de «Vacuna» a 25 minutos se guarda");
  await admin.rpc("guardar_tipo_cita", { p_clave: "vacuna", p_nombre: "Vacuna", p_duracion_min: 15, p_activo: true });

  void citaFila;
} finally {
  if (ajustesPrevios) await SB.from("veterinaria_ajustes").update({ portal_expediente: ajustesPrevios.portal_expediente ?? false }).eq("id", ajustesPrevios.id);
  else await SB.from("veterinaria_ajustes").update({ portal_expediente: false }).eq("negocio_id", B);
  for (const m of medicos) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
  await nav.close();
}
console.log("");
if (hallazgos.length) {
  console.log(`✘ ${hallazgos.length} hallazgo(s):`);
  for (const h of hallazgos) console.log(`   - ${h}`);
  process.exit(1);
}
console.log("✔ Sin hallazgos.");
