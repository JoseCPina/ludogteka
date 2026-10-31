// El catálogo canónico del Índice PeluDesk de precios: qué servicios se comparan, en qué giro, con qué tallas, con
// qué sinónimos se reconocen en una página o una reseña y en qué rango de pesos es creíble un precio (fuera de ese
// rango, la fila entra como no válida y no cuenta). Sin imports: lo leen la herramienta, las páginas por ciudad,
// los scripts de scripts/mercado (Node directo) y el panel /plataforma/mercado.

export type GiroMercado = "estetica" | "hotel" | "guarderia" | "veterinaria";
export type Talla = "chico" | "mediano" | "grande";

export type ServicioMercado = {
  clave: string;
  giro: GiroMercado;
  nombre: string;
  /** «por noche», «por día», «por sesión», «por consulta». */
  unidad: string;
  /** Si el precio depende de la talla del perro. */
  conTalla: boolean;
  /** Palabras con las que aparece en una página o una reseña (minúsculas, sin acentos; se comparan contra texto normalizado). */
  sinonimos: string[];
  /** Pesos: fuera de este rango un precio no es creíble (un «$35» de un baño es un error de lectura). */
  minimo: number;
  maximo: number;
};

export const GIROS_MERCADO: { clave: GiroMercado; nombre: string; plural: string; articulo: string }[] = [
  { clave: "estetica", nombre: "Estética canina", plural: "estéticas caninas", articulo: "una estética canina" },
  { clave: "hotel", nombre: "Hotel para perros", plural: "hoteles para perros", articulo: "un hotel para perros" },
  { clave: "guarderia", nombre: "Guardería canina", plural: "guarderías caninas", articulo: "una guardería canina" },
  { clave: "veterinaria", nombre: "Veterinaria", plural: "veterinarias", articulo: "una veterinaria" },
];

export const TALLAS: { clave: Talla; nombre: string; detalle: string }[] = [
  { clave: "chico", nombre: "Chico", detalle: "hasta 10 kg" },
  { clave: "mediano", nombre: "Mediano", detalle: "10 a 25 kg" },
  { clave: "grande", nombre: "Grande", detalle: "más de 25 kg" },
];

export const SERVICIOS_MERCADO: ServicioMercado[] = [
  { clave: "bano", giro: "estetica", nombre: "Baño completo", unidad: "por sesión", conTalla: true, sinonimos: ["bano", "bano completo", "bano basico", "bano estetico", "bano y secado", "bano higienico", "spa"], minimo: 80, maximo: 1800 },
  { clave: "bano_y_corte", giro: "estetica", nombre: "Baño y corte", unidad: "por sesión", conTalla: true, sinonimos: ["corte", "bano y corte", "corte de pelo", "bano con corte", "estetica completa", "rapado", "corte de raza", "grooming"], minimo: 120, maximo: 2500 },
  { clave: "corte_unas", giro: "estetica", nombre: "Corte de uñas", unidad: "por sesión", conTalla: false, sinonimos: ["corte de unas", "unas"], minimo: 30, maximo: 400 },
  { clave: "noche_hotel", giro: "hotel", nombre: "Noche de hotel", unidad: "por noche", conTalla: true, sinonimos: ["noche", "por noche", "la noche", "hospedaje", "pension", "hotel", "estancia", "alojamiento"], minimo: 120, maximo: 2500 },
  { clave: "dia_guarderia", giro: "guarderia", nombre: "Día de guardería", unidad: "por día", conTalla: false, sinonimos: ["dia", "por dia", "el dia", "guarderia", "day care", "daycare", "dia completo", "medio dia"], minimo: 80, maximo: 1500 },
  { clave: "paquete_guarderia", giro: "guarderia", nombre: "Paquete de 10 días", unidad: "por paquete", conTalla: false, sinonimos: ["paquete", "10 dias", "10 pases", "mensualidad", "pases"], minimo: 700, maximo: 12000 },
  { clave: "consulta", giro: "veterinaria", nombre: "Consulta general", unidad: "por consulta", conTalla: false, sinonimos: ["consulta", "consulta general", "consulta medica", "revision", "consulta veterinaria"], minimo: 100, maximo: 2500 },
  { clave: "vacuna", giro: "veterinaria", nombre: "Vacuna", unidad: "por dosis", conTalla: false, sinonimos: ["vacuna", "vacunacion", "rabia", "antirrabica", "sextuple", "quintuple", "puppy", "triple felina"], minimo: 100, maximo: 1500 },
  { clave: "desparasitacion", giro: "veterinaria", nombre: "Desparasitación", unidad: "por aplicación", conTalla: false, sinonimos: ["desparasitacion", "desparasitante", "desparasitar"], minimo: 50, maximo: 900 },
  { clave: "esterilizacion", giro: "veterinaria", nombre: "Esterilización", unidad: "por cirugía", conTalla: true, sinonimos: ["esterilizacion", "esterilizar", "castracion", "castrar", "ovariohisterectomia", "orquiectomia"], minimo: 500, maximo: 9000 },
];

export const servicioMercado = (clave: string): ServicioMercado | null => SERVICIOS_MERCADO.find((s) => s.clave === clave) ?? null;
export const serviciosDeGiro = (giro: GiroMercado): ServicioMercado[] => SERVICIOS_MERCADO.filter((s) => s.giro === giro);
export const esGiroMercado = (g: string | null | undefined): g is GiroMercado => GIROS_MERCADO.some((x) => x.clave === g);
export const esTalla = (t: string | null | undefined): t is Talla => TALLAS.some((x) => x.clave === t);
export const giroMercado = (clave: GiroMercado) => GIROS_MERCADO.find((g) => g.clave === clave)!;

/** El servicio principal de cada giro: el que abre la herramienta y el de las páginas por ciudad. */
export const SERVICIO_PRINCIPAL: Record<GiroMercado, string> = { estetica: "bano", hotel: "noche_hotel", guarderia: "dia_guarderia", veterinaria: "consulta" };

/**
 * Lo que una ciudad necesita para tener rango y página propios: 8 precios o más Y 3 negocios distintos o más (los
 * mismos mínimos valen para el estado y el país). Los exige la base (precios_mercado_rangos, precios_mercado_ciudades);
 * aquí viven para los textos que lo explican.
 */
export const MINIMO_MUESTRAS = 8;
export const MINIMO_NEGOCIOS = 3;
export const TEXTO_MINIMO = `${MINIMO_MUESTRAS} precios de ${MINIMO_NEGOCIOS} negocios distintos`;

/** Un precio creíble para ese servicio (lo demás entra como no válido). */
export function precioCreible(clave: string, precio: number): boolean {
  const s = servicioMercado(clave);
  return !!s && Number.isFinite(precio) && precio >= s.minimo && precio <= s.maximo;
}

/** Sin acentos ni mayúsculas, para comparar textos. */
export function normalizarTexto(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** «guadalajara-jalisco» de «Guadalajara, Jalisco» (ruta de las páginas por ciudad). */
export function slugDe(t: string): string {
  return normalizarTexto(t).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export const pesosMercado = (n: number) => `$${Math.round(n).toLocaleString("es-MX")}`;

/** El mes y año de una fecha AAAA-MM-DD en texto («octubre de 2026»). */
export function mesEnTexto(fecha: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})/.exec(fecha ?? "");
  if (!m) return null;
  const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${MESES[Number(m[2]) - 1]} de ${m[1]}`;
}

export type Rango = {
  nivel: "ciudad" | "estado" | "pais" | "sin_datos";
  lugar?: string;
  p25?: number;
  mediana?: number;
  p75?: number;
  minimo?: number;
  maximo?: number;
  muestras: number;
  /** Negocios distintos detrás de las muestras (3 o más para que el nivel valga). */
  negocios?: number;
  fecha?: string | null;
};

/** Dónde queda un precio dentro del rango: abajo del p25, dentro, o arriba del p75. */
export function posicionEnRango(precio: number, r: Rango): "abajo" | "dentro" | "arriba" | null {
  if (r.nivel === "sin_datos" || r.p25 == null || r.p75 == null) return null;
  if (precio < r.p25) return "abajo";
  if (precio > r.p75) return "arriba";
  return "dentro";
}

/** Lo que se le dice a quien escribió su precio. */
export function textoPosicion(precio: number, r: Rango, servicio: string): string {
  const pos = posicionEnRango(precio, r);
  if (!pos || r.mediana == null) return "Todavía no hay suficientes precios para comparar el tuyo.";
  const dif = Math.round(((precio - r.mediana) / r.mediana) * 100);
  const lugar = r.nivel === "pais" ? "del país" : `de ${r.lugar}`;
  if (pos === "dentro") return `Tu precio de ${servicio.toLowerCase()} está dentro del rango ${lugar}: ${Math.abs(dif)} % ${dif >= 0 ? "arriba" : "abajo"} de la mediana.`;
  if (pos === "abajo") return `Tu precio está por debajo del 75 % de los negocios ${lugar}: ${Math.abs(dif)} % abajo de la mediana. Hay margen para subirlo.`;
  return `Tu precio está por arriba del 75 % de los negocios ${lugar}: ${dif} % arriba de la mediana. Conviene que tu servicio lo justifique.`;
}
