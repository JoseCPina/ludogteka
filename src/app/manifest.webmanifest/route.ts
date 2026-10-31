import { type NextRequest } from "next/server";
import { CACHE_ICONO, marcaDeIcono } from "@/lib/negocio/icono";
import { esHostApp } from "@/lib/negocio/host";

// La app para dueños (app.peludesk.mx): PeluDesk, con sus íconos y sus tres pantallas como accesos directos.
function manifestApp() {
  return {
    id: "/",
    name: "PeluDesk",
    short_name: "PeluDesk",
    description: "La cartilla, los recordatorios y los negocios de tus mascotas, en un solo lugar.",
    lang: "es-MX",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#fff8ee",
    theme_color: "#fff8ee",
    categories: ["lifestyle", "health"],
    icons: [
      { src: "/icono-pwa?s=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-pwa?s=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-pwa?s=512&m=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/marca/peludesk/favicon-180.png", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      { name: "Mis mascotas", short_name: "Mascotas", url: "/", icons: [{ src: "/icono-pwa?s=192", sizes: "192x192", type: "image/png" }] },
      { name: "Avisos", short_name: "Avisos", url: "/avisos", icons: [{ src: "/icono-pwa?s=192", sizes: "192x192", type: "image/png" }] },
      { name: "Cerca de mí", short_name: "Cerca", url: "/cerca", icons: [{ src: "/icono-pwa?s=192", sizes: "192x192", type: "image/png" }] },
    ],
  };
}

// El manifest de cada negocio: su nombre, su color y su logo (nunca los de PeluDesk en el
// dominio de un negocio). Con él la app se instala en la pantalla de inicio y abre sin la
// barra del navegador. El ícono sale de /icono-pwa: el logo del negocio o, si no tiene,
// su inicial sobre su color.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (esHostApp(request.headers.get("host"))) {
    return new Response(JSON.stringify(manifestApp()), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": CACHE_ICONO } });
  }
  const { nombre, color } = await marcaDeIcono(request.headers.get("host"));
  const cuerpo = {
    id: "/",
    name: nombre,
    short_name: nombre.length > 12 ? nombre.slice(0, 12).trim() : nombre,
    description: `${nombre}: la agenda, los clientes y las mascotas en tu celular.`,
    lang: "es-MX",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: color,
    categories: ["business", "productivity"],
    icons: [
      { src: "/icono-pwa?s=192", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-pwa?s=512", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-pwa?s=512&m=1", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icono-negocio?s=180", sizes: "180x180", type: "image/png" },
    ],
    shortcuts: [
      { name: "Tablero del día", short_name: "Hoy", url: "/recepcion", icons: [{ src: "/icono-pwa?s=192", sizes: "192x192", type: "image/png" }] },
      { name: "Clientes", short_name: "Clientes", url: "/clientes", icons: [{ src: "/icono-pwa?s=192", sizes: "192x192", type: "image/png" }] },
    ],
  };
  return new Response(JSON.stringify(cuerpo), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": CACHE_ICONO } });
}
