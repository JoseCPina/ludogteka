import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // AVIF primero: en las fotos de la landing pesa ~40% menos que WebP, y
  // la landing se abre sobre todo desde el celular (link por WhatsApp).
  images: { formats: ["image/avif", "image/webp"], qualities: [60, 75] },
  // Las capturas que el bot de WhatsApp sube a Meta se leen del disco en la
  // función del webhook (src/lib/whatsapp/infra.ts, bytesCaptura).
  outputFileTracingIncludes: { "/api/whatsapp/webhook": ["./public/peludesk/whatsapp/*.jpg"] },
  // Los videos de producto para redes (scripts/videos) son para subirlos a
  // Reels, TikTok o YouTube, no para que un buscador los indexe desde aquí.
  async headers() {
    return [{ source: "/peludesk/redes/:ruta*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  async redirects() {
    return [
      // La sección "Agenda" pasó a llamarse "Estética" y se movió de /agenda
      // a /estetica. Estos redirects son para el staff que ya tenía la
      // pantalla en favoritos o abierta en otra pestaña: sin ellos, un
      // enlace guardado a la cita de un perro daría 404 justo el día del
      // cambio. `permanent: false` a propósito — si mañana se decide otra
      // estructura, un 308 ya cacheado en el navegador sería difícil de
      // desandar.
      { source: "/agenda", destination: "/estetica", permanent: false },
      { source: "/agenda/:ruta*", destination: "/estetica/:ruta*", permanent: false },

      // "Reservas" se dividió en Guardería y Hotel. /reservas sigue siendo
      // una página real (explica la división y es el "volver" de una
      // reserva que mezcla las dos categorías), así que aquí solo se
      // redirigen las subrutas que sí desaparecieron.
      //
      // Todas caen en /reservas y no en un módulo concreto a propósito:
      // "check-in" o "nueva reserva" ya no significan nada por sí solos
      // sin decir de qué servicio. Mandarlas a Guardería por default
      // acertaría la mitad de las veces y la otra mitad metería a
      // recepción en el módulo equivocado sin que se dé cuenta.
      { source: "/reservas/checkin", destination: "/reservas", permanent: false },
      { source: "/reservas/checkin/walkin", destination: "/reservas", permanent: false },
      { source: "/reservas/checkout", destination: "/reservas", permanent: false },
      { source: "/reservas/nueva", destination: "/reservas", permanent: false },
      { source: "/reservas/series", destination: "/reservas", permanent: false },
      { source: "/reservas/series/nueva", destination: "/reservas", permanent: false },
    ];
  },
};

export default nextConfig;
