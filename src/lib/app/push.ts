import webpush from "web-push";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Notificaciones push de la app para dueños (Web Push con VAPID). Las llaves viven en el entorno (VAPID_PUBLIC_KEY,
 * VAPID_PRIVATE_KEY, VAPID_SUBJECT); la pública viaja a la pantalla para suscribir el celular. Una suscripción que el
 * navegador ya tiró (404/410) se da de baja sola; tras 5 fallos seguidos también.
 */
export type CargaPush = { titulo: string; cuerpo: string; url?: string | null; etiqueta?: string | null };

export function llavePublicaVapid(): string | null {
  return process.env.VAPID_PUBLIC_KEY || null;
}

function configurar(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:hola@peludesk.mx", pub, priv);
  return true;
}

export async function enviarPush(duenoId: string, carga: CargaPush): Promise<{ enviadas: number; quitadas: number }> {
  if (!configurar()) return { enviadas: 0, quitadas: 0 };
  const db = createSupabaseAdminClient();
  const { data: subs } = await db.from("app_push_suscripciones").select("id, endpoint, p256dh, auth, fallos").eq("dueno_id", duenoId).is("deleted_at", null);
  let enviadas = 0, quitadas = 0;
  const cuerpo = JSON.stringify({ titulo: carga.titulo, cuerpo: carga.cuerpo, url: carga.url ?? "/avisos", etiqueta: carga.etiqueta ?? undefined });
  await Promise.all(
    ((subs ?? []) as { id: string; endpoint: string; p256dh: string; auth: string; fallos: number }[]).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, cuerpo, { TTL: 86_400, urgency: "normal" });
        enviadas += 1;
        await db.from("app_push_suscripciones").update({ fallos: 0, ultimo_envio_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? 0;
        const muerta = status === 404 || status === 410 || s.fallos + 1 >= 5;
        quitadas += muerta ? 1 : 0;
        await db.from("app_push_suscripciones").update(muerta ? { deleted_at: new Date().toISOString(), fallos: s.fallos + 1 } : { fallos: s.fallos + 1 }).eq("id", s.id);
      }
    })
  );
  return { enviadas, quitadas };
}
