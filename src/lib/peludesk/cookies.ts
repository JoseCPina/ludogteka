/**
 * Consentimiento de cookies de peludesk.mx (solo en el dominio de la
 * plataforma: los dominios de los negocios no llevan banner ni nada de esto).
 *
 * La elección vive en UNA cookie propia (`peludesk_consent`), dura 6 meses y
 * dice qué categorías aceptó: necesarias siempre; analítica y marketing solo
 * si las prendió. Nada de analítica ni marketing se carga antes.
 * El navegador avisa cada cambio con el evento `peludesk:consentimiento`
 * (detail: { decidido, analitica, marketing }) para que el píxel lo escuche.
 */
export const COOKIE_CONSENTIMIENTO = "peludesk_consent";
export const MESES_VIGENCIA = 6;
export const SEGUNDOS_VIGENCIA = 60 * 60 * 24 * 182;
export const EVENTO_CONSENTIMIENTO = "peludesk:consentimiento";
export const EVENTO_ABRIR_PREFERENCIAS = "peludesk:abrir-preferencias";
// Sube si cambian las categorías o lo que hace cada una: vuelve a preguntar.
export const VERSION_CONSENTIMIENTO = 1;

export type Consentimiento = { decidido: boolean; analitica: boolean; marketing: boolean };
export const SIN_DECISION: Consentimiento = { decidido: false, analitica: false, marketing: false };

/** Lo que guarda la cookie: v (versión), a (analítica), m (marketing), t (cuándo, ms). */
type Guardado = { v: number; a: boolean; m: boolean; t: number };

export function leerConsentimiento(valor: string | null | undefined, ahora = Date.now()): Consentimiento {
  if (!valor) return SIN_DECISION;
  try {
    const g = JSON.parse(decodeURIComponent(valor)) as Partial<Guardado>;
    if (g.v !== VERSION_CONSENTIMIENTO || typeof g.t !== "number") return SIN_DECISION;
    if (ahora - g.t > SEGUNDOS_VIGENCIA * 1000) return SIN_DECISION;
    return { decidido: true, analitica: g.a === true, marketing: g.m === true };
  } catch {
    return SIN_DECISION;
  }
}

export function serializarConsentimiento(c: Pick<Consentimiento, "analitica" | "marketing">, ahora = Date.now()): string {
  const g: Guardado = { v: VERSION_CONSENTIMIENTO, a: c.analitica, m: c.marketing, t: ahora };
  return encodeURIComponent(JSON.stringify(g));
}

export type CookieDeclarada = {
  nombre: string;
  quien: string;
  categoria: "Necesaria" | "Analítica" | "Marketing";
  duracion: string;
  finalidad: string;
  cuando: string;
};

/**
 * La tabla de /cookies y del panel «Configurar»: todo lo que peludesk.mx
 * puede guardar en tu navegador. Si se agrega una tecnología, se agrega aquí
 * primero (y sube VERSION_CONSENTIMIENTO si cambia una categoría).
 */
export const COOKIES_DECLARADAS: CookieDeclarada[] = [
  {
    nombre: COOKIE_CONSENTIMIENTO,
    quien: "peludesk.mx (propia)",
    categoria: "Necesaria",
    duracion: `${MESES_VIGENCIA} meses`,
    finalidad: "Guarda qué categorías de cookies aceptaste o rechazaste, para no volver a preguntarte en cada visita.",
    cuando: "Cuando eliges en el aviso de cookies.",
  },
  {
    nombre: "sb-<proyecto>-auth-token",
    quien: "peludesk.mx (propia; la crea Supabase Auth)",
    categoria: "Necesaria",
    duracion: "Hasta 400 días; el acceso caduca antes y se renueva",
    finalidad: "Mantiene abierta la sesión de quien administra la plataforma de PeluDesk. Un visitante o alguien que solo se registra no la recibe en peludesk.mx.",
    cuando: "Solo si inicias sesión en la administración de la plataforma.",
  },
  {
    nombre: "Estadísticas de visitas (Vercel Web Analytics)",
    quien: "peludesk.mx (propia)",
    categoria: "Analítica",
    duracion: "No guarda cookies ni identificadores en tu navegador",
    finalidad: "Cuenta visitas por página, de dónde llegaste, país, dispositivo y navegador, de forma agregada, para saber qué páginas sirven.",
    cuando: "Solo si aceptas la analítica.",
  },
  {
    nombre: "_fbp",
    quien: "peludesk.mx (la crea el píxel de Meta)",
    categoria: "Marketing",
    duracion: "90 días",
    finalidad: "Identifica tu navegador para medir si un anuncio de PeluDesk en Facebook o Instagram terminó en un registro.",
    cuando: "Solo si aceptas el marketing.",
  },
  {
    nombre: "_fbc",
    quien: "peludesk.mx (la crea el píxel de Meta)",
    categoria: "Marketing",
    duracion: "90 días",
    finalidad: "Guarda el identificador del clic (fbclid) cuando llegas desde un anuncio de Facebook o Instagram, para atribuir el registro a ese anuncio.",
    cuando: "Solo si aceptas el marketing y llegas desde un anuncio.",
  },
  {
    nombre: "Píxel de Meta (solicitudes a facebook.com/tr y connect.facebook.net)",
    quien: "Meta Platforms, Inc. (tercero)",
    categoria: "Marketing",
    duracion: "Las cookies propias de Meta en su dominio las gobierna Meta (por ejemplo «fr», hasta 90 días)",
    finalidad: "Envía a Meta qué página viste y si abriste el demo o creaste tu negocio de prueba, para medir y optimizar nuestra publicidad. Al crear tu negocio de prueba, el servidor manda además ese evento a Meta con tu IP, navegador y un hash de tu teléfono.",
    cuando: "Solo si aceptas el marketing.",
  },
];
