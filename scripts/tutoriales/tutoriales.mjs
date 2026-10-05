#!/usr/bin/env node
// El corredor de la serie de videos tutoriales de PeluDesk (`npm run tutoriales`).
//
//   npm run tutoriales -- --listar                      qué hay y en qué estado
//   npm run tutoriales -- --video 04                    un video (o varios: 04,05)
//   npm run tutoriales -- --area caja                   toda un área
//   npm run tutoriales                                  toda la cola (reanuda: salta lo ya listo)
//   npm run tutoriales -- --video 04 --regrabar         vuelve a grabar aunque ya esté listo
//   npm run tutoriales -- --video 04 --solo-voz         agrega la voz SIN volver a grabar
//   npm run tutoriales -- --prod                        además publica en PRODUCCIÓN (archivos, catálogo y avisos)
//   npm run tutoriales -- --sin-publicar                graba, renderiza y revisa; no sube nada
//
// SE GRABA SOLO EN DESARROLLO con el negocio demo ficticio (Patitas & Co.), con la
// app compilada y servida en el 3001 (`npm run build && npm run start -- -p 3001`).
// Nada de Ludogteka, de un cliente real ni de /plataforma en pantalla (el QC lo
// comprueba). Un video a la vez; una falla no detiene a los demás (hasta 3 errores
// seguidos: entonces se detiene y avisa).
//
// Fases por video (estado persistido en salida/<NN>/estado.json y en
// tutoriales_progreso): guion → voz → grabado → render → qc → listo | listo_sin_voz.
// Tres intentos por video. Sin ELEVENLABS_API_KEY sale «listo menos voz».
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { AREAS, VIDEOS } from "./catalogo.mjs";
import { conectar, rpc } from "./lib/db.mjs";
import { prepararDemo, SLUG_DEMO } from "./lib/demo.mjs";
import { cookiesDe } from "./lib/sesion.mjs";
import { cargarGuion, validarGuion, locuciones, plan, total, DIR_VIDEOS } from "./lib/guion.mjs";
import { grabarVideo, tarjetaTitulo, tarjetaResumen, tarjetaSiguiente } from "./lib/grabador.mjs";
import { cuota, generarLocuciones, hayLlave, musicaDeLaSerie, PISO_PRESUPUESTO, caracteres, respaldarVoz, restaurarVoz } from "./lib/voz.mjs";
import { tramos, subtitulos, aVtt, aSrt, pistaDeAudio, exportarMaster, exportar720, miniaturas, duracionDe } from "./lib/render.mjs";
import { qcVideo } from "./lib/qc.mjs";
import { textoYoutube, archivoYoutubeTxt } from "./lib/youtube.mjs";
import { publicarVideo, tamano, FRACCION_MAX_MASTERS, CUOTA_STORAGE_PLAN } from "./lib/publicar.mjs";
import { leerEstado, guardarEstado, DIR_SALIDA } from "./lib/estado.mjs";
import { sincronizarCatalogo } from "./sincronizar.mjs";
import { articuloPorSlugArchivo } from "./lib/articulos.mjs";
import { avisar } from "./avisar.mjs";

// ── Argumentos ──
const args = process.argv.slice(2);
const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const flag = (k) => args.includes(k);
const OPC = {
  videos: val("--video")?.split(",").map((x) => x.trim().padStart(2, "0")) ?? null,
  area: val("--area"),
  regrabar: flag("--regrabar"),
  soloVoz: flag("--solo-voz"),
  soloPublicar: flag("--solo-publicar"),
  prod: flag("--prod"),
  sinPublicar: flag("--sin-publicar"),
  listar: flag("--listar"),
  limite: Number(val("--limite") ?? 0) || null,
  intentos: Number(val("--intentos") ?? 3),
  base: (val("--base") ?? `http://${SLUG_DEMO}.localhost:3001`).replace(/\/$/, ""),
  erroresSeguidos: Number(val("--errores-seguidos") ?? 3),
};
const ID_DEMO_HOST = new URL(OPC.base).host;
if (!ID_DEMO_HOST.startsWith(`${SLUG_DEMO}.`)) throw new Error(`Se graba SOLO en el negocio demo (${SLUG_DEMO}.*), no en ${ID_DEMO_HOST}.`);

const cd = conectar(false);
let cp = null;
const aviso = async (t) => { console.log(`\n📣 ${t.split("\n")[0]}`); if (OPC.prod) { try { await avisar(t, { prod: true }); } catch (e) { console.warn(`  (no pude encolar el aviso: ${e.message})`); } } };

// ── Utilidades ──
const commit = () => { try { return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(); } catch { return "desconocido"; } };
const ordenCola = (v) => (v.id === "00" ? 99 : Number(v.id));
const ahoraISO = () => new Date().toISOString();
const hashDe = (v, g, archivoGuion) => crypto.createHash("sha1").update(JSON.stringify({ v: { ...v, duracion: 0 }, guion: fs.readFileSync(archivoGuion, "utf8") })).digest("hex").slice(0, 12);
const mb = (b) => (b / 1048576).toFixed(1);
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function servidorArriba() {
  return new Promise((resolve) => {
    http.get({ host: "127.0.0.1", port: new URL(OPC.base).port || 3001, path: "/login", headers: { host: ID_DEMO_HOST }, timeout: 8000 }, (r) => { r.resume(); resolve(r.statusCode < 500); }).on("error", () => resolve(false)).on("timeout", function () { this.destroy(); resolve(false); });
  });
}

function telefonoNuevo(usados) {
  for (;;) {
    const t = `44200${String(Math.floor(Math.random() * 90000) + 10000)}`;
    if (!usados.has(t)) { usados.add(t); return t; }
  }
}
const sustituir = (x, valores) => {
  if (typeof x === "string") return x.replace(/\{(\w+)\}/g, (m, k) => (k in valores ? valores[k] : m));
  if (Array.isArray(x)) return x.map((y) => sustituir(y, valores));
  return x;
};

async function presupuestoVoz(gastadosAntes) {
  const q = await cuota();
  if (!q) return { hay: false };
  if (q.error) return { hay: true, error: q.error, disponibles: 0 };
  const piso = Math.ceil(q.limite * PISO_PRESUPUESTO);
  return { hay: true, ...q, piso, disponibles: Math.max(0, q.quedan - piso - gastadosAntes) };
}

// ── Un video ──
async function producir(v, ctx) {
  const dir = path.join(DIR_SALIDA, v.id);
  fs.mkdirSync(dir, { recursive: true });
  const archivoGuion = path.join(DIR_VIDEOS, `${v.id}-${v.slug}.mjs`);
  const guion = await cargarGuion(v);
  if (!guion) throw Object.assign(new Error("no hay guion"), { fase: "guion", sinReintento: true });
  const faltas = validarGuion(v, guion);
  if (faltas.length) throw Object.assign(new Error(`guion inválido: ${faltas.join("; ")}`), { fase: "guion", sinReintento: true });
  const hash = hashDe(v, guion, archivoGuion);
  const siguiente = VIDEOS.find((x) => x.id === String(Number(v.id) + 1).padStart(2, "0"))?.titulo ?? null;
  const locs = locuciones(guion, siguiente);
  await guardarEstado(cd, v.id, { estado: "guion", hash });

  // ── Voz ──
  let voz = null;
  let sinPresupuesto = false;
  if (hayLlave()) {
    const pres = await presupuestoVoz(ctx.vozGastada);
    if (pres.error) console.warn(`  (no pude consultar la cuota de ElevenLabs: ${pres.error})`);
    try {
      await restaurarVoz(ctx.cdurable, v.id).catch(() => 0);
      voz = await generarLocuciones({ numero: v.id, locs, presupuesto: pres });
      if (voz) { ctx.vozGastada += voz.gastados ?? 0; await respaldarVoz(ctx.cdurable, v.id).catch((e) => console.warn(`  (respaldo de voz: ${e.message})`)); }
    } catch (e) {
      if (e.codigo === "sin_presupuesto") { sinPresupuesto = true; console.warn(`  ⚠ ${e.message} Queda «listo menos voz».`); } else throw Object.assign(e, { fase: "voz" });
    }
  } else {
    await restaurarVoz(ctx.cdurable, v.id).catch(() => 0);
    voz = await generarLocuciones({ numero: v.id, locs, presupuesto: null }).catch(() => null);
  }
  await guardarEstado(cd, v.id, { estado: "voz", caracteresVoz: voz ? caracteres(locs) : 0 });

  const p = plan(guion, siguiente, voz?.largos ?? {});
  const duracionPlan = total(p);

  // ── Grabación ──
  const f = new Date(Date.now() + (3 + Math.floor(Math.random() * 25)) * 86400000);
  const pad = (x) => String(x).padStart(2, "0");
  const dia = (n) => { const d = new Date(Date.now() + n * 86400000); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const base0 = 20 + Math.floor(Math.random() * 40);
  const valores = { n3: String(Math.floor(Math.random() * 900) + 100), fechaDia: dia(base0), fechaDia2: dia(base0 + 2), fechaCita: `${f.getFullYear()}-${pad(f.getMonth() + 1)}-${pad(f.getDate())}T${pad(10 + Math.floor(Math.random() * 6))}:${pad(Math.floor(Math.random() * 4) * 15)}`, tel: telefonoNuevo(ctx.telefonos), tel2: telefonoNuevo(ctx.telefonos), tel3: telefonoNuevo(ctx.telefonos) };
  const sb = ctx.sbDemo;
  if (guion.preparar) await guion.preparar({ sb, negocioId: ctx.negocioId, ...valores, vid: v });
  const guionEjecutable = { ...guion, escenas: guion.escenas.map((e) => ({ ...e, pasos: sustituir(e.pasos ?? [], valores) })) };
  const rol = guion.rol ?? v.rol;
  const cookies = guion.sinSesion ? [] : await cookiesDe(cd, rol, ID_DEMO_HOST.split(":")[0], ctx.anon);
  const area = AREAS.find((a) => a.clave === v.area).nombre;
  const tarjetas = {
    titulo: tarjetaTitulo({ numero: v.id, area, titulo: v.titulo, subtitulo: guion.subtitulo ?? v.resumen }),
    resumen: tarjetaResumen({ puntos: guion.resumen }),
    cierre: tarjetaSiguiente({ siguiente, ultimo: !siguiente }),
  };
  console.log(`  grabando (${Math.round(duracionPlan)} s planeados${voz ? ", con voz" : ", sin voz"})…`);
  const grab = await grabarVideo({ base: OPC.base, cookies: sustituir(cookies, {}), inicio: guion.inicio, guion: guionEjecutable, tarjetas, plan: p, salida: dir, nombre: "video" });
  await guardarEstado(cd, v.id, { estado: "grabado", duracion: grab.duracion });
  return await terminar({ v, guion, locs, voz, siguiente, grab, dir, hash, sinPresupuesto, ctx, area });
}

// Del video crudo al paquete final: audio, master, 720p, subtítulos, miniatura, QC y publicación.
async function terminar({ v, guion, locs, voz, siguiente, grab, dir, hash, sinPresupuesto, ctx, area, reutiliza = null }) {
  await guardarEstado(cd, v.id, { estado: "render" });
  const secciones = tramos({ guion, locs, tiempos: grab.tiempos });
  const musica = voz ? await musicaDeLaSerie(v.id).catch(() => null) : null;
  const audio = pistaDeAudio({ dir, duracion: grab.duracion, secciones, voces: voz?.voces ?? null, largos: voz?.largos ?? null, musica });
  const master = path.join(dir, "master-1080p.mp4");
  const crudo = reutiliza ?? grab.mp4;
  const m1080 = exportarMaster({ crudo, wav: audio.wav, salida: master, duracion: grab.duracion });
  const v720 = path.join(dir, "video-720p.mp4");
  const m720 = exportar720({ master, salida: v720, duracion: grab.duracion });
  const subs = subtitulos({ secciones, alineaciones: voz?.alineaciones ?? null, largos: voz?.largos ?? null });
  const srt = path.join(dir, "subtitulos.es-MX.srt");
  const vtt = path.join(dir, "subtitulos.es-MX.vtt");
  fs.writeFileSync(srt, aSrt(subs));
  fs.writeFileSync(vtt, aVtt(subs));
  const { poster, miniatura } = await miniaturas({ master, dir, titulo: v.titulo, area, numero: v.id, instante: secciones[1].ini + 2.5 });
  const articulos = v.articulos.map((s) => articuloPorSlugArchivo(s)).filter(Boolean);
  const yt = textoYoutube({ video: v, guion, secciones, articulos });
  const texto = path.join(dir, "youtube.txt");
  fs.writeFileSync(texto, archivoYoutubeTxt(yt));
  fs.writeFileSync(path.join(dir, "guion.txt"), locs.map((l) => `[${l.id}] ${l.texto}`).join("\n\n") + "\n");
  fs.writeFileSync(path.join(dir, "tiempos.json"), JSON.stringify({ tiempos: grab.tiempos, duracion: grab.duracion, hash }, null, 2));

  await guardarEstado(cd, v.id, { estado: "qc" });
  const r = qcVideo({ video: v, guion, master, vtt, muestras: grab.muestras, conVoz: audio.conVoz, wav: audio.wav, secciones, permitirRutas: guion.permitirRutas ?? [] });
  const resumenQc = { ok: r.ok, errores: r.errores, avisos: r.avisos, defectos: r.defectos, metricas: r.metricas, master: m1080, v720: m720 };
  if (!r.ok) {
    await guardarEstado(cd, v.id, { estado: "error", faseError: "qc", error: r.errores.slice(0, 6).join(" · "), qc: resumenQc });
    throw Object.assign(new Error(`QC: ${r.errores.slice(0, 6).join(" · ")}`), { fase: "qc", qc: resumenQc });
  }
  const conVoz = audio.conVoz;
  const rutas = { master, video720: v720, poster, miniatura, srt, vtt, texto };
  const meta = { descripcion: yt.descripcion, duracion: grab.duracion, conVoz, commit: ctx.commit };
  let publicado = { dev: false, prod: false };
  if (!OPC.sinPublicar) {
    const hechos = await publicarVideo({ c: cd, video: v, rutas, meta, masterAqui: true });
    publicado.dev = true;
    void hechos;
    if (OPC.prod) {
      await publicarVideo({ c: ctx.cprod, video: v, rutas, meta, masterAqui: ctx.mastersEnProd });
      publicado.prod = true;
    }
  }
  const estadoFinal = conVoz ? "listo" : "listo_sin_voz";
  await guardarEstado(cd, v.id, { estado: estadoFinal, faseError: null, error: null, qc: resumenQc, duracion: grab.duracion, tamano: m1080.tam, terminadoAt: ahoraISO(), commit: ctx.commit, publicado, sinPresupuesto, hash });
  // Intermedios fuera: solo se quedan el master, el 720p, los subtítulos y el texto.
  fs.rmSync(grab.mp4, { force: true });
  for (const f of ["audio.wav", "voz.wav", "cuadro.jpg"]) fs.rmSync(path.join(dir, f), { force: true });
  return { estado: estadoFinal, duracion: grab.duracion, tam: m1080.tam, tam720: m720.tam, qc: resumenQc, defectos: r.defectos };
}

// ── La cola ──
async function main() {
  const c = cd;
  if (OPC.listar) {
    const ordenados = [...VIDEOS].sort((a, b) => ordenCola(a) - ordenCola(b));
    // «Por actualizar»: estado persistente de la base (lo marca el despliegue; regrabar con éxito lo limpia).
    const porActualizar = new Map();
    const estadoBase = new Map();
    for (const prod of OPC.prod ? [false, true] : [false]) {
      try {
        const { data } = await (prod ? conectar(true) : c).cliente.from("tutoriales").select("numero, estado, por_actualizar_motivo, por_actualizar_desde").is("deleted_at", null);
        for (const t of data ?? []) {
          if (!estadoBase.has(t.numero)) estadoBase.set(t.numero, t.estado);
          if (t.por_actualizar_desde && !porActualizar.has(t.numero)) porActualizar.set(t.numero, t);
        }
      } catch (e) { console.warn(`(no pude leer lo «por actualizar» de ${prod ? "producción" : "desarrollo"}: ${e.message})`); }
    }
    for (const v of ordenados) {
      const e = leerEstado(v.id);
      const hayGuion = fs.existsSync(path.join(DIR_VIDEOS, `${v.id}-${v.slug}.mjs`));
      const pa = porActualizar.get(v.id);
      console.log(`${v.id}  ${(e.estado && e.estado !== "pendiente" ? e.estado : estadoBase.get(v.id) ?? "pendiente").padEnd(14)} ${hayGuion ? "con guion" : "SIN guion"}  ${e.duracion ? Math.round(e.duracion) + " s" : "     "}  ${v.titulo}${pa ? `\n      ⚠ POR ACTUALIZAR desde ${String(pa.por_actualizar_desde).slice(0, 10)}: ${pa.por_actualizar_motivo}` : ""}`);
    }
    if (porActualizar.size) console.log(`\n${porActualizar.size} video(s) por actualizar: ${[...porActualizar.keys()].sort().join(", ")}  →  npm run tutoriales -- --video <NN> --regrabar${OPC.prod ? " --prod" : ""}`);
    return;
  }

  console.log(`Corredor de tutoriales · grabando en desarrollo (${OPC.base})${OPC.prod ? " · publica en PRODUCCIÓN" : OPC.sinPublicar ? " · sin publicar" : " · publica en desarrollo"}`);
  if (!(await servidorArriba())) throw new Error(`El servidor no responde en ${OPC.base}. Compila y levántalo: npm run build && npm run start -- -p 3001`);
  const demo = await prepararDemo(c);
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? fs.readFileSync(".env.local", "utf8").match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.+)/)[1].trim();
  const { createClient } = await import("@supabase/supabase-js");
  const sbDemo = createClient(c.url, (await import("node:fs")).readFileSync(".env.local", "utf8").match(/SUPABASE_SECRET_KEY=(.+)/)[1].trim(), { auth: { persistSession: false }, global: { headers: { "x-negocio-id": demo.negocio.id } } });
  const { data: tels } = await c.cliente.from("clientes").select("telefono").eq("negocio_id", demo.negocio.id);
  const telefonos = new Set((tels ?? []).map((t) => t.telefono));
  await sincronizarCatalogo(c);
  const ctx = { sbDemo, negocioId: demo.negocio.id, anon, telefonos, commit: commit(), vozGastada: 0, cdurable: c, cprod: null, mastersEnProd: true };
  if (OPC.prod) {
    cp = conectar(true);
    ctx.cprod = cp;
    ctx.cdurable = cp;
    await sincronizarCatalogo(cp);
    // ¿Caben los masters en Storage de producción (< 40 % de la cuota del plan)?
    try {
      const { usoStorage } = await import("./lib/db.mjs");
      const uso = await usoStorage(cp, ["perros-archivos", "negocios-publico", "tutoriales", "tutoriales-masters"]);
      const proyectado = uso.total + VIDEOS.length * 40 * 1048576;
      ctx.mastersEnProd = proyectado < CUOTA_STORAGE_PLAN * FRACCION_MAX_MASTERS;
      console.log(`Storage de producción: ${mb(uso.total)} MB usados; con 55 masters de ~40 MB serían ${mb(proyectado)} MB de ${mb(CUOTA_STORAGE_PLAN)} MB (${(100 * proyectado / CUOTA_STORAGE_PLAN).toFixed(1)} %): ${ctx.mastersEnProd ? "los masters van a producción" : "los masters se quedan en desarrollo"}.`);
    } catch (e) { console.warn(`(no pude medir Storage de producción: ${e.message})`); }
  }

  if (OPC.soloPublicar) {
    // Sube lo ya terminado (salida/<NN>/) a desarrollo y, con --prod, a producción; no graba nada.
    let n = 0;
    for (const v of VIDEOS.filter((x) => !OPC.videos || OPC.videos.includes(x.id)).sort((a, b) => ordenCola(a) - ordenCola(b))) {
      const e = leerEstado(v.id);
      const dir = path.join(DIR_SALIDA, v.id);
      const master = path.join(dir, "master-1080p.mp4");
      if (!["listo", "listo_sin_voz"].includes(e.estado) || !fs.existsSync(master)) continue;
      const rutas = { master, video720: path.join(dir, "video-720p.mp4"), poster: path.join(dir, "poster.jpg"), miniatura: path.join(dir, "miniatura.jpg"), srt: path.join(dir, "subtitulos.es-MX.srt"), vtt: path.join(dir, "subtitulos.es-MX.vtt"), texto: path.join(dir, "youtube.txt") };
      const txt = fs.readFileSync(rutas.texto, "utf8");
      const descripcion = txt.split("DESCRIPCIÓN\n")[1]?.split("\n\nETIQUETAS")[0] ?? v.resumen;
      const meta = { descripcion, duracion: e.duracion, conVoz: e.estado === "listo", commit: e.commit ?? ctx.commit };
      await publicarVideo({ c: cd, video: v, rutas, meta, masterAqui: true });
      if (OPC.prod) await publicarVideo({ c: ctx.cprod, video: v, rutas, meta, masterAqui: ctx.mastersEnProd });
      console.log(`  ↑ ${v.id} publicado (${OPC.prod ? "desarrollo y producción" : "desarrollo"})`);
      n++;
    }
    console.log(`${n} videos publicados.`);
    return;
  }

  let cola = [...VIDEOS].filter((v) => !OPC.videos || OPC.videos.includes(v.id)).filter((v) => !OPC.area || v.area === OPC.area).sort((a, b) => ordenCola(a) - ordenCola(b));
  const hechos = [], saltados = [], errores = [];
  let listosEnTanda = 0, erroresSeguidos = 0;
  const q = hayLlave() ? await cuota() : null;
  const inicioTanda = Date.now();
  const pendientesDeGuion = cola.filter((v) => !fs.existsSync(path.join(DIR_VIDEOS, `${v.id}-${v.slug}.mjs`)));
  if (pendientesDeGuion.length) console.log(`(sin guion todavía: ${pendientesDeGuion.map((v) => v.id).join(", ")})`);
  cola = cola.filter((v) => fs.existsSync(path.join(DIR_VIDEOS, `${v.id}-${v.slug}.mjs`)));
  if (OPC.limite) cola = cola.slice(0, OPC.limite);

  const aprobados = cola.filter((v) => { const e = leerEstado(v.id); return OPC.regrabar || OPC.soloVoz || !["listo", "listo_sin_voz"].includes(e.estado) || (e.estado === "listo_sin_voz" && hayLlave()); });
  await aviso(`🎬 Tutoriales: arranca la producción\n• Videos en la cola: ${aprobados.length} de ${VIDEOS.length}.\n• Voz: ${hayLlave() ? (q?.limite ? `${q.usados.toLocaleString("es-MX")} de ${q.limite.toLocaleString("es-MX")} caracteres usados este mes; piso del ${PISO_PRESUPUESTO * 100} %.` : "con llave (no pude leer la cuota).") : "SIN ELEVENLABS_API_KEY en el entorno: los videos salen «listos menos voz» (pista en silencio, subtítulos y locución en guion.txt)."}\n• App: commit ${ctx.commit.slice(0, 7)} · demo con ${demo.clientes} clientes y ${demo.perros} perros.`);

  for (const v of cola) {
    const previo = leerEstado(v.id);
    const listo = ["listo", "listo_sin_voz"].includes(previo.estado);
    const g = await cargarGuion(v);
    const hashActual = g ? hashDe(v, g, path.join(DIR_VIDEOS, `${v.id}-${v.slug}.mjs`)) : null;
    // «Listo menos voz» deja de estar listo en cuanto hay llave: se vuelve a producir con voz.
    const faltaLaVoz = previo.estado === "listo_sin_voz" && hayLlave() && !previo.sinPresupuesto;
    if (listo && !faltaLaVoz && !OPC.regrabar && !OPC.soloVoz && previo.hash === hashActual) { saltados.push(v.id); continue; }
    console.log(`\n▶ ${v.id} ${v.titulo}  [${v.rol}]`);
    let ok = false, ultimo = null;
    const t0 = Date.now();
    await guardarEstado(c, v.id, { estado: "guion", intentos: 0, iniciadoAt: ahoraISO(), error: null, faseError: null });
    for (let intento = 1; intento <= OPC.intentos && !ok; intento++) {
      try {
        await guardarEstado(c, v.id, { intentos: intento });
        const r = await producir(v, ctx);
        console.log(`  ✔ ${r.estado} · ${Math.round(r.duracion)} s · master ${mb(r.tam)} MB · 720p ${mb(r.tam720)} MB · ${Math.round((Date.now() - t0) / 1000)} s de trabajo${r.defectos.length ? ` · ${r.defectos.length} defecto(s) de la app anotados` : ""}`);
        hechos.push({ v, ...r });
        ok = true; erroresSeguidos = 0; listosEnTanda++;
      } catch (e) {
        ultimo = e;
        console.warn(`  ✘ intento ${intento}/${OPC.intentos} (${e.fase ?? "grabado"}): ${e.message.split("\n")[0].slice(0, 400)}`);
        await guardarEstado(c, v.id, { estado: "error", faseError: e.fase ?? "grabado", error: e.message.slice(0, 500), intentos: intento });
        if (e.sinReintento) break;
        await dormir(2500);
      }
    }
    if (!ok) {
      errores.push({ v, e: ultimo });
      erroresSeguidos++;
      if (erroresSeguidos > OPC.erroresSeguidos) {
        await aviso(`⛔ Tutoriales: el corredor se detiene (${erroresSeguidos} videos con error seguidos)\n• Último: ${v.id} ${v.titulo}\n• Error: ${ultimo.message.split("\n")[0].slice(0, 300)}\n• Listos hasta ahora: ${hechos.length}.`);
        break;
      }
    }
    if (ok && listosEnTanda % 10 === 0) {
      await aviso(`🎬 Tutoriales: ${listosEnTanda} videos terminados en esta corrida\n• Último: ${v.id} ${v.titulo}\n• Con error: ${errores.length}${errores.length ? " (" + errores.map((x) => x.v.id).join(", ") + ")" : ""}\n• Tiempo: ${Math.round((Date.now() - inicioTanda) / 60000)} min.`);
    }
  }

  const minutos = Math.round((Date.now() - inicioTanda) / 60000);
  console.log(`\n══ Resumen: ${hechos.length} listos · ${saltados.length} ya estaban listos · ${errores.length} con error · ${minutos} min`);
  for (const x of errores) console.log(`  ✘ ${x.v.id} ${x.v.titulo}: ${x.e.message.split("\n")[0].slice(0, 200)}`);
  const sinVoz = hechos.filter((h) => h.estado === "listo_sin_voz").length;
  const defectos = hechos.flatMap((h) => h.defectos.map((d) => `${h.v.id}: ${d}`));
  if (defectos.length) { console.log("Defectos de la app anotados (no se parchan):"); defectos.forEach((d) => console.log(`  · ${d}`)); }
  fs.mkdirSync(DIR_SALIDA, { recursive: true });
  fs.writeFileSync(path.join(DIR_SALIDA, "ultima-corrida.json"), JSON.stringify({ fin: ahoraISO(), minutos, hechos: hechos.map((h) => ({ id: h.v.id, estado: h.estado, duracion: h.duracion, tam: h.tam, tam720: h.tam720 })), saltados, errores: errores.map((x) => ({ id: x.v.id, error: x.e.message })), defectos }, null, 2));
  if (OPC.prod && (hechos.length || errores.length)) {
    await aviso(`✅ Tutoriales: corrida terminada\n• Listos: ${hechos.length} (${sinVoz} sin voz) · ya estaban: ${saltados.length} · con error: ${errores.length}${errores.length ? " (" + errores.map((x) => x.v.id).join(", ") + ")" : ""}\n• Duración promedio: ${hechos.length ? Math.round(hechos.reduce((s, h) => s + h.duracion, 0) / hechos.length) : 0} s · master promedio: ${hechos.length ? mb(hechos.reduce((s, h) => s + h.tam, 0) / hechos.length) : 0} MB\n• Defectos de la app anotados: ${defectos.length}\n• Paquete de YouTube: /plataforma/tutoriales`);
  }
  void rpc;
}

main().catch(async (e) => {
  console.error(`\n✘ El corredor se detuvo: ${e.message}`);
  if (OPC.prod) await aviso(`⛔ Tutoriales: el corredor se detuvo\n• ${e.message.slice(0, 400)}`).catch(() => {});
  process.exit(1);
});
