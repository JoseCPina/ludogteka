"use client";

import { ButtonHTMLAttributes, forwardRef, useEffect, useState, useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/shadcn/button";
import { cn } from "@/lib/utils";
import { Spinner } from "./spinner";

/**
 * Los TRES botones de la app, armados ENCIMA del `Button` de shadcn/ui (`buttonVariants`, src/components/shadcn/button.tsx;
 * docs/diseno/DESIGN.md → «Botón»). Lo que ejecuta una acción es botón; lo que navega es `<Enlace>`.
 *   · `primario`: relleno morado (`default` de shadcn), la acción principal de la pantalla o del formulario.
 *   · `secundario`: superficie con borde de control (`outline`), todo lo demás (cancelar, abrir, filtrar, copiar).
 *   · `peligro`: relleno coral OSCURO (`destructive`; blanco sobre coral claro no pasa AA: 2.37:1).
 * Encima de shadcn se conserva lo que el sistema exige: 44 px mínimos (área táctil), foco visible de 3 px, deshabilitado
 * con colores que pasan AA (no la opacidad de shadcn), `aria-busy` + giro al tocar, «Sigue trabajando…» a los 3 s,
 * bloqueo de escritura (`data-escritura`) y nada de envío antes de hidratar. Ver scripts/diseno/contraste.mjs.
 */
export type VarianteBoton = "primario" | "secundario" | "peligro";
const VARIANTE_SHADCN = { primario: "default", secundario: "outline", peligro: "destructive" } as const;
const clasesPorVariante: Record<VarianteBoton, string> = {
  primario: "shadow-xs hover:bg-morado-oscuro active:bg-morado-oscuro",
  secundario: "border-[1.5px] border-input bg-card text-foreground shadow-none hover:border-primary hover:bg-accent hover:text-accent-foreground",
  peligro: "text-destructive-foreground shadow-xs hover:bg-coral-hondo active:bg-coral-hondo",
};
const clasesPorTamano = {
  // Panel (herramienta): 44 px con letra de 15 px; en el lenguaje cálido el radio sale más grande solo.
  normal: "h-auto min-h-11 min-w-11 px-4 text-[0.9375rem]",
  compacto: "h-auto min-h-11 min-w-11 px-3 text-sm",
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
        className={cn(
          buttonVariants({ variant: VARIANTE_SHADCN[variante] }),
          "min-w-0 max-w-full shrink cursor-pointer select-none rounded-md font-semibold whitespace-normal text-center transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:border-n-200 disabled:bg-n-100 disabled:text-n-600 disabled:opacity-100 disabled:shadow-none disabled:hover:bg-n-100 aria-busy:cursor-progress aria-busy:disabled:text-n-700 [&_svg:not([class*='size-'])]:size-[1.1em]",
          clasesPorTamano[tamano],
          clasesPorVariante[variante],
          className
        )}
        {...props}
      >
        {cargando && <Spinner />}
        {cargando && lento ? <span data-sigue-trabajando="">Sigue trabajando…</span> : cargando && textoCargando ? textoCargando : children}
      </button>
    );
  }
);
Button.displayName = "Button";
