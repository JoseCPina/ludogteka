import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

// La página personalizada de un prospecto (peludesk.mx/para/<slug>). Lo NUESTRO (nombre, giro, ciudad, slug) sale
// del CRM; lo de Google (fotos, horario, calificación) se pide al mostrarla y no se guarda.

export type ProspectoPagina = {
  id: string;
  slug: string;
  nombre: string;
  giro: string;
  ciudad: string;
  direccion: string | null;
  telefono_norm: string | null;
  google_place_id: string | null;
  clasificacion: { servicios?: string[] } | null;
  fuente?: string | null;
};

export async function prospectoPorSlug(slug: string): Promise<ProspectoPagina | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const { data } = await createSupabaseAdminClient()
    .from("prospectos")
    .select("id, slug, nombre, giro, ciudad, direccion, telefono_norm, google_place_id, clasificacion, fuente")
    .eq("slug", slug)
    .is("deleted_at", null)
    .maybeSingle();
  return (data as ProspectoPagina | null) ?? null;
}

/** Los servicios que se le infieren: los que detectó la clasificación, o los de su giro. */
export function serviciosDe(p: Pick<ProspectoPagina, "giro" | "clasificacion">): string[] {
  const s = (p.clasificacion?.servicios ?? []).filter((x) => ["guarderia", "hotel", "estetica", "veterinaria"].includes(x));
  if (s.length) return s;
  return p.giro === "mixto" ? ["guarderia", "hotel"] : [p.giro];
}

// Previsualizadores de links (WhatsApp, Telegram, Facebook…) y robots no cuentan como visita.
const NO_PERSONA = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|twitter|discord|linkedin|skype|curl|wget|python|node-fetch|axios|go-http|java\//i;

export async function registrarVisita(o: { slug: string; tipo: "visita" | "clic_prueba" | "clic_whatsapp" | "clic_demo"; ip: string | null; navegador: string | null; interno?: boolean }) {
  if (o.interno || !o.navegador || NO_PERSONA.test(o.navegador)) return;
  const dia = new Date().toISOString().slice(0, 10);
  const ipHash = o.ip ? createHash("sha256").update(`${o.ip}|${dia}`).digest("hex").slice(0, 32) : null;
  const { error } = await createSupabaseAdminClient().rpc("prospecto_registrar_visita", { p_slug: o.slug, p_tipo: o.tipo, p_ip_hash: ipHash, p_navegador: o.navegador });
  if (error) console.error("[prospectos] visita", error.message);
}

/** La referencia de un prospecto en el mensaje prellenado: los 5 caracteres al azar del final de su slug. */
export const refDeSlug = (slug: string) => slug.slice(-5);

/** Número de ventas en frío (WhatsApp Business a mano): el de «Hablar por WhatsApp» mientras el bot no lo reemplace. */
export const WHATSAPP_VENTAS_FRIO = "524443103236";

function numeroVentas(): string {
  const tel = (process.env.PELUDESK_VENTAS_WHATSAPP?.trim() || WHATSAPP_VENTAS_FRIO).replace(/\D/g, "");
  return tel.length === 10 ? `52${tel}` : tel;
}

/**
 * «Hablar por WhatsApp» de la página de un prospecto: PELUDESK_VENTAS_WHATSAPP (el número del bot, si está puesto)
 * o el de ventas en frío. El mensaje dice de qué negocio viene y lleva su referencia: el bot la lee
 * (prospecto_registrar_whatsapp) y el CRM lo marca «respondió».
 */
export function whatsappVentas(nombreNegocio: string, slug: string): string {
  return `https://wa.me/${numeroVentas()}?text=${encodeURIComponent(`Hola, vi la página que armaron para ${nombreNegocio} (ref. ${refDeSlug(slug)})`)}`;
}

/** El «escríbenos y la quitamos» del pie de la vista previa: WhatsApp de PeluDesk con la petición ya escrita. */
export function whatsappQuitarPagina(nombreNegocio: string, slug: string): string {
  return `https://wa.me/${numeroVentas()}?text=${encodeURIComponent(`Hola, quiero que quiten la página de muestra de ${nombreNegocio} (ref. ${refDeSlug(slug)}).`)}`;
}
