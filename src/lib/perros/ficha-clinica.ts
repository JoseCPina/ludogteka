// Ficha clínica de la mascota (módulo Veterinaria): lectura y validación
// de los campos nuevos de `perros`, y traducción de los errores de la base.
// No es "use server": lo comparten acciones del staff y del alta por link.

export const ESPECIES = ["perro", "gato", "otro"] as const;
export type Especie = (typeof ESPECIES)[number];

export const ETIQUETA_ESPECIE: Record<Especie, string> = {
  perro: "Perro",
  gato: "Gato",
  otro: "Otro",
};

export function esEspecie(valor: unknown): valor is Especie {
  return typeof valor === "string" && (ESPECIES as readonly string[]).includes(valor);
}

const REGEX_MICROCHIP = /^[A-Za-z0-9]{9,20}$/;

/** Mismo criterio que la base: sin espacios ni guiones. */
export function normalizarMicrochip(valor: string): string {
  return valor.replace(/[\s-]/g, "");
}

export type CamposClinicos = {
  especie: Especie;
  especie_detalle: string | null;
  microchip: string | null;
  folio_registro: string | null;
  notas_clinicas: string | null;
};

/**
 * Lee y valida los campos clínicos de un formulario. Devuelve el error en
 * español o los campos listos para escribir.
 */
export function leerCamposClinicos(
  formData: FormData
): { error: string } | { campos: CamposClinicos } {
  const especieCruda = String(formData.get("especie") ?? "perro").trim() || "perro";
  if (!esEspecie(especieCruda)) return { error: "Elige una especie válida: perro, gato u otro." };
  const detalle = String(formData.get("especie_detalle") ?? "").trim();
  if (especieCruda === "otro" && !detalle) {
    return { error: "Escribe qué especie es (por ejemplo: conejo, hurón)." };
  }
  const microchip = normalizarMicrochip(String(formData.get("microchip") ?? "").trim());
  if (microchip && !REGEX_MICROCHIP.test(microchip)) {
    return { error: "El microchip lleva de 9 a 20 letras o números, sin espacios. El estándar tiene 15 dígitos." };
  }
  const texto = (clave: string) => String(formData.get(clave) ?? "").trim() || null;
  return {
    campos: {
      especie: especieCruda,
      especie_detalle: especieCruda === "otro" ? detalle : null,
      microchip: microchip || null,
      folio_registro: texto("folio_registro"),
      notas_clinicas: texto("notas_clinicas"),
    },
  };
}

/** Traduce un error de PostgREST al mensaje que ve la persona. */
export function mensajeErrorClinico(error: { code?: string; message?: string } | null): string {
  if (!error) return "";
  if (error.code === "42501") {
    return "No tienes permiso para editar la ficha clínica. Pídele a un admin el permiso «Editar ficha clínica».";
  }
  if (error.code === "23505") return "Ese microchip ya está registrado en otra mascota.";
  if (error.code === "23514") return "Revisa los datos: la especie o el microchip no son válidos.";
  return "No pudimos guardar la ficha clínica. Intenta de nuevo.";
}
