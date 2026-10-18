import { Checks, WhatsappLogo } from "@phosphor-icons/react/dist/ssr";

/**
 * Cómo se ven en el celular del cliente los mensajes que le manda el negocio. Solo muestra: no manda nada.
 * Sin hooks: lo usan la página (servidor) y el flujo de pedir cita (cliente).
 */
export function ChatWhatsApp({ negocio, mensajes }: { negocio: string; mensajes: { titulo: string; cuando: string; texto: string }[] }) {
  return (
    <figure data-chat-whatsapp className="mx-auto w-full max-w-[380px] overflow-hidden rounded-[22px] border border-black/10 bg-[#efeae2] shadow-[0_18px_40px_-20px_rgba(0,0,0,.45)]">
      <figcaption className="flex items-center gap-2.5 bg-[#075e54] px-4 py-3 text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15" aria-hidden>
          <WhatsappLogo size={20} weight="fill" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold leading-tight">{negocio}</span>
          <span className="block text-xs text-white/75">Cuenta de empresa</span>
        </span>
      </figcaption>
      <ol className="flex flex-col gap-2.5 px-3 py-4">
        {mensajes.map((m) => (
          <li key={m.titulo} className="max-w-[88%]">
            <p className="mb-1 pl-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#54656f]">
              {m.titulo} · {m.cuando}
            </p>
            <div className="relative rounded-[10px] rounded-tl-[2px] bg-white px-3 py-2 text-[14.5px] leading-snug text-[#111b21] shadow-[0_1px_0.5px_rgba(0,0,0,.13)]">
              {m.texto}
              <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-[#667781]">
                10:3{mensajes.indexOf(m)} a.m. <Checks size={14} weight="bold" className="text-[#53bdeb]" aria-label="Leído" />
              </span>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  );
}
