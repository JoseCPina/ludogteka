import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Notificaciones push de la app NATIVA (apps/duenos-movil): el celular registra su token de Expo (expo-notifications,
 * que por dentro usa FCM en Android y APNs en iOS) y el servidor le manda por el servicio de push de Expo.
 * Si el proyecto de Expo tiene activado «push seguro», el servidor manda EXPO_ACCESS_TOKEN (solo en Vercel/.env.local).
 * Un token que Expo da por muerto (DeviceNotRegistered) se da de baja; tras 5 fallos seguidos también.
 */
const URL_EXPO = "https://exp.host/--/api/v2/push/send";
const TOKEN_VALIDO = /^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/;

export type CargaPushNativa = { titulo: string; cuerpo: string; url?: string | null; etiqueta?: string | null };

/** Guarda (o reasigna a esta persona) el token del celular. El servidor ya comprobó la sesión. */
export async function registrarDispositivo(duenoId: string, o: { token: string; plataforma: string; modelo?: string | null; versionApp?: string | null }): Promise<{ error: string | null }> {
  if (!TOKEN_VALIDO.test(o.token)) return { error: "El celular no dio un permiso de notificaciones válido." };
  if (o.plataforma !== "android" && o.plataforma !== "ios") return { error: "Plataforma desconocida." };
  const db = createSupabaseAdminClient();
  const ahora = new Date().toISOString();
  const { error } = await db.from("app_push_dispositivos").upsert(
    { dueno_id: duenoId, token: o.token, plataforma: o.plataforma, modelo: o.modelo?.slice(0, 120) ?? null, version_app: o.versionApp?.slice(0, 40) ?? null, fallos: 0, deleted_at: null, created_by: duenoId, updated_at: ahora },
    { onConflict: "token" }
  );
  if (error) {
    console.error("[movil] registrar dispositivo", error.message);
    return { error: "No pudimos activar los avisos en este celular." };
  }
  return { error: null };
}

/** Al salir de la cuenta: ese celular deja de recibir los avisos de esta persona. */
export async function quitarDispositivo(duenoId: string, token: string): Promise<void> {
  if (!TOKEN_VALIDO.test(token)) return;
  await createSupabaseAdminClient().from("app_push_dispositivos").update({ deleted_at: new Date().toISOString() }).eq("token", token).eq("dueno_id", duenoId);
}

export async function contarDispositivos(duenoId: string): Promise<number> {
  const { count } = await createSupabaseAdminClient().from("app_push_dispositivos").select("id", { count: "exact", head: true }).eq("dueno_id", duenoId).is("deleted_at", null);
  return count ?? 0;
}

export async function enviarPushNativo(duenoId: string, carga: CargaPushNativa): Promise<{ enviadas: number; quitadas: number }> {
  const db = createSupabaseAdminClient();
  const { data } = await db.from("app_push_dispositivos").select("id, token, fallos").eq("dueno_id", duenoId).is("deleted_at", null);
  const dispositivos = (data ?? []) as { id: string; token: string; fallos: number }[];
  if (dispositivos.length === 0) return { enviadas: 0, quitadas: 0 };
  const mensajes = dispositivos.map((d) => ({
    to: d.token,
    title: carga.titulo,
    body: carga.cuerpo,
    sound: "default",
    channelId: carga.etiqueta === "alerta" || carga.etiqueta === "perdida" ? "alertas" : "avisos",
    priority: "high",
    data: { url: carga.url ?? "/avisos", etiqueta: carga.etiqueta ?? null },
  }));
  let tickets: { status?: string; details?: { error?: string } }[] = [];
  try {
    const r = await fetch(URL_EXPO, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...(process.env.EXPO_ACCESS_TOKEN ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) },
      body: JSON.stringify(mensajes),
      signal: AbortSignal.timeout(10_000),
    });
    const cuerpo = (await r.json().catch(() => null)) as { data?: typeof tickets } | null;
    tickets = Array.isArray(cuerpo?.data) ? cuerpo.data : [];
    if (!r.ok) console.error("[movil] push expo", r.status);
  } catch (e) {
    console.error("[movil] push expo", e instanceof Error ? e.message : e);
  }
  let enviadas = 0, quitadas = 0;
  await Promise.all(
    dispositivos.map(async (d, i) => {
      const t = tickets[i];
      if (t?.status === "ok") {
        enviadas += 1;
        await db.from("app_push_dispositivos").update({ fallos: 0, ultimo_envio_at: new Date().toISOString() }).eq("id", d.id);
        return;
      }
      const muerto = t?.details?.error === "DeviceNotRegistered" || d.fallos + 1 >= 5;
      quitadas += muerto ? 1 : 0;
      await db.from("app_push_dispositivos").update(muerto ? { deleted_at: new Date().toISOString(), fallos: d.fallos + 1 } : { fallos: d.fallos + 1 }).eq("id", d.id);
    })
  );
  return { enviadas, quitadas };
}
