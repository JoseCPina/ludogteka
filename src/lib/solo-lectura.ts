// Un negocio en solo lectura (el demo, una prueba vencida, una cuenta de
// demostración): la base rechaza toda escritura con sus políticas
// `<tabla>_escritura_*`, que lanzan este mismo mensaje con el código 42501
// (exigir_negocio_escribible(), migración 20260925203000). Este es el
// mensaje para quien apretó el botón, en vez del texto crudo de Postgres.
export const MENSAJE_SOLO_LECTURA = "Este negocio está en solo lectura: no se pueden guardar cambios.";

// El demo (plan demo) guarda esto en su lugar: es lo que ve quien lo explora y aprieta «Guardar».
export const MENSAJE_DEMO = "En la demo no se guardan cambios. Prueba 15 días gratis con tu negocio.";

// Una foto o un archivo que se sube en la demo NO se guarda (la demo es de solo lectura para quien la
// explora; solo las cuentas del corredor de tutoriales escriben): la pantalla enseña la foto elegida con
// este aviso en vez de un error. Nada llega a Storage.
export const AVISO_FOTO_DEMO = "En el demo la foto no se guarda.";
export const AVISO_VIDEO_DEMO = "En el demo el video no se guarda.";
export const AVISO_ARCHIVO_DEMO = "En el demo el archivo no se guarda.";

/** Storage contesta con el mismo texto de la base (exigir_negocio_escribible) cuando la cuenta de la demo sube algo. */
export function esRechazoDeDemo(error: { message?: string } | null | undefined): boolean {
  return /^En la demo no se guardan/.test(error?.message ?? "");
}

export function esErrorSoloLectura(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && error.code === "42501" && /solo lectura|En la demo no se guardan|_escritura_(ins|upd|del)/.test(error.message ?? ""));
}

/** El texto para quien apretó el botón: el del demo si la base lo rechazó por ser el demo, si no el de siempre. */
export function mensajeSoloLectura(error?: { message?: string } | null): string {
  return /^En la demo no se guardan/.test(error?.message ?? "") ? MENSAJE_DEMO : MENSAJE_SOLO_LECTURA;
}
