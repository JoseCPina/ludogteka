import { urlDelNegocio } from "@/lib/negocio/actual";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Lo que alimenta la landing de PeluDesk (peludesk.mx, src/app/peludesk).
 *
 * Las capturas son del negocio de DEMOSTRACIÓN (Patitas & Co., datos
 * inventados: scripts/demo/sembrar-demo.mjs) y se regeneran con
 * scripts/demo/capturas.mjs + scripts/demo/optimizar-capturas.mjs. Viven en
 * public/peludesk/capturas/<nombre>-escritorio.webp (1600 y 800 px de ancho)
 * y <nombre>-celular.webp (780 px).
 */
export const SLUG_DEMO = "patitasyco";

export function urlDemo(): string {
  return urlDelNegocio({ slug: SLUG_DEMO, dominio: null, url_publica: null });
}

/**
 * Ludogteka como caso real: vacío a propósito. Se llena (cita, quién la
 * dice, qué usan) SOLO cuando el dueño de PeluDesk confirme qué se puede
 * publicar. Mientras sea null, la sección no se pinta.
 */
export const CASO_REAL: { negocio: string; ciudad: string; cita: string; quien: string; usan: string[] } | null = null;

export type Captura = { nombre: string; alt: string; ancho: number; alto: number };

// Proporción de las capturas: escritorio 1280×800 (16:10), celular 390×844.
export const ESCRITORIO = { ancho: 1600, alto: 1000 };
export const CELULAR = { ancho: 780, alto: 1688 };

// Las redes de PeluDesk (28 de septiembre de 2026): el mismo usuario,
// «peludesk», en las tres. Si cambia una cuenta, se cambia aquí.
export const REDES_PELUDESK = [
  { red: "facebook", nombre: "Facebook", url: "https://www.facebook.com/peludesk" },
  { red: "instagram", nombre: "Instagram", url: "https://www.instagram.com/peludesk/" },
  { red: "tiktok", nombre: "TikTok", url: "https://www.tiktok.com/@peludesk" },
] as const;

/**
 * El WhatsApp de PeluDesk (ventas y soporte; lo atiende el bot de
 * src/lib/whatsapp). Sale de PELUDESK_WHATSAPP (10 dígitos o con 52) y SOLO
 * cuando el número ya contestó alguna vez (wa_config «whatsapp_contesta_desde»,
 * lo anota el bot al primer envío aceptado por Meta): mientras el número no
 * esté activo, null y los botones no se pintan. Solo en el servidor.
 */
export async function whatsappPeluDesk(mensaje?: string): Promise<string | null> {
  const tel = (process.env.PELUDESK_WHATSAPP ?? "").replace(/\D/g, "");
  if (tel.length < 10) return null;
  try {
    const { data } = await createSupabaseAdminClient()
      .from("wa_config")
      .select("id")
      .eq("clave", "whatsapp_contesta_desde")
      .is("deleted_at", null)
      .maybeSingle();
    if (!data) return null;
  } catch {
    return null;
  }
  const numero = tel.length === 10 ? `52${tel}` : tel;
  return `https://wa.me/${numero}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ""}`;
}
