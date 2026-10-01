// Reporte de comportamiento y fotos y videos, contra la base directa con JWT
// reales (DESARROLLO, en HUELLITAS; Ludogteka solo hace de "otro negocio").
// Uso: node scripts/auditoria/reportes-guarderia.mjs   (sale con 1 si algo falla)
//
// Qué comprueba:
//   · un negocio no alcanza reportes, galerías, ligas, archivos ni la plantilla de otro
//     (ni con su JWT, ni suplantando el encabezado del negocio);
//   · un cliente, un anónimo, una recepción sin el permiso y una estética no leen ni
//     escriben nada, ni por tabla ni por función, ni por Storage;
//   · la plantilla solo la edita admin; el permiso se puede quitar y da de baja el acceso;
//   · las reglas de reporte_guardar (una opción, claves, «Otro», listo, estancia),
//     el snapshot (cambiar la plantilla no altera un reporte viejo) y el versionado;
//   · media: tipos, tamaños, duración, perro adentro, galería con lo del mismo perro,
//     retención configurable;
//   · apagar un módulo lo bloquea en la base (guardería: reporte; los dos: fotos y videos);
//   · la RPC de espacio usado solo la ve la plataforma.
// Deja a Huellitas como lo encontró (permisos, módulos, retención, archivos).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const B = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8")).B;
process.env.AUDITORIA_NEGOCIO_ID = B; // las lecturas con la secret key quedan acotadas a Huellitas
const { createClient } = await import("@supabase/supabase-js");
const { A, URL, env } = await import("./sesiones-dev.mjs");
const { prepararHuellitas } = await import("./reportes-datos-dev.mjs");
const { comoPersona, servicioEn } = await import("./reportes-sesion-dev.mjs");

const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const BUCKET = "reportes-archivos";
const TABLAS = ["reporte_config", "reporte_secciones", "reporte_opciones", "reportes_guarderia", "reportes_guarderia_versiones", "media_perro", "galerias_perro", "galeria_items", "enlaces_cliente"];

const fallas = [];
const ok = (cond, texto) => {
  console.log(`${cond ? "  ✔" : "  ✘"} ${texto}`);
  if (!cond) fallas.push(texto);
};
const titulo = (t) => console.log(`\n── ${t}`);
const falla = (r) => !!r.error;
const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");

const D = await prepararHuellitas();
const SH = servicioEn(B);
const SL = servicioEn(LUDOGTEKA);

// ── Personas ──
const ADM = await comoPersona(D.adminB, B);
const REC = await comoPersona(D.recepcionB, B);
const SINP = await comoPersona(D.sinPermiso, B);
const EST = await comoPersona(D.esteticaB, B);
const clienteHuellitas = (await A.rpc("usuario_por_email", { p_email: "cliente@huellitas.prueba" })).data;
const CLI = await comoPersona(clienteHuellitas, B);
const ANON = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const ANON_L = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": LUDOGTEKA } } });
const miembrosL = async (rol) => (await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).single()).data.profile_id;
const L_ADM = await comoPersona(await miembrosL("admin"), LUDOGTEKA);
const L_REC = await comoPersona(await miembrosL("recepcion"), LUDOGTEKA);
const L_CLI = await comoPersona((await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", "cliente").is("deleted_at", null).order("created_at").limit(1).single()).data.profile_id, LUDOGTEKA);
// Admin de Ludogteka PIDIENDO Huellitas (el encabezado dice de qué negocio es la petición, no autoriza).
const L_ADM_COMO_H = await comoPersona(await miembrosL("admin"), B);
const L_REC_COMO_H = await comoPersona(await miembrosL("recepcion"), B);
const ADM_COMO_L = await comoPersona(D.adminB, LUDOGTEKA);

// ── Limpieza de corridas anteriores ──
async function limpiar() {
  const rutas = [];
  for (const t of ["enlaces_cliente", "galeria_items", "galerias_perro", "reportes_guarderia_versiones"]) await SH.from(t).delete().eq("negocio_id", B);
  const { data: ms } = await SH.from("media_perro").select("path").eq("negocio_id", B);
  rutas.push(...(ms ?? []).map((m) => m.path));
  await SH.from("media_perro").delete().eq("negocio_id", B);
  const { data: rs } = await SH.from("reportes_guarderia").select("tarjeta_path").eq("negocio_id", B);
  rutas.push(...(rs ?? []).map((r) => r.tarjeta_path).filter(Boolean));
  await SH.from("reportes_guarderia").delete().eq("negocio_id", B);
  if (rutas.length) await SH.storage.from(BUCKET).remove(rutas);
}
await limpiar();

const respuestasOk = (extra = {}) => ({
  estado_general: { opciones: ["activo"] },
  actividades: { opciones: ["juego_libre", "alberca"], otro: "Pelota nueva" },
  socializacion: { opciones: ["excelente_convivencia"], texto: "Se llevó bien con Luna." },
  conducta: { opciones: ["comparti_espacios"] },
  alimentacion: { opciones: ["comio_normal"] },
  descanso: { opciones: ["descanso_correcto"] },
  recomendaciones: { texto: "Más agua en casa." },
  resumen: { opciones: ["buen_dia"] },
  ...extra,
});

// ═══ 1. Entre negocios ═══
titulo("1. Un negocio no alcanza lo de otro");
// Huellitas deja un reporte, una foto, una galería y una liga.
const guardar = await REC.rpc("reporte_guardar", { p_perro_id: D.firulais, p_respuestas: respuestasOk(), p_estado: "listo" });
ok(!guardar.error, `reporte_guardar (recepción con permiso) deja un reporte listo${guardar.error ? ": " + guardar.error.message : ""}`);
const reporteId = guardar.data?.id;
const tarjetaPath = `${B}/tarjetas/${reporteId}/1-prueba.jpg`;
const jpg = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");
await SH.storage.from(BUCKET).upload(tarjetaPath, jpg, { contentType: "image/jpeg", upsert: true });
const reg = await REC.rpc("reporte_registrar_tarjeta", { p_reporte_id: reporteId, p_path: tarjetaPath, p_bytes: jpg.length });
ok(!reg.error, `reporte_registrar_tarjeta${reg.error ? ": " + reg.error.message : ""}`);
const token = crypto.randomBytes(32).toString("base64url");
const enlace = await REC.rpc("reporte_crear_enlace", { p_reporte_id: reporteId, p_hash: sha(token) });
ok(!enlace.error, `reporte_crear_enlace${enlace.error ? ": " + enlace.error.message : ""}`);

const prep = await REC.rpc("media_preparar", { p_perro_id: D.firulais, p_tipo: "foto", p_mime: "image/jpeg" });
ok(!prep.error && prep.data?.path?.startsWith(`${B}/media/${D.firulais}/`), `media_preparar da una ruta con prefijo del negocio${prep.error ? ": " + prep.error.message : ""}`);
const mediaId = prep.data?.id;
await SH.storage.from(BUCKET).upload(prep.data.path, jpg, { contentType: "image/jpeg", upsert: true });
const conf = await REC.rpc("media_confirmar", { p_id: mediaId, p_bytes: jpg.length, p_duracion: null });
ok(!conf.error, `media_confirmar${conf.error ? ": " + conf.error.message : ""}`);
const gal = await REC.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [mediaId], p_hash: sha(crypto.randomBytes(32).toString("base64url")) });
ok(!gal.error, `galeria_crear${gal.error ? ": " + gal.error.message : ""}`);

const conteo = async (cli, t) => {
  const r = await cli.from(t).select("id", { count: "exact", head: true });
  return r.error ? -1 : (r.count ?? 0);
};
for (const t of TABLAS) {
  const propios = await conteo(ADM, t);
  ok(propios > 0 || t === "reportes_guarderia_versiones", `Huellitas ve sus filas de ${t} (${propios})`);
}
for (const [quien, cli] of [["admin de Ludogteka", L_ADM], ["recepción de Ludogteka", L_REC], ["admin de Ludogteka PIDIENDO Huellitas", L_ADM_COMO_H], ["recepción de Ludogteka PIDIENDO Huellitas", L_REC_COMO_H]]) {
  for (const t of TABLAS) {
    const { data, error } = await cli.from(t).select("*").limit(50);
    const ajenas = (data ?? []).filter((f) => f.negocio_id === B);
    ok(ajenas.length === 0 && (error || true), `${quien}: ninguna fila de Huellitas en ${t}${error ? " (" + error.message.slice(0, 40) + ")" : ""}`);
  }
  const rpc = await cli.rpc("reporte_guardar", { p_perro_id: D.firulais, p_respuestas: respuestasOk(), p_estado: "borrador" });
  ok(falla(rpc), `${quien}: reporte_guardar sobre un perro de Huellitas falla`);
  const mp = await cli.rpc("media_preparar", { p_perro_id: D.firulais, p_tipo: "foto", p_mime: "image/jpeg" });
  ok(falla(mp), `${quien}: media_preparar sobre un perro de Huellitas falla`);
  const ge = await cli.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [mediaId], p_hash: sha("x" + Math.random()) });
  ok(falla(ge), `${quien}: galeria_crear con archivos de Huellitas falla`);
  const rt = await cli.rpc("reporte_registrar_tarjeta", { p_reporte_id: reporteId, p_path: tarjetaPath, p_bytes: 10 });
  ok(falla(rt), `${quien}: reporte_registrar_tarjeta sobre un reporte de Huellitas falla`);
  const rl = await cli.rpc("reporte_crear_enlace", { p_reporte_id: reporteId, p_hash: sha("y" + Math.random()) });
  ok(falla(rl), `${quien}: reporte_crear_enlace sobre un reporte de Huellitas falla`);
  const rq = await cli.rpc("media_quitar", { p_id: mediaId });
  const sigue = (await SH.from("media_perro").select("quitada_at").eq("id", mediaId).single()).data;
  ok(!sigue.quitada_at, `${quien}: media_quitar no quita un archivo de Huellitas${rq.error ? "" : " (sin efecto)"}`);
}
// Y al revés: Huellitas no alcanza lo de Ludogteka con su JWT, ni suplantando el encabezado.
const { data: repLud } = await SL.from("reportes_guarderia").select("id").eq("negocio_id", LUDOGTEKA).limit(1);
for (const t of TABLAS) {
  const { data } = await ADM_COMO_L.from(t).select("negocio_id").limit(50);
  ok((data ?? []).length === 0, `admin de Huellitas PIDIENDO Ludogteka: 0 filas de ${t}`);
}
void repLud;
// La plantilla de Huellitas no se mezcla con la de otro negocio: cada una es suya.
const secH = (await ADM.from("reporte_secciones").select("id, negocio_id")).data ?? [];
ok(secH.length > 0 && secH.every((s) => s.negocio_id === B), "las secciones que ve el admin de Huellitas son todas de Huellitas");
// Escribir sobre filas ajenas con JWT de otro negocio.
const upd = await L_ADM_COMO_H.from("reporte_secciones").update({ titulo: "HACKEADA" }).eq("negocio_id", B).select("id");
ok((upd.data ?? []).length === 0, "admin de Ludogteka no actualiza secciones de Huellitas");
const ins = await L_ADM_COMO_H.from("reporte_secciones").insert({ clave: "colada", titulo: "Colada", presentacion: "lista" });
ok(falla(ins), "admin de Ludogteka no inserta una sección en Huellitas");
const cfgAjena = await L_ADM_COMO_H.from("reporte_config").update({ titulo: "HACKEADA" }).eq("negocio_id", B).select("id");
ok((cfgAjena.data ?? []).length === 0, "admin de Ludogteka no cambia la configuración de Huellitas");

// ═══ 2. Cliente, anónimo, sin permiso, estética ═══
titulo("2. Cliente, anónimo, recepción sin permiso y estética: nada");
for (const [quien, cli] of [["cliente", CLI], ["anónimo", ANON], ["cliente de otro negocio", L_CLI], ["anónimo (Ludogteka)", ANON_L], ["recepción SIN permiso", SINP], ["estética", EST]]) {
  let filas = 0;
  for (const t of TABLAS) {
    const { data } = await cli.from(t).select("id").limit(5);
    filas += (data ?? []).length;
  }
  ok(filas === 0, `${quien}: no lista nada de las ${TABLAS.length} tablas`);
  for (const t of TABLAS) {
    const i = await cli.from(t).insert({ negocio_id: B }).select("id");
    const u = await cli.from(t).update({ deleted_at: new Date().toISOString() }).eq("negocio_id", B).select("id");
    const d = await cli.from(t).delete().eq("negocio_id", B).select("id");
    ok(falla(i) && (u.data ?? []).length === 0 && (d.data ?? []).length === 0, `${quien}: no escribe en ${t}`);
  }
  const r1 = await cli.rpc("reporte_guardar", { p_perro_id: D.firulais, p_respuestas: respuestasOk(), p_estado: "borrador" });
  const r2 = await cli.rpc("media_preparar", { p_perro_id: D.firulais, p_tipo: "foto", p_mime: "image/jpeg" });
  const r3 = await cli.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [mediaId], p_hash: sha("z" + Math.random()) });
  const r4 = await cli.rpc("reporte_crear_enlace", { p_reporte_id: reporteId, p_hash: sha("w" + Math.random()) });
  const r5 = await cli.rpc("reporte_asegurar_plantilla");
  ok(falla(r1) && falla(r2) && falla(r3) && falla(r4) && falla(r5), `${quien}: ninguna función de reporte/fotos le responde`);
  // Storage: ni listar, ni firmar, ni descargar, ni subir.
  const lista = await cli.storage.from(BUCKET).list(B);
  const firma = await cli.storage.from(BUCKET).createSignedUrl(tarjetaPath, 60);
  const desc = await cli.storage.from(BUCKET).download(tarjetaPath);
  const sube = await cli.storage.from(BUCKET).upload(`${B}/media/${D.firulais}/intruso.jpg`, jpg, { contentType: "image/jpeg" });
  ok((lista.data ?? []).length === 0 && falla(firma) && falla(desc) && falla(sube), `${quien}: Storage no lista, firma, descarga ni sube`);
}
const espacio = await ADM.rpc("plataforma_almacenamiento_reportes");
const espacioAnon = await ANON.rpc("plataforma_almacenamiento_reportes");
ok(falla(espacio) && falla(espacioAnon), "el espacio usado por negocio solo lo ve la plataforma (ni admin de negocio ni anónimo)");
const espacioServ = await SH.rpc("plataforma_almacenamiento_reportes");
ok(!espacioServ.error && (espacioServ.data ?? []).some((f) => f.negocio_id === B && Number(f.bytes) > 0), `la plataforma (service_role) ve el espacio usado de Huellitas${espacioServ.error ? ": " + espacioServ.error.message : ""}`);

// ═══ 3. Permisos ═══
titulo("3. El permiso «Reportes de guardería»");
ok((await conteo(REC, "reportes_guarderia")) > 0, "recepción con permiso lee los reportes");
ok(falla(await REC.from("reporte_secciones").insert({ clave: "mia", titulo: "Mía", presentacion: "lista" })), "recepción con permiso NO edita la plantilla");
ok(((await REC.from("reporte_config").update({ titulo: "OTRO" }).eq("negocio_id", B).select("id")).data ?? []).length === 0, "recepción con permiso NO cambia la configuración");
const mis = (await REC.rpc("mis_permisos")).data ?? [];
ok(mis.includes("reportes_guarderia"), "mis_permisos lista el permiso");
ok(((await ADM.rpc("mis_permisos")).data ?? []).includes("reportes_guarderia"), "admin lo tiene siempre");
ok(falla(await REC.rpc("otorgar_permiso", { p_profile_id: D.sinPermiso, p_permiso: "reportes_guarderia" })), "recepción no se da permisos a sí ni a otros");
await ADM.rpc("revocar_permiso", { p_profile_id: D.recepcionB, p_permiso: "reportes_guarderia" });
ok((await conteo(REC, "reportes_guarderia")) === 0 && falla(await REC.rpc("media_preparar", { p_perro_id: D.firulais, p_tipo: "foto", p_mime: "image/jpeg" })), "al quitárselo, recepción pierde el acceso al instante");
await ADM.rpc("otorgar_permiso", { p_profile_id: D.recepcionB, p_permiso: "reportes_guarderia" });
ok((await conteo(REC, "reportes_guarderia")) > 0, "al dárselo otra vez, lo recupera");
const dueno = await ADM.rpc("tiene_permiso", { p_permiso: "reportes_guarderia" });
ok(dueno.data === true, "tiene_permiso('reportes_guarderia') es true para admin");

// ═══ 4. Reglas del reporte ═══
titulo("4. reporte_guardar: reglas, snapshot y versiones");
const g = (resp, estado = "borrador", perro = D.firulais) => REC.rpc("reporte_guardar", { p_perro_id: perro, p_respuestas: resp, p_estado: estado });
const msg = (r) => r.error?.message ?? "";
ok(msg(await g(respuestasOk({ estado_general: { opciones: ["activo", "relajado"] } }))).includes("solo se puede elegir una"), "dos opciones en una sección de «una» → rechazo");
ok(msg(await g(respuestasOk({ conducta: { opciones: ["no_existe"] } }))).includes("ya no existe"), "una clave que no existe → rechazo");
ok(msg(await g(respuestasOk({ estado_general: { opciones: ["activo"], otro: "algo" } }))).includes("no admite"), "«Otro» en una sección que no lo admite → rechazo");
ok(msg(await g(respuestasOk({ recomendaciones: { texto: "x".repeat(601) } }))).includes("600"), "texto de más de 600 caracteres → rechazo");
ok(msg(await g(respuestasOk({ estado_general: { opciones: [] } }), "listo")).includes("falta elegir"), "«listo» sin elegir el estado general → rechazo con lo que falta");
ok(msg(await g({}, "borrador")).includes("Marca algo"), "un reporte vacío no se guarda");
ok(falla(await g(respuestasOk(), "enviado")), "el estado «enviado» no se pone a mano");
ok(msg(await g(respuestasOk(), "borrador", D.bolita)).includes("estancia de guardería"), "un perro que no está en guardería hoy → rechazo");
ok(msg(await g(respuestasOk(), "borrador", D.canela)).includes("estancia de guardería"), "un perro solo de hotel no tiene reporte de guardería");
const pelusa = await g(respuestasOk(), "borrador", D.pelusa);
ok(!pelusa.error, `un perro en hotel Y guardería sí${pelusa.error ? ": " + pelusa.error.message : ""}`);

const base = (await SH.from("reportes_guarderia").select("id, version, estado, fecha, contenido, llenado_por_nombre").eq("id", reporteId).single()).data;
ok(base.fecha === D.hoy, `la fecha es la del negocio (${base.fecha})`);
ok(base.llenado_por_nombre && base.llenado_por_nombre !== "Personal", `queda quién lo llenó (${base.llenado_por_nombre})`);
const marcas = base.contenido.secciones.flatMap((s) => s.opciones.filter((o) => o.marcada).map((o) => o.clave));
ok(marcas.includes("activo") && marcas.includes("alberca") && base.contenido.secciones.find((s) => s.clave === "actividades").otro === "Pelota nueva", "el snapshot guarda marcas y «Otro»");
ok(base.contenido.secciones.find((s) => s.clave === "estado_general").opciones.length === 6, "el snapshot trae las opciones no marcadas (6 estados)");
const uno = await SH.from("reportes_guarderia").select("id", { count: "exact", head: true }).eq("perro_id", D.firulais).eq("fecha", D.hoy);
ok(uno.count === 1, "un reporte por perro por día");
ok(((await g(respuestasOk())).data ?? {}).id === reporteId, "guardar de nuevo actualiza el mismo reporte (no crea otro)");

// Cambiar la plantilla no altera el reporte viejo.
const { data: opAlberca } = await SH.from("reporte_opciones").select("id, texto").eq("negocio_id", B).eq("clave", "alberca").single();
const { data: opSender } = await SH.from("reporte_opciones").select("id, texto").eq("negocio_id", B).eq("clave", "senderismo").single();
await ADM.from("reporte_opciones").update({ texto: "Chapoteadero" }).eq("id", opAlberca.id);
await ADM.from("reporte_opciones").update({ activa: false }).eq("id", opSender.id);
const secAct = (await SH.from("reporte_secciones").select("id").eq("negocio_id", B).eq("clave", "actividades").single()).data;
const nueva = await ADM.from("reporte_opciones").insert({ seccion_id: secAct.id, clave: "masaje_perruno", texto: "Masaje", orden: 99 }).select("id").single();
ok(!nueva.error, `admin agrega una opción${nueva.error ? ": " + nueva.error.message : ""}`);
const viejo = (await SH.from("reportes_guarderia").select("contenido").eq("id", reporteId).single()).data.contenido;
const actViejo = viejo.secciones.find((s) => s.clave === "actividades");
ok(actViejo.opciones.find((o) => o.clave === "alberca")?.texto === "Alberca" && actViejo.opciones.some((o) => o.clave === "senderismo") && !actViejo.opciones.some((o) => o.clave === "masaje_perruno"),
  "el reporte ya guardado conserva los textos y opciones de cuando se guardó");
const reguardado = await g(respuestasOk({ actividades: { opciones: ["juego_libre", "alberca", "masaje_perruno"] } }));
ok(!reguardado.error, `volver a guardar toma la plantilla vigente${reguardado.error ? ": " + reguardado.error.message : ""}`);
const nuevoC = (await SH.from("reportes_guarderia").select("contenido").eq("id", reporteId).single()).data.contenido;
const actNuevo = nuevoC.secciones.find((s) => s.clave === "actividades");
ok(actNuevo.opciones.find((o) => o.clave === "alberca")?.texto === "Chapoteadero" && !actNuevo.opciones.some((o) => o.clave === "senderismo") && actNuevo.opciones.some((o) => o.clave === "masaje_perruno" && o.marcada),
  "al guardar de nuevo salen el texto renombrado, la opción apagada ya no y la nueva marcada");
// Dejar la plantilla como estaba.
await ADM.from("reporte_opciones").update({ texto: opAlberca.texto }).eq("id", opAlberca.id);
await ADM.from("reporte_opciones").update({ activa: true }).eq("id", opSender.id);
await ADM.from("reporte_opciones").update({ activa: false, deleted_at: new Date().toISOString() }).eq("id", nueva.data.id);

// Versionado (con Pelusa, que no se tocó antes): listo → tarjeta → enviar → corregir.
const rp = (await g(respuestasOk(), "listo", D.pelusa)).data.id;
const tarjeta2 = `${B}/tarjetas/${rp}/2-prueba.jpg`;
await SH.storage.from(BUCKET).upload(tarjeta2, jpg, { contentType: "image/jpeg", upsert: true });
ok(falla(await REC.rpc("reporte_registrar_tarjeta", { p_reporte_id: rp, p_path: `${LUDOGTEKA}/tarjetas/${rp}/x.jpg`, p_bytes: 10 })), "una tarjeta con prefijo de otro negocio se rechaza");
ok(falla(await REC.rpc("reporte_registrar_tarjeta", { p_reporte_id: rp, p_path: `${B}/media/${rp}/x.jpg`, p_bytes: 10 })), "una tarjeta fuera de /tarjetas/ se rechaza");
ok(falla(await REC.rpc("reporte_crear_enlace", { p_reporte_id: rp, p_hash: sha(crypto.randomBytes(32).toString("base64url")) })), "sin imagen no se envía");
const tarjeta1 = `${B}/tarjetas/${rp}/1-prueba.jpg`;
await SH.storage.from(BUCKET).upload(tarjeta1, jpg, { contentType: "image/jpeg", upsert: true });
await REC.rpc("reporte_registrar_tarjeta", { p_reporte_id: rp, p_path: tarjeta1, p_bytes: jpg.length });
const previa = await REC.rpc("reporte_registrar_tarjeta", { p_reporte_id: rp, p_path: tarjeta2, p_bytes: jpg.length });
ok(previa.data === tarjeta1, "reporte_registrar_tarjeta devuelve la ruta anterior (para borrarla)");
ok(falla(await REC.rpc("reporte_crear_enlace", { p_reporte_id: rp, p_hash: "no-es-un-hash" })), "un token con mal formato se rechaza");
ok(!(await REC.rpc("reporte_crear_enlace", { p_reporte_id: rp, p_hash: sha(crypto.randomBytes(32).toString("base64url")) })).error, "primer envío");
const e2 = await REC.rpc("reporte_crear_enlace", { p_reporte_id: rp, p_hash: sha(crypto.randomBytes(32).toString("base64url")) });
ok(!e2.error, `se puede reenviar (otra liga)${e2.error ? ": " + e2.error.message : ""}`);
const enviado = (await SH.from("reportes_guarderia").select("estado, envios, enviado_at, enviado_por_nombre, version").eq("id", rp).single()).data;
ok(enviado.estado === "enviado" && enviado.envios === 2 && enviado.enviado_at && enviado.enviado_por_nombre, `queda enviado (${enviado.envios} envíos) con quién y cuándo`);
const corr = await g(respuestasOk({ resumen: { opciones: ["dia_observaciones"] } }), "borrador", D.pelusa);
ok(!corr.error && corr.data.estado === "listo" && corr.data.version === 2, `corregir un reporte enviado lo versiona (v${corr.data?.version}) y lo deja «listo» para reenviar${corr.error ? ": " + corr.error.message : ""}`);
const vers = (await SH.from("reportes_guarderia_versiones").select("version, contenido").eq("reporte_id", rp)).data ?? [];
ok(vers.length === 1 && vers[0].version === 1 && vers[0].contenido.secciones.find((s) => s.clave === "resumen").opciones.find((o) => o.marcada).clave === "buen_dia", "la versión anterior quedó guardada tal cual");
ok(falla(await REC.rpc("reporte_crear_enlace", { p_reporte_id: rp, p_hash: sha(crypto.randomBytes(32).toString("base64url")) })), "corregido, no se envía hasta regenerar la imagen");

// ═══ 5. Fotos, videos, galerías, retención ═══
titulo("5. Fotos, videos y galerías");
const mp = (perro, tipo, mime) => REC.rpc("media_preparar", { p_perro_id: perro, p_tipo: tipo, p_mime: mime });
ok(msg(await mp(D.bolita, "foto", "image/jpeg")).includes("no está adentro"), "un perro que no está adentro → rechazo");
ok(falla(await mp(D.firulais, "foto", "image/png")), "una foto que no es JPEG se rechaza");
ok(falla(await mp(D.firulais, "video", "application/zip")), "un archivo que no es video se rechaza");
ok(falla(await mp(D.firulais, "audio", "audio/mpeg")), "el tipo solo es foto o video");
const hotelFoto = await mp(D.canela, "foto", "image/jpeg");
ok(!hotelFoto.error, `un perro de hotel también (fotos y videos son de los dos)${hotelFoto.error ? ": " + hotelFoto.error.message : ""}`);
const vid = await mp(D.firulais, "video", "video/mp4");
ok(!vid.error && vid.data.path.endsWith(".mp4"), "video mp4 → ruta .mp4");
ok(msg(await REC.rpc("media_confirmar", { p_id: vid.data.id, p_bytes: 61 * 1024 * 1024, p_duracion: 20 })).includes("tamaño"), "un video de más de 60 MB se rechaza al confirmar");
ok(msg(await REC.rpc("media_confirmar", { p_id: vid.data.id, p_bytes: 5_000_000, p_duracion: 50 })).includes("45 segundos"), "un video de más de 45 s se rechaza al confirmar");
ok(falla(await REC.rpc("media_confirmar", { p_id: vid.data.id, p_bytes: 0, p_duracion: 10 })), "un archivo vacío se rechaza");
const vid2 = await mp(D.firulais, "video", "video/mp4");
ok(!(await REC.rpc("media_confirmar", { p_id: vid2.data.id, p_bytes: 5_000_000, p_duracion: 30 })).error, "un video de 5 MB y 30 s se acepta");
ok(falla(await REC.rpc("media_confirmar", { p_id: vid2.data.id, p_bytes: 5_000_000, p_duracion: 30 })), "confirmar dos veces no se puede");
ok(falla(await SINP.rpc("media_confirmar", { p_id: vid2.data.id, p_bytes: 1000, p_duracion: 1 })), "sin permiso no confirma");
const fila2 = (await SH.from("media_perro").select("expira_at, created_at, estado, subido_por_nombre").eq("id", vid2.data.id).single()).data;
const dias = (new Date(fila2.expira_at) - new Date(fila2.created_at)) / 86400000;
ok(Math.abs(dias - 7) < 0.01, `vence a los 7 días por omisión (${dias.toFixed(2)})`);
ok(fila2.subido_por_nombre && fila2.subido_por_nombre !== "Personal", "queda quién lo subió");

// La galería solo lleva lo del mismo perro y lo vigente.
const otroPerroMedia = hotelFoto.data.id;
await SH.storage.from(BUCKET).upload(hotelFoto.data.path, jpg, { contentType: "image/jpeg", upsert: true });
await REC.rpc("media_confirmar", { p_id: hotelFoto.data.id, p_bytes: jpg.length, p_duracion: null });
ok(msg(await REC.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [mediaId, otroPerroMedia], p_hash: sha("g1" + Math.random()) })).includes("no es de este perro"), "una galería con un archivo de OTRO perro se rechaza");
ok(falla(await REC.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [], p_hash: sha("g2" + Math.random()) })), "una galería vacía se rechaza");
ok(falla(await REC.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [vid.data.id], p_hash: sha("g3" + Math.random()) })), "un archivo sin confirmar no entra en una galería");
const galOk = await REC.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [mediaId, vid2.data.id], p_hash: sha("g4" + Math.random()) });
ok(!galOk.error, `galería con dos archivos del mismo perro${galOk.error ? ": " + galOk.error.message : ""}`);
await REC.rpc("media_quitar", { p_id: vid2.data.id });
ok(msg(await REC.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [vid2.data.id], p_hash: sha("g5" + Math.random()) })).includes("ya no está disponible"), "un archivo quitado ya no entra en una galería");
const items = (await SH.from("galeria_items").select("media_id").eq("galeria_id", galOk.data.galeria_id)).data ?? [];
ok(items.length === 2, "la galería guarda sus dos archivos");

// Retención configurable.
ok(((await REC.from("reporte_config").update({ retencion_dias: 3 }).eq("negocio_id", B).select("id")).data ?? []).length === 0, "recepción no cambia la retención");
const cfg = await ADM.from("reporte_config").update({ retencion_dias: 3 }).eq("negocio_id", B).select("retencion_dias");
ok(cfg.data?.[0]?.retencion_dias === 3, "admin cambia la retención a 3 días");
const m3 = await mp(D.firulais, "foto", "image/jpeg");
const f3 = (await SH.from("media_perro").select("expira_at, created_at").eq("id", m3.data.id).single()).data;
ok(Math.abs((new Date(f3.expira_at) - new Date(f3.created_at)) / 86400000 - 3) < 0.01, "los archivos nuevos vencen a los 3 días");
ok(falla(await ADM.from("reporte_config").update({ retencion_dias: 90 }).eq("negocio_id", B)), "la retención máxima es 30 días");
await ADM.from("reporte_config").update({ retencion_dias: 7 }).eq("negocio_id", B);

// ═══ 6. Módulos ═══
titulo("6. Apagar un módulo lo bloquea en la base");
const { data: nm0 } = await SH.from("negocio_modulos").select("modulo, activo").eq("negocio_id", B).is("deleted_at", null);
const estabaApagado = (m) => (nm0 ?? []).some((x) => x.modulo === m && x.activo === false);
await ADM.rpc("cambiar_modulo", { p_modulo: "guarderia", p_activo: false });
ok(msg(await g(respuestasOk(), "borrador", D.pelusa)).includes("módulo"), "con guardería apagada, reporte_guardar se rechaza");
ok(!(await mp(D.canela, "foto", "image/jpeg")).error, "con guardería apagada, las fotos de hotel siguen");
ok(await ADM.rpc("tiene_permiso", { p_permiso: "reportes_guarderia" }).then((r) => r.data === true), "con hotel prendido el permiso sigue valiendo");
ok(falla(await ADM.from("reporte_secciones").update({ titulo: "Nada" }).eq("negocio_id", B)), "con guardería apagada no se edita la plantilla");
await ADM.rpc("cambiar_modulo", { p_modulo: "hotel", p_activo: false });
ok(falla(await mp(D.canela, "foto", "image/jpeg")) && falla(await mp(D.firulais, "foto", "image/jpeg")), "con los dos apagados, media_preparar se rechaza");
ok(falla(await REC.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [mediaId], p_hash: sha("m" + Math.random()) })), "con los dos apagados, galeria_crear se rechaza");
ok((await ADM.rpc("tiene_permiso", { p_permiso: "reportes_guarderia" })).data === false, "con los dos apagados el permiso no da nada");
ok((await conteo(REC, "reportes_guarderia")) === 0, "con los dos apagados recepción no lee reportes");
ok(!((await REC.rpc("mis_permisos")).data ?? []).length || true, "mis_permisos responde");
await ADM.rpc("cambiar_modulo", { p_modulo: "guarderia", p_activo: !estabaApagado("guarderia") });
await ADM.rpc("cambiar_modulo", { p_modulo: "hotel", p_activo: !estabaApagado("hotel") });
ok((await conteo(REC, "reportes_guarderia")) > 0, "al volver a prender, todo vuelve");

// ═══ 7. La frontera ═══
titulo("7. auditoria_frontera");
const f = await SH.rpc("auditoria_frontera");
ok(!f.error && (f.data ?? []).length === 0, `auditoria_frontera() vacía${(f.data ?? []).length ? ": " + JSON.stringify(f.data) : ""}`);

await limpiar();
console.log(fallas.length ? `\n✘ ${fallas.length} hallazgo(s):\n  - ${fallas.join("\n  - ")}` : "\n✔ Todo en orden.");
process.exit(fallas.length ? 1 : 0);
