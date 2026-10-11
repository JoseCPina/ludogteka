// Validación y normalización de una fila del importador. La usan la vista previa
// (en el servidor, junto con las búsquedas de duplicados) y el alta de las filas:
// lo que la base recibe ya viene limpio, y la base vuelve a exigir lo suyo.

import { normalizarTelefono } from "@/lib/telefono";

/** Una fila ya mapeada: clave de campo → texto tal como venía en el archivo. */
export type FilaCruda = Partial<Record<string, string>>;

/** Lo que se guarda en importacion_filas.datos (y lee importacion_procesar_fila). */
export type DatosFila = {
  c_nombre: string;
  c_telefono: string;
  c_email?: string;
  c_direccion?: string;
  c_notas?: string;
  m_nombre?: string;
  m_especie?: "perro" | "gato" | "otro";
  m_especie_detalle?: string;
  m_raza?: string;
  m_sexo?: "macho" | "hembra";
  m_nacimiento?: string;
  m_tamano?: "chico" | "mediano" | "grande";
  m_pelaje?: "corto" | "medio" | "largo" | "rizado";
  m_esterilizado?: boolean;
  m_peso?: number;
  m_alergias?: string[];
  m_microchip?: string;
  m_folio?: string;
};

export type ResultadoValidacion = {
  datos: DatosFila | null;
  /** Si hay error, la fila no se importa. */
  error: string | null;
  /** Lo que se descartó o se interpretó: la fila sí se importa. */
  avisos: string[];
};

const limpio = (v: string | undefined): string => String(v ?? "").replace(/\s+/g, " ").trim();
const clave = (v: string): string =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9ñ ]+/g, " ").trim();

export function parsearSexo(v: string): "macho" | "hembra" | null {
  const k = clave(v);
  if (["m", "macho", "male", "masculino", "mac"].includes(k)) return "macho";
  if (["h", "f", "hembra", "female", "femenino", "hem"].includes(k)) return "hembra";
  return null;
}

export function parsearSiNo(v: string): boolean | null {
  const k = clave(v);
  if (["si", "s", "yes", "y", "1", "true", "verdadero", "esterilizado", "esterilizada", "castrado", "castrada", "operado", "operada"].includes(k)) return true;
  if (["no", "n", "0", "false", "falso", "entero", "entera", "sin esterilizar"].includes(k)) return false;
  return null;
}

export function parsearTamano(v: string): "chico" | "mediano" | "grande" | null {
  const k = clave(v);
  if (["chico", "chica", "ch", "pequeno", "pequena", "mini", "toy", "small", "s", "xs", "peque"].includes(k)) return "chico";
  if (["mediano", "mediana", "med", "m", "medium", "intermedio"].includes(k)) return "mediano";
  if (["grande", "g", "large", "l", "gigante", "xl", "gde"].includes(k)) return "grande";
  return null;
}

export function parsearPelaje(v: string): "corto" | "medio" | "largo" | "rizado" | null {
  const k = clave(v);
  if (["corto", "cort", "c", "short", "pelo corto"].includes(k)) return "corto";
  if (["medio", "mediano", "med", "m", "medium", "pelo medio"].includes(k)) return "medio";
  if (["largo", "l", "long", "pelo largo"].includes(k)) return "largo";
  if (["rizado", "rizo", "chino", "crespo", "ensortijado", "curly"].includes(k)) return "rizado";
  return null;
}

export function parsearEspecie(v: string): { especie: "perro" | "gato" | "otro"; detalle?: string } {
  const k = clave(v);
  if (!k || ["perro", "perra", "canino", "can", "dog", "perrito"].includes(k)) return { especie: "perro" };
  if (["gato", "gata", "felino", "cat", "gatito"].includes(k)) return { especie: "gato" };
  return { especie: "otro", detalle: limpio(v).slice(0, 60) };
}

function fechaValida(a: number, m: number, d: number): string | null {
  if (a < 1980 || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  if (f.getTime() > Date.now() + 86_400_000) return null;
  return `${String(a).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Día/mes/año (México) o año-mes-día. Las fechas de Excel llegan ya como año-mes-día. */
export function parsearFecha(v: string): string | null {
  const t = limpio(v);
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T ].*)?$/.exec(t);
  if (m) return fechaValida(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(t);
  if (m) return fechaValida(+m[3], +m[2], +m[1]);
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/.exec(t);
  if (m) {
    const aa = +m[3];
    return fechaValida(aa > 30 ? 1900 + aa : 2000 + aa, +m[2], +m[1]);
  }
  return null;
}

export function parsearPeso(v: string): number | null {
  const t = limpio(v).toLowerCase().replace(",", ".");
  const m = /^(\d+(?:\.\d+)?)\s*(kg|kgs|kilos?|g|gr|grs|gramos?)?$/.exec(t);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2] && /^g/.test(m[2]) && !/^kg|^kilo/.test(m[2])) n = n / 1000;
  n = Math.round(n * 100) / 100;
  return n > 0 && n <= 200 ? n : null;
}

export function parsearMicrochip(v: string): string | null {
  const t = String(v ?? "").replace(/[\s-]/g, "");
  return /^[A-Za-z0-9]{9,20}$/.test(t) ? t : null;
}

export function dividirAlergias(v: string): string[] {
  return Array.from(
    new Set(
      String(v ?? "")
        .split(/[,;|\n/]+/)
        .map((a) => limpio(a).slice(0, 120))
        .filter(Boolean)
    )
  ).slice(0, 10);
}

/**
 * Valida y normaliza una fila. `conClinicos` = el negocio tiene Veterinaria
 * prendida y quien importa puede editar la ficha clínica: sin eso, especie,
 * peso, alergias, microchip y folio se ignoran aunque el archivo los traiga.
 */
export function validarFila(cruda: FilaCruda, conClinicos: boolean): ResultadoValidacion {
  const avisos: string[] = [];
  const nombre = limpio(cruda.c_nombre);
  if (!nombre) return { datos: null, error: "Falta el nombre del dueño.", avisos };
  if (nombre.length > 120) return { datos: null, error: "El nombre del dueño es demasiado largo.", avisos };

  const telCrudo = limpio(cruda.c_telefono);
  if (!telCrudo) return { datos: null, error: "Falta el teléfono.", avisos };
  const telefono = normalizarTelefono(telCrudo);
  if (!telefono) {
    return { datos: null, error: `El teléfono «${telCrudo.slice(0, 30)}» no tiene 10 dígitos.`, avisos };
  }

  const datos: DatosFila = { c_nombre: nombre, c_telefono: telefono };

  const email = limpio(cruda.c_email).toLowerCase();
  if (email) {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 150) datos.c_email = email;
    else avisos.push(`El correo «${email.slice(0, 40)}» no es válido: no se guardó.`);
  }
  const dir = limpio(cruda.c_direccion);
  if (dir) datos.c_direccion = dir.slice(0, 250);
  const notas = limpio(cruda.c_notas);
  if (notas) datos.c_notas = notas.slice(0, 500);

  const mascota = limpio(cruda.m_nombre);
  const otrosDeMascota = ["m_raza", "m_sexo", "m_nacimiento", "m_tamano", "m_pelaje", "m_esterilizado", "m_peso", "m_alergias", "m_microchip", "m_folio"]
    .some((k) => limpio(cruda[k]) !== "");
  if (!mascota) {
    if (otrosDeMascota) avisos.push("Trae datos de una mascota pero no su nombre: solo se importa el dueño.");
    return { datos, error: null, avisos };
  }
  datos.m_nombre = mascota.slice(0, 80);

  if (conClinicos) {
    const esp = parsearEspecie(limpio(cruda.m_especie));
    datos.m_especie = esp.especie;
    if (esp.detalle) datos.m_especie_detalle = esp.detalle;
  }
  const raza = limpio(cruda.m_raza);
  if (raza) datos.m_raza = raza.slice(0, 80);

  const sexo = limpio(cruda.m_sexo);
  if (sexo) {
    const s = parsearSexo(sexo);
    if (s) datos.m_sexo = s;
    else avisos.push(`Sexo «${sexo.slice(0, 20)}» no reconocido: se dejó vacío.`);
  }
  const nac = limpio(cruda.m_nacimiento);
  if (nac) {
    const f = parsearFecha(nac);
    if (f) datos.m_nacimiento = f;
    else avisos.push(`Fecha de nacimiento «${nac.slice(0, 20)}» no válida: se dejó vacía.`);
  }
  const tam = limpio(cruda.m_tamano);
  if (tam) {
    const t = parsearTamano(tam);
    if (t) datos.m_tamano = t;
    else avisos.push(`Tamaño «${tam.slice(0, 20)}» no reconocido: se dejó vacío.`);
  }
  const pel = limpio(cruda.m_pelaje);
  if (pel) {
    const p = parsearPelaje(pel);
    if (p) datos.m_pelaje = p;
    else avisos.push(`Pelaje «${pel.slice(0, 20)}» no reconocido: se dejó vacío.`);
  }
  const est = limpio(cruda.m_esterilizado);
  if (est) {
    const e = parsearSiNo(est);
    if (e !== null) datos.m_esterilizado = e;
    else avisos.push(`Esterilizado «${est.slice(0, 20)}» no reconocido: se dejó sin dato.`);
  }

  if (conClinicos) {
    const peso = limpio(cruda.m_peso);
    if (peso) {
      const p = parsearPeso(peso);
      if (p !== null) datos.m_peso = p;
      else avisos.push(`Peso «${peso.slice(0, 20)}» no válido: no se registró.`);
    }
    const alergias = dividirAlergias(cruda.m_alergias ?? "");
    if (alergias.length) datos.m_alergias = alergias;
    const chip = limpio(cruda.m_microchip);
    if (chip) {
      const c = parsearMicrochip(chip);
      if (c) datos.m_microchip = c;
      else avisos.push(`Microchip «${chip.slice(0, 24)}» no válido (9 a 20 letras o números): no se guardó.`);
    }
    const folio = limpio(cruda.m_folio);
    if (folio) datos.m_folio = folio.slice(0, 60);
  }
  return { datos, error: null, avisos };
}
