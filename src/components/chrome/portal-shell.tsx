"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { SECCIONES_PORTAL } from "@/lib/nav/config";

export function PortalShell({
  marca,
  aviso,
  nombreCompleto,
  children,
}: {
  // La marca del negocio (LogoNegocio): el dueño de un perro ve a su
  // guardería, no a PeluDesk.
  marca: ReactNode;
  aviso?: ReactNode;
  // Cómo se llama quien está viendo esto (el nombre de su expediente). NUNCA el correo con el que Auth lo conoce ni su
  // teléfono: si no hay nombre, la cabecera no saluda.
  nombreCompleto: string | null;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {aviso}
      <header className="flex flex-none flex-col gap-3 border-b border-n-200 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-8">
        <div className="flex flex-col gap-1">
          <Link href="/portal" className="self-start rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado">
            {marca}
          </Link>
          {nombreCompleto && <p className="text-sm text-n-600" data-saludo-portal>Hola, {nombreCompleto}</p>}
        </div>
        <form action={cerrarSesion}>
          <Button type="submit" variante="secundario" className="min-h-11 px-4">
            Cerrar sesión
          </Button>
        </form>
      </header>

      {SECCIONES_PORTAL.length > 0 && (
        <nav
          aria-label="Secciones"
          className="flex flex-none gap-1 overflow-x-auto border-b border-n-200 bg-white px-4 md:px-8"
        >
          {SECCIONES_PORTAL.map((item) => {
            const esActivo = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={esActivo ? "page" : undefined}
                className={`flex min-h-11 items-center whitespace-nowrap border-b-2 px-3 font-semibold ${
                  esActivo ? "border-morado text-morado" : "border-transparent text-n-600 hover:text-n-900"
                }`}
              >
                {item.etiqueta}
              </Link>
            );
          })}
        </nav>
      )}

      <main className="flex-1 bg-n-50 p-4 md:p-8">{children}</main>
    </div>
  );
}
