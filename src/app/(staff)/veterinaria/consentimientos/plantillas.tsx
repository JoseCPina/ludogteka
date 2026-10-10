"use client";

import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Desplegable, FormularioAccion } from "@/components/formulario-accion";
import { CAMPOS_CONSENTIMIENTO } from "@/lib/veterinaria/carnet";
import { guardarPlantillaConsentimiento } from "./actions";

export function EditorPlantilla({ tipo, titulo, cuerpo }: { tipo: string; titulo: string; cuerpo: string }) {
  return (
    <Desplegable texto="Editar el texto">
      <FormularioAccion accion={(fd) => guardarPlantillaConsentimiento(tipo, fd)} textoBoton="Guardar como versión nueva">
        <Field label="Título" name="titulo" defaultValue={titulo} required />
        <Textarea label="Texto" name="cuerpo" rows={14} defaultValue={cuerpo} required />
        <div className="text-sm text-n-600">
          <p className="font-semibold text-n-800">Campos que se llenan solos (escríbelos entre dobles llaves):</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {CAMPOS_CONSENTIMIENTO.map((c) => (
              <code key={c.clave} title={`${c.etiqueta}, por ejemplo: ${c.ejemplo}`} className="rounded bg-n-100 px-1.5 py-0.5 text-xs text-n-800">
                {`{{${c.clave}}}`}
              </code>
            ))}
          </p>
        </div>
      </FormularioAccion>
    </Desplegable>
  );
}
