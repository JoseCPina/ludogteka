"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconoCampana, IconoHuella, IconoPin } from "./iconos";

// Las tres pestañas de la app para dueños (PLAN, principio 8: la pantalla principal tiene tres cosas).
const PESTANAS = [
  { href: "/", etiqueta: "Mis mascotas", Icono: IconoHuella, activa: (p: string) => p === "/" || p.startsWith("/mascotas") },
  { href: "/avisos", etiqueta: "Avisos", Icono: IconoCampana, activa: (p: string) => p.startsWith("/avisos") },
  { href: "/cerca", etiqueta: "Cerca de mí", Icono: IconoPin, activa: (p: string) => p.startsWith("/cerca") },
];

export function NavApp({ avisosSinLeer }: { avisosSinLeer: number }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="apd-nav" aria-label="Secciones">
      {PESTANAS.map(({ href, etiqueta, Icono, activa }) => (
        <Link key={href} href={href} aria-current={activa(pathname) ? "page" : undefined} style={{ position: "relative" }} prefetch={true}>
          <Icono />
          <span>{etiqueta}</span>
          {href === "/avisos" && avisosSinLeer > 0 && <span className="apd-punto" aria-label={`${avisosSinLeer} sin leer`} />}
        </Link>
      ))}
    </nav>
  );
}
