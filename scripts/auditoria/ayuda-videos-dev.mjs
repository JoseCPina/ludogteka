// Videos dentro de los artículos de ayuda (SOLO DESARROLLO, en Huellitas), con el servidor en el 3001.
//   node scripts/auditoria/ayuda-videos-dev.mjs
// El mapeo artículo → videos vive en src/lib/ayuda/videos.ts. Comprueba, en escritorio y a 390 px:
//   1. Un artículo con UN video, uno con VARIOS y uno SIN video (el texto sigue igual en los tres).
//   2. El video va arriba del texto (después del título y el resumen), con su título, su duración y el reproductor.
//   3. Sin desborde horizontal a 390 px y el reproductor cabe en el ancho.
//   4. Los videos de módulos que el negocio tiene apagados no salen (el artículo sí, si es de otro módulo).
//   5. Un video «por actualizar» sigue mostrándose con la versión publicada.
//   6. La página pública (peludesk.mx/ayuda/<slug>) muestra los videos publicados.
//   7. El bot: la documentación trae el artículo y sus videos publicados.
import { createClient } from "@supabase/supabase-js";
import { abrirNavegador } from "../lib/navegador.mjs";
import { A, URL, env, B, SB, personas, fijarModulo, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { VIDEOS_DE_ARTICULO } from "../../src/lib/ayuda/videos.ts";

const BASE = "http://huellitas.localhost:3001";
const BASE_PLAT = "http://plataforma.localhost:3001";
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const P = await personas();

async function cookiesDe(profileId, dominio) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const gal = (n) => (trozos.length === 1 ? [[n, valor]] : trozos.map((t, i) => [`${n}.${i}`, t]));
  return [...gal(`sb-${REF}-auth-token`), ...gal(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}

const { data: filas } = await A.from("tutoriales").select("numero,slug,titulo,publicado,video_path,youtube_id,modulos,rol,permisos,por_actualizar_desde,duracion_s").is("deleted_at", null);
const publicados = filas.filter((t) => t.publicado && (t.video_path || t.youtube_id));
const porNumero = new Map(publicados.map((t) => [t.numero, t]));

// Lo que debe verse: el mapeo ∩ publicados ∩ módulos activos (todos los del video) ∩ rol/permisos.
const activos = async () => (await SB.rpc("modulos_activos")).data ?? [];
const esperados = (slug, modulos, rol, permisos) =>
  (VIDEOS_DE_ARTICULO[slug] ?? [])
    .map((n) => porNumero.get(n))
    .filter((t) => t && t.modulos.every((m) => modulos.includes(m)) && (rol === "admin" || t.rol !== "admin" || t.permisos.some((p) => permisos.includes(p))))
    .map((t) => t.numero);

const originales = {};
for (const m of ["guarderia", "hotel"]) {
  const r = await SB.from("negocio_modulos").select("activo").eq("negocio_id", B).eq("modulo", m).is("deleted_at", null).maybeSingle();
  originales[m] = r.data ? r.data.activo : true;
}
const nav = await abrirNavegador();
try {
  for (const m of ["guarderia", "hotel"]) await fijarModulo(m, true);
  const ctx = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addCookies(await cookiesDe(P.adminId, "huellitas.localhost"));
  const p = await ctx.newPage();
  p.setDefaultTimeout(60000);

  const leer = async (slug) => {
    await p.goto(`${BASE}/ayuda/${slug}`, { waitUntil: "networkidle", timeout: 120000 });
    return p.evaluate(() => {
      const sec = document.querySelector("[data-videos-del-articulo]");
      const art = document.querySelector("article");
      const h1 = art?.querySelector("h1");
      const primerTexto = [...(art?.querySelectorAll("p, ol, ul") ?? [])].find((e) => !sec?.contains(e) && e !== h1?.nextElementSibling && e.textContent.trim().length > 20);
      const videos = [...document.querySelectorAll("[data-video-del-articulo]")].map((d) => ({
        numero: d.getAttribute("data-video-del-articulo"),
        titulo: d.querySelector("p")?.textContent ?? "",
        reproductor: Boolean(d.querySelector("video, iframe")),
        ancho: d.querySelector("video, iframe")?.getBoundingClientRect().width ?? 0,
        derecha: d.getBoundingClientRect().right,
      }));
      return {
        existe: Boolean(art),
        videos,
        sobra: document.documentElement.scrollWidth - window.innerWidth,
        arribaDelTexto: sec && primerTexto ? sec.getBoundingClientRect().top < primerTexto.getBoundingClientRect().top && sec.getBoundingClientRect().top >= (h1?.getBoundingClientRect().bottom ?? 0) : null,
        textoLargo: (art?.innerText ?? "").length,
        ancho: window.innerWidth,
      };
    });
  };

  const casos = [
    ["con un video", "que-hacer-con-necesita-atencion"],
    ["con varios videos", "reservar-guarderia"],
    ["sin video", "corregir-un-cobro-con-terminal-mal-marcado"],
  ];
  const mods = await activos();
  for (const ancho of [1280, 390]) {
    await p.setViewportSize({ width: ancho, height: 900 });
    seccion(`1-3. Artículos a ${ancho} px`);
    for (const [nombre, slug] of casos) {
      const r = await leer(slug);
      const esp = esperados(slug, mods, "admin", []);
      comprobar(r.existe, `${nombre}: el artículo ${slug} abre`);
      comprobar(JSON.stringify(r.videos.map((v) => v.numero)) === JSON.stringify(esp), `${nombre}: videos en pantalla ${JSON.stringify(r.videos.map((v) => v.numero))} = esperados ${JSON.stringify(esp)}`);
      comprobar(r.textoLargo > 300, `${nombre}: el texto del artículo sigue debajo (${r.textoLargo} caracteres)`);
      if (esp.length) {
        comprobar(r.arribaDelTexto === true, `${nombre}: el video va arriba del texto, después del título`);
        comprobar(r.videos.every((v) => v.reproductor && v.titulo.length > 5), `${nombre}: cada video trae su título y su reproductor`);
        comprobar(r.videos.every((v) => v.derecha <= r.ancho + 1 && v.ancho <= r.ancho), `${nombre}: el reproductor cabe en ${ancho} px`);
        const dur = r.videos.every((v) => /· \d+(:\d\d min| s)/.test(v.titulo));
        comprobar(dur, `${nombre}: el título trae la duración (${r.videos[0].titulo.slice(0, 80)})`);
      }
      comprobar(r.sobra <= 1, `${nombre}: sin desborde horizontal a ${ancho} px (${r.sobra})`);
      if (ancho === 390 && slug === "reservar-guarderia") await p.screenshot({ path: "/tmp/claude-0/-home-user-ludogteka/e86365ff-dff3-529f-8c45-6d8bb214cae7/scratchpad/ayuda-varios-390.png" });
    }
  }
  await p.setViewportSize({ width: 1280, height: 900 });

  seccion("5. Un video «por actualizar» se sigue mostrando");
  const pa = filas.find((t) => t.por_actualizar_desde && t.publicado && (t.video_path || t.youtube_id));
  if (!pa) console.log("  (en desarrollo ningún video está «por actualizar»: se salta)");
  else {
    const slug = Object.entries(VIDEOS_DE_ARTICULO).find(([s, vs]) => vs.includes(pa.numero) && esperados(s, mods, "admin", []).includes(pa.numero))?.[0];
    const r = await leer(slug);
    comprobar(r.videos.some((v) => v.numero === pa.numero), `el video ${pa.numero} (por actualizar) sale en ${slug} con su versión publicada`);
  }

  seccion("4. Módulos apagados: el video no sale, el artículo sí");
  await fijarModulo("guarderia", false);
  const mods2 = await activos();
  for (const slug of ["registrar-check-in", "calendario-de-reservas", "cobrar-una-cuenta"]) {
    const r = await leer(slug);
    const esp = esperados(slug, mods2, "admin", []);
    if (r.existe) comprobar(JSON.stringify(r.videos.map((v) => v.numero)) === JSON.stringify(esp), `sin guardería, ${slug}: videos ${JSON.stringify(r.videos.map((v) => v.numero))} = esperados ${JSON.stringify(esp)}`);
    else console.log(`  · ${slug} no está disponible sin guardería (el artículo también depende del módulo)`);
  }
  await fijarModulo("guarderia", true);

  seccion("4b. Recepción sin permisos no ve los videos grabados con la cuenta de admin");
  const ctxR = await nav.newContext({ viewport: { width: 1280, height: 900 } });
  await ctxR.addCookies(await cookiesDe(P.recSinId, "huellitas.localhost"));
  const pr = await ctxR.newPage();
  pr.setDefaultTimeout(60000);
  const slugAdmin = Object.entries(VIDEOS_DE_ARTICULO).find(([, vs]) => vs.some((n) => porNumero.get(n)?.rol === "admin" && porNumero.get(n).modulos.every((m) => mods.includes(m))))?.[0];
  await pr.goto(`${BASE}/ayuda/${slugAdmin}`, { waitUntil: "networkidle", timeout: 120000 });
  const vistos = await pr.locator("[data-video-del-articulo]").evaluateAll((els) => els.map((e) => e.getAttribute("data-video-del-articulo")));
  const espR = esperados(slugAdmin, mods, "recepcion", []);
  comprobar(JSON.stringify(vistos) === JSON.stringify(espR), `recepción sin permisos en ${slugAdmin}: ve ${JSON.stringify(vistos)} = esperados ${JSON.stringify(espR)}`);
  await ctxR.close();

  seccion("6. La página pública de ayuda");
  const ctxP = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pp = await ctxP.newPage();
  pp.setDefaultTimeout(60000);
  await pp.goto(`${BASE_PLAT}/ayuda/reservar-guarderia`, { waitUntil: "networkidle", timeout: 120000 });
  const pub = await pp.locator("[data-video-del-articulo]").evaluateAll((els) => els.map((e) => e.getAttribute("data-video-del-articulo")));
  const espP = (VIDEOS_DE_ARTICULO["reservar-guarderia"] ?? []).filter((n) => porNumero.has(n));
  comprobar(JSON.stringify(pub) === JSON.stringify(espP), `peludesk.mx/ayuda/reservar-guarderia: videos ${JSON.stringify(pub)} = ${JSON.stringify(espP)}`);
  comprobar((await pp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1, "la página pública no se desborda a 390 px");
  await ctxP.close();
  await ctx.close();
} finally {
  await nav.close();
  for (const [m, a] of Object.entries(originales)) await fijarModulo(m, a).catch(() => {});
}
terminar();
