"use client";

import { useActionState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { formatearTelefono } from "@/lib/telefono";
import { actualizarMisDatos, type EstadoMisDatos } from "./actions";

const ESTADO_INICIAL: EstadoMisDatos = { error: null };

export function MisDatosForm({
  nombre,
  telefono,
  email,
  recordatorios = true,
}: {
  nombre: string;
  telefono: string;
  email: string | null;
  /** Acepta los recordatorios automáticos por WhatsApp. */
  recordatorios?: boolean;
}) {
  const [estado, formAction, enviando] = useActionState(useAccionConTope(actualizarMisDatos), ESTADO_INICIAL);

  return (
    <div className="max-w-lg rounded-lg border border-n-200 bg-white p-5">
      <h2 className="mb-1 text-lg font-bold text-n-900">Tus datos</h2>
      <p className="mb-4 text-sm text-n-600">
        Tu nombre lo maneja recepción — si está mal, avísales directamente.
      </p>

      <form action={formAction} className="flex flex-col gap-4">
        {estado.error && (
          <Alert variante="error" titulo="No se pudo guardar">
            {estado.error}
          </Alert>
        )}
        {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}

        <div>
          <p className="mb-1.5 text-sm font-semibold text-n-800">Nombre</p>
          <p className="flex min-h-12 items-center rounded-md border-[1.5px] border-n-200 bg-n-50 px-3.5 text-n-600">
            {nombre}
          </p>
        </div>

        <Field
          label="Teléfono"
          name="telefono"
          required
          disabled={enviando}
          defaultValue={formatearTelefono(telefono)}
          placeholder="444 123 4567"
          ayuda="10 dígitos. Puedes escribirlo con espacios o guiones."
        />
        <Field
          label="Correo"
          name="email"
          type="email"
          placeholder="nombre@correo.com"
          disabled={enviando}
          defaultValue={email ?? ""}
        />

        <input type="hidden" name="recordatorios_whatsapp_presente" value="1" />
        <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900" data-consentimiento-recordatorios>
          <input type="checkbox" name="recordatorios_whatsapp" value="si" defaultChecked={recordatorios} disabled={enviando} className="mt-1 h-4 w-4" />
          <span>
            Quiero recibir recordatorios por WhatsApp
            <span className="block text-sm text-n-600">De mis citas, llegadas y vacunas, desde el número de PeluDesk con el nombre del negocio. También puedo darme de baja respondiendo BAJA.</span>
          </span>
        </label>

        <AccionesFormulario error={estado.error} exito={estado.ok && "Cambios guardados"}>
          <Button type="submit" cargando={enviando}>
            {enviando ? "Guardando…" : "Guardar cambios"}
          </Button>
        </AccionesFormulario>
      </form>
    </div>
  );
}
