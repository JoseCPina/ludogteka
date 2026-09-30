import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { esPlataforma, negocioActual } from "@/lib/negocio/actual";

// La imagen con la que se comparte un link del negocio (og:image): la que
// tenga en su configuración (negocios.marca.imagen_compartir: una ruta del
// sitio o https), servida aquí con 200 y su tipo —WhatsApp y Meta no
// siguen redirecciones ni entienden un .ico—, o, si no tiene, una tarjeta
// 1200×630 con su marca: su logo, o su logotipo de palabras, o su inicial
// sobre su color, y su nombre. Nunca la de PeluDesk.
export const dynamic = "force-dynamic";

const TIPOS: Record<string, string> = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

async function archivoDelSitio(ruta: string): Promise<Response | null> {
  // Solo dentro de /public: nada de ".." ni rutas absolutas del sistema.
  const limpio = path.posix.normalize(ruta);
  if (!limpio.startsWith("/") || limpio.includes("..")) return null;
  const tipo = TIPOS[path.posix.extname(limpio).toLowerCase()];
  if (!tipo) return null;
  try {
    const bytes = await readFile(path.join(process.cwd(), "public", limpio));
    return new NextResponse(bytes, { headers: { "Content-Type": tipo, "Content-Length": String(bytes.byteLength), "Cache-Control": "public, max-age=3600" } });
  } catch {
    return null;
  }
}

async function archivoRemoto(url: string): Promise<Response | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const tipo = r.headers.get("content-type") ?? "";
    if (!r.ok || !tipo.startsWith("image/")) return null;
    const bytes = await r.arrayBuffer();
    return new NextResponse(bytes, { headers: { "Content-Type": tipo, "Cache-Control": "public, max-age=3600" } });
  } catch {
    return null;
  }
}

export async function GET() {
  if (await esPlataforma()) {
    return (await archivoDelSitio("/marca/peludesk/perfil-640.jpg")) ?? new NextResponse(null, { status: 404 });
  }
  const negocio = await negocioActual();
  if (negocio.imagen) {
    const propia = negocio.imagen.startsWith("https://") ? await archivoRemoto(negocio.imagen) : await archivoDelSitio(negocio.imagen);
    if (propia) return propia;
  }
  const { nombre, marca } = await cargarNegocioLanding();
  const color = marca?.color && /^#[0-9a-fA-F]{6}$/.test(marca.color) ? marca.color : "#4b3f72";
  const inicial = (nombre.trim()[0] ?? "·").toUpperCase();
  // El logo como imagen va incrustado (Satori no sale a buscar rutas relativas).
  let logo: string | null = null;
  if (marca?.logo) {
    try {
      if (marca.logo.startsWith("https://")) {
        const r = await fetch(marca.logo, { signal: AbortSignal.timeout(8_000) });
        const tipo = r.headers.get("content-type") ?? "image/png";
        if (r.ok && tipo.startsWith("image/")) logo = `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
      } else {
        const tipo = TIPOS[path.posix.extname(marca.logo).toLowerCase()];
        if (tipo && !marca.logo.includes("..")) {
          logo = `data:${tipo};base64,${(await readFile(path.join(process.cwd(), "public", marca.logo))).toString("base64")}`;
        }
      }
    } catch {
      logo = null;
    }
  }
  const palabras = marca?.logo_texto?.length ? marca.logo_texto : null;
  return new ImageResponse(
    (
      <div style={{ width: 1200, height: 630, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#ffffff", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", width: 1200, height: 24, background: color, position: "absolute", top: 0, left: 0 }} />
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt="" style={{ maxHeight: 260, maxWidth: 900, objectFit: "contain" }} />
        ) : palabras ? (
          <div style={{ display: "flex", fontSize: 140, fontWeight: 700, letterSpacing: -4 }}>
            {palabras.map((p, i) => (
              <span key={i} style={{ color: p.color }}>
                {p.texto}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ display: "flex", width: 220, height: 220, borderRadius: 48, background: color, color: "#ffffff", fontSize: 130, fontWeight: 700, alignItems: "center", justifyContent: "center" }}>
            {inicial}
          </div>
        )}
        <div style={{ display: "flex", marginTop: 36, fontSize: 56, fontWeight: 700, color: "#1f2933" }}>{nombre}</div>
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=3600" } }
  );
}
