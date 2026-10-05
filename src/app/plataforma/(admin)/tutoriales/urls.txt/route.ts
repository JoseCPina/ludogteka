import { NextResponse } from "next/server";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { archivosDelPaquete, firmarPaquete, DIAS_LINK } from "@/lib/tutoriales/paquete";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// urls.txt: un link firmado por archivo del paquete (valen 7 días). Se baja todo con
//   wget --content-disposition -i urls.txt        o        aria2c -i urls.txt
export async function GET() {
  const s = await sesionPlataforma();
  if (!s) return new NextResponse("No autorizado.", { status: 401 });
  const { data } = await s.supabase.from("tutoriales").select("numero, slug").is("deleted_at", null).in("estado", ["listo", "listo_sin_voz"]).order("orden");
  const videos = (data ?? []) as { numero: string; slug: string }[];
  const firmados = await firmarPaquete(videos);
  const lineas = [`# Paquete de YouTube de PeluDesk · los links valen ${DIAS_LINK} días · wget --content-disposition -i urls.txt`];
  for (const v of videos) {
    const f = firmados.get(v.numero) ?? {};
    for (const a of archivosDelPaquete(v.numero, v.slug)) if (f[a.clave]) lineas.push(f[a.clave]!);
  }
  return new NextResponse(lineas.join("\n") + "\n", { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="urls.txt"', "Cache-Control": "no-store" } });
}
