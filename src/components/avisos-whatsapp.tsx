import { WhatsappLogo } from "@phosphor-icons/react/dist/ssr";
import { mensajesAlCliente, type DatosPedido } from "@/lib/web-negocio/catalogo";

/**
 * «Avisar por WhatsApp» en la cita de estética y en la reserva de guardería u hotel: confirmación, recordatorio y
 * «ya puede pasar», cada uno abre WhatsApp con el mensaje ya escrito al teléfono del cliente. La app no manda nada
 * sola: quien atiende decide si lo manda. Son los mismos textos que enseña la página web en modo demostración.
 */
export function AvisosWhatsApp({ telefono, datos }: { telefono: string | null | undefined; datos: DatosPedido }) {
  const tel = String(telefono ?? "").replace(/\D/g, "").slice(-10);
  if (tel.length !== 10) return null;
  const mensajes = mensajesAlCliente(datos).filter((m) => !(datos.servicio.categoria === "veterinaria" && m.titulo.startsWith("Recordatorio")));
  return (
    <div data-avisos-whatsapp className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-n-700">Avisar por WhatsApp:</span>
      {mensajes.map((m) => (
        <a
          key={m.titulo}
          href={`https://wa.me/52${tel}?text=${encodeURIComponent(m.texto)}`}
          target="_blank"
          rel="noopener noreferrer"
          data-aviso={m.titulo}
          title={m.texto}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-md border-[1.5px] border-borde bg-white px-3 text-sm font-semibold text-n-800 hover:bg-n-100"
        >
          <WhatsappLogo size={16} weight="fill" className="text-[#117a43]" aria-hidden />
          {m.titulo}
        </a>
      ))}
    </div>
  );
}
