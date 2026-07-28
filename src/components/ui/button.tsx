import { ButtonHTMLAttributes, forwardRef } from "react";

type Variante = "primario" | "secundario" | "peligro" | "exito";

const clasesPorVariante: Record<Variante, string> = {
  primario: "bg-azul text-white hover:bg-azul-oscuro",
  secundario: "bg-white text-n-900 border border-n-400 hover:bg-n-100",
  peligro: "bg-naranja-oscuro text-white hover:bg-[#822608]",
  exito: "bg-verde-oscuro text-white hover:bg-[#155c33]",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
};

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ variante = "primario", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-5 text-base font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-n-100 disabled:text-n-400 disabled:hover:bg-n-100 ${clasesPorVariante[variante]} ${className}`}
      {...props}
    />
  )
);
Button.displayName = "Button";
