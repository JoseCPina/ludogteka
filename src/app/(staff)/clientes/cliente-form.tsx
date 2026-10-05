"use client";

import { useActionState, useState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { useModulos } from "@/components/modulos-contexto";
import type { EstadoClienteForm } from "./actions";

const ESTADO_INICIAL: EstadoClienteForm = { error: null };

export function ClienteForm({
  action,
  valoresIniciales,
  textoBoton,
  pedirDireccion = false,
  corta = false,
}: {
  action: (estadoPrevio: EstadoClienteForm, formData: FormData) => Promise<EstadoClienteForm>;
  valoresIniciales?: { nombre: string; telefono: string; email: string | null };
  textoBoton: string;
  // Solo en el alta. En la ficha de un cliente que ya existe, la
  // direccion se edita en "Distancia y recoleccion", que ademas muestra
  // la distancia calculada y el ajuste manual: dos campos de direccion en
  // la misma pantalla serian dos fuentes de verdad compitiendo.
  pedirDireccion?: boolean;
  // Alta corta (viene de agendar una cita de estética): solo nombre y
  // WhatsApp. La dirección solo se pide si el cliente quiere recolección.
  corta?: boolean;
}) {
  const { tiene } = useModulos();
  const [quiereRecoleccion, setQuiereRecoleccion] = useState(false);
  const [estado, formAction, enviando] = useActionState(useAccionConTope(action), ESTADO_INICIAL);

  return (
    <form action={formAction} className="flex max-w-lg flex-col gap-4">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {estado.error}
        </Alert>
      )}
      {estado.ok && <Alert variante="exito" titulo="Cambios guardados" />}

      <Field
        label="Nombre del dueño"
        name="nombre"
        required
        disabled={enviando}
        defaultValue={valoresIniciales?.nombre}
      />
      <Field
        label={corta ? "WhatsApp" : "Teléfono"}
        name="telefono"
        inputMode="tel"
        required
        disabled={enviando}
        defaultValue={valoresIniciales?.telefono}
        ayuda="10 dígitos. Puedes escribirlo con espacios, guiones o paréntesis."
      />
      {!corta && (
        <Field
          label="Correo (opcional)"
          name="email"
          type="email"
          disabled={enviando}
          defaultValue={valoresIniciales?.email ?? ""}
        />
      )}

      {pedirDireccion && corta && tiene("recoleccion") && (
        <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900">
          <input type="checkbox" checked={quiereRecoleccion} onChange={(e) => setQuiereRecoleccion(e.target.checked)} className="mt-1 h-4 w-4" />
          <span>Quiere que pasemos por su perro a su casa</span>
        </label>
      )}

      {pedirDireccion && (!corta || (quiereRecoleccion && tiene("recoleccion"))) && (
        <Field
          label="Dirección (opcional)"
          name="direccion"
          disabled={enviando}
          ayuda="Si la capturas ahora, se calcula la distancia para cotizar la recolección a domicilio. Se puede agregar después."
        />
      )}

      <AccionesFormulario error={estado.error} exito={estado.ok && "Cambios guardados"}>
        <Button type="submit" cargando={enviando}>
          {enviando ? "Guardando…" : textoBoton}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
