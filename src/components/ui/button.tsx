import { ButtonHTMLAttributes, forwardRef } from "react";
import { Spinner } from "./spinner";

type Variante = "primario" | "secundario" | "peligro" | "exito";

const clasesPorVariante: Record<Variante, string> = {
  primario: "bg-azul text-white hover:bg-azul-oscuro",
  secundario: "bg-white text-n-900 border border-n-400 hover:bg-n-100",
  peligro: "bg-naranja-oscuro text-white hover:bg-[#822608]",
  exito: "bg-verde-oscuro text-white hover:bg-[#155c33]",
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
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-n-100 disabled:text-n-400 disabled:hover:bg-n-100 ${clasesPorVariante[variante]} ${className}`}
      {...props}
    >
      {cargando && <Spinner />}
      {children}
    </button>
  )
);
Button.displayName = "Button";
