"use client";

import { useEffect, useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { PadFirma } from "@/components/firma-pad";
import { firmarContratoApp, textoContratoApp } from "@/app/app/(sesion)/negocios/acciones";
import { nombreDeContrato } from "@/lib/app/contratos-texto";

/**
 * Leer y firmar un contrato pendiente desde la app (App para dueños · Fase 3, pantalla 3; también al final de una
 * reserva). El texto es el mismo que llevará el PDF; la firma con el dedo va a la misma firma del portal
 * (`firmarContratoCon`: PDF, hash, IP y hora armados en el servidor). Referencia: bloque form-layout de shadcn/studio y
 * Mobbin app-registro-vet-qr («Acción requerida» antes de la cita).
 */
export function FirmarContratoApp({ negocioId, contratoId, tipoNombre, onFirmado }: { negocioId: string; contratoId: string; tipoNombre: string; onFirmado?: () => void }) {
  const [texto, setTexto] = useState<{ titulo: string; cuerpo: string; estado: string } | null>(null);
  const [firma, setFirma] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [firmado, setFirmado] = useState(false);
  const lectura = useEspera();
  const envio = useEspera();

  useEffect(() => {
    let vivo = true;
    lectura.ejecutar(() => textoContratoApp(negocioId, contratoId)).then((r) => {
      if (!vivo) return;
      if (r.error || !r.datos) setError(r.error ?? "No pudimos abrir el contrato.");
      else setTexto(r.datos);
    });
    return () => {
      vivo = false;
    };
    // Solo al abrir este contrato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId, contratoId]);

  async function firmar() {
    if (!firma) return setError("Firma en el recuadro con el dedo.");
    setError(null);
    const r = await envio.ejecutar(() => firmarContratoApp(negocioId, contratoId, firma));
    if (r.error) return setError(r.error);
    setFirmado(true);
    onFirmado?.();
  }

  if (firmado || texto?.estado === "firmado_digital" || texto?.estado === "firmado_papel") {
    return (
      <div className="apd-aviso apd-aviso-ok" role="status" data-contrato-firmado={contratoId}>
        Firmaste: {nombreDeContrato(tipoNombre)}. El negocio ya lo tiene y te queda una copia en tu expediente.
      </div>
    );
  }

  return (
    <div className="apd-opciones" data-firmar-contrato={contratoId}>
      {lectura.cargando && !texto && <p className="apd-nota" role="status" aria-busy>Abriendo el contrato…</p>}
      {texto && (
        <>
          <p style={{ fontWeight: 800 }}>{texto.titulo}</p>
          <div className="apd-contrato-texto" tabIndex={0} aria-label={`Texto: ${nombreDeContrato(tipoNombre)}`} data-texto-contrato>{texto.cuerpo}</div>
          <PadFirma onFirma={setFirma} etiqueta="Firma aquí con el dedo" />
          <button type="button" className="apd-boton apd-boton-ancho" style={{ marginTop: "0.5rem" }} aria-busy={envio.cargando || undefined} disabled={envio.cargando || !firma} onClick={firmar} data-firmar>
            {envio.cargando ? "Firmando…" : "Firmar el contrato"}
          </button>
          <p className="apd-nota">Al firmar queda guardado con la fecha, la hora y desde dónde firmaste.</p>
        </>
      )}
      {error && <p className="apd-aviso apd-aviso-error" role="alert">{error}</p>}
    </div>
  );
}
