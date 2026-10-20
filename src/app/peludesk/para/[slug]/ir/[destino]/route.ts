import { NextResponse, type NextRequest } from "next/server";
import { prospectoPorSlug, registrarVisita, serviciosDe, whatsappVentas } from "@/lib/prospectos/pagina";
import { urlDemo } from "@/lib/peludesk/landing";
import { DEMO_POR_GIRO } from "@/lib/web-negocio/demo";
import { giroPrincipal } from "@/lib/web-negocio/tema";

// Los botones de la página de un prospecto: registran el clic en el CRM y mandan a donde toca.
//   prueba    → /registro con el nombre, la ciudad, los servicios y el teléfono del negocio ya escritos
//   whatsapp  → el WhatsApp de ventas de PeluDesk con un mensaje que dice de qué negocio viene
//   demo      → la demo de PeluDesk (solo lectura) con la cuenta y la pantalla de su giro
// Location relativa para lo propio (nunca el origen de request.url: en next start es localhost).
export const dynamic = "force-dynamic";

const TIPO = { prueba: "clic_prueba", whatsapp: "clic_whatsapp", demo: "clic_demo" } as const;

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string; destino: string }> }) {
  const { slug, destino } = await params;
  const p = await prospectoPorSlug(slug);
  if (!p || !(destino in TIPO)) return new NextResponse("No encontrado.", { status: 404 });
  // ?interno=1 (revisión desde el CRM) se conserva hasta el destino: ahí tampoco cuenta como visita ni registro.
  const interno = req.nextUrl.searchParams.get("interno") === "1";
  await registrarVisita({
    slug,
    tipo: TIPO[destino as keyof typeof TIPO],
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    navegador: req.headers.get("user-agent"),
    interno,
  });
  if (destino === "whatsapp") return NextResponse.redirect(whatsappVentas(p.nombre, p.slug), 302);
  if (destino === "demo") {
    const d = DEMO_POR_GIRO[giroPrincipal(serviciosDe(p), p.giro)];
    return new NextResponse(null, { status: 302, headers: { Location: `${urlDemo()}/demo/entrar/${d.rol}?ir=${d.ir}${interno ? "&interno=1" : ""}`, "Cache-Control": "no-store" } });
  }
  const q = new URLSearchParams({ prospecto: slug, utm_source: "prospecto", utm_medium: "pagina", utm_campaign: "para", ...(interno ? { interno: "1" } : {}) });
  return new NextResponse(null, { status: 302, headers: { Location: `/registro?${q}`, "Cache-Control": "no-store" } });
}
