import { NextResponse, type NextRequest } from "next/server";
import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hayIA, leerCartillaConIA } from "@/lib/app/cartilla-ia";
import { subirFotoApp, tipoImagen, PESO_MAXIMO_FOTO } from "@/lib/app/fotos";

/**
 * POST /mascotas/<id>/cartilla/leer/foto (multipart, campo «foto»): guarda la foto de la cartilla, la lee con la IA y
 * devuelve lo leído para que el dueño lo revise y confirme (confirmarLectura). Queda registro de cada lectura con su
 * tiempo y sus tokens (mascotas_cartilla_fotos). Es una ruta y no una acción por el tamaño de la foto.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, contexto: { params: Promise<{ id: string }> }) {
  const { id } = await contexto.params;
  const s = await sesionApp();
  if (!s) return NextResponse.json({ error: "Tu sesión se cerró. Vuelve a entrar." }, { status: 401 });
  if (!/^[0-9a-f-]{36}$/.test(id)) return NextResponse.json({ error: "No encontramos esa mascota." }, { status: 404 });
  const supabase = await createSupabaseServerClient("portal");
  const { data: m } = await supabase.from("mascotas").select("id, nombre, especie").eq("id", id).is("deleted_at", null).maybeSingle();
  if (!m) return NextResponse.json({ error: "No encontramos esa mascota." }, { status: 404 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "No llegó la foto." }, { status: 400 });
  }
  const foto = form.get("foto");
  if (!(foto instanceof File) || foto.size === 0) return NextResponse.json({ error: "Escoge o toma la foto de la cartilla." }, { status: 400 });
  const tipo = tipoImagen(foto);
  if (!tipo) return NextResponse.json({ error: "La foto tiene que ser JPG, PNG o WebP." }, { status: 400 });
  if (foto.size > PESO_MAXIMO_FOTO) return NextResponse.json({ error: "La foto pesa más de 8 MB. Toma otra." }, { status: 400 });
  if (!hayIA()) return NextResponse.json({ error: "La lectura por foto no está disponible en este entorno. Captura las fechas a mano." }, { status: 503 });

  const { path, error: errorFoto } = await subirFotoApp({ duenoId: s.user.id, mascotaId: id, carpeta: "cartilla", archivo: foto, contentType: tipo });
  if (!path) return NextResponse.json({ error: errorFoto ?? "No pudimos guardar la foto." }, { status: 500 });
  const db = createSupabaseAdminClient();
  const { data: fila } = await db.from("mascotas_cartilla_fotos").insert({ mascota_id: id, foto_path: path, estado: "pendiente", created_by: s.user.id, updated_at: new Date().toISOString() }).select("id").single();
  const fotoId = (fila?.id as string | undefined) ?? null;
  try {
    const r = await leerCartillaConIA({ imagen: Buffer.from(await foto.arrayBuffer()), mediaType: tipo, especie: m.especie as string, nombre: m.nombre as string });
    if (fotoId) await db.from("mascotas_cartilla_fotos").update({ estado: r.lectura.es_cartilla && r.lectura.registros.length ? "leida" : "sin_datos", lectura: r.lectura, modelo: r.modelo, ms: r.ms, tokens_in: r.tokensIn, tokens_out: r.tokensOut }).eq("id", fotoId);
    return NextResponse.json({ error: null, fotoId, lectura: r.lectura, ms: r.ms });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "La IA no contestó.";
    console.error("[app] leer cartilla", mensaje);
    if (fotoId) await db.from("mascotas_cartilla_fotos").update({ estado: "error", error: mensaje.slice(0, 300) }).eq("id", fotoId);
    return NextResponse.json({ error: /timeout|abort/i.test(mensaje) ? "La lectura tardó demasiado. Intenta con una foto más clara o captura las fechas a mano." : "No pudimos leer la foto. Intenta con otra, con más luz, o captura las fechas a mano." }, { status: 502 });
  }
}
