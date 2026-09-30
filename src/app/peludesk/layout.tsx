import { cookies } from "next/headers";
import { ConsentimientoCookies } from "@/components/peludesk/consentimiento/consentimiento";
import { COOKIE_CONSENTIMIENTO, leerConsentimiento } from "@/lib/peludesk/cookies";
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
  const jar = await cookies();
  const inicial = leerConsentimiento(jar.get(COOKIE_CONSENTIMIENTO)?.value);
  const pixelId = process.env.PELUDESK_META_PIXEL_ID?.trim() || null;
  return (
    <>
      {/* Antes que el resto, para que el teclado llegue primero al aviso. */}
      <ConsentimientoCookies inicial={inicial} pixelId={pixelId} />
      {children}
    </>
  );
}
