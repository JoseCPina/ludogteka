// Qué le exige el alta a una mascota nueva (N16, QA externa del 16 de octubre de 2026: un perro quedó guardado en
// Estética sin raza, tamaño ni pelaje y no se le podía cotizar). Gemela de `perro_faltantes_alta()` en la base: se
// cambian juntas. Misma regla que el formulario del perro:
//   · con Estética o con guardería u hotel: raza (o «Mestizo»);
//   · con Estética, además tamaño y pelaje cuando la raza no fija el precio sola (texto suelto, mestizo o sin raza,
//     raza sin grupo de precio, o un grupo que cobra por tamaño × pelaje);
//   · solo Veterinaria: nada de esto es obligatorio.
export type CamposPerroAlta = {
  // QA S39 (N137): raza, tamaño y pelaje obligatorios son de un perro (precio de estética, estancias); un gato o
  // «otro» no los pide. Sin especie, perro.
  especie?: string | null;
  raza?: string | null;
  raza_id?: string | null;
  raza_propuesta?: unknown;
  tamano_id?: string | null;
  pelaje_id?: string | null;
};

export type RazaCatalogoAlta = {
  es_desconocida?: boolean;
  nombre: string;
  grupo_nombre?: string | null;
  grupo_depende_pelaje?: boolean;
};

export function faltantesAltaPerro(
  p: CamposPerroAlta,
  modulos: readonly string[],
  razas: readonly (RazaCatalogoAlta & { id: string })[] = []
): string[] {
  const estetica = modulos.includes("estetica");
  const estancias = modulos.includes("guarderia") || modulos.includes("hotel");
  if (!estetica && !estancias) return [];
  if (p.especie && p.especie !== "perro") return [];
  const faltan: string[] = [];
  const tieneRaza = Boolean(p.raza_id) || Boolean((p.raza ?? "").trim()) || Boolean(p.raza_propuesta);
  if (!tieneRaza) faltan.push("raza (si es mestizo, escoge «Mestizo»)");
  if (estetica && tieneRaza && !p.raza_propuesta) {
    const cat = p.raza_id ? razas.find((r) => r.id === p.raza_id) : null;
    const pideMatriz =
      !cat || Boolean(cat.es_desconocida) || /mestiz|criollo/i.test(cat.nombre) || !cat.grupo_nombre || Boolean(cat.grupo_depende_pelaje);
    if (pideMatriz && !p.tamano_id) faltan.push("tamaño");
    if (pideMatriz && !p.pelaje_id) faltan.push("pelaje");
  }
  return faltan;
}

export function mensajeFaltantesAlta(nombrePerro: string, faltan: string[]): string {
  return `A ${nombrePerro.trim() || "la mascota"} le falta: ${faltan.join(", ")}.`;
}

// ¿Se le muestran a este perro los requisitos de guardería y hotel (lo que le falta), o el aviso «Solo estética»?
// «Solo estética» es una afirmación sobre el perro: solo se dice cuando el negocio da estética Y el perro ya viene
// a estética Y nunca ha usado guardería ni hotel. Un perro nuevo en un negocio de hotel o guardería, o uno sin
// historial, muestra lo que le falta; en un negocio sin guardería ni hotel (Veterinaria o solo estética) no hay
// requisitos que mostrar ni aviso.
export function aplicanRequisitosDe(opciones: {
  modulos: readonly string[];
  usaGuarderiaHotel: boolean;
  tieneCitasEstetica: boolean;
}): boolean {
  const { modulos, usaGuarderiaHotel, tieneCitasEstetica } = opciones;
  if (!(modulos.includes("guarderia") || modulos.includes("hotel"))) return false;
  if (usaGuarderiaHotel) return true;
  return !(modulos.includes("estetica") && tieneCitasEstetica);
}

