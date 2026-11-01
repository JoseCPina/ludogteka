"use client";

import { ButtonHTMLAttributes, forwardRef, useEffect, useState, useSyncExternalStore } from "react";
import { Spinner } from "./spinner";

/**
 * UX (1 de noviembre de 2026): los TRES botones del panel. Lo que ejecuta una acción es botón; lo que navega es
 * `<Enlace>` (src/components/ui/enlace.tsx).
 *   · `primario`: relleno morado, la acción principal de la pantalla o del formulario.
 *   · `secundario`: blanco con borde, todo lo demás (cancelar, abrir, filtrar, copiar).
 *   · `peligro` (destructivo): relleno coral OSCURO (blanco sobre coral claro no pasa AA: 2.37:1).
 * Todos llevan cursor de mano, hover, foco visible y 48 px de alto (44 px con `tamano="compacto"`).
 * Ver scripts/diseno/contraste.mjs.
 */
export type VarianteBoton = "primario" | "secundario" | "peligro";
const clasesPorVariante: Record<VarianteBoton, string> = {
  primario: "bg-morado text-white shadow-sm hover:bg-morado-oscuro active:bg-morado-oscuro",
  secundario: "bg-white text-n-900 border-[1.5px] border-borde hover:border-morado hover:bg-morado-suave hover:text-morado-oscuro",
  peligro: "bg-coral-oscuro text-white shadow-sm hover:bg-coral-hondo active:bg-coral-hondo",
};
const clasesPorTamano = {
  normal: "min-h-12 min-w-12 px-5 text-base",
  compacto: "min-h-11 min-w-11 px-4 text-sm",
};

/** Pasados 3 s esperando, el botón lo dice: «Sigue trabajando…» en vez de parecer colgado. */
export const LENTO_MS = 3000;

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: VarianteBoton;
  tamano?: keyof typeof clasesPorTamano;
  // Mientras espera al servidor: se deshabilita, marca `aria-busy` y muestra el giro (y `textoCargando`, si viene) en
  // el mismo instante del toque. Es la ÚNICA forma de "cargando" de la app.
  cargando?: boolean;
  /** Lo que dice mientras espera («Guardando…»); sin él conserva su texto junto al giro. */
  textoCargando?: string;
  // QA N151: con el negocio en solo lectura (prueba vencida, falta de pago), un botón con `cargando` llama al servidor
  // y se bloquea (src/lib/cobro/bloqueo-escritura.ts). Uno que solo LEE (buscar, exportar) o que sirve para salir del
  // bloqueo (contratar, pagar) lleva `sinBloqueo`.
  sinBloqueo?: boolean;
};

// QA S16 (N58): antes de que la página se hidrate, un botón que envía un formulario manejado por React mandaría el
// formulario «a la antigua» (GET, con los datos en la URL). Un botón de envío se deshabilita hasta hidratar.
const suscribirNada = () => () => {};
const useHidratado = () => useSyncExternalStore(suscribirNada, () => true, () => false);

/** `true` cuando `cargando` lleva más de 3 s prendido (lo usan `<Button>` y `<Alternar>`). */
export function useLento(cargando: boolean | undefined) {
  const [lento, setLento] = useState(false);
  const [antes, setAntes] = useState(cargando);
  if (antes !== cargando) {
    setAntes(cargando);
    if (!cargando) setLento(false);
  }
  useEffect(() => {
    if (!cargando) return;
    const t = setTimeout(() => setLento(true), LENTO_MS);
    return () => clearTimeout(t);
  }, [cargando]);
  return lento && !!cargando;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variante = "primario", tamano = "normal", className = "", cargando, textoCargando, sinBloqueo = false, disabled, children, type, ...props }, ref) => {
    const hidratado = useHidratado();
    const lento = useLento(cargando);
    const envia = type !== "button" && type !== "reset";
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || cargando || (envia && !hidratado)}
        data-ui="boton"
        data-variante={variante}
        data-hidratado={hidratado ? undefined : "no"}
        data-tope={cargando !== undefined ? "" : undefined}
        data-escritura={cargando !== undefined && !sinBloqueo ? "" : undefined}
        data-sin-bloqueo={sinBloqueo ? "" : undefined}
        aria-busy={cargando || undefined}
        className={`inline-flex cursor-pointer select-none items-center justify-center gap-2 rounded-md font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 disabled:cursor-not-allowed disabled:border-n-200 disabled:bg-n-100 disabled:text-n-600 disabled:shadow-none disabled:hover:bg-n-100 aria-busy:cursor-progress aria-busy:disabled:text-n-700 ${clasesPorTamano[tamano]} ${clasesPorVariante[variante]} ${className}`}
        {...props}
      >
        {cargando && <Spinner />}
        {cargando && lento ? <span data-sigue-trabajando="">Sigue trabajando…</span> : cargando && textoCargando ? textoCargando : children}
      </button>
    );
  }
);
Button.displayName = "Button";
