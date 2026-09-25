import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { headers } from "next/headers";
import { ENCABEZADOS_NEGOCIO } from "@/lib/negocio/resolver";
import { urlDelNegocio } from "@/lib/negocio/actual";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

// Título y dirección base de este negocio (lo resolvió el middleware por
// el dominio). La base de las URLs absolutas es la de Open Graph: la
// imagen que enseña WhatsApp al compartir el link.
export async function generateMetadata(): Promise<Metadata> {
  const h = await headers();
  const nombre = decodeURIComponent(h.get(ENCABEZADOS_NEGOCIO.nombre) ?? "") || "PeluDesk";
  const slug = h.get(ENCABEZADOS_NEGOCIO.slug);
  const dominio = h.get(ENCABEZADOS_NEGOCIO.dominio) || null;
  const url_publica = h.get(ENCABEZADOS_NEGOCIO.url) || null;
  return {
    metadataBase: slug ? new URL(urlDelNegocio({ slug, dominio, url_publica })) : undefined,
    title: nombre,
    description: `${nombre}: guardería, hotel y estética canina.`,
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // El negocio viaja al navegador para que sus llamadas a la base lleven
  // el mismo negocio que el servidor (src/lib/supabase/client.ts).
  const negocioId = (await headers()).get(ENCABEZADOS_NEGOCIO.id) ?? undefined;
  return (
    <html
      lang="es"
      data-negocio={negocioId}
      className={`${nunito.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
