import { createHash } from "node:crypto";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hoyNegocio } from "@/lib/formato";
import { esHerramienta } from "./lista";

/**
 * Medición de las herramientas públicas (herramientas_eventos): visita, uso (la herramienta dio un resultado),
 * teléfono (dejó su WhatsApp) y cuenta (abrió su prueba gratis desde ahí). Solo el servidor escribe; la IP solo
 * en hash con el día; los robots y previsualizadores no cuentan. Nunca lanza.
 */
export type EventoHerramienta = "visita" | "uso" | "telefono" | "cuenta";
export type Origen = { fuente?: string | null; medio?: string | null; campana?: string | null; contenido?: string | null };

const NO_PERSONA = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|whatsapp|telegram|twitter|discord|linkedin|skype|curl|wget|python|node-fetch|axios|go-http|java\/|lighthouse|headless/i;

const limpio = (v: string | null | undefined, tope = 100) => (v ?? "").replace(/[^\p{L}\p{N} _.:+\-|/]/gu, "").trim().slice(0, tope) || null;

export function origenDeParametros(p: URLSearchParams | Record<string, string | undefined>): Origen {
  const g = (k: string) => (p instanceof URLSearchParams ? p.get(k) : p[k]) ?? null;
  return { fuente: limpio(g("utm_source")), medio: limpio(g("utm_medium")), campana: limpio(g("utm_campaign"), 150), contenido: limpio(g("utm_content"), 150) };
}

export async function registrarEventoHerramienta(e: {
  herramienta: string;
  evento: EventoHerramienta;
  origen?: Origen | null;
  giro?: string | null;
  ciudad?: string | null;
  ip?: string | null;
  navegador?: string | null;
  prospectoId?: string | null;
  negocioId?: string | null;
  /** Un evento del servidor (teléfono, cuenta) no depende del navegador. */
  sinFiltroNavegador?: boolean;
}): Promise<void> {
  try {
    if (!esHerramienta(e.herramienta)) return;
    if (!e.sinFiltroNavegador && (!e.navegador || NO_PERSONA.test(e.navegador))) return;
    const dia = hoyNegocio("America/Mexico_City");
    const ipHash = e.ip ? createHash("sha256").update(`${e.ip}|${dia}`).digest("hex").slice(0, 32) : null;
    const { error } = await createSupabaseAdminClient().from("herramientas_eventos").insert({
      herramienta: e.herramienta,
      evento: e.evento,
      fuente: e.origen?.fuente ?? null,
      medio: e.origen?.medio ?? null,
      campana: e.origen?.campana ?? null,
      contenido: e.origen?.contenido ?? null,
      giro: limpio(e.giro, 20),
      ciudad: limpio(e.ciudad, 80),
      ip_hash: ipHash,
      prospecto_id: e.prospectoId ?? null,
      negocio_id: e.negocioId ?? null,
    });
    if (error) console.error("[herramientas] evento", error.message);
  } catch (err) {
    console.error("[herramientas] evento", err instanceof Error ? err.message : err);
  }
}
