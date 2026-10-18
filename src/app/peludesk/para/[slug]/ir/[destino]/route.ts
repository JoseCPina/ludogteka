import { NextResponse, type NextRequest } from "next/server";
import { prospectoPorSlug, registrarVisita, whatsappVentas } from "@/lib/prospectos/pagina";

// Los botones de la página de un prospecto: registran el clic en el CRM y mandan a donde toca.
//   prueba    → /registro con el nombre, la ciudad, los servicios y el teléfono del negocio ya escritos
//   whatsapp  → el WhatsApp de ventas de PeluDesk con un mensaje que dice de qué negocio viene
// Location relativa para lo propio (nunca el origen de request.url: en next start es localhost).
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; destino: string }> }) {
  const { slug, destino } = await params;
  const p = await prospectoPorSlug(slug);
  if (!p || (destino !== "prueba" && destino !== "whatsapp")) return new NextResponse("No encontrado.", { status: 404 });
  await registrarVisita({
    slug,
    tipo: destino === "prueba" ? "clic_prueba" : "clic_whatsapp",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    navegador: req.headers.get("user-agent"),
    interno: req.nextUrl.searchParams.get("interno") === "1",
  });
  if (destino === "whatsapp") return NextResponse.redirect(whatsappVentas(p.nombre), 302);
  const q = new URLSearchParams({ prospecto: slug, utm_source: "prospecto", utm_medium: "pagina", utm_campaign: "para" });
  return new NextResponse(null, { status: 302, headers: { Location: `/registro?${q}`, "Cache-Control": "no-store" } });
}
