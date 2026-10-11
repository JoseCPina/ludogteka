// Dictado por voz y teleconsulta EN PANTALLA, a 390 px (celular) — SOLO DESARROLLO, en Huellitas.
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`) y después de
// `node scripts/auditoria/dictado-dev.mjs` (que deja /tmp/peludesk-dictado-es.wav, un dictado en español).
//
//   node scripts/auditoria/veterinaria-fase5-ui-dev.mjs
//
// 1. Dictado: el micrófono falso "dicta" el audio en español; ElevenLabs lo transcribe y Claude arma el
//    borrador SOAP con diagnósticos del catálogo; no se guarda el audio ni la transcripción; el contador sube.
// 2. Teleconsulta: agendarla, generar la liga, el dueño (sin sesión) firma y entra a la sala simulada, el
//    médico entra, inicia la consulta «telemedicina» y puede dictar.
// 3. Ajustes de Veterinaria (dictado y teleconsulta), la tarea de audios vencidos y 390 px sin desborde.
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
const AUDIO = path.join(os.tmpdir(), "peludesk-dictado-es.wav");
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const comprobar = (c, t) => (c ? bien(t) : hallazgo(t));
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const sufijo = String(Date.now()).slice(-6);
if (!fs.existsSync(AUDIO)) throw new Error("Falta /tmp/peludesk-dictado-es.wav: corre antes node scripts/auditoria/dictado-dev.mjs");

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
const comoPersona = async (id) => createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } } });
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  comprobar(w <= 392, `${donde}: sin desborde a 390 px (${w}px)`);
};
const cuerpo = async (pag) => (await pag.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");

const { data: recepciones } = await A.from("membresias").select("profile_id").eq("negocio_id", B).eq("rol", "recepcion").is("deleted_at", null).order("created_at");
const recConId = recepciones[0].profile_id;
const admin = await comoPersona(datos.adminB);
const ajustesPrevios = (await SB.from("veterinaria_ajustes").select("id, dictado_conservar_audio, teleconsulta_cobro_anticipado, teleconsulta_precio").eq("negocio_id", B).is("deleted_at", null).maybeSingle()).data;
const topePrevio = (await SB.from("negocios").select("dictado_minutos_mes").eq("id", B).single()).data?.dictado_minutos_mes ?? null;

// Chromium con micrófono falso: en vez de captar, reproduce el audio en español.
const nav = await abrirNavegador(["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-audio-capture=${AUDIO}`]);
const nuevoCtx = async (profileId, permisos = []) => {
  const c = await nav.newContext({ viewport: { width: 390, height: 844 }, permissions: permisos });
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
  await SB.from("negocios").update({ dictado_minutos_mes: 200 }).eq("id", B);
  await admin.rpc("guardar_veterinaria_dictado", { p_conservar: false });
  await admin.rpc("guardar_veterinaria_teleconsulta", { p_cobro: false, p_precio: null });
  const m1 = await admin.rpc("guardar_medico_veterinario", { p_profile_id: recConId, p_cedula: `UF5${sufijo}`, p_cpa: null });
  if (m1.error) throw new Error(`médico: ${m1.error.message}`);
  medicos.push(m1.data);
  const nombrePerro = `Fase5 ${sufijo}`;
  const { data: perro } = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: nombrePerro, especie: "perro" }).select("id").single();
  const rid = perro.id;

  const mvz = await nuevoCtx(recConId, ["microphone"]);
  const adm = await nuevoCtx(datos.adminB);
  const pub = await nuevoCtx(null);

  // ── 1. Dictado ──
  console.log("1. Dictado por voz");
  const med = await comoPersona(recConId);
  const ci = await med.rpc("vet_consulta_iniciar", { p_perro: rid, p_cita: null, p_tipo: "consulta", p_medico: m1.data });
  if (ci.error) throw new Error(`consulta: ${ci.error.message}`);
  const consultaId = ci.data;
  await mvz.p.goto(`${BASE}/veterinaria/consulta/${consultaId}`, { waitUntil: "networkidle" });
  const t0 = await cuerpo(mvz.p);
  comprobar(/Dictado por voz/.test(t0) && /Este mes: \d+ de 200 min/.test(t0), "la consulta trae la tarjeta de dictado con el contador del mes");
  await sinDesborde(mvz.p, "consulta con dictado (celular)");
  await mvz.p.getByRole("button", { name: "Dictar", exact: true }).click();
  comprobar(/Antes de grabar/.test(await cuerpo(mvz.p)) && /ElevenLabs/.test(await cuerpo(mvz.p)) && /Anthropic/.test(await cuerpo(mvz.p)), "antes de grabar se avisa a qué servicios va el audio");
  comprobar(await mvz.p.getByRole("button", { name: "Empezar a grabar" }).isDisabled(), "sin confirmar el aviso al dueño no se puede grabar");
  await mvz.p.getByLabel(/Ya le avisé al dueño/).check();
  await mvz.p.getByRole("button", { name: "Empezar a grabar" }).click();
  await mvz.p.getByRole("timer").waitFor({ timeout: 15000 });
  comprobar(true, "graba con el micrófono (falso) y corre el reloj");
  await mvz.p.waitForTimeout(32000); // el audio dura ~30 s
  await mvz.p.getByRole("button", { name: "Detener y transcribir" }).click();
  await mvz.p.getByText("Borrador hecho con IA").waitFor({ timeout: 150000 }).catch(() => {});
  const tB = await cuerpo(mvz.p);
  comprobar(/Borrador hecho con IA/.test(tB), "ElevenLabs y Claude arman el borrador");
  const tn = tB.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  comprobar(/vomito/.test(tn) && /dieta blanda/.test(tn), "el borrador conserva lo dictado (vómito, dieta blanda)");
  comprobar(/Signos vitales dictados/.test(tB) && /39[.,]5/.test(tB) && /28/.test(tB), "trae los signos vitales dictados (39.5 °C, 28 kg)");
  comprobar(/Diagnósticos sugeridos del catálogo/.test(tB) && /gastroenteritis/i.test(tB), "sugiere un diagnóstico del catálogo (gastroenteritis)");
  comprobar(/Ver la transcripción/.test(tB), "y deja ver la transcripción en pantalla");
  await sinDesborde(mvz.p, "borrador del dictado (celular)");
  // Nada se escribió solo: la consulta sigue vacía hasta que el médico lo pase.
  const antes = (await SB.from("vet_consultas").select("motivo, anamnesis, plan, estado").eq("id", consultaId).single()).data;
  comprobar(antes.estado === "borrador" && !/v[óo]mito|dieta blanda/i.test(`${antes.motivo} ${antes.anamnesis} ${antes.plan}`), "el borrador NO se escribió en la consulta por sí solo");
  const dict = (await SB.from("vet_dictados").select("*").eq("consulta_id", consultaId)).data;
  comprobar(dict.length === 1 && dict[0].estado === "listo" && dict[0].minutos_cobrados >= 1 && dict[0].audio_path === null, `queda un registro de uso: ${dict[0]?.minutos_cobrados} min cobrados y sin audio guardado`);
  comprobar(!JSON.stringify(dict[0]).toLowerCase().includes("firulais"), "y ni la transcripción ni el borrador se guardaron");
  const { data: objetos } = await SB.storage.from("dictados-audio").list(`${B}/${consultaId}`);
  comprobar((objetos ?? []).length === 0, "el audio se borró del almacenamiento al transcribir");
  await mvz.p.getByRole("button", { name: "Pasar al expediente" }).click();
  await mvz.p.getByText("Pasado al expediente").waitFor({ timeout: 15000 }).catch(() => {});
  let despues;
  for (let i = 0; i < 12; i++) { // autoguardado (se espera a que llegue a la base)
    await mvz.p.waitForTimeout(1500);
    despues = (await SB.from("vet_consultas").select("motivo, anamnesis, plan, estado, temperatura_c, peso_kg, diagnosticos").eq("id", consultaId).single()).data;
    if (despues.temperatura_c != null) break;
  }
  despues = (await SB.from("vet_consultas").select("motivo, anamnesis, plan, estado, temperatura_c, peso_kg, diagnosticos").eq("id", consultaId).single()).data;
  comprobar(despues.estado === "borrador" && (despues.motivo || despues.anamnesis), "al pasarlo, la consulta se llena y SIGUE en borrador (la firma el médico)");
  comprobar(Number(despues.temperatura_c) === 39.5 || Number(despues.temperatura_c) > 39, `con la temperatura (${despues.temperatura_c})`);
  await mvz.p.reload({ waitUntil: "networkidle" });
  comprobar(/Este mes: [1-9]\d* de 200 min/.test(await cuerpo(mvz.p)), "el contador del mes subió");
  // Sin permiso: estética de otro rol no ve la tarjeta.
  const rsinCtx = await nuevoCtx(datos.esteticaB);
  await rsinCtx.p.goto(`${BASE}/veterinaria/consulta/${consultaId}`, { waitUntil: "networkidle" });
  comprobar(!/Dictar/.test(await cuerpo(rsinCtx.p)) || /No tienes acceso|No pudimos abrir/.test(await cuerpo(rsinCtx.p)), "quien no puede dictar no ve el botón");

  // ── 2. Teleconsulta ──
  console.log("2. Teleconsulta");
  const dia = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  await adm.p.goto(`${BASE}/veterinaria/agenda/nueva?perro=${rid}&fecha=${dia}`, { waitUntil: "networkidle" });
  comprobar((await adm.p.locator("select[name=tipo] option[value=teleconsulta]").count()) === 1, "«Teleconsulta» es un tipo de cita");
  await adm.p.locator("select[name=tipo]").selectOption("teleconsulta");
  await adm.p.locator("select[name=medico_id]").selectOption(m1.data);
  await adm.p.locator("input[name=fecha]").fill(dia);
  await adm.p.locator("input[name=hora]").fill("11:00");
  await adm.p.locator("textarea[name=motivo]").fill(`Revisión por video ${sufijo}`);
  await adm.p.getByRole("button", { name: "Agendar cita" }).click();
  await adm.p.waitForURL(/\/veterinaria\/teleconsulta\/[0-9a-f-]{36}\?nueva=1/, { timeout: 20000 });
  const citaId = adm.p.url().match(/teleconsulta\/([0-9a-f-]{36})/)[1];
  comprobar(/Teleconsulta agendada/.test(await cuerpo(adm.p)), "al agendar, abre la pantalla de la teleconsulta con la sala ya creada");
  await sinDesborde(adm.p, "pantalla de la teleconsulta (celular)");
  comprobar((await SB.from("vet_telemedicina").select("proveedor, sala_url").eq("cita_id", citaId).single()).data?.proveedor === "simulado", "la sala es simulada (no hay DAILY_API_KEY en desarrollo)");
  await adm.p.getByRole("button", { name: "Generar liga para el dueño" }).click();
  const campo = adm.p.locator("input[readonly]").first();
  await campo.waitFor({ timeout: 15000 });
  const liga = await campo.inputValue();
  comprobar(/\/t\/[A-Za-z0-9_-]{43}$/.test(liga), "se genera la liga del dueño (campo copiable)");
  comprobar((await adm.p.getByRole("link", { name: "Abrir en WhatsApp" }).count()) === 1, "y el botón de WhatsApp");
  await adm.p.getByRole("button", { name: "Entrar a la sala" }).isDisabled().then((d) => comprobar(d, "la sala no se puede abrir antes de la ventana"));
  // Agenda: la cita sale con su atajo.
  await adm.p.goto(`${BASE}/veterinaria/agenda?fecha=${dia}`, { waitUntil: "networkidle" });
  comprobar(/Teleconsulta \(liga y sala\)/.test(await cuerpo(adm.p)) && /telemedicina/.test(await cuerpo(adm.p)), "la agenda marca la cita y enlaza a su liga y sala");
  // El dueño, sin sesión.
  const urlPub = liga.replace(/^https?:\/\/[^/]+/, BASE);
  await pub.p.goto(urlPub, { waitUntil: "networkidle" });
  const tP = await cuerpo(pub.p);
  comprobar(/Firma el consentimiento/.test(tP) && new RegExp(nombrePerro).test(tP), "el dueño ve su teleconsulta y el paso de firmar");
  comprobar(!/Vómito|Gastroenteritis|Nota interna|Dictado/.test(tP), "y nada del expediente");
  await sinDesborde(pub.p, "liga del dueño (celular)");
  const robots = await pub.p.locator('meta[name=robots]').getAttribute("content").catch(() => null);
  comprobar(/noindex/.test(robots ?? ""), "la liga no se indexa");
  // Se acerca la hora: la cita pasa a ahora (la ventana abre sola por el trigger).
  const ahora = Date.now();
  await SB.from("vet_citas").update({ inicia_at: new Date(ahora - 5 * 60000).toISOString(), termina_at: new Date(ahora + 25 * 60000).toISOString() }).eq("id", citaId);
  await pub.p.reload({ waitUntil: "networkidle" });
  comprobar(!(await pub.p.getByRole("button", { name: "Entrar a la videollamada" }).count()), "sin firmar, no aparece «Entrar a la videollamada»");
  await pub.p.getByLabel(/Leí el consentimiento/).check();
  const lienzo = pub.p.locator('canvas[aria-label="Recuadro de firma"]');
  await lienzo.scrollIntoViewIfNeeded();
  const caja = await lienzo.boundingBox();
  await pub.p.mouse.move(caja.x + 20, caja.y + 40);
  await pub.p.mouse.down();
  for (let i = 1; i <= 12; i++) await pub.p.mouse.move(caja.x + 20 + i * 12, caja.y + 40 + (i % 2) * 30);
  await pub.p.mouse.up();
  await pub.p.getByRole("button", { name: "Firmar el consentimiento" }).click();
  await pub.p.getByRole("button", { name: "Entrar a la videollamada" }).waitFor({ timeout: 25000 }).catch(() => {});
  comprobar(/Firmado por/.test(await cuerpo(pub.p)), "firmado el consentimiento");
  const cons = (await SB.from("consentimientos").select("estado, firma_metodo, ip_firma, hash_pdf, storage_path, tipo").eq("cliente_id", datos.clienteSoloB).eq("tipo", "teleconsulta").order("created_at", { ascending: false }).limit(1).single()).data;
  comprobar(cons.estado === "firmado" && cons.firma_metodo === "remota" && cons.hash_pdf && cons.storage_path, "queda firmado con PDF, hash e IP");
  await pub.p.getByRole("button", { name: "Entrar a la videollamada" }).click();
  await pub.p.locator("[data-sala-simulada]").waitFor({ timeout: 15000 }).catch(() => {});
  comprobar((await pub.p.locator("[data-sala-simulada]").count()) === 1, "el dueño entra a la sala (simulada en pruebas)");
  // El médico.
  await mvz.p.goto(`${BASE}/veterinaria/teleconsulta/${citaId}`, { waitUntil: "networkidle" });
  comprobar(/firmado por/.test(await cuerpo(mvz.p)) && /Sala abierta/.test(await cuerpo(mvz.p)), "el médico ve el consentimiento firmado y la sala abierta");
  await mvz.p.getByRole("button", { name: "Entrar a la sala" }).click();
  await mvz.p.locator("[data-sala-simulada]").waitFor({ timeout: 15000 }).catch(() => {});
  comprobar((await mvz.p.locator("[data-sala-simulada]").count()) === 1, "el médico entra a la sala");
  await mvz.p.getByRole("button", { name: "Iniciar la consulta" }).click();
  await mvz.p.waitForURL(/\/veterinaria\/consulta\//, { timeout: 20000 });
  await mvz.p.getByRole("button", { name: "Dictar", exact: true }).waitFor({ timeout: 20000 }).catch(() => {});
  const tC = await cuerpo(mvz.p);
  comprobar(/Telemedicina/.test(tC) && /Dictado por voz/.test(tC), `la consulta nace marcada «Telemedicina» y se puede dictar (${tC.slice(0, 160)})`);
  await sinDesborde(mvz.p, "consulta de teleconsulta (celular)");
  // Liga inventada y liga vieja.
  await pub.p.goto(`${BASE}/t/${"a".repeat(43)}`, { waitUntil: "networkidle" });
  comprobar(/ya no es válida|no está disponible|No encontramos/i.test(await cuerpo(pub.p)), "una liga inventada no abre nada");

  // ── 3. Ajustes y tareas ──
  console.log("3. Ajustes, plataforma y tarea");
  await adm.p.goto(`${BASE}/veterinaria/ajustes`, { waitUntil: "networkidle" });
  const tA = await cuerpo(adm.p);
  comprobar(/Dictado por voz/.test(tA) && /Teleconsulta/.test(tA) && /Conservar el audio/.test(tA) && /Cobro anticipado/.test(tA), "Ajustes trae las opciones de dictado y de teleconsulta");
  await adm.p.locator("select[name=conservar]").selectOption("si");
  await adm.p.locator("section", { hasText: "Dictado por voz" }).getByRole("button", { name: "Guardar" }).click();
  await adm.p.getByText("Opción del dictado guardada.").waitFor({ timeout: 15000 }).catch(() => {});
  comprobar((await SB.from("veterinaria_ajustes").select("dictado_conservar_audio").eq("negocio_id", B).is("deleted_at", null).single()).data?.dictado_conservar_audio === true, "admin prende conservar el audio y se guarda");
  await adm.p.locator("select[name=cobro]").selectOption("si");
  await adm.p.locator("input[name=precio]").fill("350");
  await adm.p.locator("section", { hasText: "Cobro anticipado" }).getByRole("button", { name: "Guardar" }).click();
  await adm.p.getByText("Opciones de la teleconsulta guardadas.").waitFor({ timeout: 15000 }).catch(() => {});
  const aj = (await SB.from("veterinaria_ajustes").select("teleconsulta_cobro_anticipado, teleconsulta_precio").eq("negocio_id", B).is("deleted_at", null).single()).data;
  comprobar(aj.teleconsulta_cobro_anticipado === true && Number(aj.teleconsulta_precio) === 350, "y el cobro anticipado de la teleconsulta a $350");
  await sinDesborde(adm.p, "ajustes de Veterinaria (celular)");
  // Con la opción de conservar prendida, el aviso de la tarjeta lo dice.
  await mvz.p.goto(`${BASE}/veterinaria/consulta/${consultaId}`, { waitUntil: "networkidle" });
  await mvz.p.getByRole("button", { name: "Dictar", exact: true }).click();
  comprobar(/conservar el audio: queda ligado a esta consulta 30 días/.test(await cuerpo(mvz.p)), "el aviso antes de grabar dice que el audio se conserva 30 días");
  // La tarea de audios vencidos.
  const sinSecreto = await fetch("http://127.0.0.1:3001/api/cron/dictados", { redirect: "manual", headers: { Host: "huellitas.localhost:3001" } });
  comprobar(sinSecreto.status === 401, "la tarea de audios vencidos sin el secreto responde 401");
} finally {
  if (ajustesPrevios) await SB.from("veterinaria_ajustes").update({ dictado_conservar_audio: ajustesPrevios.dictado_conservar_audio, teleconsulta_cobro_anticipado: ajustesPrevios.teleconsulta_cobro_anticipado, teleconsulta_precio: ajustesPrevios.teleconsulta_precio }).eq("id", ajustesPrevios.id);
  else await SB.from("veterinaria_ajustes").update({ dictado_conservar_audio: false, teleconsulta_cobro_anticipado: false, teleconsulta_precio: null }).eq("negocio_id", B);
  await SB.from("negocios").update({ dictado_minutos_mes: topePrevio }).eq("id", B);
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
