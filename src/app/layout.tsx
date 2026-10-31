import type { Metadata } from "next";
import { headers } from "next/headers";
import { ENCABEZADOS_NEGOCIO, ENCABEZADO_APP, ENCABEZADO_PLATAFORMA } from "@/lib/negocio/resolver";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { ProveedorZonaNegocio } from "@/components/zona-negocio";
import { ValidacionEnEspanol } from "@/components/validacion-en-espanol";
import { outfit } from "@/fuentes";
import { SLUG_DEMO } from "@/lib/peludesk/landing";
import { ICONOS_GENERADOS } from "@/lib/negocio/icono";
import "./globals.css";

// Outfit (src/fuentes): la letra de PeluDesk, base de toda la app. La
// landing de Ludogteka conserva la suya (Nunito + Fredoka, src/app/page.tsx).

// Título, ícono y dirección base de este negocio (lo resolvió el
// middleware por el dominio). La base de las URLs absolutas es la de Open
// Graph: la imagen que enseña WhatsApp al compartir el link. El ícono de la
// pestaña sale de la configuración del negocio (negocios.marca.favicon) o,
// si no tiene, del que se arma con su inicial y su color (/icono-negocio).
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  // La app para dueños (app.peludesk.mx): PeluDesk, instalable, sin indexar.
  if (h.get(ENCABEZADO_APP) === "1") {
    return {
      title: { default: "PeluDesk", template: "%s · PeluDesk" },
      description: "La cartilla, los recordatorios y los negocios de tus mascotas, en un solo lugar.",
      manifest: "/manifest.webmanifest",
      appleWebApp: { capable: true, title: "PeluDesk", statusBarStyle: "default" },
      icons: {
        icon: [{ url: "/marca/peludesk/isotipo.svg", type: "image/svg+xml" }, { url: "/marca/peludesk/favicon-32.png", sizes: "32x32" }],
        apple: "/marca/peludesk/favicon-180.png",
      },
      robots: { index: false, follow: false },
    };
  }
  if (h.get(ENCABEZADO_PLATAFORMA) === "1") {
    return {
      title: "PeluDesk",
      icons: {
        icon: [{ url: "/marca/peludesk/isotipo.svg", type: "image/svg+xml" }, { url: "/marca/peludesk/favicon-32.png", sizes: "32x32" }],
        apple: "/marca/peludesk/favicon-180.png",
      },
      robots: { index: false, follow: false },
    };
  }
  const nombre = decodeURIComponent(h.get(ENCABEZADOS_NEGOCIO.nombre) ?? "") || "PeluDesk";
  const slug = h.get(ENCABEZADOS_NEGOCIO.slug);
  const dominio = h.get(ENCABEZADOS_NEGOCIO.dominio) || null;
  const url_publica = h.get(ENCABEZADOS_NEGOCIO.url) || null;
  const iconoPropio = h.get(ENCABEZADOS_NEGOCIO.icono) || null;
  // La vista previa al compartir CUALQUIER link del negocio (login, alta por
  // link, portal): su nombre y su imagen (negocios.marca.imagen_compartir, o
  // la tarjeta que se arma con su marca en /imagen-negocio). Nunca la de
  // PeluDesk. La landing (src/app/page.tsx) pone la suya encima.
  const imagen = h.get(ENCABEZADOS_NEGOCIO.imagen) || "/imagen-negocio";
  const descripcion = `${nombre}: guardería, hotel y estética canina.`;
  return {
    metadataBase: slug ? new URL(urlDelNegocio({ slug, dominio, url_publica })) : undefined,
    title: nombre,
    description: descripcion,
    // Con ícono propio, ese (y también para iOS); sin él, el generado en cada tamaño.
    icons: iconoPropio ? { icon: iconoPropio, apple: iconoPropio } : ICONOS_GENERADOS,
    manifest: "/manifest.webmanifest",
    // Al instalarla en iPhone: nombre del negocio y sin la barra del navegador.
    appleWebApp: { capable: true, title: nombre, statusBarStyle: "default" },
    openGraph: {
      type: "website",
      locale: "es_MX",
      siteName: nombre,
      title: nombre,
      description: descripcion,
      images: [{ url: imagen, width: 1200, height: 630, alt: nombre }],
    },
    twitter: { card: "summary_large_image", title: nombre, description: descripcion, images: [imagen] },
    // El negocio de demostración se ve pero no se indexa.
    ...(slug === SLUG_DEMO ? { robots: { index: false, follow: false } } : {}),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El negocio viaja al navegador para que sus llamadas a la base lleven
  // el mismo negocio que el servidor (src/lib/supabase/client.ts), y su
  // zona horaria para que las fechas en pantalla sean las del negocio.
  const h = await headers();
  const negocioId = h.get(ENCABEZADOS_NEGOCIO.id) ?? undefined;
  const zona = h.get(ENCABEZADOS_NEGOCIO.zona);
  const cuerpo = zona ? <ProveedorZonaNegocio zona={zona}>{children}</ProveedorZonaNegocio> : children;
  return (
    <html
      lang="es"
      data-negocio={negocioId}
      className={`${outfit.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ValidacionEnEspanol />
        {cuerpo}
      </body>
    </html>
  );
}
