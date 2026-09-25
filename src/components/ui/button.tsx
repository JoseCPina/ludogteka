import { ButtonHTMLAttributes, forwardRef } from "react";
import { Spinner } from "./spinner";

type Variante = "primario" | "secundario" | "peligro" | "exito";

// Como el UI kit de PeluDesk (lámina 04): primario morado; "éxito" es el
// secundario menta del kit (acción positiva, "Nuevo cliente"), con texto
// MORADO — blanco sobre menta no pasa AA (1.58:1); secundario es el
// "ghost" (blanco con borde); peligro va en coral OSCURO por la misma razón
// (blanco sobre coral: 2.37:1). Ver scripts/diseno/contraste.mjs.
const clasesPorVariante: Record<Variante, string> = {
  primario: "bg-morado text-white hover:bg-morado-oscuro",
  secundario: "bg-white text-n-900 border-[1.5px] border-borde hover:bg-n-100",
  peligro: "bg-coral-oscuro text-white hover:bg-coral-hondo",
  exito: "bg-menta text-morado hover:bg-menta-hover",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  // Mientras espera al servidor: se deshabilita y muestra el giro junto
  // al texto. Es la ÚNICA forma de "cargando" de la app — un texto quieto
  // ("Generando…") no le dice a nadie si sigue trabajando o se colgó.
  cargando?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variante = "primario", className = "", cargando = false, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:border-n-200 disabled:bg-n-100 disabled:text-n-500 disabled:hover:bg-n-100 ${clasesPorVariante[variante]} ${className}`}
      {...props}
    >
      {cargando && <Spinner />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
