import { NextResponse, type NextRequest } from "next/server";
import { sesionApp } from "@/lib/app/sesion";
import { miMascota } from "@/lib/app/datos";
import { cartillaDe } from "@/lib/app/cartilla";
import { generarPdfCartilla } from "@/lib/app/pdf-cartilla";
import { formatearFecha } from "@/lib/formato";

/** GET /mascotas/<id>/cartilla/pdf: la cartilla en PDF para compartir con cualquier vet. Solo el dueño. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  const s = await sesionApp();
  if (!s) return new NextResponse("Entra a la app para descargar la cartilla.", { status: 401 });
  const m = await miMascota(id);
  if (!m) return new NextResponse("No encontramos esa mascota.", { status: 404 });
  const registros = await cartillaDe(m.id);
  const pdf = await generarPdfCartilla({
    mascota: { nombre: m.nombre, especie: m.especie, sexo: m.sexo, razaTexto: m.razaTexto, fechaNacimiento: m.fechaNacimiento, microchip: m.microchip },
    dueno: s.dueno.nombre,
    registros,
    generado: formatearFecha(new Date().toISOString(), "America/Mexico_City"),
  });
  const nombre = `cartilla-${m.nombre.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.pdf`;
  return new NextResponse(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${nombre}"`, "Cache-Control": "no-store" } });
}
