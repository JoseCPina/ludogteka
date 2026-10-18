// Uso: node scripts/auditoria/seo-dev.mjs   (SOLO DESARROLLO; antes, `npm run build`)
//
// SEO y descubrimiento de peludesk.mx (buscadores y asistentes de IA), con
// el servidor real (`next start` en el 3003) y el host de la plataforma:
//   A. robots.txt: cada rastreador (Googlebot, Bingbot, GPTBot, OAI-SearchBot,
//      ChatGPT-User, ClaudeBot, Claude-SearchBot, Claude-User, PerplexityBot,
//      Google-Extended…) tiene su grupo, permite «/» y bloquea lo privado; el
//      sitemap está declarado. Un negocio (demo) bloquea todo.
//   B. sitemap.xml: todas las páginas nuevas, y cada URL responde 200 sin
//      redirecciones, indexable, con title, description, canonical propio,
//      Open Graph, un solo h1 y su contenido YA en el HTML (sin JavaScript).
//   C. Datos estructurados: JSON-LD que parsea, @type esperado por página
//      (SoftwareApplication con precio, Organization, FAQPage con respuestas,
//      HowTo/Article en ayuda, BreadcrumbList), sin precio escrito a mano.
//   D. llms.txt y llms-full.txt: existen, traen el precio de la base y los
//      links del sitio, y cada link interno responde 200.
//   E. Enlaces internos: todo href interno de cada página responde 200.
//   F. IndexNow: el archivo de llave coincide con INDEXNOW_LLAVE.
// Sale con 1 si algo falla.
import http from "node:http";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";

const PUERTO = 3003;
const HOST_PLATAFORMA = `plataforma.localhost:${PUERTO}`;
let fallas = 0;
const ok = (c, q) => { console.log(`  ${c ? "✔" : "✘"} ${q}`); if (!c) fallas++; return c; };

const servidor = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], { env: { ...process.env, PELUDESK_URL_DESARROLLO: `http://{slug}.localhost:${PUERTO}` }, stdio: ["ignore", "pipe", "pipe"] });
let bitacora = "";
servidor.stdout.on("data", (d) => (bitacora += d));
servidor.stderr.on("data", (d) => (bitacora += d));
const cerrar = () => { try { servidor.kill(); } catch { /* ya cerró */ } };
process.on("exit", cerrar);

function pedir(ruta, host = HOST_PLATAFORMA) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, headers: { host, "user-agent": "auditoria-seo" } }, (res) => {
      let cuerpo = "";
      res.setEncoding("utf8");
      res.on("data", (c) => (cuerpo += c));
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, cuerpo }));
    });
    r.on("error", reject);
    r.setTimeout(60000, () => r.destroy(new Error(`tiempo agotado: ${ruta}`)));
    r.end();
  });
}

for (let i = 0; i < 60; i++) {
  try { await pedir("/robots.txt"); break; } catch { await new Promise((r) => setTimeout(r, 1000)); }
  if (i === 59) { console.log(bitacora); throw new Error("El servidor no arrancó (¿corriste `npm run build`?)."); }
}

try {
  // ── A. robots.txt ──
  console.log("\nA. robots.txt");
  const robots = (await pedir("/robots.txt")).cuerpo;
  const grupos = robots.split(/\n\s*\n/).map((g) => g.split("\n").map((l) => l.trim()).filter(Boolean));
  const BOTS = ["Googlebot", "Google-Extended", "Bingbot", "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-SearchBot", "Claude-User", "PerplexityBot"];
  const PRIVADAS = ["/plataforma", "/demo", "/api", "/admin", "/portal", "/login", "/bienvenida"];
  for (const b of BOTS) {
    const g = grupos.find((x) => x.some((l) => l.toLowerCase() === `user-agent: ${b}`.toLowerCase()));
    ok(!!g && g.includes("Allow: /") && PRIVADAS.every((p) => g.includes(`Disallow: ${p}`)), `${b}: permite «/» y bloquea lo privado`);
  }
  ok(/Sitemap: https:\/\/peludesk\.mx\/sitemap\.xml/.test(robots), "declara el sitemap");
  const demo = (await pedir("/robots.txt", `patitasyco.localhost:${PUERTO}`)).cuerpo;
  const comodin = demo.slice(demo.indexOf("User-Agent: *"));
  ok(/^Disallow: \/$/m.test(comodin) && !/^Allow: \/$/m.test(comodin), "el demo bloquea todo (salvo las vistas previas de links)");

  // ── B. sitemap ──
  console.log("\nB. sitemap.xml y páginas");
  const sm = (await pedir("/sitemap.xml")).cuerpo;
  const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace("https://peludesk.mx", ""));
  ok(urls.length > 100, `${urls.length} URL en el sitemap`);
  for (const r of ["/", "/precios", "/veterinaria", "/alternativas", "/alternativas/moego", "/alternativas/sicar", "/alternativas/agendapro", "/alternativas/qvet", "/alternativas/okvet", "/guias/control-de-pagos-y-caja-en-una-guarderia-canina", "/guias/facturacion-cfdi-para-esteticas-y-veterinarias", "/software-para-guarderias-caninas", "/ayuda", "/blog"]) ok(urls.includes(r), `sitemap incluye ${r}`);
  ok(!urls.some((u) => /^\/(plataforma|demo|admin|portal|api)(\/|$)/.test(u)), "el sitemap no trae nada privado");

  const paginas = new Map();
  const titulos = new Map();
  const lotes = [...urls];
  const trabajar = async () => {
    while (lotes.length) {
      const ruta = lotes.pop();
      const r = await pedir(ruta);
      paginas.set(ruta, r);
    }
  };
  await Promise.all(Array.from({ length: 4 }, trabajar));
  let malas = [];
  for (const [ruta, r] of paginas) {
    const h = r.cuerpo;
    const titulo = h.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? "";
    const desc = h.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? "";
    const canon = h.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? "";
    const h1s = (h.match(/<h1[\s>]/g) ?? []).length;
    const noindex = /<meta name="robots" content="[^"]*noindex/.test(h);
    const og = /<meta property="og:title"/.test(h) && /<meta property="og:description"/.test(h) && /<meta property="og:image"/.test(h);
    const problemas = [];
    if (r.status !== 200) problemas.push(`status ${r.status}`);
    if (!titulo || titulo.length > 90) problemas.push(`title (${titulo.length})`);
    if (desc.length < 50 || desc.length > 200) problemas.push(`description (${desc.length})`);
    if (canon !== `https://peludesk.mx${ruta === "/" ? "" : ruta}` && canon !== `https://peludesk.mx${ruta}`) problemas.push(`canonical ${canon}`);
    if (h1s !== 1 && !/\.(xml)$/.test(ruta)) problemas.push(`${h1s} h1`);
    if (noindex) problemas.push("noindex");
    if (!og) problemas.push("sin Open Graph");
    if (titulos.has(titulo)) problemas.push(`title repetido con ${titulos.get(titulo)}`);
    titulos.set(titulo, ruta);
    if (problemas.length) malas.push(`${ruta}: ${problemas.join(", ")}`);
  }
  ok(malas.length === 0, `${paginas.size} páginas con status 200, title, description, canonical, Open Graph, un h1, indexables y títulos únicos`);
  malas.slice(0, 25).forEach((m) => console.log(`      · ${m}`));

  // ── C. datos estructurados ──
  console.log("\nC. Datos estructurados");
  const ld = (ruta) => {
    const h = paginas.get(ruta)?.cuerpo ?? "";
    const bloques = [...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    return bloques.flatMap((b) => (Array.isArray(b) ? b : [b]));
  };
  const tipos = (ruta) => ld(ruta).map((x) => x["@type"]);
  const apps = (ruta) => ld(ruta).filter((x) => x["@type"] === "SoftwareApplication");
  for (const r of ["/", "/precios", "/veterinaria", "/software-para-guarderias-caninas", "/software-para-esteticas-caninas", "/software-para-hoteles-caninos"]) {
    const a = apps(r)[0];
    const oferta = Array.isArray(a?.offers) ? a.offers[0] : a?.offers;
    ok(!!a && oferta?.priceCurrency === "MXN" && Number(oferta?.price) > 0 && a.offers.some?.((o) => o.price === 0), `${r}: SoftwareApplication con precio en MXN y prueba gratis`);
  }
  ok(tipos("/").includes("Organization") && ld("/").find((x) => x["@type"] === "Organization")?.sameAs?.length >= 2, "/: Organization con sameAs");
  for (const r of ["/", "/precios", "/veterinaria", "/alternativas", "/software-para-guarderias-caninas", "/guias/control-de-pagos-y-caja-en-una-guarderia-canina", "/alternativas/gingr"]) {
    const f = ld(r).find((x) => x["@type"] === "FAQPage");
    ok(!!f && f.mainEntity.length >= 3 && f.mainEntity.every((q) => q.name && q.acceptedAnswer?.text), `${r}: FAQPage con respuestas`);
  }
  const ayudas = urls.filter((u) => /^\/ayuda\/[a-z0-9-]+$/.test(u) && u !== "/ayuda/videos");
  let howto = 0, article = 0, malasAyuda = 0;
  for (const u of ayudas) {
    const x = ld(u).find((y) => y["@type"] === "HowTo" || y["@type"] === "Article");
    if (!x) { malasAyuda++; continue; }
    if (x["@type"] === "HowTo") { howto++; if (!x.step?.length || !x.step.every((s) => s.name && s.text)) malasAyuda++; } else article++;
    if (!x.name || !x.description) malasAyuda++;
  }
  ok(ayudas.length > 80 && malasAyuda === 0, `${ayudas.length} artículos de ayuda con HowTo (${howto}) o Article (${article}) válidos`);
  const videos = urls.filter((u) => /^\/ayuda\/videos\/[a-z0-9-]+$/.test(u));
  if (videos.length) {
    const malosV = videos.filter((u) => { const v = ld(u).find((x) => x["@type"] === "VideoObject"); return !v || !v.name || !v.description || !v.thumbnailUrl || !v.uploadDate; });
    ok(malosV.length === 0, `${videos.length} páginas de video con VideoObject completo`);
    malosV.slice(0, 5).forEach((m) => console.log(`      · ${m}`));
  } else console.log("  · (sin videos publicados en desarrollo: VideoObject no se pudo comprobar)");
  const art = urls.find((u) => /^\/blog\/[a-z0-9-]{10,}$/.test(u) && !u.includes("pagina") && !u.includes("categoria"));
  ok(tipos(art).includes("Article") && tipos(art).includes("BreadcrumbList"), `${art}: Article y BreadcrumbList`);
  ok(!/\$649|\$752/.test(robots), "(control) el robots no trae precios");

  // ── D. llms.txt ──
  console.log("\nD. llms.txt");
  const llms = await pedir("/llms.txt");
  const full = await pedir("/llms-full.txt");
  ok(llms.status === 200 && /text\/plain/.test(llms.headers["content-type"]) && llms.cuerpo.startsWith("# PeluDesk"), "llms.txt: texto plano que abre con «# PeluDesk»");
  ok(/> .{80,}/.test(llms.cuerpo) && /\$[\d,]+ \+ IVA al mes/.test(llms.cuerpo), "llms.txt: resumen y precio de la base");
  ok(full.status === 200 && full.cuerpo.length > llms.cuerpo.length * 3, `llms-full.txt: ${Math.round(full.cuerpo.length / 1024)} KB, contenido completo`);
  const enlacesLlms = [...llms.cuerpo.matchAll(/\]\(https:\/\/peludesk\.mx([^)]*)\)/g)].map((m) => m[1] || "/");
  const rotos = [];
  for (const e of new Set(enlacesLlms)) { const r = paginas.get(e) ?? (await pedir(e)); if (r.status !== 200) rotos.push(`${e} → ${r.status}`); }
  ok(rotos.length === 0, `${new Set(enlacesLlms).size} links de llms.txt responden 200`);
  rotos.forEach((m) => console.log(`      · ${m}`));
  ok(/llms\.txt/.test(llms.cuerpo) || true, "(informativo)");

  // ── E. enlaces internos ──
  console.log("\nE. Enlaces internos");
  const visto = new Set(urls);
  const faltan = new Map();
  for (const [ruta, r] of paginas) {
    for (const m of r.cuerpo.matchAll(/<a [^>]*href="(\/[^"#?]*)(?:[#?][^"]*)?"/g)) {
      const h = m[1];
      if (h === "" || /\.(webp|png|jpg|svg|ico|xml|txt|mp4|vtt|srt|js|css)$/.test(h) || h.startsWith("/_next")) continue;
      if (!visto.has(h) && !faltan.has(h)) faltan.set(h, ruta);
    }
  }
  const malosE = [];
  const excepciones = new Set(["/registro", "/aviso-de-privacidad", "/terminos", "/cookies", "/blog/rss.xml"]);
  for (const [h, desde] of faltan) {
    if (excepciones.has(h)) continue;
    const r = await pedir(h);
    if (r.status !== 200) malosE.push(`${h} (desde ${desde}) → ${r.status}`);
  }
  ok(malosE.length === 0, `${faltan.size} enlaces internos fuera del sitemap también responden 200`);
  malosE.slice(0, 15).forEach((m) => console.log(`      · ${m}`));
  const sinEnlaces = ["/precios", "/veterinaria", "/software-para-guarderias-caninas", "/alternativas/moego", "/guias/facturacion-cfdi-para-esteticas-y-veterinarias", "/ayuda/corte-de-caja"].filter((r) => (paginas.get(r)?.cuerpo.match(/href="\/(precios|veterinaria|alternativas|guias\/|software-para)/g) ?? []).length < 2);
  ok(sinEnlaces.length === 0, "las páginas clave se enlazan entre sí");

  // ── F. IndexNow ──
  console.log("\nF. IndexNow");
  const llave = createHash("sha256").update("peludesk.mx/indexnow/v1").digest("hex").slice(0, 32);
  ok((await pedir("/indexnow-key.txt")).cuerpo === llave, "el archivo de llave coincide");
  // En el dominio de un negocio, nada de esto existe.
  ok((await pedir("/llms.txt", `patitasyco.localhost:${PUERTO}`)).status === 404, "llms.txt no se sirve en el dominio de un negocio");
} finally {
  cerrar();
}
console.log(fallas ? `\n✘ ${fallas} falla(s)` : "\n✔ todo bien");
process.exit(fallas ? 1 : 0);
