// La vista previa de un link (lo que WhatsApp y Meta enseñan al compartir)
// es del negocio, en todas sus rutas públicas (SOLO DESARROLLO). Con el
// servidor prendido en el 3001 (`npm run build && npm run start -- -p 3001`).
//
//   node scripts/auditoria/vista-previa-dev.mjs
//
// Lo que reportó Ludogteka el 30 de septiembre de 2026: al compartir un
// link de alta salía un triángulo negro en vez de su logo. Desde el 25 de
// septiembre el layout raíz ya no traía og:image (la de Ludogteka vivía en
// src/app/opengraph-image.jpg, que aplicaba a todas sus páginas) y
// /favicon.ico contestaba 307 (los rastreadores no siguen redirecciones).
//   - En login, alta por link, complemento y portal: og:title y og:site_name
//     con el nombre del negocio (nunca PeluDesk), og:image absoluta con el
//     dominio del negocio, og:locale es_MX, twitter:card.
//   - La og:image existe (200, image/jpeg o png): Ludogteka la suya de
//     siempre (opengraph-image.jpg, marca.imagen_compartir); Huellitas la
//     tarjeta generada con su nombre.
//   - /favicon.ico entrega el ícono con 200 (ICO de Ludogteka; genérico en
//     Huellitas), sin redirección.
//   - En el dominio de la plataforma, nada de un negocio.
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 3001;
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";

const pedir = (host, ruta) =>
  new Promise((resolve, reject) => {
    http.get({ host: "127.0.0.1", port: PUERTO, path: ruta, headers: { host: `${host}:${PUERTO}`, "user-agent": UA } }, (res) => {
      const trozos = [];
      res.on("data", (c) => trozos.push(c));
      res.on("end", () => resolve({ status: res.statusCode, tipo: res.headers["content-type"] ?? "", location: res.headers.location ?? null, xrobots: res.headers["x-robots-tag"] ?? "", cuerpo: Buffer.concat(trozos) }));
    }).on("error", reject);
  });
const meta = (html, prop) => html.match(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`))?.[1] ?? html.match(new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${prop}"`))?.[1] ?? null;

const { data: huellitas } = await A.from("negocios").select("id, nombre").eq("slug", "huellitas").single();
const SH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": huellitas.id } } });
const { data: recep } = await SH.from("membresias").select("profile_id").eq("negocio_id", huellitas.id).eq("rol", "recepcion").is("deleted_at", null).limit(1).single();
// Un link de alta y uno de complemento reales de Huellitas.
const { tokenDe } = await import("./sesiones-dev.mjs");
const recepJ = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(recep.profile_id)}`, "x-negocio-id": huellitas.id } } });
const { data: cli } = await SH.from("clientes").select("id").eq("negocio_id", huellitas.id).is("deleted_at", null).eq("publico_general", false).limit(1).single();
const link = async (cliente) => {
  const { data, error } = await recepJ.rpc("crear_invitacion_cliente", { p_nombre_referencia: "Vista previa", p_telefono: "8110009999", p_dias_vigencia: 1, p_tipo: "guarderia_hotel", p_cliente_id: cliente });
  if (error) throw new Error(`crear_invitacion_cliente: ${error.message}`);
  return (Array.isArray(data) ? data[0] : data).token;
};
const tokenAlta = await link(null);
const tokenComplemento = await link(cli.id);

const NEGOCIOS = [
  { host: "ludogteka.localhost", nombre: "Ludogteka", imagen: /opengraph-image\.jpg$/, color: "#4458a7" },
  { host: "huellitas.localhost", nombre: huellitas.nombre, imagen: /\/imagen-negocio$/, color: null },
];
try {
  for (const n of NEGOCIOS) {
    console.log(`\n${n.nombre} (${n.host})`);
    for (const ruta of ["/login", `/alta/${tokenAlta}`, `/alta/${tokenComplemento}`, "/portal"]) {
      const r = await pedir(n.host, ruta);
      const html = r.cuerpo.toString("utf8");
      // /portal sin sesión redirige al login: la vista previa es la del login.
      if (r.status >= 300 && r.status < 400) {
        if (ruta === "/portal") { bien(`${ruta}: redirige a ${r.location} (sin sesión), la vista previa es la del login`); continue; }
        hallazgo(`${ruta} respondió ${r.status} → ${r.location}`);
        continue;
      }
      if (r.status !== 200) { hallazgo(`${ruta} respondió ${r.status}`); continue; }
      const og = { title: meta(html, "og:title"), site: meta(html, "og:site_name"), image: meta(html, "og:image"), locale: meta(html, "og:locale"), tw: meta(html, "twitter:card"), twImg: meta(html, "twitter:image") };
      const malos = [];
      if (og.title !== n.nombre) malos.push(`og:title «${og.title}»`);
      if (og.site !== n.nombre) malos.push(`og:site_name «${og.site}»`);
      if (!og.image || !og.image.startsWith(`http://${n.host}`) || !n.imagen.test(og.image)) malos.push(`og:image «${og.image}»`);
      if (og.locale !== "es_MX") malos.push(`og:locale «${og.locale}»`);
      if (og.tw !== "summary_large_image" || !og.twImg) malos.push(`twitter «${og.tw}» «${og.twImg}»`);
      if (/PeluDesk/.test(og.title ?? "") || /PeluDesk/.test(og.site ?? "")) malos.push("dice PeluDesk");
      if (malos.length) hallazgo(`${ruta}: ${malos.join("; ")}`);
      else bien(`${ruta}: og:title/site_name «${n.nombre}», og:image ${og.image.replace(`http://${n.host}:${PUERTO}`, "")}, es_MX, twitter`);
      if (og.image) {
        const ruta = og.image.replace(`http://${n.host}:${PUERTO}`, "");
        const img = await pedir(n.host, ruta);
        if (img.status !== 200 || !/^image\/(jpeg|png)/.test(img.tipo) || img.cuerpo.length < 5000) hallazgo(`${ruta}: ${img.status} ${img.tipo} ${img.cuerpo.length} bytes`);
        else bien(`la imagen ${ruta} existe: ${img.tipo}, ${Math.round(img.cuerpo.length / 1024)} KB, sin redirección`);
      }
    }
    // Íconos: todas las etiquetas del head, con los tamaños declarados, y cada
    // href responde 200 como imagen. Nunca el de Vercel ni el de PeluDesk.
    for (const ruta of ["/", "/login", `/alta/${tokenAlta}`, "/portal"]) {
      const pg = await pedir(n.host, ruta);
      if (pg.status >= 300 && pg.status < 400) continue; // /portal sin sesión: el login ya se revisó
      const cab = pg.cuerpo.toString("utf8");
      const links = [...cab.matchAll(/<link[^>]*>/g)].map((m) => m[0]).filter((l) => /rel="(?:shortcut icon|icon|apple-touch-icon|mask-icon|manifest)"/.test(l));
      const tamanos = new Set(links.map((l) => Number(l.match(/sizes="(\d+)x/)?.[1])).filter(Boolean));
      const faltan = [16, 32, 48, 180, 512].filter((t) => !tamanos.has(t));
      if (faltan.length) hallazgo(`${n.host}${ruta}: faltan íconos declarados de ${faltan.join(", ")}`);
      if (!links.some((l) => /rel="apple-touch-icon"/.test(l))) hallazgo(`${n.host}${ruta}: sin apple-touch-icon`);
      if (!links.some((l) => /rel="manifest"/.test(l))) hallazgo(`${n.host}${ruta}: sin manifest`);
      for (const l of links) {
        const href = l.match(/href="([^"]+)"/)?.[1]?.replaceAll("&amp;", "&");
        if (!href || /vercel|next\.svg|peludesk\/(isotipo|favicon)/i.test(href)) { hallazgo(`${n.host}${ruta}: ícono prohibido ${href}`); continue; }
        const r = await pedir(n.host, href.replace(`http://${n.host}:${PUERTO}`, ""));
        if (r.status !== 200 || !/^image\/|manifest/.test(r.tipo) || r.cuerpo.length < 100) hallazgo(`${n.host}${ruta}: ${href} → ${r.status} ${r.tipo} ${r.cuerpo.length} bytes`);
      }
      if (ruta === "/") bien(`${n.host}: ${links.length} etiquetas de ícono/manifest, tamaños ${[...tamanos].sort((x, y) => x - y).join(", ")}, todos los href con 200`);
    }
    const fav = await pedir(n.host, "/favicon.ico");
    if (fav.status !== 200 || !fav.tipo.startsWith("image/") || fav.cuerpo.length < 100) hallazgo(`/favicon.ico: ${fav.status} ${fav.tipo} ${fav.cuerpo.length} bytes → ${fav.location}`);
    else bien(`/favicon.ico entrega el ícono con 200 (${fav.tipo}, ${fav.cuerpo.length} bytes)`);
    const svg = (await pedir(n.host, "/icono-negocio")).cuerpo.toString("utf8");
    if (!svg.includes(`>${n.nombre[0].toUpperCase()}</text>`) || (n.color && !svg.includes(n.color))) hallazgo(`${n.host}: /icono-negocio no trae su inicial${n.color ? " y color" : ""}`);
    else bien(`${n.host}: /icono-negocio con su inicial${n.color ? " y su color " + n.color : ""}`);
    // Reportes y galerías: una liga falsa, con el rastreador de vistas previas.
    for (const pre of ["r", "f"]) {
      const falsa = await pedir(n.host, `/${pre}/liga-falsa-0123456789`);
      const txt = falsa.cuerpo.toString("utf8");
      if (falsa.status !== 200 || !/no está disponible/.test(txt) || !/noindex/.test(txt + falsa.xrobots)) hallazgo(`${n.host}/${pre}/<falsa>: ${falsa.status}, mensaje o noindex`);
      else bien(`${n.host}/${pre}/<falsa>: la alcanza facebookexternalhit, "liga no disponible" y noindex`);
    }
  }
  console.log("\nplataforma.localhost");
  const p = await pedir("plataforma.localhost", "/login");
  const html = p.cuerpo.toString("utf8");
  if (/Huellitas|Ludogteka/.test(meta(html, "og:title") ?? "") || /Huellitas|Ludogteka/.test(html.match(/<title>([^<]*)/)?.[1] ?? "")) hallazgo("la plataforma enseña un negocio en su vista previa");
  else bien("en el dominio de la plataforma no sale ningún negocio");
  const pf = await pedir("plataforma.localhost", "/favicon.ico");
  if (pf.status !== 200 || !pf.tipo.startsWith("image/")) hallazgo(`favicon de la plataforma: ${pf.status} ${pf.tipo}`);
  else bien("la plataforma entrega su favicon con 200");
} finally {
  await SH.from("invitaciones_cliente").delete().in("token", [tokenAlta, tokenComplemento]);
}

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
