import { NextResponse, type NextRequest } from "next/server";
import { leerFotoDeCartilla } from "@/lib/app/cartilla-foto";

/**
 * POST /mascotas/<id>/cartilla/leer/foto (multipart, campo «foto»): guarda la foto de la cartilla, la lee con la IA y
 * devuelve lo leído para que el dueño lo revise y confirme (confirmarLectura). Es una ruta y no una acción por el
 * tamaño de la foto. La lógica vive en src/lib/app/cartilla-foto.ts (la usa también la app nativa).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  let foto: FormDataEntryValue | null = null;
  try {
    foto = (await request.formData()).get("foto");
  } catch {
    return NextResponse.json({ error: "No llegó la foto." }, { status: 400 });
  }
  const { status, ...r } = await leerFotoDeCartilla(id, foto);
  return NextResponse.json(r, { status });
}
