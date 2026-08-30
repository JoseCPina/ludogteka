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
  tipoContratoId: string | null;
  tipoNombre: string;
  version: number | null;
};

// Un contrato por tipo: el perro puede tener firmado el de guardería y
// deberle el de hotel. `aplica` dice si el negocio se lo pide (usa ese
// servicio) — los que no aplican siguen siendo generables a mano, por si
// recepción quiere adelantarse a una estancia que todavía no existe.
export type TipoContratoFila = {
  id: string;
  nombre: string;
  aplica: boolean;
  estado: "vigente" | "sin_contrato" | "requiere_actualizacion" | null;
};

async function calcularHashArchivo(archivo: File): Promise<string> {
  const buffer = await archivo.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function PastillaEstadoTipo({ tipo }: { tipo: TipoContratoFila }) {
  if (!tipo.aplica) {
    return (
      <span className="rounded-full bg-n-100 px-2.5 py-1 text-xs font-semibold text-n-500">
        No se le pide
      </span>
    );
  }
  if (tipo.estado === "vigente") {
    return (
      <span className="rounded-full bg-verde-suave px-2.5 py-1 text-xs font-semibold text-verde-oscuro">
        Al día
      </span>
    );
  }
  if (tipo.estado === "requiere_actualizacion") {
    return (
      <span className="rounded-full bg-azul-suave px-2.5 py-1 text-xs font-semibold text-azul-oscuro">
        Requiere actualización
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amarillo-suave px-2.5 py-1 text-xs font-semibold text-amarillo-oscuro">
      Falta firmar
    </span>
  );
}

function AccionesPendiente({
  contrato,
  subiendo,
  subiendoParaId,
  cancelandoId,
  motivoCancelar,
  cancelando,
  onSubirPapel,
  onIniciarCancelar,
  onCambiarMotivo,
  onConfirmarCancelar,
}: {
  contrato: ContratoFila;
  subiendo: boolean;
  subiendoParaId: string | null;
  cancelandoId: string | null;
  motivoCancelar: string;
  cancelando: boolean;
  onSubirPapel: (contratoId: string) => void;
  onIniciarCancelar: (contratoId: string | null) => void;
  onCambiarMotivo: (motivo: string) => void;
  onConfirmarCancelar: (contratoId: string) => void;
}) {
  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <a href={`/api/contratos/${contrato.id}/preview`} target="_blank" rel="noreferrer">
          <Button type="button" variante="secundario">
            Ver borrador
          </Button>
        </a>
        <Button
          type="button"
          variante="secundario"
          disabled={subiendo}
          onClick={() => onSubirPapel(contrato.id)}
        >
          {subiendo && subiendoParaId === contrato.id ? "Subiendo…" : "Subir firmado en papel"}
        </Button>
        {cancelandoId !== contrato.id && (
          <Button type="button" variante="peligro" onClick={() => onIniciarCancelar(contrato.id)}>
            Cancelar
          </Button>
        )}
      </div>
      {cancelandoId === contrato.id && (
        <div className="mt-3 flex flex-col gap-2 border-t border-n-200 pt-3">
          <Field
            label="Motivo de la cancelación"
            value={motivoCancelar}
            onChange={(e) => onCambiarMotivo(e.target.value)}
            placeholder="ej. Se generó por error"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              variante="peligro"
              disabled={cancelando}
              onClick={() => onConfirmarCancelar(contrato.id)}
            >
              {cancelando ? "Cancelando…" : "Confirmar cancelación"}
            </Button>
            <Button type="button" variante="secundario" onClick={() => onIniciarCancelar(null)}>
              No
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ContratoSeccion({
  perroId,
  clienteId,
  tipos,
  contratos,
}: {
  perroId: string;
  clienteId: string;
  tipos: TipoContratoFila[];
  contratos: ContratoFila[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [generandoTipoId, setGenerandoTipoId] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [subiendoParaId, setSubiendoParaId] = useState<string | null>(null);
  const [cancelandoId, setCancelandoId] = useState<string | null>(null);
  const [motivoCancelar, setMotivoCancelar] = useState("");
  const [cancelando, setCancelando] = useState(false);

  const pendientes = contratos.filter((c) => c.estado === "pendiente_firma");
  const historial = contratos.filter((c) => c.estado !== "pendiente_firma");
  const pendientePorTipo = new Map(
    pendientes.filter((c) => c.tipoContratoId).map((c) => [c.tipoContratoId as string, c])
  );
  // Un pendiente cuyo tipo ya se archivó: sigue existiendo y hay que
  // poder firmarlo o cancelarlo, aunque su tipo ya no aparezca arriba.
  const pendientesHuerfanos = pendientes.filter(
    (c) => !c.tipoContratoId || !tipos.some((t) => t.id === c.tipoContratoId)
  );

  async function accionGenerar(tipoId: string) {
    setGenerandoTipoId(tipoId);
    setError(null);
    const res = await generarContrato(perroId, tipoId);
    setGenerandoTipoId(null);
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

      {tipos.length === 0 ? (
        <Alert variante="advertencia" titulo="Sin contratos configurados">
          No hay ninguna plantilla de contrato publicada. Un admin tiene que crear la primera en
          Contratos antes de poder generarle uno a este perro.
        </Alert>
      ) : (
        <ul className="flex flex-col gap-3">
          {tipos.map((tipo) => {
            const pendiente = pendientePorTipo.get(tipo.id) ?? null;
            return (
              <li key={tipo.id} className="rounded-lg border border-n-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-n-900">{tipo.nombre}</span>
                    <PastillaEstadoTipo tipo={tipo} />
                  </span>
                  {pendiente ? (
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${ESTILO_ESTADO.pendiente_firma}`}>
                      Pendiente de firma · generado {formatearFecha(pendiente.createdAt)}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variante="secundario"
                      disabled={generandoTipoId === tipo.id}
                      onClick={() => accionGenerar(tipo.id)}
                    >
                      {generandoTipoId === tipo.id ? "Generando…" : "Generar contrato"}
                    </Button>
                  )}
                </div>
                {pendiente && (
                  <AccionesPendiente
                    contrato={pendiente}
                    subiendo={subiendo}
                    subiendoParaId={subiendoParaId}
                    cancelandoId={cancelandoId}
                    motivoCancelar={motivoCancelar}
                    cancelando={cancelando}
                    onSubirPapel={abrirSelectorPapel}
                    onIniciarCancelar={setCancelandoId}
                    onCambiarMotivo={setMotivoCancelar}
                    onConfirmarCancelar={confirmarCancelar}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}

      {pendientesHuerfanos.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-sm font-bold uppercase tracking-wide text-n-600">
            Pendientes de un contrato archivado
          </p>
          <ul className="flex flex-col gap-3">
            {pendientesHuerfanos.map((c) => (
              <li key={c.id} className="rounded-lg border border-n-200 bg-white p-4">
                <span className="font-semibold text-n-900">{c.tipoNombre}</span>
                <AccionesPendiente
                  contrato={c}
                  subiendo={subiendo}
                  subiendoParaId={subiendoParaId}
                  cancelandoId={cancelandoId}
                  motivoCancelar={motivoCancelar}
                  cancelando={cancelando}
                  onSubirPapel={abrirSelectorPapel}
                  onIniciarCancelar={setCancelandoId}
                  onCambiarMotivo={setMotivoCancelar}
                  onConfirmarCancelar={confirmarCancelar}
                />
              </li>
            ))}
          </ul>
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
                  <span className="font-semibold text-n-900">{c.tipoNombre}</span>
                  <span className="text-n-600">
                    {c.version !== null ? ` · versión ${c.version}` : ""} ·{" "}
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
