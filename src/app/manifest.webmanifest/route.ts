import { type NextRequest } from "next/server";
import { CACHE_ICONO, marcaDeIcono } from "@/lib/negocio/icono";

// El manifest de cada negocio: su nombre, su color y sus íconos (nunca los de
// PeluDesk en el dominio de un negocio).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { nombre, color } = await marcaDeIcono(request.headers.get("host"));
  const cuerpo = {
    name: nombre,
    short_name: nombre.slice(0, 12),
    start_url: "/",
    display: "browser",
    background_color: "#ffffff",
    theme_color: color,
    icons: [
      { src: "/icono-negocio?s=180", sizes: "180x180", type: "image/png" },
      { src: "/icono-negocio?s=512", sizes: "512x512", type: "image/png" },
    ],
  };
  return new Response(JSON.stringify(cuerpo), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": CACHE_ICONO } });
}
