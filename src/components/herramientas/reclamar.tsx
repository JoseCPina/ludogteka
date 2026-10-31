"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { useEspera } from "@/hooks/use-espera";
import { origenActual, pixelHerramienta, registrarEventoCliente } from "@/lib/herramientas/cliente";
import type { EstadoReclamo } from "@/lib/directorio/reclamo";
import { consultarReclamo, pedirCodigoReclamo } from "@/app/peludesk/directorio/acciones";

/**
 * «¿Es tu negocio? Reclámalo»: pide el WhatsApp, enseña el código y el botón que abre WhatsApp con «RECLAMO ABC123»
 * hacia el número de PeluDesk; mientras, pregunta cada 4 s si ya llegó. Verificado, el botón abre la prueba gratis
 * con la ficha como su página web (?prospecto=<slug>&reclamo=<id>). Nunca pide correo.
 */
export function Reclamar({ slug, nombre }: { slug: string; nombre: string }) {
  const envio = useEspera();
  const [reclamo, setReclamo] = useState<EstadoReclamo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const telefono = useRef<HTMLInputElement>(null);
  const trampa = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!reclamo || reclamo.estado !== "pendiente") return;
    let vivo = true;
    const t = window.setInterval(async () => {
      const r = await consultarReclamo(reclamo.id);
      if (vivo && r.reclamo && r.reclamo.estado !== "pendiente") setReclamo(r.reclamo);
    }, 4000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [reclamo]);

  const registro = `/registro?${new URLSearchParams({ prospecto: slug, reclamo: reclamo?.id ?? "", utm_source: "herramientas", utm_medium: "directorio", utm_campaign: "reclamo" })}`;

  if (reclamo?.estado === "verificado" || reclamo?.estado === "registrado") {
    return (
      <div data-reclamo-verificado className="hta-aparece rounded-2xl bg-menta-suave p-5 sm:p-6">
        <p className="text-lg font-bold text-n-900">Listo: verificamos que {nombre} es tuyo.</p>
        <p className="mt-1 text-n-700">
          Abre tu prueba gratis de 15 días y esta ficha queda como tu página web en PeluDesk, con la insignia «Negocio verificado». Sin tarjeta.
          {reclamo.telefonoCoincide ? "" : " Tu WhatsApp no es el que aparece en Google: en tu página podrás poner el que quieras."}
        </p>
        <Link href={registro} className="hta-boton mt-4" data-boton-prueba-reclamo>Abrir mi prueba con mi ficha</Link>
      </div>
    );
  }

  if (reclamo) {
    return (
      <div data-reclamo-pendiente className="hta-aparece rounded-2xl border border-n-200 bg-white p-5 sm:p-6">
        <p className="hta-etiqueta">Paso 2 de 2</p>
        <p className="text-lg font-bold text-n-900">Mándanos este código por WhatsApp desde tu número</p>
        <p className="mt-1 text-n-700">Así comprobamos que el teléfono es tuyo. En cuanto llegue, esta página lo detecta sola.</p>
        <div className="mt-4"><CampoCopiable valor={`RECLAMO ${reclamo.codigo}`} etiqueta="Tu código" textoBoton="Copiar" monoespaciado /></div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {reclamo.waUrl ? (
            <a href={reclamo.waUrl} target="_blank" rel="noopener noreferrer" className="hta-boton">Abrir WhatsApp con el código</a>
          ) : (
            <p className="text-sm text-coral-oscuro">El WhatsApp de PeluDesk no está disponible en este momento; intenta más tarde.</p>
          )}
          <span className="inline-flex items-center gap-2 text-sm text-n-600" aria-live="polite">
            <span className="h-2 w-2 animate-pulse rounded-full bg-morado" aria-hidden /> Esperando tu mensaje…
          </span>
        </div>
      </div>
    );
  }

  return (
    <form
      method="post"
      data-reclamar
      className="rounded-2xl border border-n-200 bg-white p-5 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const tel = telefono.current?.value ?? "";
        if (tel.replace(/\D/g, "").length < 10) return setError("Escribe tu WhatsApp a diez dígitos.");
        registrarEventoCliente("directorio", "uso");
        const r = await envio.ejecutar(() => pedirCodigoReclamo({ slug, telefono: tel, origen: origenActual(), ...(trampa.current?.value ? { sitio_web: trampa.current.value } : {}) }));
        if (r.error) return setError(r.error);
        if (r.reclamo) {
          pixelHerramienta("Lead", "directorio");
          setReclamo(r.reclamo);
        }
      }}
    >
      <p className="hta-etiqueta">Paso 1 de 2</p>
      <p className="text-lg font-bold text-n-900">¿Es tu negocio? Reclámalo</p>
      <p className="mt-1 max-w-[56ch] text-n-700">Deja tu WhatsApp, te damos un código y nos lo mandas desde tu número. Con eso la ficha es tuya: la conviertes en tu página web con la insignia «Negocio verificado».</p>
      <div className="mt-4 max-w-sm">
        <label htmlFor="reclamo-tel" className="hta-etiqueta">Tu WhatsApp</label>
        <input id="reclamo-tel" ref={telefono} type="tel" inputMode="numeric" autoComplete="tel" placeholder="10 dígitos" className="hta-campo" required />
        <input ref={trampa} type="text" name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      </div>
      <AccionesFormulario error={error}>
        <Button type="submit" cargando={envio.cargando} sinBloqueo>Pedir mi código</Button>
      </AccionesFormulario>
      <p className="mt-3 text-xs leading-relaxed text-n-600">
        Solo usamos tu número para verificar el reclamo y, si quieres, ofrecerte PeluDesk. Nunca pedimos correo.{" "}
        <Link href="/aviso-de-privacidad" className="underline underline-offset-2">Aviso de privacidad</Link>.
      </p>
    </form>
  );
}
