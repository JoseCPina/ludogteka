// Un negocio en solo lectura (el demo, una prueba vencida, una cuenta de
// demostración): la base rechaza toda escritura con sus políticas
// `<tabla>_escritura_*`, que lanzan este mismo mensaje con el código 42501
// (exigir_negocio_escribible(), migración 20260925203000). Este es el
// mensaje para quien apretó el botón, en vez del texto crudo de Postgres.
export const MENSAJE_SOLO_LECTURA = "Este negocio está en solo lectura: no se pueden guardar cambios.";

export function esErrorSoloLectura(error: { code?: string; message?: string } | null | undefined): boolean {
  return Boolean(error && error.code === "42501" && /solo lectura|_escritura_(ins|upd|del)/.test(error.message ?? ""));
}
