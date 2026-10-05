// Videos tutoriales: acceso y aislamiento (SOLO DESARROLLO).
//
//   node scripts/auditoria/tutoriales.mjs
//
// JWT real de cada rol + llave anónima:
//   1. Anónimo: no lee `tutoriales`, `tutoriales_progreso` ni `avisos_operador`,
//      ni ejecuta ninguna función nueva.
//   2. El personal de un negocio (admin y recepción) solo lee lo PUBLICADO; el
//      cliente (dueño de un perro) no lee nada; la plataforma lo ve todo.
//   3. Nadie con sesión escribe: ni insertar, ni cambiar, ni borrar, ni
//      sincronizar, ni publicar; el id de YouTube solo lo pone la plataforma y
//      se valida.
//   4. progreso y avisos: solo la plataforma los lee; solo el servidor los escribe.
//   5. Storage: el bucket público sirve sus archivos; el privado (masters) no.
//   6. El asistente: recomienda a lo más UN video, y solo uno que esta persona
//      puede ver (`procesarRespuesta`).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const cab = (token, negocio = B) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), "x-negocio-id": negocio, "Content-Type": "application/json", Prefer: "return=representation" });
const llamar = async (url, opciones) => {
  const r = await fetch(url, opciones);
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : "") };
};
const get = (token, ruta) => llamar(`${URL}/rest/v1/${ruta}`, { headers: cab(token) });
const rpc = (token, fn, args = {}) => llamar(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token), body: JSON.stringify(args) });
const escribir = (token, metodo, ruta, cuerpo) => llamar(`${URL}/rest/v1/${ruta}`, { method: metodo, headers: cab(token), body: cuerpo ? JSON.stringify(cuerpo) : undefined });

const tAdmin = await tokenDe(datos.adminB);
const { data: recId } = await A.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
const tRecep = await tokenDe(recId);
const tCliente = await tokenDe(datos.cuentaSoloB);
const { data: platId } = await A.rpc("usuario_por_email", { p_email: "plataforma@peludesk.prueba" });
const tPlat = await tokenDe(platId);

// Dos filas: una publicada y una no (el catálogo ya está sincronizado).
const { data: filas } = await A.from("tutoriales").select("numero, publicado, estado, video_path").is("deleted_at", null).order("orden");
if (!filas?.length) throw new Error("Falta sincronizar el catálogo: node scripts/tutoriales/sincronizar.mjs");
const antes = new Map(filas.map((f) => [f.numero, f]));
await A.rpc("plataforma_tutorial_publicar", { p: { numero: "04", video_path: "04-prueba/video-720p.mp4", estado: "listo_sin_voz", publicado: true } });
await A.rpc("plataforma_tutorial_publicar", { p: { numero: "05", publicado: false } });

try {
  console.log("── 1. Anónimo");
  for (const t of ["tutoriales", "tutoriales_progreso", "avisos_operador"]) {
    const r = await get(null, `${t}?select=*`);
    if (r.ok && r.cuerpo.length) hallazgo(`anónimo lee ${t}: ${r.cuerpo.length} fila(s)`);
  }
  for (const [fn, args] of [
    ["plataforma_tutoriales_sincronizar", { p_filas: [] }], ["plataforma_tutorial_publicar", { p: { numero: "04" } }], ["plataforma_tutorial_youtube", { p_numero: "04", p_youtube_id: "" }],
    ["tutoriales_progreso_guardar", { p: { numero: "04" } }], ["plataforma_aviso_encolar", { p_texto: "x" }], ["avisos_tomar", { p_limite: 1 }], ["avisos_marcar", { p_id: "00000000-0000-0000-0000-000000000000", p_ok: true, p_error: null }],
  ]) {
    const r = await rpc(null, fn, args);
    if (r.ok) hallazgo(`anónimo ejecutó ${fn}`);
  }
  bien("anónimo: nada se lee y ninguna función se ejecuta");

  console.log("\n── 2. Quién lee qué");
  for (const [quien, token] of [["admin", tAdmin], ["recepción", tRecep]]) {
    const r = await get(token, "tutoriales?select=numero,publicado");
    const nums = (r.cuerpo ?? []).map((x) => x.numero);
    if (!r.ok || !nums.includes("04") || nums.includes("05") || (r.cuerpo ?? []).some((x) => !x.publicado)) hallazgo(`${quien} debía ver solo lo publicado: ${JSON.stringify(nums.slice(0, 8))}`);
    else bien(`${quien}: ve lo publicado (${nums.length}) y no lo que no lo está`);
  }
  const rc = await get(tCliente, "tutoriales?select=numero");
  if (rc.ok && rc.cuerpo.length) hallazgo("el cliente (dueño de un perro) lee tutoriales");
  else bien("el cliente no lee tutoriales");
  const rp = await get(tPlat, "tutoriales?select=numero");
  if (!rp.ok || rp.cuerpo.length < filas.length) hallazgo(`la plataforma debía ver todo (${filas.length}) y ve ${rp.cuerpo?.length}`);
  else bien(`la plataforma ve todo (${rp.cuerpo.length})`);

  console.log("\n── 3. Escritura");
  for (const [quien, token] of [["admin", tAdmin], ["recepción", tRecep], ["cliente", tCliente]]) {
    const ins = await escribir(token, "POST", "tutoriales", { numero: "99", slug: `zz-${quien}`, area: "x", orden: 99, titulo: "x" });
    if (ins.ok) hallazgo(`${quien} insertó un tutorial`);
    const upd = await escribir(token, "PATCH", "tutoriales?numero=eq.04", { titulo: "hackeado" });
    if (upd.ok && upd.cuerpo.length) hallazgo(`${quien} cambió un tutorial`);
    const del = await escribir(token, "DELETE", "tutoriales?numero=eq.04");
    if (del.ok && del.cuerpo.length) hallazgo(`${quien} borró un tutorial`);
    for (const [fn, args] of [["plataforma_tutoriales_sincronizar", { p_filas: [] }], ["plataforma_tutorial_publicar", { p: { numero: "04", publicado: true } }], ["plataforma_tutorial_youtube", { p_numero: "04", p_youtube_id: "dQw4w9WgXcQ" }], ["tutoriales_progreso_guardar", { p: { numero: "04" } }], ["plataforma_aviso_encolar", { p_texto: "x" }], ["avisos_tomar", { p_limite: 1 }]]) {
      if ((await rpc(token, fn, args)).ok) hallazgo(`${quien} ejecutó ${fn}`);
    }
  }
  const { data: igual } = await A.from("tutoriales").select("titulo").eq("numero", "04").single();
  if (igual.titulo === "hackeado") hallazgo("el título de un tutorial quedó cambiado");
  else bien("admin, recepción y cliente no insertan, cambian, borran ni ejecutan funciones de la plataforma");
  const malo = await rpc(tPlat, "plataforma_tutorial_youtube", { p_numero: "04", p_youtube_id: "no es un id" });
  if (malo.ok) hallazgo("la plataforma guardó un id de YouTube inválido");
  const bueno = await rpc(tPlat, "plataforma_tutorial_youtube", { p_numero: "04", p_youtube_id: "dQw4w9WgXcQ" });
  if (!bueno.ok) hallazgo(`la plataforma no pudo guardar un id válido: ${bueno.mensaje}`);
  else {
    const { data: t4 } = await A.from("tutoriales").select("youtube_id").eq("numero", "04").single();
    if (t4.youtube_id !== "dQw4w9WgXcQ") hallazgo("el id de YouTube no quedó guardado");
    else bien("solo la plataforma pone el id de YouTube, y se valida (11 caracteres)");
    await rpc(tPlat, "plataforma_tutorial_youtube", { p_numero: "04", p_youtube_id: "" });
  }
  const sync = await rpc(tPlat, "plataforma_tutoriales_sincronizar", { p_filas: [] });
  if (!sync.ok) hallazgo(`la plataforma no pudo sincronizar: ${sync.mensaje}`);

  console.log("\n── 4. Progreso y avisos");
  await A.rpc("tutoriales_progreso_guardar", { p: { numero: "04", estado: "grabado", intentos: 1 } });
  const { data: av } = await A.rpc("plataforma_aviso_encolar", { p_texto: "prueba de auditoría" });
  for (const [quien, token] of [["admin", tAdmin], ["recepción", tRecep], ["cliente", tCliente]]) {
    for (const t of ["tutoriales_progreso", "avisos_operador"]) {
      const r = await get(token, `${t}?select=*`);
      if (r.ok && r.cuerpo.length) hallazgo(`${quien} lee ${t}`);
    }
  }
  for (const t of ["tutoriales_progreso", "avisos_operador"]) {
    const r = await get(tPlat, `${t}?select=*`);
    if (!r.ok || !r.cuerpo.length) hallazgo(`la plataforma no lee ${t}`);
  }
  const tomados = await A.rpc("avisos_tomar", { p_limite: 50 });
  const mio = (tomados.data ?? []).find((x) => x.id === av);
  if (!mio) hallazgo("avisos_tomar no entregó el aviso encolado");
  else {
    const otra = await A.rpc("avisos_tomar", { p_limite: 50 });
    if ((otra.data ?? []).some((x) => x.id === av)) hallazgo("un aviso tomado se entregó dos veces (sin bloqueo)");
    await A.rpc("avisos_marcar", { p_id: av, p_ok: true, p_error: null });
    const despues = await A.rpc("avisos_tomar", { p_limite: 50 });
    if ((despues.data ?? []).some((x) => x.id === av)) hallazgo("un aviso enviado se volvió a entregar");
    else bien("la cola de avisos: se toma una vez, se marca enviado y no vuelve");
  }
  await A.from("avisos_operador").delete().eq("id", av);
  await A.from("tutoriales_progreso").delete().eq("numero", "04");
  bien("progreso y avisos: solo la plataforma los lee; solo el servidor los escribe");

  console.log("\n── 5. Storage");
  const archivo = Buffer.from("00000000");
  await A.storage.from("tutoriales").upload("zz-auditoria/prueba.vtt", Buffer.from("WEBVTT\n"), { contentType: "text/vtt", upsert: true });
  await A.storage.from("tutoriales-masters").upload("zz-auditoria/prueba.txt", archivo, { contentType: "text/plain", upsert: true });
  const pub = await fetch(`${URL}/storage/v1/object/public/tutoriales/zz-auditoria/prueba.vtt`);
  if (!pub.ok) hallazgo(`el bucket público no sirve su archivo (${pub.status})`);
  const priv = await fetch(`${URL}/storage/v1/object/public/tutoriales-masters/zz-auditoria/prueba.txt`);
  if (priv.ok) hallazgo("el bucket de masters sirve archivos sin firma");
  const privAuth = await llamar(`${URL}/storage/v1/object/authenticated/tutoriales-masters/zz-auditoria/prueba.txt`, { headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${tAdmin}` } });
  if (privAuth.ok) hallazgo("un admin de negocio lee un master con su JWT");
  const subida = await llamar(`${URL}/storage/v1/object/tutoriales/zz-auditoria/hack.vtt`, { method: "POST", headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${tAdmin}`, "Content-Type": "text/vtt" }, body: "WEBVTT" });
  if (subida.ok) hallazgo("un admin de negocio subió un archivo al bucket público");
  else bien("el público sirve sus archivos; los masters no se leen sin firma; nadie con sesión sube");
  await A.storage.from("tutoriales").remove(["zz-auditoria/prueba.vtt", "zz-auditoria/hack.vtt"]);
  await A.storage.from("tutoriales-masters").remove(["zz-auditoria/prueba.txt"]);

  console.log("\n── 6. El asistente recomienda un video");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asistente-"));
  for (const f of ["asistente", "tipos"]) {
    const js = ts.transpileModule(fs.readFileSync(`src/lib/ayuda/${f}.ts`, "utf8"), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replaceAll('"./tipos"', '"./tipos.mjs"');
    fs.writeFileSync(path.join(dir, `${f}.mjs`), js);
  }
  const { procesarRespuesta, promptVariable } = await import(path.join(dir, "asistente.mjs"));
  const videos = new Map([["04", { slug: "el-tablero-del-dia", titulo: "El tablero del día" }]]);
  const permitidos = new Set(["leer-el-tablero-del-dia"]);
  const r1 = procesarRespuesta("Mira el tablero.\n[[articulo:leer-el-tablero-del-dia]]\n[[video:04]]", permitidos, videos);
  if (r1.video?.slug !== "el-tablero-del-dia" || r1.texto.includes("[[")) hallazgo(`el video citado no salió o quedó la marca: ${JSON.stringify(r1)}`);
  const r2 = procesarRespuesta("Listo.\n[[articulo:leer-el-tablero-del-dia]]\n[[video:99]]", permitidos, videos);
  if (r2.video) hallazgo("el asistente recomendó un video que esta persona no puede ver");
  const r3 = procesarRespuesta("Listo.\n[[articulo:leer-el-tablero-del-dia]]\n[[video:99]]\n[[video:04]]", permitidos, new Map([...videos, ["99", { slug: "otro", titulo: "Otro" }]]));
  if (r3.video?.slug !== "otro") hallazgo("con dos videos citados debía quedarse con el primero que existe");
  const r4 = procesarRespuesta("Sin cita.\n[[video:04]]", permitidos, videos);
  if (!r4.sinRespuesta) hallazgo("una respuesta con solo un video (sin artículo) debía contar como sin respuesta");
  const pv = promptVariable({ negocio: "X", rol: "admin", modulos: [], pantalla: null, hoy: "hoy", videos: [{ numero: "04", titulo: "El tablero del día", articulos: ["leer-el-tablero-del-dia"] }] });
  if (!pv.includes("VIDEOS DISPONIBLES") || !pv.includes("04: El tablero del día")) hallazgo("el prompt no lista los videos disponibles");
  if (!hallazgos.length) bien("un solo video, solo de la lista de esta persona; sin cita de artículo no hay respuesta");
} finally {
  for (const [numero, f] of antes) {
    await A.rpc("plataforma_tutorial_publicar", { p: { numero, publicado: f.publicado, estado: f.estado } });
  }
  await A.from("tutoriales").update({ video_path: null }).eq("numero", "04").is("youtube_id", null);
  await A.from("tutoriales").update({ version: 1 }).eq("numero", "04");
}
console.log(hallazgos.length ? `\n${hallazgos.length} HALLAZGO(S)` : "\nTODO BIEN");
process.exit(hallazgos.length ? 1 : 0);
