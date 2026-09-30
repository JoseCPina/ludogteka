import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { resolverNegocio } from "@/lib/negocio/resolver";
import { esHostPlataforma } from "@/lib/negocio/host";

// Los navegadores, buscadores y las vistas previas de WhatsApp y Meta piden
// /favicon.ico aunque la página diga otro ícono. Esta ruta no pasa por el
// middleware (su matcher la excluye), así que resuelve el negocio por el
// dominio aquí mismo y ENTREGA el ícono de su configuración con 200 (los
// rastreadores no siguen una redirección: con el 307 de antes, WhatsApp
// enseñaba el ícono genérico). Sin ícono propio, el que se arma con su
// inicial (/icono-negocio).
export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = { ".ico": "image/x-icon", ".png": "image/png", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };

async function entregar(ruta: string): Promise<Response | null> {
  try {
    if (ruta.startsWith("https://")) {
      const r = await fetch(ruta, { signal: AbortSignal.timeout(8_000) });
      const tipo = r.headers.get("content-type") ?? "";
      if (!r.ok || !tipo.startsWith("image/")) return null;
      return new NextResponse(await r.arrayBuffer(), { headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=3600" } });
    }
    const limpio = path.posix.normalize(ruta);
    const tipo = TIPOS[path.posix.extname(limpio).toLowerCase()];
    if (!limpio.startsWith("/") || limpio.includes("..") || !tipo) return null;
    const bytes = await readFile(path.join(process.cwd(), "public", limpio));
    return new NextResponse(bytes, { headers: { "Content-Type": tipo, "Content-Length": String(bytes.byteLength), "Cache-Control": "public, max-age=3600" } });
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const host = request.headers.get("host");
  if (esHostPlataforma(host)) {
    return (await entregar("/marca/peludesk/favicon.ico")) ?? new NextResponse(null, { status: 404 });
  }
  let inicial = "P";
  let color = "#4b3f72";
  try {
    const negocio = await resolverNegocio(host);
    if (negocio?.icono) {
      const propio = await entregar(negocio.icono);
      if (propio) return propio;
    }
    if (negocio) {
      inicial = (negocio.nombre.trim()[0] ?? "P").toUpperCase();
      color = negocio.color ?? color;
    }
  } catch {
    // Sin base, el genérico.
  }
  // Sin ícono propio: el que se arma con su inicial, entregado aquí mismo
  // (el mismo de /icono-negocio) y no con una redirección.
  const escapada = inicial.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="38" font-weight="700" fill="#fff">${escapada}</text></svg>`;
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=3600" } });
}
