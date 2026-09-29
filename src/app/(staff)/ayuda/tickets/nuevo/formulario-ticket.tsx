"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { crearTicket } from "../../acciones";

/**
 * Crear un ticket: asunto, descripción y captura opcional (de la galería o
 * un archivo: sin capture, es una captura de pantalla). La pantalla, el
 * navegador y la conversación con el asistente se adjuntan solos.
 */
export function FormularioTicket({
  asuntoInicial,
  descripcionInicial,
  pantalla,
  conversacionId,
  sinDocumentar,
}: {
  asuntoInicial: string;
  descripcionInicial: string;
  pantalla: string | null;
  conversacionId: string | null;
  sinDocumentar: boolean;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);

  async function enviar(formData: FormData) {
    setError(null);
    formData.set("navegador", `${navigator.userAgent} · ${window.innerWidth}×${window.innerHeight}`);
    const r = await envio.ejecutar(() => crearTicket(formData));
    if (r.error || !r.ticketId) return setError(r.error ?? "No se pudo crear el ticket.");
    router.push(`/ayuda/tickets/${r.ticketId}?creado=1`);
  }

  return (
    <form action={enviar} className="flex max-w-2xl flex-col gap-4">
      <Field label="Asunto" name="asunto" required defaultValue={asuntoInicial} maxLength={150} />
      <Textarea
        label="¿Qué pasó?"
        name="descripcion"
        required
        rows={6}
        defaultValue={descripcionInicial}
        ayuda="Qué querías hacer, qué hiciste y qué salió. Si salió un mensaje de error, cópialo tal cual."
      />
      <div className="flex flex-col gap-1.5">
        <label htmlFor="captura" className="text-sm font-medium text-n-800">
          Captura de pantalla (opcional)
        </label>
        <input id="captura" name="captura" type="file" accept="image/*" className="text-sm" />
      </div>
      <input type="hidden" name="pantalla" value={pantalla ?? ""} />
      <input type="hidden" name="conversacion_id" value={conversacionId ?? ""} />
      <input type="hidden" name="sin_documentar" value={sinDocumentar ? "1" : "0"} />
      <p className="text-sm text-n-600">
        Se adjuntan solos: {pantalla ? `la pantalla donde estabas (${pantalla}), ` : ""}tu negocio, tu usuario y rol, tu navegador
        {conversacionId ? " y lo que platicaste con el asistente" : ""}.
      </p>
      <AccionesFormulario error={error}>
        <Button type="submit" cargando={envio.cargando}>
          {envio.cargando ? "Mandando…" : "Mandar ticket"}
        </Button>
      </AccionesFormulario>
    </form>
  );
}
