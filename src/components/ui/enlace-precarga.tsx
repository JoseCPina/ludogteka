"use client";

import { useCallback, useLayoutEffect, useRef, type ComponentProps, type MouseEvent } from "react";
import Link, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { empezarNavegacion, esLaMismaPagina, terminarNavegacion } from "@/lib/ui/navegacion-pendiente";

type Seguimiento = { id: number | null; pendiente: boolean; tocado: number };

/**
 * UX (1 de noviembre de 2026): el estado pendiente de un enlace, sin tocar su forma. Vive dentro del `<Link>` (donde
 * `useLinkStatus` sabe si ESTE enlace está navegando) y lo marca en el `<a>`: `data-pendiente="si"` y `aria-busy` (la
 * hoja de estilos lo atenúa y enseña el giro de `.marca-pendiente`). Al apagarse cierra su navegación en la barra.
 */
function MarcaPendiente({ alCambiar }: { alCambiar: (pendiente: boolean) => void }) {
  const { pending } = useLinkStatus();
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const a = ref.current?.closest("a");
    alCambiar(pending);
    if (!a) return;
    if (pending) {
      a.setAttribute("data-pendiente", "si");
      a.setAttribute("aria-busy", "true");
    } else {
      a.removeAttribute("data-pendiente");
      a.removeAttribute("aria-busy");
    }
  }, [pending, alCambiar]);
  return <span ref={ref} className="marca-pendiente" data-marca-pendiente="" aria-hidden="true" />;
}

/**
 * QA S41 (N141): un enlace que NO se precarga solo al entrar en pantalla, sino cuando alguien pasa el puntero, lo toca
 * o lo enfoca (`router.prefetch`). El menú lateral y los mosaicos del tablero tienen ~35 enlaces: con la precarga
 * automática, cada pantalla lanzaba de 20 a 35 peticiones al cargar y, en un celular con red lenta, la acción que
 * alguien apretaba (Confirmar inicio) salía detrás de ellas. `automatica` deja la precarga de siempre solo en las 3 o 4
 * pantallas principales del rol (`pantallasPrincipales`, src/lib/nav/config.ts).
 *
 * UX (1 de noviembre de 2026): es la base de TODO enlace interno del panel (`<Enlace>` la usa). Responde en el toque:
 * se atenúa con su giro mientras la pantalla siguiente carga (`MarcaPendiente`), prende la barra de arriba, y un
 * segundo toque mientras navega no dispara otra navegación.
 */
export function EnlacePrecarga({
  href,
  automatica = false,
  onMouseEnter,
  onTouchStart,
  onFocus,
  onClick,
  onNavigate,
  children,
  ...resto
}: Omit<ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string; automatica?: boolean }) {
  const router = useRouter();
  const pedida = useRef(false);
  const seguimiento = useRef<Seguimiento>({ id: null, pendiente: false, tocado: 0 });
  const alCambiar = useCallback((pendiente: boolean) => {
    const s = seguimiento.current;
    s.pendiente = pendiente;
    if (!pendiente && s.id !== null) {
      terminarNavegacion(s.id);
      s.id = null;
    }
  }, []);
  const precargar = () => {
    if (automatica || pedida.current) return;
    pedida.current = true;
    router.prefetch(href);
  };
  return (
    <Link
      href={href}
      prefetch={automatica ? undefined : false}
      data-ui={(resto as { "data-ui"?: string })["data-ui"] ?? "navegacion"}
      data-navega=""
      onMouseEnter={(e) => {
        precargar();
        onMouseEnter?.(e);
      }}
      onTouchStart={(e) => {
        precargar();
        onTouchStart?.(e);
      }}
      onFocus={(e) => {
        precargar();
        onFocus?.(e);
      }}
      onClick={(e: MouseEvent<HTMLAnchorElement>) => {
        // El segundo toque (o el doble clic) mientras ya navega no vuelve a navegar.
        const s = seguimiento.current;
        if (s.pendiente || (s.id !== null && Date.now() - s.tocado < 1500)) {
          e.preventDefault();
          return;
        }
        onClick?.(e);
      }}
      onNavigate={(e) => {
        onNavigate?.(e);
        // Solo cuando de verdad navega (Next ya descartó Ctrl, otra pestaña y los externos); a la misma página no hay
        // ruta nueva que espere la barra.
        if (esLaMismaPagina(href)) return;
        const s = seguimiento.current;
        terminarNavegacion(s.id);
        s.id = empezarNavegacion();
        s.tocado = Date.now();
      }}
      {...resto}
    >
      {children}
      <MarcaPendiente alCambiar={alCambiar} />
    </Link>
  );
}
