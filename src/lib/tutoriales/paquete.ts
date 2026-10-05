import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * El paquete de YouTube de cada video (bucket privado `tutoriales-masters`):
 *   <NN>-<slug>/master-1080p.mp4        el video (1920×1080, 30 cps, H.264)
 *   <NN>-<slug>/miniatura-1280x720.jpg  la miniatura
 *   <NN>-<slug>/subtitulos.es-MX.srt    los subtítulos
 *   <NN>-<slug>/youtube.txt             título, descripción con capítulos y etiquetas
 * Lo arma el corredor (scripts/tutoriales); aquí solo se piden los links.
 */
export type ArchivoPaquete = { clave: "master" | "miniatura" | "srt" | "texto"; ruta: string; nombre: string };

export function archivosDelPaquete(numero: string, slug: string): ArchivoPaquete[] {
  const base = `${numero}-${slug}`;
  return [
    { clave: "master", ruta: `${base}/master-1080p.mp4`, nombre: `${base}.mp4` },
    { clave: "miniatura", ruta: `${base}/miniatura-1280x720.jpg`, nombre: `${base}-miniatura.jpg` },
    { clave: "srt", ruta: `${base}/subtitulos.es-MX.srt`, nombre: `${base}.es-MX.srt` },
    { clave: "texto", ruta: `${base}/youtube.txt`, nombre: `${base}-youtube.txt` },
  ];
}

export const DIAS_LINK = 7;

/** Links firmados (7 días) con su nombre de descarga; los que no existen no salen. */
export async function firmarPaquete(videos: { numero: string; slug: string }[]): Promise<Map<string, Partial<Record<ArchivoPaquete["clave"], string>>>> {
  const admin = createSupabaseAdminClient();
  const sal = new Map<string, Partial<Record<ArchivoPaquete["clave"], string>>>();
  for (const v of videos) {
    const archivos = archivosDelPaquete(v.numero, v.slug);
    const fila: Partial<Record<ArchivoPaquete["clave"], string>> = {};
    const { data } = await admin.storage.from("tutoriales-masters").createSignedUrls(archivos.map((a) => a.ruta), DIAS_LINK * 86400);
    for (const [i, a] of archivos.entries()) {
      const r = data?.[i];
      if (r?.signedUrl && !r.error) fila[a.clave] = `${r.signedUrl}${r.signedUrl.includes("?") ? "&" : "?"}download=${encodeURIComponent(a.nombre)}`;
    }
    sal.set(v.numero, fila);
  }
  return sal;
}

export const CANAL = {
  nombre: "PeluDesk",
  titulo: "PeluDesk — software para guarderías, hoteles y estéticas caninas",
  idioma: "es-MX",
  pais: "México",
  sitio: "https://peludesk.mx",
  descripcion:
    "PeluDesk es el software para guarderías, hoteles y estéticas caninas, hecho en México. Aquí aprendes a usarlo paso a paso: clientes y perros, estética, guardería, hotel, caja y cobros, inventario, empleados, gastos y reportes. Cada video es corto, con la app de verdad y subtítulos en español.\n\nPruébalo 15 días gratis, sin tarjeta: https://peludesk.mx/registro\nCentro de ayuda: https://peludesk.mx/ayuda",
  etiquetas: ["peludesk", "software para guarderías caninas", "software para estéticas caninas", "software para hoteles caninos", "guardería canina", "estética canina", "negocio canino", "administrar guardería de perros", "tutorial", "méxico"],
};
