// Razas: normalización, propuestas de razas nuevas y grupo de precio sin
// adivinar (SOLO DESARROLLO, en el negocio de prueba Huellitas; nunca
// Ludogteka).
//
//   node scripts/auditoria/negocio-prueba-dev.mjs      (si Huellitas no existe)
//   node scripts/auditoria/razas-dev.mjs
//
// Lo que prueba, con JWT reales:
//   1. La normalización: la función de la base (normalizar_raza) y su gemela
//      de la app (normalizarRaza en src/lib/razas.ts) dan lo MISMO con los
//      mismos textos, y los casos que importan (calupoh / calupo / kalupoh).
//   2. Fuera del catálogo: los perros se agrupan por texto normalizado, con
//      conteo y sugerencias (variante exacta o parecida, con umbral); nada se
//      asigna solo. «Mestizo» (criollo, corriente) es entrada propia.
//   3. «Es esta raza»: reasigna todo el grupo en un paso, guarda el texto
//      original y quién lo hizo, y se deshace (sin tocar al perro que ya
//      cambió de raza por otro camino). Estética no puede.
//   4. Raza nueva: la propone admin (o quien tenga «tarifas»; recepción sin el
//      permiso no), queda ligada a los perros que la usan, no se duplica ni
//      choca con una raza existente; la plataforma aprueba (los perros se
//      ligan solos), aprueba como variante o rechaza con motivo.
//   5. Precio: una raza sin grupo en el negocio NO cotiza con el grupo por
//      defecto: la cita se rechaza con un mensaje claro; con excepción (permiso
//      «excepciones_reserva», grupo y motivo) pasa y queda registrada; con el
//      grupo asignado (permiso «tarifas») pasa normal; reasignar conserva la
//      historia (la fila anterior se da de baja).
//   6. Razas desde el formulario del perro: razas_proponer_formulario (admin y
//      recepción; estética no) con la descripción, el perro ligado, una sola
//      propuesta por nombre, el grupo SOLO con «tarifas» y de ESTE negocio,
//      perro_grupo_raza «sin grupo» con propuesta pendiente (nunca el grupo
//      por defecto), y el grupo del negocio que se vuelve el de la raza al
//      aprobar. Sin sesión y de otro negocio, nada.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { createClient } from "@supabase/supabase-js";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const datos = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const B = datos.B;
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const cab = (token, negocio = B) => ({ apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "x-negocio-id": negocio, "Content-Type": "application/json", Prefer: "return=representation" });
const rpc = async (token, fn, args = {}, negocio = B) => {
  const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: cab(token, negocio), body: JSON.stringify(args) });
  const texto = await r.text();
  let cuerpo = null;
  try { cuerpo = JSON.parse(texto); } catch { cuerpo = texto; }
  return { ok: r.ok, status: r.status, cuerpo, mensaje: cuerpo?.message ?? (typeof cuerpo === "string" ? cuerpo : "") };
};
const una = (c) => (Array.isArray(c) ? c[0] : c);

const tAdmin = await tokenDe(datos.adminB);
const { data: recId } = await A.rpc("usuario_por_email", { p_email: "recepcion@huellitas.prueba" });
const tRecep = await tokenDe(recId);
const tEstetica = await tokenDe(datos.esteticaB);
const { data: plataformaId } = await A.rpc("usuario_por_email", { p_email: "plataforma@peludesk.prueba" });
if (!plataformaId) throw new Error("No hay administrador de plataforma en desarrollo (node scripts/plataforma/agregar-admin.mjs plataforma@peludesk.prueba)");
const tPlat = await tokenDe(plataformaId);

// ── 1. Normalización: la base y la app dicen lo mismo ──
console.log("── 1. Normalización");
const { normalizarRaza } = await import("../../src/lib/razas.ts");
const TEXTOS = [
  "Calupoh", "calupo", "KALUPOH ", "Perro Calupoh", "perra raza calupoh", "  Pastor   Alemán ", "pastores alemanes", "Poodles", "Shih Tzus",
  "Shih-Tzu", "SHITZU", "Bóxer", "boxer.", "Bulldog Francés", "bulldogs franceses", "Labradores", "Schnauzer's", "mi perro es un mestizo", "Criollo!!",
  "Chihuahua (pelo largo)", "Ñoño", "de la raza", "perro", "", "   ", "Yorkies", "Cocker Spaniel inglés", "Pit-bull", "Lhasa Apso", "Spitz Alemán",
];
const ESPERADO = { Calupoh: "calupoh", "KALUPOH ": "kalupoh", "Perro Calupoh": "calupoh", "  Pastor   Alemán ": "pastor aleman", Poodles: "poodle", "Bóxer": "boxer", "Criollo!!": "criollo", "perro": "", "Labradores": "labrador", "pastores alemanes": "pastor aleman" };
let difieren = 0;
for (const t of TEXTOS) {
  const { data: sql } = await A.rpc("normalizar_raza", { p_texto: t });
  const app = normalizarRaza(t);
  if (sql !== app) { hallazgo(`normalizar «${t}»: la base dice «${sql}» y la app «${app}»`); difieren++; }
  if (t in ESPERADO && sql !== ESPERADO[t]) hallazgo(`normalizar «${t}» debía dar «${ESPERADO[t]}» y dio «${sql}»`);
}
if (!difieren) bien(`la base y la app normalizan igual los ${TEXTOS.length} textos (minúsculas, sin acentos ni signos, sin «perro»/«raza», singular)`);

// ── Preparación: un perro de B por texto ──
// Restos de corridas anteriores que no se pudieron limpiar.
{
  const { data: viejas } = await A.from("razas").select("id").or("nombre.like.Calupoh Z%,nombre.like.Directa Z%");
  for (const r of viejas ?? []) {
    await SB.from("perros").update({ raza_id: null }).eq("raza_id", r.id);
    await SB.from("razas_propuestas").update({ raza_id: null }).eq("raza_id", r.id);
    await SB.from("razas_normalizaciones").delete().eq("raza_id", r.id);
    await SB.from("razas_grupo").delete().eq("raza_id", r.id);
    await A.from("razas").delete().eq("id", r.id);
  }
}
const sufijo = String(Date.now()).slice(-6);
const NOMBRE = `Calupoh Z${sufijo}`; // el nombre de la raza de prueba es único por corrida
const norma = (await A.rpc("normalizar_raza", { p_texto: NOMBRE })).data;
const normaVar = (await A.rpc("normalizar_raza", { p_texto: `Kalupoh Z${sufijo}` })).data;
const creados = { perros: [], razas: [], citas: [], reservas: [], tarifas: [] };
const { data: tallas } = await A.from("tamanos_categoria").select("id, clave");
const grande = tallas.find((t) => t.clave === "grande");
const mkPerro = async (nombre, raza) => {
  const { data, error } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre, raza, raza_id: null, tamano_id: grande.id }).select("id").single();
  if (error) throw new Error(`no pude crear un perro de prueba: ${error.message}`);
  creados.perros.push(data.id);
  return data.id;
};
const d1 = await mkPerro("ZZ razas 1", NOMBRE);
const d2 = await mkPerro("ZZ razas 2", `${NOMBRE.toLowerCase()}  `);
const d3 = await mkPerro("ZZ razas 3", `Perro ${NOMBRE.toUpperCase()}`);
const d4 = await mkPerro("ZZ razas 4", `Kalupoh Z${sufijo}`);
const dMestiza = await mkPerro("ZZ razas 5", "Mestiza");
const dCriollo = await mkPerro("ZZ razas 6", `Criollo`);
const { data: antesPoodle } = await A.from("razas").select("id, alias").eq("nombre", "Poodle").single();

try {
  // ── 2. Fuera del catálogo: agrupar y sugerir ──
  console.log("\n── 2. Fuera del catálogo");
  const fuera = await rpc(tAdmin, "razas_fuera_de_catalogo");
  if (!fuera.ok) throw new Error(`razas_fuera_de_catalogo: ${fuera.mensaje}`);
  const gruposFuera = fuera.cuerpo;
  const gCal = gruposFuera.find((g) => g.texto_norm === norma);
  if (!gCal || gCal.perros !== 3) hallazgo(`el grupo «${norma}» debía tener 3 perros (d1, d2 y d3) y tiene ${gCal?.perros}`);
  else bien(`tres escrituras distintas («${gCal.textos.join("», «")}») caen en un solo grupo de 3 perros`);
  if (gCal && gCal.sugerencias.length) hallazgo(`una raza que no existe no debería tener sugerencias, y trae ${JSON.stringify(gCal.sugerencias)}`);
  const gMest = gruposFuera.find((g) => g.texto_norm === "mestiza" || g.texto_norm === "mestiz");
  const mest = gMest?.sugerencias?.[0];
  if (!mest || mest.nombre !== "Mestizo" || !mest.exacta) hallazgo(`«Mestiza» debía sugerir «Mestizo» como variante exacta: ${JSON.stringify(gMest?.sugerencias)}`);
  else bien("«Mestiza» sugiere «Mestizo» (entrada propia del catálogo) como variante exacta");
  const gCrio = gruposFuera.find((g) => g.texto_norm === "criollo");
  if (!gCrio?.sugerencias?.some((s) => s.nombre === "Mestizo" && s.exacta)) hallazgo("«Criollo» debía sugerir «Mestizo» como variante exacta");
  const { data: razaDesconocida } = await A.from("razas").select("alias").eq("es_desconocida", true).single();
  if ((razaDesconocida.alias ?? []).some((a) => ["mestizo", "mestiza", "criollo", "corriente"].includes(a.toLowerCase()))) hallazgo("«No sé / mestizo» todavía tiene mestizo/criollo/corriente como variantes");
  // Nada se asignó solo.
  const { data: sinTocar } = await SB.from("perros").select("id").in("id", [d1, d2, d3, d4, dMestiza]).is("raza_id", null);
  if (sinTocar.length !== 5) hallazgo("la pantalla de sugerencias asignó perros sin que nadie lo pidiera");
  // Parecida, no exacta: umbral.
  const dParecido = await mkPerro("ZZ razas 7", "Pudl");
  const par = (await rpc(tAdmin, "razas_fuera_de_catalogo")).cuerpo.find((g) => g.texto_norm === "pudl");
  if (par?.sugerencias?.some((s) => s.exacta)) hallazgo("un texto parecido salió como exacto");
  const lejos = await mkPerro("ZZ razas 8", "Xqzw");
  const lej = (await rpc(tAdmin, "razas_fuera_de_catalogo")).cuerpo.find((g) => g.texto_norm === "xqzw");
  if (lej?.sugerencias?.length) hallazgo("un texto sin parecido a nada trae sugerencias (el umbral no corta)");
  else bien("las parecidas se marcan como tales y lo que no se parece a nada no trae sugerencias (umbral)");
  void dParecido; void lejos;

  // ── 3. «Es esta raza»: en un paso, con historial, reversible ──
  console.log("\n── 3. Es esta raza (y deshacer)");
  const { data: mestizo } = await A.from("razas").select("id").eq("nombre", "Mestizo").single();
  const sinPermiso = await rpc(tEstetica, "razas_asignar_texto", { p_texto_norm: "mestiza", p_raza_id: mestizo.id });
  if (sinPermiso.ok) hallazgo("estética pudo asignar razas en bloque");
  else bien("estética no puede asignar razas en bloque");
  const asig = await rpc(tRecep, "razas_asignar_texto", { p_texto_norm: "mestiza", p_raza_id: mestizo.id });
  const fila = una(asig.cuerpo);
  if (!asig.ok || fila?.perros !== 1) hallazgo(`recepción no pudo asignar «Mestiza» a Mestizo (${asig.mensaje || JSON.stringify(asig.cuerpo)})`);
  const { data: p5 } = await SB.from("perros").select("raza, raza_id").eq("id", dMestiza).single();
  if (p5.raza_id !== mestizo.id || p5.raza !== "Mestizo") hallazgo("el perro no quedó con la raza del catálogo");
  const { data: hist } = await SB.from("razas_normalizacion_perros").select("raza_texto_anterior, raza_id_anterior").eq("normalizacion_id", fila.normalizacion_id).single();
  if (hist?.raza_texto_anterior !== "Mestiza" || hist?.raza_id_anterior !== null) hallazgo("el historial no guardó el texto original");
  const recientes = await rpc(tRecep, "razas_asignaciones_recientes");
  const mia = (recientes.cuerpo ?? []).find((a) => a.id === fila.normalizacion_id);
  if (!mia?.hecha_por || mia.revertida) hallazgo("el historial no dice quién hizo la asignación");
  else bien(`reasigna al perro, guarda el texto original («Mestiza») y quién lo hizo (${mia.hecha_por})`);
  const otraVez = await rpc(tRecep, "razas_asignar_texto", { p_texto_norm: "mestiza", p_raza_id: mestizo.id });
  if (otraVez.ok) hallazgo("se pudo asignar dos veces el mismo grupo (ya no quedaban perros)");
  const rev = await rpc(tRecep, "razas_revertir_normalizacion", { p_normalizacion_id: fila.normalizacion_id });
  const { data: p5b } = await SB.from("perros").select("raza, raza_id").eq("id", dMestiza).single();
  if (!rev.ok || rev.cuerpo !== 1 || p5b.raza_id !== null || p5b.raza !== "Mestiza") hallazgo(`deshacer no regresó al perro a «Mestiza» (${rev.mensaje} ${JSON.stringify(p5b)})`);
  else bien("deshacer regresa al perro al texto que tenía escrito");
  if ((await rpc(tRecep, "razas_revertir_normalizacion", { p_normalizacion_id: fila.normalizacion_id })).ok) hallazgo("se pudo deshacer dos veces");
  // Un perro que ya cambió de raza por otro camino no se toca al deshacer.
  const a2 = await rpc(tRecep, "razas_asignar_texto", { p_texto_norm: "criollo", p_raza_id: mestizo.id });
  const { data: poodleFila } = await A.from("razas").select("id, nombre").eq("nombre", "Poodle").single();
  await SB.from("perros").update({ raza_id: poodleFila.id, raza: "Poodle" }).eq("id", dCriollo);
  await rpc(tRecep, "razas_revertir_normalizacion", { p_normalizacion_id: una(a2.cuerpo).normalizacion_id });
  const { data: p6 } = await SB.from("perros").select("raza_id").eq("id", dCriollo).single();
  if (p6.raza_id !== poodleFila.id) hallazgo("deshacer pisó a un perro que ya había cambiado de raza por otro camino");
  else bien("deshacer respeta al perro que ya cambió de raza por otro camino");
  await SB.from("perros").update({ raza_id: null, raza: "Criollo" }).eq("id", dCriollo);

  // ── 4. Raza nueva: proponer, aprobar, variante, rechazo ──
  console.log("\n── 4. Raza nueva");
  const args = { p_nombre: NOMBRE, p_variantes: [`Calupo Z${sufijo}`, `Kalupoh Z${sufijo}`], p_tamano_id: grande.id, p_pelaje_id: null, p_texto_norm: norma };
  const sp = await rpc(tRecep, "razas_proponer", args);
  if (sp.ok) hallazgo("recepción sin el permiso «tarifas» pudo proponer una raza");
  const sp2 = await rpc(tEstetica, "razas_proponer", args);
  if (sp2.ok) hallazgo("estética pudo proponer una raza");
  const existente = await rpc(tAdmin, "razas_proponer", { ...args, p_nombre: "Poodle" });
  if (existente.ok || !/ya existe/i.test(existente.mensaje)) hallazgo(`proponer una raza que ya existe debía rechazarse con un mensaje claro: ${existente.mensaje}`);
  const viaVariante = await rpc(tAdmin, "razas_proponer", { ...args, p_nombre: "Caniche" });
  if (viaVariante.ok) hallazgo("proponer «Caniche» (variante de Poodle) debía rechazarse");
  const prop = await rpc(tAdmin, "razas_proponer", args);
  if (!prop.ok) throw new Error(`razas_proponer: ${prop.mensaje}`);
  const propuestaId = prop.cuerpo;
  const { data: ligados } = await SB.from("razas_propuestas_perros").select("perro_id").eq("propuesta_id", propuestaId);
  const idsLigados = new Set(ligados.map((l) => l.perro_id));
  if (![d1, d2, d3, d4].every((d) => idsLigados.has(d)) || idsLigados.has(dMestiza)) hallazgo(`la propuesta debía quedar ligada a d1..d4 (por el texto y por la variante) y quedó con ${idsLigados.size}`);
  else bien("la propuesta queda ligada a los 4 perros que la usan (por el texto y por una variante)");
  if ((await rpc(tAdmin, "razas_proponer", args)).ok) hallazgo("se pudo repetir una propuesta pendiente");
  const f2 = (await rpc(tAdmin, "razas_fuera_de_catalogo")).cuerpo.find((g) => g.texto_norm === norma);
  if (f2?.propuesta_estado !== "pendiente") hallazgo("el grupo no avisa que ya tiene una propuesta pendiente");
  const { data: sinRaza } = await A.from("razas").select("id").eq("nombre", NOMBRE);
  if (sinRaza.length) hallazgo("la raza entró al catálogo sin que la plataforma la aprobara");
  // Un negocio no la aprueba.
  if ((await rpc(tAdmin, "plataforma_resolver_propuesta", { p_id: propuestaId, p_accion: "aprobar" })).ok) hallazgo("el admin de un negocio aprobó su propia propuesta");
  // Rechazo sin motivo / con motivo (otra propuesta).
  const dRaro = await mkPerro("ZZ razas 9", `Zzraro${sufijo}`);
  const propRaro = await rpc(tAdmin, "razas_proponer", { p_nombre: `Zzraro${sufijo}`, p_variantes: [], p_tamano_id: null, p_pelaje_id: null, p_texto_norm: null });
  if (!propRaro.ok) hallazgo(`razas_proponer (rara): ${propRaro.mensaje}`);
  if ((await rpc(tPlat, "plataforma_resolver_propuesta", { p_id: propRaro.cuerpo, p_accion: "rechazar" })).ok) hallazgo("la plataforma rechazó sin motivo");
  const rech = await rpc(tPlat, "plataforma_resolver_propuesta", { p_id: propRaro.cuerpo, p_accion: "rechazar", p_motivo: "No es una raza" });
  const { data: pr } = await SB.from("razas_propuestas").select("estado, motivo").eq("id", propRaro.cuerpo).single();
  const { data: dr } = await SB.from("perros").select("raza_id").eq("id", dRaro).single();
  if (!rech.ok || pr.estado !== "rechazada" || pr.motivo !== "No es una raza" || dr.raza_id !== null) hallazgo("rechazar con motivo no dejó la propuesta rechazada y el perro intacto");
  else bien("rechazar exige motivo, lo guarda y no toca al perro");
  // Aprobar como variante de una raza existente.
  const dPudel = await mkPerro("ZZ razas 10", `Pudel${sufijo}`);
  const propVar = await rpc(tAdmin, "razas_proponer", { p_nombre: `Pudel${sufijo}`, p_variantes: [], p_tamano_id: null, p_pelaje_id: null, p_texto_norm: null });
  const av = await rpc(tPlat, "plataforma_resolver_propuesta", { p_id: propVar.cuerpo, p_accion: "variante", p_raza_destino: poodleFila.id });
  const { data: poodleDespues } = await A.from("razas").select("alias").eq("id", poodleFila.id).single();
  const { data: dp } = await SB.from("perros").select("raza_id, raza").eq("id", dPudel).single();
  if (!av.ok || !poodleDespues.alias.includes(`Pudel${sufijo}`) || dp.raza_id !== poodleFila.id) hallazgo(`aprobar como variante falló (${av.mensaje})`);
  else bien("aprobar como variante agrega la escritura a Poodle y liga al perro a Poodle (no crea una raza)");
  const confl = await A.rpc("razas_conflicto", { p_texto: `Pudel${sufijo}` });
  if (una(confl.data)?.raza_nombre !== "Poodle") hallazgo("la variante nueva no se reconoce como Poodle");
  // Aprobar como raza nueva.
  const ap = await rpc(tPlat, "plataforma_resolver_propuesta", { p_id: propuestaId, p_accion: "aprobar" });
  if (!ap.ok) throw new Error(`aprobar: ${ap.mensaje}`);
  const razaId = ap.cuerpo;
  creados.razas.push(razaId, ...[]);
  const { data: razaNueva } = await A.from("razas").select("nombre, alias, tamano_tipico_id, pelaje_tipico_id").eq("id", razaId).single();
  if (razaNueva.nombre !== NOMBRE || razaNueva.tamano_tipico_id !== grande.id || razaNueva.alias.length !== 2) hallazgo(`la raza aprobada no quedó con su nombre, variantes y talla: ${JSON.stringify(razaNueva)}`);
  const { data: ligadosYa } = await SB.from("perros").select("id, raza_id, raza").in("id", [d1, d2, d3, d4]);
  if (!ligadosYa.every((p) => p.raza_id === razaId && p.raza === NOMBRE)) hallazgo("al aprobar, los perros que la propusieron no se ligaron solos");
  else bien("al aprobar, entra al catálogo con sus variantes y talla, y los 4 perros se ligan solos");
  const { data: grupoAlAprobar } = await SB.from("razas_grupo").select("id").eq("raza_id", razaId);
  if (grupoAlAprobar.length) hallazgo("la raza aprobada ya trae un grupo de precio en algún negocio (nadie lo decidió)");
  else bien("aprobar NO asigna ningún grupo de precio en ningún negocio");
  const fin = await rpc(tPlat, "plataforma_resolver_propuesta", { p_id: propuestaId, p_accion: "aprobar" });
  if (fin.ok) hallazgo("se pudo resolver dos veces la misma propuesta");
  // Una sola raza aprobada (cuenta única).
  if ((await rpc(tPlat, "plataforma_agregar_raza", { p_nombre: NOMBRE, p_variantes: [] })).ok) hallazgo("la plataforma agregó una raza duplicada");
  const dir = await rpc(tPlat, "plataforma_agregar_raza", { p_nombre: `Directa Z${sufijo}`, p_variantes: [`Direkta Z${sufijo}`], p_tamano_clave: "chico" });
  if (!dir.ok) hallazgo(`la plataforma no pudo agregar una raza directo: ${dir.mensaje}`);
  else creados.razas.push(dir.cuerpo);

  // ── 5. Precio: no se adivina ──
  console.log("\n── 5. Precio sin grupo");
  const sg = (await rpc(tAdmin, "razas_sin_grupo")).cuerpo.find((r) => r.raza_id === razaId);
  if (!sg || sg.perros !== 4 || sg.tamano !== "Grande") hallazgo(`razas_sin_grupo debía listar la raza con 4 perros y su talla típica: ${JSON.stringify(sg)}`);
  else bien("«Necesita atención»: la raza aparece sin grupo, con 4 perros, desde cuándo y su talla típica");
  const enLudogteka = (await rpc(tAdmin, "razas_sin_grupo", {}, LUDOGTEKA)).cuerpo;
  if (Array.isArray(enLudogteka) && enLudogteka.some((r) => r.raza_id === razaId)) hallazgo("la raza sin grupo de Huellitas aparece en Ludogteka");
  const { data: pg } = await SB.from("perro_grupo_raza").select("sin_grupo, grupo_raza_id, por_defecto").eq("perro_id", d1).single();
  if (!pg.sin_grupo || pg.grupo_raza_id !== null) hallazgo(`perro_grupo_raza cae a un grupo por defecto con una raza sin grupo: ${JSON.stringify(pg)}`);
  else bien("perro_grupo_raza dice «sin grupo» y NO cae al grupo por defecto (pelo corto)");

  // La cita: servicio de estética de B que cobra por grupo.
  const { data: servicios } = await SB.from("servicios").select("id, nombre").eq("categoria", "estetica").eq("depende_grupo_raza", true).is("deleted_at", null);
  const { data: grupos } = await SB.from("grupos_raza").select("id, nombre, depende_tamano, es_predeterminado").is("deleted_at", null);
  // Huellitas casi no tiene tarifas: se le pone una de prueba (grupo sin talla) y al final se quita.
  const servicioPrueba = servicios.find((s) => /exprés|expres/i.test(s.nombre)) ?? servicios[0];
  const grupoPrueba = grupos.find((g) => !g.depende_tamano && !g.es_predeterminado);
  const { data: tarifaPrueba, error: errTarifa } = await SB.from("tarifas").insert({ servicio_id: servicioPrueba.id, grupo_raza_id: grupoPrueba.id, tamano_id: null, pelaje_id: null, cantidad_desde: 1, vigencia_desde: "2026-01-01", precio: 123, no_aplica: false }).select("id").single();
  if (errTarifa) throw new Error(`tarifa de prueba: ${errTarifa.message}`);
  creados.tarifas = [tarifaPrueba.id];
  // Si Huellitas ya trae su tabla de precios (estetica-dev.mjs), el vigente manda.
  const { data: vigentes } = await SB.from("tarifas_vigentes").select("precio").eq("servicio_id", servicioPrueba.id).eq("grupo_raza_id", grupoPrueba.id).is("tamano_id", null).is("pelaje_id", null);
  const tarifas = [{ servicio_id: servicioPrueba.id, grupo_raza_id: grupoPrueba.id, precio: Number(vigentes?.[0]?.precio ?? 123) }];
  const candidato = { servicio: servicioPrueba, grupo: grupoPrueba };
  if (!candidato) {
    hallazgo("Huellitas no tiene un servicio de estética con tarifa en un grupo sin talla: no se pudo probar la cita");
  } else {
    const manana = new Date(Date.now() + 3 * 86_400_000);
    const inicio = (h) => `${manana.toISOString().slice(0, 10)}T${h}:00-06:00`;
    let hora = 10;
    const cita = async (token, perroId, extra = {}) => {
      const rr = await fetch(`${URL}/rest/v1/reservas`, { method: "POST", headers: cab(token), body: JSON.stringify({ cliente_id: datos.clienteSoloB }) });
      const reserva = await rr.json();
      const reservaId = reserva?.[0]?.id;
      if (!reservaId) return { ok: false, mensaje: `reserva: ${JSON.stringify(reserva).slice(0, 120)}` };
      creados.reservas.push(reservaId);
      const r = await fetch(`${URL}/rest/v1/citas_estetica`, {
        method: "POST", headers: cab(token),
        body: JSON.stringify({ reserva_id: reservaId, perro_id: perroId, servicio_id: candidato.servicio.id, empleado_id: datos.esteticaB, inicio: inicio(String(hora++).padStart(2, "0")), ...extra }),
      });
      const cuerpo = await r.json();
      if (r.ok && cuerpo?.[0]?.id) creados.citas.push(cuerpo[0].id);
      return { ok: r.ok, mensaje: cuerpo?.message ?? "", fila: cuerpo?.[0] };
    };
    const sin = await cita(tAdmin, d1);
    if (sin.ok || !/todavía no tiene grupo de precio/.test(sin.mensaje)) hallazgo(`la cita de una raza sin grupo debía rechazarse con un mensaje claro: ${sin.ok ? "se agendó con un precio adivinado" : sin.mensaje}`);
    else bien(`la cita se rechaza sin adivinar: «${sin.mensaje.slice(0, 110)}…»`);
    const sinMotivo = await cita(tAdmin, d1, { grupo_raza_excepcion_id: candidato.grupo.id });
    if (sinMotivo.ok || !/motivo/i.test(sinMotivo.mensaje)) hallazgo(`una excepción sin motivo debía rechazarse: ${sinMotivo.mensaje}`);
    const exSinPermiso = await cita(tRecep, d1, { grupo_raza_excepcion_id: candidato.grupo.id, excepcion_grupo_motivo: "prueba" });
    if (exSinPermiso.ok) hallazgo("recepción sin el permiso «excepciones_reserva» registró una excepción de grupo");
    const ex = await cita(tAdmin, d1, { grupo_raza_excepcion_id: candidato.grupo.id, excepcion_grupo_motivo: "Raza nueva, grupo por confirmar" });
    const precioDelGrupo = tarifas.find((t) => t.servicio_id === candidato.servicio.id && t.grupo_raza_id === candidato.grupo.id)?.precio;
    if (!ex.ok) hallazgo(`la excepción de grupo con motivo (admin) no pasó: ${ex.mensaje}`);
    else if (Number(ex.fila.precio) !== Number(precioDelGrupo) || ex.fila.excepcion_grupo_por !== datos.adminB || ex.fila.excepcion_grupo_motivo !== "Raza nueva, grupo por confirmar") {
      hallazgo(`la excepción no quedó con el precio del grupo elegido y quién la hizo: ${JSON.stringify(ex.fila)}`);
    } else bien(`con excepción (grupo «${candidato.grupo.nombre}», motivo y quién la hizo) la cita pasa con el precio de ese grupo ($${ex.fila.precio})`);

    // Asignar el grupo: solo con el permiso, con historia al reasignar.
    const noPuede = await rpc(tRecep, "asignar_grupo_raza", { p_raza_id: razaId, p_grupo_raza_id: candidato.grupo.id });
    if (noPuede.ok) hallazgo("recepción sin «tarifas» asignó el grupo de una raza");
    const noPuede2 = await rpc(tEstetica, "asignar_grupo_raza", { p_raza_id: razaId, p_grupo_raza_id: candidato.grupo.id });
    if (noPuede2.ok) hallazgo("estética asignó el grupo de una raza");
    const grupoAjeno = (await A.from("grupos_raza").select("id").eq("negocio_id", LUDOGTEKA).limit(1).single()).data.id;
    if ((await rpc(tAdmin, "asignar_grupo_raza", { p_raza_id: razaId, p_grupo_raza_id: grupoAjeno })).ok) hallazgo("se asignó a una raza el grupo de OTRO negocio");
    const asignado = await rpc(tAdmin, "asignar_grupo_raza", { p_raza_id: razaId, p_grupo_raza_id: candidato.grupo.id });
    if (!asignado.ok) hallazgo(`asignar_grupo_raza (admin): ${asignado.mensaje}`);
    const normal = await cita(tAdmin, d2);
    if (!normal.ok || Number(normal.fila.precio) !== Number(precioDelGrupo) || normal.fila.grupo_raza_excepcion_id) hallazgo(`con el grupo asignado la cita debía pasar normal y con el precio del grupo: ${normal.mensaje}`);
    else bien("con el grupo asignado, la cita pasa sin excepción y con el precio de ese grupo");
    if ((await rpc(tAdmin, "razas_sin_grupo")).cuerpo.some((r) => r.raza_id === razaId)) hallazgo("la raza sigue en «sin grupo» después de asignarla");
    const otroGrupo = grupos.find((g) => g.id !== candidato.grupo.id && !g.depende_tamano && !g.es_predeterminado);
    if (otroGrupo) {
      await rpc(tAdmin, "asignar_grupo_raza", { p_raza_id: razaId, p_grupo_raza_id: otroGrupo.id });
      const { data: filas } = await SB.from("razas_grupo").select("grupo_raza_id, deleted_at").eq("raza_id", razaId);
      if (filas.length !== 2 || filas.filter((f) => !f.deleted_at).length !== 1) hallazgo("reasignar el grupo no conservó la historia (una fila vigente y la anterior dada de baja)");
      else bien("reasignar el grupo conserva la historia: la anterior queda dada de baja, una sola vigente");
    }
  }
  // Una raza SIN raza_id sigue como hoy (grupo por defecto + pantalla de normalizar): no es lo que cambió.
  const { data: pd } = await SB.from("perro_grupo_raza").select("por_defecto, sin_grupo").eq("perro_id", dMestiza).single();
  // (Sin pelaje capturado, el grupo por defecto —«Por talla», solo pelo corto— no se da por bueno: sin_grupo por pelaje.)
  if (!pd.por_defecto) hallazgo("un perro con la raza escrita a mano dejó de comportarse como hasta hoy (grupo por defecto)");
  else bien("un perro con la raza escrita a mano sigue con el grupo por defecto, como hasta hoy (lo resuelve la normalización)");

  // ── 6. Razas desde el formulario del perro ──
  console.log("── 6. Desde el formulario del perro");
  const NOMBRE6 = `Formulario Z${sufijo}`;
  const { data: perroF } = await SB.from("perros").insert({ cliente_id: datos.clienteSoloB, nombre: `ZZ form ${sufijo}`, raza: NOMBRE6, raza_id: null }).select("id").single();
  creados.perros.push(perroF.id);
  const args6 = (extra = {}) => ({ p_nombre: NOMBRE6, p_variantes: [`Otro ${sufijo}`], p_tamano_id: null, p_pelaje_id: null, p_notas: "Se parece al husky", p_perro_id: perroF.id, p_grupo_raza_id: null, ...extra });
  const prop6 = await rpc(tAdmin, "razas_proponer_formulario", args6());
  if (!prop6.ok) hallazgo(`razas_proponer_formulario (admin): ${prop6.mensaje}`);
  else {
    const dup = await rpc(tRecep, "razas_proponer_formulario", args6({ p_nombre: NOMBRE6.toUpperCase(), p_notas: "otra nota" }));
    if (!dup.ok || dup.cuerpo !== prop6.cuerpo) hallazgo(`la misma raza propuesta otra vez debía reusar la propuesta: ${dup.mensaje || JSON.stringify(dup.cuerpo)}`);
    else bien("la misma raza (otra escritura) reusa la propuesta pendiente, no la duplica");
    const fila = (await SB.from("razas_propuestas").select("notas, origen, estado").eq("id", prop6.cuerpo).single()).data;
    if (fila.origen !== "formulario" || !fila.notas.includes("husky") || !fila.notas.includes("otra nota")) hallazgo(`notas/origen: ${JSON.stringify(fila)}`);
    else bien("la propuesta guarda las notas de quien la describió (se suman) y su origen");
    const v = (await SB.from("perro_grupo_raza").select("sin_grupo, por_defecto, propuesta_id, raza_nombre").eq("perro_id", perroF.id).single()).data;
    if (!v.sin_grupo || v.por_defecto || v.propuesta_id !== prop6.cuerpo || v.raza_nombre !== NOMBRE6) hallazgo(`vista con propuesta pendiente: ${JSON.stringify(v)}`);
    else bien("perro_grupo_raza: con propuesta pendiente el perro está «sin grupo» (no el por defecto) y dice su propuesta");
    const gruposB = (await SB.from("grupos_raza").select("id").eq("negocio_id", B).is("deleted_at", null).limit(2)).data;
    const gruposL = (await A.from("grupos_raza").select("id").eq("negocio_id", LUDOGTEKA).limit(1)).data;
    if ((await rpc(tRecep, "asignar_grupo_propuesta", { p_propuesta_id: prop6.cuerpo, p_grupo_raza_id: gruposB[0].id })).status !== 403) hallazgo("recepción sin «tarifas» asignó grupo a una propuesta");
    if ((await rpc(tRecep, "razas_proponer_formulario", args6({ p_nombre: `ConGrupo Z${sufijo}`, p_grupo_raza_id: gruposB[0].id, p_perro_id: null }))).status !== 403) hallazgo("recepción sin «tarifas» propuso con grupo");
    if ((await rpc(tEstetica, "razas_proponer_formulario", args6({ p_nombre: `Estetica Z${sufijo}`, p_perro_id: null }))).ok) hallazgo("estética propuso una raza");
    if ((await rpc(tAdmin, "asignar_grupo_propuesta", { p_propuesta_id: prop6.cuerpo, p_grupo_raza_id: gruposL[0].id })).ok) hallazgo("se asignó a una propuesta el grupo de OTRO negocio");
    else bien("la base rechaza grupos de otro negocio, y a recepción sin «tarifas» y a estética");
    const conGrupo = await rpc(tAdmin, "asignar_grupo_propuesta", { p_propuesta_id: prop6.cuerpo, p_grupo_raza_id: gruposB[0].id });
    const v2 = (await SB.from("perro_grupo_raza").select("sin_grupo, grupo_raza_id").eq("perro_id", perroF.id).single()).data;
    if (!conGrupo.ok || v2.sin_grupo || v2.grupo_raza_id !== gruposB[0].id) hallazgo(`con el grupo de la propuesta el perro debía cotizar con él: ${conGrupo.mensaje} ${JSON.stringify(v2)}`);
    else bien("con el grupo que el negocio le da a la propuesta, el perro ya cotiza con él");
    const ajeno = (await A.from("perros").select("id").limit(1)).data?.[0]?.id;
    if (ajeno && (await rpc(tAdmin, "razas_proponer_formulario", args6({ p_nombre: `Ajeno Z${sufijo}`, p_perro_id: ajeno }))).ok) hallazgo("se ligó a una propuesta un perro de OTRO negocio");
    if ((await rpc(tAdmin, "razas_proponer_formulario", args6({ p_nombre: "Mestizo", p_perro_id: null }))).ok) hallazgo("se propuso «Mestizo», que ya está en el catálogo");
    else bien("una raza que ya está en el catálogo se rechaza con su nombre");
    const larga = await rpc(tAdmin, "razas_proponer_formulario", args6({ p_nombre: `X${"y".repeat(100)}`, p_perro_id: null }));
    if (larga.ok) hallazgo("se aceptó un nombre de más de 80 caracteres");
    // La plataforma aprueba: el grupo del negocio queda como el de la raza en ESE negocio.
    const aprob = await rpc(tPlat, "plataforma_resolver_propuesta", { p_id: prop6.cuerpo, p_accion: "aprobar", p_motivo: null, p_raza_destino: null, p_nombre: null }, B);
    if (!aprob.ok) hallazgo(`aprobar: ${aprob.mensaje}`);
    else {
      creados.razas.push(aprob.cuerpo);
      const g = (await SB.from("razas_grupo").select("negocio_id, grupo_raza_id").eq("raza_id", aprob.cuerpo).is("deleted_at", null)).data;
      const p6 = (await SB.from("perros").select("raza_id").eq("id", perroF.id).single()).data;
      if (g.length !== 1 || g[0].negocio_id !== B || g[0].grupo_raza_id !== gruposB[0].id || p6.raza_id !== aprob.cuerpo) hallazgo(`al aprobar: ${JSON.stringify([g, p6])}`);
      else bien("al aprobar, el grupo del negocio queda como el de la raza SOLO en ese negocio y el perro se liga");
      const lista = await rpc(tPlat, "plataforma_razas_propuestas", {}, B);
      const f6 = (lista.cuerpo ?? []).find((x) => x.id === prop6.cuerpo);
      if (!f6 || f6.origen !== "formulario" || !f6.notas?.includes("husky") || f6.grupo_nombre == null) hallazgo(`la bandeja no trae notas/origen/grupo: ${JSON.stringify(f6)}`);
      else bien("la bandeja de la plataforma trae las notas, el origen y el grupo de la propuesta");
    }
  }
  const anonCab = { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY, Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`, "x-negocio-id": B, "Content-Type": "application/json" };
  for (const fn of ["razas_proponer_formulario", "razas_proponer_cliente", "asignar_grupo_propuesta", "razas_propuestas_sin_grupo", "razas_proponer_interna"]) {
    const r = await fetch(`${URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: anonCab, body: "{}" });
    if (r.status !== 401 && r.status !== 403 && r.status !== 404) hallazgo(`${fn} contestó ${r.status} a la llave anónima`);
  }
  for (const fn of ["razas_proponer_cliente", "razas_proponer_interna"]) {
    if ((await rpc(tAdmin, fn, { p_perro_id: perroF.id, p_nombre: "Hack", p_variantes: [], p_notas: null })).ok) hallazgo(`${fn} la pudo llamar un admin con su JWT`);
  }
  bien("anónimo no ejecuta ninguna; las del servidor (cliente, interna) ni un admin con su JWT");
} finally {
  // Limpieza de lo de prueba (desarrollo, con la llave de servicio).
  for (const id of creados.citas) await SB.from("citas_estetica").delete().eq("id", id);
  for (const id of creados.reservas) await SB.from("reservas").delete().eq("id", id);
  for (const id of creados.tarifas) await SB.from("tarifas").delete().eq("id", id);
  await SB.from("razas_normalizacion_perros").delete().in("perro_id", creados.perros);
  await SB.from("razas_propuestas_perros").delete().in("perro_id", creados.perros);
  await SB.from("perros").update({ deleted_at: new Date().toISOString(), raza_id: null }).in("id", creados.perros);
  const { data: props } = await SB.from("razas_propuestas").select("id").like("nombre", `%Z${sufijo}`);
  if (props?.length) await SB.from("razas_propuestas").delete().in("id", props.map((p) => p.id));
  const { data: props2 } = await SB.from("razas_propuestas").select("id").like("nombre", `%${sufijo}`);
  if (props2?.length) await SB.from("razas_propuestas").delete().in("id", props2.map((p) => p.id));
  await SB.from("razas_normalizaciones").delete().eq("negocio_id", B).in("texto_norm", ["mestiza", "criollo"]);
  await SB.from("razas_propuestas").update({ raza_id: null }).eq("negocio_id", B).not("raza_id", "is", null);
  for (const id of creados.razas.filter(Boolean)) {
    await SB.from("razas_grupo").delete().eq("raza_id", id);
    await A.from("razas").delete().eq("id", id);
  }
  await A.from("razas").update({ alias: antesPoodle.alias }).eq("id", antesPoodle.id);
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
