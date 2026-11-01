"use client";

import { useState } from "react";
import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { Enlace } from "@/components/ui/enlace";
import { Alternar } from "@/components/ui/alternar";

export type MensajeWhatsApp = { titulo: string; texto: string; url: string };

/**
 * QA S16 (N65): cada botón dice que abre WhatsApp con un mensaje real y, antes de abrirlo, enseña el mensaje. PeluDesk
 * no manda nada solo: se abre WhatsApp (en el celular o en la computadora) con el texto escrito y quien atiende lo envía.
 */
export function AvisosWhatsAppBotones({ mensajes, etiqueta = "Avisar por WhatsApp" }: { mensajes: MensajeWhatsApp[]; etiqueta?: string }) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const actual = mensajes.find((m) => m.titulo === abierto) ?? null;
  return (
    // QA N153: quedan abiertos con el negocio en solo lectura: solo enseñan el mensaje y abren WhatsApp, no guardan nada.
    <div data-avisos-whatsapp data-sin-bloqueo className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-n-700">{etiqueta}:</span>
        {mensajes.map((m) => (
          <Alternar key={m.titulo} type="button" data-aviso={m.titulo} aria-expanded={abierto === m.titulo} onClick={() => setAbierto(abierto === m.titulo ? null : m.titulo)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-md border-[1.5px] px-3 text-sm font-semibold hover:bg-n-100 ${abierto === m.titulo ? "border-morado bg-morado-suave text-morado" : "border-borde bg-white text-n-800"}`}>
            <WhatsappLogo size={16} weight="fill" className="text-[#117a43]" aria-hidden />
            {m.titulo}
          </Alternar>
        ))}
      </div>
      {actual && (
        <div data-vista-mensaje className="flex flex-col gap-2 rounded-md border border-n-200 bg-n-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-n-500">Este es el mensaje que se va a abrir en WhatsApp</p>
          <p className="whitespace-pre-line text-sm text-n-900 [overflow-wrap:anywhere]">{actual.texto}</p>
          <Enlace href={actual.url} target="_blank" rel="noopener noreferrer" data-abrir-whatsapp className="self-start">
            <WhatsappLogo size={16} weight="fill" aria-hidden />
            Abrir WhatsApp con este mensaje
          </Enlace>
          <p className="text-xs text-n-600">PeluDesk no lo manda solo: se abre WhatsApp con el mensaje escrito al número del cliente y tú lo envías.</p>
        </div>
      )}
    </div>
  );
}
