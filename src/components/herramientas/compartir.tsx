"use client";

import { useState } from "react";

/** Compartir un resultado: copiar el link, mandarlo por WhatsApp y bajar la imagen cuadrada (si la herramienta la tiene). */
export function Compartir({ ruta, texto, imagen, insignia }: { ruta: string; texto: string; imagen?: string | null; insignia?: string | null }) {
  const [copiado, setCopiado] = useState<string | null>(null);
  const url = typeof location !== "undefined" ? `${location.origin}${ruta}` : ruta;
  const copiar = async (que: string, valor: string) => {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(que);
      setTimeout(() => setCopiado(null), 1800);
    } catch {
      prompt("Copia este texto:", valor);
    }
  };
  return (
    <div data-compartir className="flex flex-wrap items-center gap-2">
      <span className="hta-etiqueta mb-0 mr-1 self-center">Compartir</span>
      <button type="button" className="hta-opcion" onClick={() => copiar("link", url)} data-sin-bloqueo>{copiado === "link" ? "Link copiado" : "Copiar link"}</button>
      <a className="hta-opcion" href={`https://wa.me/?text=${encodeURIComponent(`${texto} ${url}`)}`} target="_blank" rel="noopener noreferrer">Mandar por WhatsApp</a>
      {imagen && <a className="hta-opcion" href={imagen} download>Bajar imagen 1080×1080</a>}
      {insignia && (
        <button type="button" className="hta-opcion" onClick={() => copiar("insignia", `<a href="${url}"><img src="${location.origin}${insignia}" alt="Dentro del rango de su ciudad · Índice PeluDesk de precios" width="260" height="60"></a>`)} data-sin-bloqueo>
          {copiado === "insignia" ? "Código copiado" : "Copiar insignia para tu web"}
        </button>
      )}
    </div>
  );
}
