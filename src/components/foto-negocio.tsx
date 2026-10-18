"use client";

import { useState } from "react";
import { PawPrint } from "@phosphor-icons/react/dist/ssr";

/**
 * Una foto de la página de un negocio. Si no hay foto, o el archivo ya no existe,
 * se ve un fondo suave con la huella de la marca: nunca el texto de la ranura ni un
 * ícono de imagen rota. `alt` vacío a propósito: es decoración, el nombre ya está en el título.
 */
export function FotoNegocio({ url, color, className = "", prioridad = false }: { url: string | null; color: string; className?: string; prioridad?: boolean }) {
  const [rota, setRota] = useState(false);
  if (url && !rota) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        onError={() => setRota(true)}
        className={`object-cover ${className}`}
        // La foto principal es lo primero que se ve (LCP): se pide de inmediato; las demás, al acercarse.
        loading={prioridad ? "eager" : "lazy"}
        fetchPriority={prioridad ? "high" : "auto"}
        decoding={prioridad ? "sync" : "async"}
        referrerPolicy="no-referrer"
      />
    );
  }
  // El color puede venir como #rrggbb o como una variable de CSS (la página web por giro).
  const tinte = (alfa: number) => (color.startsWith("#") ? `${color}${Math.round(alfa * 255).toString(16).padStart(2, "0")}` : `color-mix(in srgb, ${color} ${Math.round(alfa * 100)}%, transparent)`);
  return (
    <div
      aria-hidden
      data-sin-foto
      className={`flex items-center justify-center overflow-hidden ${className}`}
      style={{ background: `linear-gradient(135deg, ${tinte(0.12)}, ${tinte(0.25)})` }}
    >
      <PawPrint size={72} weight="duotone" style={{ color }} />
    </div>
  );
}
