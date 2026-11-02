import { cn } from "@/lib/utils";

/**
 * El aspecto de TODO campo (input, select, textarea), tomado del `Input` de shadcn/ui (src/components/shadcn/input.tsx)
 * y ajustado al sistema (docs/diseno/DESIGN.md → «Campo»): 44 px de alto, borde de control de 1.5 px que cumple 3:1
 * (`border-input`), superficie de tarjeta, anillo de foco de 3 px en el color de marca y el error en coral oscuro con su
 * fondo suave. Lo comparten `Field`, `Select` y `Textarea` para que los tres se vean idénticos.
 */
export const CLASE_ETIQUETA = "mb-1.5 block text-sm font-medium text-n-800";
export const CLASE_AYUDA = "mt-1.5 text-sm text-muted-foreground";
export const CLASE_ERROR = "mt-1.5 text-sm font-semibold text-destructive";

export function claseCampo({ error, multilinea = false, className }: { error?: unknown; multilinea?: boolean; className?: string }) {
  return cn(
    "w-full min-w-0 rounded-md border-[1.5px] bg-card px-3 text-[0.9375rem] text-foreground shadow-xs transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground",
    "focus:border-ring focus:ring-[3px] focus:ring-morado-suave",
    "disabled:cursor-not-allowed disabled:bg-n-100 disabled:text-n-600",
    multilinea ? "py-2.5 leading-relaxed" : "min-h-11",
    error ? "border-destructive bg-coral-suave" : "border-input",
    className
  );
}
