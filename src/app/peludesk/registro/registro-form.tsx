"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useAccionConTope } from "@/hooks/use-espera";
import { registrarPrueba, type EstadoRegistro } from "./actions";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { Alert } from "@/components/ui/alert";
import { enviarEventoPixel, pixelCargado } from "@/lib/peludesk/pixel-cliente";
import { DOCUMENTOS_LEGALES } from "@/lib/peludesk/legal";
import type { ParametroOrigen } from "@/lib/peludesk/origen";

export function RegistroForm({ origen }: { origen: Partial<Record<ParametroOrigen, string>> }) {
  const [estado, accion, enviando] = useActionState(useAccionConTope(registrarPrueba), { error: null } as EstadoRegistro);
  const v = estado.valores;
  const empezado = useRef(false);
  const referente = useRef<HTMLInputElement>(null);

  // De qué sitio venía (solo el dominio, y solo si no es el propio).
  useEffect(() => {
    try {
      const host = document.referrer ? new URL(document.referrer).host : "";
      if (host && host !== location.host && referente.current) referente.current.value = host;
    } catch {
      // sin referente
    }
  }, []);

  // El registro salió bien: CompleteRegistration al píxel (si aceptó marketing) y entrar a su negocio.
  useEffect(() => {
    if (!estado.destino) return;
    const destino = estado.destino;
    const conPixel = pixelCargado();
    enviarEventoPixel("CompleteRegistration", { content_name: "negocio_de_prueba" }, estado.eventId);
    const t = window.setTimeout(() => window.location.assign(destino), conPixel ? 500 : 0);
    return () => window.clearTimeout(t);
  }, [estado.destino, estado.eventId]);

  return (
    <form
      action={accion}
      className="flex flex-col gap-5"
      // InitiateCheckout: la primera vez que la persona toca un campo, o sea, empieza a registrarse.
      onFocusCapture={() => {
        if (empezado.current) return;
        empezado.current = true;
        enviarEventoPixel("InitiateCheckout", { content_name: "registro_prueba" });
      }}
    >
      {estado.error && (
        <Alert variante="error" titulo="No se pudo abrir tu negocio">
          {estado.error}
        </Alert>
      )}
      {(Object.entries(origen) as [ParametroOrigen, string][]).map(([k, val]) => (
        <input key={k} type="hidden" name={k} value={val} />
      ))}
      <input ref={referente} type="hidden" name="referente" defaultValue="" />
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
      <label className="flex items-start gap-3 rounded-md border-[1.5px] border-borde bg-white p-3.5 text-sm leading-relaxed text-n-800 has-[:checked]:border-morado has-[:checked]:bg-morado-suave/40">
        <input type="checkbox" name="acepto" required defaultChecked={false} className="mt-0.5 h-5 w-5 shrink-0 accent-morado" />
        <span>
          Leí y acepto los{" "}
          <Link href={DOCUMENTOS_LEGALES.terminos.ruta} target="_blank" className="font-semibold text-morado underline underline-offset-2">
            términos y condiciones
          </Link>{" "}
          y el{" "}
          <Link href={DOCUMENTOS_LEGALES.aviso_privacidad.ruta} target="_blank" className="font-semibold text-morado underline underline-offset-2">
            aviso de privacidad
          </Link>
          . <span className="text-n-600">Menteo, S.A.S. usará tus datos para abrir tu cuenta y darte el servicio; nunca los vende.</span>
        </span>
      </label>
      <AccionesFormulario error={estado.error}>
        <Button type="submit" cargando={enviando || Boolean(estado.destino)} className="w-full">
          {enviando || estado.destino ? "Abriendo tu negocio…" : "Abrir mi negocio"}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
