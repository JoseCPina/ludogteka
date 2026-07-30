"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import {
  generarContrato,
  prepararRutaContratoPapel,
  registrarContratoPapel,
  cancelarContrato,
  obtenerUrlContratoStaff,
} from "../contratos/contrato-actions";

const BUCKET = "perros-archivos";

const ETIQUETA_ESTADO: Record<string, string> = {
  pendiente_firma: "Pendiente de firma",
  firmado_digital: "Firmado (digital)",
  firmado_papel: "Firmado (papel)",
  cancelado: "Cancelado",
};

const ESTILO_ESTADO: Record<string, string> = {
  pendiente_firma: "bg-amarillo-suave text-amarillo-oscuro",
  firmado_digital: "bg-verde-suave text-verde-oscuro",
  firmado_papel: "bg-verde-suave text-verde-oscuro",
  cancelado: "bg-n-100 text-n-500",
};

export type ContratoFila = {
  id: string;
  estado: string;
  storagePath: string | null;
  fechaFirma: string | null;
  createdAt: string;
  motivoCancelacion: string | null;
};

async function calcularHashArchivo(archivo: File): Promise<string> {
  const buffer = await archivo.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function ContratoSeccion({ perroId, clienteId, contratos }: { perroId: string; clienteId: string; contratos: ContratoFila[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [subiendoParaId, setSubiendoParaId] = useState<string | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const pendiente = contratos.find((c) => c.estado === "pendiente_firma") ?? null;
  const historial = contratos.filter((c) => c.id !== pendiente?.id);

  async function accionGenerar() {
    setGenerando(true);
    setError(null);
    const res = await generarContrato(perroId);
    setGenerando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  function abrirSelectorPapel(contratoId: string) {
    setSubiendoParaId(contratoId);
    setError(null);
    inputRef.current?.click();
  }

  async function manejarArchivoPapel(evento: React.ChangeEvent<HTMLInputElement>) {
    const archivo = evento.target.files?.[0];
    evento.target.value = "";
    const contratoId = subiendoParaId;
    if (!archivo || !contratoId) return;

    setSubiendo(true);
    setError(null);
    try {
      const hash = await calcularHashArchivo(archivo);
      const path = await prepararRutaContratoPapel(contratoId, perroId, clienteId);

      const supabase = createSupabaseBrowserClient();
      const { error: errorSubida } = await supabase.storage
        .from(BUCKET)
        .upload(path, archivo, { upsert: false, contentType: archivo.type || "application/pdf" });
      if (errorSubida) {
        setError("No pudimos subir el archivo. Intenta de nuevo.");
        return;
      }

      const res = await registrarContratoPapel(contratoId, path, hash);
      if (res.error) {
        setError(res.error);
        return;
      }
      router.refresh();
    } catch {
      setError("No pudimos procesar ese archivo.");
    } finally {
      setSubiendo(false);
      setSubiendoParaId(null);
    }
  }

  async function confirmarCancelar(contratoId: string) {
    if (!motivoCancelar.trim()) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    setCancelando(true);
    setError(null);
    const res = await cancelarContrato(contratoId, motivoCancelar);
    setCancelando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setCancelandoId(null);
    setMotivoCancelar("");
    router.refresh();
  }

  async function verFirmado(storagePath: string) {
    const url = await obtenerUrlContratoStaff(storagePath);
    if (url) window.open(url, "_blank");
  }

  return (
    <div className="flex flex-col gap-4">
      <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={manejarArchivoPapel} />

      {error && (
        <Alert variante="error" titulo="No se pudo completar la acción">
          {error}
        </Alert>
      )}

      {!pendiente ? (
        <Button type="button" disabled={generando} onClick={accionGenerar} className="self-start">
          {generando ? "Generando…" : "Generar contrato"}
        </Button>
      ) : (
        <div className="rounded-lg border border-n-200 bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO_ESTADO[pendiente.estado]}`}>
              {ETIQUETA_ESTADO[pendiente.estado]}
            </span>
            <span className="text-xs text-n-500">Generado {formatearFecha(pendiente.createdAt)}</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a href={`/api/contratos/${pendiente.id}/preview`} target="_blank" rel="noreferrer">
              <Button type="button" variante="secundario">
                Ver borrador
              </Button>
            </a>
            <Button
              type="button"
              variante="secundario"
              disabled={subiendo}
              onClick={() => abrirSelectorPapel(pendiente.id)}
            >
              {subiendo ? "Subiendo…" : "Subir firmado en papel"}
            </Button>
            {cancelandoId !== pendiente.id ? (
              <Button type="button" variante="peligro" onClick={() => setCancelandoId(pendiente.id)}>
                Cancelar
              </Button>
            ) : null}
          </div>
          {cancelandoId === pendiente.id && (
            <div className="mt-3 flex flex-col gap-2 border-t border-n-200 pt-3">
              <Field
                label="Motivo de la cancelación"
                value={motivoCancelar}
                onChange={(e) => setMotivoCancelar(e.target.value)}
                placeholder="ej. Se generó por error"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variante="peligro"
                  disabled={cancelando}
                  onClick={() => confirmarCancelar(pendiente.id)}
                >
                  {cancelando ? "Cancelando…" : "Confirmar cancelación"}
                </Button>
                <Button type="button" variante="secundario" onClick={() => setCancelandoId(null)}>
                  No
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {historial.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold uppercase tracking-wide text-n-600">Historial</p>
          <ul className="flex flex-col gap-2">
            {historial.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-n-200 bg-n-50 px-3 py-2 text-sm">
                <div>
                  <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${ESTILO_ESTADO[c.estado]}`}>
                    {ETIQUETA_ESTADO[c.estado]}
                  </span>
                  <span className="text-n-600">
                    {c.fechaFirma ? formatearFecha(c.fechaFirma) : formatearFecha(c.createdAt)}
                  </span>
                  {c.motivoCancelacion && <p className="mt-1 text-xs text-n-500">{c.motivoCancelacion}</p>}
                </div>
                {c.storagePath && (
                  <Button type="button" variante="secundario" onClick={() => verFirmado(c.storagePath!)}>
                    Ver PDF
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
