/**
 * Reporte de comportamiento y fotos y videos (1 de octubre de 2026,
 * migración 20261001120000). Lo que comparten el servidor y el navegador.
 */
export const BUCKET_REPORTES = "reportes-archivos";

// Videos: lo que el celular entrega del carrete suele ser pesado.
export const MAX_VIDEO_SEGUNDOS = 45;
export const MAX_VIDEO_BYTES = 60 * 1024 * 1024;
export const MAX_FOTO_BYTES = 15 * 1024 * 1024;
export const MENSAJE_VIDEO_LARGO = "Elige uno más corto o grábalo desde aquí.";

/** Lado mayor de una foto para el dueño (más que la miniatura de identificación). */
export const LADO_FOTO = 1600;

/** Vida de las URLs firmadas que el servidor entrega en las ligas públicas. */
export const TTL_URL_FIRMADA_S = 30 * 60;

export const RETENCION_POR_OMISION = 7;

export const MIME_VIDEO_PERMITIDOS = ["video/mp4", "video/quicktime", "video/webm", "video/x-m4v", "video/3gpp"] as const;
