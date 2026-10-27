// Los campos que acepta el importador de clientes y mascotas, y cómo se adivina
// a cuál corresponde cada columna de un archivo (por el texto del encabezado).
// Es el único lugar donde se definen: la pantalla de mapeo, la plantilla, la
// validación y la vista previa leen de aquí.

export type GrupoCampo = "cliente" | "mascota";

export type CampoImportador = {
  clave: string;
  etiqueta: string;
  grupo: GrupoCampo;
  /** Solo se pide con Veterinaria prendida (y el permiso de ficha clínica). */
  clinico?: boolean;
  /** Solo se pide con Veterinaria prendida (la especie: la escoge quien da de alta, sin el permiso de ficha clínica). */
  conVeterinaria?: boolean;
  obligatorio?: boolean;
  /** Encabezados que lo identifican (se comparan sin acentos ni signos). */
  sinonimos: string[];
  ayuda: string;
  ejemplo: string;
};

export const CAMPOS_IMPORTADOR: CampoImportador[] = [
  {
    clave: "c_nombre", etiqueta: "Nombre del dueño", grupo: "cliente", obligatorio: true,
    sinonimos: ["nombre", "nombre dueno", "nombre del dueno", "dueno", "nombre cliente", "nombre del cliente", "cliente", "propietario", "nombre propietario", "tutor", "responsable"],
    ayuda: "Obligatorio.", ejemplo: "María Hernández",
  },
  {
    clave: "c_telefono", etiqueta: "Teléfono (WhatsApp)", grupo: "cliente", obligatorio: true,
    sinonimos: ["telefono", "tel", "celular", "movil", "whatsapp", "telefono celular", "numero", "numero telefono", "telefono dueno", "cel"],
    ayuda: "Obligatorio. 10 dígitos; se acepta con espacios, guiones o +52.", ejemplo: "444 123 4567",
  },
  {
    clave: "c_email", etiqueta: "Correo", grupo: "cliente",
    sinonimos: ["correo", "email", "e mail", "mail", "correo electronico"],
    ayuda: "Opcional.", ejemplo: "maria@correo.com",
  },
  {
    clave: "c_direccion", etiqueta: "Dirección", grupo: "cliente",
    sinonimos: ["direccion", "domicilio", "calle", "direccion dueno"],
    ayuda: "Opcional. No calcula la distancia de recolección: eso se hace desde la ficha.", ejemplo: "Av. Carranza 100, Centro",
  },
  {
    clave: "c_notas", etiqueta: "Notas del dueño", grupo: "cliente",
    sinonimos: ["notas", "observaciones", "comentarios", "nota", "notas cliente", "notas dueno"],
    ayuda: "Opcional. El sistema todavía no tiene dónde guardarlas: se conservan en el historial de la importación.", ejemplo: "Prefiere WhatsApp",
  },
  {
    clave: "m_nombre", etiqueta: "Nombre de la mascota", grupo: "mascota",
    sinonimos: ["mascota", "nombre mascota", "nombre de la mascota", "paciente", "nombre paciente", "nombre perro", "nombre del perro", "perro", "gato", "animal", "nombre animal"],
    ayuda: "Si una fila no lo trae, solo se importa el dueño.", ejemplo: "Rocky",
  },
  {
    clave: "m_especie", etiqueta: "Especie", grupo: "mascota", conVeterinaria: true,
    sinonimos: ["especie", "tipo animal", "tipo de animal"],
    ayuda: "Perro, gato u otra. Vacío = perro. Un gato u otra especie no pide raza de perro, tamaño ni pelaje.", ejemplo: "Perro",
  },
  {
    clave: "m_raza", etiqueta: "Raza", grupo: "mascota",
    sinonimos: ["raza", "breed"],
    ayuda: "Se liga al catálogo de razas; lo que no coincide queda como texto y sale en un resumen.", ejemplo: "Labrador",
  },
  {
    clave: "m_sexo", etiqueta: "Sexo", grupo: "mascota",
    sinonimos: ["sexo", "genero", "macho hembra"],
    ayuda: "Macho o hembra.", ejemplo: "Macho",
  },
  {
    clave: "m_nacimiento", etiqueta: "Fecha de nacimiento", grupo: "mascota",
    sinonimos: ["fecha nacimiento", "fecha de nacimiento", "nacimiento", "fnac", "f nacimiento", "cumpleanos", "fecha nac"],
    ayuda: "Día/mes/año (también año-mes-día).", ejemplo: "15/03/2021",
  },
  {
    clave: "m_tamano", etiqueta: "Tamaño", grupo: "mascota",
    sinonimos: ["tamano", "talla", "size"],
    ayuda: "Chico, mediano o grande.", ejemplo: "Mediano",
  },
  {
    clave: "m_pelaje", etiqueta: "Pelaje", grupo: "mascota",
    sinonimos: ["pelaje", "pelo", "tipo pelo", "tipo de pelaje", "tipo de pelo"],
    ayuda: "Corto, medio, largo o rizado.", ejemplo: "Corto",
  },
  {
    clave: "m_esterilizado", etiqueta: "Esterilizado", grupo: "mascota",
    sinonimos: ["esterilizado", "esterilizada", "castrado", "castrada", "esterilizacion", "castracion", "estirilizado"],
    ayuda: "Sí o no. Vacío = sin dato.", ejemplo: "Sí",
  },
  {
    clave: "m_peso", etiqueta: "Peso (kg)", grupo: "mascota", clinico: true,
    sinonimos: ["peso", "peso kg", "kilos", "kg", "peso actual"],
    ayuda: "En kilos. Queda en el historial de peso con la fecha de hoy.", ejemplo: "18.5",
  },
  {
    clave: "m_alergias", etiqueta: "Alergias", grupo: "mascota", clinico: true,
    sinonimos: ["alergias", "alergia", "alergenos"],
    ayuda: "Varias separadas por coma o punto y coma.", ejemplo: "Pollo; Polen",
  },
  {
    clave: "m_microchip", etiqueta: "Microchip", grupo: "mascota", clinico: true,
    sinonimos: ["microchip", "chip", "micro chip", "no chip", "numero de chip"],
    ayuda: "9 a 20 letras o números. Sirve para detectar duplicados.", ejemplo: "985112345678901",
  },
  {
    clave: "m_folio", etiqueta: "Folio de registro", grupo: "mascota", clinico: true,
    sinonimos: ["folio", "folio registro", "folio de registro", "registro", "ruac", "no registro"],
    ayuda: "Texto libre (por ejemplo, el RUAC).", ejemplo: "RUAC-0001",
  },
];

export type ClaveCampo = (typeof CAMPOS_IMPORTADOR)[number]["clave"];

export function camposDisponibles(conClinicos: boolean, conVet: boolean = conClinicos): CampoImportador[] {
  return CAMPOS_IMPORTADOR.filter((c) => (conClinicos || !c.clinico) && (conVet || !c.conVeterinaria));
}

export function campoPorClave(clave: string): CampoImportador | undefined {
  return CAMPOS_IMPORTADOR.find((c) => c.clave === clave);
}

/** Minúsculas, sin acentos ni signos, palabras separadas por un espacio. */
export function normalizarEncabezado(texto: string): string {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "o", "mi", "su"]);

function palabras(texto: string): string[] {
  return normalizarEncabezado(texto).split(" ").filter((p) => p && !VACIAS.has(p));
}

/**
 * Sugerencia automática: a cada columna le toca el campo cuyo sinónimo está
 * COMPLETO dentro de su encabezado (el más largo gana; igual al encabezado, mejor).
 * Un campo no se asigna a dos columnas: gana la que lo pide con más fuerza.
 */
export function sugerirMapeo(encabezados: string[], conClinicos: boolean, conVet: boolean = conClinicos): (string | null)[] {
  const campos = camposDisponibles(conClinicos, conVet);
  const pares: { col: number; clave: string; puntos: number }[] = [];
  encabezados.forEach((enc, col) => {
    const h = palabras(enc);
    if (h.length === 0) return;
    for (const campo of campos) {
      let mejor = 0;
      for (const sin of campo.sinonimos) {
        const s = palabras(sin);
        if (s.length === 0) continue;
        if (!s.every((p) => h.includes(p))) continue;
        const puntos = s.length * 10 + (s.length === h.length ? 5 : 0);
        mejor = Math.max(mejor, puntos);
      }
      if (mejor > 0) pares.push({ col, clave: campo.clave, puntos: mejor });
    }
  });
  pares.sort((a, b) => b.puntos - a.puntos || a.col - b.col);
  const salida: (string | null)[] = encabezados.map(() => null);
  const usados = new Set<string>();
  for (const p of pares) {
    if (salida[p.col] !== null || usados.has(p.clave)) continue;
    salida[p.col] = p.clave;
    usados.add(p.clave);
  }
  return salida;
}
