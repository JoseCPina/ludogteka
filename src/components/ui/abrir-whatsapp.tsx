"use client";

import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { CampoCopiable } from "./campo-copiable";

/**
 * El botón «Abrir WhatsApp» de un link ya generado: un ENLACE de verdad (no un `<button>` metido en un `<a>`), así que
 * se abre con el toque en el celular y en la computadora. Con `enlace`, arriba va el link con «Copiar» para pegarlo a
 * mano; con `bloqueado` (el navegador no dejó abrir WhatsApp solo, ver `useAbrirEnlace`) lo dice.
 */
export function AbrirWhatsApp({
  href,
  enlace,
  bloqueado = false,
  texto = "Abrir WhatsApp",
  etiquetaEnlace,
  variante = "primario",
}: {
  href: string;
  /** El link que se le manda a la persona (lo que va dentro del mensaje), para copiarlo. */
  enlace?: string | null;
  bloqueado?: boolean;
  texto?: string;
  etiquetaEnlace?: string;
  variante?: "primario" | "secundario";
}) {
  const clases =
    variante === "primario"
      ? "bg-[#117a43] text-white hover:opacity-90"
      : "border-[1.5px] border-borde bg-white text-n-900 hover:bg-n-100";
  return (
    <div className="flex flex-col gap-2" data-abrir-whatsapp-panel data-bloqueado={bloqueado ? "si" : undefined}>
      {bloqueado && (
        <p role="status" className="text-sm font-semibold text-n-800">
          El navegador no dejó abrir WhatsApp solo. Toca «{texto}» o copia el link y pégalo en el chat.
        </p>
      )}
      {enlace && <CampoCopiable valor={enlace} etiqueta={etiquetaEnlace} textoBoton="Copiar" />}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        data-abrir-whatsapp
        className={`inline-flex min-h-12 items-center justify-center gap-2 self-start rounded-md px-5 text-base font-semibold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2 ${clases}`}
      >
        <WhatsappLogo size={18} weight="fill" aria-hidden />
        {texto}
      </a>
    </div>
  );
}
