/**
 * Mandar un SMS. Proveedor: Twilio (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_SMS_FROM, solo en Vercel). Sin esas
 * variables no hay SMS: `haySms()` lo dice y las pantallas no lo ofrecen. Fuera de producción, SMS_API_URL apunta a un
 * doble de pruebas (scripts/auditoria/app-entrada-codigo-dev.mjs).
 */
const doble = () => (process.env.VERCEL_ENV !== "production" ? process.env.SMS_API_URL?.trim().replace(/\/$/, "") || null : null);

export function haySms(): boolean {
  return Boolean(doble() || (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_SMS_FROM));
}

export async function enviarSms(telefonoE164: string, texto: string): Promise<{ ok: boolean; error?: string }> {
  if (!haySms()) return { ok: false, error: "sin proveedor" };
  const sid = process.env.TWILIO_ACCOUNT_SID ?? "doble";
  const base = doble() ?? "https://api.twilio.com";
  try {
    const r = await fetch(`${base}/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN ?? "doble"}`).toString("base64")}`,
      },
      body: new URLSearchParams({ To: telefonoE164, From: process.env.TWILIO_SMS_FROM ?? "PeluDesk", Body: texto }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) {
      console.error("[sms]", r.status);
      return { ok: false, error: `estado ${r.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[sms]", e instanceof Error ? e.message : e);
    return { ok: false, error: "sin respuesta" };
  }
}
