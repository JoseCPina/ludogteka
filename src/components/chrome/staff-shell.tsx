"use client";

import { useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { CirclePlay, LogOut, Menu, X } from "lucide-react";
import { cerrarSesion } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";
import { agruparNav, GRUPOS_NAV, pantallasPrincipales, type ItemNav } from "@/lib/nav/config";
import { EnlacePrecarga } from "@/components/ui/enlace-precarga";
import { IconoSeccion } from "@/components/iconos-nav";
import { HechoConPeluDesk } from "@/components/marca/peludesk";
import { BotonInstalar } from "@/components/pwa/instalar";
import { articuloDeRuta } from "@/lib/ayuda/rutas";
import { BotonEnviar } from "@/components/ui/boton-enviar";
import { BarraNavegacion } from "@/components/ui/barra-navegacion";
import { SelectorNegocio, type NegocioDelSelector } from "./selector-negocio";
import { Enlace } from "@/components/ui/enlace";
import { Alternar } from "@/components/ui/alternar";
import { cn } from "@/lib/utils";

/*
 * El armazón del panel del negocio (docs/diseno/DESIGN.md → «Navegación del panel»).
 * Base: bloque `dashboard-shell-01` de shadcn/studio (barra lateral con grupos titulados, encabezado con migas) y las
 * referencias de Mobbin `panel-navegacion` (Square: grupos con título y lo de la cuenta al fondo; Jobber iOS: barra
 * inferior de cinco con «Más»; Air NZ: «Más» como lista agrupada).
 *   · Escritorio (md+): barra lateral fija de 256 px con la marca del negocio, el inicio y los grupos; al fondo
 *     «Tus negocios», «Instalar la app», la persona (nombre y rol) con «Salir», y «Hecho con PeluDesk».
 *   · Celular: encabezado con la marca y la ayuda; abajo, una barra fija con el inicio y las pantallas principales del
 *     rol (`pantallasPrincipales`, las mismas que se precargan) y «Más», que abre el menú completo agrupado
 *     (#menu-lateral-staff, con su botón «Cerrar»: QA S49).
 * Lo que no cambia: el «?» de la pantalla, «¿Cómo se hace?», la precarga solo de lo principal (N141), el estado
 * pendiente de cada enlace y la barra de navegación de arriba.
 */

// El «?» de cada pantalla: el artículo de la ruta más específica (o el índice de Ayuda si esa pantalla no tiene uno).
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
      className="grid size-11 flex-none place-items-center rounded-full border border-border bg-card text-base font-bold text-n-700 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
    >
      ?
    </EnlacePrecarga>
  );
}

// «¿Cómo se hace?»: el video de la pantalla (el de la ruta más específica). En el celular no sale en el encabezado
// (QA S27: le quitaba al nombre del negocio el ancho que le toca); el artículo de ayuda de la pantalla enlaza su video.
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
      className="hidden min-h-11 min-w-11 flex-none items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm font-semibold text-n-700 transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring sm:inline-flex"
    >
      <CirclePlay aria-hidden="true" className="size-4" strokeWidth={1.75} />
      <span>¿Cómo se hace?</span>
    </EnlacePrecarga>
  );
}

const ETIQUETAS_ROL: Record<string, string> = {
  admin: "Admin",
  recepcion: "Recepción",
  estetica: "Estética",
};

function iniciales(nombre: string | null, respaldo: string) {
  const base = (nombre ?? respaldo).trim();
  const partes = base.split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? "") + (partes[1]?.[0] ?? "")).toUpperCase() || "·";
}

/** La entrada activa: la ruta más específica que contiene a la actual (en /caja/cobrar/… gana «Caja»). */
function itemActivo(items: ItemNav[], pathname: string) {
  return items
    .filter((item) => !item.proximamente && (pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function StaffShell({
  marca,
  aviso,
  rol,
  etiquetaRol,
  nombreCompleto,
  items,
  ayuda,
  videos,
  negocios = [],
  children,
}: {
  // La marca del negocio (LogoNegocio, la arma el layout del servidor): el staff trabaja en SU negocio; PeluDesk solo
  // firma al pie del menú.
  marca: ReactNode;
  // El aviso del plan (demo, prueba, solo lectura): components/aviso-plan.tsx.
  aviso?: ReactNode;
  rol: string;
  // QA S53 (N156): lo que la persona es en este negocio (`etiquetaDeSesion`: rol + módulos + médico), no el rol a secas.
  etiquetaRol?: string;
  nombreCompleto: string | null;
  items: ItemNav[];
  // Las pantallas con artículo de ayuda (los de los módulos del negocio): el «?» abre el de la pantalla actual. Sin esto
  // (estética), no hay «?».
  ayuda?: { slug: string; rutas: string[] }[];
  // Los videos publicados que esta persona puede ver, con las pantallas que explican.
  videos?: { slug: string; rutas: string[] }[];
  // Los negocios donde trabaja esta persona (sucursales del mismo dueño juntas): «Tus negocios» del menú.
  negocios?: NegocioDelSelector[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [menuAbierto, setMenuAbierto] = useState(false);
  const activo = itemActivo(items, pathname);
  const grupoActivo = activo && activo !== items[0] ? GRUPOS_NAV.find((g) => g.id === (activo.grupo ?? "ajustes"))?.titulo : undefined;
  const principales = pantallasPrincipales(rol, items);
  const etiqueta = etiquetaRol ?? ETIQUETAS_ROL[rol] ?? rol;

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <BarraNavegacion />
      {aviso}
      <div className="flex flex-1">
        {/* ── Barra lateral (escritorio) ─────────────────────────────────────────────────────────────────── */}
        <nav aria-label="Secciones" className="sticky top-0 hidden h-dvh w-64 flex-none flex-col border-r border-sidebar-border bg-sidebar md:flex">
          <div className="flex h-16 flex-none items-center border-b border-sidebar-border px-3">
            <Enlace href={items[0]?.href ?? "/"} className="block min-w-0 flex-1 rounded-md px-1" forma="bloque" data-ui="marca">
              {marca}
            </Enlace>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-3">
            <ListaNav items={items} rol={rol} pathname={pathname} />
          </div>
          <div className="flex-none border-t border-sidebar-border px-3 py-3">
            <SelectorNegocio negocios={negocios} />
            <BotonInstalar className="mt-2" />
            <Persona nombreCompleto={nombreCompleto} etiqueta={etiqueta} />
            <HechoConPeluDesk className="mt-3 px-2" />
          </div>
        </nav>

        <div className="flex min-w-0 flex-1 flex-col">
          {/* ── Encabezado ────────────────────────────────────────────────────────────────────────────────── */}
          {/* QA S27: a 390 px el nombre del negocio quedaba en «PRU…». La marca toma todo el ancho que sobra. */}
          <header className="sticky top-0 z-30 flex h-16 flex-none items-center justify-between gap-2 border-b border-border bg-card/90 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/75 sm:px-4 md:px-8">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Enlace href={items[0]?.href ?? "/"} className="block min-w-0 flex-1 rounded-md md:hidden" forma="bloque" data-ui="marca">
                {marca}
              </Enlace>
              <nav aria-label="Estás en" className="hidden min-w-0 items-center gap-2 text-sm md:flex">
                {grupoActivo && (
                  <>
                    <span className="text-muted-foreground">{grupoActivo}</span>
                    <span className="text-n-400" aria-hidden="true">/</span>
                  </>
                )}
                <span className="truncate font-semibold text-foreground" data-seccion-actual>
                  {activo?.etiqueta ?? "Inicio"}
                </span>
              </nav>
            </div>
            <div className="flex flex-none items-center gap-2">
              {videos && videos.length > 0 && <BotonVideo videos={videos} pathname={pathname} />}
              {ayuda && <BotonAyuda ayuda={ayuda} pathname={pathname} />}
            </div>
          </header>

          {/* min-w-0: sin él, una tabla ancha empuja toda la página de lado en el celular. En celular deja aire abajo
              para la barra inferior (flotantes-celular-dev: nada fijo tapa un control). */}
          <main className="min-w-0 flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-7 md:pb-10">{children}</main>
        </div>
      </div>

      {/* ── Barra inferior (celular) ─────────────────────────────────────────────────────────────────────── */}
      <nav aria-label="Principales" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {principales.slice(0, 4).map((href) => {
            const item = items.find((i) => i.href === href);
            if (!item) return null;
            const esActivo = activo?.href === href;
            return (
              <li key={href}>
                <EnlacePrecarga
                  href={href}
                  automatica
                  data-ui="menu"
                  aria-current={esActivo ? "page" : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[0.6875rem] font-semibold leading-tight focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-ring",
                    esActivo ? "text-primary" : "text-n-600"
                  )}
                >
                  <IconoSeccion href={href} inicio={item === items[0]} className="size-5" />
                  <span className="max-w-full truncate">{item === items[0] ? "Inicio" : item.etiqueta}</span>
                </EnlacePrecarga>
              </li>
            );
          })}
          <li className="col-start-5">
            <Alternar
              type="button"
              onClick={() => setMenuAbierto((v) => !v)}
              aria-expanded={menuAbierto}
              aria-controls="menu-lateral-staff"
              className="flex min-h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold leading-tight text-n-600"
            >
              <Menu aria-hidden="true" className="size-5" strokeWidth={1.75} />
              <span>{menuAbierto ? "Cerrar" : "Más"}</span>
              <span className="sr-only">{menuAbierto ? "Cerrar menú" : "Abrir menú"}</span>
            </Alternar>
          </li>
        </ul>
      </nav>

      {/* ── Menú completo (celular): «Más» ───────────────────────────────────────────────────────────────── */}
      {menuAbierto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <Alternar type="button" aria-label="Cerrar menú" onClick={() => setMenuAbierto(false)} className="absolute inset-0 bg-n-900/40" />
          <nav id="menu-lateral-staff" aria-label="Secciones" className="absolute inset-y-0 left-0 flex w-80 max-w-[86%] flex-col bg-sidebar shadow-flotante">
            {/* QA S49: un botón visible para cerrar (tocar fuera también cierra, pero no se adivina). */}
            <div className="flex h-16 flex-none items-center justify-between gap-2 border-b border-sidebar-border px-3">
              <span className="px-1 text-sm font-semibold text-foreground">Menú</span>
              <Button type="button" onClick={() => setMenuAbierto(false)} data-cerrar-menu variante="secundario" tamano="compacto">
                <X aria-hidden="true" className="size-4" />
                Cerrar
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-3">
              <ListaNav items={items} rol={rol} pathname={pathname} onNavegar={() => setMenuAbierto(false)} />
              <SelectorNegocio negocios={negocios} className="mt-4" />
              <BotonInstalar className="mt-3 border-t border-sidebar-border pt-3" />
            </div>
            <div className="flex-none border-t border-sidebar-border px-3 py-3">
              <Persona nombreCompleto={nombreCompleto} etiqueta={etiqueta} soloEnMenu />
              <HechoConPeluDesk className="mt-3 px-2" />
            </div>
          </nav>
        </div>
      )}
    </div>
  );
}

/** Quién está trabajando y «Salir». Los atributos data-* los leen las auditorías (permisos-pantalla, estética). */
function Persona({ nombreCompleto, etiqueta, soloEnMenu = false }: { nombreCompleto: string | null; etiqueta: string; soloEnMenu?: boolean }) {
  return (
    <div className="mt-3 flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-card px-2.5 py-2">
      <span aria-hidden="true" className="grid size-9 flex-none place-items-center rounded-full bg-morado-suave text-sm font-bold text-morado">
        {iniciales(nombreCompleto, etiqueta)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        {/* Sin nombre se queda el rol: el correo de una cuenta nunca se muestra como si fuera su nombre (QA N24). */}
        {nombreCompleto && (
          <p className="truncate text-sm font-semibold text-foreground" {...(soloEnMenu ? {} : { "data-nombre-encabezado": "" })}>
            {nombreCompleto}
          </p>
        )}
        <p className="truncate text-xs font-medium text-muted-foreground" {...(soloEnMenu ? {} : { "data-etiqueta-rol": "" })}>
          {etiqueta}
        </p>
      </div>
      <form action={cerrarSesion}>
        <BotonEnviar variante="secundario" tamano="compacto" className="px-2.5" textoCargando="Saliendo…" sinBloqueo aria-label="Salir">
          <LogOut aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">Salir</span>
        </BotonEnviar>
      </form>
    </div>
  );
}

function ListaNav({ items, rol, pathname, onNavegar }: { items: ItemNav[]; rol: string; pathname: string; onNavegar?: () => void }) {
  // QA S41 (N141): solo las pantallas principales del rol se precargan solas; las demás, al pasar el puntero o tocar.
  const principales = pantallasPrincipales(rol, items);
  const activo = itemActivo(items, pathname);
  const inicio = items[0];
  const entrada = (item: ItemNav, esInicio = false) => {
    if (item.proximamente) {
      return (
        <li key={item.etiqueta}>
          <span aria-disabled="true" className="flex min-h-11 items-center justify-between gap-2 rounded-md px-2.5 text-sm text-n-400">
            {item.etiqueta}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-n-500">Próximamente</span>
          </span>
        </li>
      );
    }
    const esActivo = activo?.href === item.href;
    return (
      <li key={item.href}>
        <EnlacePrecarga
          href={item.href}
          automatica={principales.includes(item.href)}
          onClick={onNavegar}
          data-ui="menu"
          aria-current={pathname === item.href ? "page" : undefined}
          className={cn(
            "flex min-h-11 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
            esActivo ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <IconoSeccion href={item.href} inicio={esInicio} className={cn("size-[18px]", esActivo ? "text-primary" : "text-n-500")} />
          <span className="min-w-0 flex-1 truncate">{item.etiqueta}</span>
        </EnlacePrecarga>
      </li>
    );
  };
  return (
    <div className="flex flex-col gap-4">
      {inicio && <ul className="flex flex-col gap-0.5">{entrada(inicio, true)}</ul>}
      {agruparNav(items).map((g) => (
        <section key={g.id} aria-labelledby={`grupo-nav-${g.id}`}>
          <p id={`grupo-nav-${g.id}`} className="mb-1 px-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] text-n-500">
            {g.titulo}
          </p>
          <ul className="flex flex-col gap-0.5">{g.items.map((i) => entrada(i))}</ul>
        </section>
      ))}
    </div>
  );
}
