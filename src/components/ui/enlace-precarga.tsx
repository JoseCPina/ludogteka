"use client";

import { useRef, type ComponentProps } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * QA S41 (N141): un enlace que NO se precarga solo al entrar en pantalla, sino cuando alguien pasa el puntero, lo toca
 * o lo enfoca (`router.prefetch`). El menú lateral y los mosaicos del tablero tienen ~35 enlaces: con la precarga
 * automática, cada pantalla lanzaba de 20 a 35 peticiones al cargar y, en un celular con red lenta, la acción que
 * alguien apretaba (Confirmar inicio) salía detrás de ellas. `automatica` deja la precarga de siempre solo en las 3 o 4
 * pantallas principales del rol (`pantallasPrincipales`, src/lib/nav/config.ts).
 */
export function EnlacePrecarga({
  href,
  automatica = false,
  onMouseEnter,
  onTouchStart,
  onFocus,
  ...resto
}: Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string; automatica?: boolean }) {
  const router = useRouter();
  const pedida = useRef(false);
  const precargar = () => {
    if (automatica || pedida.current) return;
    pedida.current = true;
    router.prefetch(href);
  };
  return (
    <Link
      href={href}
      prefetch={automatica ? undefined : false}
      onMouseEnter={(e) => {
        precargar();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        precargar();
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        precargar();
        onFocus?.(e);
      }}
      {...resto}
    />
  );
}
