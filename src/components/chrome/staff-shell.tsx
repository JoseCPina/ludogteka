"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cerrarSesion } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { pantallasPrincipales, type ItemNav } from "@/lib/nav/config";
import { EnlacePrecarga } from "@/components/ui/enlace-precarga";
import { IconoSeccion } from "@/components/iconos-nav";
import { HechoConPeluDesk } from "@/components/marca/peludesk";
import { BotonInstalar } from "@/components/pwa/instalar";
import { articuloDeRuta } from "@/lib/ayuda/rutas";
import { SelectorNegocio, type NegocioDelSelector } from "./selector-negocio";

// El «?» de cada pantalla: el artículo de la ruta más específica (o el
// índice de Ayuda si esa pantalla no tiene uno).
function BotonAyuda({ ayuda, pathname }: { ayuda: { slug: string; rutas: string[] }[]; pathname: string }) {
  const a = articuloDeRuta(pathname, ayuda);
  const desde = `desde=${encodeURIComponent(pathname)}`;
  const href = pathname.startsWith("/ayuda") ? "/ayuda" : a ? `/ayuda/${a.slug}?${desde}` : `/ayuda?${desde}`;
  return (
    <EnlacePrecarga
      href={href}
      aria-label="Ayuda de esta pantalla"
      title="Ayuda de esta pantalla"
      data-boton-ayuda={a?.slug ?? ""}
      className="grid h-11 w-11 flex-none place-items-center rounded-full border-[1.5px] border-n-300 text-lg font-bold text-n-700 hover:border-morado hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
    >
      ?
    </EnlacePrecarga>
  );
}

// «¿Cómo se hace?»: el video de la pantalla (el de la ruta más específica).
// Solo sale si hay uno publicado que esta persona puede ver. En el celular no sale en el encabezado (QA S27: le quitaba
// al nombre del negocio el ancho que le toca); el artículo de ayuda de la pantalla enlaza su video.
function BotonVideo({ videos, pathname }: { videos: { slug: string; rutas: string[] }[]; pathname: string }) {
  if (pathname.startsWith("/ayuda")) return null;
  const v = articuloDeRuta(pathname, videos);
  if (!v) return null;
  return (
    <EnlacePrecarga
      href={`/ayuda/videos/${v.slug}`}
      data-boton-video={v.slug}
      aria-label="¿Cómo se hace? Ver el video de esta pantalla"
      title="¿Cómo se hace? Ver el video de esta pantalla"
      className="hidden min-h-11 min-w-11 flex-none items-center justify-center gap-1.5 rounded-full border-[1.5px] border-n-300 px-3 text-sm sm:inline-flex font-semibold text-n-700 hover:border-morado hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
    >
      <span aria-hidden="true">▶</span>
      <span className="hidden sm:inline">¿Cómo se hace?</span>
    </EnlacePrecarga>
  );
}

const ETIQUETAS_ROL: Record<string, string> = {
  admin: "Admin",
  recepcion: "Recepción",
  estetica: "Estética",
};

export function StaffShell({
  marca,
  aviso,
  rol,
  nombreCompleto,
  items,
  ayuda,
  videos,
  negocios = [],
  children,
}: {
  // La marca del negocio (LogoNegocio, la arma el layout del servidor):
  // el staff trabaja en SU negocio; PeluDesk solo firma al pie del menú.
  marca: ReactNode;
  // El aviso del plan (demo, prueba, solo lectura): components/aviso-plan.tsx.
  aviso?: ReactNode;
  rol: string;
  nombreCompleto: string | null;
  items: ItemNav[];
  // Las pantallas con artículo de ayuda (los de los módulos del negocio):
  // el «?» abre el de la pantalla actual. Sin esto (estética), no hay «?».
  ayuda?: { slug: string; rutas: string[] }[];
  // Los videos publicados que esta persona puede ver, con las pantallas que explican.
  videos?: { slug: string; rutas: string[] }[];
  // Los negocios donde trabaja esta persona (sucursales del mismo dueño juntas): «Tus negocios» del menú.
  negocios?: NegocioDelSelector[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  // QA S19: en una pantalla interior (/caja/cobrar/…) el encabezado dice la sección a la que pertenece (la ruta más específica).
  const activo = items
    .filter((item) => !item.proximamente && (pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))))
    .sort((a, b) => b.href.length - a.href.length)[0];

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {aviso}
      {/* QA S27: a 390 px el nombre del negocio quedaba en «PRU…». Menú, logo, ayuda y Salir son fijos; el nombre toma
          todo el ancho que sobra (menos aire entre botones en el celular) y solo entonces se trunca. */}
      <header className="flex h-16 flex-none items-center justify-between gap-1.5 overflow-hidden border-b border-n-200 bg-white px-3 sm:gap-2 sm:px-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-3">
          <button
            type="button"
            onClick={() => setMenuAbierto((valor) => !valor)}
            aria-expanded={menuAbierto}
            aria-controls="menu-lateral-staff"
            className="-ml-1 grid h-11 w-10 flex-none place-items-center rounded-md text-n-700 hover:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado sm:ml-0 sm:w-11 md:hidden"
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
          <Link href={items[0]?.href ?? "/"} className="block min-w-0 flex-1 rounded-md md:flex-none focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado">
            {marca}
          </Link>
          <span className="hidden flex-none text-n-500 md:inline" aria-hidden="true">/</span>
          <span className="hidden flex-none font-semibold text-n-800 md:inline">
            {activo?.etiqueta ?? "Inicio"}
          </span>
        </div>

        <div className="flex flex-none items-center gap-1.5 sm:gap-3">
          {videos && videos.length > 0 && <BotonVideo videos={videos} pathname={pathname} />}
          {ayuda && <BotonAyuda ayuda={ayuda} pathname={pathname} />}
          <div className="hidden text-right leading-tight sm:block">
            {/* Sin nombre se queda el rol: el correo de una cuenta nunca se muestra como si fuera su nombre (QA N24). */}
            {nombreCompleto && <p className="text-sm font-semibold text-n-900" data-nombre-encabezado>{nombreCompleto}</p>}
            <p className="text-xs font-semibold uppercase tracking-wide text-n-500">
              {ETIQUETAS_ROL[rol] ?? rol}
            </p>
          </div>
          <form action={cerrarSesion}>
            <Button type="submit" variante="secundario" className="min-h-11 px-3 sm:px-4">
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
          <ListaNav items={items} rol={rol} pathname={pathname} />
          <div>
            <SelectorNegocio negocios={negocios} className="mt-4" />
            <BotonInstalar className="mt-4" />
            <HechoConPeluDesk className="mt-6 px-3 pb-1" />
          </div>
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
              {/* QA S49: un botón visible para cerrar (tocar fuera también cierra, pero no se adivina). */}
              <div className="mb-2 flex items-center justify-between border-b border-n-200 pb-2">
                <span className="px-2 text-sm font-semibold uppercase tracking-wide text-n-500">Menú</span>
                <button
                  type="button"
                  onClick={() => setMenuAbierto(false)}
                  data-cerrar-menu
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-md border-[1.5px] border-borde px-3 text-sm font-semibold text-n-800 hover:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                    <line x1="6" y1="6" x2="18" y2="18" />
                    <line x1="18" y1="6" x2="6" y2="18" />
                  </svg>
                  Cerrar
                </button>
              </div>
              <ListaNav items={items} rol={rol} pathname={pathname} onNavegar={() => setMenuAbierto(false)} />
              <SelectorNegocio negocios={negocios} className="mt-4" />
              <BotonInstalar className="mt-4 border-t border-n-200 pt-3" />
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
  rol,
  pathname,
  onNavegar,
}: {
  items: ItemNav[];
  rol: string;
  pathname: string;
  onNavegar?: () => void;
}) {
  // QA S41 (N141): solo las pantallas principales del rol se precargan solas; las demás, al pasar el puntero o tocar.
  const principales = pantallasPrincipales(rol, items);
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
            <EnlacePrecarga
              href={item.href}
              automatica={principales.includes(item.href)}
              onClick={onNavegar}
              aria-current={esActivo ? "page" : undefined}
              className={`flex min-h-11 items-center gap-3 rounded-md px-3 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado ${
                esActivo ? "bg-morado-suave text-morado" : "text-n-700 hover:bg-n-100"
              }`}
            >
              <IconoSeccion href={item.href} inicio={esInicio} />
              {item.etiqueta}
            </EnlacePrecarga>
          </li>
        );
      })}
    </ul>
  );
}
