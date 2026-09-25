"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import type { ResultadoAccion } from "@/lib/empleados/tipos";

/**
 * Un formulario de Empleados: los campos llegan como children (se
 * renderizan en el servidor), el envío pasa por la acción con tope y
 * spinner, y la confirmación o el error salen junto al botón.
 */
export function FormularioAccion({
  accion,
  textoBoton,
  textoExito = "Guardado",
  variante = "primario",
  reiniciar = false,
  children,
  className = "",
  otrosBotones,
}: {
  accion: (datos: FormData) => Promise<ResultadoAccion>;
  textoBoton: string;
  textoExito?: string;
  variante?: "primario" | "secundario" | "peligro" | "exito";
  reiniciar?: boolean;
  children?: ReactNode;
  className?: string;
  otrosBotones?: ReactNode;
}) {
  const router = useRouter();
  const envio = useEspera();
  const form = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  return (
    <form
      ref={form}
      className={`flex flex-col gap-4 ${className}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setExito(null);
        const res = await envio.ejecutar(() => accion(new FormData(e.currentTarget)));
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.ir) {
          router.push(res.ir);
          return;
        }
        setExito(res.exito ?? textoExito);
        if (reiniciar) form.current?.reset();
        router.refresh();
      }}
    >
      {children}
      <AccionesFormulario error={error} exito={exito}>
        <Button type="submit" variante={variante} cargando={envio.cargando}>
          {textoBoton}
        </Button>
        {otrosBotones}
      </AccionesFormulario>
    </form>
  );
}

/** Un botón que corre una acción sin datos (registrar entrada, aprobar…). */
export function BotonAccion({
  accion,
  texto,
  variante = "primario",
  textoExito,
}: {
  accion: () => Promise<ResultadoAccion>;
  texto: string;
  variante?: "primario" | "secundario" | "peligro" | "exito";
  textoExito?: string;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  return (
    <AccionesFormulario error={error} exito={exito}>
      <Button
        type="button"
        variante={variante}
        cargando={envio.cargando}
        onClick={async () => {
          setError(null);
          setExito(null);
          const res = await envio.ejecutar(accion);
          if (res.error) {
            setError(res.error);
            return;
          }
          if (res.ir) {
            router.push(res.ir);
            return;
          }
          setExito(res.exito ?? textoExito ?? "Listo");
          router.refresh();
        }}
      >
        {texto}
      </Button>
    </AccionesFormulario>
  );
}

/** Un formulario plegado detrás de un botón (corregir, rechazar, revertir…). */
export function Desplegable({ texto, children, variante = "secundario" }: { texto: string; children: ReactNode; variante?: "primario" | "secundario" | "peligro" }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <Button type="button" variante={variante} onClick={() => setAbierto(true)}>
        {texto}
      </Button>
    );
  }
  return (
    <div className="flex w-full flex-col gap-2 rounded-md border border-n-200 bg-n-50 p-3">
      {children}
      <button type="button" className="w-fit text-sm font-semibold text-n-600 hover:underline" onClick={() => setAbierto(false)}>
        Cerrar
      </button>
    </div>
  );
}
