import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * La tarjeta del sistema (docs/diseno/DESIGN.md → «Tarjeta»), con el aspecto del `Card` de shadcn/ui: superficie
 * `card`, borde `border`, `rounded-lg` y `shadow-tarjeta`. Una tarjeta = un tema. Su encabezado lleva el título (y, si
 * hay, el conteo y una acción a la derecha); el cuerpo, lo demás. Es de servidor (sin estado): sirve en cualquier página.
 */
export function Tarjeta({ className, children, ...props }: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <section data-slot="card" className={cn("flex flex-col rounded-lg border border-border bg-card text-card-foreground shadow-tarjeta", className)} {...props}>
      {children}
    </section>
  );
}

export function TarjetaEncabezado({
  titulo,
  conteo,
  descripcion,
  accion,
  icono,
  className,
  nivel = "h2",
}: {
  titulo: ReactNode;
  conteo?: number | string;
  descripcion?: ReactNode;
  accion?: ReactNode;
  icono?: ReactNode;
  className?: string;
  nivel?: "h2" | "h3";
}) {
  const Titulo = nivel;
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-5", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icono && <span aria-hidden="true" className="grid size-8 flex-none place-items-center rounded-md bg-muted text-n-700 [&_svg]:size-4">{icono}</span>}
        <div className="min-w-0">
          <Titulo className="flex items-center gap-2 text-[0.9375rem] font-semibold text-foreground">
            {titulo}
            {conteo !== undefined && (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tabular-nums text-n-700" data-conteo>
                {conteo}
              </span>
            )}
          </Titulo>
          {descripcion && <p className="mt-0.5 text-sm text-muted-foreground">{descripcion}</p>}
        </div>
      </div>
      {accion && <div className="flex flex-none items-center gap-2">{accion}</div>}
    </header>
  );
}

export function TarjetaCuerpo({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("flex flex-col gap-3 px-4 py-3 sm:px-5 sm:py-4", className)}>{children}</div>;
}

/** Una cifra de tablero (KPI): etiqueta, número grande y una línea abajo; con ícono en su cuadro de color. */
export function Cifra({
  etiqueta,
  valor,
  sub,
  icono,
  tono = "neutro",
  className,
}: {
  etiqueta: string;
  valor: ReactNode;
  sub?: ReactNode;
  icono?: ReactNode;
  tono?: "neutro" | "morado" | "menta" | "coral" | "ambar";
  className?: string;
}) {
  const fondo = { neutro: "bg-muted text-n-700", morado: "bg-morado-suave text-morado", menta: "bg-menta-suave text-menta-oscuro", coral: "bg-coral-suave text-coral-oscuro", ambar: "bg-ambar-suave text-ambar-oscuro" }[tono];
  return (
    <div className={cn("flex items-start gap-3", className)}>
      {icono && <span aria-hidden="true" className={cn("grid size-10 flex-none place-items-center rounded-lg [&_svg]:size-5", fondo)}>{icono}</span>}
      <div className="min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{etiqueta}</p>
        <p className="mt-0.5 text-[1.75rem] font-bold leading-8 tabular-nums text-foreground">{valor}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </div>
    </div>
  );
}
