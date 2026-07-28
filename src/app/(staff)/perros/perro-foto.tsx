"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { comprimirImagen } from "@/lib/imagen";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { obtenerUrlFotoPerro, prepararRutaFotoPerro, guardarFotoPerro } from "./foto-actions";

const BUCKET = "perros-archivos";

function IconoPerro({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="7" cy="8" r="1.6" />
      <circle cx="11.5" cy="5.8" r="1.6" />
      <circle cx="16" cy="8" r="1.6" />
      <circle cx="18.2" cy="12.2" r="1.6" />
      <path d="M12 12c-2.6 0-4.6 1.6-5.4 3.4-.6 1.4-1.6 2-2.4 3-.7.9.1 2.4 1.6 2.1 1.2-.2 1.9-.9 3-1 1 .8 2.1 1.5 3.2 1.5s2.2-.7 3.2-1.5c1.1.1 1.8.8 3 1 1.5.3 2.3-1.2 1.6-2.1-.8-1-1.8-1.6-2.4-3-.8-1.8-2.8-3.4-5.4-3.4Z" />
    </svg>
  );
}

export function PerroFoto({
  perroId,
  urlInicial,
  tieneFotoInicial,
  soloLectura = false,
  tamano = "grande",
}: {
  perroId: string;
  urlInicial: string | null;
  tieneFotoInicial: boolean;
  soloLectura?: boolean;
  tamano?: "grande" | "miniatura";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(urlInicial);
  const [hayFoto, setHayFoto] = useState(tieneFotoInicial);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Las URLs firmadas caducan (una hora, ver foto-actions.ts). Una pestaña
  // de recepción se queda abierta todo el turno, así que si la imagen
  // falla al cargar no es necesariamente que ya no exista: se pide una
  // firma nueva antes de rendirse y mostrar el placeholder.
  async function manejarErrorImagen() {
    const nueva = await obtenerUrlFotoPerro(perroId);
    if (nueva) {
      setUrl(nueva);
    } else {
      setHayFoto(false);
      setUrl(null);
    }
  }

  async function manejarArchivo(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    if (!archivo) return;

    setError(null);
    setSubiendo(true);
    try {
      const blob = await comprimirImagen(archivo);
      const path = await prepararRutaFotoPerro(perroId);
      if (!path) {
        setError("No encontramos el perro. Recarga la página.");
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error: subidaError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { upsert: true, contentType: "image/jpeg" });

      if (subidaError) {
        setError("No pudimos subir la foto. Intenta de nuevo.");
        return;
      }

      const { error: guardarError } = await guardarFotoPerro(perroId, path);
      if (guardarError) {
        setError(guardarError);
        return;
      }

      const nuevaUrl = await obtenerUrlFotoPerro(perroId);
      setHayFoto(true);
      setUrl(nuevaUrl);
    } catch {
      setError("No pudimos procesar esa imagen. Intenta con otra foto.");
    } finally {
      setSubiendo(false);
    }
  }

  const esGrande = tamano === "grande";
  const dimensiones = esGrande ? "h-40 w-40" : "h-12 w-12 flex-none";

  return (
    <div className={`flex ${esGrande ? "flex-col" : "flex-row items-center"} gap-3`}>
      <div
        className={`${dimensiones} overflow-hidden rounded-md border-[1.5px] border-n-200 bg-n-50`}
      >
        {hayFoto && url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt=""
            onError={manejarErrorImagen}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-n-400">
            <IconoPerro className={esGrande ? "h-10 w-10" : "h-6 w-6"} />
            {esGrande && <span className="text-xs font-semibold">Sin foto</span>}
          </div>
        )}
      </div>

      {!soloLectura && esGrande && (
        <div className="flex flex-col gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={manejarArchivo}
          />
          {error && (
            <Alert variante="error" titulo="No se pudo guardar">
              {error}
            </Alert>
          )}
          <Button
            type="button"
            variante="secundario"
            disabled={subiendo}
            onClick={() => inputRef.current?.click()}
            className="self-start"
          >
            {subiendo ? "Subiendo…" : hayFoto ? "Reemplazar foto" : "Subir foto"}
          </Button>
        </div>
      )}
    </div>
  );
}
