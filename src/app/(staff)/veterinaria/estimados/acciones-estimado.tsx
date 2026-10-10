"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { BotonAccion, Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { PadFirma } from "@/components/firma-pad";
import { wa } from "@/lib/veterinaria/expediente";
import { aceptarEnMostrador, cancelarEstimado, enviarEstimado, versionNuevaEstimado } from "../expediente/actions";

/** Mandar el estimado al dueño: se genera una liga nueva (la anterior deja de servir) y se ofrece por WhatsApp. */
export function EnviarEstimado({ id, telefono, mascota, titulo, yaEnviado }: { id: string; telefono: string | null; mascota: string; titulo: string; yaEnviado: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const mensaje = url ? `Hola, te compartimos el estimado de ${titulo} para ${mascota}. Puedes revisarlo y aceptarlo aquí: ${url}` : "";
  const enlace = url ? wa(telefono, mensaje) : null;
  return (
    <div className="flex flex-col gap-3">
      <AccionesFormulario error={error} exito={null}>
        <Button
          type="button"
          cargando={envio.cargando}
          onClick={async () => {
            setError(null);
            const r = await envio.ejecutar(() => enviarEstimado(id));
            if (r.error) return setError(r.error);
            setUrl(r.url ?? null);
            router.refresh();
          }}
        >
          {yaEnviado ? "Generar una liga nueva" : "Enviar el estimado"}
        </Button>
      </AccionesFormulario>
      {url && (
        <div className="flex flex-col gap-2 rounded-md border border-menta bg-menta-suave p-3">
          <p className="text-sm font-semibold text-n-900">Esta liga solo se muestra ahora. Mándasela al dueño:</p>
          <CampoCopiable valor={url} etiqueta="Liga del estimado" />
          {enlace ? (
            <a href={enlace} target="_blank" rel="noopener" className="w-fit text-sm font-semibold text-morado underline">Abrir WhatsApp con el mensaje</a>
          ) : (
            <p className="text-sm text-n-600">El dueño no tiene un teléfono de 10 dígitos: copia la liga y mándasela por otro medio.</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Aceptación en el mostrador: el nombre de quien acepta y, si se quiere, su firma en la pantalla. */
export function AceptarEnMostrador({ id }: { id: string }) {
  const [firma, setFirma] = useState<string | null>(null);
  return (
    <Desplegable texto="Registrar aceptación en mostrador" variante="primario">
      <FormularioAccion accion={(fd) => aceptarEnMostrador(id, firma, fd)} textoBoton="Registrar aceptación" textoExito="Aceptado">
        <Field label="Nombre de quien acepta" name="nombre" required ayuda="El dueño o quien lo representa." />
        <PadFirma onFirma={setFirma} etiqueta="Firma en pantalla (opcional)" />
        <p className="text-sm text-n-600">Al aceptar, el mínimo de cada línea pasa a la cuenta de la mascota y se cobra en Caja.</p>
      </FormularioAccion>
    </Desplegable>
  );
}

export function VersionNueva({ id }: { id: string }) {
  return <BotonAccion texto="Hacer una versión nueva" variante="secundario" accion={() => versionNuevaEstimado(id)} />;
}

export function CancelarEstimado({ id }: { id: string }) {
  return (
    <Desplegable texto="Cancelar el estimado" variante="peligro">
      <FormularioAccion accion={(fd) => cancelarEstimado(id, fd)} textoBoton="Cancelar el estimado" variante="peligro" textoExito="Estimado cancelado">
        <Field label="¿Por qué se cancela?" name="motivo" required />
      </FormularioAccion>
    </Desplegable>
  );
}
