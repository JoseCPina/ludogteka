// Precios de páginas PÚBLICAS de plataformas: Doctoralia (consulta veterinaria) y plataformas de cuidadores con
// precio por noche en México. Solo páginas públicas, respetando robots.txt y 1.2 s entre peticiones por sitio.
//
//   node --experimental-strip-types scripts/mercado/publicas.mjs doctoralia [--prod] [--ciudades "Guadalajara,…"] [--paginas 3]
//   node --experimental-strip-types scripts/mercado/publicas.mjs cuidadores [--prod] [--ciudades …] [--paginas 3]
//
// Cada plataforma es una entrada de PLATAFORMAS: cómo se arma la URL de una ciudad y el giro/servicio que se busca.
// Si una plataforma cambia su sitio o su robots.txt la prohíbe, la corrida lo dice y no inventa nada. La IA
// clasifica cada cantidad (mismo tope de 300 MXN); la ciudad del precio es la de la página que se pidió.
import { abrirBase, abrirIA, bajarPagina, clasificarCandidatos, Corrida, insertarPrecios, lista, prod, valor } from "./lib.mjs";
import { candidatosDePrecio, textoDeHtml } from "../../src/lib/mercado/extraer.ts";
import { CIUDADES_NACIONALES } from "../../src/lib/prospectos/nacional.ts";

const slug = (t) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

const PLATAFORMAS = {
  doctoralia: {
    fuente: "doctoralia",
    giro: "veterinaria",
    nota: "Doctoralia México: listados públicos de veterinarios por ciudad; el precio de consulta aparece en cada tarjeta cuando el médico lo publica.",
    urls: (ciudad) => [`https://www.doctoralia.com.mx/veterinario/${slug(ciudad)}`, `https://www.doctoralia.com.mx/buscar?q=veterinario&loc=${encodeURIComponent(ciudad)}`],
  },
  cuidadores: {
    fuente: "cuidadores",
    giro: "hotel",
    nota: "Plataformas de cuidadores con precio por noche publicado en México (hospedaje en casa del cuidador).",
    urls: (ciudad) => [
      `https://www.petbacker.mx/s/hospedaje-de-mascotas/${slug(ciudad)}`,
      `https://www.petbacker.com/es-mx/s/hospedaje-de-mascotas/${slug(ciudad)}-mexico`,
      `https://www.rover.com/mx/alojamiento-de-mascotas/${slug(ciudad)}/`,
    ],
  },
};

const plataforma = PLATAFORMAS[process.argv[2]];
if (!plataforma) {
  console.error("Uso: publicas.mjs doctoralia|cuidadores [--prod] [--ciudades …] [--paginas N]");
  process.exit(1);
}
const PAGINAS = Number(valor("--paginas") ?? 3);
const ciudades = lista("--ciudades") ?? [...new Set(CIUDADES_NACIONALES.slice(0, 40).map((c) => c.nombre.replace(/,\s*[^,]+$/, "")))];
const estadoDe = (ciudad) => CIUDADES_NACIONALES.find((c) => c.nombre.replace(/,\s*[^,]+$/, "") === ciudad)?.estado ?? null;

const db = await abrirBase();
const ia = abrirIA();
const corrida = await new Corrida(db, plataforma.fuente).empezar();
corrida.detalle.notas.push(plataforma.nota);
const candidatos = [];
const porUrl = {};
try {
  for (const ciudad of ciudades) {
    for (const base of plataforma.urls(ciudad)) {
      let siguiente = base;
      for (let pagina = 1; pagina <= PAGINAS && siguiente; pagina++) {
        const r = await bajarPagina(siguiente);
        corrida.revisados++;
        porUrl[new URL(siguiente).host] ??= { ok: 0, mal: {} };
        if (!r.html) {
          porUrl[new URL(siguiente).host].mal[r.motivo] = (porUrl[new URL(siguiente).host].mal[r.motivo] ?? 0) + 1;
          break;
        }
        porUrl[new URL(siguiente).host].ok++;
        const texto = textoDeHtml(r.html);
        for (const c of candidatosDePrecio(texto, plataforma.giro, `${slug(ciudad)}-${pagina}`, 60)) candidatos.push({ ...c, giro: plataforma.giro, ciudad, url: r.url ?? siguiente });
        // Paginación: ?page=N o /N al final.
        const m = r.html.match(/href=["']([^"']*[?&](?:page|pagina|p)=(\d+)[^"']*)["']/i);
        siguiente = m && Number(m[2]) === pagina + 1 ? new URL(m[1].replace(/&amp;/g, "&"), siguiente).href : null;
      }
    }
  }
  corrida.detalle.sitios = porUrl;
  console.log(`  ${candidatos.length} cantidades por clasificar`, JSON.stringify(porUrl));
  const clasificados = await clasificarCandidatos(ia, corrida, candidatos);
  corrida.encontrados = clasificados.length;
  await insertarPrecios(db, corrida, clasificados.map((c) => ({ giro: c.giro, servicio: c.servicio, talla: c.talla, precio: c.precio, ciudad: c.ciudad, estado: estadoDe(c.ciudad), fuente: plataforma.fuente, url: c.url, detalle: c.contexto.slice(0, 200), origen: `${c.url}#${c.id}` })));
  await corrida.terminar();
} catch (e) {
  await corrida.terminar(e.message);
  process.exit(1);
}
