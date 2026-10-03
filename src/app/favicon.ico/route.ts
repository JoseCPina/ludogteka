import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { resolverNegocio } from "@/lib/negocio/resolver";
import { esHostPlataforma } from "@/lib/negocio/host";
import { CACHE_ICONO, iconoPng, marcaDeIcono } from "@/lib/negocio/icono";

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
      return new NextResponse(await r.arrayBuffer(), { headers: { "Content-Type": tipo, "Cache-Control": CACHE_ICONO } });
    }
    const limpio = path.posix.normalize(ruta);
    const tipo = TIPOS[path.posix.extname(limpio).toLowerCase()];
    if (!limpio.startsWith("/") || limpio.includes("..") || !tipo) return null;
    const bytes = await readFile(path.join(process.cwd(), "public", limpio));
    return new NextResponse(bytes, { headers: { "Content-Type": tipo, "Content-Length": String(bytes.byteLength), "Cache-Control": CACHE_ICONO } });
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const host = request.headers.get("host");
  if (esHostPlataforma(host)) {
    return (await entregar("/marca/peludesk/favicon.ico")) ?? new NextResponse(null, { status: 404 });
  }
  const { inicial, color } = await marcaDeIcono(host);
  try {
    const negocio = await resolverNegocio(host);
    if (negocio?.icono) {
      const propio = await entregar(negocio.icono);
      if (propio) return propio;
    }
  } catch {
    // Sin base, el generado.
  }
  // Sin ícono propio: el generado con su inicial (PNG 32: lo que un
  // navegador espera en /favicon.ico), entregado aquí mismo, sin redirección.
  return iconoPng(32, inicial, color);
}
