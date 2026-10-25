/**
 * N126: lo que pasa con el tamaño y el pelaje al escoger la raza, en todo formulario de perro. La raza solo
 * SUGIERE: llena un campo vacío con su típico (Labrador: grande, corto) y nunca borra ni cambia lo que ya se
 * capturó. Una raza sin típicos (Mestizo, «No sé / mestizo») no toca nada.
 */
export type TallaPelaje = { tamanoId: string; pelajeId: string };

export function tallaYPelajeAlElegirRaza(
  raza: { tamano_tipico_id?: string | null; pelaje_tipico_id?: string | null } | null | undefined,
  actual: TallaPelaje
): TallaPelaje {
  return {
    tamanoId: actual.tamanoId || raza?.tamano_tipico_id || actual.tamanoId,
    pelajeId: actual.pelajeId || raza?.pelaje_tipico_id || actual.pelajeId,
  };
}
