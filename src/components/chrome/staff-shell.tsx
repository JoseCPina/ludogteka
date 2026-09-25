"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import type { ItemNav } from "@/lib/nav/config";
import { IconoSeccion } from "@/components/iconos-nav";
import { HechoConPeluDesk } from "@/components/marca/peludesk";

const ETIQUETAS_ROL: Record<string, string> = {
  admin: "Admin",
  recepcion: "Recepción",
  estetica: "Estética",
};

export function StaffShell({
  marca,
  rol,
  email,
  nombreCompleto,
  items,
  children,
}: {
  // La marca del negocio (MarcaDelNegocio, la arma el layout del servidor):
  // el staff trabaja en SU negocio; PeluDesk solo firma al pie del menú.
  marca: ReactNode;
  rol: string;
  email: string;
  nombreCompleto: string | null;
  items: ItemNav[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const activo = items.find((item) => !item.proximamente && pathname === item.href);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex h-16 flex-none items-center justify-between border-b border-n-200 bg-white px-4 md:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuAbierto((valor) => !valor)}
            aria-expanded={menuAbierto}
            aria-controls="menu-lateral-staff"
            className="grid h-11 w-11 flex-none place-items-center rounded-md text-n-700 hover:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado md:hidden"
          >
            <span className="sr-only">{menuAbierto ? "Cerrar menú" : "Abrir menú"}</span>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <Link href={items[0]?.href ?? "/"} className="rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado">
            {marca}
          </Link>
          <span className="hidden text-n-500 md:inline" aria-hidden="true">/</span>
          <span className="hidden font-semibold text-n-800 md:inline">
            {activo?.etiqueta ?? "Inicio"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden text-right leading-tight sm:block">
            <p className="text-sm font-semibold text-n-900">{nombreCompleto ?? email}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-n-500">
              {ETIQUETAS_ROL[rol] ?? rol}
            </p>
          </div>
          <form action={cerrarSesion}>
            <Button type="submit" variante="secundario" className="min-h-11 px-4">
              Salir
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <nav
          aria-label="Secciones"
          className="hidden w-64 flex-none flex-col justify-between border-r border-n-200 bg-white p-3 md:flex"
        >
          <ListaNav items={items} pathname={pathname} />
          <HechoConPeluDesk className="mt-6 px-3 pb-1" />
        </nav>

        {menuAbierto && (
          <div className="fixed inset-0 z-40 md:hidden">
            <button
              type="button"
              aria-label="Cerrar menú"
              className="absolute inset-0 bg-n-900/40"
              onClick={() => setMenuAbierto(false)}
            />
            <nav
              id="menu-lateral-staff"
              aria-label="Secciones"
              className="absolute inset-y-0 left-0 w-72 max-w-[80%] overflow-y-auto bg-white p-3 shadow-lg"
            >
              <ListaNav items={items} pathname={pathname} onNavegar={() => setMenuAbierto(false)} />
              <HechoConPeluDesk className="mt-6 px-3 pb-1" />
            </nav>
          </div>
        )}

        {/* min-w-0: sin él, este hijo flex crece al ancho de su contenido y una
            tabla ancha empuja toda la página de lado en el celular (así estaba
            /admin: 616 px en una pantalla de 390). */}
        <main className="min-w-0 flex-1 bg-n-50 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}

function ListaNav({
  items,
  pathname,
  onNavegar,
}: {
  items: ItemNav[];
  pathname: string;
  onNavegar?: () => void;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        if (item.proximamente) {
          return (
            <li key={item.etiqueta}>
              <span
                aria-disabled="true"
                className="flex min-h-11 items-center justify-between gap-2 rounded-md px-3 text-n-400"
              >
                {item.etiqueta}
                <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-500">
                  Próximamente
                </span>
              </span>
            </li>
          );
        }

        const esActivo = pathname === item.href;
        const esInicio = item === items[0];

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavegar}
              aria-current={esActivo ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado ${
                esActivo ? "bg-morado-suave text-morado" : "text-n-700 hover:bg-n-100"
              }`}
            >
              <IconoSeccion href={item.href} inicio={esInicio} />
              {item.etiqueta}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
