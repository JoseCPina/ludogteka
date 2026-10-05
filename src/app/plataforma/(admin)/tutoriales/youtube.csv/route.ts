import { NextResponse } from "next/server";
import { sesionPlataforma } from "@/lib/plataforma/sesion";
import { AREAS_TUTORIALES } from "@/lib/tutoriales";
import { archivosDelPaquete } from "@/lib/tutoriales/paquete";

export const dynamic = "force-dynamic";

const celda = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""').replaceAll("\r", "")}"`;

// youtube.csv: lo que hay que teclear en YouTube Studio por cada video, con el
// nombre exacto de cada archivo del paquete. Solo la administración de PeluDesk.
export async function GET() {
  const s = await sesionPlataforma();
  if (!s) return new NextResponse("No autorizado.", { status: 401 });
  const { data } = await s.supabase
    .from("tutoriales")
    .select("numero, slug, area, titulo, descripcion, etiquetas, estado")
    .is("deleted_at", null)
    .in("estado", ["listo", "listo_sin_voz"])
    .order("orden");
  const filas = [
    ["numero", "archivo_video", "archivo_miniatura", "archivo_subtitulos", "titulo", "descripcion", "etiquetas", "lista_de_reproduccion", "idioma", "visibilidad", "categoria", "para_ninos"],
    ...(data ?? []).map((v) => {
      const a = archivosDelPaquete(v.numero as string, v.slug as string);
      return [v.numero, a[0].nombre, a[1].nombre, a[2].nombre, v.titulo, v.descripcion, (v.etiquetas as string[]).join(", "), AREAS_TUTORIALES[v.area as string] ?? v.area, "es-MX", "público", "Ciencia y tecnología", "no"];
    }),
  ];
  return new NextResponse("﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="youtube.csv"', "Cache-Control": "no-store" },
  });
}
