"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import type { ResultadoPlataforma } from "@/lib/plataforma/tipos";

/**
 * Un formulario de la administración de PeluDesk: los campos llegan como
 * children, el envío va con tope y spinner, y lo que regresa la acción (un
 * link de un solo uso, una contraseña temporal) sale con CampoCopiable
 * junto al botón.
 */
export function FormularioPlataforma({
  accion,
  textoBoton,
  variante = "primario",
  reiniciar = false,
  children,
  className = "",
}: {
  accion: (datos: FormData) => Promise<ResultadoPlataforma>;
  textoBoton: string;
  variante?: "primario" | "secundario" | "peligro" | "exito";
  reiniciar?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const envio = useEspera();
  const form = useRef<HTMLFormElement>(null);
  const [resultado, setResultado] = useState<ResultadoPlataforma | null>(null);

  return (
    <form
      ref={form}
      className={`flex flex-col gap-4 ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setResultado(null);
        const res = await envio.ejecutar(() => accion(new FormData(e.currentTarget)));
        setResultado(res);
        if (res.error) return;
        if (res.ir && !res.link && !res.password) {
          router.push(res.ir);
          return;
        }
        if (reiniciar) form.current?.reset();
        router.refresh();
      }}
    >
      {children}
      <AccionesFormulario error={resultado?.error} exito={resultado && !resultado.error ? resultado.exito ?? true : null}>
        <Button type="submit" variante={variante} cargando={envio.cargando}>
          {textoBoton}
        </Button>
      </AccionesFormulario>
      {resultado?.link && <CampoCopiable valor={resultado.link} etiqueta="Link para escoger contraseña (un solo uso)" textoBoton="Copiar link" />}
      {resultado?.password && <CampoCopiable valor={resultado.password} etiqueta="Contraseña temporal" monoespaciado />}
      {resultado?.urlWhatsApp && (
        <a href={resultado.urlWhatsApp} target="_blank" rel="noopener noreferrer" className="self-start text-sm font-semibold text-morado hover:underline">
          Mandársela por WhatsApp →
        </a>
      )}
      {resultado?.ir && (resultado.link || resultado.password || resultado.error) && (
        <a href={resultado.ir} className="self-start text-sm font-semibold text-morado hover:underline">Ir a la ficha del negocio →</a>
      )}
    </form>
  );
}
