"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

const ANCHO = 600;
const ALTO = 200;

/**
 * Un recuadro para firmar con el dedo, el mouse o el lápiz. Entrega la firma como PNG (data URL, de un
 * tamaño fijo y pequeño) cuando se levanta el trazo, y `null` si se borra.
 */
export function PadFirma({ onFirma, etiqueta = "Firma aquí" }: { onFirma: (png: string | null) => void; etiqueta?: string }) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const [vacio, setVacio] = useState(true);

  function limpiar() {
    const c = lienzo.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ANCHO, ALTO);
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
  }

  useEffect(() => {
    limpiar();
  }, []);

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = lienzo.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * ANCHO) / r.width, y: ((e.clientY - r.top) * ALTO) / r.height };
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-n-800">{etiqueta}</p>
      <canvas
        ref={lienzo}
        width={ANCHO}
        height={ALTO}
        aria-label="Recuadro de firma"
        className="h-40 w-full touch-none rounded-md border-[1.5px] border-n-400 bg-white sm:h-48"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          const c = lienzo.current;
          const ctx = c?.getContext("2d");
          if (!c || !ctx) return;
          c.setPointerCapture(e.pointerId);
          const { x, y } = punto(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.1, y + 0.1);
          ctx.stroke();
          dibujando.current = true;
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return;
          const ctx = lienzo.current?.getContext("2d");
          if (!ctx) return;
          const { x, y } = punto(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          setVacio(false);
        }}
        onPointerUp={() => {
          if (!dibujando.current) return;
          dibujando.current = false;
          setVacio(false);
          onFirma(lienzo.current!.toDataURL("image/png"));
        }}
        onPointerCancel={() => (dibujando.current = false)}
      />
      <div>
        <Button
          type="button"
          variante="secundario"
          disabled={vacio}
          onClick={() => {
            limpiar();
            setVacio(true);
            onFirma(null);
          }}
        >
          Borrar firma
        </Button>
      </div>
    </div>
  );
}
