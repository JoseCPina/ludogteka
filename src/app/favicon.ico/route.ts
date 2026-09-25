import { NextResponse, type NextRequest } from "next/server";
import { resolverNegocio } from "@/lib/negocio/resolver";
import { esHostPlataforma } from "@/lib/negocio/host";

// Los navegadores y buscadores piden /favicon.ico aunque la página diga
// otro ícono. Esta ruta no pasa por el middleware (su matcher la excluye),
// así que resuelve el negocio por el dominio aquí mismo y manda al ícono
// de su configuración, o al que se arma con su inicial.
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  let destino = "/icono-negocio";
  if (esHostPlataforma(request.headers.get("host"))) {
    return new NextResponse(null, { status: 307, headers: { Location: "/marca/peludesk/favicon.ico", "Cache-Control": "public, max-age=3600" } });
  }
  try {
    const negocio = await resolverNegocio(request.headers.get("host"));
    if (negocio?.icono) destino = negocio.icono;
  } catch {
    // Sin base, el genérico.
  }
  // Location relativo: request.url trae el origen del servidor (localhost
  // en `next start`), no el dominio que pidió el navegador.
  return new NextResponse(null, { status: 307, headers: { Location: destino, "Cache-Control": "public, max-age=3600" } });
}
