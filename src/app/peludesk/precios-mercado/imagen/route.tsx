import { ImageResponse } from "next/og";
import { NextResponse, type NextRequest } from "next/server";
import { GIROS_MERCADO, mesEnTexto, pesosMercado, servicioMercado } from "@/lib/mercado/catalogo";
import { leerConsulta, rangoDe } from "@/lib/mercado/rangos";

/**
 * La imagen para compartir un rango del índice: 1080×1080 (WhatsApp, Instagram) o 1200×630 (?formato=og, la de
 * Open Graph). Se dibuja en el servidor con los mismos datos de la página; se cachea un día.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams;
  const c = await leerConsulta({ giro: p.get("giro"), servicio: p.get("servicio"), ciudad: p.get("ciudad"), talla: p.get("talla") });
  if (!c) return new NextResponse("Consulta inválida.", { status: 400 });
  const og = p.get("formato") === "og";
  const [W, H] = og ? [1200, 630] : [1080, 1080];
  const rango = await rangoDe(c);
  const s = servicioMercado(c.servicio)!;
  const giro = GIROS_MERCADO.find((g) => g.clave === c.giro)!;
  const lugar = rango.nivel === "ciudad" ? rango.lugar : rango.nivel === "estado" ? `estado de ${rango.lugar}` : "México";
  const mes = mesEnTexto(rango.fecha);
  const sinDatos = rango.nivel === "sin_datos" || rango.p25 == null;
  const minimo = sinDatos ? 0 : Math.min(rango.minimo ?? rango.p25!, rango.p25! * 0.8);
  const maximo = sinDatos ? 1 : Math.max(rango.maximo ?? rango.p75!, rango.p75! * 1.2);
  const pos = (v: number) => Math.max(2, Math.min(98, ((v - minimo) / (maximo - minimo || 1)) * 100));
  const base = og ? 1 : 1.25;

  return new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#fff8ee", color: "#2b2a33", padding: 64 * base, fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 22 * base, fontWeight: 700, letterSpacing: 4, textTransform: "uppercase", color: "#4b3f72" }}>Índice PeluDesk de precios</div>
          <div style={{ display: "flex", marginTop: 18 * base, fontSize: 40 * base, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1 }}>
            {s.nombre}{c.talla ? ` · perro ${c.talla}` : ""}
          </div>
          <div style={{ display: "flex", marginTop: 8 * base, fontSize: 28 * base, color: "#46424f" }}>{giro.plural} en {lugar}</div>
        </div>
        {sinDatos ? (
          <div style={{ display: "flex", fontSize: 40 * base, fontWeight: 700 }}>Sin datos todavía</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "baseline", fontSize: 92 * base, fontWeight: 800, letterSpacing: -3 }}>
              {pesosMercado(rango.p25!)}
              <span style={{ fontSize: 36 * base, fontWeight: 600, color: "#5e5968", margin: `0 ${14 * base}px` }}>a</span>
              {pesosMercado(rango.p75!)}
            </div>
            <div style={{ display: "flex", fontSize: 26 * base, color: "#46424f", marginTop: 6 * base }}>{s.unidad} · ahí cobra la mitad de los negocios · mediana {pesosMercado(rango.mediana!)}</div>
            <div style={{ display: "flex", position: "relative", marginTop: 44 * base, height: 22 * base, borderRadius: 999, background: "#ebe3d8" }}>
              <div style={{ position: "absolute", top: 0, bottom: 0, left: `${pos(rango.p25!)}%`, right: `${100 - pos(rango.p75!)}%`, borderRadius: 999, background: "#a7d8c8", display: "flex" }} />
              <div style={{ position: "absolute", top: -8 * base, bottom: -8 * base, left: `${pos(rango.mediana!)}%`, width: 5 * base, borderRadius: 3, background: "#4b3f72", display: "flex" }} />
            </div>
          </div>
        )}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 22 * base, color: "#5e5968" }}>
          <div style={{ display: "flex" }}>{sinDatos ? "" : `${rango.muestras} precios públicos${mes ? ` · ${mes}` : ""}`}</div>
          <div style={{ display: "flex", fontWeight: 700, color: "#4b3f72" }}>peludesk.mx/precios-mercado</div>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800" } }
  );
}
