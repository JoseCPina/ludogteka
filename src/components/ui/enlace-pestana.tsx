"use client";

import type { ComponentProps, ReactNode } from "react";
import { EnlacePrecarga } from "./enlace-precarga";

/**
 * UX (1 de noviembre de 2026): las pestañas y los filtros que cambian de vista (calendario semana/mes, estado de una
 * receta, médico de la agenda, subsecciones de Empleados o Inventario). Navegan, así que son enlaces, pero con la forma
 * reconocible de un selector: la opción elegida va marcada (`aria-current`) y las demás se ven tocables. Todas con 44 px
 * de alto, foco visible y el estado pendiente de cualquier enlace del panel.
 *   · `filtro` (por omisión): píldora; la elegida, morada y rellena.
 *   · `pestana`: subrayado inferior; la elegida, morada.
 */
const BASE =
  "inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado focus-visible:ring-offset-2";
const FORMAS = {
  filtro: {
    base: "rounded-full border-[1.5px] px-4 text-sm",
    activo: "border-morado bg-morado text-white",
    inactivo: "border-borde bg-white text-n-800 hover:border-morado hover:bg-morado-suave hover:text-morado-oscuro",
  },
  pestana: {
    base: "rounded-t-md border-b-[3px] px-4",
    activo: "border-morado text-morado",
    inactivo: "border-transparent text-n-700 hover:border-n-300 hover:text-morado",
  },
};

export function EnlacePestana({
  href,
  activo,
  forma = "filtro",
  className = "",
  children,
  ...resto
}: Omit<ComponentProps<typeof EnlacePrecarga>, "href" | "className" | "children"> & {
  href: string;
  activo: boolean;
  forma?: keyof typeof FORMAS;
  className?: string;
  children: ReactNode;
}) {
  const f = FORMAS[forma];
  return (
    <EnlacePrecarga
      href={href}
      data-ui="pestana"
      aria-current={activo ? "page" : undefined}
      className={`${BASE} ${f.base} ${activo ? f.activo : f.inactivo} ${className}`}
      {...resto}
    >
      {children}
    </EnlacePrecarga>
  );
}
