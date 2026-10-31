import { cookies, headers } from "next/headers";
import { ConsentimientoCookies } from "@/components/peludesk/consentimiento/consentimiento";
import { COOKIE_CONSENTIMIENTO, leerConsentimiento } from "@/lib/peludesk/cookies";
import { BotonWhatsApp } from "@/components/peludesk/boton-whatsapp";
import { whatsappPeluDesk } from "@/lib/peludesk/landing";
import "./peludesk.css";

/**
 * Todo lo que se sirve en peludesk.mx (landing, registro, ayuda, blog y
 * páginas legales) pasa por aquí: el aviso de cookies y lo que mide solo
 * existen en este dominio (en el de un negocio estas rutas dan 404).
 *
 * PELUDESK_META_PIXEL_ID (variable del servidor, sin NEXT_PUBLIC): sin ella no
 * hay píxel aunque alguien acepte «Marketing».
 */
export default async function PeluDeskLayout({ children }: { children: React.ReactNode }) {
  // La vista previa de un prospecto (/para/<slug>) es SU página: sin aviso de cookies, sin píxel ni analítica
  // (sus visitas se cuentan en el CRM, del lado del servidor) y sin el botón flotante de PeluDesk.
  if ((await headers()).get("x-peludesk-ruta")?.startsWith("/para/")) return <>{children}</>;
  const jar = await cookies();
  const inicial = leerConsentimiento(jar.get(COOKIE_CONSENTIMIENTO)?.value);
  const whatsapp = await whatsappPeluDesk("Hola, quiero saber más de PeluDesk.");
  const pixelId = process.env.PELUDESK_META_PIXEL_ID?.trim() || null;
  // GOOGLE_ADS_ID (AW-…): vacía hasta que exista la cuenta; el hueco del tag ya está listo (gads-cliente.ts).
  const googleAdsId = process.env.GOOGLE_ADS_ID?.trim() || null;
  return (
    <>
      {/* Antes que el resto, para que el teclado llegue primero al aviso. */}
      <ConsentimientoCookies inicial={inicial} pixelId={pixelId} googleAdsId={googleAdsId} />
      {children}
      {whatsapp && <BotonWhatsApp href={whatsapp} />}
    </>
  );
}
