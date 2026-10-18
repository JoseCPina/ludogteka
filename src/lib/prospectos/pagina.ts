import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { EMPRESA } from "@/lib/peludesk/legal";
import type { DatosPagina } from "@/components/pagina-negocio";

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
};

export async function prospectoPorSlug(slug: string): Promise<ProspectoPagina | null> {
  if (!/^[a-z0-9-]{3,60}$/.test(slug)) return null;
  const { data } = await createSupabaseAdminClient()
    .from("prospectos")
    .select("id, slug, nombre, giro, ciudad, direccion, telefono_norm, google_place_id, clasificacion")
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

const CATALOGO: Record<string, DatosPagina["servicios"]> = {
  guarderia: [
    { categoria: "guarderia", nombre: "Guardería por día", unidad: "dia", incluye: ["juego y socialización", "reporte del día con fotos"], no_incluye: null, precios: null },
    { categoria: "bono", nombre: "Paquetes de días y mensualidad", unidad: "dia", incluye: null, no_incluye: null, precios: null },
  ],
  hotel: [{ categoria: "hotel", nombre: "Hospedaje por noche", unidad: "noche", incluye: ["paseos y juego", "fotos durante su estancia"], no_incluye: null, precios: null }],
  estetica: [
    { categoria: "estetica", nombre: "Baño completo", unidad: "servicio", incluye: ["baño", "secado", "corte de uñas", "limpieza de oídos"], no_incluye: null, precios: null },
    { categoria: "estetica", nombre: "Corte de pelo", unidad: "servicio", incluye: ["baño", "corte según la raza"], no_incluye: null, precios: null },
  ],
  veterinaria: [
    { categoria: "veterinaria", nombre: "Consulta general", unidad: "servicio", incluye: null, no_incluye: null, precios: null },
    { categoria: "veterinaria", nombre: "Vacunación y desparasitación", unidad: "servicio", incluye: ["carnet de vacunas con recordatorio de la próxima dosis"], no_incluye: null, precios: null },
  ],
};
export const serviciosDePagina = (servicios: string[]) => servicios.flatMap((s) => CATALOGO[s] ?? []);

export const NOMBRE_SERVICIO: Record<string, string> = { guarderia: "guardería", hotel: "hotel", estetica: "estética", veterinaria: "veterinaria" };

/** Un color estable por negocio para la vista previa (no es su marca: ellos lo escogerían en PeluDesk). */
export function colorDe(slug: string): string {
  const paleta = ["#4b3f72", "#2f6f73", "#7a4b2a", "#3c5a99", "#7b3f61", "#2e6b45", "#8a5a14"];
  const h = [...slug].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
  return paleta[h % paleta.length];
}

// Previsualizadores de links (WhatsApp, Telegram, Facebook…) y robots no cuentan como visita.
const NO_PERSONA = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|twitter|discord|linkedin|skype|curl|wget|python|node-fetch|axios|go-http|java\//i;

export async function registrarVisita(o: { slug: string; tipo: "visita" | "clic_prueba" | "clic_whatsapp"; ip: string | null; navegador: string | null; interno?: boolean }) {
  if (o.interno || !o.navegador || NO_PERSONA.test(o.navegador)) return;
  const dia = new Date().toISOString().slice(0, 10);
  const ipHash = o.ip ? createHash("sha256").update(`${o.ip}|${dia}`).digest("hex").slice(0, 32) : null;
  const { error } = await createSupabaseAdminClient().rpc("prospecto_registrar_visita", { p_slug: o.slug, p_tipo: o.tipo, p_ip_hash: ipHash, p_navegador: o.navegador });
  if (error) console.error("[prospectos] visita", error.message);
}

/** El WhatsApp de ventas: PELUDESK_VENTAS_WHATSAPP o, por ahora, el de contacto de PeluDesk. */
export function whatsappVentas(nombreNegocio: string): string {
  const tel = (process.env.PELUDESK_VENTAS_WHATSAPP ?? EMPRESA.telefono).replace(/\D/g, "");
  const numero = tel.length === 10 ? `52${tel}` : tel;
  return `https://wa.me/${numero}?text=${encodeURIComponent(`Hola, vi la vista previa de ${nombreNegocio} en PeluDesk y quiero saber más.`)}`;
}
