// Una lista vacía de una estancia (cargos aplicados, servicios extra) — QA R59, N144. «Ninguno todavía» promete que
// algo puede llegar: solo vale mientras la estancia no termina (reservada, confirmada, en curso). Finalizada, cancelada
// o «no llegó» y sin nada que listar, el bloque NO se muestra: no hay nada que decir de él.
export const ESTADOS_ESTANCIA_TERMINADA = ["finalizada", "cancelada", "no_llego"] as const;

export function estanciaTerminada(estado: string | null | undefined): boolean {
  return (ESTADOS_ESTANCIA_TERMINADA as readonly string[]).includes(estado ?? "");
}

/** El texto de la lista vacía, o null si con ese estado la lista vacía no se muestra. */
export function textoListaVacia(estado: string | null | undefined, texto = "Ninguno todavía."): string | null {
  return estanciaTerminada(estado) ? null : texto;
}
