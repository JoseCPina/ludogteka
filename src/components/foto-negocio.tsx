"use client";

import { useState } from "react";
import { PawPrint } from "@phosphor-icons/react/dist/ssr";

/**
 * Una foto de la página de un negocio. Si no hay foto, o el archivo ya no existe,
 * se ve un fondo suave con la huella de la marca: nunca el texto de la ranura ni un
 * ícono de imagen rota. `alt` vacío a propósito: es decoración, el nombre ya está en el título.
 */
export function FotoNegocio({ url, color, className = "" }: { url: string | null; color: string; className?: string }) {
  const [rota, setRota] = useState(false);
  if (url && !rota) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" onError={() => setRota(true)} className={`object-cover ${className}`} />;
  }
  return (
    <div
      aria-hidden
      data-sin-foto
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${color}1f, ${color}40)` }}
    >
      <PawPrint size={72} weight="duotone" style={{ color }} />
    </div>
  );
}
