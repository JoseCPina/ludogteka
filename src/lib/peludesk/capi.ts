import { createHash } from "node:crypto";

/**
 * API de conversiones de Meta: el mismo evento que el píxel manda desde el
 * navegador, ahora desde el servidor y con el MISMO event_id, para que Meta
 * los cuente como uno solo (deduplicación).
 *
 * Solo hoy para CompleteRegistration, y SOLO si la persona aceptó la categoría
 * de marketing (quien llama lo comprueba con la cookie de consentimiento):
 *  · el teléfono va con hash SHA-256 (nunca en claro), y no se manda nombre,
 *    negocio, ciudad ni nada que identifique al negocio o a sus clientes;
 *  · Meta exige la IP y el navegador sin hash para poder emparejar, y las
 *    cookies _fbp/_fbc que el propio píxel puso en el navegador.
 * Una falla aquí nunca rompe el registro: se anota en los logs y ya.
 *
 * Variables (Vercel, sensitive): PELUDESK_META_PIXEL_ID y
 * PELUDESK_META_CAPI_TOKEN. Fuera de producción, META_API_URL apunta a un
 * doble local (igual que src/lib/redes/meta.ts).
 */
const VERSION = "v25.0";

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/** 10 dígitos de México → 52 + 10, sin signos, como lo pide Meta antes del hash. */
export function telefonoParaMeta(telefono: string): string {
  const d = telefono.replace(/\D/g, "");
  return d.length === 10 ? `52${d}` : d;
}

export type EventoConversion = {
  nombre: "CompleteRegistration";
  eventId: string;
  url: string;
  ip: string | null;
  userAgent: string | null;
  fbp: string | null;
  fbc: string | null;
  telefono: string | null;
  contenido: string;
};

export function cuerpoDeConversion(e: EventoConversion, ahora = Math.floor(Date.now() / 1000)) {
  return {
    data: [
      {
        event_name: e.nombre,
        event_time: ahora,
        event_id: e.eventId,
        event_source_url: e.url,
        action_source: "website",
        user_data: {
          ...(e.ip ? { client_ip_address: e.ip } : {}),
          ...(e.userAgent ? { client_user_agent: e.userAgent } : {}),
          ...(e.fbp ? { fbp: e.fbp } : {}),
          ...(e.fbc ? { fbc: e.fbc } : {}),
          ...(e.telefono ? { ph: [sha256(telefonoParaMeta(e.telefono))] } : {}),
        },
        custom_data: { content_name: e.contenido },
      },
    ],
  };
}

export async function enviarConversion(e: EventoConversion): Promise<boolean> {
  const pixel = process.env.PELUDESK_META_PIXEL_ID?.trim();
  const token = process.env.PELUDESK_META_CAPI_TOKEN?.trim();
  if (!pixel || !token) return false;
  const base = (process.env.VERCEL_ENV !== "production" ? process.env.META_API_URL?.trim().replace(/\/$/, "") : null) || "https://graph.facebook.com";
  try {
    const r = await fetch(`${base}/${VERSION}/${pixel}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(cuerpoDeConversion(e)),
      signal: AbortSignal.timeout(8_000),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      console.error("[capi] Meta respondió", r.status, t.slice(0, 300));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[capi] no se pudo enviar", err instanceof Error ? err.message : err);
    return false;
  }
}
