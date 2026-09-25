import type { Metadata } from "next";
import { headers } from "next/headers";
import { ENCABEZADOS_NEGOCIO, ENCABEZADO_PLATAFORMA } from "@/lib/negocio/resolver";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { ProveedorZonaNegocio } from "@/components/zona-negocio";
import { outfit } from "@/fuentes";
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
  const icono = h.get(ENCABEZADOS_NEGOCIO.icono) || "/icono-negocio";
  return {
    metadataBase: slug ? new URL(urlDelNegocio({ slug, dominio, url_publica })) : undefined,
    title: nombre,
    description: `${nombre}: guardería, hotel y estética canina.`,
    icons: { icon: icono },
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
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">{cuerpo}</body>
    </html>
  );
}
