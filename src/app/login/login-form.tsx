"use client";

import { useActionState, useState } from "react";
import { iniciarSesion, type EstadoLogin } from "./actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

/**
 * Un solo campo para teléfono o correo, no dos pestañas.
 *
 * El cliente sabe su teléfono; el personal, su correo. Ninguno de los dos
 * debería tener que averiguar primero cuál de dos formularios le toca —
 * la app puede distinguir diez dígitos de una dirección con arroba sin
 * preguntarle a nadie.
 */
export function LoginForm({
  errorInicial = null,
  telefonoRecepcion,
}: {
  errorInicial?: string | null;
  // Null cuando el negocio todavía no lo captura: en ese caso no se
  // ofrece un botón de WhatsApp que llevaría a ningún lado, se dice qué
  // hacer.
  telefonoRecepcion: string | null;
}) {
  const estadoInicial: EstadoLogin = { error: errorInicial };
  const [estado, formAction, enviando] = useActionState(iniciarSesion, estadoInicial);
  const [ayuda, setAyuda] = useState(false);

  const mensaje =
    "Hola, soy cliente de Ludogteka y olvidé mi contraseña del portal. ¿Me la pueden restablecer? Mi teléfono es el de este WhatsApp.";
  const urlWhatsApp = telefonoRecepcion
    ? `https://wa.me/52${telefonoRecepcion}?text=${encodeURIComponent(mensaje)}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <form action={formAction} noValidate className="flex flex-col gap-5">
        {estado.error && (
          <Alert variante="error" titulo="No se pudo iniciar sesión">
            {estado.error}
          </Alert>
        )}
        <Field
          label="Teléfono o correo"
          name="identificador"
          type="text"
          inputMode="tel"
          autoComplete="username"
          autoFocus
          required
          ayuda="Si eres cliente, tu teléfono a diez dígitos."
        />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <Button type="submit" disabled={enviando} className="w-full">
          {enviando ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <button
        type="button"
        onClick={() => setAyuda((v) => !v)}
        className="self-center rounded text-sm font-semibold text-azul hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul-suave"
      >
        ¿Olvidaste tu contraseña?
      </button>

      {ayuda && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
          {urlWhatsApp ? (
            <>
              <p className="text-sm text-n-700">
                Escríbele a recepción por WhatsApp y te la restablecen en el momento. No hay correo
                de recuperación: tu cuenta va con tu teléfono.
              </p>
              <a href={urlWhatsApp} target="_blank" rel="noreferrer">
                <Button type="button" className="w-full">
                  Escribirle a recepción
                </Button>
              </a>
            </>
          ) : (
            <p className="text-sm text-n-700">
              Llámale a recepción o pásate al mostrador y te la restablecen en el momento. No hay
              correo de recuperación: tu cuenta va con tu teléfono.
            </p>
          )}
          <p className="text-sm text-n-600">
            Si eres del personal, pídele a un admin que te mande una invitación nueva.
          </p>
        </div>
      )}
    </div>
  );
}
