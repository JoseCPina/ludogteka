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

  console.log("\n6. auditoria_frontera()");
  const { data: af, error: eaf } = await A.rpc("auditoria_frontera");
  ok(!eaf && (af ?? []).length === 0, "auditoria_frontera() vacía", JSON.stringify(af ?? eaf).slice(0, 400));

  if (process.env.SIN_PANTALLA !== "1") {
    console.log("\n7. Pantalla y tarea (next start propio en el 3007; necesita npm run build)");
    const { spawn } = await import("node:child_process");
    const { abrirNavegador } = await import("../lib/navegador.mjs");
    const PUERTO = 3007;
    const app = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], {
      env: { ...process.env, CRON_SECRET: "cron-de-prueba", PLACES_API_URL: PU, GOOGLE_PLACES_API_KEY: "llave-de-prueba" },
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
  await A.from("prospectos").delete().eq("ciudad", CIUDAD);
  await A.from("prospeccion_cursores").delete().eq("ciudad", CIUDAD);
  if (corridas.length) await A.from("prospeccion_corridas").delete().in("id", corridas.filter(Boolean));
  webs.close();
  places.close();
}
console.log(fallas ? `\n${fallas} FALLA(S)` : "\nTodo bien.");
process.exit(fallas ? 1 : 0);
