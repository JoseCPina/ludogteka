"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { useAccionConTope } from "@/hooks/use-espera";
import { iniciarSesion, type EstadoLogin } from "./actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { WHATSAPP_SOPORTE_LINK } from "@/lib/peludesk/respuestas-fijas";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";

/**
 * QA S36: dos entradas, «Soy cliente» y «Soy del equipo». El cliente entra con su teléfono; el equipo, con su correo o
 * su teléfono. Las dos van al mismo inicio de sesión (la app distingue diez dígitos de una dirección con arroba) y lo
 * que cambia es lo que se le dice a cada quien, sobre todo si olvidó su contraseña: al cliente se la restablece
 * recepción; a alguien del equipo, un admin de su negocio desde Empleados.
 */
export function LoginForm({
  errorInicial = null,
  telefonoRecepcion,
  nombreNegocio,
  unSoloAdmin = false,
}: {
  nombreNegocio: string;
  // QA S22: el negocio tiene un solo admin (el dueño): no hay «otro admin» a quien pedírsela.
  unSoloAdmin?: boolean;
  errorInicial?: string | null;
  // Null cuando el negocio todavía no lo captura: en ese caso no se
  // ofrece un botón de WhatsApp que llevaría a ningún lado, se dice qué
  // hacer.
  telefonoRecepcion: string | null;
}) {
  const estadoInicial: EstadoLogin = { error: errorInicial };
  const [estado, formAction, enviando] = useActionState(useAccionConTope(iniciarSesion), estadoInicial);
  const [ayuda, setAyuda] = useState(false);
  const [identificador, setIdentificador] = useState("");
  const [quien, setQuien] = useState<"cliente" | "equipo">("cliente");
  const esEquipo = quien === "equipo";

  const mensaje =
    `Hola, soy cliente de ${nombreNegocio} y olvidé mi contraseña del portal. ¿Me la pueden restablecer? Mi teléfono es el de este WhatsApp.`;
  const urlWhatsApp = telefonoRecepcion
    ? `https://wa.me/52${telefonoRecepcion}?text=${encodeURIComponent(mensaje)}`
    : null;

  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label="¿Quién entra?" className="grid grid-cols-2 gap-1 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-1">
        {(["cliente", "equipo"] as const).map((q) => (
          <button
            key={q}
            type="button"
            role="tab"
            aria-selected={quien === q}
            onClick={() => {
              setQuien(q);
              setAyuda(false);
            }}
            className={`min-h-11 rounded-md text-sm font-semibold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave ${quien === q ? "bg-white text-morado shadow-sm" : "text-n-700 hover:text-n-900"}`}
            data-entrar-como={q}
          >
            {q === "cliente" ? "Soy cliente" : "Soy del equipo"}
          </button>
        ))}
      </div>
      <form action={formAction} noValidate className="flex flex-col gap-5">
        <input type="hidden" name="quien" value={quien} />
        <Field
          key={quien}
          label={esEquipo ? "Teléfono o correo" : "Teléfono"}
          name="identificador"
          // El equipo puede entrar con correo: teclado completo. El cliente, con su teléfono: teclado numérico.
          type="text"
          inputMode={esEquipo ? "text" : "tel"}
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          required
          placeholder={esEquipo ? "Tu correo o tu teléfono a 10 dígitos" : "10 dígitos"}
          // Controlado: tras un intento fallido React limpia el formulario y solo la contraseña debe vaciarse.
          value={identificador}
          onChange={(e) => setIdentificador(e.target.value)}
          ayuda={esEquipo ? "El correo o el teléfono con el que te dieron de alta en el equipo." : "El teléfono a diez dígitos con el que te registraste."}
        />
        <Field
          label="Contraseña"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <AccionesFormulario error={estado.error}>
          <Button type="submit" cargando={enviando} className="w-full">
            {enviando ? "Entrando…" : "Entrar"}
          </Button>
        </AccionesFormulario>
      </form>

      <button
        type="button"
        onClick={() => setAyuda((v) => !v)}
        className="self-center rounded text-sm font-semibold text-morado hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
      >
        ¿Olvidaste tu contraseña?
      </button>

      {ayuda && !esEquipo && (
        <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4" data-recuperar="cliente">
          {urlWhatsApp ? (
            <>
              <p className="text-sm text-n-700">
                Escríbele a recepción por WhatsApp: te la restablecen en el momento y te mandan una
                contraseña temporal para entrar con tu teléfono.
              </p>
              <a href={urlWhatsApp} target="_blank" rel="noreferrer">
                <Button type="button" className="w-full">
                  Escribirle a recepción
                </Button>
              </a>
            </>
          ) : (
            <p className="text-sm text-n-700">
              Llámale a recepción o pásate al mostrador: te la restablecen en el momento y te dan una
              contraseña temporal para entrar con tu teléfono.
            </p>
          )}
        </div>
      )}
      {ayuda && esEquipo && (
        <div className="flex flex-col gap-2 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4 text-sm text-n-700" data-recuperar="equipo">
          <p>
            Tu contraseña la restablece un admin de tu negocio desde <strong>Empleados</strong> → tu ficha → «Restablecer contraseña» (o desde
            Administración → Cuentas): te da una contraseña temporal y, al entrar, escoges una nueva.
          </p>
          {unSoloAdmin ? (
            <p data-recuperar-un-admin>
              Si eres el dueño y el único admin,{" "}
              <a href={WHATSAPP_SOPORTE_LINK} target="_blank" rel="noreferrer" className="font-semibold text-morado hover:underline">escríbenos por WhatsApp a PeluDesk</a>{" "}
              y te ayudamos a recuperarla. La contraseña de un cliente la restableces tú desde su ficha, en{" "}
              <Link href="/clientes" className="font-semibold text-morado hover:underline">Clientes</Link> → el cliente → «Contraseña del portal».
            </p>
          ) : (
            <p>Si la que olvidaste es la de un admin, pídesela a otro admin del negocio.</p>
          )}
        </div>
      )}
    </div>
  );
}
