"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { comprimirImagen } from "@/lib/imagen";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import {
  prepararEntradaBitacora,
  crearEntradaBitacora,
  marcarBitacoraNotificada,
  construirEnlaceWhatsApp,
} from "./bitacora-actions";

const BUCKET = "perros-archivos";

export type EntradaBitacora = {
  id: string;
  tipo: "actualizacion" | "incidencia";
  nota: string | null;
  foto_url: string | null;
  created_at: string;
  notificado_whatsapp_at: string | null;
};

export function BitacoraSeccion({ perroId, entradas }: { perroId: string; entradas: EntradaBitacora[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [tipo, setTipo] = useState<"actualizacion" | "incidencia">("actualizacion");
  const [nota, setNota] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [notificandoId, setNotificandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    setEnviando(true);
    setError(null);
    try {
      const prep = await prepararEntradaBitacora(perroId);
      if (!prep) {
        setError("No encontramos el perro. Recarga la página.");
        return;
      }

      let fotoPath: string | null = null;
      if (archivo) {
        const blob = await comprimirImagen(archivo);
        const supabase = createSupabaseBrowserClient();
        const { error: subidaError } = await supabase.storage
          .from(BUCKET)
          .upload(prep.path, blob, { contentType: "image/jpeg" });
        if (subidaError) {
          setError("No pudimos subir la foto. Intenta de nuevo.");
          return;
        }
        fotoPath = prep.path;
      }

      const res = await crearEntradaBitacora({
        entradaId: prep.entradaId,
        perroId,
        tipo,
        nota,
        fotoPath,
      });
      if (res.error) {
        setError(res.error);
        return;
      }

      setNota("");
      setArchivo(null);
      setTipo("actualizacion");
      router.refresh();
    } catch {
      setError("No pudimos procesar esa foto. Intenta con otra.");
    } finally {
      setEnviando(false);
    }
  }

  async function notificar(entradaId: string) {
    setNotificandoId(entradaId);
    setError(null);
    const res = await construirEnlaceWhatsApp(entradaId);
    if (res.error || !res.url) {
      setError(res.error ?? "No pudimos generar el enlace de WhatsApp.");
      setNotificandoId(null);
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
    await marcarBitacoraNotificada(entradaId, perroId);
    setNotificandoId(null);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
        <Select label="Tipo" value={tipo} onChange={(e) => setTipo(e.target.value as "actualizacion" | "incidencia")} disabled={enviando}>
          <option value="actualizacion">Actualización (foto, nota del día)</option>
          <option value="incidencia">Incidencia (mordida, escape, enfermedad)</option>
        </Select>
        <Textarea
          label={tipo === "incidencia" ? "Qué pasó" : "Nota (opcional)"}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          rows={3}
          disabled={enviando}
        />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          />
          <Button type="button" variante="secundario" disabled={enviando} onClick={() => inputRef.current?.click()}>
            {archivo ? "Cambiar foto" : "Agregar foto"}
          </Button>
          {archivo && <span className="text-sm text-n-600">{archivo.name}</span>}
        </div>
        <Button type="button" disabled={enviando} onClick={agregar} className="self-start">
          {enviando ? "Guardando…" : "Agregar a la bitácora"}
        </Button>
      </div>

      {entradas.length === 0 ? (
        <p className="text-n-600">Todavía no hay entradas en la bitácora de este perro.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {entradas.map((e) => (
            <li
              key={e.id}
              className={`rounded-lg border-[1.5px] p-4 ${
                e.tipo === "incidencia" ? "border-naranja bg-naranja-suave" : "border-n-200 bg-white"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
                    e.tipo === "incidencia" ? "bg-naranja-oscuro text-white" : "bg-azul-suave text-azul"
                  }`}
                >
                  {e.tipo === "incidencia" ? "Incidencia" : "Actualización"}
                </span>
                <span className="text-sm text-n-500">{formatearFecha(e.created_at)}</span>
              </div>
              {e.nota && <p className="mt-2 text-n-800">{e.nota}</p>}
              {e.foto_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={e.foto_url} alt="" className="mt-3 max-h-64 rounded-md object-cover" />
              )}
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  type="button"
                  variante="secundario"
                  disabled={notificandoId === e.id}
                  onClick={() => notificar(e.id)}
                >
                  {notificandoId === e.id ? "Abriendo…" : "Notificar por WhatsApp"}
                </Button>
                {e.notificado_whatsapp_at && (
                  <span className="text-xs text-n-500">Avisado el {formatearFecha(e.notificado_whatsapp_at)}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
