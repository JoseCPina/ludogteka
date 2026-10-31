import { NextResponse, type NextRequest } from "next/server";
import { posicionEnRango, servicioMercado } from "@/lib/mercado/catalogo";
import { leerConsulta, rangoDe } from "@/lib/mercado/rangos";

/**
 * La insignia incrustable «Dentro del rango de su ciudad»: un SVG de 260×60 que el negocio pega en su web con el link
 * al índice. Solo se dibuja si el precio que trae de verdad queda dentro del rango de la ciudad (p25–p75); si no,
 * responde 404: la insignia no se puede falsificar cambiando la dirección.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const escapar = (t: string) => t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const c = await leerConsulta({ giro: p.get("giro"), servicio: p.get("servicio"), ciudad: p.get("ciudad"), talla: p.get("talla") });
  const precio = Number(p.get("precio"));
  if (!c || !c.ciudad || !Number.isFinite(precio) || precio <= 0) return new NextResponse("No encontrada.", { status: 404 });
  const rango = await rangoDe(c);
  if (rango.nivel !== "ciudad" || posicionEnRango(precio, rango) !== "dentro") return new NextResponse("No encontrada.", { status: 404 });
  const s = servicioMercado(c.servicio)!;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="60" viewBox="0 0 260 60" role="img" aria-label="Dentro del rango de ${escapar(c.ciudad.nombre)} · Índice PeluDesk de precios">
  <rect width="260" height="60" rx="12" fill="#fff8ee" stroke="#a7d8c8" stroke-width="2"/>
  <circle cx="30" cy="30" r="14" fill="#1f6b57"/>
  <path d="M23 30.5l4.5 4.5L37.5 25" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="54" y="25" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="700" fill="#2b2a33">Dentro del rango de ${escapar(c.ciudad.nombre)}</text>
  <text x="54" y="42" font-family="Arial, Helvetica, sans-serif" font-size="11" fill="#5e5968">${escapar(s.nombre)} · Índice PeluDesk de precios</text>
</svg>`;
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, max-age=86400, s-maxage=86400" } });
}
