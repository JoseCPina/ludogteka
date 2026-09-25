import type { Metadata } from "next";
import { fredoka, nunito } from "@/fuentes";
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
import { LandingBasica } from "@/components/landing/basica";
import { patronHuesos } from "@/components/landing/patron";
import { cargarNegocioLanding, datosLanding } from "@/lib/landing/negocio";
import "@/components/landing/landing.css";

// La raíz es la landing pública del negocio del dominio: sin sesión. El
// acceso al sistema es el botón "Entrar" (/login, que ya manda a cada quien
// a su zona si tiene sesión).
//
// PeluDesk: el contenido sale de `negocios.landing`. El tema "ludogteka"
// es la landing con la rotulación de la camioneta y las fotos reales de
// Ludogteka; cualquier otro negocio (o uno sin landing capturada) ve la
// básica, sin fotos de nadie.

// Fredoka para títulos, como la rotulación de la camioneta, y Nunito para
// el texto, como siempre (la app pasó a Outfit): src/fuentes, los mismos
// archivos que servía la landing.
// Los patrones de huesos y huellas de las franjas, con el tono un poco más
// oscuro que el fondo, como en la lona.
const PATRONES = {
  "--lp-patron-turquesa": patronHuesos("#2cb5b1"),
  "--lp-patron-amarillo": patronHuesos("#f0bb24"),
} as React.CSSProperties;

async function temaLudogteka(): Promise<boolean> {
  return (await cargarNegocioLanding()).landing?.tema === "ludogteka";
}

export async function generateMetadata(): Promise<Metadata> {
  const negocio = await cargarNegocioLanding();
  if (!negocio.landing) {
    return {
      title: { absolute: negocio.nombre },
      description: `${negocio.nombre}: guardería, hotel y estética canina${negocio.ciudad ? ` en ${negocio.ciudad}` : ""}.`,
      alternates: { canonical: "/" },
    };
  }
  const { NOMBRE, SEO, URL_PUBLICA } = await datosLanding();
  const imagen = SEO.imagen && (await temaLudogteka())
    ? [{ url: SEO.imagen, width: 1200, height: 630, alt: SEO.imagen_alt ?? SEO.og_titulo ?? NOMBRE, type: "image/jpeg" }]
    : undefined;
  return {
    metadataBase: new URL(URL_PUBLICA),
    title: { absolute: SEO.titulo ?? NOMBRE },
    description: SEO.descripcion,
    alternates: { canonical: "/" },
    openGraph: {
      type: "website",
      locale: "es_MX",
      url: "/",
      siteName: NOMBRE,
      title: SEO.og_titulo ?? NOMBRE,
      description: SEO.og_descripcion ?? SEO.descripcion,
      images: imagen,
    },
    twitter: {
      card: imagen ? "summary_large_image" : "summary",
      title: SEO.og_titulo ?? NOMBRE,
      description: SEO.og_descripcion ?? SEO.descripcion,
      images: imagen,
    },
  };
}

async function datosEstructurados() {
  const { DIRECCION, HORARIO, NOMBRE, SEO, TELEFONO_SCHEMA, TEXTOS, URL_PUBLICA } = await datosLanding();
  return {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    "@id": `${URL_PUBLICA}/#negocio`,
    name: NOMBRE,
    description: TEXTOS.lema ?? SEO.descripcion,
    url: URL_PUBLICA,
    telephone: TELEFONO_SCHEMA,
    ...(SEO.imagen ? { image: `${URL_PUBLICA}${SEO.imagen}` } : {}),
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
}

export default async function Landing() {
  if (!(await temaLudogteka())) return <LandingBasica />;

  const { TEXTOS } = await datosLanding();
  return (
    <div className={`lp ${fredoka.variable} ${nunito.variable} flex min-h-full flex-col bg-[var(--lp-crema)]`} style={{ ...PATRONES, fontFamily: "var(--font-nunito), system-ui, sans-serif" }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(await datosEstructurados()) }}
      />
      <Encabezado />
      <main className="flex-1">
        <Hero />
        <Servicios />
        {TEXTOS.banda && <BandaPerritos frases={TEXTOS.banda} />}
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
