import { ImageResponse } from "next/og";
import { resolverNegocio } from "@/lib/negocio/resolver";
import { esHostPlataforma } from "@/lib/negocio/host";

// El ícono generado de un negocio (su inicial sobre su color) en SVG y en los
// tamaños que piden pestañas, iOS/Android y el manifest. Un solo lugar: lo usan
// /icono-negocio, /favicon.ico y /manifest.webmanifest. En el dominio de un
// negocio NUNCA sale la "P" de PeluDesk; en la plataforma, sí.
export const TAMANOS_ICONO = [16, 32, 48, 180, 512] as const;
const COLOR_POR_OMISION = "#4b3f72";

export async function marcaDeIcono(host: string | null): Promise<{ inicial: string; color: string; nombre: string }> {
  if (esHostPlataforma(host)) return { inicial: "P", color: COLOR_POR_OMISION, nombre: "PeluDesk" };
  let inicial = "P";
  let color = COLOR_POR_OMISION;
  let nombre = "PeluDesk";
  try {
    const negocio = await resolverNegocio(host);
    if (negocio) {
      nombre = negocio.nombre;
      inicial = (negocio.nombre.trim()[0] ?? "P").toUpperCase();
      if (negocio.color && /^#[0-9a-fA-F]{6}$/.test(negocio.color)) color = negocio.color;
    }
  } catch {
    // Sin base, el genérico.
  }
  return { inicial, color, nombre };
}

export const CACHE_ICONO = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400";

export function iconoSvg(inicial: string, color: string): Response {
  const escapada = inicial.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#fff">${escapada}</text></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": CACHE_ICONO } });
}

export function iconoPng(tam: number, inicial: string, color: string): Response {
  const img = new ImageResponse(
    (
      <div style={{ width: tam, height: tam, display: "flex", alignItems: "center", justifyContent: "center", background: color, borderRadius: Math.round(tam * 0.22), color: "#fff", fontSize: Math.round(tam * 0.62), fontWeight: 700, fontFamily: "sans-serif" }}>
        {inicial}
      </div>
    ),
    { width: tam, height: tam },
  );
  return new Response(img.body, { headers: { "Content-Type": "image/png", "Cache-Control": CACHE_ICONO } });
}

// Los <link> del head de un negocio sin ícono propio: svg + cada tamaño + iOS.
export const ICONOS_GENERADOS = {
  icon: [
    { url: "/icono-negocio", type: "image/svg+xml" },
    ...([16, 32, 48, 512] as const).map((t) => ({ url: `/icono-negocio?s=${t}`, type: "image/png", sizes: `${t}x${t}` })),
  ],
  apple: [{ url: "/icono-negocio?s=180", sizes: "180x180", type: "image/png" }],
};
