import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual } from "@/lib/negocio/actual";
import { paginaDeError } from "@/lib/http/pagina-de-error";

// Abre un adjunto del expediente: la función de la base comprueba el permiso, anota la lectura y
// devuelve la ruta; el servidor la firma por 2 minutos y manda al archivo. El bucket es privado.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return paginaDeError({ titulo: "Archivo no encontrado", que: "El enlace del archivo no está completo.", queHacer: ["Ábrelo de nuevo desde el expediente de la mascota."], status: 404 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_adjunto_para_leer", { p_id: id });
  if (error || !data) {
    if (error) console.error("[veterinaria] adjunto:", error.message);
    return paginaDeError({
      titulo: "No puedes abrir este archivo",
      que: "No tienes permiso para ver el expediente o el archivo ya no existe.",
      queHacer: ["Entra con tu cuenta y vuelve a intentarlo.", "Pide a un admin el permiso «Atender consultas» si te corresponde."],
      status: 403,
    });
  }
  const { ruta, nombre } = data as { ruta: string; nombre: string };
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const { data: firma, error: errorFirma } = await admin.storage.from("veterinaria-archivos").createSignedUrl(ruta, 120, { download: false });
  if (errorFirma || !firma) {
    console.error("[veterinaria] firmar adjunto:", errorFirma?.message, nombre);
    return paginaDeError({ titulo: "No pudimos abrir el archivo", que: "El archivo no está disponible en este momento.", queHacer: ["Intenta de nuevo en un minuto."], status: 502 });
  }
  const r = NextResponse.redirect(firma.signedUrl, 302);
  r.headers.set("Cache-Control", "no-store");
  return r;
}
