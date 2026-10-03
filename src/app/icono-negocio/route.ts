import { type NextRequest } from "next/server";
import { TAMANOS_ICONO, iconoPng, iconoSvg, marcaDeIcono } from "@/lib/negocio/icono";

// El ícono de un negocio sin uno propio en su configuración
// (negocios.marca.favicon): su inicial sobre su color (marca.color), en SVG
// o, con ?s=16|32|48|180|512, en PNG. En el dominio de la plataforma, la "P".
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { inicial, color } = await marcaDeIcono(request.headers.get("host"));
  const s = Number(request.nextUrl.searchParams.get("s"));
  if ((TAMANOS_ICONO as readonly number[]).includes(s)) return iconoPng(s, inicial, color);
  return iconoSvg(inicial, color);
}
