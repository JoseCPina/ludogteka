// Prueba de punta a punta del publicador de redes, contra dobles locales de
// Meta (Graph), TikTok y Telegram en el puerto 4457 (desarrollo).
//
//   node scripts/auditoria/redes-dev.mjs
//
// Levanta `next start` en el 3001 con las variables de los dobles (fuera de
// producción META_API_URL / TIKTOK_API_URL / TELEGRAM_API_URL se respetan;
// en producción se ignoran) y comprueba, llamando al cron de verdad:
//   1. el calendario se carga completo y cargarlo dos veces no duplica;
//   2. dos corridas A LA VEZ publican cada fila una sola vez (IG, reel y
//      muro de Facebook, borrador de TikTok);
//   3. una corrida que murió al publicar en Instagram se retoma sin volver a
//      publicar (el contenedor ya salió);
//   4. un muro de Facebook cortado a la mitad queda 'revisar' y NO se reenvía;
//   5. un 500 de Meta → 'reintentar' con espera, sin frenar a las demás; un
//      190 (token) → 'fallida';
//   6. en pausa no sale nada;
//   7. TikTok renueva el token vencido y guarda el refresh NUEVO;
//   8. las pruebas: Facebook sube sin publicar y borra, Instagram no publica;
//   9. cada publicación y cada falla avisan en Telegram, y ningún token
//      aparece en Telegram, en la respuesta del cron ni en los logs.
import http from "node:http";
import { spawn } from "node:child_process";
import { A, URL } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 4457;
const D = `http://127.0.0.1:${PUERTO}`;
const SECRETOS = { meta: "tok-META-no-debe-salir", ttSecret: "tt-SECRETO-no-debe-salir", tg: "999:TG-no-debe-salir", cron: "cron-de-prueba" };
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const ok = (cond, si, no) => (cond ? bien(si) : hallazgo(no));

// ── Dobles ──
const llamadas = [];
const telegram = [];
let fallar = {}; // ruta → { veces, status, code }
let contenedores = {}; // id → status_code
let tiktokTokens = 0;
const json = (res, s, j) => { res.writeHead(s, { "content-type": "application/json" }); res.end(JSON.stringify(j)); };
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const u = new globalThis.URL(req.url, D);
  const p = u.pathname;
  const clave = p.replace(/^\/v\d+\.\d+\//, "").replace(/^[^/]*\//, (m) => (m.match(/^\d/) ? "" : m));
  llamadas.push({ m: req.method, p, clave, cuerpo });
  for (const [ruta, f] of Object.entries(fallar)) {
    if (p.includes(ruta) && f.veces > 0) {
      f.veces -= 1;
      return json(res, f.status, { error: { message: "falla de prueba", code: f.code ?? 1 } });
    }
  }
  if (p.startsWith("/bot")) {
    const b = JSON.parse(cuerpo || "{}");
    telegram.push(b.text ?? "");
    return json(res, 200, { ok: true, result: { message_id: telegram.length } });
  }
  // TikTok
  if (p === "/v2/oauth/token/") { tiktokTokens += 1; return json(res, 200, { access_token: `at-${tiktokTokens}`, refresh_token: `rt-${tiktokTokens}`, expires_in: 86400, open_id: "o1" }); }
  if (p.startsWith("/v2/user/info/")) return json(res, 200, { data: { user: { display_name: "PeluDesk" } }, error: { code: "ok" } });
  if (p === "/v2/post/publish/inbox/video/init/") return json(res, 200, { data: { publish_id: `pub-${llamadas.length}`, upload_url: `https://open-upload.tiktokapis.com/upload/${llamadas.length}` }, error: { code: "ok" } });
  if (p.startsWith("/upload/")) { res.writeHead(201); return res.end(); }
  if (p === "/v2/post/publish/status/fetch/") return json(res, 200, { data: { status: "SEND_TO_USER_INBOX" }, error: { code: "ok" } });
  // Meta
  const partes = p.split("/").filter(Boolean); // [v25.0, id, arista?]
  if (p.startsWith("/video-upload/")) return json(res, 200, { success: true });
  const [, id, arista] = partes;
  const q = Object.fromEntries(new URLSearchParams(req.method === "GET" ? u.search : cuerpo));
  if (arista === "media") { const c = `cont-${llamadas.length}`; contenedores[c] = "FINISHED"; return json(res, 200, { id: c }); }
  if (arista === "media_publish") { contenedores[q.creation_id] = "PUBLISHED"; return json(res, 200, { id: `ig-${q.creation_id}` }); }
  if (arista === "video_reels" && q.upload_phase === "start") { const v = `reel-${llamadas.length}`; return json(res, 200, { video_id: v, upload_url: `https://rupload.facebook.com/video-upload/v26.0/${v}` }); }
  if (arista === "video_reels" && q.upload_phase === "finish") return json(res, 200, { success: true, post_id: "p1" });
  if (arista === "videos") return json(res, 200, { id: `muro-${llamadas.length}` });
  if (req.method === "DELETE") return json(res, 200, { success: true });
  if (req.method === "GET" && q.fields?.includes("status_code")) return json(res, 200, { status_code: contenedores[id] ?? "FINISHED", status: "" });
  if (req.method === "GET" && q.fields?.includes("permalink")) return json(res, 200, { permalink: `https://www.instagram.com/reel/${id}/`, permalink_url: `/peludesk/videos/${id}/` });
  if (req.method === "GET" && q.fields?.includes("published")) return json(res, 200, { published: true });
  return json(res, 404, { error: { message: `sin doble para ${req.method} ${p}` } });
});
await new Promise((r) => doble.listen(PUERTO, "127.0.0.1", r));

// ── La app, con los dobles ──
const logs = [];
const app = spawn("npx", ["next", "start", "-p", "3001"], {
  env: {
    ...process.env, NODE_USE_ENV_PROXY: "", VERCEL_ENV: "", META_API_URL: D, TIKTOK_API_URL: D, TELEGRAM_API_URL: D,
    PELUDESK_META_TOKEN: SECRETOS.meta, PELUDESK_FB_PAGE_ID: "pagina1", PELUDESK_IG_USER_ID: "ig1",
    TIKTOK_CLIENT_KEY: "clave", TIKTOK_CLIENT_SECRET: SECRETOS.ttSecret, TELEGRAM_BOT_TOKEN: SECRETOS.tg,
    CRON_SECRET: SECRETOS.cron, PELUDESK_VIDEOS_URL: "http://127.0.0.1:3001",
  },
  stdio: ["ignore", "pipe", "pipe"],
  detached: true, // para terminar también el next-server que lanza npx
});
app.stdout.on("data", (d) => logs.push(String(d)));
app.stderr.on("data", (d) => logs.push(String(d)));
const cron = () => fetch("http://127.0.0.1:3001/api/cron/redes", { headers: { Authorization: `Bearer ${SECRETOS.cron}`, Host: "plataforma.localhost:3001" }, signal: AbortSignal.timeout(300_000) }).then(async (r) => ({ status: r.status, texto: await r.text() }));
for (let i = 0; i < 60; i++) {
  if (await fetch("http://127.0.0.1:3001/peludesk/redes/videos/corte-de-caja.srt").then((r) => r.ok).catch(() => false)) break;
  await new Promise((r) => setTimeout(r, 1000));
}

const tabla = () => A.from("redes_publicaciones");
const filas = async () => (await tabla().select("*").is("deleted_at", null).order("programada_at")).data;
const cuenta = (pred) => llamadas.filter(pred).length;
const respuestas = [];

try {
  // Estado limpio (desarrollo): sin publicaciones, sin pausa, chat de Telegram de prueba.
  await tabla().delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await A.rpc("plataforma_redes_pausar", { p_pausa: false });
  const { data: chatAntes } = await A.from("wa_config").select("valor").eq("clave", "telegram_chat_operador").is("deleted_at", null).maybeSingle();
  if (!chatAntes) await A.from("wa_config").insert({ clave: "telegram_chat_operador", valor: "4242" });
  // TikTok conectado (lo que deja «Conectar TikTok»: tokens en Vault).
  await A.rpc("redes_secreto_guardar", { p_nombre: "tiktok", p_valor: JSON.stringify({ accessToken: "at-0", refreshToken: "rt-0", caduca: new Date(Date.now() + 20 * 3600_000).toISOString(), openId: "o1", cuenta: "PeluDesk" }) });

  console.log("\n1. Calendario");
  const { filasDeLaSerie } = await import("../../src/lib/redes/serie.ts");
  const serie = filasDeLaSerie();
  const n1 = (await A.rpc("plataforma_redes_programar", { p_filas: serie })).data;
  const n2 = (await A.rpc("plataforma_redes_programar", { p_filas: serie })).data;
  ok(n1 === serie.length && n2 === 0, `${serie.length} publicaciones; cargarlo otra vez no duplica`, `se cargaron ${n1} y luego ${n2} (esperaba ${serie.length} y 0)`);
  const hashtags = serie.filter((f) => (f.pie.match(/#/g) ?? []).length > 3);
  ok(!hashtags.length && serie.every((f) => f.pie.includes("peludesk.mx") && /15 días gratis/i.test(f.pie)), "cada pie lleva peludesk.mx, los 15 días gratis y ≤3 hashtags", "algún pie sin peludesk.mx/15 días o con más de 3 hashtags");

  console.log("\n2. Dos corridas a la vez");
  // Lo del primer día (Facebook muro + Instagram) y el reel de Facebook + TikTok del segundo, ya.
  const hoy = (await filas()).filter((f) => ["un-dia-en-tu-guarderia", "ese-perro-no-esta-vacunado"].includes(f.video));
  await tabla().update({ programada_at: new Date(Date.now() - 60_000).toISOString() }).in("id", hoy.map((f) => f.id));
  const [r1, r2] = await Promise.all([cron(), cron()]);
  respuestas.push(r1.texto, r2.texto);
  const despues = (await filas()).filter((f) => hoy.some((h) => h.id === f.id));
  ok(despues.every((f) => f.estado === "publicada"), `las ${hoy.length} publicaciones salieron`, `estados: ${despues.map((f) => `${f.red}/${f.formato}:${f.estado}${f.error ? ` (${f.error})` : ""}`).join(", ")}`);
  ok(cuenta((l) => l.p.endsWith("/media_publish")) === 2 && cuenta((l) => l.p.endsWith("/videos") && l.m === "POST") === 1 && cuenta((l) => l.cuerpo.includes("upload_phase=finish")) === 1 && cuenta((l) => l.p === "/v2/post/publish/inbox/video/init/") === 1,
    "cada una se publicó UNA vez (2 IG, 1 muro, 1 reel, 1 TikTok)",
    `publicaciones repetidas o faltantes: IG ${cuenta((l) => l.p.endsWith("/media_publish"))}, muro ${cuenta((l) => l.p.endsWith("/videos"))}, reel ${cuenta((l) => l.cuerpo.includes("upload_phase=finish"))}, TikTok ${cuenta((l) => l.p === "/v2/post/publish/inbox/video/init/")}`);
  ok(despues.filter((f) => f.red !== "tiktok").every((f) => f.url?.startsWith("https://")), "cada publicación de Meta guardó su enlace", "falta el enlace de alguna");
  const pieIg = hoy.find((f) => f.red === "instagram").pie;
  const conPie = llamadas.find((l) => l.p.endsWith("/media") && l.cuerpo.includes("caption="));
  ok(conPie && new URLSearchParams(conPie.cuerpo).get("caption") === pieIg, "el pie llegó completo a Instagram", "el pie no llegó igual a Instagram");
  const reelFin = llamadas.find((l) => l.cuerpo.includes("upload_phase=finish"));
  ok(reelFin && new URLSearchParams(reelFin.cuerpo).get("description"), "la descripción del reel va en el finish", "el reel salió sin descripción");

  console.log("\n3. Instagram cortado al publicar");
  const ig = (await filas()).find((f) => f.video === "corte-de-caja" && f.red === "instagram");
  contenedores["cont-cortado"] = "PUBLISHED";
  await tabla().update({ estado: "publicando", paso: "publicar", contenedor_id: "cont-cortado", bloqueo_hasta: new Date(Date.now() - 1000).toISOString(), programada_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", ig.id);
  const antesIg = cuenta((l) => l.p.endsWith("/media_publish"));
  respuestas.push((await cron()).texto);
  const igD = (await filas()).find((f) => f.id === ig.id);
  ok(igD.estado === "publicada" && cuenta((l) => l.p.endsWith("/media_publish")) === antesIg, "se retomó sin volver a publicar (el contenedor ya había salido)", `estado ${igD.estado}; media_publish ${cuenta((l) => l.p.endsWith("/media_publish")) - antesIg} veces`);

  console.log("\n4. Muro de Facebook cortado a la mitad");
  const muro = (await filas()).find((f) => f.video === "corte-de-caja" && f.red === "facebook");
  await tabla().update({ estado: "publicando", paso: "enviar", bloqueo_hasta: new Date(Date.now() - 1000).toISOString(), programada_at: new Date(Date.now() - 60_000).toISOString() }).eq("id", muro.id);
  const antesMuro = cuenta((l) => l.p.endsWith("/videos"));
  respuestas.push((await cron()).texto);
  const muroD = (await filas()).find((f) => f.id === muro.id);
  ok(muroD.estado === "revisar" && cuenta((l) => l.p.endsWith("/videos")) === antesMuro, "queda 'revisar' y NO se reenvía", `estado ${muroD.estado}; /videos ${cuenta((l) => l.p.endsWith("/videos")) - antesMuro} veces`);

  console.log("\n5. Fallas: 500 reintenta, 190 no; las demás redes siguen");
  const adios = (await filas()).filter((f) => f.video === "adios-a-la-impresora");
  await tabla().update({ programada_at: new Date(Date.now() - 60_000).toISOString() }).in("id", adios.map((f) => f.id));
  fallar = { media_publish: { veces: 3, status: 500 }, video_reels: { veces: 1, status: 400, code: 190 } };
  respuestas.push((await cron()).texto);
  const ad = await filas();
  const e = (red) => ad.find((f) => f.video === "adios-a-la-impresora" && f.red === red);
  ok(e("instagram").estado === "reintentar" && e("instagram").proximo_intento_at > new Date().toISOString(), "Instagram con 500: 'reintentar' con espera", `Instagram quedó ${e("instagram").estado}`);
  ok(e("facebook").estado === "fallida", "Facebook con 190 (token): 'fallida', sin reintentos", `Facebook quedó ${e("facebook").estado}`);
  ok(e("tiktok").estado === "publicada", "TikTok salió aunque las otras fallaron", `TikTok quedó ${e("tiktok").estado}`);
  fallar = {};
  respuestas.push((await cron()).texto);
  ok((await filas()).find((f) => f.id === e("instagram").id).estado === "reintentar", "no se reintenta antes de su hora", "se reintentó antes de tiempo");

  console.log("\n6. Pausa");
  await A.rpc("plataforma_redes_pausar", { p_pausa: true });
  const raza = (await filas()).filter((f) => f.video === "cada-raza-su-precio");
  await tabla().update({ programada_at: new Date(Date.now() - 60_000).toISOString() }).in("id", raza.map((f) => f.id));
  respuestas.push((await cron()).texto);
  ok((await filas()).filter((f) => f.video === "cada-raza-su-precio").every((f) => f.estado === "programada"), "en pausa no sale nada", "salió algo en pausa");
  await A.rpc("plataforma_redes_pausar", { p_pausa: false });

  console.log("\n7. TikTok renueva el token y guarda el refresh nuevo");
  await A.rpc("redes_secreto_guardar", { p_nombre: "tiktok", p_valor: JSON.stringify({ accessToken: "viejo", refreshToken: "rt-viejo", caduca: new Date(Date.now() - 1000).toISOString(), openId: "o1", cuenta: "PeluDesk" }) });
  respuestas.push((await cron()).texto);
  const guardado = JSON.parse((await A.rpc("redes_secreto_leer", { p_nombre: "tiktok" })).data);
  const refresco = llamadas.filter((l) => l.p === "/v2/oauth/token/" && l.cuerpo.includes("grant_type=refresh_token"));
  ok(refresco.some((l) => l.cuerpo.includes("rt-viejo")) && guardado.refreshToken !== "rt-viejo" && guardado.accessToken !== "viejo", "renovó con el refresh viejo y guardó el nuevo en Vault", "no renovó o no guardó el refresh nuevo");
  ok((await filas()).filter((f) => f.video === "cada-raza-su-precio").every((f) => f.estado === "publicada"), "al reanudar salió lo que se había quedado", "no salió lo pausado");

  console.log("\n8. Pruebas de conexión");
  await A.rpc("plataforma_redes_probar", { p_red: "facebook", p_archivo: "un-dia-en-tu-guarderia-16x9.mp4" });
  await A.rpc("plataforma_redes_probar", { p_red: "instagram", p_archivo: "un-dia-en-tu-guarderia-9x16-subtitulos.mp4" });
  const antesPub = cuenta((l) => l.p.endsWith("/media_publish"));
  respuestas.push((await cron()).texto);
  const pr = (await tabla().select("*").eq("prueba", true)).data;
  const fbPrueba = llamadas.filter((l) => l.p.endsWith("/videos") && l.cuerpo.includes("published=false"));
  ok(pr.every((f) => f.estado === "publicada") && fbPrueba.length === 1 && cuenta((l) => l.m === "DELETE") >= 1, "Facebook: sin publicar y borrado", `pruebas: ${pr.map((f) => `${f.red}:${f.estado}`).join(", ")}`);
  ok(cuenta((l) => l.p.endsWith("/media_publish")) === antesPub, "Instagram: el contenedor de prueba no se publicó", "la prueba de Instagram se publicó");

  console.log("\n9. Avisos y secretos");
  ok(telegram.some((t) => t.includes("Publicado")) && telegram.some((t) => t.includes("No salió")), `${telegram.length} avisos en Telegram (publicaciones y fallas)`, "faltan avisos en Telegram");
  ok(telegram.some((t) => t.includes("borradores de TikTok") && t.includes("peludesk.mx")), "el aviso de TikTok trae el pie para pegarlo", "el aviso de TikTok no trae el pie");
  const todo = [...telegram, ...respuestas, ...logs].join("\n");
  const fuga = Object.entries(SECRETOS).filter(([, v]) => todo.includes(v)).map(([k]) => k);
  ok(!fuga.length, "ningún token en Telegram, en la respuesta del cron ni en los logs", `se filtró: ${fuga.join(", ")}`);

  // Limpieza.
  await tabla().delete().neq("id", "00000000-0000-0000-0000-000000000000");
  await A.rpc("redes_secreto_guardar", { p_nombre: "tiktok", p_valor: "" });
  if (!chatAntes) await A.from("wa_config").delete().eq("clave", "telegram_chat_operador").eq("valor", "4242");
} finally {
  try { process.kill(-app.pid, "SIGTERM"); } catch { app.kill("SIGTERM"); }
  doble.close();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
