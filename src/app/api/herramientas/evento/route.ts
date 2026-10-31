import { NextResponse, type NextRequest } from "next/server";
import { esHerramienta } from "@/lib/herramientas/lista";
import { origenDeParametros, registrarEventoHerramienta } from "@/lib/herramientas/telemetria";

/**
 * El navegador avisa «visita» y «uso» de una herramienta pública (sendBeacon desde src/lib/herramientas/cliente.ts).
 * Solo esos dos eventos entran por aquí: «teléfono» y «cuenta» los escribe el servidor cuando pasan de verdad. Los
 * robots no cuentan; la IP solo se guarda en hash con el día. Siempre responde 204: nada que un visitante deba ver.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const cuerpo = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const herramienta = String(cuerpo?.herramienta ?? "");
    const evento = String(cuerpo?.evento ?? "");
    if (!esHerramienta(herramienta) || (evento !== "visita" && evento !== "uso")) return new NextResponse(null, { status: 204 });
    const texto = (k: string) => (typeof cuerpo?.[k] === "string" ? (cuerpo[k] as string) : undefined);
    await registrarEventoHerramienta({
      herramienta,
      evento,
      origen: origenDeParametros({ utm_source: texto("utm_source"), utm_medium: texto("utm_medium"), utm_campaign: texto("utm_campaign"), utm_content: texto("utm_content") }),
      giro: texto("giro") ?? null,
      ciudad: texto("ciudad") ?? null,
      ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      navegador: request.headers.get("user-agent"),
    });
  } catch (e) {
    console.error("[herramientas] evento", e instanceof Error ? e.message : e);
  }
  return new NextResponse(null, { status: 204 });
}
