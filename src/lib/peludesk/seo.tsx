import type { Metadata } from "next";
import { REDES_PELUDESK } from "@/lib/peludesk/landing";
import { EMPRESA } from "@/lib/peludesk/legal";

/**
 * SEO de peludesk.mx: el host canónico es UNO (https://peludesk.mx; www
 * redirige en el middleware) y toda página pública se describe con metaPagina
 * para que title, descripción, canonical, Open Graph y robots salgan iguales.
 * El resto de la plataforma (/plataforma, /demo, /api) sigue en noindex.
 */
export const SITIO = "https://peludesk.mx";
export const IMAGEN_SOCIAL = { url: "/peludesk/capturas/tablero-escritorio-1600.webp", width: 1600, height: 1000 };

type Opciones = {
  titulo: string;
  descripcion: string;
  ruta: string;
  imagen?: { url: string; width?: number; height?: number; alt?: string };
  tipo?: "website" | "article";
  publicado?: string;
  actualizado?: string;
  seccion?: string;
  indexar?: boolean;
};

export function metaPagina(o: Opciones): Metadata {
  const imagen = o.imagen ?? IMAGEN_SOCIAL;
  return {
    metadataBase: new URL(SITIO),
    title: { absolute: o.titulo },
    description: o.descripcion,
    alternates: { canonical: o.ruta },
    robots: o.indexar === false ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title: o.titulo,
      description: o.descripcion,
      url: o.ruta,
      siteName: "PeluDesk",
      locale: "es_MX",
      type: o.tipo ?? "website",
      images: [imagen],
      ...(o.tipo === "article"
        ? { publishedTime: o.publicado, modifiedTime: o.actualizado ?? o.publicado, section: o.seccion, authors: ["PeluDesk"] }
        : {}),
    },
    twitter: { card: "summary_large_image", title: o.titulo, description: o.descripcion, images: [imagen.url] },
  };
}

export const ORGANIZACION = {
  "@type": "Organization",
  "@id": `${SITIO}/#organizacion`,
  name: "PeluDesk",
  url: SITIO,
  logo: `${SITIO}/marca/peludesk/favicon-180.png`,
  legalName: EMPRESA.razonSocial,
  email: "contacto@peludesk.mx",
  areaServed: "MX",
  knowsLanguage: "es-MX",
  // Ventas y soporte: por WhatsApp (bot las 24 horas y una persona el mismo día en horario hábil). El correo es para privacidad y temas legales.
  contactPoint: { "@type": "ContactPoint", contactType: "ventas y soporte", telephone: "+52-56-4916-0742", url: "https://wa.me/525649160742", areaServed: "MX", availableLanguage: "es" },
  sameAs: REDES_PELUDESK.map((r) => r.url),
};

/** La organización como documento propio (la raíz de la gráfica de datos). */
export const ORGANIZACION_RAIZ = { "@context": "https://schema.org", ...ORGANIZACION };

export function JsonLd({ datos }: { datos: unknown }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, "\\u003c") }} />;
}

export function migas(items: { nombre: string; ruta: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.nombre, item: `${SITIO}${it.ruta}` })),
  };
}

export function preguntasFrecuentes(preguntas: readonly (readonly [string, string])[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: "es-MX",
    mainEntity: preguntas.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

/** El producto con su oferta única; sale del plan de la base (nunca una cifra escrita aquí). */
export function aplicacionPeluDesk(plan: { nombre: string; mensual: number } | null, extra: { nombre?: string; url?: string; descripcion?: string } = {}) {
  const url = extra.url ?? SITIO;
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${SITIO}/#aplicacion`,
    name: extra.nombre ?? "PeluDesk",
    url,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web, iOS y Android (se instala desde el navegador)",
    inLanguage: "es-MX",
    description:
      extra.descripcion ??
      "Software en español para clínicas veterinarias, guarderías, hoteles y estéticas caninas en México: reservas, caja, contratos, portal para dueños, recordatorios y facturación CFDI.",
    publisher: { "@id": `${SITIO}/#organizacion` },
    ...(plan
      ? {
          offers: [
            {
              "@type": "Offer",
              name: `${plan.nombre}, plan único`,
              price: plan.mensual,
              priceCurrency: "MXN",
              priceSpecification: { "@type": "UnitPriceSpecification", price: plan.mensual, priceCurrency: "MXN", billingDuration: 1, unitCode: "MON", valueAddedTaxIncluded: false },
              description: "Más IVA. Sin costo inicial. Incluye todos los módulos.",
              availability: "https://schema.org/InStock",
              url: `${SITIO}/precios`,
            },
            { "@type": "Offer", name: "Prueba gratis de 15 días", price: 0, priceCurrency: "MXN", description: "15 días con todo abierto, sin tarjeta.", availability: "https://schema.org/InStock", url: `${SITIO}/registro` },
          ],
        }
      : {}),
  };
}

export function sitioWeb() {
  return { "@context": "https://schema.org", "@type": "WebSite", "@id": `${SITIO}/#sitio`, url: SITIO, name: "PeluDesk", inLanguage: "es-MX", publisher: { "@id": `${SITIO}/#organizacion` } };
}
