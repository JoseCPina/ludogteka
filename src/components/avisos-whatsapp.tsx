import { mensajesAlCliente, type DatosPedido } from "@/lib/web-negocio/catalogo";
import { AvisosWhatsAppBotones } from "./avisos-whatsapp-botones";

/**
 * «Avisar por WhatsApp» en la cita de estética, la reserva de guardería u hotel y la agenda clínica: confirmación,
 * recordatorio y «ya puede pasar». Cada botón enseña el mensaje y abre WhatsApp con él ya escrito al teléfono del
 * cliente: la app no manda nada sola, quien atiende decide si lo manda. Son los mismos textos que enseña la página web
 * en modo demostración.
 */
export function AvisosWhatsApp({ telefono, datos }: { telefono: string | null | undefined; datos: DatosPedido }) {
  const tel = String(telefono ?? "").replace(/\D/g, "").slice(-10);
  if (tel.length !== 10) return null;
  const mensajes = mensajesAlCliente(datos)
    .filter((m) => !(datos.servicio.categoria === "veterinaria" && m.titulo.startsWith("Recordatorio")))
    .map((m) => ({ titulo: m.titulo, texto: m.texto, url: `https://wa.me/52${tel}?text=${encodeURIComponent(m.texto)}` }));
  return <AvisosWhatsAppBotones mensajes={mensajes} />;
}
