// Sube un video terminado: el MP4 de 720p, el póster y los subtítulos al bucket
// público `tutoriales` (lo que ve la app); el master de 1080p, la miniatura, el
// SRT y el texto de YouTube al bucket privado `tutoriales-masters` (el paquete
// que baja la plataforma). Después deja la fila del catálogo publicada.
//
// Los masters caben en Storage de producción (plan Pro, 100 GB) mientras la serie
// ocupe menos del 40 % de la cuota; si no, se quedan en desarrollo
// (`master_donde = 'dev'`) y la fila lo dice.
import fs from "node:fs";
import { subir, rpc } from "./db.mjs";

export const FRACCION_MAX_MASTERS = 0.4;
export const CUOTA_STORAGE_PLAN = 100 * 1024 ** 3; // plan Pro; si la API de gestión dice otra cosa, se usa esa

export async function publicarVideo({ c, video, rutas, meta, masterAqui = true }) {
  const dir = `${video.id}-${video.slug}`;
  const bytes = {};
  bytes.video = await subir(c, "tutoriales", `${dir}/video-720p.mp4`, rutas.video720, "video/mp4");
  bytes.poster = await subir(c, "tutoriales", `${dir}/poster.jpg`, rutas.poster, "image/jpeg");
  bytes.vtt = await subir(c, "tutoriales", `${dir}/subtitulos.es-MX.vtt`, rutas.vtt, "text/vtt");
  let masterPath = null;
  if (masterAqui) {
    bytes.master = await subir(c, "tutoriales-masters", `${dir}/master-1080p.mp4`, rutas.master, "video/mp4");
    await subir(c, "tutoriales-masters", `${dir}/miniatura-1280x720.jpg`, rutas.miniatura, "image/jpeg");
    await subir(c, "tutoriales-masters", `${dir}/subtitulos.es-MX.srt`, rutas.srt, "application/x-subrip");
    await subir(c, "tutoriales-masters", `${dir}/youtube.txt`, rutas.texto, "text/plain");
    masterPath = `${dir}/master-1080p.mp4`;
  }
  await rpc(c, "plataforma_tutorial_publicar", {
    p: {
      numero: video.id,
      descripcion: meta.descripcion,
      duracion_s: Math.round(meta.duracion),
      video_path: `${dir}/video-720p.mp4`,
      poster_path: `${dir}/poster.jpg`,
      vtt_path: `${dir}/subtitulos.es-MX.vtt`,
      master_path: masterPath,
      master_donde: masterAqui ? (c.prod ? "prod" : "dev") : "dev",
      con_voz: meta.conVoz,
      commit_app: meta.commit,
      estado: meta.conVoz ? "listo" : "listo_sin_voz",
      publicado: true,
    },
  });
  return bytes;
}

export const tamano = (archivo) => fs.statSync(archivo).size;
