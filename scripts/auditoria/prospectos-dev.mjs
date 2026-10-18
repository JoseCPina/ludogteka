// CRM de prospectos y prospección diaria (17 de octubre de 2026). Solo DESARROLLO.
//
//   node scripts/auditoria/prospectos-dev.mjs            (Google de mentiras en el 4461 y webs en el 4462)
//   REAL=1 CIUDAD="San Luis Potosí" GIRO=guarderia node scripts/auditoria/prospectos-dev.mjs
//        (además, una búsqueda REAL contra Google Places con GOOGLE_PLACES_API_KEY: 3 llamadas)
//
// Corre el MISMO motor que la tarea diaria (src/lib/prospectos/correr.ts) sobre una ciudad inventada y comprueba:
// nuevos, duplicados por teléfono / dominio / nombre + ciudad / id de Google, que dos negocios con su Facebook NO
// son el mismo, giro «mixto», cerrados que no entran, marca de negocio de PeluDesk (teléfono de registro, correo
// del admin y nombre), correo/Instagram/WhatsApp desde la web, tope de búsquedas, pausa, sin llave, segunda
// corrida sin nuevos, historial de etapa, el acceso (anon, admin de un negocio, admin de la plataforma), las
// funciones solo del servidor y auditoria_frontera() vacía. Al final borra todo lo que creó.
import http from "node:http";
import { claveAleatoria } from "../lib/clave.mjs";
import { A, URL, env, sesion } from "./sesiones-dev.mjs";
import { createClient } from "@supabase/supabase-js";
import { correrProspeccion } from "../../src/lib/prospectos/correr.ts";
import { buscarTexto } from "../../src/lib/prospectos/places.ts";
import { revisarWeb, extraerContactos } from "../../src/lib/prospectos/web.ts";
import { ciudadDeDireccion, claveMarca, agruparSucursales, procesarCalidad, revisarHotelGuarderia, MOTIVO_HOTEL, MOTIVO_GUARDERIA } from "../../src/lib/prospectos/calidad.ts";
import { clasificarLote, giroDeServicios } from "../../src/lib/prospectos/clasificar.ts";
import { crearLlamarIA } from "../../src/lib/prospectos/ia.ts";
import { armarLista } from "../../src/lib/prospectos/lista.ts";
import { mensajeDePlantilla, redactarLote, serviciosSeguros, serviciosAjenos, datosParaIA } from "../../src/lib/prospectos/mensajes.ts";

let fallas = 0;
const ok = (c, bien, mal) => {
  if (c) console.log(`  ✔ ${bien}`);
  else {
    fallas++;
    console.log(`  ✘ ${mal ?? bien}`);
  }
};

const SUF = String(Date.now()).slice(-6);
const CIUDAD = `Ciudad Auditoria ${SUF}`;
const tel = (n) => `444 ${SUF.slice(0, 3)} ${String(n).padStart(4, "0")}`;

// Un negocio real de PeluDesk para la marca de cliente: teléfono de registro, nombre y correo de un admin.
const { data: negs } = await A.from("negocios").select("id, nombre, plan").neq("plan", "demo").limit(500);
const { data: reg } = await A.from("registros_prueba").select("telefono, negocio_id").in("negocio_id", (negs ?? []).map((n) => n.id)).not("telefono", "is", null).is("deleted_at", null).limit(20);
const negTel = (reg ?? []).find((r) => negs?.find((n) => n.id === r.negocio_id && n.plan !== "demo"));
const { data: negNombre } = await A.from("negocios").select("id, nombre").eq("slug", "huellitas").maybeSingle();
const { data: mAdmins } = await A.from("membresias").select("negocio_id, profile_id").eq("rol", "admin").is("deleted_at", null).eq("negocio_id", negNombre.id).limit(5);
let correoAdmin = null;
for (const m of mAdmins ?? []) {
  const { data: u } = await A.auth.admin.getUserById(m.profile_id);
  if (u?.user?.email && !u.user.email.endsWith("@telefono.ludogteka.mx")) { correoAdmin = u.user.email; break; }
}

// ── Webs de mentiras ─────────────────────────────────────────────────────────────────────────────────────────
// Fotos de un color (para la página por giro: el acento sale de la foto).
const sharp = (await import("sharp")).default;
const fotoDeColor = (hex) => sharp({ create: { width: 160, height: 120, channels: 3, background: hex } }).jpeg().toBuffer();
const webs = http.createServer(async (req, res) => {
  const mf = req.url.match(/^\/foto(?:-([0-9a-f]{6}))?\.jpg/);
  if (mf) {
    res.setHeader("Content-Type", "image/jpeg");
    return res.end(await fotoDeColor(`#${mf[1] ?? "8a8a8a"}`));
  }
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.url === "/fido") return res.end(`<a href="mailto:hola&#64;fido-${SUF}.mx">Escríbenos</a> <a href="https://instagram.com/fido_${SUF}">IG</a> <a href="https://wa.me/524441234567">WA</a> <a href="https://instagram.com/p/xyz">post</a>`);
  if (req.url === "/canspa") return res.end(`<a href="/contacto">Contacto</a> <a href="https://www.facebook.com/sharer.php">compartir</a> <a href="https://facebook.com/CanSpa${SUF}">FB</a>`);
  if (req.url === "/contacto") return res.end(`Correo: contacto@canspa-${SUF}.com.mx · imagen logo@2x.png`);
  if (req.url === "/cliente") return res.end(`<p>${correoAdmin ?? "nadie@ejemplo.org"}</p>`);
  res.statusCode = 404;
  res.end("no");
});
await new Promise((r) => webs.listen(4462, "127.0.0.1", r));
const W = "http://127.0.0.1:4462";

// ── Google Places de mentiras ────────────────────────────────────────────────────────────────────────────────
const lugar = (id, nombre, extra = {}) => ({ id: `aud${SUF}_${id}`, displayName: { text: nombre }, formattedAddress: `Calle ${id}, ${CIUDAD}`, rating: 4.6, userRatingCount: 37, types: ["pet_care"], businessStatus: "OPERATIONAL", ...extra });
const RESPUESTAS = {
  guarderia: [
    [
      lugar("fido", `Guardería Fido ${SUF}`, { nationalPhoneNumber: tel(1), websiteUri: `http://fido${SUF}.test/` }),
      lugar("canspa", `Can Spa ${SUF}`, { nationalPhoneNumber: tel(2), websiteUri: `https://canspa${SUF}.test/` }),
      lugar("fb1", `Patitas Felices ${SUF}`, { nationalPhoneNumber: tel(3), websiteUri: `https://www.facebook.com/patitas${SUF}` }),
      lugar("fb2", `Huellas Alegres ${SUF}`, { nationalPhoneNumber: tel(4), websiteUri: `https://www.facebook.com/huellas${SUF}` }),
      lugar("cerrado", `Guardería Cerrada ${SUF}`, { nationalPhoneNumber: tel(5), businessStatus: "CLOSED_PERMANENTLY" }),
    ],
    [
      lugar("mismo-tel", `Otro nombre del Fido ${SUF}`, { nationalPhoneNumber: `+52 1 ${tel(1)}` }),
      lugar("mismo-nombre", `GUARDERÍA  FIDO ${SUF}`, {}),
      lugar("cliente-tel", `Negocio de PeluDesk ${SUF}`, negTel ? { nationalPhoneNumber: negTel.telefono } : {}),
      lugar("cliente-nombre", negNombre.nombre, { nationalPhoneNumber: tel(6) }),
      lugar("cliente-correo", `Cliente por correo ${SUF}`, { nationalPhoneNumber: tel(7), websiteUri: `http://cliente${SUF}.test/` }),
    ],
  ],
  hotel: [
    [
      lugar("fido", `Guardería Fido ${SUF}`, { nationalPhoneNumber: tel(1), websiteUri: `http://fido${SUF}.test/` }),
      lugar("dominio", `Fido Hotel sucursal ${SUF}`, { nationalPhoneNumber: tel(8), websiteUri: `https://www.fido${SUF}.test/hotel` }),
      lugar("hotel", `Hotel Canino ${SUF}`, { nationalPhoneNumber: tel(9) }),
    ],
  ],
};
let llamadas = 0;
const places = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  llamadas++;
  res.setHeader("Content-Type", "application/json");
  // Doble de Anthropic (clasificar y redactar): decide por el nombre, sin red.
  if (req.url === "/v1/messages") {
    const b = JSON.parse(cuerpo);
    const herr = b.tools?.[0]?.name;
    const bloques = String(b.messages?.[0]?.content ?? "").split(/\n\n/).map((t) => Object.fromEntries(t.split("\n").map((l) => [l.slice(0, l.indexOf(":")), l.slice(l.indexOf(":") + 2)])));
    const items = bloques.filter((x) => x.id && !/Clasifica|Escribe/.test(x.id));
    const input =
      herr === "clasificacion"
        ? { negocios: items.map((x) => ({ id: x.id, servicios: /hotel/i.test(x.nombre) ? ["hotel"] : ["guarderia"], es_del_giro: !/adiestramiento|refugio/i.test(x.nombre), motivo: /adiestramiento/i.test(x.nombre) ? "Adiestramiento canino, sin guardería ni hotel" : "Guardería" })) }
        : { mensajes: items.map((x, i) => ({ id: x.id, texto: `${["Hola", "Qué tal", "Buen día"][i % 3]}, ${String(x.negocio).split(" (")[0]}. Mensaje de prueba ${x.tipo}.\n${x.link}\nJosé, de PeluDesk` })) };
    return res.end(JSON.stringify({ content: [{ type: "tool_use", name: herr, input }] }));
  }
  if (req.headers["x-goog-api-key"] !== "llave-de-prueba") {
    res.statusCode = 403;
    return res.end(JSON.stringify({ error: { message: "API key not valid", status: "PERMISSION_DENIED" } }));
  }
  // Place Details y la foto (para la página personalizada): lo que se pide al mostrarla.
  if (req.method === "GET" && /\/media\?/.test(req.url)) {
    const color = req.url.match(/photos\/c([0-9a-f]{6})/)?.[1];
    return res.end(JSON.stringify({ photoUri: color ? `${W}/foto-${color}.jpg` : `${W}/foto.jpg` }));
  }
  const giroWeb = req.url.match(/^\/places\/aud\d+_web_(vet|est|hot)/)?.[1];
  if (req.method === "GET" && giroWeb) {
    const color = { vet: "1a8fb0", est: "d0457a", hot: "3f7a46" }[giroWeb];
    const periodos = [1, 2, 3, 4, 5, 6].map((d) => ({ open: { day: d, hour: 9, minute: 0 }, close: { day: d, hour: d === 6 ? 14 : 19, minute: 0 } }));
    return res.end(JSON.stringify({
      displayName: { text: "Lugar" }, formattedAddress: "Av. Prueba 10, Centro, 78000 San Luis Potosí, S.L.P., México", rating: 4.7, userRatingCount: 210,
      regularOpeningHours: { periods: periodos, weekdayDescriptions: [] }, googleMapsUri: "https://maps.google.com/?cid=2",
      reviews: [
        { rating: 5, text: { text: `Reseña destacada ${giroWeb}: nos atendieron con muchísimo cariño y muy puntuales.` }, relativePublishTimeDescription: "hace 2 semanas", authorAttribution: { displayName: "Clienta de Prueba", uri: "https://maps.google.com/contrib/2" } },
        { rating: 1, text: { text: "Mala." }, authorAttribution: { displayName: "Otra" } },
      ],
      photos: [0, 1, 2].map((i) => ({ name: `places/x/photos/c${color}${i}`, authorAttributions: [{ displayName: "Fotógrafa de Prueba", uri: "https://maps.google.com/contrib/1" }] })),
    }));
  }
  if (req.method === "GET" && req.url.startsWith("/places/")) {
    return res.end(JSON.stringify({
      displayName: { text: "Lugar de prueba" }, formattedAddress: "Av. Prueba 1, Centro, 78000 San Luis Potosí, S.L.P., México", rating: 4.8, userRatingCount: 120,
      regularOpeningHours: { weekdayDescriptions: ["lunes: 9:00–19:00", "sábado: 10:00–14:00"] }, googleMapsUri: "https://maps.google.com/?cid=1",
      photos: [{ name: `places/x/photos/f1`, authorAttributions: [{ displayName: "Fotógrafa de Prueba", uri: "https://maps.google.com/contrib/1" }] }],
    }));
  }
  if (req.headers["x-goog-api-key"] !== "llave-de-prueba") {
    res.statusCode = 403;
    return res.end(JSON.stringify({ error: { message: "API key not valid", status: "PERMISSION_DENIED" } }));
  }
  const b = JSON.parse(cuerpo || "{}");
  const giro = /hotel|pensi/i.test(b.textQuery) ? "hotel" : /guarder/i.test(b.textQuery) ? "guarderia" : null;
  const paginas = giro ? RESPUESTAS[giro] : [[]];
  const n = b.pageToken ? Number(b.pageToken) : 0;
  res.end(JSON.stringify({ places: paginas[n] ?? [], ...(n + 1 < paginas.length ? { nextPageToken: String(n + 1) } : {}) }));
});
await new Promise((r) => places.listen(4461, "127.0.0.1", r));
const PU = "http://127.0.0.1:4461";

const { data: ajustesAntes } = await A.from("prospeccion_ajustes").select("*").eq("id", 1).single();
const corridas = [];
const fechasLista = [];
const paraPantalla = {};
const inicioPrueba = new Date().toISOString();
const correr = (o = {}) =>
  correrProspeccion({
    db: A,
    apiKey: "apiKey" in o ? o.apiKey : "llave-de-prueba",
    buscar: (consulta, pageToken) => buscarTexto({ apiKey: "apiKey" in o ? o.apiKey : "llave-de-prueba", consulta, pageToken, url: PU }),
    revisarWeb: (w) => revisarWeb(!/\.test\//.test(w) ? w : `${W}/${new globalThis.URL(w).hostname.replace(/^www\./, "").split(SUF)[0]}`, 4000),
    origen: o.origen ?? "script",
    tope: o.tope ?? 20,
    ciudades: [CIUDAD],
    giros: o.giros ?? ["guarderia", "hotel"],
    presupuestoMs: 120_000,
  }).then((r) => (corridas.push(r.id), r));
const mios = async () => (await A.from("prospectos").select("*").eq("ciudad", CIUDAD).is("deleted_at", null).order("nombre")).data ?? [];

try {
  console.log("\n1. Extracción de la web (sin red)");
  const c = extraerContactos(`x <a href="mailto:ventas&#64;mi-sitio.mx">a</a> otro@gmail.com <a href="https://instagram.com/reel/abc">r</a> instagram.com/mi.perfil api.whatsapp.com/send?phone=5214449998877`, "mi-sitio.mx");
  ok(c.correo === "ventas@mi-sitio.mx", "prefiere el correo del propio dominio", `correo: ${c.correo}`);
  ok(c.instagram === "https://www.instagram.com/mi.perfil", "Instagram: salta /reel/ y toma el perfil", `instagram: ${c.instagram}`);
  ok(c.whatsapp === "4449998877", "WhatsApp desde api.whatsapp.com", `whatsapp: ${c.whatsapp}`);

  console.log("\n2. Primera corrida (guardería y hotel en una ciudad)");
  const r1 = await correr();
  const l1 = await mios();
  const por = (id) => l1.find((p) => p.google_place_id === `aud${SUF}_${id}`);
  ok(r1.estado === "terminada", "la corrida termina", `estado ${r1.estado}: ${r1.error}`);
  ok(!por("cerrado"), "un negocio cerrado definitivamente no entra");
  ok(!por("mismo-tel") && !por("mismo-nombre") && !por("dominio"), "duplicados por teléfono (+52 1), nombre + ciudad y dominio no se crean otra vez", `creados: ${["mismo-tel", "mismo-nombre", "dominio"].filter(por)}`);
  ok(por("fb1") && por("fb2"), "dos negocios con su Facebook como «web» NO son duplicados");
  ok(por("fido")?.giro === "mixto", "el que sale en guardería y en hotel queda «mixto»", `giro ${por("fido")?.giro}`);
  ok(por("hotel")?.giro === "hotel" && por("canspa")?.giro === "guarderia", "cada uno con su giro");
  ok(por("fido")?.correo === `hola@fido-${SUF}.mx` && por("fido")?.instagram === `https://www.instagram.com/fido_${SUF}` && por("fido")?.whatsapp === "4441234567", "correo, Instagram y WhatsApp desde su web", JSON.stringify({ c: por("fido")?.correo, i: por("fido")?.instagram, w: por("fido")?.whatsapp }));
  ok(por("canspa")?.correo === `contacto@canspa-${SUF}.com.mx` && por("canspa")?.facebook === `https://www.facebook.com/CanSpa${SUF}`, "sin correo en la portada, lo busca en «contacto»; Facebook sin el botón de compartir", JSON.stringify({ c: por("canspa")?.correo, f: por("canspa")?.facebook }));
  ok(por("fb1")?.facebook === `https://www.facebook.com/patitas${SUF}`, "la «web» de Facebook se vuelve su Facebook");
  ok(por("fido")?.calificacion == 4.6 && por("fido")?.resenas === 37 && por("fido")?.web_revisada_at, "calificación, reseñas y web revisada");
  if (negTel) ok(por("cliente-tel")?.negocio_cliente_id === negTel.negocio_id && por("cliente-tel")?.cliente_por === "telefono", "un negocio de PeluDesk se reconoce por su teléfono de registro", JSON.stringify(por("cliente-tel")));
  else console.log("  · no hay registros de prueba con teléfono en desarrollo: marca por teléfono sin probar");
  ok(por("cliente-nombre")?.negocio_cliente_id === negNombre.id && por("cliente-nombre")?.cliente_por === "nombre", "y por su nombre", JSON.stringify(por("cliente-nombre")?.cliente_por));
  if (correoAdmin) ok(por("cliente-correo")?.negocio_cliente_id === negNombre.id && por("cliente-correo")?.cliente_por === "correo", "y por el correo de un admin (leído de su web)", JSON.stringify(por("cliente-correo")));
  const nuevosEsperados = l1.filter((p) => !p.negocio_cliente_id).length;
  ok(r1.nuevos === nuevosEsperados, `la corrida cuenta ${r1.nuevos} nuevos (= prospectos que no son de PeluDesk)`, `nuevos ${r1.nuevos} vs ${nuevosEsperados}`);
  ok(r1.duplicados >= 4, `cuenta los duplicados (${r1.duplicados})`);
  const { data: c1 } = await A.from("prospeccion_corridas").select("*").eq("id", r1.id).single();
  ok(c1.nuevos === r1.nuevos && c1.fin_at && c1.busquedas === r1.busquedas, "deja su registro en prospeccion_corridas");
  const { data: rs } = await A.rpc("prospectos_resumen");
  ok(rs.por_ciudad_giro.some((x) => x.ciudad === CIUDAD && x.giro === "mixto" && x.n === 1), "el resumen cuenta por ciudad y giro sin los de PeluDesk");

  console.log("\n3. Segunda corrida: nada nuevo");
  const r2 = await correr();
  ok(r2.nuevos === 0 && (await mios()).length === l1.length, "repetir no crea nada", `nuevos ${r2.nuevos}`);

  console.log("\n4. Tope, sin llave, llave mala y pausa");
  const r3 = await correr({ tope: 1 });
  ok(r3.busquedas === 1, "el tope de búsquedas se respeta", `búsquedas ${r3.busquedas}`);
  const r4 = await correr({ apiKey: null });
  ok(r4.estado === "sin_llave" && r4.busquedas === 0, "sin llave no busca y lo registra", r4.estado);
  const antes = llamadas;
  const r5 = await correr({ apiKey: "mala" });
  ok(r5.estado === "fallida" && llamadas - antes === 1, "una llave inválida corta a la primera llamada", `${r5.estado} · ${llamadas - antes} llamadas`);
  await A.from("prospeccion_ajustes").update({ pausado: true }).eq("id", 1);
  const r6 = await correr({ origen: "cron" });
  ok(r6.estado === "pausada" && r6.busquedas === 0, "en pausa la tarea diaria no busca");
  await A.from("prospeccion_ajustes").update({ pausado: ajustesAntes.pausado }).eq("id", 1);

  console.log("\n5. Acceso");
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: va, error: ea } = await anon.from("prospectos").select("id").limit(1);
  ok(ea || (va ?? []).length === 0, "la llave anónima no ve prospectos");
  const { error: ear } = await anon.rpc("prospecto_registrar", { p: { nombre: "x", giro: "hotel", ciudad: CIUDAD } });
  ok(ear, "la llave anónima no registra prospectos");
  const { data: adm } = await A.from("membresias").select("profile_id").eq("rol", "admin").eq("negocio_id", negNombre.id).is("deleted_at", null).limit(1).single();
  const N = await sesion(adm.profile_id);
  for (const t of ["prospectos", "prospectos_eventos", "prospeccion_ajustes", "prospeccion_corridas", "prospeccion_cursores"]) {
    const { data } = await N.from(t).select("*").limit(5);
    ok((data ?? []).length === 0, `el admin de un negocio no lee ${t}`);
  }
  const { error: en1 } = await N.from("prospectos").insert({ nombre: `Intruso ${SUF}`, giro: "hotel", ciudad: CIUDAD });
  ok(en1, "el admin de un negocio no crea prospectos");
  const { data: nupd } = await N.from("prospectos").update({ etapa: "pagando" }).eq("ciudad", CIUDAD).select("id");
  ok((nupd ?? []).length === 0, "ni los cambia");
  for (const fn of ["prospecto_registrar", "prospecto_completar_web", "prospectos_revisar_clientes", "prospecto_negocio_de"]) {
    const args = { prospecto_registrar: { p: {} }, prospecto_completar_web: { p_id: l1[0].id, p: {} }, prospectos_revisar_clientes: {}, prospecto_negocio_de: { p_telefono_norm: null, p_correo: null, p_nombre_norm: null } }[fn];
    const { error } = await N.rpc(fn, args);
    ok(error, `${fn} es solo del servidor`);
  }
  const { data: pa } = await A.from("plataforma_admins").select("profile_id").limit(1);
  const P = await sesion(pa[0].profile_id);
  const fido = (await mios()).find((p) => p.google_place_id === `aud${SUF}_fido`);
  const { data: pl } = await P.from("prospectos").select("id").eq("ciudad", CIUDAD);
  ok((pl ?? []).length === l1.length, "la administración de PeluDesk lee los prospectos");
  const { error: pe } = await P.from("prospectos").update({ etapa: "contactado", canal_ultimo_contacto: "whatsapp", ultimo_contacto_at: new Date().toISOString() }).eq("id", fido.id);
  ok(!pe, "la administración de PeluDesk cambia la etapa", pe?.message);
  await P.from("prospectos").update({ etapa: "respondio" }).eq("id", fido.id);
  const { error: pn } = await P.from("prospectos_eventos").insert({ prospecto_id: fido.id, tipo: "nota", texto: "Le interesa la guardería" });
  ok(!pn, "y agrega notas", pn?.message);
  const { data: hist } = await P.from("prospectos_eventos").select("tipo, etapa_anterior, etapa_nueva, canal").eq("prospecto_id", fido.id).order("created_at");
  ok(hist?.[0]?.tipo === "alta" && hist.some((h) => h.tipo === "etapa" && h.etapa_anterior === "nuevo" && h.etapa_nueva === "contactado" && h.canal === "whatsapp") && hist.some((h) => h.etapa_anterior === "contactado" && h.etapa_nueva === "respondio"), "el historial guarda alta y cada cambio de etapa con su canal", JSON.stringify(hist));
  const { error: pdup } = await P.from("prospectos").insert({ nombre: `guarderia fido ${SUF}`, giro: "hotel", ciudad: CIUDAD });
  ok(pdup && /nombre_ciudad/.test(pdup.message), "capturar a mano un duplicado (nombre + ciudad) lo rechaza la base");
  const { error: pdup2 } = await P.from("prospectos").insert({ nombre: `Distinto ${SUF}`, giro: "hotel", ciudad: CIUDAD, telefono: tel(9) });
  ok(pdup2 && /telefono/.test(pdup2.message), "y por teléfono");

  console.log("\n8. Etapa 2: ciudad, clasificación, sucursales y lista del día (base)");
  {
    const cd = (d) => ciudadDeDireccion(d)?.ciudad;
    ok(cd("Av. Carranza 1, Centro, 78000 San Luis Potosí, S.L.P., México") === "San Luis Potosí", "ciudad de la dirección: San Luis Potosí");
    ok(cd("Calle 2, Juárez, 06600 Cuauhtémoc, CDMX, México") === "Ciudad de México", "una alcaldía de la capital cuenta como Ciudad de México");
    ok(cd("Calle 3, Centro, 76000 Santiago de Querétaro, Qro., México") === "Querétaro" && cd("Calle 4, 78000 San Luis, S.L.P.") === "San Luis Potosí", "«Santiago de Querétaro» y «San Luis» se dicen como la gente los dice");
    ok(cd("Calle 5, Del Valle, 66220 San Pedro Garza García, N.L.") === "San Pedro Garza García" && ciudadDeDireccion("Calle 5, 66220 San Pedro Garza García, N.L.")?.estado === "Nuevo León", "otro municipio queda con su nombre y su estado");
    ok(claveMarca("CAN HIJOS") === claveMarca("CanHijos hotel & daycare") && claveMarca("CAN HIJOS") === "canhijos", "«CAN HIJOS» y «CanHijos hotel & daycare» son la misma marca");
    ok(claveMarca("Happy Dogs") === null && claveMarca("Pet Spa") === null, "una marca de menos de 6 letras («happy») no agrupa");
    const g = agruparSucursales([
      { id: "a", nombre: "CAN HIJOS", ciudad_norm: "san luis potosi", estado: "S", instagram: null, facebook: null, resenas: 3, principal_id: null },
      { id: "b", nombre: "CanHijos hotel & daycare", ciudad_norm: "san luis potosi", estado: "S", instagram: null, facebook: null, resenas: 80, principal_id: null },
      { id: "c", nombre: "Can Hijos", ciudad_norm: "queretaro", estado: "Q", instagram: null, facebook: null, resenas: 5, principal_id: null },
    ]);
    ok(g.get("a") === "b" && !g.has("b") && !g.has("c"), "misma marca en la misma ciudad: el de más reseñas queda de principal; en otra ciudad no se junta", JSON.stringify([...g]));

    // Prospectos de esta prueba en una ciudad inventada (con su dirección) para la calidad y la lista.
    const DIR = (i) => `Calle ${i}, Centro, 78000 San Luis Potosí, S.L.P., México`;
    const base = { giro: "guarderia", ciudad: CIUDAD, fuente: "manual", calificacion: 5, resenas: 9000 };
    const crear = async (x) => (await A.from("prospectos").insert({ ...base, ...x }).select("*").single()).data;
    const pAdies = await crear({ nombre: `Adiestramiento Rex ${SUF}`, direccion: DIR(1), telefono: tel(101) });
    const pGua = await crear({ nombre: `Guarderiamaxima canina ${SUF}`, direccion: DIR(2), telefono: tel(102), instagram: `https://www.instagram.com/gm${SUF}` });
    const pSuc = await crear({ nombre: `GUARDERIAMAXIMA canina ${SUF} sucursal`, direccion: DIR(3), telefono: tel(103), resenas: 4 });
    const pIg = await crear({ nombre: `Hotel Solo Insta para perros ${SUF}`, giro: "hotel", direccion: DIR(4), instagram: `https://www.instagram.com/hsi${SUF}` });
    const llamarFalso = crearLlamarIA({ apiKey: "x", url: PU });
    const rc = await procesarCalidad({ db: A, clasificar: (lote) => clasificarLote(lote, llamarFalso), giroDeServicios, presupuestoMs: 120_000 });
    const lee = async (id) => (await A.from("prospectos").select("*").eq("id", id).single()).data;
    const a1 = await lee(pAdies.id), g1 = await lee(pGua.id), s1 = await lee(pSuc.id), i1 = await lee(pIg.id);
    ok(a1.ciudad === "San Luis Potosí" && a1.ciudad_busqueda === CIUDAD, "la ciudad se corrige con la dirección y la de la búsqueda se conserva", `${a1.ciudad} / ${a1.ciudad_busqueda}`);
    ok(a1.etapa === "descartado" && a1.descarte_tipo === "no_es_del_giro" && /Adiestramiento/.test(a1.descarte_motivo), "adiestramiento: «Descartado (no es del giro)» con su motivo", JSON.stringify({ e: a1.etapa, m: a1.descarte_motivo }));
    ok(g1.etapa === "nuevo" && g1.clasificado_at && i1.giro === "hotel", "lo del giro queda vivo y clasificado");
    ok(s1.principal_id === g1.id, "la sucursal se agrupa bajo su principal", `principal ${s1.principal_id}`);
    ok(rc.descartados >= 1 && rc.sucursales >= 1, `el proceso lo cuenta (${rc.descartados} descartados, ${rc.sucursales} sucursales)`);
    const { data: hist } = await A.from("prospectos_eventos").select("tipo, texto").eq("prospecto_id", a1.id);
    ok(hist.some((h) => h.tipo === "clasificacion") && hist.some((h) => h.tipo === "ciudad"), "clasificación y ciudad quedan en el historial");
    const { data: rs2 } = await A.rpc("prospectos_resumen");
    ok(rs2.sucursales >= 1 && rs2.descartados_no_giro >= 1, "el resumen separa sucursales y descartados");
    // Revertir (lo que hace el botón de la ficha) y que la clasificación ya no lo vuelva a tocar.
    await A.from("prospectos").update({ etapa: "nuevo", descarte_tipo: null, descarte_motivo: null, clasificacion_revertida_at: new Date().toISOString() }).eq("id", a1.id);
    await A.from("prospectos").update({ clasificado_at: null }).eq("id", a1.id);
    await procesarCalidad({ db: A, clasificar: (lote) => clasificarLote(lote, llamarFalso), giroDeServicios, presupuestoMs: 60_000 });
    ok((await lee(a1.id)).etapa === "nuevo", "un descarte revertido no se vuelve a descartar");
    await A.from("prospectos").update({ etapa: "descartado", descarte_tipo: "no_es_del_giro" }).eq("id", a1.id);

    // Lista del día en una fecha inventada, con cupo chico, solo con estos prospectos arriba (5 estrellas, 9,000 reseñas).
    await A.from("prospeccion_ajustes").update({ lista_whatsapp: 2, lista_instagram: 1, dias_seguimiento: 3, max_seguimientos: 2 }).eq("id", 1);
    const F1 = "2099-01-01", F2 = "2099-01-05", F3 = "2099-01-09", F4 = "2099-01-13";
    fechasLista.push(F1, F2, F3, F4);
    const redactarFalso = (lote) => redactarLote(lote, llamarFalso, "José");
    const lista = (fecha, ahora) => armarLista({ db: A, fecha, sitio: "http://plataforma.localhost:3007", redactar: redactarFalso, plantilla: (p) => mensajeDePlantilla(p, "José"), ahora });
    const l1 = await lista(F1, new Date());
    const { data: c1 } = await A.from("prospectos_contactos").select("*").eq("fecha", F1);
    const de = (id) => c1.find((c) => c.prospecto_id === id);
    ok(l1.whatsapp === 2 && l1.instagram === 1, `respeta el cupo por canal (${l1.whatsapp} WhatsApp, ${l1.instagram} Instagram)`);
    ok(de(pGua.id)?.canal === "whatsapp" && !de(pAdies.id) && !de(pSuc.id), "los mejores con teléfono van a WhatsApp; ni descartados ni sucursales");
    ok(de(pIg.id)?.canal === "instagram", "el que solo tiene Instagram va a Instagram");
    ok(de(pGua.id)?.mensaje.includes(`/para/${g1.slug}`) && de(pGua.id)?.redactado_por === "ia", "cada uno lleva su mensaje con el link a su página");
    const varios = c1.map((c) => c.mensaje.split("\n")[0].split(",")[0]);
    ok(new Set(varios).size === varios.length, "los mensajes no empiezan igual");
    ok(mensajeDePlantilla({ id: "x1", nombre: "N", giro: "hotel", ciudad: "c", canal: "whatsapp", tipo: "primero", link: "L" }, "José") !== mensajeDePlantilla({ id: "x9", nombre: "N", giro: "hotel", ciudad: "c", canal: "whatsapp", tipo: "primero", link: "L" }, "José"), "las plantillas de respaldo también varían");
    const l1b = await lista(F1, new Date());
    ok(l1b.whatsapp + l1b.instagram === 0 && l1b.yaEstaba, "armarla otra vez el mismo día no duplica");
    // Mandar (lo que hace el botón) → contactado; a los 4 días sin respuesta ni visita → seguimiento 1.
    const { data: pa2 } = await A.from("plataforma_admins").select("profile_id").limit(1);
    const P2 = await sesion(pa2[0].profile_id);
    const { error: em } = await P2.rpc("plataforma_prospecto_contacto", { p_contacto: de(pGua.id).id, p_accion: "enviado" });
    ok(!em && (await lee(pGua.id)).etapa === "contactado" && (await lee(pGua.id)).canal_ultimo_contacto === "whatsapp", "al mandar, pasa a contactado con canal y fecha", em?.message);
    await P2.rpc("plataforma_prospecto_contacto", { p_contacto: de(pIg.id).id, p_accion: "enviado" });
    const { error: eN } = await (await sesion((await A.from("membresias").select("profile_id").eq("rol", "admin").eq("negocio_id", negNombre.id).is("deleted_at", null).limit(1).single()).data.profile_id)).rpc("plataforma_prospecto_contacto", { p_contacto: de(pGua.id).id, p_accion: "respondio" });
    ok(eN, "el admin de un negocio no marca contactos");
    const hace = (d) => new Date(Date.now() - d * 86_400_000).toISOString();
    await A.from("prospectos").update({ ultimo_contacto_at: hace(4) }).in("id", [pGua.id, pIg.id]);
    // El de Instagram abrió su página: caliente, ya no recibe seguimiento.
    await A.rpc("prospecto_registrar_visita", { p_slug: i1.slug, p_tipo: "visita", p_ip_hash: null, p_navegador: "Mozilla/5.0" });
    ok((await lee(pIg.id)).etapa === "caliente", "una visita a su página lo sube a «caliente»");
    await lista(F2, new Date());
    const { data: c2 } = await A.from("prospectos_contactos").select("*").eq("fecha", F2);
    const s1c = c2.find((c) => c.prospecto_id === pGua.id);
    ok(s1c?.tipo === "seguimiento_1" && s1c.canal === "whatsapp" && s1c.mensaje !== de(pGua.id).mensaje, "a los 3 días sin respuesta reaparece con un seguimiento distinto");
    ok(!c2.some((c) => c.prospecto_id === pIg.id), "el que visitó su página no recibe seguimiento");
    await P2.rpc("plataforma_prospecto_contacto", { p_contacto: s1c.id, p_accion: "enviado" });
    await A.from("prospectos").update({ ultimo_contacto_at: hace(4) }).eq("id", pGua.id);
    await lista(F3, new Date());
    const s2c = (await A.from("prospectos_contactos").select("*").eq("fecha", F3).eq("prospecto_id", pGua.id).maybeSingle()).data;
    ok(s2c?.tipo === "seguimiento_2", "luego el seguimiento 2");
    await P2.rpc("plataforma_prospecto_contacto", { p_contacto: s2c.id, p_accion: "enviado" });
    await A.from("prospectos").update({ ultimo_contacto_at: hace(4) }).eq("id", pGua.id);
    const l4 = await lista(F4, new Date());
    const g4 = await lee(pGua.id);
    ok(g4.contacto_pausado_at && l4.pausados >= 1 && !(await A.from("prospectos_contactos").select("id").eq("fecha", F4).eq("prospecto_id", pGua.id)).data.length, "después de 2 seguimientos queda en pausa");
    await P2.rpc("plataforma_prospecto_contacto", { p_contacto: s2c.id, p_accion: "respondio" });
    ok((await lee(pGua.id)).etapa === "respondio" && !(await lee(pGua.id)).contacto_pausado_at, "«Respondió» lo pasa a respondió");
    await P2.rpc("plataforma_prospecto_contacto", { p_contacto: de(pIg.id).id, p_accion: "no_interesa" });
    ok((await lee(pIg.id)).etapa === "descartado" && (await lee(pIg.id)).descarte_tipo === "no_le_interesa", "«No le interesa» lo descarta con ese motivo");
    await A.from("prospeccion_ajustes").update({ lista_whatsapp: ajustesAntes.lista_whatsapp ?? 15, lista_instagram: ajustesAntes.lista_instagram ?? 15 }).eq("id", 1);
    paraPantalla.gua = pGua.id;
    paraPantalla.adies = pAdies.id;
    paraPantalla.slugGua = g1.slug;
  }

  console.log("\n8b. Limpieza estricta de hotel y guardería (hoteles para personas y guarderías infantiles)");
  {
    const R = (x) => revisarHotelGuarderia({ giro_busqueda: null, google_tipos: [], web: null, web_resumen: null, instagram: null, facebook: null, ...x });
    ok(R({ nombre: "Hotel Continental", giro: "hotel", google_tipos: ["hotel", "lodging"] }) === MOTIVO_HOTEL, "hotel sin nada de mascotas: «Hotel para personas»");
    ok(R({ nombre: "Guardería 01 IMSS ORDINARIA", giro: "guarderia", google_tipos: ["child_care_agency"] }) === MOTIVO_GUARDERIA, "guardería del IMSS: «Guardería infantil»");
    ok(R({ nombre: "Hotel Canino Tres Huellas", giro: "hotel", google_tipos: ["hotel", "lodging"] }) === null && R({ nombre: "Rancho Sol", giro: "hotel", google_tipos: ["pet_boarding_service"] }) === null, "con mascotas en el nombre o en la categoría de Google se queda");
    ok(R({ nombre: "Rancho Paraíso", giro: "hotel", web_resumen: "Hotel canino 5 estrellas" }) === null && R({ nombre: "Casa Luna", giro: "hotel", web: "https://www.doghotelluna.mx" }) === null, "también por su web o su dominio («doghotel»)");
    ok(R({ nombre: "DOGTRAINING TAMPICO", giro: "guarderia" }) === null && R({ nombre: "El Club de los Animalitos", giro: "guarderia" }) === null, "palabras pegadas («dogtraining») y diminutivos («animalitos») cuentan");
    ok(R({ nombre: "Nuestra Casa-Sai", giro: "hotel", google_tipos: ["hotel"], web_resumen: "Pet Friendly Hotel en Acapulco, ideal para disfrutar con tus mascotas" }) === MOTIVO_HOTEL && R({ nombre: "Pata de perro, pet friendly", giro: "hotel", google_tipos: ["lodging"] }) === MOTIVO_HOTEL, "un hotel «pet friendly» que admite mascotas sigue siendo hotel para personas");
    ok(R({ nombre: "Hotel Can Inn Sur", giro: "hotel" }) === MOTIVO_HOTEL && R({ nombre: "Enchúlame el Can", giro: "hotel" }) === null, "«Can Inn» no es «can»");
    ok(R({ nombre: "GUARDERÍA CACHORROS", giro: "guarderia", google_tipos: ["preschool", "child_care_agency"] }) === MOTIVO_GUARDERIA && R({ nombre: "Guardería El Gato con Botas", giro: "guarderia", google_tipos: ["child_care_agency"] }) === MOTIVO_GUARDERIA, "«Cachorros» o «Gato con Botas» con categoría de escuela o cuidado infantil: guardería infantil");
    ok(R({ nombre: "Club Doggy Estancia Infantil y Centro de Estimulación Temprana", giro: "guarderia" }) === MOTIVO_GUARDERIA, "«estancia infantil» gana a «doggy»");
    ok(R({ nombre: "Hotel Mirador", giro: "mixto", giro_busqueda: "hotel" }) === MOTIVO_HOTEL && R({ nombre: "Estancia Pequeñines", giro: "mixto", giro_busqueda: "guarderia" }) === MOTIVO_GUARDERIA && R({ nombre: "Hotel Mirador", giro: "mixto", giro_busqueda: "estetica" }) === null, "un mixto que salió de búsqueda de hotel o guardería también; de otra búsqueda, no");
    ok(R({ nombre: "Clínica Vida", giro: "veterinaria" }) === null && R({ nombre: "Salón Bella", giro: "estetica" }) === null, "a veterinaria y estética no les aplica");

    // En la base: calidad descarta, «Contactar hoy» los saca y rellena, revertir aguanta la siguiente corrida.
    const DIR = (i) => `Calle ${i}, Centro, 78000 San Luis Potosí, S.L.P., México`;
    const crear = async (x) => (await A.from("prospectos").insert({ ciudad: CIUDAD, fuente: "manual", calificacion: 5, resenas: 99999, clasificado_at: new Date().toISOString(), ...x }).select("*").single()).data;
    const hP = await crear({ nombre: `Hotel Posada Real ${SUF}`, giro: "hotel", direccion: DIR(20), telefono: tel(120), google_tipos: ["hotel", "lodging"] });
    const gI = await crear({ nombre: `Guardería Pequeñines ${SUF}`, giro: "guarderia", direccion: DIR(21), telefono: tel(121), google_tipos: ["child_care_agency"] });
    const mX = await crear({ nombre: `Posada Las Flores ${SUF}`, giro: "mixto", giro_busqueda: "hotel", direccion: DIR(22), telefono: tel(122), google_tipos: ["lodging"] });
    const hC = await crear({ nombre: `Hotel para perros Toby ${SUF}`, giro: "hotel", direccion: DIR(23), telefono: tel(123), google_tipos: ["hotel"], resenas: 90000 });
    const hR = await crear({ nombre: `Pensión Doña Lupe ${SUF}`, giro: "hotel", direccion: DIR(24), telefono: tel(124), google_tipos: ["lodging"], resenas: 80000 });
    const lee = async (id) => (await A.from("prospectos").select("*").eq("id", id).single()).data;
    // La lista de hoy ya tenía al hotel para personas (se armó antes de la limpieza).
    const F5 = "2099-02-01";
    fechasLista.push(F5);
    await A.from("prospeccion_ajustes").update({ lista_whatsapp: 2, lista_instagram: 0 }).eq("id", 1);
    await A.from("prospectos_contactos").insert([{ prospecto_id: hP.id, fecha: F5, canal: "whatsapp", tipo: "primero", orden: 0, mensaje: "x", redactado_por: "plantilla" }]);
    const rc = await procesarCalidad({ db: A, clasificar: null, giroDeServicios, presupuestoMs: 60_000 });
    const [h1, g1, m1, c1, r1] = await Promise.all([hP, gI, mX, hC, hR].map((x) => lee(x.id)));
    ok(h1.etapa === "descartado" && h1.descarte_tipo === "no_es_del_giro" && h1.descarte_motivo === MOTIVO_HOTEL, "en la base: el hotel para personas queda «Descartado (no es del giro)» con «Hotel para personas»", JSON.stringify({ e: h1.etapa, m: h1.descarte_motivo }));
    ok(g1.etapa === "descartado" && g1.descarte_motivo === MOTIVO_GUARDERIA && m1.etapa === "descartado" && m1.descarte_motivo === MOTIVO_HOTEL, "la guardería infantil y el mixto de búsqueda de hotel también");
    ok(c1.etapa === "nuevo", "el hotel para perros se queda");
    ok(rc.hotelesPersonas >= 2 && rc.guarderiasInfantiles >= 1, `la corrida los cuenta (${rc.hotelesPersonas} hoteles, ${rc.guarderiasInfantiles} guarderías)`);
    const { data: ev } = await A.from("prospectos_eventos").select("texto").eq("prospecto_id", hP.id).eq("tipo", "clasificacion");
    ok(ev.some((e) => /Hotel para personas/.test(e.texto)), "queda en su historial");
    const lh = await armarLista({ db: A, fecha: F5, sitio: "http://plataforma.localhost:3007", redactar: async () => new Map(), plantilla: (p) => mensajeDePlantilla(p, "José") });
    const { data: c5 } = await A.from("prospectos_contactos").select("prospecto_id").eq("fecha", F5).is("deleted_at", null);
    ok(lh.retirados === 1 && !c5.some((x) => x.prospecto_id === hP.id), "«Contactar hoy»: el hotel para personas sale de la lista de hoy", JSON.stringify(lh));
    ok(c5.length === 2 && c5.some((x) => x.prospecto_id === hC.id), `y su lugar lo toma otro (${c5.length} renglones, entre ellos el hotel para perros)`);
    ok(!c5.some((x) => [gI.id, mX.id].includes(x.prospecto_id)), "ningún descartado entra al rellenar");
    // Revertir desde la ficha (lo que hace «Revertir: sí es del giro») y otra corrida: ya no se descarta.
    await A.from("prospectos").update({ etapa: h1.etapa_antes_descarte ?? "nuevo", descarte_tipo: null, descarte_motivo: null, etapa_antes_descarte: null, clasificacion_revertida_at: new Date().toISOString() }).eq("id", hP.id);
    await procesarCalidad({ db: A, clasificar: null, giroDeServicios, presupuestoMs: 60_000 });
    ok((await lee(hP.id)).etapa === "nuevo", "revertido a mano, la limpieza no lo vuelve a descartar");
    ok(r1.etapa === "descartado", "«Pensión Doña Lupe» sin nada de mascotas también se va (pensión para personas)");
    await A.from("prospeccion_ajustes").update({ lista_whatsapp: ajustesAntes.lista_whatsapp ?? 15, lista_instagram: ajustesAntes.lista_instagram ?? 15 }).eq("id", 1);
  }

  console.log("\n9. Mensajes: solo los servicios que el negocio sí da");
  {
    ok(serviciosSeguros({ giro: "mixto", servicios: null }).length === 0 && serviciosSeguros({ giro: "hotel", servicios: null }).join() === "hotel" && serviciosSeguros({ giro: "mixto", servicios: ["hotel", "veterinaria"] }).join() === "hotel,veterinaria", "los servicios seguros salen de la clasificación; un mixto sin ella: no se sabe");
    ok(serviciosAjenos("Te armo la agenda de estética y el hotel", ["hotel"], "Hotel Fido").join() === "estetica" && serviciosAjenos("Hotel Fido Spa: las reservas por noche", ["hotel"], "Hotel Fido Spa").length === 0, "detecta un servicio que no da (sin contar su propio nombre)");
    const hotelSolo = { id: "h1", nombre: "Hotel Patitas", giro: "mixto", ciudad: "SLP", canal: "whatsapp", tipo: "primero", link: "https://x/para/h1", calificacion: 4.9, resenas: 500, servicios: ["hotel"] };
    const sinSaber = { ...hotelSolo, id: "h2", nombre: "Casa Canina", servicios: null };
    const dH = datosParaIA(hotelSolo, 0), dS = datosParaIA(sinSaber, 0);
    ok(/servicios que da: hotel/.test(dH) && !/est[eé]tica|guarder|veterinari/i.test(dH.replace(/servicios que da[^\n]*/, "")), "a la IA solo le llegan los servicios que da y lo que les resuelve de ESOS", dH);
    ok(/servicios que da: no se sabe/.test(dS) && serviciosAjenos(dS.split("\n").slice(3).join(" "), [], "Casa Canina").length === 0, "sin certeza, solo lo general (ningún servicio)", dS);
    // Una IA que inventa estética para un hotel: ese mensaje no se usa y sale de plantilla, que tampoco la nombra.
    const iaInventa = async ({ usuario }) => ({ mensajes: [...usuario.matchAll(/id: (\S+)/g)].map(([, id]) => ({ id, texto: `Hola. PeluDesk te lleva la estética y el hotel. ${id === "h1" ? hotelSolo.link : sinSaber.link}` })) });
    const red = await redactarLote([hotelSolo, sinSaber], iaInventa, "José");
    ok(!red.has("h1") && !red.has("h2"), "un mensaje de la IA que nombra un servicio que el negocio no da se descarta");
    const plH = mensajeDePlantilla(hotelSolo, "José"), plS = mensajeDePlantilla(sinSaber, "José");
    ok(serviciosAjenos(plH, ["hotel"], hotelSolo.nombre).length === 0 && serviciosAjenos(plS, [], sinSaber.nombre).length === 0, "las plantillas de respaldo tampoco nombran servicios que no da", `${plH} || ${plS}`);
    const iaBien = async ({ usuario }) => ({ mensajes: [...usuario.matchAll(/id: (\S+)/g)].map(([, id]) => ({ id, texto: `Hola, soy José de PeluDesk. PeluDesk te lleva las reservas por noche. ${hotelSolo.link}` })) });
    ok((await redactarLote([hotelSolo], iaBien, "José")).has("h1"), "uno que solo habla de lo que da sí se usa");
    // Remitente: todos dicen que los manda José de PeluDesk; Instagram da el WhatsApp de ventas en frío.
    const sinFirma = async ({ usuario }) => ({ mensajes: [...usuario.matchAll(/id: (\S+)/g)].map(([, id]) => ({ id, texto: `Hola. Les armamos su vista previa. ${hotelSolo.link}` })) });
    ok(!(await redactarLote([hotelSolo], sinFirma, "José")).has("h1"), "un mensaje de la IA que no dice que lo manda José de PeluDesk se descarta (sale de plantilla)");
    const tipos = ["primero", "seguimiento_1", "seguimiento_2"].flatMap((tipo) => ["whatsapp", "instagram"].flatMap((canal) => ["a1", "b2", "c3"].map((id) => ({ ...hotelSolo, id, tipo, canal }))));
    ok(tipos.every((x) => /José, de PeluDesk|José de PeluDesk|soy José, de PeluDesk|José y trabajo en PeluDesk|José de PeluDesk/.test(mensajeDePlantilla(x, "José", "524443103236")) || (mensajeDePlantilla(x, "José", "524443103236").includes("José") && mensajeDePlantilla(x, "José", "524443103236").includes("PeluDesk"))), "todas las plantillas (primero y seguimientos, WhatsApp e Instagram) dicen que las manda José de PeluDesk");
    const ig = mensajeDePlantilla({ ...hotelSolo, canal: "instagram" }, "José", "524443103236"), wa = mensajeDePlantilla(hotelSolo, "José", "524443103236");
    const igIa = (await redactarLote([{ ...hotelSolo, canal: "instagram" }], iaBien, "José", undefined, "524443103236")).get("h1") ?? "";
    ok(ig.includes("wa.me/524443103236") && igIa.includes("wa.me/524443103236") && !wa.includes("wa.me/"), "Instagram (IA y plantilla) da el WhatsApp de ventas en frío; WhatsApp no (ya sale de ese número)", `${ig} || ${igIa} || ${wa}`);
  }

  console.log("\n6. auditoria_frontera()");
  const { data: af, error: eaf } = await A.rpc("auditoria_frontera");
  ok(!eaf && (af ?? []).length === 0, "auditoria_frontera() vacía", JSON.stringify(af ?? eaf).slice(0, 400));

  if (process.env.SIN_PANTALLA !== "1") {
    console.log("\n7. Pantalla y tarea (next start propio en el 3007; necesita npm run build)");
    const { spawn } = await import("node:child_process");
    const { abrirNavegador } = await import("../lib/navegador.mjs");
    const PUERTO = 3007;
    const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
      env: { ...process.env, CRON_SECRET: "cron-de-prueba", PLACES_API_URL: PU, GOOGLE_PLACES_API_KEY: "llave-de-prueba", ANTHROPIC_API_URL: PU, ANTHROPIC_API_KEY: "x", PELUDESK_SITIO_URL: `http://plataforma.localhost:${PUERTO}` },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let salida = "";
    app.stdout.on("data", (d) => (salida += d));
    app.stderr.on("data", (d) => (salida += d));
    // Node no resuelve plataforma.localhost ni deja cambiar el Host con fetch: http.request a 127.0.0.1 con el Host puesto.
    const pedir = (ruta, headers = {}) => new Promise((res, rej) => {
      const q = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, headers: { host: `plataforma.localhost:${PUERTO}`, ...headers } }, (r) => {
        const trozos = [];
        r.on("data", (c) => trozos.push(c));
        r.on("end", () => { const cuerpo = Buffer.concat(trozos); res({ status: r.statusCode, headers: r.headers, cuerpo, json: () => JSON.parse(cuerpo.toString()) }); });
      });
      q.on("error", rej);
      q.end();
    });
    try {
      for (let i = 0; i < 60 && !/Ready|started server|Local:/i.test(salida); i++) await new Promise((r) => setTimeout(r, 1000));
      const sin = await pedir("/api/cron/prospectos");
      ok(sin.status === 401, "la tarea sin CRON_SECRET da 401", `status ${sin.status}`);
      await A.from("prospeccion_ajustes").update({ ciudades: [CIUDAD], tope_busquedas_dia: 3 }).eq("id", 1);
      const con = await pedir("/api/cron/prospectos", { authorization: "Bearer cron-de-prueba" });
      let jc = {};
      try { jc = con.json(); } catch {}
      ok(con.status === 200 && jc.estado === "terminada" && jc.busquedas <= 3 && jc.nuevos === 0, `la tarea corre con el tope del ajuste (${jc.busquedas} búsquedas, ${jc.duplicados} duplicados, 0 nuevos)`, JSON.stringify(jc).slice(0, 300));
      if (jc.id) corridas.push(jc.id);
      await A.from("prospeccion_ajustes").update({ ciudades: ajustesAntes.ciudades, tope_busquedas_dia: ajustesAntes.tope_busquedas_dia }).eq("id", 1);
      const xs = await pedir(`/plataforma/prospectos/excel`);
      ok(xs.status === 403, "el Excel sin sesión de la plataforma no sale", `status ${xs.status}`);

      const REF = new globalThis.URL(URL).hostname.split(".")[0];
      const { data: u } = await A.auth.admin.getUserById(pa[0].profile_id);
      const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
      const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
      const { data: ses } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
      const valor = "base64-" + Buffer.from(JSON.stringify(ses.session)).toString("base64url");
      const trozos = valor.match(/.{1,3180}/g);
      const galletas = trozos.length === 1 ? [[`sb-${REF}-auth-token`, valor]] : trozos.map((t, i) => [`sb-${REF}-auth-token.${i}`, t]);
      const nav = await abrirNavegador();
      for (const ancho of [390, 1280]) {
        const ctx = await nav.newContext({ viewport: { width: ancho, height: 900 }, acceptDownloads: true });
        await ctx.addCookies(galletas.map(([name, value]) => ({ name, value, domain: "plataforma.localhost", path: "/" })));
        const pg = await ctx.newPage();
        await pg.goto(`http://plataforma.localhost:${PUERTO}/plataforma/prospectos?ciudad=${encodeURIComponent(CIUDAD)}`);
        await pg.waitForSelector("[data-lista-prospectos]");
        const filasLista = await pg.locator("[data-lista-prospectos] tbody tr").count();
        const esperadas = (await mios()).filter((p) => !p.negocio_cliente_id).length;
        ok(filasLista === esperadas, `${ancho} px: la lista filtrada por ciudad muestra ${filasLista} prospectos (sin los de PeluDesk)`, `${filasLista} vs ${esperadas}`);
        const desborda = await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        ok(!desborda, `${ancho} px: sin desplazamiento horizontal`);
        const href = await pg.getAttribute("[data-exportar-excel]", "href");
        const cookie = galletas.map(([n, v]) => `${n}=${v}`).join("; ");
        const rx = await pedir(href, { cookie });

        ok(
          rx.status === 200 && /spreadsheetml/.test(rx.headers["content-type"] ?? "") && /.xlsx/.test(rx.headers["content-disposition"] ?? ""),
          `${ancho} px: «Descargar en Excel» baja un .xlsx`,
          `status ${rx.status} ${rx.headers["content-type"]} ${rx.cuerpo.toString().slice(0, 200)}`
        );
        if (ancho === 1280) {
          const exl = await pedir(`/plataforma/prospectos/excel?ciudad=${encodeURIComponent(CIUDAD)}`, { cookie });
          const ExcelJS = (await import("exceljs")).default;
          const libro = new ExcelJS.Workbook();
          await libro.xlsx.load(exl.cuerpo);
          ok(libro.getWorksheet("Prospectos").rowCount === esperadas + 1, "el Excel trae los mismos prospectos que la lista filtrada", `${libro.getWorksheet("Prospectos").rowCount - 1} vs ${esperadas}`);
          const hotel = (await mios()).find((p) => p.google_place_id === `aud${SUF}_hotel`);
          await pg.goto(`http://plataforma.localhost:${PUERTO}/plataforma/prospectos/${hotel.id}`);
          await pg.selectOption('select[name="etapa"]', "contactado");
          await pg.selectOption('select[name="canal"]', "llamada");
          await pg.getByRole("button", { name: "Guardar etapa" }).click();
          await pg.getByText("Etapa guardada.").waitFor();
          const { data: h2 } = await A.from("prospectos").select("etapa, canal_ultimo_contacto").eq("id", hotel.id).single();
          ok(h2.etapa === "contactado" && h2.canal_ultimo_contacto === "llamada", "la ficha cambia la etapa y el canal");
          await pg.locator("[data-historial]").getByText("Contactado").first().waitFor();
          ok(true, "y el historial lo muestra");
        }
        await ctx.close();
      }
      // ── Etapa 2 en pantalla ──
      if (paraPantalla.gua) {
        const UA = { "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile" };
        const slug = paraPantalla.slugGua;
        await A.from("prospectos").update({ google_place_id: `aud${SUF}_gm`, visitas: 0, etapa: "contactado", clic_prueba_at: null, clic_whatsapp_at: null }).eq("id", paraPantalla.gua);
        const pg1 = await pedir(`/para/${slug}`, UA);
        const html = pg1.cuerpo.toString();
        ok(pg1.status === 200, "la página personalizada abre", `status ${pg1.status}`);
        ok(/noindex/.test(pg1.headers["x-robots-tag"] ?? "") && /<meta name="robots" content="noindex, nofollow"/.test(html), "noindex en el encabezado y en la página", pg1.headers["x-robots-tag"]);
        ok(html.includes("Vista previa hecha por PeluDesk para") && html.includes("No es su página oficial"), "arriba dice que es una vista previa de PeluDesk, no su página oficial");
        ok(html.includes("Fotógrafa de Prueba") && html.includes("Google Maps") && html.includes(`${W}/foto.jpg`), "fotos de Google pedidas al mostrarla, con el crédito de quien la tomó y la atribución");
        ok(html.includes("Activar mi página gratis") && html.includes("Hablar por WhatsApp") && html.includes("data-pedir-cita") && html.includes("data-portal-demo") && html.includes("Ver cómo lo manejarías tú") && !html.includes("Datos de ejemplo</span>"), "trae su página con pedir cita, el portal, la demo de PeluDesk y los dos botones (sin las pantallas falsas)");
        ok(!html.includes("Tú decides qué cookies usamos"), "sin el aviso de cookies de peludesk.mx (ahí no se mide nada: la visita va al CRM)");
        const v1 = (await A.from("prospectos").select("visitas, etapa").eq("id", paraPantalla.gua).single()).data;
        ok(v1.visitas === 1 && v1.etapa === "caliente", "la visita queda en el CRM y lo sube a «caliente»", JSON.stringify(v1));
        await pedir(`/para/${slug}`, { "user-agent": "WhatsApp/2.24.1 A" });
        await pedir(`/para/${slug}?interno=1`, UA);
        ok((await A.from("prospectos").select("visitas").eq("id", paraPantalla.gua).single()).data.visitas === 1, "la vista previa del link de WhatsApp y la que abre la plataforma no cuentan");
        const ir1 = await pedir(`/para/${slug}/ir/prueba`, UA);
        ok(ir1.status === 302 && (ir1.headers.location ?? "").startsWith(`/registro?prospecto=${slug}`), "«Activar mi página gratis» lleva al registro con su negocio", ir1.headers.location);
        const reg = (await pedir(ir1.headers.location, UA)).cuerpo.toString();
        const nombreGua = (await A.from("prospectos").select("nombre").eq("id", paraPantalla.gua).single()).data.nombre;
        ok(reg.includes(`value="${nombreGua}"`) && reg.includes(`name="prospecto" value="${slug}"`), "el registro viene con el nombre de su negocio ya escrito");
        const ir2 = await pedir(`/para/${slug}/ir/whatsapp`, UA);
        ok(ir2.status === 302 && /^https:\/\/wa\.me\/524443103236\?text=/.test(ir2.headers.location ?? "") && decodeURIComponent(ir2.headers.location).includes(`vi la página que armaron para ${nombreGua} (ref. ${slug.slice(-5)})`), "«Hablar por WhatsApp» va al WhatsApp de ventas (sin PELUDESK_VENTAS_WHATSAPP, el de ventas en frío) y dice de qué negocio viene, con su referencia", ir2.headers.location);
        const v2 = (await A.from("prospectos").select("clic_prueba_at, clic_whatsapp_at").eq("id", paraPantalla.gua).single()).data;
        const { count: nv } = await A.from("prospectos_visitas").select("id", { count: "exact", head: true }).eq("prospecto_id", paraPantalla.gua);
        ok(v2.clic_prueba_at && v2.clic_whatsapp_at && nv === 3, "cada clic queda registrado (fecha, veces y en qué botón)", `${nv} visitas`);
        const sm = (await pedir("/sitemap.xml")).cuerpo.toString();
        const rb = (await pedir("/robots.txt")).cuerpo.toString();
        ok(!sm.includes("/para/") && /Disallow: \/para\//.test(rb), "fuera del sitemap y de robots");
        const enNegocio = await new Promise((res) => http.get({ host: "127.0.0.1", port: PUERTO, path: `/para/${slug}`, headers: { host: `huellitas.localhost:${PUERTO}` } }, (r) => res(r.statusCode)));
        ok(enNegocio === 404, "en el dominio de un negocio no existe", `status ${enNegocio}`);

        // «Contactar hoy» en el celular: una tarjeta de WhatsApp y una de Instagram de esta prueba.
        const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City" }).format(new Date());
        const pw = (await A.from("prospectos").insert({ nombre: `Pantalla Wa ${SUF}`, giro: "hotel", ciudad: CIUDAD, telefono: tel(201), fuente: "manual" }).select("id, slug").single()).data;
        const pi = (await A.from("prospectos").insert({ nombre: `Pantalla Ig ${SUF}`, giro: "estetica", ciudad: CIUDAD, instagram: `https://www.instagram.com/pi${SUF}`, fuente: "manual" }).select("id, slug").single()).data;
        const { data: cs } = await A.from("prospectos_contactos").insert([
          { prospecto_id: pw.id, fecha: hoy, canal: "whatsapp", tipo: "primero", orden: -2, mensaje: `Hola, Pantalla Wa. Prueba.\nhttp://x/para/${pw.slug}` },
          { prospecto_id: pi.id, fecha: hoy, canal: "instagram", tipo: "primero", orden: -1, mensaje: `Hola, Pantalla Ig. Prueba. http://x/para/${pi.slug}` },
        ]).select("id, canal");
        const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
        await ctx.addCookies(galletas.map(([name, value]) => ({ name, value, domain: "plataforma.localhost", path: "/" })));
        // wa.me e Instagram no se alcanzan desde la nube: un doble para que la pestaña nueva conserve su URL.
        await ctx.route(/^https:\/\/(wa\.me|api\.whatsapp\.com|(www\.)?instagram\.com)\//, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>doble</p>" }));
        const pg = await ctx.newPage();
        await pg.goto(`http://plataforma.localhost:${PUERTO}/plataforma/prospectos/hoy`);
        const cw = cs.find((c) => c.canal === "whatsapp").id, ci = cs.find((c) => c.canal === "instagram").id;
        await pg.waitForSelector(`[data-contacto="${cw}"]`);
        ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "390 px: «Contactar hoy» sin desplazamiento horizontal");
        const [vw] = await Promise.all([ctx.waitForEvent("page"), pg.locator(`[data-contacto="${cw}"] [data-abrir-whatsapp]`).click()]);
        ok(/^https:\/\/(api\.whatsapp\.com|wa\.me)\//.test(vw.url()) && /Pantalla/.test(decodeURIComponent(vw.url())), "«Abrir WhatsApp» abre wa.me con el mensaje ya escrito", vw.url());
        await vw.close().catch(() => {});
        let ew = null;
        for (let i = 0; i < 30 && ew?.estado !== "enviado"; i++) { await new Promise((r) => setTimeout(r, 1000)); ew = (await A.from("prospectos_contactos").select("estado").eq("id", cw).single()).data; }
        const pwF = (await A.from("prospectos").select("etapa, canal_ultimo_contacto, ultimo_contacto_at").eq("id", pw.id).single()).data;
        ok(ew?.estado === "enviado" && pwF.etapa === "contactado" && pwF.canal_ultimo_contacto === "whatsapp" && pwF.ultimo_contacto_at, "y el prospecto pasa a contactado con canal y fecha");
        await pg.waitForSelector(`[data-contacto="${ci}"]`);
        const [vi] = await Promise.all([ctx.waitForEvent("page"), pg.locator(`[data-contacto="${ci}"] [data-abrir-instagram]`).click()]);
        ok(/instagram\.com\/pi/.test(vi.url()), "«Copiar y abrir Instagram» abre su perfil", vi.url());
        await vi.close().catch(() => {});
        let ei = null;
        for (let i = 0; i < 30 && ei?.estado !== "enviado"; i++) { await new Promise((r) => setTimeout(r, 1000)); ei = (await A.from("prospectos_contactos").select("estado").eq("id", ci).single()).data; }
        ok(ei?.estado === "enviado", "y lo marca contactado por Instagram");
        await pg.goto(`http://plataforma.localhost:${PUERTO}/plataforma/prospectos/hoy`);
        await pg.locator(`[data-contacto="${ci}"]`).first().locator("xpath=ancestor::details").evaluate((d) => (d.open = true)).catch(() => {});
        await pg.locator(`[data-contacto="${ci}"] [data-respondio]`).click();
        let pr = null;
        for (let i = 0; i < 30 && pr?.etapa !== "respondio"; i++) { await new Promise((r) => setTimeout(r, 1000)); pr = (await A.from("prospectos").select("etapa").eq("id", pi.id).single()).data; }
        ok(pr?.etapa === "respondio", "«Respondió» desde el celular");
        // La ficha: revertir el descarte automático.
        await pg.goto(`http://plataforma.localhost:${PUERTO}/plataforma/prospectos/${paraPantalla.adies}`);
        await pg.getByRole("button", { name: "Revertir: sí es del giro" }).click();
        await pg.getByText("Revertido.").waitFor();
        const ad = (await A.from("prospectos").select("etapa, descarte_tipo, clasificacion_revertida_at").eq("id", paraPantalla.adies).single()).data;
        ok(ad.etapa === "nuevo" && !ad.descarte_tipo && ad.clasificacion_revertida_at, "«Revertir» en la ficha lo regresa y la clasificación ya no lo toca");
        await pg.goto(`http://plataforma.localhost:${PUERTO}/para/${slug}?interno=1`);
        ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)), "390 px: la página personalizada sin desplazamiento horizontal");
        await ctx.close();
      }
      // ── 7c. La página web de un prospecto por giro: diseño distinto, botones en demostración, nada escrito ──
      console.log("\n7c. La página web de un prospecto, por giro (veterinaria, estética, hotel)");
      const giros = [
        { clave: "vet", giro: "veterinaria", servicios: ["veterinaria"], fuente: "jakarta", rol: "veterinaria", ir: "consulta", modo: "cita", visita: "Vacunación" },
        { clave: "est", giro: "estetica", servicios: ["estetica"], fuente: "fraunces", rol: "recepcion", ir: "estetica", modo: "cita", visita: "Corte" },
        { clave: "hot", giro: "hotel", servicios: ["hotel"], fuente: "dmserif", rol: "recepcion", ir: "calendario", modo: "noches", visita: "Hotel" },
      ];
      const { data: creados } = await A.from("prospectos")
        .insert(giros.map((g, i) => ({ nombre: `Web ${g.giro} ${SUF}`, giro: g.giro, ciudad: CIUDAD, telefono: tel(300 + i), fuente: "manual", google_place_id: `aud${SUF}_web_${g.clave}`, clasificacion: { servicios: g.servicios } })))
        .select("id, slug, nombre");
      const TABLAS = ["citas_estetica", "estancias", "reservas", "vet_citas", "clientes", "perros", "cobros", "negocios"];
      const contarTodo = async () => Object.fromEntries(await Promise.all(TABLAS.map(async (t) => [t, (await A.from(t).select("id", { count: "exact", head: true })).count])));
      const antesDemo = await contarTodo();
      const temas = [];
      for (const [i, g] of giros.entries()) {
        const p = creados[i];
        for (const ancho of [390, 1280]) {
          const ctx = await nav.newContext({ viewport: { width: ancho, height: 860 }, isMobile: ancho === 390, hasTouch: ancho === 390 });
          const pg = await ctx.newPage();
          const escrituras = [];
          pg.on("request", (r) => { if (!["GET", "HEAD"].includes(r.method()) && /localhost/.test(r.url())) escrituras.push(`${r.method()} ${r.url()}`); });
          await pg.goto(`http://plataforma.localhost:${PUERTO}/para/${p.slug}?interno=1`);
          const d = await pg.locator("[data-pagina-web]").evaluate((e) => ({ ...e.dataset }));
          if (ancho === 390) temas.push({ giro: g.giro, acento: d.acento, h1: await pg.locator("h1").evaluate((e) => getComputedStyle(e).fontFamily) });
          ok(d.tema === g.giro && d.fuente === g.fuente && d.colorOrigen === "foto", `${g.giro} ${ancho} px: diseño ${d.tema}, letra ${d.fuente}, color ${d.acento} sacado de su foto`, JSON.stringify(d));
          ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.visualViewport.width + 1)), `${g.giro} ${ancho} px: sin desplazamiento horizontal`);
          if (ancho === 390) {
            ok(
              (await pg.locator("[data-aviso-vista-previa]").isVisible()) && (await pg.locator("[data-resena]").count()) === 1 && (await pg.locator("[data-horario]").count()) === 1 && (await pg.locator("[data-mapa]").count()) === 1,
              `${g.giro}: franja de vista previa, una reseña destacada (la mala no), horario de Google y mapa`
            );
            await pg.locator("[data-boton-pedir]").first().click();
            await pg.locator("[data-pedir-cita] [data-servicio]").first().check();
            await pg.locator("[data-siguiente]").click();
            await pg.locator("[data-dia]").first().click();
            ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.visualViewport.width + 1)), `${g.giro}: escoger el día no desborda la pantalla (la fila de días se desliza sola)`);
            if (g.modo === "cita") await pg.locator("[data-hora]").first().click();
            else await pg.locator("[data-salida]").first().click();
            if (g.modo === "noches") ok(/noche/.test(await pg.locator("[data-noches]").innerText()), `${g.giro}: escoge llegada y salida y cuenta las noches`);
            await pg.locator("[data-siguiente]").click();
            await pg.locator("[data-confirmar-pedido]").click();
            await pg.locator("[data-pedido-listo]").waitFor();
            const chat = await pg.locator("[data-chat-whatsapp]").innerText();
            ok(chat.includes(p.nombre) && chat.includes("Luna") && /Confirmación/i.test(chat) && /Recordatorio/i.test(chat) && /Listo para recoger/i.test(chat), `${g.giro}: pedir ${g.modo === "noches" ? "reserva" : "cita"} llega al final y enseña confirmación, recordatorio y aviso de recoger por WhatsApp`, chat.slice(0, 200));
            await pg.locator('[data-portal-demo] [data-pestana-portal="vacunas"]').click();
            ok(/Vigente/.test(await pg.locator("[data-portal-demo]").innerText()), `${g.giro}: «Mi portal» enseña las vacunas de ejemplo`);
            await pg.locator('[data-portal-demo] [data-pestana-portal="visitas"]').click();
            ok((await pg.locator("[data-portal-demo]").innerText()).includes(g.visita), `${g.giro}: y sus ${g.modo === "noches" ? "reservas" : "citas"}`);
            ok(escrituras.length === 0, `${g.giro}: ningún envío al servidor durante la demostración`, escrituras.join(" | "));
            ok(!(await pg.evaluate(() => document.documentElement.scrollWidth > window.visualViewport.width + 1)), `${g.giro}: después de todo el recorrido sigue sin desplazamiento horizontal`);
          }
          await ctx.close();
        }
        const dm = await pedir(`/para/${p.slug}/ir/demo`, { "user-agent": "Mozilla/5.0 (Linux; Android 14) Chrome/130 Mobile" });
        ok(dm.status === 302 && new RegExp(`/demo/entrar/${g.rol}\\?ir=${g.ir}$`).test(dm.headers.location ?? ""), `${g.giro}: «Ver cómo lo manejarías tú» abre la demo como ${g.rol} (${g.ir})`, dm.headers.location);
      }
      ok(new Set(temas.map((t) => t.acento)).size === 3 && new Set(temas.map((t) => t.h1)).size === 3, "las tres se ven distintas: otro color y otra letra", JSON.stringify(temas));
      ok(JSON.stringify(antesDemo) === JSON.stringify(await contarTodo()), "nada se escribió en ningún negocio (citas, estancias, reservas, consultas, clientes, perros, cobros, negocios)");
      const { data: vd } = await A.from("prospectos_visitas").select("tipo").in("prospecto_id", creados.map((c) => c.id));
      ok((vd ?? []).filter((v) => v.tipo === "clic_demo").length === 3 && !(vd ?? []).some((v) => v.tipo === "visita"), "cada clic a la demo queda en el CRM y las visitas con ?interno=1 no cuentan", JSON.stringify(vd));
      // El bot de WhatsApp liga al prospecto: por la referencia del mensaje prellenado y, si no trae, por su teléfono.
      const [pe, ph] = [creados[1], creados[2]];
      await A.from("prospectos_contactos").insert({ prospecto_id: pe.id, fecha: new Date().toISOString().slice(0, 10), canal: "instagram", tipo: "primero", orden: -5, mensaje: `Prueba ${pe.slug}`, estado: "enviado" });
      const r1 = await A.rpc("prospecto_registrar_whatsapp", { p_telefono: "5215500000000", p_ref: pe.slug.slice(-5) });
      const e1 = (await A.from("prospectos").select("etapa, canal_ultimo_contacto").eq("id", pe.id).single()).data;
      const c1 = (await A.from("prospectos_contactos").select("estado").eq("prospecto_id", pe.id).single()).data;
      ok(r1.data?.id === pe.id && r1.data?.por === "referencia" && e1.etapa === "respondio" && e1.canal_ultimo_contacto === "whatsapp_bot" && c1?.estado === "respondio",
        "un mensaje al bot con «ref. …» marca al prospecto «respondió» con canal WhatsApp bot y saca su renglón de «Contactar hoy»", JSON.stringify({ r1: r1.data ?? r1.error, e1, c1 }));
      const r2 = await A.rpc("prospecto_registrar_whatsapp", { p_telefono: `521${tel(302).replace(/\D/g, "")}`, p_ref: null });
      ok(r2.data?.id === ph.id && r2.data?.por === "telefono", "sin referencia, lo reconoce por su teléfono", JSON.stringify(r2.data ?? r2.error));
      await A.rpc("prospecto_registrar_whatsapp", { p_telefono: "5215500000000", p_ref: pe.slug.slice(-5) });
      const { count: notas } = await A.from("prospectos_eventos").select("id", { count: "exact", head: true }).eq("prospecto_id", pe.id).eq("canal", "whatsapp_bot").eq("tipo", "contacto");
      ok(notas === 1, "varios mensajes el mismo día dejan una sola nota en su historial", `${notas}`);
      const r3 = await A.rpc("prospecto_registrar_whatsapp", { p_telefono: "5215511112222", p_ref: "zzzzz" });
      ok(!r3.error && r3.data === null, "alguien que no es prospecto no se liga a nadie");
      const anonR = await createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } }).rpc("prospecto_registrar_whatsapp", { p_telefono: "1", p_ref: pe.slug.slice(-5) });
      ok(Boolean(anonR.error), "la llave anónima no puede llamarla", JSON.stringify(anonR.data));
      // /demo/entrar con ?ir= (solo claves conocidas) en el demo de desarrollo.
      const enDemo = (ruta) => new Promise((res) => http.get({ host: "127.0.0.1", port: PUERTO, path: ruta, headers: { host: `patitasyco.localhost:${PUERTO}` } }, (r) => res(r.headers.location ?? `status ${r.statusCode}`)));
      const [eCal, eCons, eMala] = [await enDemo("/demo/entrar/recepcion?ir=calendario"), await enDemo("/demo/entrar/veterinaria?ir=consulta"), await enDemo("/demo/entrar/recepcion?ir=/admin/permisos")];
      ok(eCal === "/reservas/calendario" && /^\/veterinaria\/(consulta\/[0-9a-f-]{36}|agenda)$/.test(eCons) && eMala === "/recepcion", "la demo abre en la pantalla del giro y no acepta una ruta suelta", `${eCal} · ${eCons} · ${eMala}`);

      // «Activar mi página gratis» → registro → su página queda publicada en su subdominio con lo que vio.
      const pv = creados[0];
      // El tope de 3 registros por conexión al día: las corridas locales de hoy (127.0.0.1) se envejecen, como en prueba-gratis-dev.
      // (Con un filtro de negocio_id propio: sesiones-dev acota a Ludogteka toda tabla con negocio_id que no lo traiga.)
      await A.from("registros_prueba").update({ created_at: new Date(Date.now() - 2 * 86_400_000).toISOString() }).eq("ip", "127.0.0.1").not("negocio_id", "is", null).gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
      const telReg = `449${SUF}${String(Math.floor(Math.random() * 10))}`;
      const ctxR = await nav.newContext({ viewport: { width: 390, height: 860 } });
      const pr = await ctxR.newPage();
      await pr.goto(`http://plataforma.localhost:${PUERTO}/para/${pv.slug}/ir/prueba?interno=1`);
      await pr.getByRole("button", { name: "Rechazar" }).click({ timeout: 5000 }).catch(() => {});
      await pr.getByLabel("Tu nombre").fill("Persona de Prueba");
      await pr.getByLabel("Teléfono").fill(telReg);
      await pr.getByLabel("Contraseña", { exact: true }).fill(claveAleatoria());
      await pr.getByLabel(/Leí y acepto/).check();
      await pr.getByRole("button", { name: "Abrir mi negocio" }).click();
      let alta = null;
      for (let i = 0; i < 40 && !alta; i++) { await new Promise((r) => setTimeout(r, 1000)); alta = (await A.from("registros_prueba").select("negocio_id").eq("telefono", telReg).not("negocio_id", "is", null).maybeSingle()).data; }
      const avisoReg = alta ? "" : await pr.locator("form").last().innerText().catch(() => "");
      await ctxR.close();
      if (!alta) ok(false, "", `el registro desde la vista previa no creó el negocio: ${avisoReg.replace(/\s+/g, " ").slice(-300)}`);
      else {
        const { data: neg } = await A.from("negocios").select("slug, nombre").eq("id", alta.negocio_id).single();
        try {
          let perfil = null;
          for (let i = 0; i < 10 && !perfil?.tema_web; i++) { await new Promise((r) => setTimeout(r, 800)); perfil = (await A.from("negocio_perfil").select("tema_web, color_web, google_place_id, direccion").eq("negocio_id", alta.negocio_id).is("deleted_at", null).maybeSingle()).data; }
          const { data: sab } = await A.from("horario_semana").select("hora_cierre").eq("negocio_id", alta.negocio_id).eq("dia_semana", 6).is("deleted_at", null).limit(1).maybeSingle();
          const { data: cc } = await A.from("cupo_configuracion").select("telefono_recepcion").eq("negocio_id", alta.negocio_id).is("deleted_at", null).limit(1).maybeSingle();
          ok(perfil?.tema_web === "veterinaria" && /^#[0-9a-f]{6}$/.test(perfil?.color_web ?? "") && perfil?.google_place_id === `aud${SUF}_web_vet` && String(sab?.hora_cierre ?? "").startsWith("14:00") && cc?.telefono_recepcion === tel(300).replace(/\D/g, ""),
            "al registrarse, su perfil queda con su diseño, su color, su lugar de Google, su horario y su WhatsApp", JSON.stringify({ perfil, sab, cc }));
          const pub = await new Promise((res) => http.get({ host: "127.0.0.1", port: PUERTO, path: "/", headers: { host: `${neg.slug}.localhost:${PUERTO}` } }, (r) => { let b = ""; r.on("data", (c) => (b += c)); r.on("end", () => res({ status: r.statusCode, b })); }));
          ok(pub.status === 200 && pub.b.includes('data-tema="veterinaria"') && pub.b.includes(neg.nombre) && pub.b.includes("Fotógrafa de Prueba") && !pub.b.includes("data-aviso-vista-previa") && !pub.b.includes("data-portal-demo"),
            "y su página ya está publicada en su subdominio, en modo real (sin franja de vista previa ni portal de ejemplo)", `status ${pub.status}`);
        } finally {
          const { execFileSync } = await import("node:child_process");
          try { execFileSync(process.execPath, ["scripts/plataforma/eliminar-negocio.mjs", neg.slug, "--telefono", telReg, "--aplicar"], { stdio: "ignore" }); } catch (e) { ok(false, "", `no se pudo borrar el negocio de prueba ${neg.slug}: ${e.message}`); }
        }
      }
      await nav.close();
    } finally {
      app.kill();
    }
  }

  if (process.env.REAL === "1") {
    console.log("\n7. Búsqueda REAL contra Google Places");
    const key = process.env.GOOGLE_PLACES_API_KEY || env.GOOGLE_PLACES_API_KEY;
    if (!key) ok(false, "", "REAL=1 pide GOOGLE_PLACES_API_KEY");
    else {
      const ciudad = process.env.CIUDAD || "San Luis Potosí";
      const giro = process.env.GIRO || "guarderia";
      const rr = await correrProspeccion({ db: A, apiKey: key, buscar: (q, t) => buscarTexto({ apiKey: key, consulta: q, pageToken: t }), revisarWeb: (w) => revisarWeb(w), origen: "script", tope: 3, ciudades: [ciudad], giros: [giro], presupuestoMs: 600_000 });
      ok(rr.estado === "terminada" && rr.resultados > 0, `Google real: ${rr.busquedas} búsquedas, ${rr.resultados} lugares, ${rr.nuevos} nuevos, ${rr.duplicados} duplicados, ${rr.clientes} de PeluDesk, ${rr.websRevisadas} webs`, `${rr.estado}: ${rr.error}`);
      const rr2 = await correrProspeccion({ db: A, apiKey: key, buscar: (q, t) => buscarTexto({ apiKey: key, consulta: q, pageToken: t }), revisarWeb: (w) => revisarWeb(w), origen: "script", tope: 1, ciudades: [ciudad], giros: [giro], presupuestoMs: 120_000 });
      ok(rr2.nuevos <= 2, `repetir contra Google casi no crea nuevos (${rr2.nuevos}, ${rr2.duplicados} duplicados)`);
    }
  }
} finally {
  await A.from("prospeccion_ajustes").update({ pausado: ajustesAntes.pausado }).eq("id", 1);
  await A.from("prospeccion_ajustes").update({ lista_whatsapp: ajustesAntes.lista_whatsapp, lista_instagram: ajustesAntes.lista_instagram, dias_seguimiento: ajustesAntes.dias_seguimiento, max_seguimientos: ajustesAntes.max_seguimientos, ciudades: ajustesAntes.ciudades, tope_busquedas_dia: ajustesAntes.tope_busquedas_dia }).eq("id", 1);
  if (fechasLista.length) await A.from("prospectos_contactos").delete().in("fecha", fechasLista);
  // Lo que armó la tarea durante la prueba (la lista de hoy en desarrollo, con mensajes del doble).
  await A.from("prospectos_contactos").delete().gte("created_at", inicioPrueba);
  await A.from("prospectos").delete().eq("ciudad", CIUDAD);
  await A.from("prospectos").delete().eq("ciudad_busqueda", CIUDAD);
  await A.from("prospeccion_cursores").delete().eq("ciudad", CIUDAD);
  if (corridas.length) await A.from("prospeccion_corridas").delete().in("id", corridas.filter(Boolean));
  webs.close();
  places.close();
}
console.log(fallas ? `\n${fallas} FALLA(S)` : "\nTodo bien.");
process.exit(fallas ? 1 : 0);
