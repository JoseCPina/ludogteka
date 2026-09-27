"use client";

import { useActionState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { registrarPrueba, type EstadoRegistro } from "./actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";

export function RegistroForm() {
  const [estado, accion, enviando] = useActionState(useAccionConTope(registrarPrueba), { error: null } as EstadoRegistro);
  const v = estado.valores;
  return (
    <form action={accion} className="flex flex-col gap-5">
      {estado.error && (
        <Alert variante="error" titulo="No se pudo abrir tu negocio">
          {estado.error}
        </Alert>
      )}
      <Field label="Tu nombre" name="nombre" autoComplete="name" required defaultValue={v?.nombre} />
      <Field label="Nombre de tu negocio" name="negocio" autoComplete="organization" required defaultValue={v?.negocio} ayuda="Con él se arma tu dirección: nombre.peludesk.mx" />
      <Field label="Ciudad" name="ciudad" autoComplete="address-level2" defaultValue={v?.ciudad} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1.5 text-sm font-medium text-n-800">¿Qué ofrece tu negocio?</legend>
        {[
          ["estetica", "Estética"],
          ["guarderia", "Guardería"],
          ["hotel", "Hotel"],
        ].map(([valor, etiqueta]) => (
          <label key={valor} className="flex min-h-11 items-center gap-3 rounded-md border-[1.5px] border-borde bg-white px-3.5 text-n-900 has-[:checked]:border-morado has-[:checked]:bg-morado-suave/40">
            <input type="checkbox" name="servicios" value={valor} defaultChecked={v?.servicios.includes(valor)} className="h-5 w-5 accent-morado" />
            {etiqueta}
          </label>
        ))}
        <p className="text-sm text-n-600">Dejamos prendido solo eso; lo demás lo prendes cuando quieras.</p>
      </fieldset>
      <Field label="Teléfono" name="telefono" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={v?.telefono} ayuda="A diez dígitos. Con él entras a PeluDesk." />
      <Field label="Contraseña" name="password" type="password" autoComplete="new-password" required minLength={8} ayuda="Al menos 8 caracteres." />
      {/* Campo trampa: una persona no lo ve ni lo llena. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Sitio web
          <input name="sitio_web" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      <AccionesFormulario error={estado.error}>
        <Button type="submit" cargando={enviando} className="w-full">
          {enviando ? "Abriendo tu negocio…" : "Abrir mi negocio"}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
