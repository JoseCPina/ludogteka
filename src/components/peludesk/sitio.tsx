import Link from "next/link";
import type { ReactNode } from "react";
import { LogoPeluDesk } from "@/components/marca/peludesk";
import { MenuCelular } from "@/components/peludesk/menu-celular";
import { RedesPeluDesk } from "@/components/peludesk/redes";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { BotonPreferenciasCookies } from "@/components/peludesk/consentimiento/preferencias-cookies";
import { EMPRESA, DOCUMENTOS_LEGALES } from "@/lib/peludesk/legal";
import { urlDemo } from "@/lib/peludesk/landing";

/**
 * Encabezado y pie de las páginas de peludesk.mx que no son la landing
 * (blog, aterrizajes, legales, ayuda, registro). La landing tiene su propio
 * encabezado pero usa este mismo pie: los enlaces legales y «Preferencias de
 * cookies» van en el pie de TODAS las páginas del sitio.
 */
const CLASE_ENLACE = "rounded-md px-3 py-2 text-sm font-semibold text-n-700 hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave";
const CLASE_PRUEBA =
  "pd-boton pd-boton-primario inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-full bg-morado px-4 text-sm font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave";

const ENLACES = [
  ["/#dia", "Cómo te ayuda"],
  ["/#planes", "Planes"],
  ["/blog", "Blog"],
  ["/ayuda", "Ayuda"],
] as const;

export function EncabezadoSitio() {
  return (
    <header className="sticky top-0 z-20 border-b border-n-200/70 bg-crema/90 backdrop-blur supports-[backdrop-filter]:bg-crema/75">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:text-morado">
        Saltar al contenido
      </a>
      <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="PeluDesk, inicio" className="rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
          <LogoPeluDesk tamano={30} />
        </Link>
        <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
          {ENLACES.map(([href, texto]) => (
            <Link key={href} href={href} className={CLASE_ENLACE}>
              {texto}
            </Link>
          ))}
          <a href={`${urlDemo()}/demo`} data-pixel-evento="Lead" className={`${CLASE_ENLACE} lg:ml-2`}>
            Ver demo
          </a>
          <EnlaceRegistro className={CLASE_PRUEBA}>Pruébalo gratis</EnlaceRegistro>
        </nav>
        <div className="flex items-center gap-1 md:hidden">
          <EnlaceRegistro className={CLASE_PRUEBA}>Pruébalo gratis</EnlaceRegistro>
          <MenuCelular>
            <nav aria-label="Principal" className="flex flex-col">
              {ENLACES.map(([href, texto]) => (
                <Link key={href} href={href} className="flex min-h-12 items-center border-b border-n-200 text-base font-semibold text-n-900">
                  {texto}
                </Link>
              ))}
              <a href={`${urlDemo()}/demo`} data-pixel-evento="Lead" className="flex min-h-12 items-center text-base font-semibold text-n-900">
                Ver demo
              </a>
            </nav>
          </MenuCelular>
        </div>
      </div>
    </header>
  );
}

const ENLACE_PIE = "hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave rounded-sm";

export function PieSitio({ whatsapp = null }: { whatsapp?: string | null }) {
  return (
    <footer className="border-t border-n-200 bg-white pb-24 md:pb-0">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1.2fr_1fr_1fr_1fr]">
        <div>
          <LogoPeluDesk tamano={26} />
          <p className="mt-3 max-w-[30ch] text-sm text-n-600">Para guarderías, hoteles y estéticas caninas. Hecho en México.</p>
          <RedesPeluDesk className="-ml-3 mt-2" />
        </div>
        <nav aria-label="Producto" className="flex flex-col gap-2 text-sm font-semibold text-n-700">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-n-600">PeluDesk</p>
          <Link href="/#planes" className={ENLACE_PIE}>Planes</Link>
          <Link href="/registro" className={ENLACE_PIE}>Pruébalo gratis</Link>
          <a href={`${urlDemo()}/demo`} data-pixel-evento="Lead" className={ENLACE_PIE}>Ver demo</a>
          <Link href="/ayuda" className={ENLACE_PIE}>Centro de ayuda</Link>
          {whatsapp && <a href={whatsapp} target="_blank" rel="noopener" className={ENLACE_PIE}>WhatsApp</a>}
        </nav>
        <nav aria-label="Aprende" className="flex flex-col gap-2 text-sm font-semibold text-n-700">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-n-600">Aprende</p>
          <Link href="/blog" className={ENLACE_PIE}>Blog</Link>
          <Link href="/software-para-guarderias-caninas" className={ENLACE_PIE}>Software para guarderías</Link>
          <Link href="/software-para-esteticas-caninas" className={ENLACE_PIE}>Software para estéticas</Link>
          <Link href="/software-para-hoteles-caninos" className={ENLACE_PIE}>Software para hoteles</Link>
        </nav>
        <nav aria-label="Legal" className="flex flex-col gap-2 text-sm font-semibold text-n-700">
          <p className="text-xs font-bold uppercase tracking-[0.1em] text-n-600">Legal</p>
          <Link href={DOCUMENTOS_LEGALES.aviso_privacidad.ruta} className={ENLACE_PIE}>Aviso de privacidad</Link>
          <Link href={DOCUMENTOS_LEGALES.terminos.ruta} className={ENLACE_PIE}>Términos y condiciones</Link>
          <Link href={DOCUMENTOS_LEGALES.cookies.ruta} className={ENLACE_PIE}>Política de cookies</Link>
          <BotonPreferenciasCookies className={`${ENLACE_PIE} w-fit text-left`} />
        </nav>
      </div>
      <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-n-600 sm:px-6">
        PeluDesk es una marca de {EMPRESA.razonSocial} · © {new Date().getFullYear()}
      </p>
    </footer>
  );
}

/** Marco común de las páginas interiores: encabezado, contenido y pie. */
export function MarcoSitio({ children, whatsapp = null }: { children: ReactNode; whatsapp?: string | null }) {
  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-crema text-n-900">
      <EncabezadoSitio />
      <main id="contenido">{children}</main>
      <PieSitio whatsapp={whatsapp} />
    </div>
  );
}
