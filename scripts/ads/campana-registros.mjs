// Uso: node scripts/ads/campana-registros.mjs [--crear]
//   sin bandera: SOLO comprueba (lectura y estimaciones); no crea nada.
//   --crear:     crea la campaña, el conjunto y los tres anuncios, TODO EN PAUSA.
//
// La primera campaña de PeluDesk (registros de prueba gratis): objetivo Ventas
// con el píxel PeluDesk y CompleteRegistration. Nada se enciende desde aquí:
// la persona dueña la activa en el Administrador de anuncios. Es idempotente:
// lo que ya existe por nombre se reusa, y los ids quedan en
// scripts/ads/estado-campana-registros.json.
import fs from "node:fs";
import { get, post, error, CUENTA, PAGINA, INSTAGRAM, PIXEL } from "./_lib.mjs";

const CREAR = process.argv.includes("--crear");
const ESTADO = new URL("./estado-campana-registros.json", import.meta.url);
const estado = fs.existsSync(ESTADO) ? JSON.parse(fs.readFileSync(ESTADO, "utf8")) : { videos: {}, imagenes: {}, anuncios: {} };
const guardar = () => fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 2) + "\n");
const tronar = (que, r) => {
  console.error(`\n✗ ${que}\n  ${error(r)}`);
  process.exit(1);
};

const NOMBRE_CAMPANA = "PeluDesk · Registros · Prueba de creativos · oct 2026";
const NOMBRE_CONJUNTO = "México · 25-55 · servicios caninos × dueños de negocio";
const PRESUPUESTO_DIARIO = 26500; // $265 MXN, en centavos
const BASE_VIDEOS = "https://peludesk.mx/peludesk/redes/videos";

const I = (id, name) => ({ id, name });
// «Dog daycare» y «Pet Hotel» los retiró Meta (sus sustitutos son «Dogs» y
// «Pet sitting»); «Dogs» solo es muy amplio (18-21 M), así que no entra.
// Servicios caninos Y dueños de negocio: dos grupos, ambos deben cumplirse.
const SERVICIO = [I("6003117329068", "Dog grooming"), I("6002980677923", "Pet sitting"), I("6003373684165", "Pet Care")];
const NEGOCIO = [I("6002884511422", "Small business"), I("6003371567474", "Entrepreneurship")];
const PUBLICO = {
  geo_locations: { countries: ["MX"] },
  age_min: 25,
  age_max: 55,
  flexible_spec: [{ interests: SERVICIO }, { interests: NEGOCIO }],
  // Solo Facebook e Instagram (sin Audience Network ni Messenger), en reels, feed e historias.
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["feed", "story", "facebook_reels"],
  instagram_positions: ["stream", "story", "reels"],
  targeting_automation: { advantage_audience: 0 },
};

const url = (video) => `https://peludesk.mx/registro?utm_source=meta&utm_medium=paid&utm_campaign=registros-oct26&utm_content=${video}`;
const ANUNCIOS = [
  {
    video: "ese-perro-no-esta-vacunado",
    nombre: "Ese perro no está vacunado",
    titulo: "Ese perro no está vacunado",
    texto: "¿Te enteraste de la vacuna vencida cuando el perro ya estaba adentro?\nEn PeluDesk, si una vacuna venció, no te deja reservar guardería ni hotel, y te dice cuál falta.\n15 días gratis, sin tarjeta.",
  },
  {
    video: "corte-de-caja",
    nombre: "Tu corte de caja, sin sorpresas",
    titulo: "Tu corte de caja, sin sorpresas",
    texto: "¿Cierras el día y la caja no te cuadra?\nCobras con terminal, la propina va aparte y al cerrar el corte te dice si cuadró, método por método.\nPruébalo 15 días gratis, sin tarjeta.",
  },
  {
    video: "un-dia-en-tu-guarderia",
    nombre: "Un día en tu guardería",
    titulo: "Un día en tu guardería",
    texto: "La libreta, los chats sin contestar y el cupo en la cabeza.\nCon PeluDesk la agenda, el cupo, las vacunas y la caja están en un solo lugar.\nPruébalo 15 días gratis, sin tarjeta.",
  },
];
for (const a of ANUNCIOS) if (a.titulo.length > 40) throw new Error(`Título de más de 40 caracteres: ${a.titulo}`);

console.log(`=== ${CREAR ? "CREAR (todo en PAUSA)" : "comprobar (no crea nada)"} ===\n`);

// ── Comprobaciones ──
const cuenta = await get(`${CUENTA}?fields=account_status,currency,funding_source_details`);
if (!cuenta.ok || cuenta.cuerpo.account_status !== 1 || cuenta.cuerpo.currency !== "MXN") tronar("La cuenta publicitaria no está activa en MXN", cuenta);
console.log(`ok  cuenta activa, MXN, pago ${cuenta.cuerpo.funding_source_details?.display_string}`);
for (const a of ANUNCIOS) {
  for (const f of [`${a.video}-9x16-subtitulos.mp4`, `${a.video}-9x16.jpg`]) {
    const r = await fetch(`${BASE_VIDEOS}/${f}`, { method: "HEAD" });
    if (!r.ok) tronar(`No se ve en línea ${f} (¿está desplegado?)`, { cuerpo: { estado: r.status } });
  }
}
console.log("ok  los 3 videos 9:16 con subtítulos y sus portadas están en línea");
const pix = await get(`${PIXEL}?fields=name,last_fired_time,is_unavailable`);
if (!pix.ok || pix.cuerpo.is_unavailable) tronar("El píxel no está disponible", pix);
console.log(`ok  píxel ${pix.cuerpo.name}, último evento ${pix.cuerpo.last_fired_time}`);
const est = await get(`${CUENTA}/reachestimate?targeting_spec=${encodeURIComponent(JSON.stringify(PUBLICO))}`);
if (!est.ok) tronar("Meta rechaza el público (¿algún interés retirado?)", est);
console.log(`ok  público válido: ${est.cuerpo.data.users_lower_bound}-${est.cuerpo.data.users_upper_bound} personas`);
if (!CREAR) {
  console.log("\nTodo listo para --crear.");
  process.exit(0);
}

// ── Videos y portadas ──
for (const a of ANUNCIOS) {
  if (!estado.videos[a.video]) {
    const r = await post(`${CUENTA}/advideos`, { file_url: `${BASE_VIDEOS}/${a.video}-9x16-subtitulos.mp4`, name: `PeluDesk · ${a.nombre} · 9x16 subtítulos` });
    if (!r.ok) tronar(`Subir el video ${a.video}`, r);
    estado.videos[a.video] = r.cuerpo.id;
    guardar();
    console.log(`    video ${a.video} → ${r.cuerpo.id}`);
  }
  if (!estado.imagenes[a.video]) {
    const bytes = fs.readFileSync(new URL(`../../public/peludesk/redes/videos/${a.video}-9x16.jpg`, import.meta.url)).toString("base64");
    const r = await post(`${CUENTA}/adimages`, { bytes, name: `PeluDesk · ${a.nombre} · portada` });
    const hash = Object.values(r.cuerpo.images ?? {})[0]?.hash;
    if (!r.ok || !hash) tronar(`Subir la portada de ${a.video}`, r);
    estado.imagenes[a.video] = hash;
    guardar();
  }
}
for (const a of ANUNCIOS) {
  for (let i = 0; i < 60; i++) {
    const r = await get(`${estado.videos[a.video]}?fields=status`);
    const s = r.cuerpo.status?.video_status;
    if (s === "ready") break;
    if (s === "error") tronar(`Meta no procesó el video ${a.video}`, r);
    if (i === 59) tronar(`El video ${a.video} no terminó de procesarse`, r);
    await new Promise((x) => setTimeout(x, 10000));
  }
}
console.log("ok  videos procesados por Meta");

// ── Campaña ──
const camps = await get(`${CUENTA}/campaigns?fields=id,name&limit=200`);
let campana = (camps.cuerpo.data ?? []).find((c) => c.name === NOMBRE_CAMPANA)?.id;
if (!campana) {
  const r = await post(`${CUENTA}/campaigns`, {
    name: NOMBRE_CAMPANA,
    objective: "OUTCOME_SALES",
    status: "PAUSED",
    special_ad_categories: [],
    buying_type: "AUCTION",
    daily_budget: PRESUPUESTO_DIARIO,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
  });
  if (!r.ok) tronar("Crear la campaña", r);
  campana = r.cuerpo.id;
}
estado.campana = campana;
guardar();
console.log(`ok  campaña ${campana}`);

// ── Conjunto ──
const sets = await get(`${campana}/adsets?fields=id,name&limit=50`);
let conjunto = (sets.cuerpo.data ?? []).find((s) => s.name === NOMBRE_CONJUNTO)?.id;
if (!conjunto) {
  const r = await post(`${CUENTA}/adsets`, {
    name: NOMBRE_CONJUNTO,
    campaign_id: campana,
    status: "PAUSED",
    billing_event: "IMPRESSIONS",
    optimization_goal: "OFFSITE_CONVERSIONS",
    destination_type: "WEBSITE",
    promoted_object: { pixel_id: PIXEL, custom_event_type: "COMPLETE_REGISTRATION" },
    targeting: PUBLICO,
  });
  if (!r.ok) tronar("Crear el conjunto de anuncios", r);
  conjunto = r.cuerpo.id;
}
estado.conjunto = conjunto;
guardar();
console.log(`ok  conjunto ${conjunto}`);

// ── Anuncios ──
for (const a of ANUNCIOS) {
  if (estado.anuncios[a.video]) continue;
  const cr = await post(`${CUENTA}/adcreatives`, {
    name: `PeluDesk · ${a.nombre}`,
    object_story_spec: {
      page_id: PAGINA,
      instagram_user_id: INSTAGRAM,
      video_data: {
        video_id: estado.videos[a.video],
        image_hash: estado.imagenes[a.video],
        title: a.titulo,
        message: a.texto,
        call_to_action: { type: "SIGN_UP", value: { link: url(a.video) } },
      },
    },
  });
  if (!cr.ok) tronar(`Crear la creatividad de ${a.video}`, cr);
  const ad = await post(`${CUENTA}/ads`, { name: a.nombre, adset_id: conjunto, creative: { creative_id: cr.cuerpo.id }, status: "PAUSED" });
  if (!ad.ok) tronar(`Crear el anuncio ${a.video}`, ad);
  estado.anuncios[a.video] = { ad: ad.cuerpo.id, creativo: cr.cuerpo.id };
  guardar();
  console.log(`ok  anuncio ${a.nombre} → ${ad.cuerpo.id}`);
}
console.log("\nListo: todo en PAUSA.");
