"use client";

import { useEffect, useState, type ReactNode } from "react";

/**
 * Barra fija abajo, solo en celular: aparece cuando el botón del encabezado
 * ya no se ve y se esconde cuando llega la invitación del final (para no
 * poner el mismo botón dos veces en pantalla). Los elementos se buscan por
 * id: #inicio (el encabezado) y #cierre (la invitación final).
 */
export function BarraCelular({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const inicio = document.getElementById("inicio");
    const cierre = document.getElementById("cierre");
    if (!inicio || !cierre) return;
    const estado = { inicio: true, cierre: false };
    const obs = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.target === inicio) estado.inicio = e.isIntersecting;
        if (e.target === cierre) estado.cierre = e.isIntersecting;
      }
      setVisible(!estado.inicio && !estado.cierre);
    });
    obs.observe(inicio);
    obs.observe(cierre);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      data-visible={visible}
      aria-hidden={!visible}
      inert={!visible}
      className="pd-barra fixed inset-x-0 bottom-0 z-30 border-t border-n-200 bg-crema/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur md:hidden"
    >
      {children}
    </div>
  );
}
