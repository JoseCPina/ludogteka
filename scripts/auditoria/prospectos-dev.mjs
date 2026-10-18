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
import { A, URL, env, sesion } from "./sesiones-dev.mjs";
import { createClient } from "@supabase/supabase-js";
import { correrProspeccion } from "../../src/lib/prospectos/correr.ts";
import { buscarTexto } from "../../src/lib/prospectos/places.ts";
import { revisarWeb, extraerContactos } from "../../src/lib/prospectos/web.ts";
import { ciudadDeDireccion, claveMarca, agruparSucursales, procesarCalidad } from "../../src/lib/prospectos/calidad.ts";
import { clasificarLote, giroDeServicios } from "../../src/lib/prospectos/clasificar.ts";
import { crearLlamarIA } from "../../src/lib/prospectos/ia.ts";
import { armarLista } from "../../src/lib/prospectos/lista.ts";
import { mensajeDePlantilla, redactarLote } from "../../src/lib/prospectos/mensajes.ts";

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
const webs = http.createServer((req, res) => {
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
        : { mensajes: items.map((x, i) => ({ id: x.id, texto: `${["Hola", "Qué tal", "Buen día"][i % 3]}, ${String(x.negocio).split(" (")[0]}. Mensaje de prueba ${x.tipo}.\n${x.link}` })) };
    return res.end(JSON.stringify({ content: [{ type: "tool_use", name: herr, input }] }));
  }
  if (req.headers["x-goog-api-key"] !== "llave-de-prueba") {
    res.statusCode = 403;
    return res.end(JSON.stringify({ error: { message: "API key not valid", status: "PERMISSION_DENIED" } }));
  }
  // Place Details y la foto (para la página personalizada): lo que se pide al mostrarla.
  if (req.method === "GET" && /\/media\?/.test(req.url)) return res.end(JSON.stringify({ photoUri: `${W}/foto.jpg` }));
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
    const pGua = await crear({ nombre: `Guarderiamaxima ${SUF}`, direccion: DIR(2), telefono: tel(102), instagram: `https://www.instagram.com/gm${SUF}` });
    const pSuc = await crear({ nombre: `GUARDERIAMAXIMA ${SUF} sucursal`, direccion: DIR(3), telefono: tel(103), resenas: 4 });
    const pIg = await crear({ nombre: `Hotel Solo Insta ${SUF}`, giro: "hotel", direccion: DIR(4), instagram: `https://www.instagram.com/hsi${SUF}` });
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
        ok(html.includes("Activar mi prueba gratis") && html.includes("Hablar por WhatsApp") && html.includes("Su agenda") && html.includes("Portal para sus clientes"), "trae la página web, la agenda, la caja, el portal y los dos botones");
        const v1 = (await A.from("prospectos").select("visitas, etapa").eq("id", paraPantalla.gua).single()).data;
        ok(v1.visitas === 1 && v1.etapa === "caliente", "la visita queda en el CRM y lo sube a «caliente»", JSON.stringify(v1));
        await pedir(`/para/${slug}`, { "user-agent": "WhatsApp/2.24.1 A" });
        await pedir(`/para/${slug}?interno=1`, UA);
        ok((await A.from("prospectos").select("visitas").eq("id", paraPantalla.gua).single()).data.visitas === 1, "la vista previa del link de WhatsApp y la que abre la plataforma no cuentan");
        const ir1 = await pedir(`/para/${slug}/ir/prueba`, UA);
        ok(ir1.status === 302 && (ir1.headers.location ?? "").startsWith(`/registro?prospecto=${slug}`), "«Activar mi prueba gratis» lleva al registro con su negocio", ir1.headers.location);
        const reg = (await pedir(ir1.headers.location, UA)).cuerpo.toString();
        const nombreGua = (await A.from("prospectos").select("nombre").eq("id", paraPantalla.gua).single()).data.nombre;
        ok(reg.includes(`value="${nombreGua}"`) && reg.includes(`name="prospecto" value="${slug}"`), "el registro viene con el nombre de su negocio ya escrito");
        const ir2 = await pedir(`/para/${slug}/ir/whatsapp`, UA);
        ok(ir2.status === 302 && /^https:\/\/wa\.me\/524441301539\?text=/.test(ir2.headers.location ?? ""), "«Hablar por WhatsApp» va al WhatsApp de contacto con el mensaje", ir2.headers.location);
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
