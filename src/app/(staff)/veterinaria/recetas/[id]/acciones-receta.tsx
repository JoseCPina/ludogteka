"use client";

import { useState } from "react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { Textarea } from "@/components/ui/textarea";
import { BotonImprimirPagina } from "@/components/boton-imprimir";
import { FormularioAccion, Desplegable, BotonAccion } from "@/components/formulario-accion";
import { anularReceta, archivarReceta, enviarReceta } from "../actions";
import { Enlace } from "@/components/ui/enlace";

/** Imprimir, mandar al dueño por WhatsApp, anular y archivar una receta. */
export function AccionesReceta({
  id, numero, mascota, telefono, negocio, estado, puedeGestionar, archivada, conservarHasta,
}: {
  id: string; numero: number; mascota: string; telefono: string | null; negocio: string; estado: "emitida" | "anulada";
  puedeGestionar: boolean; archivada: boolean; conservarHasta: string;
}) {
  const envio = useEspera();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const digitos = (telefono ?? "").replace(/\D/g, "").slice(-10);
  const texto = (u: string) => `Hola, te mandamos la receta de ${mascota} (n.º ${numero}) de ${negocio}: ${u}`;

  async function generar() {
    setError(null);
    const r = await envio.ejecutar(() => enviarReceta(id));
    if (r.error || !r.url) {
      setError(r.error ?? "No pudimos generar la liga.");
      return;
    }
    setUrl(r.url);
  }

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-wrap items-center gap-3">
        <BotonImprimirPagina texto="Imprimir original y copias (o guardar PDF)" />
        {puedeGestionar && estado === "emitida" && (
          <Button type="button" variante="secundario" cargando={envio.cargando} onClick={generar}>Mandar al dueño por WhatsApp</Button>
        )}
      </div>
      {error && <AccionesFormulario error={error} exito={null}>{null}</AccionesFormulario>}
      {url && (
        <div className="flex max-w-xl flex-col gap-2 rounded-lg border border-n-200 bg-n-50 p-3">
          <p className="text-sm text-n-700">Esta liga muestra la receta al dueño. Solo se puede ver con ella; si la generas otra vez, la anterior deja de servir.</p>
          <CampoCopiable valor={url} etiqueta="Liga de la receta" />
          {digitos.length === 10 ? (
            <Enlace className="w-fit text-sm" href={`https://wa.me/52${digitos}?text=${encodeURIComponent(texto(url))}`} target="_blank" rel="noreferrer">
              Abrir WhatsApp con el mensaje listo
            </Enlace>
          ) : (
            <p className="text-sm text-ambar-oscuro">El dueño no tiene un teléfono de 10 dígitos: copia la liga y mándala por el medio que prefieras.</p>
          )}
        </div>
      )}
      {puedeGestionar && estado === "emitida" && (
        <Desplegable texto="Anular esta receta" variante="secundario">
          <FormularioAccion accion={anularReceta.bind(null, id)} textoBoton="Anular receta" variante="peligro">
            <Textarea label="Motivo de la anulación" name="motivo" rows={2} required ayuda="No se borra: queda anulada con este motivo y tu nombre. Una receta ya surtida no se puede anular." />
          </FormularioAccion>
        </Desplegable>
      )}
      {puedeGestionar && !archivada && (
        <div className="flex flex-col gap-1">
          <BotonAccion accion={archivarReceta.bind(null, id)} texto="Archivar" variante="secundario" textoExito="Archivada" />
          <p className="text-xs text-n-500">Se conserva hasta el {conservarHasta}; antes de esa fecha no se puede archivar.</p>
        </div>
      )}
    </div>
  );
}
