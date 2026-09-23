import type { Metadata } from "next";
import { Encabezado } from "@/components/landing/encabezado";
import { FranjaConfianza, Hero } from "@/components/landing/hero";
import { Guarderia } from "@/components/landing/guarderia";
import { Hotel } from "@/components/landing/hotel";
import { Estetica } from "@/components/landing/estetica";
import { Logistica } from "@/components/landing/logistica";
import { LlamadoFinal, Pie, Requisitos, WhatsAppFlotante } from "@/components/landing/cierre";
import {
  DIRECCION,
  GUARDERIA,
  HORARIO_GUARDERIA,
  TELEFONO_VISIBLE,
  URL_PUBLICA,
} from "@/lib/landing/negocio";
import "@/components/landing/landing.css";

// La raíz es la landing pública del negocio: estática, sin sesión y sin
// consultar la base. El acceso al sistema es el botón "Entrar" (/login,
// que ya manda a cada quien a su zona si tiene sesión).

const TITULO = "Ludogteka | Guardería, hotel y estética canina en San Luis Potosí";
const DESCRIPCION = `Guardería de ${HORARIO_GUARDERIA.dias.toLowerCase()} desde $${GUARDERIA.ocasionalHora} la hora, hotel por noche y estética canina en SLP. Videovigilancia de circuito cerrado 24/7. Escríbenos por WhatsApp: ${TELEFONO_VISIBLE}.`;

export const metadata: Metadata = {
  title: { absolute: TITULO },
  description: DESCRIPCION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_MX",
    url: "/",
    siteName: "Ludogteka",
    title: "Ludogteka: guardería, hotel y estética canina",
    description:
      "Tu perro juega, descansa y sale guapo. Vigilado 24/7 con circuito cerrado en San Luis Potosí.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ludogteka: guardería, hotel y estética canina",
    description: "Tu perro juega, descansa y sale guapo. Vigilado 24/7 en San Luis Potosí.",
  },
};

const DATOS_ESTRUCTURADOS = {
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "@id": `${URL_PUBLICA}/#negocio`,
  name: "Ludogteka",
  description: "Guardería, hotel y estética canina en San Luis Potosí.",
  url: URL_PUBLICA,
  telephone: "+52 444 234 1355",
  image: `${URL_PUBLICA}/opengraph-image.jpg`,
  priceRange: "$$",
  address: {
    "@type": "PostalAddress",
    streetAddress: DIRECCION.calle,
    addressLocality: DIRECCION.ciudad,
    addressRegion: DIRECCION.estado,
    postalCode: DIRECCION.cp,
    addressCountry: "MX",
  },
  openingHoursSpecification: [
    {
      "@type": "OpeningHoursSpecification",
      dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
      opens: "09:00",
      closes: "19:00",
    },
  ],
};

export default function Landing() {
  return (
    <div className="lp flex min-h-full flex-col bg-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DATOS_ESTRUCTURADOS) }}
      />
      <Encabezado />
      <main className="flex-1">
        <Hero />
        <FranjaConfianza />
        <Guarderia />
        <Hotel />
        <Estetica />
        <Logistica />
        <Requisitos />
        <LlamadoFinal />
      </main>
      <Pie />
      <WhatsAppFlotante />
    </div>
  );
}
