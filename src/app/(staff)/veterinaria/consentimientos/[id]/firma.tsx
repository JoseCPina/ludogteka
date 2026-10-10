"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { firmarConsentimiento, urlConsentimientoFirmado } from "../actions";

/** La firma de puño y letra en el mostrador: el propietario dibuja en la pantalla. */
export function FirmaConsentimiento({ id, firmanteInicial }: { id: string; firmanteInicial: string }) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const huboTrazo = useRef(false);
  const [firmando, setFirmando] = useState(false);
  const [vacio, setVacio] = useState(true);
  const [nombre, setNombre] = useState(firmanteInicial);
  const [error, setError] = useState<string | null>(null);
  const envio = useEspera();

  function preparar() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const ancho = canvas.clientWidth;
    const alto = canvas.clientHeight;
    canvas.width = ancho * dpr;
    canvas.height = alto * dpr;
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1a1a2e";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
  }
  const posicion = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  async function confirmar() {
    if (!huboTrazo.current || !canvasRef.current) return setError("El propietario debe dibujar su firma antes de confirmar.");
    setError(null);
    const r = await envio.ejecutar(() => firmarConsentimiento(id, nombre, canvasRef.current!.toDataURL("image/png")));
    if (r.error) return setError(r.error);
    setFirmando(false);
    router.refresh();
  }

  if (!firmando) {
    return (
      <Button
        type="button"
        onClick={() => {
          setFirmando(true);
          setError(null);
          huboTrazo.current = false;
          setVacio(true);
          requestAnimationFrame(preparar);
        }}
      >
        Firmar en pantalla
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-ambar bg-ambar-suave p-4">
      {error && <Alert variante="error" titulo="No se pudo firmar">{error}</Alert>}
      <Field label="Nombre de quien firma" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      <p className="text-sm text-ambar-oscuro">Pasa la pantalla al propietario: debe leer el texto de arriba y dibujar su firma en el recuadro.</p>
      <canvas
        ref={canvasRef}
        className="h-48 w-full touch-none rounded-md border-[1.5px] border-n-400 bg-white"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          const c = canvasRef.current;
          const ctx = c?.getContext("2d");
          if (!c || !ctx) return;
          c.setPointerCapture(e.pointerId);
          const { x, y } = posicion(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          dibujando.current = true;
        }}
        onPointerMove={(e) => {
          if (!dibujando.current) return;
          const ctx = canvasRef.current?.getContext("2d");
          if (!ctx) return;
          const { x, y } = posicion(e);
          ctx.lineTo(x, y);
          ctx.stroke();
          huboTrazo.current = true;
          setVacio(false);
        }}
        onPointerUp={() => (dibujando.current = false)}
        onPointerLeave={() => (dibujando.current = false)}
      />
      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={vacio} cargando={envio.cargando} onClick={confirmar}>
          Confirmar firma
        </Button>
        <Button
          type="button"
          variante="secundario"
          disabled={envio.cargando}
          onClick={() => {
            preparar();
            huboTrazo.current = false;
            setVacio(true);
          }}
        >
          Borrar
        </Button>
        <Button type="button" variante="secundario" disabled={envio.cargando} onClick={() => setFirmando(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

export function VerFirmado({ ruta }: { ruta: string }) {
  const [error, setError] = useState<string | null>(null);
  const envio = useEspera();
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variante="secundario"
        cargando={envio.cargando}
        onClick={async () => {
          setError(null);
          const r = await envio.correr(() => urlConsentimientoFirmado(ruta));
          if (!r.ok || !r.valor) return setError("No pudimos abrir el PDF. Intenta de nuevo.");
          window.open(r.valor, "_blank", "noopener");
        }}
      >
        Ver el PDF firmado
      </Button>
      {error && <p className="text-sm font-semibold text-coral-oscuro">{error}</p>}
    </div>
  );
}
