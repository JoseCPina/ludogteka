// QA S39 (N137): cómo se nombra a la mascota en pantallas, avisos y mensajes. En un negocio SIN Veterinaria todo es
// «perro» (solo registra perros). Con Veterinaria se usa la especie de la mascota («gato», «perro») y, cuando no se
// sabe o es otra especie, o se habla de varias, «mascota». Una sola tabla de palabras para que ningún texto vuelva a
// decir «perro» fijo: `vocabularioMascota({ conVet, especie })`. Sin imports de valores: lo usan servidor y navegador.

export type Vocabulario = {
  /** perro · gato · mascota */
  nombre: string;
  /** perros · gatos · mascotas */
  plural: string;
  /** Perro · Gato · Mascota */
  Nombre: string;
  /** Perros · Gatos · Mascotas */
  Plural: string;
  /** el perro · el gato · la mascota */
  el: string;
  /** un perro · un gato · una mascota */
  un: string;
  /** este perro · este gato · esta mascota */
  este: string;
  /** del perro · del gato · de la mascota */
  del: string;
  /** al perro · al gato · a la mascota */
  al: string;
  /** tu perro · tu gato · tu mascota */
  tu: string;
  /** tus perros · tus gatos · tus mascotas */
  tus: string;
  /** su perro · su gato · su mascota */
  su: string;
  /** Nuevo perro · Nuevo gato · Nueva mascota */
  nuevo: string;
  /** otro perro · otro gato · otra mascota */
  otro: string;
  /** registrado · registrada (concuerda con el nombre) */
  o: "o" | "a";
};

function armar(nombre: string, plural: string, femenino: boolean): Vocabulario {
  const may = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return {
    nombre,
    plural,
    Nombre: may(nombre),
    Plural: may(plural),
    el: `${femenino ? "la" : "el"} ${nombre}`,
    un: `${femenino ? "una" : "un"} ${nombre}`,
    este: `${femenino ? "esta" : "este"} ${nombre}`,
    del: femenino ? `de la ${nombre}` : `del ${nombre}`,
    al: femenino ? `a la ${nombre}` : `al ${nombre}`,
    tu: `tu ${nombre}`,
    tus: `tus ${plural}`,
    su: `su ${nombre}`,
    nuevo: `${femenino ? "Nueva" : "Nuevo"} ${nombre}`,
    otro: `${femenino ? "otra" : "otro"} ${nombre}`,
    o: femenino ? "a" : "o",
  };
}

const PERRO = armar("perro", "perros", false);
const GATO = armar("gato", "gatos", false);
const MASCOTA = armar("mascota", "mascotas", true);

/**
 * Las palabras para una mascota (o para las mascotas de un cliente, sin `especie`).
 *   conVet: el negocio tiene el módulo Veterinaria (`usaVeterinaria(modulos)` / `useModulos().tiene("veterinaria")`).
 *   especie: la de la mascota de la que se habla; sin ella (una lista, un alta sin escoger), «mascota».
 */
export function vocabularioMascota({ conVet, especie }: { conVet: boolean; especie?: string | null }): Vocabulario {
  if (!conVet) return PERRO;
  if (especie === "perro") return PERRO;
  if (especie === "gato") return GATO;
  return MASCOTA;
}

/** Vacunas que se sugieren al registrar una en el carnet, según la especie (texto libre: se puede escribir otra). */
export function vacunasSugeridas(especie: string | null | undefined): string[] {
  if (especie === "gato") return ["Triple felina", "Rabia", "Leucemia felina"];
  if (especie === "perro") return ["Rabia", "Múltiple (séxtuple)", "Parvovirus", "Bordetella", "Leptospirosis"];
  return ["Rabia"];
}
