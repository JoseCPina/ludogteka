// Uso: AUDITORIA_NEGOCIO_ID=<id de Huellitas> node scripts/auditoria/reportes-publico-dev.mjs   (SOLO DESARROLLO, Huellitas; servidor en :3001)
//
// Las ligas públicas /r/<token> y /f/<token> y la tarea de borrado:
//   · liga buena, falsa, vencida y de OTRO negocio (el mismo token contra
//     Ludogteka): solo la buena entrega algo;
//   · el HTML no trae teléfono ni nombre del dueño, ni precios, ni otros perros;
//   · ejecutarRetencion con el reloj inyectado borra lo vencido y NO lo vigente.
// Deja capturas en %TEMP%\publico-*.png.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { prepararHuellitas } from "./reportes-datos-dev.mjs";
import { comoPersona, PUERTO, servicioEn } from "./reportes-sesion-dev.mjs";
import { createHash, randomBytes } from "node:crypto";
import { abrirNavegador } from "../lib/navegador.mjs";

const BUCKET = "reportes-archivos";
let fallos = 0;
const bien = (m) => console.log(`  ✔ ${m}`);
const mal = (m) => {
  fallos++;
  console.log(`  ✘ ${m}`);
};
const exigir = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};
const nuevoToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
};
const pedir = (host, ruta) =>
  new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PUERTO, path: ruta, headers: { host: `${host}:${PUERTO}` } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve({ status: res.statusCode, cuerpo: d, cabeceras: res.headers }));
    }).on("error", reject);
  });
const HUE = "huellitas.localhost";
const LUD = "localhost";

const d = await prepararHuellitas();
const SH = servicioEn(d.H);
const REC = await comoPersona(d.recepcionB, d.H);
const admin = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });

// ── Un reporte con tarjeta y su liga ──
const resp = { estado_general: { opciones: ["activo"] }, resumen: { opciones: ["buen_dia"] }, recomendaciones: { opciones: [], texto: "Más paseos largos ZZPUBLICO" } };
const g = exigir(await REC.rpc("reporte_guardar", { p_perro_id: d.firulais, p_respuestas: resp, p_estado: "listo" }), "reporte_guardar");
const tarjeta = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#e8f6f6" } }).jpeg().toBuffer();
const rutaTarjeta = `${d.H}/tarjetas/${g.id}/${Date.now()}-prueba.jpg`;
exigir(await admin.storage.from(BUCKET).upload(rutaTarjeta, tarjeta, { contentType: "image/jpeg" }), "subir tarjeta");
await REC.rpc("reporte_registrar_tarjeta", { p_reporte_id: g.id, p_path: rutaTarjeta, p_bytes: tarjeta.length }).then((r) => exigir(r, "registrar tarjeta"));
const r1 = nuevoToken();
exigir(await REC.rpc("reporte_crear_enlace", { p_reporte_id: g.id, p_hash: r1.hash }), "crear enlace");

// ── Una galería con una foto y un video ──
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pub-"));
const mp4 = path.join(tmp, "v.mp4");
execFileSync("ffmpeg", ["-y", "-f", "lavfi", "-i", "testsrc=size=320x240:rate=15:duration=2", "-pix_fmt", "yuv420p", mp4], { stdio: "ignore" });
async function subir(tipo, mime, bytes) {
  const p = exigir(await REC.rpc("media_preparar", { p_perro_id: d.firulais, p_tipo: tipo, p_mime: mime }), "media_preparar");
  exigir(await admin.storage.from(BUCKET).upload(p.path, bytes, { contentType: mime }), "subir media");
  exigir(await REC.rpc("media_confirmar", { p_id: p.id, p_bytes: bytes.length, p_duracion: tipo === "video" ? 2 : null }), "media_confirmar");
  return p;
}
const foto = await subir("foto", "image/jpeg", await sharp({ create: { width: 800, height: 600, channels: 3, background: "#f5b82e" } }).jpeg().toBuffer());
const video = await subir("video", "video/mp4", fs.readFileSync(mp4));
const f1 = nuevoToken();
const gal = exigir(await REC.rpc("galeria_crear", { p_perro_id: d.firulais, p_media_ids: [foto.id, video.id], p_hash: f1.hash }), "galeria_crear");

// ── Reporte ──
console.log("Liga del reporte");
let r = await pedir(HUE, `/r/${r1.token}`);
if (r.status === 200 && r.cuerpo.includes("Firulais") && r.cuerpo.includes("/storage/v1/object/sign/")) bien("la liga buena muestra al perro y la tarjeta firmada");
else mal(`liga buena: ${r.status}`);
if (/noindex/.test(r.cuerpo) && /noindex/.test(r.cabeceras["x-robots-tag"] ?? "")) bien("noindex en meta y en encabezado");
else mal(`noindex: meta=${/noindex/.test(r.cuerpo)} header=${r.cabeceras["x-robots-tag"]}`);
const dueno = (await SH.from("clientes").select("nombre, telefono").eq("id", (await SH.from("perros").select("cliente_id").eq("id", d.firulais).single()).data.cliente_id).single()).data;
const prohibidos = [dueno.telefono, dueno.nombre, "Canela", "Pelusa", "Bolita", "precio"];
const filtrado = [...prohibidos.filter((p) => r.cuerpo.includes(p)), ...(/\$\s?\d{1,3}(,\d{3})+|\$\s?\d+\.\d{2}|MXN|pesos/.test(r.cuerpo) ? ["un monto en pesos"] : [])];
if (filtrado.length === 0) bien("el HTML no trae teléfono ni nombre del dueño, otros perros ni precios");
else mal(`el HTML trae: ${filtrado.join(", ")}`);
for (const [etiqueta, ruta, host] of [
  ["falsa (43 caracteres)", `/r/${nuevoToken().token}`, HUE],
  ["con mala forma", `/r/abc`, HUE],
  ["de otro negocio (Ludogteka)", `/r/${r1.token}`, LUD],
]) {
  const x = await pedir(host, ruta);
  if (!x.cuerpo.includes("/storage/v1/object/sign/") && !x.cuerpo.includes("Firulais") && x.cuerpo.includes("no está disponible")) bien(`${etiqueta}: mensaje neutral, nada entregado`);
  else mal(`${etiqueta}: ${x.status}`);
}
await SH.from("enlaces_cliente").update({ expira_at: new Date(Date.now() - 1000).toISOString() }).eq("token_hash", r1.hash);
r = await pedir(HUE, `/r/${r1.token}`);
if (r.cuerpo.includes("ya venció") && !r.cuerpo.includes("/storage/v1/object/sign/")) bien("vencida: mensaje de que venció, nada entregado");
else mal("la liga vencida entregó algo");
await SH.from("enlaces_cliente").update({ expira_at: new Date(Date.now() + 5 * 86400000).toISOString() }).eq("token_hash", r1.hash);

// ── Galería ──
console.log("Liga de la galería");
let gr = await pedir(HUE, `/f/${f1.token}`);
if (gr.status === 200 && gr.cuerpo.includes("<video") && gr.cuerpo.includes("Firulais")) bien("la galería trae la foto y el video");
else mal(`galería buena: ${gr.status}`);
if (prohibidos.filter((p) => gr.cuerpo.includes(p)).length === 0) bien("la galería no expone datos del dueño ni de otros perros");
else mal("la galería expone datos");
const xg = await pedir(LUD, `/f/${f1.token}`);
if (!xg.cuerpo.includes("<video") && xg.cuerpo.includes("no está disponible")) bien("galería con token de otro negocio: nada");
else mal("la galería se entregó a otro negocio");
// El token de un reporte no abre una galería ni al revés.
const cruce = await pedir(HUE, `/f/${r1.token}`);
if (!cruce.cuerpo.includes("<video") && !cruce.cuerpo.includes("/storage/v1/object/sign/")) bien("el token de un reporte no abre una galería");
else mal("un token de reporte abrió una galería");
// Un archivo quitado desaparece de la galería.
await REC.rpc("media_quitar", { p_id: video.id });
gr = await pedir(HUE, `/f/${f1.token}`);
if (!gr.cuerpo.includes("<video")) bien("un video quitado ya no sale en la galería");
else mal("un video quitado sigue saliendo");
const sinTodo = nuevoToken();
await REC.rpc("galeria_crear", { p_perro_id: d.firulais, p_media_ids: [foto.id], p_hash: sinTodo.hash }).then((x) => exigir(x, "galería 2"));
await SH.from("media_perro").update({ expira_at: new Date(Date.now() - 60000).toISOString() }).eq("id", foto.id);
gr = await pedir(HUE, `/f/${sinTodo.token}`);
if (gr.cuerpo.includes("ya se borraron")) bien("sin archivos vigentes: mensaje de que ya se borraron");
else mal("galería sin archivos no avisa");
await SH.from("enlaces_cliente").update({ expira_at: new Date(Date.now() - 1000).toISOString() }).eq("token_hash", f1.hash);
gr = await pedir(HUE, `/f/${f1.token}`);
if (gr.cuerpo.includes("ya venció")) bien("galería vencida: mensaje de que venció");
else mal("galería vencida no avisa");

// ── Tarea de borrado ──
console.log("Tarea de borrado (ejecutarRetencion con el reloj movido)");
// retencion.ts es TypeScript con un import relativo sin extensión: se transpila al vuelo.
const ts = (await import("typescript")).default;
const fuente = fs.readFileSync("src/lib/reporte/retencion.ts", "utf8").replace(/import \{ BUCKET_REPORTES \} from "\.\/constantes";/, `const BUCKET_REPORTES = "${BUCKET}";`);
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const archivoRet = path.join(os.tmpdir(), `retencion-${Date.now()}.mjs`);
fs.writeFileSync(archivoRet, js);
const { ejecutarRetencion } = await import("file:///" + archivoRet.split(path.sep).join("/")).catch((e) => (console.log(e.message), {}));
if (!ejecutarRetencion) {
  mal("no se pudo importar retencion.ts (corre con node --experimental-strip-types)");
} else {
  const vigente = await subir("foto", "image/jpeg", await sharp({ create: { width: 100, height: 100, channels: 3, background: "#00aeb1" } }).jpeg().toBuffer());
  const vencida = await subir("foto", "image/jpeg", await sharp({ create: { width: 100, height: 100, channels: 3, background: "#ff0000" } }).jpeg().toBuffer());
  const existe = async (p) => !(await admin.storage.from(BUCKET).download(p)).error;
  await SH.from("media_perro").update({ expira_at: new Date(Date.now() - 60000).toISOString() }).eq("id", vencida.id);
  const res = await ejecutarRetencion(admin);
  const fv = (await SH.from("media_perro").select("estado, vencida_at").eq("id", vencida.id).single()).data;
  const fg = (await SH.from("media_perro").select("estado, vencida_at").eq("id", vigente.id).single()).data;
  if (!(await existe(vencida.path)) && fv.vencida_at && fv.estado === "vencida") bien("el vencido se borró de Storage y la fila quedó marcada");
  else mal("el vencido no se borró o no se marcó");
  if ((await existe(vigente.path)) && !fg.vencida_at && fg.estado === "lista") bien("el vigente NO se tocó");
  else mal("la tarea tocó un archivo vigente");
  const tj = (await SH.from("reportes_guarderia").select("tarjeta_vencida_at, contenido").eq("id", g.id).single()).data;
  if (!tj.tarjeta_vencida_at && (await existe(rutaTarjeta))) bien("la tarjeta vigente no se tocó");
  else mal("la tarea tocó una tarjeta vigente");
  // Reloj 8 días adelante: la tarjeta vence, los datos del reporte se quedan.
  const res2 = await ejecutarRetencion(admin, new Date(Date.now() + 8 * 86400000));
  const tj2 = (await SH.from("reportes_guarderia").select("tarjeta_vencida_at, contenido, estado").eq("id", g.id).single()).data;
  if (tj2.tarjeta_vencida_at && !(await existe(rutaTarjeta)) && tj2.contenido?.secciones?.length) bien("a los 8 días la tarjeta se borra y el contenido del reporte se conserva");
  else mal("la tarjeta vencida no se borró o se perdió el contenido");
  const nuevo = await ejecutarRetencion(admin, new Date(Date.now() + 8 * 86400000));
  if (nuevo.media.revisadas === 0 && nuevo.tarjetas.revisadas === 0) bien("idempotente: la segunda corrida no encuentra nada");
  else mal(`segunda corrida encontró ${JSON.stringify(nuevo)}`);
  console.log(`  (primera: ${JSON.stringify(res)} · reloj +8d: ${JSON.stringify(res2)})`);
  // La liga del reporte con la tarjeta ya borrada.
  await SH.from("enlaces_cliente").update({ expira_at: new Date(Date.now() + 5 * 86400000).toISOString() }).eq("token_hash", r1.hash);
  const rb = await pedir(HUE, `/r/${r1.token}`);
  if (rb.cuerpo.includes("ya venció") && !rb.cuerpo.includes("/storage/v1/object/sign/")) bien("liga con la tarjeta ya borrada: mensaje amable");
  else mal("liga con tarjeta borrada entregó algo");
}
const sc = await pedir("plataforma.localhost", "/api/cron/reportes-archivos");
if (sc.status === 401) bien("la ruta del cron sin secreto responde 401");
else mal(`cron sin secreto: ${sc.status}`);

// ── Capturas ──
console.log("Capturas");
await SH.from("enlaces_cliente").update({ expira_at: new Date(Date.now() + 5 * 86400000).toISOString() }).eq("token_hash", f1.hash);
const nuevaTarjeta = await sharp({ create: { width: 1080, height: 1350, channels: 3, background: "#e8f6f6" } }).jpeg().toBuffer();
const rutaB = `${d.H}/tarjetas/${g.id}/${Date.now()}-b.jpg`;
await admin.storage.from(BUCKET).upload(rutaB, nuevaTarjeta, { contentType: "image/jpeg" });
await REC.rpc("reporte_registrar_tarjeta", { p_reporte_id: g.id, p_path: rutaB, p_bytes: nuevaTarjeta.length });
const foto2 = await subir("foto", "image/jpeg", await sharp({ create: { width: 800, height: 600, channels: 3, background: "#f5b82e" } }).jpeg().toBuffer());
const video2 = await subir("video", "video/mp4", fs.readFileSync(mp4));
const f2 = nuevoToken();
await REC.rpc("galeria_crear", { p_perro_id: d.firulais, p_media_ids: [foto2.id, video2.id], p_hash: f2.hash });
const nav = await abrirNavegador();
for (const [nombre, ancho, alto] of [["390", 390, 844], ["1024", 1024, 768]]) {
  const pag = await (await nav.newContext({ viewport: { width: ancho, height: alto } })).newPage();
  await pag.goto(`http://${HUE}:${PUERTO}/r/${r1.token}`, { waitUntil: "networkidle" });
  await pag.screenshot({ path: path.join(os.tmpdir(), `publico-reporte-${nombre}.png`), fullPage: true });
  await pag.goto(`http://${HUE}:${PUERTO}/f/${f2.token}`, { waitUntil: "networkidle" });
  await pag.screenshot({ path: path.join(os.tmpdir(), `publico-galeria-${nombre}.png`), fullPage: true });
}
await nav.close();
console.log(`  capturas en ${os.tmpdir()}\\publico-*.png`);

console.log(fallos ? `\n${fallos} hallazgo(s)` : "\nSin hallazgos");
process.exit(fallos ? 1 : 0);
void A;
