"use client";

/**
 * La videollamada de una teleconsulta. Con Daily es su interfaz lista (iframe) con permiso para cámara y
 * micrófono; la sala SIMULADA (demo y pruebas) enseña un marcador, sin red.
 */
export function VideoSala({ url, simulada, titulo, alto = "min-h-[70dvh]" }: { url: string; simulada: boolean; titulo: string; alto?: string }) {
  if (simulada) {
    return (
      <div role="region" aria-label={titulo} data-sala-simulada className={`flex ${alto} flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-n-300 bg-n-50 p-6 text-center`}>
        <p className="text-lg font-bold text-n-900">Videollamada simulada</p>
        <p className="max-w-sm text-n-700">Aquí aparecería el video de la teleconsulta. Esta clínica está en modo de prueba y no se conecta a ningún proveedor de video.</p>
      </div>
    );
  }
  return (
    <iframe
      title={titulo}
      src={url}
      allow="camera; microphone; fullscreen; display-capture; autoplay; clipboard-write"
      className={`w-full ${alto} rounded-xl border border-n-200 bg-black`}
    />
  );
}
