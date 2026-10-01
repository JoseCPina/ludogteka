import { comprimirImagen } from "@/lib/imagen";
import {
  LADO_FOTO,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SEGUNDOS,
  MENSAJE_VIDEO_LARGO,
  MIME_VIDEO_PERMITIDOS,
} from "@/lib/reporte/constantes";

/**
 * Código de NAVEGADOR. Deja un archivo listo para subir: la foto se
 * comprime (con la rotación del EXIF aplicada) y el video se valida
 * (45 s, 60 MB) y, si el navegador puede, se baja a 720p antes de subir.
 */
export type ArchivoPreparado = {
  tipo: "foto" | "video";
  blob: Blob;
  mime: string;
  duracion: number | null;
};

export class ArchivoRechazado extends Error {}

const EXTENSIONES_VIDEO: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  "3gpp": "video/3gpp",
};

/** foto o video según el tipo del archivo (o su extensión, que Android a veces deja vacío). */
export function tipoDeArchivo(archivo: File): "foto" | "video" | null {
  if (archivo.type.startsWith("image/")) return "foto";
  if (archivo.type.startsWith("video/")) return "video";
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  if (ext in EXTENSIONES_VIDEO) return "video";
  if (["jpg", "jpeg", "png", "heic", "heif", "webp"].includes(ext)) return "foto";
  return null;
}

function mimeDeVideo(archivo: File): string | null {
  const ext = archivo.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = archivo.type || EXTENSIONES_VIDEO[ext] || "";
  return (MIME_VIDEO_PERMITIDOS as readonly string[]).includes(mime) ? mime : null;
}

export async function prepararFoto(archivo: File): Promise<ArchivoPreparado> {
  try {
    const blob = await comprimirImagen(archivo, LADO_FOTO);
    return { tipo: "foto", blob, mime: "image/jpeg", duracion: null };
  } catch {
    throw new ArchivoRechazado(
      /hei[cf]/i.test(`${archivo.type} ${archivo.name}`)
        ? "Este navegador no puede abrir fotos HEIC. Toma la foto desde aquí o cambia la cámara a «Más compatible» (JPG)."
        : "No pudimos leer esa foto. Prueba con otra o tómala desde aquí."
    );
  }
}

type Metadatos = { duracion: number | null; ancho: number; alto: number };

function leerMetadatos(url: string): Promise<Metadatos | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    const fin = (m: Metadatos | null) => {
      v.removeAttribute("src");
      v.load();
      resolve(m);
    };
    const reloj = setTimeout(() => fin(null), 8000);
    v.onloadedmetadata = () => {
      clearTimeout(reloj);
      fin({ duracion: Number.isFinite(v.duration) ? v.duration : null, ancho: v.videoWidth, alto: v.videoHeight });
    };
    v.onerror = () => {
      clearTimeout(reloj);
      fin(null);
    };
    v.src = url;
  });
}

/**
 * Reduce a 720p con canvas + MediaRecorder, en tiempo real. Solo si el
 * navegador graba mp4 (iPhone y Android lo reproducen) y puede capturar el
 * audio del video; si algo falla se devuelve null y se sube el original.
 */
async function reducirVideo(archivo: File, meta: Metadatos, onProgreso: (f: number) => void): Promise<Blob | null> {
  if (typeof MediaRecorder === "undefined" || !meta.duracion) return null;
  const video = document.createElement("video");
  if (typeof (video as HTMLVideoElement & { captureStream?: unknown }).captureStream !== "function") return null;
  const mime = ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return null;

  const duracion = meta.duracion;
  const corto = Math.min(meta.ancho, meta.alto);
  const escala = Math.min(1, 720 / corto);
  const ancho = Math.round((meta.ancho * escala) / 2) * 2;
  const alto = Math.round((meta.alto * escala) / 2) * 2;
  const url = URL.createObjectURL(archivo);
  try {
    video.src = url;
    video.playsInline = true;
    video.preload = "auto";
    await new Promise<void>((ok, mal) => {
      video.onloadeddata = () => ok();
      video.onerror = () => mal(new Error("no se pudo abrir"));
    });
    const canvas = document.createElement("canvas");
    canvas.width = ancho;
    canvas.height = alto;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const salida = canvas.captureStream(30);
    const origen = (video as HTMLVideoElement & { captureStream: () => MediaStream }).captureStream();
    origen.getAudioTracks().forEach((p) => salida.addTrack(p));
    const grabador = new MediaRecorder(salida, { mimeType: mime, videoBitsPerSecond: 1_800_000, audioBitsPerSecond: 96_000 });
    const trozos: Blob[] = [];
    grabador.ondataavailable = (e) => e.data.size > 0 && trozos.push(e.data);
    const terminado = new Promise<void>((ok, mal) => {
      grabador.onstop = () => ok();
      grabador.onerror = () => mal(new Error("falló la grabación"));
    });
    let activo = true;
    const dibujar = () => {
      if (!activo) return;
      ctx.drawImage(video, 0, 0, ancho, alto);
      onProgreso(Math.min(1, video.currentTime / duracion));
      requestAnimationFrame(dibujar);
    };
    grabador.start(1000);
    await video.play();
    dibujar();
    await Promise.race([
      new Promise<void>((ok) => (video.onended = () => ok())),
      new Promise<void>((_, mal) => setTimeout(() => mal(new Error("tardó demasiado")), duracion * 1500 + 10_000)),
    ]);
    activo = false;
    grabador.stop();
    await terminado;
    const blob = new Blob(trozos, { type: "video/mp4" });
    return blob.size > 0 && blob.size < archivo.size * 0.9 ? blob : null;
  } catch {
    return null;
  } finally {
    video.pause();
    URL.revokeObjectURL(url);
  }
}

export async function prepararVideo(archivo: File, onEstado: (texto: string, fraccion?: number) => void = () => {}): Promise<ArchivoPreparado> {
  const mime = mimeDeVideo(archivo);
  if (!mime) throw new ArchivoRechazado("Ese formato de video no se puede subir. Usa MP4 o MOV.");
  if (archivo.size > MAX_VIDEO_BYTES) {
    throw new ArchivoRechazado(`Ese video pesa ${Math.round(archivo.size / 1048576)} MB y el máximo es 60 MB. ${MENSAJE_VIDEO_LARGO}`);
  }
  const url = URL.createObjectURL(archivo);
  let meta: Metadatos | null;
  try {
    meta = await leerMetadatos(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  // Si el navegador no logra leerlo (p. ej. HEVC en escritorio) se sube tal cual,
  // con el tope de tamaño ya revisado y el de duración que valida la base.
  if (meta?.duracion != null && meta.duracion > MAX_VIDEO_SEGUNDOS) {
    throw new ArchivoRechazado(`Ese video dura ${Math.ceil(meta.duracion)} segundos y el máximo es ${MAX_VIDEO_SEGUNDOS}. ${MENSAJE_VIDEO_LARGO}`);
  }
  if (meta && meta.duracion && (Math.min(meta.ancho, meta.alto) > 720 || archivo.size > 20 * 1048576)) {
    onEstado("Reduciendo el video…", 0);
    const reducido = await reducirVideo(archivo, meta, (f) => onEstado("Reduciendo el video…", f));
    if (reducido && reducido.size <= MAX_VIDEO_BYTES) {
      return { tipo: "video", blob: reducido, mime: "video/mp4", duracion: meta.duracion };
    }
  }
  return { tipo: "video", blob: archivo, mime, duracion: meta?.duracion ?? null };
}

/** Lo que se hace con cualquier archivo elegido o tomado. */
export async function prepararArchivo(archivo: File, onEstado?: (texto: string, fraccion?: number) => void): Promise<ArchivoPreparado> {
  const tipo = tipoDeArchivo(archivo);
  if (!tipo) throw new ArchivoRechazado("Ese archivo no es una foto ni un video.");
  return tipo === "foto" ? prepararFoto(archivo) : prepararVideo(archivo, onEstado);
}
