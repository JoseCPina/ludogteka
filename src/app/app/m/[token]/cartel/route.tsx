import { type NextRequest, NextResponse } from "next/server";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { mascotaPublica } from "@/lib/app/publico";
import { urlApp } from "@/lib/negocio/host";

/** GET /m/<token>/cartel: el cartel para compartir (1080×1350) con la foto, el nombre, la zona y el QR. Público. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function fotoComoDato(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    const tipo = r.headers.get("content-type") ?? "image/jpeg";
    if (!r.ok || !tipo.startsWith("image/")) return null;
    return `data:${tipo};base64,${Buffer.from(await r.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(_request: NextRequest, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params;
  const m = await mascotaPublica(token);
  if (!m) return new NextResponse("No encontramos esa mascota.", { status: 404 });
  const url = `${urlApp()}/m/${m.token}`;
  const [foto, qr] = await Promise.all([fotoComoDato(m.fotoUrl), QRCode.toDataURL(url, { margin: 1, width: 520, errorCorrectionLevel: "H" })]);
  const especie = m.especie === "gato" ? (m.sexo === "hembra" ? "gata" : "gato") : m.especie === "perro" ? (m.sexo === "hembra" ? "perra" : "perro") : "mascota";
  const W = 1080, H = 1350;
  const img = new ImageResponse(
    (
      <div style={{ width: W, height: H, display: "flex", flexDirection: "column", background: "#fff8ee", color: "#2b2a33", fontFamily: "sans-serif", padding: 56 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", fontSize: 40, fontWeight: 800, letterSpacing: -1, color: m.perdida ? "#b23c31" : "#4b3f72" }}>{m.perdida ? "SE PERDIÓ" : "MI PLACA"}</div>
          <div style={{ display: "flex", fontSize: 26, fontWeight: 700, color: "#4b3f72" }}>PeluDesk</div>
        </div>
        <div style={{ display: "flex", marginTop: 28, width: "100%", height: 620, borderRadius: 40, overflow: "hidden", background: "#e6f4ef", alignItems: "center", justifyContent: "center" }}>
          {foto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={foto} alt="" width={W - 112} height={620} style={{ objectFit: "cover" }} />
          ) : (
            <div style={{ display: "flex", fontSize: 260, fontWeight: 800, color: "#1f6b57" }}>{m.nombre[0]?.toUpperCase()}</div>
          )}
        </div>
        <div style={{ display: "flex", fontSize: 92, fontWeight: 800, letterSpacing: -3, marginTop: 28, lineHeight: 1 }}>{m.nombre}</div>
        <div style={{ display: "flex", fontSize: 34, color: "#4f4c5c", marginTop: 10 }}>{especie}{m.razaTexto ? ` · ${m.razaTexto}` : ""}</div>
        {m.perdida && m.perdidaNota ? <div style={{ display: "flex", fontSize: 34, color: "#b23c31", marginTop: 10 }}>Cerca de {m.perdidaNota}</div> : null}
        <div style={{ display: "flex", marginTop: "auto", alignItems: "center", gap: 36 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="" width={260} height={260} style={{ borderRadius: 24, background: "#fff" }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ display: "flex", fontSize: 38, fontWeight: 800, lineHeight: 1.15 }}>{m.perdida ? "Si la ves, escanea y escríbele a su familia" : "Escanea para avisarle a mi familia"}</div>
            <div style={{ display: "flex", fontSize: 26, color: "#4f4c5c" }}>o entra a {url.replace(/^https?:\/\//, "")}</div>
          </div>
        </div>
      </div>
    ),
    { width: W, height: H }
  );
  return new Response(img.body, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store", "Content-Disposition": `inline; filename="cartel-${m.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png"` } });
}
