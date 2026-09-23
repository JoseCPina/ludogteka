import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import { URL_PUBLICA } from "@/lib/landing/negocio";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
});

export const metadata: Metadata = {
  // Base de las URLs absolutas de Open Graph (la imagen que enseña
  // WhatsApp al compartir el link).
  metadataBase: new URL(URL_PUBLICA),
  title: "Ludogteka",
  description:
    "App interna y portal de clientes — guardería, hotel y estética canina en San Luis Potosí.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${nunito.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
