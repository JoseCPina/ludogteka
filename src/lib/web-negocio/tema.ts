// La página web de un negocio (la publicada en su subdominio y la vista previa de un prospecto en
// peludesk.mx/para/<slug>) cambia de paleta, tipografía y composición según su giro. El color de acento sale de
// sus fotos cuando las hay (lib/web-negocio/color.ts) y se ajusta para que se lea; sin foto, el del giro.
// Sin imports: lo usan también las pruebas con Node directo.

export type GiroWeb = "veterinaria" | "estetica" | "guarderia" | "hotel";
export type FuenteWeb = "jakarta" | "fraunces" | "fredoka" | "dmserif";
export type ComposicionWeb = "clinica" | "editorial" | "juguetona" | "boutique";

export type TemaWeb = {
  giro: GiroWeb;
  fuente: FuenteWeb;
  composicion: ComposicionWeb;
  /** Matiz de respaldo (0–360) si no hay foto o la foto es gris. */
  matiz: number;
  /** Rango de saturación del acento: un spa no se pinta como una guardería. */
  saturacion: [number, number];
  /** Radio de esquinas de tarjetas y botones. */
  radio: string;
  fondoOscuro: boolean;
  textos: {
    etiqueta: string;
    pedir: string;
    portal: string;
    serviciosTitulo: string;
    resenasTitulo: string;
  };
};

export const TEMAS: Record<GiroWeb, TemaWeb> = {
  veterinaria: {
    giro: "veterinaria",
    fuente: "jakarta",
    composicion: "clinica",
    matiz: 190,
    saturacion: [45, 70],
    radio: "14px",
    fondoOscuro: false,
    textos: { etiqueta: "Clínica veterinaria", pedir: "Agendar consulta", portal: "Carnet de mi mascota", serviciosTitulo: "Cómo cuidamos a tu mascota", resenasTitulo: "Lo que dicen los pacientes (y sus humanos)" },
  },
  estetica: {
    giro: "estetica",
    fuente: "fraunces",
    composicion: "editorial",
    matiz: 340,
    saturacion: [30, 55],
    radio: "999px",
    fondoOscuro: false,
    textos: { etiqueta: "Estética canina", pedir: "Agendar estética", portal: "Mi portal", serviciosTitulo: "Menú de servicios", resenasTitulo: "Salen felices" },
  },
  guarderia: {
    giro: "guarderia",
    fuente: "fredoka",
    composicion: "juguetona",
    matiz: 24,
    saturacion: [60, 85],
    radio: "28px",
    fondoOscuro: false,
    textos: { etiqueta: "Guardería canina", pedir: "Reservar guardería", portal: "Mi portal", serviciosTitulo: "Un día con nosotros", resenasTitulo: "Colas moviéndose" },
  },
  hotel: {
    giro: "hotel",
    fuente: "dmserif",
    composicion: "boutique",
    matiz: 160,
    saturacion: [25, 50],
    radio: "6px",
    fondoOscuro: true,
    textos: { etiqueta: "Hotel para perros", pedir: "Reservar hotel", portal: "Mi portal", serviciosTitulo: "Su estancia", resenasTitulo: "Huéspedes que regresan" },
  },
};

/**
 * El giro que manda en el diseño. Con varios servicios: veterinaria, luego hotel, guardería y al final estética
 * (la página de una clínica que también baña se ve como clínica).
 */
export function giroPrincipal(servicios: string[], giro?: string | null): GiroWeb {
  if (giro && giro !== "mixto" && giro in TEMAS) return giro as GiroWeb;
  for (const g of ["veterinaria", "hotel", "guarderia", "estetica"] as const) if (servicios.includes(g)) return g;
  return "guarderia";
}

// ── Color ──────────────────────────────────────────────────────────────────────────────────────────────────────

export type Hsl = { h: number; s: number; l: number };

export function hexAHsl(hex: string): Hsl {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
}

export function hslAHex({ h, s, l }: Hsl): string {
  const S = s / 100, L = l / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n: number) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return "#" + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("");
}

function luminancia(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export type PaletaWeb = {
  /** Botones y detalles: siempre legible con texto blanco (≥ 4.5:1). */
  acento: string;
  /** Fondo de secciones (muy claro, del mismo matiz). */
  suave: string;
  /** Fondo general de la página. */
  fondo: string;
  /** Texto principal. */
  tinta: string;
  /** Banda oscura (hero del hotel, pie). */
  profundo: string;
  /** De dónde salió el acento. */
  origen: "foto" | "giro";
};

const esHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * La paleta de la página: el matiz de su foto (o el guardado como su color) dentro del rango de saturación del
 * giro, oscurecido hasta que el blanco se lea encima. Una foto gris no da color: queda el del giro.
 */
export function paletaWeb(tema: TemaWeb, colorFoto: string | null | undefined): PaletaWeb {
  let h = tema.matiz;
  let origen: PaletaWeb["origen"] = "giro";
  if (esHex(colorFoto)) {
    const c = hexAHsl(colorFoto);
    if (c.s >= 18 && c.l > 8 && c.l < 94) {
      h = c.h;
      origen = "foto";
    }
  }
  const [smin, smax] = tema.saturacion;
  const s = origen === "foto" ? Math.min(smax, Math.max(smin, hexAHsl(colorFoto as string).s)) : (smin + smax) / 2;
  let l = 46;
  let acento = hslAHex({ h, s, l });
  while (contraste(acento, "#ffffff") < 4.6 && l > 12) {
    l -= 2;
    acento = hslAHex({ h, s, l });
  }
  return {
    acento,
    suave: hslAHex({ h, s: Math.min(s, 45), l: tema.giro === "guarderia" ? 93 : 96 }),
    fondo: tema.giro === "estetica" ? hslAHex({ h, s: 30, l: 98 }) : tema.giro === "hotel" ? hslAHex({ h: 38, s: 30, l: 96 }) : "#ffffff",
    tinta: hslAHex({ h, s: 25, l: 13 }),
    profundo: hslAHex({ h, s: Math.min(s, 40), l: 15 }),
    origen,
  };
}
