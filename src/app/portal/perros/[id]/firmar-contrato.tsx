"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { firmarContratoDigital, obtenerUrlContrato } from "../../contrato-actions";

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente_firma: "Pendiente de firma",
  firmado_digital: "Firmado",
  firmado_papel: "Firmado (papel)",
  cancelado: "Cancelado",
};

export function FirmarContrato({
  contratoId,
  estado,
  storagePath,
}: {
  contratoId: string;
  estado: string;
  storagePath: string | null;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dibujando = useRef(false);
  const huboTrazo = useRef(false);

  const [firmando, setFirmando] = useState(false);
  const [vacio, setVacio] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlFirmado, setUrlFirmado] = useState<string | null>(null);

  useEffect(() => {
    if (estado !== "pendiente_firma" && storagePath) {
      obtenerUrlContrato(storagePath).then(setUrlFirmado);
    }
  }, [estado, storagePath]);

  function prepararCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Tamaño real en píxeles de dispositivo, para que la firma se vea
    // nítida en pantallas de celular con más densidad de píxeles — sin
    // esto, dibujar con el dedo se ve borroso o desalineado del trazo.
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

  function abrirFirma() {
    setFirmando(true);
    setError(null);
    huboTrazo.current = false;
    setVacio(true);
    requestAnimationFrame(prepararCanvas);
  }

  function posicionRelativa(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function iniciarTrazo(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicionRelativa(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    dibujando.current = true;
  }

  function continuarTrazo(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicionRelativa(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    huboTrazo.current = true;
    setVacio(false);
  }

  function terminarTrazo() {
    dibujando.current = false;
  }

  function limpiar() {
    prepararCanvas();
    huboTrazo.current = false;
    setVacio(true);
  }

  async function confirmarFirma() {
    const canvas = canvasRef.current;
    if (!canvas || !huboTrazo.current) {
      setError("Dibuja tu firma antes de confirmar.");
      return;
    }
    setEnviando(true);
    setError(null);
    const dataUrl = canvas.toDataURL("image/png");
    const res = await firmarContratoDigital(contratoId, dataUrl);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setFirmando(false);
    router.refresh();
  }

  if (estado !== "pendiente_firma") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
        <span className="w-fit rounded-full bg-verde-suave px-2.5 py-1 text-xs font-semibold text-verde-oscuro">
          {ETIQUETA_ESTADO[estado] ?? estado}
        </span>
        {urlFirmado && (
          <a href={urlFirmado} target="_blank" rel="noreferrer" className="text-sm font-semibold text-azul hover:underline">
            Ver contrato firmado →
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-amarillo bg-amarillo-suave p-4">
      <p className="font-bold text-amarillo-oscuro">Tienes un contrato pendiente de firma</p>

      {error && (
        <Alert variante="error" titulo="No se pudo firmar">
          {error}
        </Alert>
      )}

      {!firmando ? (
        <div className="flex flex-wrap gap-3">
          <a href={`/api/contratos/${contratoId}/preview`} target="_blank" rel="noreferrer">
            <Button type="button" variante="secundario">
              Leer contrato
            </Button>
          </a>
          <Button type="button" onClick={abrirFirma}>
            Firmar
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-amarillo-oscuro">Dibuja tu firma con el dedo en el recuadro.</p>
          <canvas
            ref={canvasRef}
            className="h-48 w-full touch-none rounded-md border-[1.5px] border-n-400 bg-white"
            style={{ touchAction: "none" }}
            onPointerDown={iniciarTrazo}
            onPointerMove={continuarTrazo}
            onPointerUp={terminarTrazo}
            onPointerLeave={terminarTrazo}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={vacio || enviando} onClick={confirmarFirma}>
              {enviando ? "Firmando…" : "Confirmar firma"}
            </Button>
            <Button type="button" variante="secundario" onClick={limpiar} disabled={enviando}>
              Borrar
            </Button>
            <Button type="button" variante="secundario" onClick={() => setFirmando(false)} disabled={enviando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
