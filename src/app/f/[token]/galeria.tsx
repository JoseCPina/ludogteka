"use client";

import { useState } from "react";

export type ItemGaleria = { id: string; tipo: "foto" | "video"; url: string };

/** Cuadrícula de la galería: foto con tap para verla grande, video que se reproduce ahí mismo. */
export function Galeria({ items, perro }: { items: ItemGaleria[]; perro: string }) {
  const [abierta, setAbierta] = useState<ItemGaleria | null>(null);
  return (
    <>
      <ul className="grid grid-cols-2 gap-2">
        {items.map((it, i) => (
          <li key={it.id} className={it.tipo === "video" ? "col-span-2" : ""}>
            {it.tipo === "video" ? (
              <video
                controls
                playsInline
                preload="metadata"
                src={`${it.url}#t=0.1`}
                aria-label={`Video ${i + 1} de ${perro}`}
                className="aspect-video w-full rounded-lg bg-black object-contain"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAbierta(it)}
                aria-label={`Ver foto ${i + 1} de ${perro} en grande`}
                className="block w-full overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.url} alt={`Foto ${i + 1} de ${perro}`} loading="lazy" className="aspect-square w-full object-cover" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {abierta && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Foto en grande"
          className="fixed inset-0 z-50 flex flex-col bg-black/90"
          onClick={() => setAbierta(null)}
        >
          <button
            type="button"
            onClick={() => setAbierta(null)}
            className="m-3 ml-auto min-h-12 rounded-lg bg-white/15 px-5 font-semibold text-white"
            autoFocus
          >
            Cerrar
          </button>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={abierta.url} alt={`Foto de ${perro}`} className="max-h-full max-w-full object-contain" />
          </div>
        </div>
      )}
    </>
  );
}
