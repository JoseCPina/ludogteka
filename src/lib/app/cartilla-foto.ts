import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hayIA, leerCartillaConIA, type LecturaCartilla } from "@/lib/app/cartilla-ia";
import { subirFotoApp, tipoImagen, PESO_MAXIMO_FOTO } from "@/lib/app/fotos";

/**
 * Guarda la foto de la cartilla, la lee con la IA y devuelve lo leído para que el dueño lo revise y confirme
 * (confirmarLectura). Queda registro de cada lectura con su tiempo y sus tokens (mascotas_cartilla_fotos). La usan la
 * ruta de la web (/mascotas/<id>/cartilla/leer/foto) y la app nativa (/api/movil/leerCartilla).
 */
export type ResultadoLecturaFoto = { status: number; error: string | null; fotoId?: string | null; lectura?: LecturaCartilla; ms?: number };

export async function leerFotoDeCartilla(mascotaId: string, foto: FormDataEntryValue | null): Promise<ResultadoLecturaFoto> {
  const s = await sesionApp();
  if (!s) return { status: 401, error: "Tu sesión se cerró. Vuelve a entrar." };
  if (!/^[0-9a-f-]{36}$/.test(mascotaId)) return { status: 404, error: "No encontramos esa mascota." };
  const supabase = await createSupabaseServerClient("portal");
  const { data: m } = await supabase.from("mascotas").select("id, nombre, especie").eq("id", mascotaId).is("deleted_at", null).maybeSingle();
  if (!m) return { status: 404, error: "No encontramos esa mascota." };
  if (!(foto instanceof File) || foto.size === 0) return { status: 400, error: "Escoge o toma la foto de la cartilla." };
  const tipo = tipoImagen(foto);
  if (!tipo) return { status: 400, error: "La foto tiene que ser JPG, PNG o WebP." };
  if (foto.size > PESO_MAXIMO_FOTO) return { status: 400, error: "La foto pesa más de 8 MB. Toma otra." };
  if (!hayIA()) return { status: 503, error: "La lectura por foto no está disponible en este entorno. Captura las fechas a mano." };

  const { path, error: errorFoto } = await subirFotoApp({ duenoId: s.user.id, mascotaId, carpeta: "cartilla", archivo: foto, contentType: tipo });
  if (!path) return { status: 500, error: errorFoto ?? "No pudimos guardar la foto." };
  const db = createSupabaseAdminClient();
  const { data: fila } = await db.from("mascotas_cartilla_fotos").insert({ mascota_id: mascotaId, foto_path: path, estado: "pendiente", created_by: s.user.id, updated_at: new Date().toISOString() }).select("id").single();
  const fotoId = (fila?.id as string | undefined) ?? null;
  try {
    const r = await leerCartillaConIA({ imagen: Buffer.from(await foto.arrayBuffer()), mediaType: tipo, especie: m.especie as string, nombre: m.nombre as string });
    if (fotoId) await db.from("mascotas_cartilla_fotos").update({ estado: r.lectura.es_cartilla && r.lectura.registros.length ? "leida" : "sin_datos", lectura: r.lectura, modelo: r.modelo, ms: r.ms, tokens_in: r.tokensIn, tokens_out: r.tokensOut }).eq("id", fotoId);
    return { status: 200, error: null, fotoId, lectura: r.lectura, ms: r.ms };
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : "La IA no contestó.";
    console.error("[app] leer cartilla", mensaje);
    if (fotoId) await db.from("mascotas_cartilla_fotos").update({ estado: "error", error: mensaje.slice(0, 300) }).eq("id", fotoId);
    return { status: 502, error: /timeout|abort/i.test(mensaje) ? "La lectura tardó demasiado. Intenta con una foto más clara o captura las fechas a mano." : "No pudimos leer la foto. Intenta con otra, con más luz, o captura las fechas a mano." };
  }
}
