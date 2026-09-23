import type { Metadata } from "next";
import { Fredoka } from "next/font/google";
import { Encabezado } from "@/components/landing/encabezado";
import { Hero } from "@/components/landing/hero";
import { Servicios } from "@/components/landing/servicios";
import { BandaPerritos } from "@/components/landing/comunes";
import { Guarderia } from "@/components/landing/guarderia";
import { Hotel } from "@/components/landing/hotel";
import { Estetica } from "@/components/landing/estetica";
import { Recoleccion } from "@/components/landing/recoleccion";
import { Patio } from "@/components/landing/patio";
import { Requisitos } from "@/components/landing/requisitos";
import { Ubicacion } from "@/components/landing/ubicacion";
import { LlamadoFinal, Pie, WhatsAppFlotante } from "@/components/landing/cierre";
import { patronHuesos } from "@/components/landing/patron";
import {
  DIRECCION,
  GUARDERIA,
  HORARIO,
  TELEFONO_VISIBLE,
  URL_PUBLICA,
} from "@/lib/landing/negocio";
import "@/components/landing/landing.css";

// La raíz es la landing pública del negocio: estática, sin sesión y sin
// consultar la base. El acceso al sistema es el botón "Entrar" (/login,
// que ya manda a cada quien a su zona si tiene sesión).

// Letra redonda y gruesa para títulos, como la de la rotulación de la
// camioneta. Solo la carga la landing; la app sigue con Nunito.
const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

// Los patrones de huesos y huellas de las franjas, con el tono un poco más
// oscuro que el fondo, como en la lona.
const PATRONES = {
  "--lp-patron-turquesa": patronHuesos("#2cb5b1"),
  "--lp-patron-amarillo": patronHuesos("#f0bb24"),
} as React.CSSProperties;

const TITULO = "Ludogteka | Guardería, hotel y estética canina en San Luis Potosí";
const DESCRIPCION = `Guardería de lunes a sábado desde $${GUARDERIA.ocasionalHora} la hora, hotel por noche y estética canina en SLP. Monitoreo 24 horas. Escríbenos por WhatsApp: ${TELEFONO_VISIBLE}.`;

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
      "Tu perro juega, descansa y sale guapo. Monitoreo 24 horas en San Luis Potosí.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ludogteka: guardería, hotel y estética canina",
    description: "Tu perro juega, descansa y sale guapo. Monitoreo 24 horas en San Luis Potosí.",
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
  openingHoursSpecification: HORARIO.map((h) => ({
    "@type": "OpeningHoursSpecification",
    dayOfWeek: h.schema,
    opens: h.abre,
    closes: h.cierra,
  })),
};

export default function Landing() {
  return (
    <div className={`lp ${fredoka.variable} flex min-h-full flex-col bg-[var(--lp-crema)]`} style={PATRONES}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(DATOS_ESTRUCTURADOS) }}
      />
      <Encabezado />
      <main className="flex-1">
        <Hero />
        <Servicios />
        <BandaPerritos
          frases={["Precaución, perritos a bordo", "Guardería", "Hotel", "Estética", "Recolección a domicilio", "Monitoreo 24 horas"]}
        />
        <Guarderia />
        <Hotel />
        <Estetica />
        <Recoleccion />
        <Patio />
        <Requisitos />
        <Ubicacion />
        <LlamadoFinal />
      </main>
      <Pie />
      <WhatsAppFlotante />
    </div>
  );
}
