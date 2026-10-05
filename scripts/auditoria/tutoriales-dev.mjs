// Videos tutoriales en pantalla, a 390 px (SOLO DESARROLLO, en Huellitas).
// Con el servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/tutoriales-dev.mjs
//
// 1. Sin videos publicados: «Estamos preparando los videos» (Ayuda y Videos), sin
//    «¿Cómo se hace?» ni tarjeta de inicio.
// 2. Con videos publicados: la sección Videos de Ayuda, la lista por área, el
//    reproductor (MP4 con subtítulos es-MX y control de velocidad), el
//    «Siguiente video» y los artículos relacionados.
// 3. «¿Cómo se hace?» solo en la pantalla del video; la tarjeta «Empieza con
//    estos videos» en el inicio de admin y de recepción (se oculta y se acuerda)
//    y los «Ver cómo se hace» de Bienvenida.
// 4. Quién ve qué: un video de un módulo que el negocio no tiene no sale; uno
//    grabado con la cuenta de admin lo ve recepción solo con alguno de sus
//    permisos.
// 5. Con id de YouTube, el reproductor es el de youtube-nocookie.
// 6. La página pública (peludesk.mx/ayuda/videos/<slug>): solo lo publicado.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const BASE = "http://huellitas.localhost:3001";
const BASE_PLAT = "http://plataforma.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

async function cookiesDe(profileId, dominio = "huellitas.localhost") {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}
const sinDesborde = async (pag, donde) => {
  const w = await pag.evaluate(() => document.documentElement.scrollWidth);
  if (w > 392) hallazgo(`${donde}: la página se desborda a ${w}px en un celular de 390`);
};

const { data: recId } = await A.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
const tAdmin = await tokenDe(datos.adminB);
const rpcAdmin = (fn, args) => fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${tAdmin}`, "x-negocio-id": B, "Content-Type": "application/json" }, body: JSON.stringify(args) });

// El estado de antes, para dejarlo igual.
const { data: previas } = await A.from("tutoriales").select("numero, publicado, estado, video_path, poster_path, vtt_path, youtube_id, modulos, duracion_s").is("deleted_at", null);
const publicar = (numero, extra = {}) => A.rpc("plataforma_tutorial_publicar", { p: { numero, publicado: true, estado: "listo_sin_voz", duracion_s: 120, ...extra } });
const despublicarTodo = async () => { for (const f of previas) await A.rpc("plataforma_tutorial_publicar", { p: { numero: f.numero, publicado: false } }); };

// Un MP4 de 2 s, un VTT y un póster de mentiras.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tut-ui-"));
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc=size=640x360:rate=30:duration=2", "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo", "-t", "2", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", path.join(tmp, "v.mp4")]);
execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=0x4b3f72:size=640x360", "-frames:v", "1", path.join(tmp, "p.jpg")]);
fs.writeFileSync(path.join(tmp, "s.vtt"), "WEBVTT\n\n00:00.000 --> 00:02.000\nHola, esto es una prueba.\n");
for (const [archivo, tipo, destino] of [["v.mp4", "video/mp4", "video-720p.mp4"], ["p.jpg", "image/jpeg", "poster.jpg"], ["s.vtt", "text/vtt", "subtitulos.es-MX.vtt"]]) {
  const { error } = await A.storage.from("tutoriales").upload(`zz-ui/${destino}`, fs.readFileSync(path.join(tmp, archivo)), { contentType: tipo, upsert: true });
  if (error) throw new Error(error.message);
}
const ARCH = { video_path: "zz-ui/video-720p.mp4", poster_path: "zz-ui/poster.jpg", vtt_path: "zz-ui/subtitulos.es-MX.vtt" };

const nav = await abrirNavegador();
const ctxA = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxA.addCookies(await cookiesDe(datos.adminB));
const admin = await ctxA.newPage();
const ctxR = await nav.newContext({ viewport: { width: 390, height: 844 } });
await ctxR.addCookies(await cookiesDe(recId));
const recep = await ctxR.newPage();

try {
  console.log("1. Sin videos publicados");
  await despublicarTodo();
  await admin.goto(`${BASE}/ayuda`, { waitUntil: "networkidle" });
  if (!(await admin.locator("[data-seccion-videos]").innerText()).includes("Estamos preparando los videos")) hallazgo("Ayuda no dice «Estamos preparando los videos»");
  await admin.goto(`${BASE}/ayuda/videos`, { waitUntil: "networkidle" });
  if (!(await admin.locator("[data-sin-videos]").count())) hallazgo("la lista de Videos no dice «Estamos preparando los videos»");
  await admin.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
  if (await admin.locator("[data-boton-video]").count()) hallazgo("sale «¿Cómo se hace?» sin videos");
  await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  if (await admin.locator("[data-videos-para-empezar]").count()) hallazgo("sale la tarjeta de videos sin videos publicados");
  else bien("sin videos: «Estamos preparando los videos», sin botón ni tarjeta");

  console.log("\n2. Con videos publicados");
  for (const n of ["01", "02", "04", "21", "07", "10", "44"]) await publicar(n, { ...ARCH });
  await admin.goto(`${BASE}/ayuda`, { waitUntil: "networkidle" });
  const seccion = await admin.locator("[data-seccion-videos]").innerText();
  if (!seccion.includes("Recorre PeluDesk") || !seccion.includes("Ver todos (7)")) hallazgo(`la sección Videos de Ayuda no lista los 7: ${seccion.slice(0, 200)}`);
  await sinDesborde(admin, "Ayuda");
  await admin.goto(`${BASE}/ayuda/videos`, { waitUntil: "networkidle" });
  const lista = await admin.locator("main, body").first().innerText();
  if (!lista.includes("Empieza aquí") || !lista.includes("Estética") || !lista.includes("Agenda una cita de estética")) hallazgo("la lista no agrupa por área");
  await sinDesborde(admin, "lista de Videos");
  await admin.locator('[data-video="04"]').click();
  await admin.waitForURL(/\/ayuda\/videos\/el-tablero-del-dia/, { timeout: 20_000 });
  const video = admin.locator("[data-reproductor-tutorial] video");
  await video.waitFor();
  const info = await video.evaluate((v) => ({ fuente: v.querySelector("source")?.getAttribute("src"), pista: v.querySelector("track")?.getAttribute("srclang"), poster: v.getAttribute("poster"), controles: v.controls }));
  if (!info.fuente?.endsWith("video-720p.mp4") || info.pista !== "es-MX" || !info.poster || !info.controles) hallazgo(`el reproductor no trae video, subtítulos es-MX, póster y controles: ${JSON.stringify(info)}`);
  await admin.waitForTimeout(1500);
  const listo = await video.evaluate((v) => v.readyState);
  if (listo < 1) hallazgo(`el navegador no cargó el MP4 (readyState ${listo})`);
  await admin.getByRole("button", { name: "1.5×" }).click();
  if ((await video.evaluate((v) => v.playbackRate)) !== 1.5) hallazgo("el control de velocidad no cambia la velocidad");
  else bien("el reproductor trae el MP4, subtítulos es-MX, póster y velocidad 1.5×");
  const ancho = await admin.locator("[data-reproductor-tutorial] .aspect-video").boundingBox();
  if (!ancho || ancho.width > 390) hallazgo("el reproductor se sale del celular");
  await sinDesborde(admin, "reproductor");
  const textoVideo = await admin.locator("body").innerText();
  if (!textoVideo.includes("Si prefieres leerlo") || !textoVideo.includes("Cómo leer el tablero")) hallazgo("el video no enlaza al artículo relacionado");
  if (!(await admin.locator("[data-siguiente-video]").count())) hallazgo("el video no tiene «Siguiente video»");
  else bien("artículos relacionados y «Siguiente video»");
  const noDeAdmin = await admin.goto(`${BASE}/ayuda/videos/permisos-extra-a-recepcion`, { waitUntil: "networkidle" });
  if (noDeAdmin?.status() !== 404) hallazgo(`un video no publicado abre (${noDeAdmin?.status()})`);

  console.log("\n3. «¿Cómo se hace?», tarjeta de inicio y Bienvenida");
  await admin.goto(`${BASE}/estetica/nueva`, { waitUntil: "networkidle" });
  const boton = admin.locator("[data-boton-video]");
  if ((await boton.count()) !== 1 || (await boton.getAttribute("data-boton-video")) !== "agenda-una-cita-de-estetica") hallazgo("«¿Cómo se hace?» no apunta al video de Estética");
  else {
    const caja = await boton.boundingBox();
    if (!caja || caja.width < 40 || caja.height < 40) hallazgo("«¿Cómo se hace?» es muy chico para un dedo");
    await boton.click();
    await admin.waitForURL(/\/ayuda\/videos\/agenda-una-cita-de-estetica/, { timeout: 20_000 });
    bien("«¿Cómo se hace?» (junto al «?») lleva al video de la pantalla");
  }
  await admin.goto(`${BASE}/caja`, { waitUntil: "networkidle" });
  if (await admin.locator("[data-boton-video]").count()) hallazgo("«¿Cómo se hace?» sale en una pantalla sin video");
  await admin.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  const tarjeta = admin.locator("[data-videos-para-empezar]");
  const tTarjeta = (await tarjeta.count()) ? await tarjeta.innerText() : "";
  if (!tTarjeta.includes("Recorre PeluDesk") || !tTarjeta.includes("Tus primeros cinco pasos") || !tTarjeta.includes("El tablero del día")) hallazgo(`la tarjeta de inicio de admin no trae los tres videos: ${tTarjeta.slice(0, 160)}`);
  await sinDesborde(admin, "inicio de admin");
  await recep.goto(`${BASE}/recepcion`, { waitUntil: "networkidle" });
  if (!(await recep.locator("[data-videos-para-empezar]").count())) hallazgo("recepción no ve la tarjeta de videos en su inicio");
  await sinDesborde(recep, "inicio de recepción");
  await recep.getByRole("button", { name: "Ocultar" }).click();
  await recep.reload({ waitUntil: "networkidle" });
  if (await recep.locator("[data-videos-para-empezar]").count()) hallazgo("«Ocultar» no se acuerda al recargar");
  else bien("la tarjeta sale en admin y recepción, y «Ocultar» se acuerda");
  await recep.evaluate(() => localStorage.removeItem("pd-videos-inicio-oculto"));
  await admin.goto(`${BASE}/bienvenida`, { waitUntil: "networkidle" });
  const enlaces = await admin.locator("[data-video-paso]").count();
  if (enlaces < 2) hallazgo(`Bienvenida solo trae ${enlaces} «Ver cómo se hace»`);
  if (!(await admin.locator("[data-videos-para-empezar]").count())) hallazgo("Bienvenida no trae la tarjeta de videos");
  else bien(`Bienvenida: ${enlaces} pasos con su video y la tarjeta`);
  await sinDesborde(admin, "Bienvenida");

  console.log("\n4. Quién ve qué");
  const antesModulos = previas.find((p) => p.numero === "02").modulos;
  await A.from("tutoriales").update({ modulos: ["modulo_que_no_existe"] }).eq("numero", "02");
  await admin.goto(`${BASE}/ayuda/videos`, { waitUntil: "networkidle" });
  if (await admin.locator('[data-video="02"]').count()) hallazgo("un video de un módulo que el negocio no tiene sale en la lista");
  else bien("un video de un módulo que el negocio no tiene no sale");
  await A.from("tutoriales").update({ modulos: antesModulos }).eq("numero", "02");
  await publicar("20", { ...ARCH });
  await recep.goto(`${BASE}/ayuda/videos`, { waitUntil: "networkidle" });
  if (await recep.locator('[data-video="20"]').count()) hallazgo("recepción sin permisos ve un video de admin");
  await rpcAdmin("otorgar_permiso", { p_profile_id: recId, p_permiso: "tarifas" });
  await recep.goto(`${BASE}/ayuda/videos`, { waitUntil: "networkidle" });
  if (!(await recep.locator('[data-video="20"]').count())) hallazgo("recepción con un permiso del video no lo ve");
  else bien("el video de admin: recepción lo ve solo con alguno de sus permisos");
  await rpcAdmin("revocar_permiso", { p_profile_id: recId, p_permiso: "tarifas" });
  await admin.goto(`${BASE}/ayuda/videos`, { waitUntil: "networkidle" });
  if (!(await admin.locator('[data-video="20"]').count())) hallazgo("admin no ve un video de admin");

  console.log("\n5. YouTube");
  await A.rpc("plataforma_tutorial_youtube", { p_numero: "04", p_youtube_id: "dQw4w9WgXcQ" });
  await admin.goto(`${BASE}/ayuda/videos/el-tablero-del-dia`, { waitUntil: "networkidle" });
  const iframe = await admin.locator("iframe").getAttribute("src");
  if (!iframe?.startsWith("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")) hallazgo(`con id de YouTube el reproductor no es el de youtube-nocookie: ${iframe}`);
  else bien("con id de YouTube: reproductor youtube-nocookie");
  await A.rpc("plataforma_tutorial_youtube", { p_numero: "04", p_youtube_id: "" });

  console.log("\n6. Página pública");
  const ctxP = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pub = await ctxP.newPage();
  await pub.goto(`${BASE_PLAT}/ayuda/videos/el-tablero-del-dia`, { waitUntil: "networkidle" });
  if (!(await pub.locator("[data-reproductor-tutorial] video").count())) hallazgo("la página pública no trae el reproductor");
  if (/\/login/.test(pub.url())) hallazgo("la página pública mandó a login");
  await sinDesborde(pub, "página pública del video");
  const r404 = await pub.goto(`${BASE_PLAT}/ayuda/videos/permisos-extra-a-recepcion`, { waitUntil: "networkidle" });
  if (r404?.status() !== 404) hallazgo(`la página pública abre un video no publicado (${r404?.status()})`);
  await pub.goto(`${BASE_PLAT}/ayuda/videos`, { waitUntil: "networkidle" });
  const textoLista = await pub.locator("body").innerText();
  if (!textoLista.includes("Recorre PeluDesk") || textoLista.includes("permisos extra")) hallazgo("la lista pública no muestra solo lo publicado");
  else bien("la página pública sirve solo lo publicado, sin sesión");
  const enNegocio = await pub.goto(`${BASE}/ayuda/videos/el-tablero-del-dia`, { waitUntil: "networkidle" });
  if (!/login/.test(pub.url()) && enNegocio?.status() === 200) hallazgo("en el dominio de un negocio, la página de videos abre sin sesión");

  console.log("\n7. Administración de la plataforma");
  const { data: platId } = await A.rpc("usuario_por_email", { p_email: "plataforma@peludesk.prueba" });
  const ctxPl = await nav.newContext({ viewport: { width: 390, height: 844 } });
  await ctxPl.addCookies(await cookiesDe(platId, "plataforma.localhost"));
  const pl = await ctxPl.newPage();
  await pl.goto(`${BASE_PLAT}/plataforma/tutoriales`, { waitUntil: "networkidle" });
  const tp = await pl.locator("body").innerText();
  if (!tp.includes("Paquete para YouTube") || !tp.includes("Datos del canal de YouTube") || !tp.includes("Recorre PeluDesk")) hallazgo(`/plataforma/tutoriales no trae el paquete, el canal y la lista: ${tp.slice(0, 160)}`);
  await sinDesborde(pl, "/plataforma/tutoriales");
  const pedir = (pagina, ruta) => pagina.evaluate(async (u) => { const r = await fetch(u, { redirect: "manual" }); return { status: r.status, tipo: r.headers.get("content-type") ?? "", cuerpo: r.type === "opaqueredirect" ? "" : await r.text() }; }, `${BASE_PLAT}${ruta}`);
  const csv = await pedir(pl, "/plataforma/tutoriales/youtube.csv");
  if (csv.status !== 200 || !csv.tipo.includes("text/csv") || !csv.cuerpo.includes("archivo_video") || !csv.cuerpo.includes("01-recorre-peludesk-por-primera-vez.mp4")) hallazgo(`youtube.csv no sale bien (${csv.status})`);
  const urls = await pedir(pl, "/plataforma/tutoriales/urls.txt");
  if (urls.status !== 200) hallazgo(`urls.txt no sale (${urls.status})`);
  else bien("la plataforma ve la lista, los datos del canal, youtube.csv y urls.txt");
  const anon = await (await nav.newContext()).newPage();
  await anon.goto(`${BASE_PLAT}/ayuda`, { waitUntil: "domcontentloaded" });
  const sinSesion = await pedir(anon, "/plataforma/tutoriales/youtube.csv");
  if (sinSesion.status === 200) hallazgo("youtube.csv sale sin sesión de la plataforma");
  const conNegocio = await (await nav.newContext()).newPage();
  await conNegocio.context().addCookies(await cookiesDe(datos.adminB, "plataforma.localhost"));
  await conNegocio.goto(`${BASE_PLAT}/ayuda`, { waitUntil: "domcontentloaded" });
  const deNegocio = await pedir(conNegocio, "/plataforma/tutoriales/youtube.csv");
  if (deNegocio.status === 200) hallazgo("youtube.csv sale con la sesión de un admin de negocio");
  else bien("sin sesión de la plataforma (o con la de un negocio), no sale nada");
} catch (e) {
  hallazgo(`la prueba tronó: ${e.message}`);
} finally {
  await nav.close();
  for (const f of previas) {
    await A.from("tutoriales").update({ publicado: f.publicado, estado: f.estado, video_path: f.video_path, poster_path: f.poster_path, vtt_path: f.vtt_path, youtube_id: f.youtube_id, modulos: f.modulos, duracion_s: f.duracion_s, version: 1 }).eq("numero", f.numero);
  }
  await A.storage.from("tutoriales").remove(["zz-ui/video-720p.mp4", "zz-ui/poster.jpg", "zz-ui/subtitulos.es-MX.vtt"]);
  await rpcAdmin("revocar_permiso", { p_profile_id: recId, p_permiso: "tarifas" });
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nSin hallazgos en pantalla.");
process.exit(hallazgos.length ? 1 : 0);
