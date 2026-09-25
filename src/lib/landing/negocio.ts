import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual, urlDelNegocio } from "@/lib/negocio/actual";

// Datos públicos del negocio para su landing. Es texto de escaparate, no
// la fuente de verdad de los precios: la app cobra con la matriz de
// `tarifas`. Si el negocio cambia un precio en la app, hay que cambiarlo
// también en `negocios.landing` (y viceversa).
//
// PeluDesk: antes eran constantes de este archivo (Ludogteka era el único
// negocio). Hoy viven en `negocios.landing` de cada negocio y se leen con
// `negocio_publico()` (sin sesión: la landing es pública). El contenido de
// Ludogteka se copió idéntico en la migración 20260925051050.

export type DatosLanding = {
  // "ludogteka": la landing con la rotulación de la camioneta y las fotos
  // del negocio (src/components/landing). Cualquier otro valor: la básica.
  tema: string;
  url_publica?: string;
  telefono_visible: string;
  // wa.me: país + 10 dígitos, sin "+" ni "1".
  telefono_wa: string;
  telefono_schema?: string;
  mensajes: {
    general: string;
    guarderia: string;
    hotel: string;
    estetica: string;
    recoleccion: string;
    requisitos: string;
    portal_citas?: string;
    contrato_error?: string;
  };
  direccion: { calle: string; colonia: string; cp: string; ciudad: string; estado: string };
  direccion_referencia?: string;
  horario: { dias: string; horas: string; abre: string; cierra: string; schema: string[] }[];
  horario_cerrado?: string;
  horario_nota?: string;
  precio_km_recoleccion?: number;
  recoleccion_reglas?: string[];
  zonas_cobertura?: { nombre: string; nota?: string }[];
  guarderia?: {
    ocasionalHora: number;
    diaCompleto: number;
    diaCompletoSabado: number;
    mensualidad: number;
    pases: { pases: number; precio: number; vigenciaDias: number }[];
  };
  hotel?: { talla: string; precio: number }[];
  estetica?: {
    incluye: string[];
    rapado_diferencia: string;
    expres_incluye: string;
    grupos: GrupoEstetica[];
    por_talla: { talla: string; bano: number; expres: number }[];
    pelo_maltratado: number;
  };
  requisitos?: { texto: string; tipo: "si" | "no" }[];
  textos?: { etiqueta_hero?: string; lema?: string; banda?: string[] };
  seo?: { titulo?: string; descripcion?: string; og_titulo?: string; og_descripcion?: string; imagen?: string; imagen_alt?: string };
};

export type GrupoEstetica = {
  nombre: string;
  bano: number;
  rapado?: number;
  expres: number;
};

export type NegocioLanding = {
  id: string;
  slug: string;
  nombre: string;
  dominio: string | null;
  url_publica: string | null;
  ciudad: string | null;
  landing: DatosLanding | null;
  marca: MarcaNegocio;
  // activo | prueba | demo, y cuándo termina la prueba.
  plan: string;
  prueba_termina_at: string | null;
};

// La marca del negocio (negocios.marca), la que va ENCIMA del diseño base
// de PeluDesk: su logo en el staff, su portal, su login, su alta por link.
export type MarcaNegocio = {
  nombre_corto?: string | null;
  // Color de su marca (#RRGGBB): su ícono generado y detalles.
  color?: string | null;
  favicon?: string | null;
  // Logo como imagen (ruta del sitio o https).
  logo?: string | null;
  // O logotipo de palabras con color, en la letra que se indique (así es el
  // de Ludogteka: "lu·dog·teka" en Fredoka, como en su camioneta).
  logo_texto?: { texto: string; color: string }[] | null;
  logo_fuente?: "fredoka" | "outfit" | null;
};

// Una lectura por petición, aunque la pidan todas las secciones.
export const cargarNegocioLanding = cache(async (): Promise<NegocioLanding> => {
  const basico = await negocioActual();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("negocio_publico");
  const fila = (Array.isArray(data) ? data[0] : data) as
    | { ciudad: string | null; landing: DatosLanding | null; marca: MarcaNegocio | null; plan: string | null; prueba_termina_at: string | null }
    | null
    | undefined;
  return {
    id: basico.id,
    slug: basico.slug,
    nombre: basico.nombre,
    dominio: basico.dominio,
    url_publica: basico.url_publica ?? null,
    ciudad: fila?.ciudad ?? null,
    landing: fila?.landing ?? null,
    marca: fila?.marca ?? {},
    plan: fila?.plan ?? "activo",
    prueba_termina_at: fila?.prueba_termina_at ?? null,
  };
});

export function linkWhatsAppDe(telefonoWa: string, mensaje: string) {
  return `https://wa.me/${telefonoWa}?text=${encodeURIComponent(mensaje)}`;
}

/**
 * Lo de la landing del negocio de la petición, con los mismos nombres que
 * tenían las constantes de antes. Para las secciones del tema: truena si el
 * negocio no tiene landing capturada (la página decide antes qué tema
 * pinta, y sin datos pinta la básica).
 */
export async function datosLanding() {
  const n = await cargarNegocioLanding();
  const d = n.landing;
  if (!d) throw new Error(`El negocio ${n.slug} no tiene landing capturada.`);
  const direccionUnaLinea = `${d.direccion.calle}, ${d.direccion.colonia}, ${d.direccion.cp} ${d.direccion.ciudad}, ${d.direccion.estado}`;
  const destino = encodeURIComponent(direccionUnaLinea);
  return {
    NOMBRE: n.nombre,
    URL_PUBLICA: (d.url_publica ?? urlDelNegocio(n)).replace(/\/$/, ""),
    TELEFONO_VISIBLE: d.telefono_visible,
    TELEFONO_SCHEMA: d.telefono_schema ?? d.telefono_visible,
    MENSAJES: d.mensajes,
    DIRECCION: d.direccion,
    DIRECCION_REFERENCIA: d.direccion_referencia ?? null,
    DIRECCION_UNA_LINEA: direccionUnaLinea,
    MAPA_EMBED: `https://maps.google.com/maps?q=${destino}&z=16&output=embed`,
    COMO_LLEGAR_GOOGLE: `https://www.google.com/maps/dir/?api=1&destination=${destino}`,
    COMO_LLEGAR_WAZE: `https://waze.com/ul?q=${destino}&navigate=yes`,
    HORARIO: d.horario,
    HORARIO_CERRADO: d.horario_cerrado ?? null,
    HORARIO_NOTA: d.horario_nota ?? null,
    PRECIO_KM_RECOLECCION: d.precio_km_recoleccion ?? null,
    RECOLECCION_REGLAS: d.recoleccion_reglas ?? [],
    ZONAS_COBERTURA: d.zonas_cobertura ?? [],
    GUARDERIA: d.guarderia ?? null,
    HOTEL: d.hotel ?? [],
    ESTETICA_INCLUYE: d.estetica?.incluye ?? [],
    ESTETICA_RAPADO_DIFERENCIA: d.estetica?.rapado_diferencia ?? "",
    ESTETICA_EXPRES_INCLUYE: d.estetica?.expres_incluye ?? "",
    ESTETICA_GRUPOS: d.estetica?.grupos ?? [],
    ESTETICA_POR_TALLA: d.estetica?.por_talla ?? [],
    ESTETICA_PELO_MALTRATADO: d.estetica?.pelo_maltratado ?? null,
    REQUISITOS: d.requisitos ?? [],
    TEXTOS: d.textos ?? {},
    SEO: d.seo ?? {},
    linkWhatsApp: (mensaje: string) => linkWhatsAppDe(d.telefono_wa, mensaje),
  };
}

/**
 * El WhatsApp del negocio de la petición para un mensaje (portal, páginas
 * de error). Sin landing capturada, null: quien lo usa no pinta el botón.
 */
export async function whatsAppDelNegocio(
  clave: keyof DatosLanding["mensajes"],
  respaldo: (nombre: string) => string
): Promise<string | null> {
  const n = await cargarNegocioLanding();
  if (!n.landing?.telefono_wa) return null;
  return linkWhatsAppDe(n.landing.telefono_wa, n.landing.mensajes[clave] ?? respaldo(n.nombre));
}

const fmt = new Intl.NumberFormat("es-MX", {
  style: "currency",
  currency: "MXN",
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

// "$1,950": sin ".00" en los redondos, con centavos si algún precio los
// llega a tener.
export function pesos(n: number) {
  return Number.isInteger(n) ? fmt.format(n) : fmt.format(n).replace(/(\.\d)$/, "$10");
}
