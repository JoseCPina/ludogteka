"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { useEspera } from "@/hooks/use-espera";
import { origenActual, pixelHerramienta } from "@/lib/herramientas/cliente";
import { GIROS_MERCADO, type GiroMercado } from "@/lib/mercado/catalogo";
import type { CiudadMercado } from "@/lib/mercado/ciudades";
import type { EntradaRecibelo } from "@/app/peludesk/herramientas/acciones";
import type { SalidaCaptura } from "@/lib/herramientas/captura";
import { BuscadorCiudad } from "./buscador-ciudad";
import { Selector } from "./selector";

/**
 * «Recíbelo por WhatsApp»: el único bloque de captura de las herramientas. Pide el WhatsApp (y el giro y la ciudad
 * si la herramienta no los tiene), nunca el correo. Al mandar: el prospecto se crea o completa con fuente
 * «herramienta», lo capturado queda ligado al teléfono para precargarlo al abrir la prueba, y el bot le manda el
 * resultado con la plantilla aprobada. El resultado ya está en pantalla: si el mensaje no sale, se dice y se ofrece
 * el link para copiarlo.
 */
export function ReciboPorWhatsApp({
  herramienta,
  accion,
  resumen,
  ruta,
  giro,
  ciudad,
  datos,
  titulo = "Recíbelo por WhatsApp",
  texto = "Te mandamos este resultado a tu WhatsApp para que lo tengas a la mano y, cada mes, el rango actualizado si lo quieres.",
  conReporteMensual = false,
}: {
  herramienta: string;
  accion: (e: EntradaRecibelo) => Promise<SalidaCaptura>;
  resumen: string;
  ruta: string;
  giro: GiroMercado | null;
  ciudad: CiudadMercado | null;
  datos?: Record<string, unknown>;
  titulo?: string;
  texto?: string;
  conReporteMensual?: boolean;
}) {
  const envio = useEspera();
  const [giroElegido, setGiroElegido] = useState<GiroMercado | null>(giro);
  const [ciudadElegida, setCiudadElegida] = useState<CiudadMercado | null>(ciudad);
  const [resultado, setResultado] = useState<SalidaCaptura | null>(null);
  const [error, setError] = useState<string | null>(null);
  const telefono = useRef<HTMLInputElement>(null);
  const nombre = useRef<HTMLInputElement>(null);
  const reporte = useRef<HTMLInputElement>(null);
  const trampa = useRef<HTMLInputElement>(null);
  const g = giro ?? giroElegido;
  const c = ciudad ?? ciudadElegida;
  const urlCompleta = typeof location !== "undefined" ? `${location.origin}${ruta}` : ruta;

  if (resultado && !resultado.error) {
    return (
      <div data-recibelo-listo className="hta-aparece rounded-2xl bg-menta-suave p-5 sm:p-6">
        <p className="text-lg font-bold text-n-900">{resultado.enviado ? "Listo: ya va en camino a tu WhatsApp." : "Guardado. Este es tu link:"}</p>
        {!resultado.enviado && <p className="mt-1 text-sm text-n-700">{resultado.motivo === "baja" ? "Tu número pidió no recibir mensajes de PeluDesk, así que no te lo mandamos; aquí lo tienes." : "El mensaje automático no salió en este momento; aquí tienes el link para guardarlo."}</p>}
        <div className="mt-3"><CampoCopiable valor={urlCompleta} etiqueta="Link a tu resultado" textoBoton="Copiar link" /></div>
        <p className="mt-4 text-n-800">
          Si quieres que estos números trabajen por ti, abre tu cuenta: lo que capturaste aquí se carga solo.{" "}
          <Link href={`/registro?utm_source=herramientas&utm_medium=${herramienta}`} className="hta-enlace">Probar PeluDesk 15 días gratis</Link>
        </p>
      </div>
    );
  }

  return (
    <form
      method="post"
      data-recibelo
      className="rounded-2xl border border-n-200 bg-white p-5 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        const tel = telefono.current?.value ?? "";
        if (tel.replace(/\D/g, "").length < 10) return setError("Escribe tu WhatsApp a diez dígitos.");
        if (!g) return setError("Dinos qué tipo de negocio tienes.");
        const res = await envio.ejecutar(() =>
          accion({
            herramienta,
            telefono: tel,
            nombre: nombre.current?.value ?? "",
            giro: g,
            ciudad: c?.nombre ?? null,
            resumen,
            ruta,
            datos: { ...(datos ?? {}), reporte_mensual: conReporteMensual ? reporte.current?.checked === true : false, giro: g, ciudad: c?.nombre ?? null },
            origen: origenActual(),
            ...(trampa.current?.value ? { sitio_web: trampa.current.value } : {}),
          } as EntradaRecibelo)
        );
        if (res.error) return setError(res.error);
        // El mismo event_id que mandó el servidor a la API de conversiones: Meta los cuenta como uno.
        pixelHerramienta("Lead", herramienta, res.eventId);
        setResultado(res);
      }}
    >
      <p className="text-lg font-bold text-n-900">{titulo}</p>
      <p className="mt-1 max-w-[56ch] text-n-700">{texto}</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${herramienta}-tel`} className="hta-etiqueta">Tu WhatsApp</label>
          <input id={`${herramienta}-tel`} ref={telefono} type="tel" inputMode="numeric" autoComplete="tel" placeholder="10 dígitos" className="hta-campo" required />
        </div>
        <div>
          <label htmlFor={`${herramienta}-nombre`} className="hta-etiqueta">Tu nombre (opcional)</label>
          <input id={`${herramienta}-nombre`} ref={nombre} type="text" autoComplete="given-name" placeholder="Para saludarte" className="hta-campo" />
        </div>
        {!giro && (
          <div className="sm:col-span-2">
            <Selector etiqueta="Tu negocio es" opciones={GIROS_MERCADO.map((x) => ({ clave: x.clave, nombre: x.nombre }))} valor={giroElegido} onChange={setGiroElegido} nombre="giro-captura" />
          </div>
        )}
        {!ciudad && (
          <div className="sm:col-span-2">
            <BuscadorCiudad valor={ciudadElegida} onChange={setCiudadElegida} />
          </div>
        )}
        {conReporteMensual && (
          <label className="flex items-start gap-3 text-sm text-n-800 sm:col-span-2">
            <input ref={reporte} type="checkbox" defaultChecked className="mt-1 h-5 w-5 accent-morado" />
            <span>Mándame el rango actualizado cada mes, el día 1. Un mensaje al mes; responde BAJA cuando quieras.</span>
          </label>
        )}
        <input ref={trampa} type="text" name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden className="hidden" />
      </div>
      <AccionesFormulario error={error}>
        <Button type="submit" cargando={envio.cargando} sinBloqueo>Mandármelo por WhatsApp</Button>
      </AccionesFormulario>
      <p className="mt-3 text-xs leading-relaxed text-n-600">
        Solo usamos tu número para mandarte esto y, si quieres, ofrecerte PeluDesk. Nunca pedimos correo.{" "}
        <Link href="/aviso-de-privacidad" className="underline underline-offset-2">Aviso de privacidad</Link>.
      </p>
    </form>
  );
}
