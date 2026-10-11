import { readFile } from "node:fs/promises";
import path from "node:path";
import { type NextRequest } from "next/server";
import { ImageResponse } from "next/og";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { esPlataforma } from "@/lib/negocio/actual";
import { CACHE_ICONO, iconoPng, marcaDeIcono } from "@/lib/negocio/icono";

// El ícono de la app instalada (pantalla de inicio): el LOGO del negocio centrado sobre
// blanco, o, si no tiene logo, su inicial sobre su color (el de siempre). Con ?m=1 es la
// versión «maskable» de Android (el logo más chico, dentro de la zona segura del 80 %).
// Tamaños: 192 y 512. En el dominio de la plataforma no existe.
export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

async function logoComoDato(logo: string | null | undefined): Promise<string | null> {
  if (!logo) return null;
  try {
    if (logo.startsWith("https://")) {
      const r = await fetch(logo, { signal: AbortSignal.timeout(8_000) });
      const tipo = r.headers.get("content-type") ?? "";
      if (!r.ok || !tipo.startsWith("image/") || tipo.includes("svg")) return null;
      return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
    }
    const limpio = path.posix.normalize(logo);
    const tipo = TIPOS[path.posix.extname(limpio).toLowerCase()];
    if (!limpio.startsWith("/") || limpio.includes("..") || !tipo) return null;
    return `data:${tipo};base64,${(await readFile(path.join(process.cwd(), "public", limpio))).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (await esPlataforma()) return new Response(null, { status: 404 });
  const s = Number(request.nextUrl.searchParams.get("s"));
  const tam = s === 192 || s === 512 ? s : 512;
  const mascarable = request.nextUrl.searchParams.get("m") === "1";
  const { marca } = await cargarNegocioLanding();
  const logo = await logoComoDato(marca?.logo);
  if (!logo) {
    const { inicial, color } = await marcaDeIcono(request.headers.get("host"));
    return iconoPng(tam, inicial, color);
  }
  // Con logo: sobre blanco, con aire alrededor (más si es maskable).
  const lado = Math.round(tam * (mascarable ? 0.56 : 0.78));
  const img = new ImageResponse(
    (
      <div style={{ width: tam, height: tam, display: "flex", alignItems: "center", justifyContent: "center", background: "#ffffff", borderRadius: mascarable ? 0 : Math.round(tam * 0.2) }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logo} alt="" width={lado} height={lado} style={{ objectFit: "contain" }} />
      </div>
    ),
    { width: tam, height: tam }
  );
  return new Response(img.body, { headers: { "Content-Type": "image/png", "Cache-Control": CACHE_ICONO } });
}
