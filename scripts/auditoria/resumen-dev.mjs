// Prueba de punta a punta del resumen diario, contra dobles locales de Meta
// (Graph), TikTok y Telegram en el puerto 4458 (desarrollo).
//
//   node scripts/auditoria/resumen-dev.mjs
//
// Levanta `next start` en el 3001 con las variables de los dobles (fuera de
// producción META_API_URL / TIKTOK_API_URL / TELEGRAM_API_URL se respetan; en
// producción se ignoran) y llama a la tarea de verdad (?dia=AAAA-MM-DD, solo
// fuera de producción). Comprueba:
//   1. resumen completo (todas las secciones, comparaciones, últimos 4
//      dígitos, comentarios cortados y marcados, atención);
//   2. no duplica: correr dos veces y dos corridas a la vez mandan una sola;
//   3. una fuente caída: sale igual con «No pude leer …»;
//   4. un día sin datos;
//   5. más de 4,000 caracteres: se parte en dos mensajes;
//   6. Telegram caído: queda 'fallido' y la siguiente corrida lo manda;
//   7. pausa y sin secreto (401);
//   8. nada de otro negocio ni de Checaíto: una campaña que no es de
//      PeluDesk no se lee, y solo se pregunta por la campaña de PeluDesk;
//   9. con el permiso de insights sí salen alcance y guardados, y con el
//      scope de TikTok salen sus seguidores;
//  10. ningún token en Telegram, en la respuesta de la tarea ni en los logs.
import http from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 4458;
const D = `http://127.0.0.1:${PUERTO}`;
const CAMPANA = "120253088985310589";
const SECRETOS = { meta: "tok-META-no-debe-salir", ttSecret: "tt-SECRETO-no-debe-salir", tg: "999:TG-no-debe-salir", cron: "cron-de-prueba" };
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const ok = (cond, si, no) => (cond ? bien(si) : hallazgo(no));

// ── Dobles ──
const llamadas = [];
const telegram = []; // { chat, texto }
const E = { insights: false, ttStats: false, caeIg: false, caeCamp: false, nombreCampana: "PeluDesk · Registros · Prueba", tgFalla: false, comentarios: "normal" };
const json = (res, s, j) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
const falla = (res, s, code = 1) => json(res, s, { error: { message: "falla de prueba", code } });
const hora = (d) => `${d}T18:00:00+0000`;
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const u = new globalThis.URL(req.url, D);
  const p = u.pathname;
  llamadas.push({ m: req.method, p, q: u.search, cuerpo });
  if (p.startsWith("/bot")) {
    if (E.tgFalla) return json(res, 200, { ok: false, description: "doble caído" });
    const b = JSON.parse(cuerpo || "{}");
    telegram.push({ chat: b.chat_id, texto: b.text ?? "" });
    return json(res, 200, { ok: true, result: { message_id: telegram.length } });
  }
  // TikTok
  if (p === "/v2/oauth/token/") return json(res, 200, { access_token: "at-1", refresh_token: "rt-1", expires_in: 86400, open_id: "o1" });
  if (p.startsWith("/v2/user/info/")) {
    if (u.search.includes("follower_count")) return E.ttStats ? json(res, 200, { data: { user: { follower_count: 55 } }, error: { code: "ok" } }) : json(res, 401, { error: { code: "scope_not_authorized", message: "scope" } });
    return json(res, 200, { data: { user: { display_name: "PeluDesk" } }, error: { code: "ok" } });
  }
  // Meta
  const partes = p.split("/").filter(Boolean); // [v25.0, id, arista?]
  const [, id, arista] = partes;
  const q = Object.fromEntries(u.searchParams);
  if (id === "debug_token") return json(res, 200, { data: { is_valid: true, expires_at: Math.floor(Date.now() / 1000) + 3 * 86400, data_access_expires_at: Math.floor(Date.now() / 1000) + 60 * 86400 } });
  if (id === "pagina1" && !arista) return q.fields === "access_token" ? json(res, 200, { access_token: "token-de-pagina", id }) : json(res, 200, { followers_count: 120, fan_count: 120 });
  if (id === "fbp1") return json(res, 200, { likes: { summary: { total_count: 5 } }, comments: { summary: { total_count: 1 } } });
  if (id === "ig1" && !arista) return E.caeIg ? falla(res, 500) : json(res, 200, { followers_count: 340 });
  if (id === "ig1" && arista === "media") {
    if (E.caeIg) return falla(res, 500);
    return json(res, 200, { data: [{ id: "igm1", permalink: "https://www.instagram.com/reel/igm1/", timestamp: hora("2026-09-13"), like_count: 12, comments_count: 3 }, { id: "igm2", permalink: "x", timestamp: hora("2026-09-01"), like_count: 1, comments_count: 0 }] });
  }
  if (id === "igm1" && arista === "insights") return E.insights ? json(res, 200, { data: [{ name: "reach", values: [{ value: 4321 }] }, { name: "saved", values: [{ value: 9 }] }, { name: "shares", values: [{ value: 4 }] }, { name: "views", values: [{ value: 8000 }] }] }) : falla(res, 400, 10);
  if (arista === "comments" && (id === "igm1" || id === "igad1")) {
    if (E.comentarios === "ninguno") return json(res, 200, { data: [] });
    if (id === "igad1") return json(res, 200, { data: [{ text: "¿Cuánto cuesta el plan para una guardería?", username: "maria_perros", timestamp: hora("2026-09-13") }] });
    return json(res, 200, { data: [{ text: "Qué bonito video", username: "juan", timestamp: hora("2026-09-13") }, { text: "x".repeat(300), username: "larga", timestamp: hora("2026-09-13") }, { text: "viejo", username: "antiguo", timestamp: hora("2026-08-01") }] });
  }
  // Campaña de PeluDesk
  if (id === CAMPANA && !arista) return E.caeCamp ? falla(res, 400, 100) : json(res, 200, { name: E.nombreCampana, effective_status: "ACTIVE" });
  if (id === CAMPANA && arista === "insights") {
    if (E.caeCamp) return falla(res, 400, 100);
    const r = JSON.parse(q.time_range);
    const unDia = r.since === r.until;
    const gasto = unDia ? (r.since === "2026-09-13" ? "265.00" : r.since === "2026-09-12" ? "120.50" : "0") : "2400.00";
    const fila = (extra = {}) => ({ spend: gasto, impressions: unDia ? "3000" : "30000", clicks: unDia ? "90" : "900", ctr: "3.0", actions: [{ action_type: "offsite_conversion.fb_pixel_complete_registration", value: unDia ? "3" : "12" }], ...extra });
    if (r.since.startsWith("2001")) return json(res, 200, { data: [] });
    if (q.level === "ad") return json(res, 200, { data: [{ ad_id: "ad1", ad_name: "Ese perro no está vacunado", ...fila() }, { ad_id: "ad2", ad_name: "Tu corte de caja, sin sorpresas", ...fila({ spend: "10.00" }) }] });
    return json(res, 200, { data: [fila()] });
  }
  if (id === CAMPANA && arista === "ads") return json(res, 200, { data: [
    { id: "ad1", name: "Ese perro no está vacunado", effective_status: "ACTIVE", creative: { effective_instagram_media_id: "igad1" } },
    { id: "ad2", name: "Tu corte de caja, sin sorpresas", effective_status: "DISAPPROVED", issues_info: [{ error_summary: "No cumple las políticas" }], creative: {} },
  ] });
  if (id === "act_1352741180271668" && arista === "insights") return json(res, 200, { data: [{ spend: "400.00" }] });
  return json(res, 404, { error: { message: `sin doble para ${req.method} ${p}`, code: 100 } });
});
await new Promise((r) => doble.listen(PUERTO, "127.0.0.1", r));

// ── La app, con los dobles ──
const logs = [];
const app = spawn(...(process.platform === "win32" ? [process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", "3001"]] : ["npx", ["next", "start", "-p", "3001"]]), {
  env: {
    ...process.env, NODE_USE_ENV_PROXY: "", VERCEL_ENV: "", META_API_URL: D, TIKTOK_API_URL: D, TELEGRAM_API_URL: D,
    PELUDESK_META_TOKEN: SECRETOS.meta, PELUDESK_FB_PAGE_ID: "pagina1", PELUDESK_IG_USER_ID: "ig1",
    TIKTOK_CLIENT_KEY: "clave", TIKTOK_CLIENT_SECRET: SECRETOS.ttSecret, TELEGRAM_BOT_TOKEN: SECRETOS.tg, CRON_SECRET: SECRETOS.cron,
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true,
});
app.stdout.on("data", (d) => logs.push(String(d)));
app.stderr.on("data", (d) => logs.push(String(d)));
const llamar = (dia, secreto = SECRETOS.cron) => fetch(`http://127.0.0.1:3001/api/cron/resumen${dia ? `?dia=${dia}` : ""}`, { headers: { ...(secreto ? { Authorization: `Bearer ${secreto}` } : {}), Host: "plataforma.localhost:3001" }, signal: AbortSignal.timeout(300_000) }).then(async (r) => { const texto = await r.text(); let j = null; try { j = JSON.parse(texto); } catch {} return { status: r.status, texto, json: j }; });
for (let i = 0; i < 60; i++) {
  if (await fetch("http://127.0.0.1:3001/api/cron/resumen").then((r) => r.status === 401).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const respuestas = [];
const mensajesDe = (desde) => telegram.slice(desde).map((t) => t.texto);
const fila = async (dia) => (await A.from("resumenes_diarios").select("*").eq("fecha", dia).is("deleted_at", null).maybeSingle()).data;
const T = "TESTRES";
const DIA = "2026-09-13"; // domingo: el lunes siguiente lleva la comparación semanal

async function limpiar() {
  await A.from("resumenes_diarios").delete().gte("fecha", "2001-01-01").lte("fecha", "2026-09-29");
  // registros_prueba no la ve la secret key de la prueba (corre con el encabezado de negocio): se borra por el CLI, ligado a desarrollo.
  execFileSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "db", "query", "--linked", `delete from public.registros_prueba where telefono like '${T}%'`], { stdio: "ignore" });
  await A.from("redes_publicaciones").delete().like("video", "test-resumen-%");
  await A.from("wa_mensajes").delete().like("telefono", "52100000000%");
  await A.from("wa_uso_ia").delete().like("telefono", "52100000000%");
  await A.from("wa_hilos").delete().like("telefono", "52100000000%");
}

let ajustesAntes = [];
let chatAntes = null;
try {
  ajustesAntes = (await A.from("resumen_ajustes").select("*").is("deleted_at", null)).data ?? [];
  await A.from("resumen_ajustes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await A.rpc("plataforma_resumen_ajustes", { p_valores: { hora: "0", pausa: "no", umbral_horas: "2", umbral_gasto: "100" } });
  chatAntes = (await A.from("wa_config").select("valor").eq("clave", "telegram_chat_operador").is("deleted_at", null).maybeSingle()).data;
  if (!chatAntes) await A.from("wa_config").insert({ clave: "telegram_chat_operador", valor: "4242" });
  await A.rpc("redes_secreto_guardar", { p_nombre: "tiktok", p_valor: JSON.stringify({ accessToken: "at-0", refreshToken: "rt-0", caduca: new Date(Date.now() + 20 * 3600_000).toISOString(), openId: "o1", cuenta: "PeluDesk" }) });
  await limpiar();

  // ── Datos de prueba (el día 13 de septiembre) ──
  const ins = async (t, filas) => { const { error } = await A.from(t).insert(filas); if (error) throw new Error(`${t}: ${error.message}`); };
  const reg = (n, extra) => ({ telefono: `${T}${n}`, created_at: "2026-09-13T16:00:00Z", ...extra });
  await ins("registros_prueba", [
    reg(1, { utm_source: "meta", utm_campaign: "registros-oct26", utm_content: "corte-de-caja" }),
    reg(2, { utm_source: "meta", utm_campaign: "registros-oct26", utm_content: "corte-de-caja" }),
    reg(3, { utm_source: "meta", utm_campaign: "checaito-otra-cosa", utm_content: "otro" }), // otra campaña: no cuenta
    reg(4, { created_at: "2026-09-12T16:00:00Z" }),
  ]);
  const pub = (video, extra) => ({ video, red: "instagram", formato: "reel", archivo: "x.mp4", programada_at: "2026-09-13T19:00:00Z", estado: "publicada", publicada_at: "2026-09-13T19:00:00Z", ...extra });
  await ins("redes_publicaciones", [
    pub("test-resumen-1", { publicacion_id: "igm1", url: "https://www.instagram.com/reel/igm1/" }),
    pub("test-resumen-1", { red: "facebook", publicacion_id: "fbp1", url: "https://www.facebook.com/reel/1/" }),
    pub("test-resumen-2", { red: "facebook", estado: "programada", publicada_at: null, programada_at: "2026-09-14T19:00:00Z" }),
    pub("test-resumen-3", { red: "tiktok", formato: "borrador", publicada_at: new Date(Date.now() - 3 * 86400_000).toISOString(), programada_at: "2026-09-27T19:00:00Z" }),
    pub("test-resumen-4", { red: "tiktok", formato: "borrador", estado: "fallida", publicada_at: null, error: "falla de prueba al subir" }),
  ]);
  const hilo = (n, extra) => ({ telefono: `5210000000${n}`, created_at: "2026-09-13T16:00:00Z", estado: "abierto", urgencia: "normal", telegram_message_id: null, ultimo_entrante_at: null, ...extra });
  await ins("wa_hilos", [
    hilo("001", { tipo: "prospecto", telegram_message_id: 11, estado: "abierto", ultimo_entrante_at: new Date(Date.now() - 5 * 3600_000).toISOString() }),
    hilo("002", { tipo: "prospecto" }),
    hilo("003", { tipo: "admin" }),
  ]);
  const msg = (tel, quien, t, texto) => ({ telefono: tel, quien, texto, created_at: t });
  await ins("wa_mensajes", [
    msg("5210000000001", "usuario", "2026-09-13T16:00:00Z", "SECRETO-DE-CONVERSACION hola"), msg("5210000000001", "agente", "2026-09-13T16:00:10Z", "SECRETO-DE-CONVERSACION respuesta"),
    msg("5210000000002", "usuario", "2026-09-13T17:00:00Z", "otro"), msg("5210000000002", "agente", "2026-09-13T17:00:20Z", "otra"),
  ]);
  await ins("wa_uso_ia", [{ telefono: "5210000000001", modelo: "x", resultado: "escalo", created_at: "2026-09-13T16:00:10Z" }, { telefono: "5210000000002", modelo: "x", resultado: "respondio", created_at: "2026-09-13T17:00:20Z" }, { telefono: "5210000000009", modelo: "x", resultado: "error", created_at: new Date().toISOString() }]);
  // La foto del día anterior, para las comparaciones.
  await A.from("resumenes_diarios").insert({ fecha: "2026-09-12", estado: "enviado", origen: "cron", partes: 1, snapshot: { fb: 118, ig: 330, tt: null, mrr_centavos: 0, pruebas_activas: 1, faltan: [] } });

  console.log("\n1. Resumen completo");
  let desde = telegram.length;
  const r1 = await llamar("2026-09-14"); // día 14 sin datos: lo de después (lunes). Aquí solo se calienta la app.
  respuestas.push(r1.texto);
  await A.from("resumenes_diarios").delete().eq("fecha", "2026-09-14");
  desde = telegram.length;
  const c1 = await llamar(DIA);
  respuestas.push(c1.texto);
  const t1 = mensajesDe(desde).join("\n");
  if (process.env.MUESTRA_SALIDA) (await import("node:fs")).writeFileSync(process.env.MUESTRA_SALIDA, t1);
  ok(c1.json?.estado === "enviado" && mensajesDe(desde).length >= 1, "la tarea manda el resumen a la bandeja", `respuesta ${c1.texto}`);
  ok(telegram.slice(desde).every((t) => t.chat === 4242 || t.chat === Number(chatAntes?.valor)), "va al chat de la bandeja vinculada", "se mandó a otro chat");
  for (const s of ["ATENCIÓN", "PUBLICACIONES", "COMENTARIOS", "CHATS DE WHATSAPP", "NEGOCIOS", "SEGUIDORES", "CAMPAÑA DE PELUDESK"]) ok(t1.includes(s), `lleva ${s}`, `falta ${s}`);
  ok(t1.includes("Instagram: 340 (+10)") && t1.includes("Facebook: 120 (+2)"), "seguidores con el cambio contra el día anterior", "seguidores sin comparación");
  ok(!/TikTok: \d/.test(t1), "TikTok sin seguidores (falta el scope): no se inventa", "salieron seguidores de TikTok sin scope");
  ok(t1.includes("test-resumen-1") && t1.includes("12 me gusta") && t1.includes("https://www.instagram.com/reel/igm1/") && t1.includes("5 me gusta"), "lo publicado, con liga y sus números", "faltan publicaciones, ligas o cifras");
  ok(!t1.includes("alcance"), "sin permiso de insights no salen alcance ni guardados", "salió alcance sin permiso");
  ok(t1.includes("Hoy:") && t1.includes("test-resumen-2") && t1.includes("Borradores de TikTok") && t1.includes("test-resumen-3"), "lo programado de hoy y los borradores de TikTok con su fecha", "faltan los de hoy o los borradores");
  ok(t1.includes("juan") && t1.includes("maria_perros") && t1.includes("← contestar") && t1.includes("…") && !t1.includes("x".repeat(101)) && !t1.includes("antiguo"), "comentarios: autor, texto cortado a 100, dudas marcadas, solo los de ayer", "comentarios mal armados");
  ok(/Nuevos: 3 \(ayer 0\) — prospectos 2, clientes 1/.test(t1) && /contestó sola 1; escalaron 1/.test(t1) && /Primera respuesta: \d+ s/.test(t1), "chats: nuevos por tipo, IA sola/escalados y primera respuesta", `chats: ${t1.split("CHATS DE WHATSAPP")[1]?.slice(0, 300)}`);
  ok(/\u2026\d{4}\b/.test(t1) && !/\b52\d{11}\b/.test(t1) && !t1.includes("SECRETO-DE-CONVERSACION"), "teléfonos solo con los últimos 4 y sin transcribir mensajes", "salió un teléfono completo o un mensaje");
  ok(/Registros de prueba: 3 \(ayer 1\)/.test(t1) || /Registros de prueba: 3 /.test(t1), "registros nuevos con su comparación", `registros: ${t1.split("NEGOCIOS")[1]?.slice(0, 200)}`);
  ok(t1.includes("Llegaron desde:") && t1.includes("meta"), "«Llegó desde» por anuncio", "falta el origen de los registros");
  ok(t1.includes("Pruebas activas:") && t1.includes("Ingreso mensual recurrente:") && t1.includes("Convertidas a pago:"), "pruebas, conversiones e ingreso recurrente", "faltan cifras de negocios");
  ok(t1.includes("Semana: ") && t1.includes("contra"), "el lunes agrega la comparación contra la semana anterior", "falta la línea semanal del lunes");
  ok(t1.includes("$265.00") && t1.includes("de $8,000.00") && t1.includes("3 según Meta") && t1.includes("2 reales"), "campaña: gasto, presupuesto y registros de Meta contra reales", `campaña: ${t1.split("CAMPAÑA DE PELUDESK")[1]?.slice(0, 500)}`);
  ok(t1.includes("Ese perro no está vacunado") && t1.includes("$10.00"), "desglose por anuncio", "falta el desglose por anuncio");
  ok(t1.includes("Resto de la cuenta publicitaria (Checaíto), solo informativo: $135.00"), "una línea informativa con el resto de la cuenta", "falta la línea del resto de la cuenta");
  const at = t1.split("ATENCIÓN")[1]?.split("PUBLICACIONES")[0] ?? "";
  ok(at.includes("Tu corte de caja") && at.includes("DISAPPROVED"), "atención: anuncio rechazado", `atención: ${at}`);
  ok(/hilos? de WhatsApp escalados? sin contestar hace más de 2 h: …\d{4}/.test(at), "atención: hilo escalado sin contestar", "falta el hilo sin contestar en atención");
  ok(at.includes("IA caída, contestar a mano"), "atención: IA caída", "falta IA caída en atención");
  ok(at.includes("test-resumen-4") && at.includes("falló"), "atención: publicación que falló", "falta la publicación fallida en atención");
  ok(/token de Meta caduca en [23] días/.test(at), "atención: token de Meta por caducar", "falta el aviso del token");
  const f1 = await fila(DIA);
  ok(f1?.estado === "enviado" && f1.partes >= 1 && f1.snapshot?.ig === 340 && f1.snapshot.faltan.some((x) => x.includes("instagram_manage_insights")) && f1.snapshot.faltan.some((x) => x.includes("user.info.stats")), "queda guardado con su foto y los permisos que faltan", `fila ${JSON.stringify(f1)?.slice(0, 300)}`);

  console.log("\n2. No duplica");
  desde = telegram.length;
  const c2 = await llamar(DIA);
  respuestas.push(c2.texto);
  ok(c2.json?.estado === "ya_enviado" && telegram.length === desde, "correrlo otra vez el mismo día no manda nada", `segundo envío: ${c2.texto}; mensajes nuevos ${telegram.length - desde}`);
  desde = telegram.length;
  const [a, b] = await Promise.all([llamar("2026-09-11"), llamar("2026-09-11")]);
  respuestas.push(a.texto, b.texto);
  const estados = [a.json?.estado, b.json?.estado].sort();
  ok(estados.join() === "enviado,ya_enviado" && (await A.from("resumenes_diarios").select("id").eq("fecha", "2026-09-11")).data.length === 1, "dos corridas a la vez: una manda, la otra no", `estados ${estados}`);
  const enviadosJuntos = mensajesDe(desde).length;
  ok(enviadosJuntos === (await fila("2026-09-11")).partes, "se mandó exactamente una vez (mensajes = partes)", `${enviadosJuntos} mensajes contra ${(await fila("2026-09-11")).partes} partes`);

  console.log("\n3. Una fuente caída");
  E.caeIg = true;
  E.caeCamp = true;
  desde = telegram.length;
  const c3 = await llamar("2026-09-15");
  respuestas.push(c3.texto);
  const t3 = mensajesDe(desde).join("\n");
  E.caeIg = false;
  E.caeCamp = false;
  ok(c3.json?.estado === "enviado" && /No pude leer (los comentarios de Instagram|seguidores de Instagram)/.test(t3) && t3.includes("No pude leer la campaña de Meta:"), "sale igual, con «No pude leer [fuente]: [motivo]»", `texto: ${t3.slice(0, 600)}`);
  ok(t3.includes("NEGOCIOS") && t3.includes("CHATS DE WHATSAPP"), "lo que sí se pudo leer sigue en el resumen", "se perdió lo demás");
  const f3 = await fila("2026-09-15");
  ok(f3.fuentes_fallidas.includes("Instagram") && f3.fuentes_fallidas.includes("campaña de Meta"), "la fila anota qué fuentes fallaron", `fallidas: ${f3.fuentes_fallidas}`);

  console.log("\n4. Día sin datos");
  E.comentarios = "ninguno";
  desde = telegram.length;
  const c4 = await llamar("2001-01-15");
  respuestas.push(c4.texto);
  const t4 = mensajesDe(desde).join("\n");
  E.comentarios = "normal";
  ok(c4.json?.estado === "enviado" && t4.includes("Ayer no salió nada") && t4.includes("Nuevos: 0") && t4.includes("Registros de prueba: 0") && t4.includes("0 nuevos ayer") && t4.includes("$0.00"), "un día sin datos sale con ceros, sin tronar", `texto: ${t4.slice(0, 500)}`);

  console.log("\n5. Más de 4,000 caracteres: dos mensajes");
  const muchas = Array.from({ length: 60 }, (_, i) => pub(`test-resumen-p${i}`, { red: i % 2 ? "facebook" : "instagram", formato: "reel", url: `https://www.instagram.com/reel/${"A".repeat(40)}${i}/`, publicada_at: "2026-09-17T19:00:00Z", programada_at: "2026-09-17T19:00:00Z" }));
  await ins("redes_publicaciones", muchas.map((m) => ({ ...m, video: m.video, publicacion_id: null })));
  desde = telegram.length;
  const c5 = await llamar("2026-09-17");
  respuestas.push(c5.texto);
  const m5 = mensajesDe(desde);
  ok(m5.length >= 2 && m5.every((m) => m.length <= 4096), `se partió en ${m5.length} mensajes, todos bajo el tope de Telegram`, `mensajes: ${m5.map((m) => m.length)}`);
  ok(m5.join("\n").includes("test-resumen-p0") && m5.join("\n").includes("test-resumen-p59") && (await fila("2026-09-17")).partes === m5.length, "no se perdió nada al partir", "se perdió contenido al partir");
  const sinAbrir = m5.filter((m) => (m.match(/<b>/g) ?? []).length !== (m.match(/<\/b>/g) ?? []).length);
  ok(!sinAbrir.length, "ningún mensaje parte una etiqueta HTML", "una etiqueta quedó abierta al partir");

  console.log("\n6. Telegram caído");
  E.tgFalla = true;
  const c6 = await llamar("2026-09-18");
  respuestas.push(c6.texto);
  E.tgFalla = false;
  const f6 = await fila("2026-09-18");
  ok(c6.json?.estado === "fallido" && f6?.estado === "fallido" && f6.error, "si Telegram no recibe, queda 'fallido' con su motivo", `estado ${c6.json?.estado}, fila ${f6?.estado}`);
  desde = telegram.length;
  const c6b = await llamar("2026-09-18");
  respuestas.push(c6b.texto);
  ok(c6b.json?.estado === "enviado" && telegram.length > desde, "la siguiente corrida lo manda (nunca se queda callado)", `reintento: ${c6b.texto}`);

  console.log("\n7. Pausa y secreto");
  await A.rpc("plataforma_resumen_ajustes", { p_valores: { pausa: "si" } });
  desde = telegram.length;
  const c7 = await llamar("2026-09-19");
  respuestas.push(c7.texto);
  ok(c7.json?.estado === "pausado" && telegram.length === desde && !(await fila("2026-09-19")), "en pausa no sale nada", `en pausa: ${c7.texto}`);
  await A.rpc("plataforma_resumen_ajustes", { p_valores: { pausa: "no" } });
  const horaMx = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", hour12: false }).format(new Date())) % 24;
  if (horaMx < 23) {
    await A.rpc("plataforma_resumen_ajustes", { p_valores: { hora: "23" } });
    const c7b = await llamar("2026-09-19");
    ok(c7b.json?.estado === "aun_no" && !(await fila("2026-09-19")), "antes de la hora configurada no sale", `antes de hora: ${c7b.texto}`);
    await A.rpc("plataforma_resumen_ajustes", { p_valores: { hora: "0" } });
  }
  const sin = await llamar("2026-09-19", null);
  const mal = await llamar("2026-09-19", "otro-secreto");
  ok(sin.status === 401 && mal.status === 401 && !(await fila("2026-09-19")), "sin secreto o con otro: 401 y no corre", `sin ${sin.status}, mal ${mal.status}`);

  console.log("\n8. Nada de otro negocio ni de Checaíto");
  E.nombreCampana = "Promoción de Checaíto";
  const antesLlamadas = llamadas.length;
  desde = telegram.length;
  const c8 = await llamar("2026-09-20");
  respuestas.push(c8.texto);
  E.nombreCampana = "PeluDesk · Registros · Prueba";
  const t8 = mensajesDe(desde).join("\n");
  ok(t8.includes("No pude leer la campaña de Meta:") && t8.includes("no es de PeluDesk") && !t8.includes("Resto de la cuenta") && !t8.includes("$400.00"), "una campaña que no es de PeluDesk no se lee ni se cuela", `texto: ${t8.slice(0, 400)}`);
  const consultadas = llamadas.slice(antesLlamadas).filter((l) => l.p.includes("/insights")).map((l) => l.p);
  ok(consultadas.every((p) => p.includes(CAMPANA) || p.includes("act_1352741180271668")), "solo se pregunta por la campaña de PeluDesk (y el gasto de la cuenta)", `insights de otras cosas: ${consultadas}`);
  const acc = await fetch(`${URL}/rest/v1/resumenes_diarios?select=id`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` } }).then((r) => r.json()).catch(() => null);
  ok(!Array.isArray(acc) || acc.length === 0, "la llave anónima no ve ningún resumen", "la llave anónima ve resúmenes");

  console.log("\n9. Con los permisos, salen las cifras que faltaban");
  E.insights = true;
  E.ttStats = true;
  await ins("redes_publicaciones", pub("test-resumen-9", { publicacion_id: "igm1", url: "https://www.instagram.com/reel/igm1/", publicada_at: "2026-09-21T19:00:00Z", programada_at: "2026-09-21T19:00:00Z" }));
  desde = telegram.length;
  const c9 = await llamar("2026-09-21");
  respuestas.push(c9.texto);
  const t9 = mensajesDe(desde).join("\n");
  ok(t9.includes("alcance 4,321") && t9.includes("9 guardados") && t9.includes("4 compartidos") && t9.includes("reproducciones 8,000") , "con instagram_manage_insights salen alcance, guardados, compartidos y reproducciones", `texto: ${t9.slice(0, 300)}`);
  ok(t9.includes("TikTok: 55"), "con el scope de TikTok salen sus seguidores", "TikTok no mostró sus seguidores");
  E.insights = false;
  E.ttStats = false;

  console.log("\n10. Secretos");
  const todo = [...telegram.map((t) => t.texto), ...respuestas, ...logs].join("\n");
  const fuga = Object.entries(SECRETOS).filter(([, v]) => todo.includes(v)).map(([k]) => k);
  ok(!fuga.length, "ningún token en Telegram, en la respuesta de la tarea ni en los logs", `se filtró: ${fuga.join(", ")}`);
  ok(!todo.includes("SECRETO-DE-CONVERSACION"), "ningún mensaje de WhatsApp se transcribió", "se transcribió un mensaje de WhatsApp");
} finally {
  try { await limpiar(); } catch (e) { console.log("limpieza:", e.message); }
  await A.from("resumen_ajustes").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  for (const f of ajustesAntes) await A.from("resumen_ajustes").insert({ clave: f.clave, valor: f.valor });
  try { await A.rpc("redes_secreto_guardar", { p_nombre: "tiktok", p_valor: "" }); } catch {}
  if (!chatAntes) await A.from("wa_config").delete().eq("clave", "telegram_chat_operador").eq("valor", "4242");
  if (process.platform === "win32") spawn("taskkill", ["/pid", String(app.pid), "/T", "/F"], { stdio: "ignore" });
  else try { process.kill(-app.pid, "SIGTERM"); } catch { app.kill("SIGTERM"); }
  doble.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
